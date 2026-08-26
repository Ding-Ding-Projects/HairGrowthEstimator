import { EvidenceError, assertPublicReceiptValue, boundedString, fail } from './common.mjs';

const MAX_CDP_BYTES = 1024 * 1024;
const MAX_PRIVACY_NODES = 5_000;
const MAX_PRIVACY_CHARACTERS = 512 * 1024;
const SAFE_SEMANTIC_PROPERTIES = new Set([
  'checked', 'hidden', 'open', 'disabled', 'selectedIndex'
]);
const SAFE_SEMANTIC_ATTRIBUTES = new Set([
  'aria-selected', 'aria-expanded', 'aria-checked', 'aria-pressed', 'aria-hidden',
  'aria-current', 'data-state', 'data-status', 'hidden', 'open', 'disabled',
  'checked', 'selected', 'role'
]);

function loopbackHttp(raw, label) {
  boundedString(raw, label, { max: 2_048 });
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail('INVALID_CDP_ENDPOINT', `${label} must be an absolute URL.`);
  }
  if (url.protocol !== 'http:' || url.username || url.password || url.search || url.hash || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    fail('INVALID_CDP_ENDPOINT', `${label} must be credential-free loopback HTTP.`);
  }
  return url;
}

function exactExpectedUrl(raw) {
  boundedString(raw, 'expected page URL', { max: 8_192 });
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail('INVALID_EXPECTED_URL', 'Expected page URL must be absolute.');
  }
  if (url.username || url.password) fail('INVALID_EXPECTED_URL', 'Expected page URL must not contain credentials.');
  return url.href;
}

async function boundedJsonFetch(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: 'error', signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) fail('CDP_HTTP_ERROR', `CDP returned HTTP ${response.status}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_CDP_BYTES) fail('CDP_RESPONSE_TOO_LARGE', 'CDP target response exceeds the byte limit.');
    try {
      return JSON.parse(bytes.toString('utf8'));
    } catch {
      fail('INVALID_CDP_RESPONSE', 'CDP target response is not valid JSON.');
    }
  } catch (error) {
    if (error instanceof EvidenceError) throw error;
    if (error?.name === 'AbortError') fail('CDP_TIMEOUT', 'CDP target request exceeded its deadline.');
    fail('CDP_TRANSPORT_ERROR', 'CDP target request could not complete.');
  } finally {
    clearTimeout(timer);
  }
}

export async function assertSingleCdpTarget(endpoint, expectedUrl, timeoutMs = 10_000) {
  const base = loopbackHttp(endpoint, 'CDP endpoint');
  const expected = exactExpectedUrl(expectedUrl);
  const targets = await boundedJsonFetch(new URL('/json/list', base), timeoutMs);
  if (!Array.isArray(targets)) fail('INVALID_CDP_RESPONSE', 'CDP target inventory must be an array.');
  if (targets.length !== 1) fail('CDP_TARGET_CONTAMINATION', 'CDP target inventory must contain exactly one target.');
  const target = targets[0];
  if (!target || target.type !== 'page' || typeof target.url !== 'string' || typeof target.webSocketDebuggerUrl !== 'string') {
    fail('CDP_TARGET_CONTAMINATION', 'The sole CDP target is not a usable page target.');
  }
  let observed;
  let socket;
  try {
    observed = new URL(target.url).href;
    socket = new URL(target.webSocketDebuggerUrl);
  } catch {
    fail('CDP_TARGET_CONTAMINATION', 'The sole CDP target contains an invalid URL.');
  }
  if (observed !== expected) fail('CDP_TARGET_CONTAMINATION', 'The sole CDP page does not match the exact expected URL.');
  const allowedSocketProtocols = new Set(['ws:', 'wss:']);
  if (!allowedSocketProtocols.has(socket.protocol) || !['127.0.0.1', 'localhost', '::1'].includes(socket.hostname) || socket.port !== base.port || socket.username || socket.password) {
    fail('CDP_TARGET_CONTAMINATION', 'The CDP WebSocket is not bound to the expected loopback endpoint.');
  }
  return { webSocketDebuggerUrl: socket.href, expectedUrl: expected, targetCount: 1, type: 'page' };
}

export class CdpClient {
  constructor(webSocketDebuggerUrl, { timeoutMs = 10_000, allowedOrigins = [] } = {}) {
    const socket = new URL(webSocketDebuggerUrl);
    if (!['ws:', 'wss:'].includes(socket.protocol) || !['127.0.0.1', 'localhost', '::1'].includes(socket.hostname) || socket.username || socket.password) {
      fail('INVALID_CDP_SOCKET', 'CDP WebSocket must be credential-free loopback.');
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) fail('INVALID_TIMEOUT', 'CDP timeout must be 100 through 120000 milliseconds.');
    this.url = socket.href;
    this.timeoutMs = timeoutMs;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.allowedOrigins = new Set(allowedOrigins.map((origin) => new URL(origin).origin));
    this.network = { requests: 0, unexpected: 0 };
  }

  async connect() {
    if (typeof WebSocket !== 'function') fail('WEBSOCKET_UNAVAILABLE', 'The selected Node runtime does not provide WebSocket support.');
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      const timer = setTimeout(() => {
        socket.close();
        reject(new EvidenceError('CDP_TIMEOUT', 'CDP WebSocket did not open before its deadline.'));
      }, this.timeoutMs);
      socket.addEventListener('open', () => {
        clearTimeout(timer);
        this.socket = socket;
        resolve();
      }, { once: true });
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new EvidenceError('CDP_TRANSPORT_ERROR', 'CDP WebSocket could not open.'));
      }, { once: true });
      socket.addEventListener('message', (event) => this.onMessage(event.data));
      socket.addEventListener('close', () => this.onClose());
    });
    await this.call('Runtime.enable');
    await this.call('DOM.enable');
    await this.call('Accessibility.enable');
    await this.call('Network.enable', { maxTotalBufferSize: 1024 * 1024, maxResourceBufferSize: 256 * 1024 });
    return this;
  }

  onMessage(raw) {
    const bytes = Buffer.byteLength(typeof raw === 'string' ? raw : String(raw));
    if (bytes > MAX_CDP_BYTES) {
      this.onClose(new EvidenceError('CDP_RESPONSE_TOO_LARGE', 'CDP message exceeds the byte limit.'));
      this.socket?.close();
      return;
    }
    let message;
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    } catch {
      this.onClose(new EvidenceError('INVALID_CDP_RESPONSE', 'CDP returned malformed JSON.'));
      this.socket?.close();
      return;
    }
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new EvidenceError('CDP_COMMAND_FAILED', 'CDP command returned an error.'));
      else pending.resolve(message.result || {});
      return;
    }
    if (message.method === 'Network.requestWillBeSent') {
      this.network.requests += 1;
      try {
        const requestUrl = new URL(message.params?.request?.url);
        if (!['file:', 'data:', 'blob:'].includes(requestUrl.protocol) && !this.allowedOrigins.has(requestUrl.origin)) this.network.unexpected += 1;
      } catch {
        this.network.unexpected += 1;
      }
    }
  }

  onClose(error = new EvidenceError('CDP_CLOSED', 'CDP WebSocket closed.')) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async call(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) fail('CDP_NOT_CONNECTED', 'CDP WebSocket is not connected.');
    boundedString(method, 'CDP method', { max: 128, pattern: /^[A-Za-z]+(?:\.[A-Za-z]+)+$/ });
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new EvidenceError('CDP_TIMEOUT', 'CDP command exceeded its deadline.'));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    boundedString(expression, 'CDP expression', { max: 32_768 });
    const result = await this.call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      generatePreview: false,
      userGesture: false
    });
    if (result.exceptionDetails) fail('CDP_EVALUATION_FAILED', 'CDP expression raised an exception.');
    const value = result.result?.value;
    assertPublicReceiptValue(value, 'semantic result');
    return value;
  }

  async poll(expression, expected, { intervalMs = 100, timeoutMs = this.timeoutMs } = {}) {
    if (!Number.isInteger(intervalMs) || intervalMs < 50 || intervalMs > 5_000 || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
      fail('INVALID_POLL', 'CDP polling bounds are invalid.');
    }
    const expectedText = JSON.stringify(expected);
    const deadline = Date.now() + timeoutMs;
    do {
      const value = await this.evaluate(expression);
      if (JSON.stringify(value) === expectedText) return value;
      await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, Math.max(0, deadline - Date.now()))));
    } while (Date.now() < deadline);
    fail('SEMANTIC_TIMEOUT', 'Expected semantic state did not appear before the deadline.');
  }

  async semanticProbe(probe) {
    if (!probe || typeof probe !== 'object') fail('UNSAFE_SEMANTIC_PROBE', 'Semantic probe must be a declarative object.');
    const kind = boundedString(probe.kind, 'semantic probe kind', { max: 32, pattern: /^(?:attribute|property|visible|count)$/ });
    const selector = boundedString(probe.selector, 'semantic probe selector', { max: 1_024 });
    let name = null;
    if (kind === 'attribute') {
      name = boundedString(probe.name, 'semantic attribute name', { max: 128, pattern: /^[A-Za-z_:][A-Za-z0-9_.:-]*$/ });
      if (!SAFE_SEMANTIC_ATTRIBUTES.has(name)) fail('UNSAFE_SEMANTIC_PROBE', 'Semantic attribute probe is not in the fixed read-only state allowlist.');
    } else if (kind === 'property') {
      name = boundedString(probe.name, 'semantic property name', { max: 64 });
      if (!SAFE_SEMANTIC_PROPERTIES.has(name)) fail('UNSAFE_SEMANTIC_PROBE', 'Semantic property probe is not in the fixed read-only allowlist.');
    } else if (Object.hasOwn(probe, 'name')) {
      fail('UNSAFE_SEMANTIC_PROBE', 'This semantic probe kind must not carry a property or attribute name.');
    }
    const descriptor = JSON.stringify({ kind, selector, name });
    const expression = `(() => { const p=${descriptor}; let nodes; try { nodes=document.querySelectorAll(p.selector); } catch { return {valid:false,count:-1,value:null}; } if (p.kind==='count') return {valid:true,count:nodes.length,value:nodes.length}; if (nodes.length!==1) return {valid:false,count:nodes.length,value:null}; const node=nodes[0]; let value; if (p.kind==='attribute') value=node.getAttribute(p.name); else if (p.kind==='property') value=node[p.name]; else { const style=getComputedStyle(node); const rect=node.getBoundingClientRect(); value=!node.hidden && style.display!=='none' && style.visibility!=='hidden' && Number(style.opacity)!==0 && rect.width>0 && rect.height>0; } return {valid:true,count:1,value}; })()`;
    const result = await this.evaluate(expression);
    if (!result || result.valid !== true || !Number.isInteger(result.count) || (kind !== 'count' && result.count !== 1)) {
      fail('SEMANTIC_TARGET_MISMATCH', 'Semantic probe did not resolve its declared target exactly.');
    }
    assertPublicReceiptValue(result.value, 'semantic probe result');
    return result.value;
  }

  async pollProbe(probe, expected, { intervalMs = 100, timeoutMs = this.timeoutMs } = {}) {
    if (!Number.isInteger(intervalMs) || intervalMs < 50 || intervalMs > 5_000 || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
      fail('INVALID_POLL', 'CDP polling bounds are invalid.');
    }
    const expectedText = JSON.stringify(expected);
    const deadline = Date.now() + timeoutMs;
    do {
      const value = await this.semanticProbe(probe);
      if (JSON.stringify(value) === expectedText) return value;
      await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, Math.max(0, deadline - Date.now()))));
    } while (Date.now() < deadline);
    fail('SEMANTIC_TIMEOUT', 'Expected semantic state did not appear before the deadline.');
  }

  async accessibleTarget(selector) {
    boundedString(selector, 'target selector', { max: 1_024 });
    const documentResult = await this.call('DOM.getDocument', { depth: 0, pierce: true });
    const rootNodeId = documentResult.root?.nodeId;
    if (!Number.isInteger(rootNodeId)) fail('TARGET_NOT_FOUND', 'CDP could not obtain the document root.');
    const query = await this.call('DOM.querySelectorAll', { nodeId: rootNodeId, selector });
    if (!Array.isArray(query.nodeIds) || query.nodeIds.length !== 1 || !Number.isInteger(query.nodeIds[0]) || query.nodeIds[0] <= 0) {
      fail('TARGET_NOT_UNIQUE', 'Target selector must match exactly one element.');
    }
    const described = await this.call('DOM.describeNode', { nodeId: query.nodeIds[0], depth: 0, pierce: true });
    const backendNodeId = described.node?.backendNodeId;
    if (!Number.isInteger(backendNodeId)) fail('TARGET_NOT_FOUND', 'CDP could not resolve the target backend node.');
    const tree = await this.call('Accessibility.getPartialAXTree', { backendNodeId, fetchRelatives: false });
    const node = Array.isArray(tree.nodes) ? tree.nodes.find((item) => item.backendDOMNodeId === backendNodeId) : null;
    const name = node?.name?.value;
    const role = node?.role?.value;
    if (!node || node.ignored === true || typeof name !== 'string' || !name.trim() || typeof role !== 'string') {
      fail('TARGET_NOT_ACCESSIBLE', 'Target is missing a non-ignored accessible name or role.');
    }
    return { name: name.trim(), role };
  }

  async assertInputTarget(selector, input, scale) {
    boundedString(selector, 'input target selector', { max: 1_024 });
    if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) fail('INVALID_TUPLE', 'Input target scale is invalid.');
    const selectorJson = JSON.stringify(selector);
    let expression;
    if (input?.method === 'mouse_click') {
      expression = `(() => { const nodes = document.querySelectorAll(${selectorJson}); if (nodes.length !== 1) return {count:nodes.length,hit:false}; const target=nodes[0]; const hit=document.elementFromPoint(${Number(input.x)} / ${scale}, ${Number(input.y)} / ${scale}); return {count:1,hit:Boolean(hit && (hit === target || target.contains(hit)))}; })()`;
    } else if (input?.method === 'win_send_keys') {
      expression = `(() => { const nodes = document.querySelectorAll(${selectorJson}); if (nodes.length !== 1) return {count:nodes.length,focused:false}; const target=nodes[0]; const active=document.activeElement; return {count:1,focused:Boolean(active && (active === target || target.contains(active)))}; })()`;
    } else {
      fail('VISIBLE_INPUT_FORBIDDEN', 'Input target proof requires an HWND-targeted input method.');
    }
    const result = await this.evaluate(expression);
    if (!result || result.count !== 1 || (input.method === 'mouse_click' ? result.hit !== true : result.focused !== true)) {
      fail('INPUT_TARGET_MISMATCH', 'Live input target does not match the unique registered selector.');
    }
    return { matched: true, method: input.method };
  }

  async assertLiveTuple(tuple) {
    const live = await this.evaluate("(() => ({ viewport: { width: window.innerWidth, height: window.innerHeight }, scale: window.devicePixelRatio, theme: document.body?.dataset?.theme || '', language: document.documentElement?.lang || '' }))()");
    const valid = live && Number.isInteger(live.viewport?.width) && Number.isInteger(live.viewport?.height) &&
      typeof live.scale === 'number' && Number.isFinite(live.scale) && typeof live.theme === 'string' && typeof live.language === 'string';
    if (!valid) fail('INVALID_LIVE_TUPLE', 'Renderer returned an invalid viewport, scale, theme, or language tuple.');
    if (live.viewport.width !== tuple.viewport.width || live.viewport.height !== tuple.viewport.height ||
        Math.abs(live.scale - tuple.scale) > 0.000001 || live.theme !== tuple.theme || live.language !== tuple.language) {
      fail('LIVE_TUPLE_MISMATCH', 'Renderer viewport, scale, theme, or language does not match the pinned tuple.');
    }
    return live;
  }

  async privacyScan(patterns) {
    if (!Array.isArray(patterns) || patterns.length > 64) fail('INVALID_PRIVACY_PATTERNS', 'Privacy pattern inventory is invalid.');
    const safe = patterns.map((item) => {
      if (!item || typeof item !== 'object') fail('INVALID_PRIVACY_PATTERNS', 'Privacy pattern must be an object.');
      const id = boundedString(item.id, 'privacy pattern id', { max: 64, pattern: /^[a-z0-9][a-z0-9._-]*$/ });
      const source = boundedString(item.source, 'privacy pattern source', { max: 512 });
      const flags = item.flags || 'i';
      if (!/^[gimsuy]*$/.test(flags)) fail('INVALID_PRIVACY_PATTERNS', 'Privacy pattern flags are invalid.');
      try { new RegExp(source, flags); } catch { fail('INVALID_PRIVACY_PATTERNS', 'Privacy pattern is invalid.'); }
      return { id, source, flags };
    });
    const expression = `(() => { const patterns=${JSON.stringify(safe)}; const maxNodes=${MAX_PRIVACY_NODES}; const maxChars=${MAX_PRIVACY_CHARACTERS}; const nodes=Array.from(document.querySelectorAll('*')); if (nodes.length>maxNodes) return {valid:false,reason:'node-limit',matches:[]}; const parts=[]; let chars=0; let overflow=false; const add=(value)=>{ if (value===undefined || value===null) return; const text=String(value); chars+=text.length; if (chars>maxChars) { overflow=true; return; } parts.push(text); }; const root=document.documentElement; add(root?.innerText); add(root?.textContent); const attributes=['aria-label','aria-description','title','alt','placeholder']; for (const node of nodes) { for (const name of attributes) add(node.getAttribute?.(name)); if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) add(node.value); for (const pseudo of ['::before','::after']) { const content=getComputedStyle(node,pseudo).content; if (content && content!=='none' && content!=='normal') add(content); } if (overflow) break; } if (overflow) return {valid:false,reason:'character-limit',matches:[]}; const text=parts.join('\\n'); return {valid:true,reason:null,matches:patterns.filter(item=>new RegExp(item.source,item.flags).test(text)).map(item=>item.id),nodes:nodes.length,characters:chars}; })()`;
    const result = await this.evaluate(expression);
    if (!result || result.valid !== true || !Array.isArray(result.matches) || !result.matches.every((item) => typeof item === 'string') || !Number.isInteger(result.nodes) || !Number.isInteger(result.characters)) {
      if (result?.reason === 'node-limit' || result?.reason === 'character-limit') fail('PRIVACY_SCAN_BOUNDS', 'Renderer privacy scan exceeded its fixed inspection bounds.');
      fail('INVALID_PRIVACY_RESULT', 'Privacy scan returned an invalid result.');
    }
    if (result.matches.length) fail('PRIVACY_SCAN_FAILED', 'Renderer privacy scan found one or more forbidden pattern classes.');
    return { passed: true, patterns: safe.length, matches: 0, nodes: result.nodes, characters: result.characters };
  }

  networkSummary() {
    return { ...this.network, passed: this.network.unexpected === 0 };
  }

  async close() {
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) this.socket.close();
    this.socket = null;
  }
}

export async function connectExactCdp(endpoint, expectedUrl, options = {}) {
  const target = await assertSingleCdpTarget(endpoint, expectedUrl, options.timeoutMs);
  const client = new CdpClient(target.webSocketDebuggerUrl, options);
  await client.connect();
  return client;
}

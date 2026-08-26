import path from 'node:path';
import { EvidenceError, assertObject, boundedString, fail } from './common.mjs';

const MCP_PROTOCOL_VERSION = '2025-06-18';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUIRED_TOOLS = Object.freeze([
  'startup_status',
  'list_headless_desktops',
  'launch_on_headless_desktop',
  'list_headless_windows',
  'screenshot',
  'mouse_click',
  'win_send_keys',
  'kill_process',
  'close_headless_desktop'
]);

function assertLoopbackEndpoint(raw) {
  boundedString(raw, 'MCP endpoint', { max: 2_048 });
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail('INVALID_MCP_ENDPOINT', 'MCP endpoint must be an absolute URL.');
  }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/mcp' || url.username || url.password || url.search || url.hash) {
    fail('INVALID_MCP_ENDPOINT', 'MCP endpoint must be the exact credential-free 127.0.0.1 HTTP /mcp route with an explicit port.');
  }
  return url.href;
}

function parseRpcBody(text, contentType) {
  if (!text.trim()) return [];
  const payloads = [];
  if (contentType.toLowerCase().includes('text/event-stream')) {
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload) payloads.push(JSON.parse(payload));
    }
  } else {
    const parsed = JSON.parse(text);
    payloads.push(...(Array.isArray(parsed) ? parsed : [parsed]));
  }
  return payloads;
}

function normalizedToolPayload(result) {
  assertObject(result, 'tool result');
  const textParts = Array.isArray(result.content)
    ? result.content.filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text)
    : [];
  let payload = {};
  if (textParts.length === 1) {
    try {
      const decoded = JSON.parse(textParts[0]);
      if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) payload = decoded;
    } catch {
      payload = {};
    }
  }
  const isError = result.isError === true;
  const clientOk = payload.ok === true && payload.timed_out !== true && (payload.returncode === undefined || payload.returncode === 0) && !isError;
  return { ...payload, isError, clientOk };
}

export class McpClient {
  constructor(endpoint, { timeoutMs = 15_000 } = {}) {
    this.endpoint = assertLoopbackEndpoint(endpoint);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) fail('INVALID_TIMEOUT', 'MCP timeout must be 100 through 120000 milliseconds.');
    this.timeoutMs = timeoutMs;
    this.sessionId = null;
    this.nextId = 1;
    this.toolCache = null;
  }

  async post(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': MCP_PROTOCOL_VERSION,
          ...(this.sessionId ? { 'mcp-session-id': this.sessionId } : {})
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) fail('MCP_HTTP_ERROR', `MCP returned HTTP ${response.status}.`);
      const sessionId = response.headers.get('mcp-session-id');
      if (sessionId) this.sessionId = boundedString(sessionId, 'MCP session id', { max: 512 });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_RESPONSE_BYTES) fail('MCP_RESPONSE_TOO_LARGE', 'MCP response exceeds the byte limit.');
      try {
        return parseRpcBody(bytes.toString('utf8'), response.headers.get('content-type') || '');
      } catch {
        fail('INVALID_MCP_RESPONSE', 'MCP response is not valid JSON-RPC.');
      }
    } catch (error) {
      if (error instanceof EvidenceError) throw error;
      if (error?.name === 'AbortError') fail('MCP_TIMEOUT', 'MCP request exceeded its deadline.');
      fail('MCP_TRANSPORT_ERROR', 'MCP transport could not complete.');
    } finally {
      clearTimeout(timer);
    }
  }

  async rpc(method, params = undefined) {
    const id = this.nextId;
    this.nextId += 1;
    const responses = await this.post({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
    const response = responses.find((item) => item?.id === id);
    if (!response) fail('MCP_MISSING_RESPONSE', 'MCP omitted the matching JSON-RPC response.');
    if (response.error) fail('MCP_RPC_ERROR', 'MCP returned a JSON-RPC error.');
    if (!Object.hasOwn(response, 'result')) fail('INVALID_MCP_RESPONSE', 'MCP response omitted result.');
    return response.result;
  }

  async notify(method, params = undefined) {
    await this.post({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) });
  }

  async initialize() {
    await this.rpc('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'hair-growth-evidence-harness', version: '1.0.0' }
    });
    await this.notify('notifications/initialized');
  }

  async listTools() {
    if (this.toolCache) return this.toolCache;
    const result = assertObject(await this.rpc('tools/list', {}), 'tools/list result');
    if (!Array.isArray(result.tools) || !result.tools.every((tool) => tool && typeof tool === 'object' && typeof tool.name === 'string')) {
      fail('INVALID_TOOL_INVENTORY', 'MCP returned an invalid tool inventory.');
    }
    this.toolCache = result.tools;
    return this.toolCache;
  }

  async callTool(name, parameters) {
    boundedString(name, 'tool name', { max: 128, pattern: /^[a-z0-9_]+$/ });
    assertObject(parameters, 'tool parameters');
    const definition = (await this.listTools()).find((tool) => tool.name === name);
    if (!definition) fail('MISSING_MCP_TOOL', `MCP does not expose required tool ${name}.`);
    const properties = definition.inputSchema?.properties;
    const argumentsValue = properties && Object.hasOwn(properties, 'params') ? { params: parameters } : parameters;
    const payload = normalizedToolPayload(await this.rpc('tools/call', { name, arguments: argumentsValue }));
    if (!payload.clientOk) fail('MCP_TOOL_FAILED', `MCP tool ${name} did not return a successful bounded result.`);
    return payload;
  }
}

export async function connectMcp(endpoint, options) {
  const client = new McpClient(endpoint, options);
  await client.initialize();
  return client;
}

export async function preflight(client, required = REQUIRED_TOOLS) {
  const tools = await client.listTools();
  const names = new Set(tools.map((tool) => tool.name));
  const missing = required.filter((name) => !names.has(name));
  if (missing.length) fail('MISSING_MCP_TOOL', 'MCP is missing one or more required cheap headless tools.');
  const status = await client.callTool('startup_status', {});
  return { ok: true, required: [...required], startup: status.ok === true };
}

export function resolveOwnedWindow(windows, { ownedProcessIds, titlePattern, classPattern }) {
  if (!Array.isArray(windows)) fail('INVALID_WINDOW_INVENTORY', 'Window inventory must be an array.');
  if (!Array.isArray(ownedProcessIds) || ownedProcessIds.length === 0 || !ownedProcessIds.every((pid) => Number.isInteger(pid) && pid > 0)) {
    fail('INVALID_PROCESS_INVENTORY', 'Owned process inventory must contain positive process ids.');
  }
  let title;
  let className;
  try {
    title = new RegExp(boundedString(titlePattern, 'title pattern', { max: 256 }));
    className = new RegExp(boundedString(classPattern, 'class pattern', { max: 256 }));
  } catch {
    fail('INVALID_WINDOW_PATTERN', 'Window title or class pattern is invalid.');
  }
  const owned = new Set(ownedProcessIds);
  const visible = windows.filter((item) => item && Number.isInteger(item.handle) && item.handle > 0 && Number.isInteger(item.width) && item.width > 0 && Number.isInteger(item.height) && item.height > 0);
  const unownedVisible = visible.filter((item) => !owned.has(item.process_id));
  if (unownedVisible.length) fail('UNRELATED_WINDOW', 'The hidden desktop contains a visible window outside the recorded process tree.');
  const matches = visible.filter((item) => owned.has(item.process_id) && typeof item.title === 'string' && typeof item.class === 'string' && title.test(item.title) && className.test(item.class));
  if (matches.length === 0) fail('WINDOW_NOT_FOUND', 'No owned non-zero window matches the required title and class.');
  if (matches.length !== 1) fail('AMBIGUOUS_WINDOW', 'More than one owned window matches the required title and class.');
  const match = matches[0];
  return {
    hwnd: match.handle,
    processId: match.process_id,
    title: match.title,
    className: match.class,
    width: match.width,
    height: match.height,
    dpi: Number.isInteger(match.dpi) ? match.dpi : null
  };
}

export async function discoverWindow(client, desktopName, criteria) {
  boundedString(desktopName, 'desktop name', { max: 64, pattern: /^[A-Za-z0-9._-]+$/ });
  const result = await client.callTool('list_headless_windows', { name: desktopName });
  return resolveOwnedWindow(Array.isArray(result.windows) ? result.windows : [], criteria);
}

export async function captureWindow(client, { hwnd, outputPath, clientOnly = false }) {
  if (!Number.isInteger(hwnd) || hwnd <= 0) fail('INVALID_HWND', 'Window capture requires a positive dynamically resolved HWND.');
  boundedString(outputPath, 'capture output path', { max: 32_768 });
  if (!path.isAbsolute(outputPath)) fail('INVALID_CAPTURE_PATH', 'Capture output path must be absolute.');
  const result = await client.callTool('screenshot', { hwnd, output_path: path.resolve(outputPath), client_only: clientOnly === true });
  if (result.mode !== 'window' || result.window_hwnd !== hwnd || result.rendered_ok !== true || path.resolve(result.path || '') !== path.resolve(outputPath)) {
    fail('VISIBLE_CAPTURE_FORBIDDEN', 'Capture must be a rendered HWND-only result at the owned output path.');
  }
  return { path: path.resolve(outputPath), width: result.width, height: result.height, hwnd };
}

export async function performBackgroundInput(client, hwnd, input) {
  assertObject(input, 'input');
  if (!Number.isInteger(hwnd) || hwnd <= 0) fail('INVALID_HWND', 'Background input requires a positive dynamically resolved HWND.');
  if (input.method === 'mouse_click') {
    if (!Number.isInteger(input.x) || input.x < 0 || !Number.isInteger(input.y) || input.y < 0) fail('INVALID_INPUT', 'Background mouse input requires non-negative client coordinates.');
    const button = input.button || 'left';
    if (!['left', 'right', 'middle'].includes(button)) fail('INVALID_INPUT', 'Mouse button is unsupported.');
    const clicks = input.clicks ?? 1;
    if (!Number.isInteger(clicks) || clicks < 1 || clicks > 2) fail('INVALID_INPUT', 'Mouse click count must be one or two.');
    await client.callTool('mouse_click', { hwnd, x: input.x, y: input.y, button, clicks, interval: 0, move_duration: 0, instant_move: true, confirm_focus_disruption: false });
    return { method: 'mouse_click', x: input.x, y: input.y, button, clicks };
  }
  if (input.method === 'win_send_keys') {
    if (!Array.isArray(input.keys) || input.keys.length < 1 || input.keys.length > 6 || !input.keys.every((key) => typeof key === 'string' && /^[a-z0-9_+-]{1,24}$/i.test(key))) {
      fail('INVALID_INPUT', 'Background key input requires one through six bounded key names.');
    }
    await client.callTool('win_send_keys', { hwnd, keys: input.keys });
    return { method: 'win_send_keys', keys: [...input.keys] };
  }
  fail('VISIBLE_INPUT_FORBIDDEN', 'Input method must be an HWND-targeted cheap headless route.');
}

export { REQUIRED_TOOLS };

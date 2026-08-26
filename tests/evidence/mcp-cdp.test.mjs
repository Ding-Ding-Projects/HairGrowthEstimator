import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EvidenceError } from '../../scripts/evidence/common.mjs';
import { CdpClient, assertSingleCdpTarget } from '../../scripts/evidence/cdp-client.mjs';
import {
  REQUIRED_TOOLS,
  captureWindow,
  connectMcp,
  preflight,
  resolveOwnedWindow
} from '../../scripts/evidence/mcp-client.mjs';

async function listen(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  return { server, port: address.port, endpoint: `http://127.0.0.1:${address.port}` };
}

function json(response, value) {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

test('negative regression turns red for extra CDP targets and green for one exact page target', async (t) => {
  let targets = [];
  const host = await listen(t, (request, response) => {
    if (request.url === '/json/list') return json(response, targets);
    response.writeHead(404).end();
  });
  const expectedUrl = 'file:///hair-growth-estimator/index.html';
  const target = {
    type: 'page',
    url: expectedUrl,
    webSocketDebuggerUrl: `ws://127.0.0.1:${host.port}/devtools/page/one`
  };
  targets = [target, { ...target, webSocketDebuggerUrl: `ws://127.0.0.1:${host.port}/devtools/page/two` }];
  await assert.rejects(assertSingleCdpTarget(host.endpoint, expectedUrl), (error) => {
    assert.equal(error instanceof EvidenceError, true);
    assert.equal(error.code, 'CDP_TARGET_CONTAMINATION');
    assert.equal(error.message.includes(expectedUrl), false);
    return true;
  });
  targets = [target];
  const result = await assertSingleCdpTarget(host.endpoint, expectedUrl);
  assert.deepEqual({ expectedUrl: result.expectedUrl, targetCount: result.targetCount, type: result.type }, {
    expectedUrl, targetCount: 1, type: 'page'
  });
});

test('MCP preflight requires the complete cheap headless tool inventory', async (t) => {
  const host = await listen(t, async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body.method === 'notifications/initialized') {
      response.writeHead(202, { 'content-type': 'application/json' });
      return response.end();
    }
    if (body.method === 'initialize') return json(response, { jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', capabilities: {} } });
    if (body.method === 'tools/list') {
      return json(response, {
        jsonrpc: '2.0',
        id: body.id,
        result: { tools: REQUIRED_TOOLS.map((name) => ({ name, inputSchema: { type: 'object', properties: { params: { type: 'object' } } } })) }
      });
    }
    if (body.method === 'tools/call' && body.params?.name === 'startup_status') {
      return json(response, {
        jsonrpc: '2.0',
        id: body.id,
        result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, timed_out: false }) }] }
      });
    }
    return json(response, { jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Unsupported' } });
  });
  const client = await connectMcp(`${host.endpoint}/mcp`);
  const result = await preflight(client);
  assert.equal(result.ok, true);
  assert.deepEqual(result.required, [...REQUIRED_TOOLS]);
  await assert.rejects(connectMcp(`${host.endpoint}/other`), (error) => error instanceof EvidenceError && error.code === 'INVALID_MCP_ENDPOINT');
});

test('window discovery rejects unowned and ambiguous visible windows', () => {
  const base = { handle: 100, process_id: 10, title: 'Hair Growth Estimator', class: 'Chrome_WidgetWin_1', width: 320, height: 240, dpi: 96 };
  const criteria = { ownedProcessIds: [10], titlePattern: '^Hair Growth Estimator$', classPattern: '^Chrome_WidgetWin_1$' };
  const match = resolveOwnedWindow([base], criteria);
  assert.deepEqual({ hwnd: match.hwnd, processId: match.processId, width: match.width, height: match.height }, { hwnd: 100, processId: 10, width: 320, height: 240 });
  assert.throws(() => resolveOwnedWindow([base, { ...base, handle: 101 }], criteria), (error) => error instanceof EvidenceError && error.code === 'AMBIGUOUS_WINDOW');
  assert.throws(() => resolveOwnedWindow([base, { ...base, handle: 102, process_id: 99, title: 'Unrelated' }], criteria), (error) => error instanceof EvidenceError && error.code === 'UNRELATED_WINDOW');
});

test('window capture helper refuses a monitor-mode result', async (t) => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'hair-growth-capture-window-'));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, 'frame.png');
  const goodClient = {
    async callTool(name, params) {
      assert.equal(name, 'screenshot');
      return { mode: 'window', window_hwnd: params.hwnd, rendered_ok: true, path: params.output_path, width: 320, height: 240 };
    }
  };
  assert.equal((await captureWindow(goodClient, { hwnd: 101, outputPath, clientOnly: true })).hwnd, 101);
  const badClient = { async callTool() { return { mode: 'monitor', rendered_ok: true, path: outputPath }; } };
  await assert.rejects(captureWindow(badClient, { hwnd: 101, outputPath }), (error) => error instanceof EvidenceError && error.code === 'VISIBLE_CAPTURE_FORBIDDEN');
});

test('CDP target proof requires one accessible node, exact input hit, and live tuple parity', async () => {
  const cdp = new CdpClient('ws://127.0.0.1:9222/devtools/page/one');
  const calls = [];
  cdp.call = async (method) => {
    calls.push(method);
    if (method === 'DOM.getDocument') return { root: { nodeId: 1 } };
    if (method === 'DOM.querySelectorAll') return { nodeIds: [2] };
    if (method === 'DOM.describeNode') return { node: { backendNodeId: 3 } };
    if (method === 'Accessibility.getPartialAXTree') return { nodes: [{ backendDOMNodeId: 3, ignored: false, name: { value: 'Settings' }, role: { value: 'tab' } }] };
    throw new Error(`Unexpected method ${method}`);
  };
  assert.deepEqual(await cdp.accessibleTarget('#settings'), { name: 'Settings', role: 'tab' });
  assert.deepEqual(calls, ['DOM.getDocument', 'DOM.querySelectorAll', 'DOM.describeNode', 'Accessibility.getPartialAXTree']);

  cdp.evaluate = async (expression) => expression.includes('elementFromPoint')
    ? { count: 1, hit: true }
    : { viewport: { width: 320, height: 240 }, scale: 1, theme: 'dark', language: 'en' };
  assert.equal((await cdp.assertInputTarget('#settings', { method: 'mouse_click', x: 20, y: 20 }, 1)).matched, true);
  assert.deepEqual(await cdp.assertLiveTuple({ viewport: { width: 320, height: 240 }, scale: 1, theme: 'dark', language: 'en' }), {
    viewport: { width: 320, height: 240 }, scale: 1, theme: 'dark', language: 'en'
  });
  await assert.rejects((async () => {
    cdp.evaluate = async () => ({ count: 2, hit: false });
    await cdp.assertInputTarget('#settings', { method: 'mouse_click', x: 20, y: 20 }, 1);
  })(), (error) => error instanceof EvidenceError && error.code === 'INPUT_TARGET_MISMATCH');

  cdp.evaluate = async (expression) => {
    assert.match(expression, /querySelectorAll/);
    assert.equal(expression.includes('remove('), false);
    return { valid: true, count: 1, value: 'true' };
  };
  assert.equal(await cdp.semanticProbe({ kind: 'attribute', selector: '#settings', name: 'aria-selected' }), 'true');
  await assert.rejects(cdp.semanticProbe({ kind: 'property', selector: '#settings', name: 'outerHTML' }), (error) => error instanceof EvidenceError && error.code === 'UNSAFE_SEMANTIC_PROBE');
  await assert.rejects(cdp.semanticProbe({ kind: 'property', selector: '#settings', name: 'value' }), (error) => error instanceof EvidenceError && error.code === 'UNSAFE_SEMANTIC_PROBE');
  await assert.rejects(cdp.semanticProbe({ kind: 'attribute', selector: '#settings', name: 'data-secret' }), (error) => error instanceof EvidenceError && error.code === 'UNSAFE_SEMANTIC_PROBE');

  let privacyExpression = '';
  cdp.evaluate = async (expression) => {
    privacyExpression = expression;
    return { valid: true, reason: null, matches: [], nodes: 4, characters: 128 };
  };
  const privacy = await cdp.privacyScan([{ id: 'secret-class', source: 'secret', flags: 'i' }]);
  assert.equal(privacy.passed, true);
  assert.match(privacyExpression, /aria-description/);
  assert.match(privacyExpression, /::before/);
});

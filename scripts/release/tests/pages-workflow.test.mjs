import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const workflowPath = path.join(root, '.github', 'workflows', 'pages.yml');

function audit(source) {
  assert.match(source, /^name: Deploy GitHub Pages$/m);
  assert.match(source, /^  push:$/m);
  assert.match(source, /^  workflow_dispatch:$/m);
  assert.match(source, /^  pages: write$/m);
  assert.match(source, /^  id-token: write$/m);
  assert.match(source, /^  build-pages:$/m);
  assert.match(source, /^  deploy-pages:$/m);
  assert.match(source, /^        run: npm run compose-site$/m);
  assert.match(source, /actions\/configure-pages@[0-9a-f]{40}/);
  assert.match(source, /actions\/upload-pages-artifact@[0-9a-f]{40}/);
  assert.match(source, /actions\/deploy-pages@[0-9a-f]{40}/);
  assert.match(source, /^          path: _site$/m);
  assert.match(source, /^      name: github-pages$/m);
  assert.doesNotMatch(source, /npm (?:test|run lint|run typecheck)/i);
}

test('Pages workflow composes and deploys the exact static directory without tests or lint', () => {
  const source = fs.readFileSync(workflowPath, 'utf8');
  assert.doesNotThrow(() => audit(source));
});

test('Pages workflow negative proof turns red for missing compose, permission, upload, and deployment boundaries', () => {
  const source = fs.readFileSync(workflowPath, 'utf8');
  for (const broken of [
    source.replace('npm run compose-site', 'node missing-compose.js'),
    source.replace('pages: write', 'pages: read'),
    source.replace('path: _site', 'path: site'),
    source.replace('actions/deploy-pages@', 'actions/missing-deploy-pages@')
  ]) assert.throws(() => audit(broken));
  assert.doesNotThrow(() => audit(source));
});

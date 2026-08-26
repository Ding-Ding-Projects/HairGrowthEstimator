'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

test('container build uses a digest-pinned base and bounded deterministic context', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8').replace(/\r\n/g, '\n');
  const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8').replace(/\r\n/g, '\n');
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'app', 'release-metadata.json'), 'utf8')).container;
  assert.equal(metadata.buildContext, 'server');
  assert.equal(metadata.dockerfile, 'Dockerfile');
  assert.equal(metadata.platform, 'linux/amd64');
  assert.match(metadata.baseImage, /^node:22-alpine@sha256:[0-9a-f]{64}$/);
  assert.match(dockerfile, new RegExp(`^FROM ${metadata.baseImage}$`, 'm'));
  assert.match(dockerfile, /^ARG SOURCE_DATE_EPOCH=0$/m);
  assert.match(dockerfile, /^COPY --chown=node:node \. \.\/server$/m);
  assert.match(compose, /^\s+context: \.\/server$/m);
  assert.match(compose, /^\s+dockerfile: \.\.\/Dockerfile$/m);
  assert.match(compose, /^\s+platform: linux\/amd64$/m);
  assert.match(metadata.ociArchive, /\.oci\.tar$/);
  assert.match(metadata.optionalRegistryTag, /^ghcr\.io\//);
  assert.equal(metadata.publishByDefault, false);
});

test('container release metadata inventories every bounded build input', () => {
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'app', 'release-metadata.json'), 'utf8')).container;
  const serverInputs = fs.readdirSync(path.join(root, 'server'), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `server/${entry.name}`)
    .sort();
  assert.deepEqual(metadata.buildInputs.slice().sort(), ['Dockerfile', ...serverInputs].sort());
  for (const input of metadata.buildInputs) assert.ok(fs.statSync(path.join(root, input)).isFile(), `missing container input ${input}`);
});

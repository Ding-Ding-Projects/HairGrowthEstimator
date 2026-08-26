import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { BASELINE_PRIVACY_PATTERNS } from '../../scripts/evidence/plan.mjs';

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let current = value;
    for (let bit = 0; bit < 8; bit += 1) current = (current & 1) ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    table[value] = current >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function sourceBinding(files) {
  const records = files.toSorted((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const bytes = records.reduce((sum, record) => sum + record.bytes, 0);
  const canonical = records.map((record) => `${record.path}\0${record.bytes}\0${record.sha256}\n`).join('');
  return { fileCount: records.length, bytes, inventorySha256: sha256(Buffer.from(canonical, 'utf8')), files: records };
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  typeBytes.copy(header, 4);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([header, data, checksum]);
}

export function makePng(width = 320, height = 240, { metadata = false, transparent = false, unknownChunk = false } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = 1 + x * 4;
      row[offset] = (x * 13 + y * 3) & 0xff;
      row[offset + 1] = (x * 5 + y * 17) & 0xff;
      row[offset + 2] = (x + y * 7) & 0xff;
      row[offset + 3] = transparent ? 0 : 255;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    ...(metadata ? [pngChunk('tEXt', Buffer.from('note\0private', 'latin1'))] : []),
    ...(unknownChunk ? [pngChunk('ruSt', Buffer.from('hidden payload', 'utf8'))] : []),
    pngChunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function riffChunk(type, data) {
  const header = Buffer.alloc(8);
  header.write(type, 0, 'ascii');
  header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

export function makeAnimatedWebp(width = 320, height = 240, frames = 2, { metadata = false, unknownChunk = false, invalidGeometry = false, invalidOrder = false } = {}) {
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x02;
  vp8x.writeUIntLE(width - 1, 4, 3);
  vp8x.writeUIntLE(height - 1, 7, 3);
  const headerChunks = [riffChunk('VP8X', vp8x), riffChunk('ANIM', Buffer.alloc(6))];
  const chunks = invalidOrder ? headerChunks.toReversed() : headerChunks;
  if (metadata) chunks.push(riffChunk('EXIF', Buffer.from([1, 2, 3, 4])));
  if (unknownChunk) chunks.push(riffChunk('JUNK', Buffer.from('hidden payload', 'utf8')));
  for (let index = 0; index < frames; index += 1) {
    const frameHeader = Buffer.alloc(16);
    if (invalidGeometry) frameHeader.writeUIntLE(width, 0, 3);
    frameHeader.writeUIntLE(width - 1, 6, 3);
    frameHeader.writeUIntLE(height - 1, 9, 3);
    frameHeader.writeUIntLE(100, 12, 3);
    const frameBits = Buffer.alloc(5);
    frameBits[0] = 0x2f;
    frameBits.writeUInt32LE(((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14), 1);
    chunks.push(riffChunk('ANMF', Buffer.concat([frameHeader, riffChunk('VP8L', frameBits)])));
  }
  const body = Buffer.concat([Buffer.from('WEBP', 'ascii'), ...chunks]);
  const header = Buffer.alloc(8);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

export function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function git(cwd, args) {
  return childProcess.execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export async function createPlanFixture() {
  const token = crypto.randomUUID();
  const repositoryRoot = await fsp.mkdtemp(path.join(os.tmpdir(), `hair-growth-evidence-repository-${token}-`));
  git(repositoryRoot, ['init', '--quiet']);
  git(repositoryRoot, ['config', 'user.name', 'Claude Fable 5']);
  git(repositoryRoot, ['config', 'user.email', 'noreply@anthropic.com']);
  await fsp.writeFile(path.join(repositoryRoot, 'source.txt'), 'pinned source\n', 'utf8');
  git(repositoryRoot, ['add', 'source.txt']);
  git(repositoryRoot, ['commit', '--quiet', '-m', 'Create evidence fixture', '-m', 'Temporary fixture commit.\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>']);
  const sourceSha = git(repositoryRoot, ['rev-parse', 'HEAD']);

  const packageRoot = await fsp.mkdtemp(path.join(os.tmpdir(), `hair-growth-evidence-package-${token}-`));
  const executablePath = path.join(packageRoot, 'dist', 'win-unpacked', 'Hair Growth Estimator.exe');
  const appAsarPath = path.join(packageRoot, 'dist', 'win-unpacked', 'resources', 'app.asar');
  const stagedProvenancePath = path.join(packageRoot, 'dist', 'package-input', 'app', 'provenance.json');
  const sourcePreservationPath = path.join(packageRoot, 'dist', 'release', 'source-preservation-build.json');
  const receiptPath = path.join(packageRoot, 'dist', 'package', 'packaged-app-manifest.json');
  await Promise.all([
    fsp.mkdir(path.dirname(executablePath), { recursive: true }),
    fsp.mkdir(path.dirname(appAsarPath), { recursive: true }),
    fsp.mkdir(path.dirname(stagedProvenancePath), { recursive: true }),
    fsp.mkdir(path.dirname(sourcePreservationPath), { recursive: true }),
    fsp.mkdir(path.dirname(receiptPath), { recursive: true })
  ]);
  const executableBytes = Buffer.from('packaged executable fixture\n');
  const appAsarBytes = Buffer.from('packaged app.asar fixture\n');
  const provenanceBytes = Buffer.from(`${JSON.stringify({ version: '1.0.123', sourceCommit: sourceSha })}\n`);
  await Promise.all([
    fsp.writeFile(executablePath, executableBytes),
    fsp.writeFile(appAsarPath, appAsarBytes),
    fsp.writeFile(stagedProvenancePath, provenanceBytes),
    fsp.writeFile(sourcePreservationPath, `${JSON.stringify({ verified: true, sourceCommit: sourceSha })}\n`, 'utf8')
  ]);
  const executableSha = sha256(executableBytes);
  const appAsarSha = sha256(appAsarBytes);
  const provenanceSha = sha256(provenanceBytes);
  const receipt = {
    schemaVersion: 2,
    version: '1.0.123',
    sourceCommit: sourceSha,
    directory: packageRoot,
    executable: {
      file: 'Hair Growth Estimator.exe',
      path: 'dist/win-unpacked/Hair Growth Estimator.exe',
      bytes: executableBytes.length,
      sha256: executableSha,
      signing: 'NotSigned'
    },
    appAsar: {
      file: 'resources/app.asar',
      path: 'dist/win-unpacked/resources/app.asar',
      bytes: appAsarBytes.length,
      sha256: appAsarSha
    },
    provenance: {
      logicalPath: 'app/provenance.json',
      stagedPath: 'dist/package-input/app/provenance.json',
      stagedSha256: provenanceSha,
      packagedSha256: provenanceSha
    },
    sourcePreservation: {
      receipt: 'dist/release/source-preservation-build.json',
      candidateCommit: sourceSha,
      trackedFileCount: 1,
      inventorySha256: sha256(Buffer.from('source inventory')),
      verified: true
    },
    icon: {
      masterSha256: sha256(Buffer.from('master icon')),
      icoSha256: sha256(Buffer.from('ico icon')),
      sizes: [16, 24, 32, 48, 64, 128, 256],
      executableResourceCount: 1
    },
    sourceBinding: {
      appAsar: sourceBinding([{
        path: 'app/main.js', source: 'app/main.js', bytes: 17, sha256: sha256(Buffer.from('packaged main file'))
      }]),
      server: sourceBinding([{
        path: 'server/index.js', source: 'server/index.js', bytes: 18, sha256: sha256(Buffer.from('packaged server file'))
      }])
    }
  };
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  await fsp.writeFile(receiptPath, receiptBytes);

  const runId = `run-${token}`;
  const runRoot = path.join(os.tmpdir(), runId, '.hair-growth-evidence-task');
  const plan = {
    schemaVersion: 1,
    runId,
    route: 'cheap-lowlevel-headless',
    captureKind: 'window',
    repoRoot: repositoryRoot,
    sourceSha,
    runRoot,
    artifact: {
      primary: { id: 'executable', sha256: executableSha },
      components: [
        { id: 'app-asar', sha256: appAsarSha },
        { id: 'build-receipt', sha256: sha256(receiptBytes) }
      ]
    },
    artifactPaths: {
      executable: executablePath,
      'app-asar': appAsarPath,
      'build-receipt': receiptPath
    },
    application: { executableArtifactId: 'executable', arguments: [] },
    isolation: {
      appDataDirectory: 'app-data',
      userDataDirectory: 'user-data',
      receiptFile: 'evidence-isolation.json',
      appDataMarkerFile: 'evidence-app-data-active.json'
    },
    cdp: { port: 45_678, expectedUrl: 'file:///hair-growth-estimator/index.html', timeoutMs: 10_000 },
    mcp: { endpoint: 'http://127.0.0.1:8765/mcp', timeoutMs: 10_000 },
    window: { titlePattern: '^Hair Growth Estimator$', classPattern: '^Chrome_WidgetWin_1$', timeoutMs: 10_000 },
    tuple: { viewport: { width: 320, height: 240 }, scale: 1, theme: 'dark', language: 'en' },
    privacyPatterns: BASELINE_PRIVACY_PATTERNS.map((item) => ({ ...item })),
    allowedNetworkOrigins: [],
    steps: [{
      id: 'open-settings',
      target: { selector: '#settings', accessibleName: 'Settings' },
      input: { method: 'mouse_click', x: 20, y: 20, button: 'left', clicks: 1 },
      expectedTransition: 'Settings tab is selected.',
      semantic: {
        probe: { kind: 'attribute', selector: '#settings', name: 'aria-selected' },
        beforeEquals: 'false',
        afterEquals: 'true',
        pollIntervalMs: 100,
        timeoutMs: 5_000
      }
    }]
  };

  return {
    plan,
    receipt,
    paths: { repositoryRoot, packageRoot, executablePath, appAsarPath, stagedProvenancePath, sourcePreservationPath, receiptPath, runRoot },
    async cleanup() {
      await Promise.all([
        fsp.rm(repositoryRoot, { recursive: true, force: true }),
        fsp.rm(packageRoot, { recursive: true, force: true }),
        fsp.rm(path.dirname(runRoot), { recursive: true, force: true })
      ]);
    }
  };
}

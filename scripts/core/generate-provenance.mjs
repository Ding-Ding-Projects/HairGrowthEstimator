import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const stagedPackagePath = path.join(repositoryRoot, 'dist', 'package-input', 'package.json');
const sourcePackagePath = path.join(repositoryRoot, 'package.json');
const outputPath = path.join(repositoryRoot, 'dist', 'package-input', 'app', 'provenance.json');

async function existingPackagePath() {
  try {
    await access(stagedPackagePath);
    return stagedPackagePath;
  } catch {
    return sourcePackagePath;
  }
}

function git(...args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  }).trim();
}

function validIsoInstant(value) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function sourceDateEpochInstant() {
  const raw = process.env.SOURCE_DATE_EPOCH;
  if (!raw || !/^\d{1,16}$/.test(raw)) return null;
  const milliseconds = Number(raw) * 1000;
  return Number.isSafeInteger(milliseconds) ? validIsoInstant(new Date(milliseconds).toISOString()) : null;
}

const packageJson = JSON.parse(await readFile(await existingPackagePath(), 'utf8'));
const commit = git('rev-parse', 'HEAD');
const commitTimestamp = validIsoInstant(git('show', '-s', '--format=%cI', commit));
const environmentTimestamp = validIsoInstant(process.env.BUILD_UPDATED_AT);
const reproducibleTimestamp = sourceDateEpochInstant();
const updatedAt = environmentTimestamp || reproducibleTimestamp || commitTimestamp;
const source = environmentTimestamp
  ? 'BUILD_UPDATED_AT'
  : reproducibleTimestamp
    ? 'SOURCE_DATE_EPOCH'
    : 'git-commit-committer-date';

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(packageJson.version)) {
  throw new Error('package.json contains an invalid semantic version.');
}
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Git did not return a full commit SHA.');
if (!updatedAt) throw new Error('No valid build or commit provenance timestamp is available.');

const provenance = {
  schemaVersion: 1,
  packageName: packageJson.name,
  version: packageJson.version,
  commit,
  updatedAt,
  timestampSource: source,
  platform: 'win32',
  architecture: process.arch,
  signing: 'unsigned'
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
process.stdout.write(`Wrote ${path.relative(repositoryRoot, outputPath)} for ${packageJson.version} at ${updatedAt} from ${source}.\n`);

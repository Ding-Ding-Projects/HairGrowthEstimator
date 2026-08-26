import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteFileSync } from './atomic-file.mjs';
import { validateDependencyManifest } from './release-context.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');

function execute(file, args, options = {}) {
  return execFileSync(file, args, {
    cwd: options.cwd || repositoryRoot,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    env: options.env || process.env
  });
}

function versionTuple(value) {
  const match = /([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(String(value || ''));
  if (!match) throw new TypeError('Tool did not report a three-part version: ' + value);
  return match.slice(1).map(Number);
}

function compatible(value, minimum, maximumMajor) {
  const actual = versionTuple(value);
  const lower = versionTuple(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] > lower[index]) break;
    if (actual[index] < lower[index]) return false;
  }
  return actual[0] < maximumMajor;
}

export function isCompatibleGnuTar(value) {
  const match = /^tar \(GNU tar\) ([0-9]+)\.([0-9]+)(?:\.([0-9]+))?/m.exec(String(value || ''));
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major === 1 && minor >= 35;
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function appendJobPath(directory) {
  if (!process.env.GITHUB_PATH) throw new TypeError('GITHUB_PATH is required for job-local tool bootstrap.');
  fs.appendFileSync(process.env.GITHUB_PATH, path.resolve(directory) + '\n', 'utf8');
}

async function downloadArchive(record, destination) {
  if (fs.existsSync(destination) && sha256File(destination) === record.sha256) return;
  if (fs.existsSync(destination)) fs.rmSync(destination, { force: true });
  const response = await fetch(record.url, { redirect: 'follow' });
  if (!response.ok || response.url.startsWith('https://') === false) throw new Error('Canonical tool download failed with HTTP ' + response.status + '.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024 || bytes.length > 64 * 1024 * 1024) throw new Error('Canonical tool archive size is outside the bounded range.');
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (digest !== record.sha256) throw new Error('Canonical tool archive digest mismatch.');
  atomicWriteFileSync(destination, bytes);
}

function verifiedGh(executable, expectedVersion, expectedDigest) {
  if (!fs.existsSync(executable) || sha256File(executable) !== expectedDigest) return false;
  try {
    return versionTuple(execute(executable, ['--version']))[0] === 2
      && execute(executable, ['--version']).includes('gh version ' + expectedVersion);
  } catch {
    return false;
  }
}

async function ensureGithubCli(manifest, jobPlatform, ubuntuTarExecutable = null) {
  const version = manifest.workflowTools.githubCli.fallbackVersion;
  const archiveRecord = jobPlatform === 'windows'
    ? manifest.workflowTools.githubCli.windowsArchive
    : manifest.workflowTools.githubCli.linuxArchive;
  const toolRoot = path.resolve(process.env.RUNNER_TEMP || path.join(repositoryRoot, 'dist', 'workflow-tools'));
  const archiveDirectory = path.join(toolRoot, 'downloads');
  const installDirectory = path.join(toolRoot, 'gh-' + version + '-' + jobPlatform);
  const archivePath = path.join(archiveDirectory, path.basename(new URL(archiveRecord.url).pathname));
  const executable = jobPlatform === 'windows'
    ? path.join(installDirectory, 'bin', 'gh.exe')
    : path.join(installDirectory, 'bin', 'gh');
  fs.mkdirSync(archiveDirectory, { recursive: true });
  await downloadArchive(archiveRecord, archivePath);
  if (!verifiedGh(executable, version, archiveRecord.executableSha256)) {
    const stage = installDirectory + '.' + process.pid + '.' + crypto.randomUUID() + '.stage';
    fs.mkdirSync(stage, { recursive: true });
    try {
      if (jobPlatform === 'windows') {
        execute('powershell.exe', [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          '& { param([string] $ArchivePath, [string] $DestinationPath) Expand-Archive -LiteralPath $ArchivePath -DestinationPath $DestinationPath -Force }',
          archivePath,
          stage
        ], { inherit: true });
        const source = path.join(stage, 'bin');
        fs.renameSync(source, path.join(stage, 'prepared-bin'));
      } else {
        if (!ubuntuTarExecutable) throw new Error('GNU tar must be verified before extracting the GitHub CLI archive.');
        execute(ubuntuTarExecutable, ['-xzf', archivePath, '--strip-components=1', '-C', stage], { inherit: true });
        fs.renameSync(path.join(stage, 'bin'), path.join(stage, 'prepared-bin'));
      }
      const stagedExecutable = jobPlatform === 'windows'
        ? path.join(stage, 'prepared-bin', 'gh.exe')
        : path.join(stage, 'prepared-bin', 'gh');
      if (!verifiedGh(stagedExecutable, version, archiveRecord.executableSha256)) {
        throw new Error('Extracted GitHub CLI binary does not match the declared version and digest.');
      }
      if (fs.existsSync(installDirectory)) {
        fs.renameSync(installDirectory, installDirectory + '.invalid.' + Date.now());
      }
      fs.mkdirSync(installDirectory, { recursive: true });
      fs.renameSync(path.join(stage, 'prepared-bin'), path.join(installDirectory, 'bin'));
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
  }
  if (!verifiedGh(executable, version, archiveRecord.executableSha256)) throw new Error('GitHub CLI bootstrap did not produce the declared executable.');
  appendJobPath(path.dirname(executable));
  return executable;
}

function ensureWindowsGit(manifest) {
  execute('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(repositoryRoot, 'scripts', 'release', 'bootstrap-git.ps1'),
    '-RepositoryRoot',
    repositoryRoot,
    '-Silent'
  ], { inherit: true });
  const directoryVersion = manifest.git.exactVersion.replace('.windows.', '.');
  const root = path.join(process.env.LOCALAPPDATA, 'DingDingProjects', 'HairGrowthEstimator', 'toolchain', 'MinGit-' + directoryVersion + '-64-bit');
  const executable = path.join(root, 'cmd', 'git.exe');
  if (execute(executable, ['--version']).trim() !== 'git version ' + manifest.git.exactVersion) throw new Error('Portable Git bootstrap reported the wrong version.');
  appendJobPath(path.dirname(executable));
  return executable;
}

function ensureUbuntuGit() {
  try {
    if (compatible(execute('git', ['--version']), '2.43.0', 3)) return 'git';
  } catch {
  }
  execute('sudo', ['apt-get', 'update'], { inherit: true });
  execute('sudo', ['apt-get', 'install', '-y', 'git'], { inherit: true, env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' } });
  if (!compatible(execute('git', ['--version']), '2.43.0', 3)) throw new Error('Ubuntu Git fallback did not satisfy >=2.43.0 <3.0.0.');
  return 'git';
}

function ensureUbuntuTar() {
  try {
    if (isCompatibleGnuTar(execute('tar', ['--version']))) return 'tar';
  } catch {
  }
  execute('sudo', ['apt-get', 'update'], { inherit: true });
  execute('sudo', ['apt-get', 'install', '-y', 'tar'], { inherit: true, env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' } });
  if (!isCompatibleGnuTar(execute('tar', ['--version']))) throw new Error('Ubuntu GNU tar fallback did not satisfy >=1.35 <2.0.');
  return 'tar';
}

function ensureCheckoutHistory(gitExecutable) {
  const expectedCommit = process.env.GITHUB_SHA;
  if (!/^[0-9a-f]{40}$/.test(expectedCommit || '')) throw new TypeError('GITHUB_SHA must be an exact candidate commit.');
  try {
    if (execute(gitExecutable, ['rev-parse', 'HEAD']).trim() === expectedCommit) {
      if (execute(gitExecutable, ['rev-parse', '--is-shallow-repository']).trim() === 'true') {
        execute(gitExecutable, ['fetch', '--unshallow', '--tags', 'origin'], { inherit: true });
      }
      return;
    }
  } catch {
  }
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')) throw new TypeError('GITHUB_REPOSITORY is required to recover checkout history.');
  recoverCheckoutHistory(gitExecutable, {
    repositoryDirectory: repositoryRoot,
    expectedCommit,
    originUrl: 'https://github.com/' + repository + '.git'
  });
}

export function recoverCheckoutHistory(gitExecutable, options) {
  const repositoryDirectory = path.resolve(options.repositoryDirectory);
  const expectedCommit = options.expectedCommit;
  const expectedOrigin = options.originUrl;
  if (!/^[0-9a-f]{40}$/.test(expectedCommit || '') || typeof expectedOrigin !== 'string' || !expectedOrigin) {
    throw new TypeError('Checkout recovery requires an exact candidate commit and origin URL.');
  }
  execute(gitExecutable, ['init'], { inherit: true, cwd: repositoryDirectory });
  try {
    execute(gitExecutable, ['remote', 'add', 'origin', expectedOrigin], { inherit: true, cwd: repositoryDirectory });
  } catch {
  }
  if (execute(gitExecutable, ['remote', 'get-url', 'origin'], { cwd: repositoryDirectory }).trim() !== expectedOrigin) throw new Error('Recovered checkout origin does not match the declared source.');
  execute(gitExecutable, ['fetch', '--force', '--tags', 'origin', '+refs/heads/*:refs/remotes/origin/*'], { inherit: true, cwd: repositoryDirectory });
  execute(gitExecutable, ['reset', '--mixed', expectedCommit], { inherit: true, cwd: repositoryDirectory });
  const status = execute(gitExecutable, ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repositoryDirectory });
  if (status.trim()) throw new Error('REST checkout bytes do not exactly match the fetched candidate commit.');
  execute(gitExecutable, ['checkout', '--detach', expectedCommit], { inherit: true, cwd: repositoryDirectory });
  if (execute(gitExecutable, ['rev-parse', 'HEAD'], { cwd: repositoryDirectory }).trim() !== expectedCommit) throw new Error('Recovered checkout history does not resolve to the candidate commit.');
  return true;
}

export function resolveBundledNpmCli(nodeExecutable) {
  const executableName = path.basename(nodeExecutable).toLowerCase();
  const nodeDirectory = path.dirname(nodeExecutable);
  const npmCli = executableName === 'node.exe'
    ? path.join(nodeDirectory, 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : executableName === 'node'
      ? path.resolve(nodeDirectory, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
      : null;
  if (!npmCli || !fs.existsSync(npmCli)) {
    throw new Error('The Node archive does not contain its bundled npm CLI at the declared platform layout.');
  }
  return npmCli;
}

export async function bootstrapJobTools(jobPlatform) {
  if (!['windows', 'ubuntu'].includes(jobPlatform)) throw new TypeError('Job bootstrap platform must be windows or ubuntu.');
  const manifest = validateDependencyManifest(JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'dependencies.manifest.json'), 'utf8')));
  if (process.version !== 'v' + manifest.workflowTools.node.exactVersion) throw new Error('Job Node.js version is not the exact declared release version.');
  const npmCli = resolveBundledNpmCli(process.execPath);
  if (execute(process.execPath, [npmCli, '--version']).trim() !== manifest.workflowTools.npm.exactVersion) {
    throw new Error('Job npm version is not the exact version bundled with Node.js.');
  }
  if (jobPlatform === 'windows') {
    const powershellVersion = execute('powershell.exe', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']).trim();
    if (!compatible(powershellVersion, '5.1.0', 6)) throw new Error('Windows PowerShell does not satisfy >=5.1 <6.0.');
  }
  const gitExecutable = jobPlatform === 'windows' ? ensureWindowsGit(manifest) : ensureUbuntuGit();
  const ubuntuTarExecutable = jobPlatform === 'ubuntu' ? ensureUbuntuTar() : null;
  await ensureGithubCli(manifest, jobPlatform, ubuntuTarExecutable);
  ensureCheckoutHistory(gitExecutable);
  process.stdout.write('Verified and bootstrapped the complete ' + jobPlatform + ' workflow tool inventory.\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await bootstrapJobTools(process.argv[2]);

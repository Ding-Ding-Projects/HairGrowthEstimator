import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteFileSync } from './atomic-file.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const SOURCE_REPOSITORY = 'Ding-Ding-Projects/HairGrowthEstimator';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createBuilderConfig(packageJson, provenance) {
  if (!packageJson?.build || typeof packageJson.build !== 'object') throw new TypeError('package.json does not contain a build configuration.');
  if (!/^[0-9a-f]{40}$/.test(provenance?.commit || '')) throw new TypeError('Build provenance requires a full lowercase commit SHA.');
  if (!/^\d+\.\d+\.\d+$/.test(provenance?.version || '') || packageJson.version !== provenance.version) {
    throw new TypeError('Build provenance version must match package.json.');
  }
  const config = clone(packageJson.build);
  config.extraMetadata = { ...(config.extraMetadata || {}), version: provenance.version };
  config.files = [
    {
      from: 'dist/package-source',
      to: '.',
      filter: [
        'app/**/*',
        '!app/provenance.json',
        '!app/release-metadata.json',
        'assets/**/*',
        '!assets/app-icon*.png',
        '!assets/app-icon.ico',
        '!assets/icon-manifest.json',
        '!assets/logo-master.svg',
        '!assets/icons/**/*'
      ]
    },
    {
      from: 'dist/package-input',
      to: '.',
      filter: ['package.json', 'app/provenance.json', 'app/release-metadata.json']
    },
    {
      from: 'dist/package-source/assets/icons',
      to: 'assets',
      filter: ['app-icon*.png', 'app-icon.ico', 'icon-manifest.json', 'logo-master.svg']
    }
  ];
  config.extraResources = (config.extraResources || []).map((entry) => entry?.to === 'server'
    ? { ...entry, from: 'dist/package-source/server' }
    : entry);
  config.afterPack = './scripts/release/apply-executable-icon.cjs';
  config.forceCodeSigning = false;
  config.win = { ...config.win, forceCodeSigning: false, signExecutable: false, signAndEditExecutable: false };
  config.squirrelWindows = {
    ...config.squirrelWindows,
    iconUrl: `https://raw.githubusercontent.com/${SOURCE_REPOSITORY}/${provenance.commit}/assets/icons/app-icon.ico`,
    artifactName: 'HairGrowthEstimator-Setup-${version}-${arch}.${ext}',
    msi: false
  };
  return config;
}

export function validateBuilderConfig(config, expected) {
  if (!config || config.forceCodeSigning !== false || config.win?.forceCodeSigning !== false || config.win?.signExecutable !== false || config.win?.signAndEditExecutable !== false) {
    throw new TypeError('Builder configuration must disable every signing path.');
  }
  if (!/^\d+\.\d+\.\d+$/.test(expected?.version || '') || config.extraMetadata?.version !== expected.version) {
    throw new TypeError('Builder release version must match the exact staged release provenance.');
  }
  if (config.squirrelWindows?.msi !== false) throw new TypeError('Builder configuration must produce only the Squirrel.Windows release family.');
  const expectedUrl = `https://raw.githubusercontent.com/${SOURCE_REPOSITORY}/${expected.commit}/assets/icons/app-icon.ico`;
  if (config.squirrelWindows?.iconUrl !== expectedUrl) throw new TypeError('Squirrel icon URL must bind to the immutable commit being packaged.');
  if (JSON.stringify(config).includes('/main/') || JSON.stringify(config).includes('/master/')) {
    throw new TypeError('Builder configuration contains a mutable branch URL.');
  }
  const sourceFiles = config.files?.find((entry) => entry?.from === 'dist/package-source' && entry?.to === '.');
  const stagedRelease = config.files?.find((entry) => entry?.from === 'dist/package-input' && entry?.to === '.');
  const canonicalIcons = config.files?.find((entry) => entry?.from === 'dist/package-source/assets/icons' && entry?.to === 'assets');
  const stagedServer = config.extraResources?.find((entry) => entry?.to === 'server');
  if (!sourceFiles?.filter?.includes('app/**/*') || !sourceFiles.filter.includes('!app/provenance.json') || !sourceFiles.filter.includes('!app/release-metadata.json') || !sourceFiles.filter.includes('assets/**/*') || !sourceFiles.filter.includes('!assets/icons/**/*')) {
    throw new TypeError('Builder configuration does not include the application payload and exclude the unmapped icon source directory.');
  }
  if (!stagedRelease?.filter?.includes('package.json') || !stagedRelease.filter.includes('app/provenance.json') || !stagedRelease.filter.includes('app/release-metadata.json') || stagedRelease.filter.includes('package-lock.json')) {
    throw new TypeError('Builder configuration does not map every output-only release transformation into app.asar.');
  }
  if (!canonicalIcons?.filter?.includes('app-icon.ico') || !canonicalIcons.filter.includes('logo-master.svg') || !canonicalIcons.filter.includes('icon-manifest.json')) {
    throw new TypeError('Builder configuration does not map the canonical generated icon family into the packaged asset paths.');
  }
  if (stagedServer?.from !== 'dist/package-source/server' || !stagedServer.filter?.includes('**/*')) {
    throw new TypeError('Builder configuration does not map the exact staged server source into the packaged resources.');
  }
  if (config.afterPack !== './scripts/release/apply-executable-icon.cjs') throw new TypeError('Builder configuration does not apply the verified icon after unsigned packaging.');
  return config;
}

export function writeBuilderConfig() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'dist', 'package-input', 'package.json'), 'utf8'));
  const provenance = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'dist', 'package-input', 'app', 'provenance.json'), 'utf8'));
  const config = createBuilderConfig(packageJson, provenance);
  validateBuilderConfig(config, provenance);
  const output = path.join(repositoryRoot, 'dist', 'build-config', 'electron-builder.json');
  atomicWriteFileSync(output, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return output;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const output = writeBuilderConfig();
  process.stdout.write(`Wrote immutable unsigned builder configuration to ${path.relative(repositoryRoot, output)}.\n`);
}

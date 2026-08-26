import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { applyExecutableIcon, manifestContext } = require('./apply-executable-icon.cjs');
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');

export function applyInstallerIcon(directory) {
  const resolved = path.resolve(directory);
  const setups = fs.readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /setup.*\.exe$/i.test(entry.name));
  if (setups.length !== 1) throw new TypeError(`Expected exactly one Setup executable, received ${setups.length}.`);
  const inputs = manifestContext(repositoryRoot);
  const executablePath = path.join(resolved, setups[0].name);
  const result = applyExecutableIcon(executablePath, inputs.iconPath, inputs.resourceEditorPath, inputs.expectedEditorSha256);
  process.stdout.write(`Applied ${result.records.length} verified icon resources to ${setups[0].name} without signing.\n`);
  return { executablePath, ...result };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) applyInstallerIcon(process.argv[2] || path.join(repositoryRoot, 'dist', 'squirrel-windows'));

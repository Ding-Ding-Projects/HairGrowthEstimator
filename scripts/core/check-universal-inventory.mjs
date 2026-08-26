import { readFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');

const requiredIds = Object.freeze([
  'front-screen-provenance', 'hair-growth-estimation', 'centimetre-inch-conversion', 'haircut-reset-history',
  'animated-real-image-progression', 'local-persistence', 'private-service-sync', 'ssh-tunnel-mode', 'docker-hosting',
  'language-modes', 'independent-funny-levels', 'dialog-emoji-toggle', 'shared-school-mode', 'narrator-voices-rate-pitch',
  'scheduled-settings', 'dim-sum-startup-surprise', 'dockable-tab-navigation', 'command-palette',
  'advanced-regex-workbench', 'anchored-regex-for-every-search', 'target-context-menu-every-element',
  'appearance-editor', 'infinite-color-translator', 'toy-locks-six-policies', 'support-tickets',
  'built-in-authenticator', 'destructive-super-confirmation', 'nonblocking-notifications-history',
  'local-git-version-history', 'bulk-actions', 'export-everything', 'external-editor-vscode',
  'personal-vocabulary-json', 'app-rename', 'app-logo-customization', 'local-file-converter',
  'local-ollama-manager', 'offline-documentation-browser', 'changelog-viewer', 'adhd-modes',
  'automatic-update-surface', 'status-hub-surface', 'frameless-material-window', 'release-code-name',
  'squirrel-windows-packaging', 'built-artifact-interaction-captures'
]);

function validateReferences(feature, references, kind, root) {
  for (const reference of references) {
    if (typeof reference !== 'string' || !reference.trim()) throw new Error(`Inventory ${kind} reference is invalid: ${feature.id}`);
    const relativePath = reference.split('#', 1)[0];
    if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..')) throw new Error(`Inventory ${kind} reference escapes the repository: ${feature.id}`);
    try {
      if (!statSync(path.join(root, relativePath)).isFile()) throw new Error('not a file');
    } catch {
      throw new Error(`Inventory ${kind} file is missing for ${feature.id}: ${relativePath}`);
    }
  }
}

export function validateInventory(inventory, root = repositoryRoot) {
  if (inventory?.schemaVersion !== 1 || inventory.surface !== 'Windows desktop application' || !Array.isArray(inventory.features)) throw new Error('Inventory header is invalid.');
  const ids = inventory.features.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error('Inventory feature IDs must be unique.');
  for (const id of requiredIds) if (!ids.includes(id)) throw new Error(`Required inventory row is missing: ${id}`);
  for (const feature of inventory.features) {
    if (!['implemented', 'partial', 'gap'].includes(feature.status)) throw new Error(`Inventory row has invalid status: ${feature.id}`);
    if (!Array.isArray(feature.implementation) || !Array.isArray(feature.tests)) throw new Error(`Inventory row lacks implementation or test arrays: ${feature.id}`);
    if (feature.status !== 'implemented' && (typeof feature.gap !== 'string' || !feature.gap.trim())) throw new Error(`Incomplete inventory row lacks an exact gap: ${feature.id}`);
    if (feature.status === 'implemented' && feature.gap !== null) throw new Error(`Implemented inventory row must have a null gap: ${feature.id}`);
    validateReferences(feature, feature.implementation, 'implementation', root);
    validateReferences(feature, feature.tests, 'test', root);
  }
  return { rows: inventory.features.length, implemented: inventory.features.filter((item) => item.status === 'implemented').length, partial: inventory.features.filter((item) => item.status === 'partial').length, gaps: inventory.features.filter((item) => item.status === 'gap').length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inventory = JSON.parse(await readFile(path.join(repositoryRoot, 'tests', 'core', 'universal-feature-inventory.json'), 'utf8'));
  const result = validateInventory(inventory);
  process.stdout.write(`Universal feature inventory: ${result.rows} rows, ${result.implemented} implemented, ${result.partial} partial, ${result.gaps} gaps.\n`);
}

export { requiredIds };

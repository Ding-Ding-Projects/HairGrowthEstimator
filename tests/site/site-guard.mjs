import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const REQUIRED_BOUNDARIES = Object.freeze([
  { name: 'front-screen provenance', source: 'template', token: 'id="front-provenance"', docs: 'docs/operations/version-provenance.md', inventory: 'Front-screen version and updated-at provenance' },
  { name: 'website boundary', source: 'template', token: 'This website is a landing, documentation, download, status, settings, and link surface.', docs: 'docs/site/home-and-download.md', inventory: 'Website boundary as documentation, download, status, settings, and link surface' },
  { name: 'growth estimator', source: 'template', token: 'id="estimator-form"', docs: 'docs/features/hair-growth-estimation.md', inventory: 'Adjustable hair-growth estimator with a 1.0 cm/month estimate default' },
  { name: 'haircut history', source: 'template', token: 'id="haircut-form"', docs: 'docs/features/haircut-history.md', inventory: 'Haircut record and baseline reset' },
  { name: 'exact units', source: 'app', token: 'const CM_PER_INCH = 2.54;', docs: 'docs/features/measurements.md', inventory: 'Centimetre and inch measurements' },
  { name: 'hair stages', source: 'app', token: 'bundledHairAssets', docs: 'docs/features/visual-growth-timeline.md', inventory: 'Eight adult male reference stages' },
  { name: 'local service', source: 'template', token: 'id="panel-service"', docs: 'docs/operations/local-service.md', inventory: 'Local service connection' },
  { name: 'private LAN', source: 'template', token: 'Private LAN', docs: 'docs/operations/private-lan.md', inventory: 'Private LAN connection' },
  { name: 'SSH tunnel', source: 'template', token: 'SSH tunnel', docs: 'docs/operations/ssh-tunnels.md', inventory: 'SSH tunnel connection' },
  { name: 'installer pending state', source: 'template', token: 'id="download-button"', docs: 'docs/operations/release-install-and-updates.md', inventory: 'Verified installer download' },
  { name: 'offline documentation', source: 'template', token: 'id="bundled-docs"', docs: 'docs/site/documentation-browser.md', inventory: 'Offline documentation browser' },
  { name: 'status surface', source: 'template', token: 'data-feature="status-hub"', docs: 'docs/security/status-hub-boundaries.md', inventory: 'Shared Status Hub boundary' },
  { name: 'three language modes', source: 'template', token: '<option value="both">Bilingual</option>', docs: 'docs/site/settings-and-appearance.md', inventory: 'English, playful Hong Kong-style Cantonese, and bilingual modes' },
  { name: 'funny controls', source: 'template', token: 'id="funny-yue"', docs: 'docs/site/settings-and-appearance.md', inventory: 'Cantonese funny-level slider 1 through 5, default 5' },
  { name: 'emoji control', source: 'template', token: 'id="dialog-emoji"', docs: 'docs/site/settings-and-appearance.md', inventory: 'Dialog and message emoji toggle' },
  { name: 'School mode', source: 'app', token: 'function createSchoolDialog(mode)', docs: 'docs/site/settings-and-appearance.md', inventory: 'Universal renamed School mode' },
  { name: 'narrator', source: 'app', token: 'function populateVoices()', docs: 'docs/site/narrator-and-voices.md', inventory: 'English and Cantonese voice pickers' },
  { name: 'scheduled settings', source: 'app', token: 'function applySchedules()', docs: 'docs/site/scheduled-settings.md', inventory: 'Scheduled settings with local time and weekdays' },
  { name: 'dim-sum surprise', source: 'app', token: 'function maybeDimSumSurprise()', docs: 'docs/operations/release-code-name.md', inventory: 'Startup dim-sum surprise' },
  { name: 'attention modes', source: 'template', token: 'data-feature="adhd-modes"', docs: 'docs/site/attention-modes.md', inventory: 'Focus attention mode' },
  { name: 'tab navigation', source: 'app', token: 'const TAB_DEFINITIONS', docs: 'docs/site/tabbed-navigation.md', inventory: 'Browser-style primary tabs' },
  { name: 'four tab searches', source: 'template', token: 'data-search-owner="master-tabs"', docs: 'docs/inventory/regex-builders.md', inventory: 'Current-strip tab search' },
  { name: 'command palette', source: 'app', token: "event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f'", docs: 'docs/site/command-palette.md', inventory: 'Command palette on Ctrl+Shift+F' },
  { name: 'regex workbench', source: 'app', token: 'function createRegexWorkbench(owner)', docs: 'docs/site/search-and-regex-workbench.md', inventory: 'Super-advanced regex workbench' },
  { name: 'dropdown search enhancement', source: 'app', token: 'function enhanceDropdowns(root = document)', docs: 'docs/inventory/regex-builders.md', inventory: 'Search and builder in every dropdown' },
  { name: 'element context menu', source: 'template', token: 'id="context-menu"', docs: 'docs/site/search-and-regex-workbench.md', inventory: 'Every rendered element context menu' },
  { name: 'appearance editor', source: 'app', token: 'function appearanceEditorMarkup(element)', docs: 'docs/site/settings-and-appearance.md', inventory: 'Per-element appearance editor' },
  { name: 'element locks', source: 'app', token: 'function policyFactors(policy)', docs: 'docs/site/locks-and-authenticator.md', inventory: 'Per-element for-fun lock wizard' },
  { name: 'destructive confirmation', source: 'app', token: 'function requestDestructiveAction(name, impact, callback)', docs: 'docs/site/destructive-confirmation.md', inventory: 'Destructive-action two-key and full-slider confirmation' },
  { name: 'notifications', source: 'app', token: 'function showNotification(', docs: 'docs/site/notifications-and-history.md', inventory: 'Searchable notification center with bulk actions' },
  { name: 'local history', source: 'app', token: 'function appendHistory(', docs: 'docs/site/notifications-and-history.md', inventory: 'Append-only local version history' },
  { name: 'exports', source: 'app', token: 'function serializeExport(record, format)', docs: 'docs/features/export.md', inventory: 'Export all visible records and settings' },
  { name: 'personal vocabulary loader', source: 'app', token: 'function validateVocabulary(value, byteLength)', docs: 'docs/site/settings-and-appearance.md', inventory: 'Local personal-vocabulary JSON upload' },
  { name: 'logo customization', source: 'app', token: 'async function handleCustomLogo(event)', docs: 'docs/site/logo-customization.md', inventory: 'Logo presets and bounded custom upload' },
  { name: 'file converter', source: 'app', token: 'async function convertFile()', docs: 'docs/site/local-file-converter.md', inventory: 'Local file-converter surface' },
  { name: 'Ollama mediation', source: 'app', token: 'async function connectOllama()', docs: 'docs/site/ollama-mediation.md', inventory: 'Local Ollama mediation' },
  { name: 'authenticator', source: 'app', token: 'async function totpCode(', docs: 'docs/site/locks-and-authenticator.md', inventory: 'Local TOTP authenticator' },
  { name: 'Support Tickets', source: 'template', token: 'id="support-dialog"', docs: 'docs/site/support-tickets.md', inventory: 'Support Tickets local recovery desk' },
  { name: 'changelog', source: 'app', token: 'function renderChangelog()', docs: 'docs/site/changelog-viewer.md', inventory: 'Changelog viewer with date and text filters' }
]);

const REQUIRED_BUILDERS = Object.freeze([
  'strip-search', 'group-tab-search', 'group-name-search', 'master-tab-search', 'haircut-search', 'docs-search', 'ollama-search', 'totp-search', 'history-search', 'notification-search', 'changelog-search', 'settings-search', 'palette-search', 'context-search', 'overflow-search', 'bulk-tab-query'
]);

function assertExact(haystack, needle, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) throw new Error(`${label} must occur exactly once, found ${count}.`);
}

export function auditSiteSources({ template, app, styles, inventory }) {
  const sources = { template, app, styles };
  for (const feature of REQUIRED_BOUNDARIES) {
    if (!sources[feature.source].includes(feature.token)) throw new Error(`Missing exact ${feature.name} boundary: ${feature.token}`);
    if (!inventory.includes(feature.inventory)) throw new Error(`Missing inventory row for ${feature.name}: ${feature.inventory}`);
  }
  for (const id of REQUIRED_BUILDERS) {
    assertExact(template, `id="${id}"`, `Search field ${id}`);
    assertExact(template, `data-open-regex-for="${id}"`, `Regex builder ${id}`);
  }
  if (!styles.includes('@media (max-width: 390px)')) throw new Error('Missing 390 px responsive boundary.');
  if (!styles.includes('@media (prefers-reduced-motion: reduce)')) throw new Error('Missing operating-system reduced-motion boundary.');
  if (!template.includes('name="viewport"')) throw new Error('Missing responsive viewport metadata.');
  if (!template.includes('class="skip-link" href="#main-content"')) throw new Error('Missing keyboard skip link.');
  if (!template.includes('<main id="main-content" tabindex="-1">')) throw new Error('Missing focusable main landmark.');
  if (!template.includes('role="tablist" aria-orientation="vertical"')) throw new Error('Missing initial tab-list orientation semantics.');
  if (!template.includes('aria-live="polite" aria-relevant="additions"')) throw new Error('Missing accessible notification live region.');
  if (!styles.includes('@media (forced-colors: active)')) throw new Error('Missing operating-system forced-colors boundary.');
  if (!template.includes('twitter:card" content="summary_large_image"')) throw new Error('Missing large social-card metadata.');
  if (!template.includes('og:image" content="https://')) throw new Error('Open Graph image URL must be absolute HTTPS.');
  if (template.indexOf('id="front-provenance"') > template.indexOf('id="app-shell"')) throw new Error('Provenance must precede navigation.');
  return { features: REQUIRED_BOUNDARIES.length, builders: REQUIRED_BUILDERS.length };
}

export async function auditSiteTree(root) {
  const [template, app, styles, inventory] = await Promise.all([
    readFile(join(root, 'site', 'index.template.html'), 'utf8'),
    readFile(join(root, 'site', 'app.js'), 'utf8'),
    readFile(join(root, 'site', 'styles.css'), 'utf8'),
    readFile(join(root, 'docs', 'inventory', 'site-universal-features.md'), 'utf8')
  ]);
  for (const feature of REQUIRED_BOUNDARIES) await access(join(root, feature.docs));
  return auditSiteSources({ template, app, styles, inventory });
}

export { REQUIRED_BOUNDARIES, REQUIRED_BUILDERS };

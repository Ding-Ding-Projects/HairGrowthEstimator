import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const localeRoot = join(root, 'docs', 'locales', 'yue');
const localizationInventory = JSON.parse(await readFile(join(here, 'fixtures', 'localization-inventory.json'), 'utf8'));
const catalogFiles = localizationInventory.catalogs.map((entry) => entry.path);

async function loadContract() {
  const source = await readFile(join(root, 'site', 'localization-contract.js'), 'utf8');
  const context = vm.createContext({ console, structuredClone });
  vm.runInContext(source, context, { filename: 'localization-contract.js' });
  assert.ok(context.HairGrowthLocalizationContract, 'The localization contract must expose its browser global.');
  return context.HairGrowthLocalizationContract;
}

async function readCatalogs() {
  return Promise.all(catalogFiles.map(async (path) => JSON.parse(await readFile(join(root, path), 'utf8'))));
}

function auditHandWrittenInventory(catalogs, englishPaths) {
  assert.equal(localizationInventory.schemaVersion, 1, 'Localization inventory schemaVersion must be 1.');
  assert.deepEqual([...localizationInventory.articles].sort(), [...englishPaths].sort(), 'The hand-written localization article inventory must match every English article exactly.');
  assert.deepEqual(localizationInventory.catalogs.map((entry) => entry.path), catalogFiles, 'The hand-written catalog paths must remain explicit.');
  localizationInventory.catalogs.forEach((expected, index) => {
    assert.equal(catalogs[index].scope, expected.scope, `${expected.path} must retain its inventoried scope.`);
    assert.equal(catalogs[index].entries.length, expected.entryCount, `${expected.path} must retain its inventoried entry count.`);
  });
  assert.deepEqual(localizationInventory.boundaries, [
    'static-visible-text',
    'accessible-names-and-descriptions',
    'runtime-generated-copy',
    'documentation-titles-and-bodies',
    'changelog-titles-and-bodies',
    'school-mode-english-suppression',
    'compact-bilingual-rendering',
    'fact-placeholder-parity'
  ], 'The hand-written localization boundary inventory must remain complete.');
  assert.deepEqual(localizationInventory.technicalLiterals, [
    'HAIR_API_KEY',
    'docker compose up --build -d',
    'https://example.invalid/settings',
    'input_boolean.study_mode'
  ], 'Technical UI literals must remain explicitly inventoried and untranslated.');
}

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'locales') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(path));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(path);
  }
  return files.sort();
}

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function canonicalNumericFact(value) {
  return compact(value)
    .replace(/\s*(?:seconds?|秒)$/i, ' second')
    .replace(/\s*(?:minutes?|分鐘)$/i, ' minute')
    .replace(/\s*(?:hours?|小時)$/i, ' hour')
    .replace(/\s*(?:days?|日)$/i, ' day');
}

function extractStaticMessages(html) {
  const withoutScripts = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const messages = new Set();
  for (const match of withoutScripts.matchAll(/>([^<>]+)</g)) {
    const value = compact(match[1]);
    if (/[A-Za-z]/.test(value) && !/^__[A-Z0-9_]+__$/.test(value) && !localizationInventory.technicalLiterals.includes(value)) messages.add(value);
  }
  for (const match of withoutScripts.matchAll(/\b(?:aria-label|aria-description|aria-valuetext|aria-roledescription|title|placeholder|alt)="([^"]+)"/g)) {
    const value = compact(match[1]);
    if (/[A-Za-z]/.test(value) && !localizationInventory.technicalLiterals.includes(value)) messages.add(value);
  }
  return [...messages].sort();
}

function markdownShape(content) {
  const normalized = String(content).replace(/\r\n?/g, '\n');
  const headings = [...normalized.matchAll(/^(#{1,6})\s+/gm)].map((match) => match[1].length);
  const links = [...normalized.matchAll(/\]\(([^)]+)\)/g)].map((match) => {
    const target = match[1];
    if (/^(?:https?:|mailto:|#)/i.test(target)) return target;
    const normalizedTarget = target.replace(/^(?:(?:\.\.\/)|(?:\.\/))+/, '');
    return normalizedTarget.endsWith('.json') ? normalizedTarget.split('/').at(-1) : normalizedTarget;
  });
  const inlineCode = [...normalized.matchAll(/(?<!`)`([^`\r\n]+)`(?!`)/g)].map((match) => match[1]);
  const fencedCode = [...normalized.matchAll(/^```[^\r\n]*\r?\n([\s\S]*?)^```\s*$/gm)].map((match) => match[0]);
  const urls = [...normalized.matchAll(/https?:\/\/[^\s)>`，。；！？]+/g)].map((match) => match[0]);
  const numbers = [...normalized.matchAll(/(?<![A-Za-z])(?:\d+(?:\.\d+)?(?:%|[-\s]*(?:cm|in|KiB|MiB|GiB|ms|seconds?|minutes?|hours?|days?|秒|分鐘|小時|日))?)(?![A-Za-z])/g)].map((match) => canonicalNumericFact(match[0].replace(/-/g, ' ')));
  const blocks = normalized.trim().split(/\n\s*\n/).map(compact).filter(Boolean);
  return { headings, links, inlineCode, fencedCode, urls, numbers, blocks };
}

function assertDocumentationPair(english, cantonese, path) {
  const left = markdownShape(english);
  const right = markdownShape(cantonese);
  assert.deepEqual(right.headings, left.headings, `${path} must preserve heading levels.`);
  assert.deepEqual(right.links, left.links, `${path} must preserve Markdown link targets.`);
  assert.deepEqual([...right.inlineCode].sort(), [...left.inlineCode].sort(), `${path} must preserve inline technical tokens.`);
  assert.deepEqual([...right.fencedCode].sort(), [...left.fencedCode].sort(), `${path} must preserve fenced code exactly.`);
  assert.deepEqual([...right.urls].sort(), [...left.urls].sort(), `${path} must preserve public URLs exactly.`);
  assert.deepEqual([...new Set(right.numbers)].sort(), [...new Set(left.numbers)].sort(), `${path} must preserve numeric facts and units.`);
  assert.equal(right.blocks.length, left.blocks.length, `${path} must preserve block count for compact bilingual rendering.`);
  const untranslated = left.blocks.filter((block, index) => {
    if (block !== right.blocks[index]) return false;
    if (/^```/.test(block) || /^`[^`]+`$/.test(block) || /^\|?\s*:?-{3}/.test(block)) return false;
    const proseWords = block.match(/[A-Za-z]{3,}/g) || [];
    return proseWords.length >= 5;
  });
  assert.deepEqual(untranslated, [], `${path} contains an untranslated prose block.`);
}

function auditStaticCatalog(messages, mergedCatalog) {
  const available = new Set(mergedCatalog.entries.map((entry) => entry.en));
  const missing = messages.filter((message) => !available.has(message));
  assert.deepEqual(missing, [], `Static localization catalog is missing ${missing.length} exact source string(s): ${missing.slice(0, 5).join(' | ')}`);
}

function auditArticleInventory(englishPaths, localizedPaths) {
  assert.deepEqual([...localizedPaths].sort(), [...englishPaths].sort(), 'Every bundled English article must have exactly one Cantonese mirror.');
}

test('versioned localization contract resolves English, Cantonese, bilingual, and School presentation', async () => {
  const contract = await loadContract();
  assert.deepEqual([...contract.LANGUAGE_MODES], ['en', 'yue', 'both']);
  const catalog = contract.mergeLocaleCatalogs([{
    schemaVersion: 1,
    locale: 'yue-HK',
    scope: 'focused',
    entries: [{ id: 'focused.saved', en: '{item} was saved at {time}.', yue: '{item} 喺 {time} 儲存好喇。' }]
  }]);
  assert.equal(contract.resolveLocalizedText('{item} was saved at {time}.', { mode: 'en', catalog }), '{item} was saved at {time}.');
  assert.equal(contract.resolveLocalizedText('Hair was saved at 10:00.', { mode: 'yue', catalog }), 'Hair 喺 10:00 儲存好喇。');
  assert.equal(contract.resolveLocalizedText('Hair was saved at 10:00.', { mode: 'both', catalog }), 'Hair was saved at 10:00. · Hair 喺 10:00 儲存好喇。');
  assert.equal(contract.resolveLocalizedText('Hair was saved at 10:00.', { mode: 'yue', schoolActive: true, catalog }), 'Hair was saved at 10:00.');
});

test('structured UI catalogs cover every static visible and accessible source string', async () => {
  const [contract, catalogs, template] = await Promise.all([
    loadContract(),
    readCatalogs(),
    readFile(join(root, 'site', 'index.template.html'), 'utf8')
  ]);
  const merged = contract.mergeLocaleCatalogs(catalogs);
  const englishFiles = await markdownFiles(join(root, 'docs'));
  const englishPaths = englishFiles.map((path) => relative(join(root, 'docs'), path).split(sep).join('/'));
  auditStaticCatalog(extractStaticMessages(template), merged);
  auditHandWrittenInventory(catalogs, englishPaths);
});

test('every bundled documentation article has a complete fact-preserving Cantonese mirror', async () => {
  const englishFiles = await markdownFiles(join(root, 'docs'));
  const englishPaths = englishFiles.map((path) => relative(join(root, 'docs'), path).split(sep).join('/'));
  const localizedPaths = [];
  for (const path of englishPaths) {
    const localizedPath = join(localeRoot, ...path.split('/'));
    const [english, cantonese] = await Promise.all([
      readFile(join(root, 'docs', ...path.split('/')), 'utf8'),
      readFile(localizedPath, 'utf8')
    ]);
    localizedPaths.push(path);
    assertDocumentationPair(english, cantonese, path);
  }
  auditArticleInventory(englishPaths, localizedPaths);
});

test('composer and browser runtime use one validated catalog and localized article route', async () => {
  const [composer, app, template] = await Promise.all([
    readFile(join(root, 'scripts', 'compose-site.mjs'), 'utf8'),
    readFile(join(root, 'site', 'app.js'), 'utf8'),
    readFile(join(root, 'site', 'index.template.html'), 'utf8')
  ]);
  for (const needle of ['mergeLocaleCatalogs', '__LOCALE_CATALOG_JSON__']) assert.ok(composer.includes(needle), `Composer is missing ${needle}.`);
  assert.match(composer, /join\(docsRoot,\s*'locales',\s*'yue'/, 'Composer must bind every article to docs/locales/yue.');
  for (const needle of ['const LocalizationContract = globalThis.HairGrowthLocalizationContract;', 'function applyLocaleToOwnedText(', 'function localizedDocumentationArticle(', 'LocalizationContract.resolveLocalizedText(']) assert.ok(app.includes(needle), `Runtime is missing ${needle}.`);
  assert.ok(template.includes('<script id="locale-catalog" type="application/json">__LOCALE_CATALOG_JSON__</script>'));
  assert.ok(template.includes('<script src="localization-contract.js" defer></script>'));
});

test('deleting one UI locale or one article locale turns completeness red, then restored inputs are green', async () => {
  const [contract, catalogs, template] = await Promise.all([
    loadContract(),
    readCatalogs(),
    readFile(join(root, 'site', 'index.template.html'), 'utf8')
  ]);
  const messages = extractStaticMessages(template);
  const merged = contract.mergeLocaleCatalogs(catalogs);
  assert.doesNotThrow(() => auditStaticCatalog(messages, merged));
  const requiredMessage = messages.find((message) => merged.entries.some((entry) => entry.en === message));
  assert.ok(requiredMessage, 'The deliberate locale deletion needs one exact cataloged message.');
  const removed = { ...merged, entries: merged.entries.filter((entry) => entry.en !== requiredMessage) };
  assert.throws(() => auditStaticCatalog(messages, removed), /missing 1 exact source string/);

  const englishFiles = await markdownFiles(join(root, 'docs'));
  const englishPaths = englishFiles.map((path) => relative(join(root, 'docs'), path).split(sep).join('/'));
  assert.doesNotThrow(() => auditHandWrittenInventory(catalogs, englishPaths));
  const shortenedCatalogs = [{ ...catalogs[0], entries: catalogs[0].entries.slice(1) }, ...catalogs.slice(1)];
  assert.throws(() => auditHandWrittenInventory(shortenedCatalogs, englishPaths), /inventoried entry count/);
  assert.doesNotThrow(() => auditArticleInventory(englishPaths, englishPaths));
  assert.throws(() => auditArticleInventory(englishPaths, englishPaths.slice(1)), /exactly one Cantonese mirror/);
});

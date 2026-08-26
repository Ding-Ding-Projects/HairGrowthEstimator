import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteFileSync } from '../release/atomic-file.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDirectory, '..', '..');
const textExtensions = new Set(['.js', '.mjs', '.cjs', '.json', '.html', '.css', '.md', '.yml', '.yaml', '.toml', '.xml', '.csv', '.tsv', '.bat', '.ps1', '.svg']);
const generatedPaths = new Set([
  'app/provenance.json',
  'assets/hair-growth/hair-growth-image-sequence-manifest.json',
  'assets/icon-manifest.json',
  'assets/icons/icon-manifest.json'
]);
const lockfiles = new Set(['package-lock.json']);
export const extensionlessTextInventory = Object.freeze([
  Object.freeze(['.gitignore', 'Scripts and configuration']),
  Object.freeze(['Dockerfile', 'Scripts and configuration'])
]);
const extensionlessTextCategories = new Map(extensionlessTextInventory);

function git(root, args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: options.encoding === null ? null : 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024
  });
}

export function categoryFor(file) {
  const normal = file.replace(/\\/g, '/');
  if (extensionlessTextCategories.has(normal)) return extensionlessTextCategories.get(normal);
  if (generatedPaths.has(normal)) return 'Generated';
  if (normal.startsWith('tests/') || /(?:^|\/)tests?\//.test(normal) || /\.test\.[cm]?js$/.test(normal)) return 'Tests';
  if (normal.endsWith('.css') || normal.endsWith('.html') || normal.endsWith('.svg')) return 'Styles and markup';
  if (normal.endsWith('.md')) return 'Documentation';
  if (normal.startsWith('scripts/') || normal.startsWith('.github/') || normal.endsWith('.bat') || normal.endsWith('.ps1') || normal.endsWith('.yml') || normal.endsWith('.yaml') || normal.endsWith('.json')) return 'Scripts and configuration';
  return 'Application and service source';
}

export function countTextLines(text) {
  const lines = String(text).split(/\r\n|\n|\r/);
  if (lines.at(-1) === '') lines.pop();
  return { total: lines.length, nonBlank: lines.filter((line) => line.trim().length > 0).length };
}

export function pathDisposition(file) {
  const normal = file.replace(/\\/g, '/');
  if ((normal.startsWith('assets/hair-growth/') && /\.(?:png|jpe?g|webp)$/i.test(normal)) || /^assets\/(?:icons\/)?app-icon(?:-\d+)?\.(?:png|ico)$/i.test(normal)) {
    return { category: 'Generated image binaries', included: false, text: false, reason: 'Generated image assets are reported by file and byte count, not as code.' };
  }
  if (lockfiles.has(path.posix.basename(normal))) {
    return { category: 'Lockfiles', included: false, text: true, reason: 'Machine-generated lockfiles are excluded from project code but included in the grand text total.' };
  }
  if (!extensionlessTextCategories.has(normal) && !textExtensions.has(path.posix.extname(normal).toLowerCase())) {
    return { category: 'Other binaries', included: false, text: false, reason: 'Binary data has no meaningful source line count.' };
  }
  const category = categoryFor(normal);
  if (category === 'Generated') {
    return { category, included: false, text: true, reason: 'Generated metadata is separated from hand-written project code.' };
  }
  return { category, included: true, text: true, reason: 'Included in the project code total.' };
}

function commitIsAgentAuthored(root, commit, cache) {
  if (cache.has(commit)) return cache.get(commit);
  const record = git(root, ['show', '-s', '--format=%an%x00%B', commit]);
  const separator = record.indexOf('\0');
  const author = separator >= 0 ? record.slice(0, separator).trim() : '';
  const message = separator >= 0 ? record.slice(separator + 1) : record;
  const result = author === 'Claude Fable 5' || /\[bot\]$/i.test(author) || /^Co-Authored-By:\s*Claude Fable 5 <noreply@anthropic\.com>\s*$/im.test(message);
  cache.set(commit, result);
  return result;
}

function blameAuthors(root, commit, file, expectedLines, agentCommitCache) {
  let output;
  try {
    output = git(root, ['blame', '--line-porcelain', commit, '--', file]);
  } catch (error) {
    throw new Error(`Unable to attribute surviving lines for ${file}: ${error.stderr?.toString?.() || error.message}`);
  }
  const commits = output.split(/\r?\n/)
    .map((line) => /^\^?([0-9a-f]{40})\s+\d+\s+\d+(?:\s+\d+)?$/.exec(line)?.[1])
    .filter(Boolean);
  if (commits.length !== expectedLines) throw new Error(`Attribution arithmetic disagrees for ${file}: ${commits.length} attributed lines for ${expectedLines} counted lines.`);
  const agent = commits.filter((lineCommit) => commitIsAgentAuthored(root, lineCommit, agentCommitCache)).length;
  return { agent, human: commits.length - agent };
}

function addRow(rows, category, disposition, counts, attribution, bytes) {
  const row = rows.get(category) || {
    category,
    classification: disposition.included ? 'Project' : 'Excluded',
    reason: disposition.reason,
    files: 0,
    bytes: 0,
    total: 0,
    nonBlank: 0,
    agent: 0,
    human: 0
  };
  row.files += 1;
  row.bytes += bytes;
  row.total += counts.total;
  row.nonBlank += counts.nonBlank;
  row.agent += attribution.agent;
  row.human += attribution.human;
  rows.set(category, row);
}

function sumRows(rows) {
  return rows.reduce((sum, row) => ({
    files: sum.files + row.files,
    bytes: sum.bytes + row.bytes,
    total: sum.total + row.total,
    nonBlank: sum.nonBlank + row.nonBlank,
    agent: sum.agent + row.agent,
    human: sum.human + row.human
  }), { files: 0, bytes: 0, total: 0, nonBlank: 0, agent: 0, human: 0 });
}

export function countRepository({ root = defaultRoot, commit = 'HEAD' } = {}) {
  const resolvedCommit = git(root, ['rev-parse', commit]).trim();
  if (!/^[0-9a-f]{40}$/.test(resolvedCommit)) throw new Error('Line counter requires a full commit SHA.');
  const files = git(root, ['ls-tree', '-r', '--name-only', '-z', resolvedCommit], { encoding: null })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  const rows = new Map();
  const agentCommitCache = new Map();
  for (const file of files) {
    const disposition = pathDisposition(file);
    const bytes = git(root, ['show', `${resolvedCommit}:${file}`], { encoding: null });
    if (!disposition.text) {
      addRow(rows, disposition.category, disposition, { total: 0, nonBlank: 0 }, { agent: 0, human: 0 }, bytes.length);
      continue;
    }
    const text = bytes.toString('utf8');
    const counts = countTextLines(text);
    const attribution = blameAuthors(root, resolvedCommit, file, counts.total, agentCommitCache);
    addRow(rows, disposition.category, disposition, counts, attribution, bytes.length);
  }
  const orderedRows = [...rows.values()].sort((left, right) => {
    if (left.classification !== right.classification) return left.classification === 'Project' ? -1 : 1;
    return left.category.localeCompare(right.category);
  });
  const project = sumRows(orderedRows.filter((row) => row.classification === 'Project'));
  const excluded = sumRows(orderedRows.filter((row) => row.classification === 'Excluded'));
  const grand = sumRows(orderedRows);
  if (project.agent + project.human !== project.total || excluded.agent + excluded.human !== excluded.total || grand.agent + grand.human !== grand.total) {
    throw new Error('Line-count and surviving-authorship arithmetic disagree.');
  }
  return {
    schemaVersion: 2,
    commit: resolvedCommit,
    attributionMethod: 'Surviving lines from git blame. A line is agent-authored when its commit author is Claude Fable 5, its commit author ends in [bot], or its commit carries the exact Claude Fable 5 co-author trailer. Every other line is human-authored.',
    rows: orderedRows,
    totals: { project, excluded, grand }
  };
}

export function renderMarkdown(report) {
  const lines = [
    `Line count at commit \`${report.commit}\`.`,
    '',
    '| Classification | Category | Files | Bytes | Total lines | Non-blank lines | Agent-authored surviving lines | Human-authored surviving lines |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |'
  ];
  for (const row of report.rows) {
    lines.push(`| ${row.classification} | ${row.category} | ${row.files} | ${row.bytes} | ${row.total} | ${row.nonBlank} | ${row.agent} | ${row.human} |`);
  }
  const totals = [
    ['Project total', report.totals.project],
    ['Excluded text and binary inventory', report.totals.excluded],
    ['Grand total', report.totals.grand]
  ];
  for (const [name, total] of totals) {
    lines.push(`| **${name}** | **All applicable rows** | **${total.files}** | **${total.bytes}** | **${total.total}** | **${total.nonBlank}** | **${total.agent}** | **${total.human}** |`);
  }
  lines.push('', report.attributionMethod, '', 'Excluded categories remain visible above with their exact file, byte, and text totals. Binary files contribute zero lines.');
  return `${lines.join('\n')}\n`;
}

function valueAfter(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  if (!args[index + 1]) throw new TypeError(`${name} requires a value.`);
  return args[index + 1];
}

function atomicWrite(target, contents) {
  atomicWriteFileSync(target, contents);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const report = countRepository({ root: defaultRoot, commit: valueAfter(args, '--commit') || 'HEAD' });
  const markdown = renderMarkdown(report);
  const markdownTarget = valueAfter(args, '--markdown');
  const jsonTarget = valueAfter(args, '--json');
  if (markdownTarget) atomicWrite(path.resolve(defaultRoot, markdownTarget), markdown);
  if (jsonTarget) atomicWrite(path.resolve(defaultRoot, jsonTarget), `${JSON.stringify(report, null, 2)}\n`);
  if (!markdownTarget) process.stdout.write(markdown);
}

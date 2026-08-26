import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..', '..');
const textExtensions = new Set(['.js', '.mjs', '.cjs', '.json', '.html', '.css', '.md', '.yml', '.yaml', '.toml', '.xml', '.csv', '.tsv', '.bat', '.svg']);
const excludedPrefixes = ['node_modules/', 'dist/', 'out/', '_site/', 'coverage/', 'assets/hair-growth/'];
const excludedNames = new Set(['package-lock.json']);

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
}

function categoryFor(file) {
  if (file.startsWith('tests/')) return 'Tests';
  if (file.endsWith('.css') || file.endsWith('.html') || file.endsWith('.svg')) return 'Styles and markup';
  if (file.startsWith('scripts/') || file.endsWith('.bat') || file.endsWith('.yml') || file.endsWith('.yaml') || file.endsWith('.json')) return 'Scripts and configuration';
  if (file.endsWith('.md')) return 'Documentation';
  return 'Application and service source';
}

function countLines(text) {
  const lines = text.split(/\r\n|\n|\r/);
  if (lines.at(-1) === '') lines.pop();
  return { total: lines.length, nonBlank: lines.filter((line) => line.trim()).length };
}

function agentLineCount(file) {
  try {
    const output = git(['blame', '--line-porcelain', '--', file]);
    return output.split(/\r?\n/).filter((line) => line === 'author Claude Fable 5').length;
  } catch {
    return 0;
  }
}

const files = git(['ls-files']).split(/\r?\n/).filter(Boolean);
const rows = new Map();
const exclusions = { Binary: 0, 'Generated image originals': 0, 'Lockfiles and build output': 0 };
let grandTotal = 0;

for (const file of files) {
  if (excludedPrefixes.some((prefix) => file.startsWith(prefix))) {
    if (file.startsWith('assets/hair-growth/')) exclusions['Generated image originals'] += 1;
    else exclusions['Lockfiles and build output'] += 1;
    continue;
  }
  if (excludedNames.has(path.basename(file))) { exclusions['Lockfiles and build output'] += 1; continue; }
  if (!textExtensions.has(path.extname(file).toLowerCase())) { exclusions.Binary += 1; continue; }
  const text = await readFile(path.join(root, file), 'utf8');
  const counts = countLines(text);
  const category = categoryFor(file);
  const row = rows.get(category) || { files: 0, total: 0, nonBlank: 0, agent: 0 };
  row.files += 1; row.total += counts.total; row.nonBlank += counts.nonBlank; row.agent += agentLineCount(file);
  rows.set(category, row); grandTotal += counts.total;
}

const project = [...rows.values()].reduce((sum, row) => ({ files: sum.files + row.files, total: sum.total + row.total, nonBlank: sum.nonBlank + row.nonBlank, agent: sum.agent + row.agent }), { files: 0, total: 0, nonBlank: 0, agent: 0 });

process.stdout.write('| Category | Files | Total lines | Non-blank lines | Agent-authored surviving lines | Human-authored surviving lines |\n');
process.stdout.write('| --- | ---: | ---: | ---: | ---: | ---: |\n');
for (const [category, row] of rows) process.stdout.write(`| ${category} | ${row.files} | ${row.total} | ${row.nonBlank} | ${row.agent} | ${row.total - row.agent} |\n`);
process.stdout.write(`| **Project total** | **${project.files}** | **${project.total}** | **${project.nonBlank}** | **${project.agent}** | **${project.total - project.agent}** |\n`);
process.stdout.write(`\nGrand total of counted text lines: ${grandTotal}.\n`);
process.stdout.write(`Exclusions: ${exclusions.Binary} binary files; ${exclusions['Generated image originals']} generated-image files; ${exclusions['Lockfiles and build output']} lockfile or build-output files.\n`);
process.stdout.write('Attribution method: surviving lines from git blame, with author Claude Fable 5 classified as agent-authored.\n');

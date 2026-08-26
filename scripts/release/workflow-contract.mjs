import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { releaseWorkflowJobs } from './workflow-jobs.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');

const requiredActions = new Map([
  ['actions/checkout', '3d3c42e5aac5ba805825da76410c181273ba90b1'],
  ['actions/setup-node', '820762786026740c76f36085b0efc47a31fe5020'],
  ['actions/upload-artifact', '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'],
  ['docker/setup-docker-action', '77e84dbf09b47d1e29270283c22f16145aa85ca1'],
  ['docker/setup-buildx-action', '37fe631027851001ddb9b187196cc803df7f5f0e']
]);
const requiredActionCounts = new Map([
  ['actions/checkout', 4],
  ['actions/setup-node', 4],
  ['actions/upload-artifact', 6],
  ['docker/setup-docker-action', 1],
  ['docker/setup-buildx-action', 1]
]);

function normalized(value) {
  return String(value || '').replace(/\r\n/g, '\n');
}

function requireMatch(text, expression, message) {
  if (!expression.test(text)) throw new TypeError(message);
}

function requireCount(text, expression, expected, message) {
  const actual = [...text.matchAll(expression)].length;
  if (actual !== expected) throw new TypeError(message + ' Received ' + actual + '.');
}

function jobBlock(text, jobName) {
  const expression = new RegExp('^  ' + jobName.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&') + ':\\s*$', 'm');
  const match = expression.exec(text);
  if (!match) throw new TypeError('Release workflow is missing job ' + jobName + '.');
  const rest = text.slice(match.index + match[0].length);
  const next = /^  [a-z][a-z0-9-]+:\s*$/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

function stepBlocks(text) {
  const starts = [...text.matchAll(/^      - name:.*$/gm)].map((match) => match.index);
  return starts.map((start, index) => text.slice(start, starts[index + 1] ?? text.length));
}

function currentComponents() {
  const read = (name) => fs.readFileSync(path.join(repositoryRoot, 'scripts', 'release', name), 'utf8');
  return {
    publisher: read('publish-release.mjs'),
    finalizer: read('finalize-release.mjs'),
    bootstrap: read('bootstrap-job-tools.mjs'),
    stageProduct: read('stage-product-files.mjs'),
    ensureContext: read('ensure-run-context.mjs'),
    downloadProducts: read('download-run-products.mjs'),
    safeOutputCollector: read('collect-safe-outputs.mjs'),
    validateTransferred: read('validate-transferred-products.mjs'),
    releaseContext: read('release-context.mjs'),
    postRunFinalizer: read('finalize-run.mjs')
  };
}

function componentsFrom(value) {
  const current = currentComponents();
  if (typeof value === 'string') return { ...current, publisher: value };
  return { ...current, ...(value || {}) };
}

export function validateBuildScriptContract(buildSource, installerSource) {
  for (const [label, raw] of [['build.bat', buildSource], ['build-installer.bat', installerSource]]) {
    const text = normalized(raw);
    requireMatch(text, /scripts\\release\\assert-clean-candidate\.mjs --ensure/, label + ' must enforce the exact clean-candidate marker.');
    requireMatch(text, /scripts\\release\\assert-source-preserved\.mjs --capture/, label + ' must capture every tracked source byte before packaging.');
    requireMatch(text, /scripts\\release\\assert-source-preserved\.mjs --verify/, label + ' must verify every tracked source byte after packaging.');
    requireMatch(text, /call "%HGE_ROOT%download-dependencies\.bat" \/s/, label + ' must invoke the complete dependency bootstrap.');
    const elevationBlock = /if "%HGE_SILENT%"=="0" \([\s\S]*?\n\)\n\n/.exec(text);
    if (!elevationBlock || /exit \/b %ERRORLEVEL%/i.test(elevationBlock[0])) {
      throw new TypeError(label + ' must not read stale percent-expanded ERRORLEVEL inside the elevation block.');
    }
    requireMatch(elevationBlock[0], /if errorlevel 1 \([^{}]*?exit \/b [1-9][0-9]*\n\s*\)/, label + ' must propagate a fixed nonzero elevation result.');
    const bootstrapBlock = /call "%HGE_ROOT%download-dependencies\.bat" \/s\nif errorlevel 1 \([^{}]*?\n\)/.exec(text);
    if (!bootstrapBlock || /exit \/b %ERRORLEVEL%/i.test(bootstrapBlock[0])) {
      throw new TypeError(label + ' must not read stale percent-expanded ERRORLEVEL after dependency bootstrap.');
    }
    requireMatch(bootstrapBlock[0], /exit \/b [1-9][0-9]*/, label + ' must propagate a fixed nonzero dependency-bootstrap result.');
    requireMatch(text, /exit \/b 0/, label + ' must return an explicit successful bootstrap result.');
  }
  return true;
}

export function validateIconScriptContract(packageJson, generatorSource) {
  const scripts = packageJson?.scripts;
  if (!scripts || typeof scripts !== 'object') throw new TypeError('package.json must declare package scripts.');
  if (scripts['generate:icons'] !== 'node scripts/core/generate-icons.mjs') {
    throw new TypeError('The explicit icon regeneration command must remain available.');
  }
  if (scripts['verify:icons'] !== 'node scripts/core/generate-icons.mjs --verify') {
    throw new TypeError('Automatic paths require the read-only committed-icon verifier.');
  }
  if (scripts.pretest !== 'npm run verify:icons') {
    throw new TypeError('The test preparation path must not rewrite tracked icons.');
  }
  const prepackCommands = String(scripts.prepack || '').split('&&').map((command) => command.trim());
  if (!prepackCommands.includes('npm run verify:icons') || prepackCommands.includes('npm run generate:icons')) {
    throw new TypeError('The package preparation path must not rewrite tracked icons.');
  }
  const generator = normalized(generatorSource);
  requireMatch(generator, /^const verifyOnly = process\.argv\.includes\('--verify'\);$/m, 'The icon generator must expose an explicit read-only verification mode.');
  requireMatch(generator, /^export async function verifyIconSet\(/m, 'The icon generator must implement read-only byte verification.');
  requireMatch(generator, /atomicWriteFileSync/, 'Explicit icon regeneration must replace each tracked output atomically.');
  if (/\bwriteFile(?:Sync)?\s*\(/.test(generator)) {
    throw new TypeError('The icon generator must not write tracked outputs non-atomically.');
  }
  return true;
}

export function validateWorkflowContract(source, componentInput = {}) {
  const text = normalized(source);
  const components = componentsFrom(componentInput);
  requireMatch(text, /^on:\s*\n  push:\s*$/m, 'Release workflow must publish from every push.');
  if (/^\s+branches:/m.test(text)) throw new TypeError('Release workflow must publish from every push without a branch filter.');
  requireMatch(text, /^  workflow_dispatch:\s*$/m, 'Release workflow must support manual dispatch.');
  requireMatch(text, /^concurrency:\s*\n  group: release-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\s*\n  cancel-in-progress: false$/m, 'Side-effecting release runs must serialize per ref without cancellation.');
  const jobsText = text.slice(text.indexOf('\njobs:\n') + 7);
  const jobs = [...jobsText.matchAll(/^  ([a-z][a-z0-9-]+):\s*$/gm)].map((match) => match[1]);
  const expectedJobs = releaseWorkflowJobs.map((job) => job.id);
  if (JSON.stringify(jobs) !== JSON.stringify(expectedJobs)) {
    throw new TypeError('Release workflow must contain the exact hand-written four-job inventory.');
  }
  for (const job of releaseWorkflowJobs) {
    const block = jobBlock(text, job.id);
    const escapedName = job.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    requireMatch(block, new RegExp('^    name: ' + escapedName + '$', 'm'), `Release workflow job ${job.id} has the wrong display name.`);
  }
  const windows = jobBlock(text, 'windows-package');
  const linux = jobBlock(text, 'linux-container');
  const publish = jobBlock(text, 'publish-release');
  const finalize = jobBlock(text, 'finalize-release');
  requireMatch(windows, /^    runs-on: windows-2025$/m, 'Windows package job must use windows-2025.');
  requireMatch(linux, /^    needs: \[windows-package\]$/m, 'Container packaging must reuse the context produced by Windows packaging.');
  requireMatch(linux, /^    runs-on: ubuntu-24\.04$/m, 'Container job must use ubuntu-24.04.');
  requireMatch(publish, /^    needs: \[windows-package, linux-container\]$/m, 'Publication must wait for both build products.');
  requireMatch(publish, /^    runs-on: ubuntu-24\.04$/m, 'Publication job must use ubuntu-24.04.');
  requireMatch(publish, /^      contents: write$/m, 'Publication requires scoped release write permission.');
  requireMatch(finalize, /^    needs: \[publish-release\]$/m, 'Finalization must wait for successful publication.');
  requireMatch(finalize, /^    runs-on: ubuntu-24\.04$/m, 'Finalization job must use ubuntu-24.04.');
  requireMatch(text, /^  actions: read$/m, 'Workflow requires read-only artifact metadata permission.');
  for (const [action, commit] of requiredActions) {
    requireMatch(text, new RegExp('uses:\\s+' + action.replace('/', '\\/') + '@' + commit), action + ' must use the reviewed immutable commit.');
  }
  const actionCounts = new Map();
  for (const match of text.matchAll(/^\s+uses:\s+([^\s#]+).*$/gm)) {
    const reference = /^([^@]+)@([0-9a-f]{40})$/.exec(match[1]);
    if (!reference || !requiredActions.has(reference[1])) throw new TypeError(`Release workflow contains an unreviewed action: ${match[1]}.`);
    if (requiredActions.get(reference[1]) !== reference[2]) throw new TypeError(`Release workflow action is not pinned to the reviewed revision: ${match[1]}.`);
    actionCounts.set(reference[1], (actionCounts.get(reference[1]) || 0) + 1);
  }
  for (const [action, expectedCount] of requiredActionCounts) {
    if (actionCounts.get(action) !== expectedCount) throw new TypeError(`Release workflow action occurrence count is wrong for ${action}.`);
  }
  if (/actions\/download-artifact@/.test(text)) throw new TypeError('Cross-attempt products must use the exact committed GitHub CLI selector.');
  const forbidden = /(?:npm|pnpm|yarn)(?:\.cmd)?\s+(?:run\s+)?(?:test|lint|typecheck|check:types)\b|node\s+--test\b|\bvitest\b|\beslint\b/i;
  if (forbidden.test(text)) throw new TypeError('Release workflow must not run tests or lint.');
  requireMatch(text, /^  HGE_REQUIRE_CLEAN: "1"$/m, 'Release workflow must require a clean exact candidate before packaging.');
  requireCount(text, /scripts\/release\/bootstrap-job-tools\.mjs windows/g, 1, 'Windows job must execute the complete committed tool bootstrap.');
  requireCount(text, /scripts\/release\/bootstrap-job-tools\.mjs ubuntu/g, 3, 'All three Ubuntu jobs must execute the complete committed tool bootstrap.');
  if (/^          tar --version$/m.test(windows)) throw new TypeError('The Windows job must not claim an uninventoried GNU tar probe.');
  for (const [jobName, block] of [['linux-container', linux], ['publish-release', publish], ['finalize-release', finalize]]) {
    requireCount(block, /^          tar --version$/gm, 1, `Ubuntu job ${jobName} must probe the inventoried GNU tar extractor.`);
  }
  requireCount(text, /scripts\/release\/ensure-run-context\.mjs(?![^\n]*--require-existing)/g, 1, 'Exactly one job must be allowed to resolve the logical-run context.');
  requireCount(text, /scripts\/release\/ensure-run-context\.mjs[^\n]*--require-existing/g, 3, 'All downstream jobs must require the previously resolved logical-run context.');
  requireMatch(windows, /release-context\.json -Destination dist\/workflow\/windows-release\/release-context\.json/, 'Windows product transport must carry the immutable release context.');
  requireMatch(normalized(components.ensureContext), /\^windows-release-.*runId.*\(\[1-9\]\[0-9\]\*\)\$/, 'Context reuse must select exact logical-run Windows product artifacts.');
  requireMatch(normalized(components.ensureContext), /left\.attempt - right\.attempt/, 'Context reuse must keep the earliest successful logical-run identity.');
  requireMatch(normalized(components.ensureContext), /validateRunContext\(context, \{ runId, commit, attempt: candidate\.attempt \}\)/, 'Context reuse must bind exact logical run, candidate commit, and source attempt.');
  requireMatch(normalized(components.releaseContext), /environment\.GITHUB_RUN_NUMBER\s*\?\s*deriveReleaseVersion\(environment\.GITHUB_RUN_NUMBER\)/, 'Release identity must use the globally monotonic workflow run number on every branch.');
  requireMatch(normalized(components.bootstrap), /await downloadArchive\(archiveRecord, archivePath\)/, 'GitHub CLI transport must always use the digest-verified exact archive.');
  requireMatch(normalized(components.bootstrap), /verifiedGh\(executable, version, archiveRecord\.executableSha256\)/, 'GitHub CLI transport must verify the exact executable digest.');
  if (/^env:\s*\n  GH_TOKEN:/m.test(text)) throw new TypeError('A release credential must not be exported to every build step.');
  requireCount(text, /secrets\.RELEASE_TOKEN \|\| secrets\.ORG_TOKEN \|\| secrets\.GITHUB_TOKEN/g, 1, 'The broad publication token chain must appear only on the exact publication step.');
  requireMatch(publish, /name: Publish and verify exactly one non-draft release[\s\S]*GH_TOKEN: \$\{\{ secrets\.RELEASE_TOKEN \|\| secrets\.ORG_TOKEN \|\| secrets\.GITHUB_TOKEN \}\}/, 'The complete token chain must be scoped to publication.');
  requireMatch(text, /CSC_IDENTITY_AUTO_DISCOVERY: "false"/, 'Release workflow must disable certificate discovery.');
  requireMatch(text, /forceCodeSigning/, 'Release workflow must verify the no-signing configuration.');
  requireMatch(text, /scripts\/release\/assert-clean-candidate\.mjs --ensure/, 'Container packaging must begin from the exact clean-candidate marker.');
  requireCount(text, /scripts\/release\/download-run-products\.mjs/g, 2, 'Publication and finalization must independently select the newest valid attempt of each product.');
  requireMatch(normalized(components.downloadProducts), /for \(const product of \['windows', 'container'\]\)/, 'Product selection must enumerate the exact two release products.');
  requireMatch(normalized(components.downloadProducts), /right\.attempt - left\.attempt/, 'Product selection must choose the newest valid attempt independently.');
  const transferValidationIndex = publish.indexOf('scripts/release/validate-transferred-products.mjs');
  const publicationIndex = publish.indexOf('scripts/release/publish-release.mjs');
  if (transferValidationIndex < 0 || publicationIndex < 0 || transferValidationIndex > publicationIndex) {
    throw new TypeError('Transferred products must be independently revalidated before publication.');
  }
  const finalTransferValidationIndex = finalize.indexOf('scripts/release/validate-transferred-products.mjs');
  const finalizationIndex = finalize.indexOf('scripts/release/finalize-release.mjs');
  if (finalTransferValidationIndex < 0 || finalizationIndex < 0 || finalTransferValidationIndex > finalizationIndex) {
    throw new TypeError('Finalization must independently revalidate transferred products before release readback.');
  }
  requireMatch(normalized(components.validateTransferred), /validateInstallerDirectory\(windowsRoot, \{ context \}\)/, 'Transferred Windows bytes must be independently parsed again.');
  requireMatch(normalized(components.validateTransferred), /assertCanonicalContainerManifest/, 'Transferred container metadata must be compared with canonical candidate metadata.');
  requireMatch(normalized(components.stageProduct), /safeReleaseBasename/, 'Product staging must reject unsafe manifest basenames.');
  requireMatch(normalized(components.stageProduct), /manifest\.releaseIndex\?\.file/, 'Product staging must use the exact verified Squirrel release index.');
  requireMatch(publish, /dist\/release\/release-notes-published\.md/, 'Publication evidence must retain the actual pending release-note file.');
  requireMatch(finalize, /dist\/release\/pending-release-readback\.json/, 'Active finalization evidence must retain the pending release readback.');
  requireMatch(finalize, /dist\/release\/release-readback\.json/, 'Active finalization evidence must retain the structured release readback.');
  if (/dist\/release\/installer-manifest\.json/.test(finalize)) throw new TypeError('The active workflow must not expect the terminal-only site installer manifest.');
  requireCount(text, /scripts\/release\/collect-safe-outputs\.mjs windows dist\/evidence\/windows\/partial/g, 1, 'Windows evidence must collect the hand-written safe partial outputs after packaging or validation failure.');
  requireCount(text, /scripts\/release\/collect-safe-outputs\.mjs container dist\/evidence\/container\/partial/g, 1, 'Container evidence must collect the hand-written safe partial outputs after packaging or validation failure.');
  const safeOutputCollector = normalized(components.safeOutputCollector);
  requireMatch(safeOutputCollector, /maximumFileBytes = 1024 \* 1024 \* 1024/, 'Safe partial-output collection must enforce the reviewed per-file byte bound.');
  requireMatch(safeOutputCollector, /sourceCommit: commit,[\s\S]*runId: logicalRunId,[\s\S]*runAttempt: Number\(attempt\),[\s\S]*outcome: jobOutcome/, 'Safe partial-output evidence must bind commit, run, attempt, and outcome.');
  requireMatch(safeOutputCollector, /pathClass:[\s\S]*bytes,[\s\S]*sha256: fileSha256\(destinationPath\)/, 'Safe partial-output evidence must bind exact path class, bytes, and SHA-256.');
  requireMatch(text, /scripts\/release\/build-container\.mjs/, 'Release workflow must build a downloadable OCI archive through the committed deterministic route.');
  requireMatch(text, /line-count\.md/, 'Release workflow must include committed line-count evidence.');
  const publisher = normalized(components.publisher);
  requireMatch(publisher, /'release', 'create'[\s\S]*'--draft'/, 'Release publisher must stage exactly one draft release before publication.');
  requireMatch(publisher, /'draft=false'/, 'Release publisher must publish the staged release exactly once.');
  requireMatch(publisher, /published_at/, 'Release timing must use the server publication timestamp.');
  const finalizer = normalized(components.finalizer);
  requireMatch(finalizer, /pending terminal run verification/, 'Finalizer must not invent a workflow completion time while the run is active.');
  requireMatch(finalizer, /completed_at/, 'Post-run finalization must derive the terminal boundary from server job completion timestamps.');
  requireMatch(finalizer, /'--include'[\s\S]*releaseCurrentnessVerifiedAt/, 'Post-run finalization must record a separate server-observed release-currentness readback boundary.');
  requireMatch(finalizer, /installer-manifest\.json/, 'Terminal finalizer must emit the exact verified installer manifest consumed by the site composer.');
  requireMatch(finalizer, /pending-release-readback\.json/, 'Active workflow finalization must retain honest pending readback evidence.');
  const terminalNotesPathIndex = finalizer.indexOf("const notesPath = path.join(outputRoot, 'release-notes-terminal.md')");
  const terminalNotesReceiptIndex = finalizer.indexOf("atomicWriteFileSync(notesPath, plan.notes, 'utf8');");
  const terminalPatchIndex = finalizer.indexOf("if (plan.action === 'patch')");
  if (terminalNotesPathIndex < 0 || terminalNotesReceiptIndex < terminalNotesPathIndex || terminalPatchIndex < terminalNotesReceiptIndex) {
    throw new TypeError('Terminal finalization must always retain the terminal note receipt before any conditional release patch.');
  }
  const postRunFinalizer = normalized(components.postRunFinalizer);
  requireMatch(postRunFinalizer, /dist', 'terminal-transfer'/, 'Post-run finalization must use the fixed terminal transfer directory.');
  requireMatch(postRunFinalizer, /releaseInventory\(identity\.repository, context\.tag\)/, 'Post-run finalization must independently reread the exact release record.');
  requireMatch(postRunFinalizer, /terminal-transfer-receipt\.json/, 'Post-run finalization must emit the exact transfer receipt.');
  requireMatch(postRunFinalizer, /releaseReadbackWithServerDate[\s\S]*releaseCurrentnessVerifiedAt/, 'Post-run finalization must perform a final server-dated release-currentness readback after release verification.');
  requireMatch(publisher, /Catalog record:/, 'Release notes must identify the published catalog record.');
  requireMatch(publisher, /publicPhotoUrl/, 'Release notes must link the public catalog photo without vendoring it.');
  const uploads = stepBlocks(text).filter((block) => /uses: actions\/upload-artifact@/.test(block));
  if (uploads.length !== 6) throw new TypeError('Release workflow must upload exactly six bounded product or evidence artifacts. Received ' + uploads.length + '.');
  const productUploads = uploads.filter((block) => /name: (?:windows|container)-release-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/.test(block));
  const evidenceUploads = uploads.filter((block) => /name: (?:windows|container|release|finalize)-evidence-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/.test(block));
  if (productUploads.length !== 2 || evidenceUploads.length !== 4) throw new TypeError('Release workflow artifact roles must be two success-only products and four always-collected evidence records.');
  for (const upload of productUploads) {
    requireMatch(upload, /if: \$\{\{ steps\.stage-(?:windows|container)-product\.outcome == 'success' \}\}/, 'Product transfers must run only after successful staging.');
    if (/continue-on-error: true/.test(upload)) throw new TypeError('A required product transfer must not ignore its upload failure.');
    requireMatch(upload, /if-no-files-found: error/, 'A required product transfer must fail when staged files are absent.');
    requireMatch(upload, /retention-days: 7/, 'Product transfer retention must be bounded.');
  }
  for (const upload of evidenceUploads) {
    requireMatch(upload, /if: \$\{\{ always\(\) \}\}/, 'Every artifact upload must run after earlier failures.');
    requireMatch(upload, /continue-on-error: true/, 'Artifact handling must not mask the original failure.');
    requireMatch(upload, /if-no-files-found: warn/, 'Artifact upload must safely warn when a failed build has no output.');
    requireMatch(upload, /retention-days: 7/, 'Artifact evidence retention must be bounded.');
  }
  requireCount(text, /HGE_JOB_STATUS: \$\{\{ job\.status \}\}/g, 4, 'Every job must write its server-visible status into bounded evidence.');
  return true;
}

export function validateCurrentWorkflow() {
  const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'release.yml');
  const buildPath = path.join(repositoryRoot, 'build.bat');
  const installerPath = path.join(repositoryRoot, 'build-installer.bat');
  const packagePath = path.join(repositoryRoot, 'package.json');
  const iconGeneratorPath = path.join(repositoryRoot, 'scripts', 'core', 'generate-icons.mjs');
  validateWorkflowContract(fs.readFileSync(workflowPath, 'utf8'), currentComponents());
  validateBuildScriptContract(fs.readFileSync(buildPath, 'utf8'), fs.readFileSync(installerPath, 'utf8'));
  validateIconScriptContract(JSON.parse(fs.readFileSync(packagePath, 'utf8')), fs.readFileSync(iconGeneratorPath, 'utf8'));
  return true;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  validateCurrentWorkflow();
  process.stdout.write('Release workflow and build-script contracts are complete and contain no test or lint execution.\n');
}

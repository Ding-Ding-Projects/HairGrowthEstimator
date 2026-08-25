'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

const EVIDENCE_MODE_SWITCH = '--evidence-mode';
const EVIDENCE_APP_DATA_PREFIX = '--evidence-app-data=';
const EVIDENCE_USER_DATA_PREFIX = '--evidence-user-data=';
const EVIDENCE_OWNERSHIP_MARKER = '.hair-growth-evidence-task';

const INACTIVE_RESULT = Object.freeze({ active: false, paths: null });

function pathComparisonKey(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function samePath(left, right) {
  return pathComparisonKey(left) === pathComparisonKey(right);
}

function isStrictDescendant(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function pathsOverlap(left, right) {
  return samePath(left, right) || isStrictDescendant(left, right) || isStrictDescendant(right, left);
}

function assertStringArray(argv) {
  if (!Array.isArray(argv)) throw new TypeError('Evidence arguments must be an array.');
  for (const argument of argv) {
    if (typeof argument !== 'string') throw new TypeError('Every evidence argument must be a string.');
  }
}

function switchValues(argv, prefix, displayName) {
  const values = argv.filter(argument => argument.startsWith(prefix)).map(argument => argument.slice(prefix.length));
  if (values.length !== 1) throw new Error(`${displayName} must appear exactly once in evidence mode.`);
  return values[0];
}

function normalizeAbsoluteRoot(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error(`${label} must be a nonempty absolute path.`);
  }
  if (!path.isAbsolute(value)) throw new Error(`${label} must be an absolute path.`);
  const normalized = path.resolve(value);
  if (samePath(normalized, path.parse(normalized).root)) throw new Error(`${label} must not be a filesystem root.`);
  return normalized;
}

function normalizeApprovedParents(approvedParents) {
  if (approvedParents === undefined) return Object.freeze([]);
  if (!Array.isArray(approvedParents)) throw new TypeError('Approved parents must be an array.');
  const normalized = approvedParents.map((value, index) => {
    if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || !path.isAbsolute(value)) {
      throw new Error(`Approved parent ${index + 1} must be an absolute path.`);
    }
    const result = path.resolve(value);
    if (samePath(result, path.parse(result).root)) {
      throw new Error(`Approved parent ${index + 1} must not be a filesystem root.`);
    }
    return result;
  });
  return Object.freeze(normalized);
}

function hasOwnershipMarker(root) {
  const parsed = path.parse(root);
  const remainder = root.slice(parsed.root.length);
  return remainder.split(path.sep).filter(Boolean).includes(EVIDENCE_OWNERSHIP_MARKER);
}

function assertAuthorizedRoot(root, approvedParents, label) {
  const temporaryRoot = path.resolve(os.tmpdir());
  if (hasOwnershipMarker(root) && isStrictDescendant(temporaryRoot, root)) return;
  if (approvedParents.some(parent => isStrictDescendant(parent, root))) return;
  throw new Error(`${label} must carry the exact task ownership marker segment beneath the operating-system temporary root or be a strict descendant of an approved parent.`);
}

function assertNoReparseComponents(root, fsApi, label) {
  const parsed = path.parse(root);
  const segments = root.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (const segment of segments) {
    current = path.join(current, segment);
    let stats;
    try {
      stats = fsApi.lstatSync(current);
    } catch (error) {
      if (error && error.code === 'ENOENT') return;
      throw new Error(`${label} could not be inspected safely: ${error && error.code ? error.code : 'unknown filesystem error'}.`);
    }
    const isReparse = (typeof stats.isSymbolicLink === 'function' && stats.isSymbolicLink())
      || (typeof stats.isReparsePoint === 'function' && stats.isReparsePoint());
    if (isReparse) throw new Error(`${label} must not contain a symlink or reparse component.`);
  }
}

function assertEmptyOrMissingDirectory(root, fsApi, label) {
  let stats;
  try {
    stats = fsApi.lstatSync(root);
  } catch (error) {
    if (error && error.code === 'ENOENT') return;
    throw new Error(`${label} could not be inspected safely: ${error && error.code ? error.code : 'unknown filesystem error'}.`);
  }
  if (typeof stats.isDirectory !== 'function' || !stats.isDirectory()) {
    throw new Error(`${label} must be a directory when it already exists.`);
  }
  let entries;
  try {
    entries = fsApi.readdirSync(root);
  } catch (error) {
    throw new Error(`${label} could not be read safely: ${error && error.code ? error.code : 'unknown filesystem error'}.`);
  }
  if (!Array.isArray(entries) || entries.length !== 0) throw new Error(`${label} must be empty when it already exists.`);
}

function validateEvidencePathArguments(argv, options = {}) {
  if (!Array.isArray(argv)) throw new TypeError('Evidence arguments must be an array.');
  const modeCount = argv.filter(argument => argument === EVIDENCE_MODE_SWITCH).length;
  if (modeCount === 0) return INACTIVE_RESULT;
  if (modeCount !== 1) throw new Error('The evidence mode switch must appear exactly once.');

  assertStringArray(argv);
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Evidence path options must be an object.');
  }
  const fsApi = options.fs === undefined ? fs : options.fs;
  if (!fsApi || typeof fsApi.lstatSync !== 'function' || typeof fsApi.readdirSync !== 'function') {
    throw new TypeError('The filesystem adapter must provide lstatSync and readdirSync.');
  }

  const appData = normalizeAbsoluteRoot(
    switchValues(argv, EVIDENCE_APP_DATA_PREFIX, '--evidence-app-data'),
    'Evidence app-data root'
  );
  const userData = normalizeAbsoluteRoot(
    switchValues(argv, EVIDENCE_USER_DATA_PREFIX, '--evidence-user-data'),
    'Evidence user-data root'
  );
  const approvedParents = normalizeApprovedParents(options.approvedParents);

  assertAuthorizedRoot(appData, approvedParents, 'Evidence app-data root');
  assertAuthorizedRoot(userData, approvedParents, 'Evidence user-data root');
  if (pathsOverlap(appData, userData)) throw new Error('Evidence app-data and user-data roots must be distinct and must not overlap.');

  assertNoReparseComponents(appData, fsApi, 'Evidence app-data root');
  assertNoReparseComponents(userData, fsApi, 'Evidence user-data root');
  assertEmptyOrMissingDirectory(appData, fsApi, 'Evidence app-data root');
  assertEmptyOrMissingDirectory(userData, fsApi, 'Evidence user-data root');

  const paths = Object.freeze({ appData, userData });
  return Object.freeze({ active: true, paths });
}

function pathDigest(value) {
  let canonical = value.normalize('NFC').replace(/\\/g, '/');
  if (process.platform === 'win32') canonical = canonical.toLowerCase();
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function createEvidenceIsolationReceipt(validation) {
  if (!validation || validation.active !== true || !validation.paths) {
    throw new Error('An active evidence-path validation is required to create a receipt.');
  }
  const appData = normalizeAbsoluteRoot(validation.paths.appData, 'Validated evidence app-data root');
  const userData = normalizeAbsoluteRoot(validation.paths.userData, 'Validated evidence user-data root');
  if (appData !== validation.paths.appData || userData !== validation.paths.userData || pathsOverlap(appData, userData)) {
    throw new Error('An active evidence-path validation with normalized distinct roots is required to create a receipt.');
  }
  return Object.freeze({
    schemaVersion: 1,
    mode: true,
    appDataPathSha256: pathDigest(appData),
    userDataPathSha256: pathDigest(userData),
    distinct: true,
    initializedBeforeReady: true
  });
}

module.exports = Object.freeze({
  EVIDENCE_MODE_SWITCH,
  EVIDENCE_APP_DATA_PREFIX,
  EVIDENCE_USER_DATA_PREFIX,
  EVIDENCE_OWNERSHIP_MARKER,
  validateEvidencePathArguments,
  createEvidenceIsolationReceipt
});

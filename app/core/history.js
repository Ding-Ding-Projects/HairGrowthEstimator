'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { isDeepStrictEqual, promisify } = require('node:util');
const { atomicWriteJson } = require('./atomic');

const execFileAsync = promisify(execFile);
const MAX_HISTORY_ENTRIES = 1000;
const MIN_RETENTION_ENTRIES = 2;
const MAX_QUERY_LENGTH = 200;
const MAX_LABEL_LENGTH = 80;
const OMITTED_VALUE = '[omitted from local history]';
const EXPORT_OMISSIONS = Object.freeze([
  'credentials',
  'private vocabulary data',
  'local-only binary assets'
]);
const HISTORY_ACTIONS = new Set([
  'created',
  'deleted',
  'restored',
  'imported',
  'labeled',
  'pruned',
  'settings-changed',
  'updated'
]);

const SENSITIVE_KEYS = new Set([
  'accesstoken',
  'apikey',
  'authorization',
  'cookie',
  'credential',
  'credentials',
  'keyfile',
  'otp',
  'passcode',
  'password',
  'pin',
  'privatekey',
  'recoverycode',
  'refreshtoken',
  'secret',
  'sessiontoken',
  'token',
  'totp'
]);

function normalizedKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSensitiveKey(key) {
  const normalized = normalizedKey(key);
  return SENSITIVE_KEYS.has(normalized)
    || normalized.endsWith('token')
    || normalized.endsWith('password')
    || normalized.endsWith('secret')
    || normalized.endsWith('credential');
}

function isVocabularyKey(key) {
  return normalizedKey(key).includes('vocabulary');
}

function isLocalBinaryKey(key) {
  const normalized = normalizedKey(key);
  return normalized.endsWith('dataurl')
    || normalized.endsWith('imagebytes')
    || normalized.endsWith('binarydata')
    || normalized.endsWith('filecontents')
    || normalized.endsWith('attachmentdata');
}

function vocabularySummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { loaded: Boolean(value), cacheVersion: null };
  }
  const version = Number(value.cacheVersion);
  return {
    loaded: Boolean(value.loaded),
    cacheVersion: Number.isSafeInteger(version) && version >= 0 ? version : null
  };
}

function redactHistoryValue(value, key = '', seen = new WeakSet(), depth = 0) {
  if (isSensitiveKey(key)) return OMITTED_VALUE;
  if (isLocalBinaryKey(key)) return OMITTED_VALUE;
  if (isVocabularyKey(key)) return vocabularySummary(value);
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'object' || depth >= 20) return OMITTED_VALUE;
  if (seen.has(value)) return OMITTED_VALUE;
  seen.add(value);

  if (Array.isArray(value)) {
    const result = value.slice(0, 10000).map((item) => redactHistoryValue(item, '', seen, depth + 1));
    seen.delete(value);
    return result;
  }

  const result = {};
  for (const [childKey, childValue] of Object.entries(value).slice(0, 10000)) {
    if (childKey === '__proto__' || childKey === 'prototype' || childKey === 'constructor') continue;
    result[childKey] = redactHistoryValue(childValue, childKey, seen, depth + 1);
  }
  seen.delete(value);
  return result;
}

function sanitizeEvent(event) {
  const candidate = String(event || 'State updated')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  const subjects = {
    created: 'Created local history state',
    deleted: 'Deleted local history state',
    restored: 'Restored local history revision',
    imported: 'Imported local history state',
    labeled: 'Labeled local history revision',
    pruned: 'Pruned local history retention',
    'settings-changed': 'Changed local history settings',
    updated: 'Updated local history state'
  };
  return subjects[actionFromEvent(candidate)] || subjects.updated;
}

function actionFromEvent(event) {
  const text = String(event || '').trim().toLowerCase();
  if (/settings? changed/.test(text) || /^changed\b.*\bsettings?\b/.test(text)) return 'settings-changed';
  if (/\b(?:delete|deleted|remove|removed|discard|discarded)\b/.test(text)) return 'deleted';
  if (/^(?:restore|restored)\b/.test(text)) return 'restored';
  if (/^(?:fetch|fetched|import|imported)\b/.test(text)) return 'imported';
  if (/^(?:label|labeled)\b/.test(text)) return 'labeled';
  if (/^(?:prune|pruned)\b/.test(text)) return 'pruned';
  if (/^(?:create|created|add|added|initialize|initialized|record|recorded)\b/.test(text)) return 'created';
  return 'updated';
}

function normalizeStoredAction(action, event) {
  const normalized = String(action || '').trim().toLowerCase();
  return HISTORY_ACTIONS.has(normalized) ? normalized : actionFromEvent(event);
}

function normalizeOptions(options) {
  if (options === undefined) return {};
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('History options must be an object.');
  }
  return options;
}

function normalizeLimit(value, fallback = 200) {
  const number = Number(value === undefined ? fallback : value);
  if (!Number.isSafeInteger(number) || number < 1 || number > MAX_HISTORY_ENTRIES) {
    throw new TypeError(`History limit must be an integer from 1 to ${MAX_HISTORY_ENTRIES}.`);
  }
  return number;
}

function normalizeDateBoundary(value, endOfDay) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? `${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : text;
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) throw new TypeError('History date filter is invalid.');
  return timestamp;
}

function normalizeActions(actions) {
  if (actions === undefined || actions === null) return null;
  if (!Array.isArray(actions)) throw new TypeError('History actions must be an array.');
  const normalized = new Set(actions.map((action) => String(action).trim().toLowerCase()).filter(Boolean));
  return normalized.size ? normalized : null;
}

function normalizeQuery(query) {
  const normalized = String(query || '').trim().toLocaleLowerCase('en-US');
  if (normalized.length > MAX_QUERY_LENGTH) {
    throw new TypeError(`History search must be at most ${MAX_QUERY_LENGTH} characters.`);
  }
  return normalized;
}

function normalizeLabel(label) {
  const normalized = String(label || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length > MAX_LABEL_LENGTH) {
    throw new TypeError(`History label must be at most ${MAX_LABEL_LENGTH} characters.`);
  }
  if (/(?:token|secret|password|credential|private vocabulary)/i.test(normalized)) {
    throw new TypeError('History labels cannot contain sensitive data.');
  }
  return normalized;
}

function escapeJsonPointer(value) {
  return String(value).replace(/~/g, '~0').replace(/\//g, '~1');
}

function diffValues(before, after, pointer = '') {
  if (isDeepStrictEqual(before, after)) return [];
  const beforeObject = before && typeof before === 'object' && !Array.isArray(before);
  const afterObject = after && typeof after === 'object' && !Array.isArray(after);
  if (beforeObject && afterObject) {
    const changes = [];
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) {
      const pathName = `${pointer}/${escapeJsonPointer(key)}`;
      if (!Object.hasOwn(before, key)) {
        changes.push({ path: pathName, type: 'added', before: undefined, after: after[key] });
      } else if (!Object.hasOwn(after, key)) {
        changes.push({ path: pathName, type: 'removed', before: before[key], after: undefined });
      } else {
        changes.push(...diffValues(before[key], after[key], pathName));
      }
    }
    return changes;
  }
  return [{ path: pointer || '/', type: 'changed', before, after }];
}

class LocalHistory {
  constructor(directory, options = {}) {
    this.directory = path.resolve(directory);
    this.authenticate = options.authenticate;
    this.now = typeof options.now === 'function' ? options.now : () => new Date();
    this.queue = Promise.resolve();
  }

  async git(args, options = {}) {
    const result = await execFileAsync('git', args, {
      cwd: this.directory,
      encoding: 'utf8',
      windowsHide: true,
      timeout: options.timeout || 15000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, ...options.env, GIT_TERMINAL_PROMPT: '0' }
    });
    return result.stdout.trim();
  }

  enqueue(operation) {
    const pending = this.queue.then(operation);
    this.queue = pending.catch(() => {});
    return pending;
  }

  async authorize(operation, credential) {
    if (typeof this.authenticate !== 'function') {
      const error = new Error('History authentication is required.');
      error.code = 'HISTORY_AUTH_REQUIRED';
      throw error;
    }
    let accepted = false;
    try {
      accepted = await this.authenticate({ operation, credential });
    } catch {
      accepted = false;
    }
    if (accepted !== true) {
      const error = new Error('History authentication was not accepted.');
      error.code = 'HISTORY_AUTH_REJECTED';
      throw error;
    }
  }

  async ensure() {
    await fs.mkdir(this.directory, { recursive: true });
    try {
      await this.git(['rev-parse', '--git-dir']);
    } catch {
      await this.git(['init', '-b', 'main']);
      await this.git(['config', 'user.name', 'Hair Growth Estimator']);
      await this.git(['config', 'user.email', 'local-history@invalid']);
      await atomicWriteJson(path.join(this.directory, 'snapshot.json'), {
        schemaVersion: 2,
        action: 'created',
        event: 'History initialized',
        recordedAt: this.now().toISOString(),
        state: null
      });
      await this.git(['add', '--', 'snapshot.json']);
      await this.git(['commit', '-m', 'Initialize local version history']);
    }
  }

  async flush() {
    await this.queue;
  }

  async assertCommit(commit) {
    const normalized = String(commit || '').toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(normalized)) throw new TypeError('History commit is invalid.');
    try {
      await this.git(['cat-file', '-e', `${normalized}^{commit}`]);
      await this.git(['merge-base', '--is-ancestor', normalized, 'HEAD']);
    } catch {
      throw new Error('History revision is unavailable.');
    }
    return normalized;
  }

  async readSnapshotUnchecked(commit) {
    try {
      const json = await this.git(['show', `${commit}:snapshot.json`]);
      const snapshot = JSON.parse(json);
      const recordedTimestamp = Date.parse(String(snapshot.recordedAt || ''));
      const restoredFrom = /^[0-9a-f]{40}$/.test(String(snapshot.restoredFrom || ''))
        ? String(snapshot.restoredFrom)
        : '';
      return {
        schemaVersion: Number(snapshot.schemaVersion) || 1,
        action: normalizeStoredAction(snapshot.action, snapshot.event),
        event: sanitizeEvent(snapshot.event),
        recordedAt: Number.isFinite(recordedTimestamp) ? new Date(recordedTimestamp).toISOString() : '',
        state: redactHistoryValue(snapshot.state),
        ...(restoredFrom ? { restoredFrom } : {})
      };
    } catch {
      throw new Error('History revision is unavailable.');
    }
  }

  async loadLabels() {
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(this.directory, 'labels.json'), 'utf8'));
      if (!parsed || typeof parsed !== 'object' || !parsed.labels || typeof parsed.labels !== 'object') return {};
      const labels = {};
      for (const [commit, label] of Object.entries(parsed.labels)) {
        if (/^[0-9a-f]{40}$/.test(commit)) labels[commit] = normalizeLabel(label);
      }
      return labels;
    } catch (error) {
      if (error && error.code === 'ENOENT') return {};
      throw new Error('History labels are unavailable.');
    }
  }

  async saveLabels(labels) {
    await atomicWriteJson(path.join(this.directory, 'labels.json'), {
      schemaVersion: 1,
      labels
    }, { maxBytes: 256 * 1024 });
  }

  async commitSnapshot(snapshot, subject) {
    await atomicWriteJson(path.join(this.directory, 'snapshot.json'), snapshot, { maxBytes: 1024 * 1024 });
    await this.git(['add', '--', 'snapshot.json']);
    const changed = await this.git(['diff', '--cached', '--name-only']);
    if (!changed) return { recorded: false, reason: 'unchanged' };
    await this.git(['commit', '-m', sanitizeEvent(subject)]);
    return { recorded: true, commit: await this.git(['rev-parse', 'HEAD']) };
  }

  record(event, state) {
    const safeEvent = sanitizeEvent(event);
    const safeState = redactHistoryValue(state);
    const action = actionFromEvent(safeEvent);
    return this.enqueue(async () => {
      await this.ensure();
      const current = await this.readSnapshotUnchecked(await this.git(['rev-parse', 'HEAD']));
      if (action !== 'restored' && isDeepStrictEqual(current.state, safeState)) return { recorded: false, reason: 'unchanged' };
      const snapshot = {
        schemaVersion: 2,
        action,
        event: safeEvent,
        recordedAt: this.now().toISOString(),
        state: safeState
      };
      return this.commitSnapshot(snapshot, safeEvent);
    });
  }

  async historyEntries(options = {}) {
    const settings = normalizeOptions(options);
    const limit = normalizeLimit(settings.limit);
    const from = normalizeDateBoundary(settings.from, false);
    const to = normalizeDateBoundary(settings.to, true);
    if (from !== null && to !== null && from > to) {
      throw new TypeError('History start date must not be after the end date.');
    }
    const actions = normalizeActions(settings.actions);
    const query = normalizeQuery(settings.query);
    const output = await this.git([
      'log',
      `-${MAX_HISTORY_ENTRIES}`,
      '--date=iso-strict',
      '--format=%H%x1f%aI%x1f%s'
    ]);
    if (!output) return [];
    const labels = await this.loadLabels();
    const results = [];
    for (const line of output.split(/\r?\n/)) {
      const [commit, date, subject] = line.split('\x1f');
      const timestamp = Date.parse(date);
      if (from !== null && timestamp < from) continue;
      if (to !== null && timestamp > to) continue;
      const snapshot = await this.readSnapshotUnchecked(commit);
      const action = actionFromEvent(subject || snapshot.event);
      if (actions && !actions.has(action)) continue;
      const label = labels[commit] || '';
      const safeSubject = sanitizeEvent(subject);
      if (query) {
        const searchable = `${safeSubject}\n${action}\n${label}\n${JSON.stringify(snapshot.state)}`
          .toLocaleLowerCase('en-US');
        if (!searchable.includes(query)) continue;
      }
      results.push({
        commit,
        date,
        subject: safeSubject,
        action,
        label,
        ...(settings.includeState ? { state: snapshot.state } : {})
      });
      if (results.length >= limit) break;
    }
    return results;
  }

  async list(options = {}) {
    const settings = normalizeOptions(options);
    await this.authorize('list', settings.credential);
    return this.enqueue(async () => {
      await this.ensure();
      return this.historyEntries(settings);
    });
  }

  async read(commit, options = {}) {
    const settings = normalizeOptions(options);
    await this.authorize('read', settings.credential);
    return this.enqueue(async () => {
      await this.ensure();
      const normalized = await this.assertCommit(commit);
      return this.readSnapshotUnchecked(normalized);
    });
  }

  async diff(fromCommit, toCommit, options = {}) {
    const settings = normalizeOptions(options);
    await this.authorize('diff', settings.credential);
    return this.enqueue(async () => {
      await this.ensure();
      const from = await this.assertCommit(fromCommit);
      const to = await this.assertCommit(toCommit);
      const before = await this.readSnapshotUnchecked(from);
      const after = await this.readSnapshotUnchecked(to);
      return {
        fromCommit: from,
        toCommit: to,
        changes: diffValues(before.state, after.state)
      };
    });
  }

  async restore(commit, options = {}) {
    const settings = normalizeOptions(options);
    await this.authorize('restore', settings.credential);
    return this.enqueue(async () => {
      await this.ensure();
      const restoredFrom = await this.assertCommit(commit);
      const source = await this.readSnapshotUnchecked(restoredFrom);
      if (!source.state || typeof source.state !== 'object' || Array.isArray(source.state)) {
        throw new Error('History revision does not contain restorable application state.');
      }
      const event = 'Restored local history revision';
      const snapshot = {
        schemaVersion: 2,
        action: 'restored',
        event,
        recordedAt: this.now().toISOString(),
        restoredFrom,
        state: redactHistoryValue(source.state)
      };
      const recorded = await this.commitSnapshot(snapshot, event);
      return {
        ...recorded,
        restoredFrom,
        state: redactHistoryValue(source.state)
      };
    });
  }

  async label(commit, label, options = {}) {
    const settings = normalizeOptions(options);
    await this.authorize('label', settings.credential);
    const safeLabel = normalizeLabel(label);
    return this.enqueue(async () => {
      await this.ensure();
      const normalized = await this.assertCommit(commit);
      const labels = await this.loadLabels();
      if (safeLabel) labels[normalized] = safeLabel;
      else delete labels[normalized];
      await this.saveLabels(labels);
      await this.git(['add', '--', 'labels.json']);
      const changed = await this.git(['diff', '--cached', '--name-only']);
      if (changed) await this.git(['commit', '-m', safeLabel ? 'Label local history revision' : 'Remove local history label']);
      return {
        commit: normalized,
        label: safeLabel,
        recorded: Boolean(changed),
        ...(changed ? { metadataCommit: await this.git(['rev-parse', 'HEAD']) } : {})
      };
    });
  }

  async exportRedacted(options = {}) {
    const settings = normalizeOptions(options);
    await this.authorize('export', settings.credential);
    return this.enqueue(async () => {
      await this.ensure();
      const entries = await this.historyEntries({
        ...settings,
        limit: settings.limit === undefined ? MAX_HISTORY_ENTRIES : settings.limit,
        includeState: true
      });
      return {
        schemaVersion: 1,
        generatedAt: this.now().toISOString(),
        omitted: [...EXPORT_OMISSIONS],
        entries: redactHistoryValue(entries)
      };
    });
  }

  async prune(options = {}) {
    const settings = normalizeOptions(options);
    await this.authorize('prune', settings.credential);
    const maxEntries = normalizeLimit(settings.maxEntries, 200);
    if (maxEntries < MIN_RETENTION_ENTRIES) {
      throw new TypeError(`History retention must keep at least ${MIN_RETENTION_ENTRIES} entries.`);
    }
    return this.enqueue(async () => {
      await this.ensure();
      const status = await this.git(['status', '--porcelain']);
      if (status) throw new Error('History retention cannot run while the local history store has pending changes.');
      const log = await this.git(['log', '--reverse', '--date=iso-strict', '--format=%H%x1f%aI%x1f%s']);
      const entries = log ? log.split(/\r?\n/).map((line) => {
        const [commit, date, subject] = line.split('\x1f');
        return { commit, date, subject: sanitizeEvent(subject) };
      }) : [];
      const totalBefore = entries.length;
      if (totalBefore <= maxEntries) {
        return { pruned: 0, totalBefore, totalAfter: totalBefore, maxEntries };
      }

      const originalHead = await this.git(['rev-parse', 'HEAD']);
      const currentBranch = await this.git(['symbolic-ref', '--short', 'HEAD']);
      const retained = entries.slice(-(maxEntries - 1));
      const rewritten = new Map();
      let parent = '';
      for (const entry of retained) {
        const tree = await this.git(['show', '-s', '--format=%T', entry.commit]);
        const args = ['commit-tree', tree, '-m', entry.subject];
        if (parent) args.push('-p', parent);
        const next = await this.git(args, {
          env: {
            GIT_AUTHOR_DATE: entry.date,
            GIT_COMMITTER_DATE: entry.date
          }
        });
        rewritten.set(entry.commit, next);
        parent = next;
      }
      await this.git(['update-ref', `refs/heads/${currentBranch}`, parent, originalHead]);

      const oldLabels = await this.loadLabels();
      const labels = {};
      for (const [oldCommit, label] of Object.entries(oldLabels)) {
        const newCommit = rewritten.get(oldCommit);
        if (newCommit) labels[newCommit] = label;
      }
      await this.saveLabels(labels);
      await atomicWriteJson(path.join(this.directory, 'retention.json'), {
        schemaVersion: 1,
        maxEntries,
        prunedAt: this.now().toISOString()
      }, { maxBytes: 64 * 1024 });
      await this.git(['add', '--', 'labels.json', 'retention.json']);
      await this.git(['commit', '-m', 'Prune local history retention']);
      await this.git(['reflog', 'expire', '--expire=now', '--all']);
      await this.git(['gc', '--prune=now'], { timeout: 60000 });
      const totalAfter = Number(await this.git(['rev-list', '--count', 'HEAD']));
      return {
        pruned: totalBefore - totalAfter,
        totalBefore,
        totalAfter,
        maxEntries
      };
    });
  }
}

module.exports = { LocalHistory };

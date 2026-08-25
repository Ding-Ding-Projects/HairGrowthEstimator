(function installHairGrowthStateContract(root) {
  'use strict';

  const STORAGE_ENVELOPE_SCHEMA = 1;
  const LOCK_DATABASE = 'hair-growth-estimator-coordination-v1';
  const LOCK_STORE = 'exclusive-locks';
  const DELIMITED_COLUMNS = Object.freeze([
    'schemaVersion',
    'exportedAt',
    'encoding',
    'lineEndings',
    'representation',
    'privacy',
    'recordType',
    'recordId',
    'path',
    'valueJson'
  ]);

  function cloneJson(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function todayDateString(now = new Date()) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function isValidDateOnly(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function validateDateNotFuture(value, today = todayDateString()) {
    if (!isValidDateOnly(value)) return { valid: false, message: 'Enter a valid calendar date.' };
    if (value > today) return { valid: false, message: 'Choose today or an earlier date.' };
    return { valid: true, message: '' };
  }

  function finiteNonNegative(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }

  function compareHaircuts(left, right) {
    const dateOrder = String(right.date || '').localeCompare(String(left.date || ''));
    if (dateOrder) return dateOrder;
    const updateOrder = String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
    if (updateOrder) return updateOrder;
    return String(right.id || '').localeCompare(String(left.id || ''));
  }

  function reconcileBaseline(estimator, haircuts, today = todayDateString()) {
    const current = estimator && typeof estimator === 'object' ? estimator : {};
    const manualBaselineDate = current.manualBaselineDate || current.baselineDate || today;
    const manualBaselineLengthCm = finiteNonNegative(
      current.manualBaselineLengthCm,
      finiteNonNegative(current.baselineLengthCm, 0)
    );
    const records = Array.isArray(haircuts) ? haircuts : [];
    const ignoredFutureIds = records
      .filter((record) => isValidDateOnly(record?.date) && record.date > today)
      .map((record) => String(record.id || ''));
    const eligible = records
      .filter((record) => validateDateNotFuture(record?.date, today).valid)
      .filter((record) => Number.isFinite(Number(record?.postCutLengthCm)) && Number(record.postCutLengthCm) >= 0)
      .sort(compareHaircuts);
    const newest = eligible[0];
    const manualValidation = validateDateNotFuture(manualBaselineDate, today);
    const source = newest
      ? {
          kind: 'haircut',
          id: String(newest.id || ''),
          date: newest.date,
          lengthCm: Number(newest.postCutLengthCm),
          valid: true,
          message: ''
        }
      : {
          kind: 'manual',
          id: null,
          date: manualBaselineDate,
          lengthCm: manualBaselineLengthCm,
          valid: manualValidation.valid,
          message: manualValidation.message
        };
    return {
      estimator: {
        ...current,
        manualBaselineDate,
        manualBaselineLengthCm,
        baselineDate: source.date,
        baselineLengthCm: source.lengthCm
      },
      source,
      ignoredFutureIds
    };
  }

  function decodeStateEnvelope(rawValue, fallbackState) {
    let parsed = rawValue;
    try {
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    } catch {
      parsed = null;
    }
    if (
      parsed
      && parsed.storageEnvelopeSchema === STORAGE_ENVELOPE_SCHEMA
      && Number.isSafeInteger(parsed.revision)
      && parsed.revision >= 0
      && typeof parsed.writerId === 'string'
      && parsed.writerId.length > 0
      && parsed.state
      && typeof parsed.state === 'object'
    ) {
      return {
        storageEnvelopeSchema: STORAGE_ENVELOPE_SCHEMA,
        revision: parsed.revision,
        writerId: parsed.writerId,
        writtenAt: typeof parsed.writtenAt === 'string' ? parsed.writtenAt : null,
        state: cloneJson(parsed.state),
        legacy: false
      };
    }
    if (parsed && parsed.schemaVersion === 1) {
      return {
        storageEnvelopeSchema: STORAGE_ENVELOPE_SCHEMA,
        revision: 0,
        writerId: 'legacy-unversioned-state',
        writtenAt: null,
        state: cloneJson(parsed),
        legacy: true
      };
    }
    return {
      storageEnvelopeSchema: STORAGE_ENVELOPE_SCHEMA,
      revision: 0,
      writerId: 'empty-state',
      writtenAt: null,
      state: cloneJson(fallbackState),
      legacy: false
    };
  }

  function createStateEnvelope({ revision, writerId, writtenAt, state }) {
    if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Revision must be a positive safe integer.');
    if (typeof writerId !== 'string' || !writerId) throw new Error('Writer identity is required.');
    return {
      storageEnvelopeSchema: STORAGE_ENVELOPE_SCHEMA,
      revision,
      writerId,
      writtenAt,
      state: cloneJson(state)
    };
  }

  function withIndexedDbLock(indexedDb, lockName, callback) {
    return new Promise((resolve, reject) => {
      let request;
      try {
        request = indexedDb.open(LOCK_DATABASE, 1);
      } catch (error) {
        reject(error);
        return;
      }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(LOCK_STORE)) database.createObjectStore(LOCK_STORE);
      };
      request.onerror = () => reject(request.error || new Error('The browser transaction database could not be opened.'));
      request.onsuccess = () => {
        const database = request.result;
        let transaction;
        let callbackResult;
        let callbackError;
        try {
          transaction = database.transaction(LOCK_STORE, 'readwrite');
          const store = transaction.objectStore(LOCK_STORE);
          const claim = store.get(lockName);
          claim.onerror = () => {
            callbackError = claim.error || new Error('The browser transaction lock could not be read.');
            try { transaction.abort(); } catch {}
          };
          claim.onsuccess = () => {
            try {
              callbackResult = callback();
              if (callbackResult && typeof callbackResult.then === 'function') throw new Error('IndexedDB lock callbacks must be synchronous.');
              store.put({ touchedAt: new Date().toISOString() }, lockName);
            } catch (error) {
              callbackError = error;
              try { transaction.abort(); } catch {}
            }
          };
        } catch (error) {
          database.close();
          reject(error);
          return;
        }
        transaction.oncomplete = () => {
          database.close();
          if (callbackError) reject(callbackError);
          else resolve(callbackResult);
        };
        transaction.onabort = () => {
          database.close();
          reject(callbackError || transaction.error || new Error('The browser transaction lock was aborted.'));
        };
        transaction.onerror = () => {
          callbackError ||= transaction.error || new Error('The browser transaction lock failed.');
        };
      };
    });
  }

  function withExclusiveStorageLock({ navigatorLocks, indexedDB, lockName }, callback) {
    if (navigatorLocks && typeof navigatorLocks.request === 'function') {
      return navigatorLocks.request(lockName, { mode: 'exclusive' }, callback);
    }
    if (indexedDB && typeof indexedDB.open === 'function') return withIndexedDbLock(indexedDB, lockName, callback);
    return Promise.resolve({
      ok: false,
      reason: 'locking-unavailable',
      message: 'This browser cannot provide the exclusive transaction route required for a safe write.'
    });
  }

  function createStateCoordinator({ storage, stateKey, lockName, writerId, navigatorLocks, indexedDB, validateEnvelope = null, now = () => new Date().toISOString() }) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new Error('A browser storage adapter is required.');
    function read(fallbackState) {
      const rawValue = storage.getItem(stateKey);
      return typeof validateEnvelope === 'function' ? validateEnvelope(rawValue, fallbackState) : decodeStateEnvelope(rawValue, fallbackState);
    }
    async function commit({ baseRevision, state }) {
      try {
        return await withExclusiveStorageLock({ navigatorLocks, indexedDB, lockName }, () => {
          const current = read(state);
          if (current.revision !== baseRevision) return { ok: false, reason: 'stale-write', current };
          const envelope = createStateEnvelope({
            revision: current.revision + 1,
            writerId,
            writtenAt: now(),
            state
          });
          storage.setItem(stateKey, JSON.stringify(envelope));
          const verified = read(state);
          if (verified.revision !== envelope.revision || verified.writerId !== writerId) {
            return { ok: false, reason: 'write-verification-failed', current: verified };
          }
          return {
            ok: true,
            revision: envelope.revision,
            writerId,
            writtenAt: envelope.writtenAt,
            envelope
          };
        });
      } catch (error) {
        return { ok: false, reason: 'transaction-failed', message: error?.message || String(error) };
      }
    }
    return Object.freeze({ read, commit, writerId });
  }

  function pointerSegment(value) {
    return String(value).replace(/~/g, '~0').replace(/\//g, '~1');
  }

  function normalizeExportRows(record) {
    const schemaVersion = String(record.schemaVersion ?? '');
    const exportedAt = String(record.exportedAt ?? '');
    const encoding = String(record.encoding || 'UTF-8');
    const representation = 'Normalized long-form JSON Pointer rows. valueJson preserves scalar and empty-container JSON types.';
    const privacy = `Redacted export. Omitted: ${(Array.isArray(record.omissions) ? record.omissions : []).join('; ') || 'None declared'}.`;
    const rows = [];

    function walk(value, segments, recordType = 'metadata', recordId = 'export') {
      let nextType = recordType;
      let nextId = recordId;
      if (segments[0] === 'state' && segments[1]) nextType = segments[1];
      if (value && typeof value === 'object' && !Array.isArray(value) && value.id !== undefined) nextId = String(value.id);
      const path = `/${segments.map(pointerSegment).join('/')}`;
      if (Array.isArray(value)) {
        if (!value.length) {
          rows.push({ schemaVersion, exportedAt, encoding, lineEndings: 'LF', representation, privacy, recordType: nextType, recordId: nextId, path, valueJson: '[]' });
          return;
        }
        value.forEach((child, index) => walk(child, [...segments, index], nextType, child && typeof child === 'object' && child.id !== undefined ? String(child.id) : nextId));
        return;
      }
      if (value && typeof value === 'object') {
        const entries = Object.entries(value);
        if (!entries.length) {
          rows.push({ schemaVersion, exportedAt, encoding, lineEndings: 'LF', representation, privacy, recordType: nextType, recordId: nextId, path, valueJson: '{}' });
          return;
        }
        for (const [key, child] of entries) walk(child, [...segments, key], nextType, nextId);
        return;
      }
      rows.push({
        schemaVersion,
        exportedAt,
        encoding,
        lineEndings: 'LF',
        representation,
        privacy,
        recordType: nextType,
        recordId: nextId,
        path,
        valueJson: JSON.stringify(value === undefined ? null : value)
      });
    }

    for (const [key, value] of Object.entries(record)) walk(value, [key]);
    return rows;
  }

  function csvCell(value) {
    return `"${String(value).replace(/"/g, '""')}"`;
  }

  function tsvCell(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  }

  function serializeDelimitedExport(record, format) {
    if (format !== 'CSV' && format !== 'TSV') throw new Error('Delimited export format must be CSV or TSV.');
    const rows = normalizeExportRows(record);
    const separator = format === 'CSV' ? ',' : '\t';
    const encode = format === 'CSV' ? csvCell : tsvCell;
    const header = DELIMITED_COLUMNS.join(separator);
    const body = rows.map((row) => DELIMITED_COLUMNS.map((column) => encode(row[column])).join(separator)).join('\n');
    return {
      text: `${header}\n${body}\n`,
      extension: format.toLowerCase(),
      type: format === 'CSV' ? 'text/csv' : 'text/tab-separated-values',
      rows
    };
  }

  root.HairGrowthStateContract = Object.freeze({
    STORAGE_ENVELOPE_SCHEMA,
    createStateCoordinator,
    createStateEnvelope,
    decodeStateEnvelope,
    normalizeExportRows,
    reconcileBaseline,
    serializeDelimitedExport,
    todayDateString,
    validateDateNotFuture,
    withIndexedDbLock
  });
}(typeof globalThis === 'object' ? globalThis : window));

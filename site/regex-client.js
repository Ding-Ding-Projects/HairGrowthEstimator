(function installHairGrowthRegexClient(root) {
  'use strict';

  function createRegexWorkerClient({ WorkerCtor, workerUrl, timeoutMs = 150, maxConcurrent = 2, maxQueue = 16 } = {}) {
    if (typeof WorkerCtor !== 'function') throw new Error('Disposable Worker support is unavailable in this browser.');
    if (typeof workerUrl !== 'string' || !workerUrl) throw new Error('A local regex worker URL is required.');
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 25 || timeoutMs > 2000) throw new Error('Regex deadline must be 25 to 2,000 milliseconds.');
    if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 4) throw new Error('Regex concurrency must be 1 to 4.');
    if (!Number.isSafeInteger(maxQueue) || maxQueue < 1 || maxQueue > 64) throw new Error('Regex queue length must be 1 to 64.');

    const queue = [];
    let active = 0;
    let sequence = 0;

    function removeQueued(item, reason) {
      const index = queue.indexOf(item);
      if (index >= 0) queue.splice(index, 1);
      item.signal?.removeEventListener('abort', item.abortQueued);
      item.reject(reason);
    }

    function pump() {
      while (active < maxConcurrent && queue.length) {
        const item = queue.shift();
        if (item.signal?.aborted) {
          item.reject(new DOMException('Regex operation was cancelled.', 'AbortError'));
          continue;
        }
        active += 1;
        let worker;
        try { worker = new WorkerCtor(workerUrl); }
        catch (error) {
          active -= 1;
          item.reject(new Error(`The disposable regex worker could not be created: ${error?.message || String(error)}`));
          continue;
        }
        const id = ++sequence;
        let settled = false;
        const cleanup = () => {
          clearTimeout(timer);
          item.signal?.removeEventListener('abort', abort);
          worker.terminate();
          active -= 1;
          pump();
        };
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          cleanup();
          callback(value);
        };
        const abort = () => finish(item.reject, new DOMException('Regex operation was cancelled.', 'AbortError'));
        const timer = setTimeout(() => finish(item.reject, new Error(`Regex evaluation exceeded the ${timeoutMs} ms deadline.`)), timeoutMs);
        item.signal?.addEventListener('abort', abort, { once: true });
        worker.onerror = () => finish(item.reject, new Error('The disposable regex worker could not complete the operation.'));
        worker.onmessage = (event) => {
          if (event.data?.id !== id) return;
          if (!event.data.ok) finish(item.reject, new Error(event.data.error || 'Regex evaluation was rejected.'));
          else finish(item.resolve, event.data.result);
        };
        try { worker.postMessage({ id, request: item.request }); }
        catch (error) { finish(item.reject, new Error(`The disposable regex worker request could not be sent: ${error?.message || String(error)}`)); }
      }
    }

    function run(request, { signal } = {}) {
      if (signal !== undefined && !(signal instanceof AbortSignal)) return Promise.reject(new TypeError('signal must be an AbortSignal.'));
      if (signal?.aborted) return Promise.reject(new DOMException('Regex operation was cancelled.', 'AbortError'));
      if (queue.length + active >= maxQueue + maxConcurrent) return Promise.reject(new Error('The bounded regex queue is full. Cancel an older operation or wait for it to finish.'));
      return new Promise((resolve, reject) => {
        const item = { request, signal, resolve, reject };
        const abortQueued = () => removeQueued(item, new DOMException('Regex operation was cancelled.', 'AbortError'));
        item.abortQueued = abortQueued;
        signal?.addEventListener('abort', abortQueued, { once: true });
        queue.push(item);
        pump();
        if (!queue.includes(item)) signal?.removeEventListener('abort', abortQueued);
      });
    }

    function cancelQueued() {
      while (queue.length) {
        const item = queue.shift();
        item.signal?.removeEventListener('abort', item.abortQueued);
        item.reject(new DOMException('Regex operation was cancelled.', 'AbortError'));
      }
    }

    return Object.freeze({ run, cancelQueued, limits: Object.freeze({ timeoutMs, maxConcurrent, maxQueue }) });
  }

  root.HairGrowthRegexClient = Object.freeze({ createRegexWorkerClient });
}(typeof globalThis === 'object' ? globalThis : window));

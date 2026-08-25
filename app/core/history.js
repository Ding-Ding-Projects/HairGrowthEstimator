'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { isDeepStrictEqual, promisify } = require('node:util');
const { atomicWriteJson } = require('./atomic');

const execFileAsync = promisify(execFile);

class LocalHistory {
  constructor(directory) {
    this.directory = path.resolve(directory);
    this.queue = Promise.resolve();
  }

  async git(args, options = {}) {
    const result = await execFileAsync('git', args, {
      cwd: this.directory,
      encoding: 'utf8',
      windowsHide: true,
      timeout: options.timeout || 15000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    });
    return result.stdout.trim();
  }

  async ensure() {
    await fs.mkdir(this.directory, { recursive: true });
    try {
      await this.git(['rev-parse', '--git-dir']);
    } catch {
      await this.git(['init', '-b', 'main']);
      await this.git(['config', 'user.name', 'Hair Growth Estimator']);
      await this.git(['config', 'user.email', 'local-history@invalid']);
      await atomicWriteJson(path.join(this.directory, 'snapshot.json'), { schemaVersion: 1, state: null, event: 'History initialized' });
      await this.git(['add', '--', 'snapshot.json']);
      await this.git(['commit', '-m', 'Initialize local version history']);
    }
  }

  record(event, redactedState) {
    const safeEvent = String(event || 'State updated').replace(/[\r\n\0]/g, ' ').slice(0, 180);
    const operation = this.queue.then(async () => {
      await this.ensure();
      const currentSnapshot = JSON.parse(await fs.readFile(path.join(this.directory, 'snapshot.json'), 'utf8'));
      if (isDeepStrictEqual(currentSnapshot.state, redactedState)) {
        return { recorded: false, reason: 'unchanged' };
      }
      const snapshot = {
        schemaVersion: 1,
        event: safeEvent,
        recordedAt: new Date().toISOString(),
        state: redactedState
      };
      await atomicWriteJson(path.join(this.directory, 'snapshot.json'), snapshot, { maxBytes: 1024 * 1024 });
      await this.git(['add', '--', 'snapshot.json']);
      const changed = await this.git(['diff', '--cached', '--name-only']);
      if (!changed) return { recorded: false, reason: 'unchanged' };
      await this.git(['commit', '-m', safeEvent]);
      return { recorded: true, commit: await this.git(['rev-parse', 'HEAD']) };
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  async flush() {
    await this.queue;
  }

  async list(limit = 200) {
    await this.flush();
    await this.ensure();
    const count = Math.max(1, Math.min(1000, Number(limit) || 200));
    const output = await this.git(['log', `-${count}`, '--date=iso-strict', '--format=%H%x1f%aI%x1f%s']);
    if (!output) return [];
    return output.split(/\r?\n/).map((line) => {
      const [commit, date, subject] = line.split('\x1f');
      return { commit, date, subject };
    });
  }

  async read(commit) {
    if (!/^[0-9a-f]{40}$/.test(String(commit || ''))) throw new TypeError('History commit is invalid.');
    await this.flush();
    await this.ensure();
    const json = await this.git(['show', `${commit}:snapshot.json`]);
    return JSON.parse(json);
  }
}

module.exports = { LocalHistory };

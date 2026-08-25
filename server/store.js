const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const EMPTY_DATABASE = Object.freeze({ version: 1, profiles: {} });

function databasePath() {
  return path.resolve(process.env.HAIR_DATA_FILE || path.join(process.cwd(), 'data', 'hair-growth.json'));
}

async function renameWithRetry(from, to) {
  const transient = new Set(['EPERM', 'EACCES', 'EBUSY']);
  let last;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      last = error;
      if (!transient.has(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  throw last;
}

async function readDatabase() {
  try {
    const parsed = JSON.parse(await fs.readFile(databasePath(), 'utf8'));
    return parsed?.version === 1 && parsed.profiles && typeof parsed.profiles === 'object' ? parsed : structuredClone(EMPTY_DATABASE);
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(EMPTY_DATABASE);
    throw error;
  }
}

async function writeDatabase(database) {
  const destination = databasePath();
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(database, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  try {
    await renameWithRetry(temporary, destination);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

let operationQueue = Promise.resolve();

function transact(mutator) {
  const operation = operationQueue.then(async () => {
    const database = await readDatabase();
    const result = await mutator(database);
    await writeDatabase(database);
    return result;
  });
  operationQueue = operation.catch(() => {});
  return operation;
}

module.exports = { readDatabase, transact };

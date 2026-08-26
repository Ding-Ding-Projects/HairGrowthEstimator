import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  assertExactKeys,
  assertObject,
  atomicWriteJson,
  boundedString,
  fail,
  readJson,
  strictChild
} from './common.mjs';
import { readRunInitializationBarrier, verifyRunOwnership } from './plan.mjs';
import { sameProcessIdentity, windowsProcessInventory } from './process-identity.mjs';

const LOCK_DIRECTORY = '.evidence-command-lock';
const LOCK_RECEIPT = 'owner.json';

function lockOwner(value) {
  const owner = assertObject(value, 'run lock owner');
  assertExactKeys(owner, new Set(['pid', 'parentPid', 'creationDate', 'executablePath']), 'run lock owner');
  if (!Number.isInteger(owner.pid) || owner.pid <= 0 || !Number.isInteger(owner.parentPid) || owner.parentPid < 0 ||
      typeof owner.creationDate !== 'string' || !Number.isFinite(Date.parse(owner.creationDate)) ||
      typeof owner.executablePath !== 'string' || !path.isAbsolute(owner.executablePath)) {
    fail('INVALID_RUN_LOCK', 'Run lock owner identity is incomplete.');
  }
  return {
    pid: owner.pid,
    parentPid: owner.parentPid,
    creationDate: owner.creationDate,
    executablePath: path.resolve(owner.executablePath)
  };
}

function validateLockReceipt(plan, ownership, value) {
  const receipt = assertObject(value, 'run lock receipt');
  assertExactKeys(receipt, new Set(['schemaVersion', 'runId', 'planHash', 'ownerNonce', 'token', 'command', 'owner', 'createdAt']), 'run lock receipt');
  if (receipt.schemaVersion !== 1 || receipt.runId !== plan.runId || receipt.planHash !== ownership.planHash || receipt.ownerNonce !== ownership.nonce ||
      typeof receipt.token !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt.token) ||
      typeof receipt.createdAt !== 'string' || !Number.isFinite(Date.parse(receipt.createdAt))) {
    fail('INVALID_RUN_LOCK', 'Run lock receipt does not bind the exact task run.');
  }
  return {
    schemaVersion: 1,
    runId: receipt.runId,
    planHash: receipt.planHash,
    ownerNonce: receipt.ownerNonce,
    token: receipt.token,
    command: boundedString(receipt.command, 'run lock command', { max: 192, pattern: /^[a-z0-9][a-z0-9:._-]*$/ }),
    owner: lockOwner(receipt.owner),
    createdAt: receipt.createdAt
  };
}

async function removeExactLock(lockDirectory, expectedToken) {
  const receiptPath = path.join(lockDirectory, LOCK_RECEIPT);
  const receipt = await readJson(receiptPath, 32 * 1024);
  if (receipt?.token !== expectedToken) fail('RUN_LOCK_OWNERSHIP_FAILED', 'Run lock token changed before release.');
  await fsp.unlink(receiptPath);
  await fsp.rmdir(lockDirectory);
}

export async function acquireRunLock(plan, command) {
  const commandValue = boundedString(command, 'run lock command', { max: 192, pattern: /^[a-z0-9][a-z0-9:._-]*$/ });
  const inventory = await windowsProcessInventory();
  const owner = inventory.find((item) => item.pid === process.pid);
  if (!owner || !owner.creationDate || !owner.executablePath) fail('RUN_LOCK_IDENTITY_FAILED', 'Current evidence command process identity is not provable.');
  const initializationBarrier = await readRunInitializationBarrier(plan);
  if (initializationBarrier && (commandValue !== 'prepare' || !sameProcessIdentity(initializationBarrier.owner, owner))) {
    fail('RUN_INITIALIZING', 'The exact prepare process still owns run initialization.');
  }
  const ownership = await verifyRunOwnership(plan);
  const token = crypto.randomUUID();
  const lockDirectory = (await strictChild(path.join(plan.runRoot, LOCK_DIRECTORY), plan.runRoot, 'run lock directory')).child;
  const candidateDirectory = (await strictChild(path.join(plan.runRoot, `.evidence-command-lock-candidate-${token}`), plan.runRoot, 'run lock candidate')).child;
  const receipt = {
    schemaVersion: 1,
    runId: plan.runId,
    planHash: ownership.planHash,
    ownerNonce: ownership.nonce,
    token,
    command: commandValue,
    owner,
    createdAt: new Date().toISOString()
  };
  await fsp.mkdir(candidateDirectory, { recursive: false, mode: 0o700 });
  try {
    await atomicWriteJson(path.join(candidateDirectory, LOCK_RECEIPT), receipt);
    try {
      await fsp.rename(candidateDirectory, lockDirectory);
    } catch (error) {
      const existing = await fsp.stat(lockDirectory).catch(() => null);
      if (existing?.isDirectory()) fail('RUN_LOCKED', 'Another evidence command owns the exact task run lock.');
      throw error;
    }
  } catch (error) {
    await fsp.unlink(path.join(candidateDirectory, LOCK_RECEIPT)).catch(() => {});
    await fsp.rmdir(candidateDirectory).catch(() => {});
    throw error;
  }
  return {
    receipt: validateLockReceipt(plan, ownership, receipt),
    async release() {
      await verifyRunOwnership(plan);
      const observed = validateLockReceipt(plan, ownership, await readJson(path.join(lockDirectory, LOCK_RECEIPT), 32 * 1024));
      if (observed.token !== token || !sameProcessIdentity(owner, observed.owner)) fail('RUN_LOCK_OWNERSHIP_FAILED', 'Run lock identity changed before release.');
      await removeExactLock(lockDirectory, token);
    }
  };
}

export async function withRunLock(plan, command, action) {
  const lock = await acquireRunLock(plan, command);
  let result;
  let commandError = null;
  try {
    result = await action();
  } catch (error) {
    commandError = error;
  }
  try {
    await lock.release();
  } catch {
    fail('RUN_LOCK_RELEASE_FAILED', 'Evidence command stopped and its exact run lock could not be released.');
  }
  if (commandError) throw commandError;
  return result;
}

export async function recoverRunLock(plan) {
  const ownership = await verifyRunOwnership(plan);
  const lockDirectory = (await strictChild(path.join(plan.runRoot, LOCK_DIRECTORY), plan.runRoot, 'run lock directory')).child;
  const receipt = validateLockReceipt(plan, ownership, await readJson(path.join(lockDirectory, LOCK_RECEIPT), 32 * 1024));
  const live = (await windowsProcessInventory()).find((item) => item.pid === receipt.owner.pid);
  if (live && sameProcessIdentity(receipt.owner, live)) fail('RUN_LOCKED', 'The exact evidence command that owns this run lock is still active.');
  await removeExactLock(lockDirectory, receipt.token);
  return { ok: true, runId: plan.runId, recoveredLock: true, staleCommand: receipt.command };
}

export { validateLockReceipt };

import childProcess from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { boundedString, fail } from './common.mjs';

const execFile = promisify(childProcess.execFile);

function normalizedExecutable(value) {
  return path.resolve(value).replaceAll('\\', '/').toLowerCase();
}

export async function windowsProcessInventory() {
  if (process.platform !== 'win32') fail('WINDOWS_REQUIRED', 'Process ownership proof is available only on Windows.');
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Get-CimInstance -ClassName Win32_Process | ForEach-Object { [pscustomobject]@{ ProcessId = $_.ProcessId; ParentProcessId = $_.ParentProcessId; CreationDate = if ($_.CreationDate) { ([datetime]$_.CreationDate).ToUniversalTime().ToString('o') } else { $null }; ExecutablePath = $_.ExecutablePath } } | ConvertTo-Json -Compress"
  ].join('\n');
  let stdout;
  try {
    ({ stdout } = await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      timeout: 15_000,
      maxBuffer: 8 * 1024 * 1024,
      encoding: 'utf8'
    }));
  } catch {
    fail('PROCESS_INVENTORY_FAILED', 'Windows process inventory could not be read.');
  }
  let values;
  try {
    const parsed = JSON.parse(stdout);
    values = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    fail('PROCESS_INVENTORY_FAILED', 'Windows process inventory returned malformed JSON.');
  }
  return values.filter(Boolean).map((value) => ({
    pid: Number(value.ProcessId),
    parentPid: Number(value.ParentProcessId),
    creationDate: typeof value.CreationDate === 'string' ? value.CreationDate : null,
    executablePath: typeof value.ExecutablePath === 'string' ? path.resolve(value.ExecutablePath) : null
  })).filter((value) => Number.isInteger(value.pid) && value.pid > 0 && Number.isInteger(value.parentPid) && value.parentPid >= 0);
}

export function processesForExecutableSince(inventory, expectedExecutablePath, startedAt) {
  if (!Array.isArray(inventory) || !path.isAbsolute(expectedExecutablePath) || !Number.isFinite(Date.parse(startedAt))) {
    fail('INVALID_PROCESS_INVENTORY', 'Executable recovery inventory inputs are invalid.');
  }
  const minimum = Date.parse(startedAt) - 5_000;
  return inventory.filter((item) => item?.executablePath && item?.creationDate &&
    normalizedExecutable(item.executablePath) === normalizedExecutable(expectedExecutablePath) && Date.parse(item.creationDate) >= minimum);
}

export function selectEvidenceLaunchRoot(candidates) {
  if (!Array.isArray(candidates) || candidates.some((item) => !item?.pid || !item.creationDate || !item.executablePath)) {
    fail('RECOVERY_IDENTITY_FAILED', 'Evidence launch candidate inventory is invalid.');
  }
  const candidatePids = new Set(candidates.map((item) => item.pid));
  const roots = candidates.filter((item) => !candidatePids.has(item.parentPid));
  if (roots.length !== 1) fail('RECOVERY_IDENTITY_FAILED', 'Evidence launch recovery did not resolve exactly one owned root process.');
  return roots[0];
}

export async function windowsEvidenceProcessCandidates(executablePath, requiredArguments, startedAt) {
  if (process.platform !== 'win32') fail('WINDOWS_REQUIRED', 'Evidence launch recovery is available only on Windows.');
  const expectedExecutablePath = boundedString(path.resolve(executablePath), 'recovery executable path', { max: 32_768 });
  if (!Array.isArray(requiredArguments) || requiredArguments.length < 1 || requiredArguments.length > 16 ||
      !requiredArguments.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 32_768 && !/[\0\r\n]/.test(item)) ||
      !Number.isFinite(Date.parse(startedAt))) {
    fail('INVALID_RECOVERY_QUERY', 'Evidence launch recovery query is invalid.');
  }
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '$expected = [IO.Path]::GetFullPath($env:HGE_EVIDENCE_RECOVERY_EXE)',
    '$required = @($env:HGE_EVIDENCE_RECOVERY_ARGS | ConvertFrom-Json)',
    "$after = [datetime]::Parse($env:HGE_EVIDENCE_RECOVERY_AFTER, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime().AddSeconds(-5)",
    '$items = @(Get-CimInstance -ClassName Win32_Process | Where-Object {',
    '  if (-not $_.ExecutablePath -or -not $_.CommandLine -or -not $_.CreationDate) { return $false }',
    '  if (-not [string]::Equals([IO.Path]::GetFullPath($_.ExecutablePath), $expected, [StringComparison]::OrdinalIgnoreCase)) { return $false }',
    '  if (([datetime]$_.CreationDate).ToUniversalTime() -lt $after) { return $false }',
    '  $command = [string]$_.CommandLine',
    '  foreach ($argument in $required) { if ($command.IndexOf([string]$argument, [StringComparison]::OrdinalIgnoreCase) -lt 0) { return $false } }',
    '  return $true',
    '} | ForEach-Object { [pscustomobject]@{ ProcessId = $_.ProcessId; ParentProcessId = $_.ParentProcessId; CreationDate = ([datetime]$_.CreationDate).ToUniversalTime().ToString(\'o\'); ExecutablePath = $_.ExecutablePath } })',
    '$items | ConvertTo-Json -Compress'
  ].join('\n');
  let stdout;
  try {
    ({ stdout } = await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
      env: {
        ...process.env,
        HGE_EVIDENCE_RECOVERY_EXE: expectedExecutablePath,
        HGE_EVIDENCE_RECOVERY_ARGS: JSON.stringify(requiredArguments),
        HGE_EVIDENCE_RECOVERY_AFTER: new Date(startedAt).toISOString()
      }
    }));
  } catch {
    fail('PROCESS_INVENTORY_FAILED', 'Evidence launch candidate inventory could not be read.');
  }
  if (!stdout.trim()) return [];
  let values;
  try {
    const parsed = JSON.parse(stdout);
    values = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    fail('PROCESS_INVENTORY_FAILED', 'Evidence launch candidate inventory returned malformed JSON.');
  }
  return values.filter(Boolean).map((value) => ({
    pid: Number(value.ProcessId),
    parentPid: Number(value.ParentProcessId),
    creationDate: typeof value.CreationDate === 'string' ? value.CreationDate : null,
    executablePath: typeof value.ExecutablePath === 'string' ? path.resolve(value.ExecutablePath) : null
  })).filter((value) => Number.isInteger(value.pid) && value.pid > 0 && Number.isInteger(value.parentPid) && value.parentPid >= 0 && value.creationDate && value.executablePath);
}

export async function windowsTcpListenerInventory(port) {
  if (process.platform !== 'win32') fail('WINDOWS_REQUIRED', 'Listener ownership proof is available only on Windows.');
  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) fail('INVALID_CDP_PORT', 'Listener port is outside the supported range.');
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$items = @(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess)`,
    '$items | ConvertTo-Json -Compress'
  ].join('\n');
  let stdout;
  try {
    ({ stdout } = await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8'
    }));
  } catch {
    fail('LISTENER_INVENTORY_FAILED', 'Windows listener inventory could not be read.');
  }
  if (!stdout.trim()) return [];
  let values;
  try {
    const parsed = JSON.parse(stdout);
    values = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    fail('LISTENER_INVENTORY_FAILED', 'Windows listener inventory returned malformed JSON.');
  }
  return values.filter(Boolean).map((value) => ({
    localAddress: String(value.LocalAddress || ''),
    localPort: Number(value.LocalPort),
    owningPid: Number(value.OwningProcess)
  })).filter((value) => value.localAddress && value.localPort === port && Number.isInteger(value.owningPid) && value.owningPid > 0);
}

export function assertCdpPortVacant(inventory, port) {
  if (!Array.isArray(inventory)) fail('INVALID_LISTENER_INVENTORY', 'Listener inventory must be an array.');
  if (inventory.some((item) => item?.localPort === port)) fail('CDP_PORT_OCCUPIED', 'Planned CDP port already has a listener before launch.');
  return { passed: true, port, listeners: 0 };
}

export function assertCdpListenerOwned(inventory, port, ownedProcessIds) {
  if (!Array.isArray(inventory) || !Array.isArray(ownedProcessIds) || !ownedProcessIds.length) fail('INVALID_LISTENER_INVENTORY', 'Listener ownership inputs are invalid.');
  const listeners = inventory.filter((item) => item?.localPort === port);
  const owned = new Set(ownedProcessIds);
  const pids = new Set(listeners.map((item) => item.owningPid));
  const allowedAddresses = new Set(['127.0.0.1', '::1']);
  if (!listeners.length || !listeners.some((item) => item.localAddress === '127.0.0.1') ||
      listeners.some((item) => !allowedAddresses.has(item.localAddress) || !owned.has(item.owningPid)) || pids.size !== 1) {
    fail('CDP_LISTENER_OWNERSHIP_FAILED', 'CDP listener is missing, externally reachable, ambiguous, or owned outside the launched process tree.');
  }
  return {
    passed: true,
    port,
    owningPid: [...pids][0],
    addresses: [...new Set(listeners.map((item) => item.localAddress))].sort()
  };
}

export function processTreeFromInventory(inventory, rootPid, expectedExecutablePath) {
  if (!Array.isArray(inventory) || !Number.isInteger(rootPid) || rootPid <= 0) fail('INVALID_PROCESS_INVENTORY', 'Process inventory or root PID is invalid.');
  if (new Set(inventory.map((item) => item.pid)).size !== inventory.length) fail('PROCESS_PROOF_FAILED', 'Process inventory contains duplicate process ids.');
  const byPid = new Map(inventory.map((item) => [item.pid, item]));
  const root = byPid.get(rootPid);
  if (!root || !root.creationDate || !root.executablePath) fail('PROCESS_PROOF_FAILED', 'Root process identity is missing required fields.');
  if (expectedExecutablePath && normalizedExecutable(root.executablePath) !== normalizedExecutable(expectedExecutablePath)) {
    fail('PROCESS_PROOF_FAILED', 'Root process executable does not match the pinned packaged artifact.');
  }
  const tree = [root];
  const included = new Set([root.pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of inventory) {
      if (!included.has(item.pid) && included.has(item.parentPid)) {
        included.add(item.pid);
        tree.push(item);
        changed = true;
      }
    }
  }
  if (tree.some((item) => !item.creationDate || !item.executablePath || item.creationDate < root.creationDate)) {
    fail('PROCESS_PROOF_FAILED', 'A process in the launched tree is missing stable identity fields or predates the root process.');
  }
  return tree.map((item) => ({ ...item }));
}

export async function captureProcessTree(rootPid, expectedExecutablePath) {
  return processTreeFromInventory(await windowsProcessInventory(), rootPid, expectedExecutablePath);
}

export function sameProcessIdentity(expected, observed) {
  return Boolean(
    expected && observed &&
    expected.pid === observed.pid &&
    expected.parentPid === observed.parentPid &&
    expected.creationDate === observed.creationDate &&
    typeof expected.executablePath === 'string' &&
    typeof observed.executablePath === 'string' &&
    normalizedExecutable(expected.executablePath) === normalizedExecutable(observed.executablePath)
  );
}

export async function revalidateProcessTree(savedTree, rootPid, expectedExecutablePath) {
  if (!Array.isArray(savedTree) || savedTree.length === 0) fail('PROCESS_PROOF_FAILED', 'Saved process tree is missing.');
  const current = await captureProcessTree(rootPid, expectedExecutablePath);
  const currentByPid = new Map(current.map((item) => [item.pid, item]));
  const savedRoot = savedTree.find((item) => item.pid === rootPid);
  if (!sameProcessIdentity(savedRoot, currentByPid.get(rootPid))) fail('PROCESS_PROOF_FAILED', 'Root process identity changed since launch.');
  return current;
}

export function expandOwnedProcessTree(inventory, savedTree) {
  if (!Array.isArray(inventory) || !Array.isArray(savedTree) || savedTree.length === 0) fail('PROCESS_PROOF_FAILED', 'Owned descendant expansion requires complete process inventories.');
  const currentByPid = new Map(inventory.map((item) => [item.pid, item]));
  const owned = new Map(savedTree.map((item) => [item.pid, { ...item }]));
  for (const identity of savedTree) {
    const current = currentByPid.get(identity.pid);
    if (current && !sameProcessIdentity(identity, current)) fail('PROCESS_PROOF_FAILED', 'A saved owned PID was reused before cleanup completed.');
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of inventory) {
      if (owned.has(candidate.pid) || !owned.has(candidate.parentPid)) continue;
      const parent = owned.get(candidate.parentPid);
      if (!candidate.creationDate || !candidate.executablePath || Date.parse(candidate.creationDate) < Date.parse(parent.creationDate)) {
        fail('PROCESS_PROOF_FAILED', 'A late owned descendant is missing stable identity or predates its parent.');
      }
      owned.set(candidate.pid, { ...candidate });
      changed = true;
    }
  }
  return [...owned.values()];
}

export function childFirst(tree, rootPid) {
  const byPid = new Map(tree.map((item) => [item.pid, item]));
  const depth = (item) => {
    let value = 0;
    let current = item;
    const seen = new Set();
    while (current.pid !== rootPid && byPid.has(current.parentPid) && !seen.has(current.pid)) {
      seen.add(current.pid);
      current = byPid.get(current.parentPid);
      value += 1;
    }
    return value;
  };
  return [...tree].sort((left, right) => depth(right) - depth(left));
}

function quoteWindowsArgument(argument) {
  boundedString(argument, 'process argument', { max: 8_192 });
  if (!/[\s"]/.test(argument)) return argument;
  let result = '"';
  let backslashes = 0;
  for (const character of argument) {
    if (character === '\\') {
      backslashes += 1;
    } else if (character === '"') {
      result += '\\'.repeat((backslashes * 2) + 1);
      result += '"';
      backslashes = 0;
    } else {
      result += '\\'.repeat(backslashes);
      result += character;
      backslashes = 0;
    }
  }
  result += '\\'.repeat(backslashes * 2);
  return `${result}"`;
}

export function windowsCommandLine(executablePath, argumentsValue) {
  const executable = boundedString(path.resolve(executablePath), 'executable path', { max: 32_768 });
  if (!Array.isArray(argumentsValue) || argumentsValue.length > 100) fail('INVALID_ARGUMENTS', 'Process argument inventory is invalid.');
  const command = [executable, ...argumentsValue].map(quoteWindowsArgument).join(' ');
  if (command.length > 32_760) fail('COMMAND_LINE_TOO_LONG', 'Windows command line exceeds its supported bound.');
  return command;
}

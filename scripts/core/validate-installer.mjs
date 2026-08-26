import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function readPeSecurityDirectory(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 256 || buffer.toString('ascii', 0, 2) !== 'MZ') {
    throw new TypeError('Installer is not a valid PE file with an MZ header.');
  }
  const peOffset = buffer.readUInt32LE(0x3c);
  if (peOffset + 24 > buffer.length || buffer.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
    throw new TypeError('Installer is missing a valid PE header.');
  }
  const optionalHeader = peOffset + 24;
  const magic = buffer.readUInt16LE(optionalHeader);
  let dataDirectoryOffset;
  let countOffset;
  if (magic === 0x10b) {
    dataDirectoryOffset = optionalHeader + 96;
    countOffset = optionalHeader + 92;
  } else if (magic === 0x20b) {
    dataDirectoryOffset = optionalHeader + 112;
    countOffset = optionalHeader + 108;
  } else {
    throw new TypeError(`Unsupported PE optional-header magic 0x${magic.toString(16)}.`);
  }
  if (countOffset + 4 > buffer.length || buffer.readUInt32LE(countOffset) <= 4) {
    return { fileOffset: 0, size: 0 };
  }
  const securityEntry = dataDirectoryOffset + (4 * 8);
  if (securityEntry + 8 > buffer.length) throw new TypeError('PE security directory is truncated.');
  const fileOffset = buffer.readUInt32LE(securityEntry);
  const size = buffer.readUInt32LE(securityEntry + 4);
  if ((fileOffset === 0) !== (size === 0)) throw new TypeError('PE security directory is inconsistent.');
  if (size > 0 && (fileOffset + size > buffer.length || fileOffset < securityEntry + 8)) {
    throw new TypeError('PE security directory points outside the installer.');
  }
  return { fileOffset, size };
}

export function validateInstallerDirectory(directory) {
  const resolved = path.resolve(directory);
  const entries = fs.readdirSync(resolved, { withFileTypes: true }).filter((entry) => entry.isFile());
  const setups = entries.filter((entry) => /setup.*\.exe$/i.test(entry.name));
  if (setups.length !== 1) throw new TypeError(`Expected exactly one Setup executable, received ${setups.length}.`);
  const setupPath = path.join(resolved, setups[0].name);
  const setup = fs.readFileSync(setupPath);
  if (setup.length < 1024 * 1024) throw new TypeError('Setup executable is implausibly small.');
  const securityDirectory = readPeSecurityDirectory(setup);
  if (securityDirectory.size !== 0) throw new TypeError('Signing policy violated: Setup contains an Authenticode certificate table.');

  const releasesPath = path.join(resolved, 'RELEASES');
  const releasesText = fs.readFileSync(releasesPath, 'utf8').trim();
  const releaseLines = releasesText ? releasesText.split(/\r?\n/) : [];
  if (releaseLines.length === 0) throw new TypeError('RELEASES contains no package entries.');
  const packages = [];
  for (const line of releaseLines) {
    const match = /^([0-9A-F]{40})\s+([^\\/]+\.nupkg)\s+([1-9][0-9]*)$/i.exec(line.trim());
    if (!match) throw new TypeError(`Invalid RELEASES entry: ${line}`);
    const packagePath = path.join(resolved, match[2]);
    const packageBuffer = fs.readFileSync(packagePath);
    if (packageBuffer.length !== Number(match[3])) throw new TypeError(`Package byte count disagrees with RELEASES: ${match[2]}`);
    const sha1 = crypto.createHash('sha1').update(packageBuffer).digest('hex');
    if (sha1 !== match[1].toLowerCase()) throw new TypeError(`Package SHA-1 disagrees with RELEASES: ${match[2]}`);
    packages.push({ name: match[2], bytes: packageBuffer.length, sha1 });
  }
  if (!packages.some((item) => /-full\.nupkg$/i.test(item.name))) throw new TypeError('A full Squirrel package was not produced.');
  return {
    setupPath,
    setupBytes: setup.length,
    setupSha256: crypto.createHash('sha256').update(setup).digest('hex'),
    releasesPath,
    packages,
    signing: 'NotSigned'
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = validateInstallerDirectory(process.argv[2] || path.join(process.cwd(), 'dist', 'squirrel-windows'));
  console.log('Validated genuine unsigned Squirrel.Windows artifacts.');
  console.log(`Artifact: ${result.setupPath}`);
  console.log(`Artifact bytes: ${result.setupBytes}`);
  console.log(`SHA-256: ${result.setupSha256}`);
  console.log(`Signing: ${result.signing}, PE certificate table absent.`);
  console.log(`RELEASES: ${result.releasesPath}`);
  console.log(`Packages: ${result.packages.length}`);
}

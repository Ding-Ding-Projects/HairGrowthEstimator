import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';
import { extractFile } from '@electron/asar';
import { validateAsarSourceBinding, validateServerZipSourceBinding } from '../release/source-binding.mjs';
import { atomicWriteFileSync } from '../release/atomic-file.mjs';
import { validateDeltaFeedState } from '../release/release-context.mjs';
import { releaseIdentity, releaseIdentitySha256 } from '../release/release-identity.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const require = createRequire(import.meta.url);
const { assertEmbeddedIcon } = require('../release/apply-executable-icon.cjs');
const { NtExecutable, NtExecutableResource } = require('resedit');
const fatalUtf8Decoder = new TextDecoder('utf-8', { fatal: true });
const MAX_ZIP_EXTRA_BYTES = 4096;
const MAX_ZIP_EXTRA_FIELD_BYTES = 2048;
const MAX_ZIP_EXTRA_FIELDS = 32;
const MAX_NUSPEC_BYTES = 1024 * 1024;
const MAX_XML_DEPTH = 64;
const MAX_XML_ELEMENTS = 4096;
const MAX_XML_ATTRIBUTES = 64;

function digest(algorithm, buffer) {
  return crypto.createHash(algorithm).update(buffer).digest('hex');
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

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
  if (countOffset + 4 > buffer.length || buffer.readUInt32LE(countOffset) <= 4) return { fileOffset: 0, size: 0 };
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

function setupPayloadEntries(setup) {
  const resources = NtExecutableResource.from(NtExecutable.from(setup));
  const payloads = resources.entries.filter((entry) => entry.type === 'DATA' && entry.id === 131);
  if (payloads.length !== 1 || !payloads[0].bin) throw new TypeError('Final Setup executable is missing the single Squirrel DATA/131 payload resource.');
  return readZipEntries(Buffer.from(payloads[0].bin));
}

export function validateUpdaterExecutable(buffer, iconBuffer, label = 'Update.exe') {
  if (!Buffer.isBuffer(buffer) || !Buffer.isBuffer(iconBuffer)) {
    throw new TypeError(`${label} validation requires executable and icon byte buffers.`);
  }
  const securityDirectory = readPeSecurityDirectory(buffer);
  if (securityDirectory.size !== 0) throw new TypeError(`${label} is signed or contains a PE certificate table.`);

  let resources;
  try {
    resources = NtExecutableResource.from(NtExecutable.from(buffer));
  } catch {
    throw new TypeError(`${label} is not a structurally valid PE executable with readable resources.`);
  }
  const versionResources = resources.entries.filter((entry) => entry.type === 16);
  const manifestResources = resources.entries.filter((entry) => entry.type === 24);
  if (versionResources.length !== 1 || manifestResources.length !== 1) {
    throw new TypeError(`${label} must contain exactly one version resource and exactly one application manifest resource.`);
  }

  let iconRecords;
  try {
    iconRecords = assertEmbeddedIcon(buffer, iconBuffer);
  } catch {
    throw new TypeError(`${label} icon resources do not match the canonical multi-resolution ICO.`);
  }
  return {
    bytes: buffer.length,
    sha256: digest('sha256', buffer),
    signing: 'NotSigned',
    iconResourceCount: iconRecords.length,
    versionResourceCount: versionResources.length,
    manifestResourceCount: manifestResources.length
  };
}

function validateClaimedUpdater(expectedUpdater) {
  if (!expectedUpdater || !Buffer.isBuffer(expectedUpdater.buffer) || !Buffer.isBuffer(expectedUpdater.icon)) {
    throw new TypeError('Final Setup updater binding requires the exact validated full-package Update.exe and canonical icon bytes.');
  }
  const verified = validateUpdaterExecutable(expectedUpdater.buffer, expectedUpdater.icon, 'Validated full-package Update.exe');
  for (const field of ['bytes', 'sha256', 'signing', 'iconResourceCount', 'versionResourceCount', 'manifestResourceCount']) {
    if (expectedUpdater[field] !== verified[field]) {
      throw new TypeError(`Validated full-package Update.exe ${field} claim disagrees with its bytes.`);
    }
  }
  return verified;
}

export function assertSetupPayloadEntries(entries, fullPackageName, fullPackageBytes, expectedUpdater) {
  if (!(entries instanceof Map) || !entries.has('Update.exe')) throw new TypeError('Final Setup payload is missing Update.exe.');
  const packages = [...entries.keys()].filter((name) => /-full\.nupkg$/i.test(name));
  if (packages.length !== 1 || packages[0] !== fullPackageName) throw new TypeError('Final Setup payload does not name the exact validated full package.');
  const embedded = entries.get(fullPackageName);
  if (!embedded.equals(fullPackageBytes)) throw new TypeError('Final Setup embedded full package bytes disagree with the validated release package.');

  const expected = validateClaimedUpdater(expectedUpdater);
  const embeddedUpdater = entries.get('Update.exe');
  if (!embeddedUpdater.equals(expectedUpdater.buffer)) {
    throw new TypeError('Final Setup Update.exe bytes disagree with the digest-verified full-package updater.');
  }
  const actual = validateUpdaterExecutable(embeddedUpdater, expectedUpdater.icon, 'Final Setup Update.exe');
  if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) {
    throw new TypeError('Final Setup Update.exe digest or byte count disagrees with the validated full-package updater.');
  }
  return {
    entryCount: entries.size,
    fullPackage: fullPackageName,
    fullPackageSha256: digest('sha256', embedded),
    updateBytes: actual.bytes,
    updateSha256: actual.sha256,
    updateSigning: actual.signing,
    updateIconResourceCount: actual.iconResourceCount,
    updateVersionResourceCount: actual.versionResourceCount,
    updateManifestResourceCount: actual.manifestResourceCount
  };
}

function findEndOfCentralDirectory(buffer) {
  const lowerBound = Math.max(0, buffer.length - 65_557);
  const candidates = [];
  for (let offset = buffer.length - 22; offset >= lowerBound; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) candidates.push(offset);
  }
  if (candidates.length !== 1) throw new TypeError(`Squirrel package requires exactly one structurally complete ZIP EOCD record, received ${candidates.length}.`);
  return candidates[0];
}

function decodeZipName(bytes, flags, label) {
  if ((flags & 0x0800) !== 0) {
    try {
      return fatalUtf8Decoder.decode(bytes);
    } catch {
      throw new TypeError(`${label} is not valid UTF-8.`);
    }
  }
  if ([...bytes].some((byte) => byte > 0x7f)) {
    throw new TypeError(`${label} uses an unsupported legacy filename encoding.`);
  }
  return bytes.toString('ascii');
}

function safeZipName(value) {
  if (!value || value.includes('\\') || value.startsWith('/') || /^[a-zA-Z]:/.test(value) || value.includes('\0')) {
    throw new TypeError(`Squirrel package contains an unsafe ZIP entry: ${value}`);
  }
  const directory = value.endsWith('/');
  const canonicalValue = directory ? value.slice(0, -1) : value;
  const segments = canonicalValue.split('/');
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..' || /[. ]$/.test(segment) || /[<>:"|?*\u0000-\u001f]/.test(segment)) {
      throw new TypeError(`Squirrel package contains an unsafe canonical ZIP entry: ${value}`);
    }
    const base = segment.split('.')[0].toUpperCase();
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(base)) {
      throw new TypeError(`Squirrel package contains a reserved Windows extraction name: ${value}`);
    }
  }
  const identity = segments.map((segment) => segment.normalize('NFC').toLowerCase()).join('/');
  return { name: value, identity, directory };
}

function validateExtendedTimestamp(data, label) {
  if (data.length < 1) throw new TypeError(`${label} extended timestamp extra field is truncated.`);
  const flags = data[0];
  if ((flags & ~0x07) !== 0) throw new TypeError(`${label} extended timestamp extra field has unsupported flags.`);
  const expectedLength = 1 + (4 * ((flags & 1 ? 1 : 0) + (flags & 2 ? 1 : 0) + (flags & 4 ? 1 : 0)));
  if (data.length !== expectedLength) throw new TypeError(`${label} extended timestamp extra field has an invalid length.`);
}

function validateNtfsTimestamp(data, label) {
  if (data.length < 8 || data.readUInt32LE(0) !== 0) throw new TypeError(`${label} NTFS extra field is malformed.`);
  let offset = 4;
  let timestampCount = 0;
  while (offset < data.length) {
    if (offset + 4 > data.length) throw new TypeError(`${label} NTFS extra-field TLV is truncated.`);
    const tag = data.readUInt16LE(offset);
    const size = data.readUInt16LE(offset + 2);
    offset += 4;
    if (offset + size > data.length) throw new TypeError(`${label} NTFS extra-field TLV is truncated.`);
    if (tag !== 1 || size !== 24 || timestampCount !== 0) throw new TypeError(`${label} NTFS extra field has unsupported attributes.`);
    timestampCount += 1;
    offset += size;
  }
  if (timestampCount !== 1) throw new TypeError(`${label} NTFS extra field is missing its timestamp attribute.`);
}

function parseZipExtraFields(bytes, label) {
  if (bytes.length > MAX_ZIP_EXTRA_BYTES) throw new TypeError(`${label} extra field exceeds the bounded ${MAX_ZIP_EXTRA_BYTES}-byte limit.`);
  const seen = new Set();
  let fieldCount = 0;
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 4 > bytes.length) throw new TypeError(`${label} extra-field TLV header is truncated.`);
    const id = bytes.readUInt16LE(offset);
    const size = bytes.readUInt16LE(offset + 2);
    offset += 4;
    if (size > MAX_ZIP_EXTRA_FIELD_BYTES) throw new TypeError(`${label} extra field exceeds the bounded per-field limit.`);
    if (offset + size > bytes.length) throw new TypeError(`${label} extra-field TLV payload is truncated.`);
    fieldCount += 1;
    if (fieldCount > MAX_ZIP_EXTRA_FIELDS) throw new TypeError(`${label} contains too many extra fields.`);
    if (seen.has(id)) throw new TypeError(`${label} contains a duplicate extra field 0x${id.toString(16)}.`);
    seen.add(id);
    const data = bytes.subarray(offset, offset + size);
    if ([0x0001, 0x0017, 0x6375, 0x7075, 0x9901].includes(id)) {
      throw new TypeError(`${label} contains a path-changing, size-changing, or encrypted extra field 0x${id.toString(16)}.`);
    }
    if (id === 0x5455) validateExtendedTimestamp(data, label);
    else if (id === 0x000a) validateNtfsTimestamp(data, label);
    else throw new TypeError(`${label} contains unsupported extra field 0x${id.toString(16)}.`);
    offset += size;
  }
  return { count: fieldCount, bytes: bytes.length };
}

export function readZipEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new TypeError('Squirrel package is not a ZIP file.');
  const eocd = findEndOfCentralDirectory(buffer);
  const diskNumber = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  const entriesThisDisk = buffer.readUInt16LE(eocd + 8);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (diskNumber !== 0 || centralDisk !== 0) throw new TypeError('Squirrel packages must use a single-disk ZIP archive.');
  if (entriesThisDisk !== entryCount) throw new TypeError('ZIP per-disk and total entry counts disagree.');
  if (entriesThisDisk === 0xffff || entryCount === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) throw new TypeError('ZIP64 Squirrel packages are not supported by this validator.');
  if (centralOffset + centralSize !== eocd) throw new TypeError('ZIP central directory must be adjacent to its EOCD record.');
  const entries = new Map();
  const entryNames = new Set();
  const extractionIdentities = new Map();
  const localSpans = [];
  const localOffsets = new Set();
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw new TypeError('ZIP central directory entry is malformed.');
    const versionMadeBy = buffer.readUInt16LE(offset + 4);
    const versionNeeded = buffer.readUInt16LE(offset + 6);
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const expectedCrc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const diskNumberStart = buffer.readUInt16LE(offset + 34);
    const internalAttributes = buffer.readUInt16LE(offset + 36);
    const externalAttributes = buffer.readUInt32LE(offset + 38);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const centralEntryEnd = offset + 46 + nameLength + extraLength + commentLength;
    if (centralEntryEnd > centralOffset + centralSize || centralEntryEnd > buffer.length) throw new TypeError('ZIP central directory entry is truncated.');
    if ([compressedSize, uncompressedSize, localOffset].includes(0xffffffff)) throw new TypeError('ZIP64 Squirrel entries are not supported by this validator.');
    const creatorSystem = versionMadeBy >>> 8;
    const creatorVersion = versionMadeBy & 0xff;
    const minimumVersion = method === 0 && (flags & 0x0008) === 0 ? 10 : 20;
    if (![0, 3].includes(creatorSystem) || creatorVersion < 10 || creatorVersion > 63 || versionNeeded < minimumVersion || versionNeeded > 20) {
      throw new TypeError('ZIP entry uses unsupported creator or extraction version fields.');
    }
    if (diskNumberStart !== 0) throw new TypeError('ZIP central entry starts on an unsupported nonzero disk.');
    const encryptedFlags = 0x0001 | 0x0040 | 0x2000;
    if ((flags & encryptedFlags) !== 0) throw new TypeError('Encrypted ZIP entries are not supported.');
    const allowedFlags = 0x0008 | 0x0800 | (method === 8 ? 0x0006 : 0);
    if ((flags & ~allowedFlags) !== 0) throw new TypeError(`ZIP entry flags are unsupported: 0x${flags.toString(16)}.`);
    const centralNameBytes = buffer.subarray(offset + 46, offset + 46 + nameLength);
    const decodedName = decodeZipName(centralNameBytes, flags, 'ZIP central filename');
    const { name, identity, directory } = safeZipName(decodedName);
    if (entryNames.has(name)) throw new TypeError(`Squirrel package contains a duplicate ZIP entry: ${name}`);
    entryNames.add(name);
    if (extractionIdentities.has(identity)) {
      throw new TypeError(`Squirrel package contains a canonical Windows extraction alias: ${extractionIdentities.get(identity).name} and ${name}`);
    }
    const unixMode = externalAttributes >>> 16;
    const unixType = unixMode & 0xf000;
    if (creatorSystem === 3 && unixType !== 0 && ![0x4000, 0x8000].includes(unixType)) {
      throw new TypeError(`Squirrel package contains an unsupported Unix ZIP entry type: ${name}`);
    }
    const hasDirectoryAttribute = (externalAttributes & 0x10) !== 0 || (creatorSystem === 3 && unixType === 0x4000);
    if (directory) {
      if (!hasDirectoryAttribute || internalAttributes !== 0 || flags !== 0 || method !== 0 || expectedCrc !== 0 || compressedSize !== 0 || uncompressedSize !== 0) {
        throw new TypeError(`Squirrel package contains an invalid ZIP directory entry: ${name}`);
      }
    } else if (hasDirectoryAttribute) {
      throw new TypeError(`Squirrel package file entry carries a directory attribute: ${name}`);
    }
    for (const [existingIdentity, existing] of extractionIdentities) {
      if ((!existing.directory && identity.startsWith(`${existingIdentity}/`)) || (!directory && existingIdentity.startsWith(`${identity}/`))) {
        throw new TypeError(`Squirrel package contains a file-directory ancestor conflict: ${existing.name} and ${name}`);
      }
    }
    extractionIdentities.set(identity, { name, directory });
    const centralExtraStart = offset + 46 + nameLength;
    parseZipExtraFields(buffer.subarray(centralExtraStart, centralExtraStart + extraLength), `ZIP central entry ${name}`);
    if (localOffset >= centralOffset || localOffsets.has(localOffset) || localOffset + 30 > centralOffset || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new TypeError(`ZIP local header is malformed or duplicated for ${name}.`);
    }
    localOffsets.add(localOffset);
    const localVersionNeeded = buffer.readUInt16LE(localOffset + 4);
    const localFlags = buffer.readUInt16LE(localOffset + 6);
    const localMethod = buffer.readUInt16LE(localOffset + 8);
    const localCrc = buffer.readUInt32LE(localOffset + 14);
    const localCompressedSize = buffer.readUInt32LE(localOffset + 18);
    const localUncompressedSize = buffer.readUInt32LE(localOffset + 22);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    if (localNameEnd + localExtraLength > centralOffset) throw new TypeError(`ZIP local header is truncated for ${name}.`);
    const localNameBytes = buffer.subarray(localNameStart, localNameEnd);
    if (!localNameBytes.equals(centralNameBytes)) throw new TypeError(`ZIP local and central names disagree for ${name}.`);
    if (localVersionNeeded !== versionNeeded || localFlags !== flags || localMethod !== method) {
      throw new TypeError(`ZIP local and central version, flags, or method disagree for ${name}.`);
    }
    decodeZipName(localNameBytes, localFlags, `ZIP local filename ${name}`);
    parseZipExtraFields(buffer.subarray(localNameEnd, localNameEnd + localExtraLength), `ZIP local entry ${name}`);
    if ((flags & 0x0008) === 0) {
      if (localCrc !== expectedCrc || localCompressedSize !== compressedSize || localUncompressedSize !== uncompressedSize) {
        throw new TypeError(`ZIP local and central CRC or sizes disagree for ${name}.`);
      }
    } else if (
      ![0, expectedCrc].includes(localCrc)
      || ![0, compressedSize].includes(localCompressedSize)
      || ![0, uncompressedSize].includes(localUncompressedSize)
    ) {
      throw new TypeError(`ZIP local deferred CRC or sizes disagree for ${name}.`);
    }
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > centralOffset) throw new TypeError(`ZIP data is truncated for ${name}.`);
    let localEnd = dataEnd;
    if ((flags & 0x0008) !== 0) {
      const descriptorCandidates = [];
      if (dataEnd + 12 <= centralOffset) {
        const candidate = {
          end: dataEnd + 12,
          crc: buffer.readUInt32LE(dataEnd),
          compressed: buffer.readUInt32LE(dataEnd + 4),
          uncompressed: buffer.readUInt32LE(dataEnd + 8)
        };
        if (candidate.crc === expectedCrc && candidate.compressed === compressedSize && candidate.uncompressed === uncompressedSize) descriptorCandidates.push(candidate);
      }
      if (dataEnd + 16 <= centralOffset && buffer.readUInt32LE(dataEnd) === 0x08074b50) {
        const candidate = {
          end: dataEnd + 16,
          crc: buffer.readUInt32LE(dataEnd + 4),
          compressed: buffer.readUInt32LE(dataEnd + 8),
          uncompressed: buffer.readUInt32LE(dataEnd + 12)
        };
        if (candidate.crc === expectedCrc && candidate.compressed === compressedSize && candidate.uncompressed === uncompressedSize) descriptorCandidates.push(candidate);
      }
      if (descriptorCandidates.length !== 1) throw new TypeError(`ZIP data descriptor is missing, ambiguous, or inconsistent for ${name}.`);
      localEnd = descriptorCandidates[0].end;
    }
    const compressed = buffer.subarray(dataStart, dataEnd);
    let data;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = inflateRawSync(compressed, { maxOutputLength: uncompressedSize });
    else throw new TypeError(`ZIP compression method ${method} is unsupported for ${name}.`);
    if (data.length !== uncompressedSize || crc32(data) !== expectedCrc) throw new TypeError(`ZIP size or CRC disagrees for ${name}.`);
    entries.set(name, data);
    localSpans.push({ name, start: localOffset, end: localEnd });
    offset = centralEntryEnd;
  }
  if (offset !== centralOffset + centralSize) throw new TypeError('ZIP central-directory byte count disagrees with parsed entries.');
  localSpans.sort((left, right) => left.start - right.start);
  let localCursor = 0;
  for (const span of localSpans) {
    if (span.start !== localCursor) throw new TypeError(`ZIP local entry spans are not complete and adjacent before ${span.name}.`);
    localCursor = span.end;
  }
  if (localCursor !== centralOffset) throw new TypeError('ZIP local entry spans do not completely cover the bytes before the central directory.');
  return entries;
}

export function parseReleases(text, directory) {
  const releaseLines = String(text).trim().split(/\r?\n/).filter(Boolean);
  if (releaseLines.length === 0) throw new TypeError('RELEASES contains no package entries.');
  const packages = [];
  for (const line of releaseLines) {
    const match = /^([0-9A-F]{40})\s+([^\\/]+\.nupkg)\s+([1-9][0-9]*)$/i.exec(line.trim());
    if (!match) throw new TypeError(`Invalid RELEASES entry: ${line}`);
    const packagePath = path.join(directory, match[2]);
    const packageBuffer = fs.readFileSync(packagePath);
    if (packageBuffer.length !== Number(match[3])) throw new TypeError(`Package byte count disagrees with RELEASES: ${match[2]}`);
    const sha1 = digest('sha1', packageBuffer);
    if (sha1 !== match[1].toLowerCase()) throw new TypeError(`Package SHA-1 disagrees with RELEASES: ${match[2]}`);
    packages.push({ name: match[2], path: packagePath, bytes: packageBuffer.length, sha1, sha256: digest('sha256', packageBuffer) });
  }
  return packages;
}

export function validateSquirrelPackageSet(packages, deltaFeed) {
  if (!Array.isArray(packages)) throw new TypeError('Squirrel package validation requires a package inventory.');
  let firstRelease;
  try {
    firstRelease = validateDeltaFeedState(deltaFeed);
  } catch {
    throw new TypeError('Later releases require fail-closed prior full-package acquisition and delta generation before publication.');
  }
  const fullPackages = packages.filter((item) => /-full\.nupkg$/i.test(item?.name || ''));
  const deltaPackages = packages.filter((item) => /-delta\.nupkg$/i.test(item?.name || ''));
  if (firstRelease.status === 'first-release-no-previous-package' && deltaPackages.length !== 0) {
    throw new TypeError('The first release must not invent a delta package without a previous full package.');
  }
  if (fullPackages.length !== 1 || packages.length !== 1) {
    throw new TypeError(`The first release requires exactly one full Squirrel package and no other package, received ${fullPackages.length} full and ${packages.length} total.`);
  }
  return { fullPackages, deltaPackages, deltaFeed: structuredClone(firstRelease) };
}

function isXmlCodePoint(value) {
  return value === 0x09
    || value === 0x0a
    || value === 0x0d
    || (value >= 0x20 && value <= 0xd7ff)
    || (value >= 0xe000 && value <= 0xfffd)
    || (value >= 0x10000 && value <= 0x10ffff);
}

function decodeXmlEntities(value, label) {
  let result = '';
  let cursor = 0;
  while (cursor < value.length) {
    const ampersand = value.indexOf('&', cursor);
    if (ampersand === -1) {
      result += value.slice(cursor);
      break;
    }
    result += value.slice(cursor, ampersand);
    const semicolon = value.indexOf(';', ampersand + 1);
    if (semicolon === -1) throw new TypeError(`${label} contains an unterminated XML entity reference.`);
    const entity = value.slice(ampersand + 1, semicolon);
    const predefined = { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' };
    if (Object.hasOwn(predefined, entity)) {
      result += predefined[entity];
    } else {
      const hexadecimal = /^#x([0-9a-f]+)$/i.exec(entity);
      const decimal = /^#([0-9]+)$/.exec(entity);
      const codePoint = hexadecimal ? Number.parseInt(hexadecimal[1], 16) : decimal ? Number.parseInt(decimal[1], 10) : Number.NaN;
      if (!Number.isSafeInteger(codePoint) || !isXmlCodePoint(codePoint)) {
        throw new TypeError(`${label} contains an unsupported, external, or invalid XML entity reference.`);
      }
      result += String.fromCodePoint(codePoint);
    }
    cursor = semicolon + 1;
  }
  return result;
}

function readXmlName(source, start, label) {
  const first = source[start];
  if (!first || !/[A-Za-z_]/.test(first)) throw new TypeError(`${label} contains an invalid XML name.`);
  let cursor = start + 1;
  while (cursor < source.length && /[A-Za-z0-9_.:-]/.test(source[cursor])) cursor += 1;
  return { name: source.slice(start, cursor), cursor };
}

function parseXmlStartTag(source, label) {
  let cursor = 0;
  const skipWhitespace = () => {
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
  };
  skipWhitespace();
  const tag = readXmlName(source, cursor, label);
  cursor = tag.cursor;
  const attributes = new Map();
  while (cursor < source.length) {
    skipWhitespace();
    if (cursor >= source.length) break;
    if (attributes.size >= MAX_XML_ATTRIBUTES) throw new TypeError(`${label} contains too many XML attributes.`);
    const attribute = readXmlName(source, cursor, label);
    cursor = attribute.cursor;
    skipWhitespace();
    if (source[cursor] !== '=') throw new TypeError(`${label} contains an XML attribute without an equals sign.`);
    cursor += 1;
    skipWhitespace();
    const quote = source[cursor];
    if (quote !== '"' && quote !== "'") throw new TypeError(`${label} contains an unquoted XML attribute.`);
    cursor += 1;
    const end = source.indexOf(quote, cursor);
    if (end === -1) throw new TypeError(`${label} contains an unterminated XML attribute.`);
    if (attributes.has(attribute.name)) throw new TypeError(`${label} contains a duplicate XML attribute: ${attribute.name}.`);
    attributes.set(attribute.name, decodeXmlEntities(source.slice(cursor, end), label));
    cursor = end + 1;
  }
  return { name: tag.name, attributes };
}

function findXmlTagEnd(source, start, label) {
  let quote = null;
  for (let cursor = start; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '>') return cursor;
  }
  throw new TypeError(`${label} contains an unterminated XML tag.`);
}

function parseXmlDocument(source, label) {
  const stack = [];
  let root = null;
  let rootClosed = false;
  let declarationSeen = false;
  let elementCount = 0;
  let cursor = 0;

  const appendText = (raw) => {
    const text = decodeXmlEntities(raw, label);
    if (stack.length === 0) {
      if (text.trim()) throw new TypeError(`${label} contains text outside its root XML element.`);
    } else {
      stack[stack.length - 1].text += text;
    }
  };

  while (cursor < source.length) {
    const opening = source.indexOf('<', cursor);
    if (opening === -1) {
      appendText(source.slice(cursor));
      cursor = source.length;
      break;
    }
    appendText(source.slice(cursor, opening));
    cursor = opening;

    if (source.startsWith('<!--', cursor)) {
      const end = source.indexOf('-->', cursor + 4);
      if (end === -1 || source.slice(cursor + 4, end).includes('--')) throw new TypeError(`${label} contains a malformed XML comment.`);
      cursor = end + 3;
      continue;
    }
    if (source.startsWith('<?', cursor)) {
      const end = source.indexOf('?>', cursor + 2);
      if (end === -1) throw new TypeError(`${label} contains an unterminated XML processing instruction.`);
      const instruction = source.slice(cursor + 2, end).trim();
      if (declarationSeen || root || stack.length !== 0 || !/^xml(?:\s|$)/.test(instruction)) {
        throw new TypeError(`${label} contains an unsupported XML processing instruction.`);
      }
      declarationSeen = true;
      cursor = end + 2;
      continue;
    }
    if (source.startsWith('<!', cursor)) {
      throw new TypeError(`${label} rejects XML DTD, entity, CDATA, and external declaration syntax.`);
    }
    if (source.startsWith('</', cursor)) {
      const end = source.indexOf('>', cursor + 2);
      if (end === -1) throw new TypeError(`${label} contains an unterminated XML closing tag.`);
      const closingSource = source.slice(cursor + 2, end).trim();
      const closing = readXmlName(closingSource, 0, label);
      if (closing.cursor !== closingSource.length || stack.length === 0 || stack[stack.length - 1].name !== closing.name) {
        throw new TypeError(`${label} contains a mismatched XML closing tag.`);
      }
      stack.pop();
      if (stack.length === 0) rootClosed = true;
      cursor = end + 1;
      continue;
    }

    if (rootClosed) throw new TypeError(`${label} contains more than one root XML element.`);
    const end = findXmlTagEnd(source, cursor + 1, label);
    let tagSource = source.slice(cursor + 1, end).trim();
    const selfClosing = tagSource.endsWith('/');
    if (selfClosing) tagSource = tagSource.slice(0, -1).trimEnd();
    const parsed = parseXmlStartTag(tagSource, label);
    elementCount += 1;
    if (elementCount > MAX_XML_ELEMENTS) throw new TypeError(`${label} contains too many XML elements.`);
    const node = { ...parsed, children: [], text: '' };
    if (stack.length > 0) stack[stack.length - 1].children.push(node);
    else if (root) throw new TypeError(`${label} contains more than one root XML element.`);
    else root = node;
    if (!selfClosing) {
      stack.push(node);
      if (stack.length > MAX_XML_DEPTH) throw new TypeError(`${label} exceeds the bounded XML nesting depth.`);
    } else if (stack.length === 0) {
      rootClosed = true;
    }
    cursor = end + 1;
  }

  if (!root || stack.length !== 0) throw new TypeError(`${label} contains an incomplete XML document.`);
  return root;
}

function collectXmlElements(node, target, results = []) {
  if (node.name === target) results.push(node);
  for (const child of node.children) collectXmlElements(child, target, results);
  return results;
}

export function parseNuspecMetadata(buffer, nuspecEntry, fullPackageName) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_NUSPEC_BYTES) {
    throw new TypeError(`NuGet specification must contain between 1 and ${MAX_NUSPEC_BYTES} bytes.`);
  }
  let source;
  try {
    source = fatalUtf8Decoder.decode(buffer);
  } catch {
    throw new TypeError('NuGet specification is not valid UTF-8.');
  }
  if (source.includes('\0')) throw new TypeError('NuGet specification contains a forbidden NUL character.');
  const root = parseXmlDocument(source, 'NuGet specification');
  const packages = collectXmlElements(root, 'package');
  const metadataRecords = collectXmlElements(root, 'metadata');
  const ids = collectXmlElements(root, 'id');
  const versions = collectXmlElements(root, 'version');
  if (packages.length !== 1 || root.name !== 'package') throw new TypeError('NuGet specification requires exactly one package root element.');
  if (metadataRecords.length !== 1 || !root.children.includes(metadataRecords[0])) throw new TypeError('NuGet specification requires exactly one direct metadata element.');
  const metadata = metadataRecords[0];
  if (ids.length !== 1 || !metadata.children.includes(ids[0]) || ids[0].children.length !== 0) {
    throw new TypeError('NuGet specification requires exactly one direct text-only id element.');
  }
  if (versions.length !== 1 || !metadata.children.includes(versions[0]) || versions[0].children.length !== 0) {
    throw new TypeError('NuGet specification requires exactly one direct text-only version element.');
  }
  const id = ids[0].text.trim();
  const version = versions[0].text.trim();
  if (!id || !version || /\s/.test(id) || /\s/.test(version)) throw new TypeError('NuGet id and version must be non-empty single tokens.');
  const nuspecBase = path.posix.basename(nuspecEntry);
  if (nuspecBase !== `${id}.nuspec`) throw new TypeError('NuGet specification filename does not match its exact package id identity.');
  if (fullPackageName !== `${id}-${version}-full.nupkg`) throw new TypeError('Full package filename does not match the exact NuGet id and version identity.');
  return { id, version };
}

function findOne(entries, predicate, label) {
  const matches = [...entries.keys()].filter(predicate);
  if (matches.length !== 1) throw new TypeError(`Expected exactly one ${label} in the full Squirrel package, received ${matches.length}.`);
  return matches[0];
}

function readJson(buffer, label) {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new TypeError(`Packaged ${label} is not valid JSON.`);
  }
}

function inspectFullPackage(packageInfo, expected) {
  const entries = readZipEntries(fs.readFileSync(packageInfo.path));
  const asarEntry = findOne(entries, (name) => /\/resources\/app\.asar$/i.test(name), 'resources/app.asar');
  const applicationExecutableEntry = findOne(entries, (name) => /\/Hair Growth Estimator\.exe$/i.test(name), 'application executable');
  const updaterEntry = findOne(entries, (name) => /(^|\/)Update\.exe$/i.test(name), 'Update.exe');
  const nuspecEntry = findOne(entries, (name) => /\.nuspec$/i.test(name), 'NuGet specification');
  const nuspec = parseNuspecMetadata(entries.get(nuspecEntry), nuspecEntry, packageInfo.name);
  if (nuspec.version !== expected.version) throw new TypeError('Full Squirrel package NuGet version does not match package.json.');
  const applicationExecutable = entries.get(applicationExecutableEntry);
  const updaterBuffer = entries.get(updaterEntry);
  if (readPeSecurityDirectory(applicationExecutable).size !== 0) throw new TypeError('Signing policy violated: packaged application executable is signed.');

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hair-growth-asar-'));
  const asarPath = path.join(temporaryDirectory, 'app.asar');
  try {
    const asar = entries.get(asarEntry);
    fs.writeFileSync(asarPath, asar);
    const packageJson = readJson(extractFile(asarPath, 'package.json'), 'package.json');
    const provenance = readJson(extractFile(asarPath, 'app/provenance.json'), 'provenance');
    const releaseMetadata = readJson(extractFile(asarPath, 'app/release-metadata.json'), 'release metadata');
    const iconManifest = readJson(extractFile(asarPath, 'assets/icon-manifest.json'), 'icon manifest');
    const icon = extractFile(asarPath, 'assets/app-icon.ico');
    const master = extractFile(asarPath, 'assets/logo-master.svg');
    if (packageJson.version !== expected.version || provenance.version !== expected.version || releaseMetadata.version !== expected.version) {
      throw new TypeError('Full Squirrel package contains inconsistent versions.');
    }
    if (provenance.commit !== expected.commit || releaseMetadata.sourceCommit !== expected.commit) {
      throw new TypeError('Full Squirrel package is not bound to the intended source commit.');
    }
    if (iconManifest.schemaVersion !== 2 || iconManifest.masterSha256 !== digest('sha256', master) || iconManifest.ico?.sha256 !== digest('sha256', icon)) {
      throw new TypeError('Full Squirrel package icon does not match its SVG master and generated manifest.');
    }
    const executableIconRecords = assertEmbeddedIcon(applicationExecutable, icon);
    const updater = validateUpdaterExecutable(updaterBuffer, icon, 'Full package Update.exe');
    const sourceBinding = {
      appAsar: validateAsarSourceBinding(asarPath, expected),
      server: validateServerZipSourceBinding(entries, asarEntry, expected.commit)
    };
    return {
      appAsar: { entry: asarEntry, bytes: asar.length, sha256: digest('sha256', asar) },
      applicationExecutable: {
        entry: applicationExecutableEntry,
        bytes: applicationExecutable.length,
        sha256: digest('sha256', applicationExecutable),
        signing: 'NotSigned'
      },
      updater: { entry: updaterEntry, ...updater },
      updaterBuffer,
      nuget: { entry: nuspecEntry, id: nuspec.id, version: nuspec.version },
      icon: { masterSha256: iconManifest.masterSha256, icoSha256: iconManifest.ico.sha256, sizes: iconManifest.ico.sizes, executableResourceCount: executableIconRecords.length },
      iconBuffer: icon,
      releaseCodeName: releaseMetadata.codeName,
      catalogRecord: releaseMetadata.catalogRecord,
      deltaFeed: releaseMetadata.container?.deltaFeed,
      sourceBinding
    };
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function fileRecord(filePath) {
  const buffer = fs.readFileSync(filePath);
  return { file: path.basename(filePath), bytes: buffer.length, sha256: digest('sha256', buffer) };
}

export function validateInstallerDirectory(directory, options = {}) {
  const resolved = path.resolve(directory);
  const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const dependencyManifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'dependencies.manifest.json'), 'utf8'));
  const squirrelExecutableTools = dependencyManifest.npm?.squirrelExecutableTools;
  for (const [name, expectedDigest] of Object.entries(squirrelExecutableTools || {})) {
    const toolPath = path.join(repositoryRoot, 'node_modules', 'electron-winstaller', 'vendor', name);
    if (!fs.existsSync(toolPath) || digest('sha256', fs.readFileSync(toolPath)) !== expectedDigest) {
      throw new TypeError(`Pinned Squirrel tool provenance is invalid: ${name}.`);
    }
  }
  if (Object.keys(squirrelExecutableTools || {}).length !== 3) throw new TypeError('Pinned Squirrel tool provenance inventory is incomplete.');
  const provenance = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'app', 'provenance.json'), 'utf8'));
  const contextPath = path.join(repositoryRoot, 'dist', 'release', 'release-context.json');
  const context = options.context || JSON.parse(fs.readFileSync(contextPath, 'utf8'));
  const expected = {
    ...context,
    version: options.version || context.version || packageJson.version,
    commit: options.commit || context.commit || provenance.commit
  };
  if (!/^\d+\.\d+\.\d+$/.test(expected.version) || !/^[0-9a-f]{40}$/.test(expected.commit)) throw new TypeError('Installer validator requires exact version and source commit.');
  const entries = fs.readdirSync(resolved, { withFileTypes: true }).filter((entry) => entry.isFile());
  const expectedSetupName = `HairGrowthEstimator-Setup-${expected.version}-x64.exe`;
  const setups = entries.filter((entry) => /setup.*\.exe$/i.test(entry.name));
  if (setups.length !== 1 || setups[0].name !== expectedSetupName) throw new TypeError(`Expected exactly ${expectedSetupName}.`);
  const setupPath = path.join(resolved, setups[0].name);
  const setup = fs.readFileSync(setupPath);
  if (setup.length < 1024 * 1024) throw new TypeError('Setup executable is implausibly small.');
  if (readPeSecurityDirectory(setup).size !== 0) throw new TypeError('Signing policy violated: Setup contains an Authenticode certificate table.');

  const releasesPath = path.join(resolved, 'RELEASES');
  const packages = parseReleases(fs.readFileSync(releasesPath, 'utf8'), resolved);
  const fullPackages = packages.filter((item) => /-full\.nupkg$/i.test(item.name));
  if (fullPackages.length !== 1) throw new TypeError(`Expected exactly one full Squirrel package, received ${fullPackages.length}.`);
  if (!fullPackages[0].name.includes(`-${expected.version}-full.nupkg`)) throw new TypeError('Full Squirrel package filename does not contain the intended version.');
  const fullPackageBytes = fs.readFileSync(fullPackages[0].path);
  const inspected = inspectFullPackage(fullPackages[0], expected);
  const setupPayload = assertSetupPayloadEntries(setupPayloadEntries(setup), fullPackages[0].name, fullPackageBytes, {
    ...inspected.updater,
    buffer: inspected.updaterBuffer,
    icon: inspected.iconBuffer
  });
  const packageSet = validateSquirrelPackageSet(packages, inspected.deltaFeed);
  const { iconBuffer, updaterBuffer, deltaFeed, ...embedded } = inspected;
  const setupIconRecords = assertEmbeddedIcon(setup, iconBuffer);
  const releaseIndex = fileRecord(releasesPath);
  const setupRecord = { ...fileRecord(setupPath), signing: 'NotSigned' };
  const manifest = {
    schemaVersion: 2,
    installerFamily: 'Squirrel.Windows',
    version: expected.version,
    sourceCommit: expected.commit,
    platform: 'win32',
    architecture: 'x64',
    signing: 'NotSigned',
    releaseIdentity: releaseIdentity(context),
    releaseIdentitySha256: releaseIdentitySha256(context),
    setup: { ...setupRecord, iconResourceCount: setupIconRecords.length, iconSha256: embedded.icon.icoSha256, payload: setupPayload },
    releaseIndex,
    deltaFeed: packageSet.deltaFeed,
    packages: packages.map(({ name, bytes, sha1, sha256 }) => ({ file: name, bytes, sha1, sha256, type: /-full\.nupkg$/i.test(name) ? 'full' : 'delta' })),
    squirrelToolProvenance: {
      vendorExecutables: squirrelExecutableTools,
      transformedUpdaterSha256: embedded.updater.sha256
    },
    embedded
  };
  if (manifest.packages.some((item) => item.bytes < 1 || !/^[0-9a-f]{64}$/.test(item.sha256))) throw new TypeError('Installer manifest contains an invalid package record.');
  return manifest;
}

function atomicJsonWrite(target, value) {
  atomicWriteFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const directory = path.resolve(process.argv[2] || path.join(repositoryRoot, 'dist', 'squirrel-windows'));
  const result = validateInstallerDirectory(directory);
  const manifestPath = path.join(directory, 'release-manifest.json');
  atomicJsonWrite(manifestPath, result);
  process.stdout.write('Validated genuine unsigned Squirrel.Windows release files.\n');
  process.stdout.write(`Setup: ${result.setup.file}, ${result.setup.bytes} bytes, SHA-256 ${result.setup.sha256}.\n`);
  process.stdout.write(`RELEASES: ${result.releaseIndex.sha256}. Packages: ${result.packages.length}.\n`);
  process.stdout.write(`app.asar: ${result.embedded.appAsar.sha256}. Source commit: ${result.sourceCommit}.\n`);
  process.stdout.write(`Signing: ${result.signing}, PE certificate tables absent.\n`);
}

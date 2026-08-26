'use strict';

const net = require('node:net');

const ADDRESS_CATEGORIES = Object.freeze([
  'public',
  'loopback',
  'private',
  'link-local',
  'metadata',
  'unspecified',
  'multicast',
  'reserved',
  'ipv4-mapped'
]);
const MAX_RESOLVED_ADDRESSES = 16;
const MAX_URL_LENGTH = 2048;
const MAX_SOURCE_SCOPE_LENGTH = 4096;
const MAX_CREDENTIAL_REF_LENGTH = 128;
const MAX_ENTITY_ID_LENGTH = 253;
const APPROVED_NETWORK_SCOPE = Symbol('approved-network-scope');
const SCHEDULED_SOURCE_NETWORK_PLAN = Symbol('scheduled-source-network-plan');

const IPV4_METADATA_RANGES = Object.freeze([
  Object.freeze(['169.254.169.254', 32]),
  Object.freeze(['169.254.170.2', 32]),
  Object.freeze(['168.63.129.16', 32]),
  Object.freeze(['100.100.100.200', 32])
]);

const IPV4_PRIVATE_RANGES = Object.freeze([
  Object.freeze(['10.0.0.0', 8]),
  Object.freeze(['172.16.0.0', 12]),
  Object.freeze(['192.168.0.0', 16])
]);

const IPV4_RESERVED_RANGES = Object.freeze([
  Object.freeze(['0.0.0.0', 8]),
  Object.freeze(['100.64.0.0', 10]),
  Object.freeze(['192.0.0.0', 24]),
  Object.freeze(['192.0.2.0', 24]),
  Object.freeze(['192.31.196.0', 24]),
  Object.freeze(['192.52.193.0', 24]),
  Object.freeze(['192.88.99.0', 24]),
  Object.freeze(['192.175.48.0', 24]),
  Object.freeze(['198.18.0.0', 15]),
  Object.freeze(['198.51.100.0', 24]),
  Object.freeze(['203.0.113.0', 24]),
  Object.freeze(['240.0.0.0', 4])
]);

const IPV6_METADATA_RANGES = Object.freeze([
  Object.freeze(['fd00:ec2::254', 128])
]);

const IPV6_RESERVED_RANGES = Object.freeze([
  Object.freeze(['2001::', 23]),
  Object.freeze(['2001:db8::', 32]),
  Object.freeze(['2002::', 16]),
  Object.freeze(['3fff::', 20])
]);

const METADATA_HOSTS = new Set([
  'metadata',
  'metadata.google.internal',
  'metadata.azure.internal',
  'instance-data',
  'instance-data.ec2.internal'
]);

function policyError(ErrorType, code, message) {
  const error = new ErrorType(message);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requirePlainObject(value, code, message) {
  if (!isPlainObject(value)) throw policyError(TypeError, code, message);
  return value;
}

function requireExactFields(object, allowed, required, code, message) {
  for (const field of Object.keys(object)) {
    if (!allowed.has(field)) throw policyError(TypeError, code, message);
  }
  for (const field of required) {
    if (!Object.prototype.hasOwnProperty.call(object, field)) {
      throw policyError(TypeError, code, message);
    }
  }
}

function boundedString(value, maximum, code, message) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximum ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw policyError(TypeError, code, message);
  }
  return value;
}

function ipv4Number(address) {
  return address.split('.').reduce((value, octet) => (value << 8n) | BigInt(Number(octet)), 0n);
}

function normalizeIpv4(address) {
  if (net.isIP(address) !== 4) {
    throw policyError(TypeError, 'ERR_NETWORK_ADDRESS_INVALID', 'Resolved addresses must be canonical IPv4 or IPv6 literals.');
  }
  const octets = address.split('.');
  if (
    octets.length !== 4 ||
    octets.some((octet) => !/^(?:0|[1-9]\d{0,2})$/.test(octet) || Number(octet) > 255)
  ) {
    throw policyError(TypeError, 'ERR_NETWORK_ADDRESS_INVALID', 'Resolved addresses must be canonical IPv4 or IPv6 literals.');
  }
  return octets.map((octet) => String(Number(octet))).join('.');
}

function normalizeIpv6(address) {
  if (typeof address !== 'string' || address.includes('%') || net.isIP(address) !== 6) {
    throw policyError(TypeError, 'ERR_NETWORK_ADDRESS_INVALID', 'Resolved addresses must be canonical IPv4 or IPv6 literals.');
  }
  try {
    return new URL(`http://[${address}]/`).hostname.slice(1, -1).toLowerCase();
  } catch {
    throw policyError(TypeError, 'ERR_NETWORK_ADDRESS_INVALID', 'Resolved addresses must be canonical IPv4 or IPv6 literals.');
  }
}

function ipv6Number(address) {
  const normalized = normalizeIpv6(address);
  const halves = normalized.split('::');
  if (halves.length > 2) {
    throw policyError(TypeError, 'ERR_NETWORK_ADDRESS_INVALID', 'Resolved addresses must be canonical IPv4 or IPv6 literals.');
  }
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) {
    throw policyError(TypeError, 'ERR_NETWORK_ADDRESS_INVALID', 'Resolved addresses must be canonical IPv4 or IPv6 literals.');
  }
  const words = halves.length === 2
    ? [...left, ...Array.from({ length: missing }, () => '0'), ...right]
    : left;
  if (words.length !== 8) {
    throw policyError(TypeError, 'ERR_NETWORK_ADDRESS_INVALID', 'Resolved addresses must be canonical IPv4 or IPv6 literals.');
  }
  return words.reduce((value, word) => (value << 16n) | BigInt(`0x${word || '0'}`), 0n);
}

function ipv4InRange(address, base, prefix) {
  const shift = BigInt(32 - prefix);
  return (ipv4Number(address) >> shift) === (ipv4Number(base) >> shift);
}

function ipv6InRange(address, base, prefix) {
  const shift = BigInt(128 - prefix);
  return (ipv6Number(address) >> shift) === (ipv6Number(base) >> shift);
}

function matchesAnyIpv4Range(address, ranges) {
  return ranges.some(([base, prefix]) => ipv4InRange(address, base, prefix));
}

function matchesAnyIpv6Range(address, ranges) {
  return ranges.some(([base, prefix]) => ipv6InRange(address, base, prefix));
}

function classifyIpv4(address) {
  if (matchesAnyIpv4Range(address, IPV4_METADATA_RANGES)) return 'metadata';
  if (address === '0.0.0.0') return 'unspecified';
  if (ipv4InRange(address, '127.0.0.0', 8)) return 'loopback';
  if (matchesAnyIpv4Range(address, IPV4_PRIVATE_RANGES)) return 'private';
  if (ipv4InRange(address, '169.254.0.0', 16)) return 'link-local';
  if (ipv4InRange(address, '224.0.0.0', 4)) return 'multicast';
  if (matchesAnyIpv4Range(address, IPV4_RESERVED_RANGES)) return 'reserved';
  return 'public';
}

function classifyIpv6(address) {
  if (ipv6InRange(address, '::ffff:0:0', 96)) return 'ipv4-mapped';
  if (matchesAnyIpv6Range(address, IPV6_METADATA_RANGES)) return 'metadata';
  if (address === '::') return 'unspecified';
  if (address === '::1') return 'loopback';
  if (ipv6InRange(address, 'fc00::', 7)) return 'private';
  if (ipv6InRange(address, 'fe80::', 10)) return 'link-local';
  if (ipv6InRange(address, 'ff00::', 8)) return 'multicast';
  if (!ipv6InRange(address, '2000::', 3)) return 'reserved';
  if (matchesAnyIpv6Range(address, IPV6_RESERVED_RANGES)) return 'reserved';
  return 'public';
}

function classifyIpAddress(value) {
  const family = net.isIP(value);
  if (family === 4) {
    const address = normalizeIpv4(value);
    return Object.freeze({ address, family, category: classifyIpv4(address) });
  }
  if (family === 6) {
    const address = normalizeIpv6(value);
    return Object.freeze({ address, family, category: classifyIpv6(address) });
  }
  throw policyError(TypeError, 'ERR_NETWORK_ADDRESS_INVALID', 'Resolved addresses must be canonical IPv4 or IPv6 literals.');
}

function looksLikeNumericAlias(hostname) {
  if (typeof hostname !== 'string' || hostname.length < 1) return false;
  if (net.isIP(hostname)) return false;
  return /^(?:0x[0-9a-f]+|0[0-7]+|\d+)(?:\.(?:0x[0-9a-f]+|0[0-7]+|\d+)){0,3}$/i.test(hostname);
}

function classifyHost(value) {
  const supplied = boundedString(
    value,
    253,
    'ERR_NETWORK_HOST_INVALID',
    'The source hostname must be a canonical DNS name or IP literal.'
  );
  const unbracketed = supplied.startsWith('[') && supplied.endsWith(']')
    ? supplied.slice(1, -1)
    : supplied;
  const normalized = unbracketed.toLowerCase();
  if (looksLikeNumericAlias(normalized)) {
    return Object.freeze({ hostname: normalized, kind: 'numeric-alias', category: 'numeric-alias' });
  }
  const family = net.isIP(normalized);
  if (family) {
    const address = classifyIpAddress(normalized);
    return Object.freeze({ hostname: address.address, kind: 'ip', category: address.category, family });
  }
  if (normalized === 'localhost') {
    return Object.freeze({ hostname: normalized, kind: 'name', category: 'loopback' });
  }
  if (normalized.endsWith('.localhost')) {
    return Object.freeze({ hostname: normalized, kind: 'name', category: 'reserved' });
  }
  if (METADATA_HOSTS.has(normalized) || normalized.endsWith('.metadata.google.internal')) {
    return Object.freeze({ hostname: normalized, kind: 'name', category: 'metadata' });
  }
  if (
    normalized.length > 253 ||
    normalized.endsWith('.') ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(normalized) ||
    normalized.split('.').some((label) => label.length > 63 || label.startsWith('-') || label.endsWith('-'))
  ) {
    throw policyError(TypeError, 'ERR_NETWORK_HOST_INVALID', 'The source hostname must be a canonical DNS name or IP literal.');
  }
  return Object.freeze({ hostname: normalized, kind: 'name', category: 'dns' });
}

function rawHostnameFromUrl(value) {
  const match = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/.exec(value);
  if (!match) {
    throw policyError(TypeError, 'ERR_NETWORK_URL_INVALID', 'The scheduled source must use a canonical HTTP or HTTPS URL.');
  }
  const authority = match[1];
  const hostAndPort = authority.slice(authority.lastIndexOf('@') + 1);
  if (hostAndPort.startsWith('[')) {
    const closing = hostAndPort.indexOf(']');
    if (closing < 0) {
      throw policyError(TypeError, 'ERR_NETWORK_URL_INVALID', 'The scheduled source must use a canonical HTTP or HTTPS URL.');
    }
    return hostAndPort.slice(1, closing);
  }
  const portSeparator = hostAndPort.lastIndexOf(':');
  if (portSeparator > -1 && /^\d+$/.test(hostAndPort.slice(portSeparator + 1))) {
    return hostAndPort.slice(0, portSeparator);
  }
  return hostAndPort;
}

function normalizeUrl(value, options = {}) {
  const supplied = boundedString(
    value,
    MAX_URL_LENGTH,
    'ERR_NETWORK_URL_INVALID',
    'The scheduled source must use a canonical HTTP or HTTPS URL.'
  );
  let url;
  try {
    url = new URL(supplied);
  } catch {
    throw policyError(TypeError, 'ERR_NETWORK_URL_INVALID', 'The scheduled source must use a canonical HTTP or HTTPS URL.');
  }
  if (url.username || url.password) {
    throw policyError(TypeError, 'ERR_NETWORK_URL_CREDENTIALS', 'Scheduled source URLs must not contain embedded credentials.');
  }
  if (url.hash) {
    throw policyError(TypeError, 'ERR_NETWORK_URL_FRAGMENT', 'Scheduled source URLs must not contain fragments.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw policyError(TypeError, 'ERR_NETWORK_URL_PROTOCOL', 'Scheduled source URLs must use HTTP or HTTPS.');
  }
  const rawHostname = rawHostnameFromUrl(supplied);
  const rawHostClassification = classifyHost(rawHostname);
  if (rawHostClassification.category === 'numeric-alias') {
    throw policyError(TypeError, 'ERR_NETWORK_NUMERIC_ALIAS', 'Noncanonical numeric hostname aliases are not accepted.');
  }
  if (url.href !== supplied) {
    throw policyError(TypeError, 'ERR_NETWORK_URL_CANONICAL', 'The scheduled source URL must use its canonical spelling.');
  }
  if (options.base && (url.search || !url.pathname.endsWith('/'))) {
    throw policyError(TypeError, 'ERR_NETWORK_BASE_URL', 'A Home Assistant base URL must end with a slash and contain no query.');
  }
  const hostname = url.hostname.startsWith('[') && url.hostname.endsWith(']')
    ? url.hostname.slice(1, -1)
    : url.hostname;
  const host = classifyHost(hostname);
  if (host.category === 'metadata') {
    throw policyError(TypeError, 'ERR_NETWORK_HOST_SCOPE', 'Metadata service hostnames are never accepted as scheduled sources.');
  }
  return { url, host };
}

function normalizeCredentialRef(value) {
  const reference = boundedString(
    value,
    MAX_CREDENTIAL_REF_LENGTH,
    'ERR_NETWORK_CREDENTIAL_REF',
    'The Home Assistant credential reference is invalid.'
  );
  if (!/^[A-Za-z0-9._:-]+$/.test(reference)) {
    throw policyError(TypeError, 'ERR_NETWORK_CREDENTIAL_REF', 'The Home Assistant credential reference is invalid.');
  }
  return reference;
}

function normalizeEntityId(value) {
  const entityId = boundedString(
    value,
    MAX_ENTITY_ID_LENGTH,
    'ERR_NETWORK_ENTITY_ID',
    'The Home Assistant entity identifier is invalid.'
  );
  if (!/^(?:binary_sensor|input_boolean)\.[a-z0-9_]+$/.test(entityId)) {
    throw policyError(TypeError, 'ERR_NETWORK_ENTITY_ID', 'The Home Assistant entity identifier is invalid.');
  }
  return entityId;
}

function normalizeSource(input) {
  const source = requirePlainObject(
    input,
    'ERR_NETWORK_SOURCE',
    'A normalized scheduled source is required.'
  );
  if (source.type === 'api') {
    requireExactFields(
      source,
      new Set(['type', 'url']),
      ['type', 'url'],
      'ERR_NETWORK_SOURCE_FIELDS',
      'The scheduled source contains unsupported fields.'
    );
    const normalizedUrl = normalizeUrl(source.url);
    return {
      type: 'api',
      url: normalizedUrl.url,
      host: normalizedUrl.host,
      canonicalSourceScope: `api:${normalizedUrl.url.href}`,
      credentialBinding: null
    };
  }
  if (source.type === 'home-assistant') {
    requireExactFields(
      source,
      new Set(['type', 'baseUrl', 'entityId', 'credentialRef']),
      ['type', 'baseUrl', 'entityId', 'credentialRef'],
      'ERR_NETWORK_SOURCE_FIELDS',
      'The scheduled source contains unsupported fields.'
    );
    const normalizedBase = normalizeUrl(source.baseUrl, { base: true });
    const entityId = normalizeEntityId(source.entityId);
    const credentialRef = normalizeCredentialRef(source.credentialRef);
    const requestUrl = new URL(`api/states/${entityId}`, normalizedBase.url);
    const canonicalSourceScope = `home-assistant:${normalizedBase.url.href}|${entityId}|${credentialRef}`;
    return {
      type: 'home-assistant',
      url: requestUrl,
      host: normalizedBase.host,
      canonicalSourceScope,
      credentialBinding: {
        credentialRef,
        canonicalSourceScope,
        requestOrigin: requestUrl.origin,
        requestUrl: requestUrl.href
      }
    };
  }
  throw policyError(TypeError, 'ERR_NETWORK_SOURCE_TYPE', 'The scheduled source type must be api or home-assistant.');
}

function canonicalScheduledSourceScope(source) {
  return normalizeSource(source).canonicalSourceScope;
}

function normalizeResolvedAddresses(input) {
  if (!Array.isArray(input)) {
    throw policyError(TypeError, 'ERR_NETWORK_RESOLUTION_TYPE', 'Resolved addresses must be a bounded array.');
  }
  if (input.length < 1) {
    throw policyError(TypeError, 'ERR_NETWORK_RESOLUTION_EMPTY', 'At least one resolved address is required.');
  }
  if (input.length > MAX_RESOLVED_ADDRESSES) {
    throw policyError(RangeError, 'ERR_NETWORK_RESOLUTION_LIMIT', 'The resolved address count exceeds the fixed limit.');
  }
  const seen = new Set();
  const normalized = input.map((record) => {
    const value = requirePlainObject(
      record,
      'ERR_NETWORK_RESOLUTION_RECORD',
      'Every resolved address must contain only address and family.'
    );
    requireExactFields(
      value,
      new Set(['address', 'family']),
      ['address', 'family'],
      'ERR_NETWORK_RESOLUTION_RECORD',
      'Every resolved address must contain only address and family.'
    );
    const classified = classifyIpAddress(value.address);
    if (value.family !== classified.family) {
      throw policyError(TypeError, 'ERR_NETWORK_ADDRESS_FAMILY', 'A resolved address family does not match its address.');
    }
    const identity = `${classified.family}:${classified.address}`;
    if (seen.has(identity)) {
      throw policyError(TypeError, 'ERR_NETWORK_RESOLUTION_DUPLICATE', 'Resolved addresses must not contain duplicates.');
    }
    seen.add(identity);
    return Object.freeze({
      address: classified.address,
      family: classified.family,
      category: classified.category
    });
  });
  return Object.freeze(normalized);
}

function normalizeApprovedAddresses(input, kind) {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_RESOLVED_ADDRESSES) {
    throw policyError(TypeError, 'ERR_NETWORK_APPROVAL_ADDRESSES', 'An approved scope requires a bounded exact address set.');
  }
  const expectedCategory = kind === 'loopback' ? 'loopback' : 'private';
  const seen = new Set();
  const addresses = input.map((value) => {
    const classified = classifyIpAddress(value);
    if (value !== classified.address || classified.category !== expectedCategory) {
      throw policyError(TypeError, 'ERR_NETWORK_APPROVAL_ADDRESS_SCOPE', 'An approved address is outside the selected scope.');
    }
    const identity = `${classified.family}:${classified.address}`;
    if (seen.has(identity)) {
      throw policyError(TypeError, 'ERR_NETWORK_APPROVAL_ADDRESSES', 'An approved scope requires a bounded exact address set.');
    }
    seen.add(identity);
    return classified.address;
  });
  return Object.freeze(addresses);
}

function normalizeOrigin(value, kind) {
  const supplied = boundedString(
    value,
    MAX_URL_LENGTH,
    'ERR_NETWORK_APPROVAL_ORIGIN',
    'An approved scope must name one exact canonical origin.'
  );
  let origin;
  try {
    origin = new URL(supplied);
  } catch {
    throw policyError(TypeError, 'ERR_NETWORK_APPROVAL_ORIGIN', 'An approved scope must name one exact canonical origin.');
  }
  if (
    origin.origin !== supplied ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    !['http:', 'https:'].includes(origin.protocol)
  ) {
    throw policyError(TypeError, 'ERR_NETWORK_APPROVAL_ORIGIN', 'An approved scope must name one exact canonical origin.');
  }
  const host = classifyHost(rawHostnameFromUrl(supplied));
  if (host.category === 'numeric-alias' || host.category === 'metadata') {
    throw policyError(TypeError, 'ERR_NETWORK_APPROVAL_ORIGIN', 'An approved scope must name one exact canonical origin.');
  }
  if (kind === 'private-lan' && origin.protocol !== 'https:') {
    throw policyError(TypeError, 'ERR_NETWORK_APPROVAL_ORIGIN', 'Approved private LAN sources must use HTTPS.');
  }
  return origin.origin;
}

function createApprovedNetworkScope(input) {
  const approval = requirePlainObject(
    input,
    'ERR_NETWORK_APPROVAL',
    'An exact approved network scope is required.'
  );
  requireExactFields(
    approval,
    new Set(['kind', 'canonicalSourceScope', 'origin', 'addresses']),
    ['kind', 'canonicalSourceScope', 'origin', 'addresses'],
    'ERR_NETWORK_APPROVAL_FIELDS',
    'The approved network scope contains unsupported fields.'
  );
  if (!['loopback', 'private-lan'].includes(approval.kind)) {
    throw policyError(TypeError, 'ERR_NETWORK_APPROVAL_KIND', 'The approved scope kind must be loopback or private-lan.');
  }
  const canonicalSourceScope = boundedString(
    approval.canonicalSourceScope,
    MAX_SOURCE_SCOPE_LENGTH,
    'ERR_NETWORK_APPROVAL_SCOPE',
    'An approved scope must bind one canonical scheduled source.'
  );
  const result = {
    kind: approval.kind,
    canonicalSourceScope,
    origin: normalizeOrigin(approval.origin, approval.kind),
    addresses: normalizeApprovedAddresses(approval.addresses, approval.kind)
  };
  Object.defineProperty(result, APPROVED_NETWORK_SCOPE, { value: true });
  return deepFreeze(result);
}

function assertApprovedNetworkScope(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    input[APPROVED_NETWORK_SCOPE] !== true ||
    !Object.isFrozen(input)
  ) {
    throw policyError(TypeError, 'ERR_NETWORK_APPROVAL_UNOBSERVED', 'The network scope approval must come from the policy boundary.');
  }
  return input;
}

function sameAddressSet(records, addresses) {
  const left = records.map(({ address }) => address).sort();
  const right = [...addresses].sort();
  return left.length === right.length && left.every((address, index) => address === right[index]);
}

function assertLiteralHostResolution(host, resolvedAddresses) {
  if (host.kind !== 'ip') return;
  if (resolvedAddresses.length !== 1 || resolvedAddresses[0].address !== host.hostname) {
    throw policyError(TypeError, 'ERR_NETWORK_LITERAL_RESOLUTION', 'An IP-literal source must connect only to that exact address.');
  }
}

function assertAddressPolicy(source, resolvedAddresses, approvedScope) {
  if (!approvedScope) {
    if (source.url.protocol === 'http:') {
      throw policyError(TypeError, 'ERR_NETWORK_HTTP_SCOPE', 'HTTP is permitted only for one explicitly approved loopback scope.');
    }
    if (source.host.category !== 'dns' && source.host.category !== 'public') {
      throw policyError(TypeError, 'ERR_NETWORK_HOST_SCOPE', 'The scheduled source hostname is outside the public scope.');
    }
    if (resolvedAddresses.some(({ category }) => category !== 'public')) {
      throw policyError(TypeError, 'ERR_NETWORK_ADDRESS_SCOPE', 'Every resolved address must remain inside the public scope.');
    }
    return { addressScope: 'public', approvalKind: null };
  }

  const approval = assertApprovedNetworkScope(approvedScope);
  if (approval.canonicalSourceScope !== source.canonicalSourceScope || approval.origin !== source.url.origin) {
    throw policyError(TypeError, 'ERR_NETWORK_APPROVAL_SCOPE', 'The approved network scope does not match this scheduled source.');
  }
  if (!sameAddressSet(resolvedAddresses, approval.addresses)) {
    throw policyError(TypeError, 'ERR_NETWORK_APPROVAL_ADDRESSES', 'The resolved address set does not exactly match the approved scope.');
  }
  if (approval.kind === 'loopback') {
    if (source.host.category !== 'loopback') {
      throw policyError(TypeError, 'ERR_NETWORK_APPROVAL_SCOPE', 'A loopback approval requires an exact loopback hostname or address.');
    }
    if (resolvedAddresses.some(({ category }) => category !== 'loopback')) {
      throw policyError(TypeError, 'ERR_NETWORK_ADDRESS_SCOPE', 'Every resolved address must remain inside the approved loopback scope.');
    }
    return { addressScope: 'loopback', approvalKind: 'loopback' };
  }
  if (source.url.protocol !== 'https:') {
    throw policyError(TypeError, 'ERR_NETWORK_HTTP_SCOPE', 'Approved private LAN sources must use HTTPS.');
  }
  if (!['dns', 'private'].includes(source.host.category)) {
    throw policyError(TypeError, 'ERR_NETWORK_APPROVAL_SCOPE', 'A private LAN approval requires an exact private hostname or address.');
  }
  if (resolvedAddresses.some(({ category }) => category !== 'private')) {
    throw policyError(TypeError, 'ERR_NETWORK_ADDRESS_SCOPE', 'Every resolved address must remain inside the approved private LAN scope.');
  }
  return { addressScope: 'private', approvalKind: 'private-lan' };
}

function publicResolvedRecords(records) {
  return Object.freeze(records.map(({ address, family }) => Object.freeze({ address, family })));
}

function createScheduledSourceNetworkPlan(input) {
  const request = requirePlainObject(
    input,
    'ERR_NETWORK_PLAN_INPUT',
    'A scheduled source and its complete resolution are required.'
  );
  requireExactFields(
    request,
    new Set(['source', 'resolvedAddresses', 'approvedScope']),
    ['source', 'resolvedAddresses'],
    'ERR_NETWORK_PLAN_FIELDS',
    'The network-plan request contains unsupported fields.'
  );
  const source = normalizeSource(request.source);
  const resolvedAddresses = normalizeResolvedAddresses(request.resolvedAddresses);
  assertLiteralHostResolution(source.host, resolvedAddresses);
  const policy = assertAddressPolicy(source, resolvedAddresses, request.approvedScope || null);
  const hostname = source.host.hostname;
  const port = source.url.port
    ? Number(source.url.port)
    : source.url.protocol === 'https:' ? 443 : 80;
  const plan = {
    canonicalSourceScope: source.canonicalSourceScope,
    sourceType: source.type,
    url: source.url.href,
    origin: source.url.origin,
    protocol: source.url.protocol,
    hostname,
    port,
    addressScope: policy.addressScope,
    approvalKind: policy.approvalKind,
    addresses: publicResolvedRecords(resolvedAddresses),
    lookupPolicy: {
      all: true,
      order: 'verbatim',
      pinned: true,
      freshResolutionDuringConnect: false
    },
    redirectPolicy: { redirect: 'error', maxRedirects: 0 },
    tls: source.url.protocol === 'https:'
      ? {
        rejectUnauthorized: true,
        verificationHost: hostname,
        servername: source.host.kind === 'name' ? hostname : null,
        checkServerIdentity: 'node-default'
      }
      : null,
    credentialBinding: source.credentialBinding
  };
  Object.defineProperty(plan, SCHEDULED_SOURCE_NETWORK_PLAN, { value: true });
  return deepFreeze(plan);
}

function assertScheduledSourceNetworkPlan(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    input[SCHEDULED_SOURCE_NETWORK_PLAN] !== true ||
    !Object.isFrozen(input) ||
    !Object.isFrozen(input.addresses)
  ) {
    throw policyError(TypeError, 'ERR_NETWORK_PLAN_UNOBSERVED', 'The pinned lookup requires an immutable observed network plan.');
  }
  return input;
}

function normalizeLookupOptions(input) {
  if (input === undefined || input === null) return { family: 0, all: false };
  if (typeof input === 'number') {
    if (![0, 4, 6].includes(input)) {
      throw policyError(TypeError, 'ERR_NETWORK_LOOKUP_OPTIONS', 'Pinned lookup options are invalid.');
    }
    return { family: input, all: false };
  }
  if (!isPlainObject(input)) {
    throw policyError(TypeError, 'ERR_NETWORK_LOOKUP_OPTIONS', 'Pinned lookup options are invalid.');
  }
  const familyValue = input.family === 'IPv4' ? 4 : input.family === 'IPv6' ? 6 : (input.family || 0);
  if (![0, 4, 6].includes(familyValue) || (input.all !== undefined && typeof input.all !== 'boolean')) {
    throw policyError(TypeError, 'ERR_NETWORK_LOOKUP_OPTIONS', 'Pinned lookup options are invalid.');
  }
  if (input.order !== undefined && input.order !== 'verbatim') {
    throw policyError(TypeError, 'ERR_NETWORK_LOOKUP_OPTIONS', 'Pinned lookup requires verbatim address order.');
  }
  if (input.verbatim !== undefined && input.verbatim !== true) {
    throw policyError(TypeError, 'ERR_NETWORK_LOOKUP_OPTIONS', 'Pinned lookup requires verbatim address order.');
  }
  return { family: familyValue, all: Boolean(input.all) };
}

function createPinnedLookup(input) {
  const plan = assertScheduledSourceNetworkPlan(input);
  const pinned = plan.addresses.map(({ address, family }) => Object.freeze({ address, family }));
  return function pinnedLookup(hostname, options, callback) {
    let normalizedOptions = options;
    let done = callback;
    if (typeof options === 'function') {
      done = options;
      normalizedOptions = undefined;
    }
    if (typeof done !== 'function') {
      throw policyError(TypeError, 'ERR_NETWORK_LOOKUP_CALLBACK', 'Pinned lookup requires a callback.');
    }
    let error = null;
    let selected = null;
    try {
      if (hostname !== plan.hostname) {
        throw policyError(TypeError, 'ERR_NETWORK_LOOKUP_HOST', 'Pinned lookup cannot resolve a different hostname.');
      }
      const safeOptions = normalizeLookupOptions(normalizedOptions);
      selected = safeOptions.family
        ? pinned.filter(({ family }) => family === safeOptions.family)
        : [...pinned];
      if (!selected.length) {
        throw policyError(TypeError, 'ERR_NETWORK_LOOKUP_FAMILY', 'No pinned address matches the requested family.');
      }
      if (safeOptions.all) {
        selected = selected.map(({ address, family }) => ({ address, family }));
      } else {
        selected = selected[0];
      }
    } catch (caught) {
      error = caught;
    }
    queueMicrotask(() => {
      if (error) done(error);
      else if (Array.isArray(selected)) done(null, selected);
      else done(null, selected.address, selected.family);
    });
  };
}

module.exports = {
  ADDRESS_CATEGORIES,
  MAX_RESOLVED_ADDRESSES,
  canonicalScheduledSourceScope,
  classifyHost,
  classifyIpAddress,
  createApprovedNetworkScope,
  createPinnedLookup,
  createScheduledSourceNetworkPlan
};

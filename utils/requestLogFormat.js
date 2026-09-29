// Line format for poolRequests.log, cacheRequests.log and fallbackRequests.log.
//
//   v2|timestamp|epoch|origin|ip|method|params|elapsed|status
//
// "v2" marks the format, so readers never have to guess it from the content (older lines start
// with the timestamp and have no ip). Every field a caller or node can influence is escaped, so a
// v2 line always splits into exactly 9 fields: % → %25, | → %7C, \n → %0A, \r → %0D (in that
// order; readers undo it in one pass). The reader is bg-rpc-logs/utils/requestLogLine.js; keep
// the two in step.

const net = require('net');
const { edgeIps, clientIpHeader } = require('../config');

const FORMAT_MARKER = 'v2';
const UNKNOWN_IP = '-';

function escapeField(value) {
  return String(value ?? '')
    .replace(/%/g, '%25')
    .replace(/\|/g, '%7C')
    .replace(/\n/g, '%0A')
    .replace(/\r/g, '%0D');
}

// A valid IPv4/IPv6 address with an IPv4-mapped IPv6 prefix (::ffff:1.2.3.4) removed, or null
function normalizeIp(value) {
  if (typeof value !== 'string') return null;
  let ip = value.trim();
  if (ip.toLowerCase().startsWith('::ffff:') && net.isIPv4(ip.slice(7))) ip = ip.slice(7);
  return net.isIP(ip) ? ip : null;
}

/**
 * The caller's IP for the log. Requests forwarded by the edge proxy arrive from the edge's own
 * address, so the edge sends the caller's IP in `X-Client-IP`; that header is believed only when
 * the connection comes from a configured edge IP (EDGE_IPS), never from anyone else. Anything
 * else logs the connecting address. Never logs an unvalidated value.
 */
function clientIp(req) {
  const remote = normalizeIp(req.socket?.remoteAddress);
  if (remote && edgeIps.includes(remote)) {
    // From the edge: its forwarded caller, or '-' for the edge's own requests (head/floor polls)
    return normalizeIp(req.get(clientIpHeader)) || UNKNOWN_IP;
  }
  return remote || UNKNOWN_IP;
}

/**
 * One log line (with trailing newline).
 * @param {{ timestamp, epoch, origin, ip, method, params, elapsed, status }} f
 */
function formatLogLine(f) {
  return [
    FORMAT_MARKER,
    f.timestamp,
    f.epoch,
    escapeField(f.origin),
    escapeField(f.ip || UNKNOWN_IP),
    escapeField(f.method),
    escapeField(f.params),
    f.elapsed,
    escapeField(f.status),
  ].join('|') + '\n';
}

module.exports = { formatLogLine, escapeField, normalizeIp, clientIp, FORMAT_MARKER, UNKNOWN_IP };

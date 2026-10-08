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
const MERGED_FORMAT_MARKER = 'm1';
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

/**
 * One mergedRequests.log line (with trailing newline): a request answered by sharing an identical
 * request already in flight (utils/requestMerge.js). Its normal line goes to cacheRequests.log.
 *
 *   m1|timestamp|epoch|origin|ip|method|waitMs|leaderEpoch|sameCaller
 *
 * Always exactly 9 fields (origin, ip and method escaped as in v2). No params: the method plus the
 * cache line identify the request, and eth_call params can be KBs. waitMs: this request's wait for
 * the shared answer; leaderEpoch: when the first request started; sameCaller: 1 if this request has
 * the first request's origin and IP, else 0.
 * @param {{ timestamp, epoch, origin, ip, method, waitMs, leaderEpoch, sameCaller }} f
 */
function formatMergedLine(f) {
  return [
    MERGED_FORMAT_MARKER,
    f.timestamp,
    f.epoch,
    escapeField(f.origin),
    escapeField(f.ip || UNKNOWN_IP),
    escapeField(f.method),
    f.waitMs,
    f.leaderEpoch,
    f.sameCaller ? 1 : 0,
  ].join('|') + '\n';
}

// The origin logged for a request: its Origin header as sent, or '' without one. No fallback to
// Referer or Host: Host is this proxy's own address, and the edge doesn't forward Referer. (The old
// fallback gave '' only because new URL('<host>:48544') has an empty hostname; without the port it
// logged this proxy's host name. The edge also strips the origins it doesn't track, so those log ''
// too: bg-rpc-docs ORIGIN_CLASS_PLAN.md, Phase 2.)
function requestOrigin(req) {
  const origin = req.get('origin');
  return typeof origin === 'string' ? origin : '';
}

module.exports = { formatLogLine, formatMergedLine, escapeField, normalizeIp, clientIp, requestOrigin, FORMAT_MARKER, MERGED_FORMAT_MARKER, UNKNOWN_IP };

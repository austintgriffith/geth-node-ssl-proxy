// Run: node test/requestLogFormat.test.js
process.env.EDGE_IPS = '34.232.148.119, 10.0.0.9';
const assert = require('assert');
const { formatLogLine, escapeField, normalizeIp, clientIp, requestOrigin } = require('../utils/requestLogFormat');

// Escaping: every '|' and newline leaves the field; '%' is escaped first, so it round-trips
assert.strictEqual(escapeField('a|b\nc\rd%7Ce'), 'a%7Cb%0Ac%0Dd%257Ce');
assert.strictEqual(escapeField(undefined), '');
const unescape = (s) => s.replace(/%(25|7C|0A|0D)/g, (m) => ({ '%25': '%', '%7C': '|', '%0A': '\n', '%0D': '\r' })[m]);
for (const s of ['plain', 'a|b', 'x\ny', '100%', '%7C literal', '|%|\n\r%25|']) assert.strictEqual(unescape(escapeField(s)), s);

// Line shape: v2 marker, 9 fields whatever the content, IP right after origin
const line = formatLogLine({ timestamp: '2026-09-29 18:00:00', epoch: 1790705041684, origin: 'https://evil|origin', ip: '1.2.3.4',
  method: 'eth_get|Balance', params: '0xabc|def,0x1\n2', elapsed: '12.5', status: '{"error":{"message":"a|b"}}' });
assert.ok(line.endsWith('\n') && !line.slice(0, -1).includes('\n'));
const f = line.slice(0, -1).split('|');
assert.strictEqual(f.length, 9);
assert.deepStrictEqual([f[0], f[3], f[4], f[5], f[7]], ['v2', 'https://evil%7Corigin', '1.2.3.4', 'eth_get%7CBalance', '12.5']);
assert.strictEqual(unescape(f[6]), '0xabc|def,0x1\n2');
assert.strictEqual(unescape(f[8]), '{"error":{"message":"a|b"}}');
assert.strictEqual(formatLogLine({ timestamp: 't', epoch: 1, origin: '', ip: null, method: 'm', params: '', elapsed: 1, status: 'success' }).split('|')[4], '-');

// IP normalization
assert.strictEqual(normalizeIp('::ffff:1.2.3.4'), '1.2.3.4');
assert.strictEqual(normalizeIp(' 2001:db8::1 '), '2001:db8::1');
for (const bad of ['', 'nope', '1.2.3.4, 5.6.7.8', '1.2.3.4|x', '999.1.1.1', undefined, null]) assert.strictEqual(normalizeIp(bad), null);

// Which IP gets logged
const req = (remote, header) => ({ socket: { remoteAddress: remote }, get: (h) => (h.toLowerCase() === 'x-client-ip' ? header : undefined) });
assert.strictEqual(clientIp(req('::ffff:34.232.148.119', '203.0.113.7')), '203.0.113.7', 'from the edge: the forwarded caller');
assert.strictEqual(clientIp(req('10.0.0.9', '::ffff:198.51.100.2')), '198.51.100.2', 'second edge IP, mapped header');
assert.strictEqual(clientIp(req('34.232.148.119', undefined)), '-', "edge's own request (polls)");
assert.strictEqual(clientIp(req('34.232.148.119', 'garbage|x')), '-', 'invalid header from the edge is never logged');
assert.strictEqual(clientIp(req('203.0.113.50', '1.1.1.1')), '203.0.113.50', 'header from anyone else is ignored');
assert.strictEqual(clientIp(req('::ffff:127.0.0.1', '1.1.1.1')), '127.0.0.1', 'local tests: the connecting address');
assert.strictEqual(clientIp(req(undefined, '1.1.1.1')), '-');
// A batch item is Object.create(req): socket and get() come through the prototype
assert.strictEqual(clientIp(Object.create(req('34.232.148.119', '203.0.113.7'))), '203.0.113.7');
// Which origin gets logged: the Origin header as sent, or '' without one (no Referer/Host fallback)
const withHeaders = (headers) => ({ get: (h) => headers[h.toLowerCase()] });
assert.strictEqual(requestOrigin(withHeaders({ origin: 'https://speedrunethereum.com', host: 'pool.example:48544' })), 'https://speedrunethereum.com');
assert.strictEqual(requestOrigin(withHeaders({ origin: 'buidlguidl-client' })), 'buidlguidl-client');
assert.strictEqual(requestOrigin(withHeaders({ host: 'pool.example:48544' })), '', 'edge-stripped or no origin');
assert.strictEqual(requestOrigin(withHeaders({ host: 'pool.example' })), '', 'not the host name (the old fallback logged it without a port)');
assert.strictEqual(requestOrigin(withHeaders({ referer: 'http://localhost:3000/app', host: 'pool.example:48544' })), '', 'not the Referer');
assert.strictEqual(requestOrigin(withHeaders({})), '', 'no Host either: no throw');
assert.strictEqual(requestOrigin(withHeaders({ origin: '' })), '');
assert.strictEqual(requestOrigin(Object.create(withHeaders({ origin: 'https://a.example' }))), 'https://a.example', 'batch items (Object.create(req))');

console.log('requestLogFormat: all passed');

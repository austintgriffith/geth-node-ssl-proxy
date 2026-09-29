// Run: node test/fallbackPolicy.test.js
const assert = require('assert');
const { callerErrorReason } = require('../utils/fallbackPolicy');

const HEAD = 26078000;
const caller = (error) => assert.ok(callerErrorReason(error, HEAD), `should NOT fall back: ${JSON.stringify(error)}`);
const ours = (error, head = HEAD) => assert.strictEqual(callerErrorReason(error, head), null, `should fall back: ${JSON.stringify(error)}`);

// Caller mistakes seen in the request audit (F1) and other tx-validation errors: final
caller({ code: -32000, message: 'nonce too low: next nonce 6579920, tx nonce 2756766' });
caller({ code: -32003, message: 'EVM error: OutOfFunds' });
caller({ code: -32000, message: 'insufficient funds for gas * price + value' });
caller({ code: -32000, message: 'already known' });
caller({ code: -32000, message: 'replacement transaction underpriced' });
caller({ code: -32000, message: 'intrinsic gas too low' });
caller({ code: -32000, message: 'max fee per gas less than block base fee' });
caller({ code: -32001, message: `block not found: 0x${(HEAD + 1000).toString(16)}` });
caller({ code: -32602, message: 'distance to target block exceeds maximum proof window' });
caller({ code: 3, message: 'execution reverted' });

// Our failures: fall back
ours(undefined); // transport failure, no JSON-RPC error
ours({ message: 'socket hang up' });
ours({ code: -69000, message: 'No clients connected to pool' });
ours({ code: -69005, message: 'Node timed out' });
ours({ code: -69007, message: 'Node has invalid socket' });
ours({ code: -69008, message: 'Request timed out after 5 seconds' });
ours({ code: -70000, message: 'Internal Proxy service error' });
ours({ code: -70002, message: 'Invalid response from node (missing result and error)' });
ours({ code: 4444, message: 'pruned history unavailable: requested 1, earliest available 15500000' });
ours({ code: -32000, message: 'header not found' });
ours({ code: -32000, message: 'unknown block' });
ours({ code: -32002, message: 'request timed out' });
// "block not found" near our head may be our nodes lagging; unknown head or number: fall back
// no margin (HB3): head + 1 is already the caller's; at or below the head it's ours
caller({ code: -32001, message: `block not found: 0x${(HEAD + 1).toString(16)}` });
caller({ code: -32001, message: `block not found: 0x${(HEAD + 2).toString(16)}` });
ours({ code: -32001, message: `block not found: 0x${HEAD.toString(16)}` });
ours({ code: -32001, message: `block not found: 0x${(HEAD - 5).toString(16)}` });
ours({ code: -32001, message: `block not found: 0x${(HEAD + 1000).toString(16)}` }, null);
ours({ code: -32001, message: 'block not found' });

console.log('fallbackPolicy: all passed');

// geth wording (measured, geth v1.17.4, 2026-09-28)
const { requestedBlock } = require('../utils/fallbackPolicy');
const hx = (n) => '0x' + n.toString(16);
// future block: geth says "header not found" with no number; the request names the block
assert.ok(callerErrorReason({ code: -32000, message: 'header not found' }, HEAD, { params: ['0xabc', hx(HEAD + 1000)] }), 'geth future block is a caller error');
assert.ok(callerErrorReason({ code: -32000, message: 'header not found' }, HEAD, { params: [{ to: '0x1' }, { blockNumber: hx(HEAD + 500) }] }), 'EIP-1898 future block');
// near our head, or no block in the request: may be our nodes lagging → fall back
ours({ code: -32000, message: 'header not found' });
assert.ok(callerErrorReason({ code: -32000, message: 'header not found' }, HEAD, { params: ['0xabc', hx(HEAD + 1)] }), 'geth head + 1 is the caller\'s');
assert.strictEqual(callerErrorReason({ code: -32000, message: 'header not found' }, HEAD, { params: ['0xabc', hx(HEAD)] }), null);
assert.strictEqual(callerErrorReason({ code: -32000, message: 'header not found' }, HEAD, { params: [{ to: '0x1', value: '0xde0b6b3a7640000' }, 'latest'] }), null, 'a tx value is not a block');
// geth missing state → our limitation, may fall back
ours({ code: -32000, message: 'historical state 1dddf24a047383a8d1a9c7474a925f4c125c66f9ae962815c1bb3 is not available' });
ours({ code: -32000, message: 'missing trie node 1234 (path )' });
// geth caller mistakes stay final
caller({ code: -32000, message: 'failed with 16777216 gas: insufficient funds for gas * price + value: address 0x11 have 0 want 1' });
caller({ code: -32000, message: 'rlp: value size exceeds available input length' });
caller({ code: -32601, message: 'the method eth_getAccount does not exist/is not available' });
assert.strictEqual(requestedBlock(['0x1', '0x2a', { blockNumber: '0x64' }]), 100);
assert.strictEqual(requestedBlock({ address: '0x1' }), null);
console.log('fallbackPolicy (geth wording): all passed');

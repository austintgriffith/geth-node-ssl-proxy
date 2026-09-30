// Run: node test/validateRpcRequest.test.js
const assert = require('assert');
const { validateRpcRequest, itemProblem } = require('../utils/validateRpcRequest');
const { maxBatchLength } = require('../config');

function run(body) {
  const req = { body };
  let sent = null, passed = false;
  const res = { status() { return this; }, send(b) { sent = b; return this; } };
  validateRpcRequest(req, res, () => { passed = true; });
  return { req, sent, passed };
}
const ok = (id, method = 'eth_chainId') => ({ jsonrpc: '2.0', id, method });

// Items
assert.strictEqual(itemProblem(ok(1)), null);
assert.strictEqual(itemProblem(ok(0)), null);
assert.strictEqual(itemProblem(ok('a')), null);
assert.strictEqual(itemProblem(ok(null)), null);
assert.strictEqual(itemProblem(null), 'request must be an object');
assert.strictEqual(itemProblem(5), 'request must be an object');
assert.strictEqual(itemProblem([ok(1)]), 'request must be an object');
assert.strictEqual(itemProblem({ jsonrpc: '2.0', id: 1 }), 'method missing');
assert.strictEqual(itemProblem(ok(1, ['eth_getLogs'])), 'method must be a string');
assert.strictEqual(itemProblem({ jsonrpc: '2.0', method: 'eth_chainId' }), 'id missing');
assert.strictEqual(itemProblem(ok({ a: 1 })), 'id must be a string, number or null');

// Single: id 0 is echoed, not turned into null
let r = run({ jsonrpc: '2.0', id: 0 });
assert.strictEqual(r.passed, false);
assert.deepStrictEqual(r.sent, { jsonrpc: '2.0', id: 0, error: { code: -32600, message: 'Invalid Request: method missing' } });
assert.strictEqual(run(ok(0)).passed, true);

// Batch: invalid items answered per item, valid items go on
r = run([ok(0), { jsonrpc: '2.0', id: 1 }, null, ok(3), ok({ a: 1 })]);
assert.strictEqual(r.passed, true);
assert.strictEqual(r.sent, null);
assert.deepStrictEqual([...r.req.batchErrors.keys()], [1, 2, 4]);
assert.deepStrictEqual(r.req.batchErrors.get(1), { jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'Invalid Request: method missing' } });
assert.strictEqual(r.req.batchErrors.get(2).id, null);
assert.strictEqual(r.req.batchErrors.get(4).id, null);

// Batch, all valid: nothing to put back
r = run([ok(1), ok(2)]);
assert.strictEqual(r.passed, true);
assert.strictEqual(r.req.batchErrors.size, 0);

// Empty batch: one error object
r = run([]);
assert.strictEqual(r.passed, false);
assert.strictEqual(r.sent.error.code, -32600);
assert.ok(!Array.isArray(r.sent));

// Too large: one error per item, each with its own id
const big = Array.from({ length: maxBatchLength + 1 }, (_, i) => ok(i));
r = run(big);
assert.strictEqual(r.passed, false);
assert.ok(Array.isArray(r.sent));
assert.strictEqual(r.sent.length, big.length);
assert.deepStrictEqual(r.sent.map(a => a.id), big.map(b => b.id));
assert.ok(r.sent.every(a => a.error.code === -32600 && /Batch too large/.test(a.error.message)));

console.log('validateRpcRequest tests passed');

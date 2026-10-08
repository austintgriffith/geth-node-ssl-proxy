// Merging identical requests in flight (utils/requestMerge.js; bg-rpc-docs PLAN_REQUEST_MERGING.md).
// Run: node test/requestMerge.test.js
const assert = require('assert');
const { mergeKey, withId, createMerger } = require('../utils/requestMerge');
const { formatMergedLine } = require('../utils/requestLogFormat');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BLOCK = '0x18ec8ee';
const call = [{ to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', data: '0x313ce567' }, BLOCK];
const ok = (id, result) => ({ requestType: 'pool', status: 'success', response: { jsonrpc: '2.0', id, result } });
const callerError = (id) => ({ requestType: 'pool', status: 'error', response: { jsonrpc: '2.0', id, error: { code: 3, message: 'execution reverted' } } });
const ourFailure = (id) => ({ requestType: 'pool', status: 'error', response: { jsonrpc: '2.0', id, error: { code: -69008, message: 'Request timed out after 10 seconds' } } });
const isOurFailure = (o) => o.status !== 'success' && o.response.error.code <= -69000;

(async () => {
  // ---- keys: same method, params and block merge; anything else doesn't
  {
    const k = mergeKey('eth_call', call);
    assert.strictEqual(k, mergeKey('eth_call', JSON.parse(JSON.stringify(call))));
    assert.notStrictEqual(k, mergeKey('eth_call', [call[0], '0x18ec8ef']), 'another block');
    assert.notStrictEqual(k, mergeKey('eth_call', [{ ...call[0], data: '0x70a08231' }, BLOCK]), 'other params');
    assert.notStrictEqual(k, mergeKey('eth_estimateGas', call), 'another method');
    assert.strictEqual(mergeKey('eth_chainId', undefined), 'eth_chainId:[]');
    // never merged: sends, filters, getLogs, node-specific, unknown, unpinned tags
    for (const method of ['eth_sendRawTransaction', 'eth_sendTransaction', 'eth_getLogs', 'eth_newFilter', 'eth_accounts', 'net_peerCount', 'eth_syncing', 'web3_clientVersion', 'some_method']) {
      assert.strictEqual(mergeKey(method, ['0x1']), null, method);
    }
    for (const tag of ['latest', 'pending', 'safe', 'finalized']) {
      assert.strictEqual(mergeKey('eth_call', [call[0], tag]), null, `"${tag}" left after the rewrite`);
      assert.strictEqual(mergeKey('eth_getBalance', { address: '0x1', block: tag }), null, `by-name "${tag}"`);
    }
    assert.strictEqual(mergeKey('eth_call', [{ to: '0x1', data: '0xlatest' }, BLOCK]) !== null, true, 'the word inside data is not a tag');
  }

  // ---- withId: a copy with the follower's id, never the same object
  {
    const a = { jsonrpc: '2.0', id: 1, result: { nested: [1] } };
    for (const id of [0, 'abc', null, 7]) {
      const c = withId(a, id);
      assert.strictEqual(c.id, id);
      assert.notStrictEqual(c, a);
      assert.notStrictEqual(c.result, a.result, 'deep copy');
    }
    assert.strictEqual(a.id, 1, 'the leader’s answer is untouched');
  }

  // ---- 1. five identical requests at once: fn runs once; each gets the outcome, followers report their wait
  {
    const m = createMerger({ maxFollowers: 100 });
    let runs = 0;
    const fn = async () => { runs++; await sleep(30); return ok(1, '0x6'); };
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => m.run('k', fn, { isOurFailure, caller: i === 4 ? 'other' : 'same' })));
    assert.strictEqual(runs, 1);
    assert.deepStrictEqual(results.map((r) => r.role), ['leader', 'follower', 'follower', 'follower', 'follower']);
    assert.ok(results.every((r) => r.outcome.response.result === '0x6'));
    assert.ok(results.slice(1).every((r) => r.waitMs >= 0 && r.waitMs < 1000 && typeof r.leaderEpoch === 'number'));
    assert.deepStrictEqual(results.slice(1).map((r) => r.sameCaller), [true, true, true, false]);
    assert.strictEqual(m.size(), 0, '8. map empty afterwards');
  }

  // ---- 2. different keys don't merge; a request after the leader settled starts fresh
  {
    const m = createMerger({ maxFollowers: 100 });
    let runs = 0;
    const fn = async () => { runs++; await sleep(10); return ok(1, '0x1'); };
    await Promise.all([m.run('a', fn, { isOurFailure }), m.run('b', fn, { isOurFailure })]);
    assert.strictEqual(runs, 2);
    const later = await m.run('a', fn, { isOurFailure });
    assert.strictEqual(later.role, 'leader');
    assert.strictEqual(runs, 3);
  }

  // ---- 3. the caller's own error is shared
  {
    const m = createMerger({ maxFollowers: 100 });
    let runs = 0;
    const fn = async () => { runs++; await sleep(10); return callerError(1); };
    const r = await Promise.all([m.run('k', fn, { isOurFailure }), m.run('k', fn, { isOurFailure }), m.run('k', fn, { isOurFailure })]);
    assert.strictEqual(runs, 1);
    assert.ok(r.every((x) => x.outcome.response.error.message === 'execution reverted'));
  }

  // ---- 4. our failure isn't shared: each follower runs the normal path itself
  {
    const m = createMerger({ maxFollowers: 100 });
    let runs = 0;
    const fn = async () => { runs++; await sleep(10); return runs === 1 ? ourFailure(1) : ok(1, '0x2'); };
    const r = await Promise.all([m.run('k', fn, { isOurFailure }), m.run('k', fn, { isOurFailure }), m.run('k', fn, { isOurFailure })]);
    assert.strictEqual(runs, 3);
    assert.strictEqual(r[0].outcome.response.error.code, -69008);
    assert.deepStrictEqual(r.slice(1).map((x) => [x.role, x.reason, x.outcome.status]), [['own', 'leader failed (ours)', 'success'], ['own', 'leader failed (ours)', 'success']]);
    assert.strictEqual(m.size(), 0);
  }

  // ---- 5. the leader throws: no follower hangs, the entry is removed
  {
    const m = createMerger({ maxFollowers: 100 });
    let runs = 0;
    const fn = async () => { runs++; await sleep(10); if (runs === 1) throw new Error('boom'); return ok(1, '0x3'); };
    const leader = m.run('k', fn, { isOurFailure });
    const follower = m.run('k', fn, { isOurFailure });
    await assert.rejects(leader, /boom/);
    const f = await follower;
    assert.deepStrictEqual([f.role, f.reason, f.outcome.status], ['own', 'leader threw', 'success']);
    assert.strictEqual(m.size(), 0);
  }

  // ---- 6. past the follower cap: the extra copies run on their own
  {
    const m = createMerger({ maxFollowers: 2 });
    let runs = 0;
    const fn = async () => { runs++; await sleep(10); return ok(1, '0x4'); };
    const r = await Promise.all(Array.from({ length: 5 }, () => m.run('k', fn, { isOurFailure })));
    assert.deepStrictEqual(r.map((x) => x.role), ['leader', 'follower', 'follower', 'own', 'own']);
    assert.strictEqual(runs, 3);
  }

  // ---- mergedRequests.log line: always 9 fields, escaped like v2
  {
    const line = formatMergedLine({ timestamp: '2026-10-08 12:00:00', epoch: 1791460800000, origin: 'https://a|b.example', ip: '203.0.113.7',
      method: 'eth_call', waitMs: 41, leaderEpoch: 1791460799970, sameCaller: true });
    assert.strictEqual(line, 'm1|2026-10-08 12:00:00|1791460800000|https://a%7Cb.example|203.0.113.7|eth_call|41|1791460799970|1\n');
    assert.strictEqual(line.trim().split('|').length, 9);
    assert.ok(formatMergedLine({ timestamp: 't', epoch: 1, origin: '', ip: '', method: 'eth_call', waitMs: 0, leaderEpoch: 1, sameCaller: false }).startsWith('m1|t|1||-|eth_call|0|1|0'));
  }

  console.log('requestMerge: all passed');
})().catch((e) => { console.error(e); process.exit(1); });

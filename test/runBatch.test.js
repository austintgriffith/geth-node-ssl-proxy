// Batch items run concurrently (at most `concurrency` at once), answered in item order, and items
// not yet started are skipped once the caller is gone.
// Run: node test/runBatch.test.js
const assert = require('assert');
const { runBatch } = require('../utils/runBatch');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // Order kept even when later items finish first
  {
    const items = [50, 10, 30, 0, 20];
    const { answers, skipped } = await runBatch(items, async (ms, i) => { await sleep(ms); return `item ${i}`; }, { concurrency: 10 });
    assert.deepStrictEqual(answers, ['item 0', 'item 1', 'item 2', 'item 3', 'item 4']);
    assert.strictEqual(skipped, 0);
  }

  // Concurrency: never more than the limit in flight, and the limit is reached
  {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 25 }, (_, i) => i);
    await runBatch(items, async () => { inFlight++; peak = Math.max(peak, inFlight); await sleep(5); inFlight--; return 1; }, { concurrency: 10 });
    assert.strictEqual(peak, 10);
  }

  // Concurrent, not one after another: 50 items of 40 ms take ~5 rounds, not 50
  {
    const start = Date.now();
    const { answers } = await runBatch(Array.from({ length: 50 }, (_, i) => i), async (i) => { await sleep(40); return i; }, { concurrency: 10 });
    const elapsed = Date.now() - start;
    assert.strictEqual(answers.length, 50);
    assert.ok(elapsed < 600, `took ${elapsed} ms; one at a time would be ~2,000 ms`);
  }

  // Caller gone: items not yet started are skipped; items already running finish
  {
    let gone = false;
    const started = [];
    const items = Array.from({ length: 20 }, (_, i) => i);
    const run = runBatch(items, async (i) => { started.push(i); await sleep(30); return i; }, { concurrency: 5, isCancelled: () => gone });
    await sleep(10); // the first 5 are running
    gone = true;
    const { answers, skipped } = await run;
    assert.deepStrictEqual(started, [0, 1, 2, 3, 4]);
    assert.strictEqual(skipped, 15);
    assert.deepStrictEqual(answers.slice(0, 5), [0, 1, 2, 3, 4]);
  }

  // Edge cases: empty batch, concurrency larger than the batch, concurrency 1 (one at a time)
  {
    assert.deepStrictEqual((await runBatch([], async () => 1, { concurrency: 10 })).answers, []);
    assert.deepStrictEqual((await runBatch(['a', 'b'], async (x) => x, { concurrency: 10 })).answers, ['a', 'b']);
    let inFlight = 0;
    let peak = 0;
    await runBatch([1, 2, 3], async () => { inFlight++; peak = Math.max(peak, inFlight); await sleep(2); inFlight--; }, { concurrency: 1 });
    assert.strictEqual(peak, 1);
  }

  console.log('runBatch: all passed');
})().catch((e) => { console.error(e); process.exit(1); });

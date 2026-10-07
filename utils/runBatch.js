// Runs a batch's items concurrently, at most `concurrency` at a time, and returns the answers in
// item order. One at a time, a batch took as long as all its items added together and could outlast
// the edge's 15 s wait.
//
// isCancelled() is checked before each item starts: once it's true (the caller disconnected), the
// items not yet started are skipped and counted; items already running finish.
//
// @param {Array} items
// @param {(item, index) => Promise<*>} runItem - its answer for the item; must not throw
// @param {{ concurrency: number, isCancelled?: () => boolean }} opts
// @returns {Promise<{ answers: Array, skipped: number }>} answers has an entry for every item that ran
async function runBatch(items, runItem, { concurrency, isCancelled = () => false }) {
  const answers = new Array(items.length);
  let nextIndex = 0;
  let skipped = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      if (isCancelled()) {
        skipped++;
        continue;
      }
      answers[i] = await runItem(items[i], i);
    }
  };
  const workers = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return { answers, skipped };
}

module.exports = { runBatch };

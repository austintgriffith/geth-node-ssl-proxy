// Merging identical requests in flight (bg-rpc-docs PLAN_REQUEST_MERGING.md).
//
// After a cache miss, the first request for a key (the leader) runs the normal path: pool, then the
// fallback when the fallback policy allows it. An identical request that arrives while the leader is
// still running (a follower) waits for the leader's outcome instead of sending its own request, and
// answers with a copy carrying its own id. The key is the cache's key, built after "latest" is
// replaced by the cached block number, so requests only merge when they ask about the same block.
//
// Callers pay the same: the edge charges every request it accepts. Merging only saves pool requests
// and node calls, and answers duplicates a little sooner.
//
// A leader's outcome that is OUR failure (timeout, no nodes, internal error: whatever the fallback
// policy doesn't call the caller's own mistake) is never shared: each follower then runs the normal
// path itself, as it would have without merging. One slow node must not fail a group of callers.

const { mergeableMethods } = require('../config');

// Tags that aren't pinned to a block; still present after the "latest" rewrite when the proxy has no
// head yet, or inside by-name params and nested objects the rewrite doesn't touch
const UNPINNED = /"(latest|pending|safe|finalized)"/;

/**
 * The merge key for a request, or null when it must not merge.
 * @param {string} method
 * @param {*} params - after the "latest" rewrite
 */
function mergeKey(method, params) {
  if (!mergeableMethods.has(method)) return null;
  const text = JSON.stringify(params === undefined ? [] : params);
  if (UNPINNED.test(text)) return null;
  return `${method}:${text}`;
}

/**
 * A copy of a JSON-RPC answer (or array of them) with the follower's own id; never the same object
 * handed to two callers.
 */
function withId(answer, id) {
  if (answer === null || typeof answer !== 'object') return answer;
  const copy = structuredClone(answer);
  if (!Array.isArray(copy)) copy.id = id;
  return copy;
}

/**
 * One in-flight map. run(key, fn, opts) resolves to
 *   { outcome, role: 'leader' }            ran fn itself (first for the key)
 *   { outcome, role: 'follower', waitMs, leaderEpoch, sameCaller }
 *                                          shared the leader's outcome
 *   { outcome, role: 'own', reason }       ran fn itself after all: past the follower cap, or the
 *                                          leader's outcome was our failure, or the leader threw
 * fn must resolve to an outcome; isOurFailure(outcome) says whether it may be shared.
 * @param {{ maxFollowers: number }} options
 */
function createMerger({ maxFollowers }) {
  const inFlight = new Map(); // key -> { promise, followers, startedAt, caller }

  async function run(key, fn, { isOurFailure, caller = '' }) {
    const entry = inFlight.get(key);
    if (entry) {
      if (entry.followers >= maxFollowers) {
        return { outcome: await fn(), role: 'own', reason: 'follower cap' };
      }
      entry.followers++;
      const waitStart = Date.now();
      let outcome;
      let threw = false;
      try {
        outcome = await entry.promise;
      } catch {
        threw = true;
      }
      if (!threw && !isOurFailure(outcome)) {
        return {
          outcome,
          role: 'follower',
          waitMs: Date.now() - waitStart,
          leaderEpoch: entry.startedAt,
          sameCaller: entry.caller === caller
        };
      }
      return { outcome: await fn(), role: 'own', reason: threw ? 'leader threw' : 'leader failed (ours)' };
    }

    const promise = Promise.resolve().then(fn);
    const own = { promise, followers: 0, startedAt: Date.now(), caller };
    inFlight.set(key, own);
    try {
      return { outcome: await promise, role: 'leader' };
    } finally {
      // Whatever the outcome, the key is free again once the leader has settled
      if (inFlight.get(key) === own) inFlight.delete(key);
    }
  }

  return { run, size: () => inFlight.size };
}

module.exports = { mergeKey, withId, createMerger };

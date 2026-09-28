// When a failed pool request may go to the fallback provider.
//
// Rule (owner, 2026-09-28): the fallback is for OUR failures only. A caller's mistake fails on
// the fallback too, so sending it there only costs a paid request, returns the fallback's
// wording instead of our node's, and counts toward the fallback alert. (Request audit F1: a
// replayed transaction, gas estimation without funds and a call at a future block all fell back.)
//
// So a JSON-RPC error answered by a node is final, with two exceptions where a full provider
// would have what our node lacks:
//   - history the node doesn't hold ("pruned", "history unavailable"); note -32603 "state ... is
//     pruned" stays in ignoredErrorCodes and so still doesn't fall back
//   - a block our nodes haven't reached yet: "header not found", "unknown block", or "block not
//     found" for a block at most FUTURE_BLOCK_MARGIN above our cached head (further ahead is a
//     caller asking for a block that doesn't exist yet)
// Failures of the pool or the transport (no nodes, timeouts, broken sockets, invalid responses:
// codes -69000 and below, and anything without a JSON-RPC error) fall back as before.

const POOL_INFRA_CODE_MAX = -69000; // pool (-69xxx, -70001, -70002) and proxy (-69008, -70000) codes
const FUTURE_BLOCK_MARGIN = 3; // blocks

const MISSING_HISTORY = /pruned|history unavailable/i;
const NOT_REACHED_YET = /header not found|unknown block/i;
const BLOCK_NOT_FOUND = /block not found/i;
const NODE_TIMEOUT = /timed? ?out/i;

/**
 * @param {Object|undefined} error - the JSON-RPC error object the pool returned ({ code, message })
 * @param {number|null} cachedHead - the proxy's cached eth_blockNumber, if known
 * @returns {string|null} why this is a caller's mistake (don't fall back), or null (fall back)
 */
function callerErrorReason(error, cachedHead) {
  if (!error || typeof error.code !== 'number') return null; // transport failure
  if (error.code <= POOL_INFRA_CODE_MAX) return null; // pool or proxy failure
  const message = typeof error.message === 'string' ? error.message : '';

  if (MISSING_HISTORY.test(message) || NOT_REACHED_YET.test(message) || NODE_TIMEOUT.test(message)) return null;
  if (BLOCK_NOT_FOUND.test(message)) {
    const m = message.match(/0x[0-9a-fA-F]+/);
    const block = m ? parseInt(m[0], 16) : null;
    const head = Number.isFinite(cachedHead) ? cachedHead : null;
    // Without both numbers, or within a few blocks of our head, it may be our nodes lagging
    if (block === null || head === null || block <= head + FUTURE_BLOCK_MARGIN) return null;
    return `block ${block} is beyond the chain head (${head})`;
  }
  return `node answered ${error.code} (${message.slice(0, 60)})`;
}

module.exports = { callerErrorReason, FUTURE_BLOCK_MARGIN };

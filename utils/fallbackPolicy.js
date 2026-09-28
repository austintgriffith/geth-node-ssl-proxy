// When a failed pool request may go to the fallback provider.
//
// Rule (owner, 2026-09-28): the fallback is for OUR failures only. A caller's mistake fails on
// the fallback too, so sending it there only costs a paid request, returns the fallback's
// wording instead of our node's, and counts toward the fallback alert. (Request audit F1: a
// replayed transaction, gas estimation without funds and a call at a future block all fell back.)
//
// So a JSON-RPC error answered by a node is final, with two exceptions where a full provider
// would have what our node lacks:
//   - history the node doesn't hold (reth "pruned", "history unavailable"; geth "historical
//     state ... is not available", "missing trie node"); note -32603 "state ... is pruned" stays
//     in ignoredErrorCodes and so still doesn't fall back
//   - a block our nodes haven't reached yet: reth "block not found: 0x…", geth "header not
//     found", "unknown block", for a block at most FUTURE_BLOCK_MARGIN above our cached head.
//     Further ahead is a caller asking for a block that doesn't exist yet. The block comes from
//     the message (reth) or, when the message has none (geth), from the request's params
// Failures of the pool or the transport (no nodes, timeouts, broken sockets, invalid responses:
// codes -69000 and below, and anything without a JSON-RPC error) fall back as before.

const POOL_INFRA_CODE_MAX = -69000; // pool (-69xxx, -70001, -70002) and proxy (-69008, -70000) codes
const FUTURE_BLOCK_MARGIN = 3; // blocks

const MISSING_HISTORY = /pruned|history unavailable|historical state .*not available|missing trie node/i;
const BLOCK_MISSING = /block not found|header not found|unknown block/i;
const QUANTITY = /^0x[0-9a-fA-F]{1,16}$/;
const NODE_TIMEOUT = /timed? ?out/i;

// Highest block number a request names: top-level hex quantities and EIP-1898 { blockNumber }.
// Nested objects (a transaction's value, gas, data) are ignored on purpose.
function requestedBlock(params) {
  if (!Array.isArray(params)) return null;
  let max = null;
  for (const p of params) {
    const v = typeof p === 'string' ? p : (p && typeof p === 'object' && typeof p.blockNumber === 'string' ? p.blockNumber : null);
    if (v && QUANTITY.test(v)) {
      const n = parseInt(v, 16);
      if (max === null || n > max) max = n;
    }
  }
  return max;
}

/**
 * @param {Object|undefined} error - the JSON-RPC error object the pool returned ({ code, message })
 * @param {number|null} cachedHead - the proxy's cached eth_blockNumber, if known
 * @param {Object} [request] - the caller's JSON-RPC request (its params give the block when the
 *   node's message doesn't)
 * @returns {string|null} why this is a caller's mistake (don't fall back), or null (fall back)
 */
function callerErrorReason(error, cachedHead, request) {
  if (!error || typeof error.code !== 'number') return null; // transport failure
  if (error.code <= POOL_INFRA_CODE_MAX) return null; // pool or proxy failure
  const message = typeof error.message === 'string' ? error.message : '';

  if (MISSING_HISTORY.test(message) || NODE_TIMEOUT.test(message)) return null;
  if (BLOCK_MISSING.test(message)) {
    const m = message.match(/0x[0-9a-fA-F]+/);
    const block = m ? parseInt(m[0], 16) : requestedBlock(request?.params);
    const head = Number.isFinite(cachedHead) ? cachedHead : null;
    // Without both numbers, or within a few blocks of our head, it may be our nodes lagging
    if (block === null || head === null || block <= head + FUTURE_BLOCK_MARGIN) return null;
    return `block ${block} is beyond the chain head (${head})`;
  }
  return `node answered ${error.code} (${message.slice(0, 60)})`;
}

module.exports = { callerErrorReason, requestedBlock, FUTURE_BLOCK_MARGIN };

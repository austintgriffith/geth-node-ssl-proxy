require('dotenv').config(); // EDGE_IPS below, wherever config is loaded first
const proxyPortPublic = 48544;
const webServerPort = 48545;
const proxyPort = 3002;
const poolPort = 3003;
// Timeout budget: pool + fallback must fit inside the edge's 15 s wait for this proxy. Past it the
// edge stops waiting, asks the fallback provider again itself (a second paid request) and counts a
// circuit-breaker failure.
//   pool: a light request can take 3 attempts of up to 3 s each (first node, timeout retry, history
//     retry: bg-rpc-pool nodeDefaultTimeout), so 9 s plus transfer
//   fallback: the provider answered every logged request (531 by 2026-10-06) within 242 ms
// 10 s + 4 s = 14 s, under the edge's 15 s.
const fallbackRequestTimeout = 4000;
const poolRequestTimeout = 10000;
// Per-method overrides of poolRequestTimeout. Heavy methods: the pool gives up after 5s
// (3s for filter creation/changes) with no retry, so 8s leaves room for transfer.
const poolRequestTimeoutByMethod = {
  eth_getLogs: 8000,
  eth_getFilterLogs: 8000,
  eth_newFilter: 8000,
  eth_getFilterChanges: 8000,
};
const maxBatchLength = 50; // Larger batches are rejected with -32600
// Batch items in flight at once. One at a time, a batch took as long as all its items added
// together and could outlast the edge's 15 s (a batch of 50 at the slowest 10% of eth_call, ~200 ms,
// is ~10 s; one timed-out item adds 6 s), which sent the whole batch to the fallback provider.
const batchConcurrency = 10;
// Largest JSON body accepted. body-parser's default (100 KB) refused blob transactions
// (~130 KB hex per blob, up to ~2.4 MB) and large eth_call data with an HTML 413 (request
// audit, 2026-09-28). Alchemy accepts ~2.5 MB; the pool and nodes handled 1 MB fine.
const maxRequestBodySize = '4mb';
// Never sent to the fallback when the pool fails; the pool's error goes back to the caller
const methodsNeverFallback = ['eth_getLogs', 'eth_newFilter', 'eth_getFilterLogs', 'eth_getFilterChanges'];
// Identical requests in flight that may share one pool request (utils/requestMerge.js; bg-rpc-docs
// PLAN_REQUEST_MERGING.md): reads whose answer is the same for every caller once pinned to a block
// or hash. Never sends (a duplicate send must reach the node), filters, eth_getLogs (its own slots
// and units at the edge) or node-specific methods (eth_accounts, net_peerCount, eth_syncing, ...).
const mergeableMethods = new Set([
  'eth_call', 'eth_estimateGas', 'eth_createAccessList',
  'eth_getBalance', 'eth_getTransactionCount', 'eth_getCode', 'eth_getStorageAt', 'eth_getProof',
  'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_getBlockReceipts',
  'eth_getBlockTransactionCountByNumber', 'eth_getBlockTransactionCountByHash',
  'eth_getUncleCountByBlockNumber', 'eth_getUncleCountByBlockHash',
  'eth_getUncleByBlockNumberAndIndex', 'eth_getUncleByBlockHashAndIndex',
  'eth_getTransactionByHash', 'eth_getTransactionByBlockNumberAndIndex', 'eth_getTransactionByBlockHashAndIndex',
  'eth_getTransactionReceipt', 'eth_feeHistory',
  // Not pinned to a block, but two copies in flight at the same moment have the same answer
  'eth_blockNumber', 'eth_chainId', 'eth_gasPrice', 'eth_maxPriorityFeePerGas',
]);
// Followers per in-flight key; copies past this run on their own
const mergeMaxFollowers = 100;
// "latest" is passed through for these instead of being replaced with the cached head number:
// reth serves them only at the node's own head (--rpc.eth-proof-window 0), and the cached number
// can be a block behind (measured: 3 of 40 eth_getProof "latest" failed). Never cached either way.
const methodsKeepLatest = ['eth_getProof', 'eth_getAccount'];
// Edge proxy address(es) (comma-separated EDGE_IPS in .env). Only requests from these may set the
// caller's IP for the request logs, via clientIpHeader; see utils/requestLogFormat.js
const edgeIps = (process.env.EDGE_IPS || '').split(',').map((s) => s.trim()).filter(Boolean);
const clientIpHeader = 'x-client-ip';
// Caller headers forwarded to the pool and fallback (lowercase). Everything else is dropped:
// forwarding transfer-encoding/content-length breaks the request, and keys must not reach the fallback.
const forwardedHeaders = ['user-agent', 'origin'];
const cacheMaxRetries = 1000000;
const cacheRetryDelay = 5000; // 5 seconds
const blockNumberCacheTimeout = 25000; // 25 second timeout
const cacheMethodCleanupTimeout = 1000 * 60 * 60 * 2; // 2 hours
const fallbackRateAlertThreshold = 9; // Fallback requests per hour to trigger telegram alert

const fallbackRequestLogPath = "/home/ubuntu/shared/fallbackRequests.log";
const cacheRequestLogPath = "/home/ubuntu/shared/cacheRequests.log";
const poolRequestLogPath = "/home/ubuntu/shared/poolRequests.log";
// One line per merged request (utils/requestLogFormat.js formatMergedLine); the merged request is
// also logged as a normal line in cacheRequests.log
const mergedRequestLogPath = "/home/ubuntu/shared/mergedRequests.log";      

module.exports = {
  proxyPortPublic,
  webServerPort,
  proxyPort,
  poolPort,
  fallbackRequestTimeout,
  poolRequestTimeout,
  poolRequestTimeoutByMethod,
  maxBatchLength,
  batchConcurrency,
  maxRequestBodySize,
  methodsNeverFallback,
  mergeableMethods,
  mergeMaxFollowers,
  methodsKeepLatest,
  edgeIps,
  clientIpHeader,
  forwardedHeaders,
  blockNumberCacheTimeout,
  cacheMaxRetries,
  cacheRetryDelay,
  cacheMethodCleanupTimeout,
  fallbackRateAlertThreshold,

  fallbackRequestLogPath,
  cacheRequestLogPath,
  poolRequestLogPath,
  mergedRequestLogPath,
};
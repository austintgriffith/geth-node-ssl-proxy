require('dotenv').config(); // EDGE_IPS below, wherever config is loaded first
const proxyPortPublic = 48544;
const webServerPort = 48545;
const proxyPort = 3002;
const poolPort = 3003;
const fallbackRequestTimeout = 10000; // 10 seconds
const poolRequestTimeout = 15000; // 15 seconds - must be >= longest pool method timeout (e.g. eth_getLogs 10s)
// Per-method overrides of poolRequestTimeout. Heavy methods: the pool gives up after 5s
// (3s for filter creation/changes) with no retry, so 8s leaves room for transfer.
const poolRequestTimeoutByMethod = {
  eth_getLogs: 8000,
  eth_getFilterLogs: 8000,
  eth_newFilter: 8000,
  eth_getFilterChanges: 8000,
};
const maxBatchLength = 50; // Larger batches are rejected with -32600
// Largest JSON body accepted. body-parser's default (100 KB) refused blob transactions
// (~130 KB hex per blob, up to ~2.4 MB) and large eth_call data with an HTML 413 (request
// audit, 2026-09-28). Alchemy accepts ~2.5 MB; the pool and nodes handled 1 MB fine.
const maxRequestBodySize = '4mb';
// Never sent to the fallback when the pool fails; the pool's error goes back to the caller
const methodsNeverFallback = ['eth_getLogs', 'eth_newFilter', 'eth_getFilterLogs', 'eth_getFilterChanges'];
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

module.exports = {
  proxyPortPublic,
  webServerPort,
  proxyPort,
  poolPort,
  fallbackRequestTimeout,
  poolRequestTimeout,
  poolRequestTimeoutByMethod,
  maxBatchLength,
  maxRequestBodySize,
  methodsNeverFallback,
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
};
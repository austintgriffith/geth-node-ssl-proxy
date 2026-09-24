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
// Never sent to the fallback when the pool fails; the pool's error goes back to the caller
const methodsNeverFallback = ['eth_getLogs', 'eth_newFilter', 'eth_getFilterLogs', 'eth_getFilterChanges'];
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
  methodsNeverFallback,
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
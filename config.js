const proxyPortPublic = 48544;
const webServerPort = 48545;
const proxyPort = 3002;
const poolPort = 3003;
const fallbackRequestTimeout = 10000; // 10 seconds
const poolRequestTimeout = 15000; // 15 seconds - must be >= longest pool method timeout (e.g. eth_getLogs 10s)
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
  blockNumberCacheTimeout,
  cacheMaxRetries,
  cacheRetryDelay,
  cacheMethodCleanupTimeout,
  fallbackRateAlertThreshold,

  fallbackRequestLogPath,
  cacheRequestLogPath,
  poolRequestLogPath,
};
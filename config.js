const fallbackUrl = "https://office.buidlguidl.com:48544";
const proxyPortPublic = 48544;
const webServerPort = 48545;
const proxyPort = 3002;
const poolPort = 3003;
const fallbackRequestTimeout = 5000; // 5 seconds
const cacheMaxRetries = 50;
const cacheRetryDelay = 5000; // 5 seconds
const blockNumberCacheTimeout = 15000; // 15 second timeout
const cacheMethodCleanupTimeout = 1000 * 60 * 60; // 1 hour

const fallbackRequestLogPath = "/home/ubuntu/shared/fallbackRequests.log";
const cacheRequestLogPath = "/home/ubuntu/shared/cacheRequests.log";
const poolRequestLogPath = "/home/ubuntu/shared/poolRequests.log";      

module.exports = {
  fallbackUrl,
  proxyPortPublic,
  webServerPort,
  proxyPort,
  poolPort,
  fallbackRequestTimeout,
  blockNumberCacheTimeout,
  cacheMaxRetries,
  cacheRetryDelay,
  cacheMethodCleanupTimeout,
  
  fallbackRequestLogPath,
  cacheRequestLogPath,
  poolRequestLogPath,
};
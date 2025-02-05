const fallbackUrl = "https://office.buidlguidl.com:48544";
const cacheServerUrl = 'http://localhost:3002';
const proxyPort = 48544;
const webServerPort = 48545;
const fallbackRequestTimeout = 15000; // 15 seconds
const cacheRequestTimeout = 5000; // 5 second timeout


const fallbackRequestLogPath = "/home/ubuntu/shared/fallbackRequests.log";
const cacheRequestLogPath = "/home/ubuntu/shared/cacheRequests.log";


module.exports = {
  fallbackUrl,
  cacheServerUrl,
  proxyPort,
  webServerPort,
  fallbackRequestTimeout,
  cacheRequestTimeout,

  fallbackRequestLogPath,
  cacheRequestLogPath,
};
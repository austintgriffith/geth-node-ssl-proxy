const fallbackUrl = "https://office.buidlguidl.com:48544";
const proxyPort = 48544;
const webServerPort = 48545;
const fallbackRequestTimeout = 15000; // 15 seconds

const fallbackRequestLogPath = "/home/ubuntu/shared/fallbackRequests.log";
const cacheRequestLogPath = "/home/ubuntu/shared/cacheRequests.log";


module.exports = {
  fallbackUrl,
  proxyPort,
  webServerPort,
  fallbackRequestTimeout,

  fallbackRequestLogPath,
  cacheRequestLogPath,
};
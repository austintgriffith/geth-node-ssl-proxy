const fallbackUrl = "https://office.buidlguidl.com:48544";
const cachePort = 3002;
const proxyPortPublic = 48544;
const webServerPort = 48545;
const poolPort = 3003;
const fallbackRequestTimeout = 15000; // 15 seconds
const cacheKeyTimeout = 15000; // 15 second timeout


const fallbackRequestLogPath = "/home/ubuntu/shared/fallbackRequests.log";
const cacheRequestLogPath = "/home/ubuntu/shared/cacheRequests.log";
const poolRequestLogPath = "/home/ubuntu/shared/poolRequests.log";      

module.exports = {
  fallbackUrl,
  cachePort,
  proxyPortPublic,
  webServerPort,
  poolPort,
  fallbackRequestTimeout,
  cacheKeyTimeout,

  fallbackRequestLogPath,
  cacheRequestLogPath,
  poolRequestLogPath,
};
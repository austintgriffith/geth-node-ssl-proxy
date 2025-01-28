// Server configuration
const fallbackUrl = "https://office.buidlguidl.com:48544";
const proxyPort = 48544;
const webServerPort = 48545;

// WebSocket configuration
const wsHeartbeatInterval = 30000; // 30 seconds
const wsMessageTimeout = 30000;     // 30 seconds
const messageCleanupInterval = 60000; // 1 minute

module.exports = {
  // Server
  fallbackUrl,
  proxyPort,
  webServerPort,
  
  // WebSocket
  wsHeartbeatInterval,
  wsMessageTimeout,
  messageCleanupInterval,
};
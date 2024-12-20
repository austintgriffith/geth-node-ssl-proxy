// Server configuration
const httpsPort = 48544;
const fallbackUrl = "https://office.buidlguidl.com:48544";

// WebSocket configuration
const wsHeartbeatInterval = 30000; // 30 seconds
const wsMessageTimeout = 30000;     // 30 seconds
const messageCleanupInterval = 60000; // 1 minute

module.exports = {
  // Server
  httpsPort,
  fallbackUrl,
  
  // WebSocket
  wsHeartbeatInterval,
  wsMessageTimeout,
  messageCleanupInterval,
};
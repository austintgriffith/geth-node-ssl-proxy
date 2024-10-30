// Server configuration
const httpsPort = 48544;
const targetUrl = "https://office.buidlguidl.com:48544";
const localProviderUrl = "https://office.buidlguidl.com:48544/";

// WebSocket configuration
const wsHeartbeatInterval = 30000; // 30 seconds
const wsMessageTimeout = 30000;     // 30 seconds
const messageCleanupInterval = 60000; // 1 minute

// Database configuration
const defaultQueryMinutes = 5;

module.exports = {
  // Server
  httpsPort,
  targetUrl,
  localProviderUrl,
  
  // WebSocket
  wsHeartbeatInterval,
  wsMessageTimeout,
  messageCleanupInterval,
  
  // Database
  defaultQueryMinutes
};
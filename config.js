// Server configuration
const httpsPort = 48544;
const fallbackUrl = "https://office.buidlguidl.com:48544";
// const dbHost = 'bgclientdb.cluster-cjoo0gi8an8c.us-east-1.rds.amazonaws.com';
const dbHost = 'testdb.cluster-cjoo0gi8an8c.us-east-1.rds.amazonaws.com';

// WebSocket configuration
const wsHeartbeatInterval = 30000; // 30 seconds
const wsMessageTimeout = 30000;     // 30 seconds
const messageCleanupInterval = 60000; // 1 minute

module.exports = {
  // Server
  httpsPort,
  fallbackUrl,
  dbHost,
  
  // WebSocket
  wsHeartbeatInterval,
  wsMessageTimeout,
  messageCleanupInterval,
};
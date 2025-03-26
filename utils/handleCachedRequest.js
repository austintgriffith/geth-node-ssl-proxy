const WebSocket = require('ws');
const EventEmitter = require('events');
const fs = require('fs');

const { poolPort, cacheKeyTimeout, cacheMaxRetries, cacheRetryDelay } = require('../config');

// Create event emitter for cache updates
const cacheEvents = new EventEmitter();

// Local cache storage with timestamps
const cacheMap = new Map();
const cachedMethods = new Set();

// WebSocket connection management
let ws = null;
let connectionAttempts = 0;

function connectWebSocket() {
  if (connectionAttempts >= cacheMaxRetries) {
    console.error(`Failed to connect to cache WebSocket after ${cacheMaxRetries} attempts, giving up`);
    return;
  }

  connectionAttempts++;
  console.log(`Attempting to connect to cache WebSocket (attempt ${connectionAttempts}/${cacheMaxRetries})`);
  
  const wsOptions = {
    rejectUnauthorized: true,
    cert: fs.readFileSync('/home/ubuntu/shared/server.cert'),
    key: fs.readFileSync('/home/ubuntu/shared/server.key'),
    checkServerIdentity: () => undefined // Skip hostname check since we're connecting locally
  };
  
  ws = new WebSocket(`wss://127.0.0.1:${poolPort}/ws`, wsOptions);

  ws.on('open', () => {
    console.log('Connected to cache WebSocket server');
    connectionAttempts = 0;
  });

  ws.on('message', (data) => {
    try {
      const { method, value, timestamp } = JSON.parse(data);
      
      // For eth_blockNumber, only update if new value is higher
      if (method === 'eth_blockNumber') {
        const currentBlock = cacheMap.get(method)?.value;
        if (currentBlock && value <= currentBlock) {
          return;
        }
      }
      
      cacheMap.set(method, { value, timestamp });
      cachedMethods.add(method);
      // console.log(`Updated local cache for ${method}:`, value);
      
      // Emit event when cached methods change
      cacheEvents.emit('cachedMethodsUpdated', Array.from(cachedMethods));
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    cachedMethods.clear();
    cacheEvents.emit('cachedMethodsUpdated', []);
    
    if (connectionAttempts < cacheMaxRetries) {
      console.log(`Attempting to reconnect in ${cacheRetryDelay}ms...`);
      setTimeout(connectWebSocket, cacheRetryDelay);
    } else {
      console.error('Max reconnection attempts reached, giving up');
    }
  });
}

// Initial connection attempt
connectWebSocket();

function getCacheValue(method) {
  const cacheEntry = cacheMap.get(method);
  if (!cacheEntry) {
    throw new Error(`Cache miss: No cached value found for method ${method}`);
  }

  const { value, timestamp } = cacheEntry;
  
  // If timestamp is null, it's a permanent cache entry (like eth_chainId)
  if (timestamp === null) {
    return value;
  }
  
  // Check if cache is stale
  const now = Date.now();
  if (now - timestamp > cacheKeyTimeout) {
    const ageMs = now - timestamp;

    throw new Error(`{"error":{"code":-69004,"message":"Cache stale: Value for method ${method} is ${ageMs}ms old (threshold: ${cacheKeyTimeout}ms)"}}`);
    // throw new Error(`Cache stale: Value for method ${method} is ${ageMs}ms old (threshold: ${cacheKeyTimeout}ms)`);
  }
  
  return value;
}

async function handleCachedRequest(req, res) {
  console.log("💾 Using cached request mechanism");
  try {    
    const value = getCacheValue(req.body.method);
    return {
      success: true,
      data: {
        jsonrpc: "2.0",
        id: req.body.id,
        result: value
      }
    };
  } catch (error) {    
    console.error("Error in handleCachedRequest:", error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Function to get currently cached methods
function getCachedMethods() {
  return Array.from(cachedMethods);
}

// Function to subscribe to cache updates
function subscribeToCacheUpdates(callback) {
  cacheEvents.on('cachedMethodsUpdated', callback);
  // Immediately send current cached methods
  callback(Array.from(cachedMethods));
}

module.exports = { 
  handleCachedRequest,
  getCachedMethods,
  subscribeToCacheUpdates
};
const WebSocket = require('ws');
const EventEmitter = require('events');
const fs = require('fs');

const { poolPort, cacheKeyTimeout, cacheMaxRetries, cacheRetryDelay } = require('../config');

// Create event emitter for cache updates
const cacheEvents = new EventEmitter();

// Local cache storage with timestamps
const cacheMap = new Map();
const cachedMethods = new Set();

// Helper function to create cache key from method and params
function createCacheKey(method, params) {
  return `${method}:${JSON.stringify(params)}`;
}

// WebSocket connection management
let ws = null;
let connectionAttempts = 0;

function connectWebSocket() {
  if (connectionAttempts >= cacheMaxRetries) {
    console.error(`Failed to connect to cache WebSocket after ${cacheMaxRetries} attempts, giving up`);
    return;
  }

  connectionAttempts++;
  console.log(`Attempting to connect to pool cache WebSocket (attempt ${connectionAttempts}/${cacheMaxRetries})`);
  
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
      const message = JSON.parse(data);
      
      // Only process cache update messages
      if (message.type !== 'cacheUpdate') {
        return;
      }

      const { method, params, value, timestamp } = message;
      
      // For eth_blockNumber, only update if new value is higher
      if (method === 'eth_blockNumber') {
        const currentBlock = cacheMap.get(createCacheKey(method, []))?.value;
        if (currentBlock && value <= currentBlock) {
          return;
        }
      }
      
      const cacheKey = createCacheKey(method, params);
      cacheMap.set(cacheKey, { value, params, timestamp });
      cachedMethods.add(method);
      
      // Emit event when cached methods change
      cacheEvents.emit('cachedMethodsUpdated', Array.from(cachedMethods));
      console.log(`Updated cached method: ${method} | Params: ${JSON.stringify(params)}`);

      // Please dont delete this, it's useful for debugging
      // console.log('\n=== Cached RPC Methods ===\n');
      // Array.from(cachedMethods).forEach(method => {
      //     // Find all cache entries for this method
      //     for (const [key, cacheData] of cacheMap.entries()) {
      //         if (key.startsWith(method + ':')) {
      //             const timestamp = new Date(cacheData.timestamp).toLocaleString();
      //             console.log(`Method: ${method}`);
      //             console.log(`Params: ${JSON.stringify(cacheData.params)}`);
      //             console.log(`Value: ${cacheData.value}`);
      //             console.log(`Last Updated: ${timestamp}`);
      //             console.log('-------------------');
      //         }
      //     }
      // });
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

function getCacheValue(method, params) {
  const cacheKey = createCacheKey(method, params);
  const cacheEntry = cacheMap.get(cacheKey);
  if (!cacheEntry) {
    throw new Error(`Cache miss: No cached value found for method ${method} with params ${JSON.stringify(params)}`);
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
    throw new Error(`{"error":{"code":-69004,"message":"Cache stale: Value for method ${method} with params ${JSON.stringify(params)} is ${ageMs}ms old (threshold: ${cacheKeyTimeout}ms)"}}`);
  }
  
  return value;
}

async function handleCachedRequest(req, res) {
  console.log("💾 Using cached request mechanism");
  try {    
    // Handle case where params is undefined or not present in the request
    const params = req.body.params === undefined ? [] : req.body.params;
    const value = getCacheValue(req.body.method, params);
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

// Function to get the cache map
function getCacheMap() {
  return cacheMap;
}

module.exports = { 
  handleCachedRequest,
  getCachedMethods,
  subscribeToCacheUpdates,
  getCacheMap
};
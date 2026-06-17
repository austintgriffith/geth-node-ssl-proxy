const WebSocket = require('ws');
const EventEmitter = require('events');
const fs = require('fs');

const { poolPort, blockNumberCacheTimeout, cacheMaxRetries, cacheRetryDelay, cacheMethodCleanupTimeout } = require('../config');

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
      console.log(`💾 Updated cached method: ${method}`);

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
  
  // Check if cache is stale - only for eth_blockNumber method
  if (method === 'eth_blockNumber') {
    const now = Date.now();
    if (now - timestamp > blockNumberCacheTimeout) {
      const ageMs = now - timestamp;
      throw new Error(`{"error":{"code":-69004,"message":"Cache stale: Value for method ${method} with params ${JSON.stringify(params)} is ${ageMs}ms old (threshold: ${blockNumberCacheTimeout}ms)"}}`);
    }
  }
  
  return value;
}

async function handleCachedRequest(reqBody, res) {
  console.log("💾 Using cached request mechanism");
  try {    
    // Handle case where params is undefined or not present in the request
    const params = reqBody.params === undefined ? [] : reqBody.params;
    const value = getCacheValue(reqBody.method, params);
    return {
      success: true,
      data: {
        jsonrpc: "2.0",
        id: reqBody.id,
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

// Function to clear old cached methods
function clearOldCachedMethods() {
  console.log(`🧹 Running clearOldCachedMethods()`);
  const now = Date.now();
  let methodsToRemove = new Set();
  
  // Check each cache entry
  for (const [key, cacheData] of cacheMap.entries()) {
    // Skip permanent cache entries (like eth_chainId)
    if (cacheData.timestamp === null) {
      continue;
    }
    
    // Extract the method name from the key
    const method = key.split(':')[0];
    
    // Skip eth_blockNumber and eth_chainId methods
    if (method === 'eth_blockNumber' || method === 'eth_chainId') {
      continue;
    }
    
    // Check if the cache entry is older than the cleanup interval
    if (now - cacheData.timestamp > cacheMethodCleanupTimeout) {
      methodsToRemove.add(method);
      cacheMap.delete(key);
      console.log(`🧹 Removed stale cache entry: ${key}`);
    }
  }
  
  // Update cachedMethods set
  for (const method of methodsToRemove) {
    // Check if there are any remaining entries for this method
    let hasRemainingEntries = false;
    for (const [key] of cacheMap.entries()) {
      if (key.startsWith(method + ':')) {
        hasRemainingEntries = true;
        break;
      }
    }
    
    // If no entries remain for this method, remove it from cachedMethods
    if (!hasRemainingEntries) {
      cachedMethods.delete(method);
      console.log(`🧹 Removed method from cachedMethods: ${method}`);
    }
  }
  
  // Emit event when cached methods change
  if (methodsToRemove.size > 0) {
    cacheEvents.emit('cachedMethodsUpdated', Array.from(cachedMethods));
  }
}

// Set up interval to clear old cached methods every 10 seconds
setInterval(clearOldCachedMethods, 1000 * 60 * 60);

module.exports = { 
  handleCachedRequest,
  getCachedMethods,
  subscribeToCacheUpdates,
  getCacheMap
};
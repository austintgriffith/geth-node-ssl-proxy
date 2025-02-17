const https = require("https");
const axios = require("axios");
const WebSocket = require('ws');
const EventEmitter = require('events');

const { cachePort, cacheKeyTimeout } = require('../config');

// Create event emitter for cache updates
const cacheEvents = new EventEmitter();

// Local cache storage with timestamps
const cacheMap = new Map();
const cachedMethods = new Set();

// WebSocket connection management
let ws = null;
let connectionAttempts = 0;
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000; // 5 seconds

function connectWebSocket() {
  if (connectionAttempts >= MAX_RETRIES) {
    console.error(`Failed to connect to cache WebSocket after ${MAX_RETRIES} attempts, giving up`);
    return;
  }

  connectionAttempts++;
  console.log(`Attempting to connect to cache WebSocket (attempt ${connectionAttempts}/${MAX_RETRIES})`);
  
  ws = new WebSocket(`ws://localhost:${cachePort}/ws`);

  ws.on('open', () => {
    console.log('Connected to cache WebSocket server');
    connectionAttempts = 0; // Reset counter on successful connection
  });

  ws.on('message', (data) => {
    try {
      const { method, value, timestamp } = JSON.parse(data);
      
      // For eth_blockNumber, only update if new value is higher
      if (method === 'eth_blockNumber') {
        const currentBlock = cacheMap.get(method)?.value;
        if (currentBlock && value <= currentBlock) {
          return; // Skip if new block number isn't higher
        }
      }
      
      cacheMap.set(method, { value, timestamp });
      cachedMethods.add(method);
      console.log(`Updated local cache for ${method}:`, value);
      
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
    // Clear cached methods when connection is lost
    cachedMethods.clear();
    cacheEvents.emit('cachedMethodsUpdated', []);
    
    if (connectionAttempts < MAX_RETRIES) {
      console.log(`Attempting to reconnect in ${RETRY_DELAY}ms...`);
      setTimeout(connectWebSocket, RETRY_DELAY);
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
    throw new Error(`Cache stale: Value for method ${method} is ${ageMs}ms old (threshold: ${cacheKeyTimeout}ms)`);
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
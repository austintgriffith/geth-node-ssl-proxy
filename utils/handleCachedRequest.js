const https = require("https");
const axios = require("axios");

const { cacheTTL } = require('../config');

let cacheData = null;
let lastCacheFetch = 0;

async function getCache(key) {
  try {
    const now = Date.now();
    // Refresh cache if it's expired or doesn't exist
    if (!cacheData || now - lastCacheFetch > cacheTTL) {
      const response = await axios.get('http://localhost:3002');
      cacheData = response.data;
      lastCacheFetch = now;
    }
    return cacheData[key] || null;
  } catch (error) {
    console.error("Error in getCache:", error);
    console.error(`Error fetching cache:`, error.message);
    return null;
  }
}

async function handleCachedRequest(req, res) {
  console.log("Using cached request mechanism");
  try {    
    const result = await getCache(req.body.method);
    if (!result) {
      throw new Error('Cache miss');
    }
    
    const response = {
      jsonrpc: "2.0",
      id: req.body.id,
      result: result
    };
    
    res.json(response);
    return "success";
  } catch (error) {    
    console.error("Error in handleCachedRequest:", error);
    const errorMessage = error.message || 'Unknown error';
    const errorResponse = {
      jsonrpc: "2.0",
      id: req.body.id,
      error: {
        code: -32603,
        message: "Internal error",
        data: errorMessage
      }
    };
    res.status(500).json(errorResponse);
    return errorMessage;
  }
}

module.exports = { handleCachedRequest };
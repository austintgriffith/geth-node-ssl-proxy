const https = require("https");
const axios = require("axios");

const { cacheServerUrl, cacheRequestTimeout } = require('../config');

async function getCache(key) {
  try {
    const response = await axios.get(cacheServerUrl, {
      timeout: cacheRequestTimeout,
      validateStatus: function (status) {
        return status >= 200 && status < 300; // Accept only success status codes
      }
    });
    const cacheData = response.data;
    return cacheData[key] || null;
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
      console.error(`Cache server not available at ${CACHE_SERVER_URL}`);
    } else if (error.code === 'ETIMEDOUT') {
      console.error(`Cache request timed out after ${cacheRequestTimeout}ms`);
    } else {
      console.error("Error in getCache:", error);
    }
    return null;
  }
}

async function handleCachedRequest(req, res) {
  console.log("Using cached request mechanism");
  try {    
    const result = await getCache(req.body.method);
    if (!result) {
      throw new Error(`Cache miss for key: ${req.body.method}`);
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
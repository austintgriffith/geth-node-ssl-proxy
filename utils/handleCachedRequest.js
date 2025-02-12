const https = require("https");
const axios = require("axios");

const { cachePort, cacheRequestTimeout } = require('../config');

async function getCache(key, retries = 3, delay = 75) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const url = `http://localhost:${cachePort}?key=${encodeURIComponent(key)}`;
      const response = await axios.get(url, {
        timeout: cacheRequestTimeout,
        validateStatus: function (status) {
          return true; // Accept all status codes to handle error responses
        }
      });
      
      // Check if response contains an error
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      const cacheData = response.data;
      console.log('Looking for key:', key);
      console.log('Value found:', cacheData[key]);
      return cacheData[key] || null;
    } catch (error) {
      if (attempt === retries) {
        // Get the most specific error message available
        const errorMessage = error.response?.data?.error || error.message;
        if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
          console.error(`Cache server not available at ${cachePort}`);
        } else if (error.code === 'ETIMEDOUT') {
          console.error(`Cache request timed out after ${cacheRequestTimeout}ms`);
        } else {
          console.error(`Cache error: ${errorMessage}`);
        }
        throw new Error(errorMessage);
      }
      console.log(`Retrying cache request in ${delay}ms (attempt ${attempt}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return null;
}

async function handleCachedRequest(req, res) {
  console.log("💾 Using cached request mechanism");
  try {    
    const result = await getCache(req.body.method);
    if (!result) {
      throw new Error(`Cache miss for key: ${req.body.method}`);
    }
    
    return {
      success: true,
      data: {
        jsonrpc: "2.0",
        id: req.body.id,
        result: result
      }
    };
  } catch (error) {    
    console.error("Error in handleCachedRequest:", error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
}

module.exports = { handleCachedRequest };
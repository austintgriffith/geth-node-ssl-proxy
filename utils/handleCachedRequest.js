const https = require("https");
const axios = require("axios");

async function getCache(key) {
  try {
    const response = await axios.get('http://localhost:3002');
    const cacheData = response.data;
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
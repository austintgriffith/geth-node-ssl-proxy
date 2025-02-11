const https = require("https");
const axios = require("axios");

const { fallbackUrl, fallbackRequestTimeout, poolPort } = require('../config');

async function handleRequest(req, res, type) {
  if (type === 'fallback') {
    console.log("Using fallback mechanism");
  } else if (type === 'pool') {
    console.log("Using pool mechanism");
  }

  try {    
    const result = await makeRequest(req.body, req.headers, type);
    console.log("RPC Response:", result);
    return { success: true, data: result };
  } catch (error) {    
    // Simple error logging with essential info only
    const errorDetails = error.response?.data?.error || error.error || error;
    console.log("❌ Request failed:", {
      message: errorDetails.message || error.message,
      code: errorDetails.code,
      data: errorDetails.data
    });
    
    const errorResponse = {
        jsonrpc: "2.0",
        id: req.body.id,
        error: {
            code: -32603,
            message: "Internal error",
            data: errorDetails.message || error.message
        }
    };
    return { success: false, error: errorResponse };
  }
}

async function makeRequest(body, headers, type) {
  try {
    let url;
    if (type === 'fallback') {
      url = fallbackUrl;
    } else if (type === 'pool') {
      url = `https://localhost:${poolPort}/requestPool` ;
    }

    // Create a new headers object without the problematic host header
    const cleanedHeaders = { ...headers };
    delete cleanedHeaders.host;
    
    const requestBody = typeof body === 'string' ? JSON.parse(body) : body;
    
    const response = await axios.post(url, requestBody, {
      headers: {
        "Content-Type": "application/json",
        ...cleanedHeaders,
      },
      timeout: fallbackRequestTimeout,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });
    return response.data;
  } catch (error) {
    // Simplified error logging for network/request errors
    if (error.response?.data) {
      throw error.response.data;
    }
    
    if (error.code === 'ECONNABORTED') {
      throw {
        error: {
          code: -32603,
          message: `Request timed out after ${fallbackRequestTimeout/1000} seconds`
        }
      };
    }
    
    throw {
      error: {
        code: -32603,
        message: error.message || "Unknown error"
      }
    };
  }
}

module.exports = { handleRequest };
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
    console.log("Full RPC Response:", JSON.stringify(result, null, 2));
    res.json(result);
    return "success";
  } catch (error) {    
    console.error("Handler caught error:", error);
    
    // Extract complete error information
    let errorMessage;
    if (error.error) {
        // For structured errors, include both code and message
        errorMessage = `[${error.error.code}] ${error.error.message}`;
        if (error.error.data) {
            errorMessage += `: ${error.error.data}`;
        }
    } else {
        // Fallback
        errorMessage = error.message || 'Unknown error';
    }
    
    const errorResponse = {
        jsonrpc: "2.0",
        id: req.body.id,
        error: {
            code: -32603,
            message: "Internal error",
            data: errorMessage
        }
    };
    console.log("Full Error Response:", JSON.stringify(errorResponse, null, 2));
    res.status(500).json(errorResponse);
    return JSON.stringify(errorResponse);  // Return full error response for logging
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
    delete cleanedHeaders.host; // Remove the host header to let axios set it correctly
    
    const response = await axios.post(url, body, {
      headers: {
        "Content-Type": "application/json",
        ...cleanedHeaders,
      },
      timeout: fallbackRequestTimeout,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false // Only for local development
      })
    });
    return response.data;
  } catch (error) {
    console.error("RPC request error:", error);
    console.error("Error response data:", error.response?.data);
    
    // Pass through the complete error response
    if (error.response?.data) {
      throw error.response.data;  // Throw the complete error response
    }
    
    // For timeout errors, create a structured error
    if (error.code === 'ECONNABORTED') {
      throw {
        error: {
          message: "Request timeout",
          data: `Request timed out after ${fallbackRequestTimeout/1000} seconds`
        }
      };
    }
    
    // For any other error, create a structured error
    throw {
      error: {
        message: error.name || "Error",
        data: error.message || "Unknown error"
      }
    };
  }
}

module.exports = { handleRequest };
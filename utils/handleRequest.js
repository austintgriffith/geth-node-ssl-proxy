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
    const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown error';
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
    return errorMessage;
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
    if (error.response && error.response.data) {
      throw error.response.data;
    }
    // Add specific handling for timeout errors
    if (error.code === 'ECONNABORTED') {
      throw new Error(`Request timed out after ${fallbackRequestTimeout/1000} seconds`);
    }
    throw error;
  }
}

module.exports = { handleRequest };
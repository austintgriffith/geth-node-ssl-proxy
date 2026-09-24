const https = require("https");
const axios = require("axios");
const fs = require("fs");

require('dotenv').config();

const { fallbackRequestTimeout, poolRequestTimeout, poolRequestTimeoutByMethod, poolPort, forwardedHeaders } = require('../config');

// Read the cert/key once, not per request
const httpsAgent = new https.Agent({
  rejectUnauthorized: true,
  cert: fs.readFileSync('/home/ubuntu/shared/server.cert'),
  key: fs.readFileSync('/home/ubuntu/shared/server.key')
});

async function handleRequest(req, res, type) {
  if (type === 'fallback') {
    console.log("🍁 Using fallback mechanism");
  } else if (type === 'pool') {
    console.log("🤿 Using pool mechanism");
  }

  try {    
    const result = await makeRequest(req.body, req.headers, type);
    return { success: true, data: result };
  } catch (error) {    
    // If the error is already in JSON-RPC format, pass it through
    if (error.jsonrpc === "2.0" && error.error) {
      console.log("❌ Request failed:", error);
      return { success: false, error: error };
    }
    
    // For other errors, format them as before
    const errorDetails = error.error || error;
    console.log("❌ Request failed:", {
      message: errorDetails.message || error.message,
      code: errorDetails.code,
      data: errorDetails.data
    });
    
    const errorResponse = {
        jsonrpc: "2.0",
        id: req.body.id,
        error: {
            code: -70000,
            message: "Internal Proxy service error",
            data: errorDetails.message || error.message
        }
    };
    return { success: false, error: errorResponse };
  }
}

async function makeRequest(body, headers, type) {
  let timeout = type === 'pool' ? poolRequestTimeout : fallbackRequestTimeout;
  try {
    let url;
    if (type === 'fallback') {
      url = process.env.FALLBACK_URL;
    } else if (type === 'pool') {
      url = `https://${process.env.HOST}:${poolPort}/requestPool`;
    }

    // Forward only allowlisted caller headers; axios sets host, content-length etc. itself
    const cleanedHeaders = {};
    for (const name of forwardedHeaders) {
      if (headers[name] !== undefined) cleanedHeaders[name] = headers[name];
    }
    
    const requestBody = typeof body === 'string' ? JSON.parse(body) : body;
    
    if (type === 'pool' && poolRequestTimeoutByMethod[requestBody.method] !== undefined) {
      timeout = poolRequestTimeoutByMethod[requestBody.method];
    }
    const axiosConfig = {
      headers: {
        ...cleanedHeaders,
        "Content-Type": "application/json",
      },
      timeout,
      httpsAgent
    };
    
    const response = await axios.post(url, requestBody, axiosConfig);
    return response.data;
  } catch (error) {
    // Simplified error logging for network/request errors
    if (error.response?.data) {
      throw error.response.data;
    }
    
    if (error.code === 'ECONNABORTED') {
      const timeoutSeconds = timeout / 1000;
      throw {
        error: {
          code: -69008,
          message: `Request timed out after ${timeoutSeconds} seconds`
        }
      };
    }
    
    throw {
      error: {
        code: -70000,
        message: error.message || "Unknown error"
      }
    };
  }
}

module.exports = { handleRequest };
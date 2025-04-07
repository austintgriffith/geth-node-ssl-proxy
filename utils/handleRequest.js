const https = require("https");
const axios = require("axios");
const fs = require("fs");

require('dotenv').config();

const { fallbackUrl, fallbackRequestTimeout, poolPort } = require('../config');

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
    
    // For axios errors with response data, pass through the RPC error
    if (error.response?.data) {
      console.log("❌ Request failed:", error.response.data);
      return { success: false, error: error.response.data };
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
      url = `https://${process.env.HOST}:${poolPort}/requestPool`;
    }

    // Create a new headers object without the problematic host header
    const cleanedHeaders = { ...headers };
    delete cleanedHeaders.host;
    
    const requestBody = typeof body === 'string' ? JSON.parse(body) : body;
    
    // Debug log the request
    console.log(`🔍 ${type.toUpperCase()} Request:`, {
      url,
      body: requestBody,
      headers: cleanedHeaders
    });
    
    const axiosConfig = {
      headers: {
        "Content-Type": "application/json",
        ...cleanedHeaders,
      },
      timeout: fallbackRequestTimeout,
      httpsAgent: new https.Agent({
        rejectUnauthorized: true,
        cert: fs.readFileSync('/home/ubuntu/shared/server.cert'),
        key: fs.readFileSync('/home/ubuntu/shared/server.key')
      })
    };
    
    const response = await axios.post(url, requestBody, axiosConfig);
    return response.data;
  } catch (error) {
    // Debug log the error response
    if (error.response) {
      console.log(`🔍 ${type.toUpperCase()} Error Response:`, {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers
      });
    }
    
    // Pass through the error response from the RPC provider
    if (error.response?.data) {
      throw error.response.data;
    }
    
    if (error.code === 'ECONNABORTED') {
      throw {
        jsonrpc: "2.0",
        id: body.id,
        error: {
          code: -32603,
          message: `Request timed out after ${fallbackRequestTimeout/1000} seconds`
        }
      };
    }
    
    throw {
      jsonrpc: "2.0",
      id: body.id,
      error: {
        code: -32603,
        message: error.message || "Unknown error"
      }
    };
  }
}

module.exports = { handleRequest };
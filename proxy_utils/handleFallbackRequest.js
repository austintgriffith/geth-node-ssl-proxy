const https = require("https");
const axios = require("axios");

const { fallbackUrl } = require('../config');

async function handleFallbackRequest(req, res) {
  console.log("Using fallback mechanism");
  try {    
    const result = await makeFallbackRpcRequest(req.body, req.headers);
    res.json(result);
    return { status: "success" };
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
    res.status(500).json(errorResponse);
    return { status: errorMessage };
  }
}

async function makeFallbackRpcRequest(body, headers) {
  try {
    // Create a new headers object without the problematic host header
    const cleanedHeaders = { ...headers };
    delete cleanedHeaders.host; // Remove the host header to let axios set it correctly
    
    const response = await axios.post(fallbackUrl, body, {
      headers: {
        "Content-Type": "application/json",
        ...cleanedHeaders,
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: true
      })
    });
    return response.data;
  } catch (error) {
    console.error("RPC request error:", error);
    if (error.response && error.response.data) {
      throw error.response.data;
    }
    throw error;
  }
}

module.exports = { handleFallbackRequest };
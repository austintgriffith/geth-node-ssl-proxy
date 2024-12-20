const https = require("https");
const axios = require("axios");

async function makeFallbackRpcRequest(url, body, headers) {
  try {
    // Create a new headers object without the problematic host header
    const cleanedHeaders = { ...headers };
    delete cleanedHeaders.host; // Remove the host header to let axios set it correctly

    const response = await axios.post(url, body, {
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

module.exports = { makeFallbackRpcRequest };
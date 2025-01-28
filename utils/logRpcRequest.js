const fs = require('fs');
const { performance } = require('perf_hooks');
const { fallbackUrl } = require('../config');

function logRpcRequest(req, messageId, openMessages, success) {
  const { method, params } = req.body;
  const messageData = openMessages.get(messageId);
  const startTime = messageData ? messageData.startTime : performance.now();
  const endTime = performance.now();
  const duration = endTime - startTime;

  // Get current date in UTC
  const now = new Date();
  const utcTimestamp = now.toISOString().replace('T', ' ').slice(0, 19);
  const epochTime = Math.floor(now.getTime() / 1000);

  // Get request origin from headers
  let reqHost = req.get('Referer') || req.get('Origin') || req.get('host');
  try {
    const url = new URL(reqHost);
    reqHost = url.hostname;
  } catch (error) {
    reqHost = req.get('host').split(':')[0];
  }

  // Get peerId from the client that handled the request
  // If handlingClient is null, it means we used the fallback URL
  const peerId = req.handlingClient?.nodeStatusId || fallbackUrl;

  let logEntry = `${utcTimestamp}|${epochTime}|${reqHost}|${peerId}|${method}|`;
  
  if (params && Array.isArray(params)) {
    logEntry += params.map(param => {
      if (typeof param === 'object' && param !== null) {
        return JSON.stringify(param);
      }
      return param;
    }).join(',');
  }
  
  logEntry += `|${duration.toFixed(3)}|${messageId}|${success}\n`;
  
  fs.appendFile('rpcRequests.log', logEntry, (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });

  // Clean up the message data
  openMessages.delete(messageId);
}

module.exports = { logRpcRequest };
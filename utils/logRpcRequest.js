const fs = require('fs');
const { performance } = require('perf_hooks');
const { targetUrl } = require('../config');

function logRpcRequest(req, messageId, requestStartTimes) {
  const { method, params } = req.body;
  const startTime = requestStartTimes.get(messageId);
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
  const peerId = req.handlingClient?.nodeStatusId || targetUrl;

  let logEntry = `${utcTimestamp}|${epochTime}|${reqHost}|${peerId}|${method}|`;
  
  if (params && Array.isArray(params)) {
    logEntry += params.map(param => {
      if (typeof param === 'object' && param !== null) {
        return JSON.stringify(param);
      }
      return param;
    }).join(',');
  }
  
  logEntry += `|${duration.toFixed(3)}\n`;
  
  fs.appendFile('rpcRequests.log', logEntry, (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });

  // Clean up the start time
  requestStartTimes.delete(messageId);
}

module.exports = { logRpcRequest };
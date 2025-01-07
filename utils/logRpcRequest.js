const fs = require('fs');
const crypto = require('crypto');
const { performance } = require('perf_hooks');
const { fallbackUrl } = require('../config');

function logRpcRequest(req, messageId, requestStartTimes, success, response = null, pendingMessageChecks = null) {
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
  
  logEntry += `|${duration.toFixed(3)}|${messageId}|${success}`;

  let responseHash = null;
  // Add response data if available
  if (response) {
    // DON'T DELETE THIS COMMENTED CODE!
    // const hash = crypto.createHash('sha256');
    // hash.update(JSON.stringify(response));
    // responseHash = hash.digest('hex');
    // logEntry += `|${responseHash}`;

    responseHash = typeof response === 'object' ? JSON.stringify(response) : response;
    logEntry += `|${responseHash}`;
  }

  logEntry += '\n';
  
  // Determine which log file to write to based on message ID
  const logFile = messageId.endsWith('_') ? 'rpcRequestsCheck.log' : 'rpcRequestsMain.log';
  
  fs.appendFile(logFile, logEntry, (err) => {
    if (err) {
      console.error(`Error writing to ${logFile}:`, err);
    }
  });

  // Add to pendingMessageChecks if it's provided and this is a successful request
  // and this is not a fallback request
  if (pendingMessageChecks && success && responseHash && req.handlingClient !== null) {
    pendingMessageChecks.set(messageId, {
      peerId,
      messageId,
      responseHash
    });
  }

  // Clean up the start time
  requestStartTimes.delete(messageId);
}

module.exports = { logRpcRequest };
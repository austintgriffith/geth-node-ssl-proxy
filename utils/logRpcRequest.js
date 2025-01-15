const fs = require('fs');
const crypto = require('crypto');
const { performance } = require('perf_hooks');
const { fallbackUrl } = require('../config');
const { requestStartTimes, pendingMessageChecks } = require('../globalState');

function logRpcRequest(req, messageId, success, response = null) {
  const { method, params } = req.body;
  const startTime = requestStartTimes.get(messageId);
  const endTime = performance.now();
  const duration = endTime - startTime;

  // Get current date in UTC
  const now = new Date();
  const utcTimestamp = now.toISOString().replace('T', ' ').slice(0, 19);
  const epochTime = Math.floor(now.getTime() / 1000);

  // Get request origin from headers
  let reqHost = req.get ? (req.get('Referer') || req.get('Origin') || req.get('host')) 
  : (req.headers?.referer || req.headers?.origin || req.headers?.host);

  try {
    const url = new URL(reqHost);
    reqHost = url.hostname;
  } catch (error) {
    reqHost = (req.get ? req.get('host') : req.headers?.host)?.split(':')[0] || 'unknown';
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
  
  logEntry += `|${duration.toFixed(3)}|${messageId}`;

  let responseResult = '';
  if (response) {
    if (response instanceof Map) {
      responseResult = JSON.stringify(Object.fromEntries(response));
    } else if (typeof response === 'object' && response !== null) {
      responseResult = response.result || response;
    } else {
      responseResult = response;
    }
  }
  
  // Convert responseResult to a string if it's an object, but avoid double quotes for strings
  if (typeof responseResult === 'object') {
    responseResult = JSON.stringify(responseResult);
  }

  logEntry += `|${success}|${responseResult}\n`;
  
  // Determine which log file to write to based on message ID
  const logFile = messageId.endsWith('_') ? 'rpcRequestsCheck.log' : 
                  messageId.endsWith('!') ? 'rpcRequestsCheckB.log' :
                  'rpcRequestsMain.log';
  
  fs.appendFile(logFile, logEntry, (err) => {
    if (err) {
      console.error(`Error writing to ${logFile}:`, err);
    }
  });

  // Add to pendingMessageChecks if this is a successful request
  // and this is not a fallback request and it's either a check message or has corresponding check messages
  if (success && response && req.handlingClient !== null) {
    const isCheckMessage = messageId.endsWith('_') || messageId.endsWith('!');
    
    // Only add if it's a check message OR if it's a main message that we know had check messages sent
    if (isCheckMessage || req.hasCheckMessages) {
      let responseHash = response instanceof Map ? 
        JSON.stringify({ result: response.get('result') }) :
        (typeof response === 'object' ? JSON.stringify(response) : response);

      pendingMessageChecks.set(messageId, {
        peerId: req.handlingClient.nodeStatusId,
        messageId: messageId,
        responseHash
      });

      console.log(`Added to pendingMessageChecks: ${messageId} from peer ${req.handlingClient.nodeStatusId}`);
    } else {
      console.log(`Skipping pendingMessageChecks for message ${messageId} - no check messages were generated`);
    }
  }

  // Clean up the start time
  requestStartTimes.delete(messageId);
}

module.exports = { logRpcRequest };
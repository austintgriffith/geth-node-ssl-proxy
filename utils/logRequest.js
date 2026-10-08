const fs = require('fs');
const { fallbackRequestLogPath, cacheRequestLogPath, poolRequestLogPath, mergedRequestLogPath } = require('../config');
const { formatLogLine, formatMergedLine, clientIp, requestOrigin } = require('./requestLogFormat');

function logRequest(req, startTime, utcTimestamp, duration, status, type) {
  const { method, params } = req.body;

  // Format status properly - if it's an object, stringify it, otherwise use as is
  let cleanStatus;
  if (typeof status === 'object' && status !== null) {
    cleanStatus = JSON.stringify(status);
  } else {
    cleanStatus = status ? status.toString().replace(/[\r\n\s]+/g, ' ').trim() : 'unknown';
  }

  let paramsText = '';
  if (params && Array.isArray(params)) {
    paramsText = params.map(param => {
      if (typeof param === 'object' && param !== null) {
        return JSON.stringify(param);
      }
      return param;
    }).join(',');
  }

  // v2 line: origin, then the caller's IP (utils/requestLogFormat.js)
  const logEntry = formatLogLine({
    timestamp: utcTimestamp,
    epoch: startTime,
    origin: requestOrigin(req),
    ip: clientIp(req),
    method,
    params: paramsText,
    elapsed: duration,
    status: cleanStatus,
  });

  let logPath;
  if (type === 'fallback') {
    logPath = fallbackRequestLogPath;
  } else if (type === 'cache') {
    logPath = cacheRequestLogPath;
  } else if (type === 'pool') {
    logPath = poolRequestLogPath;
  } else {
    // Unknown type (e.g. an error before any attempt was made): never throw from the logger
    console.error(`logRequest: no log file for type "${type}":`, logEntry.trim());
    return;
  }
  
  fs.appendFile(logPath, logEntry, (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });
}

/**
 * A request answered by merging into an identical one in flight: one line in mergedRequests.log.
 * (Its normal line goes to cacheRequests.log through logRequest(..., 'cache').)
 */
function logMergedRequest(req, startTime, utcTimestamp, waitMs, leaderEpoch, sameCaller) {
  const line = formatMergedLine({
    timestamp: utcTimestamp,
    epoch: startTime,
    origin: requestOrigin(req),
    ip: clientIp(req),
    method: req.body.method,
    waitMs,
    leaderEpoch,
    sameCaller,
  });
  fs.appendFile(mergedRequestLogPath, line, (err) => {
    if (err) console.error('Error writing to merged request log:', err);
  });
}

// The caller as merging compares it: origin and IP, as logged
function callerOf(req) {
  return `${requestOrigin(req)}|${clientIp(req)}`;
}

module.exports = { logRequest, logMergedRequest, callerOf };
const fs = require('fs');
const { fallbackUrl } = require('../config');

const truncateValue = (value, maxLength = 100) => {
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
  if (stringValue.length <= maxLength) {
    return stringValue;
  }
  return stringValue.substring(0, maxLength) + '...';
};

const logDebug = (message, ...args) => {
  const timestamp = new Date().toISOString();
  // Modify args to truncate long values
  const truncatedArgs = args.map(arg => {
    if (typeof arg === 'object') {
      const truncatedObj = {};
      for (const [key, value] of Object.entries(arg)) {
        truncatedObj[key] = truncateValue(value);
      }
      return truncatedObj;
    }
    return truncateValue(arg);
  });
  
  const logMessage = `${timestamp} - ${message} ${truncatedArgs.map(arg => JSON.stringify(arg)).join(' ')}\n`;
  try {
    // Create file if it doesn't exist
    if (!fs.existsSync('rpcMessageChecksDebug.log')) {
      fs.writeFileSync('rpcMessageChecksDebug.log', '');
    }
    fs.appendFileSync('rpcMessageChecksDebug.log', logMessage);
  } catch (error) {
    console.error('Error writing to debug log:', error);
  }
};

const compareResponses = (response1, response2, messageId) => {
  const sortObject = (obj) => {
    if (Array.isArray(obj)) {
      return obj.map(sortObject).sort();
    }
    if (obj && typeof obj === 'object') {
      const sortedObj = {};
      Object.keys(obj).sort().forEach(key => {
        sortedObj[key] = sortObject(obj[key]);
      });
      return sortedObj;
    }
    return obj;
  };

  const findDifferences = (obj1, obj2, path = '') => {
    const differences = [];
    
    // Handle case where either value is not an object
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || 
        obj1 === null || obj2 === null) {
      if (obj1 !== obj2) {
        differences.push({
          path: path || 'root',
          value1: obj1,
          value2: obj2
        });
      }
      return differences;
    }

    // Get common keys between both objects
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    const commonKeys = keys1.filter(key => keys2.includes(key));
    
    for (const key of commonKeys) {
      const currentPath = path ? `${path}.${key}` : key;
      const val1 = obj1[key];
      const val2 = obj2[key];
      
      if (typeof val1 === 'object' && typeof val2 === 'object' &&
          val1 !== null && val2 !== null) {
        differences.push(...findDifferences(val1, val2, currentPath));
      } else if (val1 !== val2) {
        differences.push({
          path: currentPath,
          value1: val1,
          value2: val2
        });
      }
    }
    return differences;
  };

  // Special case for hex strings (like "0x0")
  if (typeof response1 === 'string' && 
      typeof response2 === 'string' && 
      response1.startsWith('0x') && 
      response2.startsWith('0x')) {
    const matches = response1.toLowerCase() === response2.toLowerCase();
    if (!matches) {
      logDebug(`Starting comparison for message ${messageId}:`, {
        response1Type: typeof response1,
        response2Type: typeof response2,
        response1Length: response1?.length,
        response2Length: response2?.length,
        response1Value: response1,
        response2Value: response2
      });
      logDebug(`Hex string mismatch for ${messageId}:`, {
        value1: response1,
        value2: response2
      });
    }
    return matches;
  }

  try {
    const shouldParseJson = (str) => {
      return typeof str === 'string' && 
             (str.startsWith('{') || str.startsWith('['));
    };

    // Handle numeric responses (including hex)
    const parseNumericResponse = (response) => {
      if (typeof response === 'string') {
        if (response.startsWith('0x')) {
          return BigInt(response).toString();
        }
        // Check if it's a numeric string
        const num = Number(response);
        if (!isNaN(num)) {
          return num.toString();
        }
      }
      return response;
    };

    // First try to parse as JSON if it looks like JSON
    const obj1 = shouldParseJson(response1) ? JSON.parse(response1) : parseNumericResponse(response1);
    const obj2 = shouldParseJson(response2) ? JSON.parse(response2) : parseNumericResponse(response2);
    
    if (typeof obj1 === 'object' && typeof obj2 === 'object') {
      // Only compare common fields between the two objects
      const differences = findDifferences(obj1, obj2);
      const matches = differences.length === 0;

      if (!matches) {
        logDebug(`Starting comparison for message ${messageId}:`, {
          response1Type: typeof response1,
          response2Type: typeof response2,
          response1Length: response1?.length,
          response2Length: response2?.length
        });

        logDebug(`Detailed differences for ${messageId}:`, differences);

        logDebug(`Full object mismatch for ${messageId}:`, {
          obj1,
          obj2
        });
      }
      return matches;
    }
    
    // For non-objects, do direct comparison
    const matches = obj1 === obj2;
    if (!matches) {
      logDebug(`Starting comparison for message ${messageId}:`, {
        response1Type: typeof response1,
        response2Type: typeof response2,
        response1Length: response1?.length,
        response2Length: response2?.length,
        response1Value: response1,
        response2Value: response2
      });
      logDebug(`Direct value mismatch for ${messageId}:`, {
        value1: obj1,
        value2: obj2
      });
    }
    return matches;
  } catch (error) {
    logDebug(`Starting comparison for message ${messageId}:`, {
      response1Type: typeof response1,
      response2Type: typeof response2,
      response1Length: response1?.length,
      response2Length: response2?.length,
      response1Value: response1,
      response2Value: response2
    });
    logDebug(`JSON parse error for ${messageId}:`, {
      error: error.message,
      response1,
      response2
    });
    return response1 === response2;
  }
};

const processMessageChecks = (pendingMessageChecks) => {
  console.log('🚛  🚛  🚛  🚛  🚛')
  console.log('processMessageChecks running...');
  console.log('Current pendingMessageChecks size:', pendingMessageChecks.size);
  
  const messageIds = Array.from(pendingMessageChecks.keys());
  console.log('All message IDs:', messageIds);
  
  // Filter for check messages (ending with '_' or '!')
  const checkMessageIds = messageIds.filter(id => id.endsWith('_') || id.endsWith('!'));
  console.log('Filtered check message IDs:', checkMessageIds);
  
  for (const checkMessageId of checkMessageIds) {
    // Get the corresponding main message ID by removing the '_' or '!'
    const mainMessageId = checkMessageId.slice(0, -1);
    console.log(`Processing check message: ${checkMessageId}, main message: ${mainMessageId}`);
    
    // Get all related messages
    const checkMessage = pendingMessageChecks.get(mainMessageId + '_');
    const mainMessage = pendingMessageChecks.get(mainMessageId);
    const checkMessageB = pendingMessageChecks.get(mainMessageId + '!');
    
    console.log('Found messages:', {
      checkMessage: checkMessage ? 'present' : 'missing',
      mainMessage: mainMessage ? 'present' : 'missing',
      checkMessageB: checkMessageB ? 'present' : 'missing'
    });

    // Skip if any message involves the fallback URL or if any nodes are duplicated
    if (checkMessage?.peerId === fallbackUrl || 
        mainMessage?.peerId === fallbackUrl || 
        checkMessageB?.peerId === fallbackUrl ||
        checkMessage?.peerId === checkMessageB?.peerId || // Check for duplicates
        mainMessage?.peerId === checkMessage?.peerId ||
        mainMessage?.peerId === checkMessageB?.peerId) {
      console.log('Skipping due to fallback URL or duplicate nodes');
      pendingMessageChecks.delete(checkMessageId);
      pendingMessageChecks.delete(mainMessageId);
      pendingMessageChecks.delete(mainMessageId + '!');
      continue;
    }
    
    // Only process if we have all three messages
    if (checkMessage && mainMessage && checkMessageB) {
      console.log('Processing complete set of messages');
      // Compare responses between all three clients
      const matches12 = compareResponses(checkMessage.responseHash, mainMessage.responseHash, mainMessageId);
      const matches23 = compareResponses(mainMessage.responseHash, checkMessageB.responseHash, mainMessageId);
      const matches13 = compareResponses(checkMessage.responseHash, checkMessageB.responseHash, mainMessageId);
      
      console.log('Comparison results:', { matches12, matches23, matches13 });
      
      // Consider it a match if at least two comparisons match
      const responsesMatch = (matches12 && matches23) || (matches12 && matches13) || (matches23 && matches13);
      
      // Log the comparison result
      const logMessage = `${mainMessageId}|${mainMessage.peerId}|${checkMessage.peerId}|${checkMessageB.peerId}|${responsesMatch}\n`;
      fs.appendFileSync('rpcMessageChecks.log', logMessage);
      
      console.log('Wrote to log file:', logMessage);
      
      // Clean up processed messages
      pendingMessageChecks.delete(checkMessageId);
      pendingMessageChecks.delete(mainMessageId);
      pendingMessageChecks.delete(mainMessageId + '!');
    } else {
      console.log('Incomplete set of messages, waiting for more responses');
    }
  }
};

module.exports = { processMessageChecks }; 
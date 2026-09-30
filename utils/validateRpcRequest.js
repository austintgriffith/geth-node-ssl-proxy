const { maxBatchLength } = require('../config');

// Why one JSON-RPC item is unacceptable, or null if it's fine.
// method must be a non-empty string: the cache key, the pool's routing table and the logs
// all use it as a name (independent audit HB4: ["eth_getLogs"] passed as a method).
// id must be a string, a number or null (JSON-RPC 2.0); a missing id is a notification,
// which this endpoint doesn't serve.
function itemProblem(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return 'request must be an object';
  const { jsonrpc, method, id } = request;
  const reason = [];
  if (!jsonrpc) reason.push('jsonrpc missing');
  else if (jsonrpc !== "2.0") reason.push('jsonrpc must be "2.0"');
  if (method === undefined || method === null) reason.push('method missing');
  else if (typeof method !== 'string' || method === '') reason.push('method must be a string');
  if (id === undefined) reason.push('id missing');
  else if (!(id === null || typeof id === 'string' || typeof id === 'number')) reason.push('id must be a string, number or null');
  return reason.length ? reason.join(", ") : null;
}

// The id to echo for an invalid item: its own id when that is a valid id, else null
function echoId(request) {
  const id = request && typeof request === 'object' ? request.id : undefined;
  return id === null || typeof id === 'string' || typeof id === 'number' ? id : null;
}

function invalidRequest(id, message) {
  return { jsonrpc: "2.0", id, error: { code: -32600, message } };
}

function validateRpcRequest(req, res, next) {
  // Handle batch requests (arrays)
  if (Array.isArray(req.body)) {
    // Whole-batch problems get one error object (JSON-RPC 2.0: an empty batch is one
    // invalid request)
    if (req.body.length === 0) {
      console.log("‼️ Invalid Request: empty batch array");
      return res.status(200).send(invalidRequest(null, "Invalid Request: Batch request cannot be empty"));
    }

    if (req.body.length > maxBatchLength) {
      console.log(`‼️ Invalid Request: batch of ${req.body.length} exceeds max ${maxBatchLength}`);
      return res.status(200).send(req.body.map(item => invalidRequest(echoId(item), `Batch too large (max ${maxBatchLength})`)));
    }

    // Invalid items are answered per item, at their position; the valid items are still
    // processed (JSON-RPC batch semantics: batch clients match answers by id and expect an
    // array back). proxy.js puts req.batchErrors in at those positions.
    const batchErrors = new Map();
    req.body.forEach((request, i) => {
      const problem = itemProblem(request);
      if (!problem) return;
      console.log(`‼️ Invalid Request in batch item ${i}: ${problem}`);
      console.log("Request object:", request);
      batchErrors.set(i, invalidRequest(echoId(request), `Invalid Request: ${problem}`));
    });

    req.batchErrors = batchErrors;
    req.isBatchRequest = true;
    next();
    return;
  }

  // Handle single requests
  const problem = itemProblem(req.body);
  if (problem) {
    console.log("‼️ Invalid Request: " + problem);
    console.log("Request object:", req.body);
    return res.status(200).send(invalidRequest(echoId(req.body), "Invalid Request: " + problem));
  }
  next();
}

module.exports = { validateRpcRequest, itemProblem };

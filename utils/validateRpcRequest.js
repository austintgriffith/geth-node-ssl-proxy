function validateRpcRequest(req, res, next) {
  // Handle batch requests (arrays)
  if (Array.isArray(req.body)) {
    if (req.body.length === 0) {
      console.log("‼️ Invalid Request: empty batch array");
      return res.status(200).send({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32600,
          message: "Invalid Request",
          data: "Batch request cannot be empty"
        }
      });
    }

    // Validate each request in the batch
    for (let i = 0; i < req.body.length; i++) {
      const request = req.body[i];
      const { jsonrpc, method, id } = request;
      if (!jsonrpc || jsonrpc !== "2.0" || !method || id === undefined) {
        let reason = [];
        if (!jsonrpc) reason.push('jsonrpc missing');
        else if (jsonrpc !== "2.0") reason.push('jsonrpc must be "2.0"');
        if (!method) reason.push('method missing');
        if (id === undefined) reason.push('id missing');
        console.log(`‼️ Invalid Request in batch item ${i}: ` + reason.join(", "));
        console.log("Request object:", request);

        return res.status(200).send({
          jsonrpc: "2.0",
          id: id || null,
          error: {
            code: -32600,
            message: "Invalid Request",
            data: `Batch item ${i}: ` + reason.join(", ")
          }
        });
      }
    }
    
    // Mark as batch request for the handler
    req.isBatchRequest = true;
    next();
    return;
  }

  // Handle single requests (existing logic)
  const { jsonrpc, method, id } = req.body;
  if (!jsonrpc || jsonrpc !== "2.0" || !method || id === undefined) {
    let reason = [];
    if (!jsonrpc) reason.push('jsonrpc missing');
    else if (jsonrpc !== "2.0") reason.push('jsonrpc must be "2.0"');
    if (!method) reason.push('method missing');
    if (id === undefined) reason.push('id missing');
    console.log("‼️ Invalid Request: " + reason.join(", "));
    console.log("Request object:", req.body);

    return res.status(200).send({
      jsonrpc: "2.0",
      id: id || null,
      error: {
        code: -32600,
        message: "Invalid Request",
        data: "The JSON sent is not a valid Request object"
      }
    });
  }
  next();
}

module.exports = { validateRpcRequest };
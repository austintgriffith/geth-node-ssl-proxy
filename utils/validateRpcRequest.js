function validateRpcRequest(req, res, next) {
  const { jsonrpc, method, id } = req.body;
  if (!jsonrpc || jsonrpc !== "2.0" || !method || id === undefined) {
    let reason = [];
    if (!jsonrpc) reason.push('jsonrpc missing');
    else if (jsonrpc !== "2.0") reason.push('jsonrpc must be "2.0"');
    if (!method) reason.push('method missing');
    if (id === undefined) reason.push('id missing');
    console.log("‼️ Invalid Request: " + reason.join(", "));

    return res.status(400).send({
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
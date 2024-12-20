function validateRpcRequest(req, res, next) {
  const { jsonrpc, method, id } = req.body;
  if (jsonrpc !== "2.0" || !method || id === undefined) {
    return res.status(400).send({
      jsonrpc: "2.0",
      id: null,
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
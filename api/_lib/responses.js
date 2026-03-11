const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0"
};

const sendJson = (res, statusCode, payload, extraHeaders = {}) => {
  Object.entries({ ...noStoreHeaders, ...extraHeaders }).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  res.status(statusCode).json(payload);
};

const sendError = (res, statusCode, message, details) =>
  sendJson(res, statusCode, {
    ok: false,
    error: {
      message,
      ...(details ? { details } : {})
    }
  });

const sendOk = (res, payload = {}, statusCode = 200, extraHeaders = {}) =>
  sendJson(res, statusCode, {
    ok: true,
    ...payload
  }, extraHeaders);

const methodNotAllowed = (req, res, allowedMethods) => {
  res.setHeader("Allow", allowedMethods.join(", "));
  return sendError(res, 405, `Method ${req.method} not allowed.`);
};

module.exports = {
  sendError,
  sendOk,
  methodNotAllowed
};

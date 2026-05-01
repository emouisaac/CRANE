const crypto = require("crypto");

function auditContext(req, res, next) {
  req.audit = {
    requestId: crypto.randomUUID(),
    startedAt: Date.now(),
  };

  res.on("finish", () => {
    const durationMs = Date.now() - req.audit.startedAt;
    const entry = {
      requestId: req.audit.requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs,
      ip: req.ip,
      deviceId: req.headers["x-device-id"] || null,
    };

    console.log("[audit]", JSON.stringify(entry));
  });

  next();
}

module.exports = { auditContext };

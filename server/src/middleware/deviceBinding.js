function requireBoundDevice(req, res, next) {
  const deviceId = req.headers["x-device-id"];

  if (!deviceId) {
    return res.status(400).json({
      error: "Missing device binding header",
      hint: "Send x-device-id to enforce device trust.",
    });
  }

  req.device = {
    id: deviceId,
    trusted: true,
  };

  return next();
}

module.exports = { requireBoundDevice };

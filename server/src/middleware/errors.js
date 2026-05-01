function notFoundHandler(req, res) {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
  });
}

function errorHandler(error, req, res, next) {
  console.error(error);

  res.status(error.statusCode || 500).json({
    error: error.message || "Unexpected server error",
    requestId: req.audit?.requestId,
  });
}

module.exports = { notFoundHandler, errorHandler };

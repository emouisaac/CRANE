const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const apiRoutes = require("./routes");
const { auditContext } = require("./middleware/auditContext");
const { notFoundHandler, errorHandler } = require("./middleware/errors");

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use(morgan("dev"));
  app.use(auditContext);

  app.get("/", (req, res) => {
    res.json({
      ok: true,
      message: "SwiftLend backend is running",
      apiRoot: "/api",
      health: "/health",
    });
  });

  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      service: "swiftlend-backend-starter",
      time: new Date().toISOString(),
    });
  });

  app.use("/api", apiRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

const apiRoutes = require("./routes");
const { auditContext } = require("./middleware/auditContext");
const { notFoundHandler, errorHandler } = require("./middleware/errors");

function createApp() {
  const app = express();
  const webRoot = path.join(__dirname, "../../");
  const htmlRoutes = [
    { route: "/", file: "index.html" },
    { route: "/admin", file: "admin.html" },
    { route: "/admin-login", file: "admin-login.html" },
    { route: "/master-admin-login", file: "master-admin-login.html" },
    { route: "/master-admin", file: "master-admin.html" },
    { route: "/privacy", file: "privacy.html" },
    { route: "/terms", file: "terms.html" },
  ];

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use(morgan("dev"));
  app.use(auditContext);

  htmlRoutes.forEach(({ route, file }) => {
    app.get(route, (req, res) => {
      res.sendFile(path.join(webRoot, file));
    });
  });

  htmlRoutes
    .filter(({ route }) => route !== "/")
    .forEach(({ route, file }) => {
      app.get(`/${file}`, (req, res) => {
        res.redirect(302, route);
      });
    });

  app.get("/index.html", (req, res) => {
    res.redirect(302, "/");
  });

  app.get("/admin-panel", (req, res) => {
    res.redirect(302, "/master-admin");
  });

  app.get("/admin-panel.html", (req, res) => {
    res.redirect(302, "/master-admin");
  });

  // Serve static files from the root directory
  app.use(express.static(webRoot));

  app.get("/api", (req, res) => {
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

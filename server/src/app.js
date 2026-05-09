const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

const apiRoutes = require("./routes");
const { config } = require("./config/env");
const { auditContext } = require("./middleware/auditContext");
const { notFoundHandler, errorHandler } = require("./middleware/errors");

const staticAssetExtensions = new Set([
  ".avif",
  ".css",
  ".gif",
  ".jpeg",
  ".jpg",
  ".js",
  ".png",
  ".svg",
  ".webp",
  ".woff",
  ".woff2",
]);

function setStaticAssetHeaders(res, filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (staticAssetExtensions.has(extension)) {
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    return;
  }

  if (extension === ".html") {
    res.setHeader("Cache-Control", "no-cache");
  }
}

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
  const redirects = [
    { from: "/index.html", to: "/" },
    { from: "/admin-panel", to: "/master-admin" },
    { from: "/admin-panel.html", to: "/master-admin" },
  ];

  app.disable("x-powered-by");
  app.set("etag", "strong");
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

  redirects.forEach(({ from, to }) => {
    app.get(from, (req, res) => {
      res.redirect(302, to);
    });
  });

  app.use(
    express.static(webRoot, {
      etag: true,
      lastModified: true,
      setHeaders: setStaticAssetHeaders,
    })
  );

  app.get("/api", (req, res) => {
    res.json({
      ok: true,
      message: `${config.serviceName} backend is running`,
      apiRoot: "/api",
      health: "/health",
    });
  });

  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      service: config.serviceSlug,
      time: new Date().toISOString(),
    });
  });

  app.use("/api", apiRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };

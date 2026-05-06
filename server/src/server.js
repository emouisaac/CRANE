const http = require("http");
const { exec } = require("child_process");

const { createApp } = require("./app");
const { getDatabase } = require("./config/database");
const { config } = require("./config/env");
const { bindVerificationSocket } = require("./websocket/verification.socket");

getDatabase();

console.log(`SQLite database path: ${config.dbPath}`);
if (!config.usingManagedDataDir) {
  console.warn(
    "No persistent data directory environment variable detected. " +
      "For redeploy-safe user retention, set DB_PATH or a mounted data directory such as DATA_DIR/RENDER_DISK_PATH."
  );
}

const app = createApp();
const server = http.createServer(app);

bindVerificationSocket(server);

function openBrowser(url) {
  const command =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;

  exec(command, (err) => {
    if (err) {
      console.warn(`Could not open browser automatically: ${err.message}`);
    }
  });
}

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.warn(`Port ${config.port} is already in use. Selecting an available fresh port...`);
    server.listen(0);
    return;
  }

  console.error("Server error:", err);
  process.exit(1);
});

server.listen(config.port, () => {
  const address = server.address();
  const host = address.address === "::" || address.address === "0.0.0.0" ? "localhost" : address.address;
  const url = `http://${host}:${address.port}`;

  console.log(`SwiftLend backend listening at ${url}`);
  openBrowser(url);
});

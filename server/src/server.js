const http = require("http");

const { createApp } = require("./app");
const { config } = require("./config/env");
const { bindVerificationSocket } = require("./websocket/verification.socket");

const app = createApp();
const server = http.createServer(app);

bindVerificationSocket(server);

server.listen(config.port, () => {
  console.log(`SwiftLend backend listening on port ${config.port}`);
});

const { WebSocketServer } = require("ws");

function bindVerificationSocket(server) {
  const wss = new WebSocketServer({ server, path: "/ws/verification" });

  wss.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      // Ignore, the HTTP server error handler will retry on a fresh port.
      return;
    }

    console.error("WebSocket server error:", err);
  });

  wss.on("connection", (socket) => {
    socket.send(
      JSON.stringify({
        event: "otp.subscribed",
        payload: { connected: true },
      })
    );

    socket.on("message", (message) => {
      let parsed;

      try {
        parsed = JSON.parse(message.toString());
      } catch {
        socket.send(
          JSON.stringify({
            event: "error",
            payload: { message: "Invalid JSON payload" },
          })
        );
        return;
      }

      if (parsed.event === "otp.subscribe") {
        socket.send(
          JSON.stringify({
            event: "otp.status",
            payload: { status: "sent", phone: parsed.payload?.phone || null },
          })
        );
      }

      if (parsed.event === "kyc.subscribe") {
        socket.send(
          JSON.stringify({
            event: "kyc.status",
            payload: { status: "ocr_complete", reviewMode: "automated" },
          })
        );
      }
    });
  });
}

module.exports = { bindVerificationSocket };

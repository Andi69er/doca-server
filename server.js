const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 10000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("✅ Neuer Client verbunden");
  ws.on("message", (msg) => {
    console.log("📩 Nachricht:", msg.toString());
  });
  ws.on("close", () => console.log("❌ Client getrennt"));
});

server.listen(PORT, () => {
  console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`);
});

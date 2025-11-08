// server.js
// Minimaler HTTP + WebSocket server, kompatibel mit Render
import http from "http";
import { WebSocketServer } from "ws";
import { roomManager } from "./roomManager.js";

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  // Leichter Health-Check / Info-Endpoint
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "DOCA WebDarts Server" }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("DOCA WebDarts WebSocket-Server läuft.");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  console.log("🔌 Neue Verbindung hergestellt.");
  // Delegiere an roomManager (handleConnection erwartet ws, req)
  try {
    roomManager.handleConnection(ws, req);
  } catch (err) {
    console.error("Fehler beim handleConnection:", err);
    try { ws.close(); } catch (e) {}
  }
});

server.listen(PORT, () => {
  console.log(`🚀 DOCA WebDarts-Server läuft auf Port ${PORT}`);
});

// Sauberer Fehler-Logger damit Render Logs sauber sind
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

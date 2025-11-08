// ===========================================
// DOCA WebDarts - Node.js WebSocket Server
// ===========================================
import http from "http";
import { WebSocketServer } from "ws";
import { roomManager } from "./roomManager.js";

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("DOCA WebDarts WebSocket-Server läuft.");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  console.log("🔌 Neue Verbindung hergestellt.");
  roomManager.handleConnection(ws, req);
});

server.listen(PORT, () => {
  console.log(`🚀 DOCA WebDarts-Server läuft auf Port ${PORT}`);
  console.log("Your service is live 🎉");
});

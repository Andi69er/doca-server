// server.js
import http from "http";
import { WebSocketServer } from "ws";
import { roomManager } from "./roomManager.js";
import { addUser, removeUser } from "./userManager.js";

const PORT = process.env.PORT || 10000;
const server = http.createServer();
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const clientId = Math.random().toString(36).substring(2, 8);
  addUser(clientId, ws);
  console.log(`🔌 Neue Verbindung: ${clientId}`);

  ws.send(JSON.stringify({
    type: "server_log",
    message: `Willkommen ${clientId}`
  }));

  ws.on("message", msg => {
    try {
      const data = JSON.parse(msg);
      roomManager.handleMessage(ws, data, clientId);
    } catch (e) {
      console.error("❌ Fehler beim Parsen:", e);
    }
  });

  ws.on("close", () => {
    removeUser(clientId);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`);
});

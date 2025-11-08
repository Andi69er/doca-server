// ===========================================
// DOCA WebDarts - Node.js WebSocket-Server (final)
// ===========================================

import WebSocket, { WebSocketServer } from "ws";
import http from "http";
import { roomManager } from "./roomManager.js";

const PORT = process.env.PORT || 8080;

// HTTP-Server (Basis für WebSocket)
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("DOCA WebDarts WebSocket-Server läuft.");
});

// WebSocket-Server
const wss = new WebSocketServer({ server });
const clients = new Map();

// ------------------------------
// Hilfsfunktionen
// ------------------------------
function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function broadcast(obj, exclude = null) {
  for (const [client] of clients.entries()) {
    if (client.readyState === WebSocket.OPEN && client !== exclude) {
      client.send(JSON.stringify(obj));
    }
  }
}

// ------------------------------
// Verbindungshandling
// ------------------------------
wss.on("connection", (ws, req) => {
  console.log("🔌 Neue Verbindung hergestellt.");

  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      console.error("❌ Ungültige Nachricht:", message);
      return;
    }

    switch (data.type) {
      case "login":
        clients.set(ws, { username: data.user || "Gast" });
        console.log(`✅ ${data.user || "Gast"} verbunden.`);
        send(ws, { type: "info", message: `Willkommen, ${data.user || "Gast"}!` });
        broadcast(
          { type: "info", message: `${data.user || "Gast"} ist jetzt online.` },
          ws
        );
        break;

      case "ping":
        send(ws, { type: "pong", message: "Hallo zurück vom Server 👋" });
        break;

      case "join_room":
      case "throw":
      case "score":
        roomManager.handleMessage(ws, data);
        break;

      default:
        console.log("⚠️ Unbekannter Nachrichtentyp:", data);
    }
  });

  ws.on("close", () => {
    const info = clients.get(ws);
    if (info) {
      console.log(`❌ ${info.username} getrennt.`);
      clients.delete(ws);
      broadcast({ type: "info", message: `${info.username} hat den Server verlassen.` });
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 DOCA WebDarts-Server läuft auf Port ${PORT}`);
});

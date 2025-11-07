// ===========================================
// DOCA WebDarts - Node.js WebSocket-Server
// ===========================================

import WebSocket, { WebSocketServer } from "ws";
import http from "http";
import url from "url";
import { roomManager } from "./roomManager.js"; // (folgt im nächsten Schritt)

const PORT = process.env.PORT || 8080;

// HTTP-Server (nur als Basis für WS)
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("DOCA WebDarts WebSocket-Server läuft.");
});

// WebSocket-Server aufsetzen
const wss = new WebSocketServer({ server });

// ===============================
// Aktive Clients
// ===============================
const clients = new Map(); // key: ws, value: {id, username, connectedAt}

// ===============================
// Helper
// ===============================
function broadcast(message, excludeWs = null) {
  for (const [client, info] of clients.entries()) {
    if (client.readyState === WebSocket.OPEN && client !== excludeWs) {
      client.send(JSON.stringify(message));
    }
  }
}

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

// ===============================
// Hauptlogik
// ===============================
wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`🔌 Neue Verbindung von ${ip}`);

  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      console.error("❌ Ungültiges JSON:", message);
      return;
    }

    switch (data.type) {
      // Benutzer loggt sich ein
      case "login":
        clients.set(ws, {
          id: data.id,
          username: data.user,
          connectedAt: new Date(),
        });
        console.log(`✅ ${data.user} (#${data.id}) verbunden.`);
        send(ws, { type: "info", message: `Willkommen ${data.user}!` });
        broadcast({
          type: "info",
          message: `${data.user} ist jetzt online.`,
        }, ws);
        break;

      // Testnachricht vom Client
      case "ping":
        send(ws, { type: "pong", message: "Hallo zurück vom Server 👋" });
        break;

      // Später: Spielaktionen
      case "throw":
      case "score":
      case "join_room":
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
      broadcast({
        type: "info",
        message: `${info.username} hat den Server verlassen.`,
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 DOCA WebDarts-Server läuft auf Port ${PORT}`);
});

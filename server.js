// ===========================================
// DOCA WebDarts - Node.js WebSocket-Server (Auth + Sync)
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

// WebSocket-Server aufsetzen
const wss = new WebSocketServer({ server });

// Aktive Clients
const clients = new Map();

// ------------------------------
// Hilfsfunktionen
// ------------------------------
function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function broadcast(obj, excludeWs = null) {
  for (const [client] of clients) {
    if (client.readyState === WebSocket.OPEN && client !== excludeWs) {
      client.send(JSON.stringify(obj));
    }
  }
}

// ------------------------------
// Verbindungshandling
// ------------------------------
wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`🔌 Verbindung von ${ip}`);

  ws.isAuthenticated = false;

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      console.error("❌ Ungültiges JSON:", msg);
      return;
    }

    // Authentifizierung
    if (data.type === "auth" || data.type === "login") {
      const user =
        data.user && typeof data.user === "string" ? data.user : "Gast";
      const userId = data.id || Math.floor(Math.random() * 9999);
      ws.isAuthenticated = true;

      // 🆕 Benutzerinfo speichern
      clients.set(ws, { id: userId, username: user, since: new Date() });

      // 🆕 Rückmeldung an Client + Sync an andere
      send(ws, {
        type: "auth_ok",
        user: { id: userId, name: user },
        online: Array.from(clients.values()),
      });
      broadcast(
        { type: "info", message: `${user} ist jetzt online.` },
        ws
      );

      console.log(`✅ Benutzer authentifiziert: ${user} (#${userId})`);
      return;
    }

    // Wenn keine Authentifizierung vorhanden ist
    if (!ws.isAuthenticated) {
      send(ws, {
        type: "auth_failed",
        message:
          "Du bist nicht eingeloggt! Bitte zuerst im Mitgliederbereich anmelden.",
      });
      return;
    }

    // Spiel-Nachrichten
    switch (data.type) {
      case "ping":
        send(ws, { type: "pong", message: "Hallo zurück vom Server 👋" });
        break;
      case "join_room":
      case "throw":
      case "score":
        roomManager.handleMessage(ws, data);
        break;
      default:
        console.log("⚠️ Unbekannter Typ:", data);
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

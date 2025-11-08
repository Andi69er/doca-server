// ===========================================
// DOCA WebDarts - Node.js WebSocket-Server (auth + room support)
// ===========================================

import WebSocket, { WebSocketServer } from "ws";
import http from "http";
import { roomManager } from "./roomManager.js";

const PORT = process.env.PORT || 10000;

// HTTP-Server (Render braucht das)
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("DOCA WebDarts WebSocket-Server läuft.");
});

const wss = new WebSocketServer({ server });
const clients = new Map();

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(obj, exclude = null) {
  for (const [client] of clients.entries()) {
    if (client.readyState === WebSocket.OPEN && client !== exclude)
      client.send(JSON.stringify(obj));
  }
}

// ------------------------------
// WebSocket Handling
// ------------------------------
wss.on("connection", (ws, req) => {
  console.log("🔌 Neue Verbindung hergestellt.");

  ws.isAuthenticated = false;

  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      console.error("❌ Ungültige Nachricht:", message);
      return;
    }

    // 🔐 Authentifizierung prüfen
    if (data.type === "auth") {
      const username = data.user || "Gast";
      const userId = data.id || Math.floor(Math.random() * 9999);
      const sid = data.sid || "no-session";

      ws.isAuthenticated = true;
      clients.set(ws, { username, userId, sid });

      console.log(`✅ Authentifiziert: ${username} (#${userId}) [${sid}]`);

      send(ws, {
        type: "auth_ok",
        user: { name: username, id: userId },
        message: "Willkommen " + username + "!",
      });

      broadcast(
        { type: "info", message: `${username} ist jetzt online.` },
        ws
      );
      return;
    }

    // Wenn nicht authentifiziert → Abweisen
    if (!ws.isAuthenticated) {
      send(ws, {
        type: "auth_failed",
        message: "Du bist nicht eingeloggt! Bitte zuerst im Mitgliederbereich anmelden.",
      });
      return;
    }

    // ------------------------------
    // Nachrichtenarten
    // ------------------------------
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

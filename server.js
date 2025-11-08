// ===========================================
// DOCA WebDarts - Node.js WebSocket-Server (v3 mit Online-Liste)
// ===========================================

import WebSocket, { WebSocketServer } from "ws";
import http from "http";
import { roomManager } from "./roomManager.js";

const PORT = process.env.PORT || 10000;

// HTTP-Server (Render benötigt diesen Basis-Endpunkt)
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("DOCA WebDarts WebSocket-Server läuft.");
});

// WebSocket-Server aufsetzen
const wss = new WebSocketServer({ server });

// Aktive Clients (Key = WebSocket, Value = { id, username, since })
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
  for (const [client] of clients.entries()) {
    if (client.readyState === WebSocket.OPEN && client !== excludeWs) {
      client.send(JSON.stringify(obj));
    }
  }
}

// Aktuelle Online-Liste an alle senden
function broadcastOnlineList() {
  const onlineUsers = Array.from(clients.values()).map((c) => ({
    id: c.id,
    username: c.username,
  }));

  const payload = JSON.stringify({
    type: "online_list",
    users: onlineUsers,
  });

  for (const [client] of clients.entries()) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }

  console.log("📡 Online-Liste aktualisiert:", onlineUsers.map((u) => u.username).join(", "));
}

// ------------------------------
// Haupt-Logik
// ------------------------------
wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`🔌 Neue Verbindung von ${ip}`);

  ws.isAuthenticated = false;

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      console.error("❌ Ungültiges JSON:", msg);
      return;
    }

    // 🔐 Authentifizierung
    if (data.type === "auth" || data.type === "login") {
      const user =
        data.user && typeof data.user === "string" ? data.user : "Gast";
      const userId = data.id || Math.floor(Math.random() * 9999);
      const sid = data.sid || "no-session";

      ws.isAuthenticated = true;
      ws.username = user;
      ws.userId = userId;

      clients.set(ws, { id: userId, username: user, since: new Date() });

      console.log(`✅ Benutzer authentifiziert: ${user} (#${userId}) [${sid}]`);

      send(ws, {
        type: "auth_ok",
        user: { id: userId, name: user },
        message: `Willkommen ${user}!`,
      });

      broadcast(
        { type: "info", message: `${user} ist jetzt online.` },
        ws
      );

      // 🟢 Online-Liste an alle senden
      broadcastOnlineList();
      return;
    }

    // Wenn nicht authentifiziert → abweisen
    if (!ws.isAuthenticated) {
      send(ws, {
        type: "auth_failed",
        message:
          "Du bist nicht eingeloggt! Bitte zuerst im Mitgliederbereich anmelden.",
      });
      return;
    }

    // ------------------------------
    // Nachrichten vom Client
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

  // ------------------------------
  // Verbindung geschlossen
  // ------------------------------
  ws.on("close", () => {
    const info = clients.get(ws);
    if (info) {
      console.log(`❌ ${info.username} getrennt.`);
      clients.delete(ws);
      broadcast({
        type: "info",
        message: `${info.username} hat den Server verlassen.`,
      });

      // 🔴 Online-Liste aktualisieren
      broadcastOnlineList();
    }
  });
});

// ------------------------------
// Serverstart
// ------------------------------
server.listen(PORT, () => {
  console.log(`🚀 DOCA WebDarts-Server läuft auf Port ${PORT}`);
});

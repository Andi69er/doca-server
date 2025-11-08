// server.js
// ===========================================
// DOCA WebDarts - Node.js WebSocket-Server
// ===========================================

import WebSocket, { WebSocketServer } from "ws";
import http from "http";
import { roomManager } from "./roomManager.js";

const PORT = process.env.PORT || 10000;

// HTTP-Server (Basis für WebSocket)
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("DOCA WebDarts WebSocket-Server läuft.");
});

// WebSocket-Server
const wss = new WebSocketServer({ server });
const clients = new Map(); // Map<ws, { id, username, since }>

// send und broadcast Funktionen (roomManager benutzt diese)
function send(ws, obj) {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  } catch (e) {
    console.error("Send-Fehler:", e);
  }
}

function broadcast(obj, excludeWs = null) {
  const payload = JSON.stringify(obj);
  for (const [client] of clients.entries()) {
    try {
      if (client.readyState === WebSocket.OPEN && client !== excludeWs) {
        client.send(payload);
      }
    } catch (e) {
      // ignoriere einzelne Fehler
    }
  }
}

// Init roomManager mit send/broadcast/clients
roomManager.init({ send, broadcast, clients });

// Helper: online-Liste erzeugen (nur usernames)
function getOnlineList() {
  const arr = [];
  for (const [, info] of clients.entries()) {
    arr.push({ id: info.id, username: info.username });
  }
  return arr;
}

// Wenn ein Client connected
wss.on("connection", (ws, req) => {
  console.log("🔌 Neue Verbindung hergestellt.");

  // temporäre id falls keine auth kommt
  ws._tempId = Math.floor(Math.random() * 999999);

  ws.isAuthenticated = false;

  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (err) {
      console.error("❌ Ungültiges JSON:", message);
      send(ws, { type: "error", message: "Ungültiges JSON" });
      return;
    }

    // Auth oder Login
    if (data.type === "auth" || data.type === "login") {
      // Erwartet: { type: "auth", user: "Andi", id: 123, sid: "..." }
      const user = typeof data.user === "string" ? data.user : "Gast";
      const userId = data.id || data.userId || ws._tempId;

      ws.isAuthenticated = true;
      ws.userId = userId;
      ws.username = user;

      clients.set(ws, { id: userId, username: user, since: new Date() });

      console.log(`✅ Authentifizierung: ${user} (#${userId})`);

      // Bestätige Auth dem Client
      send(ws, { type: "auth_ok", user: { id: userId, name: user } });

      // Sende Online-Liste + Räume an alle
      broadcast({ type: "online_list", users: getOnlineList() });
      roomManager.broadcastRoomsList();

      // Informiere alle über den neuen Online-User
      broadcast({ type: "info", message: `${user} ist jetzt online.` }, ws);

      return;
    }

    // Wenn nicht auth, wir akzeptieren trotzdem einige öffentliche Aktionen
    if (!ws.isAuthenticated) {
      // Wenn kein Login -> geben wir auth_failed zurück (Client sollte handle)
      send(ws, {
        type: "auth_failed",
        message: "Du bist nicht eingeloggt! Bitte zuerst im Mitgliederbereich anmelden.",
      });
      return;
    }

    // Authentifizierte Clients -> Nachrichten routen
    switch (data.type) {
      case "ping":
        send(ws, { type: "pong", message: "Hallo zurück vom Server 👋" });
        break;

      case "join_room":
      case "create_room":
      case "leave_room":
      case "list_rooms":
      case "start_game":
        // roomManager kümmert sich um diese Typen
        roomManager.handleMessage(ws, data);
        break;

      // weitere Fälle (score, throw, chat, ...) leiten wir ans roomManager weiter
      case "throw":
      case "score":
      case "chat":
        roomManager.handleMessage(ws, data);
        break;

      default:
        console.log("⚠️ Unbekannter Nachrichtentyp:", data);
        break;
    }
  });

  ws.on("close", () => {
    const info = clients.get(ws);
    if (info) {
      console.log(`❌ ${info.username} getrennt.`);
      clients.delete(ws);
      // Raum aufräumen
      roomManager.leaveAll(ws);
      // Update an alle senden
      broadcast({ type: "online_list", users: getOnlineList() });
      roomManager.broadcastRoomsList();
      broadcast({ type: "info", message: `${info.username} hat den Server verlassen.` });
    } else {
      // war ein anonymer Gast
      console.log("🔌 Verbindung eines Gastes getrennt.");
      // Stelle sicher, dass er aus Räumen entfernt wurde
      roomManager.leaveAll(ws);
    }
  });

  ws.on("error", (err) => {
    console.warn("WS-Error:", err && err.message ? err.message : err);
  });

  // Option: sende aktuelle Räume & Online (wenn später auth kommt, nochmal gesendet)
  // send initial minimal info:
  send(ws, { type: "welcome", message: "Verbunden mit DOCA WebDarts Server" });
});

// Start
server.listen(PORT, () => {
  console.log(`🚀 DOCA WebDarts-Server läuft auf Port ${PORT}`);
});

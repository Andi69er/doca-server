// ===========================================
// DOCA WebDarts - Node.js WebSocket-Server (v3 AUTH-FIX + stabil)
// ===========================================

import WebSocket, { WebSocketServer } from "ws";
import http from "http";
import { roomManager } from "./roomManager.js";

const PORT = process.env.PORT || 8080;

// ----------------------------------------------------
// HTTP-Server (nur für Statusanzeige / Basis für WS)
// ----------------------------------------------------
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("🎯 DOCA WebDarts WebSocket-Server läuft stabil auf Render ✅");
});

// ----------------------------------------------------
// WebSocket-Server
// ----------------------------------------------------
const wss = new WebSocketServer({ server });
const clients = new Map(); // key: ws, value: { id, username, since }

// ----------------------------------------------------
// Helper-Funktionen
// ----------------------------------------------------
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

// ----------------------------------------------------
// Hauptlogik für alle Verbindungen
// ----------------------------------------------------
wss.on("connection", (ws) => {
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

    // ----------------------------------------------------
    // Authentifizierung (aus PHP-Session oder Login)
    // ----------------------------------------------------
    if (data.type === "auth" || data.type === "login") {
      const user = data.user || "Gast";
      const userId = data.id || Math.floor(Math.random() * 9999);
      ws.isAuthenticated = true;

      clients.set(ws, { id: userId, username: user, since: new Date() });

      console.log(`✅ Benutzer authentifiziert: ${user} (#${userId})`);
      send(ws, { type: "auth_ok", message: `Willkommen ${user}!` });

      broadcast(
        { type: "info", message: `${user} ist jetzt online.` },
        ws
      );
      return;
    }

    // ----------------------------------------------------
    // Kein Login → Zugriff verweigert
    // ----------------------------------------------------
    if (!ws.isAuthenticated) {
      send(ws, {
        type: "auth_failed",
        message: "❌ Du bist nicht eingeloggt! Bitte zuerst im Mitgliederbereich anmelden.",
      });
      return;
    }

    // ----------------------------------------------------
    // Spiel- / Kontrollnachrichten
    // ----------------------------------------------------
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

  // ----------------------------------------------------
  // Verbindung schließen
  // ----------------------------------------------------
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

// ----------------------------------------------------
// Serverstart
// ----------------------------------------------------
server.listen(PORT, () => {
  console.log(`🚀 DOCA WebDarts-Server läuft auf Port ${PORT}`);
});

// server.js
import http from "http";
import { WebSocketServer } from "ws";
import { roomManager } from "./roomManager.js";
import { addUser, removeUser, getOnlineList, sendToClient, broadcast } from "./userManager.js";

const PORT = process.env.PORT || 10000;
const server = http.createServer();
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const clientId = Math.random().toString(36).substring(2, 8);
  addUser(clientId, ws);
  console.log(`✅ Benutzer verbunden: ${clientId}`);

  // Begrüßungsnachricht
  sendToClient(clientId, {
    type: "server_log",
    message: `Willkommen ${clientId}`
  });

  // Nachricht vom Client empfangen
  ws.on("message", msg => {
    try {
      const data = JSON.parse(msg);

      switch (data.type) {

        // --- LOGIN / AUTH ---
        case "auth":
          if (data.user) {
            ws.username = data.user;
            console.log(`👤 Authentifiziert: ${data.user} (${clientId})`);
          }
          // Sende sofort aktualisierte Online-Liste an alle
          broadcast({
            type: "list_online",
            users: getOnlineList()
          });
          break;

        // --- ONLINE LIST ANFORDERUNG ---
        case "list_online":
          sendToClient(clientId, {
            type: "list_online",
            users: getOnlineList()
          });
          break;

        // --- ROOM EVENTS ---
        case "create_room":
        case "list_rooms":
          roomManager.handleMessage(ws, data, clientId);
          break;

        // --- UNBEKANNTE NACHRICHTEN ---
        default:
          // stilles Ignorieren, kein Spam mehr im Log
          break;
      }

    } catch (e) {
      console.error("❌ Fehler beim Parsen:", e);
    }
  });

  // Verbindung geschlossen
  ws.on("close", () => {
    removeUser(clientId);
    console.log(`❌ Benutzer getrennt: ${clientId}`);

    // Aktualisierte Online-Liste an alle senden
    broadcast({
      type: "list_online",
      users: getOnlineList()
    });
  });
});

server.listen(PORT, () => {
  console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`);
});

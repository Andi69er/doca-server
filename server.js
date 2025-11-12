// server.js (FINAL & COMPLETE mit Heartbeat-Mechanismus)
import express from "express";
import http from "http";
import cors from "cors";
import { WebSocketServer } from "ws";
import * as userManager from "./userManager.js";
import * as roomManager from "./roomManager.js";

const PORT = process.env.PORT || 10000;
const app = express();
app.use(cors());
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

console.log("🚀 FINAL VERSION mit HEARTBEAT: Initialisierung des DOCA WebDarts Servers...");

wss.on("connection", (ws) => {
    const clientId = userManager.addUser(ws);
    console.log(`✅ Neuer Client verbunden: ${clientId}`);

    // =========== NEUER HEARTBEAT-TEIL (1/2) ===========
    // Wir markieren diese neue Verbindung als "lebendig".
    ws.isAlive = true;
    // Wenn der Client auf unseren Ping mit einem "Pong" antwortet,
    // setzen wir den Status wieder auf "lebendig".
    ws.on('pong', () => {
        ws.isAlive = true;
    });
    // =====================================================

    ws.on("message", (message) => {
        let data;
        try { data = JSON.parse(message); } catch (e) { return; }
        
        // Die Konsole nicht mit pings überfluten
        if (data.type !== 'ping') {
          console.log(`[${clientId}] ->`, data);
        }

        switch (data.type) {
            case "auth": userManager.authenticate(clientId, data.payload.username); break;
            case "chat_global":
            case "chat":
                const username = userManager.getUserName(clientId) || "Gast";
                userManager.broadcast({ type: "chat_global", user: username, message: data.message || data.payload?.message });
                break;
            case "list_rooms": roomManager.broadcastRoomList(); break;
            case "list_online": userManager.broadcastOnlineList(); break;
            case "create_room": roomManager.createRoom(clientId, data.payload.name, data.payload.options); break;
            case "join_room": roomManager.joinRoom(clientId, data.payload.roomId); break;
            case "leave_room": roomManager.leaveRoom(clientId); break;
            case "start_game": roomManager.startGame(clientId); break;
            case "player_throw":
            case "undo_throw": roomManager.handleGameAction(clientId, data); break;
            case "webrtc_signal": // WICHTIG: WebRTC Signale weiterleiten
                const targetUsername = data.payload.target;
                const targetClientId = userManager.getClientIdByUsername(targetUsername);
                if (targetClientId) {
                    userManager.sendToClient(targetClientId, {
                        type: 'webrtc_signal',
                        payload: { ...data.payload, target: null } // Ziel entfernen, da es direkt gesendet wird
                    });
                }
                break;
            case "ping": userManager.sendToClient(clientId, { type: "pong" }); break;
            default: console.warn(`⚠️ Unbekannter Nachrichtentyp: ${data.type}`);
        }
    });

    ws.on("close", () => {
        console.log(`❌ Client hat die Verbindung getrennt: ${clientId}`);
        roomManager.leaveRoom(clientId);
        userManager.removeUser(clientId);
    });
});


// =========== NEUER HEARTBEAT-TEIL (2/2) ===========
// Alle 30 Sekunden wird diese Funktion ausgeführt.
const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    // Wenn der Client auf den letzten Ping nicht geantwortet hat,
    // ist die Verbindung wahrscheinlich tot. Wir beenden sie.
    if (ws.isAlive === false) {
      console.log("❌ Heartbeat: Terminiere tote Verbindung.");
      return ws.terminate();
    }

    // Wir nehmen an, die Verbindung ist tot, bis wir eine Antwort (pong) erhalten.
    ws.isAlive = false;
    ws.ping(() => {}); // Sende den Ping. Der Browser antwortet automatisch.
  });
}, 30000); // 30000 Millisekunden = 30 Sekunden

// Sicherstellen, dass der Intervall gestoppt wird, wenn der Server herunterfährt.
wss.on('close', function close() {
  clearInterval(interval);
});
// =====================================================


server.listen(PORT, () => console.log(`🚀 FINAL VERSION mit HEARTBEAT: DOCA WebDarts Server läuft auf Port ${PORT}`));
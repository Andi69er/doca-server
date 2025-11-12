// server.js (FINAL & COMPLETE - CORRECTED VERSION)
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

console.log("🚀 FINAL VERSION: Initialisierung des DOCA WebDarts Servers...");

wss.on("connection", (ws) => {
    const clientId = userManager.addUser(ws);
    console.log(`✅ Neuer Client verbunden (temp ID): ${clientId}`);

    ws.on("message", (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            // Ignoriere ungültige JSON-Nachrichten
            return;
        }
        
        // Verbessertes Logging: Zeigt den Benutzernamen an, sobald er bekannt ist.
        const usernameForLog = userManager.getUserName(clientId) || clientId;
        console.log(`[${usernameForLog}] ->`, data);

        switch (data.type) {
            case "auth":
                if (data.payload?.username) {
                    userManager.authenticate(clientId, data.payload.username);
                }
                break;

            case "chat_global":
            case "chat": // Unterstützt beide Typen für Abwärtskompatibilität
                const username = userManager.getUserName(clientId) || "Gast";
                userManager.broadcast({ type: "chat_global", user: username, message: data.message || data.payload?.message });
                break;

            case "list_rooms":
                roomManager.broadcastRoomList();
                break;

            case "list_online":
                userManager.broadcastOnlineList();
                break;

            case "create_room":
                if (data.payload?.name) {
                    roomManager.createRoom(clientId, data.payload.name, data.payload.options || {});
                }
                break;

            case "join_room":
                if (data.payload?.roomId) {
                    roomManager.joinRoom(clientId, data.payload.roomId);
                }
                break;

            case "leave_room":
                roomManager.leaveRoom(clientId);
                break;

            case "start_game":
                roomManager.startGame(clientId);
                break;

            case "player_throw":
            case "undo_throw":
                roomManager.handleGameAction(clientId, data);
                break;

            // *** WICHTIGE ERGÄNZUNG FÜR VIDEO-SPLIT-SCREEN ***
            // Dieser Block leitet die WebRTC-Signale (für den Videoanruf)
            // zwischen den beiden Spielern im Raum weiter.
            case "webrtc_signal": {
                const targetUsername = data.payload?.target;
                if (targetUsername && data.payload) {
                    // Sende das Signal nur an den Ziel-Benutzer
                    userManager.broadcastToPlayers(
                        [targetUsername], 
                        {
                            type: "webrtc_signal",
                            payload: data.payload 
                        }
                    );
                }
                break;
            }

            case "ping":
                userManager.sendToClient(clientId, { type: "pong" });
                break;

            default:
                console.warn(`⚠️ Unbekannter Nachrichtentyp: ${data.type}`);
        }
    });

    ws.on("close", () => {
        const usernameForLog = userManager.getUserName(clientId) || clientId;
        console.log(`❌ Client hat die Verbindung getrennt: ${usernameForLog}`);
        
        // Diese Funktionen verwenden jetzt die korrekte Logik, um den
        // Benutzer anhand seiner letzten bekannten clientId zu finden und zu entfernen.
        roomManager.leaveRoom(clientId);
        userManager.removeUser(clientId);
    });
});

server.listen(PORT, () => console.log(`🚀 FINAL VERSION: DOCA WebDarts Server läuft auf Port ${PORT}`));
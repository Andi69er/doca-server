// server.js (FINAL & COMPLETE - mit WebRTC-Fix)
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

// Heartbeat-Mechanismus zum Bereinigen toter Verbindungen
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        // @ts-ignore
        if (ws.isAlive === false) {
            // @ts-ignore
            const clientId = ws.clientId;
            console.log(`💔 Heartbeat: Beende tote Verbindung für Client ${clientId || 'unbekannt'}`);
            return ws.terminate();
        }
        // @ts-ignore
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on("connection", (ws) => {
    // @ts-ignore
    ws.isAlive = true;
    // @ts-ignore
    ws.on('pong', () => { ws.isAlive = true; });

    const clientId = userManager.addUser(ws);
    // @ts-ignore
    ws.clientId = clientId;
    
    console.log(`✅ Neuer Client verbunden: ${clientId}`);

    ws.on("message", (message) => {
        let data;
        try { data = JSON.parse(message); } catch (e) { return; }
        console.log(`[${clientId}] ->`, data);

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
            
            // =======================================================
            // KORREKTUR: Fehlender Fall für WebRTC-Signalisierung
            // Dieser Block leitet die Video-Handshake-Nachrichten weiter.
            // =======================================================
            case "webrtc_signal": {
                const targetId = data.payload?.target;
                if (targetId) {
                    // Leite die Nachricht 1-zu-1 an den Ziel-Client weiter
                    userManager.sendToClient(targetId, data);
                } else {
                    console.warn(`[${clientId}] sendete webrtc_signal ohne targetId.`);
                }
                break;
            }

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

wss.on('close', () => {
    clearInterval(interval);
});

server.listen(PORT, () => console.log(`🚀 FINAL VERSION: DOCA WebDarts Server läuft auf Port ${PORT}`));
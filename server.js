// server.js (REVISED & ROBUST)
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

console.log("🚀 REVISED VERSION: Initialisierung des DOCA WebDarts Servers...");

wss.on("connection", (ws) => {
    const clientId = userManager.registerConnection(ws);
    console.log(`✅ Neue Verbindung, temporäre ID: ${clientId}`);

    ws.on("message", (message) => {
        let data;
        try { data = JSON.parse(message); } catch (e) { return; }
        
        const usernameForLog = userManager.getUserName(clientId) || clientId;
        console.log(`[${usernameForLog}] ->`, data);

        switch (data.type) {
            case "auth":
                const success = userManager.authenticate(clientId, data.payload.username);
                // Nach erfolgreicher Authentifizierung den Client über seinen Raum informieren, falls er in einem war
                if (success) {
                    const roomId = roomManager.userRooms.get(data.payload.username);
                    if (roomId) {
                        console.log(`   -> Benutzer ${data.payload.username} wird in Raum ${roomId} wiederhergestellt.`);
                        roomManager.broadcastRoomState(roomId);
                    }
                }
                break;
            case "chat_global":
            case "chat":
                const username = userManager.getUserName(clientId) || "Gast";
                userManager.broadcast({ type: "chat_global", user: username, message: data.message || data.payload?.message });
                break;
            case "list_rooms": roomManager.broadcastRoomList(); break;
            case "list_online": userManager.broadcastOnlineList(); break;
            case "create_room": roomManager.createRoom(clientId, data.payload.name, data.payload.options); break;
            case "join_room": roomManager.joinRoom(clientId, data.payload.roomId); break;
            case "leave_room":
                const userToLeave = userManager.getUserName(clientId);
                if (userToLeave) roomManager.leaveRoom(userToLeave);
                break;
            case "start_game": roomManager.startGame(clientId); break;
            case "player_throw":
            case "undo_throw": roomManager.handleGameAction(clientId, data); break;
            case "ping": userManager.sendToClient(clientId, { type: "pong" }); break;
            default: console.warn(`⚠️ Unbekannter Nachrichtentyp: ${data.type}`);
        }
    });

    ws.on("close", () => {
        console.log(`❌ Verbindung getrennt: ${clientId}`);
        const username = userManager.startUserRemoval(clientId);
        // Wenn der Benutzer in einem Raum war, informieren wir die anderen Spieler
        if (username) {
            const roomId = roomManager.userRooms.get(username);
            if (roomId) {
                // Sende einen benutzerdefinierten Event, den das Frontend anzeigen kann
                //userManager.broadcastToUsers(rooms.get(roomId).players, { type: 'player_disconnected', username });
            }
        }
    });
});

server.listen(PORT, () => console.log(`🚀 REVISED VERSION: DOCA WebDarts Server läuft auf Port ${PORT}`));
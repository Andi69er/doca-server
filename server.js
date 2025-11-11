// server.js (FINAL & VERIFIED)
import express from "express";
import http from "http";
import cors from "cors";
import { WebSocketServer } from "ws";
import * as userManager from "./userManager.js";
import * as roomManager from "./roomManager.js";
import { broadcastOnlineList } from "./userManager.js";
import { broadcastRoomList } from "./roomManager.js";

const PORT = process.env.PORT || 10000;
const app = express();
app.use(cors());
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

console.log("🚀 Initialisierung des DOCA WebDarts Servers...");

wss.on("connection", (ws) => {
    const clientId = userManager.addUser(ws);
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
            case "list_rooms": broadcastRoomList(); break;
            case "list_online": broadcastOnlineList(); break;
            case "create_room": roomManager.createRoom(clientId, data.payload.name, data.payload.options); break;
            case "join_room": roomManager.joinRoom(clientId, data.payload.roomId); break;
            case "leave_room": roomManager.leaveRoom(clientId); break;
            case "start_game": roomManager.startGame(clientId); break;
            case "player_throw":
            case "undo_throw": roomManager.handleGameAction(clientId, data); break;
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

server.listen(PORT, () => console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`));
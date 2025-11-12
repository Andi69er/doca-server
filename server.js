// server.js (FINAL & CORRECTED)
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

console.log("🚀 DOCA WebDarts Server wird initialisiert...");

wss.on("connection", (ws) => {
    const clientId = userManager.addUser(ws);
    console.log(`✅ Client verbunden: ${clientId}`);

    ws.on("message", (message) => {
        let data;
        try { data = JSON.parse(message); } catch (e) { return; }
        
        const username = userManager.getUserName(clientId);
        console.log(`[${username || clientId}] ->`, data);

        switch (data.type) {
            case "auth":
                userManager.authenticate(clientId, data.payload.username);
                break;
            case "chat_global":
                roomManager.handleGlobalChat(clientId, data.message);
                break;
            case "list_rooms":
                roomManager.broadcastRoomList();
                break;
            case "list_online":
                userManager.broadcastOnlineList();
                break;
            case "create_room":
                roomManager.createRoom(clientId, data.payload.name, data.payload.options);
                break;
            case "join_room":
                roomManager.joinRoom(clientId, data.payload.roomId);
                break;
            case "leave_room":
                roomManager.leaveRoom(clientId);
                break;
            case "start_game":
                roomManager.startGame(clientId);
                break;
            case "webrtc_camera_started":
                roomManager.handleCameraStarted(clientId);
                break;
            case "webrtc_signal":
                 roomManager.handleWebRTCSignal(clientId, data.payload);
                 break;
            case "player_throw":
            case "undo_throw":
                roomManager.handleGameAction(clientId, data);
                break;
            case "ping":
                userManager.sendToClient(clientId, { type: "pong" });
                break;
            default:
                console.warn(`⚠️ Unbekannter Nachrichtentyp: ${data.type}`);
        }
    });

    ws.on("close", () => {
        const username = userManager.getUserName(clientId);
        console.log(`❌ Verbindung von ${username || clientId} getrennt.`);
        roomManager.leaveRoom(clientId); // Wichtig: Zuerst aus dem Raum entfernen
        userManager.removeUser(clientId); // Dann den User entfernen
    });
});

server.listen(PORT, () => console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`));
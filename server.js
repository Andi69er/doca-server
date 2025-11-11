// server.js (FINAL)

import express from "express";
import http from "http";
import cors from "cors";
import { WebSocketServer } from "ws";

// Import der Verwaltungsmodule
import * as userManager from "./userManager.js";
import * as roomManager from "./roomManager.js";

// Import der spezifischen Broadcast-Funktionen
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
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error("Ungültiges JSON empfangen:", message);
            return;
        }

        console.log(`[${clientId}] ->`, data);

        switch (data.type) {
            // Benutzer- & Lobby-Verwaltung
            case "auth":
                userManager.authenticate(clientId, data.payload.username);
                break;
            case "chat_global":
            case "chat":
                const username = userManager.getUserName(clientId) || "Gast";
                userManager.broadcast({ type: "chat_global", user: username, message: data.message || data.payload?.message });
                break;
            case "list_rooms":
                broadcastRoomList();
                break;
            case "list_online":
                broadcastOnlineList();
                break;

            // Raum-Verwaltung
            case "create_room":
                roomManager.createRoom(clientId, data.payload.name, data.payload.options);
                break;
            case "join_room":
                roomManager.joinRoom(clientId, data.payload.roomId);
                break;
            case "leave_room":
                roomManager.leaveRoom(clientId);
                break;

            // Spiel-Aktionen
            case "start_game":
                roomManager.startGame(clientId);
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
        console.log(`❌ Client hat die Verbindung getrennt: ${clientId}`);
        // Wichtig: Zuerst den Raum verlassen (um den Namen noch zu haben), dann den Benutzer entfernen.
        roomManager.leaveRoom(clientId);
        userManager.removeUser(clientId);
    });

    ws.on("error", (error) => {
        console.error(`WebSocket-Fehler für Client ${clientId}:`, error);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`);
});
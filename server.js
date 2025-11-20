// server.js – FINALE VERSION: Robuste Initialisierung und Chat-Fix
import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { addUser, removeUser, authenticate, sendToClient, broadcast, broadcastOnlineList } from "./userManager.js";
import { createRoom, joinRoom, leaveRoom, startGame, handleGameAction, broadcastRoomList } from "./roomManager.js";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

console.log("DOCA Server startet – Finale Version");

app.get("/", (req, res) => {
  res.status(200).send("DOCA HTTP Server ist online.");
});

wss.on("connection", (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`✅ Client verbunden von IP: ${clientIp}`);
    
    const clientId = addUser(ws);
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });

    ws.on("message", async (data) => {
        let msg;
        try {
            msg = JSON.parse(data);
        } catch (err) {
            console.error(`Fehler beim Parsen von JSON von Client ${clientId}:`, err);
            return;
        }

        const payload = msg.payload || {};

        switch (msg.type) {
            case "auth": 
                authenticate(clientId, payload.username); 
                break;
            case "list_rooms": 
                broadcastRoomList(); 
                break;
            case "list_online": 
                broadcastOnlineList(); 
                break;
            case "create_room": 
                createRoom(clientId, payload.username, payload.name || "Neuer Raum", payload.options || {}); 
                break;
            case "join_room": 
                joinRoom(clientId, payload.username, payload.roomId); 
                break;
            case "leave_room": 
                leaveRoom(clientId); 
                break;
            case "start_game": 
                startGame(clientId); 
                break;
            case "player_throw":
            case "undo_throw": 
                handleGameAction(clientId, msg); 
                break;
            case "chat_global":
                // KORREKTUR: Sicherstellen, dass die Chat-Nachricht korrekt verarbeitet wird
                if (payload.message) {
                    broadcast({ type: "chat_global", user: payload.username || "Gast", message: payload.message });
                }
                break;
            case "ping": 
                ws.send(JSON.stringify({ type: "pong" })); 
                break;
            case "webrtc_signal": 
                const target = msg.targetClientId || payload.targetClientId || payload.target; 
                if (target) { sendToClient(target, { type: "webrtc_signal", payload: payload, sender: clientId }); } 
                break;
            default: 
                console.log(`Unbekannte Nachricht von ${clientId}:`, msg.type);
        }
    });

    ws.on("close", () => {
        console.log(`Client ${clientId} hat die Verbindung getrennt.`);
        leaveRoom(clientId);
        removeUser(ws);
    });

    ws.on("error", (err) => {
        console.error(`WebSocket Fehler bei Client ${clientId}:`, err);
    });
});

setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
            console.log("Inaktiver Client wird getrennt.");
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 DOCA Server ist bereit und hört auf Port ${PORT}`);
});
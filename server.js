// server.js (FINALE, STABILE VERSION 13.0 - mit Fehlerbehandlung)
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

console.log("🚀 DOCA Server v13.0 wird initialisiert...");

// Bei einer neuen Verbindung wird jetzt auch das 'request'-Objekt übergeben
wss.on("connection", (ws, req) => {
    const clientId = userManager.addUser(ws, req); // req wird für die IP-Adresse benötigt

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on("message", (message) => {
        let data;
        try { data = JSON.parse(message); } catch (e) { return; }
        
        // Logge alle eingehenden Nachrichten außer Ping
        if (data.type !== 'ping') {
            const username = userManager.getUserName(clientId) || 'unbekannt';
            console.log(`[${username} | ${clientId.slice(0,5)}] ->`, data.type, data.payload || '');
        }
        
        switch (data.type) {
            case "auth":
                userManager.authenticate(clientId, data.payload.username);
                break;
            case "create_room":
                roomManager.createRoom(clientId, data.payload.username, data.payload.name, data.payload.options);
                break;
            case "join_room":
                roomManager.joinRoom(clientId, data.payload.username, data.payload.roomId);
                break;
            case "chat_global":
                const chatUsername = userManager.getUserName(clientId);
                userManager.broadcast({ type: "chat_global", user: chatUsername || "Gast", payload: data.payload });
                break;
            case "list_rooms": roomManager.broadcastRoomList(); break;
            case "list_online": userManager.broadcastOnlineList(); break;
            case "leave_room": roomManager.leaveRoom(clientId); break;
            case "start_game": roomManager.startGame(clientId, data.payload); break;
            case "player_throw":
            case "undo_throw": roomManager.handleGameAction(clientId, data); break;
            case "webrtc_signal":
                const targetClientId = data.payload.target;
                if (targetClientId) {
                    userManager.sendToClient(targetClientId, {
                        type: 'webrtc_signal',
                        payload: { ...data.payload, sender: clientId, target: null } 
                    });
                }
                break;
            case "ping": userManager.sendToClient(clientId, { type: "pong" }); break;
        }
    });

    ws.on("close", () => {
        const closedClientId = userManager.getClientId(ws);
        if(closedClientId) {
            roomManager.leaveRoom(closedClientId);
            userManager.removeUser(ws);
        }
    });
});

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
        const clientId = userManager.getClientId(ws);
        console.log(`💔 Inaktiver Client ${clientId} wird getrennt.`);
        return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

wss.on('close', () => { clearInterval(interval); });

server.listen(PORT, () => console.log(`🚀 Server v13.0 läuft auf Port ${PORT}`));
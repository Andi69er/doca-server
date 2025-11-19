// server.js (FINALE, STABILE VERSION 9.0)
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

console.log("🚀 FINALE STABILE VERSION 9.0: Server wird initialisiert...");

wss.on("connection", (ws) => {
    const clientId = userManager.addUser(ws);
    console.log(`✅ Client verbunden: ${clientId}`);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on("message", (message) => {
        let data;
        try { data = JSON.parse(message); } catch (e) { return; }
        
        if (data.type !== 'ping') console.log(`[${clientId}] ->`, data);
        
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
            // Andere Fälle bleiben unverändert
            case "chat_global":
                const chatUsername = userManager.getUserName(clientId);
                userManager.broadcast({ type: "chat_global", user: chatUsername || "Gast", payload: data.payload });
                break;
            case "list_rooms": roomManager.broadcastRoomList(); break;
            case "leave_room": roomManager.leaveRoom(clientId); break;
            case "start_game": roomManager.startGame(clientId); break;
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
            console.log(`❌ Client hat die Verbindung getrennt: ${closedClientId}`);
            roomManager.leaveRoom(closedClientId);
            userManager.removeUser(ws);
        }
    });
});

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

wss.on('close', () => { clearInterval(interval); });

server.listen(PORT, () => console.log(`🚀 FINALE STABILE VERSION 9.0: Server läuft auf Port ${PORT}`));
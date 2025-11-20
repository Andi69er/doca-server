// server.js (VOLLSTÄNDIG)
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

wss.on("connection", (ws, req) => {
    const clientId = userManager.addUser(ws, req);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on("message", (message) => {
        let data;
        try { data = JSON.parse(message); } catch (e) { return; }
        
        switch (data.type) {
            case "auth": userManager.authenticate(clientId, data.payload.username); break;
            case "create_room": roomManager.createRoom(clientId, data.payload.username, data.payload.name, data.payload.options); break;
            case "join_room": roomManager.joinRoom(clientId, data.payload.username, data.payload.roomId); break;
            case "chat_global":
                const username = userManager.getUserName(clientId);
                userManager.broadcast({ type: "chat_global", user: username || "Gast", payload: data.payload });
                break;
            case "list_rooms": roomManager.broadcastRoomList(); break;
            case "start_game": roomManager.startGame(clientId); break; // Payload wird hier nicht benötigt
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
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);
wss.on('close', () => { clearInterval(interval); });

server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
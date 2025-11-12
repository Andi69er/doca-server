// server.js (FINALE, ROBUSTE VERSION mit Heartbeat)
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

console.log("🚀 FINALE ROBUSTE VERSION: Initialisierung des DOCA WebDarts Servers...");

wss.on("connection", (ws) => {
    const clientId = userManager.addUser(ws);
    console.log(`✅ Neuer Client verbunden: ${clientId}`);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on("message", (message) => {
        let data;
        try { data = JSON.parse(message); } catch (e) { return; }
        
        if (data.type !== 'ping') console.log(`[${clientId}] ->`, data);

        const username = userManager.getUserName(clientId);

        switch (data.type) {
            case "auth":
                const authUsername = data.payload.username;
                if (userManager.authenticate(clientId, authUsername)) {
                    // ZENTRALE KORREKTUR: Sage dem RoomManager, dass sich dieser User neu verbunden hat
                    roomManager.updateUserConnection(authUsername, clientId);
                }
                break;
            case "chat_global":
                userManager.broadcast({ type: "chat_global", user: username || "Gast", message: data.payload?.message });
                break;
            case "list_rooms": roomManager.broadcastRoomList(); break;
            case "create_room": roomManager.createRoom(clientId, data.payload.name, data.payload.options); break;
            case "join_room": roomManager.joinRoom(clientId, data.payload.roomId); break;
            case "leave_room": roomManager.leaveRoom(clientId); break;
            case "start_game": roomManager.startGame(clientId); break;
            case "player_throw":
            case "undo_throw": roomManager.handleGameAction(clientId, data); break;
            
            case "webrtc_signal":
                const targetClientId = data.payload.target;
                if (targetClientId) {
                    userManager.sendToClient(targetClientId, {
                        type: 'webrtc_signal',
                        payload: { ...data.payload, target: null, sender: clientId } 
                    });
                }
                break;

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

const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

wss.on('close', function close() {
  clearInterval(interval);
});

server.listen(PORT, () => console.log(`🚀 FINALE ROBUSTE VERSION: Server läuft auf Port ${PORT}`));
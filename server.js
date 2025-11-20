// server.js – KORRIGIERT: Switch-Anweisung ist jetzt vollständig und stabil.
import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { addUser, removeUser, authenticate, sendToClient, broadcastOnlineList } from "./userManager.js";
import { createRoom, joinRoom, leaveRoom, startGame, handleGameAction, broadcastRoomList } from "./roomManager.js";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/" });

console.log("DOCA Server startet – Stabile Version (Build 2)");

app.get("/", (req, res) => res.send("DOCA Server läuft."));

wss.on("connection", (ws) => {
    const clientId = addUser(ws);
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });

    ws.on("message", async (data) => {
        let msg;
        try {
            msg = JSON.parse(data);
        } catch (err) {
            console.error("Fehler beim Parsen von JSON:", err);
            return;
        }

        const payload = msg.payload || {};
        const username = payload.username || payload.name || "Gast";

        // Die switch-Anweisung wurde korrigiert und vervollständigt.
        switch (msg.type) {
            case "auth":
                authenticate(clientId, username);
                break;
            case "list_rooms":
                broadcastRoomList();
                break;
            case "list_online":
                broadcastOnlineList();
                break;
            case "create_room":
                createRoom(clientId, username, payload.name || "Neuer Raum", payload.options || {});
                break;
            case "join_room":
                joinRoom(clientId, username, payload.roomId);
                break;
            case "leave_room":
                leaveRoom(clientId);
                break;
            case "start_game":
                startGame(clientId); // Diese Funktion enthält jetzt die korrekte Logik
                break;
            case "player_throw":
            case "undo_throw":
                handleGameAction(clientId, msg);
                break;
            case "chat_global":
                broadcast({ type: "chat_global", user: username, message: payload.message });
                break;
            case "ping":
                ws.send(JSON.stringify({ type: "pong" }));
                break;
            case "webrtc_signal":
                const target = msg.targetClientId || payload.targetClientId || payload.target;
                if (target) {
                    sendToClient(target, { type: "webrtc_signal", payload: payload, sender: clientId });
                }
                break;
            default:
                console.log("Unbekannte Nachricht empfangen:", msg.type);
        }
    });

    ws.on("close", () => {
        leaveRoom(clientId);
        removeUser(ws);
    });

    ws.on("error", (err) => {
        console.error(`WebSocket Fehler bei Client ${clientId}:`, err);
        leaveRoom(clientId);
        removeUser(ws);
    });
});

setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 10000);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`DOCA Server läuft stabil auf Port ${PORT}`);
});
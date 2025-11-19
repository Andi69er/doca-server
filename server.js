// server.js – ULTRA-STABIL + ALLE FEHLENDEN FEATURES WIEDER DRIN
import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { addUser, removeUser, authenticate, sendToClient, broadcastToPlayers, broadcast, broadcastOnlineList } from "./userManager.js";
import { createRoom, joinRoom, leaveRoom, startGame, handleGameAction, broadcastRoomList } from "./roomManager.js";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/" });

console.log("DOCA Server startet – Ultra-stabile Version 2025");

// Statische Dateien
app.get("/", (req, res) => res.send("DOCA Server läuft – stabil wie nie!"));

// === WEBSOCKET ===
wss.on("connection", (ws) => {
    const clientId = addUser(ws);

    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });

    ws.on("message", async (data) => {
        let msg;
        try { msg = JSON.parse(data); } catch { return; }

        // DEINE ALTEN TYPES WIEDER DRIN
        if (msg.type === "auth") authenticate(clientId, msg.payload?.username || msg.payload?.name || "Gast");
        if (msg.type === "list_rooms") broadcastRoomList();
        if (msg.type === "list_online") broadcastOnlineList();

        switch (msg.type) {
            case "create_room":
                createRoom(clientId, msg.payload?.username || "Gast", msg.payload?.name, msg.payload?.options || {});
                break;
            case "join_room":
                joinRoom(clientId, msg.payload?.username || "Gast", msg.payload?.roomId);
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
                broadcast({ type: "chat_global", user: msg.payload?.username || "Gast", message: msg.payload?.message });
                break;
            case "ping":
                ws.send(JSON.stringify({ type: "pong" }));
                break;
            case "webrtc_signal":
                const target = msg.targetClientId || msg.payload?.targetClientId;
                if (target) sendToClient(target, { type: "webrtc_signal", payload: msg.payload, sender: clientId });
                break;
        }
    });

    ws.on("close", () => {
        leaveRoom(clientId);
        removeUser(ws);
        broadcastRoomList();
        broadcastOnlineList();
    });
});

// Heartbeat
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 10000);

// Beim Start alles senden – deine Lobby braucht das!
broadcastRoomList();
broadcastOnlineList();

process.on('SIGTERM', () => {
    console.log("Shutdown");
    wss.close();
    server.close(() => process.exit(0));
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`DOCA Server läuft stabil auf Port ${PORT}`);
});
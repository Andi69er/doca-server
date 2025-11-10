// server.js (FINAL v4.0)
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import * as userManager from "./userManager.js";
import * as roomManager from "./roomManager.js";

const PORT = process.env.PORT || 10000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function safeParse(raw) {
    try { return JSON.parse(raw); } catch { return null; }
}

wss.on("connection", (ws) => {
    const clientId = userManager.addUser(ws);
    ws.on("message", (raw) => {
        const data = safeParse(raw);
        if (!data || !data.type) return;

        const type = (data.type || "").toLowerCase();
        const payload = data.payload || data;
        const uid = userManager.getClientId(ws);

        switch (type) {
            case "auth":
                userManager.setUserName(uid, payload.user);
                break;
            case "list_rooms":
                roomManager.updateRoomList();
                break;
            case "create_room":
                console.log(`Empfange create_room mit Optionen:`, payload.options); // WICHTIGER LOG
                roomManager.createRoom(uid, payload.name, payload.options || {});
                break;
        }
    });
    ws.on("close", () => userManager.removeUser(ws));
});

server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
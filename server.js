// server.js (RESTORED & FINAL v5.0)
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import * as userManager from "./userManager.js";
import * as roomManager from "./roomManager.js";
import { GameLogic } from "./gameLogic.js";

const PORT = process.env.PORT || 10000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, clientTracking: true });
const games = new Map();

function safeParse(raw) { try { return JSON.parse(raw); } catch { return null; } }
function heartbeat() { this.isAlive = true; }
function noop() {}

wss.on("connection", (ws) => {
    const clientId = userManager.addUser(ws, "Gast");
    ws.clientId = clientId;
    ws.isAlive = true;
    ws.on("pong", heartbeat);

    console.log("✅ Client connected:", clientId);
    userManager.sendToClient?.(clientId, { type: "connected", clientId, name: userManager.getUserName(clientId) });
    broadcastOnline();
    roomManager.updateRoomList?.();

    ws.on("message", (raw) => {
        const data = safeParse(raw);
        if (!data || !data.type) return;
        const type = (data.type || "").toLowerCase();
        const payload = data.payload || data;
        const uid = userManager.getClientId(ws) || ws.clientId;

        switch (type) {
            case "auth":
                const name = payload.user || payload.username || payload.name;
                if (name) userManager.setUserName(uid, name);
                userManager.sendToClient?.(uid, { type: "connected", clientId: uid, name: userManager.getUserName(uid) });
                broadcastOnline();
                roomManager.updateRoomList?.();
                break;
            case "list_rooms": roomManager.updateRoomList?.(); break;
            case "list_online": broadcastOnline(); break;
            case "create_room":
                console.log(`Room creation request from ${uid} with options:`, payload.options); // Diagnostic log
                const rname = payload.name || `Raum-${Math.random().toString(36).slice(2,5)}`;
                const rid = roomManager.createRoom(uid, rname, payload.options || {});
                userManager.sendToClient?.(uid, { type: "room_created", roomId: rid, name: rname });
                roomManager.updateRoomList?.();
                break;
            case "join_room":
                const rid_join = payload.roomId || payload.id || payload.room;
                if (!rid_join) { userManager.sendToClient?.(uid, { type: "error", message: "missing roomId" }); break; }
                const ok_join = roomManager.joinRoom(uid, rid_join);
                userManager.sendToClient?.(uid, { type: "joined_room", roomId: rid_join, ok: !!ok_join });
                const state_join = roomManager.getRoomState?.(rid_join);
                if (state_join) userManager.broadcast?.({ type: "game_state", ...state_join });
                roomManager.updateRoomList?.();
                break;
            case "leave_room": roomManager.leaveRoom(uid); roomManager.updateRoomList?.(); break;
            case "start_game":
                const room_start = roomManager.getRoomByClientId?.(uid);
                if (!room_start) break;
                const g_start = new GameLogic(room_start);
                g_start.start();
                games.set(room_start.id, g_start);
                const state_start = g_start.getState?.();
                if (state_start) {
                    const players = state_start.players || [];
                    roomManager.broadcastToPlayers?.(players, { type: "game_state", ...state_start, playerNames: players.map(p => userManager.getUserName(p)) });
                }
                break;
            case "chat_global":
                const text = payload.message || payload.msg || payload.text || "";
                const out = { type: "chat_global", user: userManager.getUserName(uid) || "Gast", message: text };
                userManager.broadcast?.(out);
                break;
            case "ping": userManager.sendToClient?.(uid, { type: "pong" }); break;
            default: userManager.sendToClient?.(uid, { type: "error", message: `unknown type ${type}` }); break;
        }
    });

    ws.on("close", () => {
        roomManager.leaveRoom?.(ws.clientId);
        userManager.removeUser?.(ws);
        broadcastOnline();
        roomManager.updateRoomList?.();
        console.log("❌ Client disconnected:", ws.clientId);
    });
    ws.on("error", (err) => { console.warn("WS error for", ws.clientId, err?.message || err); });
});

const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping(noop);
    });
}, 30000);

function broadcastOnline() {
    try {
        const names = userManager.getOnlineUserNames();
        const msg = { type: "online_list", users: names };
        userManager.broadcast?.(msg);
    } catch (e) {}
}

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
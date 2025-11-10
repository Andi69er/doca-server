// server.js — DOCA WebDarts PRO (stabile, minimal verständliche server entry)
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

import * as userManager from "./userManager.js";
import * as roomManager from "./roomManager.js";
import { GameLogic } from "./gameLogic.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => res.send("✅ DOCA WebDarts Server is running"));

function safeParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

function broadcastOnline() {
  const names = (typeof userManager.getOnlineUserNames === "function")
    ? userManager.getOnlineUserNames()
    : (typeof userManager.listOnlineUsers === "function"
        ? userManager.listOnlineUsers().map(u => u.username)
        : []);
  const msg = { type: "online_list", users: names };
  if (typeof userManager.broadcast === "function") userManager.broadcast(msg);
  else {
    wss.clients.forEach(c => { if (c.readyState === 1) c.send(JSON.stringify(msg)); });
  }
}

const games = new Map(); // roomId -> GameLogic

wss.on("connection", (ws) => {
  ws.clientId = userManager.addUser(ws, "Gast");
  console.log("✅ Neuer Client verbunden:", ws.clientId);

  userManager.sendToClient?.(ws.clientId, {
    type: "connected",
    clientId: ws.clientId,
    name: userManager.getUserName(ws.clientId)
  });
  broadcastOnline();
  roomManager.updateRoomList?.();

  ws.on("message", (raw) => {
    const data = safeParse(raw);
    if (!data || !data.type) return;
    const type = (data.type || "").toLowerCase();
    const payload = data.payload || data; // support both shapes
    const clientId = ws.clientId || userManager.getClientId(ws);

    switch (type) {
      case "auth": {
        const name = payload.user || payload.username || payload.name;
        if (name) userManager.setUserName(clientId, name);
        userManager.sendToClient?.(clientId, {
          type: "connected",
          clientId,
          name: userManager.getUserName(clientId)
        });
        broadcastOnline();
        roomManager.updateRoomList?.();
        break;
      }

      case "list_rooms":
        roomManager.updateRoomList?.();
        break;

      case "list_online":
        broadcastOnline();
        break;

      case "create_room": {
        const rname = payload.name || `Raum-${Math.random().toString(36).slice(2,5)}`;
        const rid = roomManager.createRoom(clientId, rname, payload.options || {});
        // reply to creator with room id
        userManager.sendToClient?.(clientId, { type: "room_created", roomId: rid });
        roomManager.updateRoomList?.();
        break;
      }

      case "join_room": {
        const rid = payload.roomId || payload.id || payload.room;
        if (!rid) {
          userManager.sendToClient?.(clientId, { type: "error", message: "missing roomId" });
          break;
        }
        const ok = roomManager.joinRoom(clientId, rid);
        userManager.sendToClient?.(clientId, { type: "joined_room", roomId: rid, ok });
        // send current room state to participants
        const state = roomManager.getRoomState?.(rid);
        if (state) {
          if (typeof roomManager.broadcastToPlayers === "function") {
            roomManager.broadcastToPlayers(state.players, { type: "game_state", ...state });
          } else if (typeof userManager.broadcast === "function") {
            userManager.broadcast({ type: "game_state", ...state });
          }
        }
        roomManager.updateRoomList?.();
        break;
      }

      case "leave_room": {
        roomManager.leaveRoom(clientId);
        roomManager.updateRoomList?.();
        break;
      }

      case "start_game": {
        const room = roomManager.getRoomByClientId?.(clientId);
        if (!room) break;
        const g = new GameLogic(room);
        g.start();
        games.set(room.id, g);
        const state = g.getState();
        if (state) {
          const players = state.players || [];
          if (typeof roomManager.broadcastToPlayers === "function") {
            roomManager.broadcastToPlayers(players, { type: "game_state", ...state, playerNames: players.map(p => userManager.getUserName(p)) });
          } else {
            userManager.broadcast({ type: "game_state", ...state, playerNames: players.map(p => userManager.getUserName(p)) });
          }
        }
        break;
      }

      case "player_throw": {
        const points = Number(payload.value ?? payload.points ?? 0) || 0;
        const room = roomManager.getRoomByClientId?.(clientId);
        if (!room) break;
        const g = games.get(room.id);
        if (!g) break;
        const ok = g.playerThrow?.(clientId, points);
        const state = g.getState?.();
        if (state) {
          const players = state.players || [];
          (roomManager.broadcastToPlayers ?? userManager.broadcast)({ type: "game_state", ...state, playerNames: players.map(p => userManager.getUserName(p)) });
        }
        userManager.sendToClient?.(clientId, { type: "action_result", action: "player_throw", ok: !!ok });
        break;
      }

      case "undo_throw": {
        const room = roomManager.getRoomByClientId?.(clientId);
        if (!room) break;
        const g = games.get(room.id);
        if (!g) break;
        const ok = g.undoLastThrow?.(clientId);
        const state = g.getState?.();
        if (state) {
          const players = state.players || [];
          (roomManager.broadcastToPlayers ?? userManager.broadcast)({ type: "game_state", ...state, playerNames: players.map(p => userManager.getUserName(p)) });
        }
        userManager.sendToClient?.(clientId, { type: "action_result", action: "undo_throw", ok: !!ok });
        break;
      }

      case "chat_global": {
        const text = payload.message || payload.msg || payload.text || "";
        const out = {
          type: "chat_global",
          user: userManager.getUserName(clientId) || "Gast",
          message: text
        };
        if (typeof userManager.broadcast === "function") userManager.broadcast(out);
        else wss.clients.forEach(c => { if (c.readyState === 1) c.send(JSON.stringify(out)); });
        break;
      }

      case "ping": {
        userManager.sendToClient?.(clientId, { type: "pong", message: "pong" });
        break;
      }

      default:
        // ignore unknown types but reply optionally
        userManager.sendToClient?.(clientId, { type: "error", message: `unknown type ${type}` });
        break;
    }
  });

  ws.on("close", () => {
    try {
      // remove from room if present
      roomManager.leaveRoom?.(ws.clientId);
      userManager.removeUser?.(ws);
    } catch (e) {}
    broadcastOnline();
    roomManager.updateRoomList?.();
    console.log("Client disconnected:", ws.clientId);
  });

  ws.on("error", (err) => {
    console.warn("WS error for", ws.clientId, err?.message || err);
  });
});

server.listen(PORT, () => console.log(`DOCA WebDarts Server listening on ${PORT}`));

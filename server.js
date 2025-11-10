// server.js — DOCA WebDarts PRO (Render-ready, fixed clientId scope)
// Vollständige Version für Deploy auf Render.

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

// health-check for Render
app.get("/", (req, res) => res.send("✅ DOCA WebDarts Server is running"));

function safeParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

function broadcastOnline() {
  const names = userManager.getOnlineUserNames
    ? userManager.getOnlineUserNames()
    : (userManager.listOnlineUsers
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
  // 🔹 clientId global im Handler deklarieren, damit close() ihn kennt
  let clientId = null;

  // register immediately with a temporary Gast id
  clientId = userManager.addUser(ws, "Gast");
  console.log("✅ Neuer Client verbunden:", clientId);

  // send connected ack
  userManager.sendToClient?.(clientId, {
    type: "connected",
    clientId,
    name: userManager.getUserName(clientId)
  });
  broadcastOnline();
  roomManager.updateRoomList?.();

  ws.on("message", (raw) => {
    const data = safeParse(raw);
    if (!data || !data.type) return;
    const type = (data.type || "").toLowerCase();
    const payload = data;

    // resolve client id
    clientId = userManager.getClientId(ws) || clientId;

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
        roomManager.updateRoomList?.();
        break;
      }

      case "join_room": {
        const rid = payload.roomId;
        roomManager.joinRoom(clientId, rid);
        const state = roomManager.getRoomState?.(rid);
        if (state) {
          if (typeof roomManager.broadcastToPlayers === "function") {
            roomManager.broadcastToPlayers(state.players, state);
          } else if (typeof userManager.broadcast === "function") {
            userManager.broadcast(state);
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
        if (state && typeof roomManager.broadcastToPlayers === "function") {
          roomManager.broadcastToPlayers(state.players, {
            type: "game_state",
            ...state,
            playerNames: state.players.map(p => userManager.getUserName(p))
          });
        }
        break;
      }

      case "player_throw": {
        const points = Number(payload.value ?? payload.points ?? 0) || 0;
        const room = roomManager.getRoomByClientId?.(clientId);
        if (!room) break;
        const g = games.get(room.id);
        if (!g) break;
        g.playerThrow?.(clientId, points) || g.playerThrow(clientId, points);
        const state = g.getState();
        if (state) roomManager.broadcastToPlayers?.(state.players, {
          type: "game_state",
          ...state,
          playerNames: state.players.map(p => userManager.getUserName(p))
        });
        break;
      }

      case "undo_throw": {
        const room = roomManager.getRoomByClientId?.(clientId);
        if (!room) break;
        const g = games.get(room.id);
        if (!g) break;
        g.undoLastThrow?.(clientId);
        const state = g.getState?.();
        if (state) roomManager.broadcastToPlayers?.(state.players, {
          type: "game_state",
          ...state,
          playerNames: state.players.map(p => userManager.getUserName(p))
        });
        break;
      }

      case "chat_global": {
        const text = payload.message || payload.msg || "";
        const out = {
          type: "chat_global",
          user: userManager.getUserName(clientId) || "Gast",
          message: text
        };
        if (typeof userManager.broadcast === "function") userManager.broadcast(out);
        else wss.clients.forEach(c => {
          if (c.readyState === 1) c.send(JSON.stringify(out));
        });
        break;
      }

      default:
        if (!["list_rooms", "list_online", "ping"].includes(type))
          console.warn("⚠️ Unbekannter Nachrichtentyp:", type);
        break;
    }
  });

  ws.on("close", () => {
    try { roomManager.leaveRoom(clientId); } catch {}
    try { userManager.removeUser(ws); } catch {}
    broadcastOnline();
    roomManager.updateRoomList?.();
    console.log("❌ Client getrennt:", clientId);
  });
});

server.listen(PORT, () =>
  console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`)
);

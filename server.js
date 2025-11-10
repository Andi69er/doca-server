// server.js — DOCA WebDarts PRO (komplett, copy & paste)
// Passt zu den gelieferten Modulen: userManager.js, roomManager.js, gameLogic.js

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

// simple root so Render / health checks succeed
app.get("/", (req, res) => res.send("✅ DOCA WebDarts Server is running"));

/**
 * Helper: safe JSON parse
 */
function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Send to a single clientId (if connected via userManager)
 */
function sendToClientId(clientId, obj) {
  try {
    if (typeof userManager.broadcastToPlayers === "function") {
      // userManager doesn't expose direct sendToClient in provided file, but
      // broadcastToPlayers expects playerIds. We'll use broadcastToPlayers for single.
      userManager.broadcastToPlayers([clientId], obj);
      return;
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Broadcast online list to all connected clients.
 * userManager.listOnlineUsers() returns array of {id, username}
 */
function broadcastOnlineList() {
  let online = [];
  try {
    if (typeof userManager.listOnlineUsers === "function") {
      online = userManager.listOnlineUsers().map(u => u.username ?? u.name ?? String(u.id));
    }
  } catch (e) {
    online = [];
  }
  const msg = { type: "online_list", users: online };
  try {
    if (typeof userManager.broadcast === "function") {
      userManager.broadcast(msg);
      return;
    }
  } catch (e) {
    // fallback: send to all ws clients directly
    wss.clients.forEach((c) => {
      try {
        if (c.readyState === 1) c.send(JSON.stringify(msg));
      } catch {}
    });
  }
}

// map roomId -> GameLogic instance (keeps game instance per room)
const games = new Map();

wss.on("connection", (ws) => {
  console.log("✅ Neuer Client verbunden.");

  ws.on("message", (raw) => {
    const data = safeParse(raw);
    if (!data || !data.type) return;
    const type = (data.type || "").toString().toLowerCase();
    const payload = data.payload || data; // support both shapes

    // get clientId if userManager supports it
    const clientId = typeof userManager.getClientId === "function" ? userManager.getClientId(ws) : null;

    switch (type) {
      // ---------------- AUTH / PRESENCE ----------------
      case "auth":
      case "login": {
        const username = payload.user || payload.username || "Gast";
        if (typeof userManager.addUser === "function") {
          const id = userManager.addUser(ws, username);
          // if addUser returned an id but clientId differ, keep id (some UMs return id)
          // broadcast connected ack
          sendToClientId(id, { type: "connected", clientId: id, name: username });
        } else {
          // fallback: try to call addUser with (ws, username) even if not function (no-op)
        }
        broadcastOnlineList();
        // also send rooms
        if (typeof roomManager.updateRoomList === "function") roomManager.updateRoomList();
        break;
      }

      case "list_rooms": {
        if (typeof roomManager.updateRoomList === "function") roomManager.updateRoomList();
        break;
      }

      case "list_online": {
        broadcastOnlineList();
        break;
      }

      // ---------------- ROOM ACTIONS ----------------
      case "create_room": {
        const name = payload.name || `Raum-${Math.random().toString(36).slice(2,6)}`;
        const client = clientId || ws;
        if (typeof roomManager.createRoom === "function") {
          try {
            const rid = roomManager.createRoom(client, name, payload.options || {});
            // reply to creator
            if (rid && ws.readyState === 1) ws.send(JSON.stringify({ type: "room_created", roomId: rid }));
          } catch (e) { console.error("create_room error", e); }
        }
        break;
      }

      case "join_room": {
        const rid = payload.roomId;
        const client = clientId || ws;
        if (!rid) break;
        if (typeof roomManager.joinRoom === "function") {
          roomManager.joinRoom(client, rid);
          // after join, broadcast full room state to players in that room
          const state = typeof roomManager.getRoomState === "function" ? roomManager.getRoomState(rid) : null;
          if (state) {
            // if roomManager.broadcastToPlayers exists, use it
            if (typeof roomManager.broadcastToPlayers === "function") {
              roomManager.broadcastToPlayers(state.players, state);
            } else if (typeof userManager.broadcast === "function") {
              userManager.broadcast(state);
            } else {
              // fallback: send to all ws
              wss.clients.forEach((c) => {
                if (c.readyState === 1) c.send(JSON.stringify(state));
              });
            }
          }
          if (typeof roomManager.updateRoomList === "function") roomManager.updateRoomList();
        }
        break;
      }

      case "leave_room": {
        const client = clientId || ws;
        if (typeof roomManager.leaveRoom === "function") roomManager.leaveRoom(client);
        if (typeof roomManager.updateRoomList === "function") roomManager.updateRoomList();
        break;
      }

      // ---------------- CHAT ----------------
      case "chat_global":
      case "chat_message": {
        const client = clientId || ws;
        const msgText = payload.message || payload.msg || payload;
        const username = (typeof userManager.getUserName === "function" ? userManager.getUserName(client) : null) || "Gast";
        const out = { type: "chat_global", user: username, message: msgText };
        if (typeof userManager.broadcast === "function") {
          userManager.broadcast(out);
        } else {
          wss.clients.forEach((c) => { if (c.readyState === 1) c.send(JSON.stringify(out)); });
        }
        break;
      }

      // ---------------- GAME CONTROL ----------------
      case "start_game": {
        const client = clientId || ws;
        const room = typeof roomManager.getRoomByClientId === "function" ? roomManager.getRoomByClientId(client) : null;
        if (!room) break;
        // create GameLogic instance for this room
        try {
          const g = new GameLogic(room);
          g.startGame?.();
          games.set(room.id, g);
          const state = typeof roomManager.getRoomState === "function" ? roomManager.getRoomState(room.id) : null;
          if (state && typeof roomManager.broadcastToPlayers === "function") {
            roomManager.broadcastToPlayers(state.players, state);
          }
        } catch (e) {
          console.error("start_game error", e);
        }
        break;
      }

      case "player_throw":
      case "throw": {
        const client = clientId || ws;
        const room = typeof roomManager.getRoomByClientId === "function" ? roomManager.getRoomByClientId(client) : null;
        if (!room) break;
        const g = games.get(room.id);
        if (!g) break;
        const value = Number(payload.value || payload.points || 0) || 0;
        // prefer GameLogic.throwDart or .playerThrow
        if (typeof g.throwDart === "function") g.throwDart(client, value);
        else if (typeof g.playerThrow === "function") g.playerThrow(client, value);
        // broadcast updated game state
        const state = g.getState ? g.getState() : (typeof roomManager.getRoomState === "function" ? roomManager.getRoomState(room.id) : null);
        if (state) {
          if (typeof roomManager.broadcastToPlayers === "function") roomManager.broadcastToPlayers(state.players, state);
        }
        break;
      }

      case "undo_throw": {
        const client = clientId || ws;
        const room = typeof roomManager.getRoomByClientId === "function" ? roomManager.getRoomByClientId(client) : null;
        if (!room) break;
        const g = games.get(room.id);
        if (!g) break;
        if (typeof g.undoLastThrow === "function") g.undoLastThrow(client);
        const state = g.getState ? g.getState() : null;
        if (state && typeof roomManager.broadcastToPlayers === "function") roomManager.broadcastToPlayers(state.players, state);
        break;
      }

      // ---------------- LISTEN/HEALTH (frontend compatibility) ----------------
      case "ping":
        if (ws.readyState === 1) ws.send(JSON.stringify({ type: "pong" }));
        break;

      default:
        // avoid spamming logs for frequent known-but-

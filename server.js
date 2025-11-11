// server.js — DOCA WebDarts (final, with /debug-ws)
// Robustere Variante mit Debug-Logging und Resend-Fallbacks

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

function safeParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

function heartbeat() { this.isAlive = true; }
function noop() {}

wss.on("connection", (ws, req) => {
  const clientId = userManager.addUser(ws, "Gast");
  ws.clientId = clientId;
  ws.isAlive = true;
  ws.on("pong", heartbeat);

  console.log(`[WS] ➕ connect ${clientId} (${req?.socket?.remoteAddress || 'unknown'})`);

  // initial connected message (may be "Gast" until auth)
  userManager.sendToClient?.(clientId, {
    type: "connected",
    clientId,
    name: userManager.getUserName(clientId)
  });

  broadcastOnline();
  roomManager.updateRoomList?.();

  ws.on("message", (raw) => {
    const data = safeParse(raw);
    if (!data || !data.type) {
      console.warn("[WS] Ungültige Nachricht:", raw);
      return;
    }
    const type = (data.type || "").toLowerCase();
    const payload = data.payload || data;
    const uid = userManager.getClientId(ws) || ws.clientId;

    console.log(`[WS] ← ${uid} : ${type}`, payload && Object.keys(payload).length ? payload : "");

    switch (type) {
      case "auth": {
        const name = payload.user || payload.username || payload.name;
        if (name) {
          userManager.setUserName(uid, name);
          userManager.sendToClient?.(uid, { type: "connected", clientId: uid, name: userManager.getUserName(uid) });
          console.log(`[AUTH] ${uid} -> ${userManager.getUserName(uid)}`);

          // If user is already in a room, push updated room state to that room
          const room = roomManager.getRoomByClientId?.(uid);
          if (room) {
            const state = roomManager.getRoomState?.(room.id);
            if (state) {
              console.log(`[AUTH] user ${uid} is in room ${room.id} — sending updated room_state`);
              userManager.broadcastToPlayers?.(state.players, state);
            }
          }
        }
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
        const rid = roomManager.createRoom(uid, rname, payload.options || {});
        userManager.sendToClient?.(uid, { type: "room_created", roomId: rid, name: rname });
        console.log(`[ROOM] ${uid} created room ${rid} (${rname})`);
        roomManager.updateRoomList?.();
        break;
      }

      case "join_room": {
        const rid = payload.roomId || payload.id || payload.room;
        if (!rid) {
          userManager.sendToClient?.(uid, { type: "error", message: "missing roomId" });
          break;
        }

        console.log(`[ROOM] ${uid} requests join ${rid}`);

        const ok = roomManager.joinRoom(uid, rid);
        userManager.sendToClient?.(uid, { type: "joined_room", roomId: rid, ok: !!ok });

        if (ok) {
          const roomState = roomManager.getRoomState?.(rid);
          if (roomState) {
            // send immediately
            console.log(`[ROOM] broadcasting room_state for ${rid} -> players: ${roomState.players.join(",")}`);
            userManager.broadcastToPlayers?.(roomState.players, roomState);

            // resend shortly after (race condition mitigation)
            setTimeout(() => {
              try {
                const rs2 = roomManager.getRoomState?.(rid);
                if (rs2) {
                  console.log(`[ROOM] resend room_state for ${rid}`);
                  userManager.broadcastToPlayers?.(rs2.players, rs2);
                }
              } catch(e) { console.warn("[ROOM] resend failed", e); }
            }, 200);
          }

          // if a game exists, send its state too
          const game = games.get(rid);
          if (game) {
            const gameState = game.getState?.();
            if (gameState) {
              const players = gameState.players || [];
              userManager.broadcastToPlayers?.(players, {
                type: "game_state",
                ...gameState,
                playerNames: players.map(p => userManager.getUserName(p))
              });
            }
          }
        } else {
          console.warn(`[ROOM] joinRoom returned false for ${uid} -> ${rid}`);
        }

        roomManager.updateRoomList?.();
        break;
      }

      case "leave_room":
        console.log(`[ROOM] ${uid} leave request`);
        roomManager.leaveRoom(uid);
        roomManager.updateRoomList?.();
        break;

      case "start_game": {
        const room = roomManager.getRoomByClientId?.(uid);
        if (!room) {
          console.warn(`[GAME] start_game by ${uid} — no room`);
          break;
        }
        const g = new GameLogic(room);
        g.start();
        games.set(room.id, g);
        const state = g.getState?.();
        if (state) {
          const players = state.players || [];
          console.log(`[GAME] started in ${room.id} -> broadcasting game_state`);
          userManager.broadcastToPlayers?.(players, { type: "game_state", ...state, playerNames: players.map(p => userManager.getUserName(p)) });
        }
        break;
      }

      case "player_throw": {
        const points = Number(payload.value ?? payload.points ?? payload) || 0;
        const room = roomManager.getRoomByClientId?.(uid);
        if (!room) { console.warn(`[THROW] ${uid} not in room`); break; }
        const g = games.get(room.id);
        if (!g) { console.warn(`[THROW] no game for room ${room.id}`); break; }
        const ok = g.playerThrow?.(uid, points);
        const state = g.getState?.();
        if (state) {
          const players = state.players || [];
          userManager.broadcastToPlayers?.(players, { type: "game_state", ...state, playerNames: players.map(p => userManager.getUserName(p)) });
        }
        userManager.sendToClient?.(uid, { type: "action_result", action: "player_throw", ok: !!ok });
        break;
      }

      case "undo_throw": {
        const room = roomManager.getRoomByClientId?.(uid);
        if (!room) break;
        const g = games.get(room.id);
        if (!g) break;
        const ok = g.undoLastThrow?.();
        const state = g.getState?.();
        if (state) {
          const players = state.players || [];
          userManager.broadcastToPlayers?.(players, { type: "game_state", ...state, playerNames: players.map(p => userManager.getUserName(p)) });
        }
        userManager.sendToClient?.(uid, { type: "action_result", action: "undo_throw", ok: !!ok });
        break;
      }

      case "chat_global": {
        const text = payload.message || payload.msg || payload.text || "";
        const out = { type: "chat_global", user: userManager.getUserName(uid) || "Gast", message: text };
        userManager.broadcast?.(out);
        break;
      }

      case "ping":
        userManager.sendToClient?.(uid, { type: "pong" });
        break;

      default:
        userManager.sendToClient?.(uid, { type: "error", message: `unknown type ${type}` });
        break;
    }
  });

  ws.on("close", () => {
    console.log(`[WS] ❌ disconnect ${ws.clientId}`);
    roomManager.leaveRoom?.(ws.clientId);
    userManager.removeUser?.(ws);
    broadcastOnline();
    roomManager.updateRoomList?.();
  });

  ws.on("error", (err) => {
    console.warn("WS error for", ws.clientId, err?.message || err);
  });
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
    const names = (typeof userManager.getOnlineUserNames === "function")
      ? userManager.getOnlineUserNames()
      : (typeof userManager.listOnlineUsers === "function"
          ? userManager.listOnlineUsers().map(u => u.username)
          : []);
    const msg = { type: "online_list", users: names };
    userManager.broadcast?.(msg);
  } catch (e) { console.warn("[broadcastOnline] err", e); }
}

// --- HTTP routes ---
app.get("/", (req, res) => {
  res.type("text/plain").send("DOCA WebDarts Server is running");
});

app.get("/status", (req, res) => {
  res.json({
    status: "ok",
    clients: wss.clients.size,
    rooms: typeof roomManager.getRoomState === "function" ? "available" : "unknown"
  });
});

// --- DEBUG ROUTE ---
app.get("/debug-ws", (req, res) => {
  try {
    const users = userManager.listOnlineUsers?.() || [];
    // roomManager.listRooms may not exist; try to create friendly view:
    const rooms = (() => {
      try { return roomManager.listRooms?.() || Array.from(roomManager.getRoomState ? [] : []).map(() => ({})); } catch { return []; }
    })();
    const activeGames = Array.from(games.entries()).map(([id, g]) => ({
      roomId: id,
      state: g.getState?.() || {}
    }));
    res.json({
      time: new Date().toISOString(),
      totalClients: wss.clients.size,
      users,
      rooms,
      games: activeGames
    });
  } catch (e) {
    res.status(500).json({ error: e.message || e });
  }
});

// --- SHUTDOWN ---
function shutdown() {
  console.log("Shutting down WebSocket server...");
  clearInterval(interval);
  wss.close(() => {
    server.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(PORT, () => {
  console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`);
});

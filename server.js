import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

// Dynamisch alles laden, egal wie es exportiert ist
import * as roomManager from "./roomManager.js";
import * as userManager from "./userManager.js";
import * as gameLogic from "./gameLogic.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 10000;

// Render-Ping
app.get("/", (_, res) => res.send("✅ DOCA WebDarts Server is running"));

// Hilfsfunktionen – prüfen, ob Funktion existiert
const safeCall = (mod, fn, ...args) => {
  try {
    if (typeof mod?.[fn] === "function") return mod[fn](...args);
  } catch (e) {
    console.error(`❌ Fehler in ${fn}:`, e.message);
  }
};

// Haupt-WebSocket-Logik
wss.on("connection", (ws) => {
  console.log("✅ Neuer Client verbunden.");

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      console.error("❌ Ungültiges JSON");
      return;
    }

    const { type, payload = {} } = data;

    switch (type) {
      case "login":
      case "auth":
        safeCall(userManager, "addUser", ws, payload.username || "Gast");
        broadcastOnlineList();
        break;

      case "logout":
        safeCall(userManager, "removeUser", ws);
        broadcastOnlineList();
        break;

      case "create_room": {
        const id = safeCall(
          roomManager,
          "createRoom",
          ws,
          payload.username || "Neuer Raum",
          payload.options || {}
        );
        ws.send(JSON.stringify({ type: "room_created", payload: { roomId: id } }));
        break;
      }

      case "join_room": {
        const { roomId } = payload;
        safeCall(roomManager, "joinRoom", ws, roomId);
        const state = safeCall(roomManager, "getRoomState", roomId);
        if (state && roomManager.broadcastToPlayers)
          safeCall(roomManager, "broadcastToPlayers", state.players, state);
        safeCall(roomManager, "updateRoomList");
        break;
      }

      case "chat_message": {
        const room = safeCall(roomManager, "getRoomByClientId", ws);
        if (room && roomManager.broadcastToPlayers) {
          safeCall(roomManager, "broadcastToPlayers", room.players, {
            type: "chat_message",
            payload: {
              username: safeCall(userManager, "getUserName", ws) || "Unbekannt",
              message: payload.message || "",
            },
          });
        }
        break;
      }

      case "start_game": {
        const { roomId } = payload;
        const state = safeCall(roomManager, "getRoomState", roomId);
        if (state && roomManager.broadcastToPlayers)
          safeCall(roomManager, "broadcastToPlayers", state.players, {
            type: "game_started",
            payload: { roomId },
          });
        break;
      }

      case "score_input":
        safeCall(gameLogic, "handleScoreInput", payload);
        break;

      case "list_rooms":
        safeCall(roomManager, "updateRoomList");
        break;

      case "list_online":
        broadcastOnlineList();
        break;

      default:
        // Nur einmal pro Typ warnen
        if (!loggedUnknown.has(type)) {
          loggedUnknown.add(type);
          console.warn("⚠️ Unbekannter Nachrichtentyp:", type);
        }
        break;
    }
  });

  ws.on("close", () => {
    safeCall(roomManager, "leaveRoom", ws);
    safeCall(userManager, "removeUser", ws);
    broadcastOnlineList();
    console.log("❌ Verbindung getrennt");
  });
});

const loggedUnknown = new Set();

function broadcastOnlineList() {
  const list = safeCall(userManager, "getAllUsernames") || [];
  const msg = JSON.stringify({ type: "online_list", payload: list });
  wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(msg);
  });
}

server.listen(PORT, () =>
  console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`)
);

import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import * as roomManager from "./roomManager.js";
import * as userManager from "./userManager.js";
import * as gameLogic from "./gameLogic.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 10000;

// Render-Ping, damit Deploy nie mehr hängen bleibt
app.get("/", (req, res) => res.send("✅ DOCA WebDarts Server is running"));

wss.on("connection", (ws) => {
  console.log("✅ Neuer Client verbunden.");

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      console.error("❌ Ungültiges JSON:", msg);
      return;
    }

    const { type, payload } = data;
    const safeClientId =
      (userManager.getClientId && userManager.getClientId(ws)) || ws.id || ws;

    switch (type) {
      // ------------------------------------
      // LOGIN / LOGOUT
      // ------------------------------------
      case "login":
      case "auth": {
        userManager.addUser(ws, payload?.username || "Gast");
        broadcastOnlineList();
        break;
      }

      case "logout": {
        userManager.removeUser(ws);
        broadcastOnlineList();
        break;
      }

      // ------------------------------------
      // RAUM-LOGIK
      // ------------------------------------
      case "create_room": {
        const roomId = roomManager.createRoom(
          safeClientId,
          payload?.username || "Neuer Raum",
          payload?.options || {}
        );
        ws.send(
          JSON.stringify({ type: "room_created", payload: { roomId } })
        );
        break;
      }

      case "join_room": {
        const roomId = payload?.roomId;
        roomManager.joinRoom(safeClientId, roomId);

        const state = roomManager.getRoomState(roomId);
        if (state && roomManager.broadcastToPlayers) {
          roomManager.broadcastToPlayers(state.players, state);
        }
        roomManager.updateRoomList();
        console.log(`👥 ${userManager.getUserName?.(safeClientId)} ist Raum ${roomId} beigetreten.`);
        break;
      }

      // ------------------------------------
      // CHAT
      // ------------------------------------
      case "chat_message": {
        const room = roomManager.getRoomByClientId?.(safeClientId);
        if (room && roomManager.broadcastToPlayers) {
          roomManager.broadcastToPlayers(room.players, {
            type: "chat_message",
            payload: {
              username: userManager.getUserName?.(safeClientId) || "Unbekannt",
              message: payload?.message || "",
            },
          });
        }
        break;
      }

      // ------------------------------------
      // SPIEL-LOGIK
      // ------------------------------------
      case "start_game": {
        const roomId = payload?.roomId;
        const state = roomManager.getRoomState(roomId);
        if (state && roomManager.broadcastToPlayers) {
          roomManager.broadcastToPlayers(state.players, {
            type: "game_started",
            payload: { roomId },
          });
        }
        break;
      }

      case "score_input": {
        if (gameLogic.handleScoreInput)
          gameLogic.handleScoreInput(payload);
        break;
      }

      // ------------------------------------
      // LISTEN-ANFRAGEN (Frontend)
      // ------------------------------------
      case "list_rooms":
        roomManager.updateRoomList();
        break;

      case "list_online":
        broadcastOnlineList();
        break;

      // ------------------------------------
      // FALLBACK
      // ------------------------------------
      default:
        // Nur einmal pro Typ loggen
        if (!["ping"].includes(type))
          console.warn("⚠️ Unbekannter Nachrichtentyp:", type);
        break;
    }
  });

  ws.on("close", () => {
    const clientId =
      (userManager.getClientId && userManager.getClientId(ws)) || ws;
    const username = userManager.getUserName?.(clientId);

    roomManager.leaveRoom?.(clientId);
    userManager.removeUser(ws);
    broadcastOnlineList();
    console.log(`❌ ${username || "Unbekannter Benutzer"} getrennt.`);
  });
});

function broadcastOnlineList() {
  const list = (userManager.getAllUsernames?.() || []).filter(Boolean);
  const msg = JSON.stringify({ type: "online_list", payload: list });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

server.listen(PORT, () =>
  console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`)
);

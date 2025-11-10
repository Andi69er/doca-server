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

// Render-HTTP-Check
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

    switch (type) {
      // ---------------------- LOGIN ----------------------
      case "login":
      case "auth": {
        userManager.addUser(ws, payload?.username || "Gast");
        broadcastOnlineList();
        break;
      }

      // ---------------------- LOGOUT ---------------------
      case "logout": {
        userManager.removeUser(ws);
        broadcastOnlineList();
        break;
      }

      // ---------------------- RÄUME -----------------------
      case "create_room": {
        const clientId = ws; // Socket selbst als ID
        const roomId = roomManager.createRoom(
          clientId,
          payload?.username || "Neuer Raum",
          payload?.options || {}
        );
        ws.send(JSON.stringify({ type: "room_created", payload: { roomId } }));
        break;
      }

      case "join_room": {
        const clientId = ws;
        const roomId = payload?.roomId;
        roomManager.joinRoom(clientId, roomId);

        const state = roomManager.getRoomState(roomId);
        if (state && roomManager.broadcastToPlayers)
          roomManager.broadcastToPlayers(state.players, state);

        roomManager.updateRoomList();
        console.log(`👥 Spieler ist Raum ${roomId} beigetreten.`);
        break;
      }

      // ---------------------- CHAT -----------------------
      case "chat_message": {
        const clientId = ws;
        const room = roomManager.getRoomByClientId?.(clientId);
        if (room && roomManager.broadcastToPlayers) {
          roomManager.broadcastToPlayers(room.players, {
            type: "chat_message",
            payload: {
              username: userManager.getUserName?.(clientId) || "Unbekannt",
              message: payload?.message || "",
            },
          });
        }
        break;
      }

      // ---------------------- SPIEL ----------------------
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

      // ---------------------- FRONTEND -------------------
      case "list_rooms":
        roomManager.updateRoomList();
        break;

      case "list_online":
        broadcastOnlineList();
        break;

      // ---------------------- FALLBACK -------------------
      default:
        // Log nur 1× pro Nachrichtentyp
        if (!loggedUnknown.has(type)) {
          loggedUnknown.add(type);
          console.warn("⚠️ Unbekannter Nachrichtentyp:", type);
        }
        break;
    }
  });

  ws.on("close", () => {
    // Socket als ID verwenden
    roomManager.leaveRoom(ws);
    userManager.removeUser(ws);
    broadcastOnlineList();
    console.log("❌ Client getrennt.");
  });
});

const loggedUnknown = new Set();

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

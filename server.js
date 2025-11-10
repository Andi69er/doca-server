import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

// Deine Module (Funktions-Exports)
import * as roomManager from "./roomManager.js";
import * as userManager from "./userManager.js";
import * as gameLogic from "./gameLogic.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 10000;

// *** Render braucht eine HTTP-Antwort, sonst Time-Out ***
app.get("/", (req, res) => {
  res.send("✅ DOCA WebDarts Server is running");
});

// --- WebSocket-Verbindungen ---
wss.on("connection", (ws) => {
  console.log("✅ Neuer Client verbunden.");

  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      console.error("❌ Ungültiges JSON:", message);
      return;
    }

    const { type, payload } = data;

    switch (type) {
      case "login": {
        userManager.addUser(ws, payload.username);
        broadcastOnlineList();
        break;
      }

      case "logout": {
        userManager.removeUser(ws);
        broadcastOnlineList();
        break;
      }

      case "create_room": {
        const clientId = userManager.getClientId(ws);
        const roomId = roomManager.createRoom(clientId, payload.username, payload.options);
        ws.send(JSON.stringify({ type: "room_created", payload: { roomId } }));
        break;
      }

      case "join_room": {
        const clientId = userManager.getClientId(ws);
        const { roomId } = payload;
        roomManager.joinRoom(clientId, roomId);

        // Nach dem Beitritt: synchronisiere Raumzustand an alle Spieler
        const state = roomManager.getRoomState(roomId);
        if (state && roomManager.broadcastToPlayers) {
          roomManager.broadcastToPlayers(state.players, state);
        }
        roomManager.updateRoomList();
        console.log(`👥 ${userManager.getUserName(clientId)} ist Raum ${roomId} beigetreten.`);
        break;
      }

      case "chat_message": {
        const clientId = userManager.getClientId(ws);
        const { message: msg } = payload;
        const room = roomManager.getRoomByClientId(clientId);
        if (room) {
          roomManager.broadcastToPlayers(room.players, {
            type: "chat_message",
            payload: {
              username: userManager.getUserName(clientId),
              message: msg
            }
          });
        }
        break;
      }

      case "start_game": {
        const { roomId } = payload;
        const state = roomManager.getRoomState(roomId);
        if (state && roomManager.broadcastToPlayers) {
          roomManager.broadcastToPlayers(state.players, {
            type: "game_started",
            payload: { roomId }
          });
        }
        break;
      }

      case "score_input": {
        gameLogic.handleScoreInput(payload);
        break;
      }

      default:
        console.warn("⚠️ Unbekannter Nachrichtentyp:", type);
        break;
    }
  });

  ws.on("close", () => {
    const clientId = userManager.getClientId(ws);
    const username = userManager.getUserName(clientId);

    roomManager.leaveRoom(clientId);
    userManager.removeUser(ws);
    broadcastOnlineList();

    console.log(`❌ ${username || "Unbekannter Benutzer"} getrennt.`);
  });
});

function broadcastOnlineList() {
  const list = userManager.getAllUsernames?.() || [];
  const msg = JSON.stringify({ type: "online_list", payload: list });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

server.listen(PORT, () => {
  console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`);
});

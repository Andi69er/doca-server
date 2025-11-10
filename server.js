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

// Verbindung WebSocket
wss.on("connection", (ws) => {
  console.log("✅ Neuer Client verbunden.");

  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (err) {
      console.error("❌ Ungültiges JSON:", message);
      return;
    }

    const { type, payload } = data;

    switch (type) {
      // Spielerlogin
      case "login": {
        userManager.addUser(ws, payload.username);
        broadcastOnlineList();
        break;
      }

      // Logout
      case "logout": {
        userManager.removeUser(ws);
        broadcastOnlineList();
        break;
      }

      // Raum erstellen
      case "create_room": {
        const clientId = userManager.getClientId(ws);
        const roomId = roomManager.createRoom(clientId, payload.username, payload.options);
        ws.send(JSON.stringify({ type: "room_created", payload: { roomId } }));
        break;
      }

      // Raum beitreten
      case "join_room": {
        const clientId = userManager.getClientId(ws);
        const { roomId } = payload;
        roomManager.joinRoom(clientId, roomId);

        // Nach dem Beitritt: beide Spieler synchronisieren
        const state = roomManager.getRoomState(roomId);
        if (state) {
          roomManager.updateRoomList();
          userManager.broadcastToRoom?.(roomId, state);
        }

        console.log(`👥 ${userManager.getUserName(clientId)} ist Raum ${roomId} beigetreten.`);
        break;
      }

      // Chatnachricht
      case "chat_message": {
        const clientId = userManager.getClientId(ws);
        const { roomId, message: msg } = payload;
        roomManager.broadcastToPlayers(roomManager.getRoomByClientId(clientId)?.players || [], {
          type: "chat_message",
          payload: { username: userManager.getUserName(clientId), message: msg },
        });
        break;
      }

      // Spiel starten
      case "start_game": {
        const { roomId } = payload;
        const state = roomManager.getRoomState(roomId);
        if (state) {
          roomManager.broadcastToPlayers(state.players, {
            type: "game_started",
            payload: { roomId },
          });
        }
        break;
      }

      // Punkte eingeben
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
    const username = userManager.getUserName(userManager.getClientId(ws));
    const clientId = userManager.getClientId(ws);

    // Entferne Spieler
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

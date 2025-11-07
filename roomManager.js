// =======================================
// doca-webdarts / server/roomManager.js
// Verwaltung von Räumen, Spielern & Matches
// =======================================

import { WebSocket } from "ws";
import { createNewGame, applyScore, recordCheckdart, serializeGame } from "./gameLogic.js";
import { checkUserSession } from "./userManager.js";

const rooms = new Map();   // key = roomId, value = room object
const onlineUsers = new Map(); // key = ws, value = { id, name, roomId }

function broadcast(room, msg) {
  room.players.forEach(p => {
    if (p.ws && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify(msg));
    }
  });
}

function send(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function handleWebSocketConnection(ws, req) {
  let user = null;

  ws.on("message", async (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    switch (data.type) {
      // Spieler authentifiziert sich mit Session-ID (PHPSESSID)
      case "auth":
        const res = await checkUserSession(data.sid);
        if (!res.success) {
          send(ws, { type: "auth_failed" });
          return;
        }
        user = { id: res.user.id, name: res.user.username, ws, roomId: null };
        onlineUsers.set(ws, user);
        send(ws, { type: "auth_ok", user: { id: user.id, name: user.name } });
        updateOnlineList();
        break;

      // Spieler fordert anderen heraus
      case "challenge":
        const target = Array.from(onlineUsers.values()).find(u => u.id === data.targetId);
        if (target) {
          send(target.ws, { type: "challenge_received", from: { id: user.id, name: user.name } });
        }
        break;

      // Herausforderung akzeptiert → neuen Raum erstellen
      case "challenge_accept":
        createRoom(user, data.opponentId);
        break;

      // Score senden
      case "submit_score":
        if (!user || !user.roomId) return;
        const room = rooms.get(user.roomId);
        if (!room || !room.game) return;
        room.game = applyScore(room.game, user.id, data.score);
        broadcast(room, { type: "game_update", game: serializeGame(room.game) });
        break;

      // Checkdart (nach Leg)
      case "checkdart":
        if (!user || !user.roomId) return;
        const room2 = rooms.get(user.roomId);
        if (!room2 || !room2.game) return;
        room2.game = recordCheckdart(room2.game, user.id, data.darts);
        broadcast(room2, { type: "game_update", game: serializeGame(room2.game) });
        break;

      // Spiel abbrechen
      case "abort":
        if (!user || !user.roomId) return;
        const room3 = rooms.get(user.roomId);
        if (!room3) return;
        broadcast(room3, { type: "game_aborted" });
        rooms.delete(user.roomId);
        break;
    }
  });

  ws.on("close", () => {
    onlineUsers.delete(ws);
    updateOnlineList();
    if (user && user.roomId) {
      const room = rooms.get(user.roomId);
      if (room) {
        broadcast(room, { type: "opponent_left" });
        rooms.delete(user.roomId);
      }
    }
  });
}

// Räume erzeugen
function createRoom(p1, opponentId) {
  const p2 = Array.from(onlineUsers.values()).find(u => u.id === opponentId);
  if (!p2) return;

  const roomId = `room_${Date.now()}`;
  const settings = {
    startScore: 501,
    legsToWin: 3,
    doubleOut: true,
    mode: "first-to",
    starter: p1.id
  };

  const game = createNewGame(settings, [p1, p2]);

  const room = { id: roomId, players: [p1, p2], game };
  rooms.set(roomId, room);

  p1.roomId = roomId;
  p2.roomId = roomId;

  broadcast(room, { type: "room_created", roomId, game: serializeGame(game) });
  console.log(`🎯 Neuer Raum: ${roomId} (${p1.name} vs ${p2.name})`);
}

// Online-Liste aktualisieren
function updateOnlineList() {
  const list = Array.from(onlineUsers.values()).map(u => ({ id: u.id, name: u.name }));
  onlineUsers.forEach(u => {
    send(u.ws, { type: "online_list", users: list });
  });
}

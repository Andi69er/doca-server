// roomManager.js
import { broadcast, sendToClient } from "./userManager.js";

const rooms = new Map(); // { roomId: { id, name, players: [], maxPlayers: 2 } }

export function handleMessage(ws, data) {
  switch (data.type) {
    // === Verbindung & Authentifizierung ===
    case "auth":
      ws.user = data.user || "Gast";
      ws.id = data.id || Math.random().toString(36).substring(2, 8);
      sendToClient(ws, { type: "auth_ok", message: "Authentifizierung erfolgreich" });
      console.log(`✅ Authentifiziert: ${ws.user} (${ws.id})`);
      break;

    // === Räume abrufen ===
    case "list_rooms":
      sendToClient(ws, {
        type: "room_update",
        rooms: Array.from(rooms.values())
      });
      break;

    // === Raum erstellen ===
    case "create_room":
      const roomId = Math.random().toString(36).substring(2, 8);
      const room = {
        id: roomId,
        name: data.name || `Raum-${roomId}`,
        players: [ws.id],
        maxPlayers: 2
      };
      rooms.set(roomId, room);

      sendToClient(ws, { type: "joined_room", roomId });
      broadcast({
        type: "room_update",
        rooms: Array.from(rooms.values())
      });
      broadcast({
        type: "server_log",
        message: `${ws.user} hat ${room.name} erstellt.`
      });
      break;

    // === Raum beitreten ===
    case "join_room":
      const targetRoom = rooms.get(data.roomId);
      if (!targetRoom) {
        sendToClient(ws, { type: "error", message: "Raum nicht gefunden." });
        return;
      }

      if (targetRoom.players.length >= targetRoom.maxPlayers) {
        sendToClient(ws, { type: "error", message: "Raum ist voll." });
        return;
      }

      targetRoom.players.push(ws.id);
      sendToClient(ws, { type: "joined_room", roomId: data.roomId });
      broadcast({
        type: "room_update",
        rooms: Array.from(rooms.values())
      });
      broadcast({
        type: "server_log",
        message: `${ws.user} ist ${targetRoom.name} beigetreten.`
      });
      break;

    // === Chat weiterleiten ===
    case "chat_message":
      broadcast({
        type: "chat_message",
        user: ws.user,
        message: data.message
      });
      break;

    // === Signal für WebRTC (Kamera) ===
    case "signal":
      const targetClient = data.targetId;
      if (targetClient && global.clients[targetClient]) {
        sendToClient(global.clients[targetClient], {
          type: "signal",
          from: ws.id,
          signal: data.signal
        });
      } else {
        sendToClient(ws, { type: "error", message: "Ziel nicht gefunden." });
      }
      break;

    // === Score-Update oder Spiel-Aktionen ===
    case "score_update":
      broadcast({
        type: "score_update",
        player: ws.user,
        score: data.score
      });
      break;

    default:
      sendToClient(ws, {
        type: "server_log",
        message: `Unbekannter Typ: ${data.type}`
      });
  }
}

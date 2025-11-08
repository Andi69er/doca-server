// roomManager.js
// ===========================================
// Handles rooms, clients, and high-level messages
// ===========================================

import { GameLogic } from "./gameLogic.js";

export const roomManager = (function () {
  const clients = new Map(); // key: ws, value: meta
  const rooms = new Map(); // key: roomId, value: { id, name, players, game }

  const DEFAULT_ROOM_ID = "default-room";

  if (!rooms.has(DEFAULT_ROOM_ID)) {
    rooms.set(DEFAULT_ROOM_ID, {
      id: DEFAULT_ROOM_ID,
      name: "Default-Raum",
      players: [],
      game: null,
    });
  }

  // ------------------------------
  // Hilfsfunktionen
  // ------------------------------
  function send(ws, obj) {
    try {
      if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    } catch (e) {
      console.error("Send error:", e);
    }
  }

  function broadcast(obj, exclude = null) {
    for (const [ws] of clients.entries()) {
      if (ws.readyState === ws.OPEN && ws !== exclude) send(ws, obj);
    }
  }

  function sendToRoom(roomId, obj, exclude = null) {
    const room = rooms.get(roomId);
    if (!room) return;
    for (const ws of room.players) {
      if (ws && ws.readyState === ws.OPEN && ws !== exclude) send(ws, obj);
    }
  }

  function serializeRoom(room) {
    return {
      id: room.id,
      name: room.name,
      players: room.players.map((ws) => {
        const m = clients.get(ws);
        return { id: m?.id ?? null, name: m?.username ?? "Gast" };
      }),
      gameActive: !!room.game,
    };
  }

  function getAllRooms() {
    return Array.from(rooms.values()).map((r) => serializeRoom(r));
  }

  function getOnlineList() {
    const list = [];
    for (const [ws, m] of clients.entries()) {
      list.push({ id: m.id || null, name: m.username || "Gast", room: m.currentRoom || null });
    }
    return list;
  }

  // ------------------------------
  // Clientverwaltung
  // ------------------------------
  function registerClient(ws) {
    const meta = {
      id: null,
      username: "Gast",
      sid: null,
      currentRoom: null,
      connectedAt: new Date(),
      isAuthenticated: false,
    };
    clients.set(ws, meta);
    return meta;
  }

  function unregisterClient(ws) {
    const meta = clients.get(ws);
    if (!meta) return;
    if (meta.currentRoom) {
      const room = rooms.get(meta.currentRoom);
      if (room) {
        room.players = room.players.filter((s) => s !== ws);
        if (room.game) {
          room.game.removePlayer(ws);
          sendToRoom(room.id, { type: "room_update", room: serializeRoom(room) });
        }
      }
    }
    clients.delete(ws);
  }

  // ------------------------------
  // Nachrichtenbehandlung
  // ------------------------------
  function handleMessage(ws, data) {
    const meta = clients.get(ws);
    if (!meta) return;

    switch (data.type) {
      case "auth":
        meta.sid = data.sid || null;
        meta.username = data.user || meta.username;
        meta.id = data.id || meta.id || Math.floor(Math.random() * 90000) + 1000;
        meta.isAuthenticated = true;
        send(ws, { type: "auth_ok", user: { id: meta.id, name: meta.username } });
        broadcast({ type: "online_list", online: getOnlineList() });
        break;

      case "login":
        meta.username = data.user || meta.username;
        meta.id = data.id || meta.id || Math.floor(Math.random() * 90000) + 1000;
        meta.isAuthenticated = true;
        send(ws, { type: "info", message: `Willkommen ${meta.username}!` });
        broadcast({ type: "online_list", online: getOnlineList() }, ws);
        break;

      case "list_rooms":
        send(ws, { type: "room_list", rooms: getAllRooms() });
        break;

      case "join_room":
        {
          const roomId = data.roomId || DEFAULT_ROOM_ID;
          if (!rooms.has(roomId)) {
            rooms.set(roomId, {
              id: roomId,
              name: data.roomName || `Raum ${roomId}`,
              players: [],
              game: null,
            });
          }
          const room = rooms.get(roomId);

          if (meta.currentRoom && meta.currentRoom !== roomId) {
            const old = rooms.get(meta.currentRoom);
            if (old) {
              old.players = old.players.filter((s) => s !== ws);
              sendToRoom(old.id, { type: "room_update", room: serializeRoom(old) });
            }
          }

          if (!room.players.includes(ws)) room.players.push(ws);
          meta.currentRoom = roomId;

          send(ws, { type: "joined_room", room: serializeRoom(room) });
          sendToRoom(roomId, { type: "room_update", room: serializeRoom(room) });

          if (!room.game) {
            room.game = new GameLogic(room.id, sendToRoom.bind(null, room.id));
          }
          room.game.addPlayer(ws, meta);

          send(ws, { type: "info", message: `Beigetreten zu ${room.name}` });
          sendToRoom(roomId, { type: "info", message: `${meta.username} ist beigetreten.` }, ws);
        }
        break;

      case "start_game":
        {
          const roomId = meta.currentRoom || DEFAULT_ROOM_ID;
          const room = rooms.get(roomId);
          if (!room) {
            send(ws, { type: "error", message: "Raum nicht gefunden." });
            break;
          }
          if (!room.game) room.game = new GameLogic(roomId, sendToRoom.bind(null, roomId));
          const started = room.game.start();
          if (started) {
            sendToRoom(roomId, {
              type: "start_game",
              message: "Spiel startet",
              players: room.game.getPlayersInfo(),
            });
            sendToRoom(roomId, { type: "room_update", room: serializeRoom(room) });
          } else {
            send(ws, { type: "error", message: "Zu wenig Spieler zum Starten." });
          }
        }
        break;

      case "throw":
        {
          const roomId = meta.currentRoom || DEFAULT_ROOM_ID;
          const room = rooms.get(roomId);
          if (!room || !room.game) {
            send(ws, { type: "error", message: "Kein aktives Spiel." });
            break;
          }
          room.game.handleThrow(ws, data.payload || {});
        }
        break;

      case "ping":
        send(ws, { type: "pong", message: "🏓 Pong vom Server" });
        break;

      default:
        console.log("⚠️ Unbekannter Nachrichtentyp im roomManager:", data);
        send(ws, { type: "error", message: "Unbekannter Nachrichtentyp." });
    }
  }

  function handleConnection(ws, req) {
    registerClient(ws);
    send(ws, { type: "info", message: "Verbunden mit DOCA WebDarts Server" });

    ws.on("message", (msg) => {
      let data;
      try {
        data = JSON.parse(msg.toString());
      } catch {
        send(ws, { type: "error", message: "Ungültiges JSON" });
        return;
      }
      handleMessage(ws, data);
    });

    ws.on("close", () => {
      unregisterClient(ws);
      broadcast({ type: "online_list", online: getOnlineList() });
    });

    ws.on("error", (err) => console.error("WS-Fehler:", err));
  }

  return { handleConnection, handleMessage, clients, rooms };
})();

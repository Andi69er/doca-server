// roomManager.js
// ===========================================
// Handles rooms, clients and high-level messages.
// ===========================================

import { GameLogic } from "./gameLogic.js";

export const roomManager = (function () {
  // clients: Map(ws => meta)
  const clients = new Map();
  // rooms: Map(roomId => { id, name, players: [ws,...], game: GameLogic|null })
  const rooms = new Map();

  // helper send
  function send(ws, obj) {
    try {
      if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    } catch (e) {
      console.error("Send error", e);
    }
  }

  function broadcast(obj, exclude = null) {
    for (const [ws] of clients) {
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

  // Create default room on startup
  const DEFAULT_ROOM_ID = "default-room";
  if (!rooms.has(DEFAULT_ROOM_ID)) {
    rooms.set(DEFAULT_ROOM_ID, {
      id: DEFAULT_ROOM_ID,
      name: "Default-Raum",
      players: [],
      game: null,
    });
  }

  // add client meta
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
    // remove from room
    if (meta.currentRoom) {
      const room = rooms.get(meta.currentRoom);
      if (room) {
        room.players = room.players.filter((s) => s !== ws);
        // if game exists, notify
        if (room.game) {
          room.game.removePlayer(ws);
          sendToRoom(room.id, { type: "room_update", room: serializeRoom(room) });
        }
      }
    }
    clients.delete(ws);
  }

  function serializeRoom(room) {
    return {
      id: room.id,
      name: room.name,
      players: room.players.map((ws) => {
        const m = clients.get(ws);
        return {
          id: m?.id ?? null,
          name: m?.username ?? "Gast",
        };
      }),
      gameActive: !!room.game,
    };
  }

  // handle incoming messages
  function handleMessage(ws, data) {
    const meta = clients.get(ws);
    if (!meta) return;

    switch (data.type) {
      case "auth":
        // expected { type: "auth", sid: "...", user: "Name", id: 123 }
        meta.sid = data.sid || null;
        meta.username = data.user || meta.username;
        meta.id = data.id || meta.id || Math.floor(Math.random() * 90000) + 1000;
        meta.isAuthenticated = true;
        send(ws, { type: "auth_ok", user: { id: meta.id, name: meta.username } });
        // broadcast online list
        broadcast({ type: "online_list", online: getOnlineList() });
        break;

      case "login":
        // lightweight login (test clients)
        meta.username = data.user || meta.username;
        meta.id = data.id || meta.id || Math.floor(Math.random() * 90000) + 1000;
        meta.isAuthenticated = true;
        send(ws, { type: "info", message: `Willkommen ${meta.username}!` });
        broadcast({ type: "online_list", online: getOnlineList() }, ws);
        break;

      case "join_room":
        {
          const roomId = data.roomId || DEFAULT_ROOM_ID;
          const room = rooms.get(roomId);
          if (!room) {
            // create new room
            const newRoom = {
              id: roomId,
              name: data.roomName || `Raum ${roomId}`,
              players: [],
              game: null,
            };
            rooms.set(roomId, newRoom);
          }
          // remove from old room if any
          if (meta.currentRoom && meta.currentRoom !== roomId) {
            const old = rooms.get(meta.currentRoom);
            if (old) {
              old.players = old.players.filter((s) => s !== ws);
              sendToRoom(old.id, { type: "room_update", room: serializeRoom(old) });
            }
          }
          const target = rooms.get(roomId);
          if (!target.players.includes(ws)) target.players.push(ws);
          meta.currentRoom = roomId;

          send(ws, { type: "joined_room", room: serializeRoom(target) });
          sendToRoom(roomId, { type: "room_update", room: serializeRoom(target) });
          // if there's no game, optionally create one lazily
          if (!target.game) {
            // do not auto start — create engine container
            target.game = new GameLogic(target.id, sendToRoom.bind(null, target.id));
          }
          // add player to game engine
          target.game.addPlayer(ws, meta);
          send(ws, { type: "info", message: `Beigetreten zu ${target.name}` });
          sendToRoom(roomId, { type: "info", message: `${meta.username} ist dem Raum beigetreten.` }, ws);
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
            sendToRoom(roomId, { type: "start_game", message: "Spiel startet", players: room.game.getPlayersInfo() });
            sendToRoom(roomId, { type: "room_update", room: serializeRoom(room) });
          } else {
            send(ws, { type: "error", message: "Spiel konnte nicht gestartet werden (zu wenig Spieler?)." });
          }
        }
        break;

      case "throw":
        {
          // pass throw to room.game
          const roomId = meta.currentRoom || DEFAULT_ROOM_ID;
          const room = rooms.get(roomId);
          if (!room || !room.game) {
            send(ws, { type: "error", message: "Kein Spiel aktiv." });
            break;
          }
          // data.payload expected: { darts: [n,n,n] } or { value: 20, multiplier: 3 } etc.
          room.game.handleThrow(ws, data.payload || {});
        }
        break;

      case "ping":
        send(ws, { type: "pong", message: "Hallo zurück vom Server 👋" });
        break;

      default:
        console.log("⚠️ Unbekannter Nachrichtentyp im roomManager:", data);
        send(ws, { type: "error", message: "Unbekannter Nachrichtentyp." });
    }
  }

  function getOnlineList() {
    const list = [];
    for (const [ws, m] of clients.entries()) {
      list.push({ id: m.id || null, name: m.username || "Gast", room: m.currentRoom || null });
    }
    return list;
  }

  // handle new connection
  function handleConnection(ws, req) {
    const meta = registerClient(ws);

    send(ws, { type: "info", message: "Verbunden mit DOCA WebDarts Server" });

    ws.on("message", (msg) => {
      let data;
      try {
        data = JSON.parse(msg.toString());
      } catch (e) {
        console.error("Invalid JSON", e);
        send(ws, { type: "error", message: "Ungültiges JSON" });
        return;
      }
      handleMessage(ws, data);
    });

    ws.on("close", () => {
      // remove from any room and game
      unregisterClient(ws);
      broadcast({ type: "online_list", online: getOnlineList() });
    });

    ws.on("error", (err) => {
      console.error("WS error:", err);
    });
  }

  // expose functions
  return {
    handleConnection,
    handleMessage, // optionally usable externally
    clients,
    rooms,
    serializeRoom,
  };
})();

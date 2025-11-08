// roomManager.js
// -------------------------------------------
// Raumverwaltung für DOCA WebDarts (vollständig)
// -------------------------------------------

// roomManager muss mit send/broadcast initialisiert werden,
// damit er Nachrichten an Clients senden kann.
// server.js ruft roomManager.init({ send, broadcast, clients }) beim Start auf.

export const roomManager = (() => {
  // Räume: Map<roomId, { id, name, players: [{ ws, id, username }], maxPlayers }>
  const rooms = new Map();

  // Callback-Referenzen (werden von server.js gesetzt)
  let sendFn = null;
  let broadcastFn = null;
  let clientsRef = null; // Map von server.js (optional)

  // Hilfs: Erzeuge eine kurze ID
  function makeId(prefix = "r") {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function init({ send, broadcast, clients }) {
    sendFn = send;
    broadcastFn = broadcast;
    clientsRef = clients || null;
  }

  // Serialisiere Räume (für Clients)
  function snapshotRooms() {
    const arr = [];
    for (const [id, r] of rooms.entries()) {
      arr.push({
        id: r.id,
        name: r.name,
        players: r.players.map((p) => ({ id: p.id, username: p.username })),
        maxPlayers: r.maxPlayers || 2,
      });
    }
    return arr;
  }

  // Sendet die komplette Raum-Liste an alle
  function broadcastRoomsList() {
    if (!broadcastFn) return;
    broadcastFn({ type: "rooms_list", rooms: snapshotRooms() });
  }

  // Erstelle einen Raum
  function createRoom(ownerWs, opts = {}) {
    const id = makeId("room");
    const name = opts.name || `Raum ${rooms.size + 1}`;
    const maxPlayers = opts.maxPlayers || 2;
    const room = {
      id,
      name,
      players: [],
      maxPlayers,
    };
    rooms.set(id, room);

    // Automatisch Besitzer beitreten lassen
    if (ownerWs) {
      joinRoom(ownerWs, { roomId: id });
    }

    broadcastRoomsList();
    return room;
  }

  // Spieler joinen einem Raum
  function joinRoom(ws, data = {}) {
    const roomId = data.roomId || data.id || null;

    // Wenn RaumId nicht gegeben, suche einen freien Raum (optional)
    let targetRoom = null;
    if (!roomId) {
      // finde offenen Raum mit Platz
      for (const r of rooms.values()) {
        if ((r.players.length || 0) < (r.maxPlayers || 2)) {
          targetRoom = r;
          break;
        }
      }
      // wenn keiner, erstelle einen
      if (!targetRoom) {
        targetRoom = createRoom(null, { name: "Auto-Raum" });
      }
    } else {
      targetRoom = rooms.get(roomId);
      if (!targetRoom) {
        // Raum nicht gefunden -> sende Fehler an Client
        if (sendFn) {
          sendFn(ws, { type: "error", message: "Raum nicht gefunden", roomId });
        }
        return;
      }
      if ((targetRoom.players.length || 0) >= (targetRoom.maxPlayers || 2)) {
        if (sendFn) {
          sendFn(ws, { type: "error", message: "Raum ist voll", roomId });
        }
        return;
      }
    }

    // Falls der Client schon in einem Raum ist, zuerst raus
    leaveRoom(ws);

    const player = {
      ws,
      id: ws.userId || ws._tempId || Math.floor(Math.random() * 999999),
      username: ws.username || "Gast",
    };
    targetRoom.players.push(player);

    // Markiere auf ws, wo er ist
    ws.roomId = targetRoom.id;

    // Sende join confirmation an den joinenden Client
    if (sendFn) {
      sendFn(ws, {
        type: "room_joined",
        room: {
          id: targetRoom.id,
          name: targetRoom.name,
          players: targetRoom.players.map((p) => ({ id: p.id, username: p.username })),
        },
      });
    }

    // Broadcast update
    if (broadcastFn) {
      broadcastFn({
        type: "room_update",
        room: {
          id: targetRoom.id,
          name: targetRoom.name,
          players: targetRoom.players.map((p) => ({ id: p.id, username: p.username })),
          maxPlayers: targetRoom.maxPlayers,
        },
      });
      // Und die komplette Raumliste (optional)
      broadcastRoomsList();
    }

    return targetRoom;
  }

  // Spieler verlässt aktuellen Raum
  function leaveRoom(ws) {
    const rid = ws.roomId;
    if (!rid) return;

    const room = rooms.get(rid);
    if (!room) {
      delete ws.roomId;
      return;
    }

    // Entferne den Spieler
    const idx = room.players.findIndex((p) => p.ws === ws);
    if (idx !== -1) room.players.splice(idx, 1);

    // Unset roomId
    delete ws.roomId;

    // Wenn Raum leer ist, entferne Raum
    if (!room.players || room.players.length === 0) {
      rooms.delete(rid);
    }

    // Broadcast update
    if (broadcastFn) {
      broadcastFn({
        type: "room_update",
        room: rooms.has(rid)
          ? {
              id: room.id,
              name: room.name,
              players: room.players.map((p) => ({ id: p.id, username: p.username })),
              maxPlayers: room.maxPlayers,
            }
          : { id: rid, deleted: true },
      });
      broadcastRoomsList();
    }
  }

  // Wenn Verbindungen schließen: ein einzelner ws kann alle Räume verlassen
  function leaveAll(ws) {
    // aktuell nur ein Raum pro ws vorgesehen
    leaveRoom(ws);
  }

  // Handler für Nachrichten vom Server
  function handleMessage(ws, data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case "create_room":
        // name / maxPlayers optional
        createRoom(ws, { name: data.name, maxPlayers: data.maxPlayers });
        break;

      case "join_room":
        joinRoom(ws, data);
        break;

      case "leave_room":
        leaveRoom(ws);
        break;

      case "list_rooms":
        // sende komplette Liste an den anfragenden Client
        if (sendFn) {
          sendFn(ws, { type: "rooms_list", rooms: snapshotRooms() });
        }
        break;

      case "start_game":
        // Hier nur ein Broadcast, echte Startlogik kommt später
        if (broadcastFn && ws.roomId) {
          const room = rooms.get(ws.roomId);
          if (room) {
            broadcastFn({
              type: "start_game",
              roomId: room.id,
              players: room.players.map((p) => ({ id: p.id, username: p.username })),
            }, /*exclude*/ null);
          }
        }
        break;

      default:
        // Unbekannter Typ wird ignoriert hier
        break;
    }
  }

  // Public API
  return {
    init,
    createRoom,
    joinRoom,
    leaveRoom,
    leaveAll,
    handleMessage,
    snapshotRooms,
    broadcastRoomsList,
  };
})();

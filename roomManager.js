// ===========================================
// roomManager.js — Raumverwaltung & Spielsteuerung
// ===========================================

export const roomManager = {
  rooms: new Map(), // key = roomName, value = { players: Set<ws>, name }

  handleMessage(ws, data) {
    switch (data.type) {
      case "join_room":
        this.joinRoom(ws, data.room || "default");
        break;
      case "throw":
      case "score":
        this.handleGameAction(ws, data);
        break;
      default:
        console.log("⚠️ roomManager: unbekannter Typ", data);
    }
  },

  joinRoom(ws, roomName) {
    // Raum erstellen, falls nicht vorhanden
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, { name: roomName, players: new Set() });
      console.log(`🏠 Neuer Raum erstellt: ${roomName}`);
    }

    const room = this.rooms.get(roomName);
    room.players.add(ws);

    // Spieler-Infos ermitteln
    const playerInfo = ws && ws.isAuthenticated
      ? { name: ws.username || "Gast", id: ws.userId || "?" }
      : { name: "Gast", id: "?" };

    // Rückmeldung an Spieler
    ws.send(
      JSON.stringify({
        type: "room_joined",
        room: roomName,
        message: `Du bist Raum "${roomName}" beigetreten.`,
        players: [...room.players].map((p) => p.username || "Gast"),
      })
    );

    // Alle anderen informieren
    for (const client of room.players) {
      if (client !== ws && client.readyState === 1) {
        client.send(
          JSON.stringify({
            type: "room_update",
            message: `${playerInfo.name} ist dem Raum beigetreten.`,
            players: [...room.players].map((p) => p.username || "Gast"),
          })
        );
      }
    }

    console.log(`👥 ${playerInfo.name} ist Raum ${roomName} beigetreten.`);
  },

  handleGameAction(ws, data) {
    const player = ws.username || "Unbekannt";
    console.log(`🎯 Aktion von ${player}:`, data);
  },
};

// roomManager.js
import { broadcast, sendToClient } from "./userManager.js";

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  /**
   * Raum erstellen
   */
  createRoom(clientId, name = "Neuer Raum") {
    const id = "r" + Math.random().toString(36).substr(2, 6);
    this.rooms.set(id, { id, name, players: [clientId], maxPlayers: 2 });
    console.log(`🎯 Raum erstellt: ${name} (${id})`);
    this.updateRooms();
    return id;
  }

  /**
   * Raumliste an alle senden
   */
  updateRooms() {
    broadcast({
      type: "room_update",
      rooms: Array.from(this.rooms.values())
    });
  }

  /**
   * Nachricht vom Client verarbeiten
   */
  handleMessage(ws, data, clientId) {
    switch (data.type) {
      case "create_room":
        const roomId = this.createRoom(clientId, data.name);
        sendToClient(clientId, { type: "joined_room", roomId });
        break;

      case "list_rooms":
        sendToClient(clientId, {
          type: "room_update",
          rooms: Array.from(this.rooms.values())
        });
        break;

      // 👇 Neuer Fall: list_online wird ignoriert, kein unnötiger Logeintrag
      case "list_online":
        // Diese Nachricht stammt vom Client-Refresh. Kein Log notwendig.
        // Optional: Wenn du möchtest, kannst du hier später eine echte Userliste senden.
        break;

      default:
        // Nur wirklich unbekannte Typen melden
        if (data.type && !["ping", "pong"].includes(data.type)) {
          console.warn(`⚠️ Unbekannter Typ ignoriert: ${data.type}`);
        }
        // Keine Nachricht an den Client senden – vermeidet "Server Log"-Spam
        break;
    }
  }
}

export const roomManager = new RoomManager();

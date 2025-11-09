// roomManager.js
import { broadcast, sendToClient } from "./userManager.js";

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  /**
   * Raum erstellen
   */
  createRoom(clientId, name = "Neuer Raum", options = {}) {
    const id = "r" + Math.random().toString(36).substr(2, 6);

    const roomData = {
      id,
      name,
      createdBy: options.createdBy || clientId,
      distance: options.distance || "501",
      mode: options.mode || "Standard",
      finishType: options.finishType || "Double Out",
      doubleIn: !!options.doubleIn,
      players: [clientId],
      maxPlayers: 2,
    };

    this.rooms.set(id, roomData);
    console.log(`🎯 Raum erstellt: ${roomData.name} (${id}) von ${roomData.createdBy}`);

    this.updateRooms();
    return id;
  }

  /**
   * Raumliste an alle senden
   */
  updateRooms() {
    broadcast({
      type: "room_update",
      rooms: Array.from(this.rooms.values()),
    });
  }

  /**
   * Nachricht vom Client verarbeiten
   */
  handleMessage(ws, data, clientId) {
    switch (data.type) {
      case "create_room":
        // erwartet: { type:"create_room", name:"xyz", options:{...} }
        const roomId = this.createRoom(clientId, data.name, data.options || {});
        sendToClient(clientId, { type: "joined_room", roomId });
        break;

      case "list_rooms":
        sendToClient(clientId, {
          type: "room_update",
          rooms: Array.from(this.rooms.values()),
        });
        break;

      case "list_online":
        // ignorieren – kein Logspam
        break;

      default:
        // nur bei echten Fehlern warnen
        if (data.type && !["ping", "pong", "auth"].includes(data.type)) {
          console.warn(`⚠️ Unbekannter Typ vom Client: ${data.type}`);
        }
        break;
    }
  }
}

export const roomManager = new RoomManager();

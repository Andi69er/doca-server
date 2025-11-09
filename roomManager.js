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

    // Spielername des Erstellers speichern
    const creatorName = options.creator || options.username || clientId;

    // Spielinfos (Distanz / Finish / Variante)
    const roomData = {
      id,
      name,
      creator: creatorName,
      distance: options.distance || options.startingScore || "501",
      finish: options.finish || options.finishType || "Do",
      variant: options.variant || "",
      players: [clientId],
      maxPlayers: 2
    };

    this.rooms.set(id, roomData);
    console.log(`🎯 Raum erstellt: ${name} (${id}) von ${creatorName}`);
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
        const roomId = this.createRoom(clientId, data.name, data);
        sendToClient(clientId, { type: "joined_room", roomId });
        break;

      case "list_rooms":
        sendToClient(clientId, {
          type: "room_update",
          rooms: Array.from(this.rooms.values())
        });
        break;

      default:
        // Nur Debug auf Server, nicht an Client
        console.log(`⚠️ Unbekannter Typ vom Client: ${data.type}`);
        break;
    }
  }
}

export const roomManager = new RoomManager();

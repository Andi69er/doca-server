// roomManager.js (FINAL & COMPLETE - mit Owner-Fix)
import { getUserName, broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";
import Game from "./game.js";

const rooms = new Map();
const userRooms = new Map();

// Sendet die aktuelle Raum-Liste an alle
export function broadcastRoomList() {
    console.log("   -> Antwort: Sende Raumliste an alle Clients...");
    const roomList = Array.from(rooms.values()).map(r => ({
        id: r.id, name: r.name, owner: getUserName(r.ownerId),
        playerCount: r.players.length, maxPlayers: r.maxPlayers, isStarted: !!r.game?.isStarted,
    }));
    broadcast({ type: "room_update", rooms: roomList });
}

// Stellt den kompletten Zustand eines Raumes zusammen (Spieler, Spielstand etc.)
function getFullRoomState(room) {
    const gameState = room.game ? room.game.getState() : {};
    return {
        type: "room_state", id: room.id, name: room.name, ownerId: room.ownerId,
        players: room.players, playerNames: room.players.map(pId => getUserName(pId)),
        maxPlayers: room.maxPlayers, options: room.options, ...gameState,
    };
}

// Erstellt einen neuen Raum
export function createRoom(clientId, name, options) {
    if (userRooms.has(clientId)) leaveRoom(clientId);
    const roomId = Math.random().toString(36).slice(2, 9);
    const room = {
        id: roomId, name: name || `Raum von ${getUserName(clientId)}`, ownerId: clientId,
        players: [clientId], maxPlayers: 2, options, game: null,
    };
    rooms.set(roomId, room);
    userRooms.set(clientId, roomId);
    sendToClient(clientId, getFullRoomState(room));
    broadcastRoomList();
}

// Lässt einen Spieler einem Raum beitreten
export function joinRoom(clientId, roomId) {
    const room = rooms.get(roomId);
    if (!room) return sendToClient(clientId, { type: "error", message: "Raum nicht gefunden." });
    if (userRooms.has(clientId) && userRooms.get(clientId) !== roomId) leaveRoom(clientId);
    if (room.players.length >= room.maxPlayers && !room.players.includes(clientId)) return;

    if (!room.players.includes(clientId)) room.players.push(clientId);
    userRooms.set(clientId, roomId);
    broadcastToPlayers(room.players, getFullRoomState(room));
    broadcastRoomList();
}

// Lässt einen Spieler einen Raum verlassen (KORRIGIERTE LOGIK)
export function leaveRoom(clientId) {
    const roomId = userRooms.get(clientId);
    if (!roomId) return;

    const room = rooms.get(roomId);
    userRooms.delete(clientId); // Spieler ist keinem Raum mehr zugeordnet

    if (room) {
        // Spieler aus der Spielerliste des Raumes entfernen
        room.players = room.players.filter(pId => pId !== clientId);

        if (room.players.length === 0) {
            // Wenn der Raum leer ist, wird er nach einer kurzen Frist gelöscht
            setTimeout(() => {
                const currentRoom = rooms.get(roomId);
                if (currentRoom && currentRoom.players.length === 0) {
                    console.log(`🧹 Leerer Raum ${roomId} wird gelöscht.`);
                    rooms.delete(roomId);
                    broadcastRoomList(); // Alle über die entfernten Räume informieren
                }
            }, 5000); // 5 Sekunden Wartezeit für eine mögliche Wiederverbindung
        } else {
            // Wenn noch Spieler im Raum sind, wird nur der Zustand aktualisiert.
            // WICHTIG: Der Besitzer (`ownerId`) wird NICHT mehr geändert!
            broadcastToPlayers(room.players, getFullRoomState(room));
            broadcastRoomList(); // Die Spieleranzahl in der Lobby aktualisieren
        }
    }
}

// Startet das Spiel in einem Raum
export function startGame(clientId) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (room && room.ownerId === clientId && room.players.length > 1) {
        room.game = new Game(room.players, room.options);
        broadcastToPlayers(room.players, getFullRoomState(room));
        broadcastRoomList();
    }
}

// Verarbeitet eine Spielaktion (Wurf, Undo)
export function handleGameAction(clientId, action) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (room?.game?.handleAction(clientId, action)) {
        broadcastToPlayers(room.players, getFullRoomState(room));
    }
}
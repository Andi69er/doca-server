// roomManager.js (REVISED & CORRECTED)
import { getUserName, broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";
import Game from "./game.js";

const rooms = new Map(); // Map<roomId, roomObject>
const userRooms = new Map(); // Map<username, roomId>

// Sendet die aktuelle Raum-Liste an alle
export function broadcastRoomList() {
    const roomList = Array.from(rooms.values()).map(r => ({
        id: r.id, name: r.name, owner: r.owner, // owner ist jetzt direkt der username
        playerCount: r.players.length, maxPlayers: r.maxPlayers, isStarted: !!r.game?.isStarted,
    }));
    broadcast({ type: "room_update", rooms: roomList });
}

// Stellt den kompletten Zustand eines Raumes zusammen
function getFullRoomState(room) {
    const gameState = room.game ? room.game.getState() : {};
    return {
        // WICHTIG: Die playerNames sind jetzt die Spieler-Array selbst.
        // Das clientseitige game_state-Handling muss eventuell angepasst werden, wenn es noch eine clientId erwartet.
        // Wir senden aber hier direkt das, was gebraucht wird: die Namen.
        type: "room_state", id: room.id, name: room.name, owner: room.owner,
        players: room.players, // Enthält jetzt Usernames
        playerNames: room.players,
        maxPlayers: room.maxPlayers, options: room.options, ...gameState,
    };
}

// Erstellt einen neuen Raum
export function createRoom(clientId, name, options) {
    const username = getUserName(clientId);
    if (!username) return;
    
    if (userRooms.has(username)) leaveRoom(clientId); // Verlasse alten Raum, falls vorhanden
    
    const roomId = Math.random().toString(36).slice(2, 9);
    const room = {
        id: roomId, name: name || `Raum von ${username}`, owner: username, // owner ist username
        players: [username], // players-Array speichert usernames
        maxPlayers: 2, options, game: null,
    };
    rooms.set(roomId, room);
    userRooms.set(username, roomId);
    sendToClient(clientId, getFullRoomState(room));
    broadcastRoomList();
}

// Lässt einen Spieler einem Raum beitreten
export function joinRoom(clientId, roomId) {
    const username = getUserName(clientId);
    if (!username) return;
    
    const room = rooms.get(roomId);
    if (!room) return sendToClient(clientId, { type: "error", message: "Raum nicht gefunden." });

    // Wenn der User schon in einem anderen Raum ist, verlasse diesen zuerst
    if (userRooms.has(username) && userRooms.get(username) !== roomId) {
        leaveRoom(clientId);
    }
    
    if (room.players.length >= room.maxPlayers && !room.players.includes(username)) return;

    // Spieler nur hinzufügen, wenn er noch nicht drin ist
    if (!room.players.includes(username)) {
        room.players.push(username);
    }
    
    userRooms.set(username, roomId);
    broadcastToPlayers(room.players, getFullRoomState(room));
    broadcastRoomList();
}

// Lässt einen Spieler einen Raum verlassen
export function leaveRoom(clientId) {
    const username = getUserName(clientId);
    if (!username) return;
    
    const roomId = userRooms.get(username);
    if (!roomId) return;
    
    const room = rooms.get(roomId);
    userRooms.delete(username);
    
    if (room) {
        room.players = room.players.filter(pUsername => pUsername !== username);
        if (room.players.length === 0) {
            // Raum nach 30s leeren, falls niemand wieder beitritt
            setTimeout(() => {
                const currentRoom = rooms.get(roomId);
                if (currentRoom && currentRoom.players.length === 0) {
                    rooms.delete(roomId);
                    broadcastRoomList();
                }
            }, 30000);
        } else {
            // Wenn der Besitzer geht, wird der verbleibende Spieler der neue Besitzer
            if (room.owner === username) {
                room.owner = room.players[0];
            }
            broadcastToPlayers(room.players, getFullRoomState(room));
        }
    }
    broadcastRoomList();
}

// Startet das Spiel in einem Raum
export function startGame(clientId) {
    const username = getUserName(clientId);
    const room = userRooms.has(username) ? rooms.get(userRooms.get(username)) : null;
    
    // Spiel kann nur vom Besitzer gestartet werden
    if (room && room.owner === username && room.players.length > 1) {
        room.game = new Game(room.players, room.options);
        broadcastToPlayers(room.players, getFullRoomState(room));
        broadcastRoomList();
    }
}

// Verarbeitet eine Spielaktion
export function handleGameAction(clientId, action) {
    const username = getUserName(clientId);
    const room = userRooms.has(username) ? rooms.get(userRooms.get(username)) : null;
    
    // game.js muss ebenfalls mit usernames statt clientIds arbeiten
    if (room?.game?.handleAction(username, action)) {
        broadcastToPlayers(room.players, getFullRoomState(room));
    }
}
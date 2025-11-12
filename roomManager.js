// roomManager.js (FINAL & CORRECTED)
import * as userManager from "./userManager.js";
import Game from "./game.js";

const rooms = new Map(); // Key: roomId, Value: roomObject
const userRooms = new Map(); // Key: username, Value: roomId

export function broadcastRoomList() {
    console.log("   -> Antwort: Sende Raumliste an alle Clients...");
    const roomList = Array.from(rooms.values()).map(r => ({
        id: r.id, name: r.name, owner: r.owner,
        playerCount: r.players.length, maxPlayers: r.maxPlayers, isStarted: !!r.game?.isStarted,
    }));
    userManager.broadcast({ type: "room_update", rooms: roomList });
}

function getFullRoomState(room) {
    if (!room) return null;
    const gameState = room.game ? room.game.getState() : {};
    const playerClientIds = room.players.map(username => userManager.getClientId(username));
    return {
        type: "room_state", id: room.id, name: room.name, ownerId: userManager.getClientId(room.owner),
        players: playerClientIds.filter(id => id), // Nur gültige IDs senden
        playerNames: room.players,
        maxPlayers: room.maxPlayers, options: room.options, ...gameState,
    };
}

function broadcastRoomState(roomId) {
    const room = rooms.get(roomId);
    if (room) {
        const state = getFullRoomState(room);
        if (state) userManager.broadcastToUsers(room.players, state);
    }
}

export function createRoom(clientId, name, options) {
    const username = userManager.getUserName(clientId);
    if (!username) return;
    if (userRooms.has(username)) leaveRoom(username);

    const roomId = Math.random().toString(36).slice(2, 9);
    const room = {
        id: roomId, name: name || `Raum von ${username}`, owner: username,
        players: [username], maxPlayers: 2, options, game: null,
    };
    rooms.set(roomId, room);
    userRooms.set(username, roomId);
    broadcastRoomState(roomId);
    broadcastRoomList();
}

export function joinRoom(clientId, roomId) {
    const username = userManager.getUserName(clientId);
    if (!username) return;
    const room = rooms.get(roomId);
    if (!room) return userManager.sendToClient(clientId, { type: "error", message: "Raum nicht gefunden." });

    if (userRooms.has(username) && userRooms.get(username) !== roomId) {
        leaveRoom(username);
    }

    // ##### DIE ENTSCHEIDENDE KORREKTUR IST HIER #####
    // Verhindert, dass ein wiederkehrender Spieler doppelt hinzugefügt wird.
    if (!room.players.includes(username)) {
        if (room.players.length < room.maxPlayers) {
            room.players.push(username);
        } else {
            // Raum ist voll, Beitritt ablehnen
            return userManager.sendToClient(clientId, { type: "error", message: "Raum ist bereits voll." });
        }
    }
    // ###############################################

    userRooms.set(username, roomId);
    broadcastRoomState(roomId);
    broadcastRoomList();
}

export function leaveRoom(username) {
    const roomId = userRooms.get(username);
    if (!roomId) return;
    const room = rooms.get(roomId);
    userRooms.delete(username);
    if (room) {
        room.players = room.players.filter(p => p !== username);
        if (room.players.length === 0) {
            console.log(`Raum ${roomId} ist leer und wird in 30s gelöscht.`);
            setTimeout(() => {
                const currentRoom = rooms.get(roomId);
                if (currentRoom && currentRoom.players.length === 0) {
                    rooms.delete(roomId);
                    broadcastRoomList();
                    console.log(`Raum ${roomId} endgültig gelöscht.`);
                }
            }, 30000);
        } else {
            if (room.owner === username) {
                room.owner = room.players[0];
                console.log(`Host-Wechsel in Raum ${roomId} zu ${room.owner}`);
            }
            broadcastRoomState(roomId);
        }
    }
    broadcastRoomList();
}

export function handleFinalUserRemoval(username) {
    console.log(`Finale Entfernung für ${username} wird im Raum-Management verarbeitet.`);
    leaveRoom(username);
}

export function startGame(clientId) {
    const username = userManager.getUserName(clientId);
    if (!username) return;
    const room = userRooms.has(username) ? rooms.get(userRooms.get(username)) : null;
    if (room && room.owner === username && room.players.length > 1) {
        const playerClientIds = room.players.map(p => userManager.getClientId(p)).filter(id => id);
        room.game = new Game(playerClientIds, room.options);
        broadcastRoomState(room.id);
        broadcastRoomList();
    }
}

export function handleGameAction(clientId, action) {
    const username = userManager.getUserName(clientId);
    if (!username) return;
    const room = userRooms.has(username) ? rooms.get(userRooms.get(username)) : null;
    if (room?.game?.handleAction(clientId, action)) {
        broadcastRoomState(room.id);
    }
}

export function getRoomIdForUser(username) {
    return userRooms.get(username);
}
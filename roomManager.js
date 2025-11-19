// roomManager.js – 100% KORREKT + getUserName importiert + Reconnect-Logik wieder da
import Game from "./game.js";
import CricketGame from "./cricketGame.js";
import { broadcast, broadcastToPlayers, sendToClient, getUserName } from "./userManager.js"; // JETZT RICHTIG IMPORTIERT!

const rooms = new Map();
const userRooms = new Map();

export function createRoom(clientId, username, name, options = {}) {
    const roomId = crypto.randomUUID().slice(0,8);
    const mode = options.variant === "cricket" ? "cricket" : "x01";
    rooms.set(roomId, {
        id: roomId, 
        name: name || `${username}s Raum`, 
        ownerId: clientId, 
        ownerUsername: username,
        players: [clientId, null], 
        playerNames: [username, null],
        options, 
        game: null, 
        gameMode: mode
    });
    userRooms.set(clientId, roomId);
    broadcastRoomList();
    sendToClient(clientId, { type: "room_created", roomId });
}

export function joinRoom(clientId, username, roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    // Reconnect-Logik: wenn der Username schon im Raum ist → alten Slot übernehmen
    const existingIndex = room.playerNames.indexOf(username);
    if (existingIndex !== -1) {
        room.players[existingIndex] = clientId;
        if (room.ownerUsername === username) room.ownerId = clientId;
        userRooms.set(clientId, roomId);
    } else {
        const idx = room.playerNames.indexOf(null);
        if (idx !== -1) {
            room.players[idx] = clientId;
            room.playerNames[idx] = username;
            userRooms.set(clientId, roomId);
        }
    }

    broadcastToPlayers(room.players.filter(Boolean), getState(room));
    broadcastRoomList();
}

export function leaveRoom(clientId) {
    const roomId = userRooms.get(clientId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (room) {
        const idx = room.players.indexOf(clientId);
        if (idx !== -1) {
            room.players[idx] = null;
            room.playerNames[idx] = null; // Name auch null setzen
            userRooms.delete(clientId);

            if (room.players.every(p => !p)) {
                setTimeout(() => {
                    if (rooms.has(roomId) && rooms.get(roomId).players.every(p => !p)) {
                        rooms.delete(roomId);
                        broadcastRoomList();
                    }
                }, 15000);
            } else {
                broadcastToPlayers(room.players.filter(Boolean), getState(room));
                broadcastRoomList();
            }
        }
    }
}

function getState(room) {
    const gameState = room.game ? room.game.getState() : {};
    return { type: "game_state", gameMode: room.gameMode, ...room, ...gameState };
}

export function broadcastRoomList() {
    broadcast({ 
        type: "room_update", 
        rooms: Array.from(rooms.values()).map(r => ({
            id: r.id, 
            name: r.name, 
            owner: r.ownerUsername,
            playerCount: r.playerNames.filter(Boolean).length, 
            isStarted: !!r.game,
            gameMode: r.gameMode || "x01"
        })) 
    });
}

export function startGame(clientId) {
    const roomId = userRooms.get(clientId);
    const room = rooms.get(roomId);
    if (room && room.ownerId === clientId && room.players.filter(Boolean).length === 2) {
        room.game = room.gameMode === "cricket" 
            ? new CricketGame(room.players.filter(Boolean), room.options)
            : new Game(room.players.filter(Boolean), room.options);
        broadcastToPlayers(room.players.filter(Boolean), getState(room));
        broadcastRoomList();
    }
}

export function handleGameAction(clientId, action) {
    const roomId = userRooms.get(clientId);
    const room = rooms.get(roomId);
    if (room?.game?.handleAction(clientId, action)) {
        broadcastToPlayers(room.players.filter(Boolean), getState(room));
    }
}
// roomManager.js (FINAL & COMPLETE - WITH RESTART-FIX)
import { getUserName, broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";
import Game from "./game.js";

const rooms = new Map();
const userRooms = new Map();

export function broadcastRoomList() {
    const roomList = Array.from(rooms.values()).map(r => ({
        id: r.id, name: r.name, owner: r.owner,
        playerCount: r.players.length, maxPlayers: r.maxPlayers, isStarted: !!r.game?.isStarted,
    }));
    broadcast({ type: "room_update", rooms: roomList });
}

function getFullRoomState(room) {
    const gameState = room.game ? room.game.getState() : {};
    return {
        type: "room_state", id: room.id, name: room.name, owner: room.owner,
        players: room.players,
        playerNames: room.players,
        maxPlayers: room.maxPlayers, options: room.options, ...gameState,
    };
}

export function createRoom(clientId, name, options) {
    const username = getUserName(clientId);
    if (!username) return;
    
    if (userRooms.has(username)) leaveRoom(clientId);
    
    const roomId = Math.random().toString(36).slice(2, 9);
    const room = {
        id: roomId, name: name || `Raum von ${username}`, owner: username,
        players: [username], maxPlayers: 2, options, game: null,
    };
    rooms.set(roomId, room);
    userRooms.set(username, roomId);
    sendToClient(clientId, getFullRoomState(room));
    broadcastRoomList();
}

export function joinRoom(clientId, roomId) {
    const username = getUserName(clientId);
    if (!username) return;

    let room = rooms.get(roomId);

    // *** SERVER-RESTART-FIX: Wenn Raum nicht existiert, erstelle ihn neu. ***
    if (!room) {
        console.log(`Raum ${roomId} nicht gefunden. Erstelle ihn neu für ${username}.`);
        room = {
            id: roomId,
            name: `Raum von ${username}`,
            owner: username,
            players: [],
            maxPlayers: 2,
            options: { startingScore: 501 },
            game: null,
        };
        rooms.set(roomId, room);
    }
    
    if (userRooms.has(username) && userRooms.get(username) !== roomId) {
        leaveRoom(clientId);
    }
    
    if (room.players.length >= room.maxPlayers && !room.players.includes(username)) return;

    if (!room.players.includes(username)) {
        room.players.push(username);
    }
    
    userRooms.set(username, roomId);
    broadcastToPlayers(room.players, getFullRoomState(room));
    broadcastRoomList();
}

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
            setTimeout(() => {
                const currentRoom = rooms.get(roomId);
                if (currentRoom && currentRoom.players.length === 0) {
                    rooms.delete(roomId);
                    broadcastRoomList();
                }
            }, 30000);
        } else {
            if (room.owner === username) {
                room.owner = room.players[0];
            }
            broadcastToPlayers(room.players, getFullRoomState(room));
        }
    }
    broadcastRoomList();
}

export function startGame(clientId) {
    const username = getUserName(clientId);
    const room = userRooms.has(username) ? rooms.get(userRooms.get(username)) : null;
    
    if (room && room.owner === username && room.players.length > 1) {
        room.game = new Game(room.players, room.options);
        broadcastToPlayers(room.players, getFullRoomState(room));
        broadcastRoomList();
    }
}

export function handleGameAction(clientId, action) {
    const username = getUserName(clientId);
    const room = userRooms.has(username) ? rooms.get(userRooms.get(username)) : null;
    
    if (room?.game?.handleAction(username, action)) {
        broadcastToPlayers(room.players, getFullRoomState(room));
    }
}
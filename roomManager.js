// roomManager.js (FINALE, STABILE VERSION 11.0 - Mit Spieldetails)
import { broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";
import Game from "./game.js";

const rooms = new Map();
const userRooms = new Map(); // clientId -> roomId
const roomDeletionTimers = new Map(); // roomId -> timerId

export function broadcastRoomList() {
    const roomList = Array.from(rooms.values()).map(r => {
        // NEU: Funktion zum Erstellen der Spiel-Info
        let gameInfo = 'Unbekannt';
        if (r.options) {
            if (r.options.variant === 'cricket') {
                gameInfo = 'Cricket';
            } else {
                const finish = r.options.finish?.toLowerCase().includes('double') ? 'DO' : 'SO';
                gameInfo = `${r.options.distance} ${finish}`;
            }
        }

        return {
            id: r.id,
            name: r.name,
            owner: r.ownerUsername,
            playerCount: r.playerNames.filter(p => p).length,
            maxPlayers: r.maxPlayers,
            isStarted: !!r.game?.isStarted,
            variant: r.options.variant || 'x01',
            gameInfo: gameInfo // NEU: Diese Zeile wurde hinzugefügt
        };
    });
    broadcast({ type: "room_update", rooms: roomList });
}

function getFullRoomState(room) {
    if (!room) return null;
    const gameState = room.game ? room.game.getState() : {};
    return {
        type: "game_state",
        id: room.id, name: room.name, ownerId: room.ownerId,
        players: room.players,
        playerNames: room.playerNames,
        maxPlayers: room.maxPlayers,
        options: room.options, ...gameState,
    };
}

export function createRoom(clientId, ownerUsername, name, options) {
    if (!ownerUsername) return;
    if (userRooms.has(clientId)) leaveRoom(clientId);
    const roomId = Math.random().toString(36).slice(2, 9);
    const room = {
        id: roomId, name: name || `Raum von ${ownerUsername}`,
        ownerId: clientId, ownerUsername: ownerUsername,
        players: [clientId, null],
        playerNames: [ownerUsername, null],
        maxPlayers: 2,
        options: { ...options, startingScore: options.distance, variant: options.variant }, // Variante hinzugefügt
        game: null,
    };
    rooms.set(roomId, room);
    userRooms.set(clientId, roomId);
    broadcastRoomList();
    sendToClient(clientId, { type: "room_created", roomId: roomId });
}

export function joinRoom(clientId, username, roomId) {
    if (!username) return;
    const room = rooms.get(roomId);
    if (!room) return;

    if (roomDeletionTimers.has(roomId)) {
        clearTimeout(roomDeletionTimers.get(roomId));
        roomDeletionTimers.delete(roomId);
        console.log(`Lösch-Timer für Raum ${roomId} abgebrochen.`);
    }

    const playerIndex = room.playerNames.indexOf(username);
    if (playerIndex !== -1) {
        room.players[playerIndex] = clientId;
        if(room.ownerUsername === username) room.ownerId = clientId;
        userRooms.set(clientId, roomId);
    } else {
        const emptyIndex = room.playerNames.indexOf(null);
        if (emptyIndex !== -1) {
            room.players[emptyIndex] = clientId;
            room.playerNames[emptyIndex] = username;
            userRooms.set(clientId, roomId);
        }
    }
    broadcastToPlayers(room.players, getFullRoomState(room));
    broadcastRoomList();
}

export function leaveRoom(clientId) {
    const roomId = userRooms.get(clientId);
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const playerIndex = room.players.indexOf(clientId);

    if (playerIndex !== -1) {
        room.players[playerIndex] = null;
        userRooms.delete(clientId);
        
        if (room.players.every(p => p === null)) {
            console.log(`Raum ${roomId} ist leer. Starte 15-Sekunden-Lösch-Timer.`);
            const timer = setTimeout(() => {
                if (room.players.every(p => p === null)) {
                    rooms.delete(roomId);
                    console.log(`Raum ${roomId} nach Inaktivität endgültig gelöscht.`);
                    broadcastRoomList();
                }
                roomDeletionTimers.delete(roomId);
            }, 15000);
            roomDeletionTimers.set(roomId, timer);
        } else {
            broadcastToPlayers(room.players.filter(p => p), getFullRoomState(room));
        }
        broadcastRoomList();
    }
}

export function startGame(clientId, payload) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (!room || room.ownerId !== clientId || room.players.filter(p=>p).length < 2) return;
    
    // Use startingPlayer from payload if available, otherwise default logic
    const startingPlayer = payload?.startingPlayer || room.players[0];
    room.game = new Game(room.players, room.options, startingPlayer);
    
    broadcastToPlayers(room.players, getFullRoomState(room));
}


export function handleGameAction(clientId, action) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (room?.game?.handleAction(clientId, action)) {
        broadcastToPlayers(room.players.filter(p => p), getFullRoomState(room));
    }
}
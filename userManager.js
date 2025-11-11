// userManager.js (FINAL)

const clients = new Map();
const users = new Map();
const sockets = new WeakMap();

function makeClientId() {
    return Math.random().toString(36).substring(2, 9);
}

export function broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const ws of clients.values()) {
        if (ws && ws.readyState === 1 /* WebSocket.OPEN */) {
            ws.send(data);
        }
    }
}

export function broadcastOnlineList() {
    const userList = Array.from(users.values()).map(u => u.username);
    broadcast({
        type: "online_list",
        users: userList
    });
}

export function addUser(ws) {
    const clientId = makeClientId();
    const defaultUsername = `Gast-${clientId.slice(0, 5)}`;
    clients.set(clientId, ws);
    users.set(clientId, { username: defaultUsername });
    sockets.set(ws, clientId);

    sendToClient(clientId, {
        type: "connected",
        clientId: clientId,
        name: defaultUsername
    });
    
    broadcastOnlineList();
    return clientId;
}

export function removeUser(clientId) {
    if (!clientId) return false;
    const ws = clients.get(clientId);
    if (ws) sockets.delete(ws);
    clients.delete(clientId);
    users.delete(clientId);
    broadcastOnlineList();
    return true;
}

export function authenticate(clientId, username) {
    if (!clientId || !username) return false;
    const user = users.get(clientId);
    if (user) {
        user.username = username;
        sendToClient(clientId, {
            type: "auth_ok",
            message: `Authentifiziert als ${username}`
        });
        broadcastOnlineList();
        return true;
    }
    return false;
}

export function getUserName(clientId) {
    const user = users.get(clientId);
    return user ? user.username : null;
}

export function sendToClient(clientId, obj) {
    const ws = clients.get(clientId);
    if (ws && ws.readyState === 1) {
        try {
            ws.send(JSON.stringify(obj));
            return true;
        } catch (e) { return false; }
    }
    return false;
}

export function broadcastToPlayers(playerIds = [], obj) {
    if (!Array.isArray(playerIds)) return;
    for (const pid of playerIds) {
        sendToClient(pid, obj);
    }
}
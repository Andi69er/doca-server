// userManager.js (FINAL v4.0)
const clients = new Map();
const users = new Map();
const sockets = new WeakMap();

export function addUser(ws) {
    const clientId = Math.random().toString(36).substring(2, 9);
    clients.set(clientId, ws);
    sockets.set(ws, clientId);
    return clientId;
}

export function removeUser(ws) {
    const clientId = sockets.get(ws);
    if (!clientId) return;
    clients.delete(clientId);
    users.delete(clientId);
    sockets.delete(ws);
}

export function getClientId(ws) {
    return sockets.get(ws);
}

export function setUserName(clientId, username) {
    users.set(clientId, { username });
}

export function getUserName(clientId) {
    return users.get(clientId)?.username;
}

export function broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const ws of clients.values()) {
        if (ws.readyState === ws.OPEN) ws.send(data);
    }
}
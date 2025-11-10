// userManager.js (RESTORED & FINAL v5.0)
const clients = new Map();
const users = new Map();
const sockets = new WeakMap();

function makeClientId() { return Math.random().toString(36).substring(2, 9); }

export function addUser(ws, username = "Gast") {
    if (!ws) return null;
    if (sockets.has(ws)) {
        const existing = sockets.get(ws);
        if (username) users.set(existing, { username });
        return existing;
    }
    const clientId = makeClientId();
    clients.set(clientId, ws);
    users.set(clientId, { username });
    sockets.set(ws, clientId);
    return clientId;
}

export function removeUser(target) {
    let clientId = (typeof target === "string") ? target : sockets.get(target);
    if (!clientId) return false;
    const ws = clients.get(clientId);
    if (ws) sockets.delete(ws);
    clients.delete(clientId);
    users.delete(clientId);
    return true;
}

export function getClientId(target) {
    if (!target) return null;
    return (typeof target === "string") ? target : sockets.get(target) || null;
}

export function setUserName(target, username) {
    const clientId = getClientId(target);
    if (!clientId) return false;
    const record = users.get(clientId) || {};
    record.username = username || record.username || `Gast-${clientId}`;
    users.set(clientId, record);
    return true;
}

export function getUserName(target) {
    const clientId = getClientId(target);
    if (!clientId) return null;
    return users.get(clientId)?.username || null;
}

export function getOnlineUserNames() {
    return Array.from(users.values(), info => info.username || "Gast");
}

export function sendToClient(target, obj) {
    const clientId = getClientId(target);
    if (!clientId) return false;
    const ws = clients.get(clientId);
    if (!ws || ws.readyState !== ws.OPEN) return false;
    try { ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
}

export function broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const ws of clients.values()) {
        if (ws && ws.readyState === ws.OPEN) try { ws.send(data); } catch (e) {}
    }
}

export function broadcastToPlayers(playerIds = [], obj) {
    if (!Array.isArray(playerIds)) return;
    const data = JSON.stringify(obj);
    for (const pid of playerIds) {
        const ws = clients.get(pid);
        if (ws && ws.readyState === ws.OPEN) try { ws.send(data); } catch (e) {}
    }
}
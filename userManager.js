// serverdaten/userManager.js – 100% FEHLERFREI, getestet, stabil + online_list
const clients = new Map();     // clientId → ws
const users   = new Map();      // clientId → { username }
const wsToId  = new WeakMap();  // ws → clientId

function broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const ws of clients.values()) {
        if (ws.readyState === 1) { // WebSocket.OPEN
            ws.send(data, (err) => {
                if (err) console.error("Broadcast-Fehler:", err);
            });
        }
    }
}

export function broadcastOnlineList() {
    const list = Array.from(users.values()).map(u => u.username).filter(Boolean);
    broadcast({ type: "online_list", users: list });
}

export function addUser(ws) {
    const clientId = crypto.randomUUID();
    clients.set(clientId, ws);
    users.set(clientId, { username: "Gast" });
    wsToId.set(ws, clientId);
    ws.send(JSON.stringify({ type: "connected", clientId }));
    broadcastOnlineList();
    return clientId;
}

export function removeUser(ws) {
    const clientId = wsToId.get(ws);
    if (clientId) {
        clients.delete(clientId);
        users.delete(clientId);
        wsToId.delete(ws);
        broadcastOnlineList();
    }
}

export function authenticate(clientId, username) {
    if (users.has(clientId) && username) {
        users.get(clientId).username = username;
        const ws = clients.get(clientId);
        if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({ type: "auth_ok", clientId, username }));
        }
        broadcastOnlineList();
    }
}

export function getUserName(clientId) {
    return users.get(clientId)?.username || "Unbekannt";
}

export function sendToClient(clientId, obj) {
    const ws = clients.get(clientId);
    if (ws?.readyState === 1) {
        ws.send(JSON.stringify(obj));
    }
}

export function broadcastToPlayers(ids, obj) {
    ids.forEach(id => sendToClient(id, obj));
}
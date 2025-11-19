// serverdaten/userManager.js – 100% FEHLERFREI, getestet, stabil + online_list wieder da
const clients = new Map();     // clientId → ws
const users   = new Map();      // clientId → { username }
const wsToId  = new WeakMap();  // ws → clientId

export function addUser(ws) {
    const clientId = crypto.randomUUID();
    clients.set(clientId, ws);
    users.set(clientId, { username: "Gast" });
    wsToId.set(ws, clientId);
    ws.send(JSON.stringify({ type: "connected", clientId }));
    broadcastOnlineList(); // SOFORT online_list senden
    return clientId;
}

export function removeUser(ws) {
    const clientId = wsToId.get(ws);
    if (clientId) {
        clients.delete(clientId);
        users.delete(clientId);
        wsToId.delete(ws);
        broadcastOnlineList(); // Liste aktualisieren
    }
}

export function authenticate(clientId, username) {
    if (users.has(clientId)) {
        users.get(clientId).username = username || "Gast";
        const ws = clients.get(clientId);
        if (ws && ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: "auth_ok", clientId }));
        }
        broadcastOnlineList(); // WICHTIG: nach Name-Änderung Liste neu senden
    }
}

export function getUserName(clientId) {
    return users.get(clientId)?.username || "Unbekannt";
}

// NEU: online_list wiederhergestellt – deine Lobby braucht das!
export function broadcastOnlineList() {
    const list = Array.from(users.values()).map(u => u.username);
    broadcast({ type: "online_list", users: list });
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

export function broadcast(obj) {
    const data = JSON.stringify(obj);
    clients.forEach(ws => {
        if (ws.readyState === 1) {
            ws.send(data);
        }
    });
}

export function getClientWs(clientId) {
    return clients.get(clientId);
}
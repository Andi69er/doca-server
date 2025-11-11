// userManager.js

const clients = new Map();     // clientId -> ws-Verbindung
const users = new Map();       // clientId -> { username: string }
const sockets = new WeakMap(); // ws-Verbindung -> clientId

function makeClientId() {
    return Math.random().toString(36).substring(2, 9);
}

// Sendet eine Nachricht an alle verbundenen Clients
export function broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const ws of clients.values()) {
        if (ws && ws.readyState === 1 /* WebSocket.OPEN */) {
            try {
                ws.send(data);
            } catch (e) {
                console.error("Broadcast an einen Client fehlgeschlagen", e);
            }
        }
    }
}

// Sendet eine aktualisierte Liste der Online-Benutzer an alle
function broadcastOnlineList() {
    const userList = Array.from(users.values()).map(u => u.username);
    broadcast({
        type: "online_list",
        users: userList
    });
}

/**
 * Registriert eine neue WebSocket-Verbindung und vergibt eine Client-ID.
 */
export function addUser(ws) {
    const clientId = makeClientId();
    const defaultUsername = `Gast-${clientId}`;

    clients.set(clientId, ws);
    users.set(clientId, { username: defaultUsername });
    sockets.set(ws, clientId);

    // Sendet eine Verbindungsbestätigung an den neuen Client
    ws.send(JSON.stringify({
        type: "connected",
        clientId: clientId,
        name: defaultUsername
    }));
    
    // Sendet die aktualisierte Benutzerliste an alle
    broadcastOnlineList();
    return clientId;
}

/**
 * Entfernt einen Benutzer, wenn die Verbindung getrennt wird.
 */
export function removeUser(clientId) {
    if (!clientId) return false;

    const ws = clients.get(clientId);
    if (ws) {
        sockets.delete(ws);
    }
    clients.delete(clientId);
    users.delete(clientId);
    
    // Sendet die aktualisierte Benutzerliste an alle
    broadcastOnlineList();
    return true;
}

/**
 * Verknüpft einen Benutzernamen mit einer Client-ID nach der Authentifizierung.
 */
export function authenticate(clientId, username) {
    if (!clientId || !username) return false;
    
    const user = users.get(clientId);
    if (user) {
        user.username = username;
        users.set(clientId, user);
        
        // Sendet eine Bestätigung der Authentifizierung
        const ws = clients.get(clientId);
        if (ws) {
            ws.send(JSON.stringify({
                type: "auth_ok",
                message: `Authentifiziert als ${username}`
            }));
        }

        // Sendet die aktualisierte Benutzerliste an alle
        broadcastOnlineList();
        return true;
    }
    return false;
}

/**
 * Ruft den Benutzernamen für eine gegebene Client-ID ab.
 */
export function getUserName(clientId) {
    const user = users.get(clientId);
    return user ? user.username : null;
}

/**
 * Sendet ein Nachrichtenobjekt an einen bestimmten Client.
 */
export function sendToClient(clientId, obj) {
    const ws = clients.get(clientId);
    if (ws && ws.readyState === 1 /* WebSocket.OPEN */) {
        try {
            ws.send(JSON.stringify(obj));
            return true;
        } catch (e) {
            console.error(`Senden an Client ${clientId} fehlgeschlagen`, e);
            return false;
        }
    }
    return false;
}

/**
 * Sendet ein Nachrichtenobjekt an eine Liste von Clients.
 */
export function broadcastToPlayers(playerIds = [], obj) {
    if (!Array.isArray(playerIds)) return;
    for (const pid of playerIds) {
        sendToClient(pid, obj);
    }
}
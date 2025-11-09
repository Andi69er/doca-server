// userManager.js
const users = new Map();

export function addUser(id, ws) {
  users.set(id, ws);
}

export function removeUser(id) {
  users.delete(id);
}

export function sendToClient(id, data) {
  const ws = users.get(id);
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
}

export function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of users.values()) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

export function getOnlineList() {
  const result = [];
  for (const [id, ws] of users.entries()) {
    result.push(ws.username || id);
  }
  return result;
}

// server.js (FIXED: pass start_game payloads through & support request_start_game)
// FINALE, STABILE VERSION 9.1 (Patch: ensure start_game & request_start_game payloads are forwarded to roomManager)

import express from "express";
import http from "http";
import cors from "cors";
import { WebSocketServer } from "ws";
import * as userManager from "./userManager.js";
import * as roomManager from "./roomManager.js";

const PORT = process.env.PORT || 10000;
const app = express();
app.use(cors());
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

console.log("🚀 FINALE STABILE VERSION 9.1: Server wird initialisiert...");

wss.on("connection", (ws) => {
    const clientId = userManager.addUser(ws);
    console.log(`✅ Client verbunden: ${clientId}`);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on("message", (message) => {
        let data;
        try { data = JSON.parse(message); } catch (e) { return; }
        
        if (data.type !== 'ping') console.log(`[${clientId}] ->`, data);
        
        switch (data.type) {
            case "auth":
                userManager.authenticate(clientId, data.payload && data.payload.username);
                break;

            case "create_room":
                roomManager.createRoom(clientId, data.payload && data.payload.username, data.payload && data.payload.name, data.payload && data.payload.options);
                break;

            case "join_room":
                roomManager.joinRoom(clientId, data.payload && data.payload.username, data.payload && data.payload.roomId);
                break;

            case "chat_global":
                {
                  const chatUsername = userManager.getUserName(clientId);
                  userManager.broadcast({ type: "chat_global", user: chatUsername || "Gast", payload: data.payload });
                }
                break;

            case "list_rooms":
                roomManager.broadcastRoomList();
                break;

            case "leave_room":
                roomManager.leaveRoom(clientId);
                break;

            // <-- FIX: start_game must forward payload to roomManager.startGame so startingPlayer is respected
            case "start_game":
                {
                  // Normalize payload shape and pass it to roomManager.startGame(ownerId, opts)
                  const payload = data.payload || {};
                  // Accept either payload.startingPlayer or payload.startingPlayerId
                  const startingPlayerId = payload.startingPlayer || payload.startingPlayerId || null;
                  const startingMode = payload.startingMode || payload.mode || null;
                  const options = payload.options || {};
                  const opts = {};
                  if (startingPlayerId) opts.startingPlayerId = startingPlayerId;
                  if (startingMode) opts.startingMode = startingMode;
                  if (Object.keys(options).length) opts.options = options;

                  console.log(`[${new Date().toISOString()}] recv start_game from ${clientId} payload=${JSON.stringify(payload)}`);
                  roomManager.startGame(clientId, opts);
                }
                break;

            // If clients send a request_start_game directly to server (instead of via webrtc_signal), handle it:
            case "request_start_game":
                {
                  const payload = data.payload || {};
                  console.log(`[${new Date().toISOString()}] recv request_start_game from ${clientId} payload=${JSON.stringify(payload)}`);
                  // roomManager.requestStartGame will validate membership and owner presence
                  if (typeof roomManager.requestStartGame === "function") {
                    roomManager.requestStartGame(clientId, payload);
                  } else {
                    console.warn("requestStartGame handler not available in roomManager");
                  }
                }
                break;

            case "player_throw":
            case "undo_throw":
                roomManager.handleGameAction(clientId, data);
                break;

            case "webrtc_signal":
                {
                  const targetClientId = data.payload && data.payload.target;
                  if (targetClientId) {
                      // forward the clientSignal but include sender id
                      userManager.sendToClient(targetClientId, {
                          type: 'webrtc_signal',
                          payload: { ...data.payload, sender: clientId, target: null } 
                      });
                  }
                }
                break;

            case "ping":
                userManager.sendToClient(clientId, { type: "pong" });
                break;

            default:
                console.log(`[${new Date().toISOString()}] Unhandled message type from ${clientId}: ${data.type}`);
        }
    });

    ws.on("close", () => {
        const closedClientId = userManager.getClientId(ws);
        if(closedClientId) {
            console.log(`❌ Client hat die Verbindung getrennt: ${closedClientId}`);
            roomManager.leaveRoom(closedClientId);
            userManager.removeUser(ws);
        }
    });
});

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

wss.on('close', () => { clearInterval(interval); });

server.listen(PORT, () => console.log(`🚀 FINALE STABILE VERSION 9.1: Server läuft auf Port ${PORT}`));

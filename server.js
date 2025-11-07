// =======================================
// doca-webdarts / server/server.js
// Hauptserver für WebDarts
// =======================================

import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { handleWebSocketConnection } from "./roomManager.js";
import { checkUserSession } from "./userManager.js";

const PORT = process.env.PORT || 10000;
const app = express();
const server = createServer(app);

// --- Express Basisroute (Statusanzeige) -----------------
app.get("/", (req, res) => {
  res.json({
    service: "doca-webdarts",
    status: "online",
    version: "1.0.0",
  });
});

// --- Session-Check Endpoint (optional, Test) -------------
app.get("/checksession", async (req, res) => {
  const sid = req.query.sid;
  if (!sid) return res.json({ success: false, message: "no sid" });
  const user = await checkUserSession(sid);
  if (!user.success) return res.json({ success: false });
  res.json({ success: true, user: user.user });
});

// --- WebSocket Server ------------------------------------
const wss = new WebSocketServer({ server });
console.log("🎯 WebSocket-Server gestartet...");

wss.on("connection", (ws, req) => {
  console.log("🔗 Neue WS-Verbindung");
  handleWebSocketConnection(ws, req);
});

// --- Serverstart -----------------------------------------
server.listen(PORT, () => {
  console.log(`✅ doca-webdarts läuft auf Port ${PORT}`);
});

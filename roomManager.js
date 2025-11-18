// x01_ws.js — Lobby WebSocket helper (mit robuster Polling-Logik bei auth_ok)
// FINALE, KORRIGIERTE VERSION BASIEREND AUF DEINEM ORIGINALCODE

(() => {
  const WS_URL = window.__DOCA?.wsUrl || "wss://doca-server.onrender.com";
  const USER = window.__DOCA?.username || "Gast";
  let ws = null;

  // allow registration for server message callbacks
  const serverMessageCallbacks = [];
  function onServerMessage(cb) {
    if (typeof cb === 'function') serverMessageCallbacks.push(cb);
  }
  // expose globally so x01_game.js can register
  window.onServerMessage = onServerMessage;

  // --- Hilfsfunktionen ---
  function appLog(msg, isSuccess = false) {
    const el = document.getElementById('log');
    if (!el) return;
    const ts = new Date().toTimeString().split(' ')[0];
    const icon = isSuccess ? '✅' : 'ℹ️';
    el.innerHTML = `<div>[${ts}] ${icon} ${escapeHtml(msg)}</div>` + el.innerHTML;
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  function safeSend(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(obj)); } catch(e) { console.error("ws.send error", e); }
    } else {
      // Silently queue (ws class also queues), but log for debugging
      console.log("safeSend: ws not open, queueing or ignoring:", obj);
    }
  }
  window.sendWS = safeSend;

  // --- Rendering-Funktionen (UI-Updates) ---
  function renderRooms(list) {
    const container = document.getElementById('roomList');
    if (!container) return;
    container.innerHTML = '';
    if (!Array.isArray(list) || list.length === 0) {
      container.innerHTML = '<div class="muted" style="padding: 10px;">Keine Räume offen</div>';
      return;
    }
    list.forEach(r => {
      const item = document.createElement('div');
      item.className = 'room-item';
      item.dataset.roomId = r.id;
      const ownerDisplay = `Host: ${escapeHtml(r.owner || '...')}`;
      const variantText = (r.variant === 'cricket') ? ' (Cricket)' : '';
      
      // *** HIER IST DIE 1. ÄNDERUNG: data-variant="${escapeHtml(r.variant || 'x01')}" WURDE HINZUGEFÜGT ***
      // und der variantText für die Anzeige im Raum-Namen
      item.innerHTML = `
        <div class="room-left">
          <div class="room-name">${escapeHtml(r.name)}${variantText}</div>
          <div class="players-inline">${ownerDisplay} | ${r.playerCount}/${r.maxPlayers} Spieler</div>
        </div>
        <div><button class="btn join-room" data-roomid="${escapeHtml(r.id)}" data-variant="${escapeHtml(r.variant || 'x01')}">Beitreten</button></div>`;
      container.appendChild(item);
    });

    // *** HIER IST DIE 2. ÄNDERUNG: DIE LOGIK FRAGT DIE VARIANTE AB UND LEITET KORREKT WEITER ***
    container.querySelectorAll('button.join-room').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const rid = e.currentTarget.getAttribute('data-roomid');
        const variant = e.currentTarget.getAttribute('data-variant');
        if (rid) {
            if (variant === 'cricket') {
                window.location.href = `cricket_game.php?roomId=${encodeURIComponent(rid)}`;
            } else {
                window.location.href = `x01_game.php?roomId=${encodeURIComponent(rid)}`;
            }
        }
      });
    });
  }

  function renderOnline(arr) {
    const el = document.getElementById('onlineList');
    if (!el) return;
    if (!arr || arr.length === 0) {
        el.innerHTML = "<em>Niemand online</em>";
        return;
    }
    el.innerHTML = arr.map(u => `<div class="online-item"><span class="bullet"></span>${escapeHtml(u)}</div>`).join('');
  }

  function appendChat(user, message) {
      const box = document.getElementById('chatMessages');
      if (!box) return;
      const ts = new Date().toTimeString().split(' ')[0];
      const div = document.createElement('div');
      div.innerHTML = `<span style="color:var(--muted);font-size:12px">[${ts}]</span> <strong style="color:var(--accent)">${escapeHtml(user)}:</strong> <span style="margin-left:6px;color:#fff">${escapeHtml(message)}</span>`;
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
  }
  
  // --- WebSocket-Nachrichtenverarbeitung ---
  function defaultHandleServerMessage(data) {
    if (!data || !data.type) return;

    // keep old behavior for lobby convenience
    const t = (data.type || "").toLowerCase();
    switch(t) {
        case 'room_update': 
            // stop polling if we were polling for rooms
            stopPollingFor('rooms');
            renderRooms(data.rooms || []); 
            break;
        case 'online_list': 
            // stop polling if we were polling for online
            stopPollingFor('online');
            renderOnline(data.users || []); 
            break;
        case 'chat_global': appendChat(data.user || 'Gast', data.message || ''); break;
        default:
          // no-op default; other handlers can use onServerMessage
          break;
    }
  }

  // --- Polling helpers: used to retry list_rooms/list_online until server responds ---
  let _pollTimers = { rooms: null, online: null };
  let _pollAttempts = { rooms: 0, online: 0 };
  const POLL_INTERVAL_MS = 3000;
  const POLL_MAX_ATTEMPTS = 10;

  function startPollingFor(kind) {
    if (kind !== 'rooms' && kind !== 'online') return;
    if (_pollTimers[kind]) return; // already polling
    _pollAttempts[kind] = 0;
    _pollTimers[kind] = setInterval(() => {
      _pollAttempts[kind]++;
      if (kind === 'rooms') safeSend({ type: 'list_rooms' });
      else safeSend({ type: 'list_online' });
      if (_pollAttempts[kind] >= POLL_MAX_ATTEMPTS) {
        clearInterval(_pollTimers[kind]);
        _pollTimers[kind] = null;
        appLog(`Keine ${kind}-Antwort nach ${POLL_MAX_ATTEMPTS} Versuchen`, false);
      }
    }, POLL_INTERVAL_MS);
    // send immediately once
    if (kind === 'rooms') safeSend({ type: 'list_rooms' });
    else safeSend({ type: 'list_online' });
  }

  function stopPollingFor(kind) {
    if (kind !== 'rooms' && kind !== 'online') return;
    if (_pollTimers[kind]) {
      clearInterval(_pollTimers[kind]);
      _pollTimers[kind] = null;
      _pollAttempts[kind] = 0;
    }
  }

  // --- Hauptlogik zum Verbinden ---
  function start() {
    ws = new WebSocket(WS_URL);

    ws.addEventListener('open', (ev) => {
      appLog('Verbindung hergestellt. Authentifiziere...', true);
      safeSend({ type: 'auth', payload: { username: USER } });
    });

    ws.addEventListener('message', (ev) => {
      try {
        const d = JSON.parse(ev.data);

        // === NORMALIZE: if server uses a payload object, merge payload up one level.
        // This makes handlers (e.g. game_state) see fields like currentPlayerId, players, winner, etc.
        let msg;
        if (d && typeof d === 'object' && d.payload && typeof d.payload === 'object') {
          // Keep type at top-level and merge payload; payload fields override nothing important except explicit payload keys.
          msg = Object.assign({}, d.payload);
          // ensure type stays on top-level
          msg.type = d.type;
          // preserve any meta fields from root that are not in payload (if needed)
          Object.keys(d).forEach(k => {
            if (k !== 'payload' && k !== 'type' && !(k in msg)) msg[k] = d[k];
          });
        } else {
          msg = d;
        }

        // call default handler for basic UI updates using normalized msg
        defaultHandleServerMessage(msg);
        // notify all registered callbacks (x01_game.js expects this) with normalized msg
        try {
          serverMessageCallbacks.forEach(cb => {
            try { cb(msg); } catch(e) { console.error('onServerMessage callback error', e); }
          });
        } catch(e){ console.error('server callback loop error', e); }

        // Special-case: still check auth_ok on original message type (server might not include it in payload)
        if (d.type === 'auth_ok' || (msg.type && msg.type === 'auth_ok')) {
          appLog('Authentifizierung erfolgreich.', true);
          // initial requests: use polling to be robust against server cold-start
          startPollingFor('rooms');
          startPollingFor('online');
        }
      } catch(e) { /* ignoriere ungültige Nachrichten */ console.error('invalid ws message', e); }
    });

    ws.addEventListener('close', (ev) => {
      appLog('Verbindung getrennt. Versuche erneut...', false);
      renderOnline(['Verbindung verloren...']);
      // also notify game/UI callbacks about disconnect so they can recover
      try {
        const disconnectMsg = { type: 'connection_closed' };
        serverMessageCallbacks.forEach(cb => { try { cb(disconnectMsg); } catch(e){} });
      } catch(e){}
      // clear any poll timers
      stopPollingFor('rooms'); stopPollingFor('online');
      setTimeout(start, 3000);
    });

    ws.addEventListener('error', (err) => {
        appLog('WebSocket Fehler', false);
        console.error("Lobby WebSocket Error:", err);
    });
  }
  
  start();
})();
// =======================================
// doca-webdarts / server/userManager.js
// Verbindung zu doca.at Login-System
// =======================================

import fetch from "node-fetch";

/**
 * Prüft die Benutzer-Session bei doca.at
 * @param {string} sid - PHPSESSID des Spielers
 * @returns {Promise<{success:boolean,user?:{id:number,username:string}}>}
 */
export async function checkUserSession(sid) {
  if (!sid) return { success: false };

  const url = `https://www.doca.at/php_logic/check_session.php?sid=${encodeURIComponent(
    sid
  )}`;

  try {
    const res = await fetch(url, { method: "GET" });
    const json = await res.json();

    if (json.success && json.user) {
      return {
        success: true,
        user: {
          id: json.user.id,
          username: json.user.username || json.user.name || "Unbekannt",
        },
      };
    }
    return { success: false };
  } catch (err) {
    console.error("❌ Fehler bei checkUserSession:", err);
    return { success: false };
  }
}

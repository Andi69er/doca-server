// userManager.js
import fetch from "node-fetch";

/**
 * Prüft eine PHP-Session-ID gegen deine DOCA-PHP-API.
 * Erwartet eine URL wie: https://www.doca.at/api/check_session.php?sid=...
 * Die API sollte JSON zurückgeben: { success: true, user: { id:..., name:... } }
 */
const DOCA_SESSION_CHECK_URL = "https://www.doca.at/webservices/check_session.php";

/**
 * checkUserSession(sid)
 * @param {string} sid - PHPSESSID
 * @returns {Promise<{success:boolean, user?:object, message?:string}>}
 */
export async function checkUserSession(sid) {
  if (!sid) return { success: false, message: "no sid" };

  try {
    const url = new URL(DOCA_SESSION_CHECK_URL);
    url.searchParams.set("sid", sid);

    const res = await fetch(url.toString(), { method: "GET", timeout: 5000 });
    if (!res.ok) {
      return { success: false, message: `http ${res.status}` };
    }

    const json = await res.json();
    if (json && json.success) {
      return { success: true, user: json.user };
    } else {
      return { success: false, message: json?.message || "invalid session" };
    }
  } catch (err) {
    console.error("userManager.checkUserSession error:", err);
    return { success: false, message: "error" };
  }
}

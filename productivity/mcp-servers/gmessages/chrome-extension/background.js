// Cookie names needed for Google Messages authentication
const COOKIE_NAMES = [
  "SID", "HSID", "SSID", "APISID", "SAPISID", "SIDCC",
  "__Secure-1PAPISID", "__Secure-3PAPISID",
  "__Secure-1PSID", "__Secure-3PSID",
  "__Secure-1PSIDTS", "__Secure-3PSIDTS",
  "__Secure-1PSIDCC", "__Secure-3PSIDCC"
];

const ENDPOINT = "http://127.0.0.1:9595/cookies";
const INTERVAL_MINUTES = 20;

async function refreshCookies() {
  try {
    // Query multiple domains to catch all Google auth cookies
    const domains = [".google.com", "google.com", ".messages.google.com"];
    const cookieMap = {};

    for (const domain of domains) {
      const cookies = await chrome.cookies.getAll({ domain });
      for (const cookie of cookies) {
        if (COOKIE_NAMES.includes(cookie.name) && !cookieMap[cookie.name]) {
          cookieMap[cookie.name] = cookie.value;
        }
      }
    }

    const found = Object.keys(cookieMap).length;
    if (found < 5) {
      console.log(`[gmessages] Only found ${found} cookies — skipping (need at least 5)`);
      return;
    }

    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cookieMap)
    });

    if (resp.ok) {
      console.log(`[gmessages] Pushed ${found} cookies to MCP server`);
    } else {
      console.warn(`[gmessages] Server responded ${resp.status} — is gmessages running?`);
    }
  } catch (err) {
    // Server not running — that's fine, fail silently
    console.debug(`[gmessages] Could not reach MCP server: ${err.message}`);
  }
}

// Ensure alarm exists — called on every service worker wake-up
async function ensureAlarm() {
  const existing = await chrome.alarms.get("refreshCookies");
  if (!existing) {
    chrome.alarms.create("refreshCookies", { periodInMinutes: INTERVAL_MINUTES });
    console.log("[gmessages] Alarm created");
  }
}

// Run on install/update
chrome.runtime.onInstalled.addListener(() => {
  console.log("[gmessages] Extension installed — starting cookie refresh");
  ensureAlarm();
  refreshCookies();
});

// Run on Chrome startup
chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  refreshCookies();
});

// Periodic refresh
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "refreshCookies") {
    refreshCookies();
  }
});

// Safety net: ensure alarm exists whenever service worker wakes up
ensureAlarm();

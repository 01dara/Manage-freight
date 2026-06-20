// Client-side API, IndexedDB local database, Sync service and image compression helper.
const DB_NAME = "FlightCargoDB";
const DB_VERSION = 1;
const SERVER_URL = window.location.origin; // e.g. http://localhost:8000

let dbPromise = null;
let sseSource = null;
let onSyncCallback = null;
let onSettingsCallback = null;

// Initialize IndexedDB
function initDB() {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = (e) => {
      console.error("IndexedDB error:", e);
      reject(e);
    };
    
    request.onsuccess = (e) => {
      resolve(e.target.result);
    };
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("cargo")) {
        db.createObjectStore("cargo", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings");
      }
    };
  });
  
  return dbPromise;
}

// Local Storage Helpers (IndexedDB)
async function getLocalCargo() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("cargo", "readonly");
    const store = transaction.objectStore("cargo");
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e);
  });
}

async function saveLocalCargoList(cargoList) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("cargo", "readwrite");
    const store = transaction.objectStore("cargo");
    
    // Clear and write all
    const clearReq = store.clear();
    clearReq.onsuccess = () => {
      let count = 0;
      if (cargoList.length === 0) {
        resolve();
        return;
      }
      cargoList.forEach(item => {
        const addReq = store.put(item);
        addReq.onsuccess = () => {
          count++;
          if (count === cargoList.length) resolve();
        };
        addReq.onerror = (e) => reject(e);
      });
    };
    clearReq.onerror = (e) => reject(e);
  });
}

async function getLocalSettings() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("settings", "readonly");
    const store = transaction.objectStore("settings");
    const request = store.get("main_settings");
    
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (e) => reject(e);
  });
}

async function saveLocalSettings(settings) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("settings", "readwrite");
    const store = transaction.objectStore("settings");
    const request = store.put(settings, "main_settings");
    
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e);
  });
}

// Server API Sync Helpers
async function fetchCargoFromServer() {
  try {
    const res = await fetch(`${SERVER_URL}/api/cargo`);
    if (res.ok) {
      const serverCargo = await res.json();
      await saveLocalCargoList(serverCargo);
      return serverCargo;
    }
  } catch (e) {
    console.warn("Failed to fetch cargo from server, using offline cache:", e);
  }
  return await getLocalCargo();
}

async function sendCargoToServer(cargoList) {
  try {
    const res = await fetch(`${SERVER_URL}/api/cargo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cargoList)
    });
    return res.ok;
  } catch (e) {
    console.warn("Failed to send cargo to server (Offline):", e);
    return false;
  }
}

async function fetchSettingsFromServer() {
  try {
    const res = await fetch(`${SERVER_URL}/api/settings`);
    if (res.ok) {
      const serverSettings = await res.json();
      await saveLocalSettings(serverSettings);
      return serverSettings;
    }
  } catch (e) {
    console.warn("Failed to fetch settings from server, using offline cache:", e);
  }
  return await getLocalSettings();
}

async function sendSettingsToServer(settings) {
  try {
    const res = await fetch(`${SERVER_URL}/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
    return res.ok;
  } catch (e) {
    console.warn("Failed to send settings to server (Offline):", e);
    return false;
  }
}

// Real-time synchronization connection using Server-Sent Events (SSE)
function connectSSE() {
  if (sseSource) {
    sseSource.close();
  }
  
  const statusEl = document.getElementById("connection-status");
  
  sseSource = new EventSource(`${SERVER_URL}/api/events`);
  
  sseSource.onopen = () => {
    console.log("Realtime sync connected.");
    updateOnlineStatus(true);
    // Sync local changes to server when reconnecting
    syncAllData();
  };
  
  sseSource.addEventListener("cargo_update", (e) => {
    try {
      const serverCargo = JSON.parse(e.data);
      if (onSyncCallback) onSyncCallback(serverCargo);
      saveLocalCargoList(serverCargo).catch(err => console.error("Error caching cargo database offline:", err));
    } catch (err) {
      console.error("Error parsing cargo sse update:", err);
    }
  });
  
  sseSource.addEventListener("settings_update", (e) => {
    try {
      const serverSettings = JSON.parse(e.data);
      if (onSettingsCallback) onSettingsCallback(serverSettings);
      saveLocalSettings(serverSettings).catch(err => console.error("Error caching settings database offline:", err));
    } catch (err) {
      console.error("Error parsing settings sse update:", err);
    }
  });
  
  sseSource.onerror = (e) => {
    console.warn("Realtime sync disconnected, retrying...");
    updateOnlineStatus(false);
  };
}

// Detect Online/Offline status
function updateOnlineStatus(isOnline) {
  const statusBadge = document.getElementById("connection-status");
  if (!statusBadge) return;
  
  const currentLang = window.currentLanguage || "KH";
  
  if (isOnline && navigator.onLine) {
    statusBadge.className = "status-badge online";
    statusBadge.innerHTML = `<span class="icon-pulse"></span> ${translations[currentLang].onlineStatus}`;
  } else {
    statusBadge.className = "status-badge offline";
    statusBadge.innerHTML = `⚠️ ${translations[currentLang].offlineStatus}`;
  }
}

// Sync all data from local db to server (runs on startup or reconnect)
async function syncAllData() {
  if (!navigator.onLine) return;
  
  // 1. Fetch server cargo & settings to reconcile
  const localCargo = await getLocalCargo();
  const serverCargoRes = await fetch(`${SERVER_URL}/api/cargo`).catch(() => null);
  
  if (serverCargoRes && serverCargoRes.ok) {
    const serverCargo = await serverCargoRes.json();
    
    // Simple reconciliation: We sync the most comprehensive list or the server list.
    // If the local database has items not on server, we merge them, or if client performed changes offline.
    // Since our app is local-first, if local has more items or updates (which we can check via timestamp), we update.
    // For simplicity, we compare lengths or last modified dates. If local list is newer/different, sync it up.
    // To implement a simple and reliable merge:
    const mergedCargo = mergeCargoLists(localCargo, serverCargo);
    await saveLocalCargoList(mergedCargo);
    await sendCargoToServer(mergedCargo);
    if (onSyncCallback) onSyncCallback(mergedCargo);
  }
  
  const localSettings = await getLocalSettings();
  const serverSettingsRes = await fetch(`${SERVER_URL}/api/settings`).catch(() => null);
  if (serverSettingsRes && serverSettingsRes.ok) {
    const serverSettings = await serverSettingsRes.json();
    if (localSettings) {
      // If we have local settings, upload them to server or take server settings.
      // Usually, settings are small, server settings are source of truth, but user can edit settings.
      // Let's merge them: if server is empty or local settings exists, use local settings, else use server settings.
      await sendSettingsToServer(localSettings);
    } else {
      await saveLocalSettings(serverSettings);
      if (onSettingsCallback) onSettingsCallback(serverSettings);
    }
  }
}

function mergeCargoLists(local, server) {
  const map = new Map();
  // Put server items first
  server.forEach(item => map.set(item.id, item));
  // Overwrite with local items if they are newer or have updates
  local.forEach(item => {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    } else {
      const serverItem = map.get(item.id);
      // Compare timestamps
      const localTime = new Date(item.dateTime || 0).getTime();
      const serverTime = new Date(serverItem.dateTime || 0).getTime();
      if (localTime > serverTime) {
        map.set(item.id, item);
      }
    }
  });
  return Array.from(map.values());
}

// Client-side image compression
async function compressImage(file, maxWidth = 800, maxQuality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Maintain aspect ratio
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to base64 JPEG
        const dataUrl = canvas.toDataURL('image/jpeg', maxQuality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

// Initialize online/offline browser listeners
window.addEventListener("online", () => {
  updateOnlineStatus(true);
  connectSSE();
});
window.addEventListener("offline", () => {
  updateOnlineStatus(false);
});

// Export functions to global scope
window.api = {
  getLocalCargo,
  saveLocalCargoList,
  getLocalSettings,
  saveLocalSettings,
  fetchCargoFromServer,
  sendCargoToServer,
  fetchSettingsFromServer,
  sendSettingsToServer,
  connectSSE,
  updateOnlineStatus,
  syncAllData,
  compressImage,
  registerOnSync: (cb) => { onSyncCallback = cb; },
  registerOnSettings: (cb) => { onSettingsCallback = cb; }
};

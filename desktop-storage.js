const META_KEY = "daggerCraftDesktopModifiedAtV1";
const SAVE_DELAY_MS = 120;

function getTauriInvoke() {
  const invoke = window.__TAURI__?.core?.invoke;
  return typeof invoke === "function" ? invoke : null;
}

function shouldPersistKey(key) {
  // Supabase session tokens are intentionally excluded from the plain-text
  // local data file. All toolbox and future tool keys are included.
  return typeof key === "string" && !key.startsWith("sb-");
}

function readStorageSnapshot(storage, methods) {
  const keys = {};

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || key === META_KEY || !shouldPersistKey(key)) continue;

    const raw = methods.getItem.call(storage, key);
    if (raw === null) continue;

    try {
      keys[key] = JSON.parse(raw);
    } catch {
      keys[key] = raw;
    }
  }

  const modifiedAt = Number(methods.getItem.call(storage, META_KEY) || 0);

  return {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    modifiedAt: Number.isFinite(modifiedAt) ? modifiedAt : 0,
    keys
  };
}

function restoreStorage(storage, methods, bundle) {
  if (!bundle || typeof bundle !== "object" || !bundle.keys || typeof bundle.keys !== "object") {
    return false;
  }

  const keysToRemove = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && shouldPersistKey(key)) keysToRemove.push(key);
  }

  for (const key of keysToRemove) methods.removeItem.call(storage, key);

  for (const [key, value] of Object.entries(bundle.keys)) {
    if (!shouldPersistKey(key)) continue;
    methods.setItem.call(storage, key, JSON.stringify(value));
  }

  const modifiedAt = Number(bundle.modifiedAt || Date.now());
  methods.setItem.call(storage, META_KEY, String(modifiedAt));
  return true;
}

function enhanceDesktopHeader(api) {
  const applyEnhancements = () => {
    const badge = document.querySelector(".header-right .badge");
    if (badge) badge.textContent = "Desktop · Auto-saved";

    const subtitle = document.querySelector(".app-subtitle");
    if (subtitle) {
      subtitle.textContent =
        "Fast offline DM tools. Every change is saved locally with automatic recovery backups.";
    }

    const cloudPanel = document.getElementById("cloudPanel");
    if (cloudPanel) cloudPanel.hidden = true;

    const header = document.querySelector(".header-right");
    if (!header || document.getElementById("desktopSaveStatus")) return;

    const openFolderButton = document.createElement("button");
    openFolderButton.id = "openDataFolderBtn";
    openFolderButton.className = "btn-secondary btn-small";
    openFolderButton.type = "button";
    openFolderButton.textContent = "Open data folder";
    openFolderButton.addEventListener("click", async () => {
      try {
        await api.openDataFolder();
      } catch (error) {
        api.setStatus("Could not open data folder", true);
        console.error(error);
      }
    });

    const backupButton = document.createElement("button");
    backupButton.id = "desktopBackupBtn";
    backupButton.className = "btn-secondary btn-small";
    backupButton.type = "button";
    backupButton.textContent = "Back up now";
    backupButton.addEventListener("click", async () => {
      try {
        await api.flush();
        const backupPath = await api.createBackup();
        api.setStatus("Backup created");
        console.info("[DaggerCraft] Backup created", backupPath);
      } catch (error) {
        api.setStatus("Backup failed", true);
        console.error(error);
      }
    });

    const status = document.createElement("span");
    status.id = "desktopSaveStatus";
    status.className = "badge";
    status.textContent = "Saved locally";
    status.title = api.dataDirectory;

    header.insertBefore(openFolderButton, cloudPanel || null);
    header.insertBefore(backupButton, cloudPanel || null);
    header.insertBefore(status, cloudPanel || null);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyEnhancements, { once: true });
  } else {
    applyEnhancements();
  }
}

export async function initializeDesktopStorage() {
  const invoke = getTauriInvoke();
  if (!invoke) return false;

  window.DAGGERCRAFT_DESKTOP = true;

  const storage = window.localStorage;
  const methods = {
    getItem: Storage.prototype.getItem,
    setItem: Storage.prototype.setItem,
    removeItem: Storage.prototype.removeItem,
    clear: Storage.prototype.clear
  };

  const webviewBundle = readStorageSnapshot(storage, methods);
  let diskBundle = null;

  try {
    diskBundle = await invoke("load_toolbox_data");
  } catch (error) {
    console.error("[DaggerCraft] Could not load the durable data file", error);
  }

  const webviewModifiedAt = Number(webviewBundle.modifiedAt || 0);
  const diskModifiedAt = Number(diskBundle?.modifiedAt || 0);

  if (diskBundle && diskModifiedAt >= webviewModifiedAt) {
    restoreStorage(storage, methods, diskBundle);
  }

  let saveTimer = null;
  let saving = false;
  let dirty = webviewModifiedAt > diskModifiedAt;
  let dataDirectory = "";

  const setStatus = (message, isError = false) => {
    const status = document.getElementById("desktopSaveStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("danger", isError);
  };

  const persistLoop = async () => {
    if (saving) {
      dirty = true;
      return;
    }

    saving = true;
    window.clearTimeout(saveTimer);
    saveTimer = null;

    try {
      do {
        dirty = false;
        setStatus("Saving…");
        const bundle = readStorageSnapshot(storage, methods);
        await invoke("save_toolbox_data", { bundle });
      } while (dirty);
      setStatus("Saved locally");
    } catch (error) {
      dirty = true;
      setStatus("Save needs attention", true);
      console.error("[DaggerCraft] Durable save failed", error);
    } finally {
      saving = false;
    }
  };

  const schedulePersist = () => {
    dirty = true;
    setStatus("Saving…");
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persistLoop, SAVE_DELAY_MS);
  };

  const markModified = () => {
    methods.setItem.call(storage, META_KEY, String(Date.now()));
    schedulePersist();
  };

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    const result = methods.setItem.call(this, key, value);
    if (this === storage && key !== META_KEY && shouldPersistKey(key)) markModified();
    return result;
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key) {
    const result = methods.removeItem.call(this, key);
    if (this === storage && key !== META_KEY && shouldPersistKey(key)) markModified();
    return result;
  };

  Storage.prototype.clear = function patchedClear() {
    const result = methods.clear.call(this);
    if (this === storage) markModified();
    return result;
  };

  const flush = async () => {
    if (saveTimer || dirty) await persistLoop();
    while (saving) {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    }
  };

  try {
    dataDirectory = await invoke("get_data_directory");
  } catch (error) {
    console.warn("[DaggerCraft] Data directory unavailable", error);
  }

  const desktopApi = {
    dataDirectory,
    flush,
    setStatus,
    openDataFolder: () => invoke("open_data_folder"),
    createBackup: () => invoke("create_manual_backup")
  };

  window.daggerCraftDesktop = desktopApi;
  enhanceDesktopHeader(desktopApi);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && (dirty || saveTimer)) persistLoop();
  });

  window.addEventListener("beforeunload", () => {
    if (dirty || saveTimer) persistLoop();
  });

  if (dirty) schedulePersist();
  return true;
}

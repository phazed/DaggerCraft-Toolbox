import assert from "node:assert/strict";
import test from "node:test";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  get length() {
    return this.values.size;
  }

  key(index) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }

  clear() {
    this.values.clear();
  }
}

test("desktop storage restores disk data and autosaves future tool keys", async () => {
  const localStorage = new MemoryStorage();
  localStorage.setItem("sb-example-auth-token", "private-token");

  const savedBundles = [];
  const diskBundle = {
    schemaVersion: 1,
    savedAt: "2026-08-27T00:00:00.000Z",
    modifiedAt: 100,
    keys: {
      vrahuneGeneratorsV4: [{ id: "disk-generator" }]
    }
  };

  const invoke = async (command, args = {}) => {
    if (command === "load_toolbox_data") return diskBundle;
    if (command === "save_toolbox_data") {
      savedBundles.push(args.bundle);
      return null;
    }
    if (command === "get_data_directory") return "C:\\Users\\DM\\Documents\\DaggerCraft Toolbox";
    if (command === "open_data_folder") return null;
    if (command === "create_manual_backup") return "backup.json";
    throw new Error(`Unexpected command: ${command}`);
  };

  globalThis.Storage = MemoryStorage;
  globalThis.window = {
    __TAURI__: { core: { invoke } },
    localStorage,
    setTimeout,
    clearTimeout,
    addEventListener() {}
  };
  globalThis.document = {
    readyState: "loading",
    visibilityState: "visible",
    addEventListener() {},
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    }
  };

  const { initializeDesktopStorage } = await import("../desktop-storage.js");
  assert.equal(await initializeDesktopStorage(), true);

  assert.deepEqual(JSON.parse(localStorage.getItem("vrahuneGeneratorsV4")), [
    { id: "disk-generator" }
  ]);
  assert.equal(localStorage.getItem("sb-example-auth-token"), "private-token");

  localStorage.setItem("futureDmToolStateV1", JSON.stringify({ ready: true }));
  await new Promise((resolve) => setTimeout(resolve, 250));

  assert.equal(savedBundles.length, 1);
  assert.deepEqual(savedBundles[0].keys.futureDmToolStateV1, { ready: true });
  assert.equal(savedBundles[0].keys["sb-example-auth-token"], undefined);
  assert.equal(window.DAGGERCRAFT_DESKTOP, true);
  assert.match(window.daggerCraftDesktop.dataDirectory, /DaggerCraft Toolbox$/);
});

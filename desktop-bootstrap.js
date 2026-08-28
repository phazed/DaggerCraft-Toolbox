import { initializeDesktopStorage } from "./desktop-storage.js";

function loadClassicScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Unable to load ${src}`));
    document.head.appendChild(script);
  });
}

try {
  await initializeDesktopStorage();
} catch (error) {
  console.error("[DaggerCraft] Desktop storage could not initialize", error);
}

await loadClassicScript("./app.js");
await loadClassicScript("./generator-editor-v2.js");
await import("./main.js");

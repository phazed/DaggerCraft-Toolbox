// main.js – ES module entry for tools
// Each core tool file calls window.registerTool(...) when loaded.
// Enhancement modules load afterward and add UI/workflow layers without replacing tool storage.

const TOOL_MODULES = [
  "./tool-monster-vault.js",
  "./tool-text-cleaner.js",
  "./tool-dice-roller.js",
  "./tool-encounter.js",
  "./tool-statblock-importer.js",
  "./tool-map-measurer.js",
  "./tool-hex-stocker.js"
];

const ENHANCEMENT_MODULES = [
  "./tool-app-shell-v2.js",
  "./tool-monster-vault-enhancements.js",
  "./tool-encounter-combat-mode.js",
  "./tool-importer-wizard.js",
  "./tool-importer-auto-review.js"
];

async function loadToolModule(path) {
  try {
    await import(path);
    console.log("[Vrahune Toolbox] Loaded " + path);
  } catch (err) {
    console.error("[Vrahune Toolbox] Failed to load " + path, err);
  }
}

function pageLooksUnselected() {
  const bodyText = document.body ? document.body.textContent || "" : "";

  return (
    bodyText.includes("No generator or tool selected") ||
    bodyText.includes("No tool selected")
  );
}

function findClickableToolByName(name) {
  const candidates = Array.from(
    document.querySelectorAll("button, [role='button'], .tool-button, .tool-card, .nav-tool, .sidebar button, .tools-nav *")
  );

  return candidates.find((el) => {
    const text = el.textContent || "";
    return text.toLowerCase().includes(name.toLowerCase());
  });
}

function forceToolUiRefresh() {
  const possibleRefreshFns = [
    "renderTools",
    "renderToolNav",
    "renderToolsNav",
    "renderSidebar",
    "renderApp",
    "refreshTools"
  ];

  for (const fnName of possibleRefreshFns) {
    if (typeof window[fnName] === "function") {
      try {
        window[fnName]();
        console.log("[Vrahune Toolbox] Called " + fnName + " after tool load");
      } catch (err) {
        console.warn("[Vrahune Toolbox] " + fnName + " failed:", err);
      }
    }
  }

  window.dispatchEvent(new Event("resize"));
}

function selectHexStockerIfNeeded() {
  window.setTimeout(() => {
    forceToolUiRefresh();

    const hexButton = findClickableToolByName("Hex Stocker");

    if (!hexButton) {
      console.warn("[Vrahune Toolbox] Hex Stocker loaded, but no clickable Hex Stocker nav item was found.");
      return;
    }

    if (pageLooksUnselected()) {
      console.log("[Vrahune Toolbox] Auto-selecting Hex Stocker after tool load");
      hexButton.click();
    }
  }, 150);
}

async function loadTools() {
  if (typeof window.registerTool !== "function") {
    console.error(
      "[Vrahune Toolbox] window.registerTool is missing. app.js may not have loaded before main.js."
    );
  }

  // Load stable tool implementations first.
  for (const path of TOOL_MODULES) {
    await loadToolModule(path);
  }

  // Then layer on navigation/workflow enhancements that rely on those tool APIs.
  for (const path of ENHANCEMENT_MODULES) {
    await loadToolModule(path);
  }

  forceToolUiRefresh();
  selectHexStockerIfNeeded();

  // Cloud login is intentionally not loaded here. The desktop app is local-first,
  // and the browser edition keeps local data/export controls without requiring a backend.
}

loadTools();

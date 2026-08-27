// main.js – ES module entry for tools
// Each tool file calls window.registerTool(...) when loaded.
// app.js is included as a classic script in index.html and defines registerTool.

const TOOL_MODULES = [
  "./tool-monster-vault.js",
  "./tool-text-cleaner.js",
  "./tool-dice-roller.js",
  "./tool-encounter.js",
  "./tool-statblock-importer.js",
  "./tool-map-measurer.js",
  "./tool-hex-stocker.js"
];

async function loadToolModule(path) {
  try {
    await import(path);
    console.log("[Vrahune Toolbox] Loaded " + path);
  } catch (err) {
    console.error("[Vrahune Toolbox] Failed to load " + path, err);
  }
}

function textIncludes(el, text) {
  return (el.textContent || "").toLowerCase().includes(text.toLowerCase());
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
  // Try common app refresh hooks, if your app exposes any.
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

  // Some layouts update on resize.
  window.dispatchEvent(new Event("resize"));
}

function selectHexStockerIfNeeded() {
  // Wait a tiny bit so app.js has time to render the tool nav after imports.
  window.setTimeout(() => {
    forceToolUiRefresh();

    const hexButton = findClickableToolByName("Hex Stocker");

    if (!hexButton) {
      console.warn("[Vrahune Toolbox] Hex Stocker loaded, but no clickable Hex Stocker nav item was found.");
      return;
    }

    // Only auto-click Hex Stocker if the page is stuck on the empty selection state.
    // This prevents stealing focus when another tool is already selected.
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

  for (const path of TOOL_MODULES) {
    await loadToolModule(path);
  }

  forceToolUiRefresh();
  selectHexStockerIfNeeded();

  // The web version can optionally use Supabase. The desktop version is fully
  // local and never attempts a network request.
  if (!window.DAGGERCRAFT_DESKTOP) {
    try {
      await import("./cloud-ui.js");
      console.log("[Vrahune Toolbox] Cloud UI loaded");
    } catch (err) {
      console.warn("[Vrahune Toolbox] Cloud UI disabled or failed to load:", err);
    }
  }
}

loadTools();

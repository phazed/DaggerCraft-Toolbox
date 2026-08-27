// DaggerCraft Toolbox shell v2
// Clean header, Ctrl+K global search, and compact local-data controls.
(() => {
  "use strict";

  if (window.__daggerCraftAppShellV2) return;
  window.__daggerCraftAppShellV2 = true;

  const GEN_KEY = "vrahuneGeneratorsV4";
  const ENCOUNTER_KEY = "vrahuneEncounterToolStateV7";

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function injectStyles() {
    if (document.getElementById("dc-shell-v2-styles")) return;
    const style = document.createElement("style");
    style.id = "dc-shell-v2-styles";
    style.textContent = `
      #cloudPanel { display:none !important; }
      .app-header.dc-header-v2 {
        display:grid !important;
        grid-template-columns:minmax(210px,.7fr) minmax(300px,1.35fr) minmax(210px,.7fr);
        align-items:center !important;
        gap:14px !important;
        padding-top:10px !important;
        padding-bottom:10px !important;
      }
      .dc-header-v2 .header-left { min-width:0; }
      .dc-header-v2 .app-title { line-height:1.05; }
      .dc-header-v2 .app-subtitle {
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        max-width:420px;
        margin-top:3px;
      }
      .dc-header-center { min-width:0; }
      .dc-global-search-trigger {
        width:100%;
        min-height:38px;
        display:flex;
        align-items:center;
        gap:8px;
        border:1px solid #303846;
        border-radius:10px;
        background:#0a0e15;
        color:var(--text-muted, #9aa7b8);
        padding:7px 10px;
        cursor:text;
        text-align:left;
      }
      .dc-global-search-trigger:hover { border-color:#566277; background:#0d131d; }
      .dc-search-icon { color:var(--accent-strong, #c5d8ff); font-size:1rem; }
      .dc-search-placeholder { flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
      .dc-search-key {
        border:1px solid #353e4d;
        background:#111722;
        border-radius:6px;
        padding:2px 6px;
        font-size:.68rem;
        color:#a9b7cc;
        white-space:nowrap;
      }
      .dc-header-v2 .header-right {
        display:flex !important;
        align-items:center;
        justify-content:flex-end;
        gap:7px;
        flex-wrap:nowrap !important;
        min-width:0;
      }
      .dc-header-v2 .header-right > .badge:not(#desktopSaveStatus) { display:none !important; }
      #desktopSaveStatus { white-space:nowrap; }
      .dc-data-wrap { position:relative; }
      .dc-data-menu {
        position:absolute;
        right:0;
        top:calc(100% + 6px);
        width:245px;
        z-index:1200;
        display:none;
        border:1px solid #303846;
        border-radius:12px;
        background:#070a10;
        box-shadow:0 18px 55px rgba(0,0,0,.48);
        padding:7px;
      }
      .dc-data-menu.open { display:grid; gap:4px; }
      .dc-data-menu .btn-secondary,
      .dc-data-menu .btn-primary,
      .dc-data-menu button {
        width:100%;
        justify-content:flex-start;
        text-align:left;
      }
      .dc-data-section {
        color:#72819a;
        font-size:.66rem;
        text-transform:uppercase;
        letter-spacing:.08em;
        padding:7px 7px 3px;
      }
      .dc-menu-divider { height:1px; background:#202733; margin:4px 2px; }
      .dc-menu-note { font-size:.69rem; color:#7f8da2; padding:5px 7px; line-height:1.35; }

      .dc-search-overlay {
        position:fixed;
        inset:0;
        z-index:5000;
        display:none;
        align-items:flex-start;
        justify-content:center;
        padding-top:min(14vh, 120px);
        background:rgba(0,0,0,.68);
        backdrop-filter:blur(4px);
      }
      .dc-search-overlay.open { display:flex; }
      .dc-search-dialog {
        width:min(760px, 94vw);
        max-height:min(720px, 78vh);
        display:flex;
        flex-direction:column;
        border:1px solid #394454;
        border-radius:15px;
        background:#070a10;
        box-shadow:0 32px 100px rgba(0,0,0,.6);
        overflow:hidden;
      }
      .dc-search-box-row { display:flex; align-items:center; gap:9px; padding:12px; border-bottom:1px solid #252d38; }
      #dcGlobalSearchInput {
        flex:1;
        border:none !important;
        background:transparent !important;
        box-shadow:none !important;
        outline:none !important;
        font-size:1rem;
        padding:4px !important;
      }
      .dc-search-results { overflow:auto; padding:7px; }
      .dc-search-empty { color:#8796aa; text-align:center; padding:28px 12px; font-size:.8rem; }
      .dc-result-group-label { color:#6f8098; font-size:.66rem; text-transform:uppercase; letter-spacing:.08em; padding:8px 8px 4px; }
      .dc-search-result {
        width:100%;
        display:flex;
        align-items:center;
        gap:9px;
        border:1px solid transparent;
        background:transparent;
        color:inherit;
        border-radius:9px;
        padding:8px;
        cursor:pointer;
        text-align:left;
      }
      .dc-search-result:hover, .dc-search-result.active { background:#111823; border-color:#293548; }
      .dc-result-icon {
        width:30px;height:30px;display:grid;place-items:center;flex:0 0 auto;
        border:1px solid #2b3545;border-radius:8px;background:#0c111a;color:#c3d5f4;
      }
      .dc-result-main { min-width:0; flex:1; }
      .dc-result-title { color:#e7eefc; font-size:.8rem; font-weight:650; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .dc-result-sub { color:#7f90aa; font-size:.69rem; margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .dc-result-type { color:#718099; font-size:.65rem; white-space:nowrap; }
      .dc-search-footer { border-top:1px solid #252d38; padding:7px 11px; color:#718099; font-size:.67rem; display:flex; justify-content:space-between; gap:8px; }
      @media (max-width:900px) {
        .app-header.dc-header-v2 { grid-template-columns:1fr !important; }
        .dc-header-v2 .header-right { justify-content:flex-start !important; }
        .dc-header-v2 .app-subtitle { max-width:100%; }
      }
    `;
    document.head.appendChild(style);
  }

  function selectTool(id) {
    if (typeof window.renderToolsNav === "function") window.renderToolsNav();
    const item = document.querySelector(`.nav-tool[data-id="${CSS.escape(String(id))}"]`);
    if (item) {
      item.click();
      return true;
    }
    if (window.toolRenderers && typeof window.toolRenderers[id] === "function") {
      try {
        window.toolRenderers[id]({
          labelEl: document.getElementById("activeGeneratorLabel"),
          panelEl: document.getElementById("generatorPanel")
        });
        return true;
      } catch (_) {}
    }
    return false;
  }

  function selectGenerator(id) {
    if (typeof window.renderGeneratorNav === "function") window.renderGeneratorNav();
    const item = document.querySelector(`.nav-generator[data-id="${CSS.escape(String(id))}"]`);
    if (!item) return false;
    item.click();
    return true;
  }

  function getSearchItems(query) {
    const q = String(query || "").trim().toLowerCase();
    const items = [];

    (window.toolsConfig || []).forEach((tool) => {
      const hay = `${tool.name || ""} ${tool.description || ""}`.toLowerCase();
      if (!q || hay.includes(q)) {
        items.push({ kind:"tool", group:"Tools", id:tool.id, title:tool.name, sub:tool.description || "Open tool", icon:"◆" });
      }
    });

    const generators = readJson(GEN_KEY, []);
    if (Array.isArray(generators)) {
      generators.forEach((gen) => {
        const hay = `${gen.name || ""} ${gen.folder || ""} ${gen.type || ""}`.toLowerCase();
        if (!q || hay.includes(q)) {
          items.push({ kind:"generator", group:"Generators", id:gen.id, title:gen.name || "Generator", sub:`${gen.folder || "General"} · ${gen.type || "list"}`, icon:"⚄" });
        }
      });
    }

    try {
      const api = window.VrahuneMonsterVault || window.MonsterVault || window.vrahuneMonsterVault;
      const monsters = api && typeof api.getMonsterIndex === "function" ? api.getMonsterIndex() : [];
      if (Array.isArray(monsters)) {
        monsters.forEach((m) => {
          const hay = `${m.name || ""} ${m.cr || ""} ${m.sizeType || ""} ${m.source || ""}`.toLowerCase();
          if (q && hay.includes(q)) {
            items.push({ kind:"monster", group:"Monster Vault", id:m.id, title:m.name || "Monster", sub:`CR ${m.cr || "—"} · ${m.source || "Monster Vault"}`, icon:"☠" });
          }
        });
      }
    } catch (_) {}

    const enc = readJson(ENCOUNTER_KEY, null);
    if (enc && Array.isArray(enc.library)) {
      enc.library.forEach((entry) => {
        const hay = `${entry.name || ""} ${entry.tags || ""} ${entry.location || ""}`.toLowerCase();
        if (q && hay.includes(q)) {
          items.push({ kind:"encounter", group:"Encounter Library", id:entry.id, title:entry.name || "Encounter", sub:[entry.location, entry.tags].filter(Boolean).join(" · ") || "Saved encounter", icon:"⚔" });
        }
      });
    }

    const groupOrder = { Tools:0, Generators:1, "Monster Vault":2, "Encounter Library":3 };
    items.sort((a,b) => {
      const qa = q && a.title.toLowerCase().startsWith(q) ? -2 : 0;
      const qb = q && b.title.toLowerCase().startsWith(q) ? -2 : 0;
      if (qa !== qb) return qa - qb;
      const ga = groupOrder[a.group] ?? 9;
      const gb = groupOrder[b.group] ?? 9;
      if (ga !== gb) return ga - gb;
      return a.title.localeCompare(b.title);
    });
    return items.slice(0, 80);
  }

  let currentResults = [];
  let activeIndex = 0;

  function renderSearchResults() {
    const input = document.getElementById("dcGlobalSearchInput");
    const host = document.getElementById("dcGlobalSearchResults");
    if (!input || !host) return;
    currentResults = getSearchItems(input.value);
    if (activeIndex >= currentResults.length) activeIndex = Math.max(0, currentResults.length - 1);
    if (!currentResults.length) {
      host.innerHTML = `<div class="dc-search-empty">No matching tools, generators, monsters, or saved encounters.</div>`;
      return;
    }
    let lastGroup = "";
    host.innerHTML = currentResults.map((item, idx) => {
      const group = item.group !== lastGroup ? `<div class="dc-result-group-label">${esc(item.group)}</div>` : "";
      lastGroup = item.group;
      return `${group}<button type="button" class="dc-search-result ${idx === activeIndex ? "active" : ""}" data-dc-result="${idx}">
        <span class="dc-result-icon">${esc(item.icon)}</span>
        <span class="dc-result-main"><span class="dc-result-title">${esc(item.title)}</span><span class="dc-result-sub">${esc(item.sub)}</span></span>
        <span class="dc-result-type">${esc(item.group)}</span>
      </button>`;
    }).join("");
  }

  function closeSearch() {
    document.getElementById("dcGlobalSearchOverlay")?.classList.remove("open");
  }

  function openSearch(initial = "") {
    const overlay = document.getElementById("dcGlobalSearchOverlay");
    const input = document.getElementById("dcGlobalSearchInput");
    if (!overlay || !input) return;
    overlay.classList.add("open");
    input.value = initial;
    activeIndex = 0;
    renderSearchResults();
    setTimeout(() => input.focus(), 0);
  }

  function activateResult(item) {
    if (!item) return;
    closeSearch();
    if (item.kind === "tool") {
      selectTool(item.id);
      return;
    }
    if (item.kind === "generator") {
      selectGenerator(item.id);
      return;
    }
    if (item.kind === "monster") {
      selectTool("monsterVaultTool");
      window.setTimeout(() => {
        const search = document.querySelector("#generatorPanel #mvSearch");
        if (!search) return;
        search.value = item.title;
        search.dispatchEvent(new Event("input", { bubbles:true }));
        window.setTimeout(() => {
          const row = document.querySelector(`#generatorPanel .mv-row-wrap[data-monster-id="${CSS.escape(String(item.id))}"]`);
          row?.querySelector("[data-mv-toggle]")?.click();
        }, 80);
      }, 80);
      return;
    }
    if (item.kind === "encounter") {
      const state = readJson(ENCOUNTER_KEY, {});
      state.tab = "library";
      state.libraryEditId = item.id;
      localStorage.setItem(ENCOUNTER_KEY, JSON.stringify(state));
      selectTool("encounterTool");
    }
  }

  function buildSearchOverlay() {
    if (document.getElementById("dcGlobalSearchOverlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "dcGlobalSearchOverlay";
    overlay.className = "dc-search-overlay";
    overlay.innerHTML = `
      <div class="dc-search-dialog" role="dialog" aria-modal="true" aria-label="Search DaggerCraft Toolbox">
        <div class="dc-search-box-row">
          <span class="dc-search-icon">⌕</span>
          <input id="dcGlobalSearchInput" type="text" autocomplete="off" placeholder="Search tools, generators, monsters, encounters..." />
          <span class="dc-search-key">Esc</span>
        </div>
        <div id="dcGlobalSearchResults" class="dc-search-results"></div>
        <div class="dc-search-footer"><span>↑ ↓ Navigate · Enter Open</span><span>Ctrl+K anywhere</span></div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector("#dcGlobalSearchInput");
    input.addEventListener("input", () => { activeIndex = 0; renderSearchResults(); });
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        activeIndex = Math.min(currentResults.length - 1, activeIndex + 1);
        renderSearchResults();
        overlay.querySelector(`.dc-search-result[data-dc-result="${activeIndex}"]`)?.scrollIntoView({ block:"nearest" });
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        activeIndex = Math.max(0, activeIndex - 1);
        renderSearchResults();
        overlay.querySelector(`.dc-search-result[data-dc-result="${activeIndex}"]`)?.scrollIntoView({ block:"nearest" });
      } else if (event.key === "Enter") {
        event.preventDefault();
        activateResult(currentResults[activeIndex]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
      }
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeSearch();
      const btn = event.target.closest("[data-dc-result]");
      if (btn) activateResult(currentResults[Number(btn.dataset.dcResult)]);
    });
  }

  function exportFullBackup() {
    const keys = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || key.startsWith("sb-")) continue;
      const raw = localStorage.getItem(key);
      if (raw == null) continue;
      try { keys[key] = JSON.parse(raw); }
      catch { keys[key] = raw; }
    }
    const payload = { schemaVersion:2, type:"daggercraft-full-backup", exportedAt:new Date().toISOString(), keys };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DaggerCraft-Full-Backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importFullBackup(file) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (!payload || !payload.keys || typeof payload.keys !== "object") throw new Error("Missing keys map");
      if (!window.confirm("Replace the current local toolbox data with this full backup?")) return;
      Object.entries(payload.keys).forEach(([key, value]) => {
        if (!key || key.startsWith("sb-")) return;
        localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      });
      window.location.reload();
    } catch (err) {
      window.alert(`Could not import that backup. ${err?.message || err}`);
    }
  }

  function buildHeader() {
    const header = document.querySelector("header.app-header");
    const left = header?.querySelector(".header-left");
    const right = header?.querySelector(".header-right");
    if (!header || !left || !right || header.classList.contains("dc-header-v2")) return;
    header.classList.add("dc-header-v2");

    const subtitle = left.querySelector(".app-subtitle");
    if (subtitle) subtitle.textContent = "Offline-first DM tools · saved locally";

    const center = document.createElement("div");
    center.className = "dc-header-center";
    center.innerHTML = `<button id="dcGlobalSearchTrigger" class="dc-global-search-trigger" type="button">
      <span class="dc-search-icon">⌕</span><span class="dc-search-placeholder">Search tools, generators, monsters, encounters...</span><span class="dc-search-key">Ctrl K</span>
    </button>`;
    header.insertBefore(center, right);
    center.querySelector("#dcGlobalSearchTrigger")?.addEventListener("click", () => openSearch());

    const movableIds = ["downloadDbBtn","uploadDbBtn","resetPublishedBtn","uploadDbHelpBtn","openDataFolderBtn","desktopBackupBtn"];
    const dataWrap = document.createElement("div");
    dataWrap.className = "dc-data-wrap";
    dataWrap.innerHTML = `<button id="dcDataMenuBtn" class="btn-secondary btn-small" type="button">Data ▾</button><div id="dcDataMenu" class="dc-data-menu"></div>`;
    right.appendChild(dataWrap);
    const menu = dataWrap.querySelector("#dcDataMenu");
    const section = document.createElement("div");
    section.className = "dc-data-section";
    section.textContent = "Local data";
    menu.appendChild(section);
    movableIds.forEach((id) => {
      const node = document.getElementById(id);
      if (node) menu.appendChild(node);
    });

    const divider = document.createElement("div");
    divider.className = "dc-menu-divider";
    menu.appendChild(divider);

    const fullExport = document.createElement("button");
    fullExport.type = "button";
    fullExport.className = "btn-secondary btn-small";
    fullExport.textContent = "⬇ Export full backup";
    fullExport.title = "Includes new toolbox metadata and enhancement data.";
    fullExport.addEventListener("click", exportFullBackup);
    menu.appendChild(fullExport);

    const fullImport = document.createElement("button");
    fullImport.type = "button";
    fullImport.className = "btn-secondary btn-small";
    fullImport.textContent = "⬆ Import full backup";
    menu.appendChild(fullImport);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.hidden = true;
    input.addEventListener("change", () => { importFullBackup(input.files?.[0]); input.value = ""; });
    menu.appendChild(input);
    fullImport.addEventListener("click", () => input.click());

    const note = document.createElement("div");
    note.className = "dc-menu-note";
    note.textContent = window.DAGGERCRAFT_DESKTOP
      ? "Desktop saves automatically to Documents with recovery backups. No account required."
      : "Browser data stays on this device unless you export it.";
    menu.appendChild(note);

    const dataBtn = dataWrap.querySelector("#dcDataMenuBtn");
    dataBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      menu.classList.toggle("open");
    });
    document.addEventListener("click", (event) => {
      if (!dataWrap.contains(event.target)) menu.classList.remove("open");
    });
  }

  function init() {
    injectStyles();
    buildSearchOverlay();
    buildHeader();
    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const open = document.getElementById("dcGlobalSearchOverlay")?.classList.contains("open");
        if (open) closeSearch(); else openSearch();
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once:true });
  else init();
})();

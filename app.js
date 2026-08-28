// app.js – core Vrahune Toolbox logic
// (This is your big inline <script> from index.html, cleaned up and moved here.)

const GEN_STORAGE_KEY = "vrahuneGeneratorsV4";
const FOLDER_STATE_KEY = "vrahuneFolderStateV1";

// --- Published defaults (optional) ----------------------------
// If you create /data/vrahune_database.json in your repo, first-time visitors
// will be seeded with that data. Existing users keep their local data unless
// they import/reset.
const PUBLISHED_DB_URL = "./data/vrahune_database.json";
const PUBLISHED_GENS_URL = "./data/vrahune_generators.json";

// Keys we consider part of the "toolbox database" export/import bundle.
const DB_BUNDLE_KEYS = [
  GEN_STORAGE_KEY,
  FOLDER_STATE_KEY,
  "vrahuneEncounterToolStateV7",
  "vrahuneMonsterVaultStateV2",
  "vrahuneStatblockImporterDraftsV3",
  "daggerCraftHexStockerStateV1"
];

let publishedDbBundle = null;

async function fetchJsonIfExists(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || !text.trim()) return null;
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

function safeReadLocalJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw);
  } catch (err) {
    return undefined;
  }
}

function safeWriteLocalJson(key, val) {
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch (err) {
    return false;
  }
}

function normalizePublishedBundle(data) {
  if (!data) return null;

  // Preferred format:
  // { schemaVersion: 1, generatedAt: "...", keys: { "<localStorageKey>": <json> } }
  if (data && typeof data === "object" && data.keys && typeof data.keys === "object") {
    return {
      schemaVersion: Number(data.schemaVersion || 1),
      generatedAt: data.generatedAt || null,
      keys: data.keys
    };
  }

  // Allow a bare "keys map" format: { "<localStorageKey>": <json>, ... }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const maybeKeys = {};
    let found = false;
    for (const k of DB_BUNDLE_KEYS) {
      if (k in data) {
        maybeKeys[k] = data[k];
        found = true;
      }
    }
    if (found) {
      return { schemaVersion: 1, generatedAt: null, keys: maybeKeys };
    }
  }

  return null;
}

async function loadPublishedDefaults() {
  // 1) Try full bundle
  const db = await fetchJsonIfExists(PUBLISHED_DB_URL);
  const normalized = normalizePublishedBundle(db);
  if (normalized) {
    publishedDbBundle = normalized;
    window.VRAHUNE_PUBLISHED_DB = normalized;
    return normalized;
  }

  // 2) Fallback: generators-only file (legacy)
  const gens = await fetchJsonIfExists(PUBLISHED_GENS_URL);
  if (Array.isArray(gens) && gens.length) {
    const bundle = { schemaVersion: 1, generatedAt: null, keys: { [GEN_STORAGE_KEY]: gens } };
    publishedDbBundle = bundle;
    window.VRAHUNE_PUBLISHED_DB = bundle;
    return bundle;
  }

  publishedDbBundle = null;
  window.VRAHUNE_PUBLISHED_DB = null;
  return null;
}

function seedFromPublishedIfMissing(storageKey) {
  if (window.localStorage.getItem(storageKey)) return false;
  const val =
    publishedDbBundle && publishedDbBundle.keys ? publishedDbBundle.keys[storageKey] : undefined;
  if (val === undefined) return false;
  return safeWriteLocalJson(storageKey, val);
}


// --- Modular tools setup ------------------------------------------

// Shared list of tools used by the left sidebar
window.toolsConfig = window.toolsConfig || [];
window.toolRenderers = window.toolRenderers || {};

const toolsConfig = window.toolsConfig; // used by renderToolsNav
let activeToolId = null;
let toolSearchTerm = "";

// Helper to register tools from tool-*.js files
window.registerTool = function registerTool(def) {
  if (!def || !def.id || !def.name || typeof def.render !== "function") {
    console.warn("registerTool: invalid tool definition", def);
    return;
  }

  const base = {
    id: def.id,
    name: def.name,
    description: def.description || ""
  };

  const existingIndex = toolsConfig.findIndex(t => t.id === def.id);
  if (existingIndex >= 0) {
    toolsConfig[existingIndex] = base;
  } else {
    toolsConfig.push(base);
  }

  window.toolRenderers[def.id] = def.render;
};

// --------------------------------------------------------------


let activeGenerator = null;
let editingGeneratorId = null;
let itemsExpanded = false;
let folderState = {};
let generatorSearchTerm = "";
let advTemplateGenId = null;

const valathiLexiconSeed = [
  { english: "high, noble, elevated, bright", valathi: "val" },
  { english: "forest, wooded land", valathi: "’ath" },
  { english: "land, domain", valathi: "anna" },
  { english: "seat, city, foundation", valathi: "dor" },
  { english: "stone, mountain, cliff", valathi: "vor" },
  { english: "water, lake", valathi: "mir" },
  { english: "river, flowing path", valathi: "len" },
  { english: "wind, air current", valathi: "vrae" },
  { english: "star, light in the dark", valathi: "sel" },
  { english: "sea, great water", valathi: "thal" },
  { english: "north, cold lands", valathi: "nor" },
  { english: "dusk, evening star", valathi: "ves" },
  { english: "guardian, warden", valathi: "vel" },
  { english: "song, art, beautiful craft", valathi: "rin" },
  { english: "lore, deep knowledge", valathi: "ith" },
  { english: "peace, calm", valathi: "ser" },
  { english: "flame, passion, drive", valathi: "nar" },
  { english: "life, breath, vitality", valathi: "laen" },
  { english: "hidden, secret, veiled", valathi: "vyn" },
  { english: "world, the continent", valathi: "Vrahune" },
  { english: "noble-forest land (realm)", valathi: "Val’athanna" },
  { english: "high seat, noble city", valathi: "Valdora" }
];

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function showCopyMessage(text) {
  const msg = document.getElementById("copyMessage");
  if (!msg) return;
  msg.textContent = `Copied: "${text}"`;
  setTimeout(() => {
    if (msg && msg.isConnected) {
      msg.textContent = "Click an item to copy.";
    }
  }, 2500);
}

function handleCopyClick(event) {
  const target = event.target;
  if (!target.classList.contains("generated-item")) return;
  const text = target.textContent.trim();
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => showCopyMessage(text))
      .catch(() => showCopyMessage(text));
  } else {
    showCopyMessage(text);
  }
}

function parseGeneratorItems(rawText) {
  if (!rawText) return { items: [], duplicates: 0 };
  const lines = rawText.split(/\r?\n/);
  const set = new Set();
  const items = [];
  let total = 0;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    total++;
    const key = t.toLowerCase();
    if (!set.has(key)) {
      set.add(key);
      items.push(t);
    }
  }
  const duplicates = Math.max(0, total - items.length);
  return { items, duplicates };
}

function parseLexiconText(rawText) {
  if (!rawText) return { items: [], duplicates: 0 };
  const lines = rawText.split(/\r?\n/);
  const map = new Map();
  let total = 0;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    total++;
    let english = "";
    let valathi = "";

    const eqIdx = t.indexOf("=");
    const dashIdx = eqIdx === -1 ? t.indexOf("-") : -1;

    if (eqIdx !== -1) {
      english = t.slice(0, eqIdx).trim();
      valathi = t.slice(eqIdx + 1).trim();
    } else if (dashIdx !== -1) {
      english = t.slice(0, dashIdx).trim();
      valathi = t.slice(dashIdx + 1).trim();
    } else {
      english = t;
      valathi = t;
    }

    if (!english || !valathi) continue;
    const key = `${english.toLowerCase()}|${valathi.toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, { english, valathi });
    }
  }

  const items = Array.from(map.values());
  const duplicates = Math.max(0, total - items.length);
  return { items, duplicates };
}

function mergeLexiconEntries(existing, incoming) {
  const map = new Map();
  if (Array.isArray(existing)) {
    for (const e of existing) {
      if (!e || !e.english || !e.valathi) continue;
      const key = `${String(e.english).toLowerCase()}|${String(e.valathi).toLowerCase()}`;
      map.set(key, { english: e.english, valathi: e.valathi });
    }
  }
  if (Array.isArray(incoming)) {
    for (const e of incoming) {
      if (!e || !e.english || !e.valathi) continue;
      const key = `${String(e.english).toLowerCase()}|${String(e.valathi).toLowerCase()}`;
      map.set(key, { english: e.english, valathi: e.valathi });
    }
  }
  return Array.from(map.values());
}

function extractTokensFromPatterns(patterns) {
  const tokenSet = new Set();
  const tokenRegex = /\{([^}]+)\}/g;
  for (const p of patterns) {
    let m;
    while ((m = tokenRegex.exec(p)) !== null) {
      const token = m[1].trim();
      if (token) tokenSet.add(token);
    }
  }
  return Array.from(tokenSet);
}

function cleanTextForGenerator(raw) {
  if (!raw) return "";

  let replaced = raw.replace(/\r\n/g, "\n");
  replaced = replaced.replace(/(^|\s)(\d+)(?=[\.\)]?\s*[A-Za-z])/g, "\n$2");

  const lines = replaced.split(/\n+/);
  const cleaned = [];

  for (let line of lines) {
    let t = line.trim();
    if (!t) continue;

    t = t.replace(/^[\-\*\u2022]+\s*/, "");
    t = t.replace(/^\d+[\.\)]?\s*/, "");
    t = t.replace(/\s{2,}/g, " ");
    t = t.trim().replace(/[,\s]+$/, "").trim();

    if (t) cleaned.push(t);
  }

  return cleaned.join("\n");
}

function rollDiceExpression(expr) {
  let text = (expr || "").toString().trim().toLowerCase();
  if (!text) {
    throw new Error("Empty expression");
  }
  text = text.replace(/\s+/g, "");

  const regex = /([+-])?(\d*)d(\d+)|([+-])?(\d+)/g;
  let match;
  let total = 0;
  const terms = [];
  let found = false;

  while ((match = regex.exec(text)) !== null) {
    found = true;
    if (match[3]) {
      const sign = match[1] === "-" ? -1 : 1;
      const count = match[2] ? parseInt(match[2], 10) : 1;
      const faces = parseInt(match[3], 10);
      if (!faces || !count) continue;
      const rolls = [];
      for (let i = 0; i < count; i++) {
        const r = Math.floor(Math.random() * faces) + 1;
        rolls.push(r);
      }
      const subtotal = rolls.reduce((a, b) => a + b, 0) * sign;
      total += subtotal;
      terms.push({ type: "dice", sign, count, faces, rolls, subtotal });
    } else if (match[5]) {
      const sign = match[4] === "-" ? -1 : 1;
      const value = parseInt(match[5], 10);
      const subtotal = value * sign;
      total += subtotal;
      terms.push({ type: "mod", sign, value, subtotal });
    }
  }

  if (!found) {
    throw new Error("Invalid dice expression");
  }

  return { total, terms };
}

function formatTermSegments(terms) {
  if (!terms || !terms.length) return "";
  let first = true;
  let str = "";
  for (const term of terms) {
    const val = term.subtotal;
    if (first) {
      str = String(val);
      first = false;
    } else {
      if (val >= 0) {
        str += " + " + val;
      } else {
        str += " - " + -val;
      }
    }
  }
  return str;
}

function loadFolderState() {
  try {
    const raw = window.localStorage.getItem(FOLDER_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function saveFolderState() {
  try {
    window.localStorage.setItem(FOLDER_STATE_KEY, JSON.stringify(folderState));
  } catch (err) {
    // ignore storage errors
  }
}

function seedInitialGenerators() {
  const elfStartId = "seed-elf-starts";
  const elfMiddleId = "seed-elf-middles";
  const elfEndSoftId = "seed-elf-ends-soft";
  const elfEndSharpId = "seed-elf-ends-sharp";
  const bookAdjId = "seed-book-adj";
  const bookNounId = "seed-book-noun";
  const bookPlaceId = "seed-book-place";

  return [
    {
      id: elfStartId,
      folder: "Names",
      name: "Elf Name Starts",
      type: "list",
      items: [
        "Val",
        "Ves",
        "Vor",
        "Vrae",
        "Sel",
        "Thal",
        "Mir",
        "Nor",
        "Lae",
        "Vel",
        "Vyn",
        "Maer",
        "Ael",
        "Ny",
        "Syl",
        "Cae",
        "Ari",
        "Eli",
        "Var",
        "Lor",
        "Sael",
        "Cal",
        "Ser",
        "Ty",
        "Vael",
        "Oryn"
      ]
    },
    {
      id: elfMiddleId,
      folder: "Names",
      name: "Elf Name Middles",
      type: "list",
      items: ["a", "e", "i", "o", "la", "le", "li", "ra", "re", "ri", "sa", "se", "thal", "lyn", "rin"]
    },
    {
      id: elfEndSoftId,
      folder: "Names",
      name: "Elf Name Ends (Soft)",
      type: "list",
      items: ["a", "ae", "ira", "iel", "essa", "yn", "yne", "ara", "ina"]
    },
    {
      id: elfEndSharpId,
      folder: "Names",
      name: "Elf Name Ends (Sharp)",
      type: "list",
      items: ["as", "ix", "or", "eth", "is", "ar", "ax", "an", "orix"]
    },
    {
      id: bookAdjId,
      folder: "Names",
      name: "Book Adjectives",
      type: "list",
      items: [
        "Silent",
        "Forgotten",
        "Gilded",
        "Broken",
        "Crimson",
        "Twilight",
        "Shattered",
        "Hidden",
        "Last",
        "Bound",
        "Whispering",
        "Silver",
        "Onyx",
        "Verdant",
        "Burning",
        "Veiled"
      ]
    },
    {
      id: bookNounId,
      folder: "Names",
      name: "Book Nouns",
      type: "list",
      items: [
        "Throne",
        "Forest",
        "Empire",
        "Oath",
        "Crown",
        "River",
        "Sea",
        "Spire",
        "Song",
        "Shadow",
        "Light",
        "Wolf",
        "King",
        "Queen",
        "Chronicle",
        "Blade",
        "Storm",
        "Gate"
      ]
    },
    {
      id: bookPlaceId,
      folder: "Names",
      name: "Book Places (Vrahune)",
      type: "list",
      items: [
        "Vrahune",
        "Val’athanna",
        "Valdora",
        "Fallen Spears",
        "Frostclaw Wilds",
        "Verdant Veil",
        "Onyx Empire",
        "Raven Fields",
        "New Hope Frontier"
      ]
    },
    {
      id: "seed-elf-names-template",
      folder: "Names",
      name: "Elf Names (Template)",
      type: "advanced",
      items: {
        patterns: [
          "{Start}{EndSoft}",
          "{Start}{Middle}{EndSoft}",
          "{Start}{EndSharp}",
          "{Start}{Middle}{EndSharp}"
        ],
        tokenMap: {
          Start: elfStartId,
          Middle: elfMiddleId,
          EndSoft: elfEndSoftId,
          EndSharp: elfEndSharpId
        },
        multiTokenMap: {},
        advancedMode: "simple"
      }
    },
    {
      id: "seed-book-titles-template",
      folder: "Names",
      name: "Book Titles (Template)",
      type: "advanced",
      items: {
        patterns: [
          "The {Adj} {Noun}",
          "The {Adj} {Noun} of {Place}",
          "{Noun} of {Place}",
          "{Place}: The {Adj} {Noun}"
        ],
        tokenMap: {
          Adj: bookAdjId,
          Noun: bookNounId,
          Place: bookPlaceId
        },
        multiTokenMap: {},
        advancedMode: "simple"
      }
    },
    {
      id: "gen-lex-valathi",
      folder: "Lexicons",
      name: "Valathi Lexicon",
      type: "lexicon",
      items: valathiLexiconSeed
    }
  ];
}

function loadGenerators() {
  try {
    const raw = window.localStorage.getItem(GEN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((g) => {
      const type = g.type || "list";
      let items = g.items;
      if (type === "list") {
        items = Array.isArray(items) ? items : [];
      } else if (type === "lexicon") {
        items = Array.isArray(items) ? items : [];
      } else if (type === "advanced") {
        if (!items || typeof items !== "object") {
          items = {};
        }
        items.patterns = Array.isArray(items.patterns) ? items.patterns : [];
        items.tokenMap =
          items.tokenMap && typeof items.tokenMap === "object" ? items.tokenMap : {};
        items.multiTokenMap =
          items.multiTokenMap && typeof items.multiTokenMap === "object"
            ? items.multiTokenMap
            : {};
        if (!items.advancedMode) items.advancedMode = "simple";
      }
      return { ...g, type, items };
    });
  } catch (err) {
    return [];
  }
}

function saveGenerators(list) {
  try {
    window.localStorage.setItem(GEN_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    // ignore storage errors
  }
}

function populateFolderSelect(selectedFolder) {
  const select = document.getElementById("genFolderSelect");
  if (!select) return;

  const gens = loadGenerators();
  const folderSet = new Set();

  gens.forEach((g) => {
    const f = g.folder || "General";
    folderSet.add(f);
  });

  const folderNames = Array.from(folderSet).sort((a, b) => a.localeCompare(b));

  if (selectedFolder && selectedFolder !== "__new__" && !folderSet.has(selectedFolder)) {
    folderNames.push(selectedFolder);
  }

  select.innerHTML = "";

  folderNames.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = f;
    select.appendChild(opt);
  });

  const optNew = document.createElement("option");
  optNew.value = "__new__";
  optNew.textContent = "+ New folder…";
  select.appendChild(optNew);

  if (
    selectedFolder &&
    selectedFolder !== "__new__" &&
    folderNames.includes(selectedFolder)
  ) {
    select.value = selectedFolder;
  } else if (folderNames.length > 0) {
    select.value = folderNames[0];
  } else {
    select.value = "__new__";
  }

  handleFolderSelectChange();
}

function handleFolderSelectChange() {
  const select = document.getElementById("genFolderSelect");
  const newInput = document.getElementById("genFolderNewInput");
  if (!select || !newInput) return;

  if (select.value === "__new__") {
    newInput.style.display = "block";
  } else {
    newInput.style.display = "none";
    newInput.value = "";
  }
}

function renderGeneratorNav() {
  const nav = document.getElementById("generatorNav");
  nav.innerHTML = "";

  const gens = loadGenerators();
  const folderMap = {};

  gens.forEach((gen) => {
    const folder = gen.folder || "General";
    if (!folderMap[folder]) folderMap[folder] = [];
    folderMap[folder].push(gen);
  });

  const folderNames = Object.keys(folderMap).sort((a, b) => a.localeCompare(b));

  if (!folderNames.length) {
    nav.innerHTML =
      '<div class="muted" style="font-size:0.8rem; padding:4px 4px 8px;">No generators yet. Click ＋ to create one.</div>';
    return;
  }

  const q = (generatorSearchTerm || "").trim().toLowerCase();
  let hasAnyMatch = false;

  folderNames.forEach((folder) => {
    let gensInFolder = folderMap[folder].slice().sort((a, b) => a.name.localeCompare(b.name));

    if (q) {
      gensInFolder = gensInFolder.filter((g) =>
        String(g.name || "")
          .toLowerCase()
          .includes(q)
      );
    }

    if (!gensInFolder.length) return;

    hasAnyMatch = true;
    const count = gensInFolder.length;
    const collapsed = folderState[folder] && folderState[folder].collapsed;

    const heading = document.createElement("div");
    heading.className = "nav-folder-heading";
    heading.dataset.folder = folder;
    heading.innerHTML = `
      <span class="folder-toggle">
        <span class="folder-arrow">${collapsed ? "▸" : "▾"}</span>
        <span class="folder-label">${folder}</span>
        <span class="folder-badge">(${count})</span>
      </span>
      <button class="folder-rename-btn btn-secondary btn-small" type="button">✎</button>
    `;
    nav.appendChild(heading);

    if (!collapsed) {
      gensInFolder.forEach((gen) => {
        const item = document.createElement("div");
        item.className = "nav-generator";
        item.dataset.id = gen.id;

        const isActive =
          activeGenerator && activeGenerator.id === gen.id && !activeToolId;
        if (isActive) item.classList.add("active");

        item.innerHTML = `<span class="name">${gen.name}</span>`;
        nav.appendChild(item);
      });
    }
  });

  if (!hasAnyMatch && q) {
    nav.innerHTML = `<div class="muted" style="font-size:0.8rem; padding:4px 4px 8px;">No generators match “${generatorSearchTerm}”.</div>`;
  }
}

function renderToolsNav() {
  const nav = document.getElementById("toolsNav");
  if (!nav) return;

  const q = (toolSearchTerm || "").trim().toLowerCase();
  const filtered = window.toolsConfig.filter((t) =>
    t.name.toLowerCase().includes(q)
  );

  nav.innerHTML = "";

  if (!filtered.length) {
    nav.innerHTML =
      `<div class="muted" style="font-size:0.78rem; padding:2px 4px 4px;">No tools match “${toolSearchTerm}”.</div>`;
  } else {
    filtered.forEach((tool) => {
      const div = document.createElement("div");
      div.className = "nav-tool";
      div.dataset.id = tool.id;
      if (tool.id === activeToolId) div.classList.add("active");
      div.innerHTML = `<span class="name">${tool.name}</span>`;
      nav.appendChild(div);
    });
  }
}

// Core tool rendering – text cleaner + dice roller, BUT first
// we let any registered tool (via window.registerTool) render itself.
function renderToolPanel(toolId) {
  const label = document.getElementById("activeGeneratorLabel");
  const panel = document.getElementById("generatorPanel");
  if (!label || !panel) return;

  // Reset panel
  panel.innerHTML = "";
  panel.removeEventListener("click", handleCopyClick);

  // 1) If a registered tool exists, let it render itself.
  const renderer =
    window.toolRenderers && typeof window.toolRenderers[toolId] === "function"
      ? window.toolRenderers[toolId]
      : null;

  if (renderer) {
    // Most tools will want the label + panel to work with
    renderer({ labelEl: label, panelEl: panel });
    return;
  }

  // 2) Fallback: built-in tools (textCleaner, diceRoller) live here.
  const tool = window.toolsConfig.find((t) => t.id === toolId);
  label.textContent = tool ? tool.name : "Tool";

  // --- Built-in Text Cleaner fallback ---
  if (toolId === "textCleaner") {
    panel.innerHTML = `
      <div class="muted" style="margin-bottom:4px;">
        Paste messy, numbered or multi-column text (e.g. <code>4 Arrogant 54 Logical</code>) below,
        click <b>Clean text</b>, then copy the cleaned list for your generators.
      </div>
      <div class="toolbox-row">
        <div class="toolbox-col">
          <label for="cleanInput">Raw text</label>
          <textarea id="cleanInput" placeholder="4 Arrogant 54 Logical&#10;5 Blunt 55 Love-struck&#10;..."></textarea>
        </div>
        <div class="toolbox-col">
          <label for="cleanOutput">Cleaned · one item per line</label>
          <textarea id="cleanOutput" readonly></textarea>
        </div>
      </div>
      <div class="row" style="margin-top:4px;">
        <button id="cleanRunBtn" class="btn-primary btn-small" type="button">
          Clean text
        </button>
        <button id="cleanCopyBtn" class="btn-secondary btn-small" type="button">
          Copy cleaned text
        </button>
      </div>
      <div id="copyMessage" class="copy-tip">Click an item or use “Copy cleaned text”.</div>
    `;

    const cleanRunBtn = panel.querySelector("#cleanRunBtn");
    const cleanCopyBtn = panel.querySelector("#cleanCopyBtn");
    const cleanInput = panel.querySelector("#cleanInput");
    const cleanOutput = panel.querySelector("#cleanOutput");

    if (cleanRunBtn && cleanInput && cleanOutput) {
      cleanRunBtn.addEventListener("click", () => {
        const raw = cleanInput.value || "";
        const cleaned = cleanTextForGenerator(raw);
        cleanOutput.value = cleaned;
      });

      cleanCopyBtn.addEventListener("click", () => {
        const val = cleanOutput.value || "";
        if (!val.trim()) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard
            .writeText(val)
            .then(() =>
              showCopyMessage(
                val.split("\n")[0] + (val.includes("\n") ? " ..." : "")
              )
            )
            .catch(() => showCopyMessage("Cleaned text"));
        } else {
          showCopyMessage("Cleaned text");
        }
      });
    }

    return;
  }

  // --- Built-in Dice Roller fallback ---
  if (toolId === "diceRoller") {
    panel.innerHTML = `
      <div class="muted" style="margin-bottom:4px;">
        Enter expressions like <code>1d20</code>, <code>4d6+2</code>, or <code>2d6+1d4+3</code>.
        Use <b>Adv</b>/<b>Dis</b> toggles for advantage / disadvantage (rolls the expression twice and picks high/low).
      </div>
      <div class="row">
        <div class="col">
          <label for="diceExprInput">Dice expression</label>
          <input id="diceExprInput" type="text" placeholder="e.g. 1d20+5" />
        </div>
        <div class="col">
          <label>&nbsp;</label>
          <button id="diceRollBtn" class="btn-primary">Roll</button>
        </div>
      </div>
      <div class="row">
        <div class="col">
          <label>Quick rolls</label>
          <div style="display:flex; flex-wrap:wrap; gap:4px;">
            <button class="btn-secondary btn-small dice-quick" data-exp="1d4">d4</button>
            <button class="btn-secondary btn-small dice-quick" data-exp="1d6">d6</button>
            <button class="btn-secondary btn-small dice-quick" data-exp="1d8">d8</button>
            <button class="btn-secondary btn-small dice-quick" data-exp="1d10">d10</button>
            <button class="btn-secondary btn-small dice-quick" data-exp="1d12">d12</button>
            <button class="btn-secondary btn-small dice-quick" data-exp="1d20">d20</button>
            <button class="btn-secondary btn-small dice-quick" data-exp="1d100">d100</button>
          </div>
        </div>
        <div class="col">
          <label>Advantage / Disadvantage</label>
          <div style="display:flex; flex-wrap:wrap; gap:4px;">
            <button id="diceAdvToggle" class="btn-secondary btn-small" type="button">Adv</button>
            <button id="diceDisToggle" class="btn-secondary btn-small" type="button">Dis</button>
          </div>
        </div>
      </div>
      <div id="diceResults" class="generated-list"></div>
      <div id="copyMessage" class="copy-tip">Click any line to copy the text. History shows last 10 rolls.</div>
    `;

    const exprInput = panel.querySelector("#diceExprInput");
    const rollBtn = panel.querySelector("#diceRollBtn");
    const quickButtons = panel.querySelectorAll(".dice-quick");
    const advToggle = panel.querySelector("#diceAdvToggle");
    const disToggle = panel.querySelector("#diceDisToggle");
    const resultsDiv = panel.querySelector("#diceResults");

    let advMode = null;
    let history = [];

    function setAdvMode(mode) {
      advMode = mode;
      advToggle.classList.remove("toggle-active");
      disToggle.classList.remove("toggle-active");
      if (mode === "adv") advToggle.classList.add("toggle-active");
      if (mode === "dis") disToggle.classList.add("toggle-active");
    }

    function addHistoryLine(line) {
      history.unshift(line);
      if (history.length > 10) history.pop();
      renderHistory();
    }

    function renderHistory() {
      resultsDiv.innerHTML = "";
      const frag = document.createDocumentFragment();
      history.forEach((line) => {
        const div = document.createElement("div");
        div.className = "generated-item";
        div.textContent = line;
        frag.appendChild(div);
      });
      resultsDiv.appendChild(frag);
      resultsDiv.addEventListener("click", handleCopyClick);
    }

    function doExprRoll() {
      let expr = (exprInput.value || "").trim();
      if (!expr) expr = "1d20";
      try {
        if (!advMode) {
          const result = rollDiceExpression(expr);
          const seg = formatTermSegments(result.terms);
          const line = seg
            ? `${expr} = ${result.total} [${seg}]`
            : `${expr} = ${result.total}`;
          addHistoryLine(line);
        } else {
          const first = rollDiceExpression(expr);
          const second = rollDiceExpression(expr);
          const chosen =
            advMode === "adv"
              ? first.total >= second.total
                ? first
                : second
              : first.total <= second.total
              ? first
              : second;
          const other = chosen === first ? second : first;
          const seg1 = formatTermSegments(first.terms);
          const seg2 = formatTermSegments(second.terms);
          const labelMode = advMode === "adv" ? "adv" : "dis";
          const line = `${expr} (${labelMode}) = ${chosen.total} [${first.total} (${seg1}) vs ${second.total} (${seg2})]`;
          addHistoryLine(line);
        }
      } catch (err) {
        const msg = err && err.message ? err.message : "Invalid expression.";
        addHistoryLine(`Error: ${msg}`);
      }
    }

    rollBtn.addEventListener("click", doExprRoll);
    exprInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doExprRoll();
      }
    });

    quickButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const exp = btn.dataset.exp;
        if (!exp) return;
        exprInput.value = exp;
        doExprRoll();
      });
    });

    advToggle.addEventListener("click", () => {
      if (advMode === "adv") {
        setAdvMode(null);
      } else {
        setAdvMode("adv");
      }
    });

    disToggle.addEventListener("click", () => {
      if (advMode === "dis") {
        setAdvMode(null);
      } else {
        setAdvMode("dis");
      }
    });

    return;
  }

  // 3) If nothing matches:
  panel.innerHTML = `<div class="muted">Tool not implemented yet.</div>`;
}


function renderMainPanel() {
  const label = document.getElementById("activeGeneratorLabel");
  const panel = document.getElementById("generatorPanel");
  if (!panel || !label) return;

  // Clean up any tool-specific panel classes from prior tools
  panel.classList.remove("encounter-tool-panel");
  panel.classList.remove("monster-vault-panel");
  panel.classList.remove("statblock-importer-panel");

  panel.innerHTML = "";
  panel.removeEventListener("click", handleCopyClick);

  if (activeToolId) {
    window.renderToolPanel(activeToolId);
    return;
  }

  if (!activeGenerator) {
    label.textContent = "No generator or tool selected";
    panel.innerHTML =
      '<div class="muted">Choose a generator or tool from the left, or click ＋ to create a new generator.</div>';
    return;
  }

  const gens = loadGenerators();
  const gen = gens.find((g) => g.id === activeGenerator.id);
  if (!gen) {
    label.textContent = "Generator not found";
    panel.innerHTML =
      '<div class="muted">This generator no longer exists. Choose another one.</div>';
    return;
  }

  label.textContent = `${gen.name} · ${gen.folder || "General"}`;

  if (gen.type === "list") {
    panel.innerHTML = `
      <div class="muted" style="margin-bottom:4px;">
        List generator · ${gen.items.length} items in pool.
      </div>
      <div class="row">
        <div class="col">
          <label for="customCountInput">Count</label>
          <input id="customCountInput" type="number" min="1" max="50" value="10">
        </div>
        <div class="col">
          <label>&nbsp;</label>
          <button id="customGenerateBtn" class="btn-primary">Generate</button>
        </div>
      </div>
      <div id="customResults" class="generated-list"></div>
      <div id="copyMessage" class="copy-tip">Click an item to copy.</div>
      <div class="row" style="margin-top:6px;">
        <button id="customEditBtn" class="btn-secondary btn-small">Edit generator</button>
        <button id="customDeleteBtn" class="btn-secondary btn-small">Delete generator</button>
      </div>
    `;

    const countInput = panel.querySelector("#customCountInput");
    const genBtn = panel.querySelector("#customGenerateBtn");
    const editBtn = panel.querySelector("#customEditBtn");
    const delBtn = panel.querySelector("#customDeleteBtn");
    const results = panel.querySelector("#customResults");

    genBtn.addEventListener("click", () => {
      const pool = [...gen.items];
      const count = Math.max(
        1,
        Math.min(50, parseInt(countInput.value || "1", 10))
      );
      results.innerHTML = "";
      const frag = document.createDocumentFragment();
      if (!pool.length) return;
      for (let i = 0; i < count; i++) {
        if (!pool.length) break;
        const idx = Math.floor(Math.random() * pool.length);
        const value = pool.splice(idx, 1)[0];
        const div = document.createElement("div");
        div.className = "generated-item";
        div.textContent = value;
        frag.appendChild(div);
      }
      results.appendChild(frag);
    });

    results.addEventListener("click", handleCopyClick);

    editBtn.addEventListener("click", () => {
      openEditGeneratorBox(gen.id);
    });

    delBtn.addEventListener("click", () => {
      const ok = window.confirm(
        `Delete generator “${gen.name}” from folder “${gen.folder || "General"}”?`
      );
      if (!ok) return;
      const newList = gens.filter((g) => g.id !== gen.id);
      saveGenerators(newList);
      if (activeGenerator && activeGenerator.id === gen.id) {
        activeGenerator = null;
      }
      renderGeneratorNav();
      renderMainPanel();
    });

    return;
  }

  if (gen.type === "lexicon") {
    panel.innerHTML = `
      <div class="muted" style="margin-bottom:4px;">
        Lexicon · ${gen.items.length} entries.
      </div>

      <div class="row">
        <div class="col">
          <label for="lexMode">Direction</label>
          <select id="lexMode">
            <option value="en-to-va">Common → Valathi</option>
            <option value="va-to-en">Valathi → Common</option>
          </select>
        </div>
        <div class="col">
          <label for="lexQuery">Word</label>
          <input id="lexQuery" type="text" placeholder="Type a word to look up">
        </div>
        <div class="col">
          <label>&nbsp;</label>
          <button id="lexSearchBtn" class="btn-primary">Translate</button>
        </div>
      </div>

      <div id="lexResult" class="generated-list"></div>
      <div id="copyMessage" class="copy-tip">Click an item to copy.</div>

      <div class="row" style="margin-top:6px;">
        <button id="lexManageOpenBtn" class="btn-secondary btn-small">Manage lexicon</button>
      </div>
    `;

    const lexMode = panel.querySelector("#lexMode");
    const lexQuery = panel.querySelector("#lexQuery");
    const lexSearchBtn = panel.querySelector("#lexSearchBtn");
    const lexResult = panel.querySelector("#lexResult");
    const lexManageOpenBtn = panel.querySelector("#lexManageOpenBtn");

    function searchLexicon(items, query, mode) {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      if (mode === "en-to-va") {
        return items.filter((e) =>
          String(e.english)
            .toLowerCase()
            .includes(q)
        );
      } else {
        return items.filter((e) =>
          String(e.valathi)
            .toLowerCase()
            .includes(q)
        );
      }
    }

    function doSearch() {
      const gensCurrent = loadGenerators();
      const g = gensCurrent.find((x) => x.id === gen.id);
      if (!g) return;

      const items = Array.isArray(g.items) ? g.items : [];
      const mode = lexMode.value;
      const q = lexQuery.value;
      const matches = searchLexicon(items, q, mode);
      lexResult.innerHTML = "";

      if (!q.trim()) {
        lexResult.innerHTML =
          '<div class="muted">Type a word and click Translate.</div>';
        return;
      }

      if (!matches.length) {
        lexResult.innerHTML = `<div class="muted">No entries found for "${q}".</div>`;
        return;
      }

      const frag = document.createDocumentFragment();
      for (const e of matches) {
        const div = document.createElement("div");
        div.className = "generated-item";
        if (mode === "en-to-va") {
          div.textContent = `${e.english} → ${e.valathi}`;
        } else {
          div.textContent = `${e.valathi} → ${e.english}`;
        }
        frag.appendChild(div);
      }
      lexResult.appendChild(frag);
    }

    lexSearchBtn.addEventListener("click", doSearch);
    lexQuery.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doSearch();
      }
    });

    lexResult.addEventListener("click", handleCopyClick);

    lexManageOpenBtn.addEventListener("click", () => {
      openLexManageBox(gen.id);
    });

    return;
  }

  if (gen.type === "advanced") {
    const items = gen.items || {};
    const patterns = Array.isArray(items.patterns) ? items.patterns : [];
    const simpleTokenMap =
      items.tokenMap && typeof items.tokenMap === "object" ? items.tokenMap : {};
    const multiTokenMap =
      items.multiTokenMap && typeof items.multiTokenMap === "object"
        ? items.multiTokenMap
        : {};
    const patternsText = patterns.join("\n");

    panel.innerHTML = `
      <div class="muted" style="margin-bottom:4px;">
        Advanced generator · uses <code>{Tokens}</code> and your other list generators.
      </div>

      <div class="row">
        <div class="col">
          <label for="advCountInput">Count</label>
          <input id="advCountInput" type="number" min="1" max="50" value="10">
        </div>
        <div class="col">
          <label>&nbsp;</label>
          <button id="advGenerateBtn" class="btn-primary">Generate</button>
        </div>
      </div>

      <div id="advResults" class="generated-list"></div>
      <div id="copyMessage" class="copy-tip">Click an item to copy.</div>

      <div class="row" style="margin-top:6px;">
        <button id="advMetaEditBtn" class="btn-secondary btn-small">Edit generator</button>
        <button id="advTemplateBtn" class="btn-secondary btn-small">Edit template</button>
        <button id="advDeleteBtn" class="btn-secondary btn-small">Delete generator</button>
      </div>
    `;

    const advCountInput = panel.querySelector("#advCountInput");
    const advGenerateBtn = panel.querySelector("#advGenerateBtn");
    const advResults = panel.querySelector("#advResults");
    const advMetaEditBtn = panel.querySelector("#advMetaEditBtn");
    const advTemplateBtn = panel.querySelector("#advTemplateBtn");
    const advDeleteBtn = panel.querySelector("#advDeleteBtn");

    advGenerateBtn.addEventListener("click", () => {
      const gensLatest = loadGenerators();
      const gCurrent = gensLatest.find((x) => x.id === gen.id);
      if (!gCurrent || gCurrent.type !== "advanced") return;
      const advItems = gCurrent.items || {};
      const patternsNow = Array.isArray(advItems.patterns) ? advItems.patterns : [];
      const simpleMapNow =
        advItems.tokenMap && typeof advItems.tokenMap === "object"
          ? advItems.tokenMap
          : {};
      const multiMapNow =
        advItems.multiTokenMap && typeof advItems.multiTokenMap === "object"
          ? advItems.multiTokenMap
          : {};
      const modeNow =
        advItems.advancedMode === "advanced" ? "advanced" : "simple";

      advResults.innerHTML = "";

      if (!patternsNow.length) {
        advResults.innerHTML =
          '<div class="muted">No patterns defined yet. Click “Edit template” and add at least one pattern.</div>';
        return;
      }

      const count = Math.max(
        1,
        Math.min(50, parseInt(advCountInput.value || "1", 10))
      );
      const genById = {};
      gensLatest.forEach((x) => {
        genById[x.id] = x;
      });

      const frag = document.createDocumentFragment();

      for (let i = 0; i < count; i++) {
        const pattern = rand(patternsNow);
        const tokensInPattern = extractTokensFromPatterns([pattern]);
        let result = pattern;

        tokensInPattern.forEach((tok) => {
          let chosenGenId = null;
          if (modeNow === "advanced") {
            const listIds = multiMapNow[tok];
            if (Array.isArray(listIds) && listIds.length) {
              chosenGenId = rand(listIds);
            } else if (simpleMapNow[tok]) {
              chosenGenId = simpleMapNow[tok];
            }
          } else {
            chosenGenId = simpleMapNow[tok];
          }

          if (!chosenGenId) return;
          const srcGen = genById[chosenGenId];
          if (
            !srcGen ||
            srcGen.type !== "list" ||
            !Array.isArray(srcGen.items) ||
            !srcGen.items.length
          )
            return;

          const value = rand(srcGen.items);
          const re = new RegExp(
            "\\{" + tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\}",
            "g"
          );
          result = result.replace(re, value);
        });

        const div = document.createElement("div");
        div.className = "generated-item";
        div.textContent = result;
        frag.appendChild(div);
      }

      advResults.appendChild(frag);
      advResults.addEventListener("click", handleCopyClick);
    });

    advMetaEditBtn.addEventListener("click", () => {
      openEditGeneratorBox(gen.id);
    });

    advTemplateBtn.addEventListener("click", () => {
      openAdvTemplateBox(gen.id, patternsText, simpleTokenMap, multiTokenMap);
    });

    advDeleteBtn.addEventListener("click", () => {
      const gensCurrent = loadGenerators();
      const ok = window.confirm(
        `Delete generator “${gen.name}” from folder “${gen.folder || "General"}”?`
      );
      if (!ok) return;
      const newList = gensCurrent.filter((gx) => gx.id !== gen.id);
      saveGenerators(newList);
      if (activeGenerator && activeGenerator.id === gen.id) {
        activeGenerator = null;
      }
      renderGeneratorNav();
      renderMainPanel();
    });

    return;
  }

  panel.innerHTML = `<div class="muted">Unknown generator type.</div>`;
}

// === Generator create/edit modals, lexicon modal, adv template modal, DB upload/download, nav handlers ===
// (All of this is identical to your working inline version, just moved here and with catch blocks fixed.)

function openNewGeneratorBox() {
  editingGeneratorId = null;
  const box = document.getElementById("generatorCreateBox");
  const msg = document.getElementById("generatorCreateMessage");
  const nameInput = document.getElementById("genNameInput");
  const itemsInput = document.getElementById("genItemsInput");
  const saveBtn = document.getElementById("saveGeneratorBtn");
  const expandBtn = document.getElementById("expandItemsBtn");
  const typeInput = document.getElementById("genTypeInput");
  const newFolderInput = document.getElementById("genFolderNewInput");
  const itemsRow = document.getElementById("genItemsRow");

  populateFolderSelect("General");

  nameInput.value = "";
  itemsInput.value = "";
  itemsInput.classList.remove("items-expanded");
  itemsExpanded = false;
  expandBtn.textContent = "Expand list editor";
  msg.textContent = "";
  msg.classList.remove("danger");
  saveBtn.textContent = "Save generator";
  typeInput.disabled = false;
  typeInput.value = "list";
  newFolderInput.value = "";
  newFolderInput.style.display = "none";

  itemsRow.style.display = "block";

  box.style.display = "flex";
}

function openEditGeneratorBox(genId) {
  const gens = loadGenerators();
  const gen = gens.find((g) => g.id === genId);
  if (!gen) return;

  editingGeneratorId = genId;
  const box = document.getElementById("generatorCreateBox");
  const msg = document.getElementById("generatorCreateMessage");
  const nameInput = document.getElementById("genNameInput");
  const itemsInput = document.getElementById("genItemsInput");
  const saveBtn = document.getElementById("saveGeneratorBtn");
  const expandBtn = document.getElementById("expandItemsBtn");
  const typeInput = document.getElementById("genTypeInput");
  const newFolderInput = document.getElementById("genFolderNewInput");
  const itemsRow = document.getElementById("genItemsRow");

  populateFolderSelect(gen.folder || "General");

  nameInput.value = gen.name || "";
  msg.textContent = "";
  msg.classList.remove("danger");

  if (gen.type === "lexicon") {
    const arr = Array.isArray(gen.items) ? gen.items : [];
    itemsInput.value = arr.map((e) => `${e.english} = ${e.valathi}`).join("\n");
    itemsRow.style.display = "block";
  } else if (gen.type === "list") {
    const arr = Array.isArray(gen.items) ? gen.items : [];
    itemsInput.value = arr.join("\n");
    itemsRow.style.display = "block";
  } else {
    itemsInput.value = "";
    itemsRow.style.display = "none";
  }

  itemsInput.classList.remove("items-expanded");
  itemsExpanded = false;
  expandBtn.textContent = "Expand list editor";

  saveBtn.textContent = "Save changes";

  typeInput.disabled = true;
  typeInput.value = gen.type;
  newFolderInput.value = "";
  newFolderInput.style.display = "none";

  box.style.display = "flex";
}

function hideGeneratorCreateBox() {
  const box = document.getElementById("generatorCreateBox");
  const msg = document.getElementById("generatorCreateMessage");
  const itemsInput = document.getElementById("genItemsInput");
  const expandBtn = document.getElementById("expandItemsBtn");
  const newFolderInput = document.getElementById("genFolderNewInput");

  document.getElementById("genNameInput").value = "";
  itemsInput.value = "";
  msg.textContent = "";
  msg.classList.remove("danger");
  editingGeneratorId = null;

  itemsInput.classList.remove("items-expanded");
  itemsExpanded = false;
  expandBtn.textContent = "Expand list editor";
  newFolderInput.value = "";
  newFolderInput.style.display = "none";

  box.style.display = "none";
}

// Lexicon manage box
function openLexManageBox(genId) {
  const gens = loadGenerators();
  const gen = gens.find((g) => g.id === genId);
  if (!gen || gen.type !== "lexicon") return;

  const box = document.getElementById("lexManageBox");
  const title = document.getElementById("lexManageTitle");
  const msg = document.getElementById("lexManageMessage");
  const body = document.getElementById("lexManageBody");
  if (!box || !title || !msg || !body) return;

  title.textContent = `Manage Lexicon – ${gen.name}`;
  msg.textContent = `Folder: ${gen.folder || "General"} · ${gen.items.length} entries.`;
  msg.classList.remove("danger");

  body.innerHTML = `
    <div class="row">
      <div class="col">
        <label for="lexManageAddInput">Add entries (english = valathi)</label>
        <textarea id="lexManageAddInput" placeholder="high = val&#10;forest = ’ath"></textarea>
      </div>
    </div>
    <div class="row">
      <button id="lexManageAppendBtn" class="btn-secondary btn-small">Append from text</button>
      <button id="lexManageImportBtn" class="btn-secondary btn-small">Import from JSON/HTML</button>
      <button id="lexManageDownloadBtn" class="btn-secondary btn-small">Download JSON</button>
      <button id="lexManageRawEditBtn" class="btn-secondary btn-small">Edit as raw</button>
      <button id="lexManageDeleteBtn" class="btn-secondary btn-small">Delete generator</button>
    </div>
    <input type="file" id="lexManageFileInput" accept=".json,.txt,.html" style="display:none;">
    <div class="section-title" style="margin-top:8px;">
      <span>All entries</span>
      <span class="muted" style="font-size:0.75rem;">Click to copy "english = valathi"</span>
    </div>
    <div id="lexManageEntries" class="generated-list"></div>
  `;

  function renderAllEntriesListLex(items) {
    const listDiv = document.getElementById("lexManageEntries");
    if (!listDiv) return;
    listDiv.innerHTML = "";
    const sorted = [...items].sort((a, b) =>
      String(a.english).localeCompare(String(b.english))
    );
    const frag = document.createDocumentFragment();
    sorted.forEach((e) => {
      const div = document.createElement("div");
      div.className = "generated-item";
      div.textContent = `${e.english} = ${e.valathi}`;
      frag.appendChild(div);
    });
    listDiv.appendChild(frag);
    listDiv.addEventListener("click", handleCopyClick);
  }

  renderAllEntriesListLex(gen.items || []);

  const addInput = body.querySelector("#lexManageAddInput");
  const appendBtn = body.querySelector("#lexManageAppendBtn");
  const importBtn = body.querySelector("#lexManageImportBtn");
  const downloadBtn = body.querySelector("#lexManageDownloadBtn");
  const rawEditBtn = body.querySelector("#lexManageRawEditBtn");
  const deleteBtn = body.querySelector("#lexManageDeleteBtn");
  const fileInput = body.querySelector("#lexManageFileInput");

  appendBtn.addEventListener("click", () => {
    const raw = addInput.value || "";
    if (!raw.trim()) {
      msg.textContent = "No text to append.";
      msg.classList.add("danger");
      return;
    }
    const { items: newItems, duplicates } = parseLexiconText(raw);
    if (!newItems.length) {
      msg.textContent =
        "No valid entries found. Use 'english = valathi'.";
      msg.classList.add("danger");
      return;
    }
    const gensCurrent = loadGenerators();
    const idx = gensCurrent.findIndex((x) => x.id === gen.id);
    if (idx === -1) return;
    const before = Array.isArray(gensCurrent[idx].items)
      ? gensCurrent[idx].items
      : [];
    const merged = mergeLexiconEntries(before, newItems);
    const added = merged.length - before.length;

    gensCurrent[idx].items = merged;
    saveGenerators(gensCurrent);
    addInput.value = "";

    msg.classList.remove("danger");
    msg.textContent = `Appended ${added} entries. ${
      duplicates > 0 ? duplicates + " duplicate lines removed." : "No duplicates in input."
    }`;
    renderAllEntriesListLex(merged);
    renderMainPanel();
  });

  importBtn.addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
  });

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    let imported = [];
    const text = await file.text();

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item) continue;
          if (typeof item === "string") {
            const { items } = parseLexiconText(item);
            imported = imported.concat(items);
          } else if (typeof item === "object") {
            const english =
              item.english || item.en || item.word || item.key || "";
            const valathi =
              item.valathi || item.va || item.value || "";
            if (english && valathi) {
              imported.push({ english, valathi });
            }
          }
        }
      } else if (typeof parsed === "object") {
        for (const key in parsed) {
          if (!Object.prototype.hasOwnProperty.call(parsed, key)) continue;
          const english = key;
          const valathi = parsed[key];
          if (english && valathi) {
            imported.push({ english, valathi });
          }
        }
      }
    } catch (err) {
      console.error("Error parsing imported lexicon:", err);
    }

    if (!imported.length) {
      msg.textContent = "No valid entries found in file.";
      msg.classList.add("danger");
      return;
    }

    const gensCurrent = loadGenerators();
    const idx = gensCurrent.findIndex((x) => x.id === gen.id);
    if (idx === -1) return;

    const before = Array.isArray(gensCurrent[idx].items)
      ? gensCurrent[idx].items
      : [];
    const merged = mergeLexiconEntries(before, imported);
    const added = merged.length - before.length;

    gensCurrent[idx].items = merged;
    saveGenerators(gensCurrent);
    msg.classList.remove("danger");
    msg.textContent = `Imported ${added} new entries from file.`;
    renderAllEntriesListLex(merged);
    renderMainPanel();
  });

  downloadBtn.addEventListener("click", () => {
    const gensCurrent = loadGenerators();
    const g = gensCurrent.find((x) => x.id === gen.id);
    if (!g) return;
    const dataStr = JSON.stringify(g.items || [], null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${g.name.replace(/\s+/g, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  rawEditBtn.addEventListener("click", () => {
    openEditGeneratorBox(gen.id);
  });

  deleteBtn.addEventListener("click", () => {
    const ok = window.confirm(
      `Delete lexicon “${gen.name}” from folder “${gen.folder || "General"}”?`
    );
    if (!ok) return;
    const newList = gens.filter((gx) => gx.id !== gen.id);
    saveGenerators(newList);
    if (activeGenerator && activeGenerator.id === gen.id) {
      activeGenerator = null;
    }
    closeLexManageBox();
    renderGeneratorNav();
    renderMainPanel();
  });

  box.style.display = "flex";
}

function closeLexManageBox() {
  const box = document.getElementById("lexManageBox");
  const body = document.getElementById("lexManageBody");
  const msg = document.getElementById("lexManageMessage");
  if (body) body.innerHTML = "";
  if (msg) {
    msg.textContent = "";
    msg.classList.remove("danger");
  }
  if (box) box.style.display = "none";
}

// ========== Advanced template modal (patterns & mappings) ==========

function openAdvTemplateBox(genId) {
  const gens = loadGenerators();
  const gen = gens.find((g) => g.id === genId);
  if (!gen || gen.type !== "advanced") return;

  advTemplateGenId = genId;

  const box = document.getElementById("advTemplateBox");
  const title = document.getElementById("advTemplateTitle");
  const msg = document.getElementById("advTemplateMessage");
  const body = document.getElementById("advTemplateBody");
  const helpBtn = document.getElementById("advTemplateHelpBtn");

  if (!box || !title || !msg || !body) return;

  const items = gen.items || {};
  const patterns = Array.isArray(items.patterns) ? items.patterns : [];
  const simpleTokenMap =
    items.tokenMap && typeof items.tokenMap === "object" ? items.tokenMap : {};
  const multiTokenMap =
    items.multiTokenMap && typeof items.multiTokenMap === "object"
      ? items.multiTokenMap
      : {};
  const savedMode = items.advancedMode === "advanced" ? "advanced" : "simple";
  const patternsText = patterns.join("\n");
  const allTokens = extractTokensFromPatterns(patterns);

  title.textContent = `Edit Template – ${gen.name}`;
  msg.textContent =
    "Configure patterns and which generators each token pulls from.";
  msg.classList.remove("danger");

  body.innerHTML = `
    <div id="advTemplateHelpBlock" class="muted" style="display:none; font-size:0.78rem; margin-bottom:6px; border:1px solid #232a33; border-radius:8px; padding:6px 8px; background:#05070c;">
      <b>How this works:</b><br/>
      • <b>Patterns</b> are sentence-like strings using <code>{Tokens}</code>, e.g. <code>{Name} is a {Race} from {Hometown}</code>.<br/>
      • Each <code>{Token}</code> pulls from one or more <b>list generators</b> you’ve already created.<br/>
      • <b>Simple</b> mode: each token is mapped to exactly one list generator.<br/>
      • <b>Advanced</b> mode: each token can have multiple list generators; on use, one of them is chosen at random.<br/>
      • You can mix both: use Simple for most tokens, Advanced only where you need variety.
    </div>

    <div class="row">
      <div class="col">
        <label for="advPatternsInput">Patterns (one per line)</label>
        <textarea id="advPatternsInput" placeholder="{Name} is a {Race} from {Hometown}, known for {Trait}.">${patternsText}</textarea>
      </div>
    </div>

    <div class="section-title" style="margin-top:4px;">
      <span>Token mappings</span>
    </div>
    <div class="muted" style="font-size:0.78rem; margin-bottom:4px;">
      <b>Simple tab:</b> one generator per token. <b>Advanced tab:</b> for each token, search and click to add multiple generators.  
      On use, one of those generators is chosen at random.
    </div>

    <div class="adv-tab-bar">
      <button type="button" class="adv-tab" data-mode="simple">Simple</button>
      <button type="button" class="adv-tab" data-mode="advanced">Advanced</button>
    </div>

    <div id="advTokensSimpleContainer"></div>
    <div id="advTokensAdvancedContainer" style="display:none; margin-top:4px;"></div>

    <div class="muted" style="font-size:0.75rem; margin-top:4px;">
      <b>Advanced mode tips:</b><br/>
      • Start typing to search your list generators.<br/>
      • Click a result to add it as a chip.<br/>
      • Click ✕ on a chip to remove it.
    </div>

    <div class="row" style="margin-top:6px;">
      <button id="advTemplateSaveBtn" class="btn-primary btn-small">Save template & mappings</button>
    </div>
  `;

  const advPatternsInput = body.querySelector("#advPatternsInput");
  const advTokensSimpleContainer = body.querySelector(
    "#advTokensSimpleContainer"
  );
  const advTokensAdvancedContainer = body.querySelector(
    "#advTokensAdvancedContainer"
  );
  const advTemplateSaveBtn = body.querySelector("#advTemplateSaveBtn");
  const advTabs = body.querySelectorAll(".adv-tab");
  const helpBlock = body.querySelector("#advTemplateHelpBlock");

  let advMode = savedMode;

  function setAdvMode(mode) {
    advMode = mode === "advanced" ? "advanced" : "simple";
    advTabs.forEach((btn) => {
      if (btn.dataset.mode === advMode) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
    if (advMode === "simple") {
      advTokensSimpleContainer.style.display = "block";
      advTokensAdvancedContainer.style.display = "none";
    } else {
      advTokensSimpleContainer.style.display = "none";
      advTokensAdvancedContainer.style.display = "block";
    }
  }

  function renderTokenMappingsSimple(tokens, map) {
    if (!tokens.length) {
      advTokensSimpleContainer.innerHTML = `<div class="muted" style="margin-top:4px;">No tokens found yet. Add <code>{Token}</code> placeholders to your patterns above, then save.</div>`;
      return;
    }
    const gensAll = loadGenerators();
    const listGenerators = gensAll.filter((g) => g.type === "list");
    const table = document.createElement("table");
    table.className = "token-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th style="width:20%;">Token</th>
          <th>Source generator (list)</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    tokens.forEach((token) => {
      const tr = document.createElement("tr");
      const optionsHtml = [
        `<option value="">— none —</option>`,
        ...listGenerators.map(
          (g) => `<option value="${g.id}">${g.name}</option>`
        ),
      ].join("");
      tr.innerHTML = `
        <td>{${token}}</td>
        <td>
          <select class="adv-token-select" data-token="${token}">
            ${optionsHtml}
          </select>
        </td>
      `;
      tbody.appendChild(tr);
    });

    advTokensSimpleContainer.innerHTML = "";
    advTokensSimpleContainer.appendChild(table);

    const selects = advTokensSimpleContainer.querySelectorAll(
      ".adv-token-select"
    );
    selects.forEach((sel) => {
      const tok = sel.dataset.token;
      const mappedId = map[tok] || "";
      if (mappedId) sel.value = mappedId;
    });
  }

  function refreshAdvancedSelectedChips(wrapper, selectedIds, listGenerators) {
    const chipsContainer = wrapper.querySelector(".adv-selected-chips");
    chipsContainer.innerHTML = "";
    const frag = document.createDocumentFragment();

    selectedIds.forEach((id) => {
      const g = listGenerators.find((x) => x.id === id);
      if (!g) return;
      const span = document.createElement("span");
      span.className = "adv-chip";
      span.dataset.id = id;
      span.textContent = g.name;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "adv-chip-remove";
      btn.textContent = "✕";
      span.appendChild(btn);
      frag.appendChild(span);
    });

    chipsContainer.appendChild(frag);
  }

  function renderTokenMappingsAdvanced(tokens, map) {
    if (!tokens.length) {
      advTokensAdvancedContainer.innerHTML = `<div class="muted" style="margin-top:4px;">No tokens to configure yet. Once you add <code>{Token}</code> placeholders and save, you can assign multiple generators per token here.</div>`;
      return;
    }
    const gensAll = loadGenerators();
    const listGenerators = gensAll.filter((g) => g.type === "list");
    advTokensAdvancedContainer.__listGenerators = listGenerators;

    const table = document.createElement("table");
    table.className = "token-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th style="width:20%;">Token</th>
          <th>Allowed generators (search & click)</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    tokens.forEach((token) => {
      const tr = document.createElement("tr");
      const tdToken = document.createElement("td");
      tdToken.textContent = `{${token}}`;
      const tdUi = document.createElement("td");

      const wrapper = document.createElement("div");
      wrapper.className = "adv-token-advanced";
      wrapper.dataset.token = token;

      wrapper.innerHTML = `
        <div class="adv-selected-chips"></div>
        <input type="text" class="adv-search-input" placeholder="Search generators...">
        <div class="adv-search-results muted">Type to search your list generators…</div>
      `;

      tdUi.appendChild(wrapper);
      tr.appendChild(tdToken);
      tr.appendChild(tdUi);
      tbody.appendChild(tr);
    });

    advTokensAdvancedContainer.innerHTML = "";
    advTokensAdvancedContainer.appendChild(table);

    tokens.forEach((token) => {
      const wrapper = advTokensAdvancedContainer.querySelector(
        `.adv-token-advanced[data-token="${token}"]`
      );
      if (!wrapper) return;
      const selectedIds = Array.isArray(map[token]) ? map[token] : [];
      refreshAdvancedSelectedChips(wrapper, selectedIds, listGenerators);
    });
  }

  function handleAdvancedSearchInput(e) {
    const input = e.target;
    if (!input.classList.contains("adv-search-input")) return;
    const wrapper = input.closest(".adv-token-advanced");
    if (!wrapper) return;

    const listGenerators = advTokensAdvancedContainer.__listGenerators || [];
    const resultsDiv = wrapper.querySelector(".adv-search-results");
    const q = (input.value || "").trim().toLowerCase();

    const selectedIds = Array.from(wrapper.querySelectorAll(".adv-chip")).map(
      (chip) => chip.dataset.id
    );

    if (!q) {
      resultsDiv.textContent = "Type to search your list generators…";
      return;
    }

    const matches = listGenerators
      .filter(
        (g) => g.name.toLowerCase().includes(q) && !selectedIds.includes(g.id)
      )
      .slice(0, 10);

    if (!matches.length) {
      resultsDiv.textContent = "No matches.";
      return;
    }

    resultsDiv.innerHTML = "";
    const frag = document.createDocumentFragment();
    matches.forEach((g) => {
      const div = document.createElement("div");
      div.className = "adv-search-item";
      div.dataset.id = g.id;
      div.textContent = g.name;
      frag.appendChild(div);
    });
    resultsDiv.appendChild(frag);
  }

  function handleAdvancedClick(e) {
    const listGenerators = advTokensAdvancedContainer.__listGenerators || [];

    const removeBtn = e.target.closest(".adv-chip-remove");
    if (removeBtn) {
      const chip = removeBtn.closest(".adv-chip");
      const wrapper = removeBtn.closest(".adv-token-advanced");
      if (!chip || !wrapper) return;
      chip.remove();
      return;
    }

    const searchItem = e.target.closest(".adv-search-item");
    if (searchItem) {
      const wrapper = searchItem.closest(".adv-token-advanced");
      if (!wrapper) return;
      const id = searchItem.dataset.id;
      const selectedIds = Array.from(
        wrapper.querySelectorAll(".adv-chip")
      ).map((chip) => chip.dataset.id);
      if (!selectedIds.includes(id)) {
        selectedIds.push(id);
      }
      refreshAdvancedSelectedChips(wrapper, selectedIds, listGenerators);

      const input = wrapper.querySelector(".adv-search-input");
      const resultsDiv = wrapper.querySelector(".adv-search-results");
      if (input) input.value = "";
      if (resultsDiv)
        resultsDiv.textContent = "Type to search your list generators…";
      return;
    }
  }

  renderTokenMappingsSimple(allTokens, simpleTokenMap);
  renderTokenMappingsAdvanced(allTokens, multiTokenMap);
  setAdvMode(savedMode);

  advTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      setAdvMode(btn.dataset.mode);
    });
  });

  advTokensAdvancedContainer.addEventListener("input", handleAdvancedSearchInput);
  advTokensAdvancedContainer.addEventListener("click", handleAdvancedClick);

  advTemplateSaveBtn.addEventListener("click", () => {
    const rawPatterns = (advPatternsInput.value || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const newTokens = extractTokensFromPatterns(rawPatterns);

    const gensCurrent = loadGenerators();
    const idx = gensCurrent.findIndex((x) => x.id === gen.id);
    if (idx === -1) return;

    const simpleMapNew = {};
    const simpleSelects =
      advTokensSimpleContainer.querySelectorAll(".adv-token-select");
    simpleSelects.forEach((sel) => {
      const tok = sel.dataset.token;
      const val = sel.value || "";
      if (tok && val) {
        simpleMapNew[tok] = val;
      }
    });

    const multiMapNew = {};
    const wrappers =
      advTokensAdvancedContainer.querySelectorAll(".adv-token-advanced");
    wrappers.forEach((wrapper) => {
      const tok = wrapper.dataset.token;
      const chips = wrapper.querySelectorAll(".adv-chip");
      const ids = Array.from(chips)
        .map((chip) => chip.dataset.id)
        .filter(Boolean);
      if (tok && ids.length) {
        multiMapNew[tok] = ids;
      }
    });

    gensCurrent[idx].items = gensCurrent[idx].items || {};
    gensCurrent[idx].items.patterns = rawPatterns;
    gensCurrent[idx].items.tokenMap = simpleMapNew;
    gensCurrent[idx].items.multiTokenMap = multiMapNew;
    gensCurrent[idx].items.advancedMode = advMode;

    saveGenerators(gensCurrent);

    renderTokenMappingsSimple(newTokens, simpleMapNew);
    renderTokenMappingsAdvanced(newTokens, multiMapNew);

    msg.classList.remove("danger");
    msg.textContent = `Saved ${rawPatterns.length} pattern(s), ${
      Object.keys(simpleMapNew).length
    } simple mapping(s), ${Object.keys(multiMapNew).length} advanced mapping(s), mode: ${
      advMode
    }.`;

    renderMainPanel();
  });

  if (helpBtn && helpBlock) {
    helpBtn.onclick = () => {
      const visible = helpBlock.style.display === "block";
      helpBlock.style.display = visible ? "none" : "block";
    };
  }

  box.style.display = "flex";
}

function closeAdvTemplateBox() {
  const box = document.getElementById("advTemplateBox");
  const body = document.getElementById("advTemplateBody");
  const msg = document.getElementById("advTemplateMessage");
  if (body) body.innerHTML = "";
  if (msg) {
    msg.textContent = "";
    msg.classList.remove("danger");
  }
  advTemplateGenId = null;
  if (box) box.style.display = "none";
}


// ============== DB download / upload ==============
function buildDatabaseBundleForExport() {
  const keys = {};
  for (const k of DB_BUNDLE_KEYS) {
    const val = safeReadLocalJson(k);
    if (val !== undefined) keys[k] = val;
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    keys
  };
}

function applyDatabaseBundle(bundle, { confirmReplace = true } = {}) {
  // Accept:
  // 1) Full bundle: { schemaVersion, generatedAt, keys: { ... } }
  // 2) Bare keys map: { "<localStorageKey>": <json>, ... }
  const normalized = normalizePublishedBundle(bundle) || (bundle && bundle.keys ? bundle : null);
  if (!normalized || !normalized.keys) {
    return { ok: false, message: "Not a recognized Vrahune toolbox database bundle." };
  }

  const incomingKeys = Object.keys(normalized.keys || {});
  const recognizedKeys = incomingKeys.filter((k) => DB_BUNDLE_KEYS.includes(k));

  if (!recognizedKeys.length) {
    return {
      ok: false,
      message: "This file doesn't contain any recognized toolbox data keys."
    };
  }

  if (confirmReplace) {
    const ok = window.confirm(
      "Uploading this database will overwrite your current local data for:\n\n" +
        recognizedKeys.map((k) => "• " + k).join("\n") +
        "\n\nContinue?"
    );
    if (!ok) return { ok: false, cancelled: true };
  }

  recognizedKeys.forEach((k) => {
    safeWriteLocalJson(k, normalized.keys[k]);
  });

  return { ok: true, keys: recognizedKeys };
}

function handleDownloadDatabase() {
  const bundle = buildDatabaseBundleForExport();
  const dataStr = JSON.stringify(bundle, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vrahune_database.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handleUploadDatabaseClick() {
  const input = document.getElementById("uploadDbFileInput");
  if (!input) return;
  input.value = "";
  input.click();
}

function handleUploadDatabaseFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const text = ev.target.result;
      const data = JSON.parse(text);

      // Back-compat: old exports were just the generators array
      const bundle = Array.isArray(data)
        ? { schemaVersion: 1, generatedAt: null, keys: { [GEN_STORAGE_KEY]: data } }
        : data;

      const applied = applyDatabaseBundle(bundle, { confirmReplace: true });
      if (!applied.ok) {
        if (!applied.cancelled) {
          window.alert(applied.message || "Failed to apply database.");
        }
        return;
      }

      activeGenerator = null;
      activeToolId = null;
      folderState = loadFolderState();

      renderGeneratorNav();
      renderToolsNav();
      renderMainPanel();

      window.alert("Database uploaded and applied successfully.");
    } catch (err) {
      console.error(err);
      window.alert(
        "Failed to load this JSON. Is it a valid vrahune_database.json (or legacy vrahune_generators.json) file?"
      );
    }
  };
  reader.readAsText(file);
}

function handleUploadDatabaseHelp() {
  window.alert(
    "Database import/export:\n\n" +
      "• This toolbox stores everything locally in your browser (Local Storage).\n" +
      "• Download = exports your current local data to a JSON file.\n" +
      "• Upload = imports a JSON file and overwrites your local data.\n\n" +
      "Publishing defaults for first-time visitors (GitHub Pages):\n" +
      "1) Click “Download database” to get vrahune_database.json\n" +
      "2) Commit that file to your repo as: /data/vrahune_database.json\n" +
      "3) New visitors (no local data yet) will start with that published database.\n\n" +
      "Notes:\n" +
      "• Existing visitors keep their current local data unless they upload a file or reset.\n" +
      "• You can also upload older generator-only exports (array format)."
  );
}

function handleResetToPublishedDefaults() {
  if (!publishedDbBundle || !publishedDbBundle.keys) {
    window.alert(
      "No published defaults were found.\n\n" +
        "To enable this, commit a file at /data/vrahune_database.json in your repo."
    );
    return;
  }

  const incomingKeys = Object.keys(publishedDbBundle.keys || {});
  const recognizedKeys = incomingKeys.filter((k) => DB_BUNDLE_KEYS.includes(k));
  if (!recognizedKeys.length) {
    window.alert("Published defaults file exists, but it doesn't contain recognized keys.");
    return;
  }

  const ok = window.confirm(
    "Reset local data to this site's published defaults?\n\n" +
      "This will overwrite your current local data for:\n" +
      recognizedKeys.map((k) => "• " + k).join("\n")
  );
  if (!ok) return;

  // Overwrite keys provided by the published defaults, and clear the rest
  for (const k of DB_BUNDLE_KEYS) {
    if (k in publishedDbBundle.keys) {
      safeWriteLocalJson(k, publishedDbBundle.keys[k]);
    } else {
      try {
        window.localStorage.removeItem(k);
      } catch (err) {
        // ignore
      }
    }
  }

  window.location.reload();
}

function handleNavClick(event) {
  const renameBtn = event.target.closest(".folder-rename-btn");
  if (renameBtn) {
    const heading = renameBtn.closest(".nav-folder-heading");
    if (!heading) return;
    const folder = heading.dataset.folder;
    if (!folder) return;
    const newName = window.prompt("Rename folder:", folder);
    if (!newName) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === folder) return;

    const gens = loadGenerators();
    gens.forEach((g) => {
      if ((g.folder || "General") === folder) {
        g.folder = trimmed;
      }
    });
    saveGenerators(gens);

    if (folderState[folder]) {
      folderState[trimmed] = folderState[folder];
      delete folderState[folder];
      saveFolderState();
    }

    renderGeneratorNav();
    renderMainPanel();
    populateFolderSelect(trimmed);
    return;
  }

  const folderToggle = event.target.closest(".folder-toggle");
  if (folderToggle) {
    const heading = folderToggle.closest(".nav-folder-heading");
    if (!heading) return;
    const folder = heading.dataset.folder;
    if (!folder) return;
    const current = folderState[folder] && folderState[folder].collapsed;
    if (!folderState[folder]) folderState[folder] = {};
    folderState[folder].collapsed = !current;
    saveFolderState();
    renderGeneratorNav();
    return;
  }

  const genItem = event.target.closest(".nav-generator");
  if (genItem) {
    const id = genItem.dataset.id;
    if (!id) return;
    activeGenerator = { id };
    activeToolId = null;
    renderGeneratorNav();
    renderToolsNav();
    renderMainPanel();
  }
}

function handleToolsNavClick(event) {
  const item = event.target.closest(".nav-tool");
  if (!item) return;
  const id = item.dataset.id;
  if (activeToolId === id) {
    activeToolId = null;
  } else {
    activeToolId = id;
    activeGenerator = null;
  }
  renderToolsNav();
  renderGeneratorNav();
  renderMainPanel();
}

function toggleItemsExpand() {
  const ta = document.getElementById("genItemsInput");
  const btn = document.getElementById("expandItemsBtn");
  itemsExpanded = !itemsExpanded;
  if (itemsExpanded) {
    ta.classList.add("items-expanded");
    btn.textContent = "Collapse list editor";
  } else {
    ta.classList.remove("items-expanded");
    btn.textContent = "Expand list editor";
  }
}

function handleSaveGenerator() {
  const folderSelect = document.getElementById("genFolderSelect");
  const folderNewInput = document.getElementById("genFolderNewInput");
  const nameInput = document.getElementById("genNameInput");
  const itemsInput = document.getElementById("genItemsInput");
  const msg = document.getElementById("generatorCreateMessage");
  const typeInput = document.getElementById("genTypeInput");

  const typeValue = typeInput.value || "list";

  let folder = "";
  if (folderSelect.value === "__new__") {
    folder = (folderNewInput.value || "").trim() || "General";
  } else {
    folder = folderSelect.value || "General";
  }

  const name = (nameInput.value || "").trim();
  const raw = itemsInput.value || "";

  if (!name) {
    msg.textContent = "Please enter a name for the generator.";
    msg.classList.add("danger");
    return;
  }

  const gens = loadGenerators();

  if (editingGeneratorId) {
    const idx = gens.findIndex((g) => g.id === editingGeneratorId);
    if (idx === -1) return;

    const existingType = gens[idx].type || "list";

    gens[idx].folder = folder;
    gens[idx].name = name;

    if (existingType === "list" || existingType === "lexicon") {
      let parsed;
      if (existingType === "lexicon") {
        parsed = parseLexiconText(raw);
      } else {
        parsed = parseGeneratorItems(raw);
      }

      if (!parsed.items.length) {
        msg.textContent =
          existingType === "lexicon"
            ? "Please provide at least one valid 'english = valathi' entry."
            : "Please provide at least one non-empty item.";
        msg.classList.add("danger");
        return;
      }

      gens[idx].items = parsed.items;
      gens[idx].type = existingType;

      saveGenerators(gens);
      msg.classList.remove("danger");
      msg.textContent = `Updated “${name}” with ${
        parsed.items.length
      } entries. ${
        parsed.duplicates > 0
          ? parsed.duplicates + " duplicates removed."
          : "No duplicates detected."
      }`;
    } else {
      saveGenerators(gens);
      msg.classList.remove("danger");
      msg.textContent =
        `Updated “${name}” (advanced generator). Edit patterns & mappings via “Edit template”.`;
    }

    activeGenerator = { id: editingGeneratorId };
    editingGeneratorId = null;
  } else {
    if (typeValue === "advanced") {
      const id = "gen-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
      gens.push({
        id,
        folder,
        name,
        type: "advanced",
        items: { patterns: [], tokenMap: {}, multiTokenMap: {}, advancedMode: "simple" }
      });
      saveGenerators(gens);
      msg.classList.remove("danger");
      msg.textContent = `Saved advanced generator “${name}” in folder “${folder}”. Configure patterns & mappings via “Edit template”.`;
      activeGenerator = { id };
    } else {
      let parsed;
      if (typeValue === "lexicon") {
        parsed = parseLexiconText(raw);
      } else {
        parsed = parseGeneratorItems(raw);
      }

      if (!parsed.items.length) {
        msg.textContent =
          typeValue === "lexicon"
            ? "Please provide at least one valid 'english = valathi' entry."
            : "Please provide at least one non-empty item.";
        msg.classList.add("danger");
        return;
      }

      const id = "gen-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
      gens.push({ id, folder, name, type: typeValue, items: parsed.items });
      saveGenerators(gens);
      msg.classList.remove("danger");
      msg.textContent = `Saved “${name}” in folder “${folder}” with ${
        parsed.items.length
      } entries. ${
        parsed.duplicates > 0
          ? parsed.duplicates + " duplicates removed."
          : "No duplicates detected."
      }`;
      activeGenerator = { id };
    }
  }

  renderGeneratorNav();
  renderMainPanel();

  setTimeout(() => {
    hideGeneratorCreateBox();
  }, 1200);
}

async function initApp() {
  // Load any published defaults (if present in /data/...)
  await loadPublishedDefaults();

  // If the user has no local data yet, seed from published defaults (or fall back to seeds).
  const hasLocalGens = !!window.localStorage.getItem(GEN_STORAGE_KEY);
  if (!hasLocalGens) {
    const pubGens =
      publishedDbBundle && publishedDbBundle.keys
        ? publishedDbBundle.keys[GEN_STORAGE_KEY]
        : null;

    if (Array.isArray(pubGens) && pubGens.length) {
      saveGenerators(pubGens);
    } else {
      const seeded = seedInitialGenerators();
      saveGenerators(seeded);
    }
  }

  // Optional: seed other tools for first-time users if your published bundle includes them.
  seedFromPublishedIfMissing(FOLDER_STATE_KEY);
  seedFromPublishedIfMissing("vrahuneEncounterToolStateV7");
  seedFromPublishedIfMissing("vrahuneMonsterVaultStateV2");
  seedFromPublishedIfMissing("vrahuneStatblockImporterDraftsV3");

  // Load folder UI state after any seeding
  folderState = loadFolderState();

  renderGeneratorNav();
  renderToolsNav();
  renderMainPanel();
  populateFolderSelect("General");
}
// Make core things available to tool-*.js files
window.toolsConfig = toolsConfig;
window.renderToolPanel = renderToolPanel;
window.renderToolsNav = renderToolsNav;


function initializeAppUi() {
  document
    .getElementById("generatorNav")
    .addEventListener("click", handleNavClick);
  document
    .getElementById("addGeneratorBtn")
    .addEventListener("click", openNewGeneratorBox);
  document
    .getElementById("cancelGeneratorBtn")
    .addEventListener("click", hideGeneratorCreateBox);
  document
    .getElementById("saveGeneratorBtn")
    .addEventListener("click", handleSaveGenerator);
  document
    .getElementById("expandItemsBtn")
    .addEventListener("click", toggleItemsExpand);
  document
    .getElementById("downloadDbBtn")
    .addEventListener("click", handleDownloadDatabase);

  const uploadDbBtn = document.getElementById("uploadDbBtn");
  if (uploadDbBtn) {
    uploadDbBtn.addEventListener("click", handleUploadDatabaseClick);
  }

  const uploadDbFileInput = document.getElementById("uploadDbFileInput");
  if (uploadDbFileInput) {
    uploadDbFileInput.addEventListener("change", handleUploadDatabaseFile);
  }

  const uploadDbHelpBtn = document.getElementById("uploadDbHelpBtn");
  if (uploadDbHelpBtn) {
    uploadDbHelpBtn.addEventListener("click", handleUploadDatabaseHelp);
  }

const resetPublishedBtn = document.getElementById("resetPublishedBtn");
if (resetPublishedBtn) {
  resetPublishedBtn.addEventListener("click", handleResetToPublishedDefaults);
}

  const folderSelect = document.getElementById("genFolderSelect");
  if (folderSelect) {
    folderSelect.addEventListener("change", handleFolderSelectChange);
  }

  const searchInput = document.getElementById("generatorSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      generatorSearchTerm = e.target.value || "";
      renderGeneratorNav();
    });
  }

  const toolSearchInput = document.getElementById("toolSearchInput");
  if (toolSearchInput) {
    toolSearchInput.addEventListener("input", (e) => {
      toolSearchTerm = e.target.value || "";
      renderToolsNav();
    });
  }

  const toolsNavEl = document.getElementById("toolsNav");
  if (toolsNavEl) {
    toolsNavEl.addEventListener("click", handleToolsNavClick);
  }

  const lexManageCloseBtn = document.getElementById("lexManageCloseBtn");
  if (lexManageCloseBtn) {
    lexManageCloseBtn.addEventListener("click", closeLexManageBox);
  }

  const advTemplateCloseBtn = document.getElementById("advTemplateCloseBtn");
  if (advTemplateCloseBtn) {
    advTemplateCloseBtn.addEventListener("click", () => {
      const box = document.getElementById("advTemplateBox");
      const body = document.getElementById("advTemplateBody");
      const msg = document.getElementById("advTemplateMessage");
      if (body) body.innerHTML = "";
      if (msg) {
        msg.textContent = "";
        msg.classList.remove("danger");
      }
      advTemplateGenId = null;
      if (box) box.style.display = "none";
    });
  }

  initApp();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeAppUi, { once: true });
} else {
  initializeAppUi();
}

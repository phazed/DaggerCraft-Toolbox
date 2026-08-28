// generator-editor-v2.js
// Cleaner create/edit workflow for list and lexicon generators.
// Loaded after app.js so it can reuse the existing storage, navigation, and rendering logic.

(() => {
  const state = {
    draftType: "list",
    draftItems: [],
    addContext: null,
    duplicateContext: null,
    managerSearch: ""
  };

  function cloneItems(type, items) {
    if (!Array.isArray(items)) return [];
    if (type === "lexicon") {
      return items
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          english: String(item.english || ""),
          valathi: String(item.valathi || "")
        }));
    }
    return items.map((item) => String(item));
  }

  function normalizeEntry(type, item) {
    if (type === "lexicon") {
      if (!item || typeof item !== "object") return null;
      const english = String(item.english || "").trim();
      const valathi = String(item.valathi || "").trim();
      if (!english || !valathi) return null;
      return { english, valathi };
    }

    const value = String(item ?? "").trim();
    return value ? value : null;
  }

  function entryKey(type, item) {
    const normalized = normalizeEntry(type, item);
    if (!normalized) return "";
    if (type === "lexicon") {
      return `${normalized.english.toLocaleLowerCase()}|${normalized.valathi.toLocaleLowerCase()}`;
    }
    return normalized.toLocaleLowerCase();
  }

  function entryLabel(type, item) {
    const normalized = normalizeEntry(type, item);
    if (!normalized) return "";
    return type === "lexicon"
      ? `${normalized.english} = ${normalized.valathi}`
      : normalized;
  }

  function normalizedDraftItems(type = state.draftType) {
    return state.draftItems
      .map((item) => normalizeEntry(type, item))
      .filter(Boolean);
  }

  function parseIncomingEntries(raw, type) {
    const lines = String(raw || "").split(/\r?\n/);
    const entries = [];

    for (const line of lines) {
      const text = line.trim();
      if (!text) continue;

      if (type === "lexicon") {
        let english = "";
        let valathi = "";
        const eqIndex = text.indexOf("=");
        const dashIndex = eqIndex === -1 ? text.indexOf("-") : -1;

        if (eqIndex !== -1) {
          english = text.slice(0, eqIndex).trim();
          valathi = text.slice(eqIndex + 1).trim();
        } else if (dashIndex !== -1) {
          english = text.slice(0, dashIndex).trim();
          valathi = text.slice(dashIndex + 1).trim();
        }

        if (english && valathi) {
          entries.push({ english, valathi });
        }
      } else {
        entries.push(text);
      }
    }

    return entries;
  }

  function analyzeDuplicates(existing, incoming, type) {
    const seen = new Map();
    const uniqueIncoming = [];
    const duplicates = [];

    existing.forEach((item) => {
      const key = entryKey(type, item);
      if (key && !seen.has(key)) seen.set(key, item);
    });

    incoming.forEach((item) => {
      const key = entryKey(type, item);
      if (!key) return;

      if (seen.has(key)) {
        duplicates.push({ incoming: item, match: seen.get(key) });
        return;
      }

      seen.set(key, item);
      uniqueIncoming.push(item);
    });

    return { uniqueIncoming, duplicates };
  }

  function analyzeDraftDuplicates(items, type) {
    const seen = new Map();
    const uniqueItems = [];
    const duplicates = [];

    items.forEach((item) => {
      const key = entryKey(type, item);
      if (!key) return;

      if (seen.has(key)) {
        duplicates.push({ incoming: item, match: seen.get(key) });
      } else {
        seen.set(key, item);
        uniqueItems.push(item);
      }
    });

    return { uniqueItems, duplicates };
  }

  function injectStyles() {
    if (document.getElementById("generatorEditorV2Styles")) return;

    const style = document.createElement("style");
    style.id = "generatorEditorV2Styles";
    style.textContent = `
      .gen-entry-summary {
        border: 1px solid #232a33;
        background: #070a10;
        border-radius: 12px;
        padding: 10px;
        margin-top: 4px;
      }
      .gen-entry-summary-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }
      .gen-entry-count {
        font-size: 0.74rem;
        color: var(--accent-strong);
        border: 1px solid #3a414d;
        background: #111722;
        border-radius: 999px;
        padding: 3px 8px;
        white-space: nowrap;
      }
      .gen-entry-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .gen-entry-action {
        border: 1px solid #303641;
        background: linear-gradient(145deg, #111722, #080b11);
        border-radius: 10px;
        padding: 12px;
        min-height: 82px;
        text-align: left;
        cursor: pointer;
        color: var(--text-main);
        transition: border-color .16s ease-out, background .16s ease-out, transform .06s ease-out;
      }
      .gen-entry-action:hover {
        border-color: #737d8d;
        background: linear-gradient(145deg, #182131, #0c1018);
        transform: translateY(-1px);
      }
      .gen-entry-action strong {
        display: block;
        font-size: .84rem;
        color: var(--accent-strong);
        margin-bottom: 4px;
      }
      .gen-entry-action span {
        display: block;
        font-size: .73rem;
        line-height: 1.35;
        color: var(--text-muted);
      }
      .gen-entry-hint {
        font-size: .74rem;
        line-height: 1.4;
        color: var(--text-muted);
      }
      .gen-modal-narrow .generator-create-inner { width: 620px; }
      .gen-add-textarea {
        min-height: 260px;
        max-height: 48vh;
        resize: vertical;
      }
      .gen-modal-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 6px;
        margin-top: 8px;
      }
      .gen-duplicate-list {
        max-height: 42vh;
        overflow-y: auto;
        border: 1px solid #232a33;
        background: #05070c;
        border-radius: 10px;
        padding: 6px;
      }
      .gen-duplicate-row {
        padding: 7px 8px;
        border-bottom: 1px solid #1d232c;
        font-size: .76rem;
      }
      .gen-duplicate-row:last-child { border-bottom: 0; }
      .gen-duplicate-row strong { color: var(--accent-strong); }
      .gen-duplicate-match {
        display: block;
        color: var(--text-muted);
        margin-top: 2px;
        font-size: .72rem;
      }
      .gen-manager-toolbar {
        display: grid;
        grid-template-columns: minmax(180px, 1fr) auto auto;
        gap: 6px;
        align-items: center;
        margin-bottom: 8px;
      }
      .gen-manager-list {
        max-height: 52vh;
        overflow-y: auto;
        border: 1px solid #232a33;
        border-radius: 10px;
        background: #05070c;
      }
      .gen-manager-row {
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr) auto;
        gap: 6px;
        align-items: center;
        padding: 6px;
        border-bottom: 1px solid #1c222b;
      }
      .gen-manager-row.lexicon {
        grid-template-columns: 28px minmax(0, 1fr) minmax(0, 1fr) auto;
      }
      .gen-manager-row:last-child { border-bottom: 0; }
      .gen-manager-row input[type="text"] { min-width: 0; }
      .gen-manager-empty {
        padding: 18px 10px;
        text-align: center;
        color: var(--text-muted);
        font-size: .78rem;
      }
      .gen-manager-check {
        width: 16px;
        height: 16px;
        margin: 0 auto;
      }
      @media (max-width: 680px) {
        .gen-entry-actions { grid-template-columns: 1fr; }
        .gen-manager-toolbar { grid-template-columns: 1fr; }
        .gen-manager-row.lexicon { grid-template-columns: 28px minmax(0, 1fr) auto; }
        .gen-manager-row.lexicon .gen-manager-valathi { grid-column: 2 / 3; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureSupportingModals() {
    if (!document.getElementById("genAddEntriesBox")) {
      const addBox = document.createElement("div");
      addBox.id = "genAddEntriesBox";
      addBox.className = "generator-create-box gen-modal-narrow";
      addBox.innerHTML = `
        <div class="generator-create-inner">
          <div class="generator-create-header">
            <div id="genAddEntriesTitle" class="generator-create-title">Add entries</div>
            <button id="genAddEntriesCloseBtn" class="btn-secondary btn-small" type="button">✕ Close</button>
          </div>
          <div id="genAddEntriesMessage" class="muted"></div>
          <div class="generator-create-body">
            <label id="genAddEntriesLabel" for="genAddEntriesInput">Paste entries</label>
            <textarea id="genAddEntriesInput" class="gen-add-textarea"></textarea>
            <div id="genAddEntriesHint" class="gen-entry-hint"></div>
          </div>
          <div class="gen-modal-actions">
            <button id="genAddEntriesCancelBtn" class="btn-secondary btn-small" type="button">Cancel</button>
            <button id="genAddEntriesConfirmBtn" class="btn-primary btn-small" type="button">Add entries</button>
          </div>
        </div>`;
      document.body.appendChild(addBox);
    }

    if (!document.getElementById("genDuplicateReviewBox")) {
      const dupBox = document.createElement("div");
      dupBox.id = "genDuplicateReviewBox";
      dupBox.className = "generator-create-box gen-modal-narrow";
      dupBox.innerHTML = `
        <div class="generator-create-inner">
          <div class="generator-create-header">
            <div class="generator-create-title">Duplicates found</div>
            <button id="genDuplicateReviewCloseBtn" class="btn-secondary btn-small" type="button">✕ Close</button>
          </div>
          <div id="genDuplicateReviewMessage" class="muted"></div>
          <div class="generator-create-body">
            <div id="genDuplicateReviewList" class="gen-duplicate-list"></div>
          </div>
          <div class="gen-modal-actions">
            <button id="genDuplicateKeepBtn" class="btn-secondary btn-small" type="button">Keep duplicates</button>
            <button id="genDuplicateRemoveBtn" class="btn-primary btn-small" type="button">Remove duplicates & continue</button>
          </div>
        </div>`;
      document.body.appendChild(dupBox);
    }

    if (!document.getElementById("genEntryManagerBox")) {
      const managerBox = document.createElement("div");
      managerBox.id = "genEntryManagerBox";
      managerBox.className = "generator-create-box";
      managerBox.innerHTML = `
        <div class="generator-create-inner">
          <div class="generator-create-header">
            <div id="genEntryManagerTitle" class="generator-create-title">View / Edit Entries</div>
            <button id="genEntryManagerCloseBtn" class="btn-secondary btn-small" type="button">✕ Close</button>
          </div>
          <div id="genEntryManagerMessage" class="muted"></div>
          <div class="generator-create-body">
            <div class="gen-manager-toolbar">
              <input id="genEntryManagerSearch" type="text" placeholder="Search entries..." />
              <button id="genEntryManagerSortBtn" class="btn-secondary btn-small" type="button">Sort A–Z</button>
              <button id="genEntryManagerDeleteSelectedBtn" class="btn-secondary btn-small" type="button">Delete selected</button>
            </div>
            <div id="genEntryManagerList" class="gen-manager-list"></div>
          </div>
          <div class="gen-modal-actions">
            <button id="genEntryManagerDoneBtn" class="btn-primary btn-small" type="button">Done</button>
          </div>
        </div>`;
      document.body.appendChild(managerBox);
    }
  }

  function rebuildCreateModal() {
    const box = document.getElementById("generatorCreateBox");
    if (!box) return;

    box.innerHTML = `
      <div class="generator-create-inner">
        <div class="generator-create-header">
          <div id="generatorCreateTitle" class="generator-create-title">Create Generator</div>
          <button id="cancelGeneratorBtn" class="btn-secondary btn-small" type="button">✕ Close</button>
        </div>
        <div id="generatorCreateMessage" class="muted"></div>
        <div class="generator-create-body">
          <div class="row">
            <div class="col">
              <label for="genNameInput">Generator name</label>
              <input id="genNameInput" type="text" placeholder="Elf Names, NPC Traits, Valathi Lexicon..." />
            </div>
            <div class="col">
              <label for="genFolderSelect">Folder</label>
              <select id="genFolderSelect"></select>
              <input id="genFolderNewInput" type="text" placeholder="New folder name" style="margin-top:4px; display:none;" />
            </div>
            <div class="col">
              <label for="genTypeInput">Type</label>
              <select id="genTypeInput">
                <option value="list">List (simple pool of items)</option>
                <option value="lexicon">Lexicon (english = valathi)</option>
                <option value="advanced">Advanced (patterns & tokens)</option>
              </select>
            </div>
          </div>
          <div id="genEntrySummary" class="gen-entry-summary">
            <div class="gen-entry-summary-head">
              <div>
                <div id="genEntrySectionTitle" class="section-title" style="margin:0;">Entries</div>
                <div id="genEntrySectionHint" class="gen-entry-hint"></div>
              </div>
              <span id="genEntryCount" class="gen-entry-count">0 entries</span>
            </div>
            <div id="genEntryActions" class="gen-entry-actions">
              <button id="genAddEntriesBtn" class="gen-entry-action" type="button">
                <strong>＋ Add Entries</strong>
                <span>Paste a clean list or a large batch all at once.</span>
              </button>
              <button id="genManageEntriesBtn" class="gen-entry-action" type="button">
                <strong>View / Edit Entries</strong>
                <span>Search, edit, sort, select, or delete existing entries.</span>
              </button>
            </div>
            <div id="genAdvancedEntryHint" class="gen-entry-hint" style="display:none;">
              Advanced generators use patterns and token mappings instead of a normal entry list.
              Save this generator first, then use <b>Edit template</b> from its generator page.
            </div>
          </div>
        </div>
        <div class="row" style="margin-top:6px; justify-content:flex-end;">
          <button id="saveGeneratorBtn" class="btn-primary btn-small" type="button">Save generator</button>
        </div>
      </div>`;
  }

  function currentType() {
    const typeInput = document.getElementById("genTypeInput");
    return typeInput ? typeInput.value || "list" : state.draftType || "list";
  }

  function setCreateMessage(text, danger = false) {
    const msg = document.getElementById("generatorCreateMessage");
    if (!msg) return;
    msg.textContent = text || "";
    msg.classList.toggle("danger", Boolean(danger));
  }

  function updateEntrySummary() {
    const type = currentType();
    state.draftType = type;
    const actions = document.getElementById("genEntryActions");
    const advancedHint = document.getElementById("genAdvancedEntryHint");
    const count = document.getElementById("genEntryCount");
    const title = document.getElementById("genEntrySectionTitle");
    const hint = document.getElementById("genEntrySectionHint");

    if (type === "advanced") {
      if (actions) actions.style.display = "none";
      if (advancedHint) advancedHint.style.display = "block";
      if (count) count.textContent = "Template based";
      if (title) title.textContent = "Template";
      if (hint) hint.textContent = "Patterns and token mappings are managed separately.";
      return;
    }

    if (actions) actions.style.display = "grid";
    if (advancedHint) advancedHint.style.display = "none";
    if (title) title.textContent = type === "lexicon" ? "Lexicon entries" : "List entries";
    const validCount = normalizedDraftItems(type).length;
    if (count) count.textContent = `${validCount} ${validCount === 1 ? "entry" : "entries"}`;
    if (hint) {
      hint.textContent = type === "lexicon"
        ? "Use “common = valathi”, one entry per line."
        : "One item per line. Capitalization-only matches count as duplicates.";
    }
  }

  function resetSupportingModals() {
    ["genAddEntriesBox", "genDuplicateReviewBox", "genEntryManagerBox"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
    state.addContext = null;
    state.duplicateContext = null;
    state.managerSearch = "";
  }

  function openNewGeneratorBoxV2() {
    editingGeneratorId = null;
    state.draftType = "list";
    state.draftItems = [];
    resetSupportingModals();
    const box = document.getElementById("generatorCreateBox");
    const title = document.getElementById("generatorCreateTitle");
    const nameInput = document.getElementById("genNameInput");
    const typeInput = document.getElementById("genTypeInput");
    const newFolderInput = document.getElementById("genFolderNewInput");
    const saveBtn = document.getElementById("saveGeneratorBtn");

    populateFolderSelect("General");
    if (title) title.textContent = "Create Generator";
    if (nameInput) nameInput.value = "";
    if (typeInput) {
      typeInput.disabled = false;
      typeInput.value = "list";
    }
    if (newFolderInput) {
      newFolderInput.value = "";
      newFolderInput.style.display = "none";
    }
    if (saveBtn) saveBtn.textContent = "Save generator";
    setCreateMessage("");
    updateEntrySummary();
    if (box) box.style.display = "flex";
  }

  function openEditGeneratorBoxV2(genId) {
    const gens = loadGenerators();
    const gen = gens.find((item) => item.id === genId);
    if (!gen) return;

    editingGeneratorId = genId;
    state.draftType = gen.type || "list";
    state.draftItems = cloneItems(state.draftType, gen.items);
    resetSupportingModals();
    const box = document.getElementById("generatorCreateBox");
    const title = document.getElementById("generatorCreateTitle");
    const nameInput = document.getElementById("genNameInput");
    const typeInput = document.getElementById("genTypeInput");
    const newFolderInput = document.getElementById("genFolderNewInput");
    const saveBtn = document.getElementById("saveGeneratorBtn");

    populateFolderSelect(gen.folder || "General");
    if (title) title.textContent = `Edit Generator · ${gen.name}`;
    if (nameInput) nameInput.value = gen.name || "";
    if (typeInput) {
      typeInput.value = state.draftType;
      typeInput.disabled = true;
    }
    if (newFolderInput) {
      newFolderInput.value = "";
      newFolderInput.style.display = "none";
    }
    if (saveBtn) saveBtn.textContent = "Save changes";
    setCreateMessage("");
    updateEntrySummary();
    if (box) box.style.display = "flex";
  }

  function hideGeneratorCreateBoxV2() {
    const box = document.getElementById("generatorCreateBox");
    const nameInput = document.getElementById("genNameInput");
    const newFolderInput = document.getElementById("genFolderNewInput");
    if (nameInput) nameInput.value = "";
    if (newFolderInput) {
      newFolderInput.value = "";
      newFolderInput.style.display = "none";
    }
    editingGeneratorId = null;
    state.draftType = "list";
    state.draftItems = [];
    resetSupportingModals();
    setCreateMessage("");
    if (box) box.style.display = "none";
  }

  function openAddEntriesModal() {
    const type = currentType();
    if (type === "advanced") return;
    const box = document.getElementById("genAddEntriesBox");
    const title = document.getElementById("genAddEntriesTitle");
    const label = document.getElementById("genAddEntriesLabel");
    const input = document.getElementById("genAddEntriesInput");
    const hint = document.getElementById("genAddEntriesHint");
    const msg = document.getElementById("genAddEntriesMessage");
    if (title) title.textContent = type === "lexicon" ? "Add Lexicon Entries" : "Add List Entries";
    if (label) label.textContent = type === "lexicon" ? "Paste entries (common = valathi)" : "Paste entries (one per line)";
    if (input) {
      input.value = "";
      input.placeholder = type === "lexicon"
        ? "high = val\nforest = ’ath\nriver = len"
        : "James\nMara\nThe Black Tower";
    }
    if (hint) hint.textContent = "Duplicates are checked against both this pasted batch and the entries already in the generator.";
    if (msg) {
      msg.textContent = "";
      msg.classList.remove("danger");
    }
    state.addContext = { type };
    if (box) box.style.display = "flex";
    if (input) setTimeout(() => input.focus(), 0);
  }

  function closeAddEntriesModal() {
    const box = document.getElementById("genAddEntriesBox");
    const input = document.getElementById("genAddEntriesInput");
    const msg = document.getElementById("genAddEntriesMessage");
    if (input) input.value = "";
    if (msg) {
      msg.textContent = "";
      msg.classList.remove("danger");
    }
    state.addContext = null;
    if (box) box.style.display = "none";
  }

  function renderDuplicateReview(context) {
    const box = document.getElementById("genDuplicateReviewBox");
    const msg = document.getElementById("genDuplicateReviewMessage");
    const list = document.getElementById("genDuplicateReviewList");
    if (!box || !msg || !list) return;
    const count = context.duplicates.length;
    msg.textContent = `${count} ${count === 1 ? "duplicate was" : "duplicates were"} found. Capitalization-only differences are treated as duplicates.`;
    msg.classList.remove("danger");
    list.innerHTML = "";
    context.duplicates.forEach((dup) => {
      const row = document.createElement("div");
      row.className = "gen-duplicate-row";
      const incoming = document.createElement("strong");
      incoming.textContent = entryLabel(context.type, dup.incoming);
      const match = document.createElement("span");
      match.className = "gen-duplicate-match";
      match.textContent = `Matches: ${entryLabel(context.type, dup.match)}`;
      row.appendChild(incoming);
      row.appendChild(match);
      list.appendChild(row);
    });
    state.duplicateContext = context;
    box.style.display = "flex";
  }

  function closeDuplicateReview() {
    const box = document.getElementById("genDuplicateReviewBox");
    if (box) box.style.display = "none";
    state.duplicateContext = null;
  }

  function appendIncomingEntries(removeDuplicates) {
    const context = state.duplicateContext;
    if (!context || context.mode !== "add") return;
    const toAdd = removeDuplicates ? context.uniqueItems : context.allIncoming;
    state.draftItems = state.draftItems.concat(cloneItems(context.type, toAdd));
    const removed = context.duplicates.length;
    closeDuplicateReview();
    closeAddEntriesModal();
    updateEntrySummary();
    const added = toAdd.length;
    setCreateMessage(removeDuplicates && removed
      ? `Added ${added} entries. Removed ${removed} duplicates.`
      : `Added ${added} entries${removed ? ` and kept ${removed} duplicates` : ""}.`);
  }

  function handleAddEntriesConfirm() {
    const context = state.addContext;
    const input = document.getElementById("genAddEntriesInput");
    const msg = document.getElementById("genAddEntriesMessage");
    if (!context || !input || !msg) return;
    const incoming = parseIncomingEntries(input.value, context.type);
    if (!incoming.length) {
      msg.textContent = context.type === "lexicon"
        ? "No valid entries found. Use “common = valathi”, one per line."
        : "Paste at least one non-empty entry.";
      msg.classList.add("danger");
      return;
    }
    const analysis = analyzeDuplicates(normalizedDraftItems(context.type), incoming, context.type);
    if (analysis.duplicates.length) {
      renderDuplicateReview({
        mode: "add",
        type: context.type,
        allIncoming: incoming,
        uniqueItems: analysis.uniqueIncoming,
        duplicates: analysis.duplicates
      });
      return;
    }
    state.draftItems = state.draftItems.concat(cloneItems(context.type, incoming));
    closeAddEntriesModal();
    updateEntrySummary();
    setCreateMessage(`Added ${incoming.length} ${incoming.length === 1 ? "entry" : "entries"}.`);
  }

  function openEntryManager() {
    const type = currentType();
    if (type === "advanced") return;
    state.managerSearch = "";
    const box = document.getElementById("genEntryManagerBox");
    const title = document.getElementById("genEntryManagerTitle");
    const search = document.getElementById("genEntryManagerSearch");
    if (title) title.textContent = type === "lexicon" ? "View / Edit Lexicon Entries" : "View / Edit List Entries";
    if (search) search.value = "";
    renderEntryManager();
    if (box) box.style.display = "flex";
  }

  function closeEntryManager() {
    const box = document.getElementById("genEntryManagerBox");
    if (box) box.style.display = "none";
    state.managerSearch = "";
    updateEntrySummary();
  }

  function renderEntryManager() {
    const type = currentType();
    const list = document.getElementById("genEntryManagerList");
    const msg = document.getElementById("genEntryManagerMessage");
    if (!list || !msg) return;
    const query = state.managerSearch.trim().toLocaleLowerCase();
    const indexed = state.draftItems
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !query || entryLabel(type, item).toLocaleLowerCase().includes(query));
    const total = normalizedDraftItems(type).length;
    msg.textContent = query
      ? `Showing ${indexed.length} of ${total} entries. Changes are staged until you save the generator.`
      : `${total} ${total === 1 ? "entry" : "entries"}. Changes are staged until you save the generator.`;
    msg.classList.remove("danger");
    list.innerHTML = "";
    if (!indexed.length) {
      const empty = document.createElement("div");
      empty.className = "gen-manager-empty";
      empty.textContent = total ? "No entries match your search." : "No entries yet. Close this window and use Add Entries.";
      list.appendChild(empty);
      return;
    }
    indexed.forEach(({ item, index }) => {
      const row = document.createElement("div");
      row.className = `gen-manager-row${type === "lexicon" ? " lexicon" : ""}`;
      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "gen-manager-check";
      check.dataset.index = String(index);
      row.appendChild(check);
      if (type === "lexicon") {
        const english = document.createElement("input");
        english.type = "text";
        english.value = item && item.english ? String(item.english) : "";
        english.placeholder = "Common";
        english.dataset.field = "english";
        english.dataset.index = String(index);
        const valathi = document.createElement("input");
        valathi.type = "text";
        valathi.value = item && item.valathi ? String(item.valathi) : "";
        valathi.placeholder = "Valathi";
        valathi.className = "gen-manager-valathi";
        valathi.dataset.field = "valathi";
        valathi.dataset.index = String(index);
        row.appendChild(english);
        row.appendChild(valathi);
      } else {
        const value = document.createElement("input");
        value.type = "text";
        value.value = String(item ?? "");
        value.dataset.field = "value";
        value.dataset.index = String(index);
        row.appendChild(value);
      }
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn-secondary btn-small gen-manager-delete";
      deleteBtn.dataset.index = String(index);
      deleteBtn.textContent = "Delete";
      row.appendChild(deleteBtn);
      list.appendChild(row);
    });
  }

  function handleManagerInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const index = Number(target.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= state.draftItems.length) return;
    if (state.draftType === "lexicon") {
      const current = state.draftItems[index] && typeof state.draftItems[index] === "object"
        ? state.draftItems[index]
        : { english: "", valathi: "" };
      if (target.dataset.field === "english") current.english = target.value;
      if (target.dataset.field === "valathi") current.valathi = target.value;
      state.draftItems[index] = current;
    } else if (target.dataset.field === "value") {
      state.draftItems[index] = target.value;
    }
  }

  function handleManagerClick(event) {
    const deleteBtn = event.target.closest(".gen-manager-delete");
    if (!deleteBtn) return;
    const index = Number(deleteBtn.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= state.draftItems.length) return;
    state.draftItems.splice(index, 1);
    renderEntryManager();
    updateEntrySummary();
  }

  function deleteSelectedManagerEntries() {
    const list = document.getElementById("genEntryManagerList");
    if (!list) return;
    const indexes = Array.from(list.querySelectorAll(".gen-manager-check:checked"))
      .map((input) => Number(input.dataset.index))
      .filter(Number.isInteger)
      .sort((a, b) => b - a);
    if (!indexes.length) {
      const msg = document.getElementById("genEntryManagerMessage");
      if (msg) {
        msg.textContent = "Select one or more entries to delete.";
        msg.classList.add("danger");
      }
      return;
    }
    indexes.forEach((index) => {
      if (index >= 0 && index < state.draftItems.length) state.draftItems.splice(index, 1);
    });
    renderEntryManager();
    updateEntrySummary();
  }

  function sortManagerEntries() {
    const type = currentType();
    state.draftItems.sort((a, b) => entryLabel(type, a).localeCompare(entryLabel(type, b), undefined, { sensitivity: "base" }));
    renderEntryManager();
    updateEntrySummary();
  }

  function resolveFolder() {
    const folderSelect = document.getElementById("genFolderSelect");
    const folderNewInput = document.getElementById("genFolderNewInput");
    if (!folderSelect) return "General";
    if (folderSelect.value === "__new__") {
      return (folderNewInput && folderNewInput.value ? folderNewInput.value : "").trim() || "General";
    }
    return folderSelect.value || "General";
  }

  function saveGeneratorDraft(skipDuplicateReview = false) {
    const nameInput = document.getElementById("genNameInput");
    const typeInput = document.getElementById("genTypeInput");
    const name = (nameInput && nameInput.value ? nameInput.value : "").trim();
    const type = typeInput ? typeInput.value || "list" : state.draftType;
    const folder = resolveFolder();
    if (!name) {
      setCreateMessage("Please enter a name for the generator.", true);
      return;
    }

    let preparedItems = [];
    if (type !== "advanced") {
      preparedItems = normalizedDraftItems(type);
      if (!preparedItems.length) {
        setCreateMessage(type === "lexicon" ? "Add at least one valid lexicon entry before saving." : "Add at least one entry before saving.", true);
        return;
      }
      if (!skipDuplicateReview) {
        const analysis = analyzeDraftDuplicates(preparedItems, type);
        if (analysis.duplicates.length) {
          renderDuplicateReview({
            mode: "save",
            type,
            allItems: preparedItems,
            uniqueItems: analysis.uniqueItems,
            duplicates: analysis.duplicates
          });
          return;
        }
      }
    }

    const gens = loadGenerators();
    if (editingGeneratorId) {
      const index = gens.findIndex((gen) => gen.id === editingGeneratorId);
      if (index === -1) {
        setCreateMessage("This generator could not be found.", true);
        return;
      }
      const existingType = gens[index].type || "list";
      gens[index].name = name;
      gens[index].folder = folder;
      if (existingType === "list" || existingType === "lexicon") {
        gens[index].items = cloneItems(existingType, preparedItems);
      }
      saveGenerators(gens);
      activeGenerator = { id: editingGeneratorId };
    } else {
      const id = `gen-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      if (type === "advanced") {
        gens.push({
          id,
          folder,
          name,
          type: "advanced",
          items: { patterns: [], tokenMap: {}, multiTokenMap: {}, advancedMode: "simple" }
        });
      } else {
        gens.push({ id, folder, name, type, items: cloneItems(type, preparedItems) });
      }
      saveGenerators(gens);
      activeGenerator = { id };
    }

    renderGeneratorNav();
    renderMainPanel();
    const savedName = name;
    hideGeneratorCreateBoxV2();
    if (typeof showCopyMessage === "function") showCopyMessage(`Saved ${savedName}`);
  }

  function resolveSaveDuplicates(removeDuplicates) {
    const context = state.duplicateContext;
    if (!context || context.mode !== "save") return;
    state.draftItems = cloneItems(context.type, removeDuplicates ? context.uniqueItems : context.allItems);
    closeDuplicateReview();
    updateEntrySummary();
    saveGeneratorDraft(true);
  }

  function handleDuplicateRemove() {
    const context = state.duplicateContext;
    if (!context) return;
    if (context.mode === "add") appendIncomingEntries(true);
    if (context.mode === "save") resolveSaveDuplicates(true);
  }

  function handleDuplicateKeep() {
    const context = state.duplicateContext;
    if (!context) return;
    if (context.mode === "add") appendIncomingEntries(false);
    if (context.mode === "save") resolveSaveDuplicates(false);
  }

  function handleTypeChange(event) {
    const nextType = event.target.value || "list";
    const previousType = state.draftType;
    if (nextType === previousType) {
      updateEntrySummary();
      return;
    }
    if (state.draftItems.length) {
      const ok = window.confirm("Changing generator type will clear the entries currently staged in this editor. Continue?");
      if (!ok) {
        event.target.value = previousType;
        return;
      }
    }
    state.draftType = nextType;
    state.draftItems = [];
    setCreateMessage("");
    updateEntrySummary();
  }

  function replaceButtonAndBind(id, handler) {
    const oldButton = document.getElementById(id);
    if (!oldButton || !oldButton.parentNode) return null;
    const button = oldButton.cloneNode(true);
    oldButton.parentNode.replaceChild(button, oldButton);
    button.addEventListener("click", handler);
    return button;
  }

  function install() {
    injectStyles();
    ensureSupportingModals();
    rebuildCreateModal();
    replaceButtonAndBind("addGeneratorBtn", openNewGeneratorBoxV2);
    replaceButtonAndBind("cancelGeneratorBtn", hideGeneratorCreateBoxV2);
    replaceButtonAndBind("saveGeneratorBtn", () => saveGeneratorDraft(false));

    const folderSelect = document.getElementById("genFolderSelect");
    if (folderSelect) folderSelect.addEventListener("change", handleFolderSelectChange);
    const typeInput = document.getElementById("genTypeInput");
    if (typeInput) typeInput.addEventListener("change", handleTypeChange);
    document.getElementById("genAddEntriesBtn")?.addEventListener("click", openAddEntriesModal);
    document.getElementById("genManageEntriesBtn")?.addEventListener("click", openEntryManager);
    document.getElementById("genAddEntriesCloseBtn")?.addEventListener("click", closeAddEntriesModal);
    document.getElementById("genAddEntriesCancelBtn")?.addEventListener("click", closeAddEntriesModal);
    document.getElementById("genAddEntriesConfirmBtn")?.addEventListener("click", handleAddEntriesConfirm);
    document.getElementById("genDuplicateReviewCloseBtn")?.addEventListener("click", closeDuplicateReview);
    document.getElementById("genDuplicateRemoveBtn")?.addEventListener("click", handleDuplicateRemove);
    document.getElementById("genDuplicateKeepBtn")?.addEventListener("click", handleDuplicateKeep);
    document.getElementById("genEntryManagerCloseBtn")?.addEventListener("click", closeEntryManager);
    document.getElementById("genEntryManagerDoneBtn")?.addEventListener("click", closeEntryManager);
    document.getElementById("genEntryManagerDeleteSelectedBtn")?.addEventListener("click", deleteSelectedManagerEntries);
    document.getElementById("genEntryManagerSortBtn")?.addEventListener("click", sortManagerEntries);

    const managerSearch = document.getElementById("genEntryManagerSearch");
    if (managerSearch) {
      managerSearch.addEventListener("input", (event) => {
        state.managerSearch = event.target.value || "";
        renderEntryManager();
      });
    }
    const managerList = document.getElementById("genEntryManagerList");
    if (managerList) {
      managerList.addEventListener("input", handleManagerInput);
      managerList.addEventListener("click", handleManagerClick);
    }

    openNewGeneratorBox = openNewGeneratorBoxV2;
    openEditGeneratorBox = openEditGeneratorBoxV2;
    hideGeneratorCreateBox = hideGeneratorCreateBoxV2;
    updateEntrySummary();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();

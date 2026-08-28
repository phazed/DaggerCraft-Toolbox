// DaggerCraft Smart Lexicon polish layer
// Keeps the finalized v2 language logic intact while making all controls match
// the dark app theme and adding an obvious, safe Delete Word action.
(() => {
  "use strict";

  if (window.__daggerCraftLexiconPolishV1) return;
  window.__daggerCraftLexiconPolishV1 = true;

  const GEN_KEY = "vrahuneGeneratorsV4";
  let selectedWordKey = "";
  let selectedGeneratorId = "";
  let observer = null;
  let patchQueued = false;

  function loadGenerators() {
    try {
      const parsed = JSON.parse(localStorage.getItem(GEN_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveGenerators(gens) {
    localStorage.setItem(GEN_KEY, JSON.stringify(gens));
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function entryKey(entry) {
    return `${normalize(entry?.english)}|${normalize(entry?.valathi)}`;
  }

  function activeLexicon() {
    if (!document.getElementById("lexMode")) return null;
    const label = String(document.getElementById("activeGeneratorLabel")?.textContent || "").trim();
    const [namePart, folderPart] = label.split(" · ");
    const name = String(namePart || "").trim();
    const folder = String(folderPart || "").trim();
    const gens = loadGenerators();
    return gens.find((g) => g?.type === "lexicon" && g.name === name && (!folder || (g.folder || "General") === folder))
      || gens.find((g) => g?.type === "lexicon" && g.name === name)
      || null;
  }

  function injectStyles() {
    if (document.getElementById("lex-polish-v1-styles")) return;
    const style = document.createElement("style");
    style.id = "lex-polish-v1-styles";
    style.textContent = `
      /* Smart Lexicon controls should use the same dark visual language as DaggerCraft. */
      .lex-intel-modal input:not([type="checkbox"]):not([type="radio"]),
      .lex-intel-modal select,
      .lex-intel-modal textarea {
        box-sizing: border-box !important;
        width: 100% !important;
        min-height: 36px !important;
        padding: 8px 10px !important;
        border: 1px solid #303b50 !important;
        border-radius: 8px !important;
        background: #0b111b !important;
        color: #e7eefc !important;
        font: inherit !important;
        color-scheme: dark !important;
        outline: none !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.02) !important;
      }
      .lex-intel-modal input:not([type="checkbox"]):not([type="radio"])::placeholder,
      .lex-intel-modal textarea::placeholder {
        color: #667792 !important;
        opacity: 1 !important;
      }
      .lex-intel-modal input:not([type="checkbox"]):not([type="radio"]):hover,
      .lex-intel-modal select:hover,
      .lex-intel-modal textarea:hover {
        border-color: #40506c !important;
        background: #0d1521 !important;
      }
      .lex-intel-modal input:not([type="checkbox"]):not([type="radio"]):focus,
      .lex-intel-modal select:focus,
      .lex-intel-modal textarea:focus {
        border-color: #6288c9 !important;
        background: #0e1724 !important;
        box-shadow: 0 0 0 2px rgba(98,136,201,.16) !important;
      }
      .lex-intel-modal select option {
        background: #0b111b !important;
        color: #e7eefc !important;
      }
      .lex-intel-modal label {
        color: #aebbd1;
      }
      .lex-intel-modal input[type="checkbox"] {
        accent-color: #6f94d2;
      }
      .lex-delete-word {
        border-color: rgba(218,82,82,.55) !important;
        color: #ffaaaa !important;
        background: rgba(145,35,35,.13) !important;
      }
      .lex-delete-word:hover {
        border-color: rgba(235,94,94,.85) !important;
        color: #ffd0d0 !important;
        background: rgba(170,43,43,.22) !important;
      }
      .lex-detail-danger-zone {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid rgba(220,80,80,.18);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }
      .lex-detail-danger-zone .muted {
        font-size: .68rem;
        max-width: 520px;
      }
    `;
    document.head.appendChild(style);
  }

  function captureSelectedWord(event) {
    const row = event.target?.closest?.(".lex-analysis-row");
    if (!row) return;
    const gen = activeLexicon();
    selectedWordKey = String(row.dataset.key || "");
    selectedGeneratorId = String(gen?.id || "");
  }

  function removeWordAndMetadata(gen, key) {
    const target = (gen.items || []).find((entry) => entryKey(entry) === key);
    if (!target) return { removed: false, target: null };

    gen.items = (gen.items || []).filter((entry) => entryKey(entry) !== key);
    gen.languageMeta = { ...(gen.languageMeta || {}) };

    if (gen.languageMeta.wordDetails) delete gen.languageMeta.wordDetails[key];
    if (gen.languageMeta.compounds) delete gen.languageMeta.compounds[key];

    // Remove saved compounds whose ancestry points directly at the deleted entry.
    if (gen.languageMeta.compounds) {
      for (const [compoundKey, meta] of Object.entries(gen.languageMeta.compounds)) {
        const roots = Array.isArray(meta?.roots) ? meta.roots : [];
        if (roots.some((root) => root?.entryKey === key)) delete gen.languageMeta.compounds[compoundKey];
      }
    }

    // Force v2 to regenerate analysis/patterns/families from the remaining entries.
    if (gen.languageMeta.analysis) delete gen.languageMeta.analysis;
    return { removed: true, target };
  }

  function deleteSelectedWord() {
    if (!selectedGeneratorId || !selectedWordKey) return;
    const gens = loadGenerators();
    const idx = gens.findIndex((g) => g?.id === selectedGeneratorId);
    if (idx < 0) return;

    const target = (gens[idx].items || []).find((entry) => entryKey(entry) === selectedWordKey);
    if (!target) return;

    const language = String(gens[idx].languageMeta?.language || gens[idx].name || "this lexicon");
    const ok = window.confirm(`Delete “${target.english} = ${target.valathi}” from ${language}?\n\nThis removes the word and its Smart Lexicon metadata. This cannot be undone.`);
    if (!ok) return;

    const result = removeWordAndMetadata(gens[idx], selectedWordKey);
    if (!result.removed) return;
    saveGenerators(gens);

    selectedWordKey = "";
    selectedGeneratorId = "";
    const details = document.getElementById("lexWordDetailsBox");
    if (details) details.style.display = "none";

    // Re-open the active lexicon so the dictionary count/list refreshes immediately.
    if (typeof window.renderMainPanel === "function") {
      try { window.renderMainPanel(); } catch {}
    }
    const active = activeLexicon();
    if (active) {
      const candidate = document.querySelector(`[data-id="${CSS.escape(active.id)}"]`);
      if (candidate) candidate.click();
    }

    window.alert(`Removed “${result.target.english} = ${result.target.valathi}”.`);
  }

  function patchWordDetails() {
    const box = document.getElementById("lexWordDetailsBox");
    if (!box || box.style.display === "none") return;
    const body = document.getElementById("lexWordDetailsBody");
    if (!body || body.querySelector(".lex-detail-danger-zone")) return;

    const gen = loadGenerators().find((g) => g?.id === selectedGeneratorId);
    const target = (gen?.items || []).find((entry) => entryKey(entry) === selectedWordKey);
    if (!gen || !target) return;

    const zone = document.createElement("div");
    zone.className = "lex-detail-danger-zone";
    zone.innerHTML = `<div class="muted">Remove this entry completely from the lexicon. Word Builder analysis will be rebuilt from the remaining words.</div><button type="button" class="btn-secondary btn-small lex-delete-word">Delete Word</button>`;
    body.appendChild(zone);
    zone.querySelector(".lex-delete-word")?.addEventListener("click", deleteSelectedWord);
  }

  function patch() {
    injectStyles();
    patchWordDetails();
  }

  function schedulePatch() {
    if (patchQueued) return;
    patchQueued = true;
    requestAnimationFrame(() => {
      patchQueued = false;
      observer?.disconnect();
      patch();
      observer?.observe(document.body, { childList: true, subtree: true });
    });
  }

  function init() {
    injectStyles();
    document.addEventListener("click", captureSelectedWord, true);
    observer = new MutationObserver(schedulePatch);
    observer.observe(document.body, { childList: true, subtree: true });
    schedulePatch();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
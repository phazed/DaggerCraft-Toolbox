// DaggerCraft Lexicon UI v2
// Keeps the legacy english/valathi storage keys for backward compatibility,
// but makes every visible lexicon label derive from the actual lexicon name.
(() => {
  "use strict";

  if (window.__daggerCraftLexiconUiV2) return;
  window.__daggerCraftLexiconUiV2 = true;

  let observer = null;
  let scheduled = false;

  function inferTargetLanguage(name) {
    let value = String(name || "").trim();
    value = value.replace(/\s+(?:lexicon|dictionary|glossary)\s*$/i, "").trim();
    return value || "Target Language";
  }

  function activeGeneratorName() {
    const label = document.getElementById("activeGeneratorLabel");
    const text = String(label?.textContent || "").trim();
    if (!text || /^(?:No generator|Generator not found|Tool)/i.test(text)) return "";
    return text.split(" · ")[0].trim();
  }

  function modalGeneratorName() {
    return String(document.getElementById("genNameInput")?.value || "").trim();
  }

  function targetForCreateModal() {
    return inferTargetLanguage(modalGeneratorName());
  }

  function targetForActiveLexicon() {
    const manageTitle = String(document.getElementById("lexManageTitle")?.textContent || "");
    const manageMatch = manageTitle.match(/Manage Lexicon\s*[–-]\s*(.+)$/i);
    if (manageMatch?.[1]) return inferTargetLanguage(manageMatch[1]);
    return inferTargetLanguage(activeGeneratorName());
  }

  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  function replaceVisibleLegacyText(root, target) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const parent = node.parentElement;
      if (!parent || parent.matches("script,style,textarea,input,option")) continue;
      const before = node.nodeValue || "";
      const after = before
        .replace(/english\s*=\s*valathi/gi, `Common = ${target}`)
        .replace(/common\s*=\s*valathi/gi, `Common = ${target}`)
        .replace(/Use [“\"']?common\s*=\s*valathi[”\"']?/gi, `Use “Common = ${target}”`)
        .replace(/Use [“\"']?english\s*=\s*valathi[”\"']?/gi, `Use “Common = ${target}”`);
      if (after !== before) node.nodeValue = after;
    }
  }

  function patchTypeSelector() {
    const type = document.getElementById("genTypeInput");
    const option = type?.querySelector('option[value="lexicon"]');
    if (option && option.textContent !== "Lexicon (translation pairs)") {
      option.textContent = "Lexicon (translation pairs)";
    }
  }

  function patchCreateEditor() {
    const type = document.getElementById("genTypeInput");
    if (!type || type.value !== "lexicon") return;

    const target = targetForCreateModal();
    const sectionTitle = document.getElementById("genEntrySectionTitle");
    const sectionHint = document.getElementById("genEntrySectionHint");
    setText(sectionTitle, "Lexicon Entries");
    setText(sectionHint, `Each entry maps Common to ${target}.`);

    const addLabel = document.getElementById("genAddEntriesLabel");
    if (addLabel) setText(addLabel, `Paste entries (Common = ${target})`);

    const addInput = document.getElementById("genAddEntriesInput");
    if (addInput) {
      const placeholder = `common word = ${target} word\nanother word = another translation`;
      if (addInput.placeholder !== placeholder) addInput.placeholder = placeholder;
    }

    document.querySelectorAll('#genEntryManagerList input[data-field="english"]').forEach((input) => {
      if (input.placeholder !== "Common") input.placeholder = "Common";
      input.setAttribute("aria-label", "Common");
    });
    document.querySelectorAll('#genEntryManagerList input[data-field="valathi"]').forEach((input) => {
      if (input.placeholder !== target) input.placeholder = target;
      input.setAttribute("aria-label", target);
    });

    const managerTitle = document.getElementById("genEntryManagerTitle");
    if (managerTitle && /Lexicon/i.test(managerTitle.textContent || "")) {
      setText(managerTitle, `View / Edit ${target} Lexicon Entries`);
    }

    replaceVisibleLegacyText(document.getElementById("generatorCreateBox"), target);
    replaceVisibleLegacyText(document.getElementById("genAddEntriesBox"), target);
    replaceVisibleLegacyText(document.getElementById("genEntryManagerBox"), target);
    replaceVisibleLegacyText(document.getElementById("genDuplicateReviewBox"), target);
  }

  function patchActiveLexicon() {
    const lexMode = document.getElementById("lexMode");
    if (!lexMode) return;
    const target = targetForActiveLexicon();
    const enTo = lexMode.querySelector('option[value="en-to-va"]');
    const vaTo = lexMode.querySelector('option[value="va-to-en"]');
    if (enTo) setText(enTo, `Common → ${target}`);
    if (vaTo) setText(vaTo, `${target} → Common`);
  }

  function patchManageLexicon() {
    const box = document.getElementById("lexManageBox");
    if (!box || getComputedStyle(box).display === "none") return;
    const target = targetForActiveLexicon();

    const addLabel = box.querySelector('label[for="lexManageAddInput"]');
    if (addLabel) setText(addLabel, `Add entries (Common = ${target})`);

    const input = box.querySelector("#lexManageAddInput");
    if (input) {
      const placeholder = `common word = ${target} word\nanother word = another translation`;
      if (input.placeholder !== placeholder) input.placeholder = placeholder;
    }

    replaceVisibleLegacyText(box, target);
  }

  function patch() {
    patchTypeSelector();
    patchCreateEditor();
    patchActiveLexicon();
    patchManageLexicon();
  }

  function schedulePatch() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      patch();
    });
  }

  function init() {
    observer = new MutationObserver(schedulePatch);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    document.addEventListener("input", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.matches("#genNameInput")) schedulePatch();
    });
    document.addEventListener("change", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.matches("#genTypeInput")) schedulePatch();
    });
    document.addEventListener("click", schedulePatch, true);

    schedulePatch();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

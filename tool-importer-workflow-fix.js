// DaggerCraft Stat Block Importer workflow/state fix
// Keeps method switching, review state, saving, and tool navigation in sync.
(() => {
  "use strict";

  if (window.__daggerCraftImporterWorkflowFixV1) return;
  window.__daggerCraftImporterWorkflowFixV1 = true;

  const VAULT_KEY = "vrahuneMonsterVaultStateV2";
  let resetting = false;

  function panel() {
    return document.getElementById("generatorPanel");
  }

  function root() {
    return panel()?.querySelector(".sbi-root") || null;
  }

  function q(id) {
    return panel()?.querySelector(`#${id}`) || null;
  }

  function intFrom(value, fallback = 0) {
    const match = String(value ?? "").match(/[+-]?\d+/);
    if (!match) return fallback;
    const n = Number(match[0]);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }

  function listFrom(value) {
    return [...new Set(String(value ?? "")
      .split(/[,;]+/)
      .map((item) => item.trim())
      .filter(Boolean))];
  }

  function parseEntries(value) {
    const lines = String(value ?? "")
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const entries = [];
    let current = null;
    for (const line of lines) {
      const match = line.match(/^(.{1,140}?)\.\s+(.+)$/);
      if (match) {
        current = { name: match[1].trim(), text: match[2].trim() };
        entries.push(current);
      } else if (current) {
        current.text = `${current.text} ${line}`.replace(/\s{2,}/g, " ").trim();
      }
    }
    return entries;
  }

  function reviewedMonsterFromDom() {
    const r = root();
    if (!r || !q("sbi-name")) return null;
    const value = (id) => q(id)?.value ?? "";

    const name = String(value("sbi-name")).trim();
    if (!name) return null;

    const sizeType = String(value("sbi-sizeType")).trim();
    const alignment = String(value("sbi-alignment")).trim();
    const speedText = String(value("sbi-speed")).trim() || "30 ft.";
    const initiativeText = String(value("sbi-initiative")).trim();

    return {
      name,
      sizeType,
      alignment,
      ac: Math.max(1, intFrom(value("sbi-ac"), 10)),
      acText: String(value("sbi-acText")).trim(),
      hp: Math.max(1, intFrom(value("sbi-hp"), 1)),
      hpFormula: String(value("sbi-hpFormula")).trim(),
      speed: speedText,
      initiative: initiativeText,
      cr: String(value("sbi-cr")).trim() || "1/8",
      xp: Math.max(0, intFrom(value("sbi-xp"), 0)),
      proficiencyBonus: intFrom(value("sbi-pb"), 2),
      str: Math.max(1, intFrom(value("sbi-str"), 10)),
      dex: Math.max(1, intFrom(value("sbi-dex"), 10)),
      con: Math.max(1, intFrom(value("sbi-con"), 10)),
      int: Math.max(1, intFrom(value("sbi-int"), 10)),
      wis: Math.max(1, intFrom(value("sbi-wis"), 10)),
      cha: Math.max(1, intFrom(value("sbi-cha"), 10)),
      saves: listFrom(value("sbi-saves")),
      skills: listFrom(value("sbi-skills")),
      vulnerabilities: listFrom(value("sbi-vuln")),
      resistances: listFrom(value("sbi-resist")),
      immunities: listFrom(value("sbi-immune")),
      conditionImmunities: listFrom(value("sbi-condImm")),
      senses: listFrom(value("sbi-senses")),
      languages: listFrom(value("sbi-languages")),
      habitats: listFrom(value("sbi-habitats")),
      traits: parseEntries(value("sbi-traits")),
      actions: parseEntries(value("sbi-actions")),
      bonusActions: parseEntries(value("sbi-bonusActions")),
      reactions: parseEntries(value("sbi-reactions")),
      legendaryActions: parseEntries(value("sbi-legendaryActions"))
    };
  }

  function toVaultMonster(monster) {
    const api = window.VrahuneMonsterVault || window.MonsterVault || window.vrahuneMonsterVault;
    let existingId = "";
    try {
      const all = typeof api?.getAllMonsters === "function" ? api.getAllMonsters() : [];
      const existing = (all || []).find((item) => {
        const homebrew = item?.isHomebrew || String(item?.sourceType || "").toLowerCase() === "homebrew" || /homebrew/i.test(String(item?.source || ""));
        return homebrew && String(item?.name || "").trim().toLowerCase() === monster.name.toLowerCase();
      });
      existingId = existing?.id ? String(existing.id) : "";
    } catch (_) {}

    const join = (items) => Array.isArray(items) ? items.filter(Boolean).join(", ") : String(items || "").trim();
    const combinedSize = [monster.sizeType, monster.alignment].filter(Boolean).join(", ");
    const speedNumber = Math.max(0, intFrom(monster.speed, 30));

    return {
      id: existingId || `hbm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: monster.name,
      type: "Enemy",
      source: "Homebrew",
      isHomebrew: true,
      sizeType: combinedSize,
      cr: monster.cr,
      xp: monster.xp,
      ac: monster.ac,
      hp: monster.hp,
      speed: speedNumber,
      speedText: monster.speed,
      initiative: intFrom(monster.initiative, 0),
      details: {
        proficiencyBonus: monster.proficiencyBonus,
        abilityScores: {
          str: monster.str,
          dex: monster.dex,
          con: monster.con,
          int: monster.int,
          wis: monster.wis,
          cha: monster.cha
        },
        savingThrows: join(monster.saves),
        skills: join(monster.skills),
        damageVulnerabilities: join(monster.vulnerabilities),
        damageResistances: join(monster.resistances),
        damageImmunities: join(monster.immunities),
        conditionImmunities: join(monster.conditionImmunities),
        senses: join(monster.senses),
        languages: join(monster.languages),
        challengeNote: "",
        traits: monster.traits,
        actions: monster.actions,
        bonusActions: monster.bonusActions,
        reactions: monster.reactions,
        legendaryActions: monster.legendaryActions
      }
    };
  }

  function saveThroughVault(monster) {
    const raw = toVaultMonster(monster);
    const api = window.VrahuneMonsterVault || window.MonsterVault || window.vrahuneMonsterVault;

    if (api && typeof api.addHomebrewMonster === "function") {
      api.addHomebrewMonster(raw);
      return raw;
    }

    // Fallback for an unusually early/partial load. The normal desktop path uses the API above.
    const stored = localStorage.getItem(VAULT_KEY);
    const state = stored ? JSON.parse(stored) : {};
    const homebrew = Array.isArray(state.homebrew) ? state.homebrew : [];
    const index = homebrew.findIndex((item) => String(item?.name || "").trim().toLowerCase() === monster.name.toLowerCase());
    if (index >= 0) {
      raw.id = homebrew[index]?.id || raw.id;
      homebrew[index] = { ...homebrew[index], ...raw, id: raw.id };
    } else {
      homebrew.push(raw);
    }
    state.homebrew = homebrew;
    localStorage.setItem(VAULT_KEY, JSON.stringify(state));
    return raw;
  }

  function renderImporter() {
    const renderer = window.toolRenderers?.statblockImporter;
    const p = panel();
    if (!p || typeof renderer !== "function") return false;
    renderer({
      labelEl: document.getElementById("activeGeneratorLabel"),
      panelEl: p
    });
    return true;
  }

  function clearCoreState() {
    if (resetting) return;
    resetting = true;
    try {
      // Each clear button re-renders synchronously, so re-query between clicks.
      q("sbi-clear")?.click();
      q("sbi-import-clear")?.click();
      root()?.classList.remove("sbi-wiz-review");
    } finally {
      resetting = false;
    }
  }

  function returnToFreshChooser() {
    if (!root()) renderImporter();
    clearCoreState();
    root()?.classList.remove("sbi-wiz-review");

    // The wizard decorates after the core renderer, so its Back control may not exist yet.
    // Reset immediately when possible, then retry after the decoration frame.
    const resetWizardMode = () => {
      const back = q("sbiWizBack");
      if (!back) return false;
      back.click();
      root()?.classList.remove("sbi-wiz-review");
      return true;
    };

    if (!resetWizardMode()) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resetWizardMode();
        });
      });
    }
  }

  function toast(message) {
    document.querySelector(".sbi-workflow-toast")?.remove();
    const el = document.createElement("div");
    el.className = "sbi-workflow-toast";
    el.textContent = message;
    Object.assign(el.style, {
      position: "fixed",
      right: "18px",
      bottom: "18px",
      zIndex: "9000",
      padding: "10px 13px",
      borderRadius: "10px",
      border: "1px solid rgba(123,216,143,.4)",
      background: "#0b1511",
      color: "#e7fff0",
      boxShadow: "0 16px 44px rgba(0,0,0,.48)",
      fontSize: "12px",
      fontWeight: "700"
    });
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 2600);
  }

  function saveAndReset(event) {
    const monster = reviewedMonsterFromDom();
    if (!monster) {
      window.alert("Nothing is ready to save yet.");
      return;
    }

    try {
      saveThroughVault(monster);
      // Monster Vault's legacy API renders itself after save. Restore the importer in the
      // same event turn so the user never gets kicked out of the import workflow.
      renderImporter();
      returnToFreshChooser();
      toast(`Saved ${monster.name} to Monster Vault`);
    } catch (error) {
      console.error("[DaggerCraft] Could not save imported monster", error);
      window.alert(`Could not save to Monster Vault: ${error?.message || error}`);
    }
  }

  function currentWizardMode(r) {
    if (!r) return "";
    if (r.classList.contains("sbi-wiz-paste")) return "paste";
    if (r.classList.contains("sbi-wiz-image")) return "image";
    if (r.classList.contains("sbi-wiz-json")) return "json";
    return "";
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    // Own both save buttons so the legacy Vault render cannot hijack the current tool.
    if (target.closest("#sbiWizSaveVault, #sbi-add-to-vault")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      saveAndReset(event);
      return;
    }

    // Starting another method is a new import. Do not carry the previous parsed monster,
    // screenshot, JSON selection, or green Review state into it.
    const method = target.closest("[data-sbi-wiz]");
    if (method) {
      const r = root();
      const next = String(method.getAttribute("data-sbi-wiz") || "");
      const current = currentWizardMode(r);
      if (current && (current !== next || r?.classList.contains("sbi-wiz-review") || q("sbi-name"))) {
        clearCoreState();
      }
      return;
    }

    if (target.closest("#sbiWizBack")) {
      clearCoreState();
      root()?.classList.remove("sbi-wiz-review");
      return;
    }

    // Opening the importer from another tool should always give a predictable fresh chooser.
    const importerNav = target.closest('.nav-tool[data-id="statblockImporter"], [data-tool-id="statblockImporter"], [data-tool="statblockImporter"]');
    if (importerNav) {
      window.setTimeout(() => returnToFreshChooser(), 0);
    }
  }, true);
})();

// DaggerCraft Markdown Statblock Parser v2
// Gives Markdown imports their own parser instead of routing Markdown through the OCR parser.
(() => {
  "use strict";

  if (typeof window !== "undefined" && window.__daggerCraftMarkdownParserV2) return;
  if (typeof window !== "undefined") window.__daggerCraftMarkdownParserV2 = true;

  const SECTION_MAP = {
    traits: "traits",
    trait: "traits",
    actions: "actions",
    action: "actions",
    "bonus actions": "bonusActions",
    "bonus action": "bonusActions",
    reactions: "reactions",
    reaction: "reactions",
    "legendary actions": "legendaryActions",
    "legendary action": "legendaryActions",
    "mythic actions": "legendaryActions"
  };

  const LABELS = [
    "armor class", "ac", "hit points", "hp", "speed", "initiative",
    "saving throws", "saves", "skills", "damage vulnerabilities", "vulnerabilities",
    "damage resistances", "resistances", "damage immunities", "immunities",
    "condition immunities", "senses", "languages", "challenge", "cr",
    "proficiency bonus", "pb", "habitat", "environment"
  ];

  function uniq(values) {
    const seen = new Set();
    const out = [];
    for (const value of values || []) {
      const text = String(value ?? "").trim();
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
    return out;
  }

  function stripBlockquote(line) {
    return String(line ?? "").replace(/^\s*>+\s?/, "");
  }

  function isDivider(line) {
    const text = stripBlockquote(line).trim();
    return /^(?:_{3,}|-{3,}|\*{3,})$/.test(text);
  }

  function stripInlineMarkdown(text) {
    let value = String(text ?? "");
    value = value.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
    value = value.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    value = value.replace(/<br\s*\/?>/gi, " ");
    value = value.replace(/<[^>]+>/g, "");
    value = value.replace(/`([^`]+)`/g, "$1");
    value = value.replace(/\*{1,3}([^*]+?)\*{1,3}/g, "$1");
    value = value.replace(/_{1,3}([^_]+?)_{1,3}/g, "$1");
    value = value.replace(/\\([*_`{}\[\]()#+\-.!])/g, "$1");
    return value.replace(/\s{2,}/g, " ").trim();
  }

  function cleanLine(raw) {
    let value = stripBlockquote(raw).trim();
    if (!value || isDivider(value)) return "";
    value = value.replace(/^\s{0,3}#{1,6}\s+/, "");
    value = value.replace(/^\s*[-+*]\s+/, "");
    return stripInlineMarkdown(value);
  }

  function splitCsv(value) {
    return uniq(String(value ?? "").split(/[,;]+/).map((part) => part.trim()));
  }

  function parseSubtitle(value) {
    const text = stripInlineMarkdown(value);
    const comma = text.indexOf(",");
    if (comma < 0) return { sizeType: text, alignment: "" };
    return {
      sizeType: text.slice(0, comma).trim(),
      alignment: text.slice(comma + 1).trim()
    };
  }

  function parseAbilityTable(rawLines) {
    for (let i = 0; i < rawLines.length; i++) {
      const header = stripBlockquote(rawLines[i]).trim();
      const normalized = header.replace(/\s+/g, "").replace(/^\|/, "").replace(/\|$/, "").toUpperCase();
      if (normalized !== "STR|DEX|CON|INT|WIS|CHA") continue;

      let j = i + 1;
      while (j < rawLines.length) {
        const maybe = stripBlockquote(rawLines[j]).trim();
        if (!maybe) { j++; continue; }
        if (/^\|?\s*:?-{2,}:?(?:\s*\|\s*:?-{2,}:?){5}\s*\|?$/.test(maybe)) { j++; continue; }
        break;
      }
      if (j >= rawLines.length) continue;

      const row = stripBlockquote(rawLines[j]).trim().replace(/^\|/, "").replace(/\|$/, "");
      const cells = row.split("|").map((cell) => stripInlineMarkdown(cell).trim());
      if (cells.length < 6) continue;
      const scores = cells.slice(0, 6).map((cell) => {
        const m = cell.match(/\b(\d{1,2})\b/);
        return m ? Math.max(1, Math.min(30, Number(m[1]))) : 10;
      });
      return { str:scores[0], dex:scores[1], con:scores[2], int:scores[3], wis:scores[4], cha:scores[5] };
    }

    const joined = rawLines.map(cleanLine).join("\n");
    const out = {};
    for (const key of ["str","dex","con","int","wis","cha"]) {
      const re = new RegExp(`\\b${key}\\b\\s*[:|-]?\\s*(\\d{1,2})`, "i");
      const m = joined.match(re);
      if (m) out[key] = Math.max(1, Math.min(30, Number(m[1])));
    }
    return {
      str: out.str ?? 10, dex: out.dex ?? 10, con: out.con ?? 10,
      int: out.int ?? 10, wis: out.wis ?? 10, cha: out.cha ?? 10
    };
  }

  function sectionName(raw) {
    let text = stripBlockquote(raw).trim();
    text = text.replace(/^\s{0,3}#{1,6}\s+/, "");
    text = stripInlineMarkdown(text).replace(/:$/, "").trim().toLowerCase();
    return SECTION_MAP[text] || "";
  }

  function emphasizedFeature(raw) {
    const text = stripBlockquote(raw).trim();
    let m = text.match(/^\*{2,3}(.+?\.)\*{2,3}\s*(.*)$/);
    if (!m) m = text.match(/^_{2,3}(.+?\.)_{2,3}\s*(.*)$/);
    if (!m) return null;
    return {
      name: stripInlineMarkdown(m[1]).replace(/\.$/, "").trim(),
      text: stripInlineMarkdown(m[2]).trim()
    };
  }

  function plainFeature(raw) {
    const text = cleanLine(raw);
    if (!text) return null;
    const m = text.match(/^([^.!?]{2,100})\.\s+(.+)$/);
    if (!m) return null;
    const name = m[1].trim();
    if (LABELS.some((label) => name.toLowerCase() === label)) return null;
    return { name, text: m[2].trim() };
  }

  function parseChallenge(text, result) {
    const cr = text.match(/^(?:Challenge|CR)\s*[:\-]?\s*([0-9]+(?:\/[0-9]+)?)/i);
    if (cr) result.cr = cr[1];
    const xp = text.match(/\bXP\s*([\d,]+)/i);
    if (xp) result.xp = Number(xp[1].replace(/,/g, ""));
    const pb = text.match(/\bPB\s*([+\-]?\d+)/i);
    if (pb) result.proficiencyBonus = Number(pb[1]);
  }

  function parseMarkdownStatblock(markdown) {
    const rawLines = String(markdown ?? "").replace(/\r/g, "").split("\n");
    const meaningful = [];
    for (let i = 0; i < rawLines.length; i++) {
      if (isDivider(rawLines[i])) continue;
      const clean = cleanLine(rawLines[i]);
      if (!clean) continue;
      meaningful.push({ raw: rawLines[i], clean, index: i });
    }

    const result = {
      name: "",
      sizeType: "",
      alignment: "",
      ac: 10,
      acText: "",
      hp: 1,
      hpFormula: "",
      speed: "30 ft.",
      initiative: "",
      cr: "",
      xp: 0,
      proficiencyBonus: 2,
      str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
      saves: [], skills: [], vulnerabilities: [], resistances: [], immunities: [],
      conditionImmunities: [], senses: [], languages: [], habitats: [],
      traits: [], actions: [], bonusActions: [], reactions: [], legendaryActions: [],
      source: "Imported Markdown",
      sourceType: "homebrew",
      importedFrom: "markdown",
      importedAt: new Date().toISOString(),
      unmappedText: ""
    };

    const nameEntry = meaningful.find((entry) => {
      const low = entry.clean.toLowerCase();
      if (sectionName(entry.raw)) return false;
      if (LABELS.some((label) => low.startsWith(label + " ") || low.startsWith(label + ":"))) return false;
      if (/^(STR|DEX|CON|INT|WIS|CHA)(?:\||\s)/i.test(entry.clean)) return false;
      if (entry.clean.includes("|")) return false;
      return true;
    });
    if (nameEntry) result.name = nameEntry.clean;

    if (nameEntry) {
      const subtitle = meaningful.find((entry) => entry.index > nameEntry.index && !sectionName(entry.raw) && !LABELS.some((label) => entry.clean.toLowerCase().startsWith(label)) && !entry.clean.includes("|") && /\b(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i.test(entry.clean));
      if (subtitle) Object.assign(result, parseSubtitle(subtitle.clean));
    }

    Object.assign(result, parseAbilityTable(rawLines));

    let section = "traits";
    let currentFeature = null;
    const unmapped = [];

    const finishFeature = () => { currentFeature = null; };
    const pushFeature = (feature) => {
      if (!feature?.name && !feature?.text) return;
      const target = result[section] || result.traits;
      target.push({ name: feature.name || "Feature", text: feature.text || "" });
      currentFeature = target[target.length - 1];
    };

    for (const raw of rawLines) {
      if (isDivider(raw)) { finishFeature(); continue; }
      const sec = sectionName(raw);
      if (sec) { section = sec; finishFeature(); continue; }

      const line = cleanLine(raw);
      if (!line) continue;
      if (line === result.name || line === [result.sizeType, result.alignment].filter(Boolean).join(", ")) continue;
      if (/^\|/.test(stripBlockquote(raw).trim()) || /^:?-{2,}:?(?:\s*\|)/.test(stripBlockquote(raw).trim())) continue;
      if (/^(STR|DEX|CON|INT|WIS|CHA)\b/i.test(line) && /\d/.test(line)) continue;

      let m;
      if ((m = line.match(/^(?:Armor Class|AC)\s*[:\-]?\s*(\d{1,2})(?:\s*\(([^)]+)\))?/i))) {
        result.ac = Number(m[1]); result.acText = (m[2] || "").trim(); finishFeature(); continue;
      }
      if ((m = line.match(/^(?:Hit Points|HP)\s*[:\-]?\s*(\d{1,4})(?:\s*\(([^)]+)\))?/i))) {
        result.hp = Number(m[1]); result.hpFormula = (m[2] || "").trim(); finishFeature(); continue;
      }
      if ((m = line.match(/^Speed\s*[:\-]?\s*(.+)$/i))) { result.speed = m[1].trim(); finishFeature(); continue; }
      if ((m = line.match(/^Initiative\s*[:\-]?\s*(.+)$/i))) { result.initiative = m[1].trim(); finishFeature(); continue; }
      if (/^(?:Challenge|CR)\b/i.test(line)) { parseChallenge(line, result); finishFeature(); continue; }
      if ((m = line.match(/^(?:Proficiency Bonus|PB)\s*[:\-]?\s*([+\-]?\d+)/i))) { result.proficiencyBonus = Number(m[1]); finishFeature(); continue; }

      const fieldMap = [
        [/^(?:Saving Throws|Saves)\s*[:\-]?\s*(.+)$/i, "saves"],
        [/^Skills\s*[:\-]?\s*(.+)$/i, "skills"],
        [/^(?:Damage Vulnerabilities|Vulnerabilities)\s*[:\-]?\s*(.+)$/i, "vulnerabilities"],
        [/^(?:Damage Resistances|Resistances)\s*[:\-]?\s*(.+)$/i, "resistances"],
        [/^(?:Damage Immunities|Immunities)\s*[:\-]?\s*(.+)$/i, "immunities"],
        [/^Condition Immunities\s*[:\-]?\s*(.+)$/i, "conditionImmunities"],
        [/^Senses\s*[:\-]?\s*(.+)$/i, "senses"],
        [/^Languages\s*[:\-]?\s*(.+)$/i, "languages"],
        [/^(?:Habitat|Environment)\s*[:\-]?\s*(.+)$/i, "habitats"]
      ];
      let handled = false;
      for (const [re, key] of fieldMap) {
        const hit = line.match(re);
        if (!hit) continue;
        result[key] = splitCsv(hit[1]);
        finishFeature(); handled = true; break;
      }
      if (handled) continue;

      if (result.sizeType && line.toLowerCase().startsWith(result.sizeType.toLowerCase())) continue;

      const feature = emphasizedFeature(raw) || plainFeature(raw);
      if (feature) { pushFeature(feature); continue; }

      if (currentFeature && section) {
        currentFeature.text = `${currentFeature.text} ${line}`.replace(/\s{2,}/g, " ").trim();
      } else if (!/^\s*$/.test(line)) {
        unmapped.push(line);
      }
    }

    result.saves = uniq(result.saves);
    result.skills = uniq(result.skills);
    result.vulnerabilities = uniq(result.vulnerabilities);
    result.resistances = uniq(result.resistances);
    result.immunities = uniq(result.immunities);
    result.conditionImmunities = uniq(result.conditionImmunities);
    result.senses = uniq(result.senses);
    result.languages = uniq(result.languages);
    result.habitats = uniq(result.habitats);
    result.unmappedText = uniq(unmapped.filter((x) => x !== result.name)).join("\n");

    return result;
  }

  function installBrowserBridge() {
    if (typeof document === "undefined") return;

    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest("#sbi-import-parse-md")) return;

      const root = document.querySelector("#generatorPanel .sbi-root");
      const markdownArea = root?.querySelector("#sbi-import-markdown");
      const jsonArea = root?.querySelector("#sbi-import-json");
      const loadJson = root?.querySelector("#sbi-import-load");
      if (!markdownArea || !jsonArea || !loadJson) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      try {
        const parsed = parseMarkdownStatblock(markdownArea.value || "");
        if (!parsed.name) throw new Error("Could not find a monster name in this Markdown file.");
        jsonArea.value = JSON.stringify(parsed, null, 2);
        jsonArea.dispatchEvent(new Event("input", { bubbles: true }));
        if (typeof window !== "undefined") window.__daggerCraftMarkdownLastParse = parsed;
        loadJson.click();
      } catch (error) {
        console.error("[DaggerCraft] Markdown statblock parse failed", error);
        window.alert(`Could not parse this Markdown statblock: ${error?.message || error}`);
      }
    }, true);
  }

  if (typeof window !== "undefined") {
    window.__daggerCraftParseMarkdownStatblockV2 = parseMarkdownStatblock;
    installBrowserBridge();
  }
})();

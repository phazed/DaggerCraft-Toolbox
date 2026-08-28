// DaggerCraft Lexicon Intelligence v1
// Adds automatic language analysis + a lightweight Word Builder without changing
// the legacy english/valathi pair schema. Intelligence metadata lives on each
// lexicon generator as languageMeta so it travels with normal generator backups.
(() => {
  "use strict";

  if (window.__daggerCraftLexiconIntelligenceV1) return;
  window.__daggerCraftLexiconIntelligenceV1 = true;

  const GEN_KEY = "vrahuneGeneratorsV4";
  const STOP_WORDS = new Set(["a","an","the","of","in","on","at","for","to","from","and","or","with","by"]);
  const PLACE_WORDS = new Set(["home","house","hall","cave","city","town","village","land","realm","kingdom","forest","wood","river","lake","sea","ocean","mountain","hill","valley","road","path","gate","tower","fort","fortress","castle","temple","shrine","harbor","port","island","field","mine"]);
  const PERSON_WORDS = new Set(["person","people","man","woman","child","king","queen","lord","lady","guardian","guard","warrior","soldier","smith","priest","mage","wizard","ruler","chief","captain","hunter"]);
  const MATERIAL_WORDS = new Set(["stone","rock","iron","steel","gold","silver","copper","wood","bone","glass","ash","sand","ice","water","fire","flame"]);
  const DESCRIPTOR_WORDS = new Set(["high","low","deep","hidden","secret","old","ancient","new","young","great","small","large","black","white","red","blue","green","bright","dark","strong","weak","cold","hot","holy","dead","living","noble","wild","silent","broken","lost"]);
  const ACTION_WORDS = new Set(["go","come","run","walk","fight","guard","protect","build","make","forge","burn","speak","say","see","know","live","die","kill","give","take","hold","rule","hunt","sing","write","read","remember","hide","open","close"]);
  const VOWELS = "aeiouy";

  let observer = null;
  let patchScheduled = false;
  let scanTimer = null;
  const builder = { generatorId: null, concept: "", overrides: {}, lastSuggestions: [] };

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

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

  function inferLanguage(name) {
    return String(name || "")
      .replace(/\s+(?:lexicon|dictionary|glossary)\s*$/i, "")
      .trim() || "Target Language";
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

  function cleanTargetWord(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z'’\-]/g, "")
      .replace(/[’]/g, "'")
      .trim();
  }

  function glossTokens(value) {
    const raw = String(value || "").toLowerCase().replace(/[^a-z0-9' -]+/g, " ");
    return raw.split(/[\s\-]+/).map((x) => x.trim()).filter(Boolean);
  }

  function stemEnglish(word) {
    let w = String(word || "").toLowerCase();
    if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.length > 4 && w.endsWith("ing")) return w.slice(0, -3);
    if (w.length > 3 && w.endsWith("ed")) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith("es")) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
    return w;
  }

  function classifyGloss(common) {
    const tokens = glossTokens(common);
    const primary = stemEnglish(tokens[0] || "");
    const joined = tokens.join(" ");

    if (!primary) return { category: "concept", confidence: 0.35 };
    if (STOP_WORDS.has(primary)) return { category: "connector", confidence: 0.95 };
    if (PLACE_WORDS.has(primary) || tokens.some((t) => PLACE_WORDS.has(stemEnglish(t)))) return { category: "place/thing", confidence: 0.9 };
    if (PERSON_WORDS.has(primary) || /(?:er|or|ist|ian|keeper|master)$/.test(primary)) return { category: "person/role", confidence: 0.82 };
    if (MATERIAL_WORDS.has(primary)) return { category: "material/thing", confidence: 0.86 };
    if (DESCRIPTOR_WORDS.has(primary) || /(?:ous|ful|less|ive|al|ic)$/.test(primary)) return { category: "descriptor", confidence: 0.78 };
    if (ACTION_WORDS.has(primary) || /^to\s+/.test(joined) || /(?:ize|ise|ify)$/.test(primary)) return { category: "action", confidence: 0.76 };
    return { category: "concept/thing", confidence: 0.52 };
  }

  function countMap(values) {
    const out = {};
    for (const value of values) out[value] = (out[value] || 0) + 1;
    return out;
  }

  function topEntries(map, limit = 6, min = 1) {
    return Object.entries(map || {})
      .filter(([, n]) => n >= min)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit);
  }

  function soundAnalysis(items) {
    const words = (items || []).map((e) => cleanTargetWord(e?.valathi)).filter(Boolean);
    const letters = [];
    const starts = [];
    const endings2 = [];
    const endings3 = [];
    const bigrams = [];
    let totalLength = 0;
    let apostropheCount = 0;

    for (const word of words) {
      const plain = word.replace(/['\-]/g, "");
      if (!plain) continue;
      totalLength += plain.length;
      if (word.includes("'")) apostropheCount++;
      starts.push(plain.slice(0, Math.min(2, plain.length)));
      if (plain.length >= 2) endings2.push(plain.slice(-2));
      if (plain.length >= 3) endings3.push(plain.slice(-3));
      for (const ch of plain) letters.push(ch);
      for (let i = 0; i < plain.length - 1; i++) bigrams.push(plain.slice(i, i + 2));
    }

    const avgLength = words.length ? totalLength / words.length : 0;
    return {
      wordCount: words.length,
      avgLength: Number(avgLength.toFixed(1)),
      commonLetters: topEntries(countMap(letters), 8, 1),
      commonStarts: topEntries(countMap(starts), 5, words.length >= 8 ? 2 : 1),
      commonEndings: topEntries(countMap(endings3), 5, words.length >= 10 ? 2 : 1).length
        ? topEntries(countMap(endings3), 5, words.length >= 10 ? 2 : 1)
        : topEntries(countMap(endings2), 5, 1),
      commonBigrams: topEntries(countMap(bigrams), 8, words.length >= 8 ? 2 : 1),
      apostropheRate: words.length ? Number((apostropheCount / words.length).toFixed(2)) : 0
    };
  }

  function hashItems(items) {
    return (items || []).map((e) => `${e?.english || ""}\u0001${e?.valathi || ""}`).join("\u0002");
  }

  function analyzeGenerator(gen) {
    const items = Array.isArray(gen.items) ? gen.items : [];
    const entryAnalysis = {};
    const categories = {};
    for (const entry of items) {
      const common = String(entry?.english || "").trim();
      const target = String(entry?.valathi || "").trim();
      if (!common || !target) continue;
      const info = classifyGloss(common);
      const key = `${common.toLowerCase()}|${target.toLowerCase()}`;
      entryAnalysis[key] = { category: info.category, confidence: info.confidence };
      categories[info.category] = (categories[info.category] || 0) + 1;
    }
    return {
      analyzedAt: new Date().toISOString(),
      analysisHash: hashItems(items),
      sound: soundAnalysis(items),
      categories,
      entryAnalysis
    };
  }

  function ensureAnalysis(gen, gens = null) {
    if (!gen || gen.type !== "lexicon") return null;
    const items = Array.isArray(gen.items) ? gen.items : [];
    const nextHash = hashItems(items);
    const current = gen.languageMeta?.analysis;
    if (current?.analysisHash === nextHash) return current;

    const analysis = analyzeGenerator(gen);
    gen.languageMeta = {
      ...(gen.languageMeta || {}),
      language: gen.languageMeta?.language || inferLanguage(gen.name),
      analysis
    };
    if (gens) return analysis;

    const all = loadGenerators();
    const idx = all.findIndex((g) => g.id === gen.id);
    if (idx >= 0) {
      all[idx] = gen;
      saveGenerators(all);
    }
    return analysis;
  }

  function analyzeAllLexicons() {
    const gens = loadGenerators();
    let changed = false;
    for (const gen of gens) {
      if (gen?.type !== "lexicon") continue;
      const nextHash = hashItems(Array.isArray(gen.items) ? gen.items : []);
      if (gen.languageMeta?.analysis?.analysisHash === nextHash) continue;
      const previous = gen.languageMeta || {};
      gen.languageMeta = {
        ...previous,
        language: previous.language || inferLanguage(gen.name),
        analysis: analyzeGenerator(gen)
      };
      changed = true;
    }
    if (changed) saveGenerators(gens);
  }

  function scheduleAnalysis() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(analyzeAllLexicons, 180);
  }

  function bestEntryForToken(items, token) {
    const wanted = stemEnglish(token);
    let best = null;
    let bestScore = 0;
    for (const entry of items || []) {
      const glosses = glossTokens(entry?.english).map(stemEnglish);
      let score = 0;
      if (glosses.includes(wanted)) score = 100;
      else if (glosses.some((g) => g.startsWith(wanted) || wanted.startsWith(g))) score = 65;
      else if (String(entry?.english || "").toLowerCase().includes(wanted)) score = 45;
      if (score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }
    return bestScore >= 45 ? best : null;
  }

  function splitConcept(concept) {
    return glossTokens(concept)
      .filter((t) => !STOP_WORDS.has(t))
      .map(stemEnglish)
      .filter(Boolean);
  }

  function smoothJoin(parts) {
    const clean = parts.filter(Boolean).map((p) => String(p));
    if (!clean.length) return "";
    let out = clean[0];
    for (let i = 1; i < clean.length; i++) {
      let next = clean[i];
      const a = out.slice(-1).toLowerCase();
      const b = next.slice(0, 1).toLowerCase();
      if (a && b && a === b) next = next.slice(1);
      else if (VOWELS.includes(a) && VOWELS.includes(b) && next.length > 2) next = next.slice(1);
      out += next;
    }
    return out;
  }

  function blendedJoin(parts) {
    if (parts.length < 2) return parts[0] || "";
    const first = String(parts[0]);
    const rest = parts.slice(1).map(String);
    let out = first;
    for (const part of rest) {
      const cut = Math.max(1, Math.floor(part.length * 0.25));
      out = smoothJoin([out, part.slice(cut)]);
    }
    return out;
  }

  function uniqueSuggestions(values) {
    const seen = new Set();
    const out = [];
    for (const value of values) {
      const word = String(value || "").trim();
      const key = word.toLowerCase();
      if (!word || seen.has(key)) continue;
      seen.add(key);
      out.push(word);
    }
    return out;
  }

  function chunkData(items) {
    const words = (items || []).map((e) => cleanTargetWord(e?.valathi).replace(/['\-]/g, "")).filter((w) => w.length >= 2);
    const onsets = [], middles = [], codas = [];
    for (const word of words) {
      const vowelIndex = [...word].findIndex((ch) => VOWELS.includes(ch));
      const lastVowel = Math.max(...[...word].map((ch, i) => VOWELS.includes(ch) ? i : -1));
      onsets.push(vowelIndex > 0 ? word.slice(0, Math.min(vowelIndex + 1, 3)) : word.slice(0, Math.min(2, word.length)));
      middles.push(word.slice(Math.max(0, Math.floor(word.length / 2) - 1), Math.min(word.length, Math.floor(word.length / 2) + 2)));
      codas.push(lastVowel >= 0 && lastVowel < word.length - 1 ? word.slice(Math.max(0, lastVowel), word.length) : word.slice(-Math.min(2, word.length)));
    }
    return { words, onsets: onsets.filter(Boolean), middles: middles.filter(Boolean), codas: codas.filter(Boolean) };
  }

  function pick(arr) {
    return arr?.length ? arr[Math.floor(Math.random() * arr.length)] : "";
  }

  function applySoundPreferences(word, preferences) {
    let out = String(word || "");
    const liked = String(preferences?.likedSounds || "").toLowerCase().split(/[\s,]+/).filter(Boolean);
    const avoid = String(preferences?.avoidSounds || "").toLowerCase().split(/[\s,]+/).filter(Boolean);
    for (const bad of avoid) {
      if (!bad) continue;
      out = out.replace(new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "");
    }
    if (liked.length && Math.random() < 0.45 && !liked.some((s) => out.toLowerCase().includes(s))) {
      const fav = pick(liked);
      out = Math.random() < 0.5 ? fav + out : out + fav;
    }
    return out;
  }

  function generateStyleRoots(gen, count = 4) {
    const items = Array.isArray(gen.items) ? gen.items : [];
    const chunks = chunkData(items);
    const prefs = gen.languageMeta?.preferences || {};
    const existing = new Set(chunks.words.map((w) => w.toLowerCase()));
    const targetAvg = gen.languageMeta?.analysis?.sound?.avgLength || 5;
    const made = [];

    let guard = 0;
    while (made.length < count && guard++ < 60) {
      let word = "";
      if (chunks.words.length >= 2) {
        const a = pick(chunks.onsets) || pick(chunks.words)?.slice(0, 2);
        const b = Math.random() < 0.45 ? pick(chunks.middles) : "";
        const c = pick(chunks.codas) || pick(chunks.words)?.slice(-2);
        word = smoothJoin([a, b, c]);
      } else if (chunks.words.length === 1) {
        const base = chunks.words[0];
        word = smoothJoin([base.slice(0, Math.max(1, Math.floor(base.length / 2))), pick(["a","o","u","i"]), base.slice(-2)]);
      } else {
        word = pick(["kar","dor","var","thal","grim","nar"]);
      }
      word = applySoundPreferences(word, prefs).replace(/[^a-z'\-]/gi, "");
      if (word.length > targetAvg + 3) word = word.slice(0, Math.max(3, Math.round(targetAvg + 2)));
      if (word.length < 3) word += pick(["ar","en","um","or"]);
      const key = word.toLowerCase();
      if (!key || existing.has(key) || made.some((x) => x.toLowerCase() === key)) continue;
      made.push(word);
    }
    return made;
  }

  function buildSuggestions(gen, concept) {
    const items = Array.isArray(gen.items) ? gen.items : [];
    const tokens = splitConcept(concept);
    const roots = [];
    const missing = [];

    for (const token of tokens) {
      if (builder.overrides[token]) {
        roots.push({ token, word: builder.overrides[token], source: "suggested" });
        continue;
      }
      const entry = bestEntryForToken(items, token);
      if (entry) roots.push({ token, word: String(entry.valathi || ""), source: "known", common: String(entry.english || "") });
      else missing.push(token);
    }

    const parts = roots.map((r) => r.word).filter(Boolean);
    const compound = gen.languageMeta?.compoundLearning || {};
    const preferReverse = (compound.reverse || 0) > (compound.asWritten || 0);
    const ordered = preferReverse ? [...parts].reverse() : parts;
    const suggestions = parts.length ? uniqueSuggestions([
      smoothJoin(ordered),
      smoothJoin([...ordered].reverse()),
      blendedJoin(ordered),
      ordered.join("-")
    ]) : [];

    return { tokens, roots, missing, suggestions, preferReverse };
  }

  function updateGenerator(genId, mutator) {
    const gens = loadGenerators();
    const idx = gens.findIndex((g) => g.id === genId);
    if (idx < 0) return null;
    mutator(gens[idx]);
    saveGenerators(gens);
    return gens[idx];
  }

  function addLexiconEntry(genId, common, target) {
    const normalizedCommon = String(common || "").trim();
    const normalizedTarget = String(target || "").trim();
    if (!normalizedCommon || !normalizedTarget) return false;
    let added = false;
    updateGenerator(genId, (gen) => {
      gen.items = Array.isArray(gen.items) ? gen.items : [];
      const exists = gen.items.some((e) => String(e?.english || "").trim().toLowerCase() === normalizedCommon.toLowerCase()
        && String(e?.valathi || "").trim().toLowerCase() === normalizedTarget.toLowerCase());
      if (!exists) {
        gen.items.push({ english: normalizedCommon, valathi: normalizedTarget });
        added = true;
      }
      gen.languageMeta = { ...(gen.languageMeta || {}), analysis: analyzeGenerator(gen) };
    });
    return added;
  }

  function learnCompound(genId, order) {
    updateGenerator(genId, (gen) => {
      const current = gen.languageMeta?.compoundLearning || {};
      gen.languageMeta = {
        ...(gen.languageMeta || {}),
        compoundLearning: {
          asWritten: Number(current.asWritten || 0) + (order === "as-written" ? 1 : 0),
          reverse: Number(current.reverse || 0) + (order === "reverse" ? 1 : 0),
          blended: Number(current.blended || 0) + (order === "blended" ? 1 : 0)
        }
      };
    });
  }

  function injectStyles() {
    if (document.getElementById("lex-intel-v1-styles")) return;
    const style = document.createElement("style");
    style.id = "lex-intel-v1-styles";
    style.textContent = `
      .lex-intel-toolbar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:0 0 10px;padding:9px;border:1px solid rgba(120,180,255,.18);border-radius:11px;background:rgba(120,180,255,.05)}
      .lex-intel-toolbar .lex-intel-note{font-size:.72rem;color:var(--text-muted);margin-right:auto;line-height:1.35}
      .lex-intel-modal .generator-create-inner{width:min(880px,92vw);max-height:88vh;overflow:auto}
      .lex-intel-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:8px 0}
      .lex-intel-card{border:1px solid #293346;border-radius:9px;background:#090f18;padding:9px;min-width:0}
      .lex-intel-card small{display:block;color:#8ea2c8;text-transform:uppercase;font-size:.62rem;letter-spacing:.04em;margin-bottom:3px}
      .lex-intel-card b{font-size:.84rem;color:#e8f0ff;word-break:break-word}
      .lex-intel-section{border:1px solid #263249;border-radius:10px;background:#070c13;padding:10px;margin-top:9px}
      .lex-intel-section h4{margin:0 0 7px;font-size:.82rem;color:#cbdcff}
      .lex-intel-tags{display:flex;gap:5px;flex-wrap:wrap}
      .lex-intel-tag{border:1px solid #34415a;border-radius:999px;background:#0e1724;padding:3px 7px;font-size:.69rem;color:#b9cbea}
      .lex-builder-roots{display:grid;gap:6px;margin-top:7px}
      .lex-builder-root{display:grid;grid-template-columns:minmax(90px,.7fr) minmax(120px,1fr) auto;gap:6px;align-items:center;border:1px solid #28344a;border-radius:8px;padding:7px;background:#090f18}
      .lex-builder-root .known{color:#86d39a;font-size:.72rem}.lex-builder-root .missing{color:#e7ba72;font-size:.72rem}
      .lex-builder-candidates{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}
      .lex-builder-result{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;border:1px solid #31405b;border-radius:9px;padding:9px;margin-top:6px;background:#0a111d}
      .lex-builder-result strong{font-size:.95rem;color:#eef4ff}.lex-builder-result small{display:block;color:#8fa5ca;margin-top:2px}
      .lex-analysis-table{width:100%;border-collapse:collapse;font-size:.72rem}.lex-analysis-table th,.lex-analysis-table td{text-align:left;padding:5px 6px;border-bottom:1px solid #202a3b}.lex-analysis-table th{color:#98acd0;font-size:.65rem;text-transform:uppercase}
      .lex-intel-pref-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      @media(max-width:700px){.lex-intel-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.lex-builder-root{grid-template-columns:1fr}.lex-intel-pref-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureModals() {
    if (!document.getElementById("lexWordBuilderBox")) {
      const box = document.createElement("div");
      box.id = "lexWordBuilderBox";
      box.className = "generator-create-box lex-intel-modal";
      box.innerHTML = `<div class="generator-create-inner"><div class="generator-create-header"><div id="lexWordBuilderTitle" class="generator-create-title">Word Builder</div><button id="lexWordBuilderClose" class="btn-secondary btn-small" type="button">✕ Close</button></div><div id="lexWordBuilderBody" class="generator-create-body"></div></div>`;
      document.body.appendChild(box);
    }
    if (!document.getElementById("lexAnalysisBox")) {
      const box = document.createElement("div");
      box.id = "lexAnalysisBox";
      box.className = "generator-create-box lex-intel-modal";
      box.innerHTML = `<div class="generator-create-inner"><div class="generator-create-header"><div id="lexAnalysisTitle" class="generator-create-title">Language Analysis</div><button id="lexAnalysisClose" class="btn-secondary btn-small" type="button">✕ Close</button></div><div id="lexAnalysisBody" class="generator-create-body"></div></div>`;
      document.body.appendChild(box);
    }
  }

  function closeBuilder() {
    document.getElementById("lexWordBuilderBox")?.style.setProperty("display", "none");
    builder.generatorId = null; builder.concept = ""; builder.overrides = {}; builder.lastSuggestions = [];
  }

  function closeAnalysis() {
    document.getElementById("lexAnalysisBox")?.style.setProperty("display", "none");
  }

  function renderBuilder(gen) {
    const body = document.getElementById("lexWordBuilderBody");
    const title = document.getElementById("lexWordBuilderTitle");
    if (!body || !gen) return;
    const language = gen.languageMeta?.language || inferLanguage(gen.name);
    if (title) title.textContent = `${language} · Word Builder`;
    const result = buildSuggestions(gen, builder.concept);
    builder.lastSuggestions = result.suggestions;

    const rootRows = result.roots.map((r) => `<div class="lex-builder-root"><div><b>${esc(r.token)}</b><div class="${r.source === "known" ? "known" : "missing"}">${r.source === "known" ? "Known root" : "Suggested root"}</div></div><div>${esc(r.word)}</div><div>${r.common ? `<span class="muted">${esc(r.common)}</span>` : ""}</div></div>`).join("");

    const missingRows = result.missing.map((token) => {
      const candidates = generateStyleRoots(gen, 4);
      return `<div class="lex-intel-section"><h4>No known root for “${esc(token)}”</h4><div class="muted" style="font-size:.72rem">Choose a temporary ${esc(language)}-style root. You can save it to the dictionary if you like it.</div><div class="lex-builder-candidates">${candidates.map((c) => `<button class="btn-secondary btn-small lex-root-choice" data-token="${esc(token)}" data-root="${esc(c)}">Use ${esc(c)}</button>`).join("")}</div></div>`;
    }).join("");

    const suggestions = result.suggestions.map((word, idx) => {
      const order = idx === 0 ? (result.preferReverse ? "reverse" : "as-written") : idx === 1 ? (result.preferReverse ? "as-written" : "reverse") : idx === 2 ? "blended" : "as-written";
      return `<div class="lex-builder-result"><div><strong>${esc(word)}</strong><small>${result.roots.map((r) => `${r.token} → ${r.word}`).join(" · ")}</small></div><button class="btn-primary btn-small lex-save-built" data-word="${esc(word)}" data-order="${order}">Add to Dictionary</button></div>`;
    }).join("");

    body.innerHTML = `
      <div class="muted" style="margin-bottom:8px">Build new words from roots you already created. DaggerCraft uses automatic language analysis only as guidance; it never changes your existing words.</div>
      <div class="row"><div class="col"><label for="lexBuilderConcept">Meaning or concept</label><input id="lexBuilderConcept" type="text" placeholder="deep cave home" value="${esc(builder.concept)}"></div><div class="col" style="max-width:150px"><label>&nbsp;</label><button id="lexBuilderRun" class="btn-primary">Build Word</button></div></div>
      ${builder.concept ? `<div class="lex-intel-section"><h4>Roots found</h4><div class="lex-builder-roots">${rootRows || '<div class="muted">No known roots found yet.</div>'}</div></div>${missingRows}${result.missing.length ? "" : `<div class="lex-intel-section"><h4>Suggestions</h4>${suggestions || '<div class="muted">Add more words to give the builder more material.</div>'}</div>`}` : ""}
    `;

    body.querySelector("#lexBuilderRun")?.addEventListener("click", () => {
      builder.concept = String(body.querySelector("#lexBuilderConcept")?.value || "").trim();
      builder.overrides = {};
      renderBuilder(loadGenerators().find((g) => g.id === gen.id));
    });
    body.querySelector("#lexBuilderConcept")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); body.querySelector("#lexBuilderRun")?.click(); }
    });
    body.querySelectorAll(".lex-root-choice").forEach((btn) => btn.addEventListener("click", () => {
      builder.overrides[btn.dataset.token] = btn.dataset.root;
      renderBuilder(loadGenerators().find((g) => g.id === gen.id));
    }));
    body.querySelectorAll(".lex-save-built").forEach((btn) => btn.addEventListener("click", () => {
      const word = btn.dataset.word;
      const added = addLexiconEntry(gen.id, builder.concept, word);
      if (added) {
        learnCompound(gen.id, btn.dataset.order || "as-written");
        window.alert(`Added “${builder.concept} = ${word}” to ${language}.`);
        scheduleAnalysis();
        closeBuilder();
        if (typeof window.renderMainPanel === "function") window.renderMainPanel();
        else document.querySelector(`[data-id="${CSS.escape(gen.id)}"]`)?.click();
      } else {
        window.alert("That exact entry is already in the lexicon.");
      }
    }));
  }

  function openBuilder(gen) {
    if (!gen) return;
    ensureAnalysis(gen);
    builder.generatorId = gen.id; builder.concept = ""; builder.overrides = {}; builder.lastSuggestions = [];
    const box = document.getElementById("lexWordBuilderBox");
    if (box) box.style.display = "flex";
    renderBuilder(loadGenerators().find((g) => g.id === gen.id) || gen);
    setTimeout(() => document.getElementById("lexBuilderConcept")?.focus(), 0);
  }

  function renderAnalysis(gen) {
    const body = document.getElementById("lexAnalysisBody");
    const title = document.getElementById("lexAnalysisTitle");
    if (!body || !gen) return;
    const analysis = ensureAnalysis(gen) || analyzeGenerator(gen);
    const language = gen.languageMeta?.language || inferLanguage(gen.name);
    const sound = analysis.sound || {};
    const prefs = gen.languageMeta?.preferences || {};
    const categoryRows = Object.entries(analysis.entryAnalysis || {}).slice(0, 80).map(([key, info]) => {
      const [common, target] = key.split("|");
      return `<tr><td>${esc(common)}</td><td>${esc(target)}</td><td>${esc(info.category)}</td><td>${Math.round(Number(info.confidence || 0) * 100)}%</td></tr>`;
    }).join("");
    const compound = gen.languageMeta?.compoundLearning || {};
    const compoundTotal = Number(compound.asWritten || 0) + Number(compound.reverse || 0) + Number(compound.blended || 0);
    const compoundSummary = !compoundTotal ? "No preference learned yet" : (Number(compound.reverse || 0) > Number(compound.asWritten || 0) ? "Often reverses entered concept order" : "Usually follows entered concept order");

    if (title) title.textContent = `${language} · Language Analysis`;
    body.innerHTML = `
      <div class="muted">This is generated automatically from your dictionary. It helps Word Builder stay consistent and leaves room for future phrase/sentence tools. You do not need to maintain these tags manually.</div>
      <div class="lex-intel-grid">
        <div class="lex-intel-card"><small>Known words</small><b>${sound.wordCount || 0}</b></div>
        <div class="lex-intel-card"><small>Typical length</small><b>${sound.avgLength || 0} letters</b></div>
        <div class="lex-intel-card"><small>Compound behavior</small><b>${esc(compoundSummary)}</b></div>
        <div class="lex-intel-card"><small>Analysis</small><b>Automatic</b></div>
      </div>
      <div class="lex-intel-section"><h4>Sound fingerprint</h4><div class="muted" style="font-size:.72rem;margin-bottom:6px">These patterns are detected from the ${esc(language)} words you have already created.</div><div class="lex-intel-tags">${(sound.commonLetters || []).map(([v,n]) => `<span class="lex-intel-tag">${esc(v)} · ${n}</span>`).join("") || '<span class="muted">Add a few words to detect patterns.</span>'}</div></div>
      <div class="lex-intel-section"><h4>Common starts</h4><div class="lex-intel-tags">${(sound.commonStarts || []).map(([v,n]) => `<span class="lex-intel-tag">${esc(v)} · ${n}</span>`).join("") || '<span class="muted">Not enough data yet.</span>'}</div></div>
      <div class="lex-intel-section"><h4>Common endings</h4><div class="lex-intel-tags">${(sound.commonEndings || []).map(([v,n]) => `<span class="lex-intel-tag">-${esc(v)} · ${n}</span>`).join("") || '<span class="muted">Not enough data yet.</span>'}</div></div>
      <div class="lex-intel-section"><h4>Optional style preferences</h4><div class="muted" style="font-size:.72rem;margin-bottom:7px">Useful when Word Builder has to invent a missing root. Leave blank and DaggerCraft relies only on the dictionary.</div><div class="lex-intel-pref-row"><div><label for="lexLikedSounds">Sounds / letters I like</label><input id="lexLikedSounds" type="text" placeholder="v, th, x" value="${esc(prefs.likedSounds || "")}"></div><div><label for="lexAvoidSounds">Sounds / letters to avoid</label><input id="lexAvoidSounds" type="text" placeholder="q, j" value="${esc(prefs.avoidSounds || "")}"></div></div><div style="display:flex;justify-content:flex-end;margin-top:7px"><button id="lexSavePreferences" class="btn-primary btn-small">Save Preferences</button></div></div>
      <details class="lex-intel-section"><summary style="cursor:pointer;font-weight:800">Automatic meaning tags (advanced / future-ready)</summary><div class="muted" style="font-size:.72rem;margin:7px 0">These are best-effort guesses from the Common meaning. They are not required for Word Builder today, but give future phrase/sentence features structured information.</div><div style="max-height:320px;overflow:auto"><table class="lex-analysis-table"><thead><tr><th>Common</th><th>${esc(language)}</th><th>Suggested role</th><th>Confidence</th></tr></thead><tbody>${categoryRows}</tbody></table></div></details>
    `;
    body.querySelector("#lexSavePreferences")?.addEventListener("click", () => {
      const likedSounds = String(body.querySelector("#lexLikedSounds")?.value || "").trim();
      const avoidSounds = String(body.querySelector("#lexAvoidSounds")?.value || "").trim();
      updateGenerator(gen.id, (g) => {
        g.languageMeta = { ...(g.languageMeta || {}), preferences: { ...(g.languageMeta?.preferences || {}), likedSounds, avoidSounds } };
      });
      window.alert("Language style preferences saved.");
    });
  }

  function openAnalysis(gen) {
    if (!gen) return;
    const box = document.getElementById("lexAnalysisBox");
    if (box) box.style.display = "flex";
    renderAnalysis(loadGenerators().find((g) => g.id === gen.id) || gen);
  }

  function patchActiveLexicon() {
    const gen = activeLexicon();
    if (!gen) return;
    ensureAnalysis(gen);
    const panel = document.getElementById("generatorPanel");
    if (!panel || panel.querySelector(".lex-intel-toolbar")) return;

    const toolbar = document.createElement("div");
    toolbar.className = "lex-intel-toolbar";
    toolbar.innerHTML = `<div class="lex-intel-note"><b>Smart Lexicon</b><br>Dictionary entries are analyzed automatically as you add them.</div><button class="btn-secondary btn-small" id="lexOpenAnalysis" type="button">Language Analysis</button><button class="btn-primary btn-small" id="lexOpenBuilder" type="button">Word Builder</button>`;
    const firstRow = panel.querySelector(".row");
    if (firstRow) firstRow.insertAdjacentElement("beforebegin", toolbar);
    else panel.prepend(toolbar);

    toolbar.querySelector("#lexOpenAnalysis")?.addEventListener("click", () => openAnalysis(loadGenerators().find((g) => g.id === gen.id) || gen));
    toolbar.querySelector("#lexOpenBuilder")?.addEventListener("click", () => openBuilder(loadGenerators().find((g) => g.id === gen.id) || gen));
  }

  function patch() {
    patchActiveLexicon();
  }

  function schedulePatch() {
    if (patchScheduled) return;
    patchScheduled = true;
    requestAnimationFrame(() => {
      patchScheduled = false;
      observer?.disconnect();
      patch();
      observer?.observe(document.body, { childList: true, subtree: true });
    });
  }

  function init() {
    injectStyles();
    ensureModals();
    analyzeAllLexicons();
    observer = new MutationObserver(() => { schedulePatch(); scheduleAnalysis(); });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", (e) => {
      if (e.target?.closest?.("#lexWordBuilderClose")) closeBuilder();
      if (e.target?.closest?.("#lexAnalysisClose")) closeAnalysis();
      scheduleAnalysis();
      schedulePatch();
    }, true);
    document.addEventListener("change", scheduleAnalysis, true);
    schedulePatch();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();

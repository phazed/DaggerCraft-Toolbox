// DaggerCraft Lexicon Intelligence v2
// Finalized lightweight language layer: automatic analysis, editable word details,
// pattern review, word families, style preferences, and compound-aware Word Builder.
// Legacy english/valathi item keys remain untouched for backward compatibility.
(() => {
  "use strict";

  if (window.__daggerCraftLexiconIntelligenceV2) return;
  window.__daggerCraftLexiconIntelligenceV2 = true;

  const GEN_KEY = "vrahuneGeneratorsV4";
  const VOWELS = "aeiouy";
  const STOP_WORDS = new Set(["a","an","the","of","in","on","at","for","to","from","and","or","with","by"]);
  const PLACE_WORDS = new Set(["home","house","hall","cave","cavern","city","town","village","land","realm","kingdom","forest","river","lake","sea","ocean","mountain","hill","valley","road","path","gate","tower","fort","fortress","castle","temple","shrine","harbor","port","island","field","mine","smithy","hold","battlefield"]);
  const PERSON_WORDS = new Set(["person","people","man","woman","child","king","queen","lord","lady","guardian","guard","warrior","soldier","smith","priest","mage","wizard","ruler","chief","captain","hunter","killer","adventurer"]);
  const MATERIAL_WORDS = new Set(["stone","rock","iron","steel","gold","silver","copper","wood","bone","bones","glass","ash","sand","ice","water","fire","flame","ore"]);
  const DESCRIPTOR_WORDS = new Set(["high","low","deep","hidden","secret","old","ancient","new","young","great","small","large","black","white","red","blue","green","bright","dark","strong","weak","cold","hot","holy","dead","living","noble","wild","silent","broken","lost","scaly","hunted","wooden"]);
  const ACTION_WORDS = new Set(["go","come","run","walk","fight","guard","protect","build","make","forge","burn","speak","say","see","know","live","die","kill","killing","give","take","hold","rule","hunt","sing","write","read","remember","hide","open","close","climb","dig","reveal"]);
  const ROLE_OPTIONS = ["Thing","Place","Person","Material","Descriptor","Action","Connector","Other"];

  let observer = null;
  let patchScheduled = false;
  let scanTimer = null;
  let analysisGeneratorId = null;
  let detailsState = null;
  const builder = { generatorId: null, concept: "", overrides: {}, mode: "allow-new", naturalness: "natural", last: null };

  function esc(value) {
    return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;");
  }

  function loadGenerators() {
    try {
      const parsed = JSON.parse(localStorage.getItem(GEN_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }

  function saveGenerators(gens) { localStorage.setItem(GEN_KEY, JSON.stringify(gens)); }

  function updateGenerator(genId, mutator) {
    const gens = loadGenerators();
    const idx = gens.findIndex((g) => g?.id === genId);
    if (idx < 0) return null;
    mutator(gens[idx]);
    saveGenerators(gens);
    return gens[idx];
  }

  function inferLanguage(name) {
    return String(name || "").replace(/\s+(?:lexicon|dictionary|glossary)\s*$/i, "").trim() || "Target Language";
  }

  function activeLexicon() {
    if (!document.getElementById("lexMode")) return null;
    const label = String(document.getElementById("activeGeneratorLabel")?.textContent || "").trim();
    const [namePart, folderPart] = label.split(" · ");
    const name = String(namePart || "").trim();
    const folder = String(folderPart || "").trim();
    const gens = loadGenerators();
    return gens.find((g) => g?.type === "lexicon" && g.name === name && (!folder || (g.folder || "General") === folder))
      || gens.find((g) => g?.type === "lexicon" && g.name === name) || null;
  }

  function normalizeText(value) { return String(value || "").trim().toLowerCase(); }
  function entryKey(entry) { return `${normalizeText(entry?.english)}|${normalizeText(entry?.valathi)}`; }
  function cleanTargetWord(value) { return normalizeText(value).replace(/[^a-z'’\-]/g, "").replace(/[’]/g, "'"); }

  function glossTokens(value) {
    return normalizeText(value).replace(/[^a-z0-9' -]+/g, " ").split(/[\s\-]+/).map((x) => x.trim()).filter(Boolean);
  }

  function stemEnglish(word) {
    let w = normalizeText(word);
    if (w.length > 4 && w.endsWith("ies")) return w.slice(0,-3) + "y";
    if (w.length > 5 && w.endsWith("ing")) return w.slice(0,-3);
    if (w.length > 4 && w.endsWith("ed")) return w.slice(0,-2);
    if (w.length > 4 && w.endsWith("es")) return w.slice(0,-2);
    if (w.length > 3 && w.endsWith("s")) return w.slice(0,-1);
    return w;
  }

  function classifyGloss(common) {
    const tokens = glossTokens(common);
    const primary = stemEnglish(tokens[0] || "");
    if (!primary) return { role:"Other", confidence:.35 };
    if (STOP_WORDS.has(primary)) return { role:"Connector", confidence:.96 };
    if (PERSON_WORDS.has(primary) || /(?:er|or|ist|ian|keeper|master)$/.test(primary)) return { role:"Person", confidence:.84 };
    if (MATERIAL_WORDS.has(primary)) return { role:"Material", confidence:.88 };
    if (PLACE_WORDS.has(primary) || tokens.some((t) => PLACE_WORDS.has(stemEnglish(t)))) return { role:"Place", confidence:.9 };
    if (DESCRIPTOR_WORDS.has(primary) || /(?:ous|ful|less|ive|al|ic|en)$/.test(primary)) return { role:"Descriptor", confidence:.78 };
    if (ACTION_WORDS.has(primary) || /^to\s+/.test(normalizeText(common)) || /(?:ize|ise|ify)$/.test(primary)) return { role:"Action", confidence:.76 };
    return { role:"Thing", confidence:.54 };
  }

  function countMap(values) {
    const out = {};
    for (const value of values) out[value] = (out[value] || 0) + 1;
    return out;
  }

  function topEntries(map, limit=6, min=1) {
    return Object.entries(map || {}).filter(([,n]) => n >= min).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,limit);
  }

  function soundAnalysis(items) {
    const words = (items || []).map((e) => cleanTargetWord(e?.valathi)).filter(Boolean);
    const letters=[], starts=[], ends2=[], ends3=[], bigrams=[];
    let total=0, apostrophes=0;
    for (const word of words) {
      const plain = word.replace(/['\-]/g, "");
      if (!plain) continue;
      total += plain.length;
      if (word.includes("'")) apostrophes++;
      starts.push(plain.slice(0,Math.min(2,plain.length)));
      if (plain.length >= 2) ends2.push(plain.slice(-2));
      if (plain.length >= 3) ends3.push(plain.slice(-3));
      for (const ch of plain) letters.push(ch);
      for (let i=0;i<plain.length-1;i++) bigrams.push(plain.slice(i,i+2));
    }
    const minRepeat = words.length >= 10 ? 2 : 1;
    const e3 = topEntries(countMap(ends3),6,minRepeat);
    return {
      wordCount: words.length,
      avgLength: words.length ? Number((total/words.length).toFixed(1)) : 0,
      commonLetters: topEntries(countMap(letters),8,1),
      commonStarts: topEntries(countMap(starts),6,minRepeat),
      commonEndings: e3.length ? e3 : topEntries(countMap(ends2),6,minRepeat),
      commonBigrams: topEntries(countMap(bigrams),8,minRepeat),
      apostropheRate: words.length ? Number((apostrophes/words.length).toFixed(2)) : 0
    };
  }

  function manualFor(gen, key) { return gen.languageMeta?.wordDetails?.[key] || {}; }

  function effectiveEntryInfo(gen, entry, automatic=null) {
    const key = entryKey(entry);
    const auto = automatic || classifyGloss(entry?.english);
    const manual = manualFor(gen,key);
    return {
      key,
      role: manual.role || auto.role,
      confidence: Number(auto.confidence || .5),
      isManual: Boolean(manual.role),
      useAsRoot: manual.useAsRoot !== false,
      aliases: Array.isArray(manual.aliases) ? manual.aliases : [],
      tags: Array.isArray(manual.tags) ? manual.tags : [],
      notes: String(manual.notes || "")
    };
  }

  function hashItems(items) { return (items || []).map((e) => `${e?.english || ""}\u0001${e?.valathi || ""}`).join("\u0002"); }

  function detectPatterns(gen, entryAnalysis) {
    const items = Array.isArray(gen.items) ? gen.items : [];
    const candidates = [];
    const seen = new Set();

    // Derivational clues: one target word extends another, e.g. corl -> corlar.
    for (let i=0;i<items.length;i++) {
      const base = items[i];
      const bw = cleanTargetWord(base?.valathi).replace(/['-]/g,"");
      if (bw.length < 2) continue;
      for (let j=0;j<items.length;j++) {
        if (i === j) continue;
        const derived = items[j];
        const dw = cleanTargetWord(derived?.valathi).replace(/['-]/g,"");
        if (dw.length <= bw.length || dw.length > bw.length + 5) continue;
        const baseInfo = entryAnalysis[entryKey(base)];
        const derivedInfo = entryAnalysis[entryKey(derived)];
        if (!baseInfo || !derivedInfo) continue;
        if (dw.startsWith(bw)) {
          const affix = dw.slice(bw.length);
          if (affix.length >= 1 && affix.length <= 4) {
            const id = `suffix:${affix}:${baseInfo.role}:${derivedInfo.role}`;
            if (!seen.has(id)) {
              seen.add(id);
              candidates.push({ id, type:"suffix", form:`-${affix}`, meaning:`${baseInfo.role} → ${derivedInfo.role}`, evidence:[`${base.english} → ${derived.english}`] });
            }
          }
        } else if (dw.endsWith(bw)) {
          const affix = dw.slice(0,dw.length-bw.length);
          if (affix.length >= 1 && affix.length <= 4) {
            const id = `prefix:${affix}:${baseInfo.role}:${derivedInfo.role}`;
            if (!seen.has(id)) {
              seen.add(id);
              candidates.push({ id, type:"prefix", form:`${affix}-`, meaning:`${baseInfo.role} → ${derivedInfo.role}`, evidence:[`${base.english} → ${derived.english}`] });
            }
          }
        }
      }
    }

    // Repeated endings associated with a dominant role.
    const endingMap = {};
    for (const entry of items) {
      const word = cleanTargetWord(entry?.valathi).replace(/['-]/g,"");
      if (word.length < 4) continue;
      const role = entryAnalysis[entryKey(entry)]?.role || "Thing";
      for (const len of [2,3]) {
        const end = word.slice(-len);
        endingMap[end] ||= [];
        endingMap[end].push({role, common:String(entry.english || "")});
      }
    }
    for (const [end, rows] of Object.entries(endingMap)) {
      if (rows.length < 2) continue;
      const roleCounts = countMap(rows.map((r) => r.role));
      const [role,count] = topEntries(roleCounts,1,1)[0] || [];
      if (!role || count < 2 || count/rows.length < .66) continue;
      const id = `ending:${end}:${role}`;
      if (!seen.has(id)) {
        seen.add(id);
        candidates.push({ id, type:"ending", form:`-${end}`, meaning:`Often appears on ${role.toLowerCase()} words`, evidence:rows.slice(0,4).map((r)=>r.common) });
      }
    }
    return candidates.slice(0,24);
  }

  function detectFamilies(gen) {
    const items = Array.isArray(gen.items) ? gen.items : [];
    const families = [];
    const used = new Set();
    for (const base of items) {
      const bw = cleanTargetWord(base?.valathi).replace(/['-]/g,"");
      if (bw.length < 2) continue;
      const related = items.filter((other) => {
        if (other === base) return false;
        const ow = cleanTargetWord(other?.valathi).replace(/['-]/g,"");
        return ow.length > bw.length && (ow.startsWith(bw) || ow.endsWith(bw));
      });
      if (!related.length) continue;
      const id = entryKey(base);
      if (used.has(id)) continue;
      used.add(id);
      families.push({ base:{common:base.english,target:base.valathi,key:id}, related:related.slice(0,8).map((e)=>({common:e.english,target:e.valathi,key:entryKey(e)})) });
    }
    return families.slice(0,18);
  }

  function analyzeGenerator(gen) {
    const items = Array.isArray(gen.items) ? gen.items : [];
    const entryAnalysis = {};
    const categories = {};
    for (const entry of items) {
      if (!String(entry?.english || "").trim() || !String(entry?.valathi || "").trim()) continue;
      const auto = classifyGloss(entry.english);
      const effective = effectiveEntryInfo(gen,entry,auto);
      entryAnalysis[effective.key] = { role:effective.role, confidence:auto.confidence, isManual:effective.isManual, useAsRoot:effective.useAsRoot };
      categories[effective.role] = (categories[effective.role] || 0) + 1;
    }
    const base = {
      analyzedAt:new Date().toISOString(),
      analysisHash:hashItems(items),
      sound:soundAnalysis(items), categories, entryAnalysis
    };
    base.patternCandidates = detectPatterns(gen,entryAnalysis);
    base.families = detectFamilies(gen);
    return base;
  }

  function ensureMeta(gen) {
    gen.languageMeta = { ...(gen.languageMeta || {}) };
    gen.languageMeta.language ||= inferLanguage(gen.name);
    gen.languageMeta.wordDetails ||= {};
    gen.languageMeta.patternDecisions ||= {};
    gen.languageMeta.preferences ||= { likedSounds:"", avoidSounds:"", wordLength:"auto", feel:"balanced" };
    gen.languageMeta.compoundLearning ||= { asWritten:0, reverse:0, blended:0 };
    gen.languageMeta.compounds ||= {};
    return gen.languageMeta;
  }

  function ensureAnalysis(gen) {
    if (!gen || gen.type !== "lexicon") return null;
    ensureMeta(gen);
    const hash = hashItems(Array.isArray(gen.items) ? gen.items : []);
    if (gen.languageMeta.analysis?.analysisHash === hash) return gen.languageMeta.analysis;
    const analysis = analyzeGenerator(gen);
    const all = loadGenerators();
    const idx = all.findIndex((g) => g.id === gen.id);
    if (idx >= 0) {
      ensureMeta(all[idx]);
      all[idx].languageMeta.analysis = analysis;
      saveGenerators(all);
    }
    gen.languageMeta.analysis = analysis;
    return analysis;
  }

  function analyzeAllLexicons() {
    const gens = loadGenerators();
    let changed = false;
    for (const gen of gens) {
      if (gen?.type !== "lexicon") continue;
      ensureMeta(gen);
      const hash = hashItems(Array.isArray(gen.items) ? gen.items : []);
      if (gen.languageMeta.analysis?.analysisHash === hash) continue;
      gen.languageMeta.analysis = analyzeGenerator(gen);
      changed = true;
    }
    if (changed) saveGenerators(gens);
  }

  function scheduleAnalysis() { clearTimeout(scanTimer); scanTimer = setTimeout(analyzeAllLexicons,220); }

  function confidenceLabel(value, isManual=false) {
    if (isManual) return "Manual";
    const n = Number(value || 0);
    if (n >= .8) return "High";
    if (n >= .62) return "Medium";
    return "Low";
  }

  function bestEntryForToken(gen, token) {
    const items = Array.isArray(gen.items) ? gen.items : [];
    const wanted = stemEnglish(token);
    let best=null, bestScore=0;
    for (const entry of items) {
      const info = effectiveEntryInfo(gen,entry);
      if (!info.useAsRoot) continue;
      const glosses = [...glossTokens(entry?.english), ...info.aliases.flatMap(glossTokens)].map(stemEnglish);
      let score=0;
      if (glosses.includes(wanted)) score=100;
      else if (glosses.some((g)=>g.startsWith(wanted)||wanted.startsWith(g))) score=65;
      else if (normalizeText(entry?.english).includes(wanted)) score=45;
      if (score > bestScore) { best=entry; bestScore=score; }
    }
    return bestScore >= 45 ? best : null;
  }

  function splitConcept(concept) { return glossTokens(concept).filter((t)=>!STOP_WORDS.has(t)).map(stemEnglish).filter(Boolean); }

  function smoothJoin(parts) {
    const clean = parts.filter(Boolean).map(String);
    if (!clean.length) return "";
    let out = clean[0];
    for (let i=1;i<clean.length;i++) {
      let next=clean[i];
      const a=out.slice(-1).toLowerCase(), b=next.slice(0,1).toLowerCase();
      if (a && b && a===b) next=next.slice(1);
      else if (VOWELS.includes(a) && VOWELS.includes(b) && next.length>2) next=next.slice(1);
      out += next;
    }
    return out;
  }

  function blendedJoin(parts) {
    if (parts.length < 2) return parts[0] || "";
    let out=String(parts[0]);
    for (const partRaw of parts.slice(1)) {
      const part=String(partRaw), cut=Math.max(1,Math.floor(part.length*.25));
      out=smoothJoin([out,part.slice(cut)]);
    }
    return out;
  }

  function uniqueSuggestions(rows) {
    const seen=new Set(), out=[];
    for (const row of rows) {
      const word=String(row?.word||"").trim(), key=word.toLowerCase();
      if (!word || seen.has(key)) continue;
      seen.add(key); out.push(row);
    }
    return out;
  }

  function chunkData(items) {
    const words=(items||[]).map((e)=>cleanTargetWord(e?.valathi).replace(/['-]/g,"")).filter((w)=>w.length>=2);
    const onsets=[],middles=[],codas=[];
    for (const word of words) {
      const vi=[...word].findIndex((ch)=>VOWELS.includes(ch));
      const lv=Math.max(...[...word].map((ch,i)=>VOWELS.includes(ch)?i:-1));
      onsets.push(vi>0?word.slice(0,Math.min(vi+1,3)):word.slice(0,Math.min(2,word.length)));
      middles.push(word.slice(Math.max(0,Math.floor(word.length/2)-1),Math.min(word.length,Math.floor(word.length/2)+2)));
      codas.push(lv>=0&&lv<word.length-1?word.slice(Math.max(0,lv)):word.slice(-Math.min(2,word.length)));
    }
    return {words,onsets:onsets.filter(Boolean),middles:middles.filter(Boolean),codas:codas.filter(Boolean)};
  }

  function pick(arr) { return arr?.length ? arr[Math.floor(Math.random()*arr.length)] : ""; }
  function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }

  function applyStyle(word,prefs,avgLength) {
    let out=String(word||"");
    const liked=String(prefs?.likedSounds||"").toLowerCase().split(/[\s,]+/).filter(Boolean);
    const avoid=String(prefs?.avoidSounds||"").toLowerCase().split(/[\s,]+/).filter(Boolean);
    for (const bad of avoid) out=out.replace(new RegExp(escapeRegex(bad),"gi"),"");
    if (liked.length && Math.random()<.5 && !liked.some((s)=>out.toLowerCase().includes(s))) {
      const fav=pick(liked); out=Math.random()<.5?fav+out:out+fav;
    }
    if (prefs?.feel === "hard") out=out.replace(/[fw]/gi,(m)=>m.toLowerCase()==="f"?"k":"g");
    if (prefs?.feel === "soft") out=out.replace(/[kg]/gi,(m)=>m.toLowerCase()==="k"?"l":"v");
    let target=avgLength || 5;
    if (prefs?.wordLength === "short") target=Math.min(target,4);
    if (prefs?.wordLength === "medium") target=Math.max(5,Math.min(target,7));
    if (prefs?.wordLength === "long") target=Math.max(target,8);
    if (out.length > target+3) out=out.slice(0,Math.max(3,Math.round(target+2)));
    if (out.length < 3) out += pick(["ar","en","um","or"]);
    return out.replace(/[^a-z'\-]/gi,"");
  }

  function generateStyleRoots(gen,count=5) {
    ensureMeta(gen);
    const chunks=chunkData(gen.items||[]), prefs=gen.languageMeta.preferences||{}, existing=new Set(chunks.words.map((w)=>w.toLowerCase()));
    const avg=gen.languageMeta.analysis?.sound?.avgLength || 5, made=[];
    let guard=0;
    while (made.length<count && guard++<100) {
      let word="";
      if (chunks.words.length>=2) word=smoothJoin([pick(chunks.onsets)||pick(chunks.words)?.slice(0,2),Math.random()<.45?pick(chunks.middles):"",pick(chunks.codas)||pick(chunks.words)?.slice(-2)]);
      else if (chunks.words.length===1) { const base=chunks.words[0]; word=smoothJoin([base.slice(0,Math.max(1,Math.floor(base.length/2))),pick(["a","o","u","i"]),base.slice(-2)]); }
      else word=pick(["kar","dor","var","thal","grim","nar"]);
      word=applyStyle(word,prefs,avg);
      const key=word.toLowerCase();
      if (!key || existing.has(key) || made.some((x)=>x.toLowerCase()===key)) continue;
      made.push(word);
    }
    return made;
  }

  function acceptedAffixes(gen) {
    const analysis=gen.languageMeta?.analysis || analyzeGenerator(gen);
    const decisions=gen.languageMeta?.patternDecisions || {};
    return (analysis.patternCandidates||[]).filter((p)=>decisions[p.id]==="accepted" && (p.type==="suffix"||p.type==="prefix"));
  }

  function buildSuggestions(gen,concept) {
    ensureMeta(gen);
    const tokens=splitConcept(concept), roots=[], missing=[];
    for (const token of tokens) {
      if (builder.overrides[token]) { roots.push({token,word:builder.overrides[token],source:"suggested",role:classifyGloss(token).role}); continue; }
      const entry=bestEntryForToken(gen,token);
      if (entry) {
        const info=effectiveEntryInfo(gen,entry);
        roots.push({token,word:String(entry.valathi||""),source:"known",common:String(entry.english||""),role:info.role,key:info.key});
      } else missing.push(token);
    }
    const parts=roots.map((r)=>r.word).filter(Boolean);
    const learning=gen.languageMeta.compoundLearning||{};
    const preferReverse=Number(learning.reverse||0)>Number(learning.asWritten||0);
    const ordered=preferReverse?[...parts].reverse():parts;
    const literal=builder.naturalness === "literal";
    let rows=[];
    if (parts.length) {
      rows.push({word:ordered.join(""),method:preferReverse?"reverse":"as-written",why:"Keeps every known root intact."});
      rows.push({word:[...ordered].reverse().join(""),method:preferReverse?"as-written":"reverse",why:"Tries the opposite compound order."});
      if (!literal) {
        rows.push({word:smoothJoin(ordered),method:"smoothed",why:"Smooths repeated letters or adjacent vowels."});
        rows.push({word:blendedJoin(ordered),method:"blended",why:"Blends root boundaries for a more natural-looking word."});
      }
      rows.push({word:ordered.join("-"),method:"hyphenated",why:"Keeps the compound visibly separated."});
    }
    rows=uniqueSuggestions(rows);
    return {tokens,roots,missing,suggestions:rows,preferReverse,acceptedAffixes:acceptedAffixes(gen)};
  }

  function addLexiconEntry(genId,common,target,compoundMeta=null) {
    const c=String(common||"").trim(), t=String(target||"").trim();
    if (!c || !t) return {added:false};
    let added=false, key="";
    const gen=updateGenerator(genId,(g)=>{
      ensureMeta(g); g.items=Array.isArray(g.items)?g.items:[];
      const exists=g.items.some((e)=>normalizeText(e?.english)===c.toLowerCase()&&normalizeText(e?.valathi)===t.toLowerCase());
      if (!exists) {
        const entry={english:c,valathi:t}; g.items.push(entry); key=entryKey(entry); added=true;
        if (compoundMeta) g.languageMeta.compounds[key]={...compoundMeta,createdAt:new Date().toISOString()};
      }
      g.languageMeta.analysis=analyzeGenerator(g);
    });
    return {added,key,gen};
  }

  function learnCompound(genId,method) {
    updateGenerator(genId,(g)=>{
      ensureMeta(g); const cur=g.languageMeta.compoundLearning;
      if (method==="reverse") cur.reverse=Number(cur.reverse||0)+1;
      else if (method==="blended"||method==="smoothed") cur.blended=Number(cur.blended||0)+1;
      else cur.asWritten=Number(cur.asWritten||0)+1;
    });
  }

  function injectStyles() {
    if (document.getElementById("lex-intel-v2-styles")) return;
    const style=document.createElement("style"); style.id="lex-intel-v2-styles";
    style.textContent=`
      .lex-intel-toolbar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:0 0 10px;padding:9px;border:1px solid rgba(120,180,255,.18);border-radius:11px;background:rgba(120,180,255,.05)}
      .lex-intel-toolbar .lex-intel-note{font-size:.72rem;color:var(--text-muted);margin-right:auto;line-height:1.35}
      .lex-intel-modal .generator-create-inner{width:min(980px,94vw);max-height:90vh;overflow:auto}
      .lex-intel-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:8px 0}.lex-intel-card{border:1px solid #293346;border-radius:9px;background:#090f18;padding:9px;min-width:0}.lex-intel-card small{display:block;color:#8ea2c8;text-transform:uppercase;font-size:.62rem;letter-spacing:.04em;margin-bottom:3px}.lex-intel-card b{font-size:.84rem;color:#e8f0ff;word-break:break-word}
      .lex-intel-section{border:1px solid #263249;border-radius:10px;background:#070c13;padding:10px;margin-top:9px}.lex-intel-section h4{margin:0 0 7px;font-size:.82rem;color:#cbdcff}.lex-intel-tags{display:flex;gap:5px;flex-wrap:wrap}.lex-intel-tag{border:1px solid #34415a;border-radius:999px;background:#0e1724;padding:3px 7px;font-size:.69rem;color:#b9cbea}.lex-intel-tag.accepted{border-color:#2f6b49;color:#9ce0b3}.lex-intel-tag.ignored{opacity:.48}
      .lex-analysis-table{width:100%;border-collapse:collapse;font-size:.72rem}.lex-analysis-table th,.lex-analysis-table td{text-align:left;padding:6px;border-bottom:1px solid #202a3b;vertical-align:middle}.lex-analysis-table th{color:#98acd0;font-size:.65rem;text-transform:uppercase}.lex-analysis-row{cursor:pointer}.lex-analysis-row:hover{background:#0d1624}.lex-confidence-low{color:#e7ba72}.lex-confidence-high{color:#86d39a}.lex-manual{color:#9db7ff}
      .lex-builder-controls{display:grid;grid-template-columns:minmax(0,1fr) 160px 160px auto;gap:7px;align-items:end}.lex-builder-roots{display:grid;gap:6px;margin-top:7px}.lex-builder-root{display:grid;grid-template-columns:minmax(100px,.7fr) minmax(120px,1fr) auto;gap:6px;align-items:center;border:1px solid #28344a;border-radius:8px;padding:7px;background:#090f18}.lex-known{color:#86d39a;font-size:.72rem}.lex-missing{color:#e7ba72;font-size:.72rem}.lex-builder-candidates{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.lex-builder-result{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;border:1px solid #31405b;border-radius:9px;padding:9px;margin-top:6px;background:#0a111d}.lex-builder-result strong{font-size:.98rem;color:#eef4ff}.lex-builder-result small{display:block;color:#8fa5ca;margin-top:2px}.lex-result-buttons{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}
      .lex-pref-grid{display:grid;grid-template-columns:1fr 1fr 180px 180px;gap:8px}.lex-pattern{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;border-top:1px solid #202a3b;padding:7px 0}.lex-pattern:first-child{border-top:0}.lex-pattern-actions{display:flex;gap:5px}.lex-family{padding:7px 0;border-top:1px solid #202a3b}.lex-family:first-child{border-top:0}.lex-details-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.lex-check{display:flex;align-items:center;gap:7px;margin-top:8px}.lex-check input{width:auto}
      @media(max-width:760px){.lex-intel-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.lex-builder-controls,.lex-pref-grid,.lex-details-grid{grid-template-columns:1fr}.lex-builder-root{grid-template-columns:1fr}.lex-builder-result{grid-template-columns:1fr}.lex-result-buttons{justify-content:flex-start}}
    `; document.head.appendChild(style);
  }

  function makeModal(id,titleId,bodyId,title) {
    if (document.getElementById(id)) return;
    const box=document.createElement("div"); box.id=id; box.className="generator-create-box lex-intel-modal";
    box.innerHTML=`<div class="generator-create-inner"><div class="generator-create-header"><div id="${titleId}" class="generator-create-title">${esc(title)}</div><button class="btn-secondary btn-small lex-modal-close" data-close="${id}" type="button">✕ Close</button></div><div id="${bodyId}" class="generator-create-body"></div></div>`;
    document.body.appendChild(box);
  }

  function ensureModals() {
    makeModal("lexWordBuilderBox","lexWordBuilderTitle","lexWordBuilderBody","Word Builder");
    makeModal("lexAnalysisBox","lexAnalysisTitle","lexAnalysisBody","Language Analysis");
    makeModal("lexWordDetailsBox","lexWordDetailsTitle","lexWordDetailsBody","Word Details");
  }

  function closeModal(id) { document.getElementById(id)?.style.setProperty("display","none"); }

  function renderWordDetails(gen,key) {
    const body=document.getElementById("lexWordDetailsBody"), title=document.getElementById("lexWordDetailsTitle");
    if (!body || !gen) return;
    const entry=(gen.items||[]).find((e)=>entryKey(e)===key); if (!entry) return;
    ensureMeta(gen); const info=effectiveEntryInfo(gen,entry), manual=manualFor(gen,key), language=gen.languageMeta.language;
    title.textContent=`${language} · Word Details`;
    body.innerHTML=`
      <div class="lex-details-grid"><div><label>Common meaning</label><input value="${esc(entry.english)}" disabled></div><div><label>${esc(language)}</label><input value="${esc(entry.valathi)}" disabled></div></div>
      <div class="lex-details-grid" style="margin-top:8px"><div><label for="lexDetailRole">Role</label><select id="lexDetailRole">${ROLE_OPTIONS.map((r)=>`<option value="${r}" ${r===info.role?"selected":""}>${r}</option>`).join("")}</select><div class="muted" style="font-size:.68rem;margin-top:3px">Automatic confidence: ${confidenceLabel(info.confidence)} (${Math.round(info.confidence*100)}%)${info.isManual?" · currently overridden":""}</div></div><div><label for="lexDetailTags">Extra tags</label><input id="lexDetailTags" value="${esc((manual.tags||[]).join(", "))}" placeholder="geography, clan, formal"></div></div>
      <div class="lex-details-grid" style="margin-top:8px"><div><label for="lexDetailAliases">Meaning aliases</label><input id="lexDetailAliases" value="${esc((manual.aliases||[]).join(", "))}" placeholder="home, haven, shelter"><div class="muted" style="font-size:.68rem;margin-top:3px">Aliases are searchable by Word Builder without creating duplicate dictionary rows.</div></div><div><label for="lexDetailNotes">Notes</label><input id="lexDetailNotes" value="${esc(manual.notes||"")}" placeholder="Optional usage note"></div></div>
      <label class="lex-check"><input id="lexDetailRoot" type="checkbox" ${info.useAsRoot?"checked":""}> Use this word as a building root</label>
      <div style="display:flex;justify-content:space-between;gap:7px;margin-top:12px;flex-wrap:wrap"><button id="lexDetailReset" class="btn-secondary btn-small">Reset to Automatic</button><button id="lexDetailSave" class="btn-primary btn-small">Save Word Details</button></div>`;
    body.querySelector("#lexDetailSave")?.addEventListener("click",()=>{
      const role=String(body.querySelector("#lexDetailRole")?.value||"Thing");
      const aliases=String(body.querySelector("#lexDetailAliases")?.value||"").split(",").map((x)=>x.trim()).filter(Boolean);
      const tags=String(body.querySelector("#lexDetailTags")?.value||"").split(",").map((x)=>x.trim()).filter(Boolean);
      const notes=String(body.querySelector("#lexDetailNotes")?.value||"").trim();
      const useAsRoot=Boolean(body.querySelector("#lexDetailRoot")?.checked);
      updateGenerator(gen.id,(g)=>{ ensureMeta(g); g.languageMeta.wordDetails[key]={role,aliases,tags,notes,useAsRoot}; g.languageMeta.analysis=analyzeGenerator(g); });
      closeModal("lexWordDetailsBox"); renderAnalysis(loadGenerators().find((g)=>g.id===gen.id));
    });
    body.querySelector("#lexDetailReset")?.addEventListener("click",()=>{
      updateGenerator(gen.id,(g)=>{ ensureMeta(g); delete g.languageMeta.wordDetails[key]; g.languageMeta.analysis=analyzeGenerator(g); });
      closeModal("lexWordDetailsBox"); renderAnalysis(loadGenerators().find((g)=>g.id===gen.id));
    });
  }

  function openWordDetails(gen,key) { detailsState={generatorId:gen.id,key}; document.getElementById("lexWordDetailsBox").style.display="flex"; renderWordDetails(gen,key); }

  function renderAnalysis(gen) {
    const body=document.getElementById("lexAnalysisBody"), title=document.getElementById("lexAnalysisTitle"); if (!body||!gen) return;
    ensureMeta(gen); const analysis=ensureAnalysis(gen)||analyzeGenerator(gen), language=gen.languageMeta.language, sound=analysis.sound||{}, prefs=gen.languageMeta.preferences||{}, decisions=gen.languageMeta.patternDecisions||{};
    analysisGeneratorId=gen.id; title.textContent=`${language} · Language Analysis`;
    const rows=(gen.items||[]).map((entry)=>{ const info=effectiveEntryInfo(gen,entry); const conf=confidenceLabel(info.confidence,info.isManual); return `<tr class="lex-analysis-row" data-key="${esc(info.key)}"><td>${esc(entry.english)}</td><td>${esc(entry.valathi)}</td><td>${esc(info.role)}</td><td class="${info.isManual?"lex-manual":info.confidence<.62?"lex-confidence-low":info.confidence>=.8?"lex-confidence-high":""}">${esc(conf)}</td><td>${info.useAsRoot?"Root":"—"}</td></tr>`; }).join("");
    const lowCount=(gen.items||[]).filter((e)=>{const i=effectiveEntryInfo(gen,e); return !i.isManual&&i.confidence<.62;}).length;
    const learn=gen.languageMeta.compoundLearning||{}, total=Number(learn.asWritten||0)+Number(learn.reverse||0)+Number(learn.blended||0);
    const compoundSummary=!total?"Not learned yet":Number(learn.reverse||0)>Number(learn.asWritten||0)?"Usually reverses entered order":"Usually follows entered order";
    const patterns=(analysis.patternCandidates||[]).map((p)=>{const state=decisions[p.id]||"suggested"; return `<div class="lex-pattern"><div><b>${esc(p.form)}</b> <span class="muted">${esc(p.meaning)}</span><div class="muted" style="font-size:.68rem">Evidence: ${esc((p.evidence||[]).join(" · "))}</div></div><div class="lex-pattern-actions"><button class="btn-small ${state==="accepted"?"btn-primary":"btn-secondary"} lex-pattern-action" data-id="${esc(p.id)}" data-state="accepted">${state==="accepted"?"✓ Accepted":"Accept"}</button><button class="btn-secondary btn-small lex-pattern-action" data-id="${esc(p.id)}" data-state="ignored">${state==="ignored"?"Ignored":"Ignore"}</button></div></div>`;}).join("");
    const families=(analysis.families||[]).map((f)=>`<div class="lex-family"><b>${esc(f.base.target)}</b> <span class="muted">${esc(f.base.common)}</span><div class="lex-intel-tags" style="margin-top:5px">${f.related.map((r)=>`<span class="lex-intel-tag">${esc(r.target)} · ${esc(r.common)}</span>`).join("")}</div></div>`).join("");
    body.innerHTML=`
      <div class="muted">DaggerCraft analyzes new entries automatically. Nothing here is required: correct only the words or patterns you care about.</div>
      <div class="lex-intel-grid"><div class="lex-intel-card"><small>Known words</small><b>${sound.wordCount||0}</b></div><div class="lex-intel-card"><small>Typical length</small><b>${sound.avgLength||0} letters</b></div><div class="lex-intel-card"><small>Needs review</small><b>${lowCount} low-confidence</b></div><div class="lex-intel-card"><small>Compounds</small><b>${esc(compoundSummary)}</b></div></div>
      <div class="lex-intel-section"><h4>Language Style</h4><div class="muted" style="font-size:.7rem;margin-bottom:7px">Used only when Word Builder needs to invent a missing root.</div><div class="lex-pref-grid"><div><label>Sounds / letters I like</label><input id="lexLikedSounds" value="${esc(prefs.likedSounds||"")}" placeholder="v, th, x"></div><div><label>Sounds / letters to avoid</label><input id="lexAvoidSounds" value="${esc(prefs.avoidSounds||"")}" placeholder="q, j"></div><div><label>Word length</label><select id="lexWordLength"><option value="auto">Auto-detect</option><option value="short" ${prefs.wordLength==="short"?"selected":""}>Short</option><option value="medium" ${prefs.wordLength==="medium"?"selected":""}>Medium</option><option value="long" ${prefs.wordLength==="long"?"selected":""}>Long</option></select></div><div><label>Overall feel</label><select id="lexFeel"><option value="balanced">Balanced</option><option value="hard" ${prefs.feel==="hard"?"selected":""}>Hard</option><option value="soft" ${prefs.feel==="soft"?"selected":""}>Soft</option></select></div></div><div style="display:flex;justify-content:flex-end;margin-top:7px"><button id="lexSavePreferences" class="btn-primary btn-small">Save Style</button></div></div>
      <div class="lex-intel-section"><h4>Sound fingerprint</h4><div class="lex-intel-tags">${(sound.commonLetters||[]).map(([v,n])=>`<span class="lex-intel-tag">${esc(v)} · ${n}</span>`).join("")||'<span class="muted">Add more words to detect a fingerprint.</span>'}</div><div class="muted" style="font-size:.68rem;margin-top:7px">Starts: ${(sound.commonStarts||[]).map(([v])=>esc(v)).join(", ")||"—"} · Endings: ${(sound.commonEndings||[]).map(([v])=>"-"+esc(v)).join(", ")||"—"}</div></div>
      <details class="lex-intel-section" open><summary style="cursor:pointer;font-weight:800">Words & editable analysis</summary><div class="muted" style="font-size:.7rem;margin:7px 0">Click any word to change its role, aliases, tags, notes, or whether Word Builder may use it as a root.</div><div style="max-height:350px;overflow:auto"><table class="lex-analysis-table"><thead><tr><th>Common</th><th>${esc(language)}</th><th>Role</th><th>Confidence</th><th>Builder</th></tr></thead><tbody>${rows}</tbody></table></div></details>
      <details class="lex-intel-section" ${patterns?"":"disabled"}><summary style="cursor:pointer;font-weight:800">Detected patterns</summary><div class="muted" style="font-size:.7rem;margin:7px 0">These are suggestions, never grammar rules until you accept them.</div>${patterns||'<div class="muted">No strong reusable patterns detected yet.</div>'}</details>
      <details class="lex-intel-section"><summary style="cursor:pointer;font-weight:800">Word families</summary><div class="muted" style="font-size:.7rem;margin:7px 0">Words that appear to grow from shorter existing forms.</div>${families||'<div class="muted">No obvious families detected yet.</div>'}</details>`;
    body.querySelector("#lexSavePreferences")?.addEventListener("click",()=>{
      const likedSounds=String(body.querySelector("#lexLikedSounds")?.value||"").trim(), avoidSounds=String(body.querySelector("#lexAvoidSounds")?.value||"").trim(), wordLength=String(body.querySelector("#lexWordLength")?.value||"auto"), feel=String(body.querySelector("#lexFeel")?.value||"balanced");
      updateGenerator(gen.id,(g)=>{ensureMeta(g);g.languageMeta.preferences={likedSounds,avoidSounds,wordLength,feel};});
      window.alert("Language style saved.");
    });
    body.querySelectorAll(".lex-analysis-row").forEach((row)=>row.addEventListener("click",()=>openWordDetails(loadGenerators().find((g)=>g.id===gen.id),row.dataset.key)));
    body.querySelectorAll(".lex-pattern-action").forEach((btn)=>btn.addEventListener("click",()=>{
      updateGenerator(gen.id,(g)=>{ensureMeta(g);g.languageMeta.patternDecisions[btn.dataset.id]=btn.dataset.state;});
      renderAnalysis(loadGenerators().find((g)=>g.id===gen.id));
    }));
  }

  function openAnalysis(gen) { if (!gen) return; ensureAnalysis(gen); document.getElementById("lexAnalysisBox").style.display="flex"; renderAnalysis(loadGenerators().find((g)=>g.id===gen.id)||gen); }

  function renderBuilder(gen) {
    const body=document.getElementById("lexWordBuilderBody"), title=document.getElementById("lexWordBuilderTitle"); if (!body||!gen) return;
    ensureMeta(gen); ensureAnalysis(gen); const language=gen.languageMeta.language, result=buildSuggestions(gen,builder.concept); builder.last=result; title.textContent=`${language} · Word Builder`;
    const roots=result.roots.map((r)=>`<div class="lex-builder-root"><div><b>${esc(r.token)}</b><div class="${r.source==="known"?"lex-known":"lex-missing"}">${r.source==="known"?"Known root":"Suggested root"}</div></div><div>${esc(r.word)}</div><div class="muted">${esc(r.role||"")}</div></div>`).join("");
    const missing=result.missing.map((token)=>{
      if (builder.mode==="known-only") return `<div class="lex-intel-section"><h4>Missing root: ${esc(token)}</h4><div class="muted">Known Roots Only is enabled, so DaggerCraft will not invent one.</div></div>`;
      const candidates=generateStyleRoots(gen,5); return `<div class="lex-intel-section"><h4>No known root for “${esc(token)}”</h4><div class="muted" style="font-size:.7rem">Suggestions follow the current dictionary fingerprint and Language Style settings. They are temporary until you save something.</div><div class="lex-builder-candidates">${candidates.map((c)=>`<button class="btn-secondary btn-small lex-root-choice" data-token="${esc(token)}" data-root="${esc(c)}">Use ${esc(c)}</button>`).join("")}</div></div>`;
    }).join("");
    const resultRows=result.suggestions.map((s)=>`<div class="lex-builder-result"><div><strong>${esc(s.word)}</strong><small>${result.roots.map((r)=>`${r.token} → ${r.word}`).join(" · ")}</small><small><b>Why:</b> ${esc(s.why)}</small></div><div class="lex-result-buttons"><button class="btn-secondary btn-small lex-save-word" data-word="${esc(s.word)}" data-method="${esc(s.method)}">Save Word</button><button class="btn-primary btn-small lex-save-compound" data-word="${esc(s.word)}" data-method="${esc(s.method)}">Save Compound</button></div></div>`).join("");
    body.innerHTML=`
      <div class="muted" style="margin-bottom:8px">Use words you already created as roots. Missing concepts can get style-matching suggestions without becoming canon automatically.</div>
      <div class="lex-builder-controls"><div><label>Meaning or concept</label><input id="lexBuilderConcept" value="${esc(builder.concept)}" placeholder="deep cave home"></div><div><label>Roots</label><select id="lexBuilderMode"><option value="allow-new">Allow new roots</option><option value="known-only" ${builder.mode==="known-only"?"selected":""}>Known roots only</option></select></div><div><label>Build style</label><select id="lexBuilderNatural"><option value="natural">More natural</option><option value="literal" ${builder.naturalness==="literal"?"selected":""}>More literal</option></select></div><button id="lexBuilderRun" class="btn-primary">Build Word</button></div>
      ${builder.concept?`<div class="lex-intel-section"><h4>Roots</h4><div class="lex-builder-roots">${roots||'<div class="muted">No known roots found.</div>'}</div></div>${missing}${(!result.missing.length||builder.overrides&&Object.keys(builder.overrides).length)?`<div class="lex-intel-section"><h4>Suggestions</h4>${resultRows||'<div class="muted">Add more roots or choose a missing-root suggestion.</div>'}</div>`:""}`:""}`;
    const rerender=()=>renderBuilder(loadGenerators().find((g)=>g.id===gen.id)||gen);
    body.querySelector("#lexBuilderRun")?.addEventListener("click",()=>{builder.concept=String(body.querySelector("#lexBuilderConcept")?.value||"").trim();builder.mode=String(body.querySelector("#lexBuilderMode")?.value||"allow-new");builder.naturalness=String(body.querySelector("#lexBuilderNatural")?.value||"natural");builder.overrides={};rerender();});
    body.querySelector("#lexBuilderConcept")?.addEventListener("keydown",(e)=>{if(e.key==="Enter"){e.preventDefault();body.querySelector("#lexBuilderRun")?.click();}});
    body.querySelectorAll(".lex-root-choice").forEach((btn)=>btn.addEventListener("click",()=>{builder.overrides[btn.dataset.token]=btn.dataset.root;rerender();}));
    const saveHandler=(btn,asCompound)=>{
      const current=buildSuggestions(loadGenerators().find((g)=>g.id===gen.id)||gen,builder.concept);
      const roots=current.roots.map((r)=>({common:r.token,target:r.word,source:r.source,entryKey:r.key||null}));
      // Persist chosen missing roots first so future builds can reuse them.
      for (const r of roots.filter((x)=>x.source==="suggested")) addLexiconEntry(gen.id,r.common,r.target,null);
      const meta=asCompound?{roots,method:btn.dataset.method||"as-written",meaning:builder.concept}:null;
      const saved=addLexiconEntry(gen.id,builder.concept,btn.dataset.word,meta);
      if (saved.added) {
        learnCompound(gen.id,btn.dataset.method||"as-written"); window.alert(`Added “${builder.concept} = ${btn.dataset.word}” to ${language}.`); scheduleAnalysis(); closeModal("lexWordBuilderBox");
        if (typeof window.renderMainPanel==="function") window.renderMainPanel();
      } else window.alert("That exact entry is already in the lexicon.");
    };
    body.querySelectorAll(".lex-save-word").forEach((btn)=>btn.addEventListener("click",()=>saveHandler(btn,false)));
    body.querySelectorAll(".lex-save-compound").forEach((btn)=>btn.addEventListener("click",()=>saveHandler(btn,true)));
  }

  function openBuilder(gen) { if(!gen)return; ensureAnalysis(gen); builder.generatorId=gen.id;builder.concept="";builder.overrides={};builder.mode="allow-new";builder.naturalness="natural";document.getElementById("lexWordBuilderBox").style.display="flex";renderBuilder(loadGenerators().find((g)=>g.id===gen.id)||gen);setTimeout(()=>document.getElementById("lexBuilderConcept")?.focus(),0); }

  function patchActiveLexicon() {
    const gen=activeLexicon(); if(!gen)return; ensureAnalysis(gen);
    const panel=document.getElementById("generatorPanel"); if(!panel||panel.querySelector(".lex-intel-toolbar"))return;
    const toolbar=document.createElement("div");toolbar.className="lex-intel-toolbar";toolbar.innerHTML=`<div class="lex-intel-note"><b>Smart Lexicon</b><br>Words are analyzed automatically; corrections are optional.</div><button class="btn-secondary btn-small" id="lexOpenAnalysis" type="button">Language Analysis</button><button class="btn-primary btn-small" id="lexOpenBuilder" type="button">Word Builder</button>`;
    const firstRow=panel.querySelector(".row"); if(firstRow)firstRow.insertAdjacentElement("beforebegin",toolbar); else panel.prepend(toolbar);
    toolbar.querySelector("#lexOpenAnalysis")?.addEventListener("click",()=>openAnalysis(loadGenerators().find((g)=>g.id===gen.id)||gen));
    toolbar.querySelector("#lexOpenBuilder")?.addEventListener("click",()=>openBuilder(loadGenerators().find((g)=>g.id===gen.id)||gen));
  }

  function schedulePatch() {
    if(patchScheduled)return;patchScheduled=true;requestAnimationFrame(()=>{patchScheduled=false;observer?.disconnect();patchActiveLexicon();observer?.observe(document.body,{childList:true,subtree:true});});
  }

  function init() {
    injectStyles();ensureModals();analyzeAllLexicons();observer=new MutationObserver(()=>{schedulePatch();scheduleAnalysis();});observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener("click",(e)=>{const close=e.target?.closest?.(".lex-modal-close");if(close)closeModal(close.dataset.close);scheduleAnalysis();schedulePatch();},true);
    document.addEventListener("change",scheduleAnalysis,true);schedulePatch();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();

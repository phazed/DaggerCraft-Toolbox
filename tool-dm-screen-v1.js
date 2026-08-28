// DaggerCraft DM Screen v1
// Full-canvas modular DM workspace. Panels pull from existing toolbox data without
// adding DM-screen-specific controls to every individual tool.
(() => {
  "use strict";

  if (window.__daggerCraftDmScreenV1) return;
  window.__daggerCraftDmScreenV1 = true;

  const STATE_KEY = "daggerCraftDmScreenV1";
  const GEN_KEY = "vrahuneGeneratorsV4";
  const VAULT_KEY = "vrahuneMonsterVaultStateV2";
  const COLS = 12;
  const ROW = 46;
  const GAP = 8;
  const TYPES = ["scratchpad", "generator", "monster", "rules", "image"];

  const RULES = {
    "ability-checks": {
      name: "Ability Checks",
      body: `<p>Use an ability check when a creature attempts something with an uncertain outcome. Choose the ability that best matches the approach, set a DC, then roll a d20 and add the relevant ability modifier and any applicable proficiency.</p><p><b>Typical DCs:</b> 5 very easy · 10 easy · 15 medium · 20 hard · 25 very hard · 30 nearly impossible.</p>`
    },
    stealth: {
      name: "Stealth & Hiding",
      body: `<p>A creature can try to hide when the circumstances reasonably obscure it from observers. Resolve the attempt with Dexterity (Stealth), opposed by an observer's Wisdom (Perception) or passive Perception as appropriate.</p><p>Being hidden generally means the creature is both unseen and unheard. Moving into clear view normally ends the hidden state.</p>`
    },
    cover: {
      name: "Cover",
      body: `<p><b>Half cover:</b> +2 AC and Dexterity saves. <b>Three-quarters cover:</b> +5 AC and Dexterity saves. <b>Total cover:</b> cannot be targeted directly by an attack or effect that requires a clear path.</p>`
    },
    concentration: {
      name: "Concentration",
      body: `<p>A creature can concentrate on only one concentration effect at a time. Taking damage can force a Constitution saving throw to maintain concentration. The DC is usually 10 or half the damage taken, whichever is higher.</p>`
    },
    conditions: {
      name: "Common Conditions",
      body: `<p>Use this panel as a fast reminder and open the relevant rule in your preferred rules source when exact wording matters.</p><p><b>Prone:</b> movement is impaired; nearby melee attackers usually gain an advantage while distant attacks are hindered. <b>Grappled:</b> speed becomes 0. <b>Restrained:</b> movement is heavily limited and attacks/saves are affected. <b>Incapacitated:</b> cannot take actions or reactions.</p>`
    }
  };

  let state = loadState();
  let menuOpen = false;
  let replacePanelId = null;
  let drag = null;

  function esc(value) {
    return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;");
  }

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return parsed == null ? fallback : parsed;
    } catch { return fallback; }
  }

  function defaultState() {
    return { locked:false, panels:[], nextId:1 };
  }

  function normalizePanel(p) {
    const type = TYPES.includes(p?.type) ? p.type : "scratchpad";
    return {
      id: String(p?.id || `p${Date.now()}`),
      type,
      x: clamp(Number(p?.x ?? 0),0,COLS-1),
      y: Math.max(0,Number(p?.y ?? 0)),
      w: clamp(Number(p?.w ?? 4),2,COLS),
      h: Math.max(3,Number(p?.h ?? 6)),
      title: String(p?.title || ""),
      collapsed: Boolean(p?.collapsed),
      data: p?.data && typeof p.data === "object" ? p.data : {}
    };
  }

  function loadState() {
    const raw = readJson(STATE_KEY, null);
    if (!raw || typeof raw !== "object") return defaultState();
    return {
      locked:Boolean(raw.locked),
      panels:Array.isArray(raw.panels) ? raw.panels.map(normalizePanel) : [],
      nextId:Number(raw.nextId || 1)
    };
  }

  function saveState() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function clamp(n,min,max) { return Math.max(min,Math.min(max,n)); }
  function panelById(id) { return state.panels.find((p)=>p.id===id); }
  function typeName(type) {
    return ({scratchpad:"Scratchpad",generator:"Generator",monster:"Monster",rules:"Rules Reference",image:"Image"})[type] || "Panel";
  }

  function panelDefaults(type) {
    if (type === "scratchpad") return { w:4,h:7,data:{text:""} };
    if (type === "generator") return { w:4,h:6,data:{generatorId:"",last:""} };
    if (type === "monster") return { w:5,h:8,data:{monsterId:""} };
    if (type === "rules") return { w:4,h:6,data:{ruleId:"ability-checks"} };
    if (type === "image") return { w:5,h:8,data:{src:"",name:""} };
    return {w:4,h:6,data:{}};
  }

  function findOpenSpot(w,h) {
    let bestY = 0;
    for (const p of state.panels) bestY = Math.max(bestY,p.y+p.h);
    if (!state.panels.length) return {x:0,y:0};
    const rows = Math.max(bestY+12,24);
    for (let y=0;y<rows;y++) {
      for (let x=0;x<=COLS-w;x++) {
        const hit = state.panels.some((p)=> !(x+w<=p.x || x>=p.x+p.w || y+h<=p.y || y>=p.y+p.h));
        if (!hit) return {x,y};
      }
    }
    return {x:0,y:bestY};
  }

  function addPanel(type) {
    const d = panelDefaults(type);
    const pos = findOpenSpot(d.w,d.h);
    const p = normalizePanel({id:`dm${state.nextId++}`,type,x:pos.x,y:pos.y,w:d.w,h:d.h,data:d.data});
    state.panels.push(p);
    saveState();
    renderPanels();
  }

  function replacePanel(id,type) {
    const p = panelById(id); if (!p) return;
    const d = panelDefaults(type);
    p.type=type; p.title=""; p.data=d.data; p.collapsed=false;
    p.w=Math.max(p.w,d.w); p.h=Math.max(p.h,d.h);
    p.x=clamp(p.x,0,COLS-p.w);
    replacePanelId=null; saveState(); renderPanels();
  }

  function removePanel(id) {
    state.panels=state.panels.filter((p)=>p.id!==id); saveState(); renderPanels();
  }

  function injectStyles() {
    if (document.getElementById("dc-dm-screen-v1-styles")) return;
    const style=document.createElement("style");
    style.id="dc-dm-screen-v1-styles";
    style.textContent=`
      /* The ordinary toolbox should use the available window width instead of staying capped at 1400px. */
      .app-shell{max-width:none!important;width:100%!important;margin:0!important;padding-left:12px!important;padding-right:12px!important}
      #sidebarDmScreenSection .dc-dm-launch{width:100%;justify-content:flex-start;border-radius:8px;padding:7px 9px;font-weight:700}
      #dcDmScreen{position:fixed;inset:0;z-index:9000;display:none;flex-direction:column;background:#030508;color:var(--text-main,#e6e6e6)}
      #dcDmScreen.open{display:flex}
      .dc-dm-topbar{height:54px;flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #252c36;background:linear-gradient(180deg,#0b0f15,#06080c);box-shadow:0 8px 30px rgba(0,0,0,.38);z-index:4}
      .dc-dm-topbar-title{font-size:.93rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-right:auto;color:#edf3ff}
      .dc-dm-topbar .btn-primary,.dc-dm-topbar .btn-secondary{border-radius:8px}
      .dc-dm-menu-wrap{position:relative}.dc-dm-add-menu{display:none;position:absolute;right:0;top:calc(100% + 7px);width:210px;padding:6px;border:1px solid #303a49;border-radius:10px;background:#080c12;box-shadow:0 18px 50px rgba(0,0,0,.5);z-index:50}.dc-dm-add-menu.open{display:grid;gap:4px}.dc-dm-add-menu button{width:100%;justify-content:flex-start;border-radius:7px}
      .dc-dm-canvas-wrap{position:relative;flex:1 1 auto;min-height:0;overflow:auto;background:#030508}
      .dc-dm-canvas{position:relative;min-height:calc(100vh - 54px);height:2200px;background-image:linear-gradient(rgba(77,90,110,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(77,90,110,.08) 1px,transparent 1px);background-size:calc((100vw - 24px)/12) ${ROW}px;background-position:12px 0}
      .dc-dm-empty{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);text-align:center;color:#748198;max-width:520px}.dc-dm-empty strong{display:block;color:#bfcce0;font-size:1rem;margin-bottom:6px}
      .dc-dm-panel{position:absolute;display:flex;flex-direction:column;min-width:150px;min-height:130px;border:1px solid #303947;border-radius:11px;background:linear-gradient(160deg,#0d131c,#070a10);box-shadow:0 15px 38px rgba(0,0,0,.35);overflow:hidden}
      .dc-dm-panel.active{border-color:#50647f;box-shadow:0 18px 50px rgba(0,0,0,.48)}
      .dc-dm-panel.collapsed{height:40px!important;min-height:40px!important}
      .dc-dm-panel-header{height:39px;flex:0 0 39px;display:flex;align-items:center;gap:6px;padding:6px 7px;border-bottom:1px solid #242d3a;background:#0b1017;cursor:grab;user-select:none}.dc-dm-locked .dc-dm-panel-header{cursor:default}.dc-dm-panel-header:active{cursor:grabbing}
      .dc-dm-panel-title{font-size:.75rem;font-weight:750;color:#dce7f7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-right:auto}.dc-dm-panel-type{font-size:.61rem;text-transform:uppercase;letter-spacing:.06em;color:#70819b}
      .dc-dm-icon-btn{width:27px;height:27px;padding:0!important;border-radius:6px!important;font-size:.75rem;flex:0 0 auto}.dc-dm-locked .dc-dm-layout-control{opacity:.36;pointer-events:none}
      .dc-dm-panel-body{flex:1 1 auto;min-height:0;overflow:auto;padding:9px}.dc-dm-panel.collapsed .dc-dm-panel-body,.dc-dm-panel.collapsed .dc-dm-resize{display:none}
      .dc-dm-resize{position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize}.dc-dm-resize:after{content:"";position:absolute;right:4px;bottom:4px;width:8px;height:8px;border-right:2px solid #58677e;border-bottom:2px solid #58677e}.dc-dm-locked .dc-dm-resize{display:none}
      .dc-dm-replace{display:none;position:absolute;right:38px;top:36px;width:190px;padding:5px;border:1px solid #344052;border-radius:9px;background:#070b11;box-shadow:0 14px 35px rgba(0,0,0,.5);z-index:30}.dc-dm-replace.open{display:grid;gap:3px}.dc-dm-replace button{justify-content:flex-start;width:100%;border-radius:6px}
      .dc-dm-field{margin-bottom:8px}.dc-dm-field label{font-size:.66rem;text-transform:uppercase;letter-spacing:.05em;color:#7f91ab;margin-bottom:4px}.dc-dm-panel input,.dc-dm-panel select,.dc-dm-panel textarea{background:#05080d!important;border:1px solid #293342!important;color:#e7eef8!important;border-radius:7px!important;padding:7px 8px!important}.dc-dm-panel input:focus,.dc-dm-panel select:focus,.dc-dm-panel textarea:focus{border-color:#607b9f!important;box-shadow:0 0 0 2px rgba(96,123,159,.13)!important}.dc-dm-panel textarea{resize:none;min-height:100%;height:100%}
      .dc-dm-scratch{display:flex;flex-direction:column;height:100%}.dc-dm-scratch textarea{flex:1 1 auto}
      .dc-dm-generator-result{display:grid;place-items:center;min-height:90px;padding:12px;border:1px solid #263244;border-radius:9px;background:#060a11;text-align:center;font-size:1.05rem;font-weight:750;word-break:break-word;margin:8px 0}
      .dc-dm-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.dc-dm-row>*{min-width:0}.dc-dm-row .grow{flex:1}
      .dc-dm-monster-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;border-bottom:1px solid #273140;padding-bottom:7px;margin-bottom:7px}.dc-dm-monster-name{font-size:1rem;font-weight:850;color:#eef4ff}.dc-dm-monster-sub{font-size:.68rem;color:#8a9bb3;margin-top:2px}.dc-dm-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.dc-dm-stat{border:1px solid #283344;border-radius:7px;padding:5px;background:#070b12;text-align:center}.dc-dm-stat small{display:block;color:#71839d;font-size:.6rem;text-transform:uppercase}.dc-dm-stat b{font-size:.82rem}.dc-dm-monster-text{font-size:.72rem;line-height:1.45;color:#c2cee0;white-space:pre-wrap;margin-top:8px}
      .dc-dm-rule{font-size:.76rem;line-height:1.48;color:#c7d1df}.dc-dm-rule p{margin:0 0 8px}.dc-dm-rule b{color:#e7eef8}
      .dc-dm-image{height:100%;display:flex;flex-direction:column;gap:7px}.dc-dm-image-stage{flex:1 1 auto;min-height:80px;display:grid;place-items:center;border:1px dashed #344154;border-radius:9px;background:#05080d;overflow:hidden}.dc-dm-image-stage img{width:100%;height:100%;object-fit:contain}.dc-dm-image-placeholder{text-align:center;color:#74849a;font-size:.72rem;padding:15px}
      .dc-dm-lock-state{color:#98a9bf;font-size:.68rem}
      @media(max-width:900px){.dc-dm-topbar-title{display:none}.dc-dm-lock-state{display:none}.dc-dm-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function ensureSidebarButton() {
    const sidebar=document.querySelector("aside.sidebar");
    const tools=document.getElementById("sidebarToolsSection");
    if (!sidebar || !tools || document.getElementById("sidebarDmScreenSection")) return;
    const section=document.createElement("div");
    section.id="sidebarDmScreenSection"; section.className="sidebar-section";
    section.innerHTML=`<div class="sidebar-header"><div><div class="sidebar-title">DM Screen</div><div class="sidebar-subtitle">Build your live session workspace</div></div></div><button type="button" class="btn-secondary dc-dm-launch">▣ Open DM Screen</button>`;
    tools.insertAdjacentElement("afterend",section);
    section.querySelector(".dc-dm-launch")?.addEventListener("click",openDmScreen);
  }

  function ensureDmScreen() {
    if (document.getElementById("dcDmScreen")) return;
    const root=document.createElement("div"); root.id="dcDmScreen";
    root.innerHTML=`<div class="dc-dm-topbar"><button id="dcDmBack" class="btn-secondary btn-small" type="button">← Back to Toolbox</button><div class="dc-dm-topbar-title">DM Screen</div><span id="dcDmLockState" class="dc-dm-lock-state"></span><button id="dcDmLock" class="btn-secondary btn-small" type="button"></button><div class="dc-dm-menu-wrap"><button id="dcDmAdd" class="btn-primary btn-small" type="button">＋ Add Panel</button><div id="dcDmAddMenu" class="dc-dm-add-menu">${TYPES.map((t)=>`<button class="btn-secondary btn-small" data-dm-add="${t}" type="button">${esc(typeName(t))}</button>`).join("")}</div></div><button id="dcDmClear" class="btn-secondary btn-small" type="button">Clear</button></div><div class="dc-dm-canvas-wrap"><div id="dcDmCanvas" class="dc-dm-canvas"></div></div>`;
    document.body.appendChild(root);
    root.querySelector("#dcDmBack")?.addEventListener("click",closeDmScreen);
    root.querySelector("#dcDmAdd")?.addEventListener("click",()=>{menuOpen=!menuOpen;replacePanelId=null;renderMenus();});
    root.querySelectorAll("[data-dm-add]").forEach((b)=>b.addEventListener("click",()=>{menuOpen=false;addPanel(b.dataset.dmAdd);}));
    root.querySelector("#dcDmLock")?.addEventListener("click",()=>{state.locked=!state.locked;saveState();renderPanels();});
    root.querySelector("#dcDmClear")?.addEventListener("click",()=>{if(state.locked)return;if(!state.panels.length)return;if(window.confirm("Clear every panel from the DM Screen?")){state.panels=[];saveState();renderPanels();}});
    root.addEventListener("pointerdown",(e)=>{if(!e.target.closest(".dc-dm-menu-wrap")&&!e.target.closest(".dc-dm-replace")){menuOpen=false;replacePanelId=null;renderMenus();}});
    window.addEventListener("resize",()=>{if(root.classList.contains("open"))renderPanels();});
  }

  function openDmScreen() {
    ensureDmScreen();
    document.getElementById("dcDmScreen")?.classList.add("open");
    document.body.style.overflow="hidden";
    renderPanels();
  }

  function closeDmScreen() {
    document.getElementById("dcDmScreen")?.classList.remove("open");
    document.body.style.overflow="";
    menuOpen=false; replacePanelId=null;
  }

  function renderMenus() {
    document.getElementById("dcDmAddMenu")?.classList.toggle("open",menuOpen);
    document.querySelectorAll(".dc-dm-replace").forEach((el)=>el.classList.toggle("open",el.dataset.panelId===replacePanelId));
  }

  function canvasMetrics() {
    const canvas=document.getElementById("dcDmCanvas");
    const width=canvas?.clientWidth || window.innerWidth;
    return { canvas, width, col:(width - GAP*(COLS+1))/COLS };
  }

  function panelRect(p) {
    const {col}=canvasMetrics();
    return {left:GAP+p.x*(col+GAP),top:GAP+p.y*ROW,width:p.w*col+(p.w-1)*GAP,height:p.collapsed?40:p.h*ROW-GAP};
  }

  function generators() {
    const rows=readJson(GEN_KEY,[]); return Array.isArray(rows)?rows:[];
  }

  function generatorValue(gen) {
    if (!gen) return "";
    if (gen.type === "lexicon") {
      const items=Array.isArray(gen.items)?gen.items:[]; if(!items.length)return "No entries";
      const e=items[Math.floor(Math.random()*items.length)]; return `${e?.english ?? ""} = ${e?.valathi ?? ""}`;
    }
    const items=Array.isArray(gen.items)?gen.items:[]; if(!items.length)return "No entries";
    const e=items[Math.floor(Math.random()*items.length)];
    if (typeof e === "string" || typeof e === "number") return String(e);
    return String(e?.text ?? e?.value ?? e?.name ?? e?.result ?? JSON.stringify(e));
  }

  function monsterIndex() {
    try {
      const api=window.VrahuneMonsterVault||window.MonsterVault||window.vrahuneMonsterVault;
      if(api&&typeof api.getMonsterIndex==="function"){
        const rows=api.getMonsterIndex(); if(Array.isArray(rows)&&rows.length)return rows;
      }
    } catch(_){}
    const st=readJson(VAULT_KEY,{}); return Array.isArray(st?.homebrew)?st.homebrew:[];
  }

  function monsterDetails(id) {
    const st=readJson(VAULT_KEY,{});
    const hb=(Array.isArray(st?.homebrew)?st.homebrew:[]).find((m)=>String(m.id)===String(id));
    if(hb)return hb;
    return monsterIndex().find((m)=>String(m.id)===String(id))||null;
  }

  function panelBody(p) {
    if (p.type === "scratchpad") return `<div class="dc-dm-scratch"><textarea data-dm-scratch="${esc(p.id)}" placeholder="Temporary session notes...">${esc(p.data.text||"")}</textarea></div>`;
    if (p.type === "generator") {
      const gens=generators(); const selected=gens.find((g)=>String(g.id)===String(p.data.generatorId))||gens[0];
      if(selected&&!p.data.generatorId)p.data.generatorId=selected.id;
      return `<div class="dc-dm-field"><label>Generator</label><select data-dm-generator="${esc(p.id)}">${gens.length?gens.map((g)=>`<option value="${esc(g.id)}" ${String(g.id)===String(p.data.generatorId)?"selected":""}>${esc(g.name||"Generator")}</option>`).join(""):'<option>No generators found</option>'}</select></div><div class="dc-dm-generator-result">${esc(p.data.last||"Ready")}</div><div class="dc-dm-row"><button class="btn-primary btn-small" data-dm-roll="${esc(p.id)}" type="button">Generate</button><button class="btn-secondary btn-small" data-dm-copy="${esc(p.id)}" type="button">Copy</button></div>`;
    }
    if (p.type === "monster") {
      const mons=monsterIndex(); const selected=mons.find((m)=>String(m.id)===String(p.data.monsterId))||mons[0]; if(selected&&!p.data.monsterId)p.data.monsterId=selected.id;
      const m=selected?monsterDetails(selected.id):null;
      return `<div class="dc-dm-field"><label>Monster</label><select data-dm-monster="${esc(p.id)}">${mons.length?mons.map((x)=>`<option value="${esc(x.id)}" ${String(x.id)===String(p.data.monsterId)?"selected":""}>${esc(x.name||"Monster")}${x.cr!=null?` · CR ${esc(x.cr)}`:""}</option>`).join(""):'<option>No monsters found</option>'}</select></div>${m?`<div class="dc-dm-monster-head"><div><div class="dc-dm-monster-name">${esc(m.name||"Monster")}</div><div class="dc-dm-monster-sub">${esc(m.sizeType||"")}</div></div><div class="dc-dm-monster-sub">${esc(m.source||"")}</div></div><div class="dc-dm-stat-grid"><div class="dc-dm-stat"><small>AC</small><b>${esc(m.ac??"—")}</b></div><div class="dc-dm-stat"><small>HP</small><b>${esc(m.hp??"—")}</b></div><div class="dc-dm-stat"><small>CR</small><b>${esc(m.cr??"—")}</b></div><div class="dc-dm-stat"><small>Speed</small><b>${esc(m.speedText||m.speed||"—")}</b></div></div>${monsterLongText(m)}`:'<div class="muted">Add monsters to the Monster Vault to use them here.</div>'}`;
    }
    if (p.type === "rules") {
      const id=RULES[p.data.ruleId]?p.data.ruleId:"ability-checks"; const r=RULES[id];
      return `<div class="dc-dm-field"><label>Reference</label><select data-dm-rule="${esc(p.id)}">${Object.entries(RULES).map(([k,v])=>`<option value="${k}" ${k===id?"selected":""}>${esc(v.name)}</option>`).join("")}</select></div><div class="dc-dm-rule">${r.body}</div>`;
    }
    if (p.type === "image") {
      return `<div class="dc-dm-image"><div class="dc-dm-row"><label class="btn-secondary btn-small" style="display:inline-flex;margin:0;cursor:pointer">Choose Image<input data-dm-image-input="${esc(p.id)}" type="file" accept="image/*" style="display:none"></label>${p.data.src?`<button class="btn-secondary btn-small" data-dm-image-clear="${esc(p.id)}" type="button">Clear</button>`:""}<span class="muted" style="font-size:.68rem">${esc(p.data.name||"")}</span></div><div class="dc-dm-image-stage">${p.data.src?`<img src="${esc(p.data.src)}" alt="${esc(p.data.name||"DM reference")}">`:'<div class="dc-dm-image-placeholder">Choose an image to keep a map, portrait, puzzle, or reference visible during play.</div>'}</div></div>`;
    }
    return "";
  }

  function monsterLongText(m) {
    const chunks=[];
    if(m.traitsText)chunks.push(`<b>Traits</b>\n${esc(m.traitsText)}`);
    if(m.actionsText)chunks.push(`<b>Actions</b>\n${esc(m.actionsText)}`);
    if(m.reactionsText)chunks.push(`<b>Reactions</b>\n${esc(m.reactionsText)}`);
    if(m.legendaryActionsText)chunks.push(`<b>Legendary Actions</b>\n${esc(m.legendaryActionsText)}`);
    return chunks.length?`<div class="dc-dm-monster-text">${chunks.join("\n\n")}</div>`:"";
  }

  function renderPanels() {
    const root=document.getElementById("dcDmScreen"), canvas=document.getElementById("dcDmCanvas"); if(!root||!canvas)return;
    root.classList.toggle("dc-dm-locked",state.locked);
    const lock=document.getElementById("dcDmLock"), lockState=document.getElementById("dcDmLockState");
    if(lock)lock.textContent=state.locked?"🔒 Unlock Layout":"🔓 Lock Layout";
    if(lockState)lockState.textContent=state.locked?"Layout locked":"Layout editable";
    const maxBottom=state.panels.reduce((m,p)=>Math.max(m,(p.y+p.h)*ROW+80),window.innerHeight-54);
    canvas.style.height=`${Math.max(maxBottom,window.innerHeight-54)}px`;
    if(!state.panels.length){canvas.innerHTML=`<div class="dc-dm-empty"><strong>Your DM Screen is empty.</strong>Add only what you need for the current session. Panels can be moved, resized, replaced, collapsed, or removed.</div>`;return;}
    canvas.innerHTML=state.panels.map((p)=>{
      const r=panelRect(p); const title=p.title||typeName(p.type);
      return `<section class="dc-dm-panel ${p.collapsed?"collapsed":""}" data-dm-panel="${esc(p.id)}" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px"><div class="dc-dm-panel-header" data-dm-drag="${esc(p.id)}"><span class="dc-dm-panel-type">${esc(typeName(p.type))}</span><span class="dc-dm-panel-title">${esc(title)}</span><button class="btn-secondary btn-small dc-dm-icon-btn" data-dm-collapse="${esc(p.id)}" title="Collapse" type="button">${p.collapsed?"▣":"—"}</button><button class="btn-secondary btn-small dc-dm-icon-btn dc-dm-layout-control" data-dm-replace="${esc(p.id)}" title="Replace panel" type="button">⇄</button><button class="btn-secondary btn-small dc-dm-icon-btn dc-dm-layout-control" data-dm-close="${esc(p.id)}" title="Remove panel" type="button">×</button></div><div class="dc-dm-replace" data-panel-id="${esc(p.id)}">${TYPES.filter((t)=>t!==p.type).map((t)=>`<button class="btn-secondary btn-small" data-dm-replace-type="${t}" data-panel="${esc(p.id)}" type="button">${esc(typeName(t))}</button>`).join("")}</div><div class="dc-dm-panel-body">${panelBody(p)}</div><div class="dc-dm-resize dc-dm-layout-control" data-dm-resize="${esc(p.id)}"></div></section>`;
    }).join("");
    bindPanelEvents(); renderMenus(); saveState();
  }

  function bindPanelEvents() {
    const canvas=document.getElementById("dcDmCanvas"); if(!canvas)return;
    canvas.querySelectorAll("[data-dm-collapse]").forEach((b)=>b.addEventListener("click",(e)=>{e.stopPropagation();const p=panelById(b.dataset.dmCollapse);if(p){p.collapsed=!p.collapsed;saveState();renderPanels();}}));
    canvas.querySelectorAll("[data-dm-close]").forEach((b)=>b.addEventListener("click",(e)=>{e.stopPropagation();if(state.locked)return;removePanel(b.dataset.dmClose);}));
    canvas.querySelectorAll("[data-dm-replace]").forEach((b)=>b.addEventListener("click",(e)=>{e.stopPropagation();if(state.locked)return;replacePanelId=replacePanelId===b.dataset.dmReplace?null:b.dataset.dmReplace;menuOpen=false;renderMenus();}));
    canvas.querySelectorAll("[data-dm-replace-type]").forEach((b)=>b.addEventListener("click",(e)=>{e.stopPropagation();if(state.locked)return;replacePanel(b.dataset.panel,b.dataset.dmReplaceType);}));
    canvas.querySelectorAll("[data-dm-scratch]").forEach((el)=>el.addEventListener("input",()=>{const p=panelById(el.dataset.dmScratch);if(p){p.data.text=el.value;saveState();}}));
    canvas.querySelectorAll("[data-dm-generator]").forEach((el)=>el.addEventListener("change",()=>{const p=panelById(el.dataset.dmGenerator);if(p){p.data.generatorId=el.value;p.data.last="";saveState();renderPanels();}}));
    canvas.querySelectorAll("[data-dm-roll]").forEach((b)=>b.addEventListener("click",()=>{const p=panelById(b.dataset.dmRoll);if(!p)return;const g=generators().find((x)=>String(x.id)===String(p.data.generatorId));p.data.last=generatorValue(g);saveState();renderPanels();}));
    canvas.querySelectorAll("[data-dm-copy]").forEach((b)=>b.addEventListener("click",async()=>{const p=panelById(b.dataset.dmCopy);if(!p?.data.last)return;try{await navigator.clipboard.writeText(p.data.last);}catch(_){}}));
    canvas.querySelectorAll("[data-dm-monster]").forEach((el)=>el.addEventListener("change",()=>{const p=panelById(el.dataset.dmMonster);if(p){p.data.monsterId=el.value;saveState();renderPanels();}}));
    canvas.querySelectorAll("[data-dm-rule]").forEach((el)=>el.addEventListener("change",()=>{const p=panelById(el.dataset.dmRule);if(p){p.data.ruleId=el.value;saveState();renderPanels();}}));
    canvas.querySelectorAll("[data-dm-image-input]").forEach((el)=>el.addEventListener("change",()=>{const file=el.files?.[0];if(!file)return;const p=panelById(el.dataset.dmImageInput);if(!p)return;const reader=new FileReader();reader.onload=()=>{p.data.src=String(reader.result||"");p.data.name=file.name;saveState();renderPanels();};reader.readAsDataURL(file);}));
    canvas.querySelectorAll("[data-dm-image-clear]").forEach((b)=>b.addEventListener("click",()=>{const p=panelById(b.dataset.dmImageClear);if(p){p.data.src="";p.data.name="";saveState();renderPanels();}}));
    canvas.querySelectorAll("[data-dm-drag]").forEach((header)=>header.addEventListener("pointerdown",startDrag));
    canvas.querySelectorAll("[data-dm-resize]").forEach((handle)=>handle.addEventListener("pointerdown",startResize));
  }

  function startDrag(e) {
    if(state.locked||e.button!==0||e.target.closest("button,input,select,textarea,label"))return;
    const id=e.currentTarget.dataset.dmDrag,p=panelById(id); if(!p)return;
    const el=document.querySelector(`[data-dm-panel="${CSS.escape(id)}"]`); if(!el)return;
    drag={mode:"drag",id,startX:e.clientX,startY:e.clientY,x:p.x,y:p.y,el}; el.classList.add("active"); el.setPointerCapture?.(e.pointerId); e.preventDefault();
    window.addEventListener("pointermove",movePointer);window.addEventListener("pointerup",endPointer,{once:true});
  }

  function startResize(e) {
    if(state.locked||e.button!==0)return;
    const id=e.currentTarget.dataset.dmResize,p=panelById(id); if(!p)return;
    const el=document.querySelector(`[data-dm-panel="${CSS.escape(id)}"]`); if(!el)return;
    drag={mode:"resize",id,startX:e.clientX,startY:e.clientY,w:p.w,h:p.h,el};el.classList.add("active");e.preventDefault();e.stopPropagation();
    window.addEventListener("pointermove",movePointer);window.addEventListener("pointerup",endPointer,{once:true});
  }

  function movePointer(e) {
    if(!drag)return; const p=panelById(drag.id);if(!p)return;const {col}=canvasMetrics();
    if(drag.mode==="drag"){
      const dx=Math.round((e.clientX-drag.startX)/(col+GAP)),dy=Math.round((e.clientY-drag.startY)/ROW);
      p.x=clamp(drag.x+dx,0,COLS-p.w);p.y=Math.max(0,drag.y+dy);
    } else {
      const dw=Math.round((e.clientX-drag.startX)/(col+GAP)),dh=Math.round((e.clientY-drag.startY)/ROW);
      p.w=clamp(drag.w+dw,2,COLS-p.x);p.h=Math.max(3,drag.h+dh);
    }
    const r=panelRect(p);Object.assign(drag.el.style,{left:`${r.left}px`,top:`${r.top}px`,width:`${r.width}px`,height:`${r.height}px`});
  }

  function endPointer() {
    if(!drag)return;drag.el?.classList.remove("active");drag=null;saveState();renderPanels();window.removeEventListener("pointermove",movePointer);
  }

  function init() {
    injectStyles();ensureSidebarButton();ensureDmScreen();
    const observer=new MutationObserver(()=>{ensureSidebarButton();});observer.observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
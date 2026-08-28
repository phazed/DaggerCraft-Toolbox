// Monster Vault enhancements v1
// Adds favorites, tags/collections, notes/portraits, recent use, duplication/variants,
// and a direct Monster Vault -> Encounter workflow without changing vault statblock data.
(() => {
  "use strict";

  if (window.__daggerCraftMonsterVaultEnhancementsV1) return;
  window.__daggerCraftMonsterVaultEnhancementsV1 = true;

  const META_KEY = "daggerCraftMonsterVaultEnhancementsV1";
  const ENCOUNTER_KEY = "vrahuneEncounterToolStateV7";

  let observer = null;
  let decorateScheduled = false;
  let manageMonsterId = null;
  let encounterMonsterId = null;

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

  function defaultMetaState() {
    return {
      version: 1,
      favorites: [],
      recent: {},
      meta: {},
      view: { mode: "all", collection: "all", tag: "all" }
    };
  }

  function normalizeMetaState(raw) {
    const base = defaultMetaState();
    if (!raw || typeof raw !== "object") return base;
    base.favorites = Array.isArray(raw.favorites) ? [...new Set(raw.favorites.map(String))] : [];
    base.recent = raw.recent && typeof raw.recent === "object" ? { ...raw.recent } : {};
    base.meta = raw.meta && typeof raw.meta === "object" ? { ...raw.meta } : {};
    const v = raw.view && typeof raw.view === "object" ? raw.view : {};
    base.view = {
      mode: ["all","favorites","recent"].includes(v.mode) ? v.mode : "all",
      collection: String(v.collection || "all"),
      tag: String(v.tag || "all")
    };
    return base;
  }

  let metaState = normalizeMetaState(readJson(META_KEY, null));

  function saveMeta() {
    localStorage.setItem(META_KEY, JSON.stringify(metaState));
  }

  function vaultApi() {
    return window.VrahuneMonsterVault || window.MonsterVault || window.vrahuneMonsterVault || null;
  }

  function getMonster(id) {
    const api = vaultApi();
    if (!api || !id) return null;
    try {
      if (typeof api.getMonsterById === "function") return api.getMonsterById(id);
      if (typeof api.getAllMonsters === "function") return (api.getAllMonsters() || []).find((m) => String(m.id) === String(id)) || null;
    } catch (_) {}
    return null;
  }

  function monsterMeta(id) {
    const key = String(id || "");
    const raw = metaState.meta[key] && typeof metaState.meta[key] === "object" ? metaState.meta[key] : {};
    if (!metaState.meta[key]) metaState.meta[key] = raw;
    raw.tags = Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : [];
    raw.collection = String(raw.collection || "");
    raw.notes = String(raw.notes || "");
    raw.portrait = String(raw.portrait || "");
    return raw;
  }

  function isFavorite(id) {
    return metaState.favorites.includes(String(id));
  }

  function toggleFavorite(id) {
    const key = String(id || "");
    if (!key) return;
    if (isFavorite(key)) metaState.favorites = metaState.favorites.filter((x) => x !== key);
    else metaState.favorites.unshift(key);
    touchRecent(key);
    saveMeta();
    scheduleDecorate();
  }

  function touchRecent(id) {
    const key = String(id || "");
    if (!key) return;
    metaState.recent[key] = Date.now();
    const sorted = Object.entries(metaState.recent).sort((a,b) => Number(b[1]) - Number(a[1]));
    if (sorted.length > 100) {
      const keep = new Set(sorted.slice(0,100).map(([k]) => k));
      Object.keys(metaState.recent).forEach((k) => { if (!keep.has(k)) delete metaState.recent[k]; });
    }
  }

  function injectStyles() {
    if (document.getElementById("mv-enh-v1-styles")) return;
    const style = document.createElement("style");
    style.id = "mv-enh-v1-styles";
    style.textContent = `
      .mv-enh-toolbar{display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap;border:1px solid #273142;background:#080d14;border-radius:10px;padding:8px;margin-top:0;}
      .mv-enh-toolbar label{display:grid;gap:3px;font-size:.68rem;color:#879ab9;}
      .mv-enh-toolbar select{min-width:130px;}
      .mv-enh-toolbar .mv-enh-clear{margin-left:auto;align-self:flex-end;}
      .mv-enh-badges{display:flex;gap:4px;flex-wrap:wrap;margin-top:3px;}
      .mv-enh-chip{display:inline-flex;align-items:center;border:1px solid #31405b;border-radius:999px;padding:1px 6px;font-size:.63rem;color:#9eb4da;background:#101827;}
      .mv-enh-chip.collection{border-color:#4f456f;color:#c8b8ef;background:#151124;}
      .mv-enh-star{font-size:1rem!important;line-height:1!important;padding:3px 6px!important;color:#8090a7!important;}
      .mv-enh-star.on{color:#ffd166!important;border-color:#725f28!important;background:#211b0d!important;}
      .mv-enh-row-hidden{display:none!important;}
      .mv-enh-detail-card{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;border:1px solid #28354a;background:#090f18;border-radius:10px;padding:8px;margin-top:6px;}
      .mv-enh-portrait{width:82px;height:82px;border-radius:10px;border:1px solid #34425a;background:#101722;object-fit:cover;display:block;}
      .mv-enh-portrait.empty{display:grid;place-items:center;color:#53637c;font-size:1.6rem;}
      .mv-enh-notes{font-size:.74rem;line-height:1.4;color:#adbad1;white-space:pre-wrap;}
      .mv-enh-detail-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;}
      .mv-enh-modal{position:fixed;inset:0;z-index:6500;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.72);backdrop-filter:blur(3px);padding:20px;}
      .mv-enh-modal.open{display:flex;}
      .mv-enh-dialog{width:min(680px,95vw);max-height:88vh;overflow:auto;border:1px solid #39465a;border-radius:14px;background:#070a10;box-shadow:0 28px 90px rgba(0,0,0,.62);padding:12px;}
      .mv-enh-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;}
      .mv-enh-dialog-title{font-weight:750;color:#e8effd;font-size:.95rem;}
      .mv-enh-form{display:grid;gap:9px;}
      .mv-enh-form label{display:grid;gap:4px;font-size:.72rem;color:#99aac4;}
      .mv-enh-form textarea{min-height:120px;resize:vertical;}
      .mv-enh-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
      .mv-enh-preview-row{display:flex;align-items:center;gap:10px;border:1px solid #263246;border-radius:10px;padding:8px;background:#090f18;}
      .mv-enh-dialog-actions{display:flex;justify-content:flex-end;gap:6px;flex-wrap:wrap;margin-top:10px;}
      .mv-enh-qty{width:90px!important;}
      .mv-enh-toast{position:fixed;right:18px;bottom:18px;z-index:8000;border:1px solid #40516b;border-radius:10px;background:#0b121d;color:#dce7f8;padding:9px 12px;font-size:.75rem;box-shadow:0 14px 40px rgba(0,0,0,.45);}
      @media(max-width:700px){.mv-enh-grid2{grid-template-columns:1fr}.mv-enh-detail-card{grid-template-columns:1fr}.mv-enh-portrait{width:72px;height:72px}}
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    document.querySelector(".mv-enh-toast")?.remove();
    const el = document.createElement("div");
    el.className = "mv-enh-toast";
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  function allCollections() {
    return [...new Set(Object.values(metaState.meta).map((m) => String(m?.collection || "").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  }

  function allTags() {
    const set = new Set();
    Object.values(metaState.meta).forEach((m) => (Array.isArray(m?.tags) ? m.tags : []).forEach((t) => { const s=String(t).trim(); if(s) set.add(s); }));
    return [...set].sort((a,b)=>a.localeCompare(b));
  }

  function renderToolbar(panel) {
    if (!panel || panel.querySelector(".mv-enh-toolbar")) return;
    const controls = panel.querySelector(".mv-controls");
    if (!controls) return;
    const toolbar = document.createElement("div");
    toolbar.className = "mv-enh-toolbar";
    const collections = allCollections();
    const tags = allTags();
    toolbar.innerHTML = `
      <label>View<select id="mvEnhView"><option value="all">All monsters</option><option value="favorites">★ Favorites</option><option value="recent">Recently used</option></select></label>
      <label>Collection<select id="mvEnhCollection"><option value="all">All collections</option>${collections.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select></label>
      <label>Tag<select id="mvEnhTag"><option value="all">All tags</option>${tags.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select></label>
      <button type="button" class="btn btn-secondary btn-xs mv-enh-clear" id="mvEnhClearFilters">Clear library filters</button>`;
    controls.insertAdjacentElement("afterend", toolbar);
    toolbar.querySelector("#mvEnhView").value = metaState.view.mode;
    toolbar.querySelector("#mvEnhCollection").value = collections.includes(metaState.view.collection) ? metaState.view.collection : "all";
    toolbar.querySelector("#mvEnhTag").value = tags.includes(metaState.view.tag) ? metaState.view.tag : "all";
    toolbar.querySelector("#mvEnhView").addEventListener("change", (e)=>{metaState.view.mode=e.target.value;saveMeta();applyMetadataFilters(panel);});
    toolbar.querySelector("#mvEnhCollection").addEventListener("change", (e)=>{metaState.view.collection=e.target.value;saveMeta();applyMetadataFilters(panel);});
    toolbar.querySelector("#mvEnhTag").addEventListener("change", (e)=>{metaState.view.tag=e.target.value;saveMeta();applyMetadataFilters(panel);});
    toolbar.querySelector("#mvEnhClearFilters").addEventListener("click", ()=>{
      metaState.view={mode:"all",collection:"all",tag:"all"};saveMeta();
      toolbar.querySelector("#mvEnhView").value="all";toolbar.querySelector("#mvEnhCollection").value="all";toolbar.querySelector("#mvEnhTag").value="all";applyMetadataFilters(panel);
    });
  }

  function applyMetadataFilters(panel) {
    if (!panel) return;
    const recentSorted = Object.entries(metaState.recent).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,30).map(([id])=>id);
    const recentSet = new Set(recentSorted);
    panel.querySelectorAll(".mv-row-wrap[data-monster-id]").forEach((row)=>{
      const id=String(row.dataset.monsterId||"");
      const meta=monsterMeta(id);
      let show=true;
      if(metaState.view.mode==="favorites" && !isFavorite(id)) show=false;
      if(metaState.view.mode==="recent" && !recentSet.has(id)) show=false;
      if(metaState.view.collection!=="all" && meta.collection!==metaState.view.collection) show=false;
      if(metaState.view.tag!=="all" && !meta.tags.includes(metaState.view.tag)) show=false;
      row.classList.toggle("mv-enh-row-hidden",!show);
    });
  }

  function makeBadgeWrap(id) {
    const meta = monsterMeta(id);
    if (!meta.tags.length && !meta.collection) return null;
    const wrap=document.createElement("div");wrap.className="mv-enh-badges";
    if(meta.collection){const c=document.createElement("span");c.className="mv-enh-chip collection";c.textContent=meta.collection;wrap.appendChild(c);}
    meta.tags.slice(0,5).forEach((tag)=>{const c=document.createElement("span");c.className="mv-enh-chip";c.textContent=tag;wrap.appendChild(c);});
    if(meta.tags.length>5){const c=document.createElement("span");c.className="mv-enh-chip";c.textContent=`+${meta.tags.length-5}`;wrap.appendChild(c);}
    return wrap;
  }

  function decorateRows(panel) {
    panel.querySelectorAll(".mv-row-wrap[data-monster-id]").forEach((row)=>{
      const id=String(row.dataset.monsterId||"");
      const actions=row.querySelector(".mv-actions");
      const main=row.querySelector(".mv-main");
      if(!id||!actions||!main)return;

      if(!actions.querySelector("[data-mv-enh-star]")){
        const star=document.createElement("button");
        star.type="button";star.className=`btn btn-secondary btn-xs mv-enh-star ${isFavorite(id)?"on":""}`;star.dataset.mvEnhStar=id;star.title=isFavorite(id)?"Remove from favorites":"Add to favorites";star.textContent="★";
        star.addEventListener("click",(e)=>{e.stopPropagation();toggleFavorite(id);});
        actions.prepend(star);
      } else {
        actions.querySelector("[data-mv-enh-star]").classList.toggle("on",isFavorite(id));
      }

      if(!actions.querySelector("[data-mv-enh-encounter]")){
        const add=document.createElement("button");add.type="button";add.className="btn btn-secondary btn-xs";add.dataset.mvEnhEncounter=id;add.textContent="Add to Encounter";
        add.addEventListener("click",(e)=>{e.stopPropagation();openEncounterModal(id);});actions.appendChild(add);
      }
      if(!actions.querySelector("[data-mv-enh-manage]")){
        const manage=document.createElement("button");manage.type="button";manage.className="btn btn-secondary btn-xs";manage.dataset.mvEnhManage=id;manage.textContent="Notes / Tags";
        manage.addEventListener("click",(e)=>{e.stopPropagation();openManageModal(id);});actions.appendChild(manage);
      }
      if(!actions.querySelector("[data-mv-enh-duplicate]")){
        const dup=document.createElement("button");dup.type="button";dup.className="btn btn-secondary btn-xs";dup.dataset.mvEnhDuplicate=id;dup.textContent="Duplicate";
        dup.addEventListener("click",(e)=>{e.stopPropagation();duplicateMonster(id);});actions.appendChild(dup);
      }

      const clone=actions.querySelector("[data-mv-clone]"); if(clone) clone.textContent="Create Variant";
      const edit=actions.querySelector("[data-mv-edit]"); if(edit) edit.textContent="Quick Edit";

      main.querySelector(".mv-enh-badges")?.remove();
      const badges=makeBadgeWrap(id);if(badges)main.appendChild(badges);

      const toggle=actions.querySelector("[data-mv-toggle]");
      if(toggle&&!toggle.dataset.mvEnhRecentBound){toggle.dataset.mvEnhRecentBound="1";toggle.addEventListener("click",()=>{touchRecent(id);saveMeta();});}

      decorateDetails(row,id);
    });
  }

  function decorateDetails(row,id) {
    const details=row.querySelector(".mv-details");
    if(!details)return;
    const old=details.querySelector(".mv-enh-detail-card");if(old)old.remove();
    const meta=monsterMeta(id);
    const card=document.createElement("div");card.className="mv-enh-detail-card";
    const portrait=meta.portrait?`<img class="mv-enh-portrait" src="${esc(meta.portrait)}" alt="Monster portrait">`:`<div class="mv-enh-portrait empty">☠</div>`;
    card.innerHTML=`${portrait}<div><div class="mv-enh-notes">${meta.notes?esc(meta.notes):"No DM notes yet."}</div><div class="mv-enh-badges" style="margin-top:6px;">${meta.collection?`<span class="mv-enh-chip collection">${esc(meta.collection)}</span>`:""}${meta.tags.map(t=>`<span class="mv-enh-chip">${esc(t)}</span>`).join("")}</div><div class="mv-enh-detail-actions"><button class="btn btn-secondary btn-xs" data-mv-enh-manage-detail="${esc(id)}">Edit notes / tags</button><button class="btn btn-secondary btn-xs" data-mv-enh-encounter-detail="${esc(id)}">Add to Encounter</button></div></div>`;
    card.querySelector("[data-mv-enh-manage-detail]").addEventListener("click",()=>openManageModal(id));
    card.querySelector("[data-mv-enh-encounter-detail]").addEventListener("click",()=>openEncounterModal(id));
    details.prepend(card);
  }

  async function compressPortrait(file) {
    if(!file||!String(file.type||"").startsWith("image/"))return "";
    const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||""));r.onerror=reject;r.readAsDataURL(file);});
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=dataUrl;});
    const max=320;const scale=Math.min(1,max/Math.max(img.naturalWidth||1,img.naturalHeight||1));
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round((img.naturalWidth||1)*scale));canvas.height=Math.max(1,Math.round((img.naturalHeight||1)*scale));
    canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL("image/jpeg",.8);
  }

  function buildModals() {
    if(!document.getElementById("mvEnhManageModal")){
      const modal=document.createElement("div");modal.id="mvEnhManageModal";modal.className="mv-enh-modal";modal.innerHTML=`<div class="mv-enh-dialog"><div class="mv-enh-dialog-head"><div id="mvEnhManageTitle" class="mv-enh-dialog-title">Monster notes</div><button class="btn-secondary btn-small" id="mvEnhManageClose" type="button">✕ Close</button></div><div class="mv-enh-form"><div class="mv-enh-grid2"><label>Collection / Folder<input id="mvEnhCollectionInput" type="text" placeholder="Bosses, Onyx Empire, Session 24..."></label><label>Tags<input id="mvEnhTagsInput" type="text" placeholder="Undead, Forest, Boss"></label></div><label>DM Notes<textarea id="mvEnhNotesInput" placeholder="Tactics, lore, changes, reminders..."></textarea></label><label>Portrait<input id="mvEnhPortraitInput" type="file" accept="image/*"></label><div id="mvEnhPortraitPreview" class="mv-enh-preview-row"></div></div><div class="mv-enh-dialog-actions"><button class="btn-secondary btn-small" id="mvEnhRemovePortrait" type="button">Remove portrait</button><button class="btn-primary btn-small" id="mvEnhManageSave" type="button">Save metadata</button></div></div>`;document.body.appendChild(modal);
      const close=()=>{modal.classList.remove("open");manageMonsterId=null;};modal.querySelector("#mvEnhManageClose").addEventListener("click",close);modal.addEventListener("click",e=>{if(e.target===modal)close();});
      modal.querySelector("#mvEnhManageSave").addEventListener("click",async()=>{
        if(!manageMonsterId)return;const meta=monsterMeta(manageMonsterId);meta.collection=String(modal.querySelector("#mvEnhCollectionInput").value||"").trim();meta.tags=[...new Set(String(modal.querySelector("#mvEnhTagsInput").value||"").split(",").map(x=>x.trim()).filter(Boolean))];meta.notes=String(modal.querySelector("#mvEnhNotesInput").value||"").trim();const file=modal.querySelector("#mvEnhPortraitInput").files?.[0];if(file){try{meta.portrait=await compressPortrait(file);}catch(err){console.error(err);toast("Could not read that portrait");return;}}touchRecent(manageMonsterId);saveMeta();document.querySelector("#generatorPanel .mv-enh-toolbar")?.remove();close();scheduleDecorate();toast("Monster metadata saved");
      });
      modal.querySelector("#mvEnhRemovePortrait").addEventListener("click",()=>{if(!manageMonsterId)return;monsterMeta(manageMonsterId).portrait="";modal.querySelector("#mvEnhPortraitInput").value="";renderPortraitPreview(modal,manageMonsterId);});
      modal.querySelector("#mvEnhPortraitInput").addEventListener("change",()=>{const f=modal.querySelector("#mvEnhPortraitInput").files?.[0];const holder=modal.querySelector("#mvEnhPortraitPreview");if(!holder)return;if(!f){renderPortraitPreview(modal,manageMonsterId);return;}const url=URL.createObjectURL(f);holder.innerHTML=`<img class="mv-enh-portrait" src="${url}" alt="Portrait preview"><div><b>New portrait selected</b><div style="font-size:.7rem;color:#8494aa;">It will be compressed when you save.</div></div>`;setTimeout(()=>URL.revokeObjectURL(url),5000);});
    }

    if(!document.getElementById("mvEnhEncounterModal")){
      const modal=document.createElement("div");modal.id="mvEnhEncounterModal";modal.className="mv-enh-modal";modal.innerHTML=`<div class="mv-enh-dialog" style="width:min(520px,95vw)"><div class="mv-enh-dialog-head"><div id="mvEnhEncounterTitle" class="mv-enh-dialog-title">Add to Encounter</div><button class="btn-secondary btn-small" id="mvEnhEncounterClose" type="button">✕ Close</button></div><div id="mvEnhEncounterPreview" class="mv-enh-preview-row"></div><div class="mv-enh-grid2" style="margin-top:10px"><label style="display:grid;gap:4px;font-size:.72rem;color:#99aac4">Quantity<input id="mvEnhEncounterQty" class="mv-enh-qty" type="number" min="1" max="20" value="1"></label><label style="display:grid;gap:4px;font-size:.72rem;color:#99aac4">After adding<select id="mvEnhEncounterAfter"><option value="stay">Stay in Monster Vault</option><option value="open">Open Encounter</option></select></label></div><div class="mv-enh-dialog-actions"><button class="btn-primary btn-small" id="mvEnhEncounterAdd" type="button">Add to active encounter</button></div></div>`;document.body.appendChild(modal);
      const close=()=>{modal.classList.remove("open");encounterMonsterId=null;};modal.querySelector("#mvEnhEncounterClose").addEventListener("click",close);modal.addEventListener("click",e=>{if(e.target===modal)close();});modal.querySelector("#mvEnhEncounterAdd").addEventListener("click",()=>{if(!encounterMonsterId)return;const qty=Math.max(1,Math.min(20,Number(modal.querySelector("#mvEnhEncounterQty").value)||1));const open=modal.querySelector("#mvEnhEncounterAfter").value==="open";addMonsterToEncounter(encounterMonsterId,qty,open);close();});
    }
  }

  function renderPortraitPreview(modal,id){const holder=modal.querySelector("#mvEnhPortraitPreview");if(!holder)return;const meta=monsterMeta(id);holder.innerHTML=meta.portrait?`<img class="mv-enh-portrait" src="${esc(meta.portrait)}" alt="Portrait"><div><b>Current portrait</b><div style="font-size:.7rem;color:#8494aa;">Choose a new image to replace it.</div></div>`:`<div class="mv-enh-portrait empty">☠</div><div><b>No portrait</b><div style="font-size:.7rem;color:#8494aa;">Optional; stored with your local toolbox data.</div></div>`;}

  function openManageModal(id){buildModals();const mon=getMonster(id);if(!mon)return;manageMonsterId=String(id);touchRecent(id);saveMeta();const meta=monsterMeta(id);const modal=document.getElementById("mvEnhManageModal");modal.querySelector("#mvEnhManageTitle").textContent=`Notes / Tags · ${mon.name}`;modal.querySelector("#mvEnhCollectionInput").value=meta.collection;modal.querySelector("#mvEnhTagsInput").value=meta.tags.join(", ");modal.querySelector("#mvEnhNotesInput").value=meta.notes;modal.querySelector("#mvEnhPortraitInput").value="";renderPortraitPreview(modal,id);modal.classList.add("open");}

  function openEncounterModal(id){buildModals();const mon=getMonster(id);if(!mon)return;encounterMonsterId=String(id);touchRecent(id);saveMeta();const modal=document.getElementById("mvEnhEncounterModal");modal.querySelector("#mvEnhEncounterTitle").textContent=`Add ${mon.name} to Encounter`;const meta=monsterMeta(id);modal.querySelector("#mvEnhEncounterPreview").innerHTML=`${meta.portrait?`<img class="mv-enh-portrait" src="${esc(meta.portrait)}" alt="Portrait">`:`<div class="mv-enh-portrait empty">☠</div>`}<div><b>${esc(mon.name)}</b><div style="font-size:.72rem;color:#8798b0;">CR ${esc(mon.cr||"—")} · AC ${esc(mon.ac)} · HP ${esc(mon.hp)}</div></div>`;modal.querySelector("#mvEnhEncounterQty").value="1";modal.classList.add("open");}

  function defaultEncounterState(){return{tab:"active",round:1,turnIndex:0,activeEncounterName:"Current Encounter",activeLibraryId:null,activeCombatants:[],addExpanded:true,partyManagerOpen:false,selectedPartyId:null,parties:[],library:[],createName:"",createTags:"",createLocation:"",libraryEditId:null};}

  function addMonsterToEncounter(id,quantity,openAfter){const api=vaultApi();const mon=getMonster(id);if(!api||!mon)return;let enc=readJson(ENCOUNTER_KEY,null);if(!enc||typeof enc!=="object")enc=defaultEncounterState();if(!Array.isArray(enc.activeCombatants))enc.activeCombatants=[];for(let i=0;i<quantity;i++){let c=null;try{c=typeof api.toEncounterCombatant==="function"?api.toEncounterCombatant(id):null;}catch(_){}if(!c){c={id:`c_${Math.random().toString(36).slice(2)}_${Date.now()}`,name:mon.name,type:"Enemy",initiative:Number(mon.initiative)||10,ac:Number(mon.ac)||10,speed:Number(mon.speed)||30,hpCurrent:Number(mon.hp)||1,hpMax:Number(mon.hp)||1,level:1,cr:String(mon.cr||"1"),sourceMonsterId:String(mon.id||id),sourceMonsterName:mon.name,source:mon.source||"Monster Vault",xp:Number(mon.xp)||0,sizeType:mon.sizeType||"",details:mon.details||{},traits:mon.traits||mon.details?.traits||[],actions:mon.actions||mon.details?.actions||[],bonusActions:mon.bonusActions||mon.details?.bonusActions||[],reactions:mon.reactions||mon.details?.reactions||[],legendaryActions:mon.legendaryActions||mon.details?.legendaryActions||[],conditions:[]};}enc.activeCombatants.push(c);}enc.tab="active";enc.activeEncounterName=enc.activeEncounterName||"Current Encounter";localStorage.setItem(ENCOUNTER_KEY,JSON.stringify(enc));touchRecent(id);saveMeta();toast(`Added ${quantity} × ${mon.name} to the active encounter`);window.dispatchEvent(new CustomEvent("daggercraft-encounter-updated",{detail:{source:"monster-vault",monsterId:id,quantity}}));if(openAfter){setTimeout(()=>{const item=document.querySelector('.nav-tool[data-id="encounterTool"]');if(item)item.click();else if(window.toolRenderers?.encounterTool)window.toolRenderers.encounterTool({labelEl:document.getElementById("activeGeneratorLabel"),panelEl:document.getElementById("generatorPanel")});},60);}}

  function duplicateMonster(id){const api=vaultApi();const mon=getMonster(id);if(!api||!mon||typeof api.addHomebrewMonster!=="function")return;const copy=JSON.parse(JSON.stringify(mon));delete copy.id;copy.name=`${mon.name} Copy`;copy.source="Homebrew";copy.isHomebrew=true;try{const created=api.addHomebrewMonster(copy);if(created?.id){const srcMeta=monsterMeta(id);metaState.meta[String(created.id)]={tags:[...srcMeta.tags],collection:srcMeta.collection,notes:srcMeta.notes,portrait:srcMeta.portrait};touchRecent(created.id);saveMeta();document.querySelector("#generatorPanel .mv-enh-toolbar")?.remove();toast(`Created ${created.name}`);setTimeout(scheduleDecorate,50);}}catch(err){console.error(err);toast("Could not duplicate monster");}}

  function scheduleDecorate(){if(decorateScheduled)return;decorateScheduled=true;requestAnimationFrame(()=>{decorateScheduled=false;const panel=document.getElementById("generatorPanel");observer?.disconnect();decorate();if(panel)observer?.observe(panel,{childList:true,subtree:true});});}

  function decorate(){const panel=document.getElementById("generatorPanel");if(!panel||!panel.classList.contains("monster-vault-panel"))return;renderToolbar(panel);decorateRows(panel);applyMetadataFilters(panel);}

  function watchPanel(){const panel=document.getElementById("generatorPanel");if(!panel)return;observer?.disconnect();observer=new MutationObserver(()=>scheduleDecorate());observer.observe(panel,{childList:true,subtree:true});scheduleDecorate();}

  function init(){injectStyles();buildModals();watchPanel();window.addEventListener("vrahune-monster-vault-updated",()=>scheduleDecorate());window.addEventListener("vrahune-monster-vault-ready",()=>scheduleDecorate());document.addEventListener("click",(e)=>{const row=e.target.closest?.(".mv-row-wrap[data-monster-id]");if(row){touchRecent(row.dataset.monsterId);saveMeta();}});}

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();

// Encounter Combat Mode v1
// A focused combat-running screen layered on the existing Encounter / Initiative state.
(() => {
  "use strict";

  if (window.__daggerCraftEncounterCombatModeV1) return;
  window.__daggerCraftEncounterCombatModeV1 = true;

  const ENCOUNTER_KEY = "vrahuneEncounterToolStateV7";
  const EXTRA_KEY = "daggerCraftEncounterCombatModeV1";
  const MV_META_KEY = "daggerCraftMonsterVaultEnhancementsV1";
  const CONDITIONS = ["Blinded","Charmed","Deafened","Frightened","Grappled","Incapacitated","Invisible","Paralyzed","Petrified","Poisoned","Prone","Restrained","Stunned","Unconscious"];

  let observer = null;
  let decorateScheduled = false;
  let timerId = null;

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

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function intOr(v, fallback = 0) { const n=Number(v); return Number.isFinite(n)?Math.trunc(n):fallback; }
  function uid(prefix="id") { return `${prefix}_${Math.random().toString(36).slice(2,8)}_${Date.now().toString(36)}`; }

  function defaultExtra() {
    return { version:1, startedAt:Date.now(), combatants:{}, log:[] };
  }

  function normalizeExtra(raw) {
    const base=defaultExtra();
    if(!raw||typeof raw!=="object")return base;
    base.startedAt=Number(raw.startedAt)||Date.now();
    base.combatants=raw.combatants&&typeof raw.combatants==="object"?raw.combatants:{};
    base.log=Array.isArray(raw.log)?raw.log.slice(-250):[];
    return base;
  }

  function encounterState() {
    const raw=readJson(ENCOUNTER_KEY,{});
    if(!raw||typeof raw!=="object")return {tab:"active",round:1,turnIndex:0,activeEncounterName:"Current Encounter",activeCombatants:[],library:[]};
    if(!Array.isArray(raw.activeCombatants))raw.activeCombatants=[];
    raw.round=Math.max(1,intOr(raw.round,1));
    raw.turnIndex=raw.activeCombatants.length?clamp(intOr(raw.turnIndex,0),0,raw.activeCombatants.length-1):0;
    if(!Array.isArray(raw.library))raw.library=[];
    return raw;
  }

  function saveEncounter(state) {
    writeJson(ENCOUNTER_KEY,state);
    window.dispatchEvent(new CustomEvent("daggercraft-encounter-updated",{detail:{source:"combat-mode"}}));
  }

  let extra=normalizeExtra(readJson(EXTRA_KEY,null));
  function saveExtra(){writeJson(EXTRA_KEY,extra);}

  function extraFor(id) {
    const key=String(id||"");
    const raw=extra.combatants[key]&&typeof extra.combatants[key]==="object"?extra.combatants[key]:{};
    if(!extra.combatants[key])extra.combatants[key]=raw;
    raw.concentration=!!raw.concentration;
    raw.reactionUsed=!!raw.reactionUsed;
    raw.deathSuccess=clamp(intOr(raw.deathSuccess,0),0,3);
    raw.deathFail=clamp(intOr(raw.deathFail,0),0,3);
    raw.legendaryUsed=Math.max(0,intOr(raw.legendaryUsed,0));
    raw.legendaryMax=Math.max(0,intOr(raw.legendaryMax,3));
    raw.recharge=raw.recharge&&typeof raw.recharge==="object"?raw.recharge:{};
    return raw;
  }

  function cleanupExtras(state) {
    const ids=new Set((state.activeCombatants||[]).map(c=>String(c.id)));
    Object.keys(extra.combatants).forEach(id=>{if(!ids.has(id))delete extra.combatants[id];});
    saveExtra();
  }

  function portraitFor(c) {
    if(c?.portrait)return c.portrait;
    const sourceId=String(c?.sourceMonsterId||"");
    if(!sourceId)return "";
    const mv=readJson(MV_META_KEY,null);
    return String(mv?.meta?.[sourceId]?.portrait||"");
  }

  function logEvent(state,text) {
    extra.log.push({id:uid("log"),time:Date.now(),round:state.round,text:String(text||"")});
    if(extra.log.length>250)extra.log=extra.log.slice(-250);
    saveExtra();
  }

  function rollDie(faces) { return Math.floor(Math.random()*faces)+1; }
  function rollDiceExpression(expr) {
    const raw=String(expr||"").replace(/\s+/g,"");
    const m=raw.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
    if(!m)return null;
    const count=clamp(Number(m[1]||1),1,100);const faces=clamp(Number(m[2]||20),2,1000);const mod=Number(m[3]||0);
    const rolls=Array.from({length:count},()=>rollDie(faces));
    return {expr:raw,rolls,mod,total:rolls.reduce((a,b)=>a+b,0)+mod};
  }

  function attackBonus(text) {
    const s=String(text||"");
    const m=s.match(/([+-]\s*\d+)\s+to\s+hit/i) || s.match(/attack\s+roll\s*:\s*([+-]\s*\d+)/i);
    return m?Number(m[1].replace(/\s+/g,"")):null;
  }

  function damageExpr(text) {
    const s=String(text||"");
    const hit=s.match(/Hit:\s*\d+\s*\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)/i);
    if(hit)return hit[1].replace(/\s+/g,"");
    const any=s.match(/\b(\d+d\d+(?:\s*[+-]\s*\d+)?)\b/i);
    return any?any[1].replace(/\s+/g,""):null;
  }

  function rechargeRange(action) {
    const s=`${action?.name||""} ${action?.text||""}`;
    const m=s.match(/Recharge\s*(\d)(?:\s*[–—-]\s*(\d))?/i);
    if(!m)return null;
    return {min:Number(m[1]),max:Number(m[2]||m[1])};
  }

  function featureList(c) {
    const details=c?.details&&typeof c.details==="object"?c.details:{};
    return {
      traits:Array.isArray(c.traits)?c.traits:(details.traits||[]),
      actions:Array.isArray(c.actions)?c.actions:(details.actions||[]),
      bonusActions:Array.isArray(c.bonusActions)?c.bonusActions:(details.bonusActions||[]),
      reactions:Array.isArray(c.reactions)?c.reactions:(details.reactions||[]),
      legendaryActions:Array.isArray(c.legendaryActions)?c.legendaryActions:(details.legendaryActions||[])
    };
  }

  function injectStyles() {
    if(document.getElementById("enc-combat-v1-styles"))return;
    const style=document.createElement("style");style.id="enc-combat-v1-styles";style.textContent=`
      .enc-combat-launchbar{display:flex;justify-content:flex-end;gap:7px;margin-bottom:8px;}
      .enc-combat-launch{border-color:#815b31!important;background:#24170d!important;color:#ffd6a5!important;font-weight:750!important;}
      .enc-combat-overlay{position:fixed;inset:0;z-index:7000;display:none;background:#05070bcc;color:#dce7f8;backdrop-filter:blur(4px);padding:12px;}
      .enc-combat-overlay.open{display:block;}
      .enc-combat-shell{height:100%;display:grid;grid-template-rows:auto minmax(0,1fr);gap:8px;max-width:1600px;margin:0 auto;}
      .enc-combat-top{border:1px solid #354157;border-radius:13px;background:#080d14;padding:8px 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;box-shadow:0 10px 35px rgba(0,0,0,.35);}
      .enc-combat-title{font-weight:800;font-size:1rem;margin-right:auto;}
      .enc-combat-pill{border:1px solid #35445a;border-radius:999px;background:#0e1622;padding:4px 8px;font-size:.72rem;color:#a8b9d0;}
      .enc-combat-main{min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:8px;}
      .enc-combat-cards{min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:8px;align-content:start;padding-right:2px;}
      .enc-combat-card{border:1px solid #29364c;border-radius:12px;background:#09101a;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.18);}
      .enc-combat-card.active{border-color:#d08b42;box-shadow:0 0 0 1px #d08b4266,0 12px 30px rgba(0,0,0,.32);}
      .enc-combat-card.dead{opacity:.62;filter:saturate(.65);}
      .enc-combat-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border-bottom:1px solid #233047;}
      .enc-combat-avatar{width:48px;height:48px;border-radius:10px;border:1px solid #35455d;background:#101a28;object-fit:cover;display:grid;place-items:center;color:#61738f;font-size:1.3rem;}
      .enc-combat-name{font-size:.88rem;font-weight:800;color:#edf3ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .enc-combat-meta{font-size:.67rem;color:#8599b8;margin-top:2px;}
      .enc-combat-init{font-size:.7rem;color:#a8b8d0;text-align:right;}
      .enc-combat-body{padding:8px;display:grid;gap:7px;}
      .enc-hp-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:6px;align-items:center;}
      .enc-hp-big{font-size:1.05rem;font-weight:850;min-width:72px;}
      .enc-hpbar{height:9px;border-radius:999px;background:#1c2735;overflow:hidden;border:1px solid #303d50;}
      .enc-hpfill{height:100%;background:linear-gradient(90deg,#874447,#c76a6c);}
      .enc-quick-row,.enc-toggle-row,.enc-condition-row,.enc-action-buttons{display:flex;gap:5px;flex-wrap:wrap;align-items:center;}
      .enc-mini{border:1px solid #344159;border-radius:7px;background:#111925;color:#cbd8eb;padding:4px 7px;font-size:.68rem;cursor:pointer;}
      .enc-mini:hover{background:#182337;border-color:#4a5b77;}
      .enc-mini.on{border-color:#6d8150;background:#1b2515;color:#d9efb8;}
      .enc-mini.warn.on{border-color:#8a5a3d;background:#28170f;color:#ffd3b0;}
      .enc-condition{border:1px solid #554672;border-radius:999px;background:#181225;color:#c7b6ea;padding:2px 6px;font-size:.62rem;cursor:pointer;}
      .enc-feature-box{border-top:1px solid #1f2a3b;padding-top:6px;display:grid;gap:5px;}
      .enc-feature-title{font-size:.65rem;color:#7387a8;text-transform:uppercase;letter-spacing:.07em;}
      .enc-feature{border:1px solid #243249;border-radius:8px;background:#0b131e;padding:6px;}
      .enc-feature-name{font-size:.7rem;font-weight:750;color:#d9e4f6;}
      .enc-feature-text{font-size:.64rem;color:#8fa2bf;line-height:1.35;margin-top:2px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
      .enc-side{min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);gap:8px;}
      .enc-side-card{border:1px solid #2e3a4e;border-radius:12px;background:#08101a;padding:8px;}
      .enc-side-title{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:#879ab7;margin-bottom:6px;}
      .enc-log{min-height:0;overflow:auto;display:flex;flex-direction:column-reverse;gap:5px;}
      .enc-log-row{border-bottom:1px solid #1c2736;padding:5px 2px;font-size:.67rem;color:#9cafc8;line-height:1.3;}
      .enc-log-row b{color:#d7e2f3;}
      .enc-empty{padding:30px;text-align:center;color:#73859f;border:1px dashed #2d3a4e;border-radius:12px;}
      @media(max-width:1000px){.enc-combat-main{grid-template-columns:1fr}.enc-side{grid-template-columns:1fr 1fr;grid-template-rows:auto}.enc-log{max-height:220px}}
      @media(max-width:650px){.enc-combat-overlay{padding:5px}.enc-combat-cards{grid-template-columns:1fr}.enc-side{grid-template-columns:1fr}}
    `;document.head.appendChild(style);
  }

  function buildOverlay() {
    if(document.getElementById("encCombatOverlay"))return;
    const overlay=document.createElement("div");overlay.id="encCombatOverlay";overlay.className="enc-combat-overlay";overlay.innerHTML=`<div class="enc-combat-shell"><div id="encCombatTop" class="enc-combat-top"></div><div class="enc-combat-main"><div id="encCombatCards" class="enc-combat-cards"></div><div class="enc-side"><div id="encCombatTools" class="enc-side-card"></div><div class="enc-side-card" style="min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr)"><div class="enc-side-title">Combat Log</div><div id="encCombatLog" class="enc-log"></div></div></div></div></div>`;document.body.appendChild(overlay);
    overlay.addEventListener("click",handleOverlayClick);
    overlay.addEventListener("change",handleOverlayChange);
  }

  function openCombatMode() {
    buildOverlay();
    const state=encounterState();cleanupExtras(state);
    if(!extra.startedAt)extra.startedAt=Date.now();saveExtra();
    document.getElementById("encCombatOverlay").classList.add("open");
    renderCombatMode();
    startTimer();
  }

  function closeCombatMode() {
    document.getElementById("encCombatOverlay")?.classList.remove("open");
    stopTimer();
    rerenderEncounterTool();
  }

  function elapsedText() {
    const ms=Math.max(0,Date.now()-Number(extra.startedAt||Date.now()));
    const sec=Math.floor(ms/1000);const h=Math.floor(sec/3600);const m=Math.floor((sec%3600)/60);const s=sec%60;
    return h?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }

  function startTimer(){stopTimer();timerId=setInterval(()=>{const t=document.getElementById("encCombatTimer");if(t)t.textContent=elapsedText();},1000);}
  function stopTimer(){if(timerId){clearInterval(timerId);timerId=null;}}

  function renderCombatMode() {
    const state=encounterState();cleanupExtras(state);
    const top=document.getElementById("encCombatTop");const cards=document.getElementById("encCombatCards");const tools=document.getElementById("encCombatTools");const log=document.getElementById("encCombatLog");if(!top||!cards||!tools||!log)return;
    const count=state.activeCombatants.length;const active=count?state.activeCombatants[state.turnIndex]:null;
    top.innerHTML=`<div class="enc-combat-title">⚔ ${esc(state.activeEncounterName||"Current Encounter")}</div><span class="enc-combat-pill">Round <b>${state.round}</b></span><span class="enc-combat-pill">Turn <b>${count?state.turnIndex+1:0}/${count}</b></span><span class="enc-combat-pill">Timer <b id="encCombatTimer">${elapsedText()}</b></span><button class="btn-secondary btn-small" data-enc-action="prev">← Previous</button><button class="btn-primary btn-small" data-enc-action="next">Next Turn →</button><button class="btn-secondary btn-small" data-enc-action="close">✕ Close</button>`;
    cards.innerHTML=count?state.activeCombatants.map((c,i)=>renderCard(c,i,i===state.turnIndex)).join(""):`<div class="enc-empty">No combatants in the active encounter. Add creatures from Encounter or Monster Vault first.</div>`;
    tools.innerHTML=renderTools(state,active);
    log.innerHTML=extra.log.length?extra.log.slice().reverse().map(item=>`<div class="enc-log-row"><b>R${esc(item.round)}</b> · ${esc(new Date(item.time).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}))}<br>${esc(item.text)}</div>`).join(""):`<div class="enc-log-row">Combat actions will be recorded here.</div>`;
  }

  function renderCard(c,index,isActive) {
    const ex=extraFor(c.id);const hpMax=Math.max(1,intOr(c.hpMax,1));const hp=clamp(intOr(c.hpCurrent,hpMax),0,hpMax);const pct=clamp((hp/hpMax)*100,0,100);const dead=hp<=0;const portrait=portraitFor(c);const groups=featureList(c);const legendaryCount=groups.legendaryActions.length?Math.max(1,ex.legendaryMax||3):0;const conditions=Array.isArray(c.conditions)?c.conditions:[];
    const actionHtml=[...groups.actions,...groups.bonusActions].slice(0,8).map((a,idx)=>renderFeature(a,c.id,idx)).join("");
    const reactionHtml=groups.reactions.slice(0,3).map((a,idx)=>renderFeature(a,c.id,`r${idx}`,"Reaction")).join("");
    const legendaryHtml=groups.legendaryActions.slice(0,4).map((a,idx)=>renderFeature(a,c.id,`l${idx}`,"Legendary")).join("");
    return `<article class="enc-combat-card ${isActive?"active":""} ${dead?"dead":""}" data-enc-card="${esc(c.id)}"><div class="enc-combat-head">${portrait?`<img class="enc-combat-avatar" src="${esc(portrait)}" alt="Portrait">`:`<div class="enc-combat-avatar">${c.type==="Enemy"?"☠":"◆"}</div>`}<div><div class="enc-combat-name">${esc(c.name)}</div><div class="enc-combat-meta">${esc(c.type||"NPC")} · AC ${esc(c.ac??"—")} · Speed ${esc(c.speed??"—")} · ${c.type==="Enemy"?`CR ${esc(c.cr||"—")}`:`Level ${esc(c.level||"—")}`}</div></div><div class="enc-combat-init">Init<br><b>${esc(c.initiative??0)}</b></div></div><div class="enc-combat-body"><div class="enc-hp-row"><div class="enc-hp-big">${hp} / ${hpMax}</div><div class="enc-hpbar"><div class="enc-hpfill" style="width:${pct}%"></div></div><span style="font-size:.65rem;color:#8192ab">${Math.round(pct)}%</span></div><div class="enc-quick-row"><button class="enc-mini" data-hp="-1" data-id="${esc(c.id)}">−1</button><button class="enc-mini" data-hp="-5" data-id="${esc(c.id)}">−5</button><button class="enc-mini" data-hp="-10" data-id="${esc(c.id)}">−10</button><button class="enc-mini" data-custom-damage="${esc(c.id)}">Damage…</button><button class="enc-mini" data-custom-heal="${esc(c.id)}">Heal…</button>${c.type==="Enemy"?`<button class="enc-mini" data-group-damage="${esc(c.id)}" title="Apply damage to all copies of this monster">Damage Group…</button>`:""}</div><div class="enc-toggle-row"><button class="enc-mini ${ex.concentration?"on":""}" data-toggle-concentration="${esc(c.id)}">Concentration</button><button class="enc-mini warn ${ex.reactionUsed?"on":""}" data-toggle-reaction="${esc(c.id)}">Reaction ${ex.reactionUsed?"Used":"Ready"}</button>${legendaryCount?`<button class="enc-mini" data-legendary-minus="${esc(c.id)}">LA −</button><span class="enc-combat-pill">Legendary ${Math.max(0,legendaryCount-ex.legendaryUsed)}/${legendaryCount}</span><button class="enc-mini" data-legendary-plus="${esc(c.id)}">LA +</button>`:""}</div>${c.type!=="Enemy"?`<div class="enc-toggle-row"><span style="font-size:.66rem;color:#8193ad">Death Saves</span><button class="enc-mini ${ex.deathSuccess?"on":""}" data-death-success="${esc(c.id)}">✓ ${ex.deathSuccess}/3</button><button class="enc-mini warn ${ex.deathFail?"on":""}" data-death-fail="${esc(c.id)}">✕ ${ex.deathFail}/3</button></div>`:""}<div class="enc-condition-row"><select data-condition-select="${esc(c.id)}"><option value="">Add condition…</option>${CONDITIONS.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select><button class="enc-mini" data-exhaustion-minus="${esc(c.id)}">Exh −</button><span class="enc-combat-pill">Exhaustion ${clamp(intOr(c.exhaustionLevel,0),0,6)}</span><button class="enc-mini" data-exhaustion-plus="${esc(c.id)}">Exh +</button></div>${conditions.length?`<div class="enc-condition-row">${conditions.map(x=>`<button class="enc-condition" data-remove-condition="${esc(c.id)}" data-condition="${esc(x.name||x)}" title="Click to remove">${esc(x.name||x)}${x.duration?` · ${esc(x.duration)}r`:""} ✕</button>`).join("")}</div>`:""}${actionHtml?`<div class="enc-feature-box"><div class="enc-feature-title">Actions</div>${actionHtml}</div>`:""}${reactionHtml?`<div class="enc-feature-box"><div class="enc-feature-title">Reactions</div>${reactionHtml}</div>`:""}${legendaryHtml?`<div class="enc-feature-box"><div class="enc-feature-title">Legendary Actions</div>${legendaryHtml}</div>`:""}</div></article>`;
  }

  function renderFeature(a,combatantId,index,prefix="") {
    const name=String(a?.name||"Action");const text=String(a?.text||a?.description||"");const bonus=attackBonus(text);const dmg=damageExpr(text);const recharge=rechargeRange(a);const key=`${prefix}${name}`;const ex=extraFor(combatantId);const rechargeState=ex.recharge[key]||null;
    return `<div class="enc-feature"><div class="enc-feature-name">${prefix?`${esc(prefix)} · `:""}${esc(name)}${recharge?` <span style="color:${rechargeState?.ready===false?"#d17a7a":"#91c47c"}">· ${rechargeState?.ready===false?"Spent":"Ready"}</span>`:""}</div><div class="enc-feature-text">${esc(text)}</div><div class="enc-action-buttons">${bonus!=null?`<button class="enc-mini" data-roll-attack="${esc(combatantId)}" data-bonus="${bonus}" data-action-name="${esc(name)}">Attack ${bonus>=0?"+":""}${bonus}</button>`:""}${dmg?`<button class="enc-mini" data-roll-damage="${esc(combatantId)}" data-dice="${esc(dmg)}" data-action-name="${esc(name)}">Damage ${esc(dmg)}</button>`:""}${recharge?`<button class="enc-mini" data-roll-recharge="${esc(combatantId)}" data-recharge-key="${esc(key)}" data-min="${recharge.min}" data-max="${recharge.max}">Roll Recharge</button>`:""}</div></div>`;
  }

  function renderTools(state,active) {
    return `<div class="enc-side-title">Encounter Controls</div><div style="display:grid;gap:6px"><div class="enc-combat-pill">Active: <b>${active?esc(active.name):"None"}</b></div><button class="btn-secondary btn-small" data-enc-action="round-plus">Advance Round</button><button class="btn-secondary btn-small" data-enc-action="save-snapshot">Save Current Encounter to Library</button><button class="btn-secondary btn-small" data-enc-action="reset-reactions">Reset Reactions / Legendary</button><button class="btn-secondary btn-small" data-enc-action="reset-timer">Reset Combat Timer</button><button class="btn-secondary btn-small" data-enc-action="clear-log">Clear Combat Log</button></div>`;
  }

  function findCombatant(state,id){return state.activeCombatants.find(c=>String(c.id)===String(id));}
  function commit(state,text){saveEncounter(state);if(text)logEvent(state,text);renderCombatMode();}

  function adjustHp(id,delta,label=null) {
    const state=encounterState();const c=findCombatant(state,id);if(!c)return;const max=Math.max(1,intOr(c.hpMax,1));const before=clamp(intOr(c.hpCurrent,max),0,max);c.hpCurrent=clamp(before+delta,0,max);commit(state,`${c.name}: ${label||`${delta>=0?"healed":"took"} ${Math.abs(delta)}`} (${before} → ${c.hpCurrent} HP)`);
  }

  function promptAmount(message){const value=window.prompt(message,"5");if(value==null)return null;const n=Math.abs(intOr(value,0));return n>0?n:null;}

  function adjustGroupHp(id,amount) {
    const state=encounterState();const source=findCombatant(state,id);if(!source)return;const sourceId=String(source.sourceMonsterId||"");const sourceName=String(source.sourceMonsterName||source.name||"");const matches=state.activeCombatants.filter(c=>c.type==="Enemy"&&((sourceId&&String(c.sourceMonsterId||"")===sourceId)||(!sourceId&&String(c.sourceMonsterName||c.name||"")===sourceName)));if(!matches.length)return;matches.forEach(c=>{const max=Math.max(1,intOr(c.hpMax,1));c.hpCurrent=clamp(intOr(c.hpCurrent,max)-amount,0,max);});commit(state,`${sourceName}: ${amount} damage applied to ${matches.length} copies`);
  }

  function moveTurn(direction) {
    const state=encounterState();const n=state.activeCombatants.length;if(!n)return;
    if(direction>0){const old=state.turnIndex;state.turnIndex=(state.turnIndex+1)%n;if(state.turnIndex===0&&old===n-1)state.round+=1;}else{const old=state.turnIndex;state.turnIndex=(state.turnIndex-1+n)%n;if(old===0&&state.turnIndex===n-1)state.round=Math.max(1,state.round-1);}
    const active=state.activeCombatants[state.turnIndex];if(active){const ex=extraFor(active.id);ex.reactionUsed=false;ex.legendaryUsed=0;}
    saveExtra();commit(state,`${active?.name||"Combatant"}'s turn begins`);
  }

  function addCondition(id,name) {
    if(!name)return;const state=encounterState();const c=findCombatant(state,id);if(!c)return;if(!Array.isArray(c.conditions))c.conditions=[];if(!c.conditions.some(x=>String(x.name||x).toLowerCase()===name.toLowerCase()))c.conditions.push({name,duration:null});commit(state,`${c.name} gains ${name}`);
  }

  function removeCondition(id,name) {
    const state=encounterState();const c=findCombatant(state,id);if(!c)return;c.conditions=(Array.isArray(c.conditions)?c.conditions:[]).filter(x=>String(x.name||x)!==name);commit(state,`${c.name}: ${name} removed`);
  }

  function rollAttack(id,bonus,name) {
    const state=encounterState();const c=findCombatant(state,id);if(!c)return;const roll=rollDie(20);const total=roll+Number(bonus||0);logEvent(state,`${c.name} · ${name}: attack ${roll} ${bonus>=0?"+":"−"} ${Math.abs(bonus)} = ${total}${roll===20?" (Natural 20)":roll===1?" (Natural 1)":""}`);renderCombatMode();
  }

  function rollDamage(id,expr,name) {
    const state=encounterState();const c=findCombatant(state,id);if(!c)return;const r=rollDiceExpression(expr);if(!r)return;logEvent(state,`${c.name} · ${name}: ${r.expr} = ${r.total} [${r.rolls.join(", ")}${r.mod?`${r.mod>=0?" + ":" - "}${Math.abs(r.mod)}`:""}]`);renderCombatMode();
  }

  function rollRecharge(id,key,min,max) {
    const state=encounterState();const c=findCombatant(state,id);if(!c)return;const roll=rollDie(6);const ready=roll>=min&&roll<=max;const ex=extraFor(id);ex.recharge[key]={ready,lastRoll:roll};saveExtra();logEvent(state,`${c.name} · ${key}: recharge roll ${roll} → ${ready?"Ready":"Not ready"}`);renderCombatMode();
  }

  function saveSnapshot() {
    const state=encounterState();const name=window.prompt("Save current encounter as:",state.activeEncounterName||`Encounter Round ${state.round}`);if(!name)return;state.library.push({id:uid("enc"),name:String(name).trim()||"Saved Encounter",tags:"Combat snapshot",location:"",combatants:JSON.parse(JSON.stringify(state.activeCombatants))});commit(state,`Saved encounter snapshot “${name}”`);
  }

  function handleOverlayClick(event) {
    const btn=event.target.closest("button");if(!btn)return;
    const action=btn.dataset.encAction;if(action){if(action==="close")closeCombatMode();else if(action==="next")moveTurn(1);else if(action==="prev")moveTurn(-1);else if(action==="round-plus"){const state=encounterState();state.round+=1;state.activeCombatants.forEach(c=>{const ex=extraFor(c.id);ex.reactionUsed=false;ex.legendaryUsed=0;});saveExtra();commit(state,`Round ${state.round} begins`);}else if(action==="reset-reactions"){const state=encounterState();state.activeCombatants.forEach(c=>{const ex=extraFor(c.id);ex.reactionUsed=false;ex.legendaryUsed=0;});saveExtra();logEvent(state,"Reactions and legendary action counters reset");renderCombatMode();}else if(action==="reset-timer"){extra.startedAt=Date.now();saveExtra();renderCombatMode();}else if(action==="clear-log"){if(window.confirm("Clear the combat log?")){extra.log=[];saveExtra();renderCombatMode();}}else if(action==="save-snapshot")saveSnapshot();return;}

    if(btn.dataset.hp){adjustHp(btn.dataset.id,Number(btn.dataset.hp),`${Math.abs(Number(btn.dataset.hp))} damage`);return;}
    if(btn.dataset.customDamage){const n=promptAmount("Damage amount:");if(n)adjustHp(btn.dataset.customDamage,-n,`${n} damage`);return;}
    if(btn.dataset.customHeal){const n=promptAmount("Healing amount:");if(n)adjustHp(btn.dataset.customHeal,n,`${n} healing`);return;}
    if(btn.dataset.groupDamage){const n=promptAmount("Damage every copy of this monster by:");if(n)adjustGroupHp(btn.dataset.groupDamage,n);return;}
    if(btn.dataset.toggleConcentration){const id=btn.dataset.toggleConcentration;const state=encounterState();const c=findCombatant(state,id);if(!c)return;const ex=extraFor(id);ex.concentration=!ex.concentration;saveExtra();logEvent(state,`${c.name}: concentration ${ex.concentration?"started":"ended"}`);renderCombatMode();return;}
    if(btn.dataset.toggleReaction){const id=btn.dataset.toggleReaction;const state=encounterState();const c=findCombatant(state,id);if(!c)return;const ex=extraFor(id);ex.reactionUsed=!ex.reactionUsed;saveExtra();logEvent(state,`${c.name}: reaction ${ex.reactionUsed?"used":"reset"}`);renderCombatMode();return;}
    if(btn.dataset.legendaryPlus){const id=btn.dataset.legendaryPlus;const ex=extraFor(id);ex.legendaryUsed=clamp(ex.legendaryUsed+1,0,ex.legendaryMax);saveExtra();renderCombatMode();return;}
    if(btn.dataset.legendaryMinus){const id=btn.dataset.legendaryMinus;const ex=extraFor(id);ex.legendaryUsed=Math.max(0,ex.legendaryUsed-1);saveExtra();renderCombatMode();return;}
    if(btn.dataset.deathSuccess){const id=btn.dataset.deathSuccess;const ex=extraFor(id);ex.deathSuccess=(ex.deathSuccess+1)%4;saveExtra();renderCombatMode();return;}
    if(btn.dataset.deathFail){const id=btn.dataset.deathFail;const ex=extraFor(id);ex.deathFail=(ex.deathFail+1)%4;saveExtra();renderCombatMode();return;}
    if(btn.dataset.removeCondition){removeCondition(btn.dataset.removeCondition,btn.dataset.condition);return;}
    if(btn.dataset.exhaustionPlus){const state=encounterState();const c=findCombatant(state,btn.dataset.exhaustionPlus);if(!c)return;c.exhaustionLevel=clamp(intOr(c.exhaustionLevel,0)+1,0,6);commit(state,`${c.name}: exhaustion ${c.exhaustionLevel}`);return;}
    if(btn.dataset.exhaustionMinus){const state=encounterState();const c=findCombatant(state,btn.dataset.exhaustionMinus);if(!c)return;c.exhaustionLevel=clamp(intOr(c.exhaustionLevel,0)-1,0,6);commit(state,`${c.name}: exhaustion ${c.exhaustionLevel}`);return;}
    if(btn.dataset.rollAttack){rollAttack(btn.dataset.rollAttack,Number(btn.dataset.bonus),btn.dataset.actionName||"Attack");return;}
    if(btn.dataset.rollDamage){rollDamage(btn.dataset.rollDamage,btn.dataset.dice,btn.dataset.actionName||"Damage");return;}
    if(btn.dataset.rollRecharge){rollRecharge(btn.dataset.rollRecharge,btn.dataset.rechargeKey,Number(btn.dataset.min),Number(btn.dataset.max));return;}
  }

  function handleOverlayChange(event) {
    const select=event.target.closest("[data-condition-select]");if(select&&select.value){addCondition(select.dataset.conditionSelect,select.value);}
  }

  function rerenderEncounterTool() {
    if(!document.getElementById("generatorPanel")?.classList.contains("encounter-tool-panel"))return;
    try{window.toolRenderers?.encounterTool?.({labelEl:document.getElementById("activeGeneratorLabel"),panelEl:document.getElementById("generatorPanel")});}catch(_){ }
  }

  function decorateEncounterPanel() {
    const panel=document.getElementById("generatorPanel");if(!panel||!panel.classList.contains("encounter-tool-panel"))return;
    if(panel.querySelector(".enc-combat-launchbar"))return;
    const bar=document.createElement("div");bar.className="enc-combat-launchbar";bar.innerHTML=`<button type="button" class="btn-primary btn-small enc-combat-launch">⚔ Combat Mode</button>`;bar.querySelector("button").addEventListener("click",openCombatMode);panel.prepend(bar);
  }

  function scheduleDecorate(){if(decorateScheduled)return;decorateScheduled=true;requestAnimationFrame(()=>{decorateScheduled=false;decorateEncounterPanel();});}
  function watchPanel(){const panel=document.getElementById("generatorPanel");if(!panel)return;observer?.disconnect();observer=new MutationObserver(scheduleDecorate);observer.observe(panel,{childList:true,subtree:false});scheduleDecorate();}

  function init(){injectStyles();buildOverlay();watchPanel();window.addEventListener("daggercraft-encounter-updated",()=>{if(document.getElementById("encCombatOverlay")?.classList.contains("open"))renderCombatMode();});document.addEventListener("keydown",e=>{if(e.key==="Escape"&&document.getElementById("encCombatOverlay")?.classList.contains("open")){e.preventDefault();closeCombatMode();}});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();

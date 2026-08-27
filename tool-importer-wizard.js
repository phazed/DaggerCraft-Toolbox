// Stat Block Importer Wizard v1
// Keeps the existing OCR/JSON/Markdown parser, but puts a clean three-step workflow in front of it.
(() => {
  "use strict";

  if (window.__daggerCraftImporterWizardV1) return;
  window.__daggerCraftImporterWizardV1 = true;

  let mode = null; // null | paste | image | json
  let observer = null;
  let decorateScheduled = false;

  function injectStyles() {
    if (document.getElementById("sbi-wizard-v1-styles")) return;
    const style = document.createElement("style");
    style.id = "sbi-wizard-v1-styles";
    style.textContent = `
      .sbi-root.sbi-wiz .sbi-tabs{display:none!important;}
      .sbi-wiz-launcher{border:1px solid rgba(120,180,255,.22);background:linear-gradient(145deg,rgba(120,180,255,.08),rgba(0,0,0,.16));border-radius:14px;padding:12px;display:grid;gap:10px;}
      .sbi-wiz-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;}
      .sbi-wiz-title{font-size:16px;font-weight:900;letter-spacing:.1px;}
      .sbi-wiz-sub{font-size:12px;opacity:.72;margin-top:3px;line-height:1.4;}
      .sbi-wiz-methods{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;}
      .sbi-wiz-method{border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.19);border-radius:12px;padding:13px;text-align:left;color:inherit;cursor:pointer;min-height:92px;}
      .sbi-wiz-method:hover{border-color:rgba(120,180,255,.4);background:rgba(120,180,255,.09);}
      .sbi-wiz-method.active{border-color:rgba(123,216,143,.5);background:rgba(123,216,143,.09);box-shadow:0 0 0 1px rgba(123,216,143,.12);}
      .sbi-wiz-method strong{display:block;font-size:14px;margin-bottom:4px;}
      .sbi-wiz-method span{display:block;font-size:11.5px;opacity:.7;line-height:1.35;}
      .sbi-wiz-icon{font-size:20px;margin-bottom:7px;display:block;}
      .sbi-wiz-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}
      .sbi-wiz-step{border:1px solid rgba(255,255,255,.11);border-radius:9px;padding:6px 8px;font-size:11px;opacity:.55;display:flex;align-items:center;gap:6px;}
      .sbi-wiz-step.on{opacity:1;border-color:rgba(120,180,255,.32);background:rgba(120,180,255,.08);}
      .sbi-wiz-step.done{opacity:1;border-color:rgba(123,216,143,.3);background:rgba(123,216,143,.07);}
      .sbi-wiz-step b{width:19px;height:19px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.16);border-radius:999px;font-size:10px;}
      .sbi-wiz-back{font-size:11px!important;padding:6px 8px!important;}
      .sbi-root.sbi-wiz-landing > .sbi-card:not(.sbi-wiz-launcher),
      .sbi-root.sbi-wiz-landing > .sbi-open5eGrid,
      .sbi-root.sbi-wiz-landing > .sbi-split{display:none!important;}
      .sbi-root.sbi-wiz-paste > .sbi-split,
      .sbi-root.sbi-wiz-json > .sbi-split{display:none!important;}
      .sbi-root.sbi-wiz-image > .sbi-open5eGrid,
      .sbi-root.sbi-wiz-image > .sbi-card:not(.sbi-wiz-launcher){display:none!important;}
      .sbi-root.sbi-wiz-image > .sbi-split{display:grid!important;}
      .sbi-root.sbi-wiz-paste > .sbi-open5eGrid,
      .sbi-root.sbi-wiz-json > .sbi-open5eGrid{display:grid!important;}
      .sbi-root.sbi-wiz-paste > .sbi-card:not(.sbi-wiz-launcher),
      .sbi-root.sbi-wiz-json > .sbi-card:not(.sbi-wiz-launcher){display:block!important;}
      .sbi-wiz-method-note{border:1px solid rgba(255,255,255,.10);border-radius:10px;background:rgba(0,0,0,.17);padding:8px 10px;font-size:12px;line-height:1.4;}
      .sbi-wiz-savebar{position:sticky;bottom:6px;z-index:30;border:1px solid rgba(123,216,143,.32);border-radius:12px;background:rgba(8,14,12,.96);box-shadow:0 12px 38px rgba(0,0,0,.45);padding:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}
      .sbi-wiz-savebar .status{font-size:11px;color:rgba(255,255,255,.72);}
      .sbi-wiz-savebar button{font-weight:850;}
      .sbi-wiz-json-area-hidden,.sbi-wiz-paste-area-hidden{display:none!important;}
      @media(max-width:720px){.sbi-wiz-methods{grid-template-columns:1fr}.sbi-wiz-method{min-height:0}.sbi-wiz-steps{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function root() { return document.querySelector("#generatorPanel .sbi-root"); }

  function clickOriginal(id, after) {
    const el=document.getElementById(id) || document.querySelector(`#generatorPanel #${id}`);
    if(!el)return false;
    el.click();
    if(after)setTimeout(after,50);
    return true;
  }

  function setMode(next, opts={}) {
    mode=next;
    if(next==="paste") {
      clickOriginal("sbi-tab-import",()=>{scheduleDecorate();setTimeout(()=>document.querySelector("#generatorPanel #sbi-import-markdown")?.focus(),40);});
    } else if(next==="json") {
      clickOriginal("sbi-tab-import",()=>{scheduleDecorate();setTimeout(()=>document.querySelector("#generatorPanel #sbi-import-json")?.focus(),40);});
    } else if(next==="image") {
      clickOriginal("sbi-tab-ocr",()=>{scheduleDecorate();if(opts.openFile!==false)setTimeout(()=>document.querySelector("#generatorPanel #sbi-file")?.click(),80);});
    } else {
      scheduleDecorate();
    }
  }

  function buildLauncher(r) {
    if(r.querySelector(".sbi-wiz-launcher"))return;
    const launcher=document.createElement("div");launcher.className="sbi-wiz-launcher";
    const header=r.querySelector(".sbi-header");
    launcher.innerHTML=`
      <div class="sbi-wiz-heading"><div><div class="sbi-wiz-title">Import Monster</div><div class="sbi-wiz-sub">Choose the source. DaggerCraft uses the importer you already have underneath, then lets you review the parsed stat block before it touches Monster Vault.</div></div><button type="button" class="sbi-btn sbi-wiz-back" id="sbiWizBack" style="display:none">← Choose another method</button></div>
      <div class="sbi-wiz-methods">
        <button type="button" class="sbi-wiz-method" data-sbi-wiz="paste"><span class="sbi-wiz-icon">▤</span><strong>Paste Statblock</strong><span>Paste text or Markdown from Homebrewery, GM Binder, D&D Beyond-style text, or another source.</span></button>
        <button type="button" class="sbi-wiz-method" data-sbi-wiz="image"><span class="sbi-wiz-icon">▣</span><strong>Upload Image</strong><span>Choose or paste a statblock screenshot, then use OCR and review uncertain fields.</span></button>
        <button type="button" class="sbi-wiz-method" data-sbi-wiz="json"><span class="sbi-wiz-icon">{ }</span><strong>Import JSON</strong><span>Paste or upload a monster JSON object, array, or compatible export.</span></button>
      </div>
      <div class="sbi-wiz-steps"><div class="sbi-wiz-step on" data-wiz-step="1"><b>1</b> Import</div><div class="sbi-wiz-step" data-wiz-step="2"><b>2</b> Review</div><div class="sbi-wiz-step" data-wiz-step="3"><b>3</b> Save to Vault</div></div>`;
    if(header)header.insertAdjacentElement("afterend",launcher);else r.prepend(launcher);
    launcher.addEventListener("click",e=>{const method=e.target.closest("[data-sbi-wiz]");if(method){setMode(method.dataset.sbiWiz);return;}if(e.target.closest("#sbiWizBack")){mode=null;scheduleDecorate();}});
  }

  function tuneOriginalInputs(r) {
    const importCard=r.querySelector("#sbi-import-json")?.closest(".sbi-card");
    if(importCard){
      const inputRow=importCard.querySelector(".sbi-row");
      const children=inputRow?Array.from(inputRow.children):[];
      const jsonArea=children.find(el=>el.querySelector?.("#sbi-import-json"));
      const pasteArea=children.find(el=>el.querySelector?.("#sbi-import-markdown"));
      jsonArea?.classList.toggle("sbi-wiz-json-area-hidden",mode==="paste");
      pasteArea?.classList.toggle("sbi-wiz-paste-area-hidden",mode==="json");
      const load=r.querySelector("#sbi-import-load");const parse=r.querySelector("#sbi-import-parse-md");
      if(load)load.style.display=mode==="paste"?"none":"";
      if(parse)parse.style.display=mode==="json"?"none":"";
      const title=importCard.querySelector("div[style*='font-weight:900']");
      if(title)title.textContent=mode==="paste"?"Paste a Statblock":mode==="json"?"Import Monster JSON":"Import from JSON or Markdown";
      const hint=importCard.querySelector(".sbi-hint");
      if(hint)hint.textContent=mode==="paste"?"Paste the complete stat block, then click Parse Statblock. Markdown and plain text are both supported.":mode==="json"?"Paste JSON or choose a .json file. It can contain one monster or a collection.":hint.textContent;
      if(parse)parse.textContent="Parse Statblock";
      if(load)load.textContent="Load JSON";
    }

    if(mode==="image"){
      const pasteZone=r.querySelector("#sbi-paste-zone");
      if(pasteZone){pasteZone.querySelector("strong")?.replaceChildren(document.createTextNode("Paste Screenshot"));}
      const file=r.querySelector("#sbi-file");
      if(file){const card=file.closest(".sbi-card");const muted=card?.querySelector(".sbi-muted");if(muted)muted.textContent="Upload image or paste a screenshot:";}
    }
  }

  function reviewReady(r) {
    return !!(r.querySelector("#sbi-add-to-vault") && r.querySelector("#sbi-name"));
  }

  function updateLauncher(r) {
    const launcher=r.querySelector(".sbi-wiz-launcher");if(!launcher)return;
    launcher.querySelectorAll("[data-sbi-wiz]").forEach(btn=>btn.classList.toggle("active",btn.dataset.sbiWiz===mode));
    const back=launcher.querySelector("#sbiWizBack");if(back)back.style.display=mode?"":"none";
    const ready=reviewReady(r);
    const step1=launcher.querySelector('[data-wiz-step="1"]');const step2=launcher.querySelector('[data-wiz-step="2"]');const step3=launcher.querySelector('[data-wiz-step="3"]');
    step1.className=`sbi-wiz-step ${mode?"done":"on"}`;
    step2.className=`sbi-wiz-step ${ready?"done":mode?"on":""}`;
    step3.className=`sbi-wiz-step ${ready?"on":""}`;
  }

  function addMethodNote(r) {
    r.querySelector(".sbi-wiz-method-note")?.remove();
    if(!mode)return;
    const launcher=r.querySelector(".sbi-wiz-launcher");if(!launcher)return;
    const note=document.createElement("div");note.className="sbi-wiz-method-note";
    note.innerHTML=mode==="paste"?`<b>Paste workflow:</b> paste the entire statblock below → <b>Parse Statblock</b> → review fields → <b>Save to Monster Vault</b>.`:mode==="json"?`<b>JSON workflow:</b> paste/upload JSON → <b>Load JSON</b> → choose the monster → <b>Use in Importer</b> → review → save.`:`<b>Image workflow:</b> choose/paste a screenshot → <b>Run OCR + Parse</b> → correct any yellow/red confidence fields → save.`;
    launcher.appendChild(note);
  }

  function addSaveBar(r) {
    r.querySelector(".sbi-wiz-savebar")?.remove();
    if(!reviewReady(r))return;
    const original=r.querySelector("#sbi-add-to-vault");if(!original)return;
    const bar=document.createElement("div");bar.className="sbi-wiz-savebar";bar.innerHTML=`<div class="status"><b>Review complete?</b><br>Saving creates/updates a local homebrew monster in Monster Vault.</div><div style="display:flex;gap:7px;flex-wrap:wrap"><button type="button" class="sbi-btn" id="sbiWizRefresh">Refresh Preview</button><button type="button" class="sbi-btn primary" id="sbiWizSaveVault">Save to Monster Vault</button></div>`;
    const split=r.querySelector(".sbi-split");if(split)split.insertAdjacentElement("afterend",bar);else r.appendChild(bar);
    bar.querySelector("#sbiWizRefresh").addEventListener("click",()=>r.querySelector("#sbi-refresh-preview")?.click());
    bar.querySelector("#sbiWizSaveVault").addEventListener("click",()=>r.querySelector("#sbi-add-to-vault")?.click());
  }

  function applyRootClasses(r) {
    r.classList.add("sbi-wiz");
    ["landing","paste","image","json"].forEach(x=>r.classList.remove(`sbi-wiz-${x}`));
    r.classList.add(`sbi-wiz-${mode||"landing"}`);
  }

  function decorate() {
    const r=root();if(!r)return;
    buildLauncher(r);applyRootClasses(r);tuneOriginalInputs(r);updateLauncher(r);addMethodNote(r);addSaveBar(r);
  }

  function scheduleDecorate(){if(decorateScheduled)return;decorateScheduled=true;requestAnimationFrame(()=>{decorateScheduled=false;const panel=document.getElementById("generatorPanel");observer?.disconnect();decorate();if(panel)observer?.observe(panel,{childList:true,subtree:true});});}
  function watch(){const panel=document.getElementById("generatorPanel");if(!panel)return;observer?.disconnect();observer=new MutationObserver(scheduleDecorate);observer.observe(panel,{childList:true,subtree:true});scheduleDecorate();}

  function init(){injectStyles();watch();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();

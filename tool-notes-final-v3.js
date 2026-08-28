// DaggerCraft Notes final v3
// Adds reusable page templates, breadcrumbs, drag-to-nest, duplicate, and richer slash blocks.
(() => {
  "use strict";
  if (window.__daggerCraftNotesFinalV3) return;
  window.__daggerCraftNotesFinalV3 = true;

  const TEMPLATE_KEY = "daggerCraftNotesTemplatesV1";
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;");
  const uid = () => `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
  const read = () => { try { const v=JSON.parse(localStorage.getItem(TEMPLATE_KEY)||"[]"); return Array.isArray(v)?v:[]; } catch { return []; } };
  let templates = read();
  const saveTemplates = () => { try { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates)); } catch {} };
  const api = () => window.DaggerCraftNotes;

  function injectStyles(){
    if(document.getElementById("dc-notes-final-v3-styles")) return;
    const s=document.createElement("style"); s.id="dc-notes-final-v3-styles"; s.textContent=`
      .dc-note-breadcrumbs{display:flex;align-items:center;gap:5px;flex-wrap:wrap;font-size:.64rem;color:#74869d;margin:0 0 8px}.dc-note-breadcrumbs button{border:0;background:transparent;color:#91a6c2;padding:0;cursor:pointer}.dc-note-breadcrumbs button:hover{color:#dce9fa}.dc-note-breadcrumbs .sep{color:#46566b}
      .dc-note-template-menu{position:fixed;z-index:12060;width:280px;max-height:420px;overflow:auto;display:none;padding:7px;border:1px solid #334052;border-radius:10px;background:#070b11;box-shadow:0 18px 48px rgba(0,0,0,.58)}.dc-note-template-menu.open{display:block}.dc-note-template-menu h4{margin:2px 4px 7px;font-size:.62rem;text-transform:uppercase;letter-spacing:.07em;color:#73869f}.dc-note-template-item{display:flex;align-items:center;gap:5px;padding:4px;border-radius:7px}.dc-note-template-item:hover{background:#0e1620}.dc-note-template-item button:first-child{flex:1;justify-content:flex-start}.dc-note-template-empty{padding:12px;color:#788aa2;font-size:.72rem;text-align:center}.dc-note-template-sep{height:1px;background:#243041;margin:6px 2px}
      .dc-note-row[draggable="true"]{cursor:grab}.dc-note-row.dc-note-drop-target{outline:1px solid #6682a8;background:#142236}.dc-note-row.dc-note-dragging{opacity:.5}
      .dc-notes-editor .dc-note-callout,.dc-dm-note-editor .dc-note-callout{padding:10px 12px;border:1px solid #34445a;border-left:4px solid #657f9f;border-radius:8px;background:#0b121b;margin:10px 0}.dc-notes-editor pre,.dc-dm-note-editor pre{padding:10px;border:1px solid #2d394a;border-radius:7px;background:#04070b;white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.dc-notes-editor table,.dc-dm-note-editor table{width:100%;border-collapse:collapse;margin:10px 0}.dc-notes-editor th,.dc-notes-editor td,.dc-dm-note-editor th,.dc-dm-note-editor td{border:1px solid #344153;padding:5px 7px;text-align:left}.dc-notes-editor th,.dc-dm-note-editor th{background:#101824}.dc-note-checkline{display:flex;gap:7px;align-items:flex-start;margin:4px 0}.dc-note-checkline input{margin-top:5px}
    `; document.head.appendChild(s);
  }

  function ensureTemplateMenu(){
    let m=document.getElementById("dcNoteTemplateMenu");
    if(!m){m=document.createElement("div");m.id="dcNoteTemplateMenu";m.className="dc-note-template-menu";document.body.appendChild(m);}
    return m;
  }
  function closeTemplateMenu(){document.getElementById("dcNoteTemplateMenu")?.classList.remove("open");}
  function page(id){return api()?.getPage?.(id)||null;}
  function allPages(){return api()?.getPages?.()||[];}
  function uniqueTemplateName(base){let name=base||"Untitled Template",n=2;const used=new Set(templates.map(t=>t.name.toLowerCase()));while(used.has(name.toLowerCase()))name=`${base} ${n++}`;return name;}
  function savePageAsTemplate(id){const p=page(id);if(!p)return;const name=prompt("Template name",p.title||"Untitled Template");if(!name?.trim())return;templates.push({id:uid(),name:uniqueTemplateName(name.trim()),html:p.html||"",created:Date.now(),updated:Date.now()});saveTemplates();}
  function updateTemplateFromPage(tid,id){const t=templates.find(x=>x.id===tid),p=page(id);if(!t||!p)return;t.html=p.html||"";t.name=p.title||t.name;t.updated=Date.now();saveTemplates();}
  function createFromTemplate(t,parentId=""){const p=api()?.createPage?.(parentId,t.name||"Untitled Page");if(p)api()?.updatePage?.(p.id,{html:t.html||""});api()?.open?.();return p;}
  function deleteTemplate(id){templates=templates.filter(t=>t.id!==id);saveTemplates();}

  function showTemplateMenu(anchor,parentId=""){
    const m=ensureTemplateMenu(),r=anchor.getBoundingClientRect();
    m.innerHTML=`<h4>Create from Template</h4>${templates.length?templates.map(t=>`<div class="dc-note-template-item"><button class="btn-secondary btn-small" data-tpl-use="${esc(t.id)}">${esc(t.name)}</button><button class="btn-secondary btn-small" data-tpl-del="${esc(t.id)}" title="Delete template">×</button></div>`).join(""):`<div class="dc-note-template-empty">No templates yet. Right-click a page and choose Save as Template.</div>`}`;
    m.style.left=`${Math.max(5,Math.min(r.left,innerWidth-290))}px`;m.style.top=`${Math.min(r.bottom+6,innerHeight-430)}px`;m.classList.add("open");
    m.querySelectorAll("[data-tpl-use]").forEach(b=>b.onclick=()=>{const t=templates.find(x=>x.id===b.dataset.tplUse);if(t)createFromTemplate(t,parentId);closeTemplateMenu();});
    m.querySelectorAll("[data-tpl-del]").forEach(b=>b.onclick=e=>{e.stopPropagation();const t=templates.find(x=>x.id===b.dataset.tplDel);if(t&&confirm(`Delete template “${t.name}”?`)){deleteTemplate(t.id);showTemplateMenu(anchor,parentId);}});
  }

  function selectedId(){return document.querySelector(".dc-note-row.active")?.dataset.noteRow||"";}
  function breadcrumbs(id){const pages=allPages(),map=new Map(pages.map(p=>[p.id,p])),out=[];let cur=map.get(id),guard=0;while(cur&&guard++<50){out.unshift(cur);cur=cur.parentId?map.get(cur.parentId):null;}return out;}
  function patchBreadcrumbs(){
    const id=selectedId(),head=document.querySelector(".dc-notes-editor-head");if(!id||!head||head.querySelector(".dc-note-breadcrumbs"))return;
    const chain=breadcrumbs(id);if(chain.length<2)return;const b=document.createElement("div");b.className="dc-note-breadcrumbs";b.innerHTML=chain.map((p,i)=>`${i?'<span class="sep">›</span>':''}<button data-crumb="${esc(p.id)}">${esc(p.title)}</button>`).join("");head.prepend(b);b.querySelectorAll("[data-crumb]").forEach(x=>x.onclick=()=>{const row=document.querySelector(`[data-note-open="${CSS.escape(x.dataset.crumb)}"]`);if(row)row.click();});
  }

  function patchTopbar(){
    const bar=document.querySelector(".dc-notes-titlebar");if(!bar||bar.querySelector("[data-note-templates]"))return;
    const btn=document.createElement("button");btn.className="btn-secondary btn-small";btn.dataset.noteTemplates="1";btn.textContent="Templates";btn.onclick=e=>{e.stopPropagation();showTemplateMenu(btn,"")};bar.appendChild(btn);
  }

  function descendantsOf(id){const pages=allPages();const out=new Set();const walk=x=>pages.filter(p=>String(p.parentId||"")===String(x)).forEach(p=>{out.add(p.id);walk(p.id)});walk(id);return out;}
  function canReparent(id,parentId){if(!id||id===parentId)return false;return !descendantsOf(id).has(parentId);}
  function bindDrag(){
    document.querySelectorAll(".dc-note-row").forEach(row=>{
      if(row.dataset.dragV3==="1")return;row.dataset.dragV3="1";row.draggable=true;
      row.addEventListener("dragstart",e=>{row.classList.add("dc-note-dragging");e.dataTransfer.setData("text/plain",row.dataset.noteRow);e.dataTransfer.effectAllowed="move";});
      row.addEventListener("dragend",()=>document.querySelectorAll(".dc-note-row").forEach(r=>r.classList.remove("dc-note-dragging","dc-note-drop-target")));
      row.addEventListener("dragover",e=>{const id=e.dataTransfer.getData("text/plain");if(canReparent(id,row.dataset.noteRow)){e.preventDefault();row.classList.add("dc-note-drop-target");}});
      row.addEventListener("dragleave",()=>row.classList.remove("dc-note-drop-target"));
      row.addEventListener("drop",e=>{e.preventDefault();const id=e.dataTransfer.getData("text/plain"),parent=row.dataset.noteRow;row.classList.remove("dc-note-drop-target");if(canReparent(id,parent)){api()?.updatePage?.(id,{parentId:parent});api()?.open?.();}});
    });
    const tree=document.querySelector(".dc-notes-tree");if(tree&&tree.dataset.rootDropV3!=="1"){tree.dataset.rootDropV3="1";tree.addEventListener("dragover",e=>{if(!e.target.closest(".dc-note-row"))e.preventDefault()});tree.addEventListener("drop",e=>{if(e.target.closest(".dc-note-row"))return;e.preventDefault();const id=e.dataTransfer.getData("text/plain");if(id){api()?.updatePage?.(id,{parentId:""});api()?.open?.();}});}
  }

  function patchContext(){
    const ctx=document.getElementById("dcNoteContext");if(!ctx?.classList.contains("open")||ctx.dataset.finalV3==="1")return;ctx.dataset.finalV3="1";
    const label=ctx.querySelector(".dc-note-context-label")?.textContent||"";const id=selectedContextId(ctx,label);if(!id)return;
    const sep=document.createElement("div");sep.className="dc-note-template-sep";ctx.appendChild(sep);
    const tpl=document.createElement("button");tpl.className="btn-secondary btn-small";tpl.textContent="Save as Template";tpl.onclick=e=>{e.stopPropagation();savePageAsTemplate(id);ctx.classList.remove("open")};ctx.appendChild(tpl);
    const dup=document.createElement("button");dup.className="btn-secondary btn-small";dup.textContent="Duplicate Page";dup.onclick=e=>{e.stopPropagation();const p=page(id);if(p){const n=api()?.createPage?.(p.parentId||"",`${p.title} Copy`);if(n)api()?.updatePage?.(n.id,{html:p.html||""});api()?.open?.();}ctx.classList.remove("open")};ctx.appendChild(dup);
    if(templates.length){const from=document.createElement("button");from.className="btn-secondary btn-small";from.textContent="New Subpage from Template";from.onclick=e=>{e.stopPropagation();showTemplateMenu(from,id)};ctx.appendChild(from);}
  }
  function selectedContextId(ctx,label){const rows=[...document.querySelectorAll(".dc-note-row")];const exact=rows.find(r=>r.querySelector(".dc-note-link")?.textContent.trim()===label.trim());return exact?.dataset.noteRow||selectedId();}

  function richerSlash(){
    const menu=document.getElementById("dcNoteSlash");if(!menu?.classList.contains("open")||menu.dataset.finalV3==="1")return;menu.dataset.finalV3="1";
    const editor=document.activeElement?.closest?.(".dc-notes-editor,.dc-dm-note-editor");if(!editor)return;
    const extras=[
      ["check","Checklist","☐ Task list"],
      ["callout","Callout","Highlighted note block"],
      ["table","Table","3 × 3 table"],
      ["code","Code Block","Monospace block"]
    ];
    extras.forEach(([key,label,hint])=>{const b=document.createElement("button");b.className="btn-secondary btn-small";b.innerHTML=`<span class="dc-note-slash-key">/${key}</span><span class="dc-note-slash-hint">${label} · ${hint}</span>`;b.onmousedown=e=>{e.preventDefault();applyExtra(editor,key)};menu.appendChild(b);});
  }
  function activeSlashBlock(editor){const sel=getSelection();if(!sel?.rangeCount)return null;let n=sel.anchorNode;if(n?.nodeType===3)n=n.parentElement;while(n&&n!==editor&&!/^(P|DIV|H1|H2|H3|BLOCKQUOTE|LI)$/.test(n.tagName))n=n.parentElement;return n===editor?null:n;}
  function applyExtra(editor,key){const block=activeSlashBlock(editor);if(!block)return;block.textContent="";if(key==="check")block.outerHTML=`<div class="dc-note-checkline"><input type="checkbox"><span contenteditable="true">Task</span></div><p><br></p>`;else if(key==="callout")block.outerHTML=`<div class="dc-note-callout">Callout</div><p><br></p>`;else if(key==="table")block.outerHTML=`<table><thead><tr><th>Header</th><th>Header</th><th>Header</th></tr></thead><tbody><tr><td>Cell</td><td>Cell</td><td>Cell</td></tr><tr><td>Cell</td><td>Cell</td><td>Cell</td></tr></tbody></table><p><br></p>`;else if(key==="code")block.outerHTML=`<pre>Code</pre><p><br></p>`;document.getElementById("dcNoteSlash")?.classList.remove("open");editor.dispatchEvent(new Event("input",{bubbles:true}));}

  function polish(){patchTopbar();patchBreadcrumbs();bindDrag();patchContext();richerSlash();}
  function init(){injectStyles();ensureTemplateMenu();const obs=new MutationObserver(()=>requestAnimationFrame(polish));obs.observe(document.body,{childList:true,subtree:true});document.addEventListener("click",e=>{if(!e.target.closest("#dcNoteTemplateMenu,[data-note-templates]"))closeTemplateMenu()},true);polish();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
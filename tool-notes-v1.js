// DaggerCraft Notes v1
// Persistent nested note pages with rich editing and a small cross-tool API.
(() => {
  "use strict";
  if (window.__daggerCraftNotesV1) return;
  window.__daggerCraftNotesV1 = true;

  const KEY = "daggerCraftNotesV1";
  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;");
  const uid = () => `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;

  function load(){
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (raw && Array.isArray(raw.pages)) return { pages: raw.pages.map(norm), selectedId: String(raw.selectedId || ""), collapsed: raw.collapsed && typeof raw.collapsed === "object" ? raw.collapsed : {} };
    } catch (_) {}
    return { pages: [], selectedId: "", collapsed: {} };
  }
  function norm(p){ return { id:String(p?.id||uid()), parentId:p?.parentId?String(p.parentId):"", title:String(p?.title||"Untitled Page"), html:String(p?.html||""), created:Number(p?.created||Date.now()), updated:Number(p?.updated||Date.now()) }; }
  let state = load();
  function save(){ try{localStorage.setItem(KEY,JSON.stringify(state));}catch(_){} publish(); }
  function page(id){ return state.pages.find(p=>p.id===String(id)); }
  function children(parentId=""){ return state.pages.filter(p=>String(p.parentId||"")===String(parentId||"")).sort((a,b)=>a.title.localeCompare(b.title)); }
  function descendants(id){ const out=[]; const walk=x=>children(x).forEach(c=>{out.push(c.id);walk(c.id);}); walk(id); return out; }
  function uniqueTitle(base="Untitled Page"){ let t=base,n=2; const used=new Set(state.pages.map(p=>p.title.toLowerCase())); while(used.has(t.toLowerCase())) t=`${base} ${n++}`; return t; }
  function createPage(parentId="",title="Untitled Page"){
    const p=norm({id:uid(),parentId,title:uniqueTitle(title),html:"<p></p>"}); state.pages.push(p); state.selectedId=p.id; if(parentId) state.collapsed[parentId]=false; save(); return p;
  }
  function updatePage(id,patch){ const p=page(id); if(!p)return null; Object.assign(p,patch||{}); p.updated=Date.now(); save(); return p; }
  function deletePage(id){ const ids=new Set([String(id),...descendants(String(id))]); state.pages=state.pages.filter(p=>!ids.has(p.id)); if(ids.has(state.selectedId)) state.selectedId=state.pages[0]?.id||""; save(); }
  function search(q=""){ const s=String(q).trim().toLowerCase(); if(!s)return state.pages.slice().sort((a,b)=>a.title.localeCompare(b.title)); return state.pages.filter(p=>`${p.title} ${stripHtml(p.html)}`.toLowerCase().includes(s)).sort((a,b)=>a.title.localeCompare(b.title)); }
  function stripHtml(s){ const d=document.createElement("div");d.innerHTML=String(s||"");return d.textContent||""; }

  function publish(){
    window.DaggerCraftNotes={
      version:1,
      getPages:()=>state.pages.map(p=>({...p})),
      getPage:(id)=>{const p=page(id);return p?{...p}:null;},
      search:(q)=>search(q).map(p=>({...p})),
      createPage:(parentId,title)=>({...createPage(parentId||"",title||"Untitled Page")}),
      updatePage:(id,patch)=>{const p=updatePage(id,patch);return p?{...p}:null;},
      deletePage:(id)=>deletePage(id),
      open:()=>openNotes()
    };
    window.dispatchEvent(new CustomEvent("daggercraft-notes-updated",{detail:{count:state.pages.length}}));
  }

  function injectStyles(){ if(document.getElementById("dc-notes-v1-styles"))return; const s=document.createElement("style"); s.id="dc-notes-v1-styles"; s.textContent=`
    #sidebarNotesSection .dc-notes-launch{width:100%;justify-content:flex-start;border-radius:8px;padding:7px 9px;font-weight:700}
    .dc-notes-workspace{height:calc(100vh - 118px);min-height:620px;display:grid;grid-template-columns:minmax(240px,300px) minmax(0,1fr);gap:10px}
    .dc-notes-nav,.dc-notes-editor-shell{border:1px solid #273140;border-radius:11px;background:#070b10;min-height:0;overflow:hidden}
    .dc-notes-nav{display:flex;flex-direction:column}.dc-notes-nav-head{padding:10px;border-bottom:1px solid #222b37;background:#0a0f16}.dc-notes-titlebar{display:flex;gap:6px;align-items:center;margin-bottom:8px}.dc-notes-titlebar b{font-size:.8rem;letter-spacing:.06em;text-transform:uppercase;color:#dce6f5;margin-right:auto}
    .dc-notes-nav input,.dc-notes-editor-shell input{background:#04070b!important;color:#e7eef8!important;border:1px solid #2a3544!important;border-radius:7px!important;padding:7px 8px!important}.dc-notes-nav input:focus,.dc-notes-editor-shell input:focus{border-color:#607b9f!important;box-shadow:0 0 0 2px rgba(96,123,159,.13)!important}
    .dc-notes-tree{padding:7px;overflow:auto;flex:1}.dc-note-row{display:flex;align-items:center;gap:4px;min-height:30px;border-radius:6px;padding-right:4px}.dc-note-row:hover{background:#0f1620}.dc-note-row.active{background:#142033}.dc-note-toggle{width:23px;height:23px;border:0;background:transparent;color:#7589a4;cursor:pointer}.dc-note-toggle.blank{visibility:hidden}.dc-note-link{min-width:0;flex:1;border:0;background:transparent;color:#bfcce0;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;padding:5px 3px}.dc-note-row.active .dc-note-link{color:#f0f5ff;font-weight:700}.dc-note-empty{padding:16px;color:#788aa2;font-size:.75rem;text-align:center}
    .dc-notes-editor-shell{display:flex;flex-direction:column}.dc-notes-editor-head{padding:10px 12px;border-bottom:1px solid #222b37;background:#0a0f16}.dc-notes-page-title{width:100%;font-size:1.16rem!important;font-weight:800!important;border-color:transparent!important;background:transparent!important;padding:4px 2px!important}.dc-notes-meta{font-size:.63rem;color:#71839b;margin-top:4px}.dc-notes-toolbar{display:flex;gap:4px;flex-wrap:wrap;padding:7px 10px;border-bottom:1px solid #202936;background:#080d13}.dc-notes-toolbar button{min-width:30px;border-radius:6px}.dc-notes-editor{flex:1;overflow:auto;padding:22px 28px 80px;outline:none;color:#d7e0ec;line-height:1.65;font-size:.91rem}.dc-notes-editor:empty:before{content:"Start writing…";color:#586a83}.dc-notes-editor h1{font-size:1.55rem;color:#f2f6fd}.dc-notes-editor h2{font-size:1.28rem;color:#eef3fb}.dc-notes-editor h3{font-size:1.08rem;color:#e7edf8}.dc-notes-editor blockquote{border-left:3px solid #516984;margin:10px 0;padding:7px 12px;background:#0d141e;color:#b9c8db}.dc-notes-editor hr{border:0;border-top:1px solid #344153;margin:18px 0}.dc-notes-editor a{color:#91b9ee}.dc-notes-editor ul,.dc-notes-editor ol{padding-left:1.6rem}
    .dc-notes-empty-editor{display:grid;place-items:center;height:100%;color:#73849b;text-align:center;padding:30px}.dc-notes-empty-editor strong{display:block;color:#c4d0e2;margin-bottom:6px}
    @media(max-width:900px){.dc-notes-workspace{grid-template-columns:220px minmax(0,1fr)}.dc-notes-editor{padding:18px}}
  `; document.head.appendChild(s); }

  function ensureLauncher(){
    let sec=document.getElementById("sidebarNotesSection"); if(!sec){sec=document.createElement("div");sec.id="sidebarNotesSection";sec.className="sidebar-section";sec.innerHTML=`<div class="sidebar-header"><div><div class="sidebar-title">Notes</div><div class="sidebar-subtitle">Persistent page library</div></div></div><button class="btn-primary dc-notes-launch" type="button">▤ Open Notes</button>`; const dm=document.getElementById("sidebarDmScreenSection"); if(dm?.parentElement)dm.insertAdjacentElement("afterend",sec); else document.querySelector("aside.sidebar")?.appendChild(sec);} sec.querySelector(".dc-notes-launch")?.addEventListener("click",openNotes);
  }

  function mainPanel(){ return document.getElementById("generatorPanel"); }
  function mainLabel(){ return document.getElementById("activeGeneratorLabel"); }
  function openNotes(){ const host=mainPanel(); if(!host)return; if(mainLabel())mainLabel().textContent="Notes"; renderNotes(host); }

  function treeHtml(query=""){
    if(query){ const hits=search(query); return hits.length?hits.map(p=>rowHtml(p,0,false)).join(""):`<div class="dc-note-empty">No matching pages.</div>`; }
    if(!state.pages.length)return`<div class="dc-note-empty">No pages yet. Create your first note.</div>`;
    const walk=(pid,depth)=>children(pid).map(p=>{const kids=children(p.id),collapsed=Boolean(state.collapsed[p.id]);return rowHtml(p,depth,kids.length>0)+(!collapsed?walk(p.id,depth+1):"");}).join("");
    return walk("",0);
  }
  function rowHtml(p,depth,hasKids){ return `<div class="dc-note-row ${p.id===state.selectedId?"active":""}" data-note-row="${esc(p.id)}" style="padding-left:${depth*16}px"><button class="dc-note-toggle ${hasKids?"":"blank"}" data-note-toggle="${esc(p.id)}">${state.collapsed[p.id]?"▸":"▾"}</button><button class="dc-note-link" data-note-open="${esc(p.id)}" title="${esc(p.title)}">${esc(p.title)}</button></div>`; }

  function renderNotes(host){
    const selected=page(state.selectedId); if(!selected&&state.pages.length){state.selectedId=state.pages[0].id;save();}
    const p=page(state.selectedId);
    host.innerHTML=`<div class="dc-notes-workspace"><section class="dc-notes-nav"><div class="dc-notes-nav-head"><div class="dc-notes-titlebar"><b>Pages</b><button class="btn-primary btn-small" data-note-new>＋ Page</button><button class="btn-secondary btn-small" data-note-sub ${p?"":"disabled"}>＋ Subpage</button></div><input data-note-search type="text" placeholder="Search notes…"></div><div class="dc-notes-tree" data-note-tree>${treeHtml()}</div></section><section class="dc-notes-editor-shell" data-note-editor-shell>${p?editorHtml(p):`<div class="dc-notes-empty-editor"><div><strong>No note selected.</strong>Create a page to start your notes library.</div></div>`}</section></div>`;
    bindNotes(host);
  }
  function editorHtml(p){return`<div class="dc-notes-editor-head"><input class="dc-notes-page-title" data-note-title value="${esc(p.title)}"><div class="dc-notes-meta">Autosaved locally · Updated ${new Date(p.updated).toLocaleString()}</div></div><div class="dc-notes-toolbar"><button class="btn-secondary btn-small" data-cmd="formatBlock" data-value="h1" title="Heading 1">H1</button><button class="btn-secondary btn-small" data-cmd="formatBlock" data-value="h2" title="Heading 2">H2</button><button class="btn-secondary btn-small" data-cmd="formatBlock" data-value="h3" title="Heading 3">H3</button><button class="btn-secondary btn-small" data-cmd="bold"><b>B</b></button><button class="btn-secondary btn-small" data-cmd="italic"><i>I</i></button><button class="btn-secondary btn-small" data-cmd="insertUnorderedList">• List</button><button class="btn-secondary btn-small" data-cmd="insertOrderedList">1. List</button><button class="btn-secondary btn-small" data-cmd="formatBlock" data-value="blockquote">Quote</button><button class="btn-secondary btn-small" data-hr>―</button><span style="flex:1"></span><button class="btn-secondary btn-small" data-note-delete>Delete</button></div><div class="dc-notes-editor" data-note-editor contenteditable="true" spellcheck="true">${p.html}</div>`;}

  function bindNotes(host){
    host.querySelector("[data-note-new]")?.addEventListener("click",()=>{createPage();renderNotes(host);});
    host.querySelector("[data-note-sub]")?.addEventListener("click",()=>{if(state.selectedId)createPage(state.selectedId);renderNotes(host);});
    const searchEl=host.querySelector("[data-note-search]"); searchEl?.addEventListener("input",e=>{const tree=host.querySelector("[data-note-tree]");if(tree)tree.innerHTML=treeHtml(e.target.value);bindTree(host);});
    bindTree(host);
    const p=page(state.selectedId); if(!p)return;
    host.querySelector("[data-note-title]")?.addEventListener("input",e=>{p.title=e.target.value||"Untitled Page";p.updated=Date.now();save();refreshTreeOnly(host);});
    host.querySelector("[data-note-editor]")?.addEventListener("input",e=>{p.html=e.currentTarget.innerHTML;p.updated=Date.now();save();});
    host.querySelectorAll("[data-cmd]").forEach(b=>b.addEventListener("mousedown",e=>{e.preventDefault();document.execCommand(b.dataset.cmd,false,b.dataset.value||null);host.querySelector("[data-note-editor]")?.focus();}));
    host.querySelector("[data-hr]")?.addEventListener("mousedown",e=>{e.preventDefault();document.execCommand("insertHorizontalRule");host.querySelector("[data-note-editor]")?.focus();});
    host.querySelector("[data-note-delete]")?.addEventListener("click",()=>{if(confirm(`Delete “${p.title}” and all of its subpages?`)){deletePage(p.id);renderNotes(host);}});
  }
  function bindTree(host){ host.querySelectorAll("[data-note-open]").forEach(b=>b.onclick=()=>{state.selectedId=b.dataset.noteOpen;save();renderNotes(host);}); host.querySelectorAll("[data-note-toggle]").forEach(b=>b.onclick=e=>{e.stopPropagation();state.collapsed[b.dataset.noteToggle]=!state.collapsed[b.dataset.noteToggle];save();refreshTreeOnly(host);}); }
  function refreshTreeOnly(host){const tree=host.querySelector("[data-note-tree]");if(!tree)return;const q=host.querySelector("[data-note-search]")?.value||"";tree.innerHTML=treeHtml(q);bindTree(host);}

  function init(){injectStyles();publish();ensureLauncher(); const obs=new MutationObserver(()=>ensureLauncher()); const aside=document.querySelector("aside.sidebar"); if(aside)obs.observe(aside,{childList:true});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
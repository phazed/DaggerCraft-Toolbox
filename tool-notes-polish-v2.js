// DaggerCraft Notes polish v2
// Slash commands plus right-click page/subpage workflows for the persistent Notes workspace.
(() => {
  "use strict";
  if (window.__daggerCraftNotesPolishV2) return;
  window.__daggerCraftNotesPolishV2 = true;

  const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;");
  const COMMANDS=[
    {key:"h1",label:"Heading 1",hint:"Large section heading",cmd:"formatBlock",value:"h1"},
    {key:"h2",label:"Heading 2",hint:"Medium section heading",cmd:"formatBlock",value:"h2"},
    {key:"h3",label:"Heading 3",hint:"Small section heading",cmd:"formatBlock",value:"h3"},
    {key:"bullet",aliases:["bullets","ul"],label:"Bullet List",hint:"Start a bulleted list",cmd:"insertUnorderedList"},
    {key:"number",aliases:["numbers","ol"],label:"Numbered List",hint:"Start a numbered list",cmd:"insertOrderedList"},
    {key:"quote",label:"Quote",hint:"Indented callout / quotation",cmd:"formatBlock",value:"blockquote"},
    {key:"divider",aliases:["hr","line"],label:"Divider",hint:"Horizontal divider",cmd:"insertHorizontalRule"},
    {key:"text",aliases:["p","paragraph"],label:"Normal Text",hint:"Return to paragraph text",cmd:"formatBlock",value:"p"}
  ];
  let menu=null,activeEditor=null,activeQuery="";

  function inject(){if(document.getElementById("dc-notes-polish-v2-styles"))return;const s=document.createElement("style");s.id="dc-notes-polish-v2-styles";s.textContent=`
    .dc-note-context,.dc-note-slash{position:fixed;z-index:12050;width:230px;padding:6px;border:1px solid #334052;border-radius:9px;background:#070b11;box-shadow:0 18px 45px rgba(0,0,0,.55);display:none}.dc-note-context.open,.dc-note-slash.open{display:grid;gap:3px}.dc-note-context button,.dc-note-slash button{width:100%;justify-content:flex-start;text-align:left;border-radius:6px}.dc-note-slash button{display:grid!important;grid-template-columns:70px 1fr;gap:7px;align-items:center}.dc-note-slash-key{font-weight:800;color:#dbe8f9}.dc-note-slash-hint{font-size:.62rem;color:#7f91aa;font-weight:400}.dc-note-context-label{padding:3px 6px;font-size:.59rem;letter-spacing:.07em;text-transform:uppercase;color:#71849e}.dc-notes-tree{user-select:none}
  `;document.head.appendChild(s);}
  function ensureMenus(){if(!document.getElementById("dcNoteContext")){const d=document.createElement("div");d.id="dcNoteContext";d.className="dc-note-context";document.body.appendChild(d);}if(!document.getElementById("dcNoteSlash")){const d=document.createElement("div");d.id="dcNoteSlash";d.className="dc-note-slash";document.body.appendChild(d);}menu=document.getElementById("dcNoteSlash");}
  function api(){return window.DaggerCraftNotes}
  function pageIdFromRow(row){return row?.dataset.noteRow||row?.querySelector?.("[data-note-open]")?.dataset.noteOpen||""}
  function closeMenus(){document.getElementById("dcNoteContext")?.classList.remove("open");document.getElementById("dcNoteSlash")?.classList.remove("open");}

  function showContext(e,row){const ctx=document.getElementById("dcNoteContext");if(!ctx)return;e.preventDefault();e.stopPropagation();const id=pageIdFromRow(row);const pg=id?api()?.getPage?.(id):null;ctx.innerHTML=id?`<div class="dc-note-context-label">${esc(pg?.title||"Page")}</div><button class="btn-secondary btn-small" data-note-ctx-sub>＋ New Subpage</button><button class="btn-secondary btn-small" data-note-ctx-rename>Rename</button><button class="btn-secondary btn-small" data-note-ctx-delete>Delete Page</button>`:`<div class="dc-note-context-label">Pages</div><button class="btn-secondary btn-small" data-note-ctx-new>＋ New Page</button>`;ctx.style.left=`${Math.max(5,Math.min(e.clientX,innerWidth-240))}px`;ctx.style.top=`${Math.max(5,Math.min(e.clientY,innerHeight-170))}px`;ctx.classList.add("open");
    ctx.querySelector("[data-note-ctx-new]")?.addEventListener("click",()=>{api()?.createPage?.("","Untitled Page");reopenNotes();closeMenus()});
    ctx.querySelector("[data-note-ctx-sub]")?.addEventListener("click",()=>{api()?.createPage?.(id,"Untitled Page");reopenNotes();closeMenus()});
    ctx.querySelector("[data-note-ctx-rename]")?.addEventListener("click",()=>{const name=prompt("Rename page",pg?.title||"");if(name?.trim())api()?.updatePage?.(id,{title:name.trim()});reopenNotes();closeMenus()});
    ctx.querySelector("[data-note-ctx-delete]")?.addEventListener("click",()=>{if(confirm(`Delete “${pg?.title||"this page"}” and its subpages?`))api()?.deletePage?.(id);reopenNotes();closeMenus()});
  }
  function reopenNotes(){setTimeout(()=>api()?.open?.(),0)}

  function currentBlock(editor){const sel=getSelection();if(!sel?.rangeCount)return null;let n=sel.anchorNode;if(!n||!editor.contains(n))return null;if(n.nodeType===3)n=n.parentElement;while(n&&n!==editor&&!/^(P|DIV|H1|H2|H3|BLOCKQUOTE|LI)$/.test(n.tagName))n=n.parentElement;return n===editor?null:n}
  function commandQuery(editor){const block=currentBlock(editor);if(!block)return null;const text=(block.textContent||"").trimStart();if(!text.startsWith("/"))return null;return{text:text.slice(1).toLowerCase(),block};}
  function commandMatches(q){return COMMANDS.filter(c=>!q||c.key.startsWith(q)||(c.aliases||[]).some(a=>a.startsWith(q))).slice(0,8)}
  function caretRect(){const sel=getSelection();if(!sel?.rangeCount)return null;const r=sel.getRangeAt(0).cloneRange();r.collapse(false);let rect=r.getBoundingClientRect();if(!rect.width&&!rect.height){const span=document.createElement("span");span.textContent="\u200b";r.insertNode(span);rect=span.getBoundingClientRect();span.remove();sel.removeAllRanges();sel.addRange(r);}return rect}
  function showSlash(editor,q){ensureMenus();activeEditor=editor;activeQuery=q.text;const hits=commandMatches(q.text);if(!hits.length){menu.classList.remove("open");return}menu.innerHTML=hits.map(c=>`<button class="btn-secondary btn-small" data-slash="${c.key}"><span class="dc-note-slash-key">/${c.key}</span><span class="dc-note-slash-hint">${esc(c.label)} · ${esc(c.hint)}</span></button>`).join("");const rect=caretRect()||editor.getBoundingClientRect();menu.style.left=`${Math.min(rect.left,innerWidth-240)}px`;menu.style.top=`${Math.min(rect.bottom+6,innerHeight-260)}px`;menu.classList.add("open");menu.querySelectorAll("[data-slash]").forEach(b=>b.onmousedown=e=>{e.preventDefault();applyCommand(editor,b.dataset.slash)});}
  function applyCommand(editor,key){const c=COMMANDS.find(x=>x.key===key);const q=commandQuery(editor);if(!c||!q)return;const block=q.block;block.textContent="";const range=document.createRange();range.selectNodeContents(block);range.collapse(true);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);editor.focus();document.execCommand(c.cmd,false,c.value||null);document.getElementById("dcNoteSlash")?.classList.remove("open");editor.dispatchEvent(new Event("input",{bubbles:true}));}
  function bindSlash(editor){if(editor.dataset.slashBound==="1")return;editor.dataset.slashBound="1";editor.addEventListener("input",()=>{const q=commandQuery(editor);if(q)showSlash(editor,q);else document.getElementById("dcNoteSlash")?.classList.remove("open")});editor.addEventListener("keydown",e=>{if(e.key==="Escape")closeMenus();if(e.key==="Enter"){const q=commandQuery(editor);const exact=q&&COMMANDS.find(c=>c.key===q.text||(c.aliases||[]).includes(q.text));if(exact){e.preventDefault();applyCommand(editor,exact.key)}}});}

  function bindAll(){document.querySelectorAll(".dc-notes-editor,.dc-dm-note-editor").forEach(bindSlash);document.querySelectorAll(".dc-notes-tree").forEach(tree=>{if(tree.dataset.ctxBound==="1")return;tree.dataset.ctxBound="1";tree.addEventListener("contextmenu",e=>{const row=e.target.closest(".dc-note-row");showContext(e,row)});});}
  function init(){inject();ensureMenus();const obs=new MutationObserver(()=>requestAnimationFrame(bindAll));obs.observe(document.body,{childList:true,subtree:true});document.addEventListener("click",e=>{if(!e.target.closest(".dc-note-context,.dc-note-slash"))closeMenus()},true);bindAll();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
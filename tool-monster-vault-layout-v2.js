// Monster Vault Statblock Layout v2
// Uses the full workspace and presents expanded monsters like compact reference statblocks.
(() => {
  "use strict";
  if (window.__daggerCraftMonsterVaultLayoutV2) return;
  window.__daggerCraftMonsterVaultLayoutV2 = true;

  function injectStyles() {
    if (document.getElementById("mv-statblock-layout-v2")) return;
    const style = document.createElement("style");
    style.id = "mv-statblock-layout-v2";
    style.textContent = `
      #generatorPanel.monster-vault-panel .mv-layout {
        grid-template-columns: minmax(0, 1fr) !important;
        width: 100% !important;
        min-height: 0 !important;
      }
      #generatorPanel.monster-vault-panel .mv-card,
      #generatorPanel.monster-vault-panel .mv-list,
      #generatorPanel.monster-vault-panel .mv-row-wrap {
        width: 100% !important;
        max-width: none !important;
        box-sizing: border-box !important;
      }
      #generatorPanel.monster-vault-panel .mv-list {
        max-height: min(72vh, 880px) !important;
      }
      #generatorPanel.monster-vault-panel .mv-row {
        align-items: flex-start !important;
        padding: 9px 11px !important;
      }
      #generatorPanel.monster-vault-panel .mv-main { flex: 1 1 420px !important; }
      #generatorPanel.monster-vault-panel .mv-meta,
      #generatorPanel.monster-vault-panel .mv-submeta { max-width: none !important; }
      #generatorPanel.monster-vault-panel .mv-actions {
        flex: 0 1 540px !important;
        gap: 5px !important;
      }
      #generatorPanel.monster-vault-panel .mv-actions .btn {
        padding: 5px 9px !important;
        min-height: 28px !important;
      }
      #generatorPanel.monster-vault-panel .mv-enh-detail-card {
        grid-template-columns: 58px minmax(0, 1fr) !important;
        min-height: 0 !important;
        gap: 9px !important;
        padding: 7px 9px !important;
        margin: 7px 10px 0 !important;
      }
      #generatorPanel.monster-vault-panel .mv-enh-portrait {
        width: 56px !important;
        height: 56px !important;
        border-radius: 8px !important;
        font-size: 1.2rem !important;
      }
      #generatorPanel.monster-vault-panel .mv-enh-notes { line-height: 1.3 !important; }
      #generatorPanel.monster-vault-panel .mv-enh-detail-actions { margin-top: 5px !important; }
      #generatorPanel.monster-vault-panel .mv-details {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 9px 12px !important;
        padding: 10px !important;
      }
      #generatorPanel.monster-vault-panel .mv-details-grid,
      #generatorPanel.monster-vault-panel .mv-ability-table,
      #generatorPanel.monster-vault-panel .mv-detail-lines { grid-column: 1 / -1 !important; }
      #generatorPanel.monster-vault-panel .mv-details-grid {
        display: flex !important;
        flex-wrap: wrap !important;
        align-items: stretch !important;
        gap: 6px !important;
      }
      #generatorPanel.monster-vault-panel .mv-statline {
        flex: 0 0 auto !important;
        min-width: 68px !important;
        width: auto !important;
        padding: 5px 9px !important;
        border-radius: 7px !important;
      }
      #generatorPanel.monster-vault-panel .mv-statline:nth-child(3) { min-width: 128px !important; }
      #generatorPanel.monster-vault-panel .mv-statline b {
        white-space: normal !important;
        line-height: 1.2 !important;
      }
      #generatorPanel.monster-vault-panel .mv-ability-table {
        border-spacing: 5px 4px !important;
        margin: 0 !important;
      }
      #generatorPanel.monster-vault-panel .mv-ability-table td { padding: 6px 4px !important; }
      #generatorPanel.monster-vault-panel .mv-abil-score { font-size: .78rem !important; }
      #generatorPanel.monster-vault-panel .mv-abil-save { font-size: .64rem !important; }
      #generatorPanel.monster-vault-panel .mv-detail-lines {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        gap: 5px !important;
      }
      #generatorPanel.monster-vault-panel .mv-detail-line {
        padding: 5px 7px !important;
        min-height: 0 !important;
      }
      #generatorPanel.monster-vault-panel .mv-detail-section {
        min-width: 0 !important;
        margin: 0 !important;
        border: 1px solid #27354b !important;
        border-radius: 8px !important;
        background: #080e17 !important;
        padding: 8px 10px !important;
      }
      #generatorPanel.monster-vault-panel .mv-detail-heading {
        margin: 0 0 6px !important;
        padding: 0 0 5px !important;
        border-bottom: 1px solid #34445e !important;
        font-size: .70rem !important;
        letter-spacing: .06em !important;
        text-transform: uppercase !important;
      }
      #generatorPanel.monster-vault-panel .mv-feature-list {
        margin: 0 !important;
        padding-left: 18px !important;
      }
      #generatorPanel.monster-vault-panel .mv-feature-list li {
        margin-bottom: 5px !important;
        line-height: 1.42 !important;
      }
      @media (max-width: 1050px) {
        #generatorPanel.monster-vault-panel .mv-details { grid-template-columns: 1fr !important; }
        #generatorPanel.monster-vault-panel .mv-detail-section { grid-column: 1 / -1 !important; }
        #generatorPanel.monster-vault-panel .mv-detail-lines { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
      }
      @media (max-width: 720px) {
        #generatorPanel.monster-vault-panel .mv-detail-lines { grid-template-columns: 1fr !important; }
        #generatorPanel.monster-vault-panel .mv-enh-detail-card { grid-template-columns: 1fr !important; }
        #generatorPanel.monster-vault-panel .mv-actions { flex-basis: 100% !important; justify-content: flex-start !important; }
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectStyles, { once: true });
  else injectStyles();
})();

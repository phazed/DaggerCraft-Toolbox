// Stat Block Importer auto-review bridge
// Advances parsed paste/JSON imports into the existing structured review screen.
(() => {
  "use strict";

  if (window.__daggerCraftImporterAutoReviewV1) return;
  window.__daggerCraftImporterAutoReviewV1 = true;

  let observer = null;
  let scheduled = false;

  function root() {
    return document.querySelector("#generatorPanel .sbi-root");
  }

  function modeOf(r) {
    if (!r) return "";
    if (r.classList.contains("sbi-wiz-paste")) return "paste";
    if (r.classList.contains("sbi-wiz-json")) return "json";
    if (r.classList.contains("sbi-wiz-image")) return "image";
    return "";
  }

  function reviewReady(r) {
    return !!(r?.querySelector("#sbi-add-to-vault") && r.querySelector("#sbi-name"));
  }

  function injectStyles() {
    if (document.getElementById("sbi-auto-review-styles")) return;
    const style = document.createElement("style");
    style.id = "sbi-auto-review-styles";
    style.textContent = `
      .sbi-root.sbi-wiz-paste.sbi-wiz-review > .sbi-split,
      .sbi-root.sbi-wiz-json.sbi-wiz-review > .sbi-split {
        display:grid!important;
      }
      .sbi-root.sbi-wiz-paste.sbi-wiz-review > .sbi-open5eGrid,
      .sbi-root.sbi-wiz-json.sbi-wiz-review > .sbi-open5eGrid,
      .sbi-root.sbi-wiz-paste.sbi-wiz-review > .sbi-card:not(.sbi-wiz-launcher),
      .sbi-root.sbi-wiz-json.sbi-wiz-review > .sbi-card:not(.sbi-wiz-launcher) {
        display:none!important;
      }
    `;
    document.head.appendChild(style);
  }

  function applyReviewState() {
    const r = root();
    if (!r) return;
    r.classList.toggle("sbi-wiz-review", reviewReady(r));
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyReviewState();
    });
  }

  function advanceToReview({ force = false } = {}) {
    const r = root();
    if (!r) return;

    if (reviewReady(r)) {
      applyReviewState();
      return;
    }

    const mode = modeOf(r);
    if (mode !== "paste" && mode !== "json") return;

    const useButton = r.querySelector("#sbi-import-use");
    if (!useButton || useButton.disabled) return;

    const choices = r.querySelectorAll("[data-imp-idx]");
    const canAdvance = force || mode === "paste" || choices.length === 1;
    if (!canAdvance) return;

    useButton.click();
    window.setTimeout(scheduleApply, 20);
  }

  function handleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest("#sbi-import-parse-md")) {
      window.setTimeout(() => advanceToReview({ force: true }), 40);
      return;
    }

    if (target.closest("#sbi-import-load")) {
      window.setTimeout(() => advanceToReview(), 40);
      return;
    }

    if (target.closest("[data-imp-idx]")) {
      window.setTimeout(() => advanceToReview({ force: true }), 40);
      return;
    }

    if (target.closest("#sbi-import-use")) {
      window.setTimeout(scheduleApply, 40);
    }
  }

  function watchPanel() {
    const panel = document.getElementById("generatorPanel");
    if (!panel) return;
    observer?.disconnect();
    observer = new MutationObserver(scheduleApply);
    observer.observe(panel, { childList: true, subtree: true });
    scheduleApply();
  }

  function init() {
    injectStyles();
    watchPanel();
    document.addEventListener("click", handleClick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

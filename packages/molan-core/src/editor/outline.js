  /* --- outline: 大纲与顶栏 --- */
  const OUTLINE_ICON = '<svg class="icon-outline" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16M8 12h12M8 18h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="4" cy="12" r="1.15" fill="currentColor"/><circle cx="4" cy="18" r="1.15" fill="currentColor"/></svg>';
  const OUTLINE_CLOSE_ICON = '<svg class="icon-outline-close" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  let outlineAnimToken = 0;
  let outlineCtx = null;

  function innerVditor(vditor) {
    return vditor?.vditor || vditor || null;
  }

  function vditorOutlineEl() {
    return document.querySelector(".vditor-outline");
  }

  function outlineIsOpen() {
    const el = vditorOutlineEl();
    if (!el) return false;
    return el.style.display === "block" && !el.classList.contains("is-out");
  }

  function applyEditorChromeI18n() {
    applySourceViewI18n();
    const outlineBtn = document.getElementById("outlineBtn");
    if (outlineBtn) {
      const label = t(outlineBtn.classList.contains("is-on") ? "outlineCloseAria" : "outlineAria");
      outlineBtn.title = label;
      outlineBtn.setAttribute("aria-label", label);
    }
  }

  function pinOutlineDock() {
    const dock = document.getElementById("outlinePrefs");
    if (!dock) return;
    const host = document.querySelector(".reader-body")
      || document.querySelector(".molan-inline")
      || document.querySelector(".main");
    const rtl = document.documentElement.getAttribute("dir") === "rtl";
    dock.style.width = "32px";
    dock.style.height = "32px";
    dock.style.margin = "0";
    dock.style.bottom = "auto";
    dock.style.top = "10px";
    dock.style.left = rtl ? "auto" : "10px";
    dock.style.right = rtl ? "10px" : "auto";
    // 挂在纸面里，不要挂到 body：否则 z-index 会压过工作台设置浮层。
    if (host) {
      if (dock.parentElement !== host) host.appendChild(dock);
      dock.style.position = "absolute";
      dock.style.zIndex = "8";
      return;
    }
    if (dock.parentElement !== document.body) document.body.appendChild(dock);
    dock.style.position = "fixed";
    dock.style.zIndex = "40";
  }

  function bindOutlineDockPin() {
    if (bindOutlineDockPin.done) return;
    bindOutlineDockPin.done = true;
    const pin = () => requestAnimationFrame(pinOutlineDock);
    window.addEventListener("resize", pin);
    window.visualViewport?.addEventListener("resize", pin);
    window.visualViewport?.addEventListener("scroll", pin);
    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(pin);
      const host = document.querySelector(".reader-body");
      const main = document.querySelector(".main");
      const wrap = document.getElementById("editorWrap") || document.querySelector(".editor-wrap");
      if (host) ro.observe(host);
      if (main) ro.observe(main);
      if (wrap) ro.observe(wrap);
    }
  }

  let outlineRefreshTimer = 0;

  function scheduleOutlineRefresh() {
    if (!outlineIsOpen()) return;
    clearTimeout(outlineRefreshTimer);
    outlineRefreshTimer = window.setTimeout(() => {
      refreshOutline();
    }, 200);
  }

  async function refreshOutline() {
    if (!outlineIsOpen()) return;
    if (outlineCtx?.getPreviewing?.()) await outlineCtx.hydrateVditor?.();
    const inner = innerVditor(outlineCtx?.getVditor?.());
    relocateVditorOutline();
    try { inner?.outline?.render?.(inner); } catch (_) { /* ignore */ }
  }

  function setOutlineFab(open) {
    const btn = document.getElementById("outlineBtn");
    const dock = document.getElementById("outlinePrefs");
    dock?.classList.toggle("is-open", !!open);
    btn?.classList.toggle("is-on", !!open);
    btn?.setAttribute("aria-expanded", open ? "true" : "false");
    applyEditorChromeI18n();
    pinOutlineDock();
  }

  function relocateVditorOutline() {
    const wrap = document.getElementById("editorWrap") || document.querySelector(".editor-wrap");
    const panel = vditorOutlineEl();
    if (!wrap || !panel) return panel;
    if (panel.parentElement !== wrap) wrap.insertBefore(panel, wrap.firstChild);
    wrap.classList.toggle("is-outline-open", outlineIsOpen());
    return panel;
  }

  function setVditorOutline(show) {
    const inner = innerVditor(outlineCtx?.getVditor?.());
    const panel = inner?.outline?.element || vditorOutlineEl();
    if (!panel) return;
    relocateVditorOutline();
    const wrap = document.getElementById("editorWrap") || document.querySelector(".editor-wrap");
    panel.classList.remove("is-in", "is-out");
    if (show) {
      panel.style.display = "block";
      wrap?.classList.add("is-outline-open");
      try { inner?.outline?.render?.(inner); } catch (_) { /* ignore */ }
      inner?.toolbar?.elements?.outline?.firstElementChild?.classList.add("vditor-menu--current");
    } else {
      panel.style.display = "none";
      wrap?.classList.remove("is-outline-open");
      inner?.toolbar?.elements?.outline?.firstElementChild?.classList.remove("vditor-menu--current");
    }
    setOutlineFab(show);
  }

  function closeOutline(instant) {
    const panel = vditorOutlineEl();
    if (!outlineIsOpen()) {
      setOutlineFab(false);
      return;
    }
    const finish = () => {
      setVditorOutline(false);
    };
    if (instant || prefersReducedMotion() || !panel) {
      outlineAnimToken += 1;
      finish();
      return;
    }
    const token = ++outlineAnimToken;
    panel.classList.remove("is-in");
    panel.classList.add("is-out");
    setOutlineFab(false);
    const done = () => {
      if (token !== outlineAnimToken) return;
      finish();
    };
    panel.addEventListener("animationend", (e) => {
      if (e.target === panel) done();
    }, { once: true });
    window.setTimeout(done, 400);
  }

  async function openOutline() {
    await outlineCtx?.hydrateVditor?.();
    relocateVditorOutline();
    outlineAnimToken += 1;
    const wrap = document.getElementById("editorWrap") || document.querySelector(".editor-wrap");
    const wasOpen = wrap?.classList.contains("is-outline-open");
    const closing = vditorOutlineEl()?.classList.contains("is-out");
    setVditorOutline(true);
    const shown = vditorOutlineEl();
    if (shown && !wasOpen && !closing) {
      shown.classList.remove("is-in");
      void shown.offsetWidth;
      shown.classList.add("is-in");
    } else if (shown) {
      shown.classList.add("is-in");
    }
    pinOutlineDock();
  }

  function ensureEditorChrome(ctx) {
    const actions = document.querySelector(".reader-actions");
    const editorWrap = document.getElementById("editorWrap") || document.querySelector(".editor-wrap");
    const modeBtn = document.getElementById("modeBtn");
    const anchor = actions && modeBtn && modeBtn.parentElement === actions
      ? modeBtn.nextSibling
      : (document.getElementById("typePrefs") || document.getElementById("headerPrefs") || null);

    document.getElementById("editModePrefs")?.remove();

    if (actions) {
      let sourceWrap = document.getElementById("sourceViewPrefs");
      if (!sourceWrap) {
        sourceWrap = document.createElement("div");
        sourceWrap.id = "sourceViewPrefs";
        sourceWrap.className = "molan-chrome-prefs";
        sourceWrap.innerHTML = `
          <button type="button" class="icon-btn" id="sourceViewBtn" aria-pressed="false">${SOURCE_ICON}</button>
        `;
      }
      const copyBtn = document.getElementById("copyBtn");
      const afterCopy = copyBtn && copyBtn.parentElement === actions ? copyBtn.nextSibling : null;
      if (sourceWrap.parentElement !== actions) {
        if (afterCopy) actions.insertBefore(sourceWrap, afterCopy);
        else if (anchor) actions.insertBefore(sourceWrap, anchor);
        else actions.appendChild(sourceWrap);
      }
    }

    {
      let outlineWrap = document.getElementById("outlinePrefs");
      if (!outlineWrap) {
        outlineWrap = document.createElement("div");
        outlineWrap.id = "outlinePrefs";
        outlineWrap.className = "molan-outline-dock";
        outlineWrap.innerHTML = `
          <button type="button" class="molan-outline-fab" id="outlineBtn" aria-haspopup="true" aria-expanded="false">${OUTLINE_ICON}${OUTLINE_CLOSE_ICON}</button>
        `;
      } else {
        outlineWrap.className = "molan-outline-dock";
        if (!outlineWrap.querySelector(".molan-outline-fab") || !outlineWrap.querySelector(".icon-outline-close")) {
          outlineWrap.innerHTML = `
            <button type="button" class="molan-outline-fab" id="outlineBtn" aria-haspopup="true" aria-expanded="false">${OUTLINE_ICON}${OUTLINE_CLOSE_ICON}</button>
          `;
        }
        outlineWrap.querySelector("#outlineMenu")?.remove();
      }
      const paper = document.querySelector(".reader-body")
        || document.querySelector(".molan-inline")
        || document.querySelector(".main")
        || document.body;
      if (outlineWrap.parentElement !== paper) paper.appendChild(outlineWrap);
      bindOutlineDockPin();
      pinOutlineDock();
    }

    outlineCtx = ctx;
    sourceCtx = ctx;
    ensureSourcePanel();
    const sourceBtn = document.getElementById("sourceViewBtn");
    const outlineBtn = document.getElementById("outlineBtn");
    applyEditorChromeI18n();
    if (sourceOpen) fillSourceText();

    if (sourceBtn && !sourceBtn.dataset.bound) {
      sourceBtn.dataset.bound = "1";
      sourceBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleSourceView();
      });
    }

    if (outlineBtn && !outlineBtn.dataset.bound) {
      outlineBtn.dataset.bound = "1";
      outlineBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const panel = vditorOutlineEl();
        if (panel?.classList.contains("is-out")) closeOutline(true);
        if (outlineIsOpen()) closeOutline();
        else openOutline();
      });
    }

    if (editorWrap && !editorWrap.dataset.previewJump) {
      editorWrap.dataset.previewJump = "1";
      editorWrap.addEventListener("click", (e) => {
        const span = e.target.closest(".vditor-outline [data-target-id]");
        if (!span) return;
        const items = [...(span.closest(".vditor-outline")?.querySelectorAll("[data-target-id]") || [])];
        const index = items.indexOf(span);
        if (sourceOpen) {
          e.preventDefault();
          e.stopPropagation();
          scrollSourceToHeading(index, span.textContent);
          return;
        }
        if (!outlineCtx?.getPreviewing?.()) return;
        e.preventDefault();
        e.stopPropagation();
        scrollToHeading(index);
      }, true);
    }

    if (!ensureEditorChrome._bound) {
      ensureEditorChrome._bound = true;
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (sourceOpen) {
          e.preventDefault();
          closeSourceView();
          return;
        }
        closeOutline();
      });
    }
  }

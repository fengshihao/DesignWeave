  /* --- format-bar: 选区格式条与插入表格拾取 --- */
  function hideFormatBar() {
    const bar = document.getElementById("molanFormatBar");
    if (!bar) return;
    bar.hidden = true;
    bar.classList.remove("is-link", "is-below");
    const form = bar.querySelector(".molan-format-bar__link");
    if (form) form.hidden = true;
    const actions = bar.querySelector(".molan-format-bar__actions");
    if (actions) actions.hidden = false;
  }

  function applyFormatBarI18n() {
    const bar = document.getElementById("molanFormatBar");
    if (!bar) return;
    const map = { bold: "formatBold", italic: "formatItalic", link: "formatLink" };
    bar.querySelectorAll("[data-format]").forEach((btn) => {
      const key = map[btn.getAttribute("data-format")];
      if (!key) return;
      const label = t(key);
      btn.title = label;
      btn.setAttribute("aria-label", label);
    });
    const input = bar.querySelector(".molan-format-bar__link input");
    if (input) {
      input.placeholder = t("formatLinkPlaceholder");
      input.setAttribute("aria-label", t("formatLink"));
    }
  }

  function bindFormatBar(vditorRoot, getVditor, isPreviewing) {
    if (!vditorRoot || vditorRoot.dataset.molanFormatBar === "1") return;
    vditorRoot.dataset.molanFormatBar = "1";

    let bar = document.getElementById("molanFormatBar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "molanFormatBar";
      bar.className = "molan-format-bar";
      bar.hidden = true;
      bar.innerHTML = `
        <div class="molan-format-bar__actions">
          <button type="button" data-format="bold"><span>B</span></button>
          <button type="button" data-format="italic"><span>I</span></button>
          <button type="button" data-format="link">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 9.5l3-3M5 8.2l-1.2 1.2a2.2 2.2 0 1 0 3.1 3.1L8.2 11M11 7.8l1.2-1.2a2.2 2.2 0 1 0-3.1-3.1L7.8 5"/></svg>
          </button>
        </div>
        <form class="molan-format-bar__link" hidden novalidate>
          <input type="text" inputmode="url" autocomplete="off" spellcheck="false" />
        </form>
      `;
      document.body.appendChild(bar);
    }
    applyFormatBarI18n();

    let savedRange = null;
    let savedText = "";
    let linkOpen = false;
    let raf = 0;

    const clickToolbar = (type) => {
      const btn = vditorRoot.querySelector(`.vditor-toolbar [data-type="${type}"]`);
      if (!btn) return false;
      btn.click();
      return true;
    };

    const restoreRange = () => {
      if (!savedRange) return false;
      const sel = window.getSelection();
      if (!sel) return false;
      sel.removeAllRanges();
      sel.addRange(savedRange);
      return true;
    };

    const captureRange = () => {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || sel.isCollapsed) return false;
      savedRange = sel.getRangeAt(0).cloneRange();
      savedText = sel.toString();
      return true;
    };

    const positionBar = (range) => {
      let rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        const rects = range.getClientRects();
        if (!rects.length) {
          hideFormatBar();
          return;
        }
        rect = rects[0];
      }
      bar.hidden = false;
      const pad = 8;
      const w = bar.offsetWidth || 120;
      const h = bar.offsetHeight || 40;
      let left = rect.left + rect.width / 2 - w / 2;
      let top = rect.top - h - pad;
      let below = false;
      if (top < pad) {
        top = rect.bottom + pad;
        below = true;
      }
      left = Math.min(Math.max(pad, left), window.innerWidth - w - pad);
      bar.style.left = `${Math.round(left)}px`;
      bar.style.top = `${Math.round(top)}px`;
      bar.classList.toggle("is-below", below);
    };

    const syncButtons = () => {
      bar.querySelectorAll("[data-format]").forEach((btn) => {
        const type = btn.getAttribute("data-format");
        const native = vditorRoot.querySelector(`.vditor-toolbar [data-type="${type}"]`);
        btn.classList.toggle("is-on", !!(native && native.classList.contains("vditor-menu--current")));
      });
    };

    const closeLink = () => {
      linkOpen = false;
      bar.classList.remove("is-link");
      const form = bar.querySelector(".molan-format-bar__link");
      const actions = bar.querySelector(".molan-format-bar__actions");
      if (form) form.hidden = true;
      if (actions) actions.hidden = false;
    };

    const openLink = () => {
      captureRange();
      linkOpen = true;
      bar.classList.add("is-link");
      const form = bar.querySelector(".molan-format-bar__link");
      const actions = bar.querySelector(".molan-format-bar__actions");
      const input = form?.querySelector("input");
      if (actions) actions.hidden = true;
      if (form) form.hidden = false;
      if (input) {
        const node = savedRange?.commonAncestorContainer;
        const el = node?.nodeType === 1 ? node : node?.parentElement;
        const href = el?.closest("a")?.getAttribute("href") || "";
        input.value = href;
        requestAnimationFrame(() => {
          input.focus();
          input.select();
        });
      }
      if (savedRange) positionBar(savedRange);
    };

    const applyLink = (raw) => {
      const href = parseInlineHref(raw);
      const vditor = getVditor?.();
      if (!href || !vditor || !savedText) {
        if (!href) {
          const input = bar.querySelector(".molan-format-bar__link input");
          input?.classList.add("is-invalid");
          input?.focus();
          return false;
        }
        return false;
      }
      restoreRange();
      const md = `[${escapeMdAlt(savedText)}](${href})`;
      try {
        if (typeof vditor.deleteValue === "function") vditor.deleteValue();
        if (typeof vditor.insertMD === "function") vditor.insertMD(md);
        else if (typeof vditor.insertValue === "function") vditor.insertValue(md, true);
      } catch (_) { /* ignore */ }
      closeLink();
      hideFormatBar();
      return true;
    };

    const sync = () => {
      if (isPreviewing?.() || linkOpen) return;
      const vditor = getVditor?.();
      const mode = currentEditorMode(vditor);
      if (mode !== "ir" && mode !== "wysiwyg") {
        hideFormatBar();
        return;
      }
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        hideFormatBar();
        return;
      }
      const text = sel.toString();
      if (!text.replace(/\s+/g, "")) {
        hideFormatBar();
        return;
      }
      const node = sel.anchorNode;
      const el = node?.nodeType === 1 ? node : node?.parentElement;
      if (!el || !vditorRoot.contains(el)) {
        hideFormatBar();
        return;
      }
      if (!el.closest(".vditor-ir, .vditor-wysiwyg")) {
        hideFormatBar();
        return;
      }
      if (el.closest("pre, .vditor-ir__preview, .language-mermaid, .molan-find-bar, .molan-format-bar")) {
        hideFormatBar();
        return;
      }
      savedRange = sel.getRangeAt(0).cloneRange();
      savedText = text;
      positionBar(savedRange);
      syncButtons();
    };

    const scheduleSync = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        sync();
      });
    };

    document.addEventListener("selectionchange", scheduleSync);
    vditorRoot.addEventListener("keyup", scheduleSync);
    vditorRoot.addEventListener("mouseup", scheduleSync);
    window.addEventListener("scroll", () => {
      if (bar.hidden || !savedRange) return;
      try { positionBar(savedRange); } catch (_) { hideFormatBar(); }
    }, true);
    window.addEventListener("resize", () => {
      if (!bar.hidden && savedRange) positionBar(savedRange);
    });

    bar.addEventListener("pointerdown", (e) => {
      if (e.target.closest("input")) return;
      e.preventDefault();
    });
    bar.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-format]");
      if (!btn) return;
      const type = btn.getAttribute("data-format");
      if (type === "link") {
        openLink();
        return;
      }
      restoreRange();
      if (!clickToolbar(type)) {
        const vditor = getVditor?.();
        const marker = type === "bold" ? "**" : "*";
        if (vditor && savedText) {
          try {
            if (typeof vditor.deleteValue === "function") vditor.deleteValue();
            const md = `${marker}${savedText}${marker}`;
            if (typeof vditor.insertMD === "function") vditor.insertMD(md);
            else vditor.insertValue?.(md, true);
          } catch (_) { /* ignore */ }
        }
      }
      requestAnimationFrame(syncButtons);
    });
    bar.querySelector(".molan-format-bar__link")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = bar.querySelector(".molan-format-bar__link input");
      applyLink(input?.value || "");
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || bar.hidden) return;
      if (linkOpen) {
        e.preventDefault();
        closeLink();
        if (savedRange) positionBar(savedRange);
        return;
      }
      hideFormatBar();
    });
  }

  function tableToolbarButtonFromEvent(e, root) {
    for (const node of eventPath(e)) {
      if (!node || node.nodeType !== 1) continue;
      if (node.getAttribute?.("data-type") === "table" && node.closest?.(".vditor-toolbar")) {
        return root.contains(node) ? node : null;
      }
      if (node.classList?.contains("vditor-toolbar__item")) {
        const btn = node.querySelector?.("[data-type='table']");
        if (btn && root.contains(btn)) return btn;
      }
    }
    return null;
  }

  function bindTableInsertPicker(root, getVditor) {
    if (!root || root.dataset.molanTablePicker === "1") return;
    root.dataset.molanTablePicker = "1";
    let openedAt = 0;
    const swallow = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    const togglePicker = (btn) => {
      const picker = document.getElementById("molanTablePicker");
      if (picker && !picker.hidden && picker._anchor === btn) {
        hideTablePicker();
        return;
      }
      openedAt = Date.now();
      showTableSizePicker(btn, getVditor?.());
    };
    const onToolbarTable = (e) => {
      const btn = tableToolbarButtonFromEvent(e, root);
      if (!btn) return;
      swallow(e);
      // pointerdown 已打开时，随后的 click 只拦住 Vditor 默认 3×3，不再开关弹层
      if (e.type !== "pointerdown" && Date.now() - openedAt < 500) return;
      togglePicker(btn);
    };
    root.addEventListener("pointerdown", onToolbarTable, true);
    root.addEventListener("click", onToolbarTable, true);
    root.addEventListener("touchend", onToolbarTable, true);

    const picker = ensureTablePicker();
    picker.addEventListener("click", (e) => {
      const cell = e.target.closest("[data-col]");
      if (!cell) return;
      insertPickedTable(picker._vditor || getVditor?.(), Number(cell.getAttribute("data-row")), Number(cell.getAttribute("data-col")));
    });
    document.addEventListener("pointerdown", (e) => {
      const pickerEl = document.getElementById("molanTablePicker");
      if (!pickerEl || pickerEl.hidden) return;
      if (Date.now() - openedAt < 300) return;
      if (eventPath(e).includes(pickerEl) || pickerEl.contains(e.target)) return;
      if (tableToolbarButtonFromEvent(e, root)) return;
      hideTablePicker();
    }, true);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        hideTablePicker();
        return;
      }
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (e.key !== "m" && e.key !== "M") return;
      if (root.classList.contains("is-preview")) return;
      if (e.target?.closest?.("input, textarea") && !root.contains(e.target)) return;
      const btn = root.querySelector(".vditor-toolbar [data-type='table']");
      if (!btn) return;
      swallow(e);
      togglePicker(btn);
    }, true);
  }

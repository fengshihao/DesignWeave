/**
 * 墨览编辑器核心：Vditor 初始化、Mermaid 主题、流程图工具条与灯箱。
 * 浏览器工作室与 VSCode 扩展共用。
 */
(function (global) {
  const DEFAULT_CDN = "https://cdn.jsdelivr.net/npm/vditor@3.10.9";

  function t(key, vars) {
    if (global.MolanI18n && typeof global.MolanI18n.t === "function") {
      return global.MolanI18n.t(key, vars);
    }
    const fallback = {
      diagramNotReady: "流程图尚未渲染完成",
      copiedDiagramImage: "已复制流程图图片",
      copyImageFallback: "当前环境不支持复制图片，已改为下载",
      copyImageFail: "复制图片失败",
      cannotEdit: "无法进入编辑",
      enteredEdit: "已进入源码编辑，点空白处退出",
      editSource: "编辑源码",
      viewDiagram: "观看流程图",
      copyCode: "复制代码",
      copyImage: "复制图片",
      noMermaidSource: "未找到流程图源码",
      copiedMermaidCode: "已复制流程图代码",
      copyFail: "复制失败",
      find: "查找",
      findPlaceholder: "查找",
      findPrev: "上一个",
      findNext: "下一个",
      findClose: "关闭查找",
      findCase: "区分大小写",
      findNoMatch: "无匹配",
      findMatchCount: "{current}/{total}",
      findAria: "在文档中查找",
      placeholder: "开始编辑 Markdown…",
    };
    let s = fallback[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? "" : String(vars[k])));
    return s;
  }

  function cssVar(name, fallback) {
    try {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function getMermaidOpts() {
    const font = cssVar("--font-ui", '"DM Sans", sans-serif').replace(/"/g, "");
    const themeName = document.documentElement.getAttribute("data-theme") || "night";
    const dark = themeName === "night" || themeName === "hack";
    return {
      startOnLoad: false,
      theme: dark ? "dark" : "base",
      securityLevel: "loose",
      flowchart: { htmlLabels: true, useMaxWidth: true },
      themeVariables: {
        darkMode: dark,
        primaryColor: cssVar("--paper", "#f4efe6"),
        primaryTextColor: cssVar("--ink", "#1c1914"),
        primaryBorderColor: cssVar("--accent", "#d4773b"),
        lineColor: cssVar("--ink-soft", "#6b5e4e"),
        secondaryColor: cssVar("--paper-deep", "#ebe4d6"),
        tertiaryColor: cssVar("--table-bg", "#ffffff"),
        background: cssVar("--paper-lift", "#ffffff"),
        mainBkg: cssVar("--paper", "#f4efe6"),
        nodeBorder: cssVar("--accent", "#d4773b"),
        clusterBkg: cssVar("--paper-deep", "#ebe4d6"),
        titleColor: cssVar("--ink", "#1c1914"),
        edgeLabelBackground: cssVar("--paper-lift", "#faf7f1"),
        fontFamily: font,
      },
      themeCSS: `/* molan-theme:${themeName} */`,
    };
  }

  let toastEl = null;
  let diagramObserver = null;
  let lightboxBound = false;

  function toast(msg) {
    if (!toastEl) toastEl = document.getElementById("toast");
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  function countWords(text) {
    const cn = (String(text).match(/[\u4e00-\u9fff]/g) || []).length;
    const en = (String(text).replace(/[\u4e00-\u9fff]/g, " ").match(/[A-Za-z0-9]+/g) || []).length;
    return cn + en;
  }

  function applyMermaidTheme() {
    if (!global.mermaid || typeof mermaid.initialize !== "function") return false;
    try {
      mermaid.initialize(getMermaidOpts());
      return true;
    } catch (_) {
      return false;
    }
  }

  function patchMermaidInitialize() {
    if (!global.mermaid || mermaid.__molanPatched) return;
    const raw = mermaid.initialize.bind(mermaid);
    mermaid.initialize = (opts = {}) => {
      const next = getMermaidOpts();
      return raw({
        ...opts,
        ...next,
        themeVariables: {
          ...(opts.themeVariables || {}),
          ...next.themeVariables,
        },
      });
    };
    mermaid.__molanPatched = true;
  }

  function patchMermaidLoader() {
    if (patchMermaidLoader.done) return;
    patchMermaidLoader.done = true;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (applyMermaidTheme() || tries > 80) clearInterval(timer);
    }, 250);

    const origAppend = document.head.appendChild.bind(document.head);
    document.head.appendChild = function patchedAppend(node) {
      const el = origAppend(node);
      if (node && node.tagName === "SCRIPT" && /mermaid/i.test(node.src || "")) {
        node.addEventListener("load", () => {
          applyMermaidTheme();
          patchMermaidInitialize();
        });
      }
      return el;
    };
  }

  function preloadMermaid(cdn) {
    if (global.mermaid) {
      applyMermaidTheme();
      patchMermaidInitialize();
      return Promise.resolve();
    }
    if (preloadMermaid._p) return preloadMermaid._p;
    preloadMermaid._p = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = `${cdn}/dist/js/mermaid/mermaid.min.js`;
      s.async = true;
      s.onload = () => {
        applyMermaidTheme();
        patchMermaidInitialize();
        resolve();
      };
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
    return preloadMermaid._p;
  }

  function scheduleMermaidWarmup(cdn) {
    const run = () => { preloadMermaid(cdn); };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 2500 });
    } else {
      setTimeout(run, 700);
    }
  }

  function initLightbox() {
    const lightbox = document.getElementById("lightbox");
    const lightboxStage = document.getElementById("lightboxStage");
    const lightboxCanvas = document.getElementById("lightboxCanvas");
    const lightboxClose = document.getElementById("lightboxClose");
    const lightboxZoomIn = document.getElementById("lightboxZoomIn");
    const lightboxZoomOut = document.getElementById("lightboxZoomOut");
    const lightboxReset = document.getElementById("lightboxReset");
    const lightboxCopyImage = document.getElementById("lightboxCopyImage");
    if (!lightbox || !lightboxStage || !lightboxCanvas) {
      return {
        openFromSvg() { toast(t("diagramNotReady")); },
        close() {},
        isOpen() { return false; },
        copySvgAsPng,
      };
    }

    let lightboxScale = 1;
    let lightboxPanX = 0;
    let lightboxPanY = 0;
    let lightboxDragging = false;
    let lightboxDragOrigin = null;

    function closeLightbox() {
      lightbox.classList.remove("open");
      lightbox.setAttribute("aria-hidden", "true");
      lightboxCanvas.innerHTML = "";
      lightboxScale = 1;
      lightboxPanX = 0;
      lightboxPanY = 0;
      lightboxDragging = false;
      lightboxDragOrigin = null;
      lightboxStage.classList.remove("is-dragging");
      applyLightboxTransform();
    }

    function applyLightboxTransform() {
      lightboxCanvas.style.transform =
        `translate(${lightboxPanX}px, ${lightboxPanY}px) scale(${lightboxScale})`;
    }

    function resetLightboxView() {
      lightboxScale = 1.15;
      lightboxPanX = 0;
      lightboxPanY = 0;
      applyLightboxTransform();
    }

    function openLightboxFromSvg(svg) {
      if (!svg) {
        toast(t("diagramNotReady"));
        return;
      }
      lightboxCanvas.innerHTML = "";
      const clone = svg.cloneNode(true);
      clone.removeAttribute("style");
      clone.style.maxWidth = "none";
      clone.style.width = clone.getAttribute("width") || "auto";
      clone.style.height = "auto";
      lightboxCanvas.appendChild(clone);
      resetLightboxView();
      lightbox.classList.add("open");
      lightbox.setAttribute("aria-hidden", "false");
    }

    if (!lightboxBound) {
      lightboxBound = true;
      lightboxClose?.addEventListener("click", closeLightbox);
      lightbox.addEventListener("click", (e) => {
        if (e.target === lightbox) closeLightbox();
      });
      lightboxZoomIn?.addEventListener("click", () => {
        lightboxScale = Math.min(lightboxScale + 0.25, 5);
        applyLightboxTransform();
      });
      lightboxZoomOut?.addEventListener("click", () => {
        lightboxScale = Math.max(lightboxScale - 0.25, 0.35);
        applyLightboxTransform();
      });
      lightboxReset?.addEventListener("click", resetLightboxView);
      lightboxCopyImage?.addEventListener("click", () => {
        copySvgAsPng(lightboxCanvas.querySelector("svg"));
      });

      lightboxStage.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        lightboxDragging = true;
        lightboxDragOrigin = {
          x: e.clientX,
          y: e.clientY,
          panX: lightboxPanX,
          panY: lightboxPanY,
        };
        lightboxStage.classList.add("is-dragging");
        lightboxStage.setPointerCapture?.(e.pointerId);
      });
      lightboxStage.addEventListener("pointermove", (e) => {
        if (!lightboxDragging || !lightboxDragOrigin) return;
        lightboxPanX = lightboxDragOrigin.panX + (e.clientX - lightboxDragOrigin.x);
        lightboxPanY = lightboxDragOrigin.panY + (e.clientY - lightboxDragOrigin.y);
        applyLightboxTransform();
      });
      const endLightboxDrag = (e) => {
        if (!lightboxDragging) return;
        lightboxDragging = false;
        lightboxDragOrigin = null;
        lightboxStage.classList.remove("is-dragging");
        try { lightboxStage.releasePointerCapture?.(e.pointerId); } catch (_) { /* ignore */ }
      };
      lightboxStage.addEventListener("pointerup", endLightboxDrag);
      lightboxStage.addEventListener("pointercancel", endLightboxDrag);
      lightboxStage.addEventListener("wheel", (e) => {
        if (!lightbox.classList.contains("open")) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.12 : 0.12;
        const next = Math.min(5, Math.max(0.35, lightboxScale + delta));
        const rect = lightboxStage.getBoundingClientRect();
        const cx = e.clientX - rect.left - rect.width / 2;
        const cy = e.clientY - rect.top - rect.height / 2;
        const ratio = next / lightboxScale;
        lightboxPanX = cx - (cx - lightboxPanX) * ratio;
        lightboxPanY = cy - (cy - lightboxPanY) * ratio;
        lightboxScale = next;
        applyLightboxTransform();
      }, { passive: false });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && lightbox.classList.contains("open")) {
          e.preventDefault();
          closeLightbox();
        }
      });
    }

    return {
      openFromSvg: openLightboxFromSvg,
      close: closeLightbox,
      isOpen: () => lightbox.classList.contains("open"),
      copySvgAsPng,
    };
  }

  async function copySvgAsPng(svg) {
    if (!svg) {
      toast(t("diagramNotReady"));
      return;
    }
    const xml = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = url;
      });
      const scale = 2;
      const canvas = document.createElement("canvas");
      const w = img.naturalWidth || svg.viewBox?.baseVal?.width || svg.clientWidth || 800;
      const h = img.naturalHeight || svg.viewBox?.baseVal?.height || svg.clientHeight || 600;
      canvas.width = Math.max(1, Math.floor(w * scale));
      canvas.height = Math.max(1, Math.floor(h * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("toBlob failed");
      if (navigator.clipboard && global.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast(t("copiedDiagramImage"));
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "diagram.png";
        a.click();
        toast(t("copyImageFallback"));
      }
    } catch (err) {
      console.warn(err);
      toast(t("copyImageFail"));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function getMermaidSourceNear(previewEl) {
    const node = previewEl?.closest?.(".vditor-ir__node");
    const marker = node?.querySelector?.(".vditor-ir__marker--pre code.language-mermaid");
    if (marker?.textContent?.trim()) return marker.textContent.trim();
    const host = previewEl?.querySelector?.(".language-mermaid") || previewEl;
    const saved = host?.getAttribute?.("data-molan-source");
    if (saved) return saved;
    const code = previewEl?.querySelector?.("code.language-mermaid, .language-mermaid");
    if (!code) return "";
    if (code.getAttribute?.("data-processed")) return "";
    return (code.textContent || "").trim();
  }

  let mermaidRenderSeq = 0;
  let mermaidRefreshing = false;
  let mermaidRefreshQueued = null;

  function renderMermaidSvg(source) {
    const id = "molan-mmd-" + (++mermaidRenderSeq);
    const api = global.mermaid;
    if (!api || typeof api.render !== "function") {
      return Promise.reject(new Error("mermaid.render 不可用"));
    }
    try {
      const out = api.render(id, source);
      if (out && typeof out.then === "function") {
        return out.then((result) => (typeof result === "string" ? result : result.svg));
      }
      if (typeof out === "string") return Promise.resolve(out);
      if (out && out.svg) return Promise.resolve(out.svg);
    } catch (_) { /* mermaid 9 走回调 */ }
    return new Promise((resolve, reject) => {
      try {
        api.render(id, source, (svg) => resolve(svg));
      } catch (err) {
        reject(err);
      }
    });
  }

  async function refreshMermaidDiagrams(root = document) {
    if (mermaidRefreshing) {
      mermaidRefreshQueued = root;
      return;
    }
    mermaidRefreshing = true;
    try {
      if (typeof mermaid.mermaidAPI?.reset === "function") {
        try { mermaid.mermaidAPI.reset(); } catch (_) { /* ignore */ }
      }
      applyMermaidTheme();
      const hosts = Array.from(root.querySelectorAll(".language-mermaid"))
        .filter((el) => el.querySelector("svg"));
      for (const host of hosts) {
        const preview = host.closest(".vditor-ir__preview") || host;
        const source = getMermaidSourceNear(preview) || host.getAttribute("data-molan-source") || "";
        if (!source) continue;
        host.setAttribute("data-molan-source", source);
        try {
          const svg = await renderMermaidSvg(source);
          const wrap = document.createElement("div");
          wrap.innerHTML = svg;
          const next = wrap.querySelector("svg");
          const old = host.querySelector("svg");
          if (next && old) old.replaceWith(next);
          else if (next) host.insertBefore(next, host.firstChild);
        } catch (err) {
          console.warn(err);
        }
      }
      enhanceMermaidPreviews(root);
    } finally {
      mermaidRefreshing = false;
      if (mermaidRefreshQueued) {
        const nextRoot = mermaidRefreshQueued;
        mermaidRefreshQueued = null;
        refreshMermaidDiagrams(nextRoot);
      }
    }
  }

  function findMermaidPreviewShell(fromEl) {
    if (!fromEl || !fromEl.closest) return null;
    const preview = fromEl.closest(".vditor-ir__preview");
    if (preview && preview.querySelector(".language-mermaid")) return preview;
    const lang = fromEl.closest(".language-mermaid");
    if (lang) return lang.closest("pre") || lang;
    return null;
  }

  function enterMermaidEdit(shell) {
    const node = shell?.closest?.(".vditor-ir__node");
    const code = node?.querySelector?.(".vditor-ir__marker--pre code.language-mermaid");
    const editable = document.querySelector(".vditor-ir pre.vditor-reset");
    if (!code || !editable) {
      toast(t("cannotEdit"));
      return;
    }
    try {
      editable.focus();
      const range = document.createRange();
      const textNode = code.firstChild || code;
      if (textNode.nodeType === Node.TEXT_NODE) {
        range.setStart(textNode, 0);
        range.collapse(true);
      } else {
        range.selectNodeContents(code);
        range.collapse(true);
      }
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      node.classList.add("vditor-ir__node--expand");
      node.classList.remove("vditor-ir__node--hidden");
      toast(t("enteredEdit"));
    } catch (err) {
      console.warn(err);
      toast(t("cannotEdit"));
    }
  }

  function enhanceMermaidPreviews(root = document) {
    const codes = root.querySelectorAll(".language-mermaid");
    codes.forEach((code) => {
      const shell = code.closest(".vditor-ir__preview") || code.closest("pre") || code;
      const source = getMermaidSourceNear(shell);
      if (source) code.setAttribute("data-molan-source", source);
      if (!shell || shell.querySelector(":scope > .molan-diagram-toolbar")) return;
      if (!shell.querySelector("svg")) return;
      if (getComputedStyle(shell).position === "static") shell.style.position = "relative";
      shell.classList.add("molan-mermaid-shell");
      const bar = document.createElement("div");
      bar.className = "molan-diagram-toolbar";
      bar.innerHTML = `
        <button type="button" class="icon-btn" data-molan-action="edit" title="${t("editSource")}" aria-label="${t("editSource")}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
        </button>
        <button type="button" class="icon-btn" data-molan-action="zoom" title="${t("viewDiagram")}" aria-label="${t("viewDiagram")}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H5a2 2 0 0 0-2 2v4"/><path d="M15 3h4a2 2 0 0 1 2 2v4"/><path d="M9 21H5a2 2 0 0 1-2-2v-4"/><path d="M15 21h4a2 2 0 0 0 2-2v-4"/></svg>
        </button>
        <button type="button" class="icon-btn" data-molan-action="copy-code" title="${t("copyCode")}" aria-label="${t("copyCode")}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2"/><rect x="4" y="8" width="12" height="12" rx="2"/></svg>
        </button>
        <button type="button" class="icon-btn" data-molan-action="copy-image" title="${t("copyImage")}" aria-label="${t("copyImage")}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M3 16l5-4 4 3 3-2 6 5"/></svg>
        </button>
      `;
      shell.appendChild(bar);
    });
  }

  function contentBoxWidth(el) {
    if (!el) return 0;
    const cs = getComputedStyle(el);
    return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  }

  function naturalTableMetrics(table) {
    const source = table.closest(".vditor-reset");
    const probe = document.createElement("div");
    probe.className = source?.className || "vditor-reset";
    const clone = table.cloneNode(true);
    clone.classList.remove("molan-table--wide");
    clone.setAttribute("aria-hidden", "true");
    Object.assign(probe.style, {
      position: "fixed",
      visibility: "hidden",
      pointerEvents: "none",
      left: "-100000px",
      top: "0",
    });
    Object.assign(clone.style, { width: "max-content", maxWidth: "none" });
    probe.appendChild(clone);
    document.body.appendChild(probe);
    const columns = [];
    Array.from(clone.rows).forEach((row) => {
      Array.from(row.cells).forEach((cell, index) => {
        const tokens = (cell.textContent || "").match(/[A-Za-z0-9_./\\:$@#%-]+/g) || [];
        const longestToken = tokens.reduce((length, token) => Math.max(length, token.length), 0);
        const preferredMin = cell.querySelector("code") || longestToken >= 18
          ? 168
          : longestToken >= 12
            ? 144
            : 0;
        const current = columns[index] || { natural: 0, preferredMin: 0 };
        columns[index] = {
          natural: Math.max(current.natural, cell.getBoundingClientRect().width),
          preferredMin: Math.max(current.preferredMin, preferredMin),
        };
      });
    });
    const metrics = { width: clone.getBoundingClientRect().width, columns };
    probe.remove();
    return metrics;
  }

  function distributeColumnWidths(naturalColumns, availableWidth) {
    const count = naturalColumns.length;
    if (!count) return [];
    const hardMin = Math.max(64, Math.min(96, availableWidth / count * 0.6));
    const defaultMin = Math.max(80, Math.min(112, availableWidth / count * 0.72));
    let minimums = naturalColumns.map((column) =>
      Math.max(defaultMin, Math.min(column.preferredMin || 0, availableWidth * 0.42)));
    const minimumTotal = minimums.reduce((total, width) => total + width, 0);
    if (minimumTotal > availableWidth) {
      const extraRoom = Math.max(0, availableWidth - hardMin * count);
      const requestedExtra = minimums.map((width) => Math.max(0, width - hardMin));
      const requestedTotal = requestedExtra.reduce((total, width) => total + width, 0);
      minimums = requestedExtra.map((extra) =>
        hardMin + (requestedTotal ? extraRoom * extra / requestedTotal : extraRoom / count));
    }
    const max = Math.max(...minimums, availableWidth * 0.52);
    const ideal = naturalColumns.map((column, index) =>
      Math.max(minimums[index], Math.min(max, column.natural)));
    const idealExtra = ideal.map((width, index) => width - minimums[index]);
    const extraTotal = idealExtra.reduce((total, width) => total + width, 0);
    const remaining = Math.max(0, availableWidth - minimums.reduce((total, width) => total + width, 0));
    if (!extraTotal) return minimums.map((width) => width + remaining / count);
    return idealExtra.map((extra, index) => minimums[index] + remaining * extra / extraTotal);
  }

  function clearMolanTableLayout(root) {
    root?.querySelectorAll(".molan-table--wide").forEach((table) => {
      table.classList.remove("molan-table--wide");
      for (let index = 1; index <= 12; index += 1) {
        table.style.removeProperty(`--molan-col-${index}`);
      }
    });
  }

  function fitMolanTables(root) {
    if (!root) return;
    root.querySelectorAll(".vditor-reset table").forEach((table) => {
      const host = table.closest(".vditor-reset") || table.parentElement;
      const cap = contentBoxWidth(host);
      if (cap <= 0) return;
      const metrics = naturalTableMetrics(table);
      const isWide = metrics.width > cap + 2;
      table.classList.toggle("molan-table--wide", isWide);
      if (!isWide) return;
      distributeColumnWidths(metrics.columns.slice(0, 12), cap).forEach((width, index) => {
        table.style.setProperty(`--molan-col-${index + 1}`, `${width}px`);
      });
    });
  }

  function scheduleFitTables(root) {
    if (!root) return;
    cancelAnimationFrame(scheduleFitTables._raf);
    scheduleFitTables._raf = requestAnimationFrame(() => fitMolanTables(root));
  }

  function watchTables(root) {
    if (!root) return;
    scheduleFitTables(root);
    if (watchTables._obs) return;
    watchTables._obs = new ResizeObserver(() => scheduleFitTables(root));
    watchTables._obs.observe(root);
    const reset = root.querySelector(".vditor-reset");
    if (reset) watchTables._obs.observe(reset);
  }

  function watchMermaidPreviews(rootId = "vditor") {
    const root = document.getElementById(rootId);
    if (!root) return;
    enhanceMermaidPreviews(root);
    if (diagramObserver) return;
    let raf = 0;
    diagramObserver = new MutationObserver((mutations) => {
      let added = false;
      for (const m of mutations) {
        if (m.addedNodes.length) {
          added = true;
          break;
        }
      }
      if (!added) return;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        clearTimeout(watchMermaidPreviews._t);
        watchMermaidPreviews._t = setTimeout(() => {
          enhanceMermaidPreviews(root);
          scheduleFitTables(root);
        }, 120);
      });
    });
    diagramObserver.observe(root, { childList: true, subtree: true });
  }

  function bindMermaidInteractions(vditorRoot, getVditor, lightbox) {
    const blockMermaidPreviewExpand = (e) => {
      if (e.target.closest("[data-molan-action]")) return;
      const shell = findMermaidPreviewShell(e.target);
      if (!shell) return;
      if (shell.closest(".vditor-ir__node--expand")) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "click" || e.type === "pointerup") {
        lightbox.openFromSvg(shell.querySelector("svg"));
      }
    };
    vditorRoot.addEventListener("mousedown", blockMermaidPreviewExpand, true);
    vditorRoot.addEventListener("pointerdown", blockMermaidPreviewExpand, true);
    vditorRoot.addEventListener("click", blockMermaidPreviewExpand, true);

    vditorRoot.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-molan-action]");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const action = btn.getAttribute("data-molan-action");
      const shell = btn.closest(".vditor-ir__preview, pre, .language-mermaid");
      const svg = shell?.querySelector("svg");
      if (action === "edit") {
        enterMermaidEdit(shell);
        return;
      }
      if (action === "zoom") {
        lightbox.openFromSvg(svg);
        return;
      }
      if (action === "copy-image") {
        await copySvgAsPng(svg);
        return;
      }
      if (action === "copy-code") {
        let text = getMermaidSourceNear(shell);
        const vditor = getVditor();
        if (!text && vditor) {
          const m = vditor.getValue().match(/```mermaid\s*([\s\S]*?)```/i);
          text = m ? m[1].trim() : "";
        }
        if (!text) {
          toast(t("noMermaidSource"));
          return;
        }
        try {
          await navigator.clipboard.writeText(text);
          toast(t("copiedMermaidCode"));
        } catch {
          toast(t("copyFail"));
        }
      }
    }, true);
  }

  function refreshI18n(root = document) {
    const actionKeys = {
      edit: "editSource",
      zoom: "viewDiagram",
      "copy-code": "copyCode",
      "copy-image": "copyImage",
    };
    root.querySelectorAll("[data-molan-action]").forEach((btn) => {
      const key = actionKeys[btn.getAttribute("data-molan-action")];
      if (!key) return;
      const label = t(key);
      btn.title = label;
      btn.setAttribute("aria-label", label);
    });
    applyFindI18n();
  }

  const findState = {
    open: false,
    query: "",
    caseSensitive: false,
    matches: [],
    index: 0,
    composing: false,
    refreshTimer: 0,
    observer: null,
  };

  function hasHighlightApi() {
    return typeof global.Highlight === "function" && global.CSS && CSS.highlights;
  }

  function getSearchRoot() {
    const wrap = document.getElementById("editorWrap");
    if (wrap && !wrap.classList.contains("visible")) return null;
    const previewBtn = document.querySelector('.vditor-toolbar [data-type="preview"]');
    const previewOn = previewBtn?.classList.contains("vditor-menu--current");
    if (previewOn) {
      return document.querySelector(".vditor-preview") || document.getElementById("vditor");
    }
    return document.querySelector(".vditor-ir")
      || document.querySelector(".vditor-wysiwyg")
      || document.querySelector(".vditor-sv")
      || document.getElementById("vditor");
  }

  function shouldSkipFindNode(el) {
    while (el && el.nodeType === 1) {
      const tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return true;
      if (el.classList.contains("molan-diagram-toolbar")) return true;
      if (el.classList.contains("molan-find-bar")) return true;
      if (el.classList.contains("vditor-ir__marker")) {
        const node = el.closest(".vditor-ir__node");
        if (!node || !node.classList.contains("vditor-ir__node--expand")) return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  function collectFindTextNodes(root) {
    if (!root) return [];
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
        if (shouldSkipFindNode(node.parentElement)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let current = walker.nextNode();
    while (current) {
      nodes.push(current);
      current = walker.nextNode();
    }
    return nodes;
  }

  function buildFindRanges(nodes, query, caseSensitive) {
    if (!query || !nodes.length) return [];
    const parts = nodes.map((node) => node.nodeValue || "");
    const hay = caseSensitive ? parts.join("") : parts.join("").toLowerCase();
    const needle = caseSensitive ? query : query.toLowerCase();
    const starts = [];
    let acc = 0;
    for (let i = 0; i < parts.length; i += 1) {
      starts.push(acc);
      acc += parts[i].length;
    }
    const posAt = (index) => {
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= index) lo = mid;
        else hi = mid - 1;
      }
      return { node: nodes[lo], offset: index - starts[lo] };
    };
    const ranges = [];
    let from = 0;
    while (from <= hay.length - needle.length) {
      const at = hay.indexOf(needle, from);
      if (at < 0) break;
      const start = posAt(at);
      const end = posAt(at + needle.length - 1);
      try {
        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset + 1);
        ranges.push(range);
      } catch (_) { /* DOM 在搜索中途变了 */ }
      from = at + needle.length;
    }
    return ranges;
  }

  function clearFindHighlights() {
    try {
      CSS.highlights?.delete("molan-find");
      CSS.highlights?.delete("molan-find-current");
    } catch (_) { /* ignore */ }
  }

  function paintFindMatches() {
    const { matches, index } = findState;
    clearFindHighlights();
    if (!matches.length) return;
    if (hasHighlightApi()) {
      const rest = new Highlight();
      const current = new Highlight();
      matches.forEach((range, i) => {
        if (i === index) current.add(range);
        else rest.add(range);
      });
      CSS.highlights.set("molan-find", rest);
      CSS.highlights.set("molan-find-current", current);
      return;
    }
    try {
      const sel = global.getSelection();
      sel.removeAllRanges();
      sel.addRange(matches[index]);
    } catch (_) { /* ignore */ }
  }

  function scrollMatchIntoView(range) {
    if (!range) return;
    let el = range.startContainer;
    if (el.nodeType !== 1) el = el.parentElement;
    let scroller = el;
    while (scroller && scroller !== document.body) {
      const style = getComputedStyle(scroller);
      const oy = style.overflowY;
      if ((oy === "auto" || oy === "scroll" || oy === "overlay") && scroller.scrollHeight > scroller.clientHeight + 4) {
        break;
      }
      scroller = scroller.parentElement;
    }
    if (!scroller || scroller === document.body) {
      scroller = document.querySelector(".vditor-ir")
        || document.querySelector(".vditor-preview")
        || document.querySelector(".vditor-content");
    }
    if (!scroller) {
      try { range.startContainer.parentElement?.scrollIntoView({ block: "center" }); } catch (_) { /* ignore */ }
      return;
    }
    const rect = range.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    if (rect.top < box.top + 48 || rect.bottom > box.bottom - 48) {
      scroller.scrollTo({
        top: scroller.scrollTop + (rect.top - box.top) - box.height * 0.28,
        behavior: "smooth",
      });
    }
  }

  function updateFindCount() {
    const countEl = document.getElementById("molanFindCount");
    const input = document.getElementById("molanFindInput");
    if (!countEl) return;
    const total = findState.matches.length;
    if (!findState.query) {
      countEl.textContent = "";
      input?.classList.remove("is-empty");
      return;
    }
    if (!total) {
      countEl.textContent = t("findNoMatch");
      input?.classList.add("is-empty");
      return;
    }
    countEl.textContent = t("findMatchCount", { current: findState.index + 1, total });
    input?.classList.remove("is-empty");
  }

  function runFind({ keepIndex = false, reveal = true } = {}) {
    const input = document.getElementById("molanFindInput");
    const query = (input?.value || "").trim();
    findState.query = query;
    const prevIndex = findState.index;
    findState.matches = query
      ? buildFindRanges(collectFindTextNodes(getSearchRoot()), query, findState.caseSensitive)
      : [];
    if (!findState.matches.length) {
      findState.index = 0;
    } else if (keepIndex) {
      findState.index = Math.min(prevIndex, findState.matches.length - 1);
    } else {
      findState.index = 0;
    }
    paintFindMatches();
    updateFindCount();
    if (reveal && findState.matches[findState.index]) {
      scrollMatchIntoView(findState.matches[findState.index]);
    }
  }

  function moveFind(delta) {
    if (!findState.open) {
      openFind();
      return;
    }
    if (!findState.matches.length) {
      runFind({ reveal: true });
      return;
    }
    const total = findState.matches.length;
    findState.index = (findState.index + delta + total) % total;
    paintFindMatches();
    updateFindCount();
    scrollMatchIntoView(findState.matches[findState.index]);
  }

  function selectedTextForFind() {
    const sel = global.getSelection();
    if (!sel || sel.isCollapsed) return "";
    const text = String(sel).replace(/\s+/g, " ").trim();
    if (!text || text.length > 180) return "";
    return text;
  }

  function applyFindI18n() {
    const input = document.getElementById("molanFindInput");
    const prev = document.getElementById("molanFindPrev");
    const next = document.getElementById("molanFindNext");
    const close = document.getElementById("molanFindClose");
    const caseBtn = document.getElementById("molanFindCase");
    const bar = document.getElementById("molanFindBar");
    const btn = document.getElementById("molanFindBtn");
    if (input) {
      input.placeholder = t("findPlaceholder");
      input.setAttribute("aria-label", t("findAria"));
    }
    if (bar) bar.setAttribute("aria-label", t("findAria"));
    if (prev) {
      prev.title = t("findPrev");
      prev.setAttribute("aria-label", t("findPrev"));
    }
    if (next) {
      next.title = t("findNext");
      next.setAttribute("aria-label", t("findNext"));
    }
    if (close) {
      close.title = t("findClose");
      close.setAttribute("aria-label", t("findClose"));
    }
    if (caseBtn) {
      caseBtn.title = t("findCase");
      caseBtn.setAttribute("aria-label", t("findCase"));
    }
    if (btn) {
      btn.textContent = t("find");
      btn.title = t("findAria");
      btn.setAttribute("aria-label", t("findAria"));
    }
    updateFindCount();
  }

  function ensureFindButton() {
    const actions = document.querySelector(".reader-actions");
    if (!actions || document.getElementById("molanFindBtn")) return;
    const btn = document.createElement("button");
    btn.id = "molanFindBtn";
    btn.className = "chip molan-find-btn";
    btn.type = "button";
    btn.addEventListener("click", () => openFind());
    actions.appendChild(btn);
  }

  function observeFindTarget(root) {
    if (findState.observer) {
      findState.observer.disconnect();
      findState.observer = null;
    }
    if (!root || typeof MutationObserver !== "function") return;
    findState.observer = new MutationObserver(() => {
      if (!findState.open || !findState.query || findState.composing) return;
      clearTimeout(findState.refreshTimer);
      findState.refreshTimer = setTimeout(() => runFind({ keepIndex: true, reveal: false }), 180);
    });
    findState.observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }

  function openFind() {
    initFind();
    const bar = document.getElementById("molanFindBar");
    const input = document.getElementById("molanFindInput");
    const header = document.querySelector(".reader-header");
    if (!bar || !input) return;
    const picked = selectedTextForFind();
    if (picked) input.value = picked;
    findState.open = true;
    bar.hidden = false;
    bar.classList.add("is-open");
    header?.classList.add("is-finding");
    document.querySelector(".main")?.classList.add("is-finding");
    applyFindI18n();
    runFind({ keepIndex: false, reveal: true });
    input.focus();
    input.select();
  }

  function closeFind() {
    const bar = document.getElementById("molanFindBar");
    const header = document.querySelector(".reader-header");
    const current = findState.matches[findState.index];
    findState.open = false;
    bar?.classList.remove("is-open");
    if (bar) bar.hidden = true;
    header?.classList.remove("is-finding");
    document.querySelector(".main")?.classList.remove("is-finding");
    clearFindHighlights();
    if (current) {
      try {
        const sel = global.getSelection();
        const caret = current.cloneRange();
        caret.collapse(true);
        sel.removeAllRanges();
        sel.addRange(caret);
      } catch (_) { /* ignore */ }
    }
    findState.matches = [];
    findState.index = 0;
  }

  function handleFindKey(e) {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const mod = e.metaKey || e.ctrlKey;
    const inFind = e.target && e.target.id === "molanFindInput";

    if (mod && key === "f" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      openFind();
      return;
    }
    if ((mod && key === "g" && !e.altKey) || e.key === "F3") {
      e.preventDefault();
      e.stopPropagation();
      moveFind(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === "Escape" && findState.open) {
      e.preventDefault();
      e.stopPropagation();
      closeFind();
      return;
    }
    if (!inFind) return;
    if (e.key === "Enter") {
      e.preventDefault();
      moveFind(e.shiftKey ? -1 : 1);
    }
  }

  function initFind() {
    if (initFind.done) {
      ensureFindButton();
      applyFindI18n();
      return;
    }
    initFind.done = true;
    ensureFindButton();
    if (!document.getElementById("molanFindBar")) {
      const host = document.querySelector(".main") || document.body;
      const bar = document.createElement("div");
      bar.id = "molanFindBar";
      bar.className = "molan-find-bar";
      bar.hidden = true;
      bar.setAttribute("role", "search");
      bar.innerHTML = `
        <input class="molan-find-input" id="molanFindInput" type="search" autocomplete="off" spellcheck="false" enterkeyhint="search" />
        <span class="molan-find-count" id="molanFindCount" aria-live="polite"></span>
        <button type="button" class="molan-find-case" id="molanFindCase" aria-pressed="false">Aa</button>
        <button type="button" class="icon-btn" id="molanFindPrev">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg>
        </button>
        <button type="button" class="icon-btn" id="molanFindNext">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10l6 6 6-6"/></svg>
        </button>
        <button type="button" class="icon-btn" id="molanFindClose">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      `;
      host.appendChild(bar);

      const input = bar.querySelector("#molanFindInput");
      const caseBtn = bar.querySelector("#molanFindCase");
      input.addEventListener("compositionstart", () => { findState.composing = true; });
      input.addEventListener("compositionend", () => {
        findState.composing = false;
        runFind({ keepIndex: false, reveal: true });
      });
      input.addEventListener("input", () => {
        if (findState.composing) return;
        runFind({ keepIndex: false, reveal: true });
      });
      caseBtn.addEventListener("click", () => {
        findState.caseSensitive = !findState.caseSensitive;
        caseBtn.classList.toggle("is-on", findState.caseSensitive);
        caseBtn.setAttribute("aria-pressed", findState.caseSensitive ? "true" : "false");
        runFind({ keepIndex: false, reveal: true });
      });
      bar.querySelector("#molanFindPrev").addEventListener("click", () => moveFind(-1));
      bar.querySelector("#molanFindNext").addEventListener("click", () => moveFind(1));
      bar.querySelector("#molanFindClose").addEventListener("click", () => closeFind());
    }
    applyFindI18n();
    document.addEventListener("keydown", handleFindKey, true);
  }

  function revealVditorIcons() {
    const xlink = "http://www.w3.org/1999/xlink";
    document.querySelectorAll("use").forEach((use) => {
      const ref = use.getAttribute("href")
        || use.getAttributeNS(xlink, "href")
        || use.getAttribute("xlink:href");
      if (ref) use.setAttribute("href", ref);
    });
  }

  function create(options = {}) {
    const elementId = options.elementId || "vditor";
    const cdn = options.cdn || DEFAULT_CDN;
    const placeholder = options.placeholder || t("placeholder");
    toastEl = document.getElementById("toast");
    patchMermaidLoader();
    scheduleMermaidWarmup(cdn);
    watchMermaidPreviews(elementId);

    const lightbox = initLightbox();
    const vditorRoot = document.getElementById(elementId);
    if (!vditorRoot) {
      return Promise.reject(new Error(`找不到编辑器容器 #${elementId}`));
    }
    if (typeof global.Vditor !== "function") {
      return Promise.reject(new Error("Vditor 未加载"));
    }

    let vditor = null;
    bindMermaidInteractions(vditorRoot, () => vditor, lightbox);

    return new Promise((resolve) => {
      vditor = new Vditor(elementId, {
        cdn,
        height: "100%",
        mode: "ir",
        theme: "classic",
        icon: "ant",
        lang: options.lang || (global.MolanI18n && global.MolanI18n.vditorLang()) || "zh_CN",
        placeholder,
        cache: { enable: false },
        undoDelay: 200,
        hint: { delay: 400 },
        toolbar: [
          "headings", "bold", "italic", "strike", "|",
          "line", "quote", "list", "ordered-list", "check", "outdent", "indent", "|",
          "code", "inline-code", "link", "table", "|",
          "undo", "redo", "|",
          "edit-mode", "outline", "preview", "fullscreen",
        ],
        toolbarConfig: { pin: true, hide: false },
        preview: {
          delay: 800,
          maxWidth: 2400,
          actions: options.previewActions || [],
          theme: { current: "light" },
          hljs: { style: "kimbie-dark", lineNumber: false },
          math: { engine: "KaTeX", inlineDigit: true },
          markdown: {
            linkBase: options.linkBase || "",
            toc: false,
            fixTermTypo: false,
            autoSpace: false,
            paragraphBeginningSpace: false,
            listStyle: false,
            sanitize: true,
            codeBlockPreview: true,
            mathBlockPreview: true,
          },
        },
        counter: {
          enable: true,
          type: "text",
          after: () => options.onCounter?.(),
        },
        input: () => {
          scheduleFitTables(vditorRoot);
          try {
            options.onInput?.();
          } catch (_) { /* ignore */ }
        },
        ctrlEnter: () => {
          options.onSave?.();
        },
        after: () => {
          applyMermaidTheme();
          watchMermaidPreviews(elementId);
          watchTables(vditorRoot);
          revealVditorIcons();
          initFind();
          observeFindTarget(vditorRoot);
          const previewBtn = () =>
            vditor?.vditor?.toolbar?.elements?.preview?.querySelector?.('[data-type="preview"]') || null;
          const isPreview = () => previewBtn()?.classList.contains("vditor-menu--current") ?? false;
          const setPreview = (on) => {
            const btn = previewBtn();
            if (!btn) return isPreview();
            const active = btn.classList.contains("vditor-menu--current");
            if (Boolean(on) !== active) btn.click();
            else if (on) {
              try { vditor.renderPreview(); } catch (_) { /* ignore */ }
            }
            setTimeout(() => {
              scheduleFitTables(vditorRoot);
              if (findState.open) runFind({ keepIndex: true, reveal: false });
            }, 80);
            return Boolean(on);
          };
          const api = {
            setValue(text, clearStack = true) {
              vditor.setValue(text ?? "", clearStack);
              applyMermaidTheme();
              watchMermaidPreviews(elementId);
              if (isPreview()) {
                try { vditor.renderPreview(); } catch (_) { /* ignore */ }
              }
              setTimeout(() => {
                const root = document.getElementById(elementId);
                enhanceMermaidPreviews(root);
                scheduleFitTables(root);
                if (findState.open) runFind({ keepIndex: true, reveal: false });
              }, 400);
            },
            getValue() {
              // 列宽只用于当前 webview 的呈现，不能把 class / style 写回 Markdown。
              clearMolanTableLayout(vditorRoot);
              const value = vditor.getValue();
              scheduleFitTables(vditorRoot);
              return value;
            },
            focus() {
              try { vditor.focus(); } catch (_) { /* ignore */ }
            },
            isPreview,
            setPreview,
            onPreviewChange(cb) {
              const btn = previewBtn();
              if (!btn || typeof cb !== "function") return () => {};
              const obs = new MutationObserver(() => {
                scheduleFitTables(vditorRoot);
                if (findState.open) runFind({ keepIndex: true, reveal: false });
                cb(isPreview());
              });
              obs.observe(btn, { attributes: true, attributeFilter: ["class"] });
              return () => obs.disconnect();
            },
            getVditor() {
              return vditor;
            },
          };
          options.onReady?.(api);
          resolve(api);
        },
      });
    });
  }

  global.MolanEditor = {
    DEFAULT_CDN,
    create,
    toast,
    countWords,
    applyMermaidTheme,
    refreshMermaidDiagrams,
    refreshI18n,
    enhanceMermaidPreviews,
    watchMermaidPreviews,
    find: {
      open: openFind,
      close: closeFind,
      next() { moveFind(1); },
      prev() { moveFind(-1); },
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFind);
  } else {
    initFind();
  }
})(window);

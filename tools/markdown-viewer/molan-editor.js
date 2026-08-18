/**
 * 墨览编辑器核心：Vditor 初始化、Mermaid 主题、流程图工具条与灯箱。
 * 浏览器工作室与 VSCode 扩展共用。
 */
(function (global) {
  function resolveDefaultCdn() {
    try {
      return new URL("vendor/vditor", document.baseURI || location.href).href.replace(/\/$/, "");
    } catch (_) {
      return "./vendor/vditor";
    }
  }
  const DEFAULT_CDN = resolveDefaultCdn();
  const scriptLoads = Object.create(null);

  function loadScript(src, id) {
    if (id && document.getElementById(id) && isScriptReady(id)) {
      return Promise.resolve();
    }
    const key = id || src;
    if (scriptLoads[key]) return scriptLoads[key];
    scriptLoads[key] = new Promise((resolve, reject) => {
      if (id && document.getElementById(id) && isScriptReady(id)) {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => {
        if (id && !s.id) s.id = id;
        resolve();
      };
      s.onerror = () => {
        delete scriptLoads[key];
        reject(new Error("加载失败: " + src));
      };
      document.head.appendChild(s);
    });
    return scriptLoads[key];
  }

  function isScriptReady(id) {
    if (id === "vditorLuteScript") return typeof global.Lute === "function";
    if (id === "vditorFullScript") return isFullVditor();
    if (id === "vditorMermaidScript") return !!global.mermaid;
    return true;
  }

  function isFullVditor() {
    return typeof global.Vditor === "function"
      && typeof global.Vditor.prototype?.getValue === "function"
      && typeof global.Vditor.prototype?.setValue === "function";
  }

  function preloadLute(cdn) {
    if (typeof global.Lute === "function") return Promise.resolve();
    return loadScript(`${cdn}/dist/js/lute/lute.min.js`, "vditorLuteScript").catch(() => {});
  }

  function ensureFullVditor(cdn) {
    if (isFullVditor()) return Promise.resolve();
    return loadScript(`${cdn}/dist/index.min.js`, "vditorFullScript").then(() => {
      if (!isFullVditor()) throw new Error("Vditor 编辑器未加载");
    });
  }

  function markdownHasMermaid(text) {
    return /(^|\n)\s*(```+|~~~+)\s*mermaid\b/i.test(String(text || ""));
  }

  function maybePreloadMermaid(cdn, text) {
    if (markdownHasMermaid(text)) preloadMermaid(cdn);
  }

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
      typeAria: "排版",
      typeTitle: "调节字号与行距",
      typeLabel: "排版",
      typeSize: "字号",
      typeLeading: "行距",
      typeGap: "段距",
      typeTracking: "字距",
      typeReset: "恢复默认",
      prefsTheme: "纸面",
      themeAria: "界面样式",
      themeXuan: "宣纸",
      themeXuanTitle: "宣纸 · 暖色纸面",
      themeNight: "墨夜",
      themeNightTitle: "墨夜 · 暗色夜读",
      themeHack: "终端",
      themeHackTitle: "终端 · 程序员",
      themeRose: "胭脂",
      themeRoseTitle: "胭脂 · 柔粉纸面",
      themeSwitched: "已切换为「{name}」",
      prefsAria: "界面配置",
      placeholder: "开始编辑 Markdown…",
      insertBlock: "插入块",
      insertGroupText: "文本",
      insertGroupList: "列表",
      insertGroupInsert: "插入",
      insertH1: "标题 1",
      insertH2: "标题 2",
      insertH3: "标题 3",
      insertUl: "无序列表",
      insertOl: "有序列表",
      insertTask: "任务列表",
      insertQuote: "引用",
      insertHr: "分割线",
      insertCode: "代码块",
      insertTable: "表格",
      insertMath: "公式",
      insertMermaid: "流程图",
      insertImage: "图片",
      insertLink: "链接",
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
  let activeBlockInsert = null;
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
      patchMermaidInitialize();
      if (typeof mermaid.mermaidAPI?.reset === "function") {
        try { mermaid.mermaidAPI.reset(); } catch (_) { /* ignore */ }
      }
      mermaid.initialize(getMermaidOpts());
      return true;
    } catch (_) {
      return false;
    }
  }

  function mermaidRoot() {
    return document.getElementById("editorWrap")
      || document.getElementById("molanPreview")
      || document.getElementById("vditor")
      || document;
  }

  let mermaidMarkdownProvider = null;
  const themeChangeListeners = [];

  function setMermaidMarkdownProvider(fn) {
    mermaidMarkdownProvider = typeof fn === "function" ? fn : null;
  }

  function onThemeChange(fn) {
    if (typeof fn !== "function") return () => {};
    themeChangeListeners.push(fn);
    return () => {
      const i = themeChangeListeners.indexOf(fn);
      if (i >= 0) themeChangeListeners.splice(i, 1);
    };
  }

  function extractMermaidSources(text) {
    const out = [];
    const src = String(text || "");
    const re = /(?:^|\n)[ \t]*(```+|~~~+)[ \t]*mermaid[^\n]*\n([\s\S]*?)(?:\n[ \t]*\1[ \t]*(?:\n|$))/gi;
    let match;
    while ((match = re.exec(src))) out.push(match[2].trim());
    return out;
  }

  function mermaidSourcesFromMarkdown() {
    if (typeof mermaidMarkdownProvider !== "function") return [];
    try {
      return extractMermaidSources(mermaidMarkdownProvider());
    } catch (_) {
      return [];
    }
  }

  function captureMermaidSource(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.getAttribute("data-molan-source")) return;
    if (el.getAttribute("data-processed") === "true") return;
    if (el.querySelector("svg")) return;
    const text = (el.textContent || "").trim();
    if (text) el.setAttribute("data-molan-source", text);
  }

  function captureMermaidSources(root = document) {
    root.querySelectorAll?.(".language-mermaid")?.forEach(captureMermaidSource);
  }

  function stampMermaidSources(root, text) {
    if (!root) return;
    const sources = extractMermaidSources(text);
    root.querySelectorAll(".language-mermaid").forEach((el, i) => {
      if (sources[i]) el.setAttribute("data-molan-source", sources[i]);
      else captureMermaidSource(el);
    });
  }

  function scheduleMermaidThemeRefresh() {
    const run = () => {
      applyMermaidTheme();
      if (themeChangeListeners.length) {
        themeChangeListeners.forEach((fn) => {
          try { fn(); } catch (_) { /* ignore */ }
        });
        return;
      }
      refreshMermaidDiagrams(mermaidRoot());
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else run();
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
    return loadScript(`${cdn}/dist/js/mermaid/mermaid.min.js`, "vditorMermaidScript")
      .then(() => {
        applyMermaidTheme();
        patchMermaidInitialize();
      })
      .catch(() => {});
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
    const host = previewEl?.matches?.(".language-mermaid")
      ? previewEl
      : (previewEl?.querySelector?.(".language-mermaid") || previewEl);
    const saved = host?.getAttribute?.("data-molan-source")
      || previewEl?.getAttribute?.("data-molan-source");
    if (saved) return saved;
    const code = previewEl?.querySelector?.("code.language-mermaid, .language-mermaid") || host;
    if (!code) return "";
    if (code.getAttribute?.("data-processed")) return "";
    return (code.textContent || "").trim();
  }

  let mermaidRenderSeq = 0;
  let mermaidRefreshing = false;
  let mermaidRefreshQueued = null;

  function cleanupMermaidTemp(id) {
    document.getElementById(id)?.remove();
    document.getElementById("d" + id)?.remove();
  }

  function renderMermaidSvg(source) {
    const id = "molan-mmd-" + (++mermaidRenderSeq);
    const api = global.mermaid;
    if (!api || typeof api.render !== "function") {
      return Promise.reject(new Error("mermaid.render 不可用"));
    }
    const done = (svg) => {
      cleanupMermaidTemp(id);
      return svg;
    };
    try {
      const out = api.render(id, source);
      if (out && typeof out.then === "function") {
        return out.then((result) => done(typeof result === "string" ? result : result.svg));
      }
      if (typeof out === "string") return Promise.resolve(done(out));
      if (out && out.svg) return Promise.resolve(done(out.svg));
    } catch (_) { /* mermaid 9 走回调 */ }
    return new Promise((resolve, reject) => {
      try {
        api.render(id, source, (svg) => resolve(done(svg)));
      } catch (err) {
        cleanupMermaidTemp(id);
        reject(err);
      }
    });
  }

  async function refreshMermaidDiagrams(root = document) {
    if (!global.mermaid || typeof mermaid.render !== "function") return;
    if (mermaidRefreshing) {
      mermaidRefreshQueued = root;
      return;
    }
    mermaidRefreshing = true;
    try {
      applyMermaidTheme();
      captureMermaidSources(root);
      const fromMd = mermaidSourcesFromMarkdown();
      const hosts = Array.from(root.querySelectorAll(".language-mermaid"));
      for (let i = 0; i < hosts.length; i += 1) {
        const host = hosts[i];
        const preview = host.closest(".vditor-ir__preview") || host;
        const source = getMermaidSourceNear(preview)
          || host.getAttribute("data-molan-source")
          || fromMd[i]
          || "";
        if (!source) continue;
        host.setAttribute("data-molan-source", source);
        try {
          const svg = await renderMermaidSvg(source);
          const wrap = document.createElement("div");
          wrap.innerHTML = svg;
          const next = wrap.querySelector("svg");
          if (!next) continue;
          const old = host.querySelector("svg");
          if (old) old.replaceWith(next);
          else host.insertBefore(next, host.firstChild);
          host.setAttribute("data-processed", "true");
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
    captureMermaidSources(root);
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
    const root = typeof rootId === "string" ? document.getElementById(rootId) : rootId;
    if (!root) return;
    enhanceMermaidPreviews(root);
    if (diagramObserver) return;
    let raf = 0;
    diagramObserver = new MutationObserver((mutations) => {
      let added = false;
      for (const m of mutations) {
        if (!m.addedNodes.length) continue;
        added = true;
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches?.(".language-mermaid")) captureMermaidSource(node);
          node.querySelectorAll?.(".language-mermaid")?.forEach(captureMermaidSource);
        });
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
    applyTypeI18n();
    applyThemeI18n();
    if (activeBlockInsert && typeof activeBlockInsert.refreshI18n === "function") {
      activeBlockInsert.refreshI18n();
    }
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
    animToken: 0,
  };

  function hasHighlightApi() {
    return typeof global.Highlight === "function" && global.CSS && CSS.highlights;
  }

  function getSearchRoot() {
    const wrap = document.getElementById("editorWrap");
    if (wrap && !wrap.classList.contains("visible")) return null;
    if (wrap?.classList.contains("is-lite-preview")) {
      return document.getElementById("molanPreviewBody")
        || document.getElementById("molanPreview")
        || wrap;
    }
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
      btn.title = t("findAria");
      btn.setAttribute("aria-label", t("findAria"));
    }
    updateFindCount();
  }

  const FIND_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function paintFindButton(btn) {
    if (!btn) return;
    btn.id = "molanFindBtn";
    btn.className = "icon-btn molan-find-btn";
    btn.type = "button";
    if (!btn.querySelector("svg") || btn.classList.contains("chip") || btn.textContent.trim()) {
      btn.innerHTML = FIND_ICON;
    }
  }

  function ensureFindButton() {
    const actions = document.querySelector(".reader-actions");
    let btn = document.getElementById("molanFindBtn");
    if (!btn && actions) {
      btn = document.createElement("button");
      actions.insertBefore(btn, actions.firstChild);
    }
    paintFindButton(btn);
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => openFind());
    }
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

  function prefersReducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  }

  function openFind() {
    closeType();
    initFind();
    const bar = document.getElementById("molanFindBar");
    const input = document.getElementById("molanFindInput");
    const header = document.querySelector(".reader-header");
    if (!bar || !input) return;
    const picked = selectedTextForFind();
    if (picked) input.value = picked;
    findState.animToken += 1;
    const already = findState.open && bar.classList.contains("is-open");
    findState.open = true;
    bar.hidden = false;
    header?.classList.add("is-finding");
    document.querySelector(".main")?.classList.add("is-finding");
    if (!already) {
      bar.classList.remove("is-out", "is-open");
      void bar.offsetWidth;
      bar.classList.add("is-open");
    }
    applyFindI18n();
    runFind({ keepIndex: false, reveal: true });
    input.focus();
    input.select();
  }

  function closeFind() {
    const bar = document.getElementById("molanFindBar");
    const header = document.querySelector(".reader-header");
    if (!findState.open) return;
    const current = findState.matches[findState.index];
    findState.open = false;
    const token = ++findState.animToken;
    bar?.classList.remove("is-open");
    bar?.classList.add("is-out");

    const finish = () => {
      if (token !== findState.animToken) return;
      if (bar) {
        bar.hidden = true;
        bar.classList.remove("is-out");
      }
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
    };

    if (!bar || prefersReducedMotion()) {
      finish();
      return;
    }
    bar.addEventListener("animationend", (e) => {
      if (e.target === bar) finish();
    }, { once: true });
    window.setTimeout(finish, 280);
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

  const TYPE_KEY = "molan-type";
  const TYPE_DEFAULTS = {
    size: 0.98,
    leading: 1.58,
    gap: 0.65,
    tracking: 0,
  };
  const TYPE_RANGES = {
    size: { min: 0.85, max: 1.5, step: 0.01 },
    leading: { min: 1.3, max: 2.2, step: 0.02 },
    gap: { min: 0.25, max: 1.4, step: 0.05 },
    tracking: { min: -0.03, max: 0.12, step: 0.005 },
  };
  const TYPE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.6 19L8.2 5.5h1.7L14.5 19"/><path d="M5.4 13.6h7.2"/><path d="M16.4 19l2.6-8h1.1L22.6 19"/><path d="M17.5 15.6h4.1"/></svg>';

  const typeState = {
    open: false,
    animToken: 0,
    values: { ...TYPE_DEFAULTS },
  };

  function clampType(key, value) {
    const range = TYPE_RANGES[key];
    const n = Number(value);
    if (!range || !Number.isFinite(n)) return TYPE_DEFAULTS[key];
    const snapped = range.step ? Math.round(n / range.step) * range.step : n;
    return Math.min(range.max, Math.max(range.min, snapped));
  }

  function readStoredType() {
    try {
      const raw = JSON.parse(localStorage.getItem(TYPE_KEY) || "null");
      if (!raw || typeof raw !== "object") return { ...TYPE_DEFAULTS };
      return {
        size: clampType("size", raw.size ?? TYPE_DEFAULTS.size),
        leading: clampType("leading", raw.leading ?? TYPE_DEFAULTS.leading),
        gap: clampType("gap", raw.gap ?? TYPE_DEFAULTS.gap),
        tracking: clampType("tracking", raw.tracking ?? TYPE_DEFAULTS.tracking),
      };
    } catch (_) {
      return { ...TYPE_DEFAULTS };
    }
  }

  function persistType() {
    try {
      localStorage.setItem(TYPE_KEY, JSON.stringify(typeState.values));
    } catch (_) { /* ignore */ }
  }

  function applyTypeVars(values) {
    const root = document.documentElement.style;
    root.setProperty("--reader-size", `${values.size}rem`);
    root.setProperty("--reader-leading", String(values.leading));
    root.setProperty("--reader-gap", `${values.gap}em`);
    root.setProperty("--reader-tracking", `${values.tracking}em`);
  }

  function applyStoredType() {
    typeState.values = readStoredType();
    applyTypeVars(typeState.values);
  }

  function formatTypeValue(key, value) {
    if (key === "size") return String(Math.round(value * 16));
    if (key === "tracking") {
      if (Math.abs(value) < 0.0005) return "0";
      const sign = value > 0 ? "+" : "";
      return sign + value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
    }
    return value.toFixed(2);
  }

  function setRangeFill(input) {
    if (!input) return;
    const min = Number(input.min);
    const max = Number(input.max);
    const val = Number(input.value);
    const pct = max === min ? 0 : ((val - min) / (max - min)) * 100;
    input.style.setProperty("--pct", `${pct}%`);
  }

  function paintTypeControls() {
    const menu = document.getElementById("typeMenu");
    if (!menu) return;
    Object.keys(TYPE_RANGES).forEach((key) => {
      const input = menu.querySelector(`[data-type-key="${key}"]`);
      const label = menu.querySelector(`[data-type-val="${key}"]`);
      const value = typeState.values[key];
      if (input) {
        input.value = String(value);
        setRangeFill(input);
      }
      if (label) label.textContent = formatTypeValue(key, value);
    });
  }

  function setTypeValue(key, raw, persist) {
    const next = clampType(key, raw);
    typeState.values[key] = next;
    applyTypeVars(typeState.values);
    paintTypeControls();
    if (persist !== false) persistType();
  }

  function resetType() {
    typeState.values = { ...TYPE_DEFAULTS };
    applyTypeVars(typeState.values);
    paintTypeControls();
    persistType();
  }

  function typeIsOpen() {
    const menu = document.getElementById("typeMenu");
    return !!(typeState.open && menu && !menu.hidden && menu.classList.contains("is-open"));
  }

  function paintTypeButton(btn) {
    if (!btn) return;
    btn.id = "typeBtn";
    btn.className = "icon-btn";
    btn.type = "button";
    if (!btn.querySelector("svg")) btn.innerHTML = TYPE_ICON;
  }

  function ensureTypeButton() {
    const actions = document.querySelector(".reader-actions");
    let wrap = document.getElementById("typePrefs") || document.querySelector(".type-prefs");
    let btn = document.getElementById("typeBtn");
    if (!wrap && actions) {
      wrap = document.createElement("div");
      wrap.id = "typePrefs";
      wrap.className = "type-prefs";
      const headerPrefs = document.getElementById("headerPrefs");
      if (headerPrefs && headerPrefs.parentElement === actions) actions.insertBefore(wrap, headerPrefs);
      else actions.appendChild(wrap);
    }
    if (!btn && wrap) {
      btn = document.createElement("button");
      wrap.appendChild(btn);
    } else if (btn && wrap && btn.parentElement !== wrap) {
      wrap.appendChild(btn);
    }
    paintTypeButton(btn);
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleType();
      });
    }
    return { wrap, btn };
  }

  function applyTypeI18n() {
    const btn = document.getElementById("typeBtn");
    const menu = document.getElementById("typeMenu");
    const label = t("typeAria");
    const title = t("typeTitle");
    if (btn) {
      btn.title = title;
      btn.setAttribute("aria-label", label);
    }
    if (!menu) return;
    menu.setAttribute("aria-label", label);
    const head = menu.querySelector(".type-head");
    if (head) head.textContent = t("typeLabel");
    const map = {
      size: "typeSize",
      leading: "typeLeading",
      gap: "typeGap",
      tracking: "typeTracking",
    };
    Object.keys(map).forEach((key) => {
      const el = menu.querySelector(`[data-type-name="${key}"]`);
      if (el) el.textContent = t(map[key]);
    });
    const reset = menu.querySelector("#typeReset");
    if (reset) reset.textContent = t("typeReset");
  }

  function openType() {
    closeHeaderPrefs();
    initType();
    const menu = document.getElementById("typeMenu");
    const btn = document.getElementById("typeBtn");
    if (!menu || !btn) return;
    typeState.animToken += 1;
    const already = typeIsOpen();
    typeState.open = true;
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    btn.classList.add("is-on");
    paintTypeControls();
    if (!already) {
      menu.classList.remove("is-out", "is-open");
      void menu.offsetWidth;
      menu.classList.add("is-open");
    }
  }

  function closeType() {
    const menu = document.getElementById("typeMenu");
    const btn = document.getElementById("typeBtn");
    if (!menu || menu.hidden || menu.classList.contains("is-out")) {
      typeState.open = false;
      btn?.setAttribute("aria-expanded", "false");
      btn?.classList.remove("is-on");
      return;
    }
    const token = typeState.animToken + 1;
    typeState.animToken = token;
    typeState.open = false;
    menu.classList.remove("is-open");
    menu.classList.add("is-out");
    btn?.setAttribute("aria-expanded", "false");
    btn?.classList.remove("is-on");
    const finish = () => {
      if (token !== typeState.animToken) return;
      menu.hidden = true;
      menu.classList.remove("is-out");
    };
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    menu.addEventListener("animationend", (e) => {
      if (e.target === menu) finish();
    }, { once: true });
    window.setTimeout(finish, 280);
  }

  function toggleType() {
    if (typeIsOpen()) closeType();
    else openType();
  }

  function initType() {
    if (initType.done) {
      ensureTypeButton();
      applyTypeI18n();
      paintTypeControls();
      return;
    }
    initType.done = true;
    applyStoredType();
    const { wrap } = ensureTypeButton();
    if (wrap && !document.getElementById("typeMenu")) {
      const menu = document.createElement("div");
      menu.id = "typeMenu";
      menu.className = "type-menu";
      menu.hidden = true;
      menu.setAttribute("role", "dialog");
      menu.innerHTML = `
        <div class="type-head" data-i18n="typeLabel">排版</div>
        <label class="type-row">
          <span class="type-row-head">
            <span data-type-name="size" data-i18n="typeSize">字号</span>
            <span class="type-val" data-type-val="size">16</span>
          </span>
          <input type="range" data-type-key="size" min="${TYPE_RANGES.size.min}" max="${TYPE_RANGES.size.max}" step="${TYPE_RANGES.size.step}" />
        </label>
        <label class="type-row">
          <span class="type-row-head">
            <span data-type-name="leading" data-i18n="typeLeading">行距</span>
            <span class="type-val" data-type-val="leading">1.58</span>
          </span>
          <input type="range" data-type-key="leading" min="${TYPE_RANGES.leading.min}" max="${TYPE_RANGES.leading.max}" step="${TYPE_RANGES.leading.step}" />
        </label>
        <label class="type-row">
          <span class="type-row-head">
            <span data-type-name="gap" data-i18n="typeGap">段距</span>
            <span class="type-val" data-type-val="gap">0.65</span>
          </span>
          <input type="range" data-type-key="gap" min="${TYPE_RANGES.gap.min}" max="${TYPE_RANGES.gap.max}" step="${TYPE_RANGES.gap.step}" />
        </label>
        <label class="type-row">
          <span class="type-row-head">
            <span data-type-name="tracking" data-i18n="typeTracking">字距</span>
            <span class="type-val" data-type-val="tracking">0</span>
          </span>
          <input type="range" data-type-key="tracking" min="${TYPE_RANGES.tracking.min}" max="${TYPE_RANGES.tracking.max}" step="${TYPE_RANGES.tracking.step}" />
        </label>
        <button type="button" class="type-reset" id="typeReset" data-i18n="typeReset">恢复默认</button>
      `;
      wrap.appendChild(menu);
      menu.addEventListener("click", (e) => e.stopPropagation());
      menu.querySelectorAll("[data-type-key]").forEach((input) => {
        input.addEventListener("input", () => {
          setTypeValue(input.getAttribute("data-type-key"), input.value, false);
        });
        input.addEventListener("change", () => persistType());
      });
      menu.querySelector("#typeReset")?.addEventListener("click", () => resetType());
    }
    const btn = document.getElementById("typeBtn");
    btn?.setAttribute("aria-expanded", "false");
    btn?.setAttribute("aria-haspopup", "dialog");
    btn?.setAttribute("aria-controls", "typeMenu");
    applyTypeI18n();
    paintTypeControls();
    document.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".type-prefs")) return;
      closeType();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeType();
    });
  }

  const THEMES = ["xuan", "night", "hack", "rose"];
  const THEME_KEY = "molan-theme";
  const THEME_I18N = { xuan: "themeXuan", night: "themeNight", hack: "themeHack", rose: "themeRose" };
  const THEME_TITLE = {
    xuan: "themeXuanTitle",
    night: "themeNightTitle",
    hack: "themeHackTitle",
    rose: "themeRoseTitle",
  };
  const THEME_FONTS = {
    night: "family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500",
    hack: "family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400",
    xuan: "family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500",
    rose: "family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500",
  };

  const headerPrefsState = {
    open: false,
    animToken: 0,
  };

  function isVscodeHost() {
    return document.documentElement.classList.contains("molan-host-vscode")
      || document.body.classList.contains("molan-host-vscode");
  }

  function loadThemeFonts(theme) {
    if (isVscodeHost()) return;
    const query = THEME_FONTS[theme] || THEME_FONTS.night;
    const href = "https://fonts.googleapis.com/css2?" + query + "&display=swap";
    let link = document.getElementById("molan-fonts");
    if (!link) {
      link = document.createElement("link");
      link.id = "molan-fonts";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.getAttribute("href") === href) return;
    link.href = href;
  }

  function readStoredTheme() {
    try {
      const id = localStorage.getItem(THEME_KEY);
      if (THEMES.includes(id)) return id;
    } catch (_) { /* ignore */ }
    return "night";
  }

  function paintThemeSwitch(theme) {
    document.querySelectorAll(".theme-switch [data-theme]").forEach((btn) => {
      btn.setAttribute("aria-checked", btn.getAttribute("data-theme") === theme ? "true" : "false");
    });
  }

  function applyTheme(theme, persist) {
    const next = THEMES.includes(theme) ? theme : "night";
    document.documentElement.setAttribute("data-theme", next);
    loadThemeFonts(next);
    if (persist !== false) {
      try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* ignore */ }
    }
    paintThemeSwitch(next);
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "theme", theme: next }, window.location.origin);
      }
    } catch (_) { /* ignore */ }
    try {
      scheduleMermaidThemeRefresh();
    } catch (_) { /* ignore */ }
  }

  function bindThemeSwitch(switchEl) {
    if (!switchEl || switchEl.dataset.bound) return;
    switchEl.dataset.bound = "1";
    switchEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-theme]");
      if (!btn) return;
      const id = btn.getAttribute("data-theme");
      applyTheme(id);
      toast(t("themeSwitched", { name: t(THEME_I18N[id] || id) }));
    });
  }

  function applyThemeI18n() {
    const head = document.querySelector("#headerPrefsMenu .type-head");
    if (head) head.textContent = t("prefsTheme");
    const menu = document.getElementById("headerPrefsMenu");
    if (menu) menu.setAttribute("aria-label", t("prefsAria"));
    const prefsBtn = document.getElementById("headerPrefsBtn");
    if (prefsBtn) {
      prefsBtn.title = t("prefsAria");
      prefsBtn.setAttribute("aria-label", t("prefsAria"));
    }
    document.querySelectorAll(".theme-switch").forEach((el) => {
      el.setAttribute("aria-label", t("themeAria"));
    });
    document.querySelectorAll(".theme-switch [data-theme]").forEach((el) => {
      const id = el.getAttribute("data-theme");
      if (!THEME_I18N[id]) return;
      el.title = t(THEME_TITLE[id]);
      el.setAttribute("aria-label", t(THEME_I18N[id]));
    });
  }

  function headerPrefsIsOpen() {
    const menu = document.getElementById("headerPrefsMenu");
    return !!(headerPrefsState.open && menu && !menu.hidden && menu.classList.contains("is-open"));
  }

  function openHeaderPrefs() {
    closeType();
    initHeaderPrefs();
    const menu = document.getElementById("headerPrefsMenu");
    const btn = document.getElementById("headerPrefsBtn");
    if (!menu || !btn) return;
    headerPrefsState.animToken += 1;
    const already = headerPrefsIsOpen();
    headerPrefsState.open = true;
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    btn.classList.add("is-on");
    if (!already) {
      menu.classList.remove("is-out", "is-open");
      void menu.offsetWidth;
      menu.classList.add("is-open");
    }
  }

  function closeHeaderPrefs() {
    const menu = document.getElementById("headerPrefsMenu");
    const btn = document.getElementById("headerPrefsBtn");
    if (!menu || menu.hidden || menu.classList.contains("is-out")) {
      headerPrefsState.open = false;
      btn?.setAttribute("aria-expanded", "false");
      btn?.classList.remove("is-on");
      return;
    }
    const token = headerPrefsState.animToken + 1;
    headerPrefsState.animToken = token;
    headerPrefsState.open = false;
    menu.classList.remove("is-open");
    menu.classList.add("is-out");
    btn?.setAttribute("aria-expanded", "false");
    btn?.classList.remove("is-on");
    const finish = () => {
      if (token !== headerPrefsState.animToken) return;
      menu.hidden = true;
      menu.classList.remove("is-out");
    };
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    menu.addEventListener("animationend", (e) => {
      if (e.target === menu) finish();
    }, { once: true });
    window.setTimeout(finish, 280);
  }

  function toggleHeaderPrefs() {
    if (headerPrefsIsOpen()) closeHeaderPrefs();
    else openHeaderPrefs();
  }

  function initHeaderPrefs() {
    const wrap = document.getElementById("headerPrefs");
    const btn = document.getElementById("headerPrefsBtn");
    const menu = document.getElementById("headerPrefsMenu");
    if (!wrap || !btn || !menu) return;
    if (initHeaderPrefs.done) {
      applyThemeI18n();
      return;
    }
    initHeaderPrefs.done = true;
    if (!btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleHeaderPrefs();
      });
    }
    menu.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("pointerdown", (e) => {
      if (e.target.closest("#headerPrefs")) return;
      closeHeaderPrefs();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeHeaderPrefs();
    });
    applyThemeI18n();
  }

  function initTheme() {
    if (initTheme.done) {
      applyThemeI18n();
      paintThemeSwitch(readStoredTheme());
      return;
    }
    initTheme.done = true;
    applyTheme(readStoredTheme(), false);
    document.querySelectorAll(".theme-switch").forEach(bindThemeSwitch);
    applyThemeI18n();
    paintThemeSwitch(readStoredTheme());
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

  function ensureLitePreviewDom(vditorEl) {
    const wrap = vditorEl.parentElement;
    let host = document.getElementById("molanPreview");
    if (!host && wrap) {
      host = document.createElement("div");
      host.id = "molanPreview";
      host.className = "molan-preview vditor-preview";
      wrap.insertBefore(host, vditorEl);
    }
    let body = document.getElementById("molanPreviewBody");
    if (!body && host) {
      body = document.createElement("div");
      body.id = "molanPreviewBody";
      body.className = "vditor-reset";
      host.appendChild(body);
    }
    return { wrap, host, body };
  }

  const INSERT_ITEMS = [
    { id: "h1", group: "text", key: "insertH1", md: "# 标题" },
    { id: "h2", group: "text", key: "insertH2", md: "## 标题" },
    { id: "h3", group: "text", key: "insertH3", md: "### 标题" },
    { id: "quote", group: "text", key: "insertQuote", md: "> " },
    { id: "hr", group: "text", key: "insertHr", md: "---" },
    { id: "ul", group: "list", key: "insertUl", md: "- " },
    { id: "ol", group: "list", key: "insertOl", md: "1. " },
    { id: "task", group: "list", key: "insertTask", md: "- [ ] " },
    { id: "code", group: "insert", key: "insertCode", md: "```\n\n```" },
    { id: "table", group: "insert", key: "insertTable", md: "| 列 1 | 列 2 |\n| --- | --- |\n|  |  |" },
    { id: "math", group: "insert", key: "insertMath", md: "$$\n\n$$" },
    { id: "mermaid", group: "insert", key: "insertMermaid", md: "```mermaid\nflowchart TD\n  A[开始] --> B[结束]\n```" },
    { id: "image", group: "insert", key: "insertImage", md: "![]()" },
    { id: "link", group: "insert", key: "insertLink", md: "[]()" },
  ];

  const INSERT_GROUPS = [
    { id: "text", key: "insertGroupText" },
    { id: "list", key: "insertGroupList" },
    { id: "insert", key: "insertGroupInsert" },
  ];

  function isFenceLine(line) {
    return /^ {0,3}(`{3,}|~{3,})/.test(line);
  }

  function fenceClose(line, mark, len) {
    const m = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
    return !!(m && m[1][0] === mark && m[1].length >= len);
  }

  function splitMdBlocks(md) {
    const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
    const blocks = [];
    let i = 0;
    const push = (start, end) => {
      const text = lines.slice(start, end).join("\n");
      if (text.trim() === "") return;
      blocks.push({ start, end, text });
    };
    while (i < lines.length) {
      if (lines[i].trim() === "") {
        i++;
        continue;
      }
      const trimmed = lines[i].replace(/^ {0,3}/, "");
      if (isFenceLine(lines[i])) {
        const open = trimmed.match(/^(`{3,}|~{3,})/);
        const mark = open[1][0];
        const len = open[1].length;
        const start = i++;
        while (i < lines.length && !fenceClose(lines[i], mark, len)) i++;
        if (i < lines.length) i++;
        push(start, i);
        continue;
      }
      if (/^(#{1,6})(?:\s|$)/.test(trimmed)) {
        push(i, i + 1);
        i++;
        continue;
      }
      if (/^([-*_])\s*\1\s*\1(?:\s*\1)*\s*$/.test(trimmed) && !/^[-*+] /.test(trimmed)) {
        push(i, i + 1);
        i++;
        continue;
      }
      if (/^>/.test(trimmed)) {
        const start = i++;
        while (i < lines.length) {
          const next = lines[i].replace(/^ {0,3}/, "");
          if (lines[i].trim() === "") {
            if (i + 1 < lines.length && /^>/.test(lines[i + 1].replace(/^ {0,3}/, ""))) {
              i++;
              continue;
            }
            break;
          }
          if (!/^>/.test(next)) break;
          i++;
        }
        push(start, i);
        continue;
      }
      if (/^([-*+]|\d+[.)])(?:\s\[.?\])?\s/.test(trimmed) || /^[-*+] \[[ xX]\]\s/.test(trimmed)) {
        const start = i++;
        while (i < lines.length) {
          if (lines[i].trim() === "") {
            const peek = lines[i + 1] || "";
            if (/^\s+/.test(peek) || /^ {0,3}([-*+]|\d+[.)])\s/.test(peek)) {
              i++;
              continue;
            }
            break;
          }
          if (/^ {0,3}([-*+]|\d+[.)])\s/.test(lines[i]) || /^\s+\S/.test(lines[i])) {
            i++;
            continue;
          }
          break;
        }
        push(start, i);
        continue;
      }
      if (/\|/.test(lines[i]) && i + 1 < lines.length && /^\s*\|?[\s:|-]*-{3,}/.test(lines[i + 1])) {
        const start = i;
        i += 2;
        while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== "") i++;
        push(start, i);
        continue;
      }
      const start = i++;
      while (i < lines.length && lines[i].trim() !== "") {
        const next = lines[i].replace(/^ {0,3}/, "");
        if (/^(#{1,6})\s/.test(next) || isFenceLine(lines[i]) || /^>/.test(next)
          || /^([-*+]|\d+[.)])\s/.test(next)) break;
        i++;
      }
      push(start, i);
    }
    return blocks;
  }

  function isEmptyMdBlock(text) {
    return !String(text || "").replace(/[\u200b\s]/g, "");
  }

  function insertSnippetInMarkdown(md, blockIndex, snippet, replaceEmpty) {
    const piece = String(snippet || "").replace(/^\n+/, "").replace(/\n+$/, "");
    const blocks = splitMdBlocks(md);
    if (!blocks.length) return piece + "\n";
    const idx = Math.max(0, Math.min(blockIndex, blocks.length - 1));
    if (replaceEmpty && isEmptyMdBlock(blocks[idx].text)) {
      blocks[idx] = { ...blocks[idx], text: piece };
    } else {
      blocks.splice(idx + 1, 0, { text: piece });
    }
    return blocks.map((b) => b.text).join("\n\n").replace(/\n{3,}/g, "\n\n") + "\n";
  }

  function topLevelBlocks(root) {
    if (!root) return [];
    return [...root.children].filter((el) => {
      if (el.nodeType !== 1) return false;
      if (el.classList.contains("molan-block-insert") || el.classList.contains("molan-insert-menu")) {
        return false;
      }
      const tag = el.tagName;
      if (tag === "BR") return false;
      return true;
    });
  }

  function closestTopBlock(node, root) {
    if (!node || !root) return null;
    let el = node.nodeType === 1 ? node : node.parentElement;
    while (el && el !== root) {
      if (el.parentElement === root) return el;
      el = el.parentElement;
    }
    return null;
  }

  function blockLooksEmpty(el) {
    if (!el) return true;
    const clone = el.cloneNode(true);
    clone.querySelectorAll?.(".vditor-ir__preview, .molan-diagram-toolbar, .vditor-ir__marker").forEach((n) => n.remove());
    return !String(clone.textContent || "").replace(/[\u200b\s]/g, "");
  }

  function placeCaretAfter(el) {
    const editable = el?.closest?.("[contenteditable='true']");
    if (!editable) return false;
    try { editable.focus(); } catch (_) { /* ignore */ }
    const range = document.createRange();
    if (blockLooksEmpty(el)) {
      range.selectNodeContents(el);
      range.collapse(true);
    } else {
      range.setStartAfter(el);
      range.collapse(true);
    }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }

  function bindBlockInsert(ctx) {
    const wrap = ctx.getWrap();
    if (!wrap) return { sync() {}, hide() {}, refreshI18n() {} };

    let handle = wrap.querySelector(":scope > .molan-block-insert");
    if (!handle) {
      handle = document.createElement("div");
      handle.className = "molan-block-insert";
      handle.hidden = true;
      handle.innerHTML = `<button type="button" class="molan-block-plus" aria-haspopup="menu" aria-expanded="false">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>
      </button>`;
      wrap.appendChild(handle);
    }
    const plusBtn = handle.querySelector(".molan-block-plus");

    let menu = wrap.querySelector(":scope > .molan-insert-menu");
    if (!menu) {
      menu = document.createElement("div");
      menu.className = "molan-insert-menu";
      menu.hidden = true;
      menu.setAttribute("role", "menu");
      wrap.appendChild(menu);
    }

    let hover = null;
    let menuOpen = false;
    let activeIndex = 0;
    let hideTimer = 0;
    let moveRaf = 0;

    const items = () => INSERT_ITEMS;

    function paintMenu() {
      const parts = [];
      INSERT_GROUPS.forEach((group) => {
        const rows = INSERT_ITEMS.filter((item) => item.group === group.id);
        if (!rows.length) return;
        parts.push(`<div class="molan-insert-group" role="none">${t(group.key)}</div>`);
        rows.forEach((item) => {
          parts.push(`<button type="button" class="molan-insert-item" role="menuitem" data-insert-id="${item.id}">
            <span class="molan-insert-item-label">${t(item.key)}</span>
          </button>`);
        });
      });
      menu.innerHTML = parts.join("");
      plusBtn.setAttribute("aria-label", t("insertBlock"));
      plusBtn.setAttribute("title", t("insertBlock"));
      menu.setAttribute("aria-label", t("insertBlock"));
    }

    function visibleItems() {
      return [...menu.querySelectorAll(".molan-insert-item")];
    }

    function paintActive() {
      visibleItems().forEach((el, i) => el.classList.toggle("is-active", i === activeIndex));
    }

    function contentRoot() {
      if (ctx.getPreviewing()) return ctx.getPreviewBody();
      const vditorRoot = ctx.getVditorRoot();
      return vditorRoot?.querySelector(".vditor-ir pre.vditor-reset")
        || vditorRoot?.querySelector(".vditor-ir .vditor-reset")
        || null;
    }

    function hideHandle() {
      if (menuOpen) return;
      handle.hidden = true;
      handle.classList.remove("is-visible");
      hover = null;
    }

    function hideMenu() {
      menuOpen = false;
      menu.hidden = true;
      plusBtn.setAttribute("aria-expanded", "false");
    }

    function positionHandle(el) {
      if (!el) {
        hideHandle();
        return;
      }
      const wrapRect = wrap.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      if (rect.bottom < wrapRect.top + 8 || rect.top > wrapRect.bottom - 8) {
        handle.hidden = true;
        return;
      }
      const rtl = document.documentElement.dir === "rtl";
      const size = 26;
      const top = rect.top - wrapRect.top + Math.min(Math.max((Math.min(rect.height, 32) - size) / 2, 0), 8);
      let left = rtl
        ? rect.right - wrapRect.left + 8
        : rect.left - wrapRect.left - size - 8;
      left = Math.max(4, Math.min(left, wrapRect.width - size - 4));
      handle.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      handle.hidden = false;
      handle.classList.add("is-visible");
    }

    function positionMenu() {
      const wrapRect = wrap.getBoundingClientRect();
      const btnRect = plusBtn.getBoundingClientRect();
      menu.hidden = false;
      const menuRect = menu.getBoundingClientRect();
      let left = btnRect.left - wrapRect.left;
      let top = btnRect.bottom - wrapRect.top + 6;
      if (left + menuRect.width > wrapRect.width - 8) {
        left = Math.max(8, wrapRect.width - menuRect.width - 8);
      }
      if (top + menuRect.height > wrapRect.height - 8) {
        top = Math.max(8, btnRect.top - wrapRect.top - menuRect.height - 6);
      }
      menu.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    }

    function setHover(next) {
      hover = next;
      if (!next || !next.el) {
        hideHandle();
        return;
      }
      positionHandle(next.el);
    }

    function hitFromPoint(clientX, clientY) {
      const root = contentRoot();
      if (!root) return null;
      const blocks = topLevelBlocks(root);
      const rootRect = root.getBoundingClientRect();
      const x = Math.min(rootRect.right - 8, Math.max(rootRect.left + 12, rootRect.left + 36));
      const hitNode = document.elementFromPoint(x, clientY);
      if (hitNode && (hitNode.closest(".molan-block-insert") || hitNode.closest(".molan-insert-menu"))) {
        return hover;
      }
      let el = closestTopBlock(hitNode, root);
      if (!el && blocks.length) {
        for (let i = 0; i < blocks.length; i++) {
          const r = blocks[i].getBoundingClientRect();
          if (clientY >= r.top && clientY <= r.bottom) {
            el = blocks[i];
            break;
          }
        }
        if (!el) {
          const last = blocks[blocks.length - 1];
          const first = blocks[0];
          if (clientY > last.getBoundingClientRect().bottom) el = last;
          else if (clientY < first.getBoundingClientRect().top) el = first;
        }
      }
      if (!el && !blocks.length) {
        return { el: root, index: 0, emptyDoc: true };
      }
      if (!el) return null;
      const index = Math.max(0, blocks.indexOf(el));
      return { el, index, empty: blockLooksEmpty(el) };
    }

    function onMove(event) {
      if (menuOpen) return;
      if (moveRaf) cancelAnimationFrame(moveRaf);
      const { clientX, clientY } = event;
      moveRaf = requestAnimationFrame(() => {
        moveRaf = 0;
        const next = hitFromPoint(clientX, clientY);
        if (!next) {
          if (hideTimer) clearTimeout(hideTimer);
          hideTimer = window.setTimeout(hideHandle, 180);
          return;
        }
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = 0;
        }
        setHover(next);
      });
    }

    function onLeave(event) {
      if (menuOpen) return;
      const to = event.relatedTarget;
      if (to && (handle.contains(to) || menu.contains(to))) return;
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = window.setTimeout(hideHandle, 220);
    }

    function openMenu() {
      if (!hover) return;
      paintMenu();
      menuOpen = true;
      activeIndex = 0;
      plusBtn.setAttribute("aria-expanded", "true");
      positionHandle(hover.el);
      positionMenu();
      paintActive();
      const first = visibleItems()[0];
      first?.focus();
    }

    function applyItem(id) {
      const item = items().find((row) => row.id === id);
      if (!item || !hover) return;
      hideMenu();
      ctx.insertSnippet(item.md, hover);
      hideHandle();
    }

    plusBtn.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    plusBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (menuOpen) hideMenu();
      else openMenu();
    });
    handle.addEventListener("mouseenter", () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = 0;
      }
    });
    menu.addEventListener("click", (event) => {
      const btn = event.target.closest(".molan-insert-item");
      if (!btn) return;
      event.preventDefault();
      applyItem(btn.getAttribute("data-insert-id"));
    });
    menu.addEventListener("mouseover", (event) => {
      const btn = event.target.closest(".molan-insert-item");
      if (!btn) return;
      const rows = visibleItems();
      activeIndex = Math.max(0, rows.indexOf(btn));
      paintActive();
    });

    document.addEventListener("pointerdown", (event) => {
      if (!menuOpen) return;
      if (menu.contains(event.target) || handle.contains(event.target)) return;
      hideMenu();
    }, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menuOpen) {
        event.preventDefault();
        hideMenu();
        plusBtn.focus();
        return;
      }
      if (!menuOpen) return;
      const rows = visibleItems();
      if (!rows.length) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        activeIndex = (activeIndex + delta + rows.length) % rows.length;
        paintActive();
        rows[activeIndex]?.focus();
      } else if (event.key === "Enter") {
        event.preventDefault();
        const id = rows[activeIndex]?.getAttribute("data-insert-id");
        if (id) applyItem(id);
      }
    });

    wrap.addEventListener("mousemove", onMove);
    wrap.addEventListener("mouseleave", onLeave);
    const onScroll = () => {
      if (hover?.el) positionHandle(hover.el);
      if (menuOpen) positionMenu();
    };
    wrap.addEventListener("scroll", onScroll, true);
    const scrollBound = new WeakSet();
    function watchScroller(el) {
      if (!el || scrollBound.has(el)) return;
      scrollBound.add(el);
      el.addEventListener("scroll", onScroll, { passive: true });
    }

    paintMenu();
    watchScroller(ctx.getPreviewBody());

    return {
      sync() {
        watchScroller(ctx.getPreviewBody());
        watchScroller(ctx.getVditorRoot()?.querySelector(".vditor-ir"));
        if (menuOpen && hover?.el) {
          positionHandle(hover.el);
          positionMenu();
        } else if (!menuOpen) {
          hideHandle();
        }
      },
      hide() {
        hideMenu();
        hideHandle();
      },
      refreshI18n() {
        paintMenu();
        if (menuOpen) {
          paintActive();
          positionMenu();
        }
      },
    };
  }

  function create(options = {}) {
    const elementId = options.elementId || "vditor";
    const cdn = options.cdn || DEFAULT_CDN;
    const placeholder = options.placeholder || t("placeholder");
    toastEl = document.getElementById("toast");
    patchMermaidLoader();
    preloadLute(cdn);

    const lightbox = initLightbox();
    const vditorRoot = document.getElementById(elementId);
    if (!vditorRoot) {
      return Promise.reject(new Error(`找不到编辑器容器 #${elementId}`));
    }
    if (typeof global.Vditor?.preview !== "function") {
      return Promise.reject(new Error("Vditor 预览未加载"));
    }

    const { wrap, host: previewHost, body: previewBody } = ensureLitePreviewDom(vditorRoot);
    const previewRoot = wrap || vditorRoot;
    let vditor = null;
    let vditorReady = null;
    let markdown = "";
    let previewing = options.defaultPreview !== false;
    let previewSeq = 0;
    let muteInput = false;
    const previewListeners = [];
    let blockInsert = { sync() {}, hide() {}, refreshI18n() {} };

    setMermaidMarkdownProvider(() => {
      if (previewing) return markdown;
      if (vditor) {
        try { return vditor.getValue(); } catch (_) { /* ignore */ }
      }
      return markdown;
    });
    bindMermaidInteractions(previewRoot, () => vditor, lightbox);
    watchMermaidPreviews(previewRoot);
    watchTables(previewRoot);
    initFind();
    initType();
    initTheme();
    initHeaderPrefs();
    observeFindTarget(previewRoot);

    const markdownOpts = {
      linkBase: options.linkBase || "",
      toc: false,
      fixTermTypo: false,
      autoSpace: false,
      paragraphBeginningSpace: false,
      listStyle: false,
      sanitize: true,
      codeBlockPreview: true,
      mathBlockPreview: true,
    };
    const lazyLoadImage = `${cdn}/dist/images/img-loading.svg`;

    const notifyPreview = () => {
      previewListeners.forEach((cb) => {
        try { cb(previewing); } catch (_) { /* ignore */ }
      });
    };

    const syncLiteClass = () => {
      wrap?.classList.toggle("is-lite-preview", previewing);
      vditorRoot.classList.toggle("is-preview", previewing);
    };

    const renderLitePreview = (text) => {
      if (!previewBody || typeof global.Vditor?.preview !== "function") return;
      const seq = ++previewSeq;
      const sourceText = text ?? "";
      const restoreScroll = renderLitePreview._scrollTop;
      renderLitePreview._scrollTop = null;
      syncLiteClass();
      maybePreloadMermaid(cdn, sourceText);
      const run = () => {
        if (seq !== previewSeq) return;
        global.Vditor.preview(previewBody, sourceText, {
          cdn,
          lazyLoadImage,
          mode: "light",
          hljs: { style: "kimbie-dark", lineNumber: false },
          math: { engine: "KaTeX", inlineDigit: true },
          markdown: markdownOpts,
          after() {
            if (seq !== previewSeq) return;
            const root = previewHost || previewBody;
            stampMermaidSources(root, sourceText);
            enhanceMermaidPreviews(root);
            scheduleFitTables(root);
            if (typeof restoreScroll === "number" && previewBody) {
              previewBody.scrollTop = restoreScroll;
            }
            if (findState.open) runFind({ keepIndex: true, reveal: false });
            blockInsert.sync();
          },
        });
      };
      Promise.resolve(preloadLute(cdn)).then(run, run);
    };

    onThemeChange(() => {
      applyMermaidTheme();
      if (previewing) {
        if (previewBody) renderLitePreview._scrollTop = previewBody.scrollTop;
        renderLitePreview(markdown);
      } else {
        refreshMermaidDiagrams(vditorRoot);
      }
    });

    const bootEditor = () => {
      if (vditor) return Promise.resolve(vditor);
      if (vditorReady) return vditorReady;
      vditorReady = ensureFullVditor(cdn).then(() => new Promise((resolve) => {
        maybePreloadMermaid(cdn, markdown);
        vditor = new global.Vditor(elementId, {
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
            "edit-mode", "outline", "fullscreen",
          ],
          toolbarConfig: { pin: true, hide: false },
          preview: {
            delay: 800,
            maxWidth: 2400,
            actions: options.previewActions || [],
            theme: { current: "light" },
            hljs: { style: "kimbie-dark", lineNumber: false },
            math: { engine: "KaTeX", inlineDigit: true },
            markdown: markdownOpts,
            lazyLoadImage,
          },
          counter: {
            enable: true,
            type: "text",
            after: () => {
              if (previewing || muteInput) return;
              options.onCounter?.();
            },
          },
          input: () => {
            if (previewing || muteInput) return;
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
            watchMermaidPreviews(previewRoot);
            watchTables(vditorRoot);
            revealVditorIcons();
            blockInsert.sync();
            resolve(vditor);
          },
        });
      })).catch((err) => {
        vditorReady = null;
        throw err;
      });
      return vditorReady;
    };

    const applySnippet = (snippet, hover) => {
      const piece = String(snippet || "").replace(/^\n+/, "").replace(/\n+$/, "");
      if (!piece) return;
      maybePreloadMermaid(cdn, piece);
      if (previewing || !vditor) {
        const next = insertSnippetInMarkdown(
          markdown,
          hover?.emptyDoc ? 0 : (hover?.index ?? 0),
          piece,
          !!(hover?.empty || hover?.emptyDoc),
        );
        markdown = next;
        renderLitePreview(markdown);
        try { options.onInput?.(); } catch (_) { /* ignore */ }
        return;
      }
      const irRoot = vditorRoot.querySelector(".vditor-ir pre.vditor-reset")
        || vditorRoot.querySelector(".vditor-ir .vditor-reset");
      if (hover?.el && irRoot && irRoot.contains(hover.el)) {
        placeCaretAfter(hover.el);
      }
      try { vditor.focus(); } catch (_) { /* ignore */ }
      const md = (hover?.empty || hover?.emptyDoc) ? piece : `\n\n${piece}\n`;
      if (typeof vditor.insertMD === "function") {
        vditor.insertMD(md);
      } else if (typeof vditor.insertValue === "function") {
        vditor.insertValue(md, true);
      } else {
        const next = insertSnippetInMarkdown(
          vditor.getValue(),
          hover?.index ?? 0,
          piece,
          !!(hover?.empty || hover?.emptyDoc),
        );
        muteInput = true;
        vditor.setValue(next, false);
        setTimeout(() => { muteInput = false; }, 200);
        try { options.onInput?.(); } catch (_) { /* ignore */ }
      }
    };

    blockInsert = bindBlockInsert({
      getWrap: () => wrap,
      getPreviewBody: () => previewBody,
      getVditorRoot: () => vditorRoot,
      getPreviewing: () => previewing,
      insertSnippet: applySnippet,
    });
    activeBlockInsert = blockInsert;

    const api = {
      async setValue(text, clearStack = true) {
        markdown = text ?? "";
        if (previewing) {
          renderLitePreview(markdown);
          return;
        }
        muteInput = true;
        await bootEditor();
        vditor.setValue(markdown, clearStack);
        applyMermaidTheme();
        setTimeout(() => {
          muteInput = false;
          enhanceMermaidPreviews(vditorRoot);
          scheduleFitTables(vditorRoot);
          if (findState.open) runFind({ keepIndex: true, reveal: false });
          blockInsert.sync();
        }, 400);
      },
      getValue() {
        if (previewing || !vditor) return markdown;
        clearMolanTableLayout(vditorRoot);
        const value = vditor.getValue();
        scheduleFitTables(vditorRoot);
        return value;
      },
      focus() {
        if (previewing || !vditor) return;
        try { vditor.focus(); } catch (_) { /* ignore */ }
      },
      isPreview() {
        return previewing;
      },
      async setPreview(on) {
        const want = Boolean(on);
        if (want === previewing) return previewing;
        if (want) {
          if (vditor) {
            try { markdown = vditor.getValue(); } catch (_) { /* ignore */ }
          }
          previewing = true;
          blockInsert.hide();
          renderLitePreview(markdown);
          notifyPreview();
          return true;
        }
        previewing = false;
        muteInput = true;
        blockInsert.hide();
        syncLiteClass();
        await bootEditor();
        vditor.setValue(markdown, true);
        applyMermaidTheme();
        setTimeout(() => {
          muteInput = false;
          enhanceMermaidPreviews(vditorRoot);
          scheduleFitTables(vditorRoot);
          if (findState.open) runFind({ keepIndex: true, reveal: false });
          blockInsert.sync();
        }, 400);
        notifyPreview();
        return false;
      },
      onPreviewChange(cb) {
        if (typeof cb !== "function") return () => {};
        previewListeners.push(cb);
        return () => {
          const i = previewListeners.indexOf(cb);
          if (i >= 0) previewListeners.splice(i, 1);
        };
      },
      getVditor() {
        return vditor;
      },
    };

    syncLiteClass();
    if (options.defaultPreview === false) {
      return bootEditor().then(() => {
        options.onReady?.(api);
        return api;
      });
    }
    options.onReady?.(api);
    return Promise.resolve(api);
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
    type: {
      open: openType,
      close: closeType,
    },
    prefs: {
      open: openHeaderPrefs,
      close: closeHeaderPrefs,
    },
  };

  applyStoredType();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initFind();
      initType();
      initTheme();
      initHeaderPrefs();
    });
  } else {
    initFind();
    initType();
    initTheme();
    initHeaderPrefs();
  }
})(window);

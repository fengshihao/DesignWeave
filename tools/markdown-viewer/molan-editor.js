/**
 * 墨览编辑器核心：Vditor 初始化、Mermaid 主题、流程图工具条与灯箱。
 * 浏览器工作室与 VSCode 扩展共用。
 */
(function (global) {
  const DEFAULT_CDN = "https://cdn.jsdelivr.net/npm/vditor@3.10.9";

  const MERMAID_OPTS = {
    startOnLoad: false,
    theme: "base",
    securityLevel: "loose",
    flowchart: { htmlLabels: true, useMaxWidth: true },
    themeVariables: {
      primaryColor: "#f4efe6",
      primaryTextColor: "#1c1914",
      primaryBorderColor: "#d4773b",
      lineColor: "#6b5e4e",
      secondaryColor: "#ebe4d6",
      tertiaryColor: "#ffffff",
      background: "#ffffff",
      mainBkg: "#f4efe6",
      nodeBorder: "#d4773b",
      clusterBkg: "#ebe4d6",
      titleColor: "#1c1914",
      edgeLabelBackground: "#faf7f1",
      fontFamily: '"DM Sans", "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif',
    },
  };

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
      mermaid.initialize(MERMAID_OPTS);
      return true;
    } catch (_) {
      return false;
    }
  }

  function patchMermaidInitialize() {
    if (!global.mermaid || mermaid.__molanPatched) return;
    const raw = mermaid.initialize.bind(mermaid);
    mermaid.initialize = (opts = {}) =>
      raw({
        ...opts,
        ...MERMAID_OPTS,
        themeVariables: {
          ...(opts.themeVariables || {}),
          ...MERMAID_OPTS.themeVariables,
        },
      });
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
        openFromSvg() { toast("流程图尚未渲染完成"); },
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
        toast("流程图尚未渲染完成");
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
      toast("流程图尚未渲染完成");
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
        toast("已复制流程图图片");
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "diagram.png";
        a.click();
        toast("当前环境不支持复制图片，已改为下载");
      }
    } catch (err) {
      console.warn(err);
      toast("复制图片失败");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function getMermaidSourceNear(previewEl) {
    const node = previewEl?.closest?.(".vditor-ir__node");
    const marker = node?.querySelector?.(".vditor-ir__marker--pre code.language-mermaid");
    if (marker?.textContent?.trim()) return marker.textContent.trim();
    const code = previewEl?.querySelector?.("code.language-mermaid, .language-mermaid");
    if (!code) return "";
    if (code.getAttribute?.("data-processed")) return marker?.textContent?.trim() || "";
    return (code.textContent || "").trim();
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
      toast("无法进入编辑");
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
      toast("已进入源码编辑，点空白处退出");
    } catch (err) {
      console.warn(err);
      toast("无法进入编辑");
    }
  }

  function enhanceMermaidPreviews(root = document) {
    const codes = root.querySelectorAll(".language-mermaid");
    codes.forEach((code) => {
      const shell = code.closest(".vditor-ir__preview") || code.closest("pre") || code;
      if (!shell || shell.querySelector(":scope > .molan-diagram-toolbar")) return;
      if (!shell.querySelector("svg")) return;
      if (getComputedStyle(shell).position === "static") shell.style.position = "relative";
      shell.classList.add("molan-mermaid-shell");
      const bar = document.createElement("div");
      bar.className = "molan-diagram-toolbar";
      bar.innerHTML = `
        <button type="button" class="icon-btn" data-molan-action="edit" title="编辑源码" aria-label="编辑源码">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
        </button>
        <button type="button" class="icon-btn" data-molan-action="zoom" title="观看（拖动/缩放）" aria-label="观看流程图">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H5a2 2 0 0 0-2 2v4"/><path d="M15 3h4a2 2 0 0 1 2 2v4"/><path d="M9 21H5a2 2 0 0 1-2-2v-4"/><path d="M15 21h4a2 2 0 0 0 2-2v-4"/></svg>
        </button>
        <button type="button" class="icon-btn" data-molan-action="copy-code" title="复制代码" aria-label="复制代码">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2"/><rect x="4" y="8" width="12" height="12" rx="2"/></svg>
        </button>
        <button type="button" class="icon-btn" data-molan-action="copy-image" title="复制图片" aria-label="复制图片">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M3 16l5-4 4 3 3-2 6 5"/></svg>
        </button>
      `;
      shell.appendChild(bar);
    });
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
        watchMermaidPreviews._t = setTimeout(() => enhanceMermaidPreviews(root), 120);
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
          toast("未找到流程图源码");
          return;
        }
        try {
          await navigator.clipboard.writeText(text);
          toast("已复制流程图代码");
        } catch {
          toast("复制失败");
        }
      }
    }, true);
  }

  function create(options = {}) {
    const elementId = options.elementId || "vditor";
    const cdn = options.cdn || DEFAULT_CDN;
    const placeholder = options.placeholder || "开始编辑 Markdown…";
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
              setTimeout(() => enhanceMermaidPreviews(document.getElementById(elementId)), 400);
            },
            getValue() {
              return vditor.getValue();
            },
            focus() {
              try { vditor.focus(); } catch (_) { /* ignore */ }
            },
            isPreview,
            setPreview,
            onPreviewChange(cb) {
              const btn = previewBtn();
              if (!btn || typeof cb !== "function") return () => {};
              const obs = new MutationObserver(() => cb(isPreview()));
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
    enhanceMermaidPreviews,
    watchMermaidPreviews,
  };
})(window);

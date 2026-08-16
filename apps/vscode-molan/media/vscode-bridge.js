/**
 * VSCode webview ↔ 墨览编辑器桥：把 Vditor 的内容同步给扩展宿主。
 * 打开后默认预览（只读）；点「编辑」后，只有用户真正改过 Markdown 才通知宿主标脏。
 */
(function () {
  const vscode = acquireVsCodeApi();
  const toast = (msg) => window.MolanEditor.toast(msg);
  const countWords = (text) => window.MolanEditor.countWords(text);

  const readerTitle = document.getElementById("readerTitle");
  const statusLeft = document.getElementById("statusLeft");
  const statusRight = document.getElementById("statusRight");
  const copyBtn = document.getElementById("copyBtn");
  const modeBtn = document.getElementById("modeBtn");

  let editorApi = null;
  let editorReady = null;
  let applyingRemote = false;
  let currentFileName = "";
  let dirty = false;
  let baseline = "";

  function setChrome({ fileName, value, isDirty }) {
    if (fileName) {
      currentFileName = fileName;
      readerTitle.textContent = fileName.replace(/\.(md|markdown|mdx|mdown)$/i, "");
    }
    if (typeof isDirty === "boolean") dirty = isDirty;
    statusLeft.textContent = currentFileName || "墨览";
    const text = value ?? (editorApi ? editorApi.getValue() : "");
    statusRight.textContent = `${countWords(text)} 字`;
    syncModeButton();
  }

  function syncModeButton() {
    if (!modeBtn) return;
    const preview = editorApi?.isPreview?.() ?? false;
    modeBtn.classList.toggle("is-preview", preview);
    const label = preview ? "编辑" : "预览";
    modeBtn.title = label;
    modeBtn.setAttribute("aria-label", label);
  }

  let editorIdleTimer = 0;
  function scheduleEditorIdleWork() {
    clearTimeout(editorIdleTimer);
    editorIdleTimer = setTimeout(() => {
      if (applyingRemote || !editorApi) return;
      const value = editorApi.getValue();
      const isDirty = value !== baseline;
      setChrome({ value, isDirty });
      if (isDirty) vscode.postMessage({ type: "change", value });
    }, 180);
  }

  function ensureEditor() {
    if (editorApi) return Promise.resolve(editorApi);
    if (editorReady) return editorReady;
    editorReady = window.MolanEditor.create({
      elementId: "vditor",
      cdn: window.__MOLAN_VDITOR_CDN__,
      linkBase: window.__MOLAN_LINK_BASE__ || "",
      previewActions: [],
      onInput: () => {
        if (applyingRemote) return;
        if (editorApi?.isPreview?.()) return;
        scheduleEditorIdleWork();
      },
      onCounter: () => {
        if (applyingRemote || !editorApi || editorApi.isPreview?.()) return;
        setChrome({ value: editorApi.getValue() });
      },
      onSave: () => vscode.postMessage({ type: "save" }),
    }).then((api) => {
      editorApi = api;
      api.onPreviewChange?.(() => syncModeButton());
      return api;
    });
    return editorReady;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function applyHostContent(msg) {
    const api = await ensureEditor();
    clearTimeout(editorIdleTimer);
    applyingRemote = true;
    const incoming = msg.value ?? "";
    await api.setPreview(true);
    await api.setValue(incoming, true);
    if (!api.isPreview()) {
      await wait(480);
    }
    baseline = api.getValue();
    applyingRemote = false;
    setChrome({
      fileName: msg.fileName || currentFileName,
      value: incoming,
      isDirty: !!msg.dirty,
    });
  }

  window.addEventListener("message", async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "init" || msg.type === "setContent") {
      await applyHostContent(msg);
      return;
    }

    if (msg.type === "saved") {
      if (editorApi) baseline = editorApi.getValue();
      setChrome({ value: baseline, isDirty: false });
      toast("已保存");
    }

    if (msg.type === "find") {
      window.MolanEditor.find?.open();
      return;
    }
    if (msg.type === "findNext") {
      window.MolanEditor.find?.next();
      return;
    }
    if (msg.type === "findPrev") {
      window.MolanEditor.find?.prev();
      return;
    }
  });

  copyBtn?.addEventListener("click", async () => {
    if (!editorApi) return;
    try {
      await navigator.clipboard.writeText(editorApi.getValue());
      copyBtn.classList.remove("is-pulse");
      void copyBtn.offsetWidth;
      copyBtn.classList.add("is-pulse");
      toast("已复制 Markdown 原文");
    } catch {
      toast("复制失败");
    }
  });

  modeBtn?.addEventListener("click", async () => {
    if (!editorApi) return;
    const nextPreview = !editorApi.isPreview();
    await editorApi.setPreview(nextPreview);
    syncModeButton();
    const wrap = document.getElementById("editorWrap");
    if (wrap) {
      wrap.classList.remove("is-mode");
      void wrap.offsetWidth;
      wrap.classList.add("is-mode");
    }
    if (!nextPreview) {
      try { editorApi.focus(); } catch (_) { /* ignore */ }
    }
  });

  document.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && key === "s") {
      e.preventDefault();
      vscode.postMessage({ type: "save" });
    }
  });

  vscode.postMessage({ type: "ready" });

  const MD_LINK = /\.(md|markdown|mdx|mdown)([?#]|$)/i;

  function isMarkdownHref(href) {
    const pathPart = String(href || "").split("#")[0].split("?")[0];
    return MD_LINK.test(pathPart);
  }

  function relativeToLinkBase(href) {
    const linkBase = window.__MOLAN_LINK_BASE__ || "";
    const raw = String(href || "").trim();
    if (!raw || !linkBase) return raw;
    try {
      const target = new URL(raw, linkBase);
      const base = new URL(linkBase);
      if (target.origin !== base.origin) return raw;
      const tParts = decodeURIComponent(target.pathname).split("/").filter(Boolean);
      const bParts = decodeURIComponent(base.pathname).split("/").filter(Boolean);
      let i = 0;
      while (i < tParts.length && i < bParts.length && tParts[i] === bParts[i]) i += 1;
      const rel = [...Array(bParts.length - i).fill(".."), ...tParts.slice(i)].join("/");
      return rel + target.search + target.hash;
    } catch (_) {
      return raw.startsWith(linkBase) ? raw.slice(linkBase.length) : raw;
    }
  }

  function isExternalHttp(href) {
    if (!/^https?:/i.test(href)) return false;
    const linkBase = window.__MOLAN_LINK_BASE__ || "";
    if (!linkBase) return true;
    try {
      return new URL(href, linkBase).origin !== new URL(linkBase).origin;
    } catch (_) {
      return true;
    }
  }

  document.getElementById("editorWrap")?.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const a = e.target.closest("a[href]");
    if (!a) return;
    const attr = a.getAttribute("href") || "";
    if (/^javascript:/i.test(attr)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (/^(mailto:|tel:)/i.test(attr)) return;
    if (isExternalHttp(attr)) {
      e.preventDefault();
      e.stopPropagation();
      vscode.postMessage({ type: "openExternal", value: attr });
      return;
    }
    const rel = relativeToLinkBase(attr || a.href);
    if (rel.startsWith("#")) return;
    if (!isMarkdownHref(rel) && !isMarkdownHref(attr) && !isMarkdownHref(a.href)) return;
    e.preventDefault();
    e.stopPropagation();
    vscode.postMessage({ type: "openRelative", value: rel || attr });
  }, true);
})();

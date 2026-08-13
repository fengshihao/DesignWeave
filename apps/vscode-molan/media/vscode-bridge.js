/**
 * VSCode webview ↔ 墨览编辑器桥：把 Vditor 的内容同步给扩展宿主。
 * 打开后默认编辑；只有用户真正改过 Markdown 才通知宿主标脏。
 */
(function () {
  const vscode = acquireVsCodeApi();
  const toast = (msg) => window.MolanEditor.toast(msg);
  const countWords = (text) => window.MolanEditor.countWords(text);

  const readerTitle = document.getElementById("readerTitle");
  const readerEyebrow = document.getElementById("readerEyebrow");
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
    readerEyebrow.classList.toggle("dirty", dirty);
    readerEyebrow.textContent = dirty ? "未保存" : "已同步";
    statusLeft.textContent = currentFileName || "墨览";
    const text = value ?? (editorApi ? editorApi.getValue() : "");
    statusRight.textContent = `${countWords(text)} 字 · ${dirty ? "未保存" : "已同步"}`;
    syncModeButton();
  }

  function syncModeButton() {
    if (!modeBtn) return;
    const preview = editorApi?.isPreview?.() ?? false;
    modeBtn.textContent = preview ? "编辑" : "预览";
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
        scheduleEditorIdleWork();
      },
      onCounter: () => {
        if (applyingRemote || !editorApi) return;
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
    api.setValue(incoming, true);
    // 等 Vditor undoDelay(200) + 流程图增强(400)，避免 setValue 往返被当成一次编辑。
    await wait(480);
    baseline = api.getValue();
    applyingRemote = false;
    if (msg.type === "setContent" && api.isPreview()) {
      api.setPreview(true);
    }
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
  });

  copyBtn?.addEventListener("click", async () => {
    if (!editorApi) return;
    try {
      await navigator.clipboard.writeText(editorApi.getValue());
      toast("已复制 Markdown 原文");
    } catch {
      toast("复制失败");
    }
  });

  modeBtn?.addEventListener("click", () => {
    if (!editorApi) return;
    const nextPreview = !editorApi.isPreview();
    editorApi.setPreview(nextPreview);
    syncModeButton();
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
})();

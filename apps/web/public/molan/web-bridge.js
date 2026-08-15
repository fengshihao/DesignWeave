/**
 * 工作台宿主 ↔ 墨览：postMessage。
 * 只编辑字符串；写回由外层页面走服务端 PUT。
 */
(function () {
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
  let readOnly = false;

  function post(msg) {
    window.parent.postMessage(msg, window.location.origin);
  }

  function setChrome({ fileName, value, isDirty }) {
    if (fileName) {
      currentFileName = fileName;
      readerTitle.textContent = fileName.replace(/\.(md|markdown|mdx|mdown)$/i, "");
    }
    if (typeof isDirty === "boolean") dirty = isDirty;
    readerEyebrow.classList.toggle("dirty", dirty);
    readerEyebrow.textContent = dirty ? "未保存" : readOnly ? "只读" : "已同步";
    statusLeft.textContent = currentFileName || "墨览";
    const text = value ?? (editorApi ? editorApi.getValue() : "");
    statusRight.textContent = `${countWords(text)} 字 · ${dirty ? "未保存" : readOnly ? "只读" : "已同步"}`;
    syncModeButton();
  }

  function syncModeButton() {
    if (!modeBtn) return;
    const preview = editorApi?.isPreview?.() ?? true;
    modeBtn.classList.toggle("is-preview", preview);
    const label = preview ? "编辑" : "预览";
    modeBtn.title = label;
    modeBtn.setAttribute("aria-label", label);
    document.body.classList.toggle("is-readonly", readOnly);
  }

  let editorIdleTimer = 0;
  function scheduleEditorIdleWork() {
    clearTimeout(editorIdleTimer);
    editorIdleTimer = setTimeout(() => {
      if (applyingRemote || !editorApi || readOnly) return;
      const value = editorApi.getValue();
      const isDirty = value !== baseline;
      setChrome({ value, isDirty });
      if (isDirty) post({ type: "change", value, dirty: true });
      post({ type: "previewChange", isPreview: editorApi.isPreview() });
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
        if (applyingRemote || readOnly) return;
        if (editorApi?.isPreview?.()) return;
        scheduleEditorIdleWork();
      },
      onCounter: () => {
        if (applyingRemote || !editorApi || editorApi.isPreview?.()) return;
        setChrome({ value: editorApi.getValue() });
      },
      onSave: () => {
        if (readOnly) return;
        post({ type: "save" });
      },
    }).then((api) => {
      editorApi = api;
      api.onPreviewChange?.(() => {
        syncModeButton();
        post({ type: "previewChange", isPreview: api.isPreview() });
      });
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
    readOnly = Boolean(msg.readOnly);
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
    document.body.classList.toggle("is-readonly", readOnly);
    post({ type: "previewChange", isPreview: true });
  }

  async function applyReadOnly(next) {
    readOnly = Boolean(next);
    document.body.classList.toggle("is-readonly", readOnly);
    if (readOnly && editorApi && !editorApi.isPreview()) {
      await editorApi.setPreview(true);
    }
    setChrome({ value: editorApi ? editorApi.getValue() : undefined });
    post({ type: "previewChange", isPreview: editorApi ? editorApi.isPreview() : true });
  }

  window.addEventListener("message", async (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.source !== window.parent) return;
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "init" || msg.type === "setContent") {
      await applyHostContent(msg);
      return;
    }
    if (msg.type === "setReadOnly") {
      await applyReadOnly(msg.readOnly);
      return;
    }
    if (msg.type === "saved") {
      if (editorApi) baseline = editorApi.getValue();
      setChrome({ value: baseline, isDirty: false });
      toast("已保存");
      post({ type: "change", value: baseline, dirty: false });
      return;
    }
    if (msg.type === "getState") {
      const value = editorApi ? editorApi.getValue() : "";
      post({
        type: "state",
        requestId: msg.requestId,
        value,
        dirty: value !== baseline,
        isPreview: editorApi ? editorApi.isPreview() : true,
      });
      return;
    }
    if (msg.type === "exitEdit") {
      if (editorApi && !editorApi.isPreview()) {
        await editorApi.setPreview(true);
      }
      post({ type: "previewChange", isPreview: true });
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
    if (!editorApi || readOnly) return;
    const nextPreview = !editorApi.isPreview();
    await editorApi.setPreview(nextPreview);
    syncModeButton();
    post({ type: "previewChange", isPreview: nextPreview });
    if (!nextPreview) {
      try { editorApi.focus(); } catch (_) { /* ignore */ }
    }
  });

  document.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && key === "s") {
      e.preventDefault();
      if (!readOnly) post({ type: "save" });
    }
  });

  post({ type: "ready" });
})();

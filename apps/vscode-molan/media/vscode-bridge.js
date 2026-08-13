/**
 * VSCode webview ↔ 墨览编辑器桥：把 Vditor 的内容同步给扩展宿主。
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
  }

  let editorIdleTimer = 0;
  function scheduleEditorIdleWork() {
    clearTimeout(editorIdleTimer);
    editorIdleTimer = setTimeout(() => {
      if (applyingRemote || !editorApi) return;
      const value = editorApi.getValue();
      const isDirty = value !== baseline;
      setChrome({ value, isDirty });
      vscode.postMessage({ type: "change", value });
    }, 180);
  }

  function ensureEditor() {
    if (editorApi) return Promise.resolve(editorApi);
    if (editorReady) return editorReady;
    editorReady = window.MolanEditor.create({
      elementId: "vditor",
      cdn: window.__MOLAN_VDITOR_CDN__,
      linkBase: window.__MOLAN_LINK_BASE__ || "",
      onInput: () => {
        if (applyingRemote) return;
        if (!dirty) setChrome({ isDirty: true });
        scheduleEditorIdleWork();
      },
      onCounter: () => scheduleEditorIdleWork(),
      onSave: () => vscode.postMessage({ type: "save" }),
    }).then((api) => {
      editorApi = api;
      return api;
    });
    return editorReady;
  }

  window.addEventListener("message", async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "init" || msg.type === "setContent") {
      const api = await ensureEditor();
      clearTimeout(editorIdleTimer);
      applyingRemote = true;
      baseline = msg.value ?? "";
      api.setValue(baseline, true);
      applyingRemote = false;
      setChrome({
        fileName: msg.fileName || currentFileName,
        value: baseline,
        isDirty: !!msg.dirty,
      });
      if (msg.type === "init") {
        try { api.focus(); } catch (_) { /* ignore */ }
      }
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

  document.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && key === "s") {
      e.preventDefault();
      vscode.postMessage({ type: "save" });
    }
  });

  vscode.postMessage({ type: "ready" });
})();

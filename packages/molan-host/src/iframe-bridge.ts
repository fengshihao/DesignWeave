/**
 * Web 工作台 iframe ↔ 墨览编辑器桥。
 * 消息类型见 @designweave/molan-protocol。
 */
import type { EditorApi } from "@designweave/molan-protocol";
import { createBridgeCore } from "./core.js";

declare global {
  interface Window {
    MolanEditor: {
      create(options: Record<string, unknown>): Promise<EditorApi>;
      toast(msg: string): void;
      countWords(text: string): number;
    };
    __MOLAN_VDITOR_CDN__?: string;
    __MOLAN_LINK_BASE__?: string;
  }
}

function bootIframeBridge() {
  const toast = (msg: string) => window.MolanEditor.toast(msg);
  const countWords = (text: string) => window.MolanEditor.countWords(text);

  let editorReady: Promise<EditorApi> | null = null;

  const bridge = createBridgeCore({
    chrome: {
      readerTitle: document.getElementById("readerTitle"),
      readerEyebrow: document.getElementById("readerEyebrow"),
      statusLeft: document.getElementById("statusLeft"),
      statusRight: document.getElementById("statusRight"),
      modeBtn: document.getElementById("modeBtn"),
    },
    post: (msg) => window.parent.postMessage(msg, window.location.origin),
    toast,
    countWords,
    readOnlyFeatures: true,
    ensureEditor: () => {
      if (bridge.editorApi) return Promise.resolve(bridge.editorApi);
      if (editorReady) return editorReady;
      editorReady = window.MolanEditor.create({
        elementId: "vditor",
        cdn: window.__MOLAN_VDITOR_CDN__,
        linkBase: window.__MOLAN_LINK_BASE__ || "",
        previewActions: [],
        onInput: () => bridge.onEditorInput(),
        onCounter: () => bridge.onEditorCounter(),
        onSave: () => {
          if (bridge.readOnly) return;
          window.parent.postMessage({ type: "save" }, window.location.origin);
        },
      }).then((api) => {
        bridge.bindEditor(api);
        return api;
      });
      return editorReady;
    },
  });

  window.addEventListener("message", async (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.source !== window.parent) return;
    await bridge.handleHostMessage(event.data);
  });

  document.getElementById("copyBtn")?.addEventListener("click", async () => {
    if (!bridge.editorApi) return;
    try {
      await navigator.clipboard.writeText(bridge.editorApi.getValue());
      const copyBtn = document.getElementById("copyBtn");
      copyBtn?.classList.remove("is-pulse");
      void copyBtn?.offsetWidth;
      copyBtn?.classList.add("is-pulse");
      toast("已复制 Markdown 原文");
    } catch {
      toast("复制失败");
    }
  });

  document.getElementById("modeBtn")?.addEventListener("click", async () => {
    if (!bridge.editorApi) return;
    if (bridge.readOnly) {
      window.parent.postMessage({ type: "wantEdit" }, window.location.origin);
      return;
    }
    const nextPreview = !bridge.editorApi.isPreview();
    await bridge.editorApi.setPreview(nextPreview);
    bridge.syncModeButton();
    window.parent.postMessage({ type: "previewChange", isPreview: nextPreview }, window.location.origin);
    if (!nextPreview) {
      try {
        bridge.editorApi.focus();
      } catch {
        /* ignore */
      }
    }
  });

  document.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && key === "s") {
      e.preventDefault();
      if (!bridge.readOnly) {
        window.parent.postMessage({ type: "save" }, window.location.origin);
      }
    }
  });

  window.parent.postMessage({ type: "ready" }, window.location.origin);
}

bootIframeBridge();

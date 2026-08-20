import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { createBridgeCore } from "./core.js";
import type { EditorApi } from "@designweave/molan-protocol";

beforeEach(() => {
  (globalThis as { document?: { body: { classList: { toggle: () => void } } } }).document = {
    body: { classList: { toggle: () => {} } },
  };
});

function mockEl(id: string) {
  return {
    id,
    textContent: "",
    title: "",
    classList: {
      _set: new Set<string>(),
      toggle(name: string, on?: boolean) {
        if (on === undefined) {
          if (this._set.has(name)) this._set.delete(name);
          else this._set.add(name);
        } else if (on) this._set.add(name);
        else this._set.delete(name);
      },
    },
    setAttribute(_name: string, _value: string) {},
  } as unknown as HTMLElement;
}

function mockEditor(value = "# hello"): EditorApi {
  let preview = true;
  return {
    getValue: () => value,
    setValue: async (next: string) => {
      value = next;
    },
    setPreview: async (p: boolean) => {
      preview = p;
      return preview;
    },
    isPreview: () => preview,
    focus: () => {},
    onPreviewChange: () => () => {},
  };
}

test("createBridgeCore applyHostContent 同步 baseline 与 chrome", async () => {
  const posts: unknown[] = [];
  const readerTitle = mockEl("readerTitle");
  const readerEyebrow = mockEl("readerEyebrow");
  const statusRight = mockEl("statusRight");

  const bridge = createBridgeCore({
    chrome: { readerTitle, readerEyebrow, statusRight },
    post: (msg) => posts.push(msg),
    toast: () => {},
    countWords: (t) => t.length,
    readOnlyFeatures: true,
    ensureEditor: async () => mockEditor("初始"),
  });

  await bridge.applyHostContent({
    type: "init",
    value: "# 标题\n\n正文",
    fileName: "demo.md",
    readOnly: true,
    dirty: false,
  });

  assert.equal(readerTitle.textContent, "demo");
  assert.equal(readerEyebrow.textContent, "只读");
  assert.match(String(statusRight.textContent), /字 · 只读/);
  assert.equal(bridge.readOnly, true);
  assert.ok(posts.some((m) => (m as { type?: string }).type === "previewChange"));
});

test("createBridgeCore handleSaved 清 dirty", async () => {
  const readerEyebrow = mockEl("readerEyebrow");
  const bridge = createBridgeCore({
    chrome: { readerEyebrow },
    post: () => {},
    toast: () => {},
    countWords: (t) => t.length,
    readOnlyFeatures: true,
    ensureEditor: async () => mockEditor("saved"),
  });

  await bridge.applyHostContent({
    type: "init",
    value: "saved",
    fileName: "a.md",
    dirty: true,
  });
  await bridge.handleSaved();
  assert.equal(readerEyebrow.textContent, "已同步");
});

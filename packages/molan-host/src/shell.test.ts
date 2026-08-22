import assert from "node:assert/strict";
import { test } from "node:test";
import { renderInlineShell } from "./shell.js";

test("renderInlineShell 含 reader-header 与 vditor 容器", () => {
  const html = renderInlineShell();
  assert.match(html, /reader-header/);
  assert.match(html, /readerEyebrow/);
  assert.match(html, /id="vditor"/);
  assert.match(html, /id="lightbox"/);
  assert.match(html, /id="lightboxEdit"/);
  assert.match(html, /theme-switch/);
});

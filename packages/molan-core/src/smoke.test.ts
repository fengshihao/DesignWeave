import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("molan-editor.js 导出 MolanEditor.create", () => {
  const src = readFileSync(join(root, "src", "molan-editor.js"), "utf8");
  assert.match(src, /MolanEditor\.create|global\.MolanEditor\s*=/);
  assert.match(src, /function create\(/);
  assert.match(src, /sourceViewBtn/);
  assert.match(src, /function openSourceView/);
  assert.doesNotMatch(src, /editModeBtn/);
});

test("molan.css 含四主题变量", () => {
  const css = readFileSync(join(root, "src", "molan.css"), "utf8");
  for (const theme of ["night", "hack", "rose", "xuan"]) {
    assert.match(css, new RegExp(`data-theme="${theme}"|\\[data-theme=${theme}\\]`));
  }
  assert.match(css, /molan-source-view/);
  assert.doesNotMatch(css, /#editModeBtn/);
});

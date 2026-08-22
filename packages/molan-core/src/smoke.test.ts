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
  assert.match(src, /function exportPdf\(/);
  assert.match(src, /function exportPng\(/);
  assert.match(src, /function rasterizePreviewPng\(/);
  assert.match(src, /function isUnsafePrintHost\(/);
  assert.match(src, /function downloadPrintableHtml\(/);
  assert.match(src, /molan-print-doc/);
  assert.match(src, /function isolatePreviewForPrint\(/);
  assert.match(src, /M9 7\.5 4\.5 12 9 16\.5/);
  assert.doesNotMatch(src, /rect x="5\.5" y="3\.5" width="13" height="17"/);
  assert.match(src, /exportPdfUseBrowser/);
  assert.match(src, /if \(unsafePrint\) \{[\s\S]*?downloadPrintableHtml[\s\S]*?return;[\s\S]*?window\.print\(\)/);
  assert.match(src, /sourceViewBtn/);
  assert.match(src, /function openSourceView/);
  assert.match(src, /TYPE_FONTS/);
  assert.match(src, /notoSerif/);
  assert.match(src, /--reader-font/);
  assert.match(src, /data-type-font/);
  assert.match(src, /type-row-fonts/);
  assert.doesNotMatch(src, /editModeBtn/);
});

test("molan.css 含四主题变量", () => {
  const css = readFileSync(join(root, "src", "molan.css"), "utf8");
  for (const theme of ["night", "hack", "rose", "xuan"]) {
    assert.match(css, new RegExp(`data-theme="${theme}"|\\[data-theme=${theme}\\]`));
  }
  assert.match(css, /@media print/);
  assert.match(css, /break-inside:\s*auto/);
  assert.match(css, /max-height:\s*220mm/);
  assert.match(css, /\.export-menu/);
  assert.match(css, /molan-source-view/);
  assert.match(css, /molan-mermaid-editor-zoom/);
  assert.match(css, /--reader-font/);
  assert.match(css, /--reader-heading/);
  assert.match(css, /\.type-fonts/);
  assert.match(css, /\.type-row-fonts/);
  assert.match(css, /\.molan-mermaid-editor \{[\s\S]*width:\s*min\(96vw,\s*1400px\)/);
  assert.match(css, /\.molan-mermaid-editor \{[\s\S]*height:\s*min\(90vh,\s*900px\)/);
  assert.doesNotMatch(css, /#editModeBtn/);
});

test("编辑态能修好并删除空任务列表", () => {
  const src = readFileSync(join(root, "src", "molan-editor.js"), "utf8");
  assert.match(src, /function withMutedIrInput/);
  assert.match(src, /function normalizeInsertedTaskList/);
  assert.match(src, /function taskListIrHtml/);
  assert.match(src, /function bindIrListGuards/);
  assert.match(src, /ir\.preventInput = true/);
  assert.match(src, /listIsHusk/);
  assert.match(src, /vditor-task/);
  assert.match(src, /\\\[\[ xX\]\?\\\]/);
  assert.match(src, /function sweepOrphanIrNodes/);
  assert.match(src, /irNodeIsOrphanPreview/);
  assert.match(src, /blockIsHusk/);
  assert.match(src, /event\.key === "Enter"/);
});

test("流程图编辑器预览只缩放不打开灯箱", () => {
  const src = readFileSync(join(root, "src", "molan-editor.js"), "utf8");
  assert.match(src, /molan-mermaid-editor-zoom-in/);
  assert.match(src, /molan-mermaid-editor-zoom-out/);
  assert.match(src, /setPreviewScale/);
  assert.match(src, /lightboxEdit/);
  assert.match(src, /setOnEdit/);
  assert.doesNotMatch(src, /molan-mermaid-editor-copy/);
  assert.doesNotMatch(src, /lightbox\?\.openFromSvg/);
});

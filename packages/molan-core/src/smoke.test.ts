import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { EDITOR_MODULES, editorDir, readEditorBody, wrapEditorIife } from "../scripts/editor-modules.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const editorSrc = () => readEditorBody(root);

test("编辑器源码按职责拆模块，构建仍产出单文件 IIFE", () => {
  const dir = editorDir(root);
  const listed = new Set(EDITOR_MODULES);
  const onDisk = readdirSync(dir).filter((name) => name.endsWith(".js"));
  assert.deepEqual(onDisk.sort(), [...listed].sort(), "src/editor 与模块清单一致");
  for (const name of EDITOR_MODULES) {
    const lines = readFileSync(join(dir, name), "utf8").split("\n").length;
    assert.ok(lines < 700, `${name} 应保持可维护体量，当前 ${lines} 行`);
  }
  assert.equal(onDisk.length, EDITOR_MODULES.length);
  assert.equal(existsSync(join(root, "src", "molan-editor.js")), false, "不再把单文件 IIFE 当源码");
  const bundled = wrapEditorIife(editorSrc());
  assert.match(bundled, /^\(function \(global\) \{/m);
  assert.match(bundled, /\}\)\(window\);\s*$/);
  assert.match(bundled, /global\.MolanEditor\s*=/);
});

test("molan-editor.js 导出 MolanEditor.create", () => {
  const src = editorSrc();
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
  assert.match(src, /typeFontToggle/);
  assert.match(src, /fontsOpen/);
  assert.match(src, /function setTypeFontsOpen/);
  assert.match(src, /data-type-font/);
  assert.match(src, /type-row-fonts/);
  assert.match(src, /function scheduleTypeFontPreviews/);
  assert.doesNotMatch(src, /function afterTypeMenuOpened/);
  assert.doesNotMatch(src, /TYPE_FONT_ORDER\.forEach\(loadReaderFont\)/);
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
  assert.match(css, /\.type-font-toggle/);
  assert.match(css, /\.type-fonts\[hidden\]/);
  {
    const prefsIn = css.match(/@keyframes molan-prefs-in \{[\s\S]*?\n    \}/);
    assert.ok(prefsIn, "extract molan-prefs-in");
    assert.match(prefsIn[0], /filter: blur/);
    const typeMenu = css.match(/    \.type-menu \{[\s\S]*?\n    \}/);
    assert.ok(typeMenu, "extract .type-menu");
    assert.match(typeMenu[0], /backdrop-filter: blur\(10px\)/);
  }
  assert.match(css, /\.molan-mermaid-editor \{[\s\S]*width:\s*min\(96vw,\s*1400px\)/);
  assert.match(css, /\.molan-mermaid-editor \{[\s\S]*height:\s*min\(90vh,\s*900px\)/);
  assert.doesNotMatch(css, /#editModeBtn/);
});

test("编辑态能修好并删除空任务列表", () => {
  const src = editorSrc();
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
  const src = editorSrc();
  assert.match(src, /molan-mermaid-editor-zoom-in/);
  assert.match(src, /molan-mermaid-editor-zoom-out/);
  assert.match(src, /setPreviewScale/);
  assert.match(src, /lightboxEdit/);
  assert.match(src, /setOnEdit/);
  assert.doesNotMatch(src, /molan-mermaid-editor-copy/);
  assert.doesNotMatch(src, /lightbox\?\.openFromSvg/);
});

test("灯箱大图按 SVG 尺寸缩放，不用 CSS scale，并去掉 foreignObject", () => {
  const src = editorSrc();
  const css = readFileSync(join(root, "src", "molan.css"), "utf8");
  assert.match(src, /function uniquifySvgIds/);
  assert.match(src, /function vectorizeSvgForeignObjects/);
  assert.match(src, /function placeSvgCanvas/);
  assert.match(src, /function applyLightboxView/);
  assert.match(src, /uniquifySvgIds\(clone\)/);
  assert.match(src, /vectorizeSvgForeignObjects\(clone\)/);
  assert.match(src, /canvas.style.transform = "none"/);
  assert.doesNotMatch(src, /scale\(\$\{lightboxUserScale\}\)/);
  assert.doesNotMatch(src, /scale\(\$\{previewScale\}\)/);
  assert.match(src, /Math.min\(maxW \/ nw, maxH \/ nh\) \* insetFactor/);
  const lightbox = css.match(/    \.lightbox \{[\s\S]*?\n    \}/);
  assert.ok(lightbox, "extract .lightbox");
  assert.doesNotMatch(lightbox[0], /backdrop-filter/);
  assert.match(css, /\.lightbox::before \{[\s\S]*backdrop-filter: blur\(6px\)/);
  assert.match(css, /\.molan-mermaid-editor-mask::before \{[\s\S]*backdrop-filter: blur\(6px\)/);
  const lightboxCanvas = css.match(/\.lightbox-canvas \{[\s\S]*?\n    \}/);
  assert.ok(lightboxCanvas, "extract .lightbox-canvas");
  assert.doesNotMatch(lightboxCanvas[0], /will-change/);
  const editorCanvas = css.match(/\.molan-mermaid-editor-preview-canvas \{[\s\S]*?\n    \}/);
  assert.ok(editorCanvas, "extract .molan-mermaid-editor-preview-canvas");
  assert.doesNotMatch(editorCanvas[0], /will-change/);
});

test("内联流程图预览渲染后也会去掉 foreignObject", () => {
  const src = editorSrc();
  assert.match(src, /applyMermaidSvg\(host, next\)[\s\S]*vectorizeSvgForeignObjects\(next\)/);
});

test("复制流程图前会去掉会污染 canvas 的 foreignObject", () => {
  const src = editorSrc();
  assert.match(src, /function sanitizeSvgForCanvas/);
  assert.match(src, /function replaceForeignObjectWithText/);
  assert.match(src, /function svgToPngBlob/);
  assert.match(src, /async function copySvgAsPng/);
  assert.match(src, /svgToPngBlob,/);
  assert.match(src, /clone\.querySelectorAll\("foreignObject, script"\)/);
  assert.match(src, /function bakeCssCustomProperties/);
  assert.match(src, /function inlineComputedSvgStyles/);
  assert.match(src, /function insertDiagramBackground/);
  assert.match(src, /actorLineColor/);
  assert.match(src, /ctx\.fillStyle = diagramBackgroundColor\(\)/);
});

test("Mermaid 语法错误不会把错误卡堆到页面底部", () => {
  const src = editorSrc();
  const css = readFileSync(join(root, "src", "molan.css"), "utf8");
  assert.match(src, /function mermaidSandbox/);
  assert.match(src, /function sweepMermaidRenderOrphans/);
  assert.match(src, /api\.render\(id, source, sandbox\)/);
  assert.match(src, /queueMicrotask\(\(\) => cleanupMermaidTemp\(id\)\)/);
  assert.match(css, /#molanMermaidSandbox/);
  assert.match(css, /left:\s*-100000px/);
  assert.doesNotMatch(css, /\[id\^="dmolan-mmd-"\]/);
});

test("流程图插入后立刻刷预览，并清掉节点末尾残留源码", () => {
  const src = editorSrc();
  assert.match(src, /function applyMermaidSvg/);
  assert.match(src, /function stripMermaidHostSource/);
  assert.match(src, /function mermaidHostNeedsPaint/);
  assert.match(src, /const paintInsertedMermaid = \(el\) => \{/);
  assert.match(src, /host\.replaceChildren\(svgEl/);
  assert.match(src, /n\.matches\?\.\("svg, \.molan-diagram-toolbar"\)/);
  assert.match(src, /paintInsertedMermaid\(node\)/);
  assert.match(src, /captureMermaidSources\(el && el\.isConnected \? el : vditorRoot\)/);
  assert.doesNotMatch(src, /host\.insertBefore\(next, host\.firstChild\)/);
});

test("文本复制有 clipboard API 降级和流程图源码回退", () => {
  const src = editorSrc();
  assert.match(src, /function copyTextToClipboard/);
  assert.match(src, /document\.execCommand\("copy"\)/);
  assert.match(src, /__molanHostCopyText/);
  assert.match(src, /function mermaidCopySource/);
  assert.match(src, /mermaidCopySource\(shell, getVditor\)/);
  assert.match(src, /function bindPreviewCodeCopy/);
  assert.match(src, /vditor-copy/);
  assert.match(src, /copyText: copyTextToClipboard/);
  assert.match(src, /mermaidCopySource,/);
  assert.match(src, /e\.key === "Escape" && exportMenuIsOpen/);
});

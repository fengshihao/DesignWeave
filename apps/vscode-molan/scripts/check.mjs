import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(root, "..", "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const editor = pkg.contributes.customEditors[0];

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(pkg.name === "molan-markdown", "package name");
assert(editor.viewType === "molan.markdownEditor", "viewType");
assert(editor.priority === "default", "must be default so clicking .md opens 墨览");
assert(
  editor.selector.some((s) => s.filenamePattern === "*.md"),
  "selector includes *.md",
);
assert(existsSync(join(root, "media/vscode-bridge.js")), "vscode-bridge.js");
assert(existsSync(join(root, "media/molan.css")), "synced molan.css");
assert(existsSync(join(root, "media/molan-editor.js")), "synced molan-editor.js");
assert(existsSync(join(root, "media/vditor/dist/index.min.js")), "vendored vditor");
assert(existsSync(join(root, "media/vditor/dist/js/mermaid/mermaid.min.js")), "vendored mermaid");
assert(existsSync(join(root, "out/extension.js")), "compiled extension.js");
assert(existsSync(join(root, "out/markdownEditorProvider.js")), "compiled provider");

const js = readFileSync(join(root, "out/markdownEditorProvider.js"), "utf8");
assert(js.includes("molan.markdownEditor"), "compiled viewType");
assert(js.includes("molan-host-vscode"), "webview host class");
assert(js.includes("__MOLAN_VDITOR_CDN__"), "vditor cdn injection");

const viewerHtml = join(repoRoot, "tools", "markdown-viewer", "index.html");
const html = readFileSync(viewerHtml, "utf8");
assert(html.includes('id="molan-css"'), "single-file html has molan-css");
assert(html.includes('id="molan-editor"'), "single-file html has molan-editor");
assert(html.includes('id="molan-app"'), "single-file html has molan-app");
assert(!html.includes("./molan-editor.js"), "html must not depend on sibling js files");
assert(!existsSync(join(repoRoot, "tools/markdown-viewer/molan.css")), "viewer css is inlined");
assert(!existsSync(join(repoRoot, "tools/markdown-viewer/molan-editor.js")), "viewer editor js is inlined");
assert(!existsSync(join(repoRoot, "tools/markdown-viewer/molan-app.js")), "viewer app js is inlined");

const extractedEditor = join(root, "media/molan-editor.js");
for (const path of [extractedEditor, join(root, "media/vscode-bridge.js")]) {
  const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  assert(result.status === 0, `syntax ${path}: ${result.stderr}`);
}

const editorSource = readFileSync(extractedEditor, "utf8");
assert(editorSource.includes("global.MolanEditor"), "exports MolanEditor");
assert(editorSource.includes("create("), "has create()");

console.log("molan-markdown extension check ok");

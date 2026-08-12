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

const viewer = join(repoRoot, "tools", "markdown-viewer");
for (const path of [
  join(viewer, "molan-editor.js"),
  join(viewer, "molan-app.js"),
  join(root, "media/vscode-bridge.js"),
]) {
  const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  assert(result.status === 0, `syntax ${path}: ${result.stderr}`);
}

const editorSource = readFileSync(join(viewer, "molan-editor.js"), "utf8");
assert(editorSource.includes("global.MolanEditor"), "exports MolanEditor");
assert(editorSource.includes("create("), "has create()");
assert(readFileSync(join(viewer, "index.html"), "utf8").includes("./molan-editor.js"), "html loads editor core");

console.log("molan-markdown extension check ok");

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
assert(existsSync(join(root, "icon.png")), "marketplace icon.png");
assert(existsSync(join(root, "LICENSE")), "LICENSE");
assert(existsSync(join(root, "media/molan.css")), "synced molan.css");
assert(existsSync(join(root, "media/molan-editor.js")), "synced molan-editor.js");
assert(existsSync(join(root, "media/vditor/dist/index.min.js")), "vendored vditor");
assert(existsSync(join(root, "media/vditor/dist/js/mermaid/mermaid.min.js")), "vendored mermaid");
assert(existsSync(join(root, "media/vditor/dist/js/lute/lute.min.js")), "vendored lute");
assert(existsSync(join(root, "media/vditor/dist/js/katex/katex.min.js")), "vendored katex");
assert(existsSync(join(root, "media/vditor/dist/js/highlight.js/highlight.min.js")), "vendored highlight");
assert(!existsSync(join(root, "media/vditor/dist/js/mathjax")), "mathjax must be stripped");
assert(!existsSync(join(root, "media/vditor/dist/js/echarts")), "echarts must be stripped");
assert(!existsSync(join(root, "media/vditor/dist/js/graphviz")), "graphviz must be stripped");
assert(!existsSync(join(root, "media/vditor/dist/js/abcjs")), "abcjs must be stripped");
assert(!existsSync(join(root, "media/vditor/dist/js/markmap")), "markmap must be stripped");
assert(existsSync(join(root, "out/extension.js")), "compiled extension.js");
assert(existsSync(join(root, "out/markdownEditorProvider.js")), "compiled provider");

const js = readFileSync(join(root, "out/markdownEditorProvider.js"), "utf8");
assert(js.includes("molan.markdownEditor"), "compiled viewType");
assert(js.includes("molan-host-vscode"), "webview host class");
assert(js.includes("__MOLAN_VDITOR_CDN__"), "vditor cdn injection");
assert(js.includes("vditorIconScript"), "icon sprite loaded with CSP nonce");
assert(js.includes("ant.js"), "ant icon script in webview");

const viewer = join(repoRoot, "tools", "markdown-viewer");
const html = readFileSync(join(viewer, "index.html"), "utf8");
assert(html.includes("./molan.css"), "html links molan.css");
assert(html.includes("./molan-editor.js"), "html loads editor core");
assert(html.includes("./molan-app.js"), "html loads browser app");
assert(existsSync(join(viewer, "molan.css")), "viewer molan.css");
assert(existsSync(join(viewer, "molan-editor.js")), "viewer molan-editor.js");
assert(existsSync(join(viewer, "molan-app.js")), "viewer molan-app.js");

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
assert(editorSource.includes("setPreview"), "preview mode API");
assert(editorSource.includes("hide: false"), "toolbar stays visible");

const bridge = readFileSync(join(root, "media/vscode-bridge.js"), "utf8");
assert(bridge.includes('msg.type === "setContent" && api.isPreview()'), "only refreshes preview on external reload");
assert(!bridge.includes("msg.type === \"init\" || api.isPreview()"), "does not force preview on init");
assert(bridge.includes("value !== baseline"), "ignores Vditor setValue round-trip");

const readme = readFileSync(join(root, "README.md"), "utf8");
assert(readme.includes("![墨览编辑器](media/screenshot.jpg)"), "store screenshot");
assert(readme.includes("默认就是**编辑**") || readme.includes("默认就是编辑"), "user-facing edit default");
assert(!readme.includes("pnpm --filter"), "README must not contain packaging commands");
assert(!readme.includes("viewType"), "README must not contain implementation jargon");
assert(existsSync(join(root, "DEV.md")), "developer docs live in DEV.md");
assert(
  pkg.vsce?.baseImagesUrl?.includes("apps/vscode-molan"),
  "vsce baseImagesUrl must include apps/vscode-molan so Marketplace screenshots resolve",
);

console.log("molan-markdown extension check ok");

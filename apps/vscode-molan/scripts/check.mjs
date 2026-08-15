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
assert(existsSync(join(root, "media/vditor/dist/method.min.js")), "vendored method.min.js for preview");
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
assert(js.includes("method.min.js"), "preview loads method.min.js");
assert(js.includes("lute.min.js"), "preload lute in webview");
assert(js.includes('rel="preload"'), "webview preloads lute");

const viewer = join(repoRoot, "tools", "markdown-viewer");
const html = readFileSync(join(viewer, "index.html"), "utf8");
assert(html.includes("./molan.css"), "html links molan.css");
assert(html.includes("./molan-editor.js"), "html loads editor core");
assert(html.includes("./molan-app.js"), "html loads browser app");
assert(html.includes("./vendor/vditor/dist/method.min.js"), "html loads local method.min.js");
assert(html.includes("./vendor/vditor/dist/js/lute/lute.min.js"), "html preloads local lute");
assert(!html.includes("cdn.jsdelivr.net"), "html must not load vditor from jsdelivr");
assert(existsSync(join(viewer, "molan.css")), "viewer molan.css");
assert(existsSync(join(viewer, "molan-editor.js")), "viewer molan-editor.js");
assert(existsSync(join(viewer, "molan-app.js")), "viewer molan-app.js");
assert(existsSync(join(viewer, "serve.mjs")), "viewer gzip static server");
assert(existsSync(join(viewer, "vendor/vditor/dist/method.min.js")), "viewer vendored method.min.js");
assert(existsSync(join(viewer, "vendor/vditor/dist/js/lute/lute.min.js")), "viewer vendored lute");

for (const path of [
  join(viewer, "molan-editor.js"),
  join(viewer, "molan-app.js"),
  join(viewer, "serve.mjs"),
  join(root, "media/vscode-bridge.js"),
]) {
  const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  assert(result.status === 0, `syntax ${path}: ${result.stderr}`);
}

const app = readFileSync(join(viewer, "molan-app.js"), "utf8");
assert(app.includes("openLocalMarkdownLink"), "browser opens in-folder markdown links");
assert(app.includes("SCAN_MAX_DEPTH"), "limits folder scan depth");
assert(app.includes("SCAN_MAX_FILES"), "limits folder scan file count");
assert(app.includes("pathHasSkippedDir"), "skips node_modules in folder file lists");
assert(app.includes("isSkippedDirName"), "skips dependency directories by name");
assert(app.includes("loadThemeFonts"), "loads theme fonts on demand");

const editorSource = readFileSync(join(viewer, "molan-editor.js"), "utf8");
assert(editorSource.includes("global.MolanEditor"), "exports MolanEditor");
assert(editorSource.includes("create("), "has create()");
assert(editorSource.includes("setPreview"), "preview mode API");
assert(editorSource.includes("defaultPreview !== false"), "opens in preview by default");
assert(editorSource.includes("hide: false"), "toolbar stays visible");
assert(editorSource.includes("Vditor.preview"), "preview uses lightweight Vditor.preview");
assert(editorSource.includes("ensureFullVditor"), "loads index.min.js only when editing");
assert(editorSource.includes("markdownHasMermaid"), "preloads mermaid only when source has diagrams");
assert(editorSource.includes("preloadLute"), "preloads lute before preview");
assert(!editorSource.includes("cdn.jsdelivr.net"), "editor must not default to jsdelivr");

const bridge = readFileSync(join(root, "media/vscode-bridge.js"), "utf8");
assert(bridge.includes("await api.setPreview(true)"), "defaults to preview on init");
assert(bridge.includes("value !== baseline"), "ignores Vditor setValue round-trip");
assert(bridge.includes("openRelative"), "webview opens relative markdown links");

const readme = readFileSync(join(root, "README.md"), "utf8");
assert(readme.includes("![墨览编辑器](media/screenshot.jpg)"), "store screenshot");
assert(readme.includes("默认就是**预览**") || readme.includes("默认就是预览"), "user-facing preview default");
assert(!readme.includes("pnpm --filter"), "README must not contain packaging commands");
assert(!readme.includes("viewType"), "README must not contain implementation jargon");
assert(existsSync(join(root, "DEV.md")), "developer docs live in DEV.md");
assert(
  pkg.vsce?.baseImagesUrl?.includes("apps/vscode-molan"),
  "vsce baseImagesUrl must include apps/vscode-molan so Marketplace screenshots resolve",
);

console.log("molan-markdown extension check ok");

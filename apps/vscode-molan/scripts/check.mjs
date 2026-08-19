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
assert(js.includes("headerPrefsBtn"), "vscode header has settings button");
assert(!js.includes("pickImageBeside"), "extension no longer copies local images beside the markdown file");
assert(!js.includes('id="themeBtn"'), "vscode has no standalone theme button");
assert(js.includes("molan-theme"), "webview restores stored theme");

const viewer = join(repoRoot, "tools", "markdown-viewer");
const html = readFileSync(join(viewer, "index.html"), "utf8");
assert(html.includes("./molan.css"), "html links molan.css");
assert(html.includes("./molan-editor.js"), "html loads editor core");
assert(html.includes("./molan-app.js"), "html loads browser app");
assert(html.includes('id="themeSwitch"'), "prefs menu has theme switch");
assert(html.includes("prefsThemeLabel"), "theme stays in prefs menu");
assert(!html.includes("brand-themes"), "theme is not exposed in sidebar chrome");
assert(!html.includes('id="themeBtn"'), "web header has no standalone theme button");
assert(html.includes('id="welcomeDemoBtn"'), "welcome has try-sample");
assert(html.includes("./guide.html"), "prefs links to the web guide");
assert(existsSync(join(viewer, "guide.html")), "web studio guide page");
assert(existsSync(join(viewer, "demo/软件架构.md")), "demo architecture doc");
assert(existsSync(join(viewer, "studio-intro.gif")), "web studio intro gif");
assert(existsSync(join(viewer, "shots/edit-table.jpg")), "table editing screenshot");
assert(html.indexOf('id="molanFindBtn"') < html.indexOf('id="copyBtn"'), "find comes before copy");
assert(html.includes("./vendor/vditor/dist/method.min.js"), "html loads local method.min.js");
assert(html.includes("./vendor/vditor/dist/js/lute/lute.min.js"), "html preloads local lute");
assert(html.includes("molan-editor.js?v=20260819fab"), "studio html cache-busts table editor");
assert(html.includes("molan.css?v=20260819fab"), "studio html cache-busts table css");
assert(html.includes("molan-i18n.js?v=20260819fab"), "studio html cache-busts table i18n");
assert(!html.includes("cdn.jsdelivr.net"), "html must not load vditor from jsdelivr");
assert(existsSync(join(viewer, "molan.css")), "viewer molan.css");
assert(readFileSync(join(viewer, "molan.css"), "utf8").includes(".molan-table-toolbar"), "css for table toolbar");
assert(readFileSync(join(viewer, "molan.css"), "utf8").includes(".molan-table-picker"), "css for table size picker");
assert(readFileSync(join(viewer, "molan.css"), "utf8").includes('[data-type="table"].vditor-menu--disabled'), "table insert stays clickable when Vditor disables toolbar");
assert(readFileSync(join(viewer, "molan.css"), "utf8").includes(".editor-wrap > .vditor-outline"), "css docks Vditor outline as a left pane");
assert(readFileSync(join(viewer, "molan.css"), "utf8").includes(".molan-outline-dock {\n      position: fixed"), "outline button is viewport-fixed");
assert(readFileSync(join(viewer, "molan.css"), "utf8").includes("#molanPreviewBody"), "css constrains preview body so the outline fab can stay put");
assert(readFileSync(join(viewer, "molan.css"), "utf8").includes(".molan-chrome-menu"), "css for header edit-mode menu");
assert(readFileSync(join(viewer, "molan.css"), "utf8").includes(".molan-format-bar"), "css for selection format bubble");
assert(readFileSync(join(viewer, "molan-i18n.js"), "utf8").includes("insertRowBelow"), "i18n has table row actions");
assert(existsSync(join(viewer, "molan-editor.js")), "viewer molan-editor.js");
assert(existsSync(join(viewer, "molan-app.js")), "viewer molan-app.js");
assert(existsSync(join(viewer, "serve.mjs")), "viewer gzip static server");
assert(existsSync(join(viewer, "intro.gif")), "viewer intro.gif for molan.guoyoutech.cn");
assert(readFileSync(join(viewer, "serve.mjs"), "utf8").includes('".gif": "image/gif"'), "local server gif mime");
assert(existsSync(join(viewer, "vendor/vditor/dist/method.min.js")), "viewer vendored method.min.js");
assert(existsSync(join(viewer, "vendor/vditor/dist/js/lute/lute.min.js")), "viewer vendored lute");

for (const path of [
  join(viewer, "molan-editor.js"),
  join(viewer, "molan-app.js"),
  join(viewer, "serve.mjs"),
  join(viewer, "scripts/table-e2e.mjs"),
  join(root, "media/vscode-bridge.js"),
]) {
  const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  assert(result.status === 0, `syntax ${path}: ${result.stderr}`);
}

const app = readFileSync(join(viewer, "molan-app.js"), "utf8");
assert(app.includes("openLocalMarkdownLink"), "browser opens in-folder markdown links");
assert(app.includes("loadDemoLibrary"), "browser can open built-in samples");
assert(app.includes("SCAN_MAX_DEPTH"), "limits folder scan depth");
assert(app.includes("SCAN_MAX_FILES"), "limits folder scan file count");
assert(app.includes("pathHasSkippedDir"), "skips node_modules in folder file lists");
assert(app.includes("isSkippedDirName"), "skips dependency directories by name");
assert(!app.includes("savePickedImageBesideActive"), "studio no longer copies local images beside the markdown file");
assert(!app.includes("loadThemeFonts"), "theme fonts live in editor core");

const editorSource = readFileSync(join(viewer, "molan-editor.js"), "utf8");
assert(editorSource.includes("initType"), "reader type controls");
assert(editorSource.includes("molan-table-toolbar"), "table structure toolbar");
assert(editorSource.includes("molan-table-picker"), "table size picker");
assert(editorSource.includes("bindTableControls"), "table row/column controls");
assert(editorSource.includes("bindTableInsertPicker"), "table insert size picker");
assert(editorSource.includes("ensureEditorChrome"), "header has edit-mode in reading and editing");
assert(editorSource.includes('document.querySelector(".reader-body")'), "outline dock pins to the reader pane");
assert(editorSource.includes("pinOutlineDock"), "outline button is position-fixed over the reader pane");
assert(editorSource.includes("scheduleOutlineRefresh"), "open outline follows document updates");
assert(editorSource.includes("relocateVditorOutline"), "uses Vditor outline on the article overlay");
assert(editorSource.includes('"outline"'), "vditor toolbar still has outline for the native panel");
assert(!editorSource.includes("relocateVditorChrome"), "does not move Vditor outline/edit-mode buttons into the header");
assert(readFileSync(join(viewer, "molan-i18n.js"), "utf8").includes("editModeAria"), "i18n has edit-mode label");
assert(readFileSync(join(viewer, "molan-app.js"), "utf8").includes("editModePrefs"), "studio shows header chrome with a document");
assert(editorSource.includes("bindFormatBar"), "edit mode shows a selection format bubble");
assert(!editorSource.includes('"fullscreen"'), "vditor toolbar has no fullscreen");
assert(/counter:\s*\{\s*enable:\s*false/.test(editorSource), "vditor word counter is off");
assert(editorSource.includes('pick: "image"'), "image insert opens a URL prompt instead of empty markdown");
assert(editorSource.includes("function promptImageUrl"), "image insert asks for an online URL");
assert(editorSource.includes("function parseOnlineImageUrl"), "image URL must be http or https");
assert(!editorSource.includes("pickImageFile"), "image insert does not open a local file picker");
assert(!editorSource.includes("resolveLocalImage"), "studio does not resolve local image paths");
assert(!editorSource.includes("pickImageAsDataMarkdown"), "images are not inlined as base64");
assert(editorSource.includes("function buildTableMarkdown"), "custom table markdown insert");

{
  const match = editorSource.match(/function buildTableMarkdown\(rows, cols\) \{[\s\S]*?\n  \}/);
  assert(match, "extract buildTableMarkdown");
  const buildTableMarkdown = new Function(`${match[0]}; return buildTableMarkdown;`)();
  const md = buildTableMarkdown(3, 4);
  const lines = md.split("\n");
  assert(lines.length === 4, "3-row table is header + sep + 2 body rows");
  assert(lines[0].split("|").filter(Boolean).length === 4, "4 columns in header");
  assert(lines[1].includes("---"), "alignment row");
  assert(buildTableMarkdown(1, 2).split("\n").length === 2, "1-row table is header + sep");
}
assert(editorSource.includes("initTheme"), "reader theme controls");
assert(editorSource.includes("molan-type"), "persists type settings");
assert(editorSource.includes("molan-theme"), "persists theme");
assert(editorSource.includes("loadThemeFonts"), "loads theme fonts on demand");
assert(editorSource.includes("global.MolanEditor"), "exports MolanEditor");
assert(editorSource.includes("create("), "has create()");
assert(editorSource.includes("setPreview"), "preview mode API");
assert(editorSource.includes("defaultPreview !== false"), "opens in preview by default");
assert(editorSource.includes("hide: false"), "toolbar stays visible");
assert(editorSource.includes("Vditor.preview"), "preview uses lightweight Vditor.preview");
assert(editorSource.includes("ensureFullVditor"), "loads index.min.js only when editing");
assert(editorSource.includes("markdownHasMermaid"), "preloads mermaid only when source has diagrams");
assert(editorSource.includes("function mermaidRoot"), "theme switch looks up preview+editor mermaid hosts");
assert(editorSource.includes("captureMermaidSource"), "saves mermaid source before Vditor replaces it");
assert(editorSource.includes("scheduleMermaidThemeRefresh"), "theme switch re-renders mermaid diagrams");
assert(editorSource.includes("onThemeChange"), "theme switch notifies editor to restyle mermaid");
assert(editorSource.includes("stampMermaidSources"), "preview stamps mermaid source before Vditor wipes it");
assert(editorSource.includes("preloadLute"), "preloads lute before preview");
assert(!editorSource.includes("cdn.jsdelivr.net"), "editor must not default to jsdelivr");

const bridge = readFileSync(join(root, "media/vscode-bridge.js"), "utf8");
assert(bridge.includes("await api.setPreview(true)"), "defaults to preview on init");
assert(bridge.includes("value !== baseline"), "ignores Vditor setValue round-trip");
assert(bridge.includes("openRelative"), "webview opens relative markdown links");
assert(!bridge.includes("pickImage"), "webview does not ask host to pick a local image");

const readme = readFileSync(join(root, "README.md"), "utf8");
assert(
  readme.includes("![墨览：打开即阅读，要点再编辑](https://molan.guoyoutech.cn/intro.gif)"),
  "store intro gif hosted on molan.guoyoutech.cn",
);
assert(
  !/github\.com\/\S*intro\.gif|raw\.githubusercontent\.com\S*intro\.gif/.test(readme),
  "store intro gif must not use GitHub raw",
);
assert(readme.includes("打开即阅读"), "store copy has Chinese");
assert(readme.includes("Open to read"), "store copy has English");
assert(readme.includes("Abre para leer"), "store copy has Spanish");
assert(readme.includes("所见即所得"), "store copy mentions WYSIWYG");
assert(readme.includes("Mermaid"), "store copy mentions Mermaid");
assert(readme.includes("字号"), "store copy mentions type size");
assert(readme.includes("行距"), "store copy mentions line height");
assert(readme.includes("表格"), "store copy mentions tables");
assert(readme.includes("公式"), "store copy mentions math");
assert(!readme.includes("pnpm --filter"), "README must not contain packaging commands");
assert(!readme.includes("viewType"), "README must not contain implementation jargon");
assert(existsSync(join(root, "DEV.md")), "developer docs live in DEV.md");
assert(
  pkg.vsce?.baseImagesUrl === "https://molan.guoyoutech.cn",
  "vsce baseImagesUrl must point at molan.guoyoutech.cn so Marketplace screenshots resolve",
);

console.log("molan-markdown extension check ok");

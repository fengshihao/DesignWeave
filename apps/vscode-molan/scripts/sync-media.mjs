import { createRequire } from "node:module";
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const extRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(extRoot, "..", "..");
const viewer = join(repoRoot, "tools", "markdown-viewer");
const media = join(extRoot, "media");

mkdirSync(media, { recursive: true });

for (const file of ["molan.css", "molan-editor.js"]) {
  cpSync(join(viewer, file), join(media, file));
}

const vditorPkg = dirname(require.resolve("vditor/package.json"));
const srcDist = join(vditorPkg, "dist");

function vendorVditor(destDist) {
  rmSync(destDist, { recursive: true, force: true });

  function copyRel(rel) {
    const src = join(srcDist, rel);
    const dest = join(destDist, rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true });
  }

  // 预览用 method.min.js；点编辑再加载 index.min.js。
  for (const rel of [
    "method.min.js",
    "index.min.js",
    "index.css",
    "js/lute",
    "js/mermaid",
    "js/katex/katex.min.js",
    "js/katex/katex.min.css",
    "js/katex/mhchem.min.js",
    "js/highlight.js/highlight.min.js",
    "js/highlight.js/third-languages.js",
    "js/highlight.js/styles/kimbie-dark.min.css",
    "js/i18n/zh_CN.js",
    "js/icons/ant.js",
    "css/content-theme/light.css",
    "images/img-loading.svg",
  ]) {
    copyRel(rel);
  }

  const fontsSrc = join(srcDist, "js/katex/fonts");
  const fontsDest = join(destDist, "js/katex/fonts");
  mkdirSync(fontsDest, { recursive: true });
  for (const name of readdirSync(fontsSrc)) {
    if (name.endsWith(".woff2")) {
      cpSync(join(fontsSrc, name), join(fontsDest, name));
    }
  }
}

vendorVditor(join(media, "vditor", "dist"));
vendorVditor(join(viewer, "vendor", "vditor", "dist"));

console.log("copied molan.css, molan-editor.js; vendored vditor to media/ and tools/markdown-viewer/vendor/");

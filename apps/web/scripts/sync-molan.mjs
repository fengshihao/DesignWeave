import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderHostHtml } from "@designweave/molan-host";

const require = createRequire(import.meta.url);
const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(webRoot, "..", "..");
const coreDist = join(repoRoot, "packages", "molan-core", "dist");
const hostDist = join(repoRoot, "packages", "molan-host", "dist");
const dest = join(webRoot, "public", "molan");

mkdirSync(dest, { recursive: true });

for (const file of ["molan.css", "molan-editor.js"]) {
  cpSync(join(coreDist, file), join(dest, file));
}

cpSync(join(hostDist, "iframe-bridge.js"), join(dest, "web-bridge.js"));

const vditorPkg = dirname(require.resolve("vditor/package.json"));
const srcDist = join(vditorPkg, "dist");

function vendorVditor(destDist) {
  rmSync(destDist, { recursive: true, force: true });

  function copyRel(rel) {
    const src = join(srcDist, rel);
    const destPath = join(destDist, rel);
    mkdirSync(dirname(destPath), { recursive: true });
    cpSync(src, destPath, { recursive: true });
  }

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

vendorVditor(join(dest, "vditor", "dist"));

const hostHtml = renderHostHtml({
  variant: "iframe",
  assets: {
    molanCss: "./molan.css",
    vditorCss: "./vditor/dist/index.css",
    vditorMethodJs: "./vditor/dist/method.min.js",
    vditorLuteJs: "./vditor/dist/js/lute/lute.min.js",
    vditorIconsJs: "./vditor/dist/js/icons/ant.js",
    editorJs: "./molan-editor.js",
    bridgeJs: "./web-bridge.js",
    vditorCdn: "./vditor",
    linkBase: "",
    googleFontsHref:
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap",
  },
  defaultTheme: "xuan",
});

writeFileSync(join(dest, "host.html"), hostHtml);

console.log("synced molan-core + molan-host → public/molan/");

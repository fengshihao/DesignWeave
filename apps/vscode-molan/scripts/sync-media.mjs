import { createRequire } from "node:module";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const extRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(extRoot, "..", "..");
const viewerHtml = join(repoRoot, "tools", "markdown-viewer", "index.html");
const media = join(extRoot, "media");

mkdirSync(media, { recursive: true });

const html = readFileSync(viewerHtml, "utf8");

function extract(tag, id) {
  const re = new RegExp(`<${tag}[^>]*\\sid="${id}"[^>]*>([\\s\\S]*?)</${tag}>`);
  const match = html.match(re);
  if (!match) {
    throw new Error(`index.html 中找不到 <${tag} id="${id}">，墨览仍应是单文件`);
  }
  return `${match[1].trim()}\n`;
}

writeFileSync(join(media, "molan.css"), extract("style", "molan-css"));
writeFileSync(join(media, "molan-editor.js"), extract("script", "molan-editor"));

const vditorPkg = dirname(require.resolve("vditor/package.json"));
cpSync(join(vditorPkg, "dist"), join(media, "vditor", "dist"), { recursive: true });

console.log("extracted molan.css + molan-editor.js from index.html, vendored vditor/dist");

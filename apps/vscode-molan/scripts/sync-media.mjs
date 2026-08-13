import { createRequire } from "node:module";
import { cpSync, mkdirSync } from "node:fs";
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
cpSync(join(vditorPkg, "dist"), join(media, "vditor", "dist"), { recursive: true });

console.log("copied molan.css, molan-editor.js; vendored vditor/dist");

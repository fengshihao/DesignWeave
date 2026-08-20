import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const dist = join(root, "dist");
const viewer = join(root, "..", "..", "tools", "markdown-viewer");

mkdirSync(dist, { recursive: true });

// 真源在 packages/molan-core/src；若 studio 侧仍有副本则同步回写（过渡期）
for (const file of ["molan-editor.js", "molan.css"]) {
  cpSync(join(src, file), join(dist, file));
  const studioCopy = join(viewer, file);
  try {
    const coreContent = readFileSync(join(src, file));
    const studioContent = readFileSync(studioCopy);
    if (!coreContent.equals(studioContent)) {
      cpSync(join(src, file), studioCopy);
    }
  } catch {
    cpSync(join(src, file), studioCopy);
  }
}

// 生成类型声明
writeFileSync(
  join(dist, "index.d.ts"),
  `export type { EditorApi, EditorOptions } from "@designweave/molan-protocol";\n`,
);

console.log("built @designweave/molan-core → dist/");

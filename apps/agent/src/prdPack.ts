import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import type { ClarityState, DiskProjectPhase, ProjectSource } from "./projectMeta.js";
import { writeMetaFile } from "./projectMeta.js";

export const PRD_PACK_FILES = [
  "README.md",
  "01-背景与目标.md",
  "02-用户故事.md",
  "03-交互与体验.md",
  "04-规格与约束.md",
  "05-验收.md",
  "gaps.md",
] as const;

export type PrdPackFile = (typeof PRD_PACK_FILES)[number];

export function prdPackTemplateDir(): string {
  const fromEnv = process.env.PRD_PACK_TEMPLATE_DIR;
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(config.repoRoot, "packages/templates/prd-pack");
}

export function assertPrdPackTemplate(): string {
  const dir = prdPackTemplateDir();
  const missing = PRD_PACK_FILES.filter((f) => !fs.existsSync(path.join(dir, f)));
  if (missing.length) {
    throw new Error(`找不到标准 PRD 文档包模板：${missing.join("、")}（${dir}）`);
  }
  return dir;
}

export function applyTitleToReadme(markdown: string, title: string): string {
  return markdown.replace(/^# .+$/m, `# ${title}`);
}

export function copyPrdPack(
  dest: string,
  input: {
    id: string;
    title: string;
    owner: string;
    source: ProjectSource;
    phase: DiskProjectPhase;
    clarity: ClarityState;
    createdAt: string;
    updatedAt: string;
  }
): void {
  const src = assertPrdPackTemplate();
  fs.mkdirSync(dest, { recursive: true });
  for (const file of PRD_PACK_FILES) {
    let text = fs.readFileSync(path.join(src, file), "utf8");
    if (file === "README.md") {
      text = applyTitleToReadme(text, input.title);
      if (input.source === "import") {
        text = text.replace(/^filling$/m, "imported");
      }
    }
    fs.writeFileSync(path.join(dest, file), text, "utf8");
  }
  writeMetaFile(dest, {
    id: input.id,
    title: input.title,
    owner: input.owner,
    source: input.source,
    phase: input.phase,
    clarity: input.clarity,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
}

export function defaultOpenPath(files: Array<{ path: string; isDir: boolean }>): string {
  if (files.some((f) => f.path === "README.md" && !f.isDir)) return "README.md";
  if (files.some((f) => f.path === "PRD.md" && !f.isDir)) return "PRD.md";
  const md = files.find((f) => !f.isDir && f.path.endsWith(".md"));
  return md?.path || "README.md";
}

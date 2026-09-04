import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import type { ClarityState, DiskProjectPhase, ProjectSource } from "./projectMeta.js";
import { writeMetaFile } from "./projectMeta.js";

export const PRD_FILE = "product/PRD.md" as const;

/** 新建工程时从模板复制的文件；其余（gaps、调研等）由 AI 按需创建。 */
export const PRD_PACK_FILES = [
  PRD_FILE,
  "eng/方案.md",
  "eng/跟上.md",
  "qa/测试.md",
  "qa/跟上.md",
] as const;

export type PrdPackFile = (typeof PRD_PACK_FILES)[number];

export const PRD_SECTIONS = [
  "背景与目标",
  "用户故事",
  "交互与体验",
  "规格与约束",
  "验收",
] as const;

export type PrdSection = (typeof PRD_SECTIONS)[number];

export function prdPackTemplateDir(): string {
  const fromEnv = process.env.PRD_PACK_TEMPLATE_DIR;
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(config.repoRoot, "packages/templates/prd-pack");
}

export function assertPrdPackTemplate(): string {
  const dir = prdPackTemplateDir();
  const missing = PRD_PACK_FILES.filter((f) => !fs.existsSync(path.join(dir, f)));
  if (missing.length) {
    throw new Error(`找不到 PRD 模板：${missing.join("、")}（${dir}）`);
  }
  return dir;
}

export function applyTitleToPrd(markdown: string, title: string): string {
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
    const from = path.join(src, file);
    if (!fs.existsSync(from)) {
      throw new Error(`找不到 PRD 模板：${file}（${src}）`);
    }
    let text = fs.readFileSync(from, "utf8");
    text = text.replaceAll("（工程名）", input.title);
    if (file === PRD_FILE) {
      text = applyTitleToPrd(text, input.title);
    }
    const to = path.join(dest, file);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, text, "utf8");
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

export function defaultOpenPath(
  files: Array<{ path: string; isDir: boolean }>,
  preferred: string = PRD_FILE
): string {
  if (files.some((f) => f.path === preferred && !f.isDir)) return preferred;
  if (files.some((f) => f.path === PRD_FILE && !f.isDir)) return PRD_FILE;
  if (files.some((f) => f.path === "eng/方案.md" && !f.isDir)) return "eng/方案.md";
  if (files.some((f) => f.path === "qa/测试.md" && !f.isDir)) return "qa/测试.md";
  const md = files.find(
    (f) => !f.isDir && f.path.endsWith(".md") && path.basename(f.path) !== "meta.md"
  );
  return md?.path || preferred;
}

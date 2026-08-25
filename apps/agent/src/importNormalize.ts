import fs from "node:fs";
import path from "node:path";
import { applyTitleToPrd, copyPrdPack, PRD_FILE, PRD_PACK_FILES, type PrdSection } from "./prdPack.js";

export type HeadingChunk = {
  title: string;
  body: string;
};

const SECTION_RULES: Array<{ section: PrdSection; patterns: RegExp[] }> = [
  {
    section: "背景与目标",
    patterns: [/背景/, /问题/, /目标用户/, /成功标准/, /范围/, /非目标/, /一句话/],
  },
  {
    section: "用户故事",
    patterns: [/用户故事/, /作为/, /^us[-–]?\d+/i, /我想要/, /验收标准/],
  },
  {
    section: "交互与体验",
    patterns: [/交互/, /体验/, /入口/, /信息架构/, /主流程/, /界面/, /空态/, /失败/],
  },
  {
    section: "规格与约束",
    patterns: [/规格/, /约束/, /机型/, /系统/, /区域/, /权限/, /合规/, /依赖/, /兼容/, /回滚/, /细则/],
  },
  {
    section: "验收",
    patterns: [/整包验收/, /^验收/, /指标/, /埋点/, /发布门槛/, /发布/],
  },
];

export function splitMarkdownChunks(markdown: string): HeadingChunk[] {
  const text = markdown.replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  const parts = text.split(/^(?=#{1,3} )/m);
  return parts
    .map((block) => {
      const lines = block.trim().split("\n");
      const first = lines[0] || "";
      const heading = first.replace(/^#{1,3}\s+/, "").trim();
      const body = (first.startsWith("#") ? lines.slice(1) : lines).join("\n").trim();
      return { title: heading || "（无标题）", body };
    })
    .filter((c) => c.title !== "（无标题）" || c.body);
}

export function assignChunkSection(title: string): PrdSection | null {
  const t = title.trim();
  for (const rule of SECTION_RULES) {
    if (rule.patterns.some((re) => re.test(t))) return rule.section;
  }
  return null;
}

/** @deprecated 兼容旧测试名 */
export const assignChunkFile = assignChunkSection;

function appendImported(existing: string, chunks: HeadingChunk[]): string {
  if (!chunks.length) return existing;
  const blocks = chunks.map((c) => `### ${c.title}\n\n${c.body || "（原文此节为空）"}`);
  return `${existing.trim()}\n\n> 以下从导入原文拆入，未编造事实。\n\n${blocks.join("\n\n")}\n`;
}

function mergeChunksIntoPrd(prd: string, grouped: Map<PrdSection, HeadingChunk[]>): string {
  let next = prd;
  for (const [section, chunks] of grouped) {
    const marker = `## ${section}`;
    const start = next.indexOf(marker);
    if (start === -1) continue;
    const after = next.indexOf("\n## ", start + marker.length);
    const head = next.slice(0, start);
    const sectionBlock = after === -1 ? next.slice(start) : next.slice(start, after);
    const tail = after === -1 ? "" : next.slice(after);
    next = `${head}${appendImported(sectionBlock, chunks)}${tail}`;
  }
  return next;
}

function writeGaps(dest: string, unmatched: HeadingChunk[]): void {
  const gapLines = [
    "# 待补齐",
    "",
    "这篇由 AI 维护，不对外。每一条对应 PRD.md 里的章节。人答完应写回 PRD，而不是只留在对话里。",
    "",
  ];
  if (unmatched.length) {
    gapLines.push("## 未能归入 PRD 章节的原文", "");
    for (const c of unmatched) {
      gapLines.push(`### ${c.title}`, "", c.body || "（空）", "");
    }
  } else {
    gapLines.push("（导入章节都对上了 PRD。仍须检查清晰度：占位、含糊、缺验收都不算过。）", "");
  }
  fs.writeFileSync(path.join(dest, "gaps.md"), gapLines.join("\n"), "utf8");
}

export function normalizeImportedPrd(input: {
  dest: string;
  title: string;
  owner: string;
  id: string;
  original: string;
  createdAt: string;
}): { unmatched: HeadingChunk[]; filesWritten: string[] } {
  const now = input.createdAt;
  copyPrdPack(input.dest, {
    id: input.id,
    title: input.title,
    owner: input.owner,
    source: "import",
    phase: "imported",
    clarity: "pending",
    createdAt: now,
    updatedAt: now,
  });

  const importDir = path.join(input.dest, "import");
  fs.mkdirSync(importDir, { recursive: true });
  fs.writeFileSync(path.join(importDir, "original.md"), input.original.trim() + "\n", "utf8");

  const chunks = splitMarkdownChunks(input.original);
  const grouped = new Map<PrdSection, HeadingChunk[]>();
  const unmatched: HeadingChunk[] = [];
  for (const chunk of chunks) {
    const section = assignChunkSection(chunk.title);
    if (!section) {
      unmatched.push(chunk);
      continue;
    }
    const list = grouped.get(section) || [];
    list.push(chunk);
    grouped.set(section, list);
  }

  const prdPath = path.join(input.dest, PRD_FILE);
  const prd = mergeChunksIntoPrd(fs.readFileSync(prdPath, "utf8"), grouped);
  const firstPara = input.original
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#") && !l.startsWith(">"));
  const withGoal = firstPara
    ? prd.replace("（待补充）", firstPara.slice(0, 120))
    : prd;
  fs.writeFileSync(prdPath, applyTitleToPrd(withGoal, input.title), "utf8");
  writeGaps(input.dest, unmatched);

  const filesWritten = [...PRD_PACK_FILES, "gaps.md", "import/original.md"];
  return { unmatched, filesWritten };
}

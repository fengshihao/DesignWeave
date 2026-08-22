import fs from "node:fs";
import path from "node:path";
import { applyTitleToReadme, copyPrdPack, PRD_PACK_FILES } from "./prdPack.js";

export type HeadingChunk = {
  title: string;
  body: string;
};

const FILE_RULES: Array<{ file: string; patterns: RegExp[] }> = [
  {
    file: "01-背景与目标.md",
    patterns: [/背景/, /问题/, /目标用户/, /成功标准/, /范围/, /非目标/, /一句话/],
  },
  {
    file: "02-用户故事.md",
    patterns: [/用户故事/, /作为/, /^us[-–]?\d+/i, /我想要/, /验收标准/],
  },
  {
    file: "03-交互与体验.md",
    patterns: [/交互/, /体验/, /入口/, /信息架构/, /主流程/, /界面/, /空态/, /失败/],
  },
  {
    file: "04-规格与约束.md",
    patterns: [/规格/, /约束/, /机型/, /系统/, /区域/, /权限/, /合规/, /依赖/, /兼容/, /回滚/, /细则/],
  },
  {
    file: "05-验收.md",
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

export function assignChunkFile(title: string): string | null {
  const t = title.trim();
  for (const rule of FILE_RULES) {
    if (rule.patterns.some((re) => re.test(t))) return rule.file;
  }
  return null;
}

function appendImported(existing: string, chunks: HeadingChunk[]): string {
  if (!chunks.length) return existing;
  const blocks = chunks.map((c) => `## ${c.title}\n\n${c.body || "（原文此节为空）"}`);
  return `${existing.trim()}\n\n> 以下从导入原文拆入，未编造事实。\n\n${blocks.join("\n\n")}\n`;
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
  const grouped = new Map<string, HeadingChunk[]>();
  const unmatched: HeadingChunk[] = [];
  for (const chunk of chunks) {
    const file = assignChunkFile(chunk.title);
    if (!file) {
      unmatched.push(chunk);
      continue;
    }
    const list = grouped.get(file) || [];
    list.push(chunk);
    grouped.set(file, list);
  }

  const filesWritten: string[] = [...PRD_PACK_FILES];
  for (const [file, list] of grouped) {
    const prev = fs.readFileSync(path.join(input.dest, file), "utf8");
    fs.writeFileSync(path.join(input.dest, file), appendImported(prev, list), "utf8");
  }

  const gapsPath = path.join(input.dest, "gaps.md");
  const gapLines = [
    "# 待补齐",
    "",
    "导入后按标准文档包拆写。对不上的原文在下面；对应节仍留「（待补充）」。",
    "",
  ];
  if (unmatched.length) {
    gapLines.push("## 未能归入文档包的原文", "");
    for (const c of unmatched) {
      gapLines.push(`### ${c.title}`, "", c.body || "（空）", "");
    }
  } else {
    gapLines.push("（导入章节都对上了文档包。仍须检查清晰度：占位、含糊、缺验收都不算过。）", "");
  }
  fs.writeFileSync(gapsPath, gapLines.join("\n"), "utf8");

  const readmePath = path.join(input.dest, "README.md");
  let readme = fs.readFileSync(readmePath, "utf8");
  readme = applyTitleToReadme(readme, input.title);
  readme = readme.replace(/^filling$/m, "imported");
  const firstPara = input.original
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#") && !l.startsWith(">"));
  if (firstPara) {
    readme = readme.replace("（待补充）", firstPara.slice(0, 120));
  }
  fs.writeFileSync(readmePath, readme, "utf8");

  return { unmatched, filesWritten };
}

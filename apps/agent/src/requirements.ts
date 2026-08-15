import fs from "node:fs";
import path from "node:path";
import { customAlphabet } from "nanoid";
import { config } from "./config.js";
import { getDb } from "./db.js";
import {
  commitAll,
  ensureDocumentVault,
  isDirty,
  listVersions,
  looksLikeCodeTree,
} from "./gitVault.js";

export type RequirementMeta = {
  id: string;
  title: string;
  summary: string;
  primaryRepo?: string;
  relatedRepos: string[];
  phase: "guide" | "document" | "gaps";
  createdAt: string;
  updatedAt: string;
  vaultPath: string;
};

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

function slugify(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return s || "req";
}

export function inboxRoot(): string {
  return path.join(config.dataDir, "inbox", "requirements");
}

export function resolveVaultDir(primaryRepo: string | undefined, folderName: string): string {
  if (primaryRepo && fs.existsSync(primaryRepo)) {
    return path.join(primaryRepo, ".designweave", "requirements", folderName);
  }
  return path.join(inboxRoot(), folderName);
}

export function ensureRequirementsTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS requirements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      primary_repo TEXT,
      related_repos TEXT NOT NULL DEFAULT '[]',
      phase TEXT NOT NULL DEFAULT 'guide',
      vault_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function writeMetaFile(vaultPath: string, meta: RequirementMeta): void {
  const relatedYaml = meta.relatedRepos.length
    ? meta.relatedRepos.map((r) => `  - ${JSON.stringify(r)}`).join("\n")
    : "  []";
  const body = `---
id: ${meta.id}
title: ${JSON.stringify(meta.title)}
summary: ${JSON.stringify(meta.summary)}
primaryRepo: ${meta.primaryRepo ? JSON.stringify(meta.primaryRepo) : "null"}
relatedRepos:
${relatedYaml}
phase: ${meta.phase}
createdAt: ${meta.createdAt}
updatedAt: ${meta.updatedAt}
---

# ${meta.title}

- 主工程：${meta.primaryRepo || "（未绑定，位于 inbox）"}
- 关联工程：
${meta.relatedRepos.length ? meta.relatedRepos.map((r) => `  - \`${r}\``).join("\n") : "  - （无）"}
`;
  fs.writeFileSync(path.join(vaultPath, "meta.md"), body, "utf8");
}

export function defaultPrdMarkdown(title: string, summary: string): string {
  return `# ${title}

> 状态：草稿 · OEM 内置 App 需求

## 背景与问题

${summary || "（待补充）"}

## 目标用户

（待补充：终端用户 / 运营商 / 内部运维？）

## 目标与成功标准

（待补充）

## 范围

### 范围内

（待补充）

### 范围外

（待补充）

## 机型 / 系统 / 区域

（待补充：机型、Android 版本、区域、品牌差异）

## 入口与交互

（待补充：设置路径、桌面入口等）

## 权限与合规

（待补充）

## 工程拆分

- 主工程：（创建时选择）
- 关联工程：（创建时选择）
- 职责切分：（待补充）

## 依赖与风险

（待补充：系统能力、其他内置 App、云端）

## 兼容 / 升级 / 回滚

（待补充）

## 验收标准

（待补充）

## 未决问题

（无）
`;
}

export function createRequirement(input: {
  title: string;
  summary?: string;
  primaryRepo?: string;
  relatedRepos?: string[];
  importMarkdown?: string;
  docRoot?: string;
}): RequirementMeta & { codeTreeWarning?: string } {
  ensureRequirementsTable();
  const now = new Date().toISOString();
  const id = nanoid(8);
  const title = input.title.trim() || "未命名需求";
  const folderName = `REQ-${id}-${slugify(title)}`;
  const primaryRepo = input.primaryRepo?.trim() || undefined;
  const relatedRepos = (input.relatedRepos || [])
    .map((r) => r.trim())
    .filter(Boolean)
    .filter((r) => r !== primaryRepo);
  const docRoot = input.docRoot?.trim() || undefined;

  if (primaryRepo && !fs.existsSync(primaryRepo)) {
    throw new Error(`代码仓路径不存在：${primaryRepo}`);
  }
  for (const r of relatedRepos) {
    if (!fs.existsSync(r)) {
      throw new Error(`代码仓路径不存在：${r}`);
    }
  }

  let vaultPath: string;
  if (docRoot) {
    vaultPath = path.resolve(docRoot);
    fs.mkdirSync(vaultPath, { recursive: true });
  } else {
    vaultPath = resolveVaultDir(primaryRepo, folderName);
    fs.mkdirSync(path.join(vaultPath, "import"), { recursive: true });
  }

  const codeTreeWarning = looksLikeCodeTree(vaultPath)
    ? "这看起来像代码仓。文档仓应是专门放 PRD / 调研的目录。"
    : undefined;

  ensureDocumentVault(vaultPath);
  fs.mkdirSync(path.join(vaultPath, "import"), { recursive: true });

  const meta: RequirementMeta = {
    id,
    title,
    summary: (input.summary || "").trim(),
    primaryRepo,
    relatedRepos,
    phase: input.importMarkdown ? "gaps" : "guide",
    createdAt: now,
    updatedAt: now,
    vaultPath,
  };

  writeMetaFile(vaultPath, meta);

  if (input.importMarkdown && input.importMarkdown.trim()) {
    const original = input.importMarkdown.trim();
    fs.writeFileSync(path.join(vaultPath, "import", "original.md"), original + "\n", "utf8");
    fs.writeFileSync(path.join(vaultPath, "PRD.md"), original + "\n", "utf8");
  } else {
    fs.writeFileSync(
      path.join(vaultPath, "PRD.md"),
      defaultPrdMarkdown(title, meta.summary),
      "utf8"
    );
  }

  fs.writeFileSync(
    path.join(vaultPath, "gaps.md"),
    `# 缺口与待确认\n\n（引导或导入后由 AI 生成）\n`,
    "utf8"
  );

  getDb()
    .prepare(
      `INSERT INTO requirements
       (id, title, summary, primary_repo, related_repos, phase, vault_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      meta.id,
      meta.title,
      meta.summary,
      meta.primaryRepo ?? null,
      JSON.stringify(meta.relatedRepos),
      meta.phase,
      meta.vaultPath,
      meta.createdAt,
      meta.updatedAt
    );

  commitAll(vaultPath, "系统：初始化文档仓", {
    name: "系统",
    email: "system@designweave.local",
  });

  return { ...meta, codeTreeWarning };
}

export function listRequirements(): RequirementMeta[] {
  ensureRequirementsTable();
  const rows = getDb()
    .prepare(
      `SELECT id, title, summary, primary_repo as primaryRepo, related_repos as relatedRepos,
              phase, vault_path as vaultPath, created_at as createdAt, updated_at as updatedAt
       FROM requirements ORDER BY updated_at DESC`
    )
    .all() as Array<{
    id: string;
    title: string;
    summary: string;
    primaryRepo: string | null;
    relatedRepos: string;
    phase: RequirementMeta["phase"];
    vaultPath: string;
    createdAt: string;
    updatedAt: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    primaryRepo: r.primaryRepo ?? undefined,
    relatedRepos: JSON.parse(r.relatedRepos || "[]") as string[],
    phase: r.phase,
    vaultPath: r.vaultPath,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export function getRequirement(id: string): RequirementMeta | null {
  ensureRequirementsTable();
  const r = getDb()
    .prepare(
      `SELECT id, title, summary, primary_repo as primaryRepo, related_repos as relatedRepos,
              phase, vault_path as vaultPath, created_at as createdAt, updated_at as updatedAt
       FROM requirements WHERE id = ?`
    )
    .get(id) as
    | {
        id: string;
        title: string;
        summary: string;
        primaryRepo: string | null;
        relatedRepos: string;
        phase: RequirementMeta["phase"];
        vaultPath: string;
        createdAt: string;
        updatedAt: string;
      }
    | undefined;
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    primaryRepo: r.primaryRepo ?? undefined,
    relatedRepos: JSON.parse(r.relatedRepos || "[]") as string[],
    phase: r.phase,
    vaultPath: r.vaultPath,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function readPrdMarkdown(id: string): string {
  const meta = getRequirement(id);
  if (!meta) throw new Error("需求不存在");
  const p = path.join(meta.vaultPath, "PRD.md");
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8");
}

export function writePrdMarkdown(id: string, content: string): void {
  const meta = getRequirement(id);
  if (!meta) throw new Error("需求不存在");
  fs.writeFileSync(path.join(meta.vaultPath, "PRD.md"), content, "utf8");
  touchRequirement(id);
}

export function readGapsMarkdown(id: string): string {
  const meta = getRequirement(id);
  if (!meta) throw new Error("需求不存在");
  const p = path.join(meta.vaultPath, "gaps.md");
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8");
}

export function writeGapsMarkdown(id: string, content: string): void {
  const meta = getRequirement(id);
  if (!meta) throw new Error("需求不存在");
  fs.writeFileSync(path.join(meta.vaultPath, "gaps.md"), content, "utf8");
  touchRequirement(id);
}

export function readOriginalImport(id: string): string | null {
  const meta = getRequirement(id);
  if (!meta) return null;
  const p = path.join(meta.vaultPath, "import", "original.md");
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

export function setRequirementPhase(id: string, phase: RequirementMeta["phase"]): RequirementMeta {
  const meta = getRequirement(id);
  if (!meta) throw new Error("需求不存在");
  meta.phase = phase;
  meta.updatedAt = new Date().toISOString();
  getDb()
    .prepare(`UPDATE requirements SET phase = ?, updated_at = ? WHERE id = ?`)
    .run(phase, meta.updatedAt, id);
  writeMetaFile(meta.vaultPath, meta);
  return meta;
}

function touchRequirement(id: string): void {
  const now = new Date().toISOString();
  getDb().prepare(`UPDATE requirements SET updated_at = ? WHERE id = ?`).run(now, id);
  const meta = getRequirement(id);
  if (meta) {
    meta.updatedAt = now;
    writeMetaFile(meta.vaultPath, meta);
  }
}

export function importMarkdownToRequirement(
  id: string,
  markdown: string,
  mode: "replace" | "append" = "replace"
): { prd: string; originalImport: string } {
  const meta = getRequirement(id);
  if (!meta) throw new Error("需求不存在");
  const text = markdown.trim();
  if (!text) throw new Error("导入内容为空");

  const importDir = path.join(meta.vaultPath, "import");
  fs.mkdirSync(importDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(importDir, `original-${stamp}.md`), text + "\n", "utf8");
  fs.writeFileSync(path.join(importDir, "original.md"), text + "\n", "utf8");

  const prdPath = path.join(meta.vaultPath, "PRD.md");
  if (mode === "append" && fs.existsSync(prdPath)) {
    const prev = fs.readFileSync(prdPath, "utf8");
    fs.writeFileSync(
      prdPath,
      `${prev.trim()}\n\n---\n\n## 导入补充（${new Date().toISOString()}）\n\n${text}\n`,
      "utf8"
    );
  } else {
    fs.writeFileSync(prdPath, text + "\n", "utf8");
  }

  setRequirementPhase(id, "gaps");
  touchRequirement(id);
  return {
    prd: readPrdMarkdown(id),
    originalImport: text,
  };
}

export function getRequirementBundle(id: string) {
  const meta = getRequirement(id);
  if (!meta) return null;
  const versions = listVersions(meta.vaultPath, 1);
  return {
    requirement: meta,
    prd: readPrdMarkdown(id),
    gaps: readGapsMarkdown(id),
    originalImport: readOriginalImport(id),
    uncommitted: isDirty(meta.vaultPath),
    latestVersion: versions[0] ?? null,
  };
}

import fs from "node:fs";
import path from "node:path";
import { customAlphabet } from "nanoid";
import { getDb } from "./db.js";
import { HttpError } from "./httpError.js";
import { folderNameFor, uniqueFolderName } from "./folderName.js";
import { normalizeImportedPrd } from "./importNormalize.js";
import { copyPrdPack } from "./prdPack.js";
import {
  isReady,
  readMetaFile,
  writeMetaFile,
  type ClarityState,
  type DiskProjectMeta,
  type DiskProjectPhase,
  type ProjectSource,
} from "./projectMeta.js";
import { commitAll, ensureDocumentVault, isDirty, listVersions } from "./gitVault.js";
import { ensureProjectLayout } from "./projectLayout.js";
import { PRD_FILE } from "./prdPack.js";
import {
  getWorkspaceRoot,
  isUnderWorkspaceRoot,
  workspaceRootOrThrow,
} from "./workspaceSettings.js";

export type RequirementMeta = {
  id: string;
  title: string;
  summary: string;
  owner: string;
  source: ProjectSource;
  phase: DiskProjectPhase;
  clarity: ClarityState;
  createdAt: string;
  updatedAt: string;
  vaultPath: string;
  folderName: string;
  /** @deprecated 代码目录改为服务级批准，不再写入工程 meta */
  primaryRepo?: string;
  /** @deprecated */
  relatedRepos: string[];
};

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

export function inboxRoot(): string {
  return path.join(process.env.DATA_DIR || "", "inbox", "requirements");
}

export function ensureRequirementsTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS requirements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      primary_repo TEXT,
      related_repos TEXT NOT NULL DEFAULT '[]',
      phase TEXT NOT NULL DEFAULT 'filling',
      vault_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function cacheUpsert(meta: RequirementMeta): void {
  ensureRequirementsTable();
  getDb()
    .prepare(
      `INSERT INTO requirements
       (id, title, summary, primary_repo, related_repos, phase, vault_path, created_at, updated_at)
       VALUES (?, ?, ?, NULL, '[]', ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         phase = excluded.phase,
         vault_path = excluded.vault_path,
         updated_at = excluded.updated_at`
    )
    .run(
      meta.id,
      meta.title,
      meta.summary,
      meta.phase,
      meta.vaultPath,
      meta.createdAt,
      meta.updatedAt
    );
}

function cacheDelete(id: string): void {
  ensureRequirementsTable();
  getDb().prepare(`DELETE FROM requirements WHERE id = ?`).run(id);
}

function cacheRow(id: string): { vaultPath: string; title: string; createdAt: string; updatedAt: string; phase: string; summary: string } | null {
  ensureRequirementsTable();
  const r = getDb()
    .prepare(
      `SELECT title, summary, phase, vault_path as vaultPath, created_at as createdAt, updated_at as updatedAt
       FROM requirements WHERE id = ?`
    )
    .get(id) as
    | {
        title: string;
        summary: string;
        phase: string;
        vaultPath: string;
        createdAt: string;
        updatedAt: string;
      }
    | undefined;
  return r ?? null;
}

function listCacheRows(): Array<{
  id: string;
  title: string;
  summary: string;
  phase: string;
  vaultPath: string;
  createdAt: string;
  updatedAt: string;
}> {
  ensureRequirementsTable();
  return getDb()
    .prepare(
      `SELECT id, title, summary, phase, vault_path as vaultPath, created_at as createdAt, updated_at as updatedAt
       FROM requirements ORDER BY updated_at DESC`
    )
    .all() as Array<{
    id: string;
    title: string;
    summary: string;
    phase: string;
    vaultPath: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

function toRequirement(dir: string, disk: DiskProjectMeta): RequirementMeta {
  return {
    id: disk.id,
    title: disk.title,
    summary: "",
    owner: disk.owner,
    source: disk.source,
    phase: disk.phase,
    clarity: disk.clarity,
    createdAt: disk.createdAt,
    updatedAt: disk.updatedAt,
    vaultPath: dir,
    folderName: path.basename(dir),
    relatedRepos: [],
  };
}

export function listDiskProjects(root: string | null | undefined): RequirementMeta[] {
  if (!root || !fs.existsSync(root)) return [];
  const out: RequirementMeta[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    const dir = path.join(root, entry.name);
    const disk = readMetaFile(dir);
    if (!disk) continue;
    const dirtyBefore = isDirty(dir);
    if (ensureProjectLayout(dir, disk.title) && !dirtyBefore) {
      try {
        commitAll(dir, "系统：整理成产品/研发/测试", {
          name: "系统",
          email: "system@designweave.local",
        });
      } catch {
        /* 整理失败也不挡打开 */
      }
    }
    out.push(toRequirement(dir, disk));
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function scanWorkspaceProjects(root = getWorkspaceRoot()): RequirementMeta[] {
  const out = listDiskProjects(root);
  for (const meta of out) cacheUpsert(meta);
  return out;
}

export function listOrphanRequirements(): RequirementMeta[] {
  const root = getWorkspaceRoot();
  const scannedIds = new Set(scanWorkspaceProjects(root).map((p) => p.id));
  return listCacheRows()
    .filter((r) => !scannedIds.has(r.id))
    .filter((r) => !root || !isUnderWorkspaceRoot(r.vaultPath, root) || !fs.existsSync(path.join(r.vaultPath, "meta.md")))
    .map((r) => {
      const disk = fs.existsSync(r.vaultPath) ? readMetaFile(r.vaultPath) : null;
      return {
        id: r.id,
        title: disk?.title || r.title,
        summary: r.summary,
        owner: disk?.owner || "",
        source: disk?.source || "template",
        phase: disk?.phase || "filling",
        clarity: disk?.clarity || "pending",
        createdAt: disk?.createdAt || r.createdAt,
        updatedAt: disk?.updatedAt || r.updatedAt,
        vaultPath: r.vaultPath,
        folderName: path.basename(r.vaultPath),
        relatedRepos: [],
      };
    });
}

export function listRequirements(): RequirementMeta[] {
  return scanWorkspaceProjects();
}

export function getRequirement(id: string): RequirementMeta | null {
  const scanned = scanWorkspaceProjects();
  const hit = scanned.find((p) => p.id === id);
  if (hit) {
    const fresh = readMetaFile(hit.vaultPath);
    return fresh ? toRequirement(hit.vaultPath, fresh) : hit;
  }
  const row = cacheRow(id);
  if (!row || !fs.existsSync(row.vaultPath)) return null;
  const disk = readMetaFile(row.vaultPath);
  if (disk) return toRequirement(row.vaultPath, disk);
  return {
    id,
    title: row.title,
    summary: row.summary,
    owner: "",
    source: "template",
    phase: "filling",
    clarity: "pending",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    vaultPath: row.vaultPath,
    folderName: path.basename(row.vaultPath),
    relatedRepos: [],
  };
}

export function patchProjectMeta(
  id: string,
  patch: Partial<Pick<DiskProjectMeta, "phase" | "clarity" | "title" | "owner">>
): RequirementMeta {
  const meta = getRequirement(id);
  if (!meta) throw new HttpError("工程不存在", 404);
  const next: DiskProjectMeta = {
    id: meta.id,
    title: patch.title ?? meta.title,
    owner: patch.owner ?? meta.owner,
    source: meta.source,
    phase: patch.phase ?? meta.phase,
    clarity: patch.clarity ?? meta.clarity,
    createdAt: meta.createdAt,
    updatedAt: new Date().toISOString(),
  };
  if (next.clarity === "ready") next.phase = "ready";
  writeMetaFile(meta.vaultPath, next);
  const updated = toRequirement(meta.vaultPath, next);
  cacheUpsert(updated);
  return updated;
}

export function createRequirement(input: {
  title: string;
  owner: string;
  source?: ProjectSource;
  importMarkdown?: string;
}): RequirementMeta {
  const root = workspaceRootOrThrow();
  const title = input.title.trim() || "未命名工程";
  const existing = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const folderName = uniqueFolderName(existing, title);
  const vaultPath = path.join(root, folderName);
  if (fs.existsSync(vaultPath)) {
    throw new HttpError("已经有这个名字的工程文件夹了。", 409);
  }

  const now = new Date().toISOString();
  const id = nanoid(8);
  const imported = Boolean(input.importMarkdown && input.importMarkdown.trim());
  const source: ProjectSource = input.source || (imported ? "import" : "template");
  const phase: DiskProjectPhase = source === "import" ? "imported" : "filling";

  fs.mkdirSync(vaultPath, { recursive: true });
  ensureDocumentVault(vaultPath);

  if (source === "import" && imported) {
    normalizeImportedPrd({
      dest: vaultPath,
      title,
      owner: input.owner,
      id,
      original: input.importMarkdown!.trim(),
      createdAt: now,
    });
  } else {
    copyPrdPack(vaultPath, {
      id,
      title,
      owner: input.owner,
      source: "template",
      phase: "filling",
      clarity: "pending",
      createdAt: now,
      updatedAt: now,
    });
  }

  const disk = readMetaFile(vaultPath);
  if (!disk) throw new HttpError("工程创建后读不到 meta.md", 500);
  const meta = toRequirement(vaultPath, disk);
  cacheUpsert(meta);
  commitAll(vaultPath, "系统：初始化文档仓", {
    name: "系统",
    email: "system@designweave.local",
  });
  return meta;
}

export function deleteRequirement(id: string): RequirementMeta {
  const meta = getRequirement(id);
  if (!meta) throw new HttpError("工程不存在", 404);
  const root = getWorkspaceRoot();
  if (!root || !isUnderWorkspaceRoot(meta.vaultPath, root)) {
    throw new HttpError(
      "这个工程不在运行根目录下。可以从工作台拿掉，但不会自动搬盘或删文件夹。",
      400
    );
  }
  if (fs.existsSync(meta.vaultPath)) {
    fs.rmSync(meta.vaultPath, { recursive: true, force: true });
  }
  cacheDelete(id);
  return meta;
}

/** 丢掉 SQLite 缓存行，不删磁盘。用于根目录外的旧工程。 */
export function abandonRequirement(id: string): RequirementMeta {
  const meta = getRequirement(id);
  if (!meta) throw new HttpError("工程不存在", 404);
  cacheDelete(id);
  return meta;
}

export function setRequirementPhase(id: string, phase: DiskProjectPhase): RequirementMeta {
  return patchProjectMeta(id, {
    phase,
    clarity: phase === "ready" ? "ready" : undefined,
  });
}

export function importMarkdownToRequirement(
  id: string,
  markdown: string
): { originalImport: string } {
  const meta = getRequirement(id);
  if (!meta) throw new HttpError("工程不存在", 404);
  const text = markdown.trim();
  if (!text) throw new HttpError("导入内容为空", 400);
  normalizeImportedPrd({
    dest: meta.vaultPath,
    title: meta.title,
    owner: meta.owner,
    id: meta.id,
    original: text,
    createdAt: new Date().toISOString(),
  });
  patchProjectMeta(id, { phase: "imported", clarity: "pending" });
  return { originalImport: text };
}

export function getRequirementBundle(id: string) {
  const meta = getRequirement(id);
  if (!meta) return null;
  const versions = listVersions(meta.vaultPath, 1);
  const gaps = path.join(meta.vaultPath, "product", "gaps.md");
  const original = path.join(meta.vaultPath, "product", "import", "original.md");
  const prdPath = path.join(meta.vaultPath, PRD_FILE);
  const legacyPrd = path.join(meta.vaultPath, "PRD.md");
  return {
    requirement: meta,
    prd: fs.existsSync(prdPath)
      ? fs.readFileSync(prdPath, "utf8")
      : fs.existsSync(legacyPrd)
        ? fs.readFileSync(legacyPrd, "utf8")
        : "",
    gaps: fs.existsSync(gaps) ? fs.readFileSync(gaps, "utf8") : "",
    originalImport: fs.existsSync(original) ? fs.readFileSync(original, "utf8") : null,
    uncommitted: isDirty(meta.vaultPath),
    latestVersion: versions[0] ?? null,
    ready: isReady(meta),
  };
}

export function readVaultMarkdown(id: string, rel: string): string {
  const meta = getRequirement(id);
  if (!meta) throw new Error("需求不存在");
  const p = path.join(meta.vaultPath, rel);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8");
}

export function writeVaultMarkdown(id: string, rel: string, content: string): void {
  const meta = getRequirement(id);
  if (!meta) throw new Error("需求不存在");
  fs.writeFileSync(path.join(meta.vaultPath, rel), content, "utf8");
  patchProjectMeta(id, {});
}

export function readPrdMarkdown(id: string): string {
  const prd = readVaultMarkdown(id, PRD_FILE);
  if (prd) return prd;
  return readVaultMarkdown(id, "PRD.md");
}

export function writePrdMarkdown(id: string, content: string): void {
  writeVaultMarkdown(id, PRD_FILE, content);
}

export function readGapsMarkdown(id: string): string {
  const nested = readVaultMarkdown(id, path.join("product", "gaps.md"));
  if (nested) return nested;
  return readVaultMarkdown(id, "gaps.md");
}

export function writeGapsMarkdown(id: string, content: string): void {
  writeVaultMarkdown(id, "gaps.md", content);
}

export function readOriginalImport(id: string): string | null {
  const text = readVaultMarkdown(id, path.join("product", "import", "original.md"));
  if (text) return text;
  const legacy = readVaultMarkdown(id, path.join("import", "original.md"));
  return legacy || null;
}

export { folderNameFor, isReady };

import fs from "node:fs";
import path from "node:path";
import { getDb } from "./db.js";
import { HttpError } from "./httpError.js";
import { scanClaudeKnownProjects } from "./claudeProjects.js";

export type ApprovedCodeDir = {
  path: string;
  name: string;
  exists: boolean;
  approved: boolean;
  hasClaudeDir: boolean;
  firstSeenAt: string;
  approvedAt: string | null;
};

export function ensureWorkspaceTables(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS workspace_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS code_dir_scan (
      path TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      approved INTEGER NOT NULL DEFAULT 0,
      approved_at TEXT
    );
  `);
}

export function getWorkspaceRoot(): string | null {
  ensureWorkspaceTables();
  const row = getDb()
    .prepare(`SELECT value FROM workspace_settings WHERE key = 'workspaceRoot'`)
    .get() as { value: string } | undefined;
  const value = row?.value?.trim();
  return value || null;
}

export function workspaceRootOrThrow(): string {
  const root = getWorkspaceRoot();
  if (!root) {
    throw new HttpError("架构师还没设定运行根目录。", 400);
  }
  return root;
}

export function setWorkspaceRoot(raw: string): string {
  ensureWorkspaceTables();
  const abs = path.resolve(raw.trim());
  if (!abs || abs === path.sep) {
    throw new HttpError("运行根目录不合适。", 400);
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new HttpError("这个目录不存在。", 400);
  }
  getDb()
    .prepare(
      `INSERT INTO workspace_settings (key, value) VALUES ('workspaceRoot', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(abs);
  return abs;
}

export function isUnderWorkspaceRoot(dir: string, root = getWorkspaceRoot()): boolean {
  if (!root) return false;
  const abs = path.resolve(dir);
  const base = path.resolve(root);
  return abs === base || abs.startsWith(base + path.sep);
}

function mapScanRow(r: {
  path: string;
  name: string;
  first_seen_at: string;
  approved: number;
  approved_at: string | null;
}): ApprovedCodeDir {
  const exists = fs.existsSync(r.path) && fs.statSync(r.path).isDirectory();
  return {
    path: r.path,
    name: r.name,
    exists,
    approved: Boolean(r.approved) && exists,
    hasClaudeDir: exists ? fs.existsSync(path.join(r.path, ".claude")) : false,
    firstSeenAt: r.first_seen_at,
    approvedAt: r.approved_at,
  };
}

export function listCodeDirRows(): ApprovedCodeDir[] {
  ensureWorkspaceTables();
  const rows = getDb()
    .prepare(
      `SELECT path, name, first_seen_at, approved, approved_at FROM code_dir_scan ORDER BY name COLLATE NOCASE`
    )
    .all() as Array<{
    path: string;
    name: string;
    first_seen_at: string;
    approved: number;
    approved_at: string | null;
  }>;
  return rows.map(mapScanRow);
}

export function listApprovedCodeDirs(): string[] {
  return listCodeDirRows()
    .filter((d) => d.approved)
    .map((d) => d.path);
}

export function hasApprovedCodeDirs(): boolean {
  return listApprovedCodeDirs().length > 0;
}

/** 再扫时新出现的默认未批准；取消批准即从 AI 可用集合拿掉。 */
export function refreshClaudeCodeDirs(): {
  source: string;
  found: boolean;
  error?: string;
  dirs: ApprovedCodeDir[];
  newlySeen: string[];
} {
  ensureWorkspaceTables();
  const scan = scanClaudeKnownProjects();
  const now = new Date().toISOString();
  const newlySeen: string[] = [];
  const insert = getDb().prepare(
    `INSERT INTO code_dir_scan (path, name, first_seen_at, approved, approved_at)
     VALUES (?, ?, ?, 0, NULL)
     ON CONFLICT(path) DO UPDATE SET name = excluded.name`
  );
  const tx = getDb().transaction(() => {
    for (const p of scan.projects) {
      const prev = getDb()
        .prepare(`SELECT path FROM code_dir_scan WHERE path = ?`)
        .get(p.path) as { path: string } | undefined;
      if (!prev) newlySeen.push(p.path);
      insert.run(p.path, p.name, now);
    }
  });
  tx();
  return {
    source: scan.source,
    found: scan.found,
    error: scan.error,
    dirs: listCodeDirRows().filter((d) =>
      scan.projects.some((p) => p.path === d.path)
    ),
    newlySeen,
  };
}

export function setApprovedCodeDirs(paths: string[]): ApprovedCodeDir[] {
  ensureWorkspaceTables();
  const scan = refreshClaudeCodeDirs();
  const allowed = new Set(scan.dirs.map((d) => d.path));
  const wanted = [
    ...new Set(paths.map((p) => path.resolve(p.trim())).filter(Boolean)),
  ];
  for (const p of wanted) {
    if (!allowed.has(p)) {
      throw new HttpError("只能批准从 ~/.claude.json 扫到的目录，不能手补路径。", 400);
    }
  }
  const wantSet = new Set(wanted);
  const now = new Date().toISOString();
  const update = getDb().prepare(
    `UPDATE code_dir_scan SET approved = ?, approved_at = ? WHERE path = ?`
  );
  const tx = getDb().transaction(() => {
    for (const dir of scan.dirs) {
      const on = wantSet.has(dir.path);
      update.run(on ? 1 : 0, on ? now : null, dir.path);
    }
  });
  tx();
  return refreshClaudeCodeDirs().dirs;
}

export function mergeApprovalSelection(
  scanned: string[],
  requested: string[]
): { approved: string[]; rejected: string[] } {
  const allow = new Set(scanned);
  const approved: string[] = [];
  const rejected: string[] = [];
  for (const p of requested) {
    if (allow.has(p)) approved.push(p);
    else rejected.push(p);
  }
  return { approved, rejected };
}

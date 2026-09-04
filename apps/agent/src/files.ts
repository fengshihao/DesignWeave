import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isPathInside } from "./hostPath.js";
import { getRequirement } from "./requirements.js";
import { DOC_FOLDERS, FOLDER_LABELS } from "./docFolders.js";
import { folderHasPendingFollow } from "./folderVersion.js";
import { ensureProjectLayoutAndCommit } from "./projectLayout.js";

const ALLOWED = new Set([".md", ".markdown", ".txt"]);

export function etagFor(filePath: string): string {
  const st = fs.statSync(filePath);
  return `"${st.mtimeMs}-${st.size}"`;
}

export function contentHash(content: string): string {
  return crypto.createHash("sha1").update(content).digest("hex").slice(0, 12);
}

export function resolveDocFile(projectId: string, relPath: string): string {
  const meta = getRequirement(projectId);
  if (!meta) throw new Error("工程不存在");
  const safe = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!safe || safe.includes("..")) {
    throw new Error("路径不合法");
  }
  const abs = path.resolve(meta.vaultPath, safe);
  const root = path.resolve(meta.vaultPath);
  if (!isPathInside(abs, root)) {
    throw new Error("路径不合法");
  }
  const ext = path.extname(abs).toLowerCase();
  if (ext && !ALLOWED.has(ext) && path.basename(abs) !== ".gitignore") {
    throw new Error("只能打开文档仓里的 Markdown");
  }
  return abs;
}

export function listDocTree(projectId: string): Array<{
  path: string;
  name: string;
  isDir: boolean;
}> {
  const meta = getRequirement(projectId);
  if (!meta) throw new Error("工程不存在");
  ensureProjectLayoutAndCommit(meta.vaultPath, meta.title);
  const root = meta.vaultPath;
  const out: Array<{ path: string; name: string; isDir: boolean }> = [];

  for (const folder of DOC_FOLDERS) {
    const absFolder = path.join(root, folder);
    if (!fs.existsSync(absFolder)) fs.mkdirSync(absFolder, { recursive: true });
    out.push({ path: folder, name: FOLDER_LABELS[folder], isDir: true });
    walkFolder(absFolder, folder);
  }

  function walkFolder(dir: string, prefix: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === ".dw" || entry.name === "meta.md") continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        out.push({ path: rel, name: entry.name, isDir: true });
        walkFolder(abs, prefix);
      } else if (ALLOWED.has(path.extname(entry.name).toLowerCase())) {
        out.push({ path: rel, name: entry.name, isDir: false });
      }
    }
  }

  return out.sort((a, b) => {
    const rank = (p: string) => {
      const top = p.split("/")[0];
      const i = DOC_FOLDERS.indexOf(top as (typeof DOC_FOLDERS)[number]);
      return i === -1 ? 99 : i;
    };
    const d = rank(a.path) - rank(b.path);
    if (d) return d;
    return a.path.localeCompare(b.path, "zh");
  });
}

export function listFolderStatus(projectId: string): Array<{
  id: string;
  label: string;
  pendingFollow: boolean;
}> {
  const meta = getRequirement(projectId);
  if (!meta) throw new Error("工程不存在");
  ensureProjectLayoutAndCommit(meta.vaultPath, meta.title);
  return DOC_FOLDERS.map((id) => ({
    id,
    label: FOLDER_LABELS[id],
    pendingFollow: folderHasPendingFollow(meta.vaultPath, id),
  }));
}

export function readDocFile(
  projectId: string,
  relPath: string
): { content: string; etag: string; path: string } {
  const abs = resolveDocFile(projectId, relPath);
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    throw new Error("文件不存在");
  }
  return {
    path: relPath.replace(/\\/g, "/").replace(/^\/+/, ""),
    content: fs.readFileSync(abs, "utf8"),
    etag: etagFor(abs),
  };
}

export function writeDocFile(
  projectId: string,
  relPath: string,
  content: string,
  ifMatch?: string
): { content: string; etag: string; path: string } {
  const abs = resolveDocFile(projectId, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (fs.existsSync(abs) && ifMatch) {
    const current = etagFor(abs);
    if (current !== ifMatch) {
      throw Object.assign(new Error("纸面和磁盘对不上，请重新打开这篇"), {
        status: 409,
      });
    }
  }
  fs.writeFileSync(abs, content, "utf8");
  return {
    path: relPath.replace(/\\/g, "/").replace(/^\/+/, ""),
    content: fs.readFileSync(abs, "utf8"),
    etag: etagFor(abs),
  };
}

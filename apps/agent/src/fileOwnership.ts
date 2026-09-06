import type { AppRole } from "./roles.js";
import { canWritePath } from "./docFolders.js";

/** 归一化工程内相对路径 */
export function normalizeVaultPath(relPath: string): string {
  return relPath.replace(/\\/g, "/").replace(/^\/+/, "");
}

/**
 * 按文件夹归属的读写权；特殊只读路径在 canWritePath 之前拦截。
 */
export function canWriteFile(role: AppRole, relPath: string): boolean {
  const p = normalizeVaultPath(relPath);
  if (!p || p.includes("..")) return false;
  if (p.startsWith("import/") || p.startsWith("product/import/")) return false;
  if (p === "meta.md") return false;
  if (p === "gaps.md" || p === "product/gaps.md") return false;
  return canWritePath(role, p);
}

export function canReadFile(_role: AppRole, relPath: string): boolean {
  const p = normalizeVaultPath(relPath);
  return Boolean(p) && !p.includes("..");
}

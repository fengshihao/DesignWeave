import type { AppRole, DocFolder } from "@/lib/api";

export const FOLDER_LABELS: Record<DocFolder, string> = {
  product: "产品",
  eng: "研发",
  qa: "测试",
};

export const FOLDER_MAIN_FILE: Record<DocFolder, string> = {
  product: "product/PRD.md",
  eng: "eng/方案.md",
  qa: "qa/测试.md",
};

export function isDocFolder(value: string | null | undefined): value is DocFolder {
  return value === "product" || value === "eng" || value === "qa";
}

export function writableFolderOf(role: AppRole): DocFolder {
  if (role === "architect") return "eng";
  if (role === "tester") return "qa";
  return "product";
}

export function defaultFileForRole(role: AppRole): string {
  return FOLDER_MAIN_FILE[writableFolderOf(role)];
}

export function normalizeRelPath(relPath: string): string {
  return relPath.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function isProjectSkillPath(relPath: string): boolean {
  const safe = normalizeRelPath(relPath);
  return safe === ".claude/skills" || safe.startsWith(".claude/skills/");
}

export function folderOfPath(relPath: string): DocFolder | null {
  const top = normalizeRelPath(relPath).split("/")[0] || "";
  return isDocFolder(top) ? top : null;
}

export function owningFolderOf(relPath: string): DocFolder | null {
  if (isProjectSkillPath(relPath)) return "eng";
  return folderOfPath(relPath);
}

export function canCreateProject(role: AppRole): boolean {
  return role === "architect" || role === "designer";
}

export function canWritePath(role: AppRole, relPath: string): boolean {
  const folder = owningFolderOf(relPath);
  if (!folder) return false;
  return writableFolderOf(role) === folder;
}

export function followHintFor(folder: DocFolder): string {
  return folder === "qa" ? "上游改过，还没跟上。" : "产品改过，还没跟上。";
}

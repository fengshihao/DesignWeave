import type { AppRole } from "./roles.js";

export const DOC_FOLDERS = ["product", "eng", "qa"] as const;
export type DocFolder = (typeof DOC_FOLDERS)[number];

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

export const FOLLOW_FILE = "跟上.md" as const;
export const TODO_FILE = "待办.md" as const;
export const QUESTION_FILE = "问题.md" as const;

export const WRITABLE_FOLDER: Record<AppRole, DocFolder> = {
  architect: "eng",
  designer: "product",
  tester: "qa",
};

export const DOWNSTREAM: Record<DocFolder, DocFolder[]> = {
  product: ["eng", "qa"],
  eng: ["qa"],
  qa: [],
};

export function isDocFolder(value: string | null | undefined): value is DocFolder {
  return value === "product" || value === "eng" || value === "qa";
}

export function parseDocFolder(raw: unknown, fallback: DocFolder = "product"): DocFolder {
  const value = String(raw || "").trim();
  return isDocFolder(value) ? value : fallback;
}

export function writableFolderOf(role: AppRole): DocFolder {
  return WRITABLE_FOLDER[role];
}

export function defaultFileForRole(role: AppRole): string {
  return FOLDER_MAIN_FILE[writableFolderOf(role)];
}

export function normalizeRelPath(relPath: string): string {
  return relPath.replace(/\\/g, "/").replace(/^\/+/, "");
}

/** 工程内 Claude project skill（新建时从模板拷入）。 */
export function isProjectSkillPath(relPath: string): boolean {
  const safe = normalizeRelPath(relPath);
  return safe === ".claude/skills" || safe.startsWith(".claude/skills/");
}

export function folderOfPath(relPath: string): DocFolder | null {
  const safe = normalizeRelPath(relPath);
  const top = safe.split("/")[0] || "";
  return isDocFolder(top) ? top : null;
}

/** 写权 / 记版归属：侧栏三文件夹，另加技能归架构师（eng）。 */
export function owningFolderOf(relPath: string): DocFolder | null {
  if (isProjectSkillPath(relPath)) return "eng";
  return folderOfPath(relPath);
}

export function followPath(folder: DocFolder): string {
  return `${folder}/${FOLLOW_FILE}`;
}

export function todoPath(folder: DocFolder): string {
  return `${folder}/${TODO_FILE}`;
}

export function questionPath(folder: DocFolder): string {
  return `${folder}/${QUESTION_FILE}`;
}

export function pathUnderFolder(relPath: string, folder: DocFolder): boolean {
  const safe = normalizeRelPath(relPath);
  return safe === folder || safe.startsWith(`${folder}/`);
}

export function pathOwnedByFolder(relPath: string, folder: DocFolder): boolean {
  if (pathUnderFolder(relPath, folder)) return true;
  return folder === "eng" && isProjectSkillPath(relPath);
}

export function canWriteFolder(role: AppRole, folder: DocFolder): boolean {
  return writableFolderOf(role) === folder;
}

export function canWritePath(role: AppRole, relPath: string): boolean {
  const folder = owningFolderOf(relPath);
  return folder ? canWriteFolder(role, folder) : false;
}

export function canCreateProject(role: AppRole): boolean {
  return role === "architect" || role === "designer";
}

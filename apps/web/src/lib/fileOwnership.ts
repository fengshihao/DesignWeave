import type { AppRole } from "./api";
import { canWritePath, folderOfPath } from "./docFolders";

export function canWriteFile(role: AppRole, relPath: string): boolean {
  const p = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!p || p.includes("..")) return false;
  if (p.startsWith("import/") || p.startsWith("product/import/")) return false;
  if (p === "meta.md") return false;
  if (p === "gaps.md" || p === "product/gaps.md") return false;
  return canWritePath(role, p);
}

export function editBlockedLabel(role: AppRole, relPath: string): string {
  const p = relPath.replace(/\\/g, "/");
  if (p === "gaps.md" || p === "product/gaps.md") return "缺口清单由 AI 维护，请通过托付提问。";
  const folder = folderOfPath(p);
  if (p.endsWith("调研.md") && role === "designer") return "调研由架构师侧维护，你只能阅读。";
  if (p.endsWith("PRD.md") && role === "architect") return "PRD 由产品经理维护，你只能阅读。";
  if (p.startsWith("import/") || p.startsWith("product/import/")) return "导入原文只读。";
  if (p === "meta.md") return "元信息由系统维护。";
  if (folder === "product" && role !== "designer") return "产品文档由产品经理维护，你只能阅读。";
  if (folder === "eng" && role !== "architect") return "研发文档由架构师维护，你只能阅读。";
  if (folder === "qa" && role !== "tester") return "测试文档由测试维护，你只能阅读。";
  return "你没有权限改这篇文档。";
}

import type { AppRole } from "./roles.js";
import { HttpError } from "./httpError.js";
import { changedFiles } from "./gitVault.js";
import { getRequirement } from "./requirements.js";
import { getActiveRunForUser } from "./workbenchRuns.js";
import { canWriteFile } from "./fileOwnership.js";

export function assertCanWriteFile(
  projectId: string,
  role: AppRole,
  relPath: string,
  userId?: string
): void {
  if (!canWriteFile(role, relPath)) {
    throw new HttpError(`你没有权限改「${relPath.replace(/\\/g, "/")}」。`, 403);
  }
  if (userId) {
    const active = getActiveRunForUser(projectId, userId);
    if (active) {
      throw new HttpError("AI 还在写，这一轮结束前不能改文档。", 409);
    }
  }
}

export function assertCanCommitChangedFiles(
  projectId: string,
  role: AppRole,
  userId: string
): void {
  const meta = getRequirement(projectId);
  if (!meta) throw new HttpError("工程不存在", 404);
  const files = changedFiles(meta.vaultPath);
  if (!files.length) return;
  for (const rel of files) {
    assertCanWriteFile(projectId, role, rel, userId);
  }
}

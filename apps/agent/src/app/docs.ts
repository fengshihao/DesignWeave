import type { Actor, DocFile, DocFolder } from "@designweave/schema";
import { authorize } from "./authorize.js";
import { AppError } from "./errors.js";
import { writeAudit } from "../data/audit.js";
import { getRequirement } from "../requirements.js";
import { assertWritable } from "../projectLocks.js";
import { canWritePath, folderOfPath } from "../docFolders.js";
import { listDocTree, listFolderStatus, readDocFile, writeDocFile } from "../files.js";
import { askerLabel, questionTargetLabel, recordInboxQuestion } from "../questions.js";
import { isDocFolder, questionPath } from "../docFolders.js";
import type { SessionUser } from "../acl.js";
import { logLine } from "../log/logger.js";

function asUser(actor: Actor): SessionUser {
  return { id: actor.id, name: actor.name, email: actor.email, role: actor.role };
}

function requireProject(id: string) {
  const meta = getRequirement(id);
  if (!meta) throw new AppError("not_found", "工程不存在");
  return meta;
}

export function listProjectTree(actor: Actor, projectId: string) {
  authorize(actor, "doc.read");
  requireProject(projectId);
  return {
    files: listDocTree(projectId),
    folders: listFolderStatus(projectId),
  };
}

export function readProjectDoc(actor: Actor, projectId: string, relPath: string): DocFile {
  authorize(actor, "doc.read");
  requireProject(projectId);
  try {
    return readDocFile(projectId, relPath);
  } catch (err) {
    throw new AppError("not_found", err instanceof Error ? err.message : "文件不存在");
  }
}

export function writeProjectDoc(
  actor: Actor,
  projectId: string,
  relPath: string,
  content: string,
  opts: { clientId?: string; ifMatch?: string } = {}
): DocFile {
  requireProject(projectId);
  const folder = folderOfPath(relPath);
  if (!folder || !canWritePath(actor.role, relPath)) {
    throw new AppError("forbidden", "你不能改这篇。");
  }
  authorize(actor, "doc.write", { folder });
  assertWritable(projectId, folder, asUser(actor), opts.clientId);
  try {
    const file = writeDocFile(projectId, relPath, content, opts.ifMatch);
    writeAudit({
      actor,
      action: "doc.write",
      result: "ok",
      projectId,
      folder,
      detail: { path: file.path },
    });
    logLine("doc.write", { projectId, path: file.path, actorId: actor.id });
    return file;
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 409) {
      throw new AppError("conflict", err instanceof Error ? err.message : "纸面和磁盘对不上");
    }
    throw err instanceof AppError
      ? err
      : new AppError("invalid", err instanceof Error ? err.message : "保存失败");
  }
}

export function addProjectQuestion(
  actor: Actor,
  projectId: string,
  input: {
    folder?: string;
    file: string;
    headingPath: string[];
    question: string;
  }
) {
  const meta = requireProject(projectId);
  authorize(actor, "doc.question.append");
  const question = input.question.trim();
  if (!question) throw new AppError("invalid", "问题不能为空");
  const file = input.file.trim();
  const folder = isDocFolder(input.folder || "")
    ? (input.folder as DocFolder)
    : folderOfPath(file);
  if (!folder) throw new AppError("invalid", "只能给产品、研发或测试加问题。");
  const version = recordInboxQuestion({
    vaultPath: meta.vaultPath,
    folder,
    item: {
      asker: askerLabel(actor.role, actor.name),
      target: questionTargetLabel(file, input.headingPath),
      question,
    },
    author: { name: actor.name, email: actor.email },
  });
  writeAudit({
    actor,
    action: "doc.question",
    result: "ok",
    projectId,
    folder,
    detail: { path: questionPath(folder) },
  });
  return { ok: true as const, path: questionPath(folder), version };
}

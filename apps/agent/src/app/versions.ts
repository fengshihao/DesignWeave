import type { Actor, DocFolder } from "@designweave/schema";
import { authorize } from "./authorize.js";
import { AppError } from "./errors.js";
import { writeAudit } from "../data/audit.js";
import { getRequirement } from "../requirements.js";
import { assertWritable } from "../projectLocks.js";
import { folderOfPath, parseDocFolder, writableFolderOf } from "../docFolders.js";
import {
  changedFiles,
  isDirty,
  isDirtyFolder,
  listVersions,
  readFileAt,
  restoreFile,
  revertLatestAiCommit,
} from "../gitVault.js";
import { recordFolderVersion } from "../folderVersion.js";
import { readDocFile } from "../files.js";
import { PRD_FILE } from "../prdPack.js";
import { getRequirementBundle } from "../requirements.js";
import type { SessionUser } from "../acl.js";
import path from "node:path";

function asUser(actor: Actor): SessionUser {
  return { id: actor.id, name: actor.name, email: actor.email, role: actor.role };
}

function requireProject(id: string) {
  const meta = getRequirement(id);
  if (!meta) throw new AppError("not_found", "工程不存在");
  return meta;
}

export function listProjectVersions(actor: Actor, projectId: string, folderRaw?: unknown) {
  authorize(actor, "doc.read");
  const meta = requireProject(projectId);
  const folder = parseDocFolder(folderRaw, writableFolderOf(actor.role));
  return {
    versions: listVersions(meta.vaultPath),
    uncommitted: isDirtyFolder(meta.vaultPath, folder),
    changedFiles: changedFiles(meta.vaultPath).filter(
      (f) => f === folder || f.startsWith(`${folder}/`)
    ),
  };
}

export function recordProjectVersion(
  actor: Actor,
  projectId: string,
  input: {
    folder?: unknown;
    message?: string;
    clientId?: string;
    markCaughtUp?: boolean;
  }
) {
  const meta = requireProject(projectId);
  const folder = parseDocFolder(input.folder, writableFolderOf(actor.role));
  authorize(actor, "version.record", { folder });
  assertWritable(projectId, folder, asUser(actor), input.clientId);
  const custom = String(input.message || "").trim();
  const files = changedFiles(meta.vaultPath).filter(
    (f) => f === folder || f.startsWith(`${folder}/`)
  );
  const named =
    files.find((f) => /(^|\/)PRD\.md$/i.test(f)) ||
    files.find((f) => f.endsWith("方案.md") || f.endsWith("测试.md")) ||
    files.find((f) => f.endsWith(".md") && !f.endsWith("meta.md") && !f.endsWith("跟上.md")) ||
    files[0];
  const message =
    custom ||
    (input.markCaughtUp
      ? `我：标成已跟上`
      : `我：保存 ${named ? path.basename(named) : "文档"}`);
  const version = recordFolderVersion({
    vaultPath: meta.vaultPath,
    folder,
    message,
    author: { name: actor.name, email: actor.email },
    markCaughtUp: Boolean(input.markCaughtUp),
  });
  if (version) {
    writeAudit({
      actor,
      action: "version.record",
      result: "ok",
      projectId,
      folder,
      detail: { sha: version.id, message: version.message },
    });
  }
  return version
    ? { version }
    : { version: null, message: "没有需要记入的改动" };
}

export function readVersionFile(
  actor: Actor,
  projectId: string,
  sha: string,
  relPath: string = PRD_FILE
) {
  authorize(actor, "doc.read");
  const meta = requireProject(projectId);
  const content = readFileAt(meta.vaultPath, sha, relPath);
  if (content === null) throw new AppError("not_found", "这一版里还没有这篇");
  return { path: relPath, content, version: sha };
}

export function restoreVersionFile(
  actor: Actor,
  projectId: string,
  sha: string,
  relPath: string,
  clientId?: string
) {
  const meta = requireProject(projectId);
  const folder = folderOfPath(relPath);
  if (!folder) throw new AppError("forbidden", "你不能改这篇。");
  authorize(actor, "version.restore", { folder });
  assertWritable(projectId, folder, asUser(actor), clientId);
  restoreFile(meta.vaultPath, sha, relPath);
  const file = readDocFile(projectId, relPath);
  writeAudit({
    actor,
    action: "version.restore",
    result: "ok",
    projectId,
    folder,
    detail: { sha, path: relPath },
  });
  return {
    path: relPath,
    content: file.content,
    etag: file.etag,
    uncommitted: isDirty(meta.vaultPath),
  };
}

export function revertLatestAiVersion(
  actor: Actor,
  projectId: string,
  input: { folder?: unknown; clientId?: string }
) {
  const meta = requireProject(projectId);
  const folder = parseDocFolder(input.folder, writableFolderOf(actor.role));
  authorize(actor, "version.revertAi", { folder });
  assertWritable(projectId, folder, asUser(actor), input.clientId);
  const version = revertLatestAiCommit(meta.vaultPath, {
    name: actor.name,
    email: actor.email,
  });
  writeAudit({
    actor,
    action: "version.revert_ai",
    result: "ok",
    projectId,
    folder,
    detail: { sha: version.id },
  });
  return { version, bundle: getRequirementBundle(projectId) };
}

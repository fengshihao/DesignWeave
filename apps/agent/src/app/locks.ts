import type { Actor, DocFolder, ProjectLockInfo } from "@designweave/schema";
import { authorize } from "./authorize.js";
import { AppError } from "./errors.js";
import { writeAudit } from "../data/audit.js";
import { getRequirement } from "../requirements.js";
import {
  claimLock,
  forceReleaseLock,
  getLock,
  heartbeatLock,
  publicLock,
  releaseLock,
} from "../projectLocks.js";
import type { SessionUser } from "../acl.js";

function asUser(actor: Actor): SessionUser {
  return { id: actor.id, name: actor.name, email: actor.email, role: actor.role };
}

function requireProject(id: string) {
  const meta = getRequirement(id);
  if (!meta) throw new AppError("not_found", "工程不存在");
  return meta;
}

export function claimProjectLock(
  actor: Actor,
  projectId: string,
  folder: DocFolder,
  clientId: string
): {
  youHold: boolean;
  otherDevice: boolean;
  previewReason?: string;
  lock: ProjectLockInfo;
} {
  requireProject(projectId);
  if (!clientId.trim()) throw new AppError("invalid", "缺少本机标识");
  // 无权写时 claimLock 返回预览，不抛；不在此 authorize，避免挡预览
  const result = claimLock(projectId, folder, asUser(actor), clientId);
  return {
    youHold: result.youHold,
    otherDevice: result.otherDevice,
    previewReason: result.previewReason,
    lock: publicLock(result.lock, actor.id, clientId),
  };
}

export function heartbeatProjectLock(
  actor: Actor,
  projectId: string,
  folder: DocFolder,
  clientId: string,
  editing: boolean
): { lock: ProjectLockInfo } {
  requireProject(projectId);
  authorize(actor, "lock.heartbeat", { folder });
  const lock = heartbeatLock(projectId, folder, asUser(actor), clientId, editing);
  return { lock: publicLock(lock, actor.id, clientId) };
}

export function releaseProjectLock(
  actor: Actor,
  projectId: string,
  folder: DocFolder,
  clientId: string
): { ok: true; lock: ProjectLockInfo } {
  requireProject(projectId);
  authorize(actor, "lock.release", { folder });
  releaseLock(projectId, folder, asUser(actor), clientId);
  return { ok: true, lock: publicLock(getLock(projectId, folder), actor.id, clientId) };
}

export function forceReleaseProjectLock(
  actor: Actor,
  projectId: string,
  folder?: DocFolder
): { ok: true; lock: null } {
  requireProject(projectId);
  authorize(actor, "lock.forceRelease");
  forceReleaseLock(projectId, folder);
  writeAudit({
    actor,
    action: "lock.force_release",
    result: "ok",
    projectId,
    folder: folder ?? null,
  });
  return { ok: true, lock: null };
}

export function readProjectLock(
  actor: Actor,
  projectId: string,
  folder: DocFolder,
  clientId?: string
): { lock: ProjectLockInfo } {
  requireProject(projectId);
  return { lock: publicLock(getLock(projectId, folder), actor.id, clientId) };
}

import type { Actor, AppRole, AppUser } from "@designweave/schema";
import { memberRole } from "@designweave/schema";
import { authorize } from "./authorize.js";
import { AppError } from "./errors.js";
import { writeAudit } from "../data/audit.js";
import {
  deleteSessionsForUser,
  getUserByEmail,
  getUserRow,
  insertUser,
  listUserRows,
  setUserPasswordHash,
  updateUserRow,
} from "../data/users.js";
import { releaseLocksForUser } from "../projectLocks.js";
import { logLine } from "../log/logger.js";

function audit(
  actor: Actor | null,
  action: string,
  result: "ok" | "deny" | "error",
  extra: { targetId?: string; requestId?: string; detail?: Record<string, unknown> } = {}
): void {
  writeAudit({
    actor,
    action,
    result,
    requestId: extra.requestId,
    targetId: extra.targetId,
    detail: extra.detail,
  });
  logLine(action, { result, actorId: actor?.id, targetId: extra.targetId });
}

function requirePassword(password: string): void {
  if (!password || password.length < 8) {
    throw new AppError("invalid", "密码至少 8 位");
  }
}

export function listUsers(actor: Actor): AppUser[] {
  authorize(actor, "user.list");
  return listUserRows();
}

export async function createMember(
  actor: Actor,
  input: { name: string; email: string; password: string; role?: string }
): Promise<AppUser> {
  authorize(actor, "user.create");
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !email) throw new AppError("invalid", "请填写姓名、登录邮箱和密码");
  requirePassword(input.password);
  if (input.role === "architect") {
    throw new AppError("invalid", "只能有一名架构师。");
  }
  const role = memberRole(input.role);
  if (getUserByEmail(email)) {
    throw new AppError("conflict", "这个邮箱已经有账号了");
  }
  const user = await insertUser({
    name,
    email,
    password: input.password,
    role,
    createdBy: actor.id,
  });
  audit(actor, "user.create", "ok", { targetId: user.id, detail: { role: user.role } });
  return user;
}

export function updateUser(
  actor: Actor,
  id: string,
  patch: { name?: string; role?: string }
): AppUser {
  authorize(actor, "user.update");
  const current = getUserRow(id);
  if (!current) throw new AppError("not_found", "用户不存在");
  if (current.role === "architect" && patch.role && patch.role !== "architect") {
    throw new AppError("invalid", "不能把架构师改成别的角色。");
  }
  if (patch.role === "architect" && current.role !== "architect") {
    throw new AppError("invalid", "不能再设一名架构师。");
  }
  if (id === actor.id && patch.role && patch.role !== actor.role) {
    throw new AppError("invalid", "不能改自己的角色。");
  }
  const role: AppRole | undefined = patch.role ? memberRole(patch.role) : undefined;
  const next = updateUserRow(id, {
    name: patch.name,
    role: current.role === "architect" ? "architect" : role,
  });
  audit(actor, "user.update", "ok", {
    targetId: id,
    detail: { role: next.role, name: next.name },
  });
  return next;
}

export function setUserDisabled(actor: Actor, id: string, disabled: boolean): AppUser {
  authorize(actor, "user.disable");
  const current = getUserRow(id);
  if (!current) throw new AppError("not_found", "用户不存在");
  if (current.role === "architect") {
    throw new AppError("invalid", "不能停用架构师。");
  }
  if (id === actor.id) {
    throw new AppError("invalid", "不能停用自己。");
  }
  const next = updateUserRow(id, { status: disabled ? "disabled" : "active" });
  if (disabled) {
    deleteSessionsForUser(id);
    releaseLocksForUser(id);
  }
  audit(actor, disabled ? "user.disable" : "user.enable", "ok", { targetId: id });
  return next;
}

export async function resetUserPassword(
  actor: Actor,
  id: string,
  password: string
): Promise<AppUser> {
  authorize(actor, "user.resetPassword");
  requirePassword(password);
  const current = getUserRow(id);
  if (!current) throw new AppError("not_found", "用户不存在");
  await setUserPasswordHash(id, password);
  deleteSessionsForUser(id);
  audit(actor, "user.reset_password", "ok", { targetId: id });
  return current;
}

export function updateMe(actor: Actor, name: string): AppUser {
  authorize(actor, "user.self.update", { userId: actor.id });
  const trimmed = name.trim();
  if (!trimmed) throw new AppError("invalid", "请填写姓名");
  const next = updateUserRow(actor.id, { name: trimmed });
  audit(actor, "user.self.update", "ok", { targetId: actor.id });
  return next;
}

export async function changeMyPassword(
  actor: Actor,
  input: { current: string; next: string }
): Promise<void> {
  authorize(actor, "user.self.password", { userId: actor.id });
  requirePassword(input.next);
  if (!input.current) throw new AppError("invalid", "请填写当前密码");
  const { verifyPassword } = await import("better-auth/crypto");
  const { getDb } = await import("../db.js");
  const row = getDb()
    .prepare(`SELECT password FROM "account" WHERE userId = ? AND providerId = 'credential'`)
    .get(actor.id) as { password: string } | undefined;
  if (!row?.password || !(await verifyPassword({ hash: row.password, password: input.current }))) {
    throw new AppError("invalid", "当前密码不对");
  }
  await setUserPasswordHash(actor.id, input.next);
  audit(actor, "auth.password_change", "ok", { targetId: actor.id });
}

export function getMe(actor: Actor): AppUser {
  const user = getUserRow(actor.id);
  if (!user) throw new AppError("not_found", "用户不存在");
  return user;
}

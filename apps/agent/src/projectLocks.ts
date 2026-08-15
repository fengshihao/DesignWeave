import { getDb } from "./db.js";
import { HttpError } from "./httpError.js";
import type { SessionUser } from "./acl.js";
import { getActiveRun } from "./workbenchRuns.js";

export type ProjectLock = {
  projectId: string;
  holderId: string;
  holderName: string;
  holderEmail: string;
  clientId: string;
  editing: boolean;
  heartbeatAt: string;
  createdAt: string;
};

const STALE_MS = 2 * 60 * 1000;

export function ensureLockTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS project_locks (
      project_id TEXT PRIMARY KEY,
      holder_id TEXT NOT NULL,
      holder_name TEXT NOT NULL,
      holder_email TEXT NOT NULL,
      client_id TEXT NOT NULL,
      editing INTEGER NOT NULL DEFAULT 0,
      heartbeat_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function rowToLock(r: {
  project_id: string;
  holder_id: string;
  holder_name: string;
  holder_email: string;
  client_id: string;
  editing: number;
  heartbeat_at: string;
  created_at: string;
}): ProjectLock {
  return {
    projectId: r.project_id,
    holderId: r.holder_id,
    holderName: r.holder_name,
    holderEmail: r.holder_email,
    clientId: r.client_id,
    editing: Boolean(r.editing),
    heartbeatAt: r.heartbeat_at,
    createdAt: r.created_at,
  };
}

export function getLock(projectId: string): ProjectLock | null {
  ensureLockTable();
  expireStaleLocks(projectId);
  const r = getDb()
    .prepare(
      `SELECT project_id, holder_id, holder_name, holder_email, client_id, editing,
              heartbeat_at, created_at
       FROM project_locks WHERE project_id = ?`
    )
    .get(projectId) as
    | {
        project_id: string;
        holder_id: string;
        holder_name: string;
        holder_email: string;
        client_id: string;
        editing: number;
        heartbeat_at: string;
        created_at: string;
      }
    | undefined;
  return r ? rowToLock(r) : null;
}

export function expireStaleLocks(projectId?: string): void {
  ensureLockTable();
  const now = Date.now();
  const rows = (
    projectId
      ? getDb()
          .prepare(`SELECT project_id, heartbeat_at FROM project_locks WHERE project_id = ?`)
          .all(projectId)
      : getDb().prepare(`SELECT project_id, heartbeat_at FROM project_locks`).all()
  ) as Array<{ project_id: string; heartbeat_at: string }>;

  for (const row of rows) {
    const age = now - Date.parse(row.heartbeat_at);
    if (!Number.isFinite(age) || age < STALE_MS) continue;
    if (getActiveRun(row.project_id)) continue;
    getDb().prepare(`DELETE FROM project_locks WHERE project_id = ?`).run(row.project_id);
  }
}

export function publicLock(
  lock: ProjectLock | null,
  userId: string,
  clientId?: string
): {
  holderId: string;
  holderName: string;
  youHold: boolean;
  editing: boolean;
  otherDevice: boolean;
} | null {
  if (!lock) return null;
  const sameUser = lock.holderId === userId;
  const sameClient = Boolean(clientId) && lock.clientId === clientId;
  return {
    holderId: lock.holderId,
    holderName: lock.holderName,
    youHold: sameUser && (clientId ? sameClient : true),
    editing: lock.editing,
    otherDevice: sameUser && Boolean(clientId) && !sameClient,
  };
}

export function claimLock(
  projectId: string,
  user: SessionUser,
  clientId: string
): {
  youHold: boolean;
  lock: ProjectLock;
  otherDevice: boolean;
  previewReason?: string;
} {
  if (!clientId.trim()) {
    throw new HttpError("缺少本机标识", 400);
  }
  expireStaleLocks(projectId);
  const existing = getLock(projectId);
  const now = new Date().toISOString();

  if (!existing) {
    getDb()
      .prepare(
        `INSERT INTO project_locks
         (project_id, holder_id, holder_name, holder_email, client_id, editing, heartbeat_at, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .run(projectId, user.id, user.name, user.email, clientId, now, now);
    const lock = getLock(projectId)!;
    return { youHold: true, lock, otherDevice: false };
  }

  if (existing.holderId === user.id && existing.clientId === clientId) {
    getDb()
      .prepare(
        `UPDATE project_locks SET heartbeat_at = ?, holder_name = ?, holder_email = ? WHERE project_id = ?`
      )
      .run(now, user.name, user.email, projectId);
    return { youHold: true, lock: getLock(projectId)!, otherDevice: false };
  }

  if (existing.holderId === user.id) {
    return {
      youHold: false,
      lock: existing,
      otherDevice: true,
      previewReason: "你在另一处正在编辑，这里是预览。",
    };
  }

  return {
    youHold: false,
    lock: existing,
    otherDevice: false,
    previewReason: `${existing.holderName}正在编辑，你现在是预览。`,
  };
}

export function heartbeatLock(
  projectId: string,
  user: SessionUser,
  clientId: string,
  editing: boolean
): ProjectLock {
  const lock = getLock(projectId);
  if (!lock || lock.holderId !== user.id || lock.clientId !== clientId) {
    throw new HttpError("你现在没有这个工程的编辑权。", 403);
  }
  const aiRunning = Boolean(getActiveRun(projectId));
  const nextEditing = aiRunning ? false : editing;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE project_locks SET heartbeat_at = ?, editing = ?, holder_name = ? WHERE project_id = ?`
    )
    .run(now, nextEditing ? 1 : 0, user.name, projectId);
  return getLock(projectId)!;
}

export function releaseLock(
  projectId: string,
  user: SessionUser,
  clientId: string
): void {
  const lock = getLock(projectId);
  if (!lock) return;
  if (lock.holderId !== user.id || lock.clientId !== clientId) return;
  if (getActiveRun(projectId)) return;
  getDb().prepare(`DELETE FROM project_locks WHERE project_id = ?`).run(projectId);
}

export function forceReleaseLock(projectId: string): void {
  getDb().prepare(`DELETE FROM project_locks WHERE project_id = ?`).run(projectId);
}

export function assertHoldsLock(
  projectId: string,
  user: SessionUser,
  clientId?: string
): ProjectLock {
  const lock = getLock(projectId);
  if (!lock || lock.holderId !== user.id) {
    throw new HttpError("你现在是预览，不能改文档。", 403);
  }
  if (clientId && lock.clientId !== clientId) {
    throw new HttpError("你在另一处正在编辑，这里是预览。", 403);
  }
  return lock;
}

export function assertWritable(
  projectId: string,
  user: SessionUser,
  clientId?: string
): ProjectLock {
  const lock = assertHoldsLock(projectId, user, clientId);
  if (getActiveRun(projectId)) {
    throw new HttpError("AI 还在写，这一轮结束前不能改文档。", 409);
  }
  return lock;
}

export function setEditing(projectId: string, editing: boolean): void {
  getDb()
    .prepare(`UPDATE project_locks SET editing = ? WHERE project_id = ?`)
    .run(editing ? 1 : 0, projectId);
}

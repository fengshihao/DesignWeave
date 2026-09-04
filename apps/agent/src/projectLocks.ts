import { getDb } from "./db.js";
import { HttpError } from "./httpError.js";
import type { SessionUser } from "./acl.js";
import { FOLDER_LABELS, canWriteFolder, type DocFolder } from "./docFolders.js";
import { getActiveRunInFolder } from "./workbenchRuns.js";

export type ProjectLock = {
  projectId: string;
  folder: DocFolder;
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
    CREATE TABLE IF NOT EXISTS folder_locks (
      project_id TEXT NOT NULL,
      folder TEXT NOT NULL,
      holder_id TEXT NOT NULL,
      holder_name TEXT NOT NULL,
      holder_email TEXT NOT NULL,
      client_id TEXT NOT NULL,
      editing INTEGER NOT NULL DEFAULT 0,
      heartbeat_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (project_id, folder)
    );
  `);
}

function rowToLock(r: {
  project_id: string;
  folder: string;
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
    folder: r.folder as DocFolder,
    holderId: r.holder_id,
    holderName: r.holder_name,
    holderEmail: r.holder_email,
    clientId: r.client_id,
    editing: Boolean(r.editing),
    heartbeatAt: r.heartbeat_at,
    createdAt: r.created_at,
  };
}

export function getLock(projectId: string, folder: DocFolder): ProjectLock | null {
  ensureLockTable();
  expireStaleLocks(projectId, folder);
  const r = getDb()
    .prepare(
      `SELECT project_id, folder, holder_id, holder_name, holder_email, client_id, editing,
              heartbeat_at, created_at
       FROM folder_locks WHERE project_id = ? AND folder = ?`
    )
    .get(projectId, folder) as Parameters<typeof rowToLock>[0] | undefined;
  return r ? rowToLock(r) : null;
}

export function expireStaleLocks(projectId?: string, folder?: DocFolder): void {
  ensureLockTable();
  const now = Date.now();
  const rows = (
    projectId && folder
      ? getDb()
          .prepare(
            `SELECT project_id, folder, heartbeat_at FROM folder_locks WHERE project_id = ? AND folder = ?`
          )
          .all(projectId, folder)
      : projectId
        ? getDb()
            .prepare(`SELECT project_id, folder, heartbeat_at FROM folder_locks WHERE project_id = ?`)
            .all(projectId)
        : getDb().prepare(`SELECT project_id, folder, heartbeat_at FROM folder_locks`).all()
  ) as Array<{ project_id: string; folder: string; heartbeat_at: string }>;

  for (const row of rows) {
    const age = now - Date.parse(row.heartbeat_at);
    if (!Number.isFinite(age) || age < STALE_MS) continue;
    if (getActiveRunInFolder(row.project_id, row.folder as DocFolder)) continue;
    getDb()
      .prepare(`DELETE FROM folder_locks WHERE project_id = ? AND folder = ?`)
      .run(row.project_id, row.folder);
  }
}

export function publicLock(
  lock: ProjectLock | null,
  userId: string,
  clientId?: string
): {
  holderId: string;
  holderName: string;
  folder: DocFolder;
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
    folder: lock.folder,
    youHold: sameUser && (clientId ? sameClient : true),
    editing: lock.editing,
    otherDevice: sameUser && Boolean(clientId) && !sameClient,
  };
}

export function claimLock(
  projectId: string,
  folder: DocFolder,
  user: SessionUser,
  clientId: string
): {
  youHold: boolean;
  lock: ProjectLock | null;
  otherDevice: boolean;
  previewReason?: string;
} {
  if (!clientId.trim()) {
    throw new HttpError("缺少本机标识", 400);
  }
  if (!canWriteFolder(user.role, folder)) {
    const existing = getLock(projectId, folder);
    return {
      youHold: false,
      lock: existing,
      otherDevice: false,
      previewReason: `你只能预览${FOLDER_LABELS[folder]}，不能改。`,
    };
  }
  expireStaleLocks(projectId, folder);
  const existing = getLock(projectId, folder);
  const now = new Date().toISOString();

  if (!existing) {
    getDb()
      .prepare(
        `INSERT INTO folder_locks
         (project_id, folder, holder_id, holder_name, holder_email, client_id, editing, heartbeat_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .run(projectId, folder, user.id, user.name, user.email, clientId, now, now);
    const lock = getLock(projectId, folder)!;
    return { youHold: true, lock, otherDevice: false };
  }

  if (existing.holderId === user.id && existing.clientId === clientId) {
    getDb()
      .prepare(
        `UPDATE folder_locks SET heartbeat_at = ?, holder_name = ?, holder_email = ?
         WHERE project_id = ? AND folder = ?`
      )
      .run(now, user.name, user.email, projectId, folder);
    return { youHold: true, lock: getLock(projectId, folder)!, otherDevice: false };
  }

  if (existing.holderId === user.id) {
    return {
      youHold: false,
      lock: existing,
      otherDevice: true,
      previewReason: `你在另一处正在改${FOLDER_LABELS[folder]}，这里是预览。`,
    };
  }

  return {
    youHold: false,
    lock: existing,
    otherDevice: false,
    previewReason: `${existing.holderName}正在改${FOLDER_LABELS[folder]}，你现在是预览。`,
  };
}

export function heartbeatLock(
  projectId: string,
  folder: DocFolder,
  user: SessionUser,
  clientId: string,
  editing: boolean
): ProjectLock {
  const lock = getLock(projectId, folder);
  if (!lock || lock.holderId !== user.id || lock.clientId !== clientId) {
    throw new HttpError("你现在没有这份文档的编辑权。", 403);
  }
  const aiRunning = Boolean(getActiveRunInFolder(projectId, folder));
  const nextEditing = aiRunning ? false : editing;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE folder_locks SET heartbeat_at = ?, editing = ?, holder_name = ?
       WHERE project_id = ? AND folder = ?`
    )
    .run(now, nextEditing ? 1 : 0, user.name, projectId, folder);
  return getLock(projectId, folder)!;
}

export function releaseLock(
  projectId: string,
  folder: DocFolder,
  user: SessionUser,
  clientId: string
): void {
  const lock = getLock(projectId, folder);
  if (!lock) return;
  if (lock.holderId !== user.id || lock.clientId !== clientId) return;
  if (getActiveRunInFolder(projectId, folder)) return;
  getDb()
    .prepare(`DELETE FROM folder_locks WHERE project_id = ? AND folder = ?`)
    .run(projectId, folder);
}

export function forceReleaseLock(projectId: string, folder?: DocFolder): void {
  if (folder) {
    getDb()
      .prepare(`DELETE FROM folder_locks WHERE project_id = ? AND folder = ?`)
      .run(projectId, folder);
    return;
  }
  getDb().prepare(`DELETE FROM folder_locks WHERE project_id = ?`).run(projectId);
}

export function assertHoldsLock(
  projectId: string,
  folder: DocFolder,
  user: SessionUser,
  clientId?: string
): ProjectLock {
  if (!canWriteFolder(user.role, folder)) {
    throw new HttpError(`你只能预览${FOLDER_LABELS[folder]}，不能改。`, 403);
  }
  const lock = getLock(projectId, folder);
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
  folder: DocFolder,
  user: SessionUser,
  clientId?: string
): ProjectLock {
  const lock = assertHoldsLock(projectId, folder, user, clientId);
  if (getActiveRunInFolder(projectId, folder)) {
    throw new HttpError("AI 还在写，这一轮结束前不能改文档。", 409);
  }
  return lock;
}

export function setEditing(projectId: string, folder: DocFolder, editing: boolean): void {
  getDb()
    .prepare(`UPDATE folder_locks SET editing = ? WHERE project_id = ? AND folder = ?`)
    .run(editing ? 1 : 0, projectId, folder);
}

import { customAlphabet } from "nanoid";
import type { Actor, AuditEvent, AuditResult } from "@designweave/schema";
import { getDb } from "../db.js";

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

export function ensureAuditTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      request_id TEXT,
      actor_id TEXT,
      actor_name TEXT,
      actor_role TEXT,
      action TEXT NOT NULL,
      project_id TEXT,
      folder TEXT,
      target_id TEXT,
      result TEXT NOT NULL,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_events(ts DESC);
  `);
}

export function writeAudit(input: {
  requestId?: string | null;
  actor?: Actor | null;
  action: string;
  projectId?: string | null;
  folder?: string | null;
  targetId?: string | null;
  result: AuditResult;
  detail?: Record<string, unknown> | null;
}): AuditEvent {
  ensureAuditTable();
  const row: AuditEvent = {
    id: nanoid(),
    ts: new Date().toISOString(),
    requestId: input.requestId ?? null,
    actorId: input.actor?.id ?? null,
    actorName: input.actor?.name ?? null,
    actorRole: input.actor?.role ?? null,
    action: input.action,
    projectId: input.projectId ?? null,
    folder: input.folder ?? null,
    targetId: input.targetId ?? null,
    result: input.result,
    detail: input.detail ?? null,
  };
  getDb()
    .prepare(
      `INSERT INTO audit_events
       (id, ts, request_id, actor_id, actor_name, actor_role, action, project_id, folder, target_id, result, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id,
      row.ts,
      row.requestId,
      row.actorId,
      row.actorName,
      row.actorRole,
      row.action,
      row.projectId,
      row.folder,
      row.targetId,
      row.result,
      row.detail ? JSON.stringify(row.detail) : null
    );
  return row;
}

export function listAudit(limit = 50): AuditEvent[] {
  ensureAuditTable();
  const rows = getDb()
    .prepare(
      `SELECT id, ts, request_id as requestId, actor_id as actorId, actor_name as actorName,
              actor_role as actorRole, action, project_id as projectId, folder,
              target_id as targetId, result, detail
       FROM audit_events ORDER BY ts DESC LIMIT ?`
    )
    .all(Math.min(200, Math.max(1, limit))) as Array<
    Omit<AuditEvent, "detail"> & { detail: string | null }
  >;
  return rows.map((r) => ({
    ...r,
    detail: r.detail ? (JSON.parse(r.detail) as Record<string, unknown>) : null,
  }));
}

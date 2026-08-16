import { customAlphabet } from "nanoid";
import type { Response } from "express";
import { getDb } from "./db.js";
import { HttpError } from "./httpError.js";

export type WorkbenchMode = "coauthor" | "grill" | "feasibility";
export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type WorkbenchRun = {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  mode: WorkbenchMode;
  message: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  error: string | null;
};

export type RunEvent = {
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);
const live = new Map<string, AbortController>();

export function ensureRunTables(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS workbench_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      mode TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      ended_at TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS run_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function mapRun(r: {
  id: string;
  project_id: string;
  user_id: string;
  user_name: string;
  mode: string;
  message: string;
  status: string;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  error: string | null;
}): WorkbenchRun {
  return {
    id: r.id,
    projectId: r.project_id,
    userId: r.user_id,
    userName: r.user_name,
    mode: r.mode as WorkbenchMode,
    message: r.message,
    status: r.status as RunStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    endedAt: r.ended_at,
    error: r.error,
  };
}

export function isTerminal(status: RunStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

export function getRun(id: string): WorkbenchRun | null {
  ensureRunTables();
  const r = getDb()
    .prepare(
      `SELECT id, project_id, user_id, user_name, mode, message, status,
              created_at, updated_at, ended_at, error
       FROM workbench_runs WHERE id = ?`
    )
    .get(id) as Parameters<typeof mapRun>[0] | undefined;
  return r ? mapRun(r) : null;
}

export function getActiveRun(projectId: string): WorkbenchRun | null {
  ensureRunTables();
  const r = getDb()
    .prepare(
      `SELECT id, project_id, user_id, user_name, mode, message, status,
              created_at, updated_at, ended_at, error
       FROM workbench_runs
       WHERE project_id = ? AND status IN ('queued', 'running')
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(projectId) as Parameters<typeof mapRun>[0] | undefined;
  return r ? mapRun(r) : null;
}

export function listProjectRuns(projectId: string, limit = 20): WorkbenchRun[] {
  ensureRunTables();
  const rows = getDb()
    .prepare(
      `SELECT id, project_id, user_id, user_name, mode, message, status,
              created_at, updated_at, ended_at, error
       FROM workbench_runs WHERE project_id = ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(projectId, limit) as Array<Parameters<typeof mapRun>[0]>;
  return rows.map(mapRun);
}

export function createRun(input: {
  projectId: string;
  userId: string;
  userName: string;
  mode: WorkbenchMode;
  message: string;
}): WorkbenchRun {
  ensureRunTables();
  if (getActiveRun(input.projectId)) {
    throw new HttpError("还有一轮 AI 没跑完，等它结束或取消后再发。", 409);
  }
  const now = new Date().toISOString();
  const id = nanoid();
  getDb()
    .prepare(
      `INSERT INTO workbench_runs
       (id, project_id, user_id, user_name, mode, message, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)`
    )
    .run(
      id,
      input.projectId,
      input.userId,
      input.userName,
      input.mode,
      input.message,
      now,
      now
    );
  return getRun(id)!;
}

export function setRunStatus(
  id: string,
  status: RunStatus,
  error?: string | null
): void {
  const now = new Date().toISOString();
  const ended = isTerminal(status) ? now : null;
  getDb()
    .prepare(
      `UPDATE workbench_runs
       SET status = ?, updated_at = ?, ended_at = COALESCE(?, ended_at), error = ?
       WHERE id = ?`
    )
    .run(status, now, ended, error ?? null, id);
}

export function appendEvent(
  runId: string,
  type: string,
  payload: Record<string, unknown> = {}
): RunEvent {
  ensureRunTables();
  const now = new Date().toISOString();
  const row = getDb()
    .prepare(
      `SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM run_events WHERE run_id = ?`
    )
    .get(runId) as { maxSeq: number };
  const seq = Number(row.maxSeq) + 1;
  getDb()
    .prepare(
      `INSERT INTO run_events (run_id, seq, type, payload, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(runId, seq, type, JSON.stringify(payload), now);
  getDb()
    .prepare(`UPDATE workbench_runs SET updated_at = ? WHERE id = ?`)
    .run(now, runId);
  return { seq, type, payload, createdAt: now };
}

export function listEvents(runId: string, after = 0): RunEvent[] {
  ensureRunTables();
  const rows = getDb()
    .prepare(
      `SELECT seq, type, payload, created_at as createdAt
       FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC`
    )
    .all(runId, after) as Array<{
    seq: number;
    type: string;
    payload: string;
    createdAt: string;
  }>;
  return rows.map((r) => ({
    seq: r.seq,
    type: r.type,
    payload: JSON.parse(r.payload) as Record<string, unknown>,
    createdAt: r.createdAt,
  }));
}

export function beginRunAbort(runId: string): AbortController {
  const existing = live.get(runId);
  if (existing) existing.abort();
  const controller = new AbortController();
  live.set(runId, controller);
  return controller;
}

export function cancelRun(runId: string): boolean {
  const run = getRun(runId);
  if (!run || isTerminal(run.status)) return false;
  const controller = live.get(runId);
  controller?.abort();
  live.delete(runId);
  setRunStatus(runId, "cancelled", "已取消");
  appendEvent(runId, "error", { message: "已取消。已写下的文档还在，没有改代码仓。" });
  appendEvent(runId, "done", { ok: false, cancelled: true });
  return true;
}

export function endRunAbort(runId: string): void {
  live.delete(runId);
}

export function deleteRunsForProject(projectId: string): void {
  ensureRunTables();
  const rows = getDb()
    .prepare(`SELECT id FROM workbench_runs WHERE project_id = ?`)
    .all(projectId) as Array<{ id: string }>;
  for (const row of rows) {
    live.get(row.id)?.abort();
    live.delete(row.id);
    getDb().prepare(`DELETE FROM run_events WHERE run_id = ?`).run(row.id);
  }
  getDb().prepare(`DELETE FROM workbench_runs WHERE project_id = ?`).run(projectId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pipeRunStream(
  runId: string,
  after: number,
  res: Response
): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: RunEvent) => {
    res.write(`id: ${event.seq}\n`);
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify({ seq: event.seq, ...event.payload })}\n\n`);
  };

  let seq = after;
  let lastBeat = Date.now();

  const replay = listEvents(runId, seq);
  for (const ev of replay) {
    send(ev);
    seq = ev.seq;
  }

  const first = getRun(runId);
  if (first && isTerminal(first.status)) {
    res.end();
    return;
  }

  while (!res.writableEnded) {
    const events = listEvents(runId, seq);
    for (const ev of events) {
      send(ev);
      seq = ev.seq;
    }
    const current = getRun(runId);
    if (!current || isTerminal(current.status)) {
      res.end();
      return;
    }
    if (Date.now() - lastBeat > 15000) {
      res.write(`: keepalive\n\n`);
      lastBeat = Date.now();
    }
    await sleep(250);
  }
}

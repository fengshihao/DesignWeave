import { nanoid } from "nanoid";
import type { AgentMode, AgentRole } from "@designweave/schema";
import { getDb } from "./db.js";

export type SessionRecord = {
  id: string;
  projectId: string;
  role: AgentRole;
  mode: AgentMode;
  createdAt: string;
  updatedAt: string;
  abort?: AbortController;
};

const live = new Map<string, AbortController>();

export function createSession(input: {
  projectId: string;
  role: AgentRole;
  mode: AgentMode;
}): SessionRecord {
  const now = new Date().toISOString();
  const id = nanoid(12);
  getDb()
    .prepare(
      `INSERT INTO sessions (id, project_id, role, mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.projectId, input.role, input.mode, now, now);

  return {
    id,
    projectId: input.projectId,
    role: input.role,
    mode: input.mode,
    createdAt: now,
    updatedAt: now,
  };
}

export function getSession(id: string): SessionRecord | null {
  const row = getDb()
    .prepare(
      `SELECT id, project_id as projectId, role, mode, created_at as createdAt, updated_at as updatedAt
       FROM sessions WHERE id = ?`
    )
    .get(id) as
    | {
        id: string;
        projectId: string;
        role: AgentRole;
        mode: AgentMode;
        createdAt: string;
        updatedAt: string;
      }
    | undefined;
  if (!row) return null;
  return row;
}

export function beginAbortable(sessionId: string): AbortController {
  const existing = live.get(sessionId);
  if (existing) existing.abort();
  const controller = new AbortController();
  live.set(sessionId, controller);
  return controller;
}

export function cancelSession(sessionId: string): boolean {
  const controller = live.get(sessionId);
  if (!controller) return false;
  controller.abort();
  live.delete(sessionId);
  return true;
}

export function endAbortable(sessionId: string): void {
  live.delete(sessionId);
}

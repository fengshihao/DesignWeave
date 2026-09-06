import { customAlphabet } from "nanoid";
import { getDb } from "./db.js";
import { HttpError } from "./httpError.js";
import {
  listUserSessionRunsWithEvents,
  type RunEvent,
  type WorkbenchRun,
} from "./workbenchRuns.js";

export type ChatSessionStatus = "open" | "closed";

export type ChatSession = {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  status: ChatSessionStatus;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

const SESSION_COLS = `id, project_id, user_id, title, status, created_at, updated_at, closed_at`;

function mapSession(r: {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}): ChatSession {
  return {
    id: r.id,
    projectId: r.project_id,
    userId: r.user_id,
    title: r.title,
    status: r.status as ChatSessionStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    closedAt: r.closed_at,
  };
}

export function ensureChatSessionTables(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_project_user
      ON chat_sessions(project_id, user_id, updated_at DESC);
  `);
}

export function createChatSession(input: {
  projectId: string;
  userId: string;
  title?: string;
}): ChatSession {
  ensureChatSessionTables();
  const now = new Date().toISOString();
  const id = nanoid();
  const title = (input.title || "新对话").trim() || "新对话";
  getDb()
    .prepare(
      `INSERT INTO chat_sessions
       (id, project_id, user_id, title, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'open', ?, ?)`
    )
    .run(id, input.projectId, input.userId, title, now, now);
  return getChatSessionForUser(id, input.userId)!;
}

export function getOpenChatSession(projectId: string, userId: string): ChatSession | null {
  ensureChatSessionTables();
  const r = getDb()
    .prepare(
      `SELECT ${SESSION_COLS}
       FROM chat_sessions
       WHERE project_id = ? AND user_id = ? AND status = 'open'
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(projectId, userId) as Parameters<typeof mapSession>[0] | undefined;
  return r ? mapSession(r) : null;
}

export function getOrCreateOpenChatSession(projectId: string, userId: string): ChatSession {
  return getOpenChatSession(projectId, userId) ?? createChatSession({ projectId, userId });
}

export function getChatSessionForUser(id: string, userId: string): ChatSession | null {
  ensureChatSessionTables();
  const r = getDb()
    .prepare(`SELECT ${SESSION_COLS} FROM chat_sessions WHERE id = ? AND user_id = ?`)
    .get(id, userId) as Parameters<typeof mapSession>[0] | undefined;
  return r ? mapSession(r) : null;
}

export function requireChatSessionForUser(
  id: string,
  userId: string,
  projectId?: string
): ChatSession {
  const session = getChatSessionForUser(id, userId);
  if (!session) throw new HttpError("对话不存在", 404);
  if (projectId && session.projectId !== projectId) {
    throw new HttpError("对话不存在", 404);
  }
  return session;
}

export function listChatSessions(
  projectId: string,
  userId: string,
  limit = 30
): ChatSession[] {
  ensureChatSessionTables();
  const rows = getDb()
    .prepare(
      `SELECT ${SESSION_COLS}
       FROM chat_sessions
       WHERE project_id = ? AND user_id = ?
       ORDER BY updated_at DESC LIMIT ?`
    )
    .all(projectId, userId, limit) as Array<Parameters<typeof mapSession>[0]>;
  return rows.map(mapSession);
}

export function closeChatSession(id: string, userId: string): ChatSession {
  const session = requireChatSessionForUser(id, userId);
  if (session.status === "closed") return session;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE chat_sessions SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?`
    )
    .run(now, now, id);
  return getChatSessionForUser(id, userId)!;
}

export function touchChatSession(id: string, titleHint?: string): void {
  ensureChatSessionTables();
  const now = new Date().toISOString();
  if (titleHint) {
    getDb()
      .prepare(`UPDATE chat_sessions SET updated_at = ?, title = ? WHERE id = ? AND title = '新对话'`)
      .run(now, titleHint.slice(0, 80), id);
    return;
  }
  getDb().prepare(`UPDATE chat_sessions SET updated_at = ? WHERE id = ?`).run(now, id);
}

function eventText(payload: Record<string, unknown>): string {
  const delta = payload.delta;
  if (typeof delta === "string") return delta;
  const message = payload.message;
  if (typeof message === "string") return message;
  return "";
}

export function searchChatSessions(
  projectId: string,
  userId: string,
  query: string,
  limit = 20
): ChatSession[] {
  ensureChatSessionTables();
  const q = query.trim().toLowerCase();
  if (!q) return listChatSessions(projectId, userId, limit);

  const sessions = listChatSessions(projectId, userId, 100);
  const matched: ChatSession[] = [];
  for (const session of sessions) {
    if (session.title.toLowerCase().includes(q)) {
      matched.push(session);
      if (matched.length >= limit) break;
      continue;
    }
    const runs = listSessionRuns(session.id, userId);
    let hit = false;
    for (const run of runs) {
      if (run.message.toLowerCase().includes(q)) {
        hit = true;
        break;
      }
      for (const ev of run.events) {
        if (
          (ev.type === "TEXT_MESSAGE_CONTENT" || ev.type === "CUSTOM") &&
          eventText(ev.payload).toLowerCase().includes(q)
        ) {
          hit = true;
          break;
        }
      }
      if (hit) break;
    }
    if (hit) {
      matched.push(session);
      if (matched.length >= limit) break;
    }
  }
  return matched;
}

export type ChatSessionWithRuns = ChatSession & {
  runs: Array<WorkbenchRun & { events: RunEvent[] }>;
};

export function getChatSessionWithRuns(
  sessionId: string,
  userId: string,
  projectId?: string
): ChatSessionWithRuns {
  const session = requireChatSessionForUser(sessionId, userId, projectId);
  return {
    ...session,
    runs: listSessionRuns(session.id, userId),
  };
}

export function listSessionRuns(
  sessionId: string,
  userId: string,
  limit = 50
): Array<WorkbenchRun & { events: RunEvent[] }> {
  return listUserSessionRunsWithEvents(sessionId, userId, limit);
}

export function deleteChatSessionsForProject(projectId: string): void {
  ensureChatSessionTables();
  getDb().prepare(`DELETE FROM chat_sessions WHERE project_id = ?`).run(projectId);
}

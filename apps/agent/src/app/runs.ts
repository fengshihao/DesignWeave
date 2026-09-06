import type { Actor, DocFolder, WorkbenchMode } from "@designweave/schema";
import { authorize } from "./authorize.js";
import { AppError } from "./errors.js";
import { writeAudit } from "../data/audit.js";
import { getRequirement } from "../requirements.js";
import { isDirtyFolder } from "../gitVault.js";
import { folderOfPath, writableFolderOf } from "../docFolders.js";
import { assertHoldsLock } from "../projectLocks.js";
import {
  cancelRun,
  createRun,
  assertRunOwnedByUser,
  getActiveRunForUser,
  listEvents,
  listUserProjectRunsWithEvents,
  listUserSessionRunsWithEvents,
} from "../workbenchRuns.js";
import {
  closeChatSession,
  createChatSession,
  getChatSessionWithRuns,
  getOrCreateOpenChatSession,
  listChatSessions,
  requireChatSessionForUser,
  searchChatSessions,
  touchChatSession,
} from "../chatSessions.js";
import { executeWorkbenchRun } from "../workbenchAgent.js";
import { parseWorkbenchFocus, type WorkbenchFocus } from "../workbenchPrompt.js";
import { gateWorkbenchMode } from "../clarifyGate.js";
import { hasApprovedCodeDirs } from "../workspaceSettings.js";
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

function parseMode(raw: unknown): WorkbenchMode {
  const mode = String(raw || "coauthor");
  if (
    mode === "clarify" ||
    mode === "coauthor" ||
    mode === "grill" ||
    mode === "feasibility" ||
    mode === "ask"
  ) {
    return mode;
  }
  return "coauthor";
}

export function listProjectChatSessions(
  actor: Actor,
  projectId: string,
  input: { q?: string; limit?: number } = {}
) {
  requireProject(projectId);
  authorize(actor, "chat.read", { chatUserId: actor.id });
  const limit = Math.min(50, Math.max(1, Number(input.limit || 30) || 30));
  const q = (input.q || "").trim();
  const sessions = q
    ? searchChatSessions(projectId, actor.id, q, limit)
    : listChatSessions(projectId, actor.id, limit);
  return { sessions };
}

export function createProjectChatSession(actor: Actor, projectId: string, title?: string) {
  requireProject(projectId);
  authorize(actor, "chat.write", { chatUserId: actor.id });
  const session = createChatSession({ projectId, userId: actor.id, title });
  return { session, runs: [] as ReturnType<typeof listUserSessionRunsWithEvents> };
}

export function openProjectChatSession(actor: Actor, projectId: string) {
  requireProject(projectId);
  authorize(actor, "chat.read", { chatUserId: actor.id });
  const session = getOrCreateOpenChatSession(projectId, actor.id);
  const runs = listUserSessionRunsWithEvents(session.id, actor.id);
  return { session, runs };
}

export function getProjectChatSession(actor: Actor, projectId: string, sessionId: string) {
  requireProject(projectId);
  authorize(actor, "chat.read", { chatUserId: actor.id });
  return getChatSessionWithRuns(sessionId, actor.id, projectId);
}

export function closeProjectChatSession(actor: Actor, projectId: string, sessionId: string) {
  requireProject(projectId);
  authorize(actor, "chat.write", { chatUserId: actor.id });
  requireChatSessionForUser(sessionId, actor.id, projectId);
  return { session: closeChatSession(sessionId, actor.id) };
}

export function startProjectRun(
  actor: Actor,
  projectId: string,
  input: {
    message: string;
    clientId: string;
    sessionId?: string;
    focus?: unknown;
    mode?: unknown;
    folder?: DocFolder;
  }
) {
  const meta = requireProject(projectId);
  const message = String(input.message || "").trim();
  if (!message) throw new AppError("invalid", "消息不能为空");
  const mode = parseMode(input.mode);
  const gate = gateWorkbenchMode({
    mode,
    phase: meta.phase,
    clarity: meta.clarity,
    hasApprovedCodeDirs: hasApprovedCodeDirs(),
  });
  if (gate) throw new AppError("invalid", gate);

  const focus = parseWorkbenchFocus(input.focus) as WorkbenchFocus | null;
  const mine = writableFolderOf(actor.role);
  const ask = mode === "ask";
  const folder: DocFolder = ask
    ? mine
    : input.folder ||
      (focus?.file ? folderOfPath(focus.file) || mine : mine);

  if (ask) {
    if (!focus?.quote) throw new AppError("invalid", "先圈一段，再提问。");
  } else {
    authorize(actor, "run.start", { folder });
    const lock = assertHoldsLock(meta.id, folder, asUser(actor), input.clientId || undefined);
    if (lock.editing) {
      throw new AppError("conflict", "先保存一版并退出编辑，再发给 AI。");
    }
    if (isDirtyFolder(meta.vaultPath, folder)) {
      throw new AppError("conflict", "先记入版本再发给 AI。");
    }
  }

  const sessionId =
    typeof input.sessionId === "string" && input.sessionId.trim()
      ? input.sessionId.trim()
      : getOrCreateOpenChatSession(meta.id, actor.id).id;
  requireChatSessionForUser(sessionId, actor.id, meta.id);
  if (getActiveRunForUser(meta.id, actor.id)) {
    throw new AppError("conflict", "还有一轮 AI 没跑完，等它结束或取消后再发。");
  }

  const run = createRun({
    projectId: meta.id,
    sessionId,
    userId: actor.id,
    userName: actor.name,
    mode,
    message,
    folder,
    focus,
  });
  touchChatSession(sessionId, message.slice(0, 80));
  writeAudit({
    actor,
    action: "run.start",
    result: "ok",
    projectId,
    folder,
    detail: { runId: run.id, mode },
  });
  logLine("run.start", { projectId, runId: run.id, mode, folder, actorId: actor.id });
  void executeWorkbenchRun(run.id);
  return { runId: run.id, run, events: listEvents(run.id), sessionId };
}

export function listProjectRuns(
  actor: Actor,
  projectId: string,
  input: { limit?: number; sessionId?: string } = {}
) {
  requireProject(projectId);
  authorize(actor, "run.read", { runUserId: actor.id });
  const limit = Math.min(30, Math.max(1, Number(input.limit || 12) || 12));
  const sessionId = (input.sessionId || "").trim();
  if (sessionId) {
    requireChatSessionForUser(sessionId, actor.id, projectId);
    return { runs: listUserSessionRunsWithEvents(sessionId, actor.id, limit) };
  }
  return { runs: listUserProjectRunsWithEvents(projectId, actor.id, limit) };
}

export function currentProjectRun(actor: Actor, projectId: string) {
  requireProject(projectId);
  authorize(actor, "run.read", { runUserId: actor.id });
  return { run: getActiveRunForUser(projectId, actor.id) };
}

export function cancelProjectRun(
  actor: Actor,
  projectId: string,
  runId: string,
  clientId?: string
) {
  requireProject(projectId);
  const run = assertRunOwnedByUser(runId, actor.id, projectId);
  authorize(actor, "run.cancel", { runUserId: run.userId });
  const askerCancelling = run.mode === "ask" && run.userId === actor.id;
  if (!askerCancelling) {
    assertHoldsLock(projectId, run.folder, asUser(actor), clientId || undefined);
  }
  const cancelled = cancelRun(run.id);
  writeAudit({
    actor,
    action: "run.cancel",
    result: "ok",
    projectId,
    folder: run.folder,
    detail: { runId: run.id, cancelled },
  });
  return { cancelled };
}

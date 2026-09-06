import type { Express, Request, Response } from "express";
import { isArchitect } from "./roles.js";
import { HttpError, statusOf } from "./httpError.js";
import { getRequirement } from "./requirements.js";
import { isDirtyFolder } from "./gitVault.js";
import {
  folderOfPath,
  isDocFolder,
  parseDocFolder,
  questionPath,
  writableFolderOf,
  type DocFolder,
} from "./docFolders.js";
import {
  claimLock,
  forceReleaseLock,
  getLock,
  heartbeatLock,
  publicLock,
  releaseLock,
  assertHoldsLock,
} from "./projectLocks.js";
import {
  cancelRun,
  createRun,
  assertRunOwnedByUser,
  getActiveRunForUser,
  getRun,
  listEvents,
  listUserProjectRunsWithEvents,
  listUserSessionRunsWithEvents,
  pipeRunStream,
  type WorkbenchMode,
} from "./workbenchRuns.js";
import {
  closeChatSession,
  createChatSession,
  getChatSessionWithRuns,
  getOrCreateOpenChatSession,
  listChatSessions,
  requireChatSessionForUser,
  searchChatSessions,
  touchChatSession,
} from "./chatSessions.js";
import { executeWorkbenchRun } from "./workbenchAgent.js";
import { parseWorkbenchFocus } from "./workbenchPrompt.js";
import { gateWorkbenchMode } from "./clarifyGate.js";
import { hasApprovedCodeDirs } from "./workspaceSettings.js";
import { askerLabel, questionTargetLabel, recordInboxQuestion } from "./questions.js";

function fail(res: Response, err: unknown): void {
  res.status(statusOf(err)).json({
    error: err instanceof Error ? err.message : "请求失败",
  });
}

function folderFromReq(req: Request, fallback?: DocFolder): DocFolder {
  const raw = req.body?.folder ?? req.query.folder;
  if (raw) return parseDocFolder(raw, fallback || writableFolderOf(req.user!.role));
  const focusFile = req.body?.focus?.file || req.body?.path;
  const fromPath = typeof focusFile === "string" ? folderOfPath(focusFile) : null;
  return fromPath || fallback || writableFolderOf(req.user!.role);
}

function requireProject(req: Request) {
  const meta = getRequirement(req.params.id);
  if (!meta) throw new HttpError("工程不存在", 404);
  return meta;
}

/** API 仍收 mode，只为兼容旧客户端；执行时一律当托付。 */
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


export function registerWorkbenchRoutes(app: Express): void {
  app.post("/v1/requirements/:id/lock/claim", (req, res) => {
    try {
      requireProject(req);
      const clientId = String(req.body?.clientId || "");
      const folder = folderFromReq(req);
      const result = claimLock(req.params.id, folder, req.user!, clientId);
      res.json({
        youHold: result.youHold,
        otherDevice: result.otherDevice,
        previewReason: result.previewReason,
        lock: publicLock(result.lock, req.user!.id, clientId),
      });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/v1/requirements/:id/lock/heartbeat", (req, res) => {
    try {
      requireProject(req);
      const clientId = String(req.body?.clientId || "");
      const editing = Boolean(req.body?.editing);
      const folder = folderFromReq(req);
      const lock = heartbeatLock(req.params.id, folder, req.user!, clientId, editing);
      res.json({ lock: publicLock(lock, req.user!.id, clientId) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/v1/requirements/:id/lock/release", (req, res) => {
    try {
      requireProject(req);
      const clientId = String(req.body?.clientId || "");
      const folder = folderFromReq(req);
      releaseLock(req.params.id, folder, req.user!, clientId);
      res.json({
        ok: true,
        lock: publicLock(getLock(req.params.id, folder), req.user!.id, clientId),
      });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/v1/requirements/:id/lock/force-release", (req, res) => {
    try {
      requireProject(req);
      if (!isArchitect(req.user!.role)) {
        throw new HttpError("只有架构师能解除编辑权。", 403);
      }
      const folder = req.body?.folder ? folderFromReq(req) : undefined;
      forceReleaseLock(req.params.id, folder);
      res.json({ ok: true, lock: null });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/lock", (req, res) => {
    try {
      requireProject(req);
      const clientId =
        typeof req.query.clientId === "string" ? req.query.clientId : undefined;
      const folder = folderFromReq(req);
      res.json({
        lock: publicLock(getLock(req.params.id, folder), req.user!.id, clientId),
        activeRun: getActiveRunForUser(req.params.id, req.user!.id),
      });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/chat-sessions", (req, res) => {
    try {
      requireProject(req);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit || 30) || 30));
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const sessions = q
        ? searchChatSessions(req.params.id, req.user!.id, q, limit)
        : listChatSessions(req.params.id, req.user!.id, limit);
      res.json({ sessions });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/v1/requirements/:id/chat-sessions", (req, res) => {
    try {
      requireProject(req);
      const title = typeof req.body?.title === "string" ? req.body.title : undefined;
      const session = createChatSession({
        projectId: req.params.id,
        userId: req.user!.id,
        title,
      });
      res.status(201).json({ session, runs: [] });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/chat-sessions/open", (req, res) => {
    try {
      requireProject(req);
      const session = getOrCreateOpenChatSession(req.params.id, req.user!.id);
      const runs = listUserSessionRunsWithEvents(session.id, req.user!.id);
      res.json({ session, runs });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/chat-sessions/:sid", (req, res) => {
    try {
      requireProject(req);
      const detail = getChatSessionWithRuns(req.params.sid, req.user!.id, req.params.id);
      res.json(detail);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/v1/requirements/:id/chat-sessions/:sid/close", (req, res) => {
    try {
      requireProject(req);
      requireChatSessionForUser(req.params.sid, req.user!.id, req.params.id);
      const session = closeChatSession(req.params.sid, req.user!.id);
      res.json({ session });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/v1/requirements/:id/runs", (req, res) => {
    try {
      const meta = requireProject(req);
      const clientId = String(req.body?.clientId || "");
      const message = String(req.body?.message || "").trim();
      if (!message) throw new HttpError("消息不能为空", 400);
      const mode = parseMode(req.body?.mode);
      const gate = gateWorkbenchMode({
        mode,
        phase: meta.phase,
        clarity: meta.clarity,
        hasApprovedCodeDirs: hasApprovedCodeDirs(),
      });
      if (gate) throw new HttpError(gate, 400);

      const focus = parseWorkbenchFocus(req.body?.focus);
      const mine = writableFolderOf(req.user!.role);
      const ask = mode === "ask";
      const folder = ask
        ? mine
        : folderFromReq(req, focus?.file ? folderOfPath(focus.file) || undefined : undefined);

      if (ask) {
        if (!focus?.quote) throw new HttpError("先圈一段，再提问。", 400);
      } else {
        const lock = assertHoldsLock(meta.id, folder, req.user!, clientId || undefined);
        if (lock.editing) {
          throw new HttpError("先保存一版并退出编辑，再发给 AI。", 409);
        }
        if (isDirtyFolder(meta.vaultPath, folder)) {
          throw new HttpError("先记入版本再发给 AI。", 409);
        }
      }


      const sessionId =
        typeof req.body?.sessionId === "string" && req.body.sessionId.trim()
          ? req.body.sessionId.trim()
          : getOrCreateOpenChatSession(meta.id, req.user!.id).id;
      requireChatSessionForUser(sessionId, req.user!.id, meta.id);
      if (getActiveRunForUser(meta.id, req.user!.id)) {
        throw new HttpError("还有一轮 AI 没跑完，等它结束或取消后再发。", 409);
      }

      const run = createRun({
        projectId: meta.id,
        sessionId,
        userId: req.user!.id,
        userName: req.user!.name,
        mode,
        message,
        folder,
        focus,
      });
      touchChatSession(sessionId, message.slice(0, 80));
      res.status(201).json({ runId: run.id, run, events: listEvents(run.id), sessionId });
      void executeWorkbenchRun(run.id);
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/runs", (req, res) => {
    try {
      requireProject(req);
      const limit = Math.min(30, Math.max(1, Number(req.query.limit || 12) || 12));
      const sessionId =
        typeof req.query.sessionId === "string" ? req.query.sessionId.trim() : "";
      if (sessionId) {
        requireChatSessionForUser(sessionId, req.user!.id, req.params.id);
        res.json({ runs: listUserSessionRunsWithEvents(sessionId, req.user!.id, limit) });
        return;
      }
      res.json({ runs: listUserProjectRunsWithEvents(req.params.id, req.user!.id, limit) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/runs/current", (req, res) => {
    try {
      requireProject(req);
      const run = getActiveRunForUser(req.params.id, req.user!.id);
      res.json({ run });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/runs/:runId/events", (req, res) => {
    try {
      requireProject(req);
      const run = assertRunOwnedByUser(req.params.runId, req.user!.id, req.params.id);
      const after = Number(req.query.after || 0) || 0;
      res.json({ run, events: listEvents(run.id, after) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/runs/:runId/stream", (req, res) => {
    try {
      requireProject(req);
      const run = assertRunOwnedByUser(req.params.runId, req.user!.id, req.params.id);
      const after = Number(req.query.after || 0) || 0;
      void pipeRunStream(run.id, after, res);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/v1/requirements/:id/runs/:runId/cancel", (req, res) => {
    try {
      requireProject(req);
      const run = assertRunOwnedByUser(req.params.runId, req.user!.id, req.params.id);
      const askerCancelling = run.mode === "ask" && run.userId === req.user!.id;
      if (!askerCancelling) {
        const clientId = String(req.body?.clientId || "");
        assertHoldsLock(req.params.id, run.folder, req.user!, clientId || undefined);
      }
      const cancelled = cancelRun(run.id);
      res.json({ cancelled });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/v1/requirements/:id/questions", (req, res) => {
    try {
      const meta = requireProject(req);
      const question = String(req.body?.question || "").trim();
      if (!question) throw new HttpError("问题不能为空", 400);
      const file = String(req.body?.file || "").trim();
      const headingPath = Array.isArray(req.body?.headingPath)
        ? req.body.headingPath.map((p: unknown) => String(p || "").trim()).filter(Boolean)
        : [];
      const rawFolder = String(req.body?.folder || "").trim();
      const folder = isDocFolder(rawFolder) ? rawFolder : folderOfPath(file);
      if (!folder) throw new HttpError("只能给产品、研发或测试加问题。", 400);
      const version = recordInboxQuestion({
        vaultPath: meta.vaultPath,
        folder,
        item: {
          asker: askerLabel(req.user!.role, req.user!.name),
          target: questionTargetLabel(file, headingPath),
          question,
        },
        author: { name: req.user!.name, email: req.user!.email },
      });
      res.json({ ok: true, path: questionPath(folder), version });
    } catch (err) {
      fail(res, err);
    }
  });
}

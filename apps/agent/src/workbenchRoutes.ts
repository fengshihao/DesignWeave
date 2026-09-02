import type { Express, Request, Response } from "express";
import { isArchitect } from "./roles.js";
import { HttpError, statusOf } from "./httpError.js";
import { getRequirement } from "./requirements.js";
import { isDirty } from "./gitVault.js";
import {
  assertHoldsLock,
  claimLock,
  forceReleaseLock,
  getLock,
  heartbeatLock,
  publicLock,
  releaseLock,
} from "./projectLocks.js";
import {
  cancelRun,
  createRun,
  getActiveRun,
  getRun,
  listEvents,
  listProjectRunsWithEvents,
  pipeRunStream,
  type WorkbenchMode,
} from "./workbenchRuns.js";
import { executeWorkbenchRun } from "./workbenchAgent.js";
import { parseWorkbenchFocus } from "./workbenchPrompt.js";
import { gateWorkbenchMode } from "./clarifyGate.js";
import { hasApprovedCodeDirs } from "./workspaceSettings.js";

function fail(res: Response, err: unknown): void {
  res.status(statusOf(err)).json({
    error: err instanceof Error ? err.message : "请求失败",
  });
}

function requireProject(req: Request) {
  const meta = getRequirement(req.params.id);
  if (!meta) throw new HttpError("工程不存在", 404);
  return meta;
}

/** API 仍收 mode，只为兼容旧客户端；执行时一律当托付。 */
function parseMode(raw: unknown): WorkbenchMode {
  const mode = String(raw || "coauthor");
  if (mode === "clarify" || mode === "coauthor" || mode === "grill" || mode === "feasibility") {
    return mode;
  }
  return "coauthor";
}

export function registerWorkbenchRoutes(app: Express): void {
  app.post("/v1/requirements/:id/lock/claim", (req, res) => {
    try {
      requireProject(req);
      const clientId = String(req.body?.clientId || "");
      const result = claimLock(req.params.id, req.user!, clientId);
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
      const lock = heartbeatLock(req.params.id, req.user!, clientId, editing);
      res.json({ lock: publicLock(lock, req.user!.id, clientId) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/v1/requirements/:id/lock/release", (req, res) => {
    try {
      requireProject(req);
      const clientId = String(req.body?.clientId || "");
      releaseLock(req.params.id, req.user!, clientId);
      res.json({ ok: true, lock: publicLock(getLock(req.params.id), req.user!.id, clientId) });
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
      forceReleaseLock(req.params.id);
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
      res.json({
        lock: publicLock(getLock(req.params.id), req.user!.id, clientId),
        activeRun: getActiveRun(req.params.id),
      });
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

      const lock = assertHoldsLock(meta.id, req.user!, clientId || undefined);
      if (lock.editing) {
        throw new HttpError("先保存一版并退出编辑，再发给 AI。", 409);
      }
      if (isDirty(meta.vaultPath)) {
        throw new HttpError("先记入版本再发给 AI。", 409);
      }

      const run = createRun({
        projectId: meta.id,
        userId: req.user!.id,
        userName: req.user!.name,
        mode,
        message,
        focus: parseWorkbenchFocus(req.body?.focus),
      });
      res.status(201).json({ runId: run.id, run, events: listEvents(run.id) });
      void executeWorkbenchRun(run.id);
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/runs", (req, res) => {
    try {
      requireProject(req);
      const limit = Math.min(30, Math.max(1, Number(req.query.limit || 12) || 12));
      res.json({ runs: listProjectRunsWithEvents(req.params.id, limit) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/runs/current", (req, res) => {
    try {
      requireProject(req);
      const run = getActiveRun(req.params.id);
      res.json({ run });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/runs/:runId/events", (req, res) => {
    try {
      requireProject(req);
      const run = getRun(req.params.runId);
      if (!run || run.projectId !== req.params.id) {
        throw new HttpError("这一轮不存在", 404);
      }
      const after = Number(req.query.after || 0) || 0;
      res.json({ run, events: listEvents(run.id, after) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/runs/:runId/stream", (req, res) => {
    try {
      requireProject(req);
      const run = getRun(req.params.runId);
      if (!run || run.projectId !== req.params.id) {
        throw new HttpError("这一轮不存在", 404);
      }
      const after = Number(req.query.after || 0) || 0;
      void pipeRunStream(run.id, after, res);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/v1/requirements/:id/runs/:runId/cancel", (req, res) => {
    try {
      requireProject(req);
      const clientId = String(req.body?.clientId || "");
      assertHoldsLock(req.params.id, req.user!, clientId || undefined);
      const run = getRun(req.params.runId);
      if (!run || run.projectId !== req.params.id) {
        throw new HttpError("这一轮不存在", 404);
      }
      const cancelled = cancelRun(run.id);
      res.json({ cancelled });
    } catch (err) {
      fail(res, err);
    }
  });
}

import type { Express, Request, Response } from "express";
import type { Actor } from "@designweave/schema";
import { errorBody, statusOf } from "./httpError.js";
import {
  folderOfPath,
  parseDocFolder,
  writableFolderOf,
  type DocFolder,
} from "./docFolders.js";
import {
  assertRunOwnedByUser,
  getActiveRunForUser,
  listEvents,
  pipeRunStream,
} from "./workbenchRuns.js";
import {
  claimProjectLock,
  forceReleaseProjectLock,
  heartbeatProjectLock,
  readProjectLock,
  releaseProjectLock,
} from "./app/locks.js";
import { addProjectQuestion } from "./app/docs.js";
import {
  cancelProjectRun,
  closeProjectChatSession,
  createProjectChatSession,
  currentProjectRun,
  getProjectChatSession,
  listProjectChatSessions,
  listProjectRuns,
  openProjectChatSession,
  startProjectRun,
} from "./app/runs.js";

function fail(res: Response, err: unknown): void {
  res.status(statusOf(err)).json(errorBody(err));
}

function actorOf(req: Request): Actor {
  return {
    id: req.user!.id,
    name: req.user!.name,
    email: req.user!.email,
    role: req.user!.role,
  };
}

function folderFromReq(req: Request, fallback?: DocFolder): DocFolder {
  const raw = req.body?.folder ?? req.query.folder;
  if (raw) return parseDocFolder(raw, fallback || writableFolderOf(req.user!.role));
  const focusFile = req.body?.focus?.file || req.body?.path;
  const fromPath = typeof focusFile === "string" ? folderOfPath(focusFile) : null;
  return fromPath || fallback || writableFolderOf(req.user!.role);
}

export function registerWorkbenchRoutes(app: Express): void {
  app.post("/v1/requirements/:id/lock/claim", (req, res) => {
    try {
      res.json(
        claimProjectLock(actorOf(req), req.params.id, folderFromReq(req), String(req.body?.clientId || ""))
      );
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/v1/requirements/:id/lock/heartbeat", (req, res) => {
    try {
      res.json(
        heartbeatProjectLock(
          actorOf(req),
          req.params.id,
          folderFromReq(req),
          String(req.body?.clientId || ""),
          Boolean(req.body?.editing)
        )
      );
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/v1/requirements/:id/lock/release", (req, res) => {
    try {
      res.json(
        releaseProjectLock(
          actorOf(req),
          req.params.id,
          folderFromReq(req),
          String(req.body?.clientId || "")
        )
      );
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/v1/requirements/:id/lock/force-release", (req, res) => {
    try {
      const folder = req.body?.folder ? folderFromReq(req) : undefined;
      res.json(forceReleaseProjectLock(actorOf(req), req.params.id, folder));
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/lock", (req, res) => {
    try {
      const clientId =
        typeof req.query.clientId === "string" ? req.query.clientId : undefined;
      const folder = folderFromReq(req);
      res.json({
        ...readProjectLock(actorOf(req), req.params.id, folder, clientId),
        activeRun: getActiveRunForUser(req.params.id, req.user!.id),
      });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/chat-sessions", (req, res) => {
    try {
      res.json(
        listProjectChatSessions(actorOf(req), req.params.id, {
          q: typeof req.query.q === "string" ? req.query.q : "",
          limit: Number(req.query.limit || 30) || 30,
        })
      );
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/v1/requirements/:id/chat-sessions", (req, res) => {
    try {
      const title = typeof req.body?.title === "string" ? req.body.title : undefined;
      res.status(201).json(createProjectChatSession(actorOf(req), req.params.id, title));
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/chat-sessions/open", (req, res) => {
    try {
      res.json(openProjectChatSession(actorOf(req), req.params.id));
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/chat-sessions/:sid", (req, res) => {
    try {
      res.json(getProjectChatSession(actorOf(req), req.params.id, req.params.sid));
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/v1/requirements/:id/chat-sessions/:sid/close", (req, res) => {
    try {
      res.json(closeProjectChatSession(actorOf(req), req.params.id, req.params.sid));
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/v1/requirements/:id/runs", (req, res) => {
    try {
      const result = startProjectRun(actorOf(req), req.params.id, {
        message: String(req.body?.message || ""),
        clientId: String(req.body?.clientId || ""),
        sessionId: typeof req.body?.sessionId === "string" ? req.body.sessionId : undefined,
        focus: req.body?.focus,
        mode: req.body?.mode,
        folder: req.body?.folder ? folderFromReq(req) : undefined,
      });
      res.status(201).json(result);
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/runs", (req, res) => {
    try {
      res.json(
        listProjectRuns(actorOf(req), req.params.id, {
          limit: Number(req.query.limit || 12) || 12,
          sessionId: typeof req.query.sessionId === "string" ? req.query.sessionId : "",
        })
      );
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/runs/current", (req, res) => {
    try {
      res.json(currentProjectRun(actorOf(req), req.params.id));
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/runs/:runId/events", (req, res) => {
    try {
      const run = assertRunOwnedByUser(req.params.runId, req.user!.id, req.params.id);
      const after = Number(req.query.after || 0) || 0;
      res.json({ run, events: listEvents(run.id, after) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get("/v1/requirements/:id/runs/:runId/stream", (req, res) => {
    try {
      const run = assertRunOwnedByUser(req.params.runId, req.user!.id, req.params.id);
      const after = Number(req.query.after || 0) || 0;
      void pipeRunStream(run.id, after, res);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/v1/requirements/:id/runs/:runId/cancel", (req, res) => {
    try {
      res.json(
        cancelProjectRun(
          actorOf(req),
          req.params.id,
          req.params.runId,
          String(req.body?.clientId || "") || undefined
        )
      );
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/v1/requirements/:id/questions", (req, res) => {
    try {
      const headingPath = Array.isArray(req.body?.headingPath)
        ? req.body.headingPath.map((p: unknown) => String(p || "").trim()).filter(Boolean)
        : [];
      res.json(
        addProjectQuestion(actorOf(req), req.params.id, {
          folder: String(req.body?.folder || ""),
          file: String(req.body?.file || ""),
          headingPath,
          question: String(req.body?.question || ""),
        })
      );
    } catch (err) {
      fail(res, err);
    }
  });
}

import type { Express, Request } from "express";
import type { Actor } from "@designweave/schema";
import { actorFrom } from "../acl.js";
import { defaultFileForRole } from "../docFolders.js";
import { assertWritable } from "../projectLocks.js";
import { defaultOpenPath, PRD_FILE } from "../prdPack.js";
import type { DiskProjectPhase } from "../projectMeta.js";
import {
  getRequirementBundle,
  importMarkdownToRequirement,
  setRequirementPhase,
} from "../requirements.js";
import { listProjectTree, readProjectDoc, writeProjectDoc } from "../app/docs.js";
import {
  listProjectVersions,
  recordProjectVersion,
  readVersionFile,
  restoreVersionFile,
  revertLatestAiVersion,
} from "../app/versions.js";
import { errorBody, statusOf } from "../httpError.js";
import { PROJECT_API_BASES } from "./mount.js";

function actorOf(req: Request): Actor {
  return actorFrom(req.user!);
}

/** 文档树 / 读写 / 记版 / 导入。双挂 projects 与 requirements。 */
export function registerDocRoutes(app: Express): void {
  for (const base of PROJECT_API_BASES) {
    mountDocs(app, base);
  }
}

function mountDocs(app: Express, base: string): void {
  app.get(`${base}/:id/tree`, (req, res) => {
    try {
      res.json(listProjectTree(actorOf(req), req.params.id));
    } catch (err) {
      res.status(statusOf(err, 404)).json(errorBody(err));
    }
  });

  app.get(`${base}/:id/files`, (req, res) => {
    try {
      const tree = listProjectTree(actorOf(req), req.params.id).files;
      const rel =
        typeof req.query.path === "string"
          ? req.query.path
          : defaultOpenPath(tree, defaultFileForRole(req.user!.role));
      const file = readProjectDoc(actorOf(req), req.params.id, rel);
      res.setHeader("ETag", file.etag);
      res.json(file);
    } catch (err) {
      res.status(statusOf(err, 404)).json(errorBody(err));
    }
  });

  app.put(`${base}/:id/files`, (req, res) => {
    try {
      const rel = typeof req.query.path === "string" ? req.query.path : PRD_FILE;
      const file = writeProjectDoc(actorOf(req), req.params.id, rel, String(req.body?.content ?? ""), {
        clientId: String(req.body?.clientId || req.query.clientId || "") || undefined,
        ifMatch: req.header("if-match") || undefined,
      });
      res.setHeader("ETag", file.etag);
      res.json(file);
    } catch (err) {
      res.status(statusOf(err)).json(errorBody(err));
    }
  });

  app.put(`${base}/:id/prd`, (req, res) => {
    try {
      const file = writeProjectDoc(
        actorOf(req),
        req.params.id,
        PRD_FILE,
        String(req.body?.content ?? ""),
        { clientId: String(req.body?.clientId || "") || undefined }
      );
      res.json({ prd: file.content });
    } catch (err) {
      res.status(statusOf(err, 404)).json(errorBody(err));
    }
  });

  app.post(`${base}/:id/import`, (req, res) => {
    try {
      assertWritable(
        req.params.id,
        "product",
        req.user!,
        String(req.body?.clientId || "") || undefined
      );
      const markdown = String(req.body?.markdown || "");
      const result = importMarkdownToRequirement(req.params.id, markdown);
      res.json({
        ...result,
        bundle: getRequirementBundle(req.params.id),
      });
    } catch (err) {
      res.status(statusOf(err)).json(errorBody(err));
    }
  });

  app.patch(`${base}/:id/phase`, (req, res) => {
    try {
      const phase = String(req.body?.phase || "");
      if (!["filling", "imported", "clarifying", "ready"].includes(phase)) {
        res.status(400).json({
          error: "phase 必须是 filling | imported | clarifying | ready",
          code: "invalid",
        });
        return;
      }
      const requirement = setRequirementPhase(req.params.id, phase as DiskProjectPhase);
      res.json({ requirement });
    } catch (err) {
      res.status(statusOf(err, 404)).json(errorBody(err));
    }
  });

  app.get(`${base}/:id/versions`, (req, res) => {
    try {
      res.json(listProjectVersions(actorOf(req), req.params.id, req.query.folder));
    } catch (err) {
      res.status(statusOf(err, 404)).json(errorBody(err));
    }
  });

  app.post(`${base}/:id/versions`, (req, res) => {
    try {
      const result = recordProjectVersion(actorOf(req), req.params.id, {
        folder: req.body?.folder,
        message: req.body?.message,
        clientId: String(req.body?.clientId || "") || undefined,
        markCaughtUp: Boolean(req.body?.markCaughtUp),
      });
      if (!result.version) {
        res.json(result);
        return;
      }
      res.status(201).json(result);
    } catch (err) {
      res.status(statusOf(err)).json(errorBody(err));
    }
  });

  app.get(`${base}/:id/versions/:sha/files`, (req, res) => {
    try {
      const rel = typeof req.query.path === "string" ? req.query.path : PRD_FILE;
      res.json(readVersionFile(actorOf(req), req.params.id, req.params.sha, rel));
    } catch (err) {
      res.status(statusOf(err, 404)).json(errorBody(err));
    }
  });

  app.post(`${base}/:id/versions/:sha/restore`, (req, res) => {
    try {
      const rel = typeof req.body?.path === "string" ? req.body.path : PRD_FILE;
      res.json(
        restoreVersionFile(
          actorOf(req),
          req.params.id,
          req.params.sha,
          rel,
          String(req.body?.clientId || "") || undefined
        )
      );
    } catch (err) {
      res.status(statusOf(err)).json(errorBody(err));
    }
  });

  app.post(`${base}/:id/versions/revert-latest-ai`, (req, res) => {
    try {
      res.json(
        revertLatestAiVersion(actorOf(req), req.params.id, {
          folder: req.body?.folder,
          clientId: String(req.body?.clientId || "") || undefined,
        })
      );
    } catch (err) {
      res.status(statusOf(err)).json(errorBody(err));
    }
  });
}

import type { Express, Request } from "express";
import type { Actor } from "@designweave/schema";
import { failJson } from "./requestLog.js";
import {
  abandonProject,
  createProject,
  getProject,
  listProjects,
  removeProject,
  updateProjectFields,
} from "../app/projects.js";
import { getRequirementBundle } from "../requirements.js";
import { deleteRunsForProject, getActiveRunForUser } from "../workbenchRuns.js";
import { deleteChatSessionsForProject } from "../chatSessions.js";
import { forceReleaseLock, getLock, publicLock } from "../projectLocks.js";
import { requireArchitect } from "../acl.js";
import { writableFolderOf } from "../docFolders.js";
import { clarityStatusLabel } from "../clarifyGate.js";
import { hasApprovedCodeDirs } from "../workspaceSettings.js";
import { parseDocFolder } from "../docFolders.js";

function actorOf(req: Request): Actor {
  return {
    id: req.user!.id,
    name: req.user!.name,
    email: req.user!.email,
    role: req.user!.role,
  };
}

/** 工作台工程 CRUD。`/v1/requirements` 为过渡别名。 */
export function registerProjectRoutes(app: Express): void {
  const mountListCreate = (base: string) => {
    app.get(base, (req, res) => {
      try {
        const actor = actorOf(req);
        const listed = listProjects(actor);
        const folder = writableFolderOf(actor.role);
        const projects = listed.projects.map((p) => ({
          ...p,
          owner: p.ownerName,
          summary: "",
          relatedRepos: [] as string[],
          lock: publicLock(getLock(p.id, folder), actor.id),
          activeRun: getActiveRunForUser(p.id, actor.id),
          clarityLabel: clarityStatusLabel(p),
        }));
        res.json({
          requirements: projects,
          projects,
          orphans: listed.orphans,
          workspaceRootSet: listed.workspaceRootSet,
          hasApprovedCodeDirs: hasApprovedCodeDirs(),
        });
      } catch (err) {
        failJson(res, err);
      }
    });

    app.post(base, (req, res) => {
      try {
        const importMarkdown =
          typeof req.body?.importMarkdown === "string" ? req.body.importMarkdown : undefined;
        const sourceRaw = String(req.body?.source || "");
        const source =
          sourceRaw === "import" || importMarkdown?.trim() ? ("import" as const) : ("template" as const);
        if (source === "import" && !importMarkdown?.trim()) {
          res.status(400).json({ error: "导入请粘贴或上传 Markdown", code: "invalid" });
          return;
        }
        const project = createProject(actorOf(req), {
          title: String(req.body?.title || req.body?.name || ""),
          source,
          importMarkdown,
        });
        res.status(201).json({
          requirement: { ...project, owner: project.ownerName, summary: "", relatedRepos: [] },
          project,
          bundle: getRequirementBundle(project.id),
        });
      } catch (err) {
        failJson(res, err);
      }
    });
  };

  const mountItem = (base: string) => {
    app.get(`${base}/:id`, (req, res) => {
      try {
        getProject(actorOf(req), req.params.id);
        const bundle = getRequirementBundle(req.params.id);
        if (!bundle) {
          res.status(404).json({ error: "工程不存在", code: "not_found" });
          return;
        }
        const clientId =
          typeof req.query.clientId === "string" ? req.query.clientId : undefined;
        const folder = parseDocFolder(req.query.folder, writableFolderOf(req.user!.role));
        res.json({
          ...bundle,
          lock: publicLock(getLock(req.params.id, folder), req.user!.id, clientId),
          activeRun: getActiveRunForUser(req.params.id, req.user!.id),
        });
      } catch (err) {
        failJson(res, err);
      }
    });

    app.patch(`${base}/:id`, (req, res) => {
      try {
        const project = updateProjectFields(actorOf(req), req.params.id, {
          title: typeof req.body?.title === "string" ? req.body.title : undefined,
          ownerId: typeof req.body?.ownerId === "string" ? req.body.ownerId : undefined,
          phase: req.body?.phase,
          clarity: req.body?.clarity,
        });
        res.json({ project, requirement: { ...project, owner: project.ownerName } });
      } catch (err) {
        failJson(res, err);
      }
    });

    app.delete(`${base}/:id`, requireArchitect, (req, res) => {
      try {
        deleteRunsForProject(req.params.id);
        deleteChatSessionsForProject(req.params.id);
        forceReleaseLock(req.params.id);
        const project = removeProject(actorOf(req), req.params.id);
        res.json({
          ok: true,
          project,
          requirement: { ...project, owner: project.ownerName },
        });
      } catch (err) {
        failJson(res, err);
      }
    });

    app.post(`${base}/:id/abandon`, requireArchitect, (req, res) => {
      try {
        const project = abandonProject(actorOf(req), req.params.id);
        res.json({
          ok: true,
          project,
          requirement: { ...project, owner: project.ownerName },
        });
      } catch (err) {
        failJson(res, err);
      }
    });
  };

  // 只在新路径挂 list/create；item 两端都挂。旧 requirements list/create 从 index 删掉后，再挂别名。
  mountListCreate("/v1/projects");
  mountItem("/v1/projects");
  mountListCreate("/v1/requirements");
  mountItem("/v1/requirements");
}

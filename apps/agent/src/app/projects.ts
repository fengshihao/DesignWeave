import type { Actor, WorkbenchProject } from "@designweave/schema";
import { authorize } from "./authorize.js";
import { AppError } from "./errors.js";
import { writeAudit } from "../data/audit.js";
import { getUserRow } from "../data/users.js";
import { logLine } from "../log/logger.js";
import {
  abandonRequirement,
  createRequirement,
  deleteRequirement,
  getRequirement,
  listOrphanRequirements,
  listRequirements,
  patchProjectMeta,
  renameRequirement,
  type RequirementMeta,
} from "../requirements.js";
import { getWorkspaceRoot } from "../workspaceSettings.js";

function toProject(meta: RequirementMeta): WorkbenchProject {
  return {
    id: meta.id,
    title: meta.title,
    ownerId: meta.ownerId || null,
    ownerName: meta.owner,
    source: meta.source,
    phase: meta.phase,
    clarity: meta.clarity,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    vaultPath: meta.vaultPath,
    folderName: meta.folderName,
  };
}

function audit(
  actor: Actor,
  action: string,
  projectId: string,
  detail?: Record<string, unknown>
): void {
  writeAudit({ actor, action, result: "ok", projectId, detail });
  logLine(action, { actorId: actor.id, projectId, ...detail });
}

export function listProjects(actor: Actor): {
  projects: WorkbenchProject[];
  orphans: WorkbenchProject[];
  workspaceRootSet: boolean;
} {
  authorize(actor, "project.read");
  return {
    projects: listRequirements().map(toProject),
    orphans: actor.role === "architect" ? listOrphanRequirements().map(toProject) : [],
    workspaceRootSet: Boolean(getWorkspaceRoot()),
  };
}

export function getProject(actor: Actor, id: string): WorkbenchProject {
  authorize(actor, "project.read");
  const meta = getRequirement(id);
  if (!meta) throw new AppError("not_found", "工程不存在");
  return toProject(meta);
}

export function createProject(
  actor: Actor,
  input: { title: string; source?: "template" | "import"; importMarkdown?: string }
): WorkbenchProject {
  authorize(actor, "project.create");
  if (!getWorkspaceRoot()) {
    throw new AppError("not_ready", "架构师还没设定运行根目录。");
  }
  const title = input.title.trim();
  if (!title) throw new AppError("invalid", "请填写工程名称");
  const meta = createRequirement({
    title,
    owner: actor.name,
    ownerId: actor.id,
    source: input.source,
    importMarkdown: input.importMarkdown,
  });
  audit(actor, "project.create", meta.id, { title: meta.title });
  return toProject(meta);
}

export function renameProject(actor: Actor, id: string, title: string): WorkbenchProject {
  const meta = getRequirement(id);
  if (!meta) throw new AppError("not_found", "工程不存在");
  authorize(actor, "project.rename", { ownerId: meta.ownerId || null });
  const updated = renameRequirement(id, title);
  audit(actor, "project.rename", id, {
    title: updated.title,
    folderName: updated.folderName,
  });
  return toProject(updated);
}

export function transferProject(actor: Actor, id: string, ownerId: string): WorkbenchProject {
  authorize(actor, "project.transfer");
  const meta = getRequirement(id);
  if (!meta) throw new AppError("not_found", "工程不存在");
  const owner = getUserRow(ownerId);
  if (!owner || owner.status !== "active") {
    throw new AppError("invalid", "新的负责人不存在或已停用");
  }
  const updated = patchProjectMeta(id, { ownerId: owner.id, owner: owner.name });
  audit(actor, "project.transfer", id, { ownerId: owner.id });
  return toProject(updated);
}

export function removeProject(actor: Actor, id: string): WorkbenchProject {
  authorize(actor, "project.delete");
  const meta = deleteRequirement(id);
  audit(actor, "project.delete", id, { title: meta.title });
  return toProject(meta);
}

export function abandonProject(actor: Actor, id: string): WorkbenchProject {
  authorize(actor, "project.abandon");
  const meta = abandonRequirement(id);
  audit(actor, "project.abandon", id, { title: meta.title });
  return toProject(meta);
}

export function updateProjectFields(
  actor: Actor,
  id: string,
  patch: {
    title?: string;
    ownerId?: string;
    phase?: RequirementMeta["phase"];
    clarity?: RequirementMeta["clarity"];
  }
): WorkbenchProject {
  const current = getRequirement(id);
  if (!current) throw new AppError("not_found", "工程不存在");

  if (patch.ownerId !== undefined) {
    return transferProject(actor, id, patch.ownerId);
  }
  if (typeof patch.title === "string") {
    return renameProject(actor, id, patch.title);
  }
  if (patch.phase !== undefined || patch.clarity !== undefined) {
    if (actor.role === "tester") {
      throw new AppError("forbidden", "你不能改工程状态。");
    }
    return toProject(
      patchProjectMeta(id, {
        phase: patch.phase,
        clarity: patch.clarity,
      })
    );
  }
  return toProject(current);
}

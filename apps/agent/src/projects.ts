import { nanoid } from "nanoid";
import type { ProjectMeta, ProjectPhase, PrdDocument, Issue } from "@designweave/schema";
import { getDb } from "./db.js";
import {
  ensureWorkspace,
  readPrd,
  writePrd,
  readIssues,
  writeIssues,
  readProjectMeta,
  writeProjectMeta,
  readTechSpec,
  writeTechSpec,
  readTestPlan,
  writeTestPlan,
  listSrs,
  projectDir,
} from "./workspace.js";
import fs from "node:fs";

export function listProjects(): ProjectMeta[] {
  const rows = getDb()
    .prepare(
      `SELECT id, name, description, phase, repo_path as repoPath, created_at as createdAt, updated_at as updatedAt
       FROM projects ORDER BY updated_at DESC`
    )
    .all() as Array<{
    id: string;
    name: string;
    description: string;
    phase: ProjectPhase;
    repoPath: string | null;
    createdAt: string;
    updatedAt: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    phase: r.phase,
    repoPath: r.repoPath ?? undefined,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export function createProject(input: {
  name: string;
  description?: string;
  idea?: string;
}): ProjectMeta {
  const now = new Date().toISOString();
  const meta: ProjectMeta = {
    id: nanoid(10),
    name: input.name.trim() || "未命名项目",
    description: input.description?.trim() || input.idea?.trim() || "",
    phase: "design",
    createdAt: now,
    updatedAt: now,
  };

  getDb()
    .prepare(
      `INSERT INTO projects (id, name, description, phase, repo_path, created_at, updated_at)
       VALUES (@id, @name, @description, @phase, @repoPath, @createdAt, @updatedAt)`
    )
    .run({
      id: meta.id,
      name: meta.name,
      description: meta.description,
      phase: meta.phase,
      repoPath: null,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    });

  ensureWorkspace(meta, input.idea);
  return meta;
}

export function getProject(projectId: string): ProjectMeta | null {
  const row = getDb()
    .prepare(
      `SELECT id, name, description, phase, repo_path as repoPath, created_at as createdAt, updated_at as updatedAt
       FROM projects WHERE id = ?`
    )
    .get(projectId) as
    | {
        id: string;
        name: string;
        description: string;
        phase: ProjectPhase;
        repoPath: string | null;
        createdAt: string;
        updatedAt: string;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    phase: row.phase,
    repoPath: row.repoPath ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function touchProject(projectId: string): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`)
    .run(now, projectId);
  const meta = getProject(projectId);
  if (meta) {
    meta.updatedAt = now;
    writeProjectMeta(meta);
  }
}

export function updateProject(
  projectId: string,
  patch: Partial<Pick<ProjectMeta, "name" | "description" | "phase" | "repoPath">>
): ProjectMeta | null {
  const current = getProject(projectId);
  if (!current) return null;
  const next: ProjectMeta = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `UPDATE projects SET name = ?, description = ?, phase = ?, repo_path = ?, updated_at = ? WHERE id = ?`
    )
    .run(
      next.name,
      next.description,
      next.phase,
      next.repoPath ?? null,
      next.updatedAt,
      next.id
    );
  writeProjectMeta(next);
  return next;
}

export function getProjectBundle(projectId: string) {
  const meta = getProject(projectId);
  if (!meta) return null;
  if (!fs.existsSync(projectDir(projectId))) {
    ensureWorkspace(meta);
  }
  // sync file meta
  try {
    readProjectMeta(projectId);
  } catch {
    writeProjectMeta(meta);
  }

  return {
    project: meta,
    prd: readPrd(projectId),
    issues: readIssues(projectId),
    tech: readTechSpec(projectId),
    srs: listSrs(projectId),
    testPlan: readTestPlan(projectId),
  };
}

export function savePrd(projectId: string, doc: PrdDocument): PrdDocument {
  writePrd(projectId, doc);
  touchProject(projectId);
  return readPrd(projectId);
}

export function updateIssue(
  projectId: string,
  issueId: string,
  patch: Partial<Pick<Issue, "status" | "title" | "description" | "suggestion">>
): Issue | null {
  const file = readIssues(projectId);
  const idx = file.issues.findIndex((i) => i.id === issueId);
  if (idx < 0) return null;
  file.issues[idx] = {
    ...file.issues[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeIssues(projectId, file);
  touchProject(projectId);
  return file.issues[idx];
}

export function exportPrdMarkdown(projectId: string): string {
  const p = `${projectDir(projectId)}/prd/PRD.md`;
  if (!fs.existsSync(p)) {
    writePrd(projectId, readPrd(projectId));
  }
  return fs.readFileSync(p, "utf8");
}

export { writeTechSpec, writeTestPlan, readTechSpec, readTestPlan };

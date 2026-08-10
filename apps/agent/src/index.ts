import express from "express";
import cors from "cors";
import fs from "node:fs";
import {
  AgentModeSchema,
  AgentRoleSchema,
  AgentStructuredResultSchema,
  PrdDocumentSchema,
  IssueStatusSchema,
  ProjectPhaseSchema,
} from "@designweave/schema";
import { config, workspacesRoot } from "./config.js";
import { getDb } from "./db.js";
import {
  createProject,
  getProject,
  getProjectBundle,
  listProjects,
  savePrd,
  updateIssue,
  updateProject,
  exportPrdMarkdown,
  writeTechSpec,
  writeTestPlan,
} from "./projects.js";
import { createSession, getSession, beginAbortable, cancelSession, endAbortable } from "./sessions.js";
import { runAgentStream, runMockStream } from "./claude.js";
import {
  applyPatches,
  applyConsistencyResult,
  readPrd,
  readIssues,
} from "./workspace.js";
import { scanClaudeKnownProjects } from "./claudeProjects.js";
import {
  createRequirement,
  ensureRequirementsTable,
  getRequirementBundle,
  listRequirements,
  readPrdMarkdown,
  setRequirementPhase,
  writePrdMarkdown,
  importMarkdownToRequirement,
} from "./requirements.js";

fs.mkdirSync(workspacesRoot(), { recursive: true });
getDb();
ensureRequirementsTable();

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

app.use((req, res, next) => {
  if (!config.appPassword) return next();
  const header = req.header("x-app-password") || "";
  const queryPwd = typeof req.query.password === "string" ? req.query.password : "";
  if (header === config.appPassword || queryPwd === config.appPassword) return next();
  if (req.path === "/health") return next();
  res.status(401).json({ error: "未授权：请提供正确的访问口令" });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    name: "DesignWeave Agent",
    hasApiKey: Boolean(config.anthropicApiKey),
    mockMode: !config.anthropicApiKey,
  });
});

app.get("/v1/claude/projects", (_req, res) => {
  res.json(scanClaudeKnownProjects());
});

app.get("/v1/requirements", (_req, res) => {
  res.json({ requirements: listRequirements() });
});

app.post("/v1/requirements", (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const summary = String(req.body?.summary || req.body?.idea || "").trim();
    const primaryRepo =
      typeof req.body?.primaryRepo === "string"
        ? req.body.primaryRepo.trim()
        : undefined;
    const relatedRepos = Array.isArray(req.body?.relatedRepos)
      ? req.body.relatedRepos.map((x: unknown) => String(x))
      : [];
    const importMarkdown =
      typeof req.body?.importMarkdown === "string"
        ? req.body.importMarkdown
        : undefined;

    if (!title && !summary && !importMarkdown) {
      res.status(400).json({ error: "请提供标题、一句话目标或导入的 Markdown" });
      return;
    }

    const requirement = createRequirement({
      title: title || summary.slice(0, 40) || "导入的需求",
      summary,
      primaryRepo,
      relatedRepos,
      importMarkdown,
    });
    res.status(201).json({
      requirement,
      bundle: getRequirementBundle(requirement.id),
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get("/v1/requirements/:id", (req, res) => {
  const bundle = getRequirementBundle(req.params.id);
  if (!bundle) {
    res.status(404).json({ error: "需求不存在" });
    return;
  }
  res.json(bundle);
});

app.put("/v1/requirements/:id/prd", (req, res) => {
  try {
    const content = String(req.body?.content ?? "");
    writePrdMarkdown(req.params.id, content);
    res.json({ prd: readPrdMarkdown(req.params.id) });
  } catch (err) {
    res.status(404).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/v1/requirements/:id/import", (req, res) => {
  try {
    const markdown = String(req.body?.markdown || "");
    const mode = req.body?.mode === "append" ? "append" : "replace";
    const result = importMarkdownToRequirement(req.params.id, markdown, mode);
    res.json({
      ...result,
      bundle: getRequirementBundle(req.params.id),
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.patch("/v1/requirements/:id/phase", (req, res) => {
  try {
    const phase = String(req.body?.phase || "");
    if (!["guide", "document", "gaps"].includes(phase)) {
      res.status(400).json({ error: "phase 必须是 guide | document | gaps" });
      return;
    }
    const requirement = setRequirementPhase(
      req.params.id,
      phase as "guide" | "document" | "gaps"
    );
    res.json({ requirement });
  } catch (err) {
    res.status(404).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get("/v1/projects", (_req, res) => {
  res.json({ projects: listProjects() });
});

app.post("/v1/projects", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();
  const idea = String(req.body?.idea || "").trim();
  if (!name && !idea) {
    res.status(400).json({ error: "请提供项目名称或一句话想法" });
    return;
  }
  const project = createProject({
    name: name || idea.slice(0, 40) || "未命名项目",
    description,
    idea,
  });
  res.status(201).json({ project, bundle: getProjectBundle(project.id) });
});

app.get("/v1/projects/:id", (req, res) => {
  const bundle = getProjectBundle(req.params.id);
  if (!bundle) {
    res.status(404).json({ error: "项目不存在" });
    return;
  }
  res.json(bundle);
});

app.patch("/v1/projects/:id", (req, res) => {
  const phase = req.body?.phase
    ? ProjectPhaseSchema.parse(req.body.phase)
    : undefined;
  const project = updateProject(req.params.id, {
    name: req.body?.name,
    description: req.body?.description,
    phase,
    repoPath: req.body?.repoPath,
  });
  if (!project) {
    res.status(404).json({ error: "项目不存在" });
    return;
  }
  res.json({ project });
});

app.put("/v1/projects/:id/prd", (req, res) => {
  if (!getProject(req.params.id)) {
    res.status(404).json({ error: "项目不存在" });
    return;
  }
  const doc = PrdDocumentSchema.parse(req.body);
  const prd = savePrd(req.params.id, doc);
  res.json({ prd });
});

app.get("/v1/projects/:id/export/prd", (req, res) => {
  if (!getProject(req.params.id)) {
    res.status(404).json({ error: "项目不存在" });
    return;
  }
  const md = exportPrdMarkdown(req.params.id);
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="PRD-${req.params.id}.md"`
  );
  res.send(md);
});

app.get("/v1/projects/:id/issues", (req, res) => {
  if (!getProject(req.params.id)) {
    res.status(404).json({ error: "项目不存在" });
    return;
  }
  res.json(readIssues(req.params.id));
});

app.patch("/v1/projects/:id/issues/:issueId", (req, res) => {
  const status = req.body?.status
    ? IssueStatusSchema.parse(req.body.status)
    : undefined;
  const issue = updateIssue(req.params.id, req.params.issueId, {
    status,
    title: req.body?.title,
    description: req.body?.description,
    suggestion: req.body?.suggestion,
  });
  if (!issue) {
    res.status(404).json({ error: "问题不存在" });
    return;
  }
  res.json({ issue });
});

app.put("/v1/projects/:id/tech", (req, res) => {
  if (!getProject(req.params.id)) {
    res.status(404).json({ error: "项目不存在" });
    return;
  }
  writeTechSpec(req.params.id, req.body);
  res.json({ tech: req.body });
});

app.put("/v1/projects/:id/test-plan", (req, res) => {
  if (!getProject(req.params.id)) {
    res.status(404).json({ error: "项目不存在" });
    return;
  }
  writeTestPlan(req.params.id, req.body);
  res.json({ testPlan: req.body });
});

app.post("/v1/sessions", (req, res) => {
  const projectId = String(req.body?.projectId || "");
  if (!getProject(projectId)) {
    res.status(404).json({ error: "项目不存在" });
    return;
  }
  const role = AgentRoleSchema.parse(req.body?.role || "designer");
  const mode = AgentModeSchema.parse(req.body?.mode || "coauthor");
  const session = createSession({ projectId, role, mode });
  res.status(201).json({ session });
});

app.post("/v1/sessions/:id/messages", async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: "会话不存在" });
    return;
  }

  const message = String(req.body?.message || "").trim();
  if (!message) {
    res.status(400).json({ error: "消息不能为空" });
    return;
  }

  const focusSection =
    typeof req.body?.focusSection === "string" ? req.body.focusSection : undefined;
  const autoApply = Boolean(req.body?.autoApply);
  const project = getProject(session.projectId);

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const controller = beginAbortable(session.id);
  const stream = config.anthropicApiKey
    ? runAgentStream({
        projectId: session.projectId,
        role: session.role,
        mode: session.mode,
        message,
        focusSection,
        repoPath: project?.repoPath,
        signal: controller.signal,
      })
    : runMockStream({ mode: session.mode, message });

  let lastStructured: unknown = undefined;

  try {
    for await (const ev of stream) {
      if (ev.type === "text") send("text", { text: ev.text });
      if (ev.type === "tool") send("tool", { name: ev.name, input: ev.input });
      if (ev.type === "error") send("error", { message: ev.message });
      if (ev.type === "result") {
        lastStructured = ev.structured;
        send("result", { structured: ev.structured, text: ev.text });
      }
      if (ev.type === "done") {
        if (lastStructured && autoApply) {
          try {
            const parsed = AgentStructuredResultSchema.parse(lastStructured);
            if (session.mode === "consistency") {
              const issues = applyConsistencyResult(session.projectId, parsed);
              send("applied", { kind: "consistency", issues, prd: readPrd(session.projectId) });
            } else if (
              session.mode === "coauthor" ||
              session.mode === "refine" ||
              session.mode === "grill"
            ) {
              const prd = applyPatches(session.projectId, parsed);
              send("applied", {
                kind: "patches",
                prd,
                issues: readIssues(session.projectId),
              });
            }
          } catch (err) {
            send("error", {
              message: `结构化结果应用失败：${err instanceof Error ? err.message : String(err)}`,
            });
          }
        }
        send("done", { ok: true, mockMode: !config.anthropicApiKey });
      }
    }
  } finally {
    endAbortable(session.id);
    res.end();
  }
});

app.post("/v1/sessions/:id/cancel", (req, res) => {
  const ok = cancelSession(req.params.id);
  res.json({ cancelled: ok });
});

app.post("/v1/projects/:id/apply-result", (req, res) => {
  if (!getProject(req.params.id)) {
    res.status(404).json({ error: "项目不存在" });
    return;
  }
  const mode = AgentModeSchema.parse(req.body?.mode || "refine");
  const parsed = AgentStructuredResultSchema.parse(req.body?.result);
  if (mode === "consistency") {
    const issues = applyConsistencyResult(req.params.id, parsed);
    res.json({ issues, prd: readPrd(req.params.id) });
    return;
  }
  const prd = applyPatches(req.params.id, parsed);
  res.json({ prd, issues: readIssues(req.params.id) });
});

app.listen(config.port, () => {
  console.log(`DesignWeave Agent 已启动：http://localhost:${config.port}`);
  console.log(
    config.anthropicApiKey
      ? "已检测到 ANTHROPIC_API_KEY，将调用 Claude Agent SDK。"
      : "未检测到 ANTHROPIC_API_KEY，当前为演示模式（mock）。"
  );
});

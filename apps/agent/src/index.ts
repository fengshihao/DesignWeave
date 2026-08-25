import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
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
  countUsers,
  createDesignerUser,
  expireAuthCookieHeaders,
  handleAuthRequest,
  listAuthUsers,
  revokeSessionToken,
  signInUser,
  signUpFirstUser,
} from "./auth.js";
import { publicUser, requireArchitect, requireSession } from "./acl.js";
import { ROLES, isArchitect } from "./roles.js";
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
  scanClaudeConfigInventory,
  summarizeClaudeReuse,
} from "./claudeRuntime.js";
import {
  abandonRequirement,
  createRequirement,
  deleteRequirement,
  ensureRequirementsTable,
  getRequirement,
  getRequirementBundle,
  listOrphanRequirements,
  listRequirements,
  setRequirementPhase,
  importMarkdownToRequirement,
} from "./requirements.js";
import {
  ensureWorkspaceTables,
  getWorkspaceRoot,
  hasApprovedCodeDirs,
  listApprovedCodeDirs,
  refreshClaudeCodeDirs,
  setApprovedCodeDirs,
  setWorkspaceRoot,
} from "./workspaceSettings.js";
import { defaultOpenPath } from "./prdPack.js";
import { clarityStatusLabel } from "./clarifyGate.js";
import type { DiskProjectPhase } from "./projectMeta.js";
import { runRequirementChat } from "./requirementChat.js";
import { browseDir, mkdirUnder } from "./fsBrowse.js";
import { listDocTree, readDocFile, writeDocFile } from "./files.js";
import {
  changedFiles,
  commitAll,
  isDirty,
  listVersions,
  readFileAt,
  restoreFile,
  revertLatestAiCommit,
} from "./gitVault.js";
import { getActiveRun, ensureRunTables, deleteRunsForProject } from "./workbenchRuns.js";
import {
  assertWritable,
  ensureLockTable,
  forceReleaseLock,
  getLock,
  publicLock,
} from "./projectLocks.js";
import { registerWorkbenchRoutes } from "./workbenchRoutes.js";
import { statusOf } from "./httpError.js";

fs.mkdirSync(workspacesRoot(), { recursive: true });
getDb();
ensureRequirementsTable();
ensureWorkspaceTables();
ensureLockTable();
ensureRunTables();

const app = express();
app.use(
  cors({
    origin: [config.webOrigin, "http://localhost:3100", "http://127.0.0.1:3100"],
    credentials: true,
  })
);
app.use((req, res, next) => {
  if (req.path.startsWith("/api/auth")) {
    if (!req.headers.origin) {
      req.headers.origin = config.webOrigin;
    }
    void handleAuthRequest(req, res);
    return;
  }
  next();
});
app.use(express.json({ limit: "4mb" }));
app.use(requireSession);

app.get("/health", (_req, res) => {
  const claude = scanClaudeConfigInventory();
  res.json({
    ok: true,
    name: "DesignWeave Agent",
    hasApiKey: Boolean(config.anthropicApiKey),
    mockMode: !config.anthropicApiKey,
    credentialSource: config.anthropicCredentialSource,
    hasBaseUrl: Boolean(config.anthropicBaseUrl),
    claudeSettingsFound: config.claudeSettingsFound,
    claudeReuse: {
      language: claude.language,
      settingSources: claude.settingSources,
      skillCount: claude.skills.length,
      skillNames: claude.skills.map((s) => s.name),
      pluginCount: claude.plugins.filter((p) => p.skillCount > 0 || p.enabled).length,
      enabledPlugins: claude.enabledPluginNames,
      mcpServers: claude.mcpServerNames,
      hasUserClaudeMd: claude.hasUserClaudeMd,
      hasUserRules: claude.hasUserRules,
    },
  });
});

app.get("/v1/auth/status", (_req, res) => {
  res.json({
    needsSetup: countUsers() === 0,
  });
});

app.post("/v1/setup", async (req, res) => {
  if (countUsers() > 0) {
    res.status(403).json({ error: "已经有账号了，请登录" });
    return;
  }
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!name || !email || !password) {
    res.status(400).json({ error: "请填写姓名、登录邮箱和密码" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "密码至少 8 位" });
    return;
  }
  try {
    const response = await signUpFirstUser({
      name,
      email,
      password,
      headers: req.headers,
    });
    await pipeAuthResponse(response, res);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "创建账号失败",
    });
  }
});

app.post("/v1/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) {
    res.status(400).json({ error: "请填写登录邮箱和密码" });
    return;
  }
  try {
    const response = await signInUser({ email, password, headers: req.headers });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
      const message =
        body.code === "INVALID_EMAIL_OR_PASSWORD" ? "邮箱或密码不对" : body.message || "登录失败";
      res.status(401).json({ error: message });
      return;
    }
    await pipeAuthResponse(response, res);
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : "登录失败",
    });
  }
});

app.post("/v1/logout", async (req, res) => {
  await revokeSessionToken(req.headers);
  for (const cookie of expireAuthCookieHeaders()) {
    res.append("Set-Cookie", cookie);
  }
  res.status(200).json({ ok: true });
});

app.get("/v1/me", (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "请先登录" });
    return;
  }
  res.json({ user: publicUser(req.user) });
});

app.get("/v1/users", requireArchitect, async (req, res) => {
  try {
    const result = await listAuthUsers(req.headers);
    const users = (result?.users ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      roleLabel: u.role === ROLES.architect ? "架构师" : "产品经理",
      createdAt: u.createdAt,
    }));
    res.json({ users });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "无法列出用户",
    });
  }
});

app.post("/v1/users", requireArchitect, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!name || !email || !password) {
    res.status(400).json({ error: "请填写姓名、登录邮箱和密码" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "密码至少 8 位" });
    return;
  }
  try {
    const created = await createDesignerUser({
      name,
      email,
      password,
      headers: req.headers,
    });
    const user = created.user;
    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        roleLabel: "产品经理",
      },
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "创建账号失败",
    });
  }
});

async function pipeAuthResponse(response: Response, res: express.Response): Promise<void> {
  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  for (const cookie of cookies) {
    res.append("Set-Cookie", cookie);
  }
  const contentType = response.headers.get("content-type");
  if (contentType) res.type(contentType);
  res.status(response.status);
  const text = await response.text();
  res.send(text);
}

app.get("/v1/claude/config", requireArchitect, (_req, res) => {
  res.json(scanClaudeConfigInventory());
});

app.get("/v1/claude/projects", requireArchitect, (_req, res) => {
  res.json(scanClaudeKnownProjects());
});

app.get("/v1/workspace", (req, res) => {
  const root = getWorkspaceRoot();
  const architect = isArchitect(req.user!.role);
  const approved = listApprovedCodeDirs();
  if (!architect) {
    res.json({
      workspaceRootSet: Boolean(root),
      hasApprovedCodeDirs: approved.length > 0,
    });
    return;
  }
  res.json({
    workspaceRoot: root,
    workspaceRootSet: Boolean(root),
    hasApprovedCodeDirs: approved.length > 0,
    approvedCount: approved.length,
  });
});

app.put("/v1/workspace", requireArchitect, (req, res) => {
  try {
    const raw = String(req.body?.workspaceRoot || "").trim();
    if (!raw) {
      res.status(400).json({ error: "请选择运行根目录" });
      return;
    }
    const workspaceRoot = setWorkspaceRoot(raw);
    res.json({ workspaceRoot, workspaceRootSet: true });
  } catch (err) {
    res.status(statusOf(err)).json({
      error: err instanceof Error ? err.message : "没法设定运行根目录",
    });
  }
});

app.get("/v1/workspace/code-dirs", requireArchitect, (_req, res) => {
  try {
    const scan = refreshClaudeCodeDirs();
    res.json(scan);
  } catch (err) {
    res.status(statusOf(err)).json({
      error: err instanceof Error ? err.message : "扫不了代码目录",
    });
  }
});

app.put("/v1/workspace/code-dirs", requireArchitect, (req, res) => {
  try {
    const approved = Array.isArray(req.body?.approved)
      ? req.body.approved.map((x: unknown) => String(x))
      : [];
    const dirs = setApprovedCodeDirs(approved);
    res.json({ dirs, hasApprovedCodeDirs: dirs.some((d) => d.approved) });
  } catch (err) {
    res.status(statusOf(err)).json({
      error: err instanceof Error ? err.message : "没法保存批准名单",
    });
  }
});


app.get("/v1/requirements", (req, res) => {
  const requirements = listRequirements().map((r) => ({
    ...r,
    lock: publicLock(getLock(r.id), req.user!.id),
    activeRun: getActiveRun(r.id),
    clarityLabel: clarityStatusLabel(r),
  }));
  const architect = isArchitect(req.user!.role);
  res.json({
    requirements,
    orphans: architect ? listOrphanRequirements() : [],
    workspaceRootSet: Boolean(getWorkspaceRoot()),
    hasApprovedCodeDirs: hasApprovedCodeDirs(),
  });
});

app.post("/v1/requirements", (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const importMarkdown =
      typeof req.body?.importMarkdown === "string"
        ? req.body.importMarkdown
        : undefined;
    const sourceRaw = String(req.body?.source || "");
    const source =
      sourceRaw === "import" || importMarkdown?.trim()
        ? ("import" as const)
        : ("template" as const);
    if (!title) {
      res.status(400).json({ error: "请填写工程名称" });
      return;
    }
    if (source === "import" && !importMarkdown?.trim()) {
      res.status(400).json({ error: "导入请粘贴或上传 Markdown" });
      return;
    }

    const requirement = createRequirement({
      title,
      owner: req.user!.name,
      source,
      importMarkdown,
    });
    res.status(201).json({
      requirement,
      bundle: getRequirementBundle(requirement.id),
    });
  } catch (err) {
    res.status(statusOf(err)).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.delete("/v1/requirements/:id", requireArchitect, (req, res) => {
  try {
    const id = req.params.id;
    if (!getRequirement(id)) {
      res.status(404).json({ error: "工程不存在" });
      return;
    }
    deleteRunsForProject(id);
    forceReleaseLock(id);
    const requirement = deleteRequirement(id);
    res.json({ ok: true, requirement });
  } catch (err) {
    res.status(statusOf(err)).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/v1/requirements/:id/abandon", requireArchitect, (req, res) => {
  try {
    const requirement = abandonRequirement(req.params.id);
    res.json({ ok: true, requirement });
  } catch (err) {
    res.status(statusOf(err)).json({
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
  const clientId =
    typeof req.query.clientId === "string" ? req.query.clientId : undefined;
  res.json({
    ...bundle,
    lock: publicLock(getLock(req.params.id), req.user!.id, clientId),
    activeRun: getActiveRun(req.params.id),
  });
});

app.put("/v1/requirements/:id/prd", (req, res) => {
  try {
    assertWritable(req.params.id, req.user!, String(req.body?.clientId || "") || undefined);
    const content = String(req.body?.content ?? "");
    const file = writeDocFile(req.params.id, "PRD.md", content);
    res.json({ prd: file.content });
  } catch (err) {
    res.status(statusOf(err, 404)).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/v1/requirements/:id/import", (req, res) => {
  try {
    assertWritable(req.params.id, req.user!, String(req.body?.clientId || "") || undefined);
    const markdown = String(req.body?.markdown || "");
    const result = importMarkdownToRequirement(req.params.id, markdown);
    res.json({
      ...result,
      bundle: getRequirementBundle(req.params.id),
    });
  } catch (err) {
    res.status(statusOf(err)).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/v1/requirements/:id/chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) {
      res.status(400).json({ error: "消息不能为空" });
      return;
    }
    const modeRaw = String(req.body?.mode || "guide");
    const mode =
      modeRaw === "gaps" || modeRaw === "normalize" ? modeRaw : "guide";
    const result = await runRequirementChat({
      requirementId: req.params.id,
      mode,
      message,
    });
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
    if (!["filling", "imported", "clarifying", "ready"].includes(phase)) {
      res.status(400).json({ error: "phase 必须是 filling | imported | clarifying | ready" });
      return;
    }
    const requirement = setRequirementPhase(req.params.id, phase as DiskProjectPhase);
    res.json({ requirement });
  } catch (err) {
    res.status(statusOf(err, 404)).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get("/v1/fs/browse", requireArchitect, (req, res) => {
  try {
    const dir = typeof req.query.path === "string" ? req.query.path : undefined;
    res.json(browseDir(dir));
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "无法浏览目录",
    });
  }
});

app.post("/v1/fs/mkdir", requireArchitect, (req, res) => {
  try {
    const parent = String(req.body?.parent || "").trim();
    const name = String(req.body?.name || "").trim();
    if (!parent || !name) {
      res.status(400).json({ error: "请提供当前目录和新文件夹名字" });
      return;
    }
    const created = mkdirUnder(parent, name);
    res.status(201).json({ ...created, listing: browseDir(parent) });
  } catch (err) {
    res.status(statusOf(err)).json({
      error: err instanceof Error ? err.message : "没法新建这个文件夹",
    });
  }
});

app.get("/v1/requirements/:id/tree", (req, res) => {
  try {
    res.json({ files: listDocTree(req.params.id) });
  } catch (err) {
    res.status(404).json({
      error: err instanceof Error ? err.message : "工程不存在",
    });
  }
});

app.get("/v1/requirements/:id/files", (req, res) => {
  try {
    const tree = listDocTree(req.params.id);
    const rel =
      typeof req.query.path === "string" ? req.query.path : defaultOpenPath(tree);
    const file = readDocFile(req.params.id, rel);
    res.setHeader("ETag", file.etag);
    res.json(file);
  } catch (err) {
    res.status(404).json({
      error: err instanceof Error ? err.message : "文件不存在",
    });
  }
});

app.put("/v1/requirements/:id/files", (req, res) => {
  try {
    assertWritable(
      req.params.id,
      req.user!,
      String(req.body?.clientId || req.query.clientId || "") || undefined
    );
    const rel = typeof req.query.path === "string" ? req.query.path : "PRD.md";
    const content = String(req.body?.content ?? "");
    const ifMatch = req.header("if-match") || undefined;
    const file = writeDocFile(req.params.id, rel, content, ifMatch);
    res.setHeader("ETag", file.etag);
    res.json(file);
  } catch (err) {
    res.status(statusOf(err)).json({
      error: err instanceof Error ? err.message : "保存失败",
    });
  }
});

app.get("/v1/requirements/:id/versions", (req, res) => {
  const meta = getRequirement(req.params.id);
  if (!meta) {
    res.status(404).json({ error: "工程不存在" });
    return;
  }
  res.json({
    versions: listVersions(meta.vaultPath),
    uncommitted: isDirty(meta.vaultPath),
    changedFiles: changedFiles(meta.vaultPath),
  });
});

app.post("/v1/requirements/:id/versions", (req, res) => {
  const meta = getRequirement(req.params.id);
  if (!meta || !req.user) {
    res.status(404).json({ error: "工程不存在" });
    return;
  }
  try {
    assertWritable(
      req.params.id,
      req.user,
      String(req.body?.clientId || "") || undefined
    );
    const custom = String(req.body?.message || "").trim();
    const files = changedFiles(meta.vaultPath);
    const named =
      files.find((f) => /(^|\/)PRD\.md$/i.test(f)) ||
      files.find((f) => /(^|\/)README\.md$/i.test(f)) ||
      files.find((f) => /(^|\/)调研\.md$/.test(f)) ||
      files.find((f) => f.endsWith(".md") && !f.endsWith("meta.md")) ||
      files[0];
    const message =
      custom || `我：保存 ${named ? path.basename(named) : "文档"}`;
    const version = commitAll(meta.vaultPath, message, {
      name: req.user.name,
      email: req.user.email,
    });
    if (!version) {
      res.json({ version: null, message: "没有需要记入的改动" });
      return;
    }
    res.status(201).json({ version });
  } catch (err) {
    res.status(statusOf(err)).json({
      error: err instanceof Error ? err.message : "版本没记下，请稍后再试",
    });
  }
});

app.get("/v1/requirements/:id/versions/:sha/files", (req, res) => {
  const meta = getRequirement(req.params.id);
  if (!meta) {
    res.status(404).json({ error: "工程不存在" });
    return;
  }
  const rel = typeof req.query.path === "string" ? req.query.path : "PRD.md";
  const content = readFileAt(meta.vaultPath, req.params.sha, rel);
  if (content === null) {
    res.status(404).json({ error: "这一版里还没有这篇" });
    return;
  }
  res.json({ path: rel, content, version: req.params.sha });
});

app.post("/v1/requirements/:id/versions/:sha/restore", (req, res) => {
  const meta = getRequirement(req.params.id);
  if (!meta) {
    res.status(404).json({ error: "工程不存在" });
    return;
  }
  try {
    assertWritable(
      req.params.id,
      req.user!,
      String(req.body?.clientId || "") || undefined
    );
    const rel = typeof req.body?.path === "string" ? req.body.path : "PRD.md";
    restoreFile(meta.vaultPath, req.params.sha, rel);
    const file = readDocFile(req.params.id, rel);
    res.json({
      path: rel,
      content: file.content,
      etag: file.etag,
      uncommitted: isDirty(meta.vaultPath),
    });
  } catch (err) {
    res.status(statusOf(err)).json({
      error: err instanceof Error ? err.message : "无法恢复这一篇",
    });
  }
});

app.post("/v1/requirements/:id/versions/revert-latest-ai", (req, res) => {
  const meta = getRequirement(req.params.id);
  if (!meta || !req.user) {
    res.status(404).json({ error: "工程不存在" });
    return;
  }
  try {
    assertWritable(
      req.params.id,
      req.user,
      String(req.body?.clientId || "") || undefined
    );
    const version = revertLatestAiCommit(meta.vaultPath, {
      name: req.user.name,
      email: req.user.email,
    });
    res.json({ version, bundle: getRequirementBundle(req.params.id) });
  } catch (err) {
    res.status(statusOf(err)).json({
      error: err instanceof Error ? err.message : "这一版没能撤销，当前纸面没变。",
    });
  }
});

registerWorkbenchRoutes(app);

app.get("/v1/projects", (_req, res) => {
  res.json({ projects: listProjects() });
});

app.post("/v1/projects", requireArchitect, (req, res) => {
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

app.patch("/v1/projects/:id", requireArchitect, (req, res) => {
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

app.put("/v1/projects/:id/tech", requireArchitect, (req, res) => {
  if (!getProject(req.params.id)) {
    res.status(404).json({ error: "项目不存在" });
    return;
  }
  writeTechSpec(req.params.id, req.body);
  res.json({ tech: req.body });
});

app.put("/v1/projects/:id/test-plan", requireArchitect, (req, res) => {
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
  const reuse = summarizeClaudeReuse();
  if (config.anthropicCredentialSource === "claude-settings") {
    const base = config.anthropicBaseUrl
      ? `，BASE_URL=${config.anthropicBaseUrl}`
      : "";
    console.log(
      `已从 Claude Code settings 复用凭证（${config.claudeSettingsPath}${base}），将调用 Claude Agent SDK。`
    );
  } else if (config.anthropicCredentialSource === "env") {
    console.log("已检测到 ANTHROPIC_API_KEY / AUTH_TOKEN，将调用 Claude Agent SDK。");
  } else {
    console.log(
      "未检测到 API Key（.env 或 ~/.claude/settings.json），当前为演示模式（mock）。"
    );
  }
  console.log(`Claude Code 配置复用：${reuse}`);
  console.log(
    `登录：${config.webOrigin}（${countUsers() === 0 ? "待创建第一个架构师账号" : "已有账号"}）`
  );
});

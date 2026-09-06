import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { config, workspacesRoot } from "./config.js";
import { getDb } from "./db.js";
import {
  countUsers,
  expireAuthCookieHeaders,
  handleAuthRequest,
  revokeSessionToken,
  signInUser,
  signUpFirstUser,
} from "./auth.js";
import { requireArchitect, requireSession } from "./acl.js";
import { isArchitect } from "./roles.js";
import { scanClaudeKnownProjects } from "./claudeProjects.js";
import {
  scanClaudeConfigInventory,
  summarizeClaudeReuse,
} from "./claudeRuntime.js";
import {
  ensureRequirementsTable,
  getRequirement,
  getRequirementBundle,
  importMarkdownToRequirement,
  setRequirementPhase,
} from "./requirements.js";
import {
  ensureWorkspaceTables,
  getWorkspaceRoot,
  listApprovedCodeDirs,
  refreshClaudeCodeDirs,
  setApprovedCodeDirs,
  setWorkspaceRoot,
} from "./workspaceSettings.js";
import { defaultOpenPath, PRD_FILE } from "./prdPack.js";
import type { DiskProjectPhase } from "./projectMeta.js";
import { browseDir, mkdirUnder } from "./fsBrowse.js";
import { listDocTree, listFolderStatus, readDocFile, writeDocFile } from "./files.js";
import {
  changedFiles,
  isDirty,
  isDirtyFolder,
  listVersions,
  readFileAt,
  restoreFile,
  revertLatestAiCommit,
} from "./gitVault.js";
import { ensureRunTables } from "./workbenchRuns.js";
import { ensureChatSessionTables } from "./chatSessions.js";
import { ensureLockTable, assertWritable } from "./projectLocks.js";
import {
  canWritePath,
  defaultFileForRole,
  folderOfPath,
  parseDocFolder,
  writableFolderOf,
} from "./docFolders.js";
import { recordFolderVersion } from "./folderVersion.js";
import { registerWorkbenchRoutes } from "./workbenchRoutes.js";
import { statusOf, errorBody } from "./httpError.js";
import {
  readSystemPrompt,
  requirePromptWorkspaceRoot,
  resetSystemPrompt,
  writeSystemPrompt,
} from "./systemPrompt.js";
import { ensureUserColumns } from "./data/users.js";
import { ensureAuditTable, writeAudit } from "./data/audit.js";
import { requestLog } from "./http/requestLog.js";
import { registerUserRoutes } from "./http/users.js";
import { registerProjectRoutes } from "./http/projects.js";
import { getUserByEmail } from "./data/users.js";
import { logLine } from "./log/logger.js";

fs.mkdirSync(workspacesRoot(), { recursive: true });
getDb();
ensureRequirementsTable();
ensureWorkspaceTables();
ensureLockTable();
ensureRunTables();
ensureChatSessionTables();
ensureUserColumns();
ensureAuditTable();

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
app.use(requestLog);
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
    res.status(403).json({ error: "已经有账号了，请登录", code: "forbidden" });
    return;
  }
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!name || !email || !password) {
    res.status(400).json({ error: "请填写姓名、登录邮箱和密码", code: "invalid" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "密码至少 8 位", code: "invalid" });
    return;
  }
  try {
    const response = await signUpFirstUser({
      name,
      email,
      password,
      headers: req.headers,
    });
    writeAudit({
      action: "auth.setup",
      result: response.ok ? "ok" : "error",
      requestId: req.requestId,
      detail: { email },
    });
    await pipeAuthResponse(response, res);
  } catch (err) {
    writeAudit({
      action: "auth.setup",
      result: "error",
      requestId: req.requestId,
      detail: { email },
    });
    res.status(400).json(errorBody(err));
  }
});

app.post("/v1/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) {
    res.status(400).json({ error: "请填写登录邮箱和密码", code: "invalid" });
    return;
  }
  const existing = getUserByEmail(email);
  if (existing?.status === "disabled") {
    writeAudit({
      action: "auth.login_fail",
      result: "deny",
      requestId: req.requestId,
      targetId: existing.id,
      detail: { reason: "disabled" },
    });
    res.status(401).json({ error: "账号已停用", code: "unauthenticated" });
    return;
  }
  try {
    const response = await signInUser({ email, password, headers: req.headers });
    if (!response.ok) {
      writeAudit({
        action: "auth.login_fail",
        result: "deny",
        requestId: req.requestId,
        detail: { email },
      });
      const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
      const message =
        body.code === "INVALID_EMAIL_OR_PASSWORD" ? "邮箱或密码不对" : body.message || "登录失败";
      res.status(401).json({ error: message, code: "unauthenticated" });
      return;
    }
    writeAudit({
      actor: existing
        ? { id: existing.id, name: existing.name, email: existing.email, role: existing.role }
        : null,
      action: "auth.login",
      result: "ok",
      requestId: req.requestId,
      targetId: existing?.id,
    });
    await pipeAuthResponse(response, res);
  } catch (err) {
    writeAudit({
      action: "auth.login_fail",
      result: "error",
      requestId: req.requestId,
      detail: { email },
    });
    res.status(401).json(errorBody(err));
  }
});

app.post("/v1/logout", async (req, res) => {
  await revokeSessionToken(req.headers);
  for (const cookie of expireAuthCookieHeaders()) {
    res.append("Set-Cookie", cookie);
  }
  writeAudit({
    actor: req.user
      ? { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role }
      : null,
    action: "auth.logout",
    result: "ok",
    requestId: req.requestId,
  });
  res.status(200).json({ ok: true });
});

registerUserRoutes(app);

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

app.get("/v1/workspace/system-prompt", requireArchitect, (_req, res) => {
  try {
    const root = requirePromptWorkspaceRoot(getWorkspaceRoot());
    res.json(readSystemPrompt(root));
  } catch (err) {
    res.status(statusOf(err)).json({
      error: err instanceof Error ? err.message : "读不了系统提示词",
    });
  }
});

app.put("/v1/workspace/system-prompt", requireArchitect, (req, res) => {
  try {
    const root = requirePromptWorkspaceRoot(getWorkspaceRoot());
    if (typeof req.body?.text !== "string") {
      res.status(400).json({ error: "请提供系统提示词文本。" });
      return;
    }
    res.json(writeSystemPrompt(root, req.body.text));
  } catch (err) {
    res.status(statusOf(err)).json({
      error: err instanceof Error ? err.message : "没法保存系统提示词",
    });
  }
});

app.post("/v1/workspace/system-prompt/reset", requireArchitect, (_req, res) => {
  try {
    const root = requirePromptWorkspaceRoot(getWorkspaceRoot());
    res.json(resetSystemPrompt(root));
  } catch (err) {
    res.status(statusOf(err)).json({
      error: err instanceof Error ? err.message : "没法恢复默认系统提示词",
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


registerProjectRoutes(app);

app.put("/v1/requirements/:id/prd", (req, res) => {
  try {
    assertWritable(
      req.params.id,
      "product",
      req.user!,
      String(req.body?.clientId || "") || undefined
    );
    const content = String(req.body?.content ?? "");
    const file = writeDocFile(req.params.id, PRD_FILE, content);
    res.json({ prd: file.content });
  } catch (err) {
    res.status(statusOf(err, 404)).json(errorBody(err));
  }
});

app.post("/v1/requirements/:id/import", (req, res) => {
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

app.patch("/v1/requirements/:id/phase", (req, res) => {
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
    res.json({ files: listDocTree(req.params.id), folders: listFolderStatus(req.params.id) });
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
      typeof req.query.path === "string"
        ? req.query.path
        : defaultOpenPath(tree, defaultFileForRole(req.user!.role));
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
    const rel = typeof req.query.path === "string" ? req.query.path : PRD_FILE;
    const folder = folderOfPath(rel);
    if (!folder || !canWritePath(req.user!.role, rel)) {
      res.status(403).json({ error: "你不能改这篇。" });
      return;
    }
    assertWritable(
      req.params.id,
      folder,
      req.user!,
      String(req.body?.clientId || req.query.clientId || "") || undefined
    );
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
  const folder = parseDocFolder(req.query.folder, writableFolderOf(req.user!.role));
  res.json({
    versions: listVersions(meta.vaultPath),
    uncommitted: isDirtyFolder(meta.vaultPath, folder),
    changedFiles: changedFiles(meta.vaultPath).filter(
      (f) => f === folder || f.startsWith(`${folder}/`)
    ),
  });
});

app.post("/v1/requirements/:id/versions", (req, res) => {
  const meta = getRequirement(req.params.id);
  if (!meta || !req.user) {
    res.status(404).json({ error: "工程不存在" });
    return;
  }
  try {
    const folder = parseDocFolder(req.body?.folder, writableFolderOf(req.user.role));
    assertWritable(
      req.params.id,
      folder,
      req.user,
      String(req.body?.clientId || "") || undefined
    );
    const custom = String(req.body?.message || "").trim();
    const markCaughtUp = Boolean(req.body?.markCaughtUp);
    const files = changedFiles(meta.vaultPath).filter(
      (f) => f === folder || f.startsWith(`${folder}/`)
    );
    const named =
      files.find((f) => /(^|\/)PRD\.md$/i.test(f)) ||
      files.find((f) => f.endsWith("方案.md") || f.endsWith("测试.md")) ||
      files.find((f) => f.endsWith(".md") && !f.endsWith("meta.md") && !f.endsWith("跟上.md")) ||
      files[0];
    const message =
      custom ||
      (markCaughtUp ? `我：标成已跟上` : `我：保存 ${named ? path.basename(named) : "文档"}`);
    const version = recordFolderVersion({
      vaultPath: meta.vaultPath,
      folder,
      message,
      author: { name: req.user.name, email: req.user.email },
      markCaughtUp,
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
  const rel = typeof req.query.path === "string" ? req.query.path : PRD_FILE;
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
    const rel = typeof req.body?.path === "string" ? req.body.path : PRD_FILE;
    const folder = folderOfPath(rel);
    if (!folder) {
      res.status(403).json({ error: "你不能改这篇。" });
      return;
    }
    assertWritable(
      req.params.id,
      folder,
      req.user!,
      String(req.body?.clientId || "") || undefined
    );
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
    const folder = parseDocFolder(req.body?.folder, writableFolderOf(req.user.role));
    assertWritable(
      req.params.id,
      folder,
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

app.listen(config.port, () => {
  const reuse = summarizeClaudeReuse();
  logLine("agent.start", {
    port: config.port,
    mockMode: !config.anthropicApiKey,
    credentialSource: config.anthropicCredentialSource,
    claudeReuse: reuse,
    needsSetup: countUsers() === 0,
    webOrigin: config.webOrigin,
  });
});

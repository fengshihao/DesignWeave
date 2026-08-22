export type AppRole = "architect" | "designer";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  roleLabel: string;
};

export type ClaudeKnownProject = {
  path: string;
  name: string;
  exists: boolean;
  hasDesignWeave: boolean;
  hasClaudeDir: boolean;
};

export type WorkbenchMode = "clarify" | "coauthor" | "grill" | "feasibility";

export type ProjectLockInfo = {
  holderId: string;
  holderName: string;
  youHold: boolean;
  editing: boolean;
  otherDevice: boolean;
} | null;

export type WorkbenchRun = {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  mode: WorkbenchMode;
  message: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  error: string | null;
};

export type RequirementMeta = {
  id: string;
  title: string;
  summary: string;
  owner?: string;
  source?: "template" | "import";
  phase: "filling" | "imported" | "clarifying" | "ready" | "guide" | "document" | "gaps";
  clarity?: "pending" | "ready";
  clarityLabel?: string;
  createdAt: string;
  updatedAt: string;
  vaultPath: string;
  folderName?: string;
  primaryRepo?: string;
  relatedRepos: string[];
  lock?: ProjectLockInfo;
  activeRun?: WorkbenchRun | null;
};

export type RequirementBundle = {
  requirement: RequirementMeta;
  prd: string;
  gaps: string;
  originalImport: string | null;
  uncommitted?: boolean;
  latestVersion?: {
    id: string;
    message: string;
    author: string;
    createdAt: string;
  } | null;
  lock?: ProjectLockInfo;
  activeRun?: WorkbenchRun | null;
};

export type AuthStatus = {
  needsSetup: boolean;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
  if (res.status === 401) {
    throw new Error("请先登录");
  }
  if (!res.ok) {
    let message = `请求失败（${res.status}）`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  health: () =>
    request<{ ok: boolean; hasApiKey: boolean; mockMode: boolean }>("/health"),

  authStatus: () => request<AuthStatus>("/v1/auth/status"),

  setup: (body: { name: string; email: string; password: string }) =>
    request<{ user?: { id: string } }>("/v1/setup", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  me: () => request<{ user: SessionUser }>("/v1/me"),

  listUsers: () =>
    request<{
      users: Array<SessionUser & { createdAt?: string }>;
    }>("/v1/users"),

  createUser: (body: { name: string; email: string; password: string }) =>
    request<{ user: SessionUser }>("/v1/users", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listClaudeProjects: () =>
    request<{
      source: string;
      found: boolean;
      projects: ClaudeKnownProject[];
      error?: string;
    }>("/v1/claude/projects"),

  claudeConfig: () =>
    request<{
      settingsFound: boolean;
      mcpServerNames: string[];
      skillNames?: string[];
      skills?: Array<{ name: string }>;
      language: string | null;
    }>("/v1/claude/config"),

  workspace: () =>
    request<{
      workspaceRoot?: string | null;
      workspaceRootSet: boolean;
      hasApprovedCodeDirs: boolean;
      approvedCount?: number;
    }>("/v1/workspace"),

  setWorkspaceRoot: (workspaceRoot: string) =>
    request<{ workspaceRoot: string; workspaceRootSet: boolean }>("/v1/workspace", {
      method: "PUT",
      body: JSON.stringify({ workspaceRoot }),
    }),

  listCodeDirs: () =>
    request<{
      source: string;
      found: boolean;
      error?: string;
      dirs: Array<{
        path: string;
        name: string;
        exists: boolean;
        approved: boolean;
        hasClaudeDir: boolean;
      }>;
      newlySeen: string[];
    }>("/v1/workspace/code-dirs"),

  setApprovedCodeDirs: (approved: string[]) =>
    request<{
      dirs: Array<{
        path: string;
        name: string;
        approved: boolean;
        exists: boolean;
        hasClaudeDir: boolean;
      }>;
      hasApprovedCodeDirs: boolean;
    }>("/v1/workspace/code-dirs", {
      method: "PUT",
      body: JSON.stringify({ approved }),
    }),

  listRequirements: () =>
    request<{
      requirements: RequirementMeta[];
      orphans: RequirementMeta[];
      workspaceRootSet: boolean;
      hasApprovedCodeDirs: boolean;
    }>("/v1/requirements"),

  createRequirement: (body: {
    title: string;
    source?: "template" | "import";
    importMarkdown?: string;
  }) =>
    request<{ requirement: RequirementMeta; bundle: RequirementBundle }>(
      "/v1/requirements",
      { method: "POST", body: JSON.stringify(body) }
    ),

  deleteRequirement: (id: string) =>
    request<{ ok: boolean; requirement: RequirementMeta }>(`/v1/requirements/${id}`, {
      method: "DELETE",
    }),

  abandonRequirement: (id: string) =>
    request<{ ok: boolean; requirement: RequirementMeta }>(
      `/v1/requirements/${id}/abandon`,
      { method: "POST" }
    ),

  getRequirement: (id: string, clientId?: string) =>
    request<RequirementBundle>(
      `/v1/requirements/${id}${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`
    ),

  savePrd: (id: string, content: string) =>
    request<{ prd: string }>(`/v1/requirements/${id}/prd`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),

  setPhase: (id: string, phase: RequirementMeta["phase"]) =>
    request<{ requirement: RequirementMeta }>(
      `/v1/requirements/${id}/phase`,
      { method: "PATCH", body: JSON.stringify({ phase }) }
    ),

  importMarkdown: (id: string, markdown: string, clientId?: string) =>
    request<{
      originalImport: string;
      bundle: RequirementBundle;
    }>(`/v1/requirements/${id}/import`, {
      method: "POST",
      body: JSON.stringify({ markdown, clientId }),
    }),

  chat: (
    id: string,
    body: { message: string; mode: "guide" | "gaps" | "normalize" }
  ) =>
    request<{
      reply: string;
      questions: string[];
      prd: string;
      gaps: string;
      mockMode: boolean;
      bundle: RequirementBundle;
    }>(`/v1/requirements/${id}/chat`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  browseFs: (dir?: string) =>
    request<{
      path: string;
      parent: string | null;
      home: string;
      entries: Array<{ name: string; path: string; isDir: boolean }>;
    }>(`/v1/fs/browse${dir ? `?path=${encodeURIComponent(dir)}` : ""}`),

  mkdirFs: (parent: string, name: string) =>
    request<{
      path: string;
      listing: {
        path: string;
        parent: string | null;
        home: string;
        entries: Array<{ name: string; path: string; isDir: boolean }>;
      };
    }>("/v1/fs/mkdir", {
      method: "POST",
      body: JSON.stringify({ parent, name }),
    }),

  listVersions: (id: string) =>
    request<{
      versions: Array<{
        id: string;
        message: string;
        author: string;
        createdAt: string;
      }>;
      uncommitted: boolean;
      changedFiles: string[];
    }>(`/v1/requirements/${id}/versions`),

  recordVersion: (id: string, message?: string, clientId?: string) =>
    request<{
      version: {
        id: string;
        message: string;
        author: string;
        createdAt: string;
      } | null;
      message?: string;
    }>(`/v1/requirements/${id}/versions`, {
      method: "POST",
      body: JSON.stringify({ message, clientId }),
    }),

  readVersionFile: (id: string, sha: string, filePath = "README.md") =>
    request<{ path: string; content: string; version: string }>(
      `/v1/requirements/${id}/versions/${sha}/files?path=${encodeURIComponent(filePath)}`
    ),

  restoreFile: (id: string, sha: string, filePath = "README.md", clientId?: string) =>
    request<{ path: string; content: string; uncommitted: boolean; etag?: string }>(
      `/v1/requirements/${id}/versions/${sha}/restore`,
      { method: "POST", body: JSON.stringify({ path: filePath, clientId }) }
    ),

  revertLatestAi: (id: string, clientId?: string) =>
    request<{ version: { id: string; message: string } }>(
      `/v1/requirements/${id}/versions/revert-latest-ai`,
      { method: "POST", body: JSON.stringify({ clientId }) }
    ),

  listFiles: (id: string) =>
    request<{ files: Array<{ path: string; name: string; isDir: boolean }> }>(
      `/v1/requirements/${id}/tree`
    ),

  readFile: (id: string, filePath: string) =>
    request<{ path: string; content: string; etag: string }>(
      `/v1/requirements/${id}/files?path=${encodeURIComponent(filePath)}`
    ),

  writeFile: (
    id: string,
    filePath: string,
    content: string,
    etag: string,
    clientId?: string
  ) =>
    request<{ path: string; content: string; etag: string }>(
      `/v1/requirements/${id}/files?path=${encodeURIComponent(filePath)}`,
      {
        method: "PUT",
        headers: { "If-Match": etag },
        body: JSON.stringify({ content, clientId }),
      }
    ),

  claimLock: (id: string, clientId: string) =>
    request<{
      youHold: boolean;
      otherDevice: boolean;
      previewReason?: string;
      lock: ProjectLockInfo;
    }>(`/v1/requirements/${id}/lock/claim`, {
      method: "POST",
      body: JSON.stringify({ clientId }),
    }),

  heartbeatLock: (id: string, clientId: string, editing: boolean) =>
    request<{ lock: ProjectLockInfo }>(`/v1/requirements/${id}/lock/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ clientId, editing }),
    }),

  releaseLock: (id: string, clientId: string) =>
    request<{ ok: boolean; lock: ProjectLockInfo }>(
      `/v1/requirements/${id}/lock/release`,
      { method: "POST", body: JSON.stringify({ clientId }) }
    ),

  forceReleaseLock: (id: string) =>
    request<{ ok: boolean }>(`/v1/requirements/${id}/lock/force-release`, {
      method: "POST",
    }),

  startRun: (id: string, body: { mode: WorkbenchMode; message: string; clientId: string }) =>
    request<{ runId: string; run: WorkbenchRun }>(`/v1/requirements/${id}/runs`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  cancelRun: (id: string, runId: string, clientId: string) =>
    request<{ cancelled: boolean }>(
      `/v1/requirements/${id}/runs/${runId}/cancel`,
      { method: "POST", body: JSON.stringify({ clientId }) }
    ),

  currentRun: (id: string) =>
    request<{ run: WorkbenchRun | null }>(`/v1/requirements/${id}/runs/current`),
};

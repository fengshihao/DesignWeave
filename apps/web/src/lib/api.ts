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

export type RequirementMeta = {
  id: string;
  title: string;
  summary: string;
  primaryRepo?: string;
  relatedRepos: string[];
  phase: "guide" | "document" | "gaps";
  createdAt: string;
  updatedAt: string;
  vaultPath: string;
};

export type RequirementBundle = {
  requirement: RequirementMeta;
  prd: string;
  gaps: string;
  originalImport: string | null;
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

  listRequirements: () =>
    request<{ requirements: RequirementMeta[] }>("/v1/requirements"),

  createRequirement: (body: {
    title: string;
    summary?: string;
    primaryRepo?: string;
    relatedRepos?: string[];
    importMarkdown?: string;
  }) =>
    request<{ requirement: RequirementMeta; bundle: RequirementBundle }>(
      "/v1/requirements",
      { method: "POST", body: JSON.stringify(body) }
    ),

  getRequirement: (id: string) =>
    request<RequirementBundle>(`/v1/requirements/${id}`),

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

  importMarkdown: (
    id: string,
    markdown: string,
    mode: "replace" | "append" = "replace"
  ) =>
    request<{
      prd: string;
      originalImport: string;
      bundle: RequirementBundle;
    }>(`/v1/requirements/${id}/import`, {
      method: "POST",
      body: JSON.stringify({ markdown, mode }),
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
};

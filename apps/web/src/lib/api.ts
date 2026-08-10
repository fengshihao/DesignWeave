const AGENT_BASE =
  process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:8787";

function password(): string {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_APP_PASSWORD || "";
  }
  return (
    localStorage.getItem("dw_password") ||
    process.env.NEXT_PUBLIC_APP_PASSWORD ||
    ""
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  const pwd = password();
  if (pwd) headers.set("x-app-password", pwd);

  const res = await fetch(`${AGENT_BASE}${path}`, { ...init, headers });
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
  return (await res.json()) as T;
}

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

export const api = {
  health: () =>
    request<{ ok: boolean; hasApiKey: boolean; mockMode: boolean }>("/health"),

  listClaudeProjects: () =>
    request<{
      source: string;
      found: boolean;
      projects: ClaudeKnownProject[];
      error?: string;
    }>("/v1/claude/projects"),

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

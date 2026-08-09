import type {
  AgentMode,
  AgentRole,
  AgentStructuredResult,
  Issue,
  IssuesFile,
  PrdDocument,
  ProjectMeta,
  TechSpec,
  TestPlan,
  SrDocument,
} from "@designweave/schema";

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

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const pwd = password();
  if (pwd) headers.set("x-app-password", pwd);

  const res = await fetch(`${AGENT_BASE}${path}`, {
    ...init,
    headers,
  });

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

  if (res.headers.get("content-type")?.includes("text/markdown")) {
    return (await res.text()) as T;
  }
  return (await res.json()) as T;
}

export type ProjectBundle = {
  project: ProjectMeta;
  prd: PrdDocument;
  issues: IssuesFile;
  tech: TechSpec;
  srs: SrDocument[];
  testPlan: TestPlan;
};

export const api = {
  health: () =>
    request<{ ok: boolean; hasApiKey: boolean; mockMode: boolean }>(
      "/health"
    ),

  listProjects: () =>
    request<{ projects: ProjectMeta[] }>("/v1/projects"),

  createProject: (body: { name: string; description?: string; idea?: string }) =>
    request<{ project: ProjectMeta; bundle: ProjectBundle }>("/v1/projects", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getProject: (id: string) => request<ProjectBundle>(`/v1/projects/${id}`),

  updateProject: (
    id: string,
    patch: Partial<Pick<ProjectMeta, "name" | "description" | "phase" | "repoPath">>
  ) =>
    request<{ project: ProjectMeta }>(`/v1/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  savePrd: (id: string, prd: PrdDocument) =>
    request<{ prd: PrdDocument }>(`/v1/projects/${id}/prd`, {
      method: "PUT",
      body: JSON.stringify(prd),
    }),

  updateIssue: (
    projectId: string,
    issueId: string,
    patch: Partial<Pick<Issue, "status" | "title" | "description" | "suggestion">>
  ) =>
    request<{ issue: Issue }>(
      `/v1/projects/${projectId}/issues/${issueId}`,
      {
        method: "PATCH",
        body: JSON.stringify(patch),
      }
    ),

  exportPrdUrl: (id: string) => {
    const pwd = password();
    const q = pwd ? `?password=${encodeURIComponent(pwd)}` : "";
    return `${AGENT_BASE}/v1/projects/${id}/export/prd${q}`;
  },

  createSession: (body: {
    projectId: string;
    role: AgentRole;
    mode: AgentMode;
  }) =>
    request<{
      session: {
        id: string;
        projectId: string;
        role: AgentRole;
        mode: AgentMode;
      };
    }>("/v1/sessions", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  applyResult: (
    projectId: string,
    mode: AgentMode,
    result: AgentStructuredResult
  ) =>
    request<{
      prd?: PrdDocument;
      issues?: IssuesFile;
    }>(`/v1/projects/${projectId}/apply-result`, {
      method: "POST",
      body: JSON.stringify({ mode, result }),
    }),

  cancelSession: (sessionId: string) =>
    request<{ cancelled: boolean }>(`/v1/sessions/${sessionId}/cancel`, {
      method: "POST",
      body: "{}",
    }),
};

export type ChatStreamHandlers = {
  onText?: (text: string) => void;
  onTool?: (name: string) => void;
  onResult?: (structured: unknown, text?: string) => void;
  onApplied?: (payload: unknown) => void;
  onError?: (message: string) => void;
  onDone?: (mockMode: boolean) => void;
};

export async function streamMessage(
  sessionId: string,
  body: {
    message: string;
    focusSection?: string;
    autoApply?: boolean;
  },
  handlers: ChatStreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const pwd = password();
  if (pwd) headers["x-app-password"] = pwd;

  const res = await fetch(`${AGENT_BASE}/v1/sessions/${sessionId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `流式请求失败（${res.status}）`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      const lines = chunk.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      const payload = JSON.parse(data) as Record<string, unknown>;
      if (event === "text") handlers.onText?.(String(payload.text || ""));
      if (event === "tool") handlers.onTool?.(String(payload.name || ""));
      if (event === "result") {
        handlers.onResult?.(payload.structured, payload.text as string | undefined);
      }
      if (event === "applied") handlers.onApplied?.(payload);
      if (event === "error") handlers.onError?.(String(payload.message || "错误"));
      if (event === "done") handlers.onDone?.(Boolean(payload.mockMode));
    }
  }
}

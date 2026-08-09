"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AGENT_MODE_LABELS,
  PRD_SECTION_KEYS,
  PRD_SECTION_LABELS,
  PROJECT_PHASE_LABELS,
  type AgentMode,
  type AgentStructuredResult,
  type Issue,
  type PrdDocument,
  type PrdSectionKey,
  type ProjectPhase,
} from "@designweave/schema";
import {
  api,
  streamMessage,
  type ProjectBundle,
} from "@/lib/api";
import { PrdEditor } from "@/components/PrdEditor";
import { ChatPanel } from "@/components/ChatPanel";
import { IssuesPanel } from "@/components/IssuesPanel";

type PhaseTab = ProjectPhase;

const DESIGNER_MODES: AgentMode[] = ["coauthor", "refine", "grill", "consistency"];

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [phase, setPhase] = useState<PhaseTab>("design");
  const [mode, setMode] = useState<AgentMode>("coauthor");
  const [focusSection, setFocusSection] = useState<PrdSectionKey>("problem");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [chatLog, setChatLog] = useState<string>("");
  const [streaming, setStreaming] = useState(false);
  const [pendingResult, setPendingResult] = useState<AgentStructuredResult | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  async function load() {
    setError("");
    try {
      const data = await api.getProject(projectId);
      setBundle(data);
      setPhase(data.project.phase);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }

  useEffect(() => {
    void load();
  }, [projectId]);

  const openIssues = useMemo(
    () => bundle?.issues.issues.filter((i) => i.status === "open") ?? [],
    [bundle]
  );

  async function savePrd(prd: PrdDocument) {
    setSaving(true);
    setError("");
    try {
      const { prd: saved } = await api.savePrd(projectId, prd);
      setBundle((b) => (b ? { ...b, prd: saved } : b));
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function onSend(message: string, autoApply: boolean) {
    if (!bundle) return;
    setStreaming(true);
    setError("");
    setPendingResult(null);
    setChatLog((prev) => `${prev}\n\n你：${message}\n\n助手：`);

    try {
      const { session } = await api.createSession({
        projectId,
        role: "designer",
        mode,
      });
      setSessionId(session.id);

      await streamMessage(
        session.id,
        { message, focusSection, autoApply },
        {
          onText: (text) => setChatLog((prev) => prev + text),
          onTool: (name) => setChatLog((prev) => prev + `\n〔工具 ${name}〕`),
          onResult: (structured) => {
            if (structured && typeof structured === "object") {
              setPendingResult(structured as AgentStructuredResult);
            }
          },
          onApplied: (payload) => {
            const p = payload as {
              prd?: PrdDocument;
              issues?: ProjectBundle["issues"];
            };
            setBundle((b) =>
              b
                ? {
                    ...b,
                    prd: p.prd ?? b.prd,
                    issues: p.issues ?? b.issues,
                  }
                : b
            );
            setChatLog((prev) => prev + "\n\n（已自动写入文档）");
          },
          onError: (message) => {
            setError(message);
            setChatLog((prev) => prev + `\n\n错误：${message}`);
          },
          onDone: (mockMode) => {
            if (mockMode) {
              setChatLog((prev) => prev + "\n\n〔演示模式〕");
            }
          },
        }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "对话失败");
    } finally {
      setStreaming(false);
    }
  }

  async function applyPending() {
    if (!pendingResult) return;
    setSaving(true);
    try {
      const res = await api.applyResult(projectId, mode, pendingResult);
      setBundle((b) =>
        b
          ? {
              ...b,
              prd: res.prd ?? b.prd,
              issues: res.issues ?? b.issues,
            }
          : b
      );
      setPendingResult(null);
      setChatLog((prev) => prev + "\n\n（已采纳到文档）");
    } catch (e) {
      setError(e instanceof Error ? e.message : "采纳失败");
    } finally {
      setSaving(false);
    }
  }

  async function updateIssueStatus(issue: Issue, status: Issue["status"]) {
    try {
      const { issue: updated } = await api.updateIssue(projectId, issue.id, {
        status,
      });
      setBundle((b) => {
        if (!b) return b;
        return {
          ...b,
          issues: {
            issues: b.issues.issues.map((i) =>
              i.id === updated.id ? updated : i
            ),
          },
        };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新问题失败");
    }
  }

  async function switchPhase(next: PhaseTab) {
    setPhase(next);
    try {
      await api.updateProject(projectId, { phase: next });
    } catch {
      /* ignore for skeleton tabs */
    }
  }

  if (!bundle && !error) {
    return (
      <main className="app-shell">
        <p className="muted">加载项目中…</p>
      </main>
    );
  }

  if (!bundle) {
    return (
      <main className="app-shell">
        <p style={{ color: "var(--danger)" }}>{error || "项目不存在"}</p>
        <Link className="btn" href="/">
          返回首页
        </Link>
      </main>
    );
  }

  return (
    <main className="app-shell" style={{ maxWidth: 1600 }}>
      <header className="topbar">
        <div>
          <Link href="/" className="muted" style={{ fontSize: 13 }}>
            ← 全部项目
          </Link>
          <div className="brand" style={{ fontSize: 24, marginTop: 4 }}>
            {bundle.project.name}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {(Object.keys(PROJECT_PHASE_LABELS) as PhaseTab[]).map((key) => (
              <button
                key={key}
                type="button"
                className="btn"
                style={{
                  background: phase === key ? "var(--accent)" : undefined,
                  color: phase === key ? "#fff" : undefined,
                  borderColor: phase === key ? "var(--accent)" : undefined,
                }}
                onClick={() => void switchPhase(key)}
              >
                {PROJECT_PHASE_LABELS[key]}
                {key !== "design" ? "（预留）" : ""}
              </button>
            ))}
            <span className="tag">未决问题 {openIssues.length}</span>
            {saving && <span className="tag warn">保存中…</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn" href={api.exportPrdUrl(projectId)} target="_blank" rel="noreferrer">
            导出 PRD.md
          </a>
          <button className="btn ghost" type="button" onClick={() => void load()}>
            重新加载
          </button>
        </div>
      </header>

      {error && (
        <p style={{ color: "var(--danger)", marginTop: 0 }}>{error}</p>
      )}

      {phase === "design" && (
        <div className="project-grid">
          <div style={{ display: "grid", gap: 16 }}>
            <PrdEditor
              prd={bundle.prd}
              focusSection={focusSection}
              onFocusSection={setFocusSection}
              onChange={(prd) => setBundle({ ...bundle, prd })}
              onSave={() => void savePrd(bundle.prd)}
            />
            <IssuesPanel
              issues={bundle.issues.issues}
              onStatus={updateIssueStatus}
            />
          </div>

          <ChatPanel
            mode={mode}
            modes={DESIGNER_MODES}
            modeLabels={AGENT_MODE_LABELS}
            focusSection={focusSection}
            sections={PRD_SECTION_KEYS.map((k) => ({
              key: k,
              label: PRD_SECTION_LABELS[k],
            }))}
            onModeChange={setMode}
            onFocusChange={(s) => setFocusSection(s as PrdSectionKey)}
            log={chatLog}
            streaming={streaming}
            pendingResult={pendingResult}
            onSend={onSend}
            onApply={applyPending}
            onCancel={() => {
              if (sessionId) void api.cancelSession(sessionId);
            }}
          />
        </div>
      )}

      {phase === "architecture" && (
        <ArchitectureSkeleton
          techOverview={bundle.tech.overview}
          srsCount={bundle.srs.length}
          repoPath={bundle.project.repoPath || ""}
          onSaveRepo={async (repoPath) => {
            const { project } = await api.updateProject(projectId, { repoPath });
            setBundle({ ...bundle, project });
          }}
        />
      )}

      {phase === "qa" && (
        <section className="panel" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>测试阶段（骨架）</h2>
          <p className="muted">
            将基于 SR 生成测试策略、环境与建议用例。当前已预留 `qa/TEST_PLAN.md` 与用例目录。
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: "#fffdf8",
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            {bundle.testPlan.strategy || "（测试策略待生成）"}
          </pre>
        </section>
      )}

    </main>
  );
}

function ArchitectureSkeleton(props: {
  techOverview: string;
  srsCount: number;
  repoPath: string;
  onSaveRepo: (repoPath: string) => Promise<void>;
}) {
  const [repo, setRepo] = useState(props.repoPath);
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>架构阶段（骨架）</h2>
      <p className="muted">
        后续将在此生成技术方案、拆分 SR，并对代码仓做只读可行性分析。
      </p>
      <div className="field" style={{ marginTop: 16, maxWidth: 640 }}>
        <label htmlFor="repo">代码仓本地路径（可行性分析用）</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id="repo"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="/path/to/your/repo"
          />
          <button
            className="btn primary"
            type="button"
            onClick={() => void props.onSaveRepo(repo)}
          >
            保存路径
          </button>
        </div>
      </div>
      <p style={{ marginTop: 16 }}>
        当前 SR 数量：<strong>{props.srsCount}</strong>
      </p>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          background: "#fffdf8",
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: 16,
        }}
      >
        {props.techOverview || "（技术方案概述待生成）"}
      </pre>
    </section>
  );
}

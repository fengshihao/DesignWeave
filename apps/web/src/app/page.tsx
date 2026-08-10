"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  api,
  type ClaudeKnownProject,
  type RequirementMeta,
} from "@/lib/api";

export default function HomePage() {
  const [requirements, setRequirements] = useState<RequirementMeta[]>([]);
  const [repos, setRepos] = useState<ClaudeKnownProject[]>([]);
  const [claudeError, setClaudeError] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [primaryRepo, setPrimaryRepo] = useState("");
  const [related, setRelated] = useState<string[]>([]);
  const [importMd, setImportMd] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<{ mockMode: boolean } | null>(null);
  const [manualPath, setManualPath] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [list, claude, h] = await Promise.all([
        api.listRequirements(),
        api.listClaudeProjects(),
        api.health(),
      ]);
      setRequirements(list.requirements);
      setRepos(claude.projects);
      setClaudeError(claude.error || (!claude.found ? "未找到 Claude 工程列表" : ""));
      setHealth(h);
      if (!primaryRepo && claude.projects[0]) {
        setPrimaryRepo(claude.projects[0].path);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPassword(localStorage.getItem("dw_password") || "");
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleRelated(path: string) {
    setRelated((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const primary = primaryRepo || manualPath.trim() || undefined;
      const { requirement } = await api.createRequirement({
        title,
        summary,
        primaryRepo: primary,
        relatedRepos: related.filter((r) => r !== primary),
        importMarkdown: importMd.trim() || undefined,
      });
      window.location.href = `/requirements/${requirement.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
      setCreating(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">
            Design<span>Weave</span>
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            OEM 内置 App 需求工作台 · 绑定现有工程 · Markdown PRD
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {health && (
            <span className={`tag ${health.mockMode ? "warn" : "ok"}`}>
              {health.mockMode ? "演示模式" : "Claude 已就绪"}
            </span>
          )}
          <button className="btn ghost" type="button" onClick={() => void refresh()}>
            刷新
          </button>
        </div>
      </header>

      <div className="grid-home">
        <section className="panel" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>
            新建需求
          </h2>
          <p className="muted">
            从 Claude 已知工程中选择主仓（文档写入其 .designweave），可再勾选关联仓作上下文。
          </p>

          <form onSubmit={onCreate} style={{ display: "grid", gap: 14, marginTop: 16 }}>
            <div className="field">
              <label>需求标题</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：设置页增加省电智能切换"
              />
            </div>
            <div className="field">
              <label>一句话目标</label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="要解决什么问题、给谁用…"
              />
            </div>

            <div className="field">
              <label>主工程（来自 ~/.claude.json）</label>
              <select
                value={primaryRepo}
                onChange={(e) => setPrimaryRepo(e.target.value)}
              >
                <option value="">（暂不绑定 → inbox）</option>
                {repos.map((r) => (
                  <option key={r.path} value={r.path}>
                    {r.name} — {r.path}
                  </option>
                ))}
              </select>
              {claudeError && (
                <span style={{ color: "var(--warn)", fontSize: 13 }}>{claudeError}</span>
              )}
            </div>

            <div className="field">
              <label>或手动输入主工程路径</label>
              <input
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                placeholder="/path/to/repo"
              />
            </div>

            <div className="field">
              <label>关联工程（可多选，跨仓 feature）</label>
              <div
                style={{
                  maxHeight: 160,
                  overflow: "auto",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: 8,
                }}
              >
                {repos.length === 0 ? (
                  <span className="muted">暂无已知工程</span>
                ) : (
                  repos.map((r) => (
                    <label
                      key={r.path}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        fontSize: 14,
                        padding: "4px 0",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={related.includes(r.path)}
                        disabled={r.path === primaryRepo}
                        onChange={() => toggleRelated(r.path)}
                      />
                      <span>
                        {r.name}
                        {r.hasClaudeDir ? " · .claude" : ""}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="field">
              <label>可选：粘贴已有 Markdown PRD（排版可乱）</label>
              <textarea
                value={importMd}
                onChange={(e) => setImportMd(e.target.value)}
                placeholder="从别处复制的需求文档…"
                style={{ minHeight: 140 }}
              />
            </div>

            {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
            <button className="btn primary" type="submit" disabled={creating}>
              {creating
                ? "创建中…"
                : importMd.trim()
                  ? "导入并开始追问完善"
                  : "开始引导共创"}
            </button>
          </form>

          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <div className="field">
              <label>访问口令</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    localStorage.setItem("dw_password", password);
                    void refresh();
                  }}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="panel" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>
            最近需求
          </h2>
          {loading ? (
            <p className="muted">加载中…</p>
          ) : requirements.length === 0 ? (
            <p className="muted">还没有需求。左侧创建第一个。</p>
          ) : (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "12px 0 0",
                display: "grid",
                gap: 10,
              }}
            >
              {requirements.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/requirements/${r.id}`}
                    className="panel"
                    style={{ display: "block", padding: "14px 16px", boxShadow: "none" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <strong>{r.title}</strong>
                      <span className="tag">
                        {r.phase === "guide"
                          ? "引导"
                          : r.phase === "gaps"
                            ? "追问"
                            : "文档"}
                      </span>
                    </div>
                    <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
                      {r.primaryRepo
                        ? r.primaryRepo.split("/").slice(-2).join("/")
                        : "inbox（未绑定工程）"}
                      {r.relatedRepos.length
                        ? ` · +${r.relatedRepos.length} 关联仓`
                        : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

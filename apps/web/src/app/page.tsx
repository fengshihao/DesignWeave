"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import type { ProjectMeta } from "@designweave/schema";
import { PROJECT_PHASE_LABELS } from "@designweave/schema";
import { api } from "@/lib/api";

export default function HomePage() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [name, setName] = useState("");
  const [idea, setIdea] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<{ mockMode: boolean; hasApiKey: boolean } | null>(null);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [list, h] = await Promise.all([api.listProjects(), api.health()]);
      setProjects(list.projects);
      setHealth(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem("dw_password") || "";
    setPassword(saved);
    void refresh();
  }, []);

  function savePassword() {
    localStorage.setItem("dw_password", password);
    void refresh();
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const { project } = await api.createProject({ name, idea });
      window.location.href = `/projects/${project.id}`;
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
            内部端到端交付工作台 · 中文优先 · 先做好 PRD
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {health && (
            <span className={`tag ${health.mockMode ? "warn" : "ok"}`}>
              {health.mockMode ? "演示模式（未配置 API Key）" : "Claude Agent 已就绪"}
            </span>
          )}
          <button className="btn ghost" type="button" onClick={() => void refresh()}>
            刷新
          </button>
        </div>
      </header>

      <div className="grid-home">
        <section className="panel" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>新建项目</h2>
          <p className="muted">从一句话想法开始，或直接命名后进入结构化 PRD 共创。</p>
          <form onSubmit={onCreate} style={{ display: "grid", gap: 14, marginTop: 16 }}>
            <div className="field">
              <label htmlFor="name">项目名称</label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：门店库存协同"
              />
            </div>
            <div className="field">
              <label htmlFor="idea">一句话想法 / 草稿</label>
              <textarea
                id="idea"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="描述要解决的问题、用户与期望结果……"
              />
            </div>
            {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
            <button className="btn primary" type="submit" disabled={creating}>
              {creating ? "创建中…" : "开始设计 PRD"}
            </button>
          </form>

          <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
            <div className="field">
              <label htmlFor="pwd">访问口令（可选，对应 APP_PASSWORD）</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  id="pwd"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="内网共享口令"
                />
                <button className="btn" type="button" onClick={savePassword}>
                  保存
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="panel" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>项目列表</h2>
          {loading ? (
            <p className="muted">加载中…</p>
          ) : projects.length === 0 ? (
            <p className="muted">还没有项目。右侧创建第一个吧。</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 10 }}>
              {projects.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="panel"
                    style={{
                      display: "block",
                      padding: "14px 16px",
                      boxShadow: "none",
                      transition: "border-color 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <strong>{p.name}</strong>
                      <span className="tag">{PROJECT_PHASE_LABELS[p.phase]}</span>
                    </div>
                    <p className="muted" style={{ margin: "8px 0 0", fontSize: 14 }}>
                      {p.description || "暂无描述"}
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

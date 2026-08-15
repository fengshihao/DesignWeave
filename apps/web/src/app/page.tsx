"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  api,
  type ClaudeKnownProject,
  type RequirementMeta,
  type SessionUser,
} from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { AppHeader } from "@/components/AppHeader";

export default function HomePage() {
  const [boot, setBoot] = useState<"loading" | "setup" | "login" | "ready">(
    "loading"
  );
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState("");

  async function loadSession() {
    setError("");
    try {
      const status = await api.authStatus();
      if (status.needsSetup) {
        setBoot("setup");
        return;
      }
      try {
        const me = await api.me();
        setUser(me.user);
        setBoot("ready");
      } catch {
        setUser(null);
        setBoot("login");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法连接工作台服务");
      setBoot("login");
    }
  }

  useEffect(() => {
    void loadSession();
  }, []);

  if (boot === "loading") {
    return (
      <main className="app-shell">
        <p className="muted">正在打开工作台…</p>
      </main>
    );
  }

  if (boot === "setup") {
    return <SetupForm onDone={() => void loadSession()} error={error} />;
  }

  if (boot === "login" || !user) {
    return <LoginForm onDone={() => void loadSession()} error={error} />;
  }

  return <ProjectHome user={user} />;
}

function SetupForm(props: { onDone: () => void; error: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(props.error);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.setup({ name, email, password });
      props.onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell" style={{ maxWidth: 560 }}>
      <div className="brand" style={{ marginBottom: 8 }}>
        Design<span>Weave</span>
      </div>
      <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 500, marginTop: 0 }}>
        创建第一个架构师账号
      </h1>
      <p className="muted">这台工作台还没有人。创建后，你再给产品经理开账号。</p>
      <form className="panel" style={{ padding: 24, marginTop: 20, display: "grid", gap: 14 }} onSubmit={onSubmit}>
        <div className="field">
          <label>姓名</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>登录邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="architect@local.test"
            required
          />
        </div>
        <div className="field">
          <label>密码（至少 8 位）</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "创建中…" : "成为架构师"}
        </button>
      </form>
    </main>
  );
}

function LoginForm(props: { onDone: () => void; error: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(props.error);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error: signError } = await authClient.signIn.email({
        email,
        password,
      });
      if (signError) {
        setError(signError.message || "登录失败");
        return;
      }
      props.onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell" style={{ maxWidth: 560 }}>
      <div className="brand" style={{ marginBottom: 8 }}>
        Design<span>Weave</span>
      </div>
      <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 500, marginTop: 0 }}>
        登录工作台
      </h1>
      <p className="muted">用架构师给你的账号进入已有工程。</p>
      <form className="panel" style={{ padding: 24, marginTop: 20, display: "grid", gap: 14 }} onSubmit={onSubmit}>
        <div className="field">
          <label>登录邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "登录中…" : "登录"}
        </button>
      </form>
    </main>
  );
}

function ProjectHome(props: { user: SessionUser }) {
  const isArchitect = props.user.role === "architect";
  const [requirements, setRequirements] = useState<RequirementMeta[]>([]);
  const [repos, setRepos] = useState<ClaudeKnownProject[]>([]);
  const [claudeError, setClaudeError] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [primaryRepo, setPrimaryRepo] = useState("");
  const [related, setRelated] = useState<string[]>([]);
  const [importMd, setImportMd] = useState("");
  const [manualPath, setManualPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const list = await api.listRequirements();
      setRequirements(list.requirements);
      if (isArchitect) {
        try {
          const claude = await api.listClaudeProjects();
          setRepos(claude.projects);
          setClaudeError(
            claude.error || (!claude.found ? "未找到 Claude 工程列表" : "")
          );
          if (!primaryRepo && claude.projects[0]) {
            setPrimaryRepo(claude.projects[0].path);
          }
        } catch (e) {
          setClaudeError(e instanceof Error ? e.message : "无法读取代码仓列表");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
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

  const latest = requirements[0];

  return (
    <main className="app-shell">
      <AppHeader user={props.user} title="打开工程，把对照代码的调研托付给 AI" />

      {isArchitect && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <button className="btn primary" type="button" onClick={() => setShowCreate((v) => !v)}>
            新建工程
          </button>
          <Link className="btn" href="/users">
            用户
          </Link>
          <Link className="btn" href="/settings">
            设置
          </Link>
        </div>
      )}

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="grid-home">
        <section className="panel" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>
            {latest ? "继续上次" : "工程"}
          </h2>
          {loading ? (
            <p className="muted">加载中…</p>
          ) : requirements.length === 0 ? (
            <p className="muted">
              {isArchitect
                ? "还没有工程。点「新建工程」选文档目录，再把账号交给产品经理。"
                : "还没有工程。请让架构师在这台工作台里创建一个，并给你账号。"}
            </p>
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
                    <strong>{r.title}</strong>
                    <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
                      {r.primaryRepo
                        ? r.primaryRepo.split("/").slice(-2).join("/")
                        : "尚未挂代码仓"}
                      {r.relatedRepos.length ? ` · +${r.relatedRepos.length} 个代码仓` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {isArchitect && showCreate ? (
          <section className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>
              新建工程
            </h2>
            <p className="muted">
              这一刀仍沿用现有落盘探针。下一刀会改成专有文档仓 Git。
            </p>
            <form onSubmit={onCreate} style={{ display: "grid", gap: 14, marginTop: 16 }}>
              <div className="field">
                <label>工程名称</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：设置页夜间模式"
                  required
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
                <label>代码仓（来自 ~/.claude.json，可跳过）</label>
                <select
                  value={primaryRepo}
                  onChange={(e) => setPrimaryRepo(e.target.value)}
                >
                  <option value="">（暂不绑定）</option>
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
                <label>或手动输入代码仓路径</label>
                <input
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  placeholder="/path/to/repo"
                />
              </div>
              <div className="field">
                <label>关联代码仓</label>
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
                <label>可选：粘贴已有 Markdown</label>
                <textarea
                  value={importMd}
                  onChange={(e) => setImportMd(e.target.value)}
                  placeholder="从别处复制的需求文档…"
                  style={{ minHeight: 140 }}
                />
              </div>
              <button className="btn primary" type="submit" disabled={creating}>
                {creating ? "创建中…" : "创建工程"}
              </button>
            </form>
          </section>
        ) : (
          <section className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>
              {isArchitect ? "环境" : "说明"}
            </h2>
            {isArchitect ? (
              <p className="muted">
                用户、设置、新建工程只在架构师这边。产品经理登录后只能打开已有工程。
              </p>
            ) : (
              <p className="muted">
                打开一个工程即可开始。不能改设置、看不到密钥、不能增删代码仓。
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

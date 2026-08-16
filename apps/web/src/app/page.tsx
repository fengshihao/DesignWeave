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
import { HostFolderPicker } from "@/components/HostFolderPicker";
import { lastProjectId, forgetProject } from "@/lib/remember";

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

function projectStatus(r: RequirementMeta) {
  const bits: string[] = [];
  if (r.primaryRepo) bits.push(r.primaryRepo.split("/").slice(-2).join("/"));
  else bits.push("尚未挂代码仓");
  if (r.relatedRepos.length) bits.push(`+${r.relatedRepos.length} 个代码仓`);
  if (r.activeRun && (r.activeRun.status === "queued" || r.activeRun.status === "running")) {
    bits.push("AI 进行中");
  }
  if (r.lock && !r.lock.youHold) bits.push(`${r.lock.holderName}正在编辑`);
  if (r.lock?.youHold) bits.push("你持有编辑权");
  return bits.join(" · ");
}

function ProjectHome(props: { user: SessionUser }) {
  const isArchitect = props.user.role === "architect";
  const [requirements, setRequirements] = useState<RequirementMeta[]>([]);
  const [repos, setRepos] = useState<ClaudeKnownProject[]>([]);
  const [claudeError, setClaudeError] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [codeRoots, setCodeRoots] = useState<string[]>([]);
  const [importMd, setImportMd] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [docRoot, setDocRoot] = useState("");
  const [step, setStep] = useState(1);
  const [picker, setPicker] = useState<"docs" | "code" | null>(null);
  const [rememberedId, setRememberedId] = useState<string | null>(null);

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
    setRememberedId(lastProjectId());
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleCode(path: string) {
    setCodeRoots((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!docRoot.trim()) {
      setStep(2);
      setError("请先选文档目录。");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const primary = codeRoots[0];
      const { requirement } = await api.createRequirement({
        title,
        summary,
        primaryRepo: primary,
        relatedRepos: codeRoots.slice(1),
        importMarkdown: importMd.trim() || undefined,
        docRoot: docRoot.trim(),
      });
      void remoteUrl;
      window.location.href = `/requirements/${requirement.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
      setCreating(false);
    }
  }

  const continueId = rememberedId && requirements.some((r) => r.id === rememberedId)
    ? rememberedId
    : requirements[0]?.id;
  const continueProject = requirements.find((r) => r.id === continueId);
  const others = requirements.filter((r) => r.id !== continueId);

  async function onDelete(r: RequirementMeta) {
    if (!window.confirm(`要从工作台去掉「${r.title}」吗？`)) return;
    setError("");
    try {
      await api.deleteRequirement(r.id);
      forgetProject(r.id);
      setRememberedId((prev) => (prev === r.id ? null : prev));
      setRequirements((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "没能去掉这个工程");
    }
  }

  return (
    <main className="app-shell home-shell">
      <AppHeader user={props.user} title="打开工程，把对照代码的调研托付给 AI" />

      {isArchitect && (
        <div className="home-tools">
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              setShowCreate((v) => !v);
              setError("");
            }}
          >
            {showCreate ? "收起新建" : "新建工程"}
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

      {isArchitect && showCreate ? (
        <section className="panel wizard">
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>新建工程</h2>
          <p className="muted">
            文档目录必须能当版本库（没有就初始化主线）。代码仓只读。
          </p>
          <div className="wizard-steps">
            {[
              { n: 1, label: "名称" },
              { n: 2, label: "文档目录" },
              { n: 3, label: "代码仓" },
              { n: 4, label: "远端与导入" },
            ].map((s) => (
              <button
                key={s.n}
                type="button"
                className={step === s.n ? "is-current" : step > s.n ? "is-done" : ""}
                onClick={() => setStep(s.n)}
              >
                {s.n} {s.label}
              </button>
            ))}
          </div>
          <form onSubmit={onCreate} style={{ display: "grid", gap: 14 }}>
            {step === 1 ? (
              <>
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
              </>
            ) : null}
            {step === 2 ? (
              <div className="field">
                <label>文档目录（必填，选的是托管机磁盘）</label>
                {docRoot ? (
                  <div className="path-chip">
                    <span>{docRoot}</span>
                    <button className="btn ghost" type="button" onClick={() => setPicker("docs")}>
                      重选
                    </button>
                  </div>
                ) : (
                  <button className="btn" type="button" onClick={() => setPicker("docs")}>
                    选择文档目录
                  </button>
                )}
              </div>
            ) : null}
            {step === 3 ? (
              <div className="field">
                <label>代码仓（只读，可跳过）</label>
                {claudeError ? (
                  <span style={{ color: "var(--warn)", fontSize: 13 }}>{claudeError}</span>
                ) : null}
                <div className="code-pick-list">
                  {repos.map((r) => (
                    <label key={r.path}>
                      <input
                        type="checkbox"
                        checked={codeRoots.includes(r.path)}
                        onChange={() => toggleCode(r.path)}
                      />
                      <span>
                        {r.name}
                        {r.hasClaudeDir ? " · .claude" : ""}
                      </span>
                    </label>
                  ))}
                </div>
                {codeRoots
                  .filter((p) => !repos.some((r) => r.path === p))
                  .map((p) => (
                    <div className="path-chip" key={p}>
                      <span>{p}</span>
                      <button className="btn ghost" type="button" onClick={() => toggleCode(p)}>
                        去掉
                      </button>
                    </div>
                  ))}
                <button className="btn ghost" type="button" onClick={() => setPicker("code")}>
                  另选托管机上的代码仓
                </button>
                {codeRoots[0] ? (
                  <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                    第一个当作主仓：{codeRoots[0]}
                  </p>
                ) : (
                  <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                    可以先不挂。可行性档位要有代码仓才能用。
                  </p>
                )}
              </div>
            ) : null}
            {step === 4 ? (
              <>
                <div className="field">
                  <label>关联远端（第一版先空着）</label>
                  <input
                    value={remoteUrl}
                    onChange={(e) => setRemoteUrl(e.target.value)}
                    placeholder="git@github.com:org/docs.git"
                  />
                  <span className="muted" style={{ fontSize: 13 }}>
                    本机版本先记在文档仓。推远端下一版再接，填了也不会现在推。
                  </span>
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
              </>
            ) : null}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {step > 1 ? (
                <button className="btn ghost" type="button" onClick={() => setStep((n) => n - 1)}>
                  上一步
                </button>
              ) : null}
              {step < 4 ? (
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => {
                    if (step === 1 && !title.trim()) {
                      setError("请先写工程名称。");
                      return;
                    }
                    if (step === 2 && !docRoot.trim()) {
                      setError("请先选文档目录。");
                      return;
                    }
                    setError("");
                    setStep((n) => n + 1);
                  }}
                >
                  下一步
                </button>
              ) : (
                <button className="btn primary" type="submit" disabled={creating}>
                  {creating ? "创建中…" : "创建工程"}
                </button>
              )}
            </div>
          </form>
        </section>
      ) : null}

      {loading ? (
        <p className="muted">加载中…</p>
      ) : !continueProject ? (
        <section className="panel" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>还没有工程</h2>
          <p className="muted">
            {isArchitect
              ? "点「新建工程」，在托管机上选一个文档目录。"
              : "请让架构师在这台工作台里创建一个，并给你账号。"}
          </p>
        </section>
      ) : (
        <>
          <div className="panel continue-card">
            <Link href={`/requirements/${continueProject.id}`}>
              <p className="continue-kicker">继续上次</p>
              <h2>{continueProject.title}</h2>
              <p className="muted" style={{ margin: "0 0 16px" }}>
                {projectStatus(continueProject)}
              </p>
              <span className="btn primary">打开工作台</span>
            </Link>
            {isArchitect ? (
              <button
                className="project-remove"
                type="button"
                onClick={() => void onDelete(continueProject)}
              >
                去掉
              </button>
            ) : null}
          </div>
          {others.length ? (
            <section>
              <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}>其他工程</h3>
              <ul className="project-list">
                {others.map((r) => (
                  <li key={r.id}>
                    <div className="panel project-card">
                      <Link href={`/requirements/${r.id}`}>
                        <strong>{r.title}</strong>
                        <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
                          {projectStatus(r)}
                        </p>
                      </Link>
                      {isArchitect ? (
                        <button
                          className="project-remove"
                          type="button"
                          onClick={() => void onDelete(r)}
                        >
                          去掉
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <HostFolderPicker
        open={picker !== null}
        title={picker === "code" ? "选择代码仓目录" : "选择文档目录"}
        initialPath={picker === "docs" ? docRoot : undefined}
        onClose={() => setPicker(null)}
        onPick={(path) => {
          if (picker === "docs") setDocRoot(path);
          if (picker === "code") {
            setCodeRoots((prev) => (prev.includes(path) ? prev : [...prev, path]));
          }
          setPicker(null);
        }}
      />
    </main>
  );
}

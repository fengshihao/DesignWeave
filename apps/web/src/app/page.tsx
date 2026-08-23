"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { api, type SessionUser } from "@/lib/api";
import { WorkbenchApp } from "@/components/WorkbenchApp";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="auth-screen">
          <p className="muted">正在打开工作台…</p>
        </main>
      }
    >
      <HomeBoot />
    </Suspense>
  );
}

function HomeBoot() {
  const [boot, setBoot] = useState<"loading" | "setup" | "login" | "ready">("loading");
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
      } catch (e) {
        setUser(null);
        setBoot("login");
        if (boot !== "loading") {
          setError(e instanceof Error ? e.message : "登录状态没写上，请再试一次");
        }
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
      <main className="auth-screen">
        <p className="muted">正在打开工作台…</p>
      </main>
    );
  }
  if (boot === "setup") return <SetupForm onDone={() => void loadSession()} error={error} />;
  if (boot === "login" || !user) return <LoginForm onDone={() => void loadSession()} error={error} />;
  return <WorkbenchApp user={user} />;
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
    <main className="auth-screen">
      <div className="brand">
        Design<span>Weave</span>
      </div>
      <h1>创建第一个架构师账号</h1>
      <p className="muted">这台工作台还没有人。创建后，你再给产品经理开账号。</p>
      <form onSubmit={onSubmit}>
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
        {error ? <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
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

  useEffect(() => {
    if (props.error) setError(props.error);
  }, [props.error]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.login({ email, password });
      props.onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="brand">
        Design<span>Weave</span>
      </div>
      <h1>登录工作台</h1>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>登录邮箱</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
        {error ? <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "登录中…" : "登录"}
        </button>
      </form>
    </main>
  );
}

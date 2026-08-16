"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api, type SessionUser } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";

export default function UsersPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<Array<SessionUser & { createdAt?: string }>>(
    []
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{
    name: string;
    email: string;
    password: string;
    origin: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setError("");
    try {
      const me = await api.me();
      if (me.user.role !== "architect") {
        setError("需要架构师权限");
        return;
      }
      setUser(me.user);
      const list = await api.listUsers();
      setUsers(list.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.createUser({ name, email, password });
      setCreated({
        name,
        email,
        password,
        origin: window.location.origin,
      });
      setCopied(false);
      setName("");
      setEmail("");
      setPassword("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <main className="app-shell">
        <p className="muted">{error || "加载中…"}</p>
        {error ? (
          <Link className="btn" href="/" style={{ marginTop: 12, display: "inline-block" }}>
            返回
          </Link>
        ) : null}
      </main>
    );
  }

  return (
    <main className="app-shell" style={{ maxWidth: 720 }}>
      <AppHeader user={user} title="用户" />
      <p>
        <Link href="/" className="muted" style={{ fontSize: 13 }}>
          ← 全部工程
        </Link>
      </p>
      <section className="panel" style={{ padding: 24 }}>
        <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>
          创建产品经理账号
        </h2>
        <p className="muted">创建后把登录邮箱和密码交给对方。第一版不做邀请邮件。</p>
        <form onSubmit={onCreate} style={{ display: "grid", gap: 12, marginTop: 16 }}>
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
              required
            />
          </div>
          <div className="field">
            <label>初始密码（至少 8 位）</label>
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
            {busy ? "创建中…" : "创建账号"}
          </button>
        </form>
        {created ? (
          <div className="created-block">
            <strong>交给对方这一段</strong>
            <pre>{`工作台：${created.origin}
姓名：${created.name}
邮箱：${created.email}
密码：${created.password}`}</pre>
            <button
              className="btn"
              type="button"
              style={{ marginTop: 10 }}
              onClick={() => {
                const text = `工作台：${created.origin}\n姓名：${created.name}\n邮箱：${created.email}\n密码：${created.password}`;
                void navigator.clipboard.writeText(text).then(() => setCopied(true));
              }}
            >
              {copied ? "已复制" : "复制"}
            </button>
          </div>
        ) : null}
      </section>

      <section className="panel" style={{ padding: 24, marginTop: 20 }}>
        <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>已有账号</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {users.map((u) => (
            <li key={u.id} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>
                {u.name} · {u.email}
              </span>
              <span className="tag">{u.roleLabel}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

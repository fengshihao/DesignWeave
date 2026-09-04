"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, type SessionUser } from "@/lib/api";

export function UsersOverlay(props: {
  open: boolean;
  onClose: () => void;
}) {
  const [users, setUsers] = useState<Array<SessionUser & { createdAt?: string }>>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"designer" | "tester">("designer");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{
    name: string;
    email: string;
    password: string;
    origin: string;
    roleLabel: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const list = await api.listUsers();
      setUsers(list.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }

  useEffect(() => {
    if (!props.open) return;
    void load();
  }, [props.open]);

  if (!props.open) return null;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.createUser({ name, email, password, role });
      setCreated({
        name,
        email,
        password,
        origin: window.location.origin,
        roleLabel: role === "tester" ? "测试" : "产品经理",
      });
      setCopied(false);
      setName("");
      setEmail("");
      setPassword("");
      setRole("designer");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay-mask" onClick={props.onClose}>
      <div className="overlay-panel users-panel" onClick={(e) => e.stopPropagation()}>
        <header>
          <strong>用户</strong>
          <button className="btn ghost" type="button" onClick={props.onClose}>
            关闭
          </button>
        </header>
        <form onSubmit={(e) => void onCreate(e)} className="create-form">
          <p className="muted" style={{ margin: 0 }}>
            创建账号后把邮箱和密码交给对方。一人一账号一角色。
          </p>
          <div className="field">
            <label>角色</label>
            <div className="source-switch" role="tablist">
              <button
                type="button"
                className={role === "designer" ? "is-on" : ""}
                onClick={() => setRole("designer")}
              >
                产品经理
              </button>
              <button
                type="button"
                className={role === "tester" ? "is-on" : ""}
                onClick={() => setRole("tester")}
              >
                测试
              </button>
            </div>
          </div>
          <div className="field">
            <label>姓名</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>登录邮箱</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
          {error ? <p className="picker-error">{error}</p> : null}
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "创建中…" : "创建账号"}
          </button>
        </form>
        {created ? (
          <div className="created-block">
            <strong>交给对方这一段</strong>
            <pre>{`工作台：${created.origin}
姓名：${created.name}
角色：${created.roleLabel}
邮箱：${created.email}
密码：${created.password}`}</pre>
            <button
              className="btn"
              type="button"
              onClick={() => {
                const text = `工作台：${created.origin}\n姓名：${created.name}\n角色：${created.roleLabel}\n邮箱：${created.email}\n密码：${created.password}`;
                void navigator.clipboard.writeText(text).then(() => setCopied(true));
              }}
            >
              {copied ? "已复制" : "复制"}
            </button>
          </div>
        ) : null}
        <ul className="user-list">
          {users.map((u) => (
            <li key={u.id}>
              <span>
                {u.name} · {u.email}
              </span>
              <span className="tag">{u.roleLabel}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

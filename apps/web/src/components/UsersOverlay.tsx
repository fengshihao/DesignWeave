"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, type SessionUser } from "@/lib/api";

export function UsersOverlay(props: {
  open: boolean;
  onClose: () => void;
}) {
  const [users, setUsers] = useState<SessionUser[]>([]);
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
      setError("");
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
      const res = await api.createUser({ name, email, password, role });
      setCreated({
        name,
        email,
        password: res.password || password,
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

  async function toggleRole(user: SessionUser) {
    if (user.role === "architect") return;
    setBusy(true);
    setError("");
    try {
      await api.updateUser(user.id, {
        role: user.role === "tester" ? "designer" : "tester",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "改角色失败");
    } finally {
      setBusy(false);
    }
  }

  async function toggleDisabled(user: SessionUser) {
    if (user.role === "architect") return;
    setBusy(true);
    setError("");
    try {
      if (user.status === "disabled") await api.enableUser(user.id);
      else await api.disableUser(user.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(user: SessionUser) {
    const next = window.prompt(`给 ${user.name} 设新密码（至少 8 位）`);
    if (!next) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.resetUserPassword(user.id, next);
      setCreated({
        name: user.name,
        email: user.email,
        password: res.password,
        origin: window.location.origin,
        roleLabel: user.roleLabel,
      });
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "重置失败");
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
            只能有一名架构师。可创建产品经理 / 测试；可改角色、停用、重置密码。
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
            {busy ? "处理中…" : "创建账号"}
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
                {u.status === "disabled" ? " · 已停用" : ""}
              </span>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span className="tag">{u.roleLabel}</span>
                {u.role !== "architect" ? (
                  <>
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleRole(u)}
                    >
                      {u.role === "tester" ? "改成产品" : "改成测试"}
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleDisabled(u)}
                    >
                      {u.status === "disabled" ? "启用" : "停用"}
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={busy}
                      onClick={() => void resetPassword(u)}
                    >
                      重置密码
                    </button>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

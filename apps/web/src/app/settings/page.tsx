"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type SessionUser } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";

export default function SettingsPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<{ mockMode: boolean; hasApiKey: boolean } | null>(
    null
  );
  const [config, setConfig] = useState<{
    settingsFound: boolean;
    mcpServerNames: string[];
    skills?: Array<{ name: string }>;
    language: string | null;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const me = await api.me();
        if (me.user.role !== "architect") {
          setError("需要架构师权限");
          return;
        }
        setUser(me.user);
        const [h, c] = await Promise.all([api.health(), api.claudeConfig()]);
        setHealth(h);
        setConfig(c);
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
      }
    })();
  }, []);

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

  const skills = config?.skills?.map((s) => s.name) ?? [];
  const mcps = config?.mcpServerNames ?? [];

  return (
    <main className="app-shell" style={{ maxWidth: 720 }}>
      <AppHeader user={user} title="设置" />
      <p>
        <Link href="/" className="muted" style={{ fontSize: 13 }}>
          ← 全部工程
        </Link>
      </p>
      <section className="panel judgment">
        <p className="continue-kicker" style={{ marginTop: 0 }}>
          {health?.mockMode ? "还不能找 AI" : "能找 AI"}
        </p>
        <h2>{health?.mockMode ? "演示模式" : "本机 Claude 已就绪"}</h2>
        <p>
          {health?.mockMode
            ? "没有 API Key 时仍能改文档、记版本。要让 AI 真写调研，请在托管机完成本机 Claude 登录。"
            : "已找到本机 Claude。MCP 默认全部打开，产品经理看不见这一页。"}
        </p>
        <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
          语言：{config?.language || "（未写）"} · 配置文件：
          {config?.settingsFound ? "已找到" : "未找到"}
        </p>
      </section>
      <section className="panel" style={{ padding: 24, marginTop: 20 }}>
        <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>MCP / skills</h2>
        <p className="muted">关闭开关下一刀再接到磁盘配置上。现在只读。</p>
        <p>MCP：{mcps.length ? mcps.join("、") : "（无）"}</p>
        <p style={{ marginBottom: 0 }}>
          Skills：{skills.length ? skills.join("、") : "（无）"}
        </p>
      </section>
    </main>
  );
}

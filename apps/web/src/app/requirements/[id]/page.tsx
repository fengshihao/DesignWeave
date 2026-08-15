"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, type RequirementBundle, type SessionUser } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";

type Tab = "guide" | "document" | "gaps";

export default function RequirementPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [bundle, setBundle] = useState<RequirementBundle | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tab, setTab] = useState<Tab>("guide");
  const [prd, setPrd] = useState("");
  const [message, setMessage] = useState("");
  const [log, setLog] = useState("");
  const [importText, setImportText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(true);

  async function load() {
    setError("");
    try {
      const me = await api.me();
      setUser(me.user);
      const data = await api.getRequirement(id);
      setBundle(data);
      setPrd(data.prd);
      setTab(data.requirement.phase === "gaps" ? "gaps" : data.requirement.phase);
      if (data.requirement.phase === "gaps" && !log) {
        setLog("已导入文档。可以开始追问完善，或先到「文档」查看原文。\n");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function switchTab(next: Tab) {
    setTab(next);
    try {
      await api.setPhase(id, next);
    } catch {
      /* ignore */
    }
  }

  async function savePrd() {
    setBusy(true);
    setError("");
    try {
      const { prd: saved } = await api.savePrd(id, prd);
      setPrd(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function onChat(e: FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    setLog((prev) => `${prev}\n\n你：${text}\n\n助手：`);
    try {
      const mode = tab === "document" ? "normalize" : tab === "gaps" ? "gaps" : "guide";
      const res = await api.chat(id, { message: text, mode });
      setLog((prev) => prev + res.reply + (res.mockMode ? "\n〔演示模式〕" : ""));
      setPrd(res.prd);
      setBundle(res.bundle);
    } catch (err) {
      setError(err instanceof Error ? err.message : "对话失败");
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    if (!importText.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.importMarkdown(id, importText, "replace");
      setBundle(res.bundle);
      setPrd(res.prd);
      setImportText("");
      setTab("gaps");
      setLog("已导入 Markdown。请回答追问以完善文档。\n");
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  if (!bundle && !error) {
    return (
      <main className="app-shell">
        <p className="muted">加载需求中…</p>
      </main>
    );
  }

  if (!bundle) {
    return (
      <main className="app-shell">
        <p style={{ color: "var(--danger)" }}>{error}</p>
        <Link className="btn" href="/">
          返回
        </Link>
      </main>
    );
  }

  const r = bundle.requirement;

  return (
    <main className="app-shell" style={{ maxWidth: 1600 }}>
      {user ? <AppHeader user={user} /> : null}
      <header className="topbar">
        <div>
          <Link href="/" className="muted" style={{ fontSize: 13 }}>
            ← 全部工程
          </Link>
          <div className="brand" style={{ fontSize: 22, marginTop: 4 }}>
            {r.title}
          </div>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
            主工程：{r.primaryRepo || "inbox"}
            {r.relatedRepos.length ? ` · 关联 ${r.relatedRepos.length} 个仓` : ""}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {(
              [
                ["guide", "引导共创"],
                ["document", "文档"],
                ["gaps", "追问完善"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="btn"
                style={{
                  background: tab === key ? "var(--accent)" : undefined,
                  color: tab === key ? "#fff" : undefined,
                  borderColor: tab === key ? "var(--accent)" : undefined,
                }}
                onClick={() => void switchTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button className="btn ghost" type="button" onClick={() => void load()}>
          重新加载
        </button>
      </header>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="project-grid">
        <section className="panel" style={{ padding: 16 }}>
          {tab === "document" ? (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 12,
                  gap: 8,
                }}
              >
                <strong>PRD.md</strong>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => setPreview((v) => !v)}
                  >
                    {preview ? "编辑" : "预览"}
                  </button>
                  <button
                    className="btn primary"
                    type="button"
                    disabled={busy}
                    onClick={() => void savePrd()}
                  >
                    保存
                  </button>
                </div>
              </div>
              {preview ? (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    margin: 0,
                    lineHeight: 1.55,
                    fontFamily: "var(--font-body)",
                  }}
                >
                  {prd}
                </pre>
              ) : (
                <textarea
                  value={prd}
                  onChange={(e) => setPrd(e.target.value)}
                  style={{
                    width: "100%",
                    minHeight: 520,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                    lineHeight: 1.5,
                  }}
                />
              )}
              <div style={{ marginTop: 12 }}>
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setMessage("请帮我规整 PRD 章节，保留原意");
                    setTab("document");
                    void (async () => {
                      setBusy(true);
                      try {
                        const res = await api.chat(id, {
                          message: "请帮我规整 PRD 章节，保留原意",
                          mode: "normalize",
                        });
                        setLog((prev) => `${prev}\n\n你：请规整章节\n\n助手：${res.reply}`);
                        setPrd(res.prd);
                        setBundle(res.bundle);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "规整失败");
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  让 AI 规整章节
                </button>
              </div>
            </>
          ) : (
            <>
              <strong>{tab === "guide" ? "引导共创" : "追问完善"}</strong>
              <p className="muted" style={{ fontSize: 14 }}>
                {tab === "guide"
                  ? "每次回答后，AI 会把结论写入 PRD，并继续问 OEM 场景相关问题。"
                  : "基于已导入/现有文档找缺口，逐轮补全。"}
              </p>
              <div
                style={{
                  minHeight: 280,
                  maxHeight: 420,
                  overflow: "auto",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  padding: 12,
                  background: "#fffdf8",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.55,
                  fontSize: 14,
                  marginBottom: 12,
                }}
              >
                {log.trim() ||
                  (tab === "guide"
                    ? "发送「开始」或描述你的功能想法。"
                    : "说明你想优先补哪一块，或直接说「找出文档缺口」。")}
              </div>
              <form onSubmit={onChat} style={{ display: "grid", gap: 10 }}>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="输入回答或想法…"
                  disabled={busy}
                />
                <button className="btn primary" type="submit" disabled={busy}>
                  {busy ? "处理中…" : "发送"}
                </button>
              </form>

              {tab === "gaps" && (
                <div style={{ marginTop: 20 }}>
                  <div className="field">
                    <label>再次导入 Markdown（替换 PRD）</label>
                    <textarea
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder="粘贴外部文档…"
                    />
                  </div>
                  <button
                    className="btn"
                    type="button"
                    style={{ marginTop: 8 }}
                    disabled={busy}
                    onClick={() => void onImport()}
                  >
                    导入并进入追问
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <aside className="panel" style={{ padding: 16 }}>
          <strong>当前 PRD 摘要视图</strong>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 13,
              lineHeight: 1.5,
              maxHeight: 360,
              overflow: "auto",
              background: "#fffdf8",
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: 12,
            }}
          >
            {prd.slice(0, 2500)}
            {prd.length > 2500 ? "\n…（完整内容见「文档」页）" : ""}
          </pre>

          <strong style={{ display: "block", marginTop: 16 }}>缺口清单</strong>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 13,
              lineHeight: 1.5,
              maxHeight: 220,
              overflow: "auto",
              background: "#fffdf8",
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: 12,
            }}
          >
            {bundle.gaps}
          </pre>

          {bundle.originalImport && (
            <>
              <strong style={{ display: "block", marginTop: 16 }}>已备份导入原文</strong>
              <p className="muted" style={{ fontSize: 13 }}>
                见 vault 内 import/original.md
              </p>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}

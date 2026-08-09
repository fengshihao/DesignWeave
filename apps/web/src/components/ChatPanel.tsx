"use client";

import { FormEvent, useState } from "react";
import type { AgentMode, AgentStructuredResult } from "@designweave/schema";

export function ChatPanel(props: {
  mode: AgentMode;
  modes: AgentMode[];
  modeLabels: Record<AgentMode, string>;
  focusSection: string;
  sections: Array<{ key: string; label: string }>;
  onModeChange: (mode: AgentMode) => void;
  onFocusChange: (section: string) => void;
  log: string;
  streaming: boolean;
  pendingResult: AgentStructuredResult | null;
  onSend: (message: string, autoApply: boolean) => Promise<void>;
  onApply: () => Promise<void>;
  onCancel: () => void;
}) {
  const [message, setMessage] = useState("");
  const [autoApply, setAutoApply] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text || props.streaming) return;
    setMessage("");
    await props.onSend(text, autoApply);
  }

  return (
    <aside className="panel" style={{ padding: 0, position: "sticky", top: 16 }}>
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <strong>AI 工作台</strong>
        {props.streaming && (
          <button className="btn ghost" type="button" onClick={props.onCancel}>
            取消
          </button>
        )}
      </div>

      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div className="field">
          <label>模式</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {props.modes.map((m) => (
              <button
                key={m}
                type="button"
                className="btn"
                style={{
                  background: props.mode === m ? "var(--accent)" : undefined,
                  color: props.mode === m ? "#fff" : undefined,
                  borderColor: props.mode === m ? "var(--accent)" : undefined,
                }}
                onClick={() => props.onModeChange(m)}
                disabled={props.streaming}
              >
                {props.modeLabels[m]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>聚焦章节</label>
          <select
            value={props.focusSection}
            onChange={(e) => props.onFocusChange(e.target.value)}
            disabled={props.streaming}
          >
            {props.sections.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            minHeight: 260,
            maxHeight: 360,
            overflow: "auto",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 12,
            background: "#fffdf8",
            whiteSpace: "pre-wrap",
            lineHeight: 1.55,
            fontSize: 14,
          }}
        >
          {props.log.trim() || "在此与 AI 共创、细化或拷问 PRD。未配置 API Key 时走演示模式。"}
        </div>

        {props.pendingResult && (
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: 12,
              background: "var(--accent-soft)",
            }}
          >
            <strong>待采纳结果</strong>
            <p style={{ margin: "8px 0", fontSize: 14 }}>
              {props.pendingResult.summary || "（无摘要）"}
            </p>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              patches {props.pendingResult.patches?.length ?? 0} · questions{" "}
              {props.pendingResult.questions?.length ?? 0} · issues{" "}
              {props.pendingResult.issues?.length ?? 0}
            </p>
            <button
              className="btn primary"
              type="button"
              style={{ marginTop: 10 }}
              onClick={() => void props.onApply()}
            >
              采纳到文档
            </button>
          </div>
        )}

        <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
          <div className="field">
            <label htmlFor="msg">消息</label>
            <textarea
              id="msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                props.mode === "consistency"
                  ? "例如：请对当前 PRD 做全量自洽检查"
                  : props.mode === "grill"
                    ? "例如：请拷问范围与优先级是否冲突"
                    : "描述你的想法，或回答 AI 的问题…"
              }
              disabled={props.streaming}
            />
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input
              type="checkbox"
              checked={autoApply}
              onChange={(e) => setAutoApply(e.target.checked)}
            />
            自动写入文档 / 问题清单
          </label>
          <button className="btn primary" type="submit" disabled={props.streaming}>
            {props.streaming ? "生成中…" : "发送"}
          </button>
        </form>
      </div>
    </aside>
  );
}

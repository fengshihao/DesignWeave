"use client";

import { useEffect, useState } from "react";
import {
  PRD_SECTION_KEYS,
  PRD_SECTION_LABELS,
  type PrdDocument,
  type PrdSectionKey,
} from "@designweave/schema";

export function PrdEditor(props: {
  prd: PrdDocument;
  focusSection: PrdSectionKey;
  onFocusSection: (key: PrdSectionKey) => void;
  onChange: (prd: PrdDocument) => void;
  onSave: () => void;
}) {
  const { prd, focusSection } = props;

  function updateString(
    key: "problem" | "users" | "goals" | "edge_cases" | "nfr",
    value: string
  ) {
    props.onChange({ ...prd, [key]: value });
  }

  return (
    <section className="panel" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 16px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <strong>结构化 PRD</strong>
        <button className="btn primary" type="button" onClick={props.onSave}>
          保存
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "180px 1fr",
          minHeight: 520,
        }}
      >
        <nav style={{ borderRight: "1px solid var(--line)", padding: 10 }}>
          {PRD_SECTION_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => props.onFocusSection(key)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                border: "none",
                background:
                  focusSection === key ? "var(--accent-soft)" : "transparent",
                color: "var(--ink)",
                borderRadius: 8,
                padding: "8px 10px",
                marginBottom: 4,
              }}
            >
              {PRD_SECTION_LABELS[key]}
            </button>
          ))}
        </nav>

        <div style={{ padding: 16 }}>
          {focusSection === "meta" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div className="field">
                <label>名称</label>
                <input
                  value={prd.meta.name}
                  onChange={(e) =>
                    props.onChange({
                      ...prd,
                      meta: { ...prd.meta, name: e.target.value },
                    })
                  }
                />
              </div>
              <div className="field">
                <label>版本</label>
                <input
                  value={prd.meta.version}
                  onChange={(e) =>
                    props.onChange({
                      ...prd,
                      meta: { ...prd.meta, version: e.target.value },
                    })
                  }
                />
              </div>
              <div className="field">
                <label>负责人</label>
                <input
                  value={prd.meta.owner}
                  onChange={(e) =>
                    props.onChange({
                      ...prd,
                      meta: { ...prd.meta, owner: e.target.value },
                    })
                  }
                />
              </div>
              <div className="field">
                <label>状态</label>
                <select
                  value={prd.meta.status}
                  onChange={(e) =>
                    props.onChange({
                      ...prd,
                      meta: {
                        ...prd.meta,
                        status: e.target.value as PrdDocument["meta"]["status"],
                      },
                    })
                  }
                >
                  <option value="draft">草稿</option>
                  <option value="ready">就绪</option>
                  <option value="frozen">已冻结</option>
                </select>
              </div>
              <div className="field">
                <label>摘要</label>
                <textarea
                  value={prd.meta.summary}
                  onChange={(e) =>
                    props.onChange({
                      ...prd,
                      meta: { ...prd.meta, summary: e.target.value },
                    })
                  }
                />
              </div>
            </div>
          )}

          {(focusSection === "problem" ||
            focusSection === "users" ||
            focusSection === "goals" ||
            focusSection === "edge_cases" ||
            focusSection === "nfr") && (
            <div className="field">
              <label>{PRD_SECTION_LABELS[focusSection]}</label>
              <textarea
                style={{ minHeight: 360 }}
                value={prd[focusSection]}
                onChange={(e) => updateString(focusSection, e.target.value)}
                placeholder="在此编辑正文…"
              />
            </div>
          )}

          {focusSection === "scope" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div className="field">
                <label>范围内</label>
                <textarea
                  value={prd.scope.inScope}
                  onChange={(e) =>
                    props.onChange({
                      ...prd,
                      scope: { ...prd.scope, inScope: e.target.value },
                    })
                  }
                />
              </div>
              <div className="field">
                <label>范围外</label>
                <textarea
                  value={prd.scope.outOfScope}
                  onChange={(e) =>
                    props.onChange({
                      ...prd,
                      scope: { ...prd.scope, outOfScope: e.target.value },
                    })
                  }
                />
              </div>
            </div>
          )}

          {focusSection === "journeys" && (
            <JsonSection
              label="用户旅程（JSON 数组）"
              value={prd.journeys}
              onChange={(journeys) => props.onChange({ ...prd, journeys })}
            />
          )}

          {focusSection === "requirements" && (
            <JsonSection
              label="功能需求（JSON 数组）"
              value={prd.requirements}
              onChange={(requirements) =>
                props.onChange({ ...prd, requirements })
              }
            />
          )}

          {focusSection === "open_questions" && (
            <div className="field">
              <label>未决问题（每行一条）</label>
              <textarea
                style={{ minHeight: 280 }}
                value={prd.open_questions.join("\n")}
                onChange={(e) =>
                  props.onChange({
                    ...prd,
                    open_questions: e.target.value
                      .split("\n")
                      .map((l) => l.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          )}

          {focusSection === "changelog" && (
            <JsonSection
              label="修订记录（JSON 数组）"
              value={prd.changelog}
              onChange={(changelog) => props.onChange({ ...prd, changelog })}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function JsonSection<T>(props: {
  label: string;
  value: T;
  onChange: (value: T) => void;
}) {
  const [text, setText] = useState(JSON.stringify(props.value, null, 2));
  const [err, setErr] = useState("");

  useEffect(() => {
    setText(JSON.stringify(props.value, null, 2));
  }, [props.value]);

  return (
    <div className="field">
      <label>{props.label}</label>
      <textarea
        style={{
          minHeight: 360,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            props.onChange(JSON.parse(e.target.value) as T);
            setErr("");
          } catch {
            setErr("JSON 无效，保存前请修正");
          }
        }}
      />
      {err && (
        <span style={{ color: "var(--danger)", fontSize: 13 }}>{err}</span>
      )}
    </div>
  );
}

"use client";

import {
  ISSUE_SEVERITY_LABELS,
  ISSUE_STATUS_LABELS,
  PRD_SECTION_LABELS,
  type Issue,
  type PrdSectionKey,
} from "@designweave/schema";

export function IssuesPanel(props: {
  issues: Issue[];
  onStatus: (issue: Issue, status: Issue["status"]) => void;
}) {
  return (
    <section className="panel" style={{ padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 12,
        }}
      >
        <strong>问题清单</strong>
        <span className="muted" style={{ fontSize: 13 }}>
          拷问与自洽检查产生的可追踪问题
        </span>
      </div>

      {props.issues.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          暂无问题。可在「拷问」或「自洽检查」模式中生成。
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {props.issues.map((issue) => (
            <li
              key={issue.id}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: 12,
                background: "#fffdf8",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <strong>
                  {issue.id} · {issue.title}
                </strong>
                <div style={{ display: "flex", gap: 6 }}>
                  <span
                    className={`tag ${
                      issue.severity === "critical"
                        ? "danger"
                        : issue.severity === "major"
                          ? "warn"
                          : ""
                    }`}
                  >
                    {ISSUE_SEVERITY_LABELS[issue.severity]}
                  </span>
                  <span className="tag">
                    {ISSUE_STATUS_LABELS[issue.status]}
                  </span>
                </div>
              </div>
              <p style={{ margin: "8px 0", fontSize: 14 }}>
                {issue.description || "（无描述）"}
              </p>
              {issue.section && (
                <p className="muted" style={{ margin: "0 0 8px", fontSize: 13 }}>
                  章节：
                  {PRD_SECTION_LABELS[issue.section as PrdSectionKey] ||
                    issue.section}
                </p>
              )}
              {issue.suggestion && (
                <p style={{ margin: "0 0 10px", fontSize: 14 }}>
                  建议：{issue.suggestion}
                </p>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                {issue.status !== "resolved" && (
                  <button
                    className="btn"
                    type="button"
                    onClick={() => props.onStatus(issue, "resolved")}
                  >
                    标为已回应
                  </button>
                )}
                {issue.status !== "dismissed" && (
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => props.onStatus(issue, "dismissed")}
                  >
                    否决
                  </button>
                )}
                {issue.status !== "open" && (
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => props.onStatus(issue, "open")}
                  >
                    重开
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

"use client";

import type { RequirementMeta } from "@/lib/api";

export function SwitchProjectPanel(props: {
  open: boolean;
  projects: RequirementMeta[];
  currentId: string;
  canCreate?: boolean;
  onClose: () => void;
  onSwitch: (id: string) => void;
  onCreate: () => void;
}) {
  if (!props.open) return null;

  return (
    <div className="overlay-mask" onClick={props.onClose}>
      <div className="overlay-panel switch-panel" onClick={(e) => e.stopPropagation()}>
        <header>
          <strong>切换工程</strong>
          <button className="btn ghost" type="button" onClick={props.onClose}>
            关闭
          </button>
        </header>
        {props.projects.length ? (
          <ul className="switch-list">
            {props.projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={p.id === props.currentId ? "is-current" : ""}
                  onClick={() => props.onSwitch(p.id)}
                >
                  {p.title}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            还没有工程。
          </p>
        )}
        {props.canCreate !== false ? (
          <div className="switch-actions">
            <button className="btn ghost" type="button" onClick={props.onCreate}>
              新建工程
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

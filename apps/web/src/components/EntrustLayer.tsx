"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, useRef } from "react";
import type { WorkbenchMode, WorkbenchRun } from "@/lib/api";
import type { EntrustSize } from "@/lib/remember";

export type LogItem = { seq: number; kind: string; text: string };

const MODES: Array<{ id: WorkbenchMode; label: string; hint: string }> = [
  { id: "coauthor", label: "共创", hint: "把想法写进 PRD，每次只问几件关键的事。" },
  { id: "grill", label: "拷问", hint: "找矛盾、缺口、拍不板的假设，写进缺口清单。" },
  { id: "feasibility", label: "可行性", hint: "只读代码仓，把结论写进调研.md。" },
];

function groupTurns(log: LogItem[]) {
  const turns: Array<{ you?: string; items: LogItem[] }> = [];
  let current: { you?: string; items: LogItem[] } = { items: [] };
  for (const item of log) {
    if (item.kind === "trust") continue;
    if (item.kind === "you") {
      if (current.you || current.items.length) turns.push(current);
      current = { you: item.text, items: [] };
    } else {
      current.items.push(item);
    }
  }
  if (current.you || current.items.length) turns.push(current);
  return turns;
}

const SIZE_LABEL: Record<EntrustSize, string> = {
  collapsed: "收起",
  half: "半幅",
  full: "铺满",
};

function nextSize(size: EntrustSize): EntrustSize {
  if (size === "collapsed") return "half";
  if (size === "half") return "full";
  return "collapsed";
}

export function EntrustLayer(props: {
  size: EntrustSize;
  width: number;
  onSizeChange: (size: EntrustSize) => void;
  onWidthChange: (width: number) => void;
  mode: WorkbenchMode;
  onModeChange: (mode: WorkbenchMode) => void;
  hasCode: boolean;
  trust: string;
  log: LogItem[];
  message: string;
  onMessageChange: (value: string) => void;
  onSend: (e: FormEvent) => void;
  onCancel: () => void;
  youHold: boolean;
  aiRunning: boolean;
  busy: boolean;
  activeRun: WorkbenchRun | null;
}) {
  const overlayRef = useRef<HTMLElement>(null);
  const turns = groupTurns(props.log);
  const hint = MODES.find((m) => m.id === props.mode)?.hint || "";
  const floating = props.size !== "collapsed";

  function onResizeStart(e: ReactPointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = props.width;
    const parentW = overlayRef.current?.parentElement?.clientWidth || 800;
    function move(ev: PointerEvent) {
      const next = Math.min(parentW * 0.92, Math.max(280, startW + (startX - ev.clientX)));
      props.onWidthChange(next);
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <aside
      ref={overlayRef}
      className={`entrust is-${props.size}`}
      style={floating ? { width: props.width } : undefined}
    >
      {floating ? (
        <div className="entrust-resize" onPointerDown={onResizeStart} aria-label="拖动调整宽度" />
      ) : null}
      <div className={floating ? "entrust-head" : "entrust-bar"}>
        <div className="mode-switch" role="tablist">
          {MODES.map((m) => {
            const locked = m.id === "feasibility" && !props.hasCode;
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={props.mode === m.id}
                disabled={locked}
                title={locked ? "还没有挂代码仓，可行性不能用。" : m.hint}
                onClick={() => props.onModeChange(m.id)}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <button
          className="btn ghost"
          type="button"
          onClick={() => props.onSizeChange(nextSize(props.size))}
        >
          {SIZE_LABEL[nextSize(props.size)]}
        </button>
      </div>
      {floating ? (
        <>
          <p className="trust-bar" style={{ margin: "10px 12px 0" }}>
            {props.trust}
          </p>
          <p className="muted" style={{ fontSize: 13, margin: "6px 14px 0" }}>
            {hint}
            {props.mode === "feasibility" && !props.hasCode ? " 请让架构师先挂只读代码仓。" : ""}
          </p>
          <div className="entrust-body">
            {turns.length === 0 ? (
              <p className="muted">把任务写在下面。关浏览器不会取消；取消请点按钮。</p>
            ) : (
              turns.map((turn, i) => (
                <div className="turn" key={`${turn.you || "t"}-${i}`}>
                  {turn.you ? <div className="turn-you">{turn.you}</div> : null}
                  {turn.items.map((item, j) => (
                    <p key={`${item.seq}-${j}`} className={`log-${item.kind}`}>
                      {item.text}
                    </p>
                  ))}
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <p className="muted" style={{ margin: "0 12px 6px", fontSize: 12 }}>
          {props.aiRunning ? props.trust : hint}
        </p>
      )}
      {props.youHold ? (
        <form onSubmit={props.onSend} className="entrust-composer">
          <textarea
            value={props.message}
            onChange={(e) => props.onMessageChange(e.target.value)}
            placeholder="用中文托付这一轮…"
            disabled={props.aiRunning || props.busy}
            rows={floating ? 3 : 1}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" type="submit" disabled={props.aiRunning || props.busy}>
              {props.aiRunning ? "进行中…" : "发送"}
            </button>
            {props.aiRunning && props.activeRun ? (
              <button className="btn" type="button" onClick={props.onCancel}>
                取消这一轮
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="muted" style={{ margin: "8px 12px 12px", fontSize: 13 }}>
          预览中。你能看进度，不能发送或取消。
        </p>
      )}
    </aside>
  );
}

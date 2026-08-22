"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useRef } from "react";
import type { WorkbenchMode, WorkbenchRun } from "@/lib/api";
import type { EntrustSize } from "@/lib/remember";

export type LogItem = { seq: number; kind: string; text: string };

const MODES: Array<{ id: WorkbenchMode; label: string }> = [
  { id: "clarify", label: "检查清晰度" },
  { id: "coauthor", label: "共创" },
  { id: "grill", label: "拷问" },
  { id: "feasibility", label: "可行性" },
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
  allowedModes?: WorkbenchMode[];
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
  const dragRef = useRef<{ pointerId: number; startX: number; startW: number } | null>(null);
  const turns = groupTurns(props.log);
  const floating = props.size !== "collapsed";

  useEffect(() => {
    return () => {
      document.body.classList.remove("is-col-resizing");
    };
  }, []);

  function endResize(el: HTMLDivElement, pointerId: number) {
    if (el.hasPointerCapture(pointerId)) {
      el.releasePointerCapture(pointerId);
    }
    dragRef.current = null;
    overlayRef.current?.classList.remove("is-resizing");
    document.body.classList.remove("is-col-resizing");
  }

  function onResizeStart(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startW: overlayRef.current?.offsetWidth || props.width,
    };
    overlayRef.current?.classList.add("is-resizing");
    document.body.classList.add("is-col-resizing");
  }

  function onResizeMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const parentW = overlayRef.current?.parentElement?.clientWidth || 800;
    const next = Math.min(parentW * 0.92, Math.max(280, drag.startW + (drag.startX - e.clientX)));
    props.onWidthChange(next);
  }

  function onResizeEnd(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    endResize(e.currentTarget, e.pointerId);
  }

  return (
    <aside
      ref={overlayRef}
      className={`entrust is-${props.size}`}
      style={floating ? { width: props.width } : undefined}
    >
      {floating ? (
        <div
          className="entrust-resize"
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
          role="separator"
          aria-orientation="vertical"
          aria-label="拖动调整宽度"
          title="拖动调整宽度"
        />
      ) : null}
      <div className={floating ? "entrust-head" : "entrust-bar"}>
        {floating ? (
          <div className="mode-switch" role="tablist">
            {MODES.map((m) => {
              const allowed = props.allowedModes
                ? props.allowedModes.includes(m.id)
                : m.id === "feasibility"
                  ? props.hasCode
                  : true;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={props.mode === m.id}
                  disabled={!allowed}
                  onClick={() => props.onModeChange(m.id)}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>
            {MODES.find((m) => m.id === props.mode)?.label || "托付"}
          </span>
        )}
        <button
          className="btn ghost"
          type="button"
          onClick={() => props.onSizeChange(nextSize(props.size))}
        >
          {SIZE_LABEL[nextSize(props.size)]}
        </button>
      </div>
      {floating ? (
        <div className="entrust-body">
          {turns.map((turn, i) => (
            <div className="turn" key={`${turn.you || "t"}-${i}`}>
              {turn.you ? <div className="turn-you">{turn.you}</div> : null}
              {turn.items.map((item, j) => (
                <p key={`${item.seq}-${j}`} className={`log-${item.kind}`}>
                  {item.text}
                </p>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {props.youHold ? (
        <form onSubmit={props.onSend} className="entrust-composer">
          <textarea
            value={props.message}
            onChange={(e) => props.onMessageChange(e.target.value)}
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
      ) : null}
    </aside>
  );
}

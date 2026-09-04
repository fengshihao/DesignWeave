"use client";

import {
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { formatFocusChip, type ChatBlock, type ChatTurn } from "@designweave/molan-protocol";
import type { WorkbenchRun } from "@/lib/api";
import type { EntrustSize } from "@/lib/remember";

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

function toolLabel(name: string): string {
  if (name === "Write" || name === "Edit") return "写文档";
  if (name === "Read") return "读文件";
  if (name === "Glob") return "找文件";
  if (name === "Grep") return "搜索";
  return name;
}

function IconSend() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path
        d="M10 3.5 10 16.5 M10 3.5 5.5 8.2 M10 3.5 14.5 8.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconStop() {
  return (
    <svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true">
      <rect x="5" y="5" width="10" height="10" rx="1.6" fill="currentColor" />
    </svg>
  );
}

export function EntrustLayer(props: {
  size: EntrustSize;
  width: number;
  onSizeChange: (size: EntrustSize) => void;
  onWidthChange: (width: number) => void;
  turns: ChatTurn[];
  message: string;
  onMessageChange: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
  onOpenFile?: (path: string) => void;
  youHold: boolean;
  aiRunning: boolean;
  busy: boolean;
  activeRun: WorkbenchRun | null;
  focus?: { headingPath: string[]; quote: string; before?: string; after?: string } | null;
  onClearFocus?: () => void;
}) {
  const overlayRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickRef = useRef(true);
  const dragRef = useRef<{ pointerId: number; startX: number; startW: number } | null>(null);
  const [showJump, setShowJump] = useState(false);
  const floating = props.size !== "collapsed";
  const placeholder = "说一句，AI 改文档…";
  const canSend = Boolean(props.message.trim()) && !props.aiRunning && !props.busy;
  const focusChip = props.focus?.quote ? formatFocusChip(props.focus) : "";

  useEffect(() => {
    return () => {
      document.body.classList.remove("is-col-resizing");
    };
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
    setShowJump(false);
  }, [props.turns, props.aiRunning]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = floating ? 160 : 36;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [props.message, floating]);

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

  function onBodyScroll() {
    const el = bodyRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    stickRef.current = nearBottom;
    setShowJump(!nearBottom);
  }

  function jumpToLatest() {
    const el = bodyRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTop = el.scrollHeight;
    setShowJump(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (!canSend) return;
    props.onSend();
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
        <span className="entrust-title">托付</span>
        <button
          className="btn ghost"
          type="button"
          onClick={() => props.onSizeChange(nextSize(props.size))}
        >
          {SIZE_LABEL[nextSize(props.size)]}
        </button>
      </div>
      {floating ? (
        <div className="entrust-stream">
          <div className="entrust-body" ref={bodyRef} onScroll={onBodyScroll}>
            {props.turns.length === 0 ? (
              <div className="entrust-empty">
                <p>托付给 AI 写文档。</p>
                <p className="muted">先说这一轮要改什么。它会写回纸面，而不是只停在对话里。</p>
              </div>
            ) : (
              props.turns.map((turn) => <TurnBubble key={turn.runId} turn={turn} onOpenFile={props.onOpenFile} />)
            )}
            {props.aiRunning ? (
              <div className="entrust-typing" aria-live="polite">
                <span />
                <span />
                <span />
              </div>
            ) : null}
          </div>
          {showJump ? (
            <button className="entrust-jump" type="button" onClick={jumpToLatest}>
              回到最新
            </button>
          ) : null}
        </div>
      ) : null}
      {props.youHold || props.aiRunning ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSend) return;
            props.onSend();
          }}
          className="entrust-composer"
        >
          <div className="sender">
            {focusChip ? (
              <div className="focus-chip" title={props.focus?.quote}>
                <span className="focus-chip-text">{focusChip}</span>
                <button
                  className="focus-chip-x"
                  type="button"
                  aria-label="清除选区"
                  title="清除选区"
                  onClick={() => props.onClearFocus?.()}
                >
                  ×
                </button>
              </div>
            ) : null}
            <textarea
              ref={inputRef}
              value={props.message}
              onChange={(e) => props.onMessageChange(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={props.aiRunning || props.busy}
              rows={floating ? 2 : 1}
              aria-label={placeholder}
              placeholder={placeholder}
            />
            <div className="sender-bar">
              {floating ? (
                <span className="sender-hint">Enter 发送 · Shift+Enter 换行</span>
              ) : (
                <span className="sender-hint">Enter 发送</span>
              )}
              {props.aiRunning && props.activeRun ? (
                <button
                  className="sender-btn is-stop"
                  type="button"
                  onClick={props.onCancel}
                  aria-label="停止这一轮"
                  title="停止这一轮"
                >
                  <IconStop />
                </button>
              ) : (
                <button
                  className="sender-btn"
                  type="submit"
                  disabled={!canSend}
                  aria-label="发送"
                  title="发送"
                >
                  <IconSend />
                </button>
              )}
            </div>
          </div>
        </form>
      ) : null}
    </aside>
  );
}

function isBusyHint(text: string): boolean {
  return /^正在(读文件|写文档仓|用 )/.test(text);
}

function TurnBubble(props: { turn: ChatTurn; onOpenFile?: (path: string) => void }) {
  const { turn } = props;
  const chip = turn.focus?.quote ? formatFocusChip(turn.focus) : "";
  return (
    <article className="turn">
      {turn.you ? (
        <div className="bubble-you-wrap">
          {chip ? (
            <div className="focus-chip is-readonly" title={turn.focus?.quote}>
              <span className="focus-chip-text">{chip}</span>
            </div>
          ) : null}
          <div className="bubble bubble-you">{turn.you}</div>
        </div>
      ) : null}
      <div className="bubble-ai">{renderTurnBlocks(turn.blocks, props.onOpenFile)}</div>
    </article>
  );
}

function renderTurnBlocks(blocks: ChatBlock[], onOpenFile?: (path: string) => void) {
  const nodes: ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.kind === "hint" && isBusyHint(block.text)) {
      i += 1;
      continue;
    }
    if (block.kind === "tool" || block.kind === "file") {
      const group: ChatBlock[] = [];
      while (i < blocks.length && (blocks[i].kind === "tool" || blocks[i].kind === "file")) {
        group.push(blocks[i]);
        i += 1;
      }
      nodes.push(<ToolTrace key={group[0].id} items={group} onOpenFile={onOpenFile} />);
      continue;
    }
    if (block.kind === "trust") {
      nodes.push(
        <p key={block.id} className="log-trust">
          {block.text}
        </p>
      );
    } else if (block.kind === "hint") {
      nodes.push(
        <p key={block.id} className="log-hint">
          {block.text}
        </p>
      );
    } else if (block.kind === "text") {
      nodes.push(
        <div key={block.id} className="log-text">
          {block.text}
        </div>
      );
    } else if (block.kind === "error") {
      nodes.push(
        <p key={block.id} className="log-error">
          {block.text}
        </p>
      );
    } else if (block.kind === "status") {
      nodes.push(
        <p key={block.id} className={`log-status is-${block.result || "success"}`}>
          {block.text}
        </p>
      );
    }
    i += 1;
  }
  return nodes;
}

function ToolTrace(props: { items: ChatBlock[]; onOpenFile?: (path: string) => void }) {
  return (
    <ul className="tool-trace">
      {props.items.map((block) => {
        if (block.kind === "tool") {
          const target = block.detail || "";
          return (
            <li key={block.id}>
              <span className="tool-verb">{toolLabel(block.name)}</span>
              {block.path ? (
                <button
                  type="button"
                  className="tool-target is-link"
                  title={target}
                  onClick={() => props.onOpenFile?.(block.path!)}
                >
                  {target}
                </button>
              ) : target ? (
                <span className="tool-target" title={target}>
                  {target}
                </span>
              ) : null}
            </li>
          );
        }
        if (block.kind === "file") {
          return (
            <li key={block.id}>
              <span className="tool-verb">写回</span>
              <button
                type="button"
                className="tool-target is-link"
                title={block.path}
                onClick={() => props.onOpenFile?.(block.path)}
              >
                {block.path}
              </button>
            </li>
          );
        }
        return null;
      })}
    </ul>
  );
}

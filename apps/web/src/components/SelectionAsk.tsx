"use client";

import { KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatFocusPath } from "@designweave/molan-protocol";

export type SelectionAskFocus = {
  headingPath: string[];
  quote: string;
  before?: string;
  after?: string;
  rect?: { top: number; left: number; bottom: number; right: number } | null;
};

export function SelectionAsk(props: {
  focus: SelectionAskFocus | null;
  message: string;
  onMessageChange: (value: string) => void;
  onSend: () => void;
  onClear: () => void;
  onExpandSection?: () => void;
  onAskAuthor?: () => void;
  authorActionLabel?: string;
  disabled?: boolean;
  canSend?: boolean;
  hint?: string;
  placeholder?: string;
}) {
  const boxRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const onClearRef = useRef(props.onClear);
  onClearRef.current = props.onClear;
  const [pos, setPos] = useState({ top: 80, left: 24 });
  const quote = (props.focus?.quote || "").replace(/\s+/g, " ").trim();
  const path = quote ? formatFocusPath(props.focus?.headingPath || []) : "";
  const pathParts = (props.focus?.headingPath || []).map((p) => p.trim()).filter(Boolean);
  const section = pathParts[pathParts.length - 1] || "本节";
  const authorMode = Boolean(props.onAskAuthor);

  useLayoutEffect(() => {
    const rect = props.focus?.rect;
    const box = boxRef.current;
    if (!rect || !box) return;
    const width = box.offsetWidth || 360;
    const height = box.offsetHeight || 132;
    const gap = 10;
    const pad = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const visibleTop = Math.min(Math.max(rect.top, pad), vh - pad);
    const visibleBottom = Math.min(Math.max(rect.bottom, pad), vh - 72);
    let top = visibleBottom + gap;
    if (top + height > vh - pad) top = visibleTop - height - gap;
    if (top < pad) top = Math.max(pad, Math.min(visibleBottom + gap, vh - height - pad));
    let left = rect.left;
    if (left + width > vw - pad) left = vw - width - pad;
    if (left < pad) left = pad;
    setPos({ top, left });
  }, [props.focus, props.message, authorMode]);

  useEffect(() => {
    if (!quote) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [quote]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [props.message]);

  useEffect(() => {
    if (!quote) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClearRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quote]);

  if (!quote || !props.focus) return null;

  return (
    <form
      ref={boxRef}
      className="selection-ask"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        if (!props.canSend) return;
        props.onSend();
      }}
    >
      <div className="selection-ask-chip">
        <div className="selection-ask-head">
          <span className="selection-ask-path">{path}</span>
          {props.onExpandSection ? (
            <button
              className="selection-ask-expand"
              type="button"
              title={`扩到「${section}」：该标题到下一同级之前`}
              onClick={props.onExpandSection}
            >
              扩到本节
            </button>
          ) : null}
          <button
            className="focus-chip-x"
            type="button"
            aria-label="清除选区"
            title="清除选区"
            onClick={props.onClear}
          >
            ×
          </button>
        </div>
        <p className="selection-ask-quote">{quote}</p>
      </div>
      <textarea
        ref={inputRef}
        value={props.message}
        onChange={(e) => props.onMessageChange(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
          if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
          e.preventDefault();
          if (!props.canSend) return;
          props.onSend();
        }}
        disabled={props.disabled}
        rows={2}
        aria-label={props.placeholder || "对这块说一句"}
        placeholder={props.placeholder || "对这块说一句，回车发给 AI…"}
      />
      {authorMode ? (
        <div className="selection-ask-actions">
          <button className="btn primary" type="submit" disabled={!props.canSend}>
            问 AI
          </button>
          <button
            className="btn ghost"
            type="button"
            disabled={!props.canSend}
            onClick={() => props.onAskAuthor?.()}
          >
            {props.authorActionLabel || "向作者提一个问题"}
          </button>
        </div>
      ) : null}
      {props.hint ? <p className="selection-ask-hint">{props.hint}</p> : null}
    </form>
  );
}

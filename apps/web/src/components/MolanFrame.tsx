"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export type MolanState = {
  value: string;
  dirty: boolean;
  isPreview: boolean;
};

export type MolanHandle = {
  getState: () => Promise<MolanState>;
  markSaved: () => void;
  exitEdit: () => void;
};

type HostToFrame =
  | {
      type: "init" | "setContent";
      value: string;
      fileName: string;
      readOnly: boolean;
      dirty?: boolean;
    }
  | { type: "setReadOnly"; readOnly: boolean }
  | { type: "saved" }
  | { type: "getState"; requestId: number }
  | { type: "exitEdit" };

export const MolanFrame = forwardRef<
  MolanHandle,
  {
    fileName: string;
    content: string;
    etag: string;
    readOnly: boolean;
    onSave: (value: string) => void;
    onDirtyChange: (dirty: boolean) => void;
    onEditingChange: (editing: boolean) => void;
    onBlockedEdit?: () => void;
    onOpenRelative?: (path: string) => void;
  }
>(function MolanFrame(props, ref) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const pending = useRef(new Map<number, (state: MolanState) => void>());
  const reqId = useRef(1);
  const propsRef = useRef(props);
  propsRef.current = props;

  const post = useCallback((msg: HostToFrame) => {
    iframeRef.current?.contentWindow?.postMessage(msg, window.location.origin);
  }, []);

  const sendInit = useCallback(() => {
    if (!readyRef.current) return;
    post({
      type: "init",
      value: propsRef.current.content,
      fileName: propsRef.current.fileName,
      readOnly: propsRef.current.readOnly,
      dirty: false,
    });
  }, [post]);

  useImperativeHandle(
    ref,
    () => ({
      getState() {
        return new Promise<MolanState>((resolve) => {
          const id = reqId.current++;
          pending.current.set(id, resolve);
          post({ type: "getState", requestId: id });
          setTimeout(() => {
            if (pending.current.has(id)) {
              pending.current.delete(id);
              resolve({ value: propsRef.current.content, dirty: false, isPreview: true });
            }
          }, 800);
        });
      },
      markSaved() {
        post({ type: "saved" });
      },
      exitEdit() {
        post({ type: "exitEdit" });
      },
    }),
    [post]
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const msg = event.data as {
        type?: string;
        value?: string;
        dirty?: boolean;
        isPreview?: boolean;
        requestId?: number;
      };
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "ready") {
        readyRef.current = true;
        sendInit();
        return;
      }
      if (msg.type === "save") {
        const value = typeof msg.value === "string" ? msg.value : undefined;
        if (value != null) propsRef.current.onSave(value);
        else {
          const id = reqId.current++;
          pending.current.set(id, (state) => propsRef.current.onSave(state.value));
          post({ type: "getState", requestId: id });
        }
        return;
      }
      if (msg.type === "change") {
        propsRef.current.onDirtyChange(Boolean(msg.dirty));
        return;
      }
      if (msg.type === "previewChange") {
        propsRef.current.onEditingChange(msg.isPreview === false);
        return;
      }
      if (msg.type === "wantEdit") {
        propsRef.current.onBlockedEdit?.();
        return;
      }
      if (msg.type === "theme" && typeof msg.theme === "string") {
        const theme = msg.theme;
        if (theme === "night" || theme === "hack" || theme === "rose" || theme === "xuan") {
          document.documentElement.setAttribute("data-theme", theme);
        }
        return;
      }
      if (msg.type === "state" && typeof msg.requestId === "number") {
        const resolve = pending.current.get(msg.requestId);
        if (resolve) {
          pending.current.delete(msg.requestId);
          resolve({
            value: String(msg.value ?? ""),
            dirty: Boolean(msg.dirty),
            isPreview: msg.isPreview !== false,
          });
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [post, sendInit]);

  useEffect(() => {
    sendInit();
  }, [props.fileName, props.etag, props.readOnly, sendInit]);

  return (
    <iframe
      ref={iframeRef}
      className="molan-frame"
      title="墨览"
      src="/molan/host.html"
      onLoad={() => {
        if (readyRef.current) sendInit();
      }}
    />
  );
});

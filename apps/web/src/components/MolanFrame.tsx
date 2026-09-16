"use client";

import type { MolanState } from "@molan/protocol";
import {
  loadMolanRuntime,
  mountInlineHost,
  renderInlineShell,
  warmMolanPreviewAssets,
  type InlineHostHandle,
} from "@molan/host";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export type { MolanState };

export type MolanHandle = {
  getState: () => Promise<MolanState>;
  markSaved: () => void;
  exitEdit: () => void;
  clearSelection: () => void;
  expandToSection: () => void;
};

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
    /** 只读时点编辑：返回 true 则抢锁成功并进入编辑 */
    onRequestEdit?: () => boolean | Promise<boolean>;
    onBlockedEdit?: () => void;
    onOpenRelative?: (path: string) => void;
    onSelection?: (focus: {
      headingPath: string[];
      quote: string;
      before?: string;
      after?: string;
      rect?: { top: number; left: number; bottom: number; right: number } | null;
    }) => void;
  }
>(function MolanFrame(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<InlineHostHandle | null>(null);
  const readyRef = useRef(false);
  const propsRef = useRef(props);
  propsRef.current = props;

  const sendInit = useCallback(async () => {
    if (!readyRef.current || !handleRef.current) return;
    await handleRef.current.applyHostMessage({
      type: "init",
      value: propsRef.current.content,
      fileName: propsRef.current.fileName,
      readOnly: propsRef.current.readOnly,
      dirty: false,
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getState() {
        if (handleRef.current) return handleRef.current.getState();
        return Promise.resolve({
          value: propsRef.current.content,
          dirty: false,
          isPreview: true,
        });
      },
      markSaved() {
        void handleRef.current?.markSaved();
      },
      exitEdit() {
        void handleRef.current?.exitEdit();
      },
      clearSelection() {
        void handleRef.current?.clearSelection();
      },
      expandToSection() {
        void handleRef.current?.expandToSection();
      },
    }),
    [],
  );

  useEffect(() => {
    const root = hostRef.current;
    if (!root || root.dataset.molanMounted === "1") return;
    root.dataset.molanMounted = "1";
    root.innerHTML = renderInlineShell();

    let cancelled = false;

    void (async () => {
      try {
        await loadMolanRuntime();
        if (cancelled || !hostRef.current) return;

        const idle =
          typeof window.requestIdleCallback === "function"
            ? window.requestIdleCallback
            : (cb: () => void) => window.setTimeout(cb, 200);
        idle(() => {
          if (!cancelled) warmMolanPreviewAssets();
        });

        const handle = mountInlineHost(hostRef.current, {
          onSave: () => {
            void handleRef.current?.getState().then((state) => {
              propsRef.current.onSave(state.value);
            });
          },
          onChange: (dirty) => propsRef.current.onDirtyChange(dirty),
          onPreviewChange: (isPreview) => propsRef.current.onEditingChange(!isPreview),
          onRequestEdit: () => propsRef.current.onRequestEdit?.() ?? false,
          onWantEdit: () => propsRef.current.onBlockedEdit?.(),
          onSelection: (focus) => propsRef.current.onSelection?.(focus),
          onReady: () => {
            readyRef.current = true;
            void sendInit();
          },
        });

        if (cancelled) {
          handle.dispose();
          return;
        }
        handleRef.current = handle;
      } catch (err) {
        console.error("墨览 inline 初始化失败", err);
      }
    })();

    return () => {
      cancelled = true;
      handleRef.current?.dispose();
      handleRef.current = null;
      readyRef.current = false;
      if (root) {
        root.dataset.molanMounted = "0";
        root.innerHTML = "";
      }
    };
  }, [sendInit]);

  useEffect(() => {
    void sendInit();
  }, [props.fileName, props.etag, sendInit]);

  useEffect(() => {
    if (!readyRef.current || !handleRef.current) return;
    void handleRef.current.applyHostMessage({
      type: "setReadOnly",
      readOnly: props.readOnly,
    });
  }, [props.readOnly]);

  useEffect(() => {
    hostRef.current?.classList.toggle("is-readonly", props.readOnly);
  }, [props.readOnly]);

  return (
    <div
      ref={hostRef}
      className="molan-inline molan-host-vscode"
      aria-label="墨览"
    />
  );
});

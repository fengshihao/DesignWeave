"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  api,
  type ProjectLockInfo,
  type RequirementMeta,
  type SessionUser,
  type WorkbenchRun,
} from "@/lib/api";
import { MolanFrame, type MolanHandle } from "@/components/MolanFrame";
import { EntrustLayer } from "@/components/EntrustLayer";
import { VersionDrawer } from "@/components/VersionDrawer";
import { DocTree } from "@/components/DocTree";
import { CreateProjectPanel } from "@/components/CreateProjectPanel";
import { SettingsOverlay } from "@/components/SettingsOverlay";
import { UsersOverlay } from "@/components/UsersOverlay";
import { logoutAndLeave } from "@/lib/auth-client";
import {
  maxSeq,
  mergeAguiEvents,
  parseSseData,
  reduceAguiEvents,
  toAguiEvent,
  type AguiEvent,
} from "@designweave/molan-protocol";
import {
  forgetProject,
  lastEntrustSize,
  lastEntrustWidth,
  lastFile,
  lastProjectId,
  lastRailWidth,
  rememberEntrustSize,
  rememberEntrustWidth,
  rememberFile,
  rememberProject,
  rememberRailWidth,
  type EntrustSize,
} from "@/lib/remember";

function clientId(): string {
  const key = "dw-workbench-client";
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const next = crypto.randomUUID();
    sessionStorage.setItem(key, next);
    return next;
  } catch {
    return "anonymous";
  }
}

function isReady(r: Pick<RequirementMeta, "phase" | "clarity">): boolean {
  return r.clarity === "ready" || r.phase === "ready";
}

export function WorkbenchApp(props: { user: SessionUser }) {
  const router = useRouter();
  const search = useSearchParams();
  const projectId = search.get("p");
  const overlay = search.get("overlay");
  const isArchitect = props.user.role === "architect";

  const [projects, setProjects] = useState<RequirementMeta[]>([]);
  const [orphans, setOrphans] = useState<RequirementMeta[]>([]);
  const [workspaceRootSet, setWorkspaceRootSet] = useState(true);

  function setQuery(next: { p?: string | null; overlay?: string | null }) {
    const q = new URLSearchParams();
    const p = next.p === undefined ? projectId : next.p;
    const o = next.overlay === undefined ? overlay : next.overlay;
    if (p) q.set("p", p);
    if (o) q.set("overlay", o);
    const href = q.toString() ? `/?${q.toString()}` : "/";
    router.replace(href);
  }

  async function refreshList() {
    const list = await api.listRequirements();
    setProjects(list.requirements);
    setOrphans(list.orphans || []);
    setWorkspaceRootSet(list.workspaceRootSet);
    return list.requirements;
  }

  useEffect(() => {
    void refreshList().then((list) => {
      if (projectId) return;
      const remembered = lastProjectId();
      if (remembered && list.some((r) => r.id === remembered)) {
        setQuery({ p: remembered });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canCreate = workspaceRootSet;
  const blockedReason = workspaceRootSet
    ? ""
    : isArchitect
      ? "请先在设置里选定运行根目录。"
      : "请架构师先设定运行根目录。";

  return (
    <div className="workbench">
      {projectId ? (
        <ProjectPaper
          key={projectId}
          id={projectId}
          user={props.user}
          projects={projects}
          onSwitch={(id) => setQuery({ p: id })}
          onCreate={() => setQuery({ overlay: "create" })}
          onSettings={() => (isArchitect ? setQuery({ overlay: "settings" }) : undefined)}
          onUsers={() => (isArchitect ? setQuery({ overlay: "users" }) : undefined)}
          onDeleted={(id) => {
            forgetProject(id);
            const next = projects.find((p) => p.id !== id);
            setQuery({ p: next?.id || null });
            void refreshList();
          }}
        />
      ) : (
        <EmptyWorkbench
          user={props.user}
          projects={projects}
          workspaceRootSet={workspaceRootSet}
          blockedReason={blockedReason}
          onSwitch={(id) => setQuery({ p: id })}
          onCreate={() => setQuery({ overlay: "create" })}
          onSettings={() => (isArchitect ? setQuery({ overlay: "settings" }) : undefined)}
          onUsers={() => (isArchitect ? setQuery({ overlay: "users" }) : undefined)}
        />
      )}

      <CreateProjectPanel
        open={overlay === "create"}
        canCreate={canCreate}
        blockedReason={blockedReason || "还不能建工程。"}
        onClose={() => setQuery({ overlay: null })}
        onCreated={(id) => {
          void refreshList();
          setQuery({ p: id, overlay: null });
        }}
      />
      {isArchitect ? (
        <SettingsOverlay
          open={overlay === "settings"}
          user={props.user}
          orphans={orphans}
          onClose={() => setQuery({ overlay: null })}
          onWorkspaceChange={() => void refreshList()}
        />
      ) : null}
      {isArchitect ? (
        <UsersOverlay open={overlay === "users"} onClose={() => setQuery({ overlay: null })} />
      ) : null}
    </div>
  );
}

function EmptyWorkbench(props: {
  user: SessionUser;
  projects: RequirementMeta[];
  workspaceRootSet: boolean;
  blockedReason: string;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onSettings?: () => void;
  onUsers?: () => void;
}) {
  const { width, onWidthChange } = useRailWidth();
  return (
    <div className="workbench-body" style={{ "--rail-w": `${width}px` } as CSSProperties}>
      <Rail
        width={width}
        onWidthChange={onWidthChange}
        user={props.user}
        projects={props.projects}
        currentId=""
        files={[]}
        currentPath=""
        clarityLabel=""
        onOpenProject={props.onSwitch}
        onOpenFile={() => undefined}
        onCreate={props.onCreate}
        onSettings={props.onSettings}
        onUsers={props.onUsers}
      />
      <section className="workbench-col workbench-center">
        <div className="empty-paper">
          <p>
            {props.projects.length
              ? "从左侧打开一个工程。"
              : props.blockedReason || "还没有工程。"}
          </p>
        </div>
      </section>
    </div>
  );
}

const RAIL_MIN = 188;
const RAIL_MAX = 380;

function useRailWidth() {
  const [width, setWidth] = useState(() => lastRailWidth() ?? 240);
  const onWidthChange = useCallback((next: number) => {
    setWidth(next);
    rememberRailWidth(next);
  }, []);
  return { width, onWidthChange };
}

function WeaveMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3.5" y="3.5" width="25" height="25" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M10 11.5c3.2 0 3.2 9 6.4 9s3.2-9 6.4-9M10 20.5c3.2 0 3.2-9 6.4-9s3.2 9 6.4 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RailMenuItem(props: {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`rail-menu-item${props.danger ? " is-danger" : ""}`}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

function RailMenu(props: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="rail-more" ref={rootRef}>
      <button
        type="button"
        className={`rail-more-btn${open ? " is-on" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="更多"
        title="更多"
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="6" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="18" r="1.6" />
        </svg>
      </button>
      {open ? (
        <div
          className="rail-menu"
          role="menu"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("button")) setOpen(false);
          }}
        >
          {props.children}
        </div>
      ) : null}
    </div>
  );
}

function RailResize(props: { width: number; onWidthChange: (width: number) => void }) {
  const dragRef = useRef<{ pointerId: number; startX: number; startW: number } | null>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      document.body.classList.remove("is-col-resizing");
    };
  }, []);

  function endResize(el: HTMLDivElement, pointerId: number) {
    if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
    dragRef.current = null;
    handleRef.current?.classList.remove("is-resizing");
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
      startW: props.width,
    };
    handle.classList.add("is-resizing");
    document.body.classList.add("is-col-resizing");
  }

  function onResizeMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const body = handleRef.current?.closest(".workbench-body");
    const max = Math.min(RAIL_MAX, Math.floor((body?.clientWidth || 800) * 0.46));
    const next = Math.min(max, Math.max(RAIL_MIN, drag.startW + (e.clientX - drag.startX)));
    props.onWidthChange(next);
  }

  function onResizeEnd(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    endResize(e.currentTarget, e.pointerId);
  }

  return (
    <div
      ref={handleRef}
      className="rail-resize"
      onPointerDown={onResizeStart}
      onPointerMove={onResizeMove}
      onPointerUp={onResizeEnd}
      onPointerCancel={onResizeEnd}
      role="separator"
      aria-orientation="vertical"
      aria-label="拖动调整侧栏宽度"
      title="拖动调整宽度"
    />
  );
}

function Rail(props: {
  width: number;
  onWidthChange: (width: number) => void;
  user: SessionUser;
  projects: RequirementMeta[];
  currentId: string;
  files: Array<{ path: string; name: string; isDir: boolean }>;
  currentPath: string;
  clarityLabel: string;
  onOpenProject: (id: string) => void;
  onOpenFile: (path: string) => void;
  onCreate: () => void;
  onSettings?: () => void;
  onUsers?: () => void;
  flags?: ReactNode;
  cmds?: ReactNode;
}) {
  const isArchitect = props.user.role === "architect";
  const mark = isArchitect ? (
    <button className="rail-mark" type="button" title="设置" aria-label="设置" onClick={props.onSettings}>
      <WeaveMark />
    </button>
  ) : (
    <span className="rail-mark is-static" aria-hidden="true">
      <WeaveMark />
    </span>
  );
  return (
    <div className="workbench-rail">
      <aside className="workbench-left">
        <div className="workbench-brand">
          <div className="rail-brand-row">
            {mark}
            <div className="rail-identity">
              <span className="rail-who">{props.user.name}</span>
              <span className="rail-meta">
                {props.user.roleLabel}
                {props.clarityLabel ? <span className="clarity-dot">{props.clarityLabel}</span> : null}
              </span>
            </div>
            <RailMenu>
              {props.cmds}
              {isArchitect ? (
                <RailMenuItem label="用户" onClick={() => props.onUsers?.()} />
              ) : null}
              <RailMenuItem label="退出" onClick={() => void logoutAndLeave()} />
            </RailMenu>
          </div>
          {props.flags}
        </div>
        <div className="workbench-side-scroll">
          <div className="workbench-left-head">
            <span className="side-kicker">工程</span>
            <button className="side-text" type="button" onClick={props.onCreate}>
              新建
            </button>
          </div>
          <ul className="project-switch">
            {props.projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={p.id === props.currentId ? "is-current" : ""}
                  onClick={() => props.onOpenProject(p.id)}
                >
                  {p.title}
                </button>
              </li>
            ))}
          </ul>
          {props.files.length ? (
            <>
              <div className="workbench-left-head" style={{ marginTop: 16 }}>
                <span className="side-kicker">文档</span>
              </div>
              <DocTree files={props.files} currentPath={props.currentPath} onOpen={props.onOpenFile} />
            </>
          ) : null}
        </div>
      </aside>
      <RailResize width={props.width} onWidthChange={props.onWidthChange} />
    </div>
  );
}

function ProjectPaper(props: {
  id: string;
  user: SessionUser;
  projects: RequirementMeta[];
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onSettings?: () => void;
  onUsers?: () => void;
  onDeleted: (id: string) => void;
}) {
  const id = props.id;
  const [cid, setCid] = useState("");
  const molanRef = useRef<MolanHandle>(null);
  const editingRef = useRef(false);
  const activeRunRef = useRef<WorkbenchRun | null>(null);
  const followSeq = useRef(0);

  const [title, setTitle] = useState("");
  const [meta, setMeta] = useState<RequirementMeta | null>(null);
  const [files, setFiles] = useState<Array<{ path: string; name: string; isDir: boolean }>>([]);
  const [currentPath, setCurrentPath] = useState("PRD.md");
  const [content, setContent] = useState("");
  const [etag, setEtag] = useState("");
  const [lock, setLock] = useState<ProjectLockInfo>(null);
  const [previewReason, setPreviewReason] = useState("");
  const [activeRun, setActiveRun] = useState<WorkbenchRun | null>(null);
  const [message, setMessage] = useState("");
  const [events, setEvents] = useState<AguiEvent[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [uncommitted, setUncommitted] = useState(false);
  const [versions, setVersions] = useState<
    Array<{ id: string; message: string; author: string; createdAt: string }>
  >([]);
  const [history, setHistory] = useState<{ sha: string; content: string; message: string } | null>(
    null
  );
  const [compare, setCompare] = useState<{ a: string; b: string; title: string } | null>(null);
  const [importText, setImportText] = useState("");
  const [gate, setGate] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [entrustSize, setEntrustSize] = useState<EntrustSize>("collapsed");
  const [entrustWidth, setEntrustWidth] = useState(420);
  const [toast, setToast] = useState("");
  const { width: railWidth, onWidthChange: onRailWidthChange } = useRailWidth();

  activeRunRef.current = activeRun;
  editingRef.current = editing;

  const youHold = Boolean(lock?.youHold);
  const aiRunning = Boolean(
    activeRun && (activeRun.status === "queued" || activeRun.status === "running")
  );
  const turns = reduceAguiEvents(events);
  const readOnly = !youHold || aiRunning || Boolean(history);
  const editBlockedReason = history
    ? "这是旧版，返回纸面后再改。"
    : aiRunning
      ? "AI 进行中，暂时不能改。"
      : youHold
        ? ""
        : previewReason || "现在是预览，不能编辑。";

  function changeEntrustSize(next: EntrustSize) {
    setEntrustSize(next);
    rememberEntrustSize(id, next);
  }

  const refreshVersions = useCallback(async () => {
    const ver = await api.listVersions(id);
    setVersions(ver.versions);
    setUncommitted(ver.uncommitted);
  }, [id]);

  const refreshTree = useCallback(async () => {
    const tree = await api.listFiles(id);
    setFiles(tree.files);
    return tree.files;
  }, [id]);

  const openFile = useCallback(
    async (path: string, force = false) => {
      if (!force && dirty && !readOnly) {
        const state = await molanRef.current?.getState();
        if (state?.dirty) {
          setGate("先保存当前这篇，再打开另一篇。");
          return;
        }
      }
      const file = await api.readFile(id, path);
      setCurrentPath(file.path);
      setContent(file.content);
      setEtag(file.etag);
      setDirty(false);
      setHistory(null);
      rememberFile(id, file.path);
    },
    [dirty, id, readOnly]
  );

  const bootstrap = useCallback(async () => {
    setError("");
    const data = await api.getRequirement(id, cid);
    setTitle(data.requirement.title);
    setMeta(data.requirement);
    setUncommitted(Boolean(data.uncommitted));
    if (data.activeRun) setActiveRun(data.activeRun);
    const claimed = await api.claimLock(id, cid);
    setLock(claimed.lock);
    setPreviewReason(claimed.previewReason || "");
    rememberProject(id);
    const tree = await api.listFiles(id);
    setFiles(tree.files);
    const ver = await api.listVersions(id);
    setVersions(ver.versions);
    setUncommitted(ver.uncommitted);
    const remembered = lastFile(id);
    const startPath =
      remembered && tree.files.some((f) => f.path === remembered && !f.isDir)
        ? remembered
        : tree.files.some((f) => f.path === "PRD.md")
          ? "PRD.md"
          : tree.files.some((f) => f.path === "README.md")
          ? "README.md"
          : tree.files.find((f) => !f.isDir)?.path || "PRD.md";
    const file = await api.readFile(id, startPath);
    setCurrentPath(file.path);
    setContent(file.content);
    setEtag(file.etag);
    setDirty(false);
    setHistory(null);
    const timeline = await api.listRuns(id);
    const historical: AguiEvent[] = [];
    for (const run of [...timeline.runs].reverse()) {
      for (const ev of run.events) {
        historical.push(
          toAguiEvent({
            seq: ev.seq,
            type: ev.type,
            payload: ev.payload,
            runId: run.id,
          })
        );
      }
    }
    setEvents(historical);
    if (data.activeRun && (data.activeRun.status === "queued" || data.activeRun.status === "running")) {
      const fromActive = historical.filter((ev) => ev.runId === data.activeRun?.id);
      followSeq.current = maxSeq(fromActive);
    }
    const savedSize = lastEntrustSize(id);
    const savedWidth = lastEntrustWidth(id);
    if (savedWidth) setEntrustWidth(savedWidth);
    if (!claimed.lock?.youHold) {
      setEntrustSize(savedSize || "half");
    } else if (savedSize) {
      setEntrustSize(savedSize);
    }
  }, [cid, id]);

  useEffect(() => {
    setCid(clientId());
  }, []);

  useEffect(() => {
    if (!cid) return;
    void bootstrap().catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, [bootstrap, cid]);

  useEffect(() => {
    if (!cid || !youHold) return;
    const timer = setInterval(() => {
      void api
        .heartbeatLock(id, cid, editingRef.current)
        .then((res) => setLock(res.lock))
        .catch(() => undefined);
    }, 20000);
    return () => clearInterval(timer);
  }, [cid, id, youHold]);

  useEffect(() => {
    if (!cid) return;
    return () => {
      if (!activeRunRef.current) {
        void api.releaseLock(id, cid).catch(() => undefined);
      }
    };
  }, [cid, id]);

  useEffect(() => {
    if (!readOnly || history) return;
    const timer = setInterval(() => {
      void api
        .readFile(id, currentPath)
        .then((file) => {
          if (file.etag !== etag) {
            setContent(file.content);
            setEtag(file.etag);
          }
        })
        .catch(() => undefined);
      void refreshTree().catch(() => undefined);
      void refreshVersions().catch(() => undefined);
      void api.currentRun(id).then((res) => setActiveRun(res.run)).catch(() => undefined);
      void api.getRequirement(id, cid).then((data) => setMeta(data.requirement)).catch(() => undefined);
    }, 2500);
    return () => clearInterval(timer);
  }, [cid, currentPath, etag, history, id, readOnly, refreshTree, refreshVersions]);

  const ingestEvents = useCallback((incoming: AguiEvent[]) => {
    if (!incoming.length) return;
    setEvents((prev) => mergeAguiEvents(prev, incoming));
  }, []);

  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;

  const followRun = useCallback(
    async (runId: string, after = 0) => {
      followSeq.current = after;
      const res = await fetch(`/v1/requirements/${id}/runs/${runId}/stream?after=${after}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok || !res.body) throw new Error("无法接上这一轮进度");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() || "";
        for (const chunk of chunks) {
          const eventLine = chunk.split("\n").find((l) => l.startsWith("event:"));
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!eventLine || !dataLine) continue;
          const type = eventLine.slice(6).trim();
          let payload: Record<string, unknown> = {};
          try {
            payload = JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>;
          } catch {
            continue;
          }
          const parsed = parseSseData(type, payload, runId);
          if (!parsed) continue;
          followSeq.current = parsed.seq;
          ingestEvents([parsed]);
          if (parsed.type === "CUSTOM" && parsed.name === "file") {
            const path = String(parsed.value?.path || "");
            if (path === currentPathRef.current) {
              void api.readFile(id, currentPathRef.current).then((file) => {
                setContent(file.content);
                setEtag(file.etag);
              });
            }
            void refreshTree();
          } else if (parsed.type === "RUN_ERROR") {
            setError(parsed.message || "失败");
          } else if (parsed.type === "RUN_FINISHED") {
            await refreshVersions();
            await refreshTree();
            const cur = await api.currentRun(id);
            setActiveRun(cur.run);
            const file = await api.readFile(id, currentPathRef.current);
            setContent(file.content);
            setEtag(file.etag);
            const bundle = await api.getRequirement(id, cid);
            setMeta(bundle.requirement);
          }
        }
      }
    },
    [cid, id, ingestEvents, refreshTree, refreshVersions]
  );

  useEffect(() => {
    if (!activeRun || (activeRun.status !== "queued" && activeRun.status !== "running")) return;
    void followRun(activeRun.id, followSeq.current).catch((e) => {
      setError(e instanceof Error ? e.message : "进度中断，稍后会自动跟上");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRun?.id]);

  async function saveCurrent(value?: string) {
    const state = value ? { value, dirty: true, isPreview: false } : await molanRef.current?.getState();
    const next = state?.value ?? content;
    const file = await api.writeFile(id, currentPath, next, etag, cid);
    setContent(file.content);
    setEtag(file.etag);
    setDirty(false);
    molanRef.current?.markSaved();
    await refreshVersions();
  }

  async function recordVersion() {
    await api.recordVersion(id, undefined, cid);
    molanRef.current?.exitEdit();
    setEditing(false);
    await api.heartbeatLock(id, cid, false).then((r) => setLock(r.lock)).catch(() => undefined);
    await refreshVersions();
  }

  async function saveAndRecord() {
    setBusy(true);
    setError("");
    setGate("");
    try {
      const state = await molanRef.current?.getState();
      if (state?.dirty) await saveCurrent(state.value);
      if (uncommitted || state?.dirty) await recordVersion();
      else {
        molanRef.current?.exitEdit();
        setEditing(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "没能保存一版");
    } finally {
      setBusy(false);
    }
  }

  async function onSend() {
    const text = message.trim();
    if (!text || busy || aiRunning) return;
    setGate("");
    setError("");
    const state = await molanRef.current?.getState();
    if (state && (!state.isPreview || state.dirty || editing)) {
      setGate("先保存一版并退出编辑，再发给 AI。");
      return;
    }
    if (uncommitted) {
      setGate("先记入版本再发给 AI。");
      return;
    }
    setBusy(true);
    try {
      const started = await api.startRun(id, { mode: "coauthor", message: text, clientId: cid });
      setMessage("");
      setActiveRun(started.run);
      ingestEvents(
        started.events.map((ev) =>
          toAguiEvent({
            seq: ev.seq,
            type: ev.type,
            payload: ev.payload,
            runId: started.run.id,
          })
        )
      );
      followSeq.current = maxSeq(started.events);
      if (entrustSize === "collapsed") changeEntrustSize("half");
    } catch (err) {
      setGate(err instanceof Error ? err.message : "没发出去");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (editing) {
      setEntrustSize("collapsed");
      rememberEntrustSize(id, "collapsed");
    }
  }, [editing, id]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  const clarityLabel = meta?.clarityLabel || (meta && isReady(meta) ? "清晰" : "填写中");

  return (
    <>
      {error ? <p className="workbench-banner danger">{error}</p> : null}
      {toast ? (
        <div className="workbench-toast" role="status">
          {toast}
        </div>
      ) : null}
      <div className="workbench-body" style={{ "--rail-w": `${railWidth}px` } as CSSProperties}>
        <Rail
          width={railWidth}
          onWidthChange={onRailWidthChange}
          user={props.user}
          projects={props.projects}
          currentId={id}
          files={files}
          currentPath={currentPath}
          clarityLabel={clarityLabel}
          onOpenProject={props.onSwitch}
          onOpenFile={(path) => void openFile(path)}
          onCreate={props.onCreate}
          onSettings={props.onSettings}
          onUsers={props.onUsers}
          flags={
            uncommitted || aiRunning ? (
              <div className="rail-flags">
                {uncommitted ? <span className="tag warn">未记入版本</span> : null}
                {aiRunning ? <span className="tag">AI 进行中</span> : null}
              </div>
            ) : null
          }
          cmds={
            <>
              <RailMenuItem label="版本" onClick={() => setShowVersions(true)} />
              <RailMenuItem
                label="保存一版"
                disabled={readOnly || busy || (!uncommitted && !dirty)}
                onClick={() => void saveAndRecord()}
              />
              <RailMenuItem label="导入" onClick={() => setShowImport(true)} />
              {props.user.role === "architect" && lock && !lock.youHold ? (
                <RailMenuItem
                  label="解除编辑权"
                  onClick={() => void api.forceReleaseLock(id).then(() => bootstrap())}
                />
              ) : null}
              {props.user.role === "architect" ? (
                <RailMenuItem
                  label="删除工程"
                  danger
                  onClick={() => {
                    if (!window.confirm(`删除「${title}」会删掉这个文件夹。`)) return;
                    void api.deleteRequirement(id).then(() => props.onDeleted(id));
                  }}
                />
              ) : null}
              {!youHold && !lock ? (
                <RailMenuItem label="开始编辑" onClick={() => void bootstrap()} />
              ) : null}
            </>
          }
        />
        <section className="workbench-col workbench-center">
          <div className={`molan-stage${entrustSize === "collapsed" ? " has-collapsed-entrust" : ""}`}>
            <div className="molan-host">
              <MolanFrame
                ref={molanRef}
                fileName={currentPath}
                content={history ? history.content : content}
                etag={history ? history.sha : etag}
                readOnly={readOnly}
                onSave={(value) => {
                  void saveCurrent(value).catch((e) =>
                    setError(e instanceof Error ? e.message : "保存失败")
                  );
                }}
                onDirtyChange={setDirty}
                onEditingChange={(next) => {
                  setEditing(next);
                  if (youHold) {
                    void api
                      .heartbeatLock(id, cid, next)
                      .then((r) => setLock(r.lock))
                      .catch(() => undefined);
                  }
                }}
                onBlockedEdit={() => {
                  setToast(editBlockedReason || "现在不能编辑。");
                }}
              />
            </div>
            <EntrustLayer
              size={entrustSize}
              width={entrustWidth}
              onSizeChange={changeEntrustSize}
              onWidthChange={(w) => {
                setEntrustWidth(w);
                rememberEntrustWidth(id, w);
              }}
              turns={turns}
              message={message}
              onMessageChange={setMessage}
              onSend={() => void onSend()}
              onCancel={() => {
                if (!activeRun) return;
                void api.cancelRun(id, activeRun.id, cid);
              }}
              onOpenFile={(path) => void openFile(path)}
              youHold={youHold}
              aiRunning={aiRunning}
              busy={busy}
              activeRun={activeRun}
            />
          </div>
        </section>
      </div>

      {compare ? (
        <div className="compare-mask" onClick={() => setCompare(null)}>
          <div className="compare-panel" onClick={(e) => e.stopPropagation()}>
            <header>
              <strong>{compare.title}</strong>
              <button className="btn ghost" type="button" onClick={() => setCompare(null)}>
                关闭
              </button>
            </header>
            <div className="compare-grid">
              <pre>{compare.a}</pre>
              <pre>{compare.b}</pre>
            </div>
          </div>
        </div>
      ) : null}

      <VersionDrawer
        open={showVersions}
        versions={versions}
        readOnly={readOnly}
        canRevertAi={versions[0]?.author === "AI" && youHold && !aiRunning}
        onClose={() => setShowVersions(false)}
        onOpen={(sha, message) => {
          void api
            .readVersionFile(id, sha, currentPath)
            .then((file) => {
              setHistory({ sha, content: file.content, message });
              setShowVersions(false);
            })
            .catch((e) => setError(e instanceof Error ? e.message : "打不开这一版"));
        }}
        onRestore={(sha) => {
          void api
            .restoreFile(id, sha, currentPath, cid)
            .then(async () => {
              await openFile(currentPath, true);
              await refreshVersions();
              setShowVersions(false);
            })
            .catch((e) => setError(e instanceof Error ? e.message : "无法恢复"));
        }}
        onCompare={(newer, older) => {
          void Promise.all([
            api.readVersionFile(id, newer.id, currentPath),
            api.readVersionFile(id, older.id, currentPath),
          ])
            .then(([a, b]) => {
              setCompare({
                a: a.content,
                b: b.content,
                title: `${newer.message} ↔ ${older.message}`,
              });
              setShowVersions(false);
            })
            .catch((e) => setError(e instanceof Error ? e.message : "对比失败"));
        }}
        onRevertAi={() => {
          void api
            .revertLatestAi(id, cid)
            .then(async () => {
              await openFile(currentPath, true);
              await refreshVersions();
              setShowVersions(false);
            })
            .catch((e) => setError(e instanceof Error ? e.message : "没能撤销"));
        }}
      />

      {gate ? (
        <div className="gate-mask" onClick={() => setGate("")}>
          <div className="gate-panel" onClick={(e) => e.stopPropagation()}>
            <p>{gate}</p>
            <div className="gate-actions">
              {gate.includes("清晰度") || gate.includes("代码目录") ? (
                <button className="btn ghost" type="button" onClick={() => setGate("")}>
                  知道了
                </button>
              ) : (
                <>
                  <button
                    className="btn primary"
                    type="button"
                    disabled={busy || readOnly}
                    onClick={() => void saveAndRecord()}
                  >
                    保存一版
                  </button>
                  <button className="btn ghost" type="button" onClick={() => setGate("")}>
                    先不发
                  </button>
                </>
              )}
            </div>
            {gate.includes("保存一版") || gate.includes("记入版本") ? (
              <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                「保存一版」只记入并退出编辑，不会把输入框里那句话发出去。
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {showImport ? (
        <div className="import-mask" onClick={() => setShowImport(false)}>
          <div className="import-panel" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)", fontWeight: 500 }}>
              导入 Markdown
            </h2>
            <p className="muted">原文进 import/original.md，立刻按标准文档包拆写。</p>
            <div className="field">
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="粘贴外部文档…"
                disabled={readOnly}
              />
            </div>
            <div className="gate-actions">
              <button
                className="btn primary"
                type="button"
                disabled={readOnly || busy || !importText.trim()}
                onClick={() => {
                  void api
                    .importMarkdown(id, importText, cid)
                    .then(async () => {
                      setImportText("");
                      setShowImport(false);
                      await refreshTree();
                      await openFile("PRD.md", true);
                      await refreshVersions();
                    })
                    .catch((e) => setError(e instanceof Error ? e.message : "导入失败"));
                }}
              >
                导入
              </button>
              <button className="btn ghost" type="button" onClick={() => setShowImport(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

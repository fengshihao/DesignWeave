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
  type DocFolder,
  type ProjectLockInfo,
  type RequirementMeta,
  type SessionUser,
  type WorkbenchRun,
} from "@/lib/api";
import {
  canCreateProject,
  defaultFileForRole,
  folderOfPath,
  followHintFor,
  writableFolderOf,
} from "@/lib/docFolders";
import { MolanFrame, type MolanHandle } from "@/components/MolanFrame";
import { EntrustLayer } from "@/components/EntrustLayer";
import { SelectionAsk, type SelectionAskFocus } from "@/components/SelectionAsk";
import { VersionDrawer } from "@/components/VersionDrawer";
import { DocTree } from "@/components/DocTree";
import { CreateProjectPanel } from "@/components/CreateProjectPanel";
import { SwitchProjectPanel } from "@/components/SwitchProjectPanel";
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
import { WeaveMark } from "@/components/WeaveMark";

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

  const canCreate = workspaceRootSet && canCreateProject(props.user.role);
  const blockedReason = workspaceRootSet
    ? canCreate
      ? ""
      : "测试不能建工程。"
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
          onSwitch={() => setQuery({ overlay: "switch" })}
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
          canCreate={canCreate}
          blockedReason={blockedReason}
          onSwitch={() => setQuery({ overlay: "switch" })}
          onCreate={() => setQuery({ overlay: "create" })}
          onSettings={() => (isArchitect ? setQuery({ overlay: "settings" }) : undefined)}
          onUsers={() => (isArchitect ? setQuery({ overlay: "users" }) : undefined)}
        />
      )}

      <SwitchProjectPanel
        open={overlay === "switch"}
        projects={projects}
        currentId={projectId || ""}
        canCreate={canCreate}
        onClose={() => setQuery({ overlay: null })}
        onSwitch={(id) => setQuery({ p: id, overlay: null })}
        onCreate={() => setQuery({ overlay: "create" })}
      />
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
  canCreate: boolean;
  blockedReason: string;
  onSwitch: () => void;
  onCreate: () => void;
  onSettings?: () => void;
  onUsers?: () => void;
}) {
  const { width, onWidthChange } = useRailWidth();
  const emptyCopy = props.projects.length
    ? "用菜单里的「切换工程」打开。"
    : props.canCreate
      ? props.blockedReason || "还没有工程。用菜单里的「新建工程」开始。"
      : props.blockedReason || "还没有工程。等产品经理或架构师建好。";
  return (
    <div className="workbench-body" style={{ "--rail-w": `${width}px` } as CSSProperties}>
      <Rail
        width={width}
        onWidthChange={onWidthChange}
        user={props.user}
        files={[]}
        currentPath=""
        clarityLabel=""
        canCreate={props.canCreate}
        onOpenFile={() => undefined}
        onCreate={props.onCreate}
        onSwitch={props.onSwitch}
        onSettings={props.onSettings}
        onUsers={props.onUsers}
      />
      <section className="workbench-col workbench-center">
        <div className="empty-paper">
          <div className="empty-paper-inner">
            <p>{emptyCopy}</p>
            <div className="empty-paper-actions">
              {props.projects.length ? (
                <button className="btn ghost" type="button" onClick={props.onSwitch}>
                  切换工程
                </button>
              ) : null}
              {props.canCreate ? (
                <button className="btn ghost" type="button" onClick={props.onCreate}>
                  新建工程
                </button>
              ) : null}
            </div>
          </div>
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

function RailMenuSep() {
  return <div className="rail-menu-sep" role="separator" />;
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
  projectTitle?: string;
  files: Array<{ path: string; name: string; isDir: boolean }>;
  currentPath: string;
  clarityLabel: string;
  canCreate?: boolean;
  pendingFollow?: string[];
  onOpenFile: (path: string) => void;
  onCreate: () => void;
  onSwitch: () => void;
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
              {props.canCreate !== false ? (
                <RailMenuItem label="新建工程" onClick={props.onCreate} />
              ) : null}
              <RailMenuItem label="切换工程" onClick={props.onSwitch} />
              {props.cmds ? <RailMenuSep /> : null}
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
          {props.projectTitle ? (
            <div className="workbench-left-head">
              <span className="rail-project-name" title={props.projectTitle}>
                {props.projectTitle}
              </span>
            </div>
          ) : null}
          {props.files.length ? (
            <DocTree
              files={props.files}
              currentPath={props.currentPath}
              pendingFollow={props.pendingFollow}
              onOpen={props.onOpenFile}
            />
          ) : props.projectTitle ? (
            <p className="rail-empty-hint">这个工程还没有文档。</p>
          ) : (
            <p className="rail-empty-hint">打开工程后，这里是当前工程的文件。</p>
          )}
        </div>
      </aside>
      <RailResize width={props.width} onWidthChange={props.onWidthChange} />
    </div>
  );
}

function ProjectPaper(props: {
  id: string;
  user: SessionUser;
  onSwitch: () => void;
  onCreate: () => void;
  onSettings?: () => void;
  onUsers?: () => void;
  onDeleted: (id: string) => void;
}) {
  const id = props.id;
  const heldFolder = writableFolderOf(props.user.role);
  const canCreate = canCreateProject(props.user.role);
  const canImport = props.user.role === "designer";
  const [cid, setCid] = useState("");
  const molanRef = useRef<MolanHandle>(null);
  const editingRef = useRef(false);
  const activeRunRef = useRef<WorkbenchRun | null>(null);
  const followSeq = useRef(0);

  const [title, setTitle] = useState("");
  const [meta, setMeta] = useState<RequirementMeta | null>(null);
  const [files, setFiles] = useState<Array<{ path: string; name: string; isDir: boolean }>>([]);
  const [folders, setFolders] = useState<Array<{ id: DocFolder; label: string; pendingFollow: boolean }>>(
    []
  );
  const [currentPath, setCurrentPath] = useState(() => defaultFileForRole(props.user.role));
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
  const [previewFocus, setPreviewFocus] = useState<SelectionAskFocus | null>(null);
  const { width: railWidth, onWidthChange: onRailWidthChange } = useRailWidth();

  activeRunRef.current = activeRun;
  editingRef.current = editing;

  const youHold = Boolean(lock?.youHold);
  const viewFolder = folderOfPath(currentPath) || heldFolder;
  const pendingMine = Boolean(folders.find((f) => f.id === heldFolder)?.pendingFollow);
  const showFollowHint = pendingMine && viewFolder === heldFolder;
  const pendingFollow = folders.filter((f) => f.pendingFollow).map((f) => f.id);
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

  const refreshVersions = useCallback(async (folder = viewFolder) => {
    const ver = await api.listVersions(id, folder);
    setVersions(ver.versions);
    setUncommitted(ver.uncommitted);
  }, [id, viewFolder]);

  const refreshTree = useCallback(async () => {
    const tree = await api.listFiles(id);
    setFiles(tree.files);
    setFolders(tree.folders || []);
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
      const nextFolder = folderOfPath(file.path) || heldFolder;
      if (cid) {
        const claimed = await api.claimLock(id, cid, nextFolder);
        setLock(claimed.lock);
        setPreviewReason(claimed.previewReason || "");
      }
      setCurrentPath(file.path);
      setContent(file.content);
      setEtag(file.etag);
      setDirty(false);
      setHistory(null);
      setPreviewFocus(null);
      molanRef.current?.clearSelection();
      rememberFile(id, file.path);
      void api.listVersions(id, nextFolder).then((ver) => {
        setVersions(ver.versions);
        setUncommitted(ver.uncommitted);
      });
    },
    [cid, dirty, heldFolder, id, readOnly]
  );

  const bootstrap = useCallback(async () => {
    setError("");
    const data = await api.getRequirement(id, cid, heldFolder);
    setTitle(data.requirement.title);
    setMeta(data.requirement);
    setUncommitted(Boolean(data.uncommitted));
    if (data.activeRun) setActiveRun(data.activeRun);
    const claimed = await api.claimLock(id, cid, heldFolder);
    setLock(claimed.lock);
    setPreviewReason(claimed.previewReason || "");
    rememberProject(id);
    const tree = await api.listFiles(id);
    setFiles(tree.files);
    setFolders(tree.folders || []);
    const remembered = lastFile(id);
    const preferred = defaultFileForRole(props.user.role);
    const startPath =
      remembered && tree.files.some((f) => f.path === remembered && !f.isDir)
        ? remembered
        : tree.files.some((f) => f.path === preferred && !f.isDir)
          ? preferred
          : tree.files.find((f) => !f.isDir)?.path || preferred;
    const startFolder = folderOfPath(startPath) || heldFolder;
    if (startFolder !== heldFolder) {
      const viewClaim = await api.claimLock(id, cid, startFolder);
      setLock(viewClaim.lock);
      setPreviewReason(viewClaim.previewReason || "");
    }
    const ver = await api.listVersions(id, startFolder);
    setVersions(ver.versions);
    setUncommitted(ver.uncommitted);
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
    if (!claimed.lock?.youHold && startFolder === heldFolder) {
      setEntrustSize(savedSize || "half");
    } else if (savedSize) {
      setEntrustSize(savedSize);
    }
  }, [cid, heldFolder, id, props.user.role]);

  useEffect(() => {
    setCid(clientId());
  }, []);

  useEffect(() => {
    if (!cid) return;
    void bootstrap().catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, [bootstrap, cid]);

  useEffect(() => {
    if (!cid) return;
    const timer = setInterval(() => {
      void api
        .heartbeatLock(id, cid, viewFolder === heldFolder && editingRef.current, heldFolder)
        .then((res) => {
          if (viewFolder === heldFolder) setLock(res.lock);
        })
        .catch(() => undefined);
    }, 20000);
    return () => clearInterval(timer);
  }, [cid, heldFolder, id, viewFolder]);

  useEffect(() => {
    if (!cid) return;
    return () => {
      if (!activeRunRef.current) {
        void api.releaseLock(id, cid, heldFolder).catch(() => undefined);
      }
    };
  }, [cid, heldFolder, id]);

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
      void refreshVersions(viewFolder).catch(() => undefined);
      void api.currentRun(id, viewFolder).then((res) => setActiveRun(res.run)).catch(() => undefined);
      void api
        .getRequirement(id, cid, viewFolder)
        .then((data) => setMeta(data.requirement))
        .catch(() => undefined);
    }, 2500);
    return () => clearInterval(timer);
  }, [cid, currentPath, etag, history, id, readOnly, refreshTree, refreshVersions, viewFolder]);

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
            const cur = await api.currentRun(id, folderOfPath(currentPathRef.current) || heldFolder);
            setActiveRun(cur.run);
            const file = await api.readFile(id, currentPathRef.current);
            setContent(file.content);
            setEtag(file.etag);
            const bundle = await api.getRequirement(id, cid, folderOfPath(currentPathRef.current) || heldFolder);
            setMeta(bundle.requirement);
          }
        }
      }
    },
    [cid, heldFolder, id, ingestEvents, refreshTree, refreshVersions]
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
    await api.recordVersion(id, undefined, cid, viewFolder);
    molanRef.current?.exitEdit();
    setEditing(false);
    await api
      .heartbeatLock(id, cid, false, heldFolder)
      .then((r) => {
        if (viewFolder === heldFolder) setLock(r.lock);
      })
      .catch(() => undefined);
    await refreshVersions(viewFolder);
    await refreshTree();
  }

  async function markCaughtUp() {
    setBusy(true);
    setError("");
    try {
      await api.recordVersion(id, undefined, cid, heldFolder, true);
      await refreshTree();
      await refreshVersions(heldFolder);
    } catch (e) {
      setError(e instanceof Error ? e.message : "没能标成已跟上");
    } finally {
      setBusy(false);
    }
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
      const started = await api.startRun(id, {
        message: text,
        clientId: cid,
        folder: viewFolder,
        focus: {
          file: currentPath,
          headingPath: previewFocus?.quote ? previewFocus.headingPath : [],
          quote: previewFocus?.quote || "",
          before: previewFocus?.quote ? previewFocus.before || "" : "",
          after: previewFocus?.quote ? previewFocus.after || "" : "",
        },
      });
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
          projectTitle={title}
          files={files}
          currentPath={currentPath}
          clarityLabel={clarityLabel}
          canCreate={canCreate}
          pendingFollow={pendingFollow}
          onOpenFile={(path) => void openFile(path)}
          onCreate={props.onCreate}
          onSwitch={props.onSwitch}
          onSettings={props.onSettings}
          onUsers={props.onUsers}
          flags={
            uncommitted || aiRunning || showFollowHint ? (
              <div className="rail-flags">
                {uncommitted ? <span className="tag warn">未记入版本</span> : null}
                {aiRunning ? <span className="tag">AI 进行中</span> : null}
                {showFollowHint ? (
                  <button
                    className="side-text"
                    type="button"
                    onClick={() => void openFile(`${heldFolder}/跟上.md`)}
                  >
                    {followHintFor(heldFolder)}
                  </button>
                ) : null}
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
              {pendingMine && youHold ? (
                <RailMenuItem
                  label="标成已跟上"
                  disabled={busy}
                  onClick={() => void markCaughtUp()}
                />
              ) : null}
              {canImport ? (
                <RailMenuItem label="导入" onClick={() => setShowImport(true)} />
              ) : null}
              {props.user.role === "architect" && lock && !lock.youHold ? (
                <RailMenuItem
                  label="解除编辑权"
                  onClick={() =>
                    void api.forceReleaseLock(id, viewFolder).then(() => bootstrap())
                  }
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
                      .heartbeatLock(id, cid, next, heldFolder)
                      .then((r) => setLock(r.lock))
                      .catch(() => undefined);
                  }
                }}
                onBlockedEdit={() => {
                  setToast(editBlockedReason || "现在不能编辑。");
                }}
                onSelection={(focus) => {
                  console.debug("[dw-focus]", focus);
                  setPreviewFocus(focus.quote ? focus : null);
                }}
              />
            </div>
            <SelectionAsk
              focus={previewFocus}
              message={message}
              onMessageChange={setMessage}
              onSend={() => void onSend()}
              onClear={() => {
                setPreviewFocus(null);
                molanRef.current?.clearSelection();
              }}
              onExpandSection={() => {
                molanRef.current?.expandToSection();
              }}
              disabled={aiRunning || busy || !youHold}
              canSend={Boolean(message.trim()) && !aiRunning && !busy && youHold}
              hint={youHold ? undefined : "先拿编辑权，才能问 AI。"}
            />
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
              focus={previewFocus}
              onClearFocus={() => {
                setPreviewFocus(null);
                molanRef.current?.clearSelection();
              }}
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
                      await openFile("product/PRD.md", true);
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

"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  api,
  type ProjectLockInfo,
  type SessionUser,
  type WorkbenchMode,
  type WorkbenchRun,
} from "@/lib/api";
import { MolanFrame, type MolanHandle } from "@/components/MolanFrame";
import { EntrustLayer, type LogItem } from "@/components/EntrustLayer";
import { VersionDrawer } from "@/components/VersionDrawer";
import { DocTree } from "@/components/DocTree";
import {
  lastEntrustSize,
  lastEntrustWidth,
  lastFile,
  rememberEntrustSize,
  rememberEntrustWidth,
  rememberFile,
  rememberProject,
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

export default function WorkbenchPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [cid, setCid] = useState("");
  const molanRef = useRef<MolanHandle>(null);
  const editingRef = useRef(false);
  const activeRunRef = useRef<WorkbenchRun | null>(null);
  const followSeq = useRef(0);

  const [user, setUser] = useState<SessionUser | null>(null);
  const [title, setTitle] = useState("");
  const [primaryRepo, setPrimaryRepo] = useState<string | undefined>();
  const [relatedRepos, setRelatedRepos] = useState<string[]>([]);
  const [files, setFiles] = useState<Array<{ path: string; name: string; isDir: boolean }>>([]);
  const [currentPath, setCurrentPath] = useState("PRD.md");
  const [content, setContent] = useState("");
  const [etag, setEtag] = useState("");
  const [lock, setLock] = useState<ProjectLockInfo>(null);
  const [previewReason, setPreviewReason] = useState("");
  const [activeRun, setActiveRun] = useState<WorkbenchRun | null>(null);
  const [mode, setMode] = useState<WorkbenchMode>("feasibility");
  const [message, setMessage] = useState("");
  const [log, setLog] = useState<LogItem[]>([]);
  const [trust, setTrust] = useState("打开工程后，AI 只写文档仓、不改业务代码。");
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
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [entrustSize, setEntrustSize] = useState<EntrustSize>("collapsed");
  const [entrustWidth, setEntrustWidth] = useState(420);

  activeRunRef.current = activeRun;
  editingRef.current = editing;

  const youHold = Boolean(lock?.youHold);
  const aiRunning = Boolean(
    activeRun && (activeRun.status === "queued" || activeRun.status === "running")
  );
  const readOnly = !youHold || aiRunning || Boolean(history);
  const hasCode = Boolean(primaryRepo || relatedRepos.length);

  function changeEntrustSize(next: EntrustSize) {
    setEntrustSize(next);
    rememberEntrustSize(id, next);
  }

  function changeEntrustWidth(next: number) {
    setEntrustWidth(next);
    rememberEntrustWidth(id, next);
  }

  const refreshVersions = useCallback(async () => {
    const ver = await api.listVersions(id);
    setVersions(ver.versions);
    setUncommitted(ver.uncommitted);
  }, [id]);

  const refreshTree = useCallback(async () => {
    const tree = await api.listFiles(id);
    setFiles(tree.files);
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
    const me = await api.me();
    setUser(me.user);
    const data = await api.getRequirement(id, cid);
    setTitle(data.requirement.title);
    setPrimaryRepo(data.requirement.primaryRepo);
    setRelatedRepos(data.requirement.relatedRepos);
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
        : "PRD.md";
    const file = await api.readFile(id, startPath);
    setCurrentPath(file.path);
    setContent(file.content);
    setEtag(file.etag);
    setDirty(false);
    setHistory(null);
    if (data.activeRun && (data.activeRun.status === "queued" || data.activeRun.status === "running")) {
      followSeq.current = 0;
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
      void api.heartbeatLock(id, cid, editingRef.current).then((res) => {
        setLock(res.lock);
      }).catch(() => {
        /* 预览或锁已释放 */
      });
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
      void api.readFile(id, currentPath).then((file) => {
        if (file.etag !== etag) {
          setContent(file.content);
          setEtag(file.etag);
        }
      }).catch(() => undefined);
      void refreshTree().catch(() => undefined);
      void refreshVersions().catch(() => undefined);
      void api.currentRun(id).then((res) => setActiveRun(res.run)).catch(() => undefined);
    }, 2500);
    return () => clearInterval(timer);
  }, [currentPath, etag, history, id, readOnly, refreshTree, refreshVersions]);

  const appendLog = useCallback((item: LogItem) => {
    setLog((prev) => {
      if (prev.some((x) => x.seq === item.seq && item.seq > 0)) return prev;
      return [...prev, item].slice(-80);
    });
  }, []);

  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;

  const followRun = useCallback(
    async (runId: string, after = 0) => {
      followSeq.current = after;
      const res = await fetch(
        `/v1/requirements/${id}/runs/${runId}/stream?after=${after}`,
        { credentials: "include", cache: "no-store" }
      );
      if (!res.ok || !res.body) {
        throw new Error("无法接上这一轮进度");
      }
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
          const seq = Number(payload.seq || 0);
          if (seq) followSeq.current = seq;
          if (type === "trust") {
            setTrust(String(payload.text || ""));
            appendLog({ seq, kind: "trust", text: String(payload.text || "") });
          } else if (type === "progress" || type === "text") {
            appendLog({ seq, kind: type, text: String(payload.text || "") });
          } else if (type === "tool") {
            appendLog({ seq, kind: "tool", text: `用了 ${String(payload.name || "工具")}` });
          } else if (type === "file") {
            const path = String(payload.path || "");
            appendLog({ seq, kind: "file", text: `已写入 ${path}` });
            const openPath = currentPathRef.current;
            if (path === openPath) {
              void api.readFile(id, openPath).then((file) => {
                setContent(file.content);
                setEtag(file.etag);
              });
            }
            void refreshTree();
          } else if (type === "error") {
            appendLog({ seq, kind: "error", text: String(payload.message || "失败") });
            setError(String(payload.message || "失败"));
          } else if (type === "done") {
            appendLog({
              seq,
              kind: "done",
              text: payload.ok ? "这一轮结束。" : "这一轮没有成功结束。",
            });
            await refreshVersions();
            await refreshTree();
            const cur = await api.currentRun(id);
            setActiveRun(cur.run);
            const openPath = currentPathRef.current;
            const file = await api.readFile(id, openPath);
            setContent(file.content);
            setEtag(file.etag);
          }
        }
      }
    },
    [appendLog, id, refreshTree, refreshVersions]
  );

  useEffect(() => {
    if (!activeRun || (activeRun.status !== "queued" && activeRun.status !== "running")) return;
    const runId = activeRun.id;
    void followRun(runId, followSeq.current).catch((e) => {
      setError(e instanceof Error ? e.message : "进度中断，稍后会自动跟上");
    });
    // 只跟这一轮的 id；重连用 after=seq，不要因为回调引用变化另开一条流。
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

  async function onSend(e: FormEvent) {
    e.preventDefault();
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
      const started = await api.startRun(id, { mode, message: text, clientId: cid });
      setMessage("");
      setActiveRun(started.run);
      followSeq.current = 0;
      appendLog({ seq: 0, kind: "you", text: text });
      if (entrustSize === "collapsed") changeEntrustSize("half");
    } catch (err) {
      setGate(err instanceof Error ? err.message : "没发出去");
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    if (!importText.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.importMarkdown(id, importText, "replace", cid);
      setImportText("");
      await refreshTree();
      await openFile("PRD.md", true);
      await refreshVersions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
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
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        if (!readOnly && !busy) void saveAndRecord();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!user && !error) {
    return (
      <main className="workbench-loading">
        <p className="muted">正在打开工程…</p>
      </main>
    );
  }

  return (
    <div className="workbench">
      <header className="workbench-top">
        <div>
          <Link href="/" className="muted" style={{ fontSize: 13 }}>
            ← 全部工程
          </Link>
          <h1>{title || "工程"}</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            {primaryRepo
              ? user?.role === "architect"
                ? `代码仓 ${primaryRepo.split("/").slice(-2).join("/")}`
                : "已挂代码仓"
              : "尚未挂代码仓"}
            {relatedRepos.length ? ` · 另有 ${relatedRepos.length} 个只读仓` : ""}
          </p>
        </div>
        <div className="workbench-top-meta">
          {user ? (
            <span className="muted" style={{ fontSize: 13 }}>
              {user.name} · {user.roleLabel}
            </span>
          ) : null}
          {uncommitted ? <span className="tag warn">未记入版本</span> : <span className="tag ok">已是最新版本</span>}
          {aiRunning ? <span className="tag danger">AI 进行中</span> : null}
          {youHold ? (
            <span className="tag ok">你可以改</span>
          ) : (
            <span className="tag warn">{previewReason || "预览"}</span>
          )}
          <button className="btn ghost" type="button" onClick={() => setShowVersions(true)}>
            版本
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={() => changeEntrustSize(entrustSize === "collapsed" ? "half" : "collapsed")}
          >
            {entrustSize === "collapsed" ? "展开 AI" : "收起 AI"}
          </button>
          {user?.role === "architect" && lock && !lock.youHold ? (
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                void api.forceReleaseLock(id).then(() => bootstrap());
              }}
            >
              解除编辑权
            </button>
          ) : null}
          {!youHold && !lock ? (
            <button className="btn primary" type="button" onClick={() => void bootstrap()}>
              开始编辑
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p className="workbench-banner danger">{error}</p> : null}

      <div className={`workbench-body${leftCollapsed ? " is-left-collapsed" : ""}`}>
        <aside className={`workbench-col workbench-left${leftCollapsed ? " is-collapsed" : ""}`}>
          {leftCollapsed ? (
            <button className="left-rail" type="button" onClick={() => setLeftCollapsed(false)}>
              文档仓
            </button>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>文档仓</strong>
                <button className="btn ghost" type="button" onClick={() => setLeftCollapsed(true)}>
                  收起
                </button>
              </div>
              <DocTree
                files={files}
                currentPath={currentPath}
                onOpen={(path) => void openFile(path)}
                onImport={() => setShowImport(true)}
              />
            </>
          )}
        </aside>

        <section className="workbench-col workbench-center">
          <div className="molan-toolbar">
            <strong>{history ? `旧版 · ${history.message}` : currentPath}</strong>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn ghost"
                type="button"
                disabled={readOnly || busy}
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    try {
                      const state = await molanRef.current?.getState();
                      await saveCurrent(state?.value);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "保存失败");
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                保存
              </button>
              <button
                className="btn"
                type="button"
                disabled={readOnly || busy || (!uncommitted && !dirty)}
                onClick={() => void saveAndRecord()}
              >
                保存一版
              </button>
              {history ? (
                <button className="btn ghost" type="button" onClick={() => void openFile(currentPath, true)}>
                  返回纸面
                </button>
              ) : null}
            </div>
          </div>
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
                    void api.heartbeatLock(id, cid, next).then((r) => setLock(r.lock)).catch(() => undefined);
                  }
                }}
              />
            </div>
            <EntrustLayer
              size={entrustSize}
              width={entrustWidth}
              onSizeChange={changeEntrustSize}
              onWidthChange={changeEntrustWidth}
              mode={mode}
              onModeChange={setMode}
              hasCode={hasCode}
              trust={trust}
              log={log}
              message={message}
              onMessageChange={setMessage}
              onSend={(e) => void onSend(e)}
              onCancel={() => {
                if (!activeRun) return;
                void api.cancelRun(id, activeRun.id, cid).then(() => {
                  appendLog({ seq: Date.now(), kind: "error", text: "已请求取消。" });
                });
              }}
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
          void api.readVersionFile(id, sha, currentPath).then((file) => {
            setHistory({ sha, content: file.content, message });
            setShowVersions(false);
          }).catch((e) => setError(e instanceof Error ? e.message : "打不开这一版"));
        }}
        onRestore={(sha) => {
          void api.restoreFile(id, sha, currentPath, cid).then(async () => {
            await openFile(currentPath, true);
            await refreshVersions();
            setShowVersions(false);
          }).catch((e) => setError(e instanceof Error ? e.message : "无法恢复"));
        }}
        onCompare={(newer, older) => {
          void Promise.all([
            api.readVersionFile(id, newer.id, currentPath),
            api.readVersionFile(id, older.id, currentPath),
          ]).then(([a, b]) => {
            setCompare({
              a: a.content,
              b: b.content,
              title: `${newer.message} ↔ ${older.message}`,
            });
            setShowVersions(false);
          }).catch((e) => setError(e instanceof Error ? e.message : "对比失败"));
        }}
        onRevertAi={() => {
          void api.revertLatestAi(id, cid).then(async () => {
            await openFile(currentPath, true);
            await refreshVersions();
            setShowVersions(false);
          }).catch((e) => setError(e instanceof Error ? e.message : "没能撤销"));
        }}
      />

      {gate ? (
        <div className="gate-mask" onClick={() => setGate("")}>
          <div className="gate-panel" onClick={(e) => e.stopPropagation()}>
            <p>{gate}</p>
            <div className="gate-actions">
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
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
              「保存一版」只记入并退出编辑，不会把输入框里那句话发出去。
            </p>
          </div>
        </div>
      ) : null}

      {showImport ? (
        <div className="import-mask" onClick={() => setShowImport(false)}>
          <div className="import-panel" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)", fontWeight: 500 }}>
              导入 Markdown
            </h2>
            <p className="muted">先保真写进 PRD.md。</p>
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
                  void onImport().then(() => setShowImport(false));
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
    </div>
  );
}

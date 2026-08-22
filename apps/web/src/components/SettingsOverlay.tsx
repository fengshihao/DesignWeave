"use client";

import { useEffect, useState } from "react";
import { api, type RequirementMeta, type SessionUser } from "@/lib/api";
import { HostFolderPicker } from "@/components/HostFolderPicker";

export function SettingsOverlay(props: {
  open: boolean;
  user: SessionUser;
  orphans: RequirementMeta[];
  onClose: () => void;
  onWorkspaceChange: () => void;
}) {
  const [error, setError] = useState("");
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [picker, setPicker] = useState(false);
  const [health, setHealth] = useState<{ mockMode: boolean; hasApiKey: boolean } | null>(null);
  const [config, setConfig] = useState<{
    settingsFound: boolean;
    mcpServerNames: string[];
    skills?: Array<{ name: string }>;
    language: string | null;
  } | null>(null);
  const [dirs, setDirs] = useState<
    Array<{ path: string; name: string; approved: boolean; exists: boolean; hasClaudeDir: boolean }>
  >([]);
  const [scanError, setScanError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");
    try {
      const [w, h, c, scan] = await Promise.all([
        api.workspace(),
        api.health(),
        api.claudeConfig(),
        api.listCodeDirs(),
      ]);
      setWorkspaceRoot(w.workspaceRoot || "");
      setHealth(h);
      setConfig(c);
      setDirs(scan.dirs);
      setScanError(scan.error || (!scan.found ? "未找到 ~/.claude.json" : ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }

  useEffect(() => {
    if (!props.open) return;
    void load();
  }, [props.open]);

  if (!props.open) return null;

  async function saveRoot(path: string) {
    setBusy(true);
    setError("");
    try {
      const res = await api.setWorkspaceRoot(path);
      setWorkspaceRoot(res.workspaceRoot);
      props.onWorkspaceChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "没法设定运行根目录");
    } finally {
      setBusy(false);
    }
  }

  async function saveApproved() {
    setBusy(true);
    setError("");
    try {
      const res = await api.setApprovedCodeDirs(dirs.filter((d) => d.approved).map((d) => d.path));
      setDirs(res.dirs);
      props.onWorkspaceChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "没法保存批准名单");
    } finally {
      setBusy(false);
    }
  }

  const skills = config?.skills?.map((s) => s.name) ?? [];
  const mcps = config?.mcpServerNames ?? [];

  return (
    <div className="overlay-mask" onClick={props.onClose}>
      <div className="overlay-panel settings-panel" onClick={(e) => e.stopPropagation()}>
        <header>
          <strong>设置</strong>
          <button className="btn ghost" type="button" onClick={props.onClose}>
            关闭
          </button>
        </header>
        {error ? <p className="picker-error">{error}</p> : null}

        <section>
          <h3>运行根目录</h3>
          <p className="muted">所有设计工程都建在这下面。产品经理不选代码路径。</p>
          {workspaceRoot ? <p className="path-chip"><span>{workspaceRoot}</span></p> : null}
          <button className="btn" type="button" disabled={busy} onClick={() => setPicker(true)}>
            {workspaceRoot ? "重选" : "选择运行根目录"}
          </button>
        </section>

        <section>
          <h3>代码目录</h3>
          <p className="muted">只从 ~/.claude.json 扫入。批准一部分给 AI 用；新出现的默认未批准。不能浏览磁盘补挂。</p>
          {scanError ? <p className="muted">{scanError}</p> : null}
          <ul className="code-pick-list">
            {dirs.map((d) => (
              <li key={d.path}>
                <label>
                  <input
                    type="checkbox"
                    checked={d.approved}
                    onChange={() =>
                      setDirs((prev) =>
                        prev.map((x) => (x.path === d.path ? { ...x, approved: !x.approved } : x))
                      )
                    }
                  />
                  <span>
                    {d.name}
                    {d.hasClaudeDir ? " · .claude" : ""}
                    {!d.exists ? " · 已不在磁盘" : ""}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button className="btn primary" type="button" disabled={busy} onClick={() => void saveApproved()}>
            保存批准
          </button>
        </section>

        <section>
          <h3>Claude</h3>
          <p className="muted">
            {health?.mockMode ? "演示模式，还不能找 AI。" : "本机 Claude 已就绪。"} MCP：
            {mcps.length ? mcps.join("、") : "（无）"}
            {skills.length ? ` · Skills：${skills.join("、")}` : ""}
            {config?.language ? ` · 语言：${config.language}` : ""}
          </p>
        </section>

        {props.orphans.length ? (
          <section>
            <h3>不在运行根目录下的旧工程</h3>
            <p className="muted">不会自动搬盘。把文件夹放到运行根目录后会自己出现；或从工作台拿掉。</p>
            <ul className="orphan-list">
              {props.orphans.map((o) => (
                <li key={o.id}>
                  <span>{o.title}</span>
                  <button
                    className="side-text"
                    type="button"
                    onClick={() => {
                      void api.abandonRequirement(o.id).then(() => props.onWorkspaceChange());
                    }}
                  >
                    从工作台拿掉
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <HostFolderPicker
          open={picker}
          title="选择运行根目录"
          initialPath={workspaceRoot || undefined}
          onClose={() => setPicker(false)}
          onPick={(path) => {
            setPicker(false);
            void saveRoot(path);
          }}
        />
      </div>
    </div>
  );
}

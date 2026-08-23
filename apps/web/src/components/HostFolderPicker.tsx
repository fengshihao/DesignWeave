"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

export type FolderListing = {
  path: string;
  parent: string | null;
  home: string;
  crumbs?: Array<{ label: string; path: string }>;
  entries: Array<{ name: string; path: string; isDir: boolean }>;
};

function crumbs(listing: FolderListing): Array<{ label: string; path: string }> {
  if (listing.crumbs && listing.crumbs.length > 0) return listing.crumbs;
  const sep = listing.path.includes("\\") ? "\\" : "/";
  const home = listing.home.replace(/[\\/]+$/, "");
  const current = listing.path;
  const out: Array<{ label: string; path: string }> = [];
  if (
    current === home ||
    current.startsWith(home + "/") ||
    current.startsWith(home + "\\")
  ) {
    out.push({ label: "家目录", path: home });
    const rest = current.slice(home.length).split(/[\\/]/).filter(Boolean);
    let acc = home;
    for (const part of rest) {
      acc = `${acc}${sep}${part}`;
      out.push({ label: part, path: acc });
    }
    return out;
  }
  const parts = current.split(/[\\/]/).filter(Boolean);
  let acc = /^[A-Za-z]:/.test(current) ? `${parts.shift()}${sep}` : sep;
  out.push({
    label: /^[A-Za-z]:/.test(current) ? acc.replace(/[\\/]+$/, "") : "/",
    path: /^[A-Za-z]:/.test(current) ? acc : "/",
  });
  for (const part of parts) {
    acc = acc.endsWith("/") || acc.endsWith("\\") ? `${acc}${part}` : `${acc}${sep}${part}`;
    out.push({ label: part, path: acc });
  }
  return out;
}

export function HostFolderPicker(props: {
  open: boolean;
  title?: string;
  initialPath?: string;
  onClose: () => void;
  onPick: (path: string) => void;
}) {
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [selected, setSelected] = useState("");
  const [address, setAddress] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(dir?: string) {
    setBusy(true);
    setError("");
    try {
      const next = await api.browseFs(dir);
      setListing(next);
      setSelected(next.path);
      setAddress(next.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法打开这个目录");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!props.open) return;
    void load(props.initialPath || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.initialPath]);

  if (!props.open) return null;

  async function goAddress(e: FormEvent) {
    e.preventDefault();
    await load(address.trim() || undefined);
  }

  async function makeFolder(e: FormEvent) {
    e.preventDefault();
    if (!listing || !newName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const created = await api.mkdirFs(listing.path, newName.trim());
      setListing(created.listing);
      setSelected(created.path);
      setAddress(created.listing.path);
      setNewName("");
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "新建失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="picker-mask" onClick={props.onClose}>
      <div className="picker-panel" onClick={(e) => e.stopPropagation()}>
        <header className="picker-head">
          <strong>{props.title || "选择托管机目录"}</strong>
          <button className="btn ghost" type="button" onClick={props.onClose}>
            取消
          </button>
        </header>
        <form className="picker-address" onSubmit={(e) => void goAddress(e)}>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            aria-label="目录路径"
            spellCheck={false}
          />
          <button className="btn" type="submit" disabled={busy}>
            转到
          </button>
        </form>
        {listing ? (
          <nav className="picker-crumbs" aria-label="路径">
            {crumbs(listing).map((c, i) => (
              <span key={c.path}>
                {i > 0 ? <span className="muted"> / </span> : null}
                <button type="button" onClick={() => void load(c.path)}>
                  {c.label}
                </button>
              </span>
            ))}
          </nav>
        ) : null}
        <div className="picker-list" role="list">
          {listing?.parent ? (
            <button
              type="button"
              className="picker-row"
              onDoubleClick={() => void load(listing.parent || undefined)}
              onClick={() => {
                setSelected(listing.parent || listing.path);
                setAddress(listing.parent || listing.path);
              }}
            >
              <span className="picker-icon">↑</span>
              上一级
            </button>
          ) : null}
          {listing?.entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              role="listitem"
              className={`picker-row${entry.isDir ? "" : " is-file"}${
                selected === entry.path ? " is-selected" : ""
              }`}
              disabled={!entry.isDir}
              onClick={() => {
                if (!entry.isDir) return;
                setSelected(entry.path);
                setAddress(entry.path);
              }}
              onDoubleClick={() => {
                if (entry.isDir) void load(entry.path);
              }}
            >
              <span className="picker-icon">{entry.isDir ? "📁" : "📄"}</span>
              <span>{entry.name}</span>
              {!entry.isDir ? <span className="muted">文件</span> : null}
            </button>
          ))}
          {listing && listing.entries.length === 0 ? (
            <p className="muted" style={{ padding: 12 }}>
              这里是空的。可以新建一个文件夹。
            </p>
          ) : null}
        </div>
        {error ? <p className="picker-error">{error}</p> : null}
        <footer className="picker-foot">
          {creating ? (
            <form className="picker-new" onSubmit={(e) => void makeFolder(e)}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="新文件夹名字"
                autoFocus
              />
              <button className="btn" type="submit" disabled={busy || !newName.trim()}>
                建好
              </button>
              <button className="btn ghost" type="button" onClick={() => setCreating(false)}>
                取消
              </button>
            </form>
          ) : (
            <button className="btn ghost" type="button" onClick={() => setCreating(true)}>
              新建文件夹
            </button>
          )}
          <div className="picker-actions">
            <span className="muted picker-current">当前：{selected || listing?.path}</span>
            <button
              className="btn primary"
              type="button"
              disabled={!selected}
              onClick={() => props.onPick(selected)}
            >
              使用此目录
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

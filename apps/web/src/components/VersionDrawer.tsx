"use client";

export type VersionItem = {
  id: string;
  message: string;
  author: string;
  createdAt: string;
};

export function VersionDrawer(props: {
  open: boolean;
  versions: VersionItem[];
  readOnly: boolean;
  canRevertAi: boolean;
  onClose: () => void;
  onOpen: (id: string, message: string) => void;
  onRestore: (id: string) => void;
  onCompare: (newer: VersionItem, older: VersionItem) => void;
  onRevertAi: () => void;
}) {
  if (!props.open) return null;

  return (
    <aside className="version-drawer" aria-label="版本时间线">
      <header>
        <strong>版本</strong>
        <button className="btn ghost" type="button" onClick={props.onClose}>
          关闭
        </button>
      </header>
      <ul className="timeline">
        {props.versions.map((v, idx) => (
          <li key={v.id}>
            <div>
              {v.author}：{v.message}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {v.createdAt.replace("T", " ").slice(0, 16)}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
              <button
                className="btn ghost"
                type="button"
                onClick={() => props.onOpen(v.id, v.message)}
              >
                打开
              </button>
              <button
                className="btn ghost"
                type="button"
                disabled={props.readOnly}
                onClick={() => props.onRestore(v.id)}
              >
                恢复这一篇
              </button>
              {idx < props.versions.length - 1 ? (
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => props.onCompare(v, props.versions[idx + 1])}
                >
                  对比上一版
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {props.canRevertAi ? (
        <button className="btn" type="button" style={{ marginTop: 8 }} onClick={props.onRevertAi}>
          撤销最新 AI 版
        </button>
      ) : null}
      <p className="muted" style={{ fontSize: 12 }}>
        整仓回到某一版 · 第一版先留位
      </p>
    </aside>
  );
}

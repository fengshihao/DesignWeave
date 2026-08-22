"use client";

import { FormEvent, useState } from "react";
import { api } from "@/lib/api";

export function CreateProjectPanel(props: {
  open: boolean;
  canCreate: boolean;
  blockedReason: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<"template" | "import">("template");
  const [importMd, setImportMd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!props.open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!props.canCreate) return;
    setBusy(true);
    setError("");
    try {
      const { requirement } = await api.createRequirement({
        title: title.trim(),
        source,
        importMarkdown: source === "import" ? importMd : undefined,
      });
      setTitle("");
      setImportMd("");
      setSource("template");
      props.onCreated(requirement.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setImportMd(text);
    setSource("import");
  }

  return (
    <div className="overlay-mask" onClick={props.onClose}>
      <div className="overlay-panel create-panel" onClick={(e) => e.stopPropagation()}>
        <header>
          <strong>新建工程</strong>
          <button className="btn ghost" type="button" onClick={props.onClose}>
            关闭
          </button>
        </header>
        {props.canCreate ? (
          <form onSubmit={(e) => void onSubmit(e)} className="create-form">
            <div className="field">
              <label>名称</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：设置页夜间模式"
                required
              />
            </div>
            <div className="source-switch" role="tablist">
              <button
                type="button"
                className={source === "template" ? "is-on" : ""}
                onClick={() => setSource("template")}
              >
                从模板填写
              </button>
              <button
                type="button"
                className={source === "import" ? "is-on" : ""}
                onClick={() => setSource("import")}
              >
                导入 PRD
              </button>
            </div>
            {source === "import" ? (
              <div className="field">
                <label>粘贴或上传 Markdown</label>
                <textarea
                  value={importMd}
                  onChange={(e) => setImportMd(e.target.value)}
                  placeholder="从别处复制的需求文档…"
                  required
                />
                <input
                  type="file"
                  accept=".md,.markdown,.txt"
                  onChange={(e) => void onPickFile(e.target.files?.[0])}
                />
              </div>
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                会在运行根目录下建一个同名文件夹，拷入标准文档包。不选文档目录，也不选代码仓。
              </p>
            )}
            {error ? <p className="picker-error">{error}</p> : null}
            <button className="btn primary" type="submit" disabled={busy || !title.trim()}>
              {busy ? "创建中…" : "创建并打开 README"}
            </button>
          </form>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {props.blockedReason}
          </p>
        )}
      </div>
    </div>
  );
}

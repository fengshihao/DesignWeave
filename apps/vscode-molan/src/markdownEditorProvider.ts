import * as vscode from "vscode";
import type { FrameToHostMessage, HostToFrameMessage } from "@designweave/molan-protocol";

function asFrameMessage(raw: unknown): FrameToHostMessage | null {
  if (!raw || typeof raw !== "object" || !("type" in raw)) return null;
  const type = (raw as { type?: unknown }).type;
  if (typeof type !== "string") return null;
  return raw as FrameToHostMessage;
}

export class MolanDocument implements vscode.CustomDocument {
  readonly uri: vscode.Uri;
  content: string;
  restoredFromBackup = false;
  private readonly _onDidDispose = new vscode.EventEmitter<void>();
  readonly onDidDispose = this._onDidDispose.event;

  constructor(uri: vscode.Uri, content: string) {
    this.uri = uri;
    this.content = content;
  }

  static async create(
    uri: vscode.Uri,
    backupId: string | undefined,
  ): Promise<MolanDocument> {
    const source = backupId ? vscode.Uri.parse(backupId) : uri;
    const data = await vscode.workspace.fs.readFile(source);
    const content = new TextDecoder("utf-8").decode(data);
    const document = new MolanDocument(uri, content);
    document.restoredFromBackup = Boolean(backupId);
    return document;
  }

  dispose(): void {
    this._onDidDispose.fire();
    this._onDidDispose.dispose();
  }
}

export class MolanEditorProvider implements vscode.CustomEditorProvider<MolanDocument> {
  static readonly viewType = "molan.markdownEditor";
  private static instance: MolanEditorProvider | undefined;

  private readonly _onDidChangeCustomDocument =
    new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<MolanDocument>>();
  readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  private readonly panels = new Map<string, vscode.WebviewPanel>();

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new MolanEditorProvider(context);
    MolanEditorProvider.instance = provider;
    return vscode.window.registerCustomEditorProvider(
      MolanEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    );
  }

  static postToActive(type: "find" | "findNext" | "findPrev"): void {
    const provider = MolanEditorProvider.instance;
    if (!provider) return;
    for (const panel of provider.panels.values()) {
      if (panel.active) {
        void panel.webview.postMessage({ type });
        return;
      }
    }
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<MolanDocument> {
    const document = await MolanDocument.create(uri, openContext.backupId);
    if (document.restoredFromBackup) {
      queueMicrotask(() => this._onDidChangeCustomDocument.fire({ document }));
    }
    return document;
  }

  async resolveCustomEditor(
    document: MolanDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const key = document.uri.toString();
    this.panels.set(key, webviewPanel);

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: this.getLocalRoots(document),
    };
    webviewPanel.webview.html = this.getHtml(webviewPanel.webview, document);

    const fileName = this.fileName(document.uri);
    let ready = false;

    const sendInit = () => {
      const msg: HostToFrameMessage = {
        type: "init",
        value: document.content,
        fileName,
        dirty: document.restoredFromBackup,
      };
      void webviewPanel.webview.postMessage(msg);
    };

    const changeSub = webviewPanel.webview.onDidReceiveMessage(async (raw) => {
      const msg = asFrameMessage(raw);
      if (!msg) return;
      if (msg.type === "ready") {
        ready = true;
        sendInit();
        return;
      }
      if (msg.type === "change") {
        // Vditor setValue/getValue 往返可能规范化 Markdown；webview 已过滤，这里再挡一层。
        if (msg.value === document.content) return;
        document.content = msg.value;
        this._onDidChangeCustomDocument.fire({ document });
        return;
      }
      if (msg.type === "save") {
        await vscode.commands.executeCommand("workbench.action.files.save");
        return;
      }
      if (msg.type === "openRelative") {
        await this.openRelativeMarkdown(document.uri, msg.value);
        return;
      }
      if (msg.type === "openExternal") {
        await vscode.env.openExternal(vscode.Uri.parse(msg.value));
      }
    });

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.joinPath(document.uri, ".."), this.fileName(document.uri)),
    );
    const reloadIfClean = async () => {
      const panel = this.panels.get(key);
      if (!panel) return;
      const data = await vscode.workspace.fs.readFile(document.uri);
      const text = new TextDecoder("utf-8").decode(data);
      if (text === document.content) return;
      // 有未保存更改时不覆盖正在编辑的内容
      const dirty = vscode.window.tabGroups.all
        .flatMap((g) => g.tabs)
        .some((tab) => {
          const input = tab.input as { uri?: vscode.Uri } | undefined;
          return input?.uri?.toString() === key && tab.isDirty;
        });
      if (dirty) return;
      document.content = text;
      if (ready) {
        const msg: HostToFrameMessage = {
          type: "setContent",
          value: text,
          fileName,
          dirty: false,
        };
        void panel.webview.postMessage(msg);
      }
    };
    watcher.onDidChange(() => { void reloadIfClean(); });

    webviewPanel.onDidDispose(() => {
      changeSub.dispose();
      watcher.dispose();
      this.panels.delete(key);
    });
  }

  async saveCustomDocument(
    document: MolanDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    await this.writeFile(document.uri, document.content);
    const panel = this.panels.get(document.uri.toString());
    if (panel) {
      const msg: HostToFrameMessage = { type: "saved" };
      void panel.webview.postMessage(msg);
    }
  }

  async saveCustomDocumentAs(
    document: MolanDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    await this.writeFile(destination, document.content);
  }

  async revertCustomDocument(
    document: MolanDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const data = await vscode.workspace.fs.readFile(document.uri);
    document.content = new TextDecoder("utf-8").decode(data);
    const panel = this.panels.get(document.uri.toString());
    if (panel) {
      const msg: HostToFrameMessage = {
        type: "setContent",
        value: document.content,
        fileName: this.fileName(document.uri),
        dirty: false,
      };
      void panel.webview.postMessage(msg);
    }
  }

  async backupCustomDocument(
    document: MolanDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    await this.writeFile(context.destination, document.content);
    return {
      id: context.destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(context.destination);
        } catch {
          /* ignore */
        }
      },
    };
  }

  private async writeFile(uri: vscode.Uri, text: string): Promise<void> {
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
  }

  private fileName(uri: vscode.Uri): string {
    const parts = uri.path.split("/");
    return parts[parts.length - 1] || uri.path;
  }

  private async openRelativeMarkdown(from: vscode.Uri, href: string): Promise<void> {
    const pathPart = href.split("#")[0].split("?")[0].trim();
    if (!pathPart) return;
    const segments = pathPart.replace(/\\/g, "/").split("/").filter((s) => s && s !== ".");
    if (!segments.length) return;
    const target = vscode.Uri.joinPath(from, "..", ...segments);
    try {
      await vscode.workspace.fs.stat(target);
    } catch {
      void vscode.window.showWarningMessage(`找不到「${this.fileName(target)}」`);
      return;
    }
    await vscode.commands.executeCommand("vscode.openWith", target, MolanEditorProvider.viewType);
  }

  private getLocalRoots(document: MolanDocument): vscode.Uri[] {
    const roots = [vscode.Uri.joinPath(this.context.extensionUri, "media")];
    if (vscode.workspace.workspaceFolders?.length) {
      roots.push(...vscode.workspace.workspaceFolders.map((folder) => folder.uri));
    }
    roots.push(vscode.Uri.joinPath(document.uri, ".."));
    return roots;
  }

  private getHtml(webview: vscode.Webview, document: MolanDocument): string {
    const nonce = getNonce();
    const media = vscode.Uri.joinPath(this.context.extensionUri, "media");
    const vditorRoot = vscode.Uri.joinPath(media, "vditor");
    const molanCss = webview.asWebviewUri(vscode.Uri.joinPath(media, "molan.css"));
    const vditorCss = webview.asWebviewUri(vscode.Uri.joinPath(vditorRoot, "dist", "index.css"));
    const vditorMethodJs = webview.asWebviewUri(vscode.Uri.joinPath(vditorRoot, "dist", "method.min.js"));
    const vditorLuteJs = webview.asWebviewUri(vscode.Uri.joinPath(vditorRoot, "dist", "js", "lute", "lute.min.js"));
    const vditorIconsJs = webview.asWebviewUri(vscode.Uri.joinPath(vditorRoot, "dist", "js", "icons", "ant.js"));
    const editorJs = webview.asWebviewUri(vscode.Uri.joinPath(media, "molan-editor.js"));
    const bridgeJs = webview.asWebviewUri(vscode.Uri.joinPath(media, "vscode-bridge.js"));
    const vditorCdn = webview.asWebviewUri(vditorRoot).toString();
    const linkBase = `${webview.asWebviewUri(vscode.Uri.joinPath(document.uri, "..")).toString()}/`;
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data: blob: https: http:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource} data:`,
      `script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval'`,
      `connect-src ${webview.cspSource}`,
      `worker-src ${webview.cspSource} blob:`,
      `child-src blob:`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="zh-CN" class="molan-host-vscode" data-theme="night">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>墨览</title>
  <script nonce="${nonce}">
    (function () {
      try {
        var t = localStorage.getItem("molan-theme");
        if (t === "night" || t === "hack" || t === "rose" || t === "xuan") {
          document.documentElement.setAttribute("data-theme", t);
        }
      } catch (e) {}
    })();
  </script>
  <link rel="preload" href="${vditorLuteJs}" as="script" />
  <link rel="preload" href="${vditorMethodJs}" as="script" />
  <link rel="stylesheet" href="${vditorCss}" />
  <link rel="stylesheet" href="${molanCss}" />
</head>
<body class="molan-host-vscode">
  <div class="app">
    <main class="main">
      <header class="reader-header">
        <div class="reader-title">
          <h2 id="readerTitle">墨览</h2>
        </div>
        <div class="reader-actions">
          <button class="icon-btn molan-find-btn" id="molanFindBtn" type="button" title="在文档中查找" aria-label="在文档中查找">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/>
              <path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
          <button class="icon-btn" id="copyBtn" type="button" title="复制原文" aria-label="复制原文">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2"/><rect x="4" y="8" width="12" height="12" rx="2"/></svg>
          </button>
          <button class="icon-btn is-preview" id="modeBtn" type="button" title="编辑" aria-label="编辑">
            <svg class="icon-edit" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
            <svg class="icon-preview" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.8-7 9.5-7 9.5 7 9.5 7-3.8 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <div class="type-prefs" id="typePrefs">
            <button class="icon-btn" id="typeBtn" type="button" title="调节字号与行距" aria-label="排版" aria-expanded="false" aria-haspopup="dialog" aria-controls="typeMenu">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.6 19L8.2 5.5h1.7L14.5 19"/><path d="M5.4 13.6h7.2"/><path d="M16.4 19l2.6-8h1.1L22.6 19"/><path d="M17.5 15.6h4.1"/></svg>
            </button>
          </div>
          <div class="header-prefs" id="headerPrefs">
            <button class="icon-btn" id="headerPrefsBtn" type="button" title="界面配置" aria-label="界面配置" aria-expanded="false" aria-haspopup="dialog" aria-controls="headerPrefsMenu">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7.5h16M4 16.5h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <circle cx="9" cy="7.5" r="2.1" fill="currentColor"/>
                <circle cx="15" cy="16.5" r="2.1" fill="currentColor"/>
              </svg>
            </button>
            <div class="theme-menu" id="headerPrefsMenu" hidden role="dialog" aria-label="界面配置">
              <div class="type-head">纸面</div>
              <div class="theme-switch" id="themeSwitch" role="radiogroup" aria-label="界面样式">
                <button type="button" role="radio" data-theme="xuan" title="宣纸 · 暖色纸面" aria-label="宣纸" aria-checked="false">
                  <svg viewBox="0 0 32 32" aria-hidden="true"><circle class="theme-ring" cx="16" cy="16" r="14.25"/><circle class="theme-fill" cx="16" cy="16" r="10"/></svg>
                </button>
                <button type="button" role="radio" data-theme="night" title="墨夜 · 暗色夜读" aria-label="墨夜" aria-checked="true">
                  <svg viewBox="0 0 32 32" aria-hidden="true"><circle class="theme-ring" cx="16" cy="16" r="14.25"/><circle class="theme-fill" cx="16" cy="16" r="10"/></svg>
                </button>
                <button type="button" role="radio" data-theme="hack" title="终端 · 程序员" aria-label="终端" aria-checked="false">
                  <svg viewBox="0 0 32 32" aria-hidden="true"><circle class="theme-ring" cx="16" cy="16" r="14.25"/><circle class="theme-fill" cx="16" cy="16" r="10"/></svg>
                </button>
                <button type="button" role="radio" data-theme="rose" title="胭脂 · 柔粉纸面" aria-label="胭脂" aria-checked="false">
                  <svg viewBox="0 0 32 32" aria-hidden="true"><circle class="theme-ring" cx="16" cy="16" r="14.25"/><circle class="theme-fill" cx="16" cy="16" r="10"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>
      <div class="reader-body">
        <div class="editor-wrap visible" id="editorWrap">
          <div class="molan-preview vditor-preview" id="molanPreview">
            <div class="vditor-reset" id="molanPreviewBody"></div>
          </div>
          <div id="vditor"></div>
        </div>
      </div>
      <footer class="status-bar">
        <span id="statusLeft">墨览</span>
        <span id="statusRight">VS Code · 写回原文件</span>
      </footer>
    </main>
  </div>
  <div class="toast" id="toast" role="status"></div>
  <div class="lightbox" id="lightbox" aria-hidden="true">
    <div class="lightbox-panel" role="dialog" aria-modal="true" aria-label="流程图观看">
      <div class="lightbox-bar">
        <div>
          <strong>流程图观看</strong>
          <span class="hint">拖动平移 · 滚轮缩放 · Esc 关闭</span>
        </div>
        <div class="lightbox-actions">
          <button class="icon-btn" type="button" id="lightboxZoomOut" title="缩小" aria-label="缩小">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M8 11h6M21 21l-4.3-4.3"/></svg>
          </button>
          <button class="icon-btn" type="button" id="lightboxZoomIn" title="放大" aria-label="放大">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M21 21l-4.3-4.3"/></svg>
          </button>
          <button class="icon-btn" type="button" id="lightboxReset" title="复位" aria-label="复位">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
          </button>
          <button class="icon-btn" type="button" id="lightboxCopyImage" title="复制图片" aria-label="复制图片">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M3 16l5-4 4 3 3-2 6 5"/></svg>
          </button>
          <button class="icon-btn" type="button" id="lightboxClose" title="关闭" aria-label="关闭">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
      </div>
      <div class="lightbox-stage" id="lightboxStage">
        <div class="lightbox-canvas" id="lightboxCanvas"></div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    window.__MOLAN_VDITOR_CDN__ = ${JSON.stringify(vditorCdn)};
    window.__MOLAN_LINK_BASE__ = ${JSON.stringify(linkBase)};
  </script>
  <script nonce="${nonce}" id="vditorIconScript" src="${vditorIconsJs}"></script>
  <script nonce="${nonce}" src="${vditorMethodJs}"></script>
  <script nonce="${nonce}" src="${editorJs}"></script>
  <script nonce="${nonce}" src="${bridgeJs}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

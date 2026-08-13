import * as vscode from "vscode";

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

  private readonly _onDidChangeCustomDocument =
    new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<MolanDocument>>();
  readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  private readonly panels = new Map<string, vscode.WebviewPanel>();

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      MolanEditorProvider.viewType,
      new MolanEditorProvider(context),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    );
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
      void webviewPanel.webview.postMessage({
        type: "init",
        value: document.content,
        fileName,
        dirty: document.restoredFromBackup,
      });
    };

    const changeSub = webviewPanel.webview.onDidReceiveMessage(async (msg: { type?: string; value?: string }) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "ready") {
        ready = true;
        sendInit();
        return;
      }
      if (msg.type === "change" && typeof msg.value === "string") {
        // Vditor setValue/getValue 往返可能规范化 Markdown；webview 已过滤，这里再挡一层。
        if (msg.value === document.content) return;
        document.content = msg.value;
        this._onDidChangeCustomDocument.fire({ document });
        return;
      }
      if (msg.type === "save") {
        await vscode.commands.executeCommand("workbench.action.files.save");
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
        void panel.webview.postMessage({
          type: "setContent",
          value: text,
          fileName,
          dirty: false,
        });
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
      void panel.webview.postMessage({ type: "saved" });
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
      void panel.webview.postMessage({
        type: "setContent",
        value: document.content,
        fileName: this.fileName(document.uri),
        dirty: false,
      });
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
    const vditorJs = webview.asWebviewUri(vscode.Uri.joinPath(vditorRoot, "dist", "index.min.js"));
    const editorJs = webview.asWebviewUri(vscode.Uri.joinPath(media, "molan-editor.js"));
    const bridgeJs = webview.asWebviewUri(vscode.Uri.joinPath(media, "vscode-bridge.js"));
    const vditorCdn = webview.asWebviewUri(vditorRoot).toString();
    const linkBase = `${webview.asWebviewUri(vscode.Uri.joinPath(document.uri, "..")).toString()}/`;
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data: blob: https:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource} data:`,
      `script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval'`,
      `connect-src ${webview.cspSource}`,
      `worker-src ${webview.cspSource} blob:`,
      `child-src blob:`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="zh-CN" class="molan-host-vscode">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>墨览</title>
  <link rel="stylesheet" href="${vditorCss}" />
  <link rel="stylesheet" href="${molanCss}" />
</head>
<body class="molan-host-vscode">
  <div class="app">
    <main class="main">
      <header class="reader-header">
        <div class="reader-title">
          <div class="eyebrow" id="readerEyebrow">准备就绪</div>
          <h2 id="readerTitle">墨览</h2>
        </div>
        <div class="reader-actions">
          <button class="chip" id="modeBtn" type="button">预览</button>
          <button class="chip" id="copyBtn" type="button">复制原文</button>
        </div>
      </header>
      <div class="reader-body">
        <div class="editor-wrap visible" id="editorWrap">
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
  <script nonce="${nonce}" src="${vditorJs}"></script>
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

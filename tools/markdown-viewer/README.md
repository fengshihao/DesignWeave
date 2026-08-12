# 墨览 · 本地 Markdown 工作室

所见即所得（Vditor IR，类 Typora）编辑本地 Markdown。公式、Mermaid 流程图、表格与任务列表均可编辑；Chrome / Edge 可写回原文件。

## 浏览器打开

用本地静态服务器打开本目录（直接 `file://` 时部分浏览器会限制模块与目录 API）：

```bash
# 在仓库根目录
python3 -m http.server 8765 --directory tools/markdown-viewer
```

浏览器访问 http://localhost:8765 。Chrome 用「选择文件夹」可写回；Cursor 内置浏览器请用「兼容模式选文件夹」。

样例文档：`sample.md`。

## VS Code / Cursor 扩展

同一套编辑器已包装为扩展，点击 Markdown 文件即可打开：见 [`apps/vscode-molan/README.md`](../../apps/vscode-molan/README.md)。

共享资源：

- `molan.css` — 纸面样式与 Vditor 主题
- `molan-editor.js` — Vditor / Mermaid / 灯箱
- `molan-app.js` — 仅浏览器：选文件夹、侧栏、File System Access

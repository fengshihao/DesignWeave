# 墨览 · 本地 Markdown 工作室

所见即所得（Vditor IR，类 Typora）编辑本地 Markdown。公式、Mermaid 流程图、表格与任务列表均可编辑；Chrome / Edge 可写回原文件。

打开本目录下的 `index.html`（或用本地静态服务器）。Chrome / Edge 用「选择文件夹」可写回。Cursor 内置浏览器会显示「兼容模式选文件夹」；普通浏览器可加 `?debug=1` 或 `localStorage.molan-debug = "1"` 显示该按钮。样例：`sample.md`。

侧栏可切换四种纸面：**宣纸**（默认暖色）、**墨夜**（暗色夜读）、**终端**（磷光绿，程序员）、**胭脂**（柔粉衬线）。选择会记在本机。

界面语言按浏览器自动选择，也可在侧栏手动切换：简体中文、繁體中文、English、日本語、한국어、Español、Français、Deutsch、Português、Русский、العربية。

```bash
pnpm molan            # 停旧后启动 http://127.0.0.1:5500/ 并打开浏览器
pnpm molan:stop       # 仅停止
MOLAN_PORT=5600 pnpm molan   # 自定义端口
```

```text
index.html        页面结构
molan.css         纸面样式与 Vditor 主题（浏览器与 VS Code 共用）
molan-i18n.js     界面多语言
molan-aphorisms.js 开卷一则：无署名短句
molan-editor.js   编辑器核心：Vditor / Mermaid / 灯箱（共用）
molan-app.js      仅浏览器：选文件夹、侧栏、写回本地
```

## VS Code / Cursor 扩展

编译扩展时把 `molan.css` 和 `molan-editor.js` 拷进 webview，点击 Markdown 即可打开。见 [`apps/vscode-molan/README.md`](../../apps/vscode-molan/README.md)。

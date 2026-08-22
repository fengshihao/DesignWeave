# DesignWeave

当前重点是 **[墨览（Molan）](https://molan.guoyoutech.cn/extension.html)**：一套开源的 Markdown 阅读 / 编辑器。点开即可阅读，需要时再编辑，保存写回原文件。

产品设计工作台的现行设计见 [`doc/18-工程目录与标准PRD.md`](doc/18-工程目录与标准PRD.md)；文档目录从 [`doc/README.md`](doc/README.md) 读起。

## 墨览 Markdown

墨览用 Vditor IR（类 Typora）渲染 Markdown。同一套核心同时用于：

- **Cursor / VS Code 扩展**：安装后点击 `.md` 即用墨览打开
- **浏览器工作室**：本地打开文件夹，Chrome / Edge 可写回原文件

许可证：[MIT](apps/vscode-molan/LICENSE)

![墨览：打开即阅读，要点再编辑](https://molan.guoyoutech.cn/intro.gif)

### 能力

- 打开默认**预览**，点「编辑」进入即时渲染；未改动关闭不询问保存
- 公式、Mermaid 流程图、表格、任务列表、代码块
- 流程图可放大观看（拖动、滚轮缩放），也可复制源码或图片
- 四种纸面：宣纸、墨夜（默认）、终端、胭脂
- 预览可调字号、行距、段距、字距，选择记在本机
- 文中查找（`Cmd/Ctrl+F`）
- 界面多语言（简体中文、繁體中文、English、日本語、한국어 等）
- 内置裁剪后的 Vditor，打开文件不依赖外网 CDN

### 安装扩展

- Cursor（[Open VSX](https://open-vsx.org/extension/fengshihao/molan-markdown)）：`fengshihao.molan-markdown`
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=fengshihao.molan-markdown)
- 介绍页：https://molan.guoyoutech.cn/extension.html

源码：[`apps/vscode-molan`](apps/vscode-molan)（用户说明见 [README](apps/vscode-molan/README.md)）。

### 本机运行工作室

需要 Node.js 20+、pnpm 8+。

```bash
pnpm install
pnpm molan            # http://127.0.0.1:5500/
pnpm molan:stop
```

工作室源码在 [`tools/markdown-viewer`](tools/markdown-viewer)。浏览器教程：https://molan.guoyoutech.cn/guide.html

![墨览工作室：试读示例，切换纸面](tools/markdown-viewer/studio-intro.gif)

### 开发扩展

```bash
pnpm vscode:molan             # 编译
pnpm vscode:molan:package     # 生成 .vsix
pnpm vscode:molan:install     # 打包并安装到本机 Cursor / VS Code
pnpm molan:publish            # 腾讯云 + Open VSX；打开 VS Code 商店管理页
```

仓库根目录按 `F5`（「运行墨览扩展」）。开发说明见 [`apps/vscode-molan/DEV.md`](apps/vscode-molan/DEV.md)。

### 目录

```text
tools/markdown-viewer/   浏览器工作室与编辑器核心（样式、Vditor、写回本地）
apps/vscode-molan/       VS Code / Cursor 扩展（编译时拷入上述核心）
```

## 产品设计工作台

给产品 / 设计用的本机服务器（墨览改标准 PRD 文档包 + Claude Agent 读已批准的代码目录）。

- 现行产品设计：[doc/18-工程目录与标准PRD.md](doc/18-工程目录与标准PRD.md)
- 文档入口：[doc/README.md](doc/README.md)

相关代码在 `apps/web`、`apps/agent` 与 `packages/`。未按 18 改代码之前，Web 仍是旧探针壳。

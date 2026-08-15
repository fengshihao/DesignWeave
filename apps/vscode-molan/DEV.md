# 墨览扩展 · 开发说明

商店详情页用的是 `README.md`（面向普通用户）。本文件只给开发者。

## 本机调试

在仓库根目录：

```bash
pnpm install
pnpm vscode:molan
```

用 VS Code / Cursor 打开本仓库，按 `F5`（启动配置「运行墨览扩展」），在 Extension Development Host 里点任意 Markdown 文件。

## 打包

```bash
pnpm vscode:molan:package   # 生成 .vsix
pnpm vscode:molan:install   # 打包后装到本机 Cursor / VS Code
```

`.vsix` 落在 `apps/vscode-molan/`。也可手动安装：

```bash
code --install-extension apps/vscode-molan/molan-markdown-0.1.6.vsix
# Cursor：
cursor --install-extension apps/vscode-molan/molan-markdown-0.1.6.vsix
```

## 实现要点

- 自定义编辑器 viewType：`molan.markdownEditor`，`priority: default`
- 与浏览器工作室共用 `tools/markdown-viewer` 的 `molan.css` + `molan-editor.js`；编译时拷贝进扩展
- 内置裁剪后的 Vditor 3.10.9（Lute + Mermaid + KaTeX + highlight），不依赖外网 CDN
- 撤销由 Vditor 处理；VS Code 负责脏状态、保存、热退出备份
- 打开默认预览；点「编辑」再改。`setValue`/`getValue` 往返不标脏，只有真正编辑才询问保存

填表与发布见 `MARKETPLACE.md`。

商店截图依赖 GitHub 公开地址。打包脚本已带 `--baseImagesUrl`（指向 `apps/vscode-molan`）。仓库若保持 Private，市场页仍然看不到图，需要把仓库改为 Public。

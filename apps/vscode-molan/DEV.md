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
pnpm molan:publish          # 网站 + Open VSX；打开 VS Code 商店管理页
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
- 打开默认预览：先加载 `method.min.js` + 预载 Lute；点「编辑」再加载完整 `index.min.js`
- 撤销由 Vditor 处理；VS Code 负责脏状态、保存、热退出备份
- 打开默认预览；点「编辑」再改。`setValue`/`getValue` 往返不标脏，只有真正编辑才询问保存

## 待做

- **行首「+」插入块**（预览 / 编辑都可用）。悬停块左侧出现按钮，点开菜单插入标题、列表、代码、表格、公式、流程图等。实现见 `tools/markdown-viewer/molan-editor.js` 的 `bindBlockInsert`。不要把按钮做进 IR DOM。
- **输入 `/` 弹出插入菜单**（后做）。Vditor 没有内置 slash，可用 `hint.extend`（`key: "/"`）。只在行首触发、避开 `https://`、`value` 不要以 `/` 开头。对照见 [doc/14-行首加号插入块调研.md](../../doc/14-行首加号插入块调研.md)。

填表与发布见 `MARKETPLACE.md`。

商店介绍动画用 `https://molan.guoyoutech.cn/intro.gif`。打包脚本 `--baseImagesUrl` 指向该站点。更新 GIF 后先 `bash tools/markdown-viewer/deploy/upload.sh`，再发新版扩展。看访问量：`bash tools/markdown-viewer/deploy/intro-stats.sh`。

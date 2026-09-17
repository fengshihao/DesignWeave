# DesignWeave

<p align="center">
  <img src="branding/icon-512.png" width="128" height="128" alt="DesignWeave">
</p>

给产品 / 设计 / 测试用的本机工作台：在文档里圈一块、说一句，AI 改 Markdown。人不用面对终端、源码树和 prompt。

现行设计从 [`doc/README.md`](doc/README.md) 读起：工程模型见 [`doc/18-工程目录与标准PRD.md`](doc/18-工程目录与标准PRD.md)，托付交互见 [`doc/19-对文档批注托付.md`](doc/19-对文档批注托付.md)。

## 墨览已独立开源

以前放在本仓的 **墨览**（Markdown 纸面、浏览器工作室、Cursor / VS Code 扩展）已整仓迁出，不再在此维护源码。

| 你要找的 | 去哪 |
|----------|------|
| 源码与贡献 | [github.com/fengshihao/molan](https://github.com/fengshihao/molan) |
| 官网 / 试读 | [fengshihao.github.io/molan](https://fengshihao.github.io/molan/) · [molan.guoyoutech.cn](https://molan.guoyoutech.cn/) |
| 扩展（Cursor / VS Code） | 搜索 `fengshihao.molan-markdown`，或 [Open VSX](https://open-vsx.org/extension/fengshihao/molan-markdown) / [Marketplace](https://marketplace.visualstudio.com/items?itemName=fengshihao.molan-markdown) |
| 本仓里的旧路径 | `apps/vscode-molan`、`tools/markdown-viewer`、`packages/molan-*` → 均已删除；说明见 [`doc/16-墨览现状.md`](doc/16-墨览现状.md) |

本工作台仍**使用**墨览做纸面，但把它当外部依赖（并列目录 `../molan`），不是子项目。

## 本机运行

需要 Node.js 20+、pnpm 8+。Windows 请安装 [Git for Windows](https://git-scm.com/download/win)（自带 Git Bash）；`pnpm dev` 会自动找 bash。

工作台依赖并列的开源纸面 [墨览（molan）](https://github.com/fengshihao/molan)，请先准备好：

```bash
git clone https://github.com/fengshihao/molan.git ../molan
cd ../molan && pnpm install && pnpm build

cd ../DesignWeave
pnpm install
pnpm dev              # Web :3100 · Agent :8787
pnpm stop
```

## 仓库结构

| 路径 | 作用 |
|------|------|
| `apps/web` | 工作台前端 |
| `apps/agent` | 本机 Agent 服务 |
| `packages/` | schema、prompts 等共享包 |
| `doc/` | 产品与工程文档 |

纸面相关开发请到 [fengshihao/molan](https://github.com/fengshihao/molan)；本仓只通过 `file:../molan` 引用 `@molan/host` / `@molan/protocol`。

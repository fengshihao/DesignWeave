# VS Code Marketplace 填表用

下面字段可直接粘贴。发布前把 `package.json` 里的 `publisher` 改成你在市场注册的 **Publisher ID**（必须完全一致）。

## 市场网页表单

| 字段 | 填写 |
|------|------|
| Publisher ID | `designweave`（若已被占用，改成你的 ID，并同步改 `package.json`） |
| Extension ID / name | `molan-markdown` |
| Display name / 显示名称 | 墨览 Markdown |
| Short description / 简短说明 | 用墨览所见即所得编辑器打开 Markdown。点击 .md 即可编辑，Cmd/Ctrl+S 写回原文件。 |
| Categories / 分类 | Other |
| Tags / 标签 | markdown, vditor, wysiwyg, 墨览, mermaid, typora |
| Version | 0.1.0 |
| License | MIT |
| Repository | https://github.com/fengshihao/DesignWeave.git |
| Homepage | https://github.com/fengshihao/DesignWeave/tree/main/apps/vscode-molan |
| Bugs / Issues | https://github.com/fengshihao/DesignWeave/issues |
| Q&A | Marketplace（默认） |
| Gallery banner color | `#1E2A24`（深苔绿，暗色） |

## 资源文件（本目录）

| 用途 | 文件 | 规格 |
|------|------|------|
| 扩展图标（必填） | `icon.png` | 128×128 PNG |
| 高清原图（备用） | `media/icon-1024.png` | 1024×1024，市场网页若要更大图用这个 |
| 商店截图 | `media/screenshot.png` | 已写进 README，会随 VSIX 上传 |
| 许可证 | `LICENSE` | MIT |
| 更新日志 | `CHANGELOG.md` | 0.1.0 |

完整介绍就是 README，市场详情页会自动用它，不用再抄一遍。

## 发布命令

1. 打开 https://marketplace.visualstudio.com/manage 用 Microsoft 账号创建 Publisher（ID 与 `package.json` 的 `publisher` 一致）。
2. 在 Azure DevOps 建 PAT，授权 **Marketplace → Manage**。
3. 本机：

```bash
cd apps/vscode-molan
pnpm compile
npx @vscode/vsce login designweave
npx @vscode/vsce publish
```

只打包不发布：

```bash
pnpm --filter molan-markdown package
```

Cursor 用户走 Open VSX（另一套账号）：https://open-vsx.org/ ，用 `npx ovsx publish molan-markdown-0.1.0.vsix -p <token>`。

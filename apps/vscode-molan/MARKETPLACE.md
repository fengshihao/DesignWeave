# VS Code Marketplace 填表用

下面字段可直接粘贴。`package.json` 的 Publisher ID 已设为 `fengshihao`。

## 市场网页表单

| 字段 | 填写 |
|------|------|
| Publisher ID | `fengshihao` |
| Extension ID / name | `molan-markdown` |
| Display name / 显示名称 | 墨览 Markdown |
| Short description / 简短说明 | 用墨览打开 Markdown：点开即可阅读，需要时再编辑，保存写回原文件。 |
| Categories / 分类 | Other |
| Tags / 标签 | markdown, vditor, wysiwyg, 墨览, mermaid, typora |
| Version | 0.1.10 |
| License | MIT |
| Repository | https://github.com/fengshihao/DesignWeave.git |
| Homepage | https://molan.guoyoutech.cn/extension.html |
| Bugs / Issues | https://github.com/fengshihao/DesignWeave/issues |
| Q&A | Marketplace（默认） |
| Gallery banner color | `#1E2A24`（深苔绿，暗色） |

## 资源文件（本目录）

| 用途 | 文件 | 规格 |
|------|------|------|
| 扩展图标（必填） | `icon.png` | 128×128 PNG |
| 高清原图（备用） | `media/icon-1024.png` | 1024×1024，市场网页若要更大图用这个 |
| 商店介绍动画 | `media/intro.gif` | 1280×800，约 2MB，写入 README |
| 商店截图 | `media/screenshot.jpg` | 已压缩 JPEG，备用静帧 |
| 许可证 | `LICENSE` | MIT |
| 更新日志 | `CHANGELOG.md` | 0.1.10 |

完整介绍就是 `README.md`（面向普通用户，市场详情页会自动用它）。开发调试见 `DEV.md`。

商店 README 里的截图**不会**从 vsix 里读，而是去拉 GitHub 上的公开 HTTPS 地址。本扩展在仓库子目录，打包时必须带 `--baseImagesUrl .../apps/vscode-molan`（已写进 `package.json` 脚本）。仓库需为 Public，商店才能显示截图。

## 发布命令

1. 打开 https://marketplace.visualstudio.com/manage ，Publisher ID 为 `fengshihao`。
2. 在 Azure DevOps 建 PAT：Organization 选 **All accessible organizations**，Scope 选 **Marketplace → Manage**。
3. 本机或交给 Agent 发布：

```bash
cd apps/vscode-molan
pnpm compile
# 有令牌后：
npx @vscode/vsce publish --no-dependencies --baseContentUrl https://github.com/fengshihao/DesignWeave/blob/main/apps/vscode-molan --baseImagesUrl https://github.com/fengshihao/DesignWeave/raw/main/apps/vscode-molan -p "$VSCE_PAT"
```

只打包不发布：

```bash
pnpm --filter molan-markdown package
```

Cursor 用户走 Open VSX（另一套账号）：https://open-vsx.org/ ，用 `npx ovsx publish molan-markdown-0.1.10.vsix -p "$OVSX_PAT"`。

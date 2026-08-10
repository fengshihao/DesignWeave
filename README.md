# DesignWeave

公司内部端到端交付工作台（**中文优先**）。先帮助软件设计师产出高质量 PRD，再衔接架构师 SR 与测试方案。

## 能力概览

| 阶段 | 角色 | 状态 |
|------|------|------|
| 设计 | 软件设计师：共创 / 细化 / 拷问 / 自洽检查 | MVP 可用 |
| 架构 | 技术方案、代码仓可行性、拆分 SR | 骨架已预留 |
| 测试 | 测试方案与用例建议 | 骨架已预留 |

AI 层通过 **Claude Agent SDK**（`@anthropic-ai/claude-agent-sdk`）运行。未配置 `ANTHROPIC_API_KEY` 时自动进入**演示模式**，可先跑通界面与文档流。

## 环境要求

- Node.js 20+
- pnpm 8+
- （可选）Anthropic API Key

## 本机启动

```bash
cp .env.example .env
pnpm install
pnpm --filter @designweave/schema build
pnpm --filter @designweave/prompts build
pnpm dev
```

- Web：http://localhost:3100  
- Agent：http://localhost:8787/health  

当前主路径：首页选 Claude 已知工程 → 新建需求（可粘贴导入 Markdown）→ 引导共创 / 文档 / 追问完善。文档落在主仓 `.designweave/requirements/` 或 `data/inbox/`。


## Docker（内网机器）

```bash
cp .env.example .env
# 配置 ANTHROPIC_API_KEY
docker compose up --build
```

数据落在 `./data`（SQLite + 各项目工作区文件）。

## 工作区结构

```text
data/workspaces/<projectId>/
  project.json
  prd/PRD.md
  prd/prd.json
  prd/issues.json
  prd/consistency-report.md
  arch/TECH_SPEC.md
  arch/srs/
  qa/TEST_PLAN.md
  qa/cases/
```

## 常见问题

1. **演示模式**：`/health` 返回 `mockMode: true` 表示未读到 API Key。  
2. **口令**：若设置了 `APP_PASSWORD`，在首页填写并保存，或设置 `NEXT_PUBLIC_APP_PASSWORD`。  
3. **可行性分析**：在「架构」页配置代码仓本地路径；该模式只读，不改业务代码。

## 开发脚本

```bash
pnpm dev          # 同时启动 web + agent
pnpm build        # 构建全部包
pnpm typecheck    # 类型检查
```

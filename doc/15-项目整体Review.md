# DesignWeave 项目整体 Review

> 状态：待评审 · 2026-08-20
> 作者：一次自动代码审阅
> 目的：列出"大的需要改进的点"，说明原因，并给出重构思路。本文档会交给多个 AI 评审，因此尽量把**现状、证据、原因、风险、方案**写清楚，便于交叉质询。

---

## 0. 一句话结论

项目有清晰的产品定位和不错的工程骨架（pnpm monorepo、TS 共享包、Vditor 壳、Claude Agent SDK 复用），但**正处在新旧两套数据模型并存的中段**：旧的"结构化 PRD/SR/TestPlan + JSON 工作区"和新的"Markdown 文档仓 + git 版本 + runs"两套都在跑，路由、schema、prompts、web API 客户端里都残留旧路线。同时**墨览编辑器核心是一个 4346 行的 IIFE 单文件 + 3912 行 CSS，靠拷贝脚本分发给三端**，可维护性差、无类型、几乎无测试。建议在产品线收敛之前，先做一次"删旧 + 拆大 + 补测试与 CI"的重构。

---

## 1. 项目画像

### 1.1 仓库结构

- `apps/agent/` Express + better-auth + better-sqlite3 + Claude Agent SDK（后端 + AI 调度）
- `apps/web/` Next.js 15 + React 19（浏览器工作台 UI）
- `apps/vscode-molan/` VS Code / Cursor 自定义编辑器扩展（墨览宿主之一）
- `packages/schema/` zod schema（PRD / SR / Test / Issues / Agent）
- `packages/prompts/` 旧 sessions 的 system prompt + 新 requirement chat prompt
- `tools/markdown-viewer/` 墨览编辑器真源（纯 JS IIFE + CSS），靠 sync 脚本拷贝给 vscode/web
- `doc/` 产品决策与设计稿（00–14）
- `data/` 运行态：SQLite、workspaces、auth-secret（gitignore）
- `Dockerfile / docker-compose.yml` 仅开发者附录（产品定位已改为安装包+本机服务）

### 1.2 两条产品线

1. **墨览（Molan）**：开源 Markdown 阅读/编辑器。VS Code/Cursor 扩展 + 浏览器工作室。README 明确这是**当前重点**。
2. **DesignWeave 工作台**：给产品/设计/测试用的"Cursor/Claude Code"。PRD 共创 → 可行性 → SR → 测试方案。README 写"当前 Web 只是探针，不是 UX 定稿"。

### 1.3 技术栈选型（总体合理）

- pnpm workspace + TS 共享包 + NodeNext 模块解析 + zod：选型干净。
- better-auth + better-sqlite3 + Express：单机服务、零外部依赖，符合"安装即服务"定位。
- Claude Agent SDK 复用本机 `~/.claude`：差异化卖点，不重复造 Agent 生态。
- Vditor IR（类 Typora）做墨览内核：成熟、即时渲染、可裁剪 CDN。

---

## 2. 大的需要改进的点

按"对演进速度和可维护性的影响"排序，P0 最优先。

### 2.1 【P0】新旧两套数据模型并存，大量遗留代码

这是当前**最大的技术债**，也是后续所有重构的拦路虎。

**现状证据**

| 维度 | 旧路线（结构化 JSON） | 新路线（Markdown 文档仓） |
|------|----------------------|--------------------------|
| 实体 | `projects` 表 + `workspaces/<id>/prd/prd.json` 等 | `requirements` 表 + `<vaultPath>/PRD.md` 等 |
| 后端模块 | `projects.ts`、`workspace.ts`、`sessions.ts`、`claude.ts` | `requirements.ts`、`gitVault.ts`、`workbenchRuns.ts`、`workbenchAgent.ts`、`requirementChat.ts` |
| AI 调度 | `claude.ts` 的 `runAgentStream` + `/v1/sessions/*` | `workbenchAgent.ts` 的 `executeWorkbenchRun` + `/v1/requirements/:id/runs/*` |
| 文档模型 | `PrdDocument` / `TechSpec` / `TestPlan` / `SrDocument`（zod 结构化） | 纯 Markdown 字符串 + git 版本 |
| 提示词 | `packages/prompts/src/index.ts`（getSystemPrompt / buildUserTurn，面向旧 sessions） | `packages/prompts/src/requirement.ts` + `workbenchAgent.ts` 内联 systemPrompt |
| Web API | `api.ts` 里 `listProjects/createProject/savePrd/startSession/...` 一整块 | `api.ts` 里 `listRequirements/createRequirement/startRun/...` |
| 路由 | `index.ts` 中 `/v1/projects/*`、`/v1/sessions/*` 仍完整注册 | `index.ts` 中 `/v1/requirements/*` + `registerWorkbenchRoutes` |

具体看 `apps/agent/src/index.ts`：

```603:726:apps/agent/src/index.ts
app.get("/v1/projects", (_req, res) => {
  res.json({ projects: listProjects() });
});
// ... 一整段 /v1/projects/* 路由 ...
app.post("/v1/sessions", (req, res) => { ... });
app.post("/v1/sessions/:id/messages", async (req, res) => { ... });
```

而新路线在 `index.ts:254` 起的 `/v1/requirements/*` 和 `registerWorkbenchRoutes(app)`（`index.ts:601`）里。

`apps/web/src/lib/api.ts` 同样两套方法并存（`listProjects` / `savePrd` / `startSession` 与 `listRequirements` / `startRun`）。

`packages/schema/src/` 的 `prd.ts`、`sr.ts`、`test.ts`、`issues.ts`、`agent.ts` 几乎全是为旧结构化模型服务的；新路线只用 `AgentStructuredResultSchema`（且仅 `claude.ts` 旧 sessions 用），`workbenchAgent.ts` 根本不消费这些 schema。

**为什么是大问题**

1. **认知负担**：新人读 `index.ts` 会看到 projects、requirements、sessions、runs 四套路由，搞不清谁是主路线。
2. **双倍维护**：改一处业务规则要同时考虑两套（例如加一个 ACL 策略，要在 projects 路由和 requirements 路由分别加）。
3. **schema/prompts 失真**：`packages/schema` 和 `packages/prompts` 里大量内容对新路线无效，但还作为"共享包"被 build，误导性强。
4. **web 端死方法**：`api.ts` 里 projects/sessions 相关方法没有任何页面调用（`page.tsx` 全用 requirements），是纯死代码。
5. **产品方向已定**：`doc/00-产品重定位.md` 和 `doc/09-云端迭代入口.md` 已拍板走"文档仓 + git + runs"，旧路线不会再回来。

**风险**

- 不删旧，任何一次"统一错误处理 / 统一校验 / 统一日志"的改动都会被两套模型拖住，收益减半。
- 删旧时容易误伤新路线里仍引用的公共工具（如 `workspace.ts` 里的 `projectDir` 被 `claude.ts` 用）。

---

### 2.2 【P0】墨览编辑器：4346 行 IIFE 单文件 + 3912 行 CSS，拷贝式共享

**现状证据**

- `tools/markdown-viewer/molan-editor.js`：4346 行，IIFE 挂 `window.MolanEditor`，约 168 个顶层 `function`、无 `class`。`create` 工厂函数本身 423 行（3925–4347），`bindBlockInsert` 328 行（3597–3924），`bindFormatBar` 246 行（1716–1961）。
- `tools/markdown-viewer/molan.css`：3912 行纯 CSS，无预处理器，含四套主题（`:root` + `[data-theme=night/hack/rose]`）+ 大量 Vditor 覆盖（`!important`）+ 工作室 UI + 查找高亮重复块。
- `tools/markdown-viewer/molan-app.js`：1725 行，浏览器工作室独有（选文件夹、侧栏、IndexedDB、读写本地文件）。
- 共享方式：`apps/vscode-molan/scripts/sync-media.mjs` 和 `apps/web/scripts/sync-molan.mjs` 在 `predev`/`prebuild`/vscode `compile` 前**把 molan.css / molan-editor.js / vendor/vditor 拷贝**到各自 media/public 目录。`.gitignore` 里这些拷贝产物都被忽略（见 `.gitignore:21-26`）。
- 无 TS 类型（宿主侧 `markdownEditorProvider.ts` 和 `MolanFrame.tsx` 通过 postMessage 字符串协议与之对话），无单元测试，仅 `tools/markdown-viewer/scripts/table-e2e.mjs` 一条 Playwright 集成测试。

**为什么是大问题**

1. **单文件不可分**：改查找、改表格、改行首"+"插入、改主题，全在一个文件里互相踩。函数间靠模块级 `let`（`toastEl`、`findState`、`mermaidRenderSeq`）共享状态，回归风险高。
2. **拷贝式共享会漂移**：三端各自 sync，vendor 子集还不一样（web 只拷 `zh_CN.js`，vscode 拷全量 i18n）。一旦真源改了接口，宿主侧没类型对不上，只能靠运行时崩。
3. **无类型契约**：`MolanFrame` 和 `vscode-bridge.js` 与编辑器之间是 `postMessage` 字符串协议，没有共享类型，重命名一个消息类型要靠 grep。
4. **CSS 单文件 3912 行**：四主题下大量重复块，改一个变量要四处找。
5. **测试几乎为零**：编辑器是最容易出回归的地方，却最缺测试。

**风险**

- 墨览是当前产品主线，任何"加一个纸面 / 改一个交互"的需求都会撞进这个单文件，越拖越难拆。
- 拷贝同步一旦有人手动改了 `apps/web/public/molan/molan-editor.js`（虽然 gitignore 了，但本地改完忘了同步回真源），就会出诡异的"只在线上崩"。

---

### 2.3 【P1】agent `index.ts` 是 856 行的路由上帝文件

**现状证据**

`apps/agent/src/index.ts` 单文件 856 行，集中了：auth/setup、users、claude config、requirements CRUD、requirements files、requirements versions、projects CRUD、projects prd/issues/tech/test-plan、sessions + messages（SSE）。只有 workbench 路由被拆到 `workbenchRoutes.ts`（197 行），其余全在 index。

错误处理在每个 handler 里手写重复：

```137:166:apps/agent/src/index.ts
app.post("/v1/setup", async (req, res) => {
  // ... 手写校验 name/email/password ...
  try {
    const response = await signUpFirstUser({ ... });
    await pipeAuthResponse(response, res);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "创建账号失败" });
  }
});
```

参数校验全是 `String(req.body?.x || "").trim()` 手写，没有用 zod（尽管 `packages/schema` 里就有 zod）。`workbenchRoutes.ts` 已经引入了 `HttpError` + `statusOf` + `fail()` 的统一模式，但 index.ts 没跟进。

**为什么是大问题**

1. 新加路由要塞进一个 856 行文件，diff 噪声大、冲突多。
2. 错误处理风格不统一（有的 try/catch + statusOf，有的 try/catch + 硬编码 400/404，有的不 try/catch），返回结构不一致。
3. 校验散落，没有契约层，前后端各写一遍类型（web `api.ts` 手写一遍 TS 类型，agent 手写一遍校验）。

**风险**

- 在这个文件里加"统一鉴权日志"或"统一限流"会变成全文件手改。

---

### 2.4 【P1】web 工作台页面 723 行单组件，状态管理混乱

**现状证据**

`apps/web/src/app/requirements/[id]/page.tsx` 一个 `WorkbenchPage` 组件 723 行，管了：锁（claim/heartbeat/release/force-release）、文件树、当前文件、etag、版本列表、未提交、AI run（启动/SSE 跟流/取消）、导入、对比、快捷键、编辑态、toast、gate、左右栏折叠、entrust 尺寸/宽度。

20+ 个 `useState`，多个 `useRef` 用来跨闭包同步（`activeRunRef`、`editingRef`、`currentPathRef`、`followSeq`），多个 `useEffect`：

```204:239:apps/web/src/app/requirements/[id]/page.tsx
useEffect(() => {
  if (!readOnly || history) return;
  const timer = setInterval(() => {
    void api.readFile(id, currentPath).then((file) => { ... });
    void refreshTree().catch(() => undefined);
    void refreshVersions().catch(() => undefined);
    void api.currentRun(id).then((res) => setActiveRun(res.run)).catch(() => undefined);
  }, 2500);
  return () => clearInterval(timer);
}, [currentPath, etag, history, id, readOnly, refreshTree, refreshVersions]);
```

2.5s 轮询文件/树/版本/run + SSE 流 + 20s 心跳混在一个组件里。没有抽象成 hook，没有状态机，没有用 SWR/React Query 之类。

**为什么是大问题**

1. 协作态（锁 + run + 未提交 + 编辑）是工作台最容易出 bug 的地方，现在全靠一堆 `useEffect` 的依赖数组兜，依赖写错就 stale closure 或死循环。
2. 轮询 + SSE 并存，run 进行时其实 SSE 已经会推 file 事件，轮询是冗余的。
3. 723 行组件无法拆分复用，加一个"多标签打开"或"离线提示"会非常痛。

**风险**

- 这是产品体验的核心页，状态 bug（比如锁丢了还在显示 youHold、run 结束了没刷新）会直接砸信任。

---

### 2.5 【P1】测试几乎为零，且无 CI

**现状证据**

- 整个 `apps/agent` 只有 `src/fsBrowse.test.ts`（28 行，用 `node --test`）一个测试。
- `apps/web` 无测试。
- `packages/schema`、`packages/prompts` 无测试（schema 的 zod 解析、prompts 的拼装都是纯函数，最适合测，却没测）。
- `tools/markdown-viewer` 仅 `table-e2e.mjs` 一条 Playwright。
- 仓库无 `.github/workflows`，无 CI。`pnpm typecheck` 存在但不在任何自动化里跑。

**为什么是大问题**

1. 没有回归网，重构（见上面四条）没有安全垫。
2. schema/prompts 是纯函数，测起来极便宜，却没测；一旦改 `PRD_SECTION_KEYS` 或 prompt 拼装，前后端契约可能悄悄断。
3. 无 CI 意味着 `pnpm typecheck` / 格式 / 测试都不会在 PR 上强制跑，靠人记。

**风险**

- 没测试就重构 = 重构完没法证明没回归。这会让"删旧代码"这件事变成纯勇气活。

---

### 2.6 【P2】数据库 schema 散落各模块，无迁移管理

**现状证据**

- `db.ts` 建 `projects`、`sessions`、`user`、`session`、`account`、`verification`。
- `requirements.ts` 建 `requirements`。
- `projectLocks.ts` 建 `project_locks`。
- `workbenchRuns.ts` 建 `workbench_runs`、`run_events`。
- 每个模块自己 `ensureXxxTable()`（`CREATE TABLE IF NOT EXISTS`），没有统一迁移、没有版本号、没有 schema 目录。`index.ts:84-88` 启动时手动调四个 ensure 函数。

**为什么是大问题**

1. 加字段时只能 `ALTER TABLE` 手写，且要兼容老库；没有迁移文件意味着升级路径不可追溯。
2. 表关系（`requirements` ↔ `workbench_runs` ↔ `run_events`）没有外键约束，删除靠应用层（`deleteRunsForProject` 手动清）。
3. 一旦哪天要换库或加索引，没有迁移框架会很痛。

**风险**

- 单机产品短期可接受，但一旦要支持多机/同步，schema 演进会卡住。

---

### 2.7 【P2】`gitVault.ts` 用 `spawnSync` 同步执行 git，阻塞事件循环

**现状证据**

`apps/agent/src/gitVault.ts` 所有 git 操作用 `spawnSync`（同步）：`runGit`、`commitAll`、`listVersions`、`readFileAt`、`restoreFile`、`revertLatestAiCommit`。`workbenchAgent.ts` 在 run 结束后调 `commitAll`，`index.ts` 的 versions 路由也直接调。

**为什么是大问题**

1. Express 单进程，`spawnSync` 会阻塞整个事件循环。大文档仓的 `git log` / `git show` / `git commit` 可能耗时百毫秒到秒级，期间所有其他请求（包括心跳、SSE）被卡住。
2. `workbenchRuns.pipeRunStream` 是 SSE 长连接，一旦后台 `commitAll` 同步跑，前端会看到进度卡顿。
3. `gitVault` 没有 timeout 控制，异常 git 仓库（需要交互输入时 `GIT_TERMINAL_PROMPT=0` 会直接失败，但卡死的 git 进程仍可能拖住）。

**风险**

- 单机 + 小仓库时影响小，但工作台一旦跑长任务 + 大文档仓，会出现"偶发卡顿"难复现。

---

### 2.8 【P2】monorepo 构建链手动编排，无增量

**现状证据**

`package.json` 的 `predev`/`build` 手动串联 `schema → prompts → agent → web` 的构建顺序：

```7:14:/Users/fengshihao/Work/DesignWeave/package.json
"predev": "pnpm --filter @designweave/schema build && pnpm --filter @designweave/prompts build",
"build": "pnpm --filter @designweave/schema build && pnpm --filter @designweave/prompts build && pnpm --filter @designweave/agent build && pnpm --filter @designweave/web build",
```

没有用 turbo / nx，每次全量 tsc。`packages/*` 用 tsc 输出 dist + declaration，消费方用 `.js` 后缀导入（NodeNext），改 schema 要先 build 才能看到类型变化。

**为什么是大问题**

1. 改 schema 一行，要等两个包 build 完，开发反馈慢。
2. 没有增量缓存，CI（如果加）会全量跑。
3. `apps/web/prebuild` 还要先跑 `sync-molan.mjs` 拷贝编辑器，链路更长。

**风险**

- 短期可忍，但会持续吃开发时间。

---

### 2.9 【P2】拷贝式代码共享（molan 真源 → 三端）

**现状证据**

`tools/markdown-viewer` 是真源，`sync-media.mjs`（vscode）和 `sync-molan.mjs`（web）在 predev/prebuild/compile 前把 `molan.css`、`molan-editor.js`、`vendor/vditor` 拷贝到各自产物目录。`.gitignore` 忽略拷贝产物。vendor 子集两端不同（web 只拷 `zh_CN.js`，vscode 拷全量 i18n）。

**为什么是大问题**

1. 不是 npm package，没有版本号、没有类型导出，宿主侧靠字符串 postMessage 协议对话。
2. 三端各自 sync，容易忘（vscode `compile` 前 sync，web `predev`/`prebuild` sync）。
3. vendor 子集差异意味着同一份编辑器在 web 和 vscode 行为可能微妙不同（i18n 回退）。

**风险**

- 见 2.2，与编辑器单文件问题叠加放大。

---

### 2.10 【P3】若干安全/健壮性细节

**现状证据**

- `fsBrowse.browseDir` 无路径白名单，架构师登录后可浏览整盘（含 `/etc`、`/Users`）。这是产品意图（选目录），但应至少限制在用户家目录或显式根。
- `files.resolveDocFile` 有路径穿越防护（`..` 检查 + `startsWith(root)`），OK。
- `requirementChat.ts` / `workbenchAgent.ts` 把 `meta.vaultPath`、`meta.title`、用户消息直接拼进 system prompt，存在 prompt 注入面（虽然 Claude Agent SDK 本身有一定防护，但 `meta.title` 来自用户输入，应转义或限定）。
- `config.ts` 自动生成 auth secret 写 `data/auth-secret`（0o600），OK；但若 `data` 目录被备份/同步，secret 会跟着走。
- 无 rate limit，无请求体大小上限保护（`express.json({ limit: "4mb" })` 有，但 SSE 长连接无限制）。
- `docker-compose.yml` 把 `.env` 整个 `env_file` 注入，且 `DATA_DIR=/data` 挂卷，生产部署若用 docker 需注意（产品定位已说 docker 仅附录）。

**为什么是大问题（相对较轻）**

单机 + 登录 + 内网的产品里这些大多可接受，但 prompt 注入和 secret 漂移会随产品长大显形。

---

## 3. 重构方案

总原则：**先删旧、再拆大、后补测试与 CI**。删旧是前提（不删旧，拆大时会被两套模型扯），补测试是安全垫（没测试的删旧是赌博）。

### 阶段 0：补安全垫（1～2 天，必须先做）

1. **加 CI**：`.github/workflows/ci.yml` 跑 `pnpm typecheck` + `pnpm -r test` + lint（先只跑已有的 `fsBrowse.test.ts`，让管道通起来）。
2. **给 schema/prompts 补单测**：zod parse 正反例、prompt 拼装快照。这两个包是纯函数，测起来极便宜，却能锁住前后端契约。
3. **给 `gitVault`、`requirements`、`projectLocks`、`workbenchRuns` 补关键路径单测**：commit/版本列表、锁 claim/heartbeat/expire、run 状态机。这些是纯逻辑、无 IO 之外依赖，好测。
4. **给 web `api.ts` 的类型与 agent 路由的返回结构做一次对齐快照**（可选，用 typecheck 保证）。

这一步的产出：删旧之前有一张网，至少 schema/锁/run/版本不会悄悄断。

### 阶段 1：删旧路线（2～3 天，最高收益）

顺序从外到内：

1. **删 web 死代码**：`apps/web/src/lib/api.ts` 里 `listProjects/createProject/getProject/savePrd/listIssues/updateIssue/writeTechSpec/writeTestPlan/startSession/sendMessage/cancelSession/applyResult` 等所有 projects/sessions 方法；删 `apps/web/src/app/projects/`。先 typecheck 确认无引用。
2. **删 agent 旧路由**：`index.ts` 中 `/v1/projects/*`（603–714）、`/v1/sessions/*`（716–817）、`/v1/projects/:id/apply-result`（819–833）整段删。`/v1/claude/config`、`/v1/claude/projects` 保留（设置页要用）。
3. **删 agent 旧模块**：`projects.ts`、`workspace.ts`、`sessions.ts`、`claude.ts`（注意 `claude.ts` 里的 `runMockStream` 若新路线没用则一并删；`workbenchAgent.ts` 自己有 `runMock`）。删前 grep 一遍 `projectDir`、`runAgentStream` 等符号的残留引用。
4. **瘦身 schema/prompts**：
   - `packages/schema`：保留 `AgentStructuredResultSchema`（若新路线仍用）、`IssueStatusSchema`、`ProjectPhaseSchema`（若仍用）；删 `PrdDocumentSchema` 及其依赖的 `prd.ts`、`sr.ts`、`test.ts`、`issues.ts` 中纯旧模型部分。若 `AgentStructuredResultSchema` 在新路线里其实没被 `workbenchAgent.ts` 用（它走自由工具调用），可考虑整体废弃 schema 包或只留极少共享类型。
   - `packages/prompts`：删 `index.ts` 的 `getSystemPrompt/buildUserTurn/ROLE_PROMPTS/MODE_PROMPTS`（面向旧 sessions）；保留 `requirement.ts`。把 `workbenchAgent.ts` 里内联的 `systemPrompt`/`userPrompt` 抽到 `packages/prompts/requirement.ts`，统一管理。
5. **删 db 旧表**：`projects`、`sessions` 表的 `CREATE TABLE` 可删（新库不再建）；老库保留表不删数据，靠迁移脚本处理（见阶段 4）。
6. **删 Dockerfile/docker-compose 里对 agent/web 的旧构建步骤**：`Dockerfile` 的 build 阶段若 schema/prompts 瘦身，对应调整。

产出：`index.ts` 应从 856 行降到 ~400 行；`packages/schema`、`packages/prompts` 体量减半；web `api.ts` 减 ~100 行死代码。

### 阶段 2：拆 agent `index.ts`（1～2 天）

按 `workbenchRoutes.ts` 的模式，把 index 拆成领域 router：

- `routes/auth.ts`：`/v1/auth/status`、`/v1/setup`、`/v1/me`、`/v1/users`（+ `pipeAuthResponse` 工具）
- `routes/claude.ts`：`/v1/claude/config`、`/v1/claude/projects`、`/health`
- `routes/requirements.ts`：`/v1/requirements` CRUD、`/v1/requirements/:id`（bundle）、`/prd`、`/import`、`/chat`、`/phase`
- `routes/files.ts`：`/v1/requirements/:id/tree`、`/files`、`/v1/fs/browse`、`/v1/fs/mkdir`
- `routes/versions.ts`：`/v1/requirements/:id/versions*`
- `routes/workbench.ts`：保持 `registerWorkbenchRoutes`
- `index.ts` 只剩：app 创建、中间件、`registerXxxRoutes(app)`、listen

同时统一错误处理：所有 router 用 `HttpError` + `statusOf` + `fail()`（已在 `workbenchRoutes.ts` 验证过），删掉手写 `try/catch + 硬编码 status`。校验引入 zod（从 `packages/schema` 导出 request schema），前后端共享类型。

### 阶段 3：拆 web 工作台页面（2～3 天）

把 `requirements/[id]/page.tsx` 按职责拆成 hooks + 子组件：

- `hooks/useRequirementBundle(id, cid)`：bundle / tree / versions 拉取与刷新（可用 SWR 或自写）
- `hooks/useProjectLock(id, cid)`：claim / heartbeat / release / force-release + 心跳定时器
- `hooks/useWorkbenchRun(id, cid)`：startRun / SSE 跟流 / cancel + 状态机（idle / running / done / error）
- `hooks/useDocFile(id, path, readOnly)`：read / write / etag / dirty + 只读时的轮询（或改用 SSE 推送替代轮询）
- 子组件：`WorkbenchSidebar`、`WorkbenchCenter`（含 `MolanStage` + `EntrustLayer`）、`VersionDrawer`（已有）、`ImportModal`、`GateModal`、`CompareModal`

关键改进：**用 SSE 替代 2.5s 轮询**。run 进行时已有 SSE 推 file/tree 事件；非 run 时，文件变化其实只在别人编辑或 AI 写时发生，可以用一个轻量 SSE（或 WebSocket）统一推 `fileChanged` / `lockChanged`，去掉轮询。

### 阶段 4：数据库迁移与 git 异步化（1～2 天，可与阶段 3 并行）

- **引入迁移**：加一个极简迁移器（不必上 Knex，可自写 `migrations/NN_*.sql` + 一张 `schema_migrations` 表）。把现有 `CREATE TABLE IF NOT EXISTS` 收编成初始迁移，后续加字段走迁移文件。
- **git 异步化**：`gitVault` 的 `spawnSync` 换成 `child_process.spawn` + Promise 包装（或用 `execa`）。`commitAll`、`listVersions`、`readFileAt` 改 async，路由 handler 改 `await`。注意 `workbenchAgent` 的 run 结束提交也要 await。

### 阶段 5：墨览编辑器拆分（大工程，单列 roadmap）

这是最大的一块，建议**单独立项**，不和上面四阶段混：

- **第一步：抽类型契约**。把 `MolanFrame` ↔ 编辑器、`vscode-bridge` ↔ 编辑器的 postMessage 协议抽成 `packages/molan-protocol`（TS 类型 + 校验），三端共享。这一步不动编辑器内部，只加类型，收益大、风险小。
- **第二步：把 `tools/markdown-viewer` 改成 npm package**（`@designweave/molan-core`），ESM 导出 `createEditor` 等 API，三端用 import 而非拷贝。vendor 作为 package 的依赖由 bundler 处理。这一步要解决 Vditor 的 CDN 加载方式（改 import）。
- **第三步：拆 `molan-editor.js`**。按区段（mermaid / lightbox / table / outline / formatbar / find / theme / blockInsert / factory）拆成 ES modules，每个 < 500 行。模块级 `let` 收进工厂闭包或类。
- **第四步：拆 `molan.css`**。按主题 + 组件拆，引入 CSS Modules 或 CSS 变量层（已有变量，整理即可），四主题用 `:root` + `[data-theme]` 覆盖，消除重复块。可考虑上 Lightning CSS 做压缩和 nesting。
- **第五步：补测试**。编辑器 API 的纯逻辑（i18n、aphorisms、outline 解析、find 状态机）补单测；关键交互（表格插入、行首"+"、查找、主题切换、预览/编辑切换）补 Playwright。

这一步可能要 1～2 周，但它是墨览作为产品主线的长期可维护性基础。

### 阶段 6：产品线优先级澄清（非代码，但重要）

README 说墨览是当前重点、工作台是探针，但代码里工作台体量很大。建议在 review 文档里明确：

- 若墨览是主线，阶段 5 优先于阶段 3/4；
- 若工作台要继续推，阶段 1–4 优先，阶段 5 推后。

这个决策不应由 AI 做，应让人拍板。

---

## 4. 优先级与工作量估算

| 阶段 | 优先级 | 估时 | 收益 | 风险 |
|------|--------|------|------|------|
| 0 补安全垫（CI + schema/prompts/锁/run 测试） | P0 | 1–2 天 | 重构有网 | 低 |
| 1 删旧路线 | P0 | 2–3 天 | 立减 30% 代码、消除认知负担 | 中（误删公共工具） |
| 2 拆 agent index.ts | P1 | 1–2 天 | 路由可扩展、错误统一 | 低 |
| 3 拆 web 工作台页面 + SSE 替轮询 | P1 | 2–3 天 | 核心页可维护、状态 bug 减少 | 中 |
| 4 DB 迁移 + git 异步化 | P2 | 1–2 天 | 演进可控、不卡顿 | 低 |
| 5 墨览编辑器拆分 | P0（若墨览为主线） | 1–2 周 | 长期可维护 | 高（大工程） |
| 6 产品优先级澄清 | — | 0.5 天 | 决策依据 | — |

阶段 0+1+2 合计约 5 天，是性价比最高的第一刀：删完旧代码 + 拆完路由 + 有了测试网，后续无论走墨览还是走工作台都轻装。

---

## 5. 给评审 AI 的提问清单

为便于交叉质询，以下是本文档里**最值得被挑战**的判断，评审 AI 可重点回应：

1. **"删旧路线"是否过于激进？** 旧路线（结构化 PRD/SR/TestPlan）是否真的不会再回来？有没有可能"工作台"未来需要结构化导出（例如导出 SR 给下游系统）而旧 schema 仍有价值？
2. **`AgentStructuredResultSchema` 在新路线里到底还有没有用？** `workbenchAgent.ts` 走自由工具调用（Write/Edit），似乎不消费结构化结果；但 `claude.ts`（旧）用。删旧后这个 schema 是否该留？
3. **墨览编辑器拆成 npm package 是否值得？** 拷贝式共享虽然丑，但目前三端改动频率是否高到值得花 1–2 周改 ESM？有没有更轻的中间方案（例如只抽类型契约，保留拷贝）？
4. **SSE 替轮询是否过度设计？** 单机 + 单用户场景下，2.5s 轮询的代价是否真的值得引入 SSE/WS？还是说锁/run 的并发场景足够多到必须？
5. **DB 迁移框架是否必要？** 单机产品、表少、无线上数据迁移压力，自写 `CREATE TABLE IF NOT EXISTS` 是否够用很久？
6. **`gitVault` 同步改异步的收益是否被高估？** 文档仓通常小（几十个 Markdown），`spawnSync` 实际耗时是否真的会卡到用户？
7. **产品优先级（阶段 6）应如何拍？** 墨览 vs 工作台，哪个先重构？这直接决定阶段 5 与阶段 3/4 的先后。
8. **测试策略是否现实？** 给编辑器补 Playwright 是否会被 Vditor 的 shadow DOM / 动态渲染卡住？schema/prompts 单测能否真正锁住前后端契约（毕竟 web `api.ts` 的类型是手写的，不是从 schema 生成）？

---

## 附：本文档依据的主要文件

- `apps/agent/src/index.ts`（856 行，路由上帝文件）
- `apps/agent/src/{projects,workspace,sessions,claude}.ts`（旧路线）
- `apps/agent/src/{requirements,gitVault,workbenchRuns,workbenchAgent,requirementChat,projectLocks,files,fsBrowse,db,config,auth,acl,claudeRuntime}.ts`（新路线 + 基础设施）
- `apps/web/src/app/requirements/[id]/page.tsx`（723 行工作台页）
- `apps/web/src/lib/api.ts`（双套 API 客户端）
- `apps/web/src/components/MolanFrame.tsx`（postMessage 协议）
- `apps/vscode-molan/src/markdownEditorProvider.ts`（VS Code 宿主）
- `tools/markdown-viewer/{molan-editor.js, molan-app.js, molan.css, molan-i18n.js, molan-aphorisms.js}`（编辑器真源）
- `packages/schema/src/*`、`packages/prompts/src/*`（共享包，多为旧模型）
- `doc/00-产品重定位.md`、`doc/09-云端迭代入口.md`（产品决策依据）
- `Dockerfile`、`docker-compose.yml`、`package.json`、`pnpm-workspace.yaml`、`.gitignore`、`.env.example`

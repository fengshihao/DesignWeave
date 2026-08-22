# Agent 对话 UI 选型

> 状态：已拍板 · 不上 CopilotKit；自研托付层 + AG-UI 事件子集  
> 第一版不做采纳/拒绝卡片，听 [12](./12-实现前决策.md)。空间听 [18](./18-工程目录与标准PRD.md) §7：底条 / 半幅 / 铺满，不占一列。  
> 配套架构：[07-客户端架构.md](./07-客户端架构.md)

## 1. 这块界面实际要干什么

对话不是首页。产品要的是：

- 流式中文叙事（「正在搜登录相关实现」，不要甩 tool JSON）
- 工具调用可展开查看
- **长任务**：关窗口 / 换界面后按 `session_id` 续上，先重放再接直播
- **文档采纳 / 拒绝**（Agent 改了 PRD 哪一节，人点写入或丢弃）
- 与墨览联动（写回后刷新）
- 纸面审美，作为三栏里的侧栏，不是 ChatGPT 整页

库通常只覆盖前两项。后四项是产品，必须自己做。

## 2. 候选

| 方案 | 是什么 | 和我们的合拍程度 |
|------|--------|------------------|
| **AG-UI 协议**（CopilotKit 发起的开源事件标准） | 只规定事件：`RUN_*` / 文本流 / 工具调用 / `MESSAGES_SNAPSHOT`。`threadId` ≈ `session_id` | **高。** AgentScope 2.0 也能对此外发。不绑 UI 框架 |
| **assistant-ui** | React headless 对话组件（消息列表、输入框、流式 Markdown、工具卡片）。可接自定义 runtime | 中。适合当侧栏皮肤；默认是「一次 POST 占满连接」，重连要自己接 |
| **Vercel AI SDK + AI Elements** | `useChat` + 一套聊天零件 | 中低。传输假设和我们的 session 流不一致，容易绑进 Vercel 生态 |
| **CopilotKit** | 整套「应用内 Copilot」：前端 action、共享状态、AG-UI 运行时 | **低。** 想当产品壳。我们已有 Claude Agent SDK 后台，不需要再嵌一层 Copilot 运行时；还有商业档 |
| **AgentScope Web UI** | 官方示例前端，对 Python Agent Service | **不用。** 运行时都不会换成 AgentScope |
| **LibreChat / Open WebUI / Chatbot UI** | 完整聊天产品 | **不用。** 是另一个 App |
| **纯自研协议 + 纯自研面板** | 自己定义事件和所有组件 | 协议重复造轮子；面板第一版可以很薄 |

## 3. 建议：协议用开源，面板半自研

```text
Claude Agent SDK 事件
        ↓ 后台翻译
AG-UI 事件子集（带 seq，写入 session 日志）
        ↓ GET /sessions/{id}/stream?after=seq
侧栏：自研列表 + 输入框 + 中文工具进度 + 采纳卡片
        └─ 消息正文用现成 Markdown 渲染（不要手写 md 解析）
```

### 采用 AG-UI 事件类型，不采用它的默认传输

AG-UI 的 HttpAgent 常见用法是 **一次 POST，SSE 直到跑完**——和现在 `apps/agent` 一样，关窗口任务就没了。

传输对齐 AgentScope Service：

1. `POST /sessions/{id}/runs` → 立刻 `{ runId }`  
2. `GET /sessions/{id}/stream?after=seq` → 重放 + 直播  
3. 事件体用 AG-UI：`RUN_STARTED` / `TEXT_MESSAGE_*` / `TOOL_CALL_*` / `RUN_FINISHED`；产品扩展放 `CUSTOM`（例如 `doc.patch` 待采纳）

这样：本机浏览器、局域网另一台电脑上的浏览器，都能订同一条 session。后台继续是 Express + Claude Agent SDK，不引入 CopilotKit / AgentScope 进程。

`threadId` = `session_id`；`runId` = 这一轮 Agent 执行。

### 面板为什么不先上 assistant-ui / CopilotKit

- 对话只是侧栏，主区是墨览。整套 ChatGPT UX 会压过文档。  
- 宣纸/墨夜主题要自己画，headless 库省不下多少。  
- **采纳卡片、中文工具叙事、按 seq 重连** 接进任何库都要写 adapter，工作量接近自研一个列表。  
- CopilotKit 还会把「Agent 怎么跟 UI 说话」收走，和「后台才是产品」冲突。

第一版侧栏范围（自研）：

- 消息列表、输入、停止、重连提示  
- 流式纯文本 + Markdown 渲染（可用 `react-markdown` 或现有墨览只读模式）  
- 工具行：中文一句 + 可展开原始调用  
- 文档变更：待采纳 / 已写入 / 已丢弃  

若阶段 2 工具卡片和多 thread 管理明显吃力，再把 **assistant-ui 当渲染层** 接进来（自定义 runtime 读我们的 session 日志）。那是优化，不是第一刀。

### 明确不自己造的

- Markdown 解析与代码高亮  
- AG-UI 那套事件名和 JSON 形状（用 `@ag-ui/core` 类型即可，不必上 `@ag-ui/client` 的 HttpAgent）

## 4. 和现有代码的差距

当前 `apps/web` 的 `/v1/requirements/:id/chat`、`/v1/sessions/:id/messages` 是「请求期间流式、断线即停」，UI 是普通消息列表。目标态要拆成：session 事件日志 + 可重放流 + 侧栏订流。

## 5. 结论（写入 03 的 G1）

| 层 | 选择 |
|----|------|
| 事件协议 | **AG-UI 子集** + 自有 `seq`；不绑 CopilotKit 运行时 |
| 传输 | **session 流**（先返回 id，再订 SSE），不是一次 POST 占线 |
| 对话面板 | **第一版自研侧栏**；Markdown 用现成库 |
| 以后可选 | assistant-ui headless 仅作渲染 |
| 不用 | CopilotKit 产品壳、AgentScope Web UI、整站聊天开源项目 |

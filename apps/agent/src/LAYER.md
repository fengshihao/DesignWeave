# Agent 分层

按 [doc/21](../../../doc/21-数据层与业务层.md)。

```text
http/     Express 适配：登录态 → Actor，映射错误码，请求日志
app/      业务用例：authorize → 数据层 → 审计
data/     SQLite / Better Auth 仓储（用户、审计）
log/      JSON 一行日志
```

现有磁盘工程逻辑仍在根目录模块（`requirements.ts`、`gitVault.ts`、`projectLocks.ts`…），由 `app/` 用例调用：

| 用例模块 | 覆盖 |
|----------|------|
| `app/users.ts` | 账号增改停用 |
| `app/projects.ts` | 工程建删改名转交 |
| `app/locks.ts` | 文件夹锁 |
| `app/docs.ts` | 读树/读写文档/提问 |
| `app/versions.ts` | 记版/恢复/撤 AI |
| `app/runs.ts` | chat session + 托付 run |

新规则不要写回 `index.ts` / `workbenchRoutes.ts`，只做 HTTP 适配。

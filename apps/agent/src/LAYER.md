# Agent 分层

按 [doc/21](../../../doc/21-数据层与业务层.md)。

```text
http/     Express 适配：登录态 → Actor，映射错误码，请求日志
app/      业务用例：authorize → 数据层 → 审计
data/     SQLite / Better Auth 仓储（用户、审计）
log/      JSON 一行日志
```

现有磁盘工程逻辑仍在根目录模块（`requirements.ts`、`gitVault.ts`…），由 `app/projects.ts` 调用。新规则不要写回 `index.ts`。

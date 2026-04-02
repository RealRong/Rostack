# PR-04 设计文档：引入 CommandGateway（不切流量）

## 背景

目前写入口仍以 `commands.*` 和 `write.apply` 为主，缺少统一命令漏斗。为了后续把写路径收口到单入口，需要先落地网关实现，再在下一 PR 切换调用方。

## 目标

1. 新增 `runtime/command/gateway.ts`，实现 `CommandGateway.dispatch`。
2. 网关先支持 `write.apply` 命令类型，内部仍复用现有 write `apply`。
3. 在 write runtime 中挂载 gateway，供下一 PR 迁移 `commands.write.apply`。

## 设计原则

1. 兼容优先：不改变旧命令对外形态。
2. 单入口准备：先有网关，再迁移流量。
3. 元数据透传：将 `CommandEnvelope.meta` 映射为 write `trace`。

## 文件落点

1. `packages/whiteboard-engine/src/runtime/command/gateway.ts`
2. `packages/whiteboard-engine/src/runtime/command/index.ts`
3. `packages/whiteboard-engine/src/types/write/runtime.ts`
4. `packages/whiteboard-engine/src/runtime/write/runtime.ts`

## 流程

1. `dispatch(CommandEnvelope)` 校验命令类型。
2. 提取 `payload`（当前只支持 `WriteInput`）。
3. 注入 tracing：`commandId/correlationId/transactionId/causationId`。
4. 调用旧 `apply`，并将结果统一映射为 `CommandResult`。

## 非目标

1. 不迁移 `commands.write.apply` 调用入口（下一 PR 执行）。
2. 不移除旧 `mutate` / `writer.applyDraft` 路径。
3. 不改 read 侧订阅流程。

## 验收标准

1. 网关可独立工作并返回标准 `CommandResult`。
2. write runtime 对外可访问 gateway。
3. 现有命令行为无变化。

## 回滚方案

1. 删除 gateway 模块并移除 runtime 挂载，旧流程不受影响。

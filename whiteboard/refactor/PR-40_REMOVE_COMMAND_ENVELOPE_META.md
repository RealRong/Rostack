# PR-40: 移除 CommandEnvelope.meta，收敛为 payload 单一追踪源

## 目标

删除 `CommandEnvelope.meta`，避免与 `payload.source/payload.trace` 的双来源重复，拉直 command gateway 责任边界。

1. `CommandEnvelope` 仅保留 `id/type/payload`。
2. gateway 的 source/trace 统一从 payload 推导并补默认值。
3. write runtime 不再构造重复的 meta 字段。

## 现状问题

1. `meta` 与 `payload.trace` 表达同一批追踪信息，存在重复与潜在不一致。
2. gateway 目前只是把 `meta` 再拷贝回 `trace`，没有独立业务价值。
3. `actorId` 未被消费，`transactionId/causationId` 当前仅透传。

## 设计

### A. 类型收敛

1. 删除 `types/cqrs/command.ts` 中 `CommandMeta`。
2. `CommandEnvelope` 删除 `meta` 字段。
3. 对外导出删除 `CommandMeta`。

### B. 运行时收敛

1. `runtime/write/runtime.ts` 发送 command 时只传 `id/type/payload`。
2. `runtime/command/gateway.ts` 按如下规则归一：
   1. `source = payload.source ?? 'ui'`
   2. `trace.commandId = envelope.id`
   3. `trace.correlationId = payload.trace?.correlationId ?? envelope.id`
   4. `transactionId/causationId/timestamp` 仅从 `payload.trace` 读取（可选）

### C. 文档同步

更新 `ENGINE_CURRENT_CHAIN_FLOW.md`，去掉“command envelope 的 trace meta”描述。

## 约束

1. 不改变写事务行为与 read invalidation 行为。
2. 不新增写路径。
3. 保持 `write.apply` 网关分发协议（type/payload）不变。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工检查：
   1. 代码中无 `CommandMeta` 与 `command.meta` 访问。
   2. `write.apply` 仍正常走 gateway。
   3. `ENGINE_CURRENT_CHAIN_FLOW.md` 与实现一致。

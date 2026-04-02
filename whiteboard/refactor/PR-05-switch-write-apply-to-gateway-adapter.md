# PR-05 设计文档：commands.write.apply 切换到 gateway 适配层

## 背景

`CommandGateway` 已落地，但实际流量仍走旧 `apply`。本 PR 的目标是把 `commands.write.apply` 迁移到 gateway，同时保证调用方继续拿到 `DispatchResult`。

## 目标

1. `commands.write.apply` 通过 `CommandEnvelope` 调用 `gateway.dispatch`。
2. 维持原有 API 返回值：`Promise<DispatchResult>`。
3. 行为不变：操作结果、错误语义、history/read 刷新保持一致。

## 设计原则

1. 适配优先：对外接口不变，内部实现替换。
2. 保留兼容：gateway 返回异常时提供明确失败映射。
3. 元数据标准化：写命令统一携带命令追踪字段。

## 文件落点

1. `packages/whiteboard-engine/src/runtime/write/api.ts`
2. `packages/whiteboard-engine/src/runtime/write/runtime.ts`

## 关键流程

1. `write.apply(payload)` 构造 `CommandEnvelope<'write.apply'>`。
2. `meta.source` 与 `payload.source` 对齐，补齐 `commandId/correlationId/timestamp`。
3. 调用 `gateway.dispatch`。
4. 将 `CommandResult` 映射回 `DispatchResult` 返回给旧调用方。

## 非目标

1. 不迁移 node/edge/viewport/mindmap 命令 API（它们仍调用 `apply`）。
2. 不删除旧 `apply` 能力（作为内部实现继续保留）。

## 验收标准

1. `commands.write.apply` 真实经过 gateway。
2. 旧调用方无需改代码即可运行。
3. 错误路径返回可诊断信息。

## 回滚方案

1. 将 `write.apply` 恢复为直接调用 `apply(payload)`。

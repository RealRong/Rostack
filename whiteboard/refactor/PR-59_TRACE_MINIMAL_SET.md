# PR-59 Trace 最小集收敛（commandId + source）

## 背景

当前 trace 仍包含未形成消费闭环的字段：

- `correlationId`
- `transactionId`
- `causationId`
- `timestamp`

这些字段仅透传，不影响引擎内部行为。

## 目标

1. `CommandTrace` 最小化：仅保留可选 `commandId`。
2. `ChangeTrace` 最小化：仅保留 `commandId` 与 `source`。
3. `Writer.normalizeTrace` 对齐最小结构。

## 方案

1. 修改类型：
   - `types/command/source.ts`
   - `types/write/change.ts`
2. 修改 writer：
   - `normalizeTrace` 输出最小字段。

## 风险

中等（类型 breaking），但仓内当前无这些字段消费。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 写入与 changeBus 链路正常。

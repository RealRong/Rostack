# PR-46: 将 WriteApply 类型统一命名为 Apply

## 目标

在 write 类型层统一命名，避免 `WriteRuntime.apply` 字段对应 `WriteApply` 类型的语义不一致。

1. `types/write/commands.ts`：`WriteApply` 重命名为 `Apply`。
2. `types/write/runtime.ts`：`apply` 字段改为引用 `Apply`。
3. `Measure/Autofit`：类型引用同步改名。

## 现状问题

1. 入口函数已统一为 `apply`，但类型名仍是 `WriteApply`。
2. 调用层阅读时出现“字段名与类型名不一致”的额外映射成本。
3. 与当前“单入口单命名”收敛目标不完全一致。

## 设计

### A. 类型命名收敛

1. `export type WriteApply` 改为 `export type Apply`。
2. 保持函数签名不变：`<D extends WriteDomain>(input: WriteInput<D>) => Promise<DispatchResult>`。

### B. 消费方同步

1. `Runtime.apply` 使用 `Apply`。
2. `Reactions/Measure/Autofit` 内部参数类型改为 `Apply`。

## 约束

1. 不改变任何运行时逻辑。
2. 不改变写链路时序。
3. 仅做命名与引用更新。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工检查 engine 代码中不再存在 `WriteApply` 运行时类型引用。

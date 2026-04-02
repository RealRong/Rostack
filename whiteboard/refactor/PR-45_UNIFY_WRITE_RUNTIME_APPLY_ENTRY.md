# PR-45: 统一 WriteRuntime 单一入口为 apply

## 目标

把 `WriteRuntime` 顶层内部写入口从 `applyWrite` 与 `apply` 双函数收敛为单函数 `apply`。

1. 删除 `applyWrite` 命名与对应包装层。
2. `commands` 与 `reactions` 统一调用 `writeRuntime.apply`。
3. 保持行为不变：仍走 `planner -> writer -> changeBus` 主链路。

## 现状问题

1. 运行时同时存在 `applyWrite` 和 `apply` 两个近似入口，职责边界重复。
2. `applyWrite` 仅做参数归一后调用 `apply`，属于可折叠中间层。
3. `Writer` 里已有 trace/source 兜底归一，重复处理增加认知成本。

## 设计

### A. Runtime 类型与装配收敛

1. `types/write/runtime.ts`：`applyWrite: WriteApply` 改为 `apply: WriteApply`。
2. `runtime/write/execution.ts`：删除 `createWriteApply` 包装函数，仅保留 `apply`。
3. `runtime/write/runtime.ts`：返回字段改为 `apply: execution.apply`。

### B. 调用方收敛

1. `instance/reactions/Reactions.ts`：依赖改为 `Pick<WriteRuntime, 'changeBus' | 'apply'>`。
2. `Measure/Autofit` 构造参数从 `applyWrite` 改为 `apply`。
3. 运行时内部回流写入统一调用 `writeRuntime.apply`。

### C. 文档同步

1. 更新 `ENGINE_CURRENT_CHAIN_FLOW.md`：
   1. 主链路从 `applyWrite -> apply` 改为 `apply -> planner -> writer`。
   2. `reactions` 回流描述改为 `writeRuntime.apply`。

## 约束

1. 不改变 `DispatchResult` 协议。
2. 不改变写事务时序与 history 语义。
3. 不新增写入口，不引入 feature flag。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工检查：
   1. engine 代码中无 `writeRuntime.applyWrite`。
   2. `WriteRuntime` 仅保留一个写入口 `apply`。
   3. 主链路可追踪为 `commands/reactions -> apply -> planner -> writer`。

# PR-36: Operation 不可变契约化（Immutable Contract）

## 目标

把“Operation 语义上不可变”升级为“类型系统强约束不可变”，减少引用污染风险并降低 history 深拷贝的防御性负担。

## 现状问题

1. `Operation` 及 `ChangeSet.operations` 仍以可变数组/对象类型暴露。
2. 当前依赖约定（不去改写）而不是编译器约束。
3. history 需要额外 clone 防御下游潜在改写。

## 设计

### A. 核心类型改为只读契约

1. `Operation` 顶层字段改为只读。
2. `Operation` 中数组字段改为 `readonly ...[]`。
3. `ChangeSet.operations` 改为 `readonly Operation[]`。

### B. 写链路参数全面只读化

1. `ApplyMutationsApi`：`operations` 改为 `readonly Operation[]`。
2. `HistoryCaptureInput` 与 `HistoryApplyEntry` 改为只读数组参数。
3. `reduceOperations` / `normalizeOperations` / `invertOperations` 入口改为只读数组参数。
4. writer/history 内部在需要可变数组时显式复制。

### C. 兼容策略

1. 返回值可保持原有结构，入参优先收敛为只读。
2. 局部确需可变时使用局部副本（`[...ops]`）而非修改入参。

## 约束

1. 不改变业务行为。
2. 不改变 CQRS 时序与 write/read 边界。
3. 保持现有 API 名称不变，仅收紧类型。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工检查：
   1. `Operation` 不可变约束在编译期生效。
   2. 写链路与 history 行为无回归。

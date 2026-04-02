# PR-37: 移除 Public `commands.write`，保留 Internal Write Primitive

## 目标

收敛写入口语义面：

1. 对外 `instance.commands` 只暴露业务语义命令（`node/edge/viewport/mindmap/selection/...`）。
2. `write.apply` 仅作为 engine 内部原语（runtime/reactions）使用，不再属于 public API。
3. 保持现有功能与行为不变，不引入新的写路径。

## 现状问题

1. Public `Commands` 暴露 `write.apply`，形成“语义命令 + 原语命令”双层对外面，边界不清晰。
2. 反应链路（`Measure/Autofit`）当前通过 `Commands['write']` 取类型，隐式耦合到 public 类型面。
3. 文档与链路表达仍把 `write.apply` 当成对外入口，不符合“命令语义化 + 单写路径内聚”的收敛方向。

## 设计

### A. Public API 收敛

1. 从 `types/command/api.ts` 的 `Commands` 中移除 `write` 字段。
2. `instance/facade/commands.ts` 不再返回 `write`。

### B. Internal API 保留

1. 在 `types/write/commands.ts` 独立定义 `WriteCommandsApi`（不再引用 `Commands['write']`）。
2. `runtime/write/api/write.ts` 继续实现内部 `write.apply`，并保留网关协议与 trace 行为。
3. `Reactions` 继续通过 `writeRuntime.commands.write.apply` 注入 `Measure/Autofit`，仅在 engine 内部可见。

### C. 类型依赖解耦

1. `Measure/Autofit` 的 `applyWrite` 类型改为内部 `WriteCommandsApi['apply']`。
2. 反应模块不再依赖 public `Commands` 的 `write` 成员。

## 约束

1. 不改变写链路行为与时序：`gateway -> planner -> writer -> changeBus -> read invalidation`。
2. 不改变外部业务命令行为。
3. 不新增第二写路径。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工检查：
   1. `instance.commands.write` 对外不可见。
   2. `Measure/Autofit` 仍可通过内部注入执行系统写入。
   3. `ENGINE_CURRENT_CHAIN_FLOW.md` 与代码边界一致。

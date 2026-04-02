# PR-38: 从 CommandSet 移除 write，并上提 Runtime 内部 applyWrite

## 目标

进一步收敛写链路边界，彻底消除 `commands.write.apply` 这种“原语伪装成语义命令”的结构。

1. `CommandSet` 只保留语义命令集合。
2. `write.apply` 作为内部原语上提到 `WriteRuntime` 顶层，命名为 `applyWrite`。
3. reactions 直接依赖 `writeRuntime.applyWrite`，不再经过 `writeRuntime.commands.write.apply`。

## 现状问题

1. `CommandSet` 中混入 `write`，导致语义层和原语层混杂。
2. `runtime/write/runtime.ts` 的 base command builder 仍包含 `write`，并额外携带 `gateway` 依赖，装配不够直观。
3. reactions 通过 `commands.write.apply` 访问内部能力，边界表达不清晰。

## 设计

### A. 类型层收敛

1. `types/write/commands.ts`：把 `WriteCommandsApi` 收敛为函数类型 `WriteApply`。
2. `types/write/runtime.ts`：
   1. `CommandSet` 删除 `write`。
   2. `Runtime` 新增顶层字段 `applyWrite: WriteApply`。

### B. 运行时装配收敛

1. `runtime/write/api/write.ts`：导出 `applyWrite({ gateway }) => WriteApply`。
2. `runtime/write/runtime.ts`：
   1. base command builder 移除 `write`。
   2. `BaseCommandBuilderDeps` 移除 `gateway`。
   3. runtime 返回值增加 `applyWrite`，由 `gateway` 封装生成。

### C. 反应链路收敛

1. `instance/reactions/Reactions.ts`：依赖 `Pick<WriteRuntime, 'changeBus' | 'applyWrite'>`。
2. `Measure/Autofit` 的 `applyWrite` 类型改为内部 `WriteApply`。

## 约束

1. 不改变功能与行为，不改变写事务时序。
2. 不新增写路径，仍通过网关进入统一写漏斗。
3. public `instance.commands` 继续保持语义命令-only。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工检查：
   1. `writeRuntime.commands` 不再包含 `write`。
   2. reactions 仅依赖 `writeRuntime.applyWrite`。
   3. `ENGINE_CURRENT_CHAIN_FLOW.md` 与实现一致。

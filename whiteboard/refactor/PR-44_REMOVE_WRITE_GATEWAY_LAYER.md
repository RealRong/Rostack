# PR-44: 移除 write gateway 中间层，applyWrite 直连 apply

## 目标

删除 `applyWrite -> CommandGateway -> apply` 中间层，收敛为 `applyWrite -> apply` 单路径。

1. 去掉 `WriteRuntime.gateway`。
2. `applyWrite` 内联 source/trace 归一逻辑后直接调用 `apply`。
3. 删除 runtime 侧 `createCommandGateway` 实现与相关无用导出。

## 现状问题

1. gateway 仅被 `applyWrite` 单点消费，未形成真实复用。
2. gateway 做的事情（source/trace 归一 + payload 校验 + 结果包装）可在 `applyWrite` 内联完成。
3. `WriteRuntime` 暴露 `gateway` 但无消费者，增加认知面。

## 设计

### A. 运行时链路收敛

1. `execution.ts` 删除 `createCommandGateway` 依赖。
2. `applyWrite` 直接调用 `apply`：
   1. `commandId = payload.trace?.commandId ?? createId('command')`
   2. `source = payload.source ?? 'ui'`
   3. `trace.correlationId = payload.trace?.correlationId ?? commandId`

### B. 类型面收敛

1. `types/write/runtime.ts` 删除 `gateway` 字段。
2. `WriteExecution` 删除 `gateway` 字段。

### C. 无用代码清理

1. 删除 `runtime/command/gateway.ts` 与 `runtime/command/index.ts`。
2. `runtime/write/runtime.ts` 不再返回 `gateway`。

## 约束

1. 不改变写事务行为。
2. 不改变外部语义命令行为。
3. 不新增写路径。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工检查：
   1. 代码中无 `createCommandGateway` 调用。
   2. `WriteRuntime` 无 `gateway` 字段。
   3. 链路为 `applyWrite -> apply -> planner -> writer`。

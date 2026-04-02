# PR-20 设计文档：legacy flags 默认关闭与清理

## 背景

迁移完成后仍需要保留受控回退能力，但默认入口应切到新链路，避免继续依赖 legacy 行为。

## 目标

1. 在 engine 配置中引入 feature flags。
2. 默认启用新路径、关闭 legacy 路径。
3. 在关键执行点接入开关：
   - write gateway
   - read invalidation

## 文件落点

1. `packages/whiteboard-engine/src/types/instance/config.ts`
2. `packages/whiteboard-engine/src/config/defaults.ts`
3. `packages/whiteboard-engine/src/config/index.ts`
4. `packages/whiteboard-engine/src/runtime/write/api.ts`
5. `packages/whiteboard-engine/src/runtime/write/runtime.ts`
6. `packages/whiteboard-engine/src/instance/reactions/Reactions.ts`

## 默认策略

1. `commandGatewayEnabled: true`
2. `readInvalidationEnabled: true`
3. `unifiedInversionEnabled: true`
4. `legacyMutateEnabled: false`

## 非目标

1. 不删除所有 legacy 代码路径（保留受控回滚能力）。
2. 不引入新的配置系统。

## 验收标准

1. 默认配置下走新链路。
2. flag 可控切回兼容路径。
3. 编译通过。

## 回滚方案

1. 将默认值切回 legacy，并移除执行点开关判断。

# PR-42: 统一全局 ID 生成到 core `createId`

## 目标

在 `@whiteboard/core` 提供单一 ID 生成函数 `createId`，并在 engine/core 全链路统一使用，移除 engine 的本地 ID 薄封装。

1. `core` 提供唯一 ID 入口：`createId(prefix?: string)`。
2. `engine` 删除 `runtime/write/shared/identifiers.ts`。
3. `createScopedId/createBatchId` 全量替换为 `createId`，不再做 exists 校验式生成。

## 现状问题

1. engine 内存在 `createScopedId/createBatchId` 两套本地策略，和 core 默认 id 方案分离。
2. `createScopedId` 依赖 `exists` 回调，带来文档查询耦合与额外复杂度。
3. ID 生成入口分散，不利于全局一致性与未来替换。

## 设计

### A. core 新增统一 id 能力

1. 新增 `packages/whiteboard-core/src/utils/id.ts`。
2. 导出 `createId(prefix?: string)`：
   1. 优先 `crypto.randomUUID()`。
   2. 无该能力时回退 `Date.now + Math.random`。
   3. 可选前缀拼接，保证可读性。
3. 在 `utils/index.ts` 导出该函数。

### B. engine 全量切换

1. `execution.ts`、`writer.ts` 改为使用 `@whiteboard/core/utils` 的 `createId`。
2. plan domain（node/edge/mindmap）改为 `createId('node'|'edge'|'mindmap'|'mnode'|'group')`。
3. 删除 `runtime/write/shared/identifiers.ts`。

### C. core 默认生成器收敛

1. `core/state.ts` 默认 `document/node/edge/mindmap/mnode/changeSet` id 改为 `createId(prefix)`。
2. `mindmap/commands.ts` 默认 tree/node id 改为 `createId(prefix)`。

## 约束

1. 不改变写链路语义。
2. 不改变 public API 类型定义。
3. 不引入额外包装层。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工检查：
   1. engine 中无 `createScopedId/createBatchId`。
   2. `runtime/write/shared/identifiers.ts` 已删除。
   3. `@whiteboard/core/utils` 可导出并被 engine 使用。

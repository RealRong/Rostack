# PR-11 设计文档：edge 增量接入 dirtyEdgeIds

## 背景

当前 edge 增量主要依赖 `dirtyNodeIds` 推导关联边，无法高效处理“仅边自身变化”的场景（如 routing/label/style 中影响路径的数据变更）。

## 目标

1. 在 read change plan 中补充 `appendDirtyEdgeIds`。
2. planner 将 `ReadInvalidation.stages.projection.edge.dirtyEdgeIds` 透传到 edge stage。
3. edge cache 在增量阶段同时消费 `dirtyNodeIds` 与 `dirtyEdgeIds`。

## 设计原则

1. 精确增量优先，避免不必要全量重算。
2. 与现有 `dirtyNodeIds` 路径并行兼容。
3. full/replace 语义保持不变。

## 文件落点

1. `packages/whiteboard-engine/src/types/read/change.ts`
2. `packages/whiteboard-engine/src/runtime/read/planner.ts`
3. `packages/whiteboard-engine/src/runtime/read/stages/edge/cache.ts`

## 非目标

1. 不修改 edge 路径求解算法。
2. 不改变 node/mindmap stage 行为。

## 验收标准

1. `dirtyEdgeIds` 可从 invalidation 进入 edge cache。
2. 仅边脏更新时，edge 缓存可增量刷新。
3. full/reset 场景下 pending 集合正确清空。

## 回滚方案

1. 移除 `appendDirtyEdgeIds` 字段并恢复旧 pending 逻辑。

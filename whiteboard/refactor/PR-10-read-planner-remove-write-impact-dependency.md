# PR-10 设计文档：read planner 移除 write/impact 依赖

## 背景

read 模块当前仍通过旧路径感知 write impact，导致读写边界耦合。需要落实“读侧只认失效协议”。

## 目标

1. planner 仅消费 `ReadInvalidation`。
2. `applyChange` 明确走桥接：`Change -> ReadInvalidation -> plan`。
3. read 模块不再 import `runtime/write/impact`。

## 设计原则

1. 协议优先：planner 不关心写侧实现细节。
2. 桥接集中：适配逻辑只留在 `invalidationAdapter`。
3. 改动最小化：不改变 stage 执行语义。

## 文件落点

1. `packages/whiteboard-engine/src/runtime/read/planner.ts`
2. `packages/whiteboard-engine/src/runtime/read/kernel.ts`
3. `packages/whiteboard-engine/src/runtime/read/invalidationAdapter.ts`

## 非目标

1. 不改变 edge/node/mindmap stage 算法。
2. 不删除 `Change` 类型（兼容入口仍保留）。

## 验收标准

1. `runtime/read/*` 不再 import `runtime/write/impact`。
2. planner 输入类型为 `ReadInvalidation`。
3. 现有行为回归通过。

## 回滚方案

1. 恢复旧 planner 变换函数与旧 applyChange 实现。

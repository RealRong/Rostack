# PR-02 设计文档：ReadInvalidation 契约与适配器草稿

## 背景

当前 read planner 直接依赖 write impact 细节，读写边界耦合。要实现 CQRS 与漏斗原则，read 侧必须只消费稳定的失效协议，而不是 write 内部结构。

## 目标

1. 新增 `ReadInvalidation` 类型，作为读侧唯一失效输入契约。
2. 新增 `invalidationAdapter`，负责将现有 `Change` 适配为 `ReadInvalidation`。
3. 本 PR 只落类型和适配器草稿，不改 read runtime 行为。

## 设计原则

1. 漏斗化：上游多样变化先收敛成统一失效对象。
2. 语义清晰：字段名使用完整单词，避免难懂缩写。
3. 渐进迁移：保留旧 planner，后续 PR 再切换消费方。

## 文件落点

1. `packages/whiteboard-engine/src/types/read/invalidation.ts`
2. `packages/whiteboard-engine/src/runtime/read/invalidationAdapter.ts`
3. `packages/whiteboard-engine/src/types/read/index.ts` 导出补齐

## 协议概要

1. 顶层字段：`mode`、`reasons`、`revision`、`dirtyNodeIds`、`dirtyEdgeIds`、`stages`。
2. 阶段字段：
   - `stages.index`: `nodeRectIndex` / `snapIndex`
   - `stages.projection`: `node` / `mindmap` / `edge`
3. `stages.projection.edge` 明确 `rebuild`、`dirtyNodeIds`、`dirtyEdgeIds`、`resetVisibleEdges`。

## 非目标

1. 不替换 `planner.ts` 现有输入。
2. 不移除 `write/impact` 依赖。
3. 不改 edge 缓存执行逻辑。

## 验收标准

1. ReadInvalidation 类型可独立导出。
2. adapter 能把 `Change` 稳定映射成 `ReadInvalidation`。
3. 现有 read 链路行为不变。

## 回滚方案

1. 删除新增类型和 adapter 文件，不影响旧 read 路径。

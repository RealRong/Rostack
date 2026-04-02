# PR-57 ReadHints 语义统一（rebuild + dirtyIds）

## 背景

当前 read stage 子计划存在实现细节泄漏：

1. `index.mode = 'dirtyNodeIds'` 命名不自然。
2. `edge` 使用 `clearPendingDirtyNodeIds/appendDirtyNodeIds/appendDirtyEdgeIds/resetVisibleEdges`，偏命令式。

## 目标

统一为 stage-ready 语义：

1. `index: { rebuild: 'none' | 'dirty' | 'full', dirtyNodeIds }`
2. `edge: { rebuild: 'none' | 'dirty' | 'full', dirtyNodeIds, dirtyEdgeIds }`

由 stage 内部解释如何清空/追加/全量重建，协议层不暴露内部动作词。

## 方案

1. 改 `types/read/change.ts` 的 `IndexChange/EdgeChange`。
2. 改 `createReadInvalidation` 生成逻辑，直接生成 `rebuild`。
3. 改 read consumers：
   - `Autofit.ingest`
   - `NodeRectIndex.applyPlan`
   - `SnapIndex.applyPlan`
   - `index/stage` 初始 full 计划
   - `edge/cache.applyPlan`（去命令式字段分支）
4. `edge/cache` 去掉 `pendingResetVisibleEdges` 中间状态。

## 影响文件

- `types/read/change.ts`
- `runtime/write/stages/invalidation/readHints.ts`
- `instance/reactions/Autofit.ts`
- `runtime/read/stages/index/NodeRectIndex.ts`
- `runtime/read/stages/index/SnapIndex.ts`
- `runtime/read/stages/index/stage.ts`
- `runtime/read/stages/edge/cache.ts`

## 风险

中等风险（协议字段替换），但均在内部闭环。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 回归：
   - replace 全量重建
   - node dirty 增量重建
   - edge routing dirty 增量重建

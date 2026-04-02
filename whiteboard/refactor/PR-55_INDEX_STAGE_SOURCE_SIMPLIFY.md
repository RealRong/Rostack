# PR-55 Index Stage 参数收敛（移除 IndexApplySource 中间层）

## 背景

当前 index 刷新链路为：

1. `index/stage.ts` 每次构造 `IndexApplySource { snapshot, canvas }`。
2. `NodeRectIndex.applyPlan(plan, source)`。
3. `SnapIndex.applyPlan(plan, source)`。

该 `source` 只是把已知对象二次打包，属于可收敛的中间层。

## 目标

1. `NodeRectIndex` 直接接收 `snapshot`。
2. `SnapIndex` 直接接收 `canvas` 查询能力。
3. 删除 `IndexApplySource` 类型。

## 方案

1. `NodeRectIndex.applyPlan(plan, snapshot)`：
   - full: `snapshot.nodes.canvas`
   - dirty: `snapshot.indexes.canvasNodeById`
2. `SnapIndex.applyPlan(plan, canvas)`：
   - full: `canvas.all()`
   - dirty: `canvas.byId`
3. `index/stage.ts`：
   - 读取 snapshot 后直接传给 `NodeRectIndex`
   - `SnapIndex` 直接复用 `nodeRectIndex`
4. `types/read/indexer.ts`：
   - 删除 `IndexApplySource`
   - 新增简洁类型 `IndexCanvasSource`（供 stage 内签名使用）

## 影响文件

- `runtime/read/stages/index/NodeRectIndex.ts`
- `runtime/read/stages/index/SnapIndex.ts`
- `runtime/read/stages/index/stage.ts`
- `types/read/indexer.ts`

## 风险

低风险（参数收敛，不改逻辑）。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 回归：full/dirty index 更新结果一致。

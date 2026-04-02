# PR-27: Autofit 内部 RebuildPlan 收敛（参数与流程拉直）

## 目标

简化 `Autofit` 内部控制流，减少 `resolveGroupsToProcess` 的参数面，去掉不再必要的 diff 分支，保留行为一致。

## 背景问题

原实现中 `resolveGroupsToProcess` 同时承载：

1. full/partial 决策。
2. dirty node 到 dirty group 推导。
3. diff fallback（`pendingDiff`）。

导致入参较多、状态分散（`forceFullSync/pendingDiff/pendingDirtyNodeIds`）。

## 设计

1. 引入内部聚合意图 `RebuildPlan`：
   1. `rebuild: 'none' | 'dirty' | 'full'`
   2. `dirtyNodeIds`
2. `resolveGroupsToProcess` 改为只消费：
   1. `groups`
   2. `prevSnapshot`
   3. `currentSnapshot`
   4. `plan`
3. 删除 `pendingDiff` 及其 `collectChangedNodeIds` / `isSameNodeForAutofit` 路径。
4. `handleCommit` 遇到异常的 `dirtyNodeIds` 空集合时，直接回退到 `full`，保证正确性优先。

## 收益

1. `resolveGroupsToProcess` 参数收敛，职责更单一。
2. 内部状态从三路收敛到单一 rebuild 计划。
3. 代码路径更短，更符合“读 hints -> 生成内部计划 -> 执行”的漏斗形态。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工验证：
   1. replace/full 情况仍触发全量 autofit。
   2. dirtyNodeIds 增量更新仍可正确定位 group。
   3. 无关变更不触发 autofit。

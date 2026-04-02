# PR-25: Autofit 改为消费 Index Plan（先走 index 漏斗）

## 目标

在不引入新协议字段（例如 `layout.rebuild`）的前提下，把 `Autofit` 触发逻辑进一步收敛到 `readHints.index`，减少语义分叉。

## 背景

当前 `Autofit` 已经从 `impact` 迁移到 `readHints`，但仍读取 `mode/reasons/dirtyNodeIds` 组合，存在解释层。

为了遵循漏斗原则，先使用已有的 stage-ready 计划：

1. `index.mode`
2. `index.dirtyNodeIds`

## 设计

`Autofit.handleCommit` 改为三段判定：

1. `index.mode === 'none'`：直接返回。
2. `index.mode === 'full'`：触发 `forceFullSync`。
3. `index.mode === 'dirtyNodeIds'`：优先使用 `index.dirtyNodeIds` 做增量；如果为空则回退 `pendingDiff`。

## 好处

1. 反应层不再解释 `reasons`，只执行 `index` 计划。
2. 避免 `kind/reasons/mode` 多信号重复。
3. 后续若要引入 `layout.rebuild`，可由 `index` 规则平滑演进。

## 风险与边界

1. 该改动依赖 `createReadInvalidation` 正确生成 `index.mode`。
2. 若未来 `index` 语义变化，需要同步评估 `Autofit`。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工验证：
   1. `replace/reset` 后 `index.mode='full'`，Autofit 触发全量。
   2. 节点几何变化后 `index.mode='dirtyNodeIds'`，Autofit 走增量。
   3. 无关变更 `index.mode='none'`，Autofit 不触发。

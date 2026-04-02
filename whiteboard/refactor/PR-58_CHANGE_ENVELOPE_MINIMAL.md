# PR-58 Change / ReadInvalidation 最小化

## 背景

当前协议中存在未被消费的顶层字段：

1. `Change` 顶层：`revision`、`kind`。
2. `ReadInvalidation` 顶层：`mode`、`revision`、`dirtyNodeIds`、`dirtyEdgeIds`。

读执行链路实际只消费：`readHints.index` 与 `readHints.edge`。

## 目标

1. `Change` 收敛为：
   - `trace`
   - `readHints`
2. `ReadInvalidation` 收敛为：
   - `index`
   - `edge`
3. `createReadInvalidation` 仅根据 `impact` 生成 stage-ready 计划。

## 方案

1. 修改类型：
   - `types/write/change.ts`
   - `types/read/invalidation.ts`
2. 修改生成器：
   - `runtime/write/stages/invalidation/readHints.ts`
3. 修改 writer 发布：
   - `runtime/write/stages/commit/writer.ts`
4. 清理无效导出：
   - `src/index.ts` 中的 `InvalidationMode/InvalidationRevision`

## 风险

中等（协议字段移除），但仓内当前无消费点。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 回归：写入 -> changeBus -> read stage -> reactions 正常。

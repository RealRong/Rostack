# PR-26: 移除 ReadInvalidation.reasons（协议瘦身）

## 目标

在 `Autofit` 已改为只消费 `readHints.index` 后，继续移除无运行时消费者的 `reasons` 字段，减少协议噪音。

## 背景

当前 `ReadInvalidation` 包含：

1. `mode`
2. `reasons`
3. `revision`
4. `dirtyNodeIds`
5. `dirtyEdgeIds`
6. `index`
7. `edge`

但 `reasons` 在运行时已无消费者，保留它只会引入额外构造与心智负担。

## 改动

1. 删除 `types/read/invalidation.ts` 中：
   1. `InvalidationReason` 类型。
   2. `ReadInvalidation.reasons` 字段。
2. 删除 `runtime/write/readHints.ts` 中：
   1. `reasons` 构造逻辑。
   2. 相关常量与类型依赖。
3. 删除 `src/index.ts` 中 `InvalidationReason` 的导出。
4. 更新链路文档，移除对 `reasons` 的现行协议描述。

## 收益

1. 读失效协议更简洁，保持“计划驱动”核心字段：`mode/index/edge/dirty ids`。
2. 写侧 hints 生成更轻量，减少非必要分支。
3. 消除 `mode + reasons` 的潜在重复表达。

## 风险与边界

1. 这是公开类型变更（breaking type change）。
2. 若外部调用方依赖 `ReadInvalidation.reasons`，需要同步调整。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. `rg` 确认仓内不再存在 `InvalidationReason` 与 `readHints.reasons` 运行时依赖。

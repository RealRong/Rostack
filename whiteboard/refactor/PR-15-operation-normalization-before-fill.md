# PR-15 设计文档：operation normalization（before 单点补齐）

## 背景

逆推依赖 `before` 字段，但当前不同来源的 operation 对 `before` 填充不一致，导致历史与逆推存在隐式失败风险。

## 目标

1. 在 kernel 引入 `normalizeOperations`。
2. 在 `reduceOperations` 前统一补齐关键操作的 `before`。
3. 保持调用方无需感知该补齐过程。

## 设计原则

1. 单点补齐，避免散落在各 planner。
2. normalization 只做“语义完整化”，不改变业务意图。
3. 尽量保留已有字段，只有缺失时才补。

## 文件落点

1. `packages/whiteboard-core/src/kernel/normalize.ts`（新增）
2. `packages/whiteboard-core/src/kernel/reduce.ts`

## 补齐范围

1. `node.update/delete/order.*`
2. `edge.update/delete/order.*`
3. `mindmap.replace/delete/node.update`
4. `viewport.update`

## 非目标

1. 不改操作来源接口。
2. 不改变 apply 顺序。

## 验收标准

1. 缺失 `before` 的关键操作可在 kernel 侧自动补齐。
2. 逆推失败率下降（语义上不再依赖调用方补齐）。

## 回滚方案

1. `reduceOperations` 移除 normalization 调用。

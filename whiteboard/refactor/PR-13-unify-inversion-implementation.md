# PR-13 设计文档：逆推（inversion）单实现落地

## 背景

当前逆推逻辑在 `kernel/invert.ts` 与 `core/history.ts` 各维护一份，存在重复 switch 和行为漂移风险。

## 目标

1. 抽出共享 inversion 模块，作为唯一逆推实现源。
2. `kernel/invert.ts` 与 `core/history.ts` 统一复用该模块。
3. 对外行为保持一致。

## 设计原则

1. 单一事实来源，避免分叉演进。
2. 最小侵入：先复用，不改协议。
3. 保持错误语义（不可逆仍返回失败）。

## 文件落点

1. `packages/whiteboard-core/src/kernel/inversion/index.ts`（新增）
2. `packages/whiteboard-core/src/kernel/invert.ts`
3. `packages/whiteboard-core/src/core/history.ts`

## 非目标

1. 不改变操作定义结构。
2. 不改变 history 捕获策略。

## 验收标准

1. 逆推 switch 只保留一份实现。
2. kernel reduce 与 core history 都走共享 inversion。
3. 编译与行为回归通过。

## 回滚方案

1. 恢复两个模块各自的 inversion 逻辑。

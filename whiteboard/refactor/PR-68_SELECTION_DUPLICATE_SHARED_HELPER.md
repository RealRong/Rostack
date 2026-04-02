# PR-68 selection duplicate 规划抽取 shared helper

## 背景

`runtime/write/stages/plan/domains/selection.ts` 中 `duplicate` 分支承担了完整复制流程（节点拓扑排序、id 映射、working doc 推进、边复制），逻辑较长，影响 domain 主流程可读性。

## 目标

1. 把 duplicate 规划逻辑抽到 `plan/shared`。
2. `selection` domain 保持“语义路由 + 少量参数组装”。
3. 行为不变，仍保证单事务计划与 parent/edge 映射正确。

## 方案

1. 新增 `runtime/write/stages/plan/shared/duplicate.ts`：
   - `buildDuplicateSelectionDraft(options)`
   - 内部实现节点排序、working doc 递推、边复制、结果 value 组装。

2. `selection.ts` 中 `duplicate` 分支改为调用 helper：
   - 传入 `doc`、`selectedNodeIds`、`registries`、`createNodeId`、`createEdgeId`、`offset`。

3. helper 内部统一构建 `KernelRegistriesSnapshot`，避免 domain 重复处理。

## 风险

1. 逻辑搬迁若漏细节会影响 duplicate 结果。
2. 需要确保失败路径（cancelled/invalid）与现状语义一致。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 回归：duplicate 后节点层级、边连接、selection 回填一致。

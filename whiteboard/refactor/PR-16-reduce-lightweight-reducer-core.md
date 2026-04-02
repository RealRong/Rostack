# PR-16 设计文档：reduce 轻量化（复用 reducer core）

## 背景

`reduceOperations` 过去每次都会创建新的 core 实例，存在额外对象构建和注册开销。

## 目标

1. 引入可复用的 reducer core。
2. 每次 reduce 前通过 `load` 重置文档快照，而不是重建实例。
3. 保持对外行为一致。

## 设计原则

1. 语义不变，先优化实例生命周期。
2. 复用只发生在 kernel 层，对调用方透明。
3. 保留 registries 注入能力。

## 文件落点

1. `packages/whiteboard-core/src/kernel/internal.ts`
2. `packages/whiteboard-core/src/kernel/reduce.ts`

## 非目标

1. 不重写 apply/reducer 语义。
2. 不改变 ChangeSet 结构。

## 验收标准

1. reduce 路径不再每次新建 core。
2. 编译通过，行为不变。

## 回滚方案

1. 恢复每次 `createKernelCore` 的旧路径。

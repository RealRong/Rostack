# PR-90 Simplify Write Runtime Flow

更新时间：2026-03-06

## 目标

在不改变主链语义的前提下，继续拉直 `packages/whiteboard-engine/src/runtime/write/runtime.ts` 的阅读路径。

## 问题

当前 `runtime.ts` 还有几处阅读噪音：

1. runtime 内部 `applyOperations` 与 `Writer.applyOperations` 同名，但职责不同。
2. `replaceDocument` 实际同时服务 `load` 与 `replace`，命名偏窄。
3. `applyDraft` 与 `toDispatchResult` 都属于小型转发层，增加视线切换。

## 设计

### 1. runtime 以 `commit` 表达 write policy

`runtime.ts` 内部统一为：

1. `commit(operations, source, trace)`
2. `commitDocument(doc, notify)`
3. `apply(payload)`

这样阅读顺序就是：

```text
planner -> commit -> history -> document commit
```

### 2. Writer 方法名对齐 commit 语义

既然 `Writer` 现在是纯 commit 组件，则方法名改为：

1. `writer.commit(...)`
2. `writer.commitDocument(...)`

避免 runtime policy helper 与 writer commit method 同名同词。

### 3. 去掉无意义的小转发

1. 内联 `toDispatchResult`
2. 内联 `applyDraft`

保留真正有语义的边界：

1. `commit`
2. `commitDocument`
3. `apply`

## 预期结果

1. `runtime.ts` 从上到下更接近实际执行顺序。
2. `Writer` 和 `write runtime` 的职责差异从命名上即可看出。
3. 文件内薄转发进一步减少。

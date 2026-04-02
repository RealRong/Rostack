# PR-93 Single Writer Commit

更新时间：2026-03-06

## 目标

删除 `Writer.commitDocument(...)` 这条平行提交入口，把 `Writer` 对外收敛成单一 `commit(...)`。

## 问题

当前链路里同时存在：

1. `writer.commit(...)`
2. `writer.commitDocument(...)`
3. runtime 本地 `commitDocument(doc, notify)` helper

这会造成两类阅读噪音：

1. `Writer` 像是在暴露两个平级提交概念。
2. `document.commit(doc)` / `writer.commitDocument(...)` / runtime `commitDocument(...)` 三层命名过近，语义重叠。

## 设计

### 1. `Writer` 只暴露一个 `commit(...)`

改为判别联合：

```ts
type CommitInput =
  | {
      kind: 'operations'
      operations: readonly Operation[]
      source: CommandSource
      origin: Origin
      trace?: CommandTrace
    }
  | {
      kind: 'document'
      doc: Document
      source: CommandSource
      origin: Origin
      trace?: CommandTrace
      notify?: boolean
      timestamp?: number
    }
```

`Writer.commit(...)` 内部按 `kind` 分流：

1. `operations` 路径
2. `document` 路径

### 2. runtime 删除本地 `commitDocument`

`write.load / write.replace` 直接调用：

```ts
writer.commit({ kind: 'document', ... })
```

### 3. 保留 runtime 的 operation helper

runtime 仍保留一层 operation 提交 helper，用于：

1. history capture policy
2. history replay 时关闭 capture

但该 helper 不再和 `Writer` 形成“双 commit 方法”错觉。

## 预期结果

1. `Writer` 只有一个公开提交漏斗。
2. whole-document 只是提交输入的一种形态，不再占据独立方法名。
3. `runtime.ts` 去掉本地 `commitDocument` helper 后更直。

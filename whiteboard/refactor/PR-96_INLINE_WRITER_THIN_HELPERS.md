# PR-96 Inline Writer Thin Helpers

更新时间：2026-03-06

## 目标

继续简化 `Writer`，把只做单行转发、没有独立语义增量的 helper 内敛掉。

## 问题

当前 `Writer` 虽然已经收敛成：

- `prepareOperations(...)`
- `prepareDocument(...)`
- `finishCommit(...)`

但在 `finishCommit(...)` 周边仍残留几层薄 helper：

1. `commitDoc(...)`
2. `notify(...)`
3. `createReadHints(...)`
4. `projectChange(...)`
5. `publish(...)`

这些 helper 的共同问题是：

1. 只有单一调用点。
2. 只做单行或两行转发。
3. 不形成稳定边界，也没有复用价值。

因此它们会制造阅读噪音，让 `finishCommit(...)` 这条真实尾段被拆碎。

## 设计

### 1. 直接内敛到 `finishCommit(...)`

把 commit 尾段恢复成一条直线：

1. `instance.document.commit(doc)`
2. `createReadInvalidation({ impact })`
3. `project(readHints)`
4. `instance.document.notifyChange(doc)`
5. `publish({ trace, readHints })`

### 2. 保留真正的结构边界

下面这些继续保留：

1. `normalizeTrace(...)`
2. `createKernelRegistriesSnapshot(...)`
3. `prepareOperations(...)`
4. `prepareDocument(...)`
5. `finishCommit(...)`

原因：

1. 它们承载稳定语义。
2. 它们对应当前 `Writer` 的真实事务结构。
3. 继续内联会伤害可读性，而不是提升可读性。

### 3. 清理命名噪音

既然删除 `publish(...)` helper，就把字段 `emit` 直接恢复为 `publish`，避免：

- 一个字段叫 `emit`
- 一个概念叫 `publish change`

两套词汇同时存在。

## 预期结果

1. `finishCommit(...)` 成为完整、可顺读的提交尾段。
2. `Writer` 内只保留真正的结构 helper。
3. 命名从“字段 + 包装方法”收敛为单一词汇。 

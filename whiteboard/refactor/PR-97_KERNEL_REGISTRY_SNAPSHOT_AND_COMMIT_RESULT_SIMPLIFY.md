# PR-97 Kernel Registry Snapshot And Commit Result Simplify

更新时间：2026-03-06

## 目标

处理两个相邻问题：

1. `createKernelRegistriesSnapshot(...)` 在链路中的职责与位置。
2. `Writer.commit(...)` 返回结果里的 `applied` 噪音。

## 结论

### 1. `createKernelRegistriesSnapshot(...)` 有必要，但当前位置不好

它的作用不是装饰性封装，而是把 engine 当前的注册表定义：

- node types
- edge types
- node schemas
- edge schemas
- serializers

以只读快照的形式传给 kernel reduction。

原因：`reduceOperations(...)` 运行在临时 kernel core 上，这个 core 自带独立 registries；如果不把当前 registries 的定义重新注入进去，kernel apply 过程就可能缺少类型、schema、serializer 信息。

所以：

1. **需要 registry snapshot 这个概念**。
2. **不应该由 `Writer` 自己发明局部 helper**。
3. **也不应该在多个模块各写一份一样的 helper**。

最优做法是把它提升为 `@whiteboard/core/kernel` 的共享工具：

- `snapshotRegistries(registries)`

这样：

1. 语义归属清楚，属于 kernel input adapter。
2. `Writer` 和 `duplicate` 可以复用。
3. engine 不再承载 kernel 内部对象组装知识。

### 2. `CommitResult.applied` 应该删除

当前 `Writer.commit(...)` 的下游真正使用的是：

1. `changes`
2. `inverse`（仅 operations 路径）

`applied` 以及其中的：

- `docId`
- `origin`
- `operations`
- `reset`

当前没有真实消费方，只会制造以下问题：

1. operations 与 whole-document 结果看起来像在努力共享一套并不需要的 envelope。
2. `reset: true` 这类字段只是旧阶段残留语义，不是当前 write 链路的必要输出。
3. 类型层面变复杂，但不产生价值。

最优做法：

1. `DocumentCommitResult` 只保留 `changes`
2. `OperationsCommitResult` 只比它多一个 `inverse`
3. `CommitResult` 收敛为真正被消费的最小结果模型

## 设计

### 1. kernel 提供共享 snapshot 工具

在 `@whiteboard/core/kernel` 新增：

```ts
snapshotRegistries(registries: CoreRegistries): KernelRegistriesSnapshot
```

用于：

1. `Writer.prepareOperations(...)`
2. `buildDuplicateNodesDraft(...)`

### 2. CommitResult 改成最小成功模型

```ts
type CommitSuccess = {
  ok: true
  changes: ChangeSet
}

type OperationsCommitSuccess = CommitSuccess & {
  inverse: readonly Operation[]
}
```

对应：

1. `DocumentCommitResult = CommitSuccess`
2. `OperationsCommitResult = OperationsCommitSuccess | DispatchFailure`

### 3. Writer 内部同步简化

`PreparedCommit.result` 不再携带 `applied`，只携带真正需要向 runtime 暴露的成功结果。

## 预期结果

1. registry snapshot 概念保留，但从 engine 局部 helper 升级为 kernel 公共工具。
2. `Writer` 结果模型更小、更稳定。
3. `applied/reset` 这类无人消费的旧语义被彻底移除。

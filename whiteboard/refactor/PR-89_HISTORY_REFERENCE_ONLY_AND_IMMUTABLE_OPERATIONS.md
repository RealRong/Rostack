# PR-89 History Reference Only And Immutable Operations

更新时间：2026-03-06

## 目标

收敛 history 的数据模型与回放接口：

1. `Operation` 一旦生成，就按不可变值对待。
2. history 直接保存 `operations` 引用，不再重复 clone。
3. history replay 只接收 `operations`，不再传无用的 `cause`。
4. engine history entry 只保留真正参与回放的字段。

## 问题

当前实现里有三层噪音：

1. capture 时 clone 一次。
2. undo / redo replay 前再 clone 一次。
3. engine history entry 里保留了 `origin` / `timestamp`，但回放并不使用。
4. `HistoryReplay` 额外传 `cause`，但 write runtime 并不消费。

这些会导致：

1. history 层重复做防御性拷贝，增加心智负担。
2. `Operation` 的不可变约束没有被明确表达出来。
3. history API 比实际需要更宽。

## 设计

### 1. 明确 `Operation` 的不可变约束

约束为：

1. planner / reducer / inversion 可以基于已有值生成新 operation。
2. 但一旦某个 operation 被产出并进入提交链路，就不再原地修改。
3. 任何需要补充 `before` 或归一化的地方，都必须返回新 operation，而不是回头改旧对象。

因此：

1. `readonly Operation[]` 代表稳定操作序列。
2. history 可以直接按引用保存和回放。

### 2. history 只存回放所需最小数据

engine history entry 收敛为：

```ts
type HistoryEntry = {
  forward: readonly Operation[]
  inverse: readonly Operation[]
}
```

`origin` 只用于 capture policy 判断，不需要进入 entry。
`timestamp` 在 engine history 中没有消费，也不需要进入 entry。

### 3. replay port 缩成最小接口

改为：

```ts
type HistoryReplay = (operations: readonly Operation[]) => boolean
```

原因：

1. undo / redo 区分已经体现在 history 栈语义里。
2. write replay 已通过 `source='history'` 区分来源。
3. 若未来真的需要区分原因，应在更高层 trace 语义里补，而不是先把无用参数塞进 port。

## 非目标

这次不改这些 clone：

1. `normalize` 中为 `before` 快照做的 clone。
2. `inversion` 中为逆操作快照做的 clone。

这些 clone 属于“快照截取”，不是“history 重复拷贝”，职责不同。

## 预期结果

1. engine history 与 core history 都改为按引用保存 operation 序列。
2. history replay API 更窄、更稳定。
3. history 代码更接近真正职责：栈管理与回放，而不是数据复制。

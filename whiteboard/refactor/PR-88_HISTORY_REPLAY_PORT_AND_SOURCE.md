# PR-88 History Replay Port And Source

更新时间：2026-03-06

## 目标

把 history 从“每次 undo/redo 传一次 callback”收敛为“构造时注入 replay port”，并引入独立的 `history` source 语义。

## 问题

当前形态：

1. `History.undo(apply)` / `History.redo(apply)` 每次都需要外部传 callback。
2. replay 写入被标成 `source: 'system'`，语义不精确。

这会导致：

1. `History` 自己的 undo/redo 不是闭环方法。
2. runtime 里多出一层 `replayHistoryOperations` 包装。
3. undo/redo 与普通 system write 在 trace 语义上混在一起。

## 设计

### 1. History 构造时注入 replay port

改为：

```ts
type HistoryReplay = (
  operations: readonly Operation[],
  cause: 'undo' | 'redo'
) => boolean
```

`History` 构造时接收：

1. `now`
2. `replay`
3. 可选 `onStateChange`

之后 `undo()` / `redo()` 不再接收参数。

### 2. 引入 `CommandSource = 'history'`

undo/redo 回放不再标成 `system`，而是：

```ts
source: 'history'
```

### 3. origin 仍映射到 `system`

`history` source 在 write runtime 中仍归类到：

```ts
Origin = 'system'
```

原因：

1. 它不是 UI 原始写入。
2. 它也不是 remote/import。
3. 它是引擎内部回放行为。

## 预期结果

1. `History` 成为真正闭环的历史对象。
2. runtime 中不再需要每次传 `replayHistoryOperations`。
3. undo/redo trace 语义从 `system` 中独立出来。

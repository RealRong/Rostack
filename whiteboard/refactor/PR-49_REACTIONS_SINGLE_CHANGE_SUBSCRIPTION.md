# PR-49 Reactions 单订阅收敛（Read + Autofit）

## 背景

当前 `Reactions` 对同一个 `changeBus` 有两条订阅路径：

1. `Reactions` 内部订阅：负责 `readRuntime.applyInvalidation`。
2. `autofit.start(changeBus)`：`Autofit` 内部再订阅一次。

这会让生命周期分散在两处，不利于链路可读性与装配一致性。

## 目标

1. `Reactions` 只保留一次 `changeBus.subscribe`。
2. 同一回调内串行执行：
   - `readRuntime.applyInvalidation(change.readHints)`
   - `autofit.onChange(change)`
3. `Autofit` 从“自己订阅 bus”改为“被动接收 change 事件”。

## 设计

### 1) Autofit API 收敛

1. 删除 `start(changeBus)` 和内部 `offChange` 状态。
2. 提供公开 `onChange(change)` 事件入口，仅负责将 invalidation 转换为 `pendingPlan`。
3. 保留微任务 `syncTask` 与 `dispose`，仍由 `Autofit` 内部处理执行节流与状态机。
4. 保留构造时首帧 `syncTask.schedule()`，确保初次自动收敛行为不变。

### 2) Reactions 装配收敛

1. 去掉 `autofit.start(writeRuntime.changeBus)`。
2. `const offChange = changeBus.subscribe(change => { readRuntime.applyInvalidation(...); autofit.onChange(change) })`。
3. `dispose()` 仅释放一次订阅 `offChange`，然后 `autofit.dispose()`。

## 风险与控制

1. 风险：初始 autofit 不再触发。
2. 控制：在 `Autofit` 构造阶段保留 `syncTask.schedule()`。

## 预期收益

1. 事件入口单一，链路更直观。
2. 订阅生命周期集中在装配层，符合 CQRS 读写反应器职责边界。

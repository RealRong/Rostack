# PR-50 统一 Reactions Task Queue（Autofit 任务化）

## 背景

当前 `Reactions` 虽已收敛为单订阅，但 `Autofit` 仍内部维护调度细节，导致：

1. 生命周期边界不够统一。
2. 未来新增 reaction 功能时容易出现“每个功能一套 task 调度”的分散形态。

## 目标

1. 在 `Reactions` 内引入统一的任务队列（支持 lane）。
2. `Autofit` 只负责：
   - 输入 `change`
   - 产出声明式 task
   - 在 task 执行时计算写命令
3. 调度与生命周期统一在 `Reactions`。

## 设计

### 1) 统一任务协议

定义 `ReactionTask`（当前先落 `autofit`）：

- `lane`: `'microtask' | 'frame'`
- `topic`: `'autofit'`
- `payload`: `{ rebuild: 'full' | 'dirty'; dirtyNodeIds: readonly NodeId[] }`

### 2) 统一队列

新增 `ReactionTaskQueue`：

1. 维护 `pendingTasks`。
2. 按 `lane` 分别调度（`MicrotaskTask` / `FrameTask`）。
3. 对同 `topic` 任务做合并：
   - `full` 覆盖 `dirty`
   - `dirty` 合并 `dirtyNodeIds`
4. flush 时回调 `onTask(task)` 交给 `Reactions` 执行。

### 3) Autofit 职责收敛

`Autofit` 改为无调度模块：

1. `toTask(change)`：从 read hints 生成 `AutofitTask | null`。
2. `initialTask()`：首次全量任务。
3. `buildWriteInput(task)`：根据当前 doc/config 生成写命令（或 `null`）。

不再持有 `scheduler`、`task`、`dispose`。

### 4) Reactions 装配

1. 单订阅 changeBus。
2. 每次 change：
   - 立即 `readRuntime.applyInvalidation(change.readHints)`
   - `autofit.toTask(change)` 入统一队列
3. 队列消费 `autofit` task 时：
   - `autofit.buildWriteInput(task)`
   - 若有写命令则 `writeRuntime.apply(...)`
4. dispose 时统一释放：`offChange + taskQueue.dispose()`。

## 风险与控制

1. 风险：初始 autofit 丢失。
2. 控制：启动时 enqueue `autofit.initialTask()`。

3. 风险：任务合并规则错误导致漏更新。
4. 控制：`full` 优先级最高；`dirty` 采用 id 集合并集。

## 预期收益

1. 生命周期与调度单点收敛。
2. future reaction 扩展可复用统一队列，不再“每功能一套 task”。
3. 链路更加直观：`change -> task -> queue -> handler -> write.apply`。

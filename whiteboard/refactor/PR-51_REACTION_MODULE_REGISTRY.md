# PR-51 Reaction Module 注册表收敛（避免线性膨胀）

## 问题

当前虽有统一 `ReactionTaskQueue`，但 `Reactions` 仍包含模块硬编码：

1. 生产侧硬编码：`const task = autofit.toTask(change)`。
2. 消费侧硬编码：`if (task.topic === 'autofit') { ... }`。
3. 合并策略硬编码在 queue 内部。

这会导致新增模块时多处线性修改。

## 目标

1. `Reactions` 不感知具体 topic 细节。
2. 生产/合并/执行策略全部下沉到模块自身。
3. 新增模块只需：新增模块文件 + 注册表加一行。

## API 设计（短、常见、易懂）

### 1) 任务协议

```ts
type ReactionTask = {
  lane: 'microtask' | 'frame'
  topic: string
  payload: unknown
}
```

### 2) 模块协议

```ts
type ReactionModule = {
  topic: string
  initialTask?: () => ReactionTask | null
  createTask: (change: Change) => ReactionTask | null
  mergeTask: (current: ReactionTask, incoming: ReactionTask) => ReactionTask
  runTask: (task: ReactionTask) => WriteInput | null
  reset?: () => void
}
```

命名说明：`createTask/mergeTask/runTask` 为常见动作词，短且语义直接。

### 3) 队列协议

`ReactionTaskQueue` 仅负责：

1. 按 `lane` 调度。
2. 按 `topic` 存储 pending。
3. 遇到同 topic 任务时调用外部注入 `mergeTask`。
4. flush 时回调 `onTask`。

## Reactions 收敛后流程

1. 初始化 `modules` 与 `moduleByTopic`。
2. 启动时循环 `modules` 入队 `initialTask()`。
3. 每个 change：
   - 先 `readRuntime.applyInvalidation`
   - 循环模块 `createTask(change)`，非空则入队
4. 队列 flush：
   - `module = moduleByTopic.get(task.topic)`
   - `payload = module.runTask(task)`
   - `writeRuntime.apply(payload)`

## 收益

1. 避免“新增模块三处改动”的线性膨胀。
2. queue 与业务解耦，职责更纯。
3. Reactions 成为真正的装配层。

# PR-56 Reactions 协议收敛（seed / ingest / flush）

## 背景

当前 reactions 模块协议为：`init/create/merge/run/reset`，并依赖 `ReactionTask`（`lane/topic/payload`）在模块与队列之间传递。

虽然可扩展，但对当前场景偏重，新增模块仍需理解 5 个钩子。

## 目标

1. 模块协议收敛到最小：`ingest(change)` + `flush()`，可选 `seed()`。
2. 合并逻辑下沉到模块内部 pending 状态。
3. 队列只做 topic 级 microtask 去重调度，不承载 payload 合并语义。

## 方案

### 1) 模块协议

```ts
{
  topic: string
  seed?: () => void
  ingest: (change: Change) => void
  flush: () => WriteInput | null
}
```

### 2) Reactions 主流程

1. 启动时：`seed` 后 enqueue topic。
2. change 到达：
   - `readRuntime.applyInvalidation(change.readHints)`
   - 每个模块 `ingest(change)`
   - enqueue topic（去重）
3. queue flush：按 topic 找模块执行 `flush`，有 payload 则 `writeRuntime.apply(payload)`。

### 3) Autofit 内聚 pending

1. 内部维护 pending：
   - `rebuild: 'none' | 'dirty' | 'full'`
   - `dirtyNodeIds: Set<NodeId>`
2. `ingest` 只更新 pending。
3. `flush` 读取并清空 pending，再执行原有计算。

### 4) ReactionTaskQueue 收敛

1. 删除 lane/payload 模型。
2. 仅保留：
   - `enqueue(topic)`
   - `onTopic(topic)`
   - microtask flush

## 影响文件

- `instance/reactions/Reactions.ts`
- `instance/reactions/Autofit.ts`
- `instance/reactions/ReactionTaskQueue.ts`

## 风险

中等（协议改动），但作用域集中在 reactions 内部。

## 验证

1. 初始 autofit 生效。
2. 高频变更下 autofit 写入频次被 topic 去重。
3. `dispose` 后无回流写。
4. `pnpm -r lint` / `pnpm -r build`。

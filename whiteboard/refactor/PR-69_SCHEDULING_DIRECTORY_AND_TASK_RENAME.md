# PR-69 调度基础设施迁移到 src/scheduling 并重命名 Task 文件

## 背景

`Scheduler.ts` 与 `TaskQueue.ts` 当前位于 `src/runtime` 根目录，但它们不属于 read/write/shortcut 业务 runtime，而是通用调度基础设施。

同时 `TaskQueue.ts` 文件名与内容不一致：文件只提供 `FrameTask` / `MicrotaskTask` primitive，并不提供 queue 抽象。

## 目标

1. 将调度基础设施迁移到中立目录：`src/scheduling`。
2. 将 `TaskQueue.ts` 重命名为 `Task.ts`，与内容语义一致。
3. 全量更新引用路径，不改变任何运行时行为。

## 方案

1. 文件迁移：
   - `src/runtime/Scheduler.ts` -> `src/scheduling/Scheduler.ts`
   - `src/runtime/TaskQueue.ts` -> `src/scheduling/Task.ts`

2. 引用更新：
   - `instance/engine.ts`
   - `instance/reactions/{Reactions.ts,Queue.ts}`
   - `types/write/deps.ts`
   - `scheduling/Task.ts` 内部相对引用

3. 保持类名不变：
   - `Scheduler`
   - `FrameTask`
   - `MicrotaskTask`

## 风险

1. 纯路径变更，若漏改 import 会编译失败。
2. 无行为语义风险。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`

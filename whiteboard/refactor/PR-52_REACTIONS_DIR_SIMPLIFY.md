# PR-52 Reactions 目录与代码再简化（按 CODE_SIMPLIFIER）

## 问题

`instance/reactions` 当前有 5 个文件：

1. `Autofit.ts`
2. `Reactions.ts`
3. `ReactionTaskQueue.ts`
4. `ReactionTask.ts`（仅类型）
5. `ReactionModule.ts`（仅类型）

其中 4/5 是薄类型层，造成目录噪音与跳转成本。

## 修改

1. 删除 `ReactionTask.ts`，把 `ReactionTask` 类型并入 `ReactionTaskQueue.ts` 并导出。
2. 删除 `ReactionModule.ts`，模块协议内联到 `Reactions.ts` 本地类型。
3. 模块 API 命名收短：
   - `initialTask` -> `init`
   - `createTask` -> `create`
   - `mergeTask` -> `merge`
   - `runTask` -> `run`
4. `Autofit` 去掉未使用字段 `name`。

## 收益

1. 文件数从 5 降到 3。
2. 减少“只为类型跳转”的跨文件噪音。
3. 模块接口更短、更常见、阅读负担更低。

## 风险

1. 方法重命名可能遗漏调用点。
2. 类型文件删除可能遗漏 import。

## 验证

1. 全仓类型检查：`pnpm -r lint`
2. 构建验证：`pnpm -r build`

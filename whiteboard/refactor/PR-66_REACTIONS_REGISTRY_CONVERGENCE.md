# PR-66 Reactions 模块装配收敛（Registry）

## 背景

当前 `createReactions` 里同时维护：

1. `modules: Module[]`
2. `moduleByTopic: Map<string, Module>`
3. seed 循环
4. ingest 循环
5. flush topic 查找

虽然逻辑正确，但装配样板分散，新增 reaction 模块时需要在 `Reactions.ts` 理解多处循环与映射。

## 目标

1. 把 reaction 模块装配细节集中到一个 registry。
2. `Reactions.ts` 只保留主流程：
   - `readRuntime.applyInvalidation`
   - `registry.ingest`
   - `taskQueue` 驱动 `registry.flush`
3. 行为保持完全一致（含 topic 去重调度语义）。

## 方案

1. 新增 `instance/reactions/registry.ts`：
   - `ReactionModule` 类型
   - `createReactionRegistry(modules)`
   - `seed(enqueue)`
   - `ingest(change, enqueue)`
   - `flush(topic)`

2. `Reactions.ts` 改造：
   - 删除本地 `modules + moduleByTopic`。
   - 使用 `createReactionRegistry([new Autofit(...)])`。
   - `taskQueue.onTopic` 仅调用 `registry.flush(topic)`。

3. 安全性：
   - registry 初始化时检查 topic 唯一性，避免静默覆盖。

## 风险

1. 结构重排，若 topic 注册遗漏会导致某模块不执行。
2. topic 冲突由静默覆盖变为显式抛错（更安全，属于预期）。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 回归：autofit 仍会 seed 一次并在 change 后按 microtask 合并触发。

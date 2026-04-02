# PR-53 Writer 事务提交拆分（commitApply / commitReplace）

## 背景

当前 `Writer.commitTransaction<T>` 通过条件泛型同时承载 apply 与 replace 两条路径，并在多个返回点使用 `as unknown as TransactionResult<T>`。这会降低可读性，也让错误路径不够直观。

## 问题

1. 类型断言噪音高：存在多处 `as unknown as`。
2. 语义混合：apply/replace 的流程和返回类型耦合在同一函数。
3. 维护成本高：后续扩展其中一条路径时容易误伤另一条。

## 目标

1. 删除 `commitTransaction<T>` 条件泛型。
2. 显式拆分：
   - `commitApply(input: ApplyTransaction): ApplyResult`
   - `commitReplace(input: ReplaceTransaction): ResetResult`
3. 保留共享逻辑：`normalizeTrace`、`publishChange`、`syncDocumentState`。
4. 外部行为保持不变（`applyDraft/resetDoc/history` 结果一致）。

## 设计

1. `commitApply` 负责：
   - 调用 `reduceOperations`
   - 提交文档
   - 同步 revision/viewport
   - 发布 `kind='apply'` change
   - 返回 `ApplyResult`
2. `commitReplace` 负责：
   - 静默替换文档
   - 同步 revision/viewport
   - 发布 `kind='replace'` change
   - 返回 `ResetResult`
3. `applyHistoryOperations`、`commitOperations`、`resetDoc` 分别改为调用对应函数。

## 影响范围

- `packages/whiteboard-engine/src/runtime/write/stages/commit/writer.ts`

## 风险与回归

风险：低（纯重构）。

回归关注：

1. `applyDraft` 成功/失败结果结构。
2. `resetDoc` 的 change 语义。
3. `undo/redo` 是否仍通过 apply 路径回放。
4. history capture 行为不变。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`

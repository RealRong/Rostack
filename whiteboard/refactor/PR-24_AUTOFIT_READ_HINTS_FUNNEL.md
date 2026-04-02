# PR-24: Autofit 只消费 ReadHints（漏斗收敛）

## 目标

把 `Autofit` 的触发判断从“混用 `meta.kind + readHints`”收敛为“只消费 `readHints`”，减少重复条件和跨层语义耦合。

## 现状问题

1. `Autofit.handleCommit` 同时读取 `meta.kind` 与 `meta.readHints`。
2. `replace` 与 `readHints.mode === 'full'` 在当前协议下语义重叠。
3. `hasReason('full')` 与 `mode === 'full'` 也表达重复意图。

## 设计原则

1. 反应层只读单一漏斗信号：`ReadInvalidation`。
2. 判断结构按 `mode -> reasons -> dirtyNodeIds` 分层。
3. 保持行为不变：
   1. full 触发全量同步。
   2. partial + dirty ids 走增量。
   3. partial 无 dirty ids 走 diff fallback。

## 具体改动

1. 删除 `meta.kind` 相关分支判断。
2. 触发条件改为：
   1. `mode === 'full'`。
   2. 或 `reasons` 包含 `nodes/geometry/order`。
   3. 或 `dirtyNodeIds` 非空。
3. full 分支仅由 `mode === 'full'` 决定。
4. 其余分支保持既有 `pendingDirtyNodeIds/pendingDiff` 机制。

## 预期收益

1. `Autofit` 对写事务语义解耦，只依赖读侧协议。
2. 触发条件更短、更稳定，后续维护成本更低。
3. 保持当前外部行为一致，不引入协议变更。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工验证：
   1. `doc.reset/replace` 后仍 full autofit。
   2. node geometry/order 变化仍触发 autofit。
   3. 与 autofit 无关的变更不触发无效同步。

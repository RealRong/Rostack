# PR-86 Selection Facade And Document Domain Convergence

更新时间：2026-03-06

## 目标

把 `selection` 从 write 核心中移除，使 write 只保留纯 document domain：

1. `node`
2. `edge`
3. `viewport`
4. `mindmap`

`selection` 只保留为 facade 层 convenience orchestration。

## 问题

当前 `selection` 仍占据三层：

1. `WriteDomain` 中有 `selection`
2. planner 中有 `selection` domain
3. `runtime/write/api/selection.ts` 仍位于 write 目录下

这会带来两个问题：

1. write 核心不再是纯 document mutation，而是混入了 UI selection 语义。
2. selection convenience 和真正的 document command 仍未分层。

## 设计

## 1. 删除 write selection domain

移除：

1. `WriteDomain['selection']`
2. `WriteCommandMap['selection']`
3. `plan/domains/selection.ts`
4. `plan/router.ts` 中的 selection 分支

## 2. 把 selection convenience 收回 facade

新增 facade 层 selection 实现，负责：

1. `select`
2. `toggle`
3. `clear`
4. `selectAll`
5. `groupSelected`
6. `ungroupSelected`
7. `deleteSelected`
8. `duplicateSelected`

其中前四者是本地 state 写入，后四者是“读取 selection state 后，分发 document-domain write command”。

## 3. 衍生出纯 document-domain 命令

为避免把一次 selection 语义动作拆成多次写事务，补充 node domain 纯命令：

1. `node.group.ungroupMany`
2. `node.deleteCascade`
3. `node.duplicate`

这些命令都不依赖 selection state，只依赖显式传入的 `ids`。

## 4. selection facade 只做状态编排

selection facade 的写路径：

1. 读取 `selectedNodeIds / selectedEdgeId`
2. 转换为 `write.apply({ domain: 'node' | 'edge', command })`
3. 根据 write 结果更新 selection state

因此 selection 不再是 write domain，而是 commands facade 的上层语义。

## 5. 统一 public Commands 类型

把 selection convenience 方法正式写进 `Commands['selection']`，避免实现对象和公开类型继续分叉。

## 改动范围

1. `packages/whiteboard-engine/src/types/command/write.ts`
2. `packages/whiteboard-engine/src/types/command/public.ts`
3. `packages/whiteboard-engine/src/runtime/write/stages/plan/router.ts`
4. `packages/whiteboard-engine/src/runtime/write/stages/plan/domains/node.ts`
5. `packages/whiteboard-engine/src/runtime/write/stages/plan/domains/selection.ts`
6. `packages/whiteboard-engine/src/runtime/write/stages/plan/shared/duplicate.ts`
7. `packages/whiteboard-engine/src/runtime/write/api/selection.ts`
8. `packages/whiteboard-engine/src/runtime/write/api/index.ts`
9. `packages/whiteboard-engine/src/runtime/write/api/shortcut.ts`
10. `packages/whiteboard-engine/src/types/write/commands.ts`
11. `packages/whiteboard-engine/src/instance/facade/selection.ts`
12. `packages/whiteboard-engine/src/instance/facade/commands.ts`
13. `ENGINE_CURRENT_CHAIN_FLOW.md`

## 预期结果

1. write 核心只剩 document domain。
2. selection 成为 facade 层 convenience 语义。
3. 仍保持单事务、单写漏斗。
4. public Commands 类型与实际实现一致。

# PR-84 Commands -> Write -> Plan -> Commit -> Read -> Reactions

更新时间：2026-03-06

## 目标

把 engine 主链从：

`commands -> write -> execution -> writer -> changeBus -> reactions -> read`

收敛为：

`commands -> write -> plan -> commit -> read -> reactions`

## 问题

1. `execution` 只是薄装配层，没有独立职责。
2. `read.applyInvalidation` 挂在 `Reactions` 中，语义上把必经主链放进了可选副作用层。
3. `write.commands` 与 `instance/facade/commands` 形成双转发层，public write funnel 仍然不够直。
4. `Writer` 内部事务完成后才通过 changeBus 间接驱动 read，同步边界不够清晰。

## 设计

### 1. write 直接拥有 plan + commit + change publish

`createWrite` 直接完成：

1. 构造 `planner`
2. 构造 `changeBus`
3. 构造 `Writer`
4. 暴露 `apply / history / resetDoc / changeBus`

删除 `execution.ts`。

### 2. commit 后先做 read projection，再发 reactions

在 commit 内部统一顺序：

1. `document.set`
2. `revision++`
3. `viewport sync`
4. `read.applyInvalidation(readHints)`
5. `document.notifyChange`
6. `changeBus.publish(change)`

这样 reactions 消费到的 change 永远对应已经同步完成的 read model。

### 3. commands facade 直接驱动 write / state

`instance/facade/commands.ts` 直接组装：

- `node/edge/viewport/mindmap/selection` 通过 `write.apply`
- `interaction/tool/host` 直接改 state 或 viewport host
- `shortcut` 基于 selection + history 构建

删除 `write.commands`。

## 改动范围

1. `packages/whiteboard-engine/src/runtime/write/runtime.ts`
2. `packages/whiteboard-engine/src/runtime/write/execution.ts`
3. `packages/whiteboard-engine/src/runtime/write/commands.ts`
4. `packages/whiteboard-engine/src/runtime/write/stages/commit/writer.ts`
5. `packages/whiteboard-engine/src/instance/facade/commands.ts`
6. `packages/whiteboard-engine/src/instance/reactions/Reactions.ts`
7. `packages/whiteboard-engine/src/types/write/runtime.ts`
8. `packages/whiteboard-engine/src/types/write/deps.ts`
9. `packages/whiteboard-engine/src/types/write/writer.ts`
10. `packages/whiteboard-engine/src/instance/engine.ts`
11. `ENGINE_CURRENT_CHAIN_FLOW.md`

## 预期结果

1. public 主链变成真正的 `commands -> write -> plan -> commit -> read -> reactions`
2. mandatory read projection 不再依赖 reactions 生命周期
3. write 结构更接近单一事务服务
4. public commands 不再经过 `write.commands` 二次转发

# PR-85 Write Ownership And Doc Load Replace

更新时间：2026-03-06

## 目标

在已经完成 `commands -> write -> plan -> commit -> read -> reactions` 的基础上，继续做最后三步收敛：

1. `history` 从 `Writer` 提升到 `write` 顶层。
2. `doc.reset` 拆成显式的 `doc.load` 与 `doc.replace`。
3. `write.changeBus` 收窄成 `write.subscribe()`，不再暴露总线对象。

## 问题

### 1. history 所有权仍然过深

当前 `history` 仍由 `Writer` 持有，导致：

1. `commit` 与 `history policy` 混在一起。
2. `undo/redo` 看起来像底层提交器能力，而不是 write 顶层能力。
3. `Writer` 仍然不是纯 commit 组件。

### 2. whole-document API 语义不清

当前 `doc.reset` 同时承担两种不同意图：

1. 外部 host 把新文档装载进 engine。
2. engine 内部触发整文档替换。

这两者在 `notify` 策略上不同，但在旧 API 里没有被显式表达。

### 3. transient state 清理没有协议化

whole-document replace 后，旧的：

1. `selection`
2. `interaction.hover`
3. `interaction.pointer`
4. `interaction.focus`

都可能已经失效，但旧链路没有统一清理策略。

### 4. write 仍向外暴露 changeBus 对象

现在外部拿到的是 `write.changeBus`，这会把内部事件总线泄漏到 write 边界之外。

## 设计

## 1. write 自己拥有 history

`createWrite` 内部直接创建 `History`，并负责：

1. 普通 apply 成功后 capture history
2. undo/redo 时通过 `writer.applyOperations(..., captureHistory=false)` 回放
3. `load/replace` 时 clear history

`Writer` 不再持有 `History`。

## 2. Writer 退回纯 commit

`Writer` 只保留两类能力：

1. `applyOperations`
2. `replaceDocument`

它负责：

1. reduce / document.set
2. revision / viewport sync
3. read projection
4. notify（按选项）
5. publish committed change

它不再负责：

1. history policy
2. load/replace public 语义
3. undo/redo orchestration

## 3. doc.load / doc.replace 双语义

公共 API 改为：

```ts
commands.doc.load(doc)
commands.doc.replace(doc)
```

语义定义：

### `doc.load`

用于外部 host / controlled mode 把新文档装载进 engine。

行为：

1. 清 transient state
2. 清 history
3. full read projection
4. 不触发 `onDocumentChange`

### `doc.replace`

用于 engine 内部或宿主显式发起 whole-document 替换。

行为：

1. 清 transient state
2. 清 history
3. full read projection
4. 触发 `onDocumentChange`

## 4. transient state 清理策略

在 facade 的 `doc.load / doc.replace` 中统一清理：

1. `selection` -> empty
2. `selectedEdgeId` -> `undefined`
3. `selection.mode` -> `replace`
4. `interaction.hover` -> empty
5. `interaction.pointer` -> idle
6. `interaction.focus` -> all false

不清理：

1. `tool`
2. `mindmapLayout`
3. `viewport`（由文档与 commit 同步）

## 5. write.subscribe 代替 write.changeBus

`write` 对外只暴露：

```ts
subscribe(listener)
```

内部仍可使用 bus 实现，但不再把 bus 对象本身暴露给 engine 外层。

## 改动范围

1. `packages/whiteboard-engine/src/runtime/write/runtime.ts`
2. `packages/whiteboard-engine/src/runtime/write/stages/commit/writer.ts`
3. `packages/whiteboard-engine/src/runtime/write/stages/commit/history.ts`
4. `packages/whiteboard-engine/src/instance/facade/commands.ts`
5. `packages/whiteboard-engine/src/instance/reactions/Reactions.ts`
6. `packages/whiteboard-engine/src/types/write/runtime.ts`
7. `packages/whiteboard-engine/src/types/write/writer.ts`
8. `packages/whiteboard-engine/src/types/command/public.ts`
9. `packages/whiteboard-react/src/Whiteboard.tsx`
10. `packages/whiteboard-engine/src/perf/*.bench.ts`
11. `ENGINE_CURRENT_CHAIN_FLOW.md`

## 预期结果

1. `Writer` 变成纯 commit 组件。
2. `write` 成为真正的事务服务：`apply / load / replace / history / subscribe`。
3. whole-document 语义显式化。
4. change subscription 边界收窄。

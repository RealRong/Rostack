# whiteboard-core reducer/internal 收敛方案

## 1. 结论

`whiteboard/packages/whiteboard-core/src/reducer/internal` 可以明显减少复杂度，而且应该继续收敛。

当前复杂度的主要来源不是 whiteboard reducer 语义本身，而是内部仍然保留了旧的 `tx + read/write/snapshot/dirty/reconcile` 装配模型。`shared/reducer` 已经成为新的统一 runtime 之后，`whiteboard-core` 不需要在 `internal` 里再维护一套“小型 reducer runtime”。

最终目标不是“在现有结构上继续微调”，而是直接把 `internal` 改成：

- 一个统一的可变 reducer state。
- 少量按领域拆分的纯 mutation helper。
- 一个 finalize / finish 出口。
- 一个更窄的 `WhiteboardReduceCtx`，只暴露 handlers 真正需要的操作。

## 2. 原则

- 不做兼容层。
- 不保留双轨实现。
- 重构过程中允许阶段性无法运行，但最终形态必须一步切到新结构。
- 旧的 `tx`、包装层 API、目录壳文件在切换后直接删除，不保留 alias 或 passthrough。
- 目标是长期最优，不为了降低一次性迁移成本而保留旧抽象。

## 3. 当前复杂度的来源

## 3.1 `tx` 仍然是旧 runtime 入口

当前入口是 [whiteboard/packages/whiteboard-core/src/reducer/internal/tx.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/reducer/internal/tx.ts:1)。

它在做的事情是：

- 创建 `_runtime`
- 组装 `read`
- 组装 `document / node / edge / group / collection / snapshot / dirty / reconcile / mindmap`
- 返回一个宽的 `ReducerTx`

这实际上又搭了一层 reducer runtime，对新的 `shared/reducer` 来说是重复的。

## 3.2 大量目录只是包装层

下面这些目录大多只是把运行时 state 再包装成子 API 树：

- `internal/read/*`
- `internal/snapshot/*`
- `internal/dirty/*`
- `internal/collection/*`
- `internal/reconcile/*`
- `internal/document/*`
- `internal/node/*`
- `internal/edge/*`
- `internal/group/*`
- `internal/mindmap/*`

问题不是这些功能不需要，而是“功能存在”不等于“必须保留一整层 API 树”。

## 3.3 领域逻辑被过度切碎

例如一个很常见的 reducer mutation 模式是：

1. 从 draft 里读当前实体
2. 生成 inverse
3. 写回 draft
4. 更新 `changes`
5. 标记 `dirty`
6. 必要时排 layout / reconcile

`node.field`、`node.record`、`edge.field`、`edge.record`、`mindmap.topic.field`、`group.field` 都在重复这个模式。现在按 `lifecycle / field / record / structure / index` 细拆，导航成本明显高于收益。

## 3.4 `WhiteboardReduceCtx` 仍然暴露旧形状

当前 handlers 使用的是类似：

```ts
ctx.write.node.lifecycle.create(...)
ctx.write.collection.edge.labels(edgeId).structure.insert(...)
ctx.reconcile.flush()
```

这意味着即使把 `internal` 挪平，只要 `ctx` 继续沿用这套 API 形状，复杂度仍然会被保留下来。

## 3.5 history collect 仍然直接依赖 internal 细节

当前 [whiteboard/packages/whiteboard-core/src/spec/history/collect.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/spec/history/collect.ts:1) 直接依赖：

- `ReducerReadApi`
- `DraftDocument`
- `collectConnectedEdges`

这会让 `spec/history` 被 `internal` 的旧 read/runtime 结构反向绑定。

## 4. 最终结构

最终不再保留 `internal/*/index.ts` 这种装配层，也不再保留 `tx.ts` / `types.ts` 这种“内部公共 API”。

建议最终目录收敛为：

```txt
whiteboard/packages/whiteboard-core/src/reducer/
  context.ts
  extra.ts
  history.ts
  handlers/
    document.ts
    node.ts
    edge.ts
    group.ts
    mindmap.ts
  spec.ts
  types.ts
  internal/
    state.ts
    ordered.ts
    document.ts
    canvas.ts
    node.ts
    edge.ts
    group.ts
    mindmap.ts
    finalize.ts
```

说明：

- `state.ts`：统一 reducer 可变 state、draft、changes、dirty、queue、基础读 helper。
- `ordered.ts`：顺序集合的底层复用设施，仅保留一份。
- `document.ts`：`document.replace`、background 相关。
- `canvas.ts`：canvas order 的移动和 slot 读取。
- `node.ts`：node create/restore/set/unset/record/delete。
- `edge.ts`：edge create/restore/set/unset/record/labels/route/delete。
- `group.ts`：group create/restore/set/unset/delete。
- `mindmap.ts`：mindmap structure/topic/branch/layout/flush 全收在一起，不再单独保留 reconcile 子系统。
- `finalize.ts`：materialize、impact、summary、empty extra、finish。

如果 `ordered.ts` 最终只剩很小一组 helper，也可以继续并入 `canvas.ts` 或 `edge.ts`，但上限就保留这一个底层复用文件，不再把包装层继续拆回去。

## 5. 最终内部状态

最终内部核心不是 `ReducerTx`，而是一个统一的 `WhiteboardReduceState`。

建议形态：

```ts
interface WhiteboardReduceState {
  base: Document
  draft: DraftDocument

  inverse: InverseBuilder<Operation>
  footprint: HistoryFootprintCollector<HistoryKey>

  changes: ChangeSet
  invalidation: Invalidation

  shortCircuit?: KernelReduceResult

  queue: {
    mindmapLayout: MindmapId[]
    mindmapLayoutSet: Set<MindmapId>
  }
}
```

`DraftDocument` 继续保留，但职责收敛为“写时复制数据载体”：

```ts
interface DraftDocument {
  base: Document
  background: Document['background']
  canvasOrder: readonly CanvasItemRef[]
  nodes: OverlayTable<NodeId, Node>
  edges: OverlayTable<EdgeId, Edge>
  groups: OverlayTable<GroupId, Group>
  mindmaps: OverlayTable<MindmapId, MindmapRecord>
}
```

关键变化：

- 不再有 `_runtime.mutation`
- 不再有 `_runtime.history`
- 不再有 `_runtime.reconcile.tasks`
- 不再有 `ReducerTx`
- 所有 mutation helper 都直接接受 `state`

也就是：

```ts
setNodeField(state, id, field, value)
insertEdgeLabel(state, edgeId, label, anchor)
patchMindmapLayout(state, id, patch)
flushMindmapLayout(state)
```

而不是：

```ts
tx.node.field.set(...)
tx.collection.edge.labels(...).structure.insert(...)
tx.reconcile.run()
```

## 6. 最终 WhiteboardReduceCtx

`WhiteboardReduceCtx` 不应该再镜像 `internal` 的旧 API 树。

最终目标是让 handlers 拿到一个窄、直接、稳定的 ctx。

建议改成：

```ts
export interface WhiteboardReduceCtx {
  readonly base: Document
  readonly origin: Origin

  readonly document: {
    replace(document: Document): void
    setBackground(background: Document['background']): void
  }

  readonly canvas: {
    move(refs: readonly CanvasItemRef[], to: CanvasOrderMoveTo): void
  }

  readonly node: {
    create(node: Node): void
    restore(node: Node, slot?: CanvasSlot): void
    setField<Field extends NodeField>(id: NodeId, field: Field, value: Node[Field]): void
    unsetField(id: NodeId, field: NodeUnsetField): void
    setRecord(id: NodeId, scope: NodeRecordScope, path: Path, value: unknown): void
    unsetRecord(id: NodeId, scope: NodeRecordScope, path: Path): void
    delete(id: NodeId): void
  }

  readonly edge: {
    create(edge: Edge): void
    restore(edge: Edge, slot?: CanvasSlot): void
    setField<Field extends EdgeField>(id: EdgeId, field: Field, value: Edge[Field]): void
    unsetField(id: EdgeId, field: EdgeUnsetField): void
    setRecord(id: EdgeId, scope: EdgeRecordScope, path: Path, value: unknown): void
    unsetRecord(id: EdgeId, scope: EdgeRecordScope, path: Path): void
    insertLabel(edgeId: EdgeId, label: EdgeLabel, to: OrderedAnchor): void
    deleteLabel(edgeId: EdgeId, labelId: string): void
    moveLabel(edgeId: EdgeId, labelId: string, to: OrderedAnchor): void
    setLabelField(edgeId: EdgeId, labelId: string, field: EdgeLabelField, value: unknown): void
    unsetLabelField(edgeId: EdgeId, labelId: string, field: EdgeLabelField): void
    setLabelRecord(edgeId: EdgeId, labelId: string, scope: EdgeLabelRecordScope, path: Path, value: unknown): void
    unsetLabelRecord(edgeId: EdgeId, labelId: string, scope: EdgeLabelRecordScope, path: Path): void
    insertRoutePoint(edgeId: EdgeId, point: EdgeRoutePoint, to: OrderedAnchor): void
    deleteRoutePoint(edgeId: EdgeId, pointId: string): void
    moveRoutePoint(edgeId: EdgeId, pointId: string, to: OrderedAnchor): void
    setRoutePointField(edgeId: EdgeId, pointId: string, field: EdgeRoutePointField, value: number): void
    delete(id: EdgeId): void
  }

  readonly group: {
    create(group: Group): void
    restore(group: Group): void
    setField<Field extends GroupField>(id: GroupId, field: Field, value: Group[Field]): void
    unsetField(id: GroupId, field: GroupField): void
    delete(id: GroupId): void
  }

  readonly mindmap: {
    create(input: { mindmap: MindmapRecord; nodes: readonly Node[] }): void
    restore(snapshot: MindmapSnapshot): void
    delete(id: MindmapId): void
    moveRoot(id: MindmapId, position: Point): void
    patchLayout(id: MindmapId, patch: MindmapLayoutPatch): void
    insertTopic(input: { id: MindmapId; topic: Node; value: MindmapTopicInsertInput }): void
    restoreTopic(input: { id: MindmapId; snapshot: MindmapTopicSnapshot }): void
    moveTopic(input: { id: MindmapId; value: MindmapTopicMoveInput }): void
    deleteTopic(input: { id: MindmapId; nodeId: NodeId }): void
    setTopicField<Field extends MindmapTopicField>(id: MindmapId, topicId: NodeId, field: Field, value: Node[Field]): void
    unsetTopicField(id: MindmapId, topicId: NodeId, field: MindmapTopicUnsetField): void
    setTopicRecord(id: MindmapId, topicId: NodeId, scope: MindmapTopicRecordScope, path: Path, value: unknown): void
    unsetTopicRecord(id: MindmapId, topicId: NodeId, scope: MindmapTopicRecordScope, path: Path): void
    setBranchField(id: MindmapId, topicId: NodeId, field: MindmapBranchField, value: MindmapRecord['members'][string]['branchStyle'][MindmapBranchField]): void
    unsetBranchField(id: MindmapId, topicId: NodeId, field: MindmapBranchField): void
    setTopicCollapsed(id: MindmapId, topicId: NodeId, collapsed: boolean): void
    flush(): void
  }

  readonly history: {
    add(key: HistoryFootprint[number]): void
    addMany(keys: readonly HistoryFootprint[number][]): void
  }

  issue(code: WhiteboardReduceIssueCode, message: string, details?: unknown): void
  fail(code: Exclude<WhiteboardReduceIssueCode, 'reducer.handler.missing'>, message: string, details?: unknown): never
  stop(): never
}
```

要点：

- 删除 `write`
- 删除 `read`
- 删除 `snapshot`
- 删除 `dirty`
- 删除 `reconcile`
- 删除 `inverse`
- handlers 只能调领域动作，不再手工操作内部 plumbing

这样 `handlers/*.ts` 会明显收敛成单纯的 operation -> domain action 分发。

## 7. handlers 的最终形态

例如 node handler 最终应该是：

```ts
switch (operation.type) {
  case 'node.create':
    ctx.node.create(operation.node)
    return
  case 'node.restore':
    ctx.node.restore(operation.node, operation.slot)
    return
  case 'node.field.set':
    ctx.node.setField(operation.id, operation.field, operation.value as never)
    return
  case 'node.field.unset':
    ctx.node.unsetField(operation.id, operation.field)
    return
  case 'node.record.set':
    ctx.node.setRecord(operation.id, operation.scope, operation.path, operation.value)
    return
  case 'node.record.unset':
    ctx.node.unsetRecord(operation.id, operation.scope, operation.path)
    return
  case 'node.delete':
    ctx.node.delete(operation.id)
    return
}
```

而不是再经过 `ctx.write.node.lifecycle` / `ctx.write.node.field` / `ctx.write.node.record` 三层命名空间。

edge 和 mindmap 同理，尤其是：

```ts
ctx.edge.insertLabel(...)
ctx.edge.moveRoutePoint(...)
ctx.mindmap.insertTopic(...)
ctx.mindmap.setTopicField(...)
ctx.mindmap.flush()
```

要直接表达操作，不再暴露内部目录结构。

## 8. history collect 的收敛

`spec/history/collect.ts` 不应该继续依赖 `internal/types.ts` 里的 `ReducerReadApi` 和 `internal/runtime.ts` 里的 `DraftDocument`。

最终应改成依赖一份极小的 history read adapter：

```ts
export interface WhiteboardHistoryRead {
  node(id: NodeId): Node | undefined
  edge(id: EdgeId): Edge | undefined
  group(id: GroupId): Group | undefined
  mindmap(id: MindmapId): MindmapRecord | undefined
  mindmapTree(id: MindmapId | NodeId): MindmapTree | undefined
  connectedEdges(nodeIds: ReadonlySet<NodeId>): readonly Edge[]
}
```

然后 `reducer/history.ts` 在当前 reducer state 上构造这份 adapter：

```ts
collect.operation({
  read: createHistoryRead(state),
  add: ctx.history.add,
  addMany: ctx.history.addMany
}, op)
```

这样：

- `spec/history` 不再依赖 `internal` 的 tx/read/runtime 形状
- `internal` 可以自由重组，不会再被 history collect 锁死

## 9. 需要保留的底层复用设施

并不是所有“底层 helper”都应该删光。应该保留的只有真正跨领域重复、且语义稳定的那部分。

建议只保留两类复用：

## 9.1 `ordered.ts`

用于：

- canvas order
- edge labels
- edge route points
- mindmap children

职责仅限：

- `insert`
- `delete`
- `move`
- `moveMany`
- `readSlot`

它是“顺序集合算法”复用，不是 runtime 装配层。

## 9.2 record path mutation

`recordPath` 的 set/unset 逻辑继续作为底层 helper 保留是合理的，但它不应该再制造一层 reducer API namespace。

## 10. 直接删除的内容

以下内容在切换到新结构后应直接删除：

- `src/reducer/internal/tx.ts`
- `src/reducer/internal/types.ts`
- `src/reducer/internal/read/*`
- `src/reducer/internal/snapshot/*`
- `src/reducer/internal/dirty/*`
- `src/reducer/internal/collection/*`
- `src/reducer/internal/reconcile/*`
- `src/reducer/internal/document/*`
- `src/reducer/internal/node/*`
- `src/reducer/internal/edge/*`
- `src/reducer/internal/group/*`
- `src/reducer/internal/mindmap/*`

如果 `copy.ts` 的内容最终只被少数模块使用，则一并并回对应领域模块；不单独为了“共享”保留一个过宽的 clone 工具箱。

## 11. 具体实施顺序

## 阶段 1：建立新 state 与 finalize

- 新建 `internal/state.ts`
- 把 `DraftDocument`、`createChangeSet`、`createInvalidation`、materialize helper、基础 `getNode/getEdge/getMindmap/...` 收进去
- 新建 `internal/finalize.ts`
- 把 `commit.ts` 的 result / impact / summary / emptyExtra 逻辑迁入

完成后，`tx.commit.result()` 这种调用路径要消失。

## 阶段 2：重写 context

- `reducer/context.ts` 不再调用 `createReducerTx`
- 直接创建 `WhiteboardReduceState`
- 直接把领域 mutation helper 绑定到新的 `WhiteboardReduceCtx`
- `readWhiteboardReduceInternal(ctx)` 只返回内部 `state`

完成后，`ReducerTx` 和 `createReducerTx` 要整体删除。

## 阶段 3：收缩 ctx 与 handlers

- `reducer/types.ts` 改成新的窄 ctx 设计
- `handlers/document.ts`
- `handlers/node.ts`
- `handlers/edge.ts`
- `handlers/group.ts`
- `handlers/mindmap.ts`

全部改成直接调用 `ctx.document / ctx.canvas / ctx.node / ctx.edge / ctx.group / ctx.mindmap`

完成后，`ctx.write.*`、`ctx.reconcile.*`、`ctx.snapshot.*`、`ctx.dirty.*` 应彻底消失。

## 阶段 4：领域 helper 合并

- `internal/document/*` 合并为 `internal/document.ts`
- `internal/node/*` 合并为 `internal/node.ts`
- `internal/edge/*` 合并为 `internal/edge.ts`
- `internal/group/*` 合并为 `internal/group.ts`
- `internal/mindmap/*` 合并为 `internal/mindmap.ts`
- `reconcile` 并入 `mindmap.ts`
- `collection` 的顺序操作并入 `ordered.ts + 对应领域模块`

完成后，旧目录整体删除。

## 阶段 5：history collect 解耦

- `spec/history/collect.ts` 改为依赖自己的 `WhiteboardHistoryRead`
- `reducer/history.ts` 在当前 state 上构造 history read adapter

完成后，`spec/history` 不再 import `internal/types.ts` / `internal/runtime.ts`。

## 阶段 6：清理导出面

- `reducer/index.ts` 停止导出与旧 tx 形状绑定的类型
- `reducer/types.ts` 只保留新的 `WhiteboardReduceCtx`、`WhiteboardReduceExtra`、`WhiteboardReduceResult`
- 删除所有仅用于旧内部结构的类型别名

## 12. 完成标准

完成后应满足以下条件：

- `reducer/internal` 不再存在 `tx.ts`
- `reducer/internal` 不再存在 `read / snapshot / dirty / reconcile / collection` 目录
- `reducer/internal` 文件数量显著下降
- handlers 不再出现 `ctx.write.*`
- handlers 不再出现 `ctx.reconcile.*`
- `spec/history/collect.ts` 不再 import `reducer/internal/types` 或 `reducer/internal/runtime`
- `WhiteboardReduceCtx` 不再镜像旧 tx API
- `finishWhiteboardReduce` 直接基于内部 `state` 产出结果

## 13. 预期收益

- 目录层级明显减少，导航成本下降
- handler 语义更直接，operation 到 mutation 的映射更清晰
- reducer internal 不再像一个“内部公共 SDK”
- history collect 和 reducer runtime 的耦合降低
- 后续新增 operation 时，只需要改领域模块，不需要再为旧 API 树补装配层
- `whiteboard-core` 的 reducer 会更符合现在 `shared/reducer` 的长期设计，而不是继续背着旧 runtime 结构

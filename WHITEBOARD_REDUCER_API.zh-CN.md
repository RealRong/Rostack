# Whiteboard Reducer API

本文只定义 reducer runtime 的最终 API 与分阶段实施方案。

本文不重复设计思路。设计依据见：

- [`WHITEBOARD_REDUCER_RUNTIME_FINAL_ARCHITECTURE.zh-CN.md`](/Users/realrong/Rostack/WHITEBOARD_REDUCER_RUNTIME_FINAL_ARCHITECTURE.zh-CN.md)
- [`WHITEBOARD_SHARED_OP_TYPES.zh-CN.md`](/Users/realrong/Rostack/WHITEBOARD_SHARED_OP_TYPES.zh-CN.md)

---

## 1. 最终模块

长期最优下，`whiteboard/packages/whiteboard-core/src/kernel/reduce/` 应收敛为以下模块：

- `index.ts`
- `types.ts`
- `tx.ts`
- `runtime.ts`
- `dispatch.ts`
- `commit.ts`
- `read/index.ts`
- `read/document.ts`
- `read/canvas.ts`
- `read/node.ts`
- `read/edge.ts`
- `read/group.ts`
- `read/mindmap.ts`
- `read/record.ts`
- `document/index.ts`
- `document/lifecycle.ts`
- `document/background.ts`
- `node/index.ts`
- `node/lifecycle.ts`
- `node/field.ts`
- `node/record.ts`
- `edge/index.ts`
- `edge/lifecycle.ts`
- `edge/field.ts`
- `edge/record.ts`
- `group/index.ts`
- `group/lifecycle.ts`
- `group/field.ts`
- `mindmap/index.ts`
- `mindmap/structure.ts`
- `mindmap/root.ts`
- `mindmap/layout.ts`
- `mindmap/topic/index.ts`
- `mindmap/topic/structure.ts`
- `mindmap/topic/field.ts`
- `mindmap/topic/record.ts`
- `mindmap/topic/collapse.ts`
- `mindmap/branch/index.ts`
- `mindmap/branch/field.ts`
- `collection/index.ts`
- `collection/canvasOrder.ts`
- `collection/edgeLabels.ts`
- `collection/edgeRoutePoints.ts`
- `collection/mindmapChildren.ts`
- `snapshot/index.ts`
- `snapshot/node.ts`
- `snapshot/edge.ts`
- `snapshot/group.ts`
- `snapshot/mindmap.ts`
- `snapshot/canvas.ts`
- `dirty/index.ts`
- `dirty/document.ts`
- `dirty/canvas.ts`
- `dirty/node.ts`
- `dirty/edge.ts`
- `dirty/mindmap.ts`
- `dirty/projection.ts`
- `reconcile/index.ts`
- `reconcile/mindmap.ts`
- `handlers/document.ts`
- `handlers/node.ts`
- `handlers/edge.ts`
- `handlers/group.ts`
- `handlers/mindmap.ts`

要求：

- `index.ts` 只导出 `reduceOperations`
- `dispatch.ts` 只做 op family 分发
- `handlers/*` 只调用 tx namespace API
- `tx.ts` 是唯一 reducer 写入口

---

## 2. 顶层入口

## 2.1 `reduceOperations`

```ts
export const reduceOperations: (
  document: Document,
  operations: readonly Operation[],
  ctx?: KernelContext
) => KernelReduceResult
```

执行顺序固定为：

1. `validateLockOperations`
2. `createReducerTx`
3. `dispatchOperation`
4. `tx.reconcile.run()`
5. `tx.commit.result()`

---

## 3. 命名空间总览

最终 `ReducerTx` 只暴露以下命名空间：

- `tx.read`
- `tx.document`
- `tx.node`
- `tx.edge`
- `tx.group`
- `tx.mindmap`
- `tx.collection`
- `tx.snapshot`
- `tx.dirty`
- `tx.reconcile`
- `tx.commit`

任何 reducer handler 都不得直接访问：

- overlay table
- inverse buffer
- changes
- invalidation
- reconcile queue

---

## 4. `tx.read`

只读接口。

```ts
type ReducerReadApi = {
  document: {
    get(): Document
    background(): Document['background']
  }

  canvas: {
    order(): readonly CanvasItemRef[]
  }

  node: {
    get(id: NodeId): Node | undefined
    require(id: NodeId): Node
    isTopLevel(id: NodeId): boolean
    record(id: NodeId, scope: NodeRecordScope): unknown
  }

  edge: {
    get(id: EdgeId): Edge | undefined
    require(id: EdgeId): Edge
    record(id: EdgeId, scope: EdgeRecordScope): unknown
  }

  group: {
    get(id: GroupId): Group | undefined
    require(id: GroupId): Group
  }

  mindmap: {
    get(id: MindmapId): MindmapRecord | undefined
    require(id: MindmapId): MindmapRecord
    tree(id: MindmapId | NodeId): MindmapTree | undefined
    topicRecord(
      id: MindmapId,
      topicId: NodeId,
      scope: MindmapTopicRecordScope
    ): unknown
  }

  record: {
    path(root: unknown, path: string): unknown
  }
}
```

约束：

- `tx.read` 绝不产生副作用
- `require(...)` 统一抛 reducer internal error，不在 handler 内部拼接重复错误文本
- handler 读取必须显式写成 `tx.read.node.get(...)`、`tx.read.edge.require(...)`、`tx.read.mindmap.tree(...)` 这类命名空间调用

---

## 5. `tx.document`

文档写入命名空间。

```ts
type ReducerDocumentApi = {
  lifecycle: {
    replace(document: Document): void
  }

  background: {
    set(background: Document['background']): void
  }
}
```

自动负责：

- inverse
- `changes.document`
- `changes.background`
- document / background dirty

---

## 6. `tx.node`

节点实体命名空间。

```ts
type ReducerNodeApi = {
  lifecycle: {
    create(node: Node): void
    restore(node: Node, slot?: CanvasSlot): void
    delete(id: NodeId): void
  }

  field: {
    set<Field extends NodeField>(
      id: NodeId,
      field: Field,
      value: Node[Field]
    ): void

    unset(
      id: NodeId,
      field: NodeUnsetField
    ): void
  }

  record: {
    set(
      id: NodeId,
      scope: NodeRecordScope,
      path: string,
      value: unknown
    ): void

    unset(
      id: NodeId,
      scope: NodeRecordScope,
      path: string
    ): void
  }
}
```

自动负责：

- old value / old path value 读取
- inverse 生成
- `changes.nodes.*`
- node 相关 dirty
- top-level canvas slot

---

## 7. `tx.edge`

边实体命名空间。

```ts
type ReducerEdgeApi = {
  lifecycle: {
    create(edge: Edge): void
    restore(edge: Edge, slot?: CanvasSlot): void
    delete(id: EdgeId): void
  }

  field: {
    set<Field extends EdgeField>(
      id: EdgeId,
      field: Field,
      value: Edge[Field]
    ): void

    unset(
      id: EdgeId,
      field: EdgeUnsetField
    ): void
  }

  record: {
    set(
      id: EdgeId,
      scope: EdgeRecordScope,
      path: string,
      value: unknown
    ): void

    unset(
      id: EdgeId,
      scope: EdgeRecordScope,
      path: string
    ): void
  }
}
```

自动负责：

- inverse
- `changes.edges.*`
- edge geometry / value dirty
- canvas slot

---

## 8. `tx.group`

分组实体命名空间。

```ts
type ReducerGroupApi = {
  lifecycle: {
    create(group: Group): void
    restore(group: Group): void
    delete(id: GroupId): void
  }

  field: {
    set<Field extends GroupField>(
      id: GroupId,
      field: Field,
      value: Group[Field]
    ): void

    unset(
      id: GroupId,
      field: GroupField
    ): void
  }
}
```

自动负责：

- inverse
- `changes.groups.*`
- group dirty

---

## 9. `tx.mindmap`

mindmap 域命名空间。

```ts
type ReducerMindmapApi = {
  structure: {
    create(input: {
      mindmap: MindmapRecord
      nodes: readonly Node[]
    }): void

    restore(snapshot: {
      mindmap: MindmapRecord
      nodes: readonly Node[]
      slot?: CanvasSlot
    }): void

    delete(id: MindmapId): void
  }

  root: {
    move(
      id: MindmapId,
      position: Point
    ): void
  }

  layout: {
    patch(
      id: MindmapId,
      patch: Partial<MindmapLayoutSpec>
    ): void
  }

  topic: {
    structure: {
      insert(input: {
        id: MindmapId
        topic: Node
        value: MindmapTopicInsertInput
      }): void

      restore(input: {
        id: MindmapId
        snapshot: MindmapTopicRestoreSnapshot
      }): void

      move(input: {
        id: MindmapId
        value: MindmapTopicMoveInput
      }): void

      delete(input: {
        id: MindmapId
        nodeId: NodeId
      }): void
    }

    field: {
      set<Field extends MindmapTopicField>(
        id: MindmapId,
        topicId: NodeId,
        field: Field,
        value: Node[Field]
      ): void

      unset(
        id: MindmapId,
        topicId: NodeId,
        field: MindmapTopicUnsetField
      ): void
    }

    record: {
      set(
        id: MindmapId,
        topicId: NodeId,
        scope: MindmapTopicRecordScope,
        path: string,
        value: unknown
      ): void

      unset(
        id: MindmapId,
        topicId: NodeId,
        scope: MindmapTopicRecordScope,
        path: string
      ): void
    }

    collapse: {
      set(
        id: MindmapId,
        topicId: NodeId,
        collapsed?: boolean
      ): void
    }
  }

  branch: {
    field: {
      set<Field extends MindmapBranchField>(
        id: MindmapId,
        topicId: NodeId,
        field: Field,
        value: MindmapBranchStyle[Field]
      ): void

      unset(
        id: MindmapId,
        topicId: NodeId,
        field: MindmapBranchField
      ): void
    }
  }
}
```

自动负责：

- subtree snapshot
- member / children / owner / root bookkeeping
- inverse
- `changes.mindmaps.*`
- node / edge / mindmap dirty
- `mindmap.layout(id)` dirty

命名规则：

- 结构写入走 `tx.mindmap.structure.*`
- 根节点写入走 `tx.mindmap.root.*`
- 布局写入走 `tx.mindmap.layout.*`
- topic 结构写入走 `tx.mindmap.topic.structure.*`
- topic field 写入走 `tx.mindmap.topic.field.*`
- topic record 写入走 `tx.mindmap.topic.record.*`
- topic collapse 写入走 `tx.mindmap.topic.collapse.*`
- branch 写入走 `tx.mindmap.branch.field.*`

---

## 10. `tx.collection`

统一 ordered collection 命名空间。

## 10.1 Scope

```ts
type ReducerCollectionApi = {
  canvas: {
    order(): CanvasOrderCollectionApi
  }

  edge: {
    labels(edgeId: EdgeId): EdgeLabelCollectionApi
    routePoints(edgeId: EdgeId): EdgeRoutePointCollectionApi
  }

  mindmap: {
    children(
      mindmapId: MindmapId,
      parentId: NodeId
    ): MindmapChildCollectionApi
  }
}
```

## 10.2 Shared Sub-API

```ts
type OrderedReadApi<TItem> = {
  list(): readonly TItem[]
  has(itemId: string): boolean
  get(itemId: string): TItem | undefined
}

type OrderedStructureApi<TItem> = {
  insert(item: TItem, anchor: OrderedAnchor): void
  delete(itemId: string): void
  move(itemId: string, anchor: OrderedAnchor): void
}
```

## 10.3 Controller

```ts
type CanvasOrderCollectionApi = {
  read: OrderedReadApi<CanvasItemRef>
  structure: OrderedStructureApi<CanvasItemRef>
}

type EdgeLabelCollectionApi = {
  read: OrderedReadApi<EdgeLabel>
  structure: OrderedStructureApi<EdgeLabel>

  field: {
    set(
      labelId: string,
      field: EdgeLabelField,
      value: unknown
    ): void

    unset(
      labelId: string,
      field: EdgeLabelField
    ): void
  }

  record: {
    set(
      labelId: string,
      scope: EdgeLabelRecordScope,
      path: string,
      value: unknown
    ): void

    unset(
      labelId: string,
      scope: EdgeLabelRecordScope,
      path: string
    ): void
  }
}

type EdgeRoutePointCollectionApi = {
  read: OrderedReadApi<EdgeRoutePoint>
  structure: OrderedStructureApi<EdgeRoutePoint>

  field: {
    set(
      pointId: string,
      field: EdgeRoutePointField,
      value: number
    ): void
  }
}

type MindmapChildCollectionApi = {
  read: OrderedReadApi<NodeId>
  structure: OrderedStructureApi<NodeId>
}
```

## 10.4 Anchor

```ts
type OrderedAnchor =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'before'; itemId: string }
  | { kind: 'after'; itemId: string }
```

自动负责：

- stable id 查找
- inverse anchor
- collection change dirty
- adapter-level normalization

adapter 负责的差异：

- `canvas.order` item id 解析
- `edge.route.points` 空数组时回到 `route.kind = 'auto'`
- `mindmap.children[parentId]` item 是 `NodeId`

---

## 11. `tx.snapshot`

统一 snapshot 命名空间，禁止 handler 自己拼 snapshot。

```ts
type ReducerSnapshotApi = {
  node: {
    capture(id: NodeId): NodeSnapshot
  }

  edge: {
    capture(id: EdgeId): EdgeSnapshot
  }

  group: {
    capture(id: GroupId): GroupSnapshot
  }

  mindmap: {
    capture(id: MindmapId): MindmapSnapshot
    topic(
      id: MindmapId,
      rootId: NodeId
    ): MindmapTopicRestoreSnapshot
  }

  canvas: {
    slot(ref: CanvasItemRef): CanvasSlot | undefined
  }
}
```

用途：

- delete / restore primitive
- inverse auto-build

---

## 12. `tx.dirty`

统一 dirty 命名空间。

```ts
type ReducerDirtyApi = {
  document: {
    value(): void
    background(): void
  }

  canvas: {
    order(): void
  }

  node: {
    geometry(id: NodeId): void
    value(id: NodeId): void
  }

  edge: {
    geometry(id: EdgeId): void
    value(id: EdgeId): void
  }

  mindmap: {
    layout(id: MindmapId): void
    value(id: MindmapId): void
  }

  projection: {
    node(): void
    edge(): void
    mindmap(): void
  }
}
```

规则：

- primitive 自动调用
- handler 不直接碰内部 dirty set

---

## 13. `tx.reconcile`

统一 reconcile 命名空间。

```ts
type ReducerReconcileApi = {
  mindmap: {
    layout(id: MindmapId): void
  }

  run(): Result<void, ResultCode>
}
```

规则：

- `run()` 必须执行到队列为空
- 必须保留 cycle guard
- reconciler 内部也必须通过 tx namespace 写回

---

## 14. `tx.commit`

提交命名空间。

```ts
type ReducerCommitApi = {
  result(): KernelReduceResult
}
```

自动负责：

- materialize overlay document
- derive invalidation
- derive impact
- 返回 inverse

---

## 15. `dispatch`

`dispatch.ts` 只定义 family 分发：

```ts
export const dispatchOperation: (
  tx: ReducerTx,
  operation: Operation
) => void
```

要求：

- 不写任何业务逻辑
- 不生成 inverse
- 不直接修改 draft

---

## 16. `handlers/document`

只允许调用：

- `tx.read.document.*`
- `tx.read.canvas.*`
- `tx.document.lifecycle.*`
- `tx.document.background.*`
- `tx.collection.canvas.order().*`
- `tx.commit.*`

不得直接访问：

- `tx.node`
- `tx.edge`
- `tx.group`
- `tx.mindmap`
- `tx.snapshot`

---

## 17. `handlers/node`

只允许调用：

- `tx.read.node.*`
- `tx.node.lifecycle.*`
- `tx.node.field.*`
- `tx.node.record.*`
- `tx.snapshot.node.*`
- `tx.snapshot.canvas.*`

不得直接访问：

- internal draft table
- inverse buffer
- changes buffer

---

## 18. `handlers/edge`

只允许调用：

- `tx.read.edge.*`
- `tx.edge.lifecycle.*`
- `tx.edge.field.*`
- `tx.edge.record.*`
- `tx.collection.edge.labels(...).*`
- `tx.collection.edge.routePoints(...).*`
- `tx.snapshot.edge.*`
- `tx.snapshot.canvas.*`

---

## 19. `handlers/group`

只允许调用：

- `tx.read.group.*`
- `tx.group.lifecycle.*`
- `tx.group.field.*`
- `tx.snapshot.group.*`

---

## 20. `handlers/mindmap`

只允许调用：

- `tx.read.mindmap.*`
- `tx.read.node.*`
- `tx.mindmap.structure.*`
- `tx.mindmap.root.*`
- `tx.mindmap.layout.*`
- `tx.mindmap.topic.structure.*`
- `tx.mindmap.topic.field.*`
- `tx.mindmap.topic.record.*`
- `tx.mindmap.topic.collapse.*`
- `tx.mindmap.branch.field.*`
- `tx.snapshot.mindmap.*`

不得直接：

- 操作 `members`
- 操作 `children`
- 操作 `owner`
- queue internal reconcile set
- 调用 `tx.node.*`
- 调用 `tx.edge.*`
- 调用 `tx.collection.*`

这些都必须封装在 `tx.mindmap.*` 内部。

---

## 21. 自动行为 Contract

所有 primitive 都必须自动完成以下 contract。

## 21.1 inverse

- `document.lifecycle.replace` 自动 inverse
- `document.background.set` 自动 inverse
- `node.field.set/unset` 自动 inverse
- `node.record.set/unset` 自动 inverse
- `edge.field.set/unset` 自动 inverse
- `edge.record.set/unset` 自动 inverse
- `group.field.set/unset` 自动 inverse
- `mindmap.*` 自动 inverse
- `collection.*.structure.insert/delete/move` 自动 inverse
- `collection.*.field.*` 自动 inverse
- `collection.*.record.*` 自动 inverse
- delete / restore 自动 snapshot inverse

## 21.2 change

- `create` -> `add`
- `delete` -> `delete`
- 其他写入 -> `update`

## 21.3 dirty

primitive 写入后自动产 dirty。

## 21.4 slot / anchor

- top-level node / edge 自动维护 canvas slot
- ordered collection 自动维护 old anchor

---

## 22. 分阶段实施方案

## P1. 建立 `ReducerTx` 外壳

目标：

- 引入 `tx.ts`
- 所有 handler 不再直接读写 runtime 内部字段

交付：

- `ReducerTx` 类型
- `createReducerTx`
- `tx.read`
- `tx.document`
- `tx.commit`
- `dispatch.ts`

验收：

- `reduce.ts` 只剩入口组合

## P2. 收敛命名空间骨架

目标：

- 先把二级命名空间骨架固定下来

交付：

- `read.document/canvas/node/edge/group/mindmap/record`
- `document.lifecycle/background`
- `snapshot.node/edge/group/mindmap/canvas`
- `dirty.document/canvas/node/edge/mindmap/projection`
- `reconcile.mindmap/run`
- `mindmap.structure/root/layout/topic/branch`

验收：

- 新增 API 不再出现平铺式 `tx.xxx.*` 大包

## P3. 下沉 entity primitive

目标：

- `node/edge/group/mindmap` 写入全部改走 namespaced primitive

交付：

- `tx.node.lifecycle/field/record`
- `tx.edge.lifecycle/field/record`
- `tx.group.lifecycle/field`
- `tx.mindmap.structure/root/layout/topic/branch`

验收：

- handler 不再手写 field/record inverse
- handler 不再直接写 overlay

## P4. 引入统一 `tx.collection`

目标：

- 把 canvas / edge label / edge route / mindmap children 收敛到统一 collection 命名空间

交付：

- `tx.collection.canvas.order`
- `tx.collection.edge.labels`
- `tx.collection.edge.routePoints`
- `tx.collection.mindmap.children`
- 对应 `read/structure/field/record` controller

验收：

- handler 不再手写 `findIndex` / `splice` / inverse anchor

## P5. 引入 `tx.snapshot`

目标：

- delete / restore 不再由 handler 自己拼 snapshot

交付：

- `snapshot.ts`
- node / edge / group / mindmap / topic snapshot builder

验收：

- handler 不再直接调用 clone helper 拼 restore payload

## P6. 引入统一 `tx.dirty`

目标：

- dirty 不再通过 `markChange + queueMindmapLayout` 混合表达

交付：

- `dirty.ts`
- primitive 自动产 dirty

验收：

- handler 不再直接调用 dirty set / queue

## P7. 引入 `tx.reconcile`

目标：

- derived update 改成 dependency-driven reconcile

交付：

- `reconcile.ts`
- `reconcile.mindmap.layout`
- cycle guard

验收：

- handler 不再显式记忆“某个写入要 queue 某个任务”

## P8. 清理遗留 helper

目标：

- 删除直接操作 overlay / inverse / changes 的旧 helper

交付：

- 删除旧 runtime helper
- 删除旧重复 inverse helper
- 删除旧重复 collection helper

验收：

- reducer 写入路径只剩 tx namespace API

---

## 23. 最终验收标准

完成后必须满足：

1. `reduce.ts` 只保留入口与组合
2. handler 不直接写 draft / inverse / changes / dirty
3. 所有 inverse 由 primitive 自动生成
4. 所有 ordered collection 都走统一 `tx.collection`
5. delete / restore 都走 `tx.snapshot`
6. reconcile 只消费 dirty target
7. 所有现有 typecheck / test 通过

---

## 24. 命名规则

统一命名规则：

- 读取：`read.document.*` `read.canvas.*` `read.node.*` `read.edge.*` `read.group.*` `read.mindmap.*` `read.record.*`
- 文档写入：`document.lifecycle.*` `document.background.*`
- 节点写入：`node.lifecycle.*` `node.field.*` `node.record.*`
- 边写入：`edge.lifecycle.*` `edge.field.*` `edge.record.*`
- 分组写入：`group.lifecycle.*` `group.field.*`
- mindmap 写入：`mindmap.structure.*` `mindmap.root.*` `mindmap.layout.*` `mindmap.topic.structure.*` `mindmap.topic.field.*` `mindmap.topic.record.*` `mindmap.topic.collapse.*` `mindmap.branch.field.*`
- 有序集合：`collection.canvas.order.*` `collection.edge.labels.*` `collection.edge.routePoints.*` `collection.mindmap.children.*`
- 快照：`snapshot.node.*` `snapshot.edge.*` `snapshot.group.*` `snapshot.mindmap.*` `snapshot.canvas.*`
- 标脏：`dirty.document.*` `dirty.canvas.*` `dirty.node.*` `dirty.edge.*` `dirty.mindmap.*` `dirty.projection.*`
- 派生执行：`reconcile.mindmap.*` `reconcile.run()`
- 提交结果：`commit.result()`

禁止再出现：

- `runtime.changes.*`
- `runtime.inverse.push(...)`
- `runtime.draft.xxx.set(...)`
- `queueMindmapLayout(...)`

这些都必须隐藏到 tx 内部。

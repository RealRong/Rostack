# Whiteboard Reducer Runtime Final Architecture

本文定义 whiteboard 长期最优的 reducer runtime 架构。

目标不是“把 reducer 文件拆小”，而是从底层执行模型上降低复杂度，让 reducer 退化成真正的组合器，而不是继续充当：

- semantic op apply 层
- inverse compiler 层
- structural bookkeeping 层
- reconcile scheduler 层

本文只讨论 operation apply 阶段，不讨论 command / planner / collab surface。本设计默认以下文档已经成立：

- [`WHITEBOARD_SHARED_OP_TYPES.zh-CN.md`](/Users/realrong/Rostack/WHITEBOARD_SHARED_OP_TYPES.zh-CN.md)
- [`WHITEBOARD_SHARED_OP_PATH_MUTATION.zh-CN.md`](/Users/realrong/Rostack/WHITEBOARD_SHARED_OP_PATH_MUTATION.zh-CN.md)
- [`WHITEBOARD_YJS_CRDT_OPERATION_DESIGN.md`](/Users/realrong/Rostack/WHITEBOARD_YJS_CRDT_OPERATION_DESIGN.md)

如果冲突：

1. shared op 文档决定 operation 语义
2. 本文决定 reducer runtime 的长期最优实现模型
3. 具体代码实现必须服从两者

---

## 0. 结论

长期最优下，reducer 不应该继续直接操作：

- `draft`
- `inverse[]`
- `changes`
- `invalidation`
- `reconcileQueue`

也不应该在每个 `switch case` 里手写：

- 旧值读取
- inverse 构造
- collection anchor 计算
- snapshot 采集
- dirty 标记
- derived layout 调度

长期最优结构应该收敛为四层：

### 0.1 Op Handler

只负责：

- 校验语义前提
- 把一个 semantic op 映射到一组 reducer primitive

它不直接写 draft，不直接 push inverse。

### 0.2 Reducer Transaction Runtime

统一负责：

- overlay draft 读写
- inverse 自动收集
- change / invalidation 自动收集
- dirty dependency 自动收集
- snapshot / structural slot / collection anchor 自动收集

### 0.3 Primitive Layer

长期正式 primitive 只保留少数几类：

- entity existence primitive
- entity field primitive
- entity record primitive
- ordered collection primitive
- graph / ownership primitive
- derived dirty primitive

### 0.4 Reconcile Layer

只消费 dirty graph，不再依赖业务 handler 显式记得：

- “这个 op 要 queue layout”
- “这个字段更新后要刷新哪些节点”

---

## 1. 当前 reducer 为什么复杂

当前 reducer 最复杂的点，不是 `switch` 很长，而是每个 case 同时承担多种职责。

一个典型 case 往往同时做：

1. 读当前状态
2. 校验 op 是否可应用
3. 读取旧值
4. 生成 inverse
5. 修改 draft
6. 标记 change
7. 标记 invalidation / projection
8. 标记 derived dirty
9. 在 delete / restore 场景里维护 slot / snapshot
10. 在 collection 场景里维护 anchor / index / move inverse

这意味着 reducer case 本质上不是 “apply op”，而是一个手写事务脚本。

这类复杂度主要集中在三种结构上：

### 1.1 Ordered Collection

例如：

- `canvas.order`
- `edge.labels`
- `edge.route.points`
- `mindmap.children[parentId]`

它们都需要：

- stable id 定位
- before / after / start / end anchor
- insert / delete / move inverse
- restore 时恢复 slot

### 1.2 Snapshot Delete / Restore

例如：

- `node.delete / restore`
- `edge.delete / restore`
- `mindmap.delete / restore`
- `mindmap.topic.delete / restore`

这些 op 不是简单布尔删除，而是需要保留：

- 实体快照
- collection slot
- 子树结构
- 关联 edge 快照

### 1.3 Derived Reconcile

例如：

- `mindmap.layout`
- `mindmap.root.move`
- `mindmap.topic.*`
- `mindmap.branch.*`

这些 op 不只是改主状态，还会让一批派生节点几何失效。

当前复杂度很大一部分来自：handler 必须记得何时 `queue layout`。

---

## 2. 哪些复杂度是不可消掉的

这部分是真实复杂度，不会因为换一种代码风格就消失：

- shared op 本身有语义差异
- ordered collection 本身需要结构语义
- delete / restore 本身需要 snapshot
- inverse 本身依赖旧值
- derived layout 本身是跨实体联动

所以长期最优目标不是“让 reducer 看起来像一个简单的 CRUD map update”，而是：

- 让这些真实复杂度集中到少数底层 primitive
- 不要在每个 op handler 里重复手写

换句话说：

- 真实复杂度必须存在
- 但它不应该散落在所有 handler 中

---

## 3. 哪些复杂度是模型不够强导致的

当前 reducer 里仍然有很多复杂度，其实不是业务本身需要，而是底层 runtime 没把责任接住。

### 3.1 Handler 还在自己生成 inverse

现在大量 case 都在写：

- 如果 previous 是 `undefined`，inverse 是 `unset`
- 否则 inverse 是 `set(previous)`

这类逻辑不应该属于 handler。

长期最优下：

- inverse 必须由 primitive 自动生成

handler 只表达：

- 我要 set field
- 我要 unset path
- 我要 move item
- 我要 delete subtree

而不是表达：

- 反向 op 应该长什么样

### 3.2 Handler 还在自己维护 change / dirty

现在很多 case 写完 draft 以后还要：

- `markChange(...)`
- `changes.canvasOrder = true`
- `queueMindmapLayout(...)`

这说明 runtime 还不是一个真正的事务执行器。

长期最优下：

- 写什么 primitive
- 由 primitive 自动知道会影响哪些 bucket

handler 不再显式碰 `changes` / `dirty`。

### 3.3 Collection 逻辑重复

现在四套 collection 语义分别手写：

- canvas
- edge label
- edge route point
- mindmap child order

这会导致同一类逻辑在不同文件反复出现：

- `findIndex`
- anchor fallback
- move inverse
- slot 恢复
- delete 后 route/auto 切换

长期最优下必须收敛成统一 collection primitive。

### 3.4 Derived scheduling 还是“记得调”

当前模型里，mindmap 相关 op 都必须记得：

- “这个操作后面要 queue layout”

这是一种脆弱耦合。

长期最优下应该是：

- primitive 写入某些 domain slot
- runtime 自动把对应 derived target 标脏
- reconcile 统一消费 dirty graph

---

## 4. 长期最优 reducer 分层

长期最优下，reducer runtime 建议固定为下列分层。

## 4.1 Reducer 入口层

入口层只负责：

1. lock validation
2. 创建 reducer transaction
3. 顺序 dispatch operation
4. drain reconcile
5. finalize result

入口层不包含任何 domain case 细节。

它应该接近：

```ts
reduceOperations(document, operations, ctx) => {
  validateLock(...)
  const tx = createReducerTx(document, ctx)

  for (const op of operations) {
    dispatchOperation(tx, op)
  }

  tx.reconcile()
  return tx.commit()
}
```

这层的职责是 orchestration，不是业务实现。

## 4.2 Op Handler 层

Handler 层按 family 拆分，例如：

- `document`
- `node`
- `edge`
- `group`
- `mindmap`

每个 handler 只负责：

- 读必要上下文
- 做语义校验
- 调用 tx primitive

例如一个理想的 handler 不应该写：

- `inverse.unshift(...)`
- `markChange(...)`
- `draft.nodes.set(...)`
- `queueMindmapLayout(...)`

而应该写成：

```ts
tx.node.setField(id, 'position', nextPosition)
tx.node.setRecord(id, 'data', 'text', nextText)
tx.edgeLabel.move(edgeId, labelId, anchor)
tx.mindmap.markStructureDirty(id)
```

handler 保留语义，但不再保留事务细节。

## 4.3 Reducer Transaction 层

这是长期最关键的一层。

它必须成为唯一允许修改 reducer 内部状态的入口。

事务对象内部持有：

- overlay draft
- inverse buffer
- change buffer
- dirty buffer
- snapshot cache
- reconcile queue

对外只暴露极少数 typed primitive。

## 4.4 Primitive 层

primitive 必须比 operation 少得多，而且稳定。

推荐长期收敛到以下 primitive family。

### A. Existence Primitive

- `createEntity`
- `deleteEntity`
- `restoreEntity`

这层自动处理：

- snapshot
- canvas slot
- add/update/delete change
- inverse

### B. Field Primitive

- `setField`
- `unsetField`

这层自动处理：

- old value 读取
- inverse
- update change
- dirty dependency

### C. Record Primitive

- `setRecord`
- `unsetRecord`

这层自动处理：

- old path value 读取
- ancestor auto-create 语义
- inverse
- update change
- dirty dependency

### D. Ordered Collection Primitive

- `insert`
- `delete`
- `move`
- `setItemField`
- `setItemRecord`

这层统一服务于：

- canvas order
- edge labels
- edge route points
- mindmap child order

collection primitive 必须自动处理：

- stable-id 查找
- anchor 解析
- inverse anchor
- remove empty / route auto/manual 之类 collection-specific normalization

### E. Graph / Ownership Primitive

这层专门处理跨表结构关系，不应该继续散落在 handler 里。

例如：

- `attachNodeToMindmap`
- `detachMindmapSubtree`
- `moveMindmapSubtree`
- `replaceMindmapParent`

它负责：

- members
- children
- owner / root / side
- subtree snapshot

### F. Derived Dirty Primitive

例如：

- `markNodeGeometryDirty`
- `markEdgeGeometryDirty`
- `markMindmapLayoutDirty`
- `markProjectionDirty`

这层负责把“哪些派生值失效”变成 runtime 的统一语言。

---

## 5. 长期最优 Transaction API

下面是建议的最终形态。不是精确代码，而是职责边界。

```ts
type ReducerTx = {
  read: {
    node(id): Node | undefined
    edge(id): Edge | undefined
    group(id): Group | undefined
    mindmap(id): MindmapRecord | undefined
    collection(scope): OrderedCollectionView
  }

  node: {
    create(node, options?)
    restore(node, slot?)
    delete(id)
    setField(id, field, value)
    unsetField(id, field)
    setRecord(id, scope, path, value)
    unsetRecord(id, scope, path)
  }

  edge: {
    create(edge, options?)
    restore(edge, slot?)
    delete(id)
    setField(id, field, value)
    unsetField(id, field)
    setRecord(id, scope, path, value)
    unsetRecord(id, scope, path)
  }

  collection: {
    canvasOrder: OrderedCollectionController<CanvasItemRef>
    edgeLabels(edgeId): OrderedCollectionController<EdgeLabel>
    edgeRoutePoints(edgeId): OrderedCollectionController<EdgeRoutePoint>
    mindmapChildren(mindmapId, parentId): OrderedCollectionController<NodeId>
  }

  mindmap: {
    create(snapshot)
    restore(snapshot)
    delete(id)
    moveRoot(id, position)
    setLayoutField(id, field, value)
    insertTopic(id, input, node)
    restoreTopic(id, snapshot)
    moveTopic(id, input)
    deleteTopic(id, nodeId)
    setTopicField(id, topicId, field, value)
    unsetTopicField(id, topicId, field)
    setTopicRecord(id, topicId, scope, path, value)
    unsetTopicRecord(id, topicId, scope, path)
    setBranchField(id, topicId, field, value)
    unsetBranchField(id, topicId, field)
    setCollapsed(id, topicId, collapsed)
  }

  dirty: {
    mark(target)
  }

  reconcile(): Result<void>
  commit(): KernelReduceResult
}
```

重点不是 API 长什么样，而是：

- 所有 draft 修改必须经过 tx
- 所有 inverse 必须由 tx 自动产出
- 所有 change / dirty 必须由 tx 自动产出

---

## 6. Inverse 的长期最优模型

inverse 不能继续由 handler 手拼。

长期最优规则应该是：

### 6.1 Field Primitive 自动采旧值

例如：

- `setField` 自动 inverse 为 `set(old)` 或 `unset`
- `unsetField` 自动 inverse 为 `set(old)`

### 6.2 Record Primitive 自动采旧 path 值

例如：

- `setRecord(path)` 自动 inverse 为 `set(oldPath)` 或 `unset(path)`
- `unsetRecord(path)` 自动 inverse 为 `set(oldPath)`

### 6.3 Collection Primitive 自动采旧 anchor

例如：

- `insert(item)` 的 inverse 自动是 `delete(itemId)`
- `delete(itemId)` 的 inverse 自动带恢复 anchor
- `move(itemId, to)` 的 inverse 自动回到旧 anchor

### 6.4 Snapshot Primitive 自动采 restore payload

例如：

- `deleteNode`
- `deleteEdge`
- `deleteMindmap`
- `deleteMindmapTopic`

这些 primitive 自动采集 snapshot 和 slot，不让 handler 自己拼。

### 6.5 结论

长期最优下：

- inverse 是 tx primitive 的副产品
- 不是 handler 的显式职责

---

## 7. Ordered Collection 的长期最优模型

这是当前 reducer 最值得统一的一层。

## 7.1 为什么必须抽象

下列四类结构本质相同：

- `canvas.order`
- `edge.labels`
- `edge.route.points`
- `mindmap.children[parentId]`

共同点：

- item 都有稳定身份
- 更新核心是结构顺序，不是 record path
- inverse 需要 old anchor

如果这层不统一，reducer 会长期重复：

- `findIndex`
- `splice`
- before/after/start/end 解析
- inverseTo 构造

## 7.2 推荐统一接口

长期最优建议统一成：

```ts
type OrderedCollectionController<TItem> = {
  get(itemId): TItem | undefined
  list(): readonly TItem[]
  insert(item, anchor)
  delete(itemId)
  move(itemId, anchor)
  setField(itemId, field, value)
  unsetField(itemId, field)
  setRecord(itemId, scope, path, value)
  unsetRecord(itemId, scope, path)
}
```

不同 collection 的差异通过 adapter 解决，不通过 handler 重写一套逻辑。

## 7.3 Collection Adapter 必须提供什么

每个 collection adapter 只提供少量 domain-specific 细节：

- item id extractor
- list reader
- list writer
- empty normalization
- item clone
- item field/record apply

例如：

- edge route point 在空数组时要回到 `route.kind = 'auto'`
- edge label 空数组时可能保留 `labels: [] | undefined`
- mindmap children item 只是 `NodeId`

这些差异属于 adapter，不属于 handler。

---

## 8. Dirty / Reconcile 的长期最优模型

当前 reducer 的一大问题是：

- handler 记得去 queue 某个 reconcile task

长期最优必须换成 dependency-driven 模型。

## 8.1 Dirty 不是“实体改了”，而是“派生语义失效了”

推荐把 dirty target 明确成稳定语义，而不是散乱 set：

- `document`
- `background`
- `canvasOrder`
- `node.geometry(nodeId)`
- `node.value(nodeId)`
- `edge.geometry(edgeId)`
- `edge.value(edgeId)`
- `mindmap.layout(mindmapId)`
- `projection.node`
- `projection.edge`
- `projection.mindmap`

## 8.2 Primitive 自动产 dirty

例如：

- `node.setField(position)` 自动标记 `node.geometry(id)`
- `edge.routePoints.move(...)` 自动标记 `edge.geometry(edgeId)`
- `mindmap.setTopicField(...)` 自动标记 `mindmap.layout(mindmapId)`

handler 不再直接操作 dirty。

## 8.3 Reconcile 只消费 dirty target

例如：

- `mindmap.layout(mindmapId)` 交给 `mindmapLayoutReconciler`

reconciler 只做：

- 读取 runtime 当前状态
- 派生下一组修改
- 通过 tx primitive 写回

也就是说 reconcile 不是绕过 tx 的后门。

## 8.4 必须保留断路器

这点必须长期保留：

- `MAX_RECONCILE_STEPS`
- `MAX_RECONCILE_REPEAT`

因为 derived graph 一旦出现错误循环，主线程会被直接卡死。

所以长期 contract 应明确：

- `drain()` 必须跑到 dirty 为空
- 但必须有 cycle guard / budget guard

---

## 9. Mindmap 为什么还是最复杂

即使有了 tx primitive，mindmap 仍然会是最复杂的 domain。

原因不是代码写得差，而是它同时具备：

- node 子树结构
- parent/child order
- branch style
- topic field/record
- root/top-level canvas 关系
- derived layout

也就是说，mindmap 是当前 whiteboard 里最接近“嵌入式结构化文档”的域对象。

但 mindmap 复杂不意味着 reducer 必须继续复杂。

长期最优路线是：

- mindmap handler 保留复杂语义
- graph / collection / dirty 细节下沉到 primitive

mindmap handler 可以复杂，但不应该臃肿。

---

## 10. 最终职责边界

长期最优下，各层职责必须很硬。

## 10.1 Handler 的职责

只允许：

- 语义校验
- 调用 tx primitive

不允许：

- 直接写 draft
- 直接 push inverse
- 直接 mark change
- 直接 queue reconcile

## 10.2 Primitive 的职责

必须负责：

- 旧值读取
- inverse 产出
- draft 写入
- change 产出
- dirty 产出

## 10.3 Reconciler 的职责

只负责：

- 消费 dirty target
- 计算 derived update
- 调用 tx primitive 写回

## 10.4 Reducer 入口的职责

只负责：

- 创建 tx
- dispatch op
- drain reconcile
- commit result

---

## 11. 迁移顺序

长期最优可以分阶段落地，但方向只能单向。

## P0. 保持现有 shared op surface 不变

不要再回退到 patch bag。

## P1. 引入真正的 `ReducerTx`

第一步不是再拆 handler，而是让所有写入通过统一 tx 入口。

这一阶段哪怕内部实现还是旧逻辑，也要先统一写入口。

## P2. 把 field / record inverse 自动化

把最重复的 inverse 逻辑从 handler 下沉到 primitive。

收益：

- 立即减少大量重复模板代码

## P3. 抽象 ordered collection primitive

统一：

- canvas
- edge labels
- edge route points
- mindmap children

这是第二个降复杂度的大头。

## P4. 把 dirty / reconcile 变成 dependency-driven

把显式 `queueMindmapLayout(...)` 迁移成：

- primitive -> dirty target
- reconciler -> drain

## P5. 把 delete / restore snapshot 收敛成 snapshot primitive

这一步能显著缩小：

- edge delete/restore
- node delete/restore
- mindmap subtree delete/restore

## P6. 最后再清理 handler 形状

在 primitive 足够强之前，不要过早追求“handler 非常短”。

因为先把文件拆小，但底层模型不变，只会把复杂度搬家。

---

## 12. 最终判断

长期最优下，reducer 不会变成一个非常小的文件，但它应该变成一个非常薄的入口。

真正的目标不是：

- “switch 少一点”

而是：

- handler 不再是事务脚本
- inverse 不再散落
- collection 不再重复实现
- derived dirty 不再靠人工记忆

所以最终结论是：

1. 现在的复杂度不是完全不可避免
2. 真正无法消掉的是语义复杂度，不是实现复杂度
3. 继续单纯拆文件收益有限
4. 真正应该补的是 reducer transaction primitive、ordered collection primitive、dirty/reconcile dependency model
5. 长期最优下，reducer 应该只是组合器，runtime 才是复杂度承载层

这才是 whiteboard reducer 的长期最优方向。

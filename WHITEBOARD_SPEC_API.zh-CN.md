# Whiteboard Spec API

本文定义 whiteboard 哪些能力适合做 spec 化，以及长期最优、复杂度最低的 spec 设计。

本文不讨论“如何把所有逻辑改成声明式”。固定前提是：

- 执行主轴继续保持 handwritten
- spec 只承载静态 contract 与跨层重复的元语义
- 不做一个巨型 `spec.ts`
- spec 一律按 concern 拆开

相关文档：

- [`WHITEBOARD_WRITE_API.zh-CN.md`](/Users/realrong/Rostack/WHITEBOARD_WRITE_API.zh-CN.md)
- [`WHITEBOARD_REDUCER_API.zh-CN.md`](/Users/realrong/Rostack/WHITEBOARD_REDUCER_API.zh-CN.md)
- [`WHITEBOARD_YJS_SYNC_API.zh-CN.md`](/Users/realrong/Rostack/WHITEBOARD_YJS_SYNC_API.zh-CN.md)

---

## 1. 固定结论

长期最优下，whiteboard 的 spec 边界固定为：

- `spec` 负责静态分类
- `runtime` 负责执行
- `spec` 不负责 orchestration
- `spec` 不负责替代 compiler / reducer / reconciler

一句话：

- whiteboard 需要的是 `execution-first + metadata-spec`
- 不是 `spec-first runtime`

最重要的判断：

### 1.1 适合 spec 化的东西

- schema 已知、语义稳定的静态配置
- 同一个分类被 `core / engine / collab / editor` 多层重复消费
- 可以用完整表覆盖，并要求 exhaustiveness 的东西
- 不依赖当前 live `Document` 图状态即可回答的问题

### 1.2 不适合 spec 化的东西

- command compile 算法
- reducer apply 算法
- inverse 收集
- dirty / invalidation / reconcile 执行
- layout / cascade delete / aggregate rewrite
- editor session / preview / selection 编排

这些都是 runtime 逻辑，不是 spec。

---

## 2. 当前已经正确 spec 化的东西

whiteboard 里已经有几类 spec 是对的，不需要再抽成更大的全局 spec：

- node / shape / template spec
- toolbar item spec
- layout resource spec
- text metrics spec

它们的共同点是：

- 纯静态
- 本 domain 内复用
- 不驱动 reducer / compiler
- 不承担跨层写入编排

长期最优下，这类 spec 继续保留在各自 domain 模块里：

- `product` 持有产品层 shape / palette / template spec
- `react` 持有 toolbar / panel / chrome item spec
- `editor` 持有 layout resource spec

不要把它们再上提成一个白板全局 mega spec。

---

## 3. 真正应该新增的 spec

真正值得新增、且能明显降低复杂度的只有两类：

1. `operation meta`
2. `history key / footprint`

除此之外，不要再泛化。

---

## 4. `operation meta`

### 4.1 为什么必须有

现在同一批 operation 元语义已经散在多处重复定义：

- `engine.write.compile/index.ts` 用 `command.type.startsWith(...)` 路由
- `core.reduce/dispatch.ts` 用巨大 `switch` 路由 reducer family
- `collab` 用 `op.type !== 'document.replace'` 判断 shared live op
- `collab codec` 再做一次同样的 live op 限制
- 后续 `collab history` 还会基于 op type 再做 footprint / conflict 采集

这里重复的不是执行逻辑，而是“这条 op 属于哪一类、能不能进 shared log、该交给哪个 family”。

这正是最适合 spec 化的部分。

### 4.2 最终职责

`operation meta` 只回答静态问题：

- 这条 op 属于哪个 namespace
- 这条 op 由哪个 reducer family 处理
- 这条 op 是 live shared，还是 checkpoint-only

它不回答：

- 如何 compile
- 如何 reduce
- 如何收集 inverse
- 如何做 lock validate
- 如何计算 dirty / invalidation

### 4.3 最终类型

```ts
type OperationType = Operation['type']

type OperationNamespace =
  | 'document'
  | 'canvas'
  | 'node'
  | 'edge'
  | 'group'
  | 'mindmap'

type OperationReducerFamily =
  | 'document'
  | 'node'
  | 'edge'
  | 'group'
  | 'mindmap'

type OperationSyncMode =
  | 'live'
  | 'checkpoint-only'

type OperationMeta<K extends OperationType = OperationType> = {
  type: K
  namespace: OperationNamespace
  reducer: OperationReducerFamily
  sync: OperationSyncMode
}

type OperationMetaTable = {
  [K in OperationType]: OperationMeta<K>
}
```

### 4.4 最终 API

```ts
export const OPERATION_META: OperationMetaTable

export const readOperationMeta: <K extends OperationType>(
  type: K
) => OperationMeta<K>

export const readOperationNamespace: (
  type: OperationType
) => OperationNamespace

export const readOperationReducerFamily: (
  type: OperationType
) => OperationReducerFamily

export const isLiveSharedOperation: (
  op: Operation
) => boolean

export const isCheckpointOnlyOperation: (
  op: Operation
) => boolean
```

### 4.5 使用规则

长期最优下，下面这些地方都不应该再硬编码自己的 op 分类：

- `collab` 判断 live shared op
- `collab codec` 校验 shared op 合法性
- reducer family 路由
- 任何 future shared / history / replay contract 中对 op 分类的判断

允许保留手写执行的地方：

- `compileNodeCommand(...)`
- `compileEdgeCommand(...)`
- `handleNodeOperation(...)`
- `handleEdgeOperation(...)`

也就是说：

- route meta 进 spec
- execute logic 留在 handler

### 4.6 命名原则

这里用 `Meta`，不用 `Spec` 大对象，原因很简单：

- 它只是静态分类表
- 不是执行 DSL
- 不承载行为组合

长期最优下不要出现这种设计：

```ts
type OperationSpec = {
  meta: ...
  history: ...
  lock: ...
  dirty: ...
  reconcile: ...
  inverse: ...
}
```

这会把完全不同的 concern 又捆回一个巨型中心对象，复杂度只会更高。

---

## 5. `history key / footprint`

### 5.1 为什么它也应该 spec 化

`collab-aware history` 真正需要的不是 shared undo，而是：

- 正式的 `HistoryKey`
- 正式的 `HistoryFootprint`
- 正式的冲突判定 contract

这个模型一旦进入实现，就必须有稳定、唯一的语义来源，不能让：

- reducer 自己定义一套
- collab 再猜一套
- history invalidation 再拼一套

因此，`HistoryKey` 是应该 spec 化的。

### 5.2 但它不是纯静态数据表

`HistoryKey` 适合 spec 化；
`footprint collect` 不适合退化成纯 JSON 静态表。

原因是很多 op 的 footprint 依赖当前 runtime 状态，例如：

- subtree delete 实际删了哪些 node / edge
- cascade delete 实际影响了哪些 relation
- topic 当前属于哪个 mindmap
- restore 恢复了哪些实体和顺序槽位

因此长期最优做法不是一张纯 data table，而是：

- key model spec 化
- collect API spec 化
- collect 实现仍然 handwritten

### 5.3 最终类型

```ts
type HistoryKey =
  | { kind: 'document.background' }
  | { kind: 'canvas.order' }
  | { kind: 'node.exists'; nodeId: NodeId }
  | { kind: 'node.field'; nodeId: NodeId; field: NodeField }
  | { kind: 'node.record'; nodeId: NodeId; scope: 'data' | 'style'; path: string }
  | { kind: 'edge.exists'; edgeId: EdgeId }
  | { kind: 'edge.field'; edgeId: EdgeId; field: EdgeField }
  | { kind: 'edge.record'; edgeId: EdgeId; scope: 'data' | 'style'; path: string }
  | { kind: 'edge.label.exists'; edgeId: EdgeId; labelId: string }
  | { kind: 'edge.label.field'; edgeId: EdgeId; labelId: string; field: EdgeLabelField }
  | { kind: 'edge.label.record'; edgeId: EdgeId; labelId: string; scope: 'data' | 'style'; path: string }
  | { kind: 'edge.route'; edgeId: EdgeId }
  | { kind: 'edge.route.point'; edgeId: EdgeId; pointId: string }
  | { kind: 'group.exists'; groupId: GroupId }
  | { kind: 'group.field'; groupId: GroupId; field: GroupField }
  | { kind: 'mindmap.exists'; mindmapId: MindmapId }
  | { kind: 'mindmap.structure'; mindmapId: MindmapId }
  | { kind: 'mindmap.layout'; mindmapId: MindmapId }
  | { kind: 'mindmap.branch.field'; mindmapId: MindmapId; topicId: NodeId; field: MindmapBranchField }

type HistoryFootprint = readonly HistoryKey[]
```

### 5.4 `mindmap topic` 的正式规则

长期最优下：

- `topic` 仍然是 `node`
- `topic` 不是特殊只读影子实体
- `topic` 必须继续参与 selection / toolbar / edge connect / node.read

因此在 history key 上：

- `mindmap.topic.field.*` 映射到 `node.field`
- `mindmap.topic.record.*` 映射到 `node.record`
- 只有 aggregate 真正拥有的部分才落到 `mindmap.*`

也就是：

- topic 自身属性是 `node`
- tree / parent-child / layout / branch style 是 `mindmap`

这条边界必须写死，不能把 topic 再拆成另一套 generic node 之外的特例模型。

### 5.5 最终 collect API

```ts
type HistoryCollectContext = {
  read: ReducerReadApi
  add(key: HistoryKey): void
  addMany(keys: readonly HistoryKey[]): void
}

type OperationHistoryCollector<K extends OperationType = OperationType> = (
  ctx: HistoryCollectContext,
  op: Extract<Operation, { type: K }>
) => void

type OperationHistoryRegistry = {
  [K in OperationType]: OperationHistoryCollector<K>
}
```

### 5.6 使用规则

长期最优下：

- history key model 由 `core` 持有
- footprint collect 在 reducer apply 期间执行
- `collab` 只消费 `WriteRecord.history.footprint`
- `collab` 不从 raw ops 逆向猜 footprint

---

## 6. 不需要 spec 化的东西

下面这些很容易让系统再长出第二套编排器，长期必须避免。

### 6.1 不要做 `CommandSpec`

当前 command 层不需要一张全局 spec 表。

原因：

- command 只存在于 `engine / editor`
- 真正复杂的是 compile 逻辑，不是 command 分类
- command family 路由只是单层问题，不是跨层 contract

如果要消除 `startsWith(...)`，长期最优只需要一个很薄的 namespace helper：

```ts
type CommandNamespace =
  | 'document'
  | 'canvas'
  | 'node'
  | 'group'
  | 'edge'
  | 'mindmap'

export const readCommandNamespace: (
  type: Command['type']
) => CommandNamespace
```

不要再加：

- `CommandSpec`
- `commandType`
- `commandKind`
- `WriteHistoryMode`

这些都会让 command 层多出一层没有必要的元模型。

### 6.2 不要把 reducer 行为写进 spec

以下内容必须继续留在 `tx.*` / handler / reconcile 里：

- create / delete / restore
- ordered collection move / insert / delete
- cascade edge delete
- mindmap subtree move / delete / restore
- inverse snapshot capture
- dirty / invalidation 计算
- reconcile queue drain

原因是这些都依赖当前 overlay runtime，不是静态元数据。

### 6.3 不要把 `ChangeSet` / `Invalidation` 变成 op-level spec

`ChangeSet` 与 `Invalidation` 的正确来源是 reducer runtime 的真实写入结果。

不要做这种静态设计：

```ts
type OperationEffectSpec = {
  changes: readonly string[]
  projections: readonly string[]
  reconcile: readonly string[]
}
```

这样会马上出错，因为：

- cascade delete 影响集合依赖当前图
- topic op 可能转成 node change 或 mindmap change
- projection invalidation 取决于最终 dirty set，不是单个 op 的静态常量

长期最优下：

- `ChangeSet` 继续由 reducer runtime 产出
- `Invalidation` 继续由 reducer runtime 产出
- `reconcile queue` 继续由 `tx.dirty.*` 驱动

### 6.4 不要把 lock 规则提前抽成全局 spec

当前 lock 校验虽然有不少 op switch，但它仍然是一个局部 concern：

- 输入是当前 document 图
- 输出是当前 batch 是否允许
- 逻辑强依赖 relation / endpoint / current locked state

它目前不值得升格成全局跨层 spec。

长期最优下：

- `resolveLockDecision(...)` 继续保留为局部 runtime API
- reducer 级 `validateLockOperations(...)` 继续保留为局部 runtime API

只有将来 lock 规则真的在多个层级重复实现时，才值得拆出单独 concern registry。

---

## 7. 最终模块边界

### 7.1 `core`

长期最优下，真正新增的 spec 模块应放在 `core`，因为：

- `Operation` 定义在 `core`
- `HistoryKey` 描述的是 document 语义
- footprint collect 需要 reducer read API

建议最终目录：

- `whiteboard/packages/whiteboard-core/src/spec/operation/meta.ts`
- `whiteboard/packages/whiteboard-core/src/spec/operation/index.ts`
- `whiteboard/packages/whiteboard-core/src/spec/history/key.ts`
- `whiteboard/packages/whiteboard-core/src/spec/history/collect.ts`
- `whiteboard/packages/whiteboard-core/src/spec/history/index.ts`

### 7.2 `engine`

`engine` 不新增自己的 spec 中心。

`engine` 只消费：

- `operation meta`
- `history footprint`

并继续负责：

- command compile
- write draft
- commit
- history capture

### 7.3 `collab`

`collab` 不拥有 operation 语义 spec。

`collab` 只消费：

- `isLiveSharedOperation(...)`
- `isCheckpointOnlyOperation(...)`
- `HistoryFootprint`

也就是说：

- shared protocol 的真正规则来源于 `core`
- `collab` 只是协议执行者

### 7.4 `editor / react / product`

继续持有自己的本地 spec：

- template / insert / palette spec
- toolbar / panel item spec
- layout resource spec

不要把这些 UI spec 合并进 write / collab / reducer spec。

---

## 8. 最低复杂度的最终形态

长期最优的最终形态不是“一套总 spec 驱动一切”，而是四层：

1. schema spec
2. resource spec
3. operation meta
4. history key

其中只有第 3、4 层是新补的。

一句话总结：

- schema / resource spec：解决静态配置复用
- operation meta：解决跨层 op 分类重复
- history key：解决协作 history / conflict 的唯一语义来源
- 其余执行逻辑全部继续手写

---

## 9. 分阶段实施

### P1. 先补 `operation meta`

落地后替换这些硬编码：

- collab shared op 判定
- collab codec live op 校验
- reducer family 路由
- 任何 shared/checkpoint-only 判断

### P2. 再补 `history key / footprint`

落地后支撑：

- `WriteRecord.history.footprint`
- collab local history invalidation
- remote conflict detect

### P3. 其余一律延后

不要在 P1 / P2 之外顺手引入：

- `CommandSpec`
- `LockSpec`
- `OperationEffectSpec`
- `CommitKind`
- `WriteHistoryMode`

这些都不是当前最低复杂度路径。

---

## 10. 最终原则

最后把长期原则压缩成三句：

- 只有跨层重复的静态元语义，才值得 spec 化
- spec 必须按 concern 拆开，不能做 mega registry
- 所有依赖 live state 的执行逻辑，继续留在 handwritten runtime


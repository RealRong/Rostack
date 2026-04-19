# Whiteboard Editor Query P1 最终方案：Keyed Runtime、Edge 空间索引与 Selection 分层聚合

## 1. 目标

P1 只做三件事，而且必须一次拉直，不做兼容式过渡：

1. 把 `node` / `edge` 热读路径里的全局 `selection` / `edit` 依赖，改成按实体精确失效的 keyed runtime read。
2. 把 `edge.idsInRect()` 从 `query` 内全量扫描，改成 `engine` 持有的空间索引读。
3. 把 `selection.toolbar` 从“大总装 getter”拆成分层聚合缓存，避免重复扫描同一批选中项。

P1 不做下面这些事：

- 不做 `mindmap` live layout 迁移。
- 不做 `node.geometry/content/runtime` 的完整 P2 分层。
- 不做 `node.meta(type)` / `node.capability(type)` 的稳定缓存。
- 不引入新的兼容层、别名层、V2 命名空间。

## 2. 最终判断

## 2.1 `createKeyedDerivedStore()` 不够，P1 必须用 `createProjectedKeyedStore()`

如果只是把：

- `selection.node.selected(nodeId)`
- `selection.edge.selected(edgeId)`
- `edit.node(nodeId)`
- `edit.edgeLabel(edgeId)`

写成普通 `createKeyedDerivedStore()`，但 getter 里仍直接读取全局 `selection` / `edit`，那么失效面仍然是全局的。

原因很简单：

- `keyed derived` 只是“按 key 缓存结果”。
- 它不会把一个全局 `ReadStore` 自动拆成“按 key 精确通知”。
- 只要 getter 依赖整个 `selection` 或整个 `edit`，source 一变，所有已订阅 key 仍会一起脏。

P1 的正确做法不是“把全局态包一层 keyed getter”，而是：

- 先把全局态投影成 `ReadonlyMap<Key, Value>`
- 再用 `createProjectedKeyedStore()` 做按 key 差量通知

也就是：

- `selection target -> selected node map`
- `selection target -> selected edge map`
- `edit session -> node edit map`
- `edit session -> edge label edit map`

只有这样，真正变化的 key 才会被通知。

## 2.2 P1 的 owner 边界

P1 后 owner 必须明确成三层：

- `session state`
  - 拥有原始 `selection` / `edit`
- `query runtime read`
  - 拥有按 key materialize 的 `selected` / `edit draft`
- `engine index`
  - 拥有 `edge.idsInRect()` 所需的空间命中能力

`query` 自己不再做：

- 全局 `selection` 扇出到每个 node / edge render
- 全局 `edit` 扇出到每个 node / edge item
- `edge.idsInRect()` 的遍历实现

## 2.3 P1 的 stop line

P1 的 stop line 必须非常清楚：

- `overlay` / `toolbar` 这种单例聚合 getter 仍然可以直接读全局 `tool` / `edit` / `interaction`
- 但所有“按实体读取”的热路径，必须停止直接读全局 `selection` / `edit`

换句话说：

- 单例聚合允许读全局态
- keyed entity getter 不允许读全局态

这条规则是 P1 的核心。

## 3. 最终 API

## 3.1 EditorQuery 最终形态

P1 后，`EditorQuery` 的关键公共形态应收敛为：

```ts
export type EditorQuery = Omit<EngineRead, 'node' | 'edge' | 'index'> & {
  edit: EditorEditRead
  node: NodePresentationRead
  edge: EdgePresentationRead
  selection: SelectionRead
  mindmap: MindmapPresentationRead
  target: RuntimeTargetRead
  tool: ToolRead
  draw: ReadStore<DrawState>
  space: ReadStore<boolean>
  viewport: { ... }
  chrome: { ... }
}
```

这里的关键变化只有两个：

1. 新增 `edit`
2. 删除 `selection.model` 这层公共中转，改为直接暴露 `members / summary / affordance / stats / scope`

`selection.model.get().summary` 这种形态应该彻底删掉。

## 3.2 Edit Read

P1 不再让 `node.item(nodeId)` / `edge.item(edgeId)` 直接读取整个 `EditSession`，统一改成专用 keyed read。

```ts
export type NodeEditView = {
  field: EditField
  text: string
  caret: EditCaret
  size?: Size
  fontSize?: number
}

export type EdgeLabelEditView = {
  labelId: string
  text: string
  caret: EditCaret
}

export type EditorEditRead = {
  node: KeyedReadStore<NodeId, NodeEditView | undefined>
  edgeLabel: KeyedReadStore<EdgeId, EdgeLabelEditView | undefined>
}
```

命名判断：

- 用 `node`
- 用 `edgeLabel`
- 不用 `nodeSession`
- 不用 `activeNodeEditSession`
- 不用 `edgeLabelDraftByEdgeId`

原因很简单：

- 这是 query 读模型，不是 session 写模型
- 暴露的应该是最小可用视图，不是原始 session

### 为什么 `edgeLabel` 只按 `edgeId` keyed

P1 不需要再按 `labelId` 建第二层 keyed store。

原因：

- 同一时刻只会有一个 active edge label edit
- 对同一条 edge 来说，label draft 的 owner 只有一个
- `edge.label.content(ref)` 读取 `edit.edgeLabel(edgeId)` 后，再判断 `labelId` 是否匹配即可

所以最简单、最长期稳定的设计是：

```ts
edit.edgeLabel(edgeId): EdgeLabelEditView | undefined
```

而不是：

```ts
edit.edgeLabel(ref): ...
edit.edgeLabel(edgeId, labelId): ...
```

## 3.3 Selection Read

P1 后，`selection` 公共 API 直接收敛为分层读：

```ts
export type SelectionMembers = {
  key: string
  target: SelectionTarget
  nodes: readonly Node[]
  edges: readonly Edge[]
  primaryNode?: Node
  primaryEdge?: Edge
}

export type SelectionNodeStats = {
  ids: readonly NodeId[]
  count: number
  hasGroup: boolean
  lock: SelectionToolbarLockState
  types: readonly SelectionNodeTypeInfo[]
}

export type SelectionEdgeStats = {
  ids: readonly EdgeId[]
  count: number
  types: readonly SelectionEdgeTypeInfo[]
}

export type SelectionRead = {
  members: ReadStore<SelectionMembers>
  summary: ReadStore<SelectionSummary>
  affordance: ReadStore<SelectionAffordance>
  node: {
    selected: KeyedReadStore<NodeId, boolean>
    stats: ReadStore<SelectionNodeStats>
    scope: ReadStore<SelectionToolbarNodeScope | undefined>
  }
  edge: {
    selected: KeyedReadStore<EdgeId, boolean>
    stats: ReadStore<SelectionEdgeStats>
    scope: ReadStore<SelectionToolbarEdgeScope | undefined>
  }
  overlay: ReadStore<SelectionOverlay | undefined>
  toolbar: ReadStore<SelectionToolbarContext | undefined>
}
```

这里明确删除：

- `selection.model`
- `selection.node: ReadStore<SelectionNodeInfo | undefined>`
- `selection.box`

原因：

- `selection.model` 是额外翻译层
- `selection.node` 只是 `stats` 的裁剪版，重复
- `selection.box` 只是 `summary.box` 的重复入口

P1 的公共 API 应该只保留真正有语义的层。

## 3.4 Engine Edge Hit API

P1 后，`edge.idsInRect()` 的真实 owner 改为 `engine`。

先补一个短而清晰的共享类型：

```ts
export type EdgeRectHitOptions = {
  match?: 'touch' | 'contain'
}
```

然后收敛为：

```ts
export type EngineReadIndex = {
  node: {
    all: () => CanvasNode[]
    get: (nodeId: NodeId) => CanvasNode | undefined
    idsInRect: (rect: Rect, options?: NodeRectHitOptions) => NodeId[]
  }
  edge: {
    idsInRect: (rect: Rect) => EdgeId[]
  }
  snap: {
    all: () => SnapCandidate[]
    inRect: (rect: Rect) => SnapCandidate[]
  }
}

export type EdgeRead = {
  list: ReadStore<readonly EdgeId[]>
  item: KeyedReadStore<EdgeId, Readonly<EdgeItem> | undefined>
  edges: (edgeIds: readonly EdgeId[]) => readonly Edge[]
  related: (nodeIds: Iterable<NodeId>) => readonly EdgeId[]
  idsInRect: (rect: Rect, options?: EdgeRectHitOptions) => EdgeId[]
}
```

对应地，`query.edge.idsInRect()` 不再实现自己的扫描版，只做转发：

```ts
edge.idsInRect(rect, options): EdgeId[]
```

## 3.5 Node / Edge Projection 签名

P1 不重做 projection 分层，但必须把全局 `EditSession` 从 projection 签名里踢掉。

```ts
projectNodeItem(
  item: NodeItem,
  preview: NodePreviewProjection,
  edit: NodeEditView | undefined,
  mindmap?: MindmapItem
): NodeItem

projectEdgeItem(
  item: EdgeItem,
  preview: EdgePreviewProjection,
  edit: EdgeLabelEditView | undefined
): EdgeItem
```

这一步非常关键。

只要 projection 继续吃整个 `EditSession`，P1 就没有真正完成。

## 4. 详细实现设计

## 4.1 `query/edit/read.ts`

新增一个非常窄的中轴：

```ts
export const createEditRead = (
  source: ReadStore<EditSession>
): EditorEditRead
```

内部实现必须用 `createProjectedKeyedStore()`，而不是 `createKeyedDerivedStore()`。

### `node` 实现

```ts
const node = createProjectedKeyedStore({
  source,
  select: (session) => {
    if (!session || session.kind !== 'node') {
      return EMPTY_NODE_EDIT_MAP
    }

    return new Map([
      [session.nodeId, {
        field: session.field,
        text: session.draft.text,
        caret: session.caret,
        size: session.field === 'text' && session.layout.size
          ? session.layout.size
          : undefined,
        fontSize: session.field === 'text'
          ? session.layout.fontSize
          : undefined
      }]
    ])
  },
  emptyValue: undefined
})
```

### `edgeLabel` 实现

```ts
const edgeLabel = createProjectedKeyedStore({
  source,
  select: (session) => {
    if (!session || session.kind !== 'edge-label') {
      return EMPTY_EDGE_LABEL_EDIT_MAP
    }

    return new Map([
      [session.edgeId, {
        labelId: session.labelId,
        text: session.draft.text,
        caret: session.caret
      }]
    ])
  },
  emptyValue: undefined
})
```

### 约束

- 返回的是 query 需要的最小视图，不是整个 session
- 空状态必须复用共享空 map，避免无意义分配
- 不要在这里夹带 `capabilities` / `status` / `layout` 全量对象

## 4.2 `query/selection/runtime.ts`

新增 selection runtime read，专门解决 `selected(nodeId)` / `selected(edgeId)`。

```ts
export type SelectionRuntimeRead = {
  node: {
    selected: KeyedReadStore<NodeId, boolean>
  }
  edge: {
    selected: KeyedReadStore<EdgeId, boolean>
  }
}

export const createSelectionRuntimeRead = (
  source: ReadStore<SelectionTarget>
): SelectionRuntimeRead
```

内部仍必须用 `createProjectedKeyedStore()`：

```ts
const selectedNodes = createProjectedKeyedStore({
  source,
  select: (target) => new Map(target.nodeIds.map((id) => [id, true] as const)),
  emptyValue: false
})

const selectedEdges = createProjectedKeyedStore({
  source,
  select: (target) => new Map(target.edgeIds.map((id) => [id, true] as const)),
  emptyValue: false
})
```

这一步之后：

- 只有选中态变化的 node 会收到通知
- 只有选中态变化的 edge 会收到通知

而不是整个 scene 一起抖动。

## 4.3 `query/node/projection.ts` 与 `query/node/read.ts`

### `projection.ts`

把：

```ts
readNodeTextDraft(item, edit: EditSession)
```

改成：

```ts
readNodeTextDraft(item, edit: NodeEditView | undefined)
```

`projectNodeItem()` 只接受当前 node 的 edit view。

### `read.ts`

`createNodeRead()` 不再接收全局 `selection` / 全局 `edit`，而是接收：

```ts
selection: {
  selected: KeyedReadStore<NodeId, boolean>
}
edit: {
  node: KeyedReadStore<NodeId, NodeEditView | undefined>
}
```

然后改成：

```ts
const item = createKeyedDerivedStore({
  get: (nodeId) => {
    ...
    return projectNodeItem(
      current,
      readValue(feedback, nodeId),
      readValue(edit.node, nodeId),
      mindmapItem
    )
  }
})

const render = createKeyedDerivedStore({
  get: (nodeId) => {
    ...
    const editView = readValue(edit.node, nodeId)
    return {
      ...resolvedView,
      selected: readValue(selection.selected, nodeId),
      edit: editView
        ? {
            field: editView.field,
            caret: editView.caret
          }
        : undefined
    }
  }
})
```

### 结果

P1 后，`node.render(nodeId)` 不再直接依赖：

- 整个 `SelectionTarget`
- 整个 `EditSession`

## 4.4 `query/edge/projection.ts` 与 `query/edge/read.ts`

### `projection.ts`

把：

```ts
applyEdgeEditSession(edge, session: EditSession)
```

改成：

```ts
applyEdgeEdit(edge, edit: EdgeLabelEditView | undefined)
```

只处理当前 edge 对应的 draft。

### `read.ts`

`createEdgeRead()` 改成接收：

```ts
selection: {
  selected: KeyedReadStore<EdgeId, boolean>
}
edit: {
  edgeLabel: KeyedReadStore<EdgeId, EdgeLabelEditView | undefined>
}
```

然后：

1. `item(edgeId)` 使用 `readValue(edit.edgeLabel, edgeId)`
2. `render(edgeId)` 使用 `readValue(selection.selected, edgeId)`
3. `label.content(ref)` 使用 `readValue(edit.edgeLabel, ref.edgeId)`，再比对 `labelId`

核心逻辑：

```ts
const currentEdit = readValue(edit.edgeLabel, ref.edgeId)
const editing = currentEdit?.labelId === ref.labelId
const text = editing ? currentEdit.text : readEdgeLabelText(label.text)
const caret = editing ? currentEdit.caret : undefined
```

### 注意

`selectedChrome` 仍然可以直接读全局 selection / edit。

因为：

- 它是单例 getter
- 它不是“每个 edge 一份”的热路径

P1 不需要在这里继续拆。

## 4.5 `engine/read/indexes/EdgeRectIndex.ts`

新增一个最小索引：

```ts
export class EdgeRectIndex {
  idsInRect(rect: Rect): EdgeId[]
  applyChange(
    changedIds: readonly EdgeId[],
    readBounds: (edgeId: EdgeId) => Rect | undefined
  ): void
  reset(
    edgeIds: readonly EdgeId[],
    readBounds: (edgeId: EdgeId) => Rect | undefined
  ): void
}
```

这里故意不把 API 做大。

P1 只需要：

- 更新
- 重建
- 查询

不需要：

- 复杂 visitor
- viewport 专用 API
- 候选与精确命中的两套公共类型

### 索引语义

`EdgeRectIndex` 存的不是 path 本体，而是 edge path 的 bounds rect。

也就是：

- 索引只负责粗筛
- 精确 `touch / contain` 仍在 `read.edge.idsInRect()` 里做最终过滤

这和当前 node 读模型的做法一致。

## 4.6 `engine/read/store/index.ts`

这里必须改同步顺序。

当前 `nodeRectIndex` 可以在最前面更新，但 `edgeRectIndex` 不行。

原因：

- edge bounds 依赖更新后的 endpoint
- endpoint 又依赖更新后的 node geometry 与 edge projection

所以 P1 的正确顺序必须是：

1. `nodeRectIndex.applyChange(impact, model)`
2. 生成 `snapshot`
3. `nodeProjection.applyChange(...)`
4. `edgeProjection.applyChange(...)`
5. `edgeRectIndex.applyChange(edgeProjection.changedIds(), readEdgeBounds)`
6. `mindmapProjection.applyChange(...)`

也就是：

- node 索引先更
- edge 投影先算完
- edge 索引最后更

### 为什么这里要给 `edgeProjection` 补 `changedIds()`

因为 P1 不应该让 `edgeRectIndex` 每次都全量重建。

最简单、最长期最优的做法是：

- `edgeProjection.applyChange()` 内部本来就知道哪些 edge 真正变了
- 直接把这个 dirty set 暴露出来
- `edgeRectIndex` 只更新这批 id

而不是在 `read/store/index.ts` 里再重新推一遍 dirty 规则。

## 4.7 `engine/read.edge.idsInRect()`

公共读接口统一收敛为：

```ts
const readEdgeIdsInRect = (
  rect: Rect,
  options?: EdgeRectHitOptions
): EdgeId[] => {
  const candidateIds = index.edge.idsInRect(rect)
  return candidateIds.filter((edgeId) => {
    const item = edgeProjection.item.get(edgeId)
    if (!item) {
      return false
    }

    const path = getEdgePath({
      edge: item.edge,
      source: {
        point: item.ends.source.point,
        side: item.ends.source.anchor?.side
      },
      target: {
        point: item.ends.target.point,
        side: item.ends.target.anchor?.side
      }
    })

    return matchEdgeRect({
      path,
      queryRect: rect,
      mode: options?.match ?? 'touch'
    })
  })
}
```

注意：

- 粗筛在 index
- 精筛在 read
- `query.edge.idsInRect()` 只转发 `read.edge.idsInRect()`

## 4.8 `query/selection/model.ts`

`SelectionModel` 改成真正的三层中轴：

```ts
export type SelectionModel = {
  members: SelectionMembers
  summary: SelectionSummary
  affordance: SelectionAffordance
}
```

`members` 的职责非常窄：

- 读取 `SelectionTarget`
- 取出当前 nodes / edges
- 计算 `primaryNode` / `primaryEdge`
- 生成稳定 `key`

```ts
members -> summary -> affordance
```

严格单向。

### 为什么 `stats` 不放进 `model`

因为 `stats` 不是核心 selection 几何模型的一部分。

`stats` 属于 toolbar 聚合层，不该污染基础 model。

所以：

- `model.ts` 只管 `members / summary / affordance`
- `read.ts` 再往上叠 `stats / scope / overlay / toolbar`

这就是最简单的分层。

## 4.9 `query/selection/read.ts`

这里的目标不是再造一个新系统，而是把当前大 getter 拆开。

最终职责分成五块：

1. `node.stats`
2. `edge.stats`
3. `node.scope`
4. `edge.scope`
5. `toolbar`

### `node.stats`

只扫描一次：

- `members.nodes`
- 输出 `ids / count / hasGroup / lock / types`

### `edge.stats`

只扫描一次：

- `members.edges`
- 输出 `ids / count / types`

### `node.scope`

只负责“当前整组 node selection”的可编辑属性聚合：

- shape
- font
- fill / stroke
- opacity
- mindmap branch / border

### `edge.scope`

只负责“当前整组 edge selection”的可编辑属性聚合：

- type
- color
- opacity
- width
- dash
- start / end marker
- textMode

### `toolbar`

`toolbar()` 只做最终组装，不再自己直接从 `summary.items` 开始扫描一遍全量 nodes / edges。

它的依赖应只剩：

- `summary`
- `affordance`
- `node.stats`
- `edge.stats`
- `node.scope`
- `edge.scope`
- `tool`
- `edit`
- `interaction`

也就是：

```ts
toolbar = light compose(
  summary,
  affordance,
  node.stats,
  edge.stats,
  node.scope,
  edge.scope,
  tool,
  edit,
  interaction
)
```

### type scopes 怎么做

P1 不需要再公开新的 `typeScopes()` API。

最简单做法是：

- `node.stats.types` 已经持有 `nodeIds`
- `edge.stats.types` 已经持有 `edgeIds`
- `toolbar()` 内部按这些 id 组装 type scopes

但这里不能再用多轮 `filter()` 扫原数组。

正确做法是：

1. 先基于 `members.nodes` 建 `Map<NodeId, Node>`
2. 先基于 `members.edges` 建 `Map<EdgeId, Edge>`
3. `types` 里按 id 直接取值

这样 type scopes 只做按 id 取值，不重复整批遍历。

## 5. 文件布局

P1 后建议的 query 目录形态：

```ts
query/
  edit/
    read.ts
  selection/
    runtime.ts
    model.ts
    read.ts
  node/
    projection.ts
    read.ts
  edge/
    projection.ts
    read.ts
  index.ts
```

这里的命名刻意很短：

- `edit/read.ts`
- `selection/runtime.ts`
- `selection/model.ts`
- `selection/read.ts`

不引入：

- `runtimeSelectionStateReader`
- `selectionToolbarAggregation`
- `querySelectionFacade`

这些名字都太长，也没有增加语义。

## 6. 失效与缓存语义

## 6.1 Node / Edge 实体失效

P1 后应达到：

- 选中 `node_a` 时，只通知 `selection.node.selected(node_a)`
- 取消选中 `node_b` 时，只通知 `selection.node.selected(node_b)`
- 编辑 `node_c` 时，只通知 `edit.node(node_c)`
- 编辑 `edge_x` label 时，只通知 `edit.edgeLabel(edge_x)`

从而：

- `node.render(nodeId)` 只在自己的 `selected` / `edit` 变化时脏
- `edge.render(edgeId)` 只在自己的 `selected` / `edit` 变化时脏

## 6.2 Selection 聚合失效

`selection.members / summary / affordance / stats / scope / toolbar` 都是 selection 级聚合，本来就是单例读。

所以它们的目标不是“按 key 精确通知”，而是：

- 避免重复扫描
- 避免一层 getter 承担所有职责

## 6.3 Edge Hit 失效

`edge.idsInRect()` 的失效 owner 是 `engine`。

只要以下任何一类变化发生，就更新对应 edge 的 bounds：

- edge 自身结构变化
- edge route 变化
- edge source / target 改变
- endpoint node geometry 改变

但：

- label text 变化不应触发 edge spatial index 更新
- selection 变化不应触发 edge spatial index 更新
- edit caret 变化不应触发 edge spatial index 更新

## 7. 实施顺序

## Phase 1：补 runtime keyed read

1. 新增 `query/edit/read.ts`
2. 新增 `query/selection/runtime.ts`
3. 在 `query/index.ts` 装配 `editRead` 与 `selectionRuntimeRead`
4. 修改 `node.read.ts` / `node.projection.ts`
5. 修改 `edge.read.ts` / `edge.projection.ts`

完成标志：

- `node.render` / `edge.render` / `edge.label.content` 不再直接读全局 `selection` / `edit`
- `projectNodeItem` / `projectEdgeItem` 不再接收 `EditSession`

## Phase 2：补 engine edge index

1. 新增 `EdgeRectIndex`
2. 给 `EngineReadIndex` 增加 `edge.idsInRect`
3. 给 `EngineRead.edge` 增加 `idsInRect`
4. 给 `edgeProjection` 暴露 `changedIds()`
5. 调整 `read/store/index.ts` 的同步顺序
6. 删除 `query.edge.idsInRect` 内的全量扫描实现

完成标志：

- marquee 拖拽不再对全部 edge 做扫描
- `query.edge.idsInRect()` 只做转发

## Phase 3：拆 selection 聚合

1. 重写 `selection/model.ts`
2. 把 `SelectionModel` 改成 `members + summary + affordance`
3. 重写 `selection/read.ts`
4. 删除 `selection.model` 公共出口
5. 删除旧的 `selection.node` 简化读

完成标志：

- `toolbar()` 不再自己直接重扫全量 nodes / edges 多轮
- `node.stats` / `edge.stats` / `node.scope` / `edge.scope` 成为明确中轴

## Phase 4：清理

1. 删除旧类型和旧 helper
2. 清理 `selection.model` 相关 re-export
3. 清理 `selection.box`
4. 清理 `SelectionNodeInfo` 这类只服务旧接口的中间类型
5. 全量 typecheck 与行为回归验证

## 8. 必须删除的旧实现

P1 完成后，下面这些旧东西不应保留：

- `query.selection.model` 公共 API
- `query.selection.node: ReadStore<SelectionNodeInfo | undefined>`
- `query.selection.box`
- `query.edge.idsInRect()` 内部 `read.edge.list + filter(matchEdgeRect)` 的扫描实现
- `projectNodeItem(..., edit: EditSession, ...)`
- `projectEdgeItem(..., edit: EditSession)`
- `node.render()` / `edge.render()` 内直接 `readValue(selection)` / `readValue(edit)`

## 9. 验收标准

P1 的验收标准必须具体：

1. 单选 node / edge 时，React scene 不再因为全局 `selection` 变化导致所有 `render(key)` 一起重算。
2. 文本编辑 node / edge label 时，不再因为全局 `edit` 变化导致所有 `item(key)` 一起重算。
3. marquee 拖拽期间，`edge.idsInRect()` 不再全量遍历 `read.edge.list`。
4. `selection.toolbar()` 不再直接承担 node stats、edge stats、scope 构造、type 过滤的全部工作。
5. `query` 对外命名只保留：
   - `edit`
   - `selection.members`
   - `selection.summary`
   - `selection.affordance`
   - `selection.node.selected`
   - `selection.node.stats`
   - `selection.node.scope`
   - `selection.edge.selected`
   - `selection.edge.stats`
   - `selection.edge.scope`
   - `selection.overlay`
   - `selection.toolbar`
6. 不留下 `modelV2`、`runtimeSelectionState`、`edgeHitService` 这类额外翻译层命名。

## 10. 最终结论

P1 的本质不是“再给 query 多加几层 memo”，而是把三条错误的 owner 关系改正：

1. `selected / edit draft` 不是全局态直读问题，而是 keyed runtime read 问题。
2. `edge.idsInRect()` 不是 query 过滤问题，而是 engine 空间索引问题。
3. `selection.toolbar` 不是一个 getter 写得不够好，而是聚合层次没拆开。

所以 P1 的长期最优形态应当是：

- session 只存原始全局态
- query 只读已经按 key 投影好的 runtime map
- engine 只负责空间命中
- selection toolbar 只做最后轻组装

这样改完以后，P1 就会真正把 `query` 从“全局态扇出 + 热路径扫描 + 聚合大总装”收回到一个干净的读模型层。

# WHITEBOARD_EDITOR_PUSHDOWN_API_FINAL.zh-CN.md

## 目标

整理 `whiteboard/packages/whiteboard-editor` 内部所有仍可继续下沉到 `whiteboard/packages/whiteboard-editor-scene` 或 `whiteboard/packages/whiteboard-core` 的能力，尤其覆盖各种派生读取、helper、中转层、局部 projection。

本文只给：

- 最终边界
- 最终 API 设计
- 详细迁移清单

不讨论兼容层，不保留旧实现。

---

## 最终边界

`whiteboard-editor` 最终只保留 4 类东西：

- session 可变状态与 mutate
- boundary / task / publish orchestration
- write/action orchestration
- UI 语义组合

以下内容不允许继续留在 `whiteboard-editor`：

- 任何可由 scene state / scene index / scene render 直接推出的派生读
- 任何只是把 `query` / `stores` 再包装一层的 helper
- 任何纯算法 helper
- 任何 selection / edge / mindmap 的基础派生模型

最终归属原则：

- 依赖 scene graph、render、spatial、graph.state 的读取: 下沉到 `editor-scene`
- 纯算法、纯结构转换、纯 capability 判定: 下沉到 `whiteboard-core`
- 只和 UI 是否显示、交互模式、toolbar/panel 呈现有关的组合: 保留在 `whiteboard-editor`

---

## 最终 API 设计

## 1. `whiteboard-editor-scene`

### 1.1 复用现有读面，不再本地转发

以下能力已经存在，调用方必须直接使用，不再在 `whiteboard-editor` 包装：

```ts
query.document.get()
query.document.node(id)
query.document.edge(id)
query.document.bounds()
query.document.slice(input)

query.node.get(id)
query.node.idsInRect(rect, options)

query.edge.get(id)
query.edge.related(nodeIds)
query.edge.idsInRect(rect, options)
query.edge.connectCandidates(rect)

query.selection.move(target)
query.selection.bounds(target)

query.mindmap.get(id)
query.mindmap.resolve(value)
query.mindmap.structure(value)
query.mindmap.navigate(input)

query.group.get(id)
query.group.ofNode(nodeId)
query.group.ofEdge(edgeId)
query.group.target(groupId)
query.group.exact(target)

query.frame.point(point)
query.frame.rect(rect)
query.frame.pick(point, options)
query.frame.parent(nodeId, options)
query.frame.descendants(nodeIds)

query.hit.node(input)
query.hit.edge(input)
query.hit.item(input)

stores.graph.state.chrome
stores.graph.state.node.byId
stores.graph.state.edge.byId
stores.render.node.byId
stores.render.edge.statics
stores.render.edge.active
stores.render.edge.labels
stores.render.edge.masks
stores.render.chrome.scene
stores.render.chrome.edge
```

`whiteboard-editor` 里凡是重新包这些 API 的 helper，一律删除。

### 1.2 新增 `nodeCapability` runtime 基础输入

用途：

- 让 `editor-scene` 自己完成 selection summary / affordance 所需的 node transform 语义解析
- 消灭 `query.selection.summary(target, input)` 这类额外 callback 参数

API：

```ts
createEditorSceneRuntime({
  ...,
  nodeCapability: {
    meta(type: string): {
      key?: string
      name: string
      family: string
      icon: string
    }
    edit(type: string, field: string): {
      multiline?: boolean
    } | undefined
    capability(node: NodeModel): {
      role: import('@whiteboard/core/node').NodeRole
      resize: boolean
      rotate: boolean
      connect: boolean
    }
  }
})
```

规则：

- 这是 runtime 级一次性注入
- `editor-scene` 后续所有 selection / node capability 派生都直接复用它
- 不允许再把 capability 以 callback 形式散落到各个 query 上

### 1.3 新增 `query.selection.members`

用途：

- 替代 `session/projection/selection.ts` 里对 selected nodes / edges / primary node / primary edge 的本地投影

API：

```ts
query.selection.members(
  target: SelectionTarget
): {
  target: SelectionTarget
  key: string
  nodes: readonly NodeModel[]
  edges: readonly Edge[]
  primaryNode?: NodeModel
  primaryEdge?: Edge
}
```

规则：

- `target` 内不存在的 id 自动忽略
- `key` 由标准顺序的 `nodeIds` 与 `edgeIds` 构成
- `primaryNode` / `primaryEdge` 直接取 members 中第一项

### 1.4 新增 `query.selection.summary`

用途：

- 替代 `session/projection/selection.ts` 内基于 render/node/edge 的 selection summary 组装

API：

```ts
query.selection.summary(
  target: SelectionTarget
): import('@whiteboard/core/selection').SelectionSummary
```

规则：

- 内部直接复用：
  - `query.selection.members`
  - `stores.render.node.byId`
  - `query.edge.get(id)?.route.bounds`
- node transform behavior 直接来自 runtime 注入的 `nodeCapability.capability(node)`
- editor 不再自己拼 `readNodeRect` / `readEdgeBounds`

### 1.5 新增 `query.selection.affordance`

用途：

- 替代 `session/projection/selection.ts` 里 affordance 派生

API：

```ts
query.selection.affordance(
  target: SelectionTarget
): import('@whiteboard/core/selection').SelectionAffordance
```

规则：

- 内部直接基于 `query.selection.summary`
- node role / resize / rotate 直接来自 runtime 注入的 `nodeCapability.capability(node)`
- editor 不再保留 `createSessionSelectionProjection`

### 1.6 新增 `query.selection.selected`

用途：

- 替代 `createProjectedKeyedStore` 生成的 `node.selected` / `edge.selected`

API：

```ts
query.selection.selected: {
  node(target: SelectionTarget, nodeId: NodeId): boolean
  edge(target: SelectionTarget, edgeId: EdgeId): boolean
}
```

说明：

- 这是同步 query，不再单独在 editor 里维护 keyed store 投影
- 真正需要订阅的地方可以继续直接订阅 `session.selection`

### 1.7 新增 `query.edge.capability`

用途：

- 替代 `edge/read.ts` 的 `readEdgeCapability`
- 替代 `session/source.ts` 里 selected edge chrome 对 capability 的临时组装

API：

```ts
query.edge.capability(edgeId: EdgeId): import('@whiteboard/core/edge').EdgeCapability | undefined
```

规则：

- 内部读取 edge model 与关联 node locked
- capability 计算本身调用 `whiteboard-core/edge`

### 1.8 新增 `query.edge.editable`

用途：

- 替代 `readEditableEdgeView`

API：

```ts
query.edge.editable(edgeId: EdgeId): EdgeView | undefined
```

规则：

- 等价于 `query.edge.get(edgeId)` + `query.edge.capability(edgeId)?.editRoute`

### 1.9 新增 `query.edge.routePoints`

用途：

- 替代 `session/edge.ts` 的 `readSelectedEdgeRoutePoints`

API：

```ts
query.edge.routePoints(input: {
  edgeId: EdgeId
  activeRouteIndex?: number
}): readonly import('@whiteboard/core/edge').EdgeRoutePoint[]
```

规则：

- 内部读取：
  - `query.edge.get(edgeId)?.base.edge`
  - `query.edge.get(edgeId)?.route.handles`
- route point 纯转换调用 `whiteboard-core/edge`

### 1.10 新增 `query.edge.box`

用途：

- 替代 `session/edge.ts` 的 `readEdgeBox`

API：

```ts
query.edge.box(edgeId: EdgeId): {
  rect: Rect
  pad: number
} | undefined
```

规则：

- 内部读取 `query.edge.get(edgeId)?.route.bounds`
- 计算逻辑调用 `whiteboard-core/edge`

### 1.11 新增 `query.edge.chrome`

用途：

- 替代 `session/source.ts` 里 selected edge chrome 的整段组装

API：

```ts
query.edge.chrome(input: {
  edgeId: EdgeId
  activeRouteIndex?: number
  tool: {
    type: string
  }
  interaction: {
    chrome: boolean
    editingEdge: boolean
  }
  edit: import('@whiteboard/editor-scene').EditSession | null
}): {
  edgeId: EdgeId
  ends: import('@whiteboard/core/edge').ResolvedEdgeEnds
  canReconnectSource: boolean
  canReconnectTarget: boolean
  canEditRoute: boolean
  showEditHandles: boolean
  routePoints: readonly import('@whiteboard/core/edge').EdgeRoutePoint[]
} | undefined
```

规则：

- geometry / ends / handles / capability 都由 scene query 直接读取
- `showEditHandles` 的显示语义仍在 scene query 内完成
- editor 不再维护 `SelectedEdgeChrome` 本地投影逻辑

### 1.12 新增 `query.mindmap.ofNodes`

用途：

- 替代 `action/index.ts` 的 `readMindmapIdForNodes`

API：

```ts
query.mindmap.ofNodes(
  nodeIds: readonly NodeId[]
): MindmapId | undefined
```

规则：

- 所有 node 同属一个 mindmap 时返回该 id
- 否则返回 `undefined`
- 内部直接复用 scene owner/index，不再读 document fallback

### 1.13 新增 `query.mindmap.addChildTargets`

用途：

- 替代 `session/presentation/mindmapChrome.ts` + `session/source.ts` 组合

API：

```ts
query.mindmap.addChildTargets(input: {
  mindmapId: MindmapId
  selection: SelectionTarget
  edit: import('@whiteboard/editor-scene').EditSession | null
}): readonly {
  targetNodeId: NodeId
  x: number
  y: number
  placement: 'left' | 'right'
}[]
```

规则：

- 内部读取：
  - `query.mindmap.structure`
  - `query.node.get(nodeId)?.base.node.locked`
  - `query.node.get(nodeId)?.geometry.rect`
- 最终坐标计算调用 `whiteboard-core/mindmap`

### 1.14 新增 `query.view`

用途：

- 统一替代 editor 当前分裂的 `visibleRect` / `readZoom`

API：

```ts
query.view: {
  visible(rect: Rect, options?: Parameters<Query['spatial']['rect']>[1]): ReturnType<Query['spatial']['rect']>
  pick(input: {
    point: Point
    zoom: number
    radius?: number
    kinds?: readonly ('node' | 'edge' | 'mindmap' | 'group')[]
    exclude?: Partial<{
      node: readonly NodeId[]
      edge: readonly EdgeId[]
      mindmap: readonly MindmapId[]
      group: readonly GroupId[]
    }>
  }): {
    rect: Rect
    target?: {
      kind: 'node'
      id: NodeId
    } | {
      kind: 'edge'
      id: EdgeId
    } | {
      kind: 'mindmap'
      id: MindmapId
    } | {
      kind: 'group'
      id: GroupId
    }
    stats: {
      cells: number
      candidates: number
      oversized: number
      hits: number
      latency: number
    }
  }
}
```

说明：

- `frame-throttled` runtime 仍可保留在 editor host
- 但真正的 visible/pick 解析统一挂到 `query.view`
- editor 不再保留独立的 `scene/host/visible.ts` / `scene/host/pick.ts` 解析 helper

## 2. `whiteboard-core`

### 2.1 新增 `selection.members`

用途：

- 替代 editor 本地 `readSelectedEdgeId` 这类单选判断继续散落

API：

```ts
selection.members: {
  singleNode(target: SelectionTarget): NodeId | undefined
  singleEdge(target: SelectionTarget): EdgeId | undefined
}
```

### 2.2 新增 `selection.derive.nodeStats`

用途：

- 替代 `session/panel.ts` 的 `readSelectionNodeStats`

API：

```ts
selection.derive.nodeStats(input: {
  summary: import('@whiteboard/core/selection').SelectionSummary
  resolveNodeMeta(node: NodeModel): {
    key: string
    name: string
    family: string
    icon: string
  }
}): {
  ids: readonly NodeId[]
  count: number
  hasGroup: boolean
  lock: 'none' | 'mixed' | 'all'
  types: readonly {
    key: string
    name: string
    family: string
    icon: string
    count: number
    nodeIds: readonly NodeId[]
  }[]
}
```

说明：

- node meta 仍由 editor node registry 提供
- 统计逻辑本身必须从 editor 本地移走

### 2.3 新增 `selection.derive.edgeStats`

用途：

- 替代 `session/panel.ts` 的 `readSelectionEdgeStats`

API：

```ts
selection.derive.edgeStats(
  summary: import('@whiteboard/core/selection').SelectionSummary
): {
  ids: readonly EdgeId[]
  count: number
  types: readonly {
    key: string
    name: string
    count: number
    edgeIds: readonly EdgeId[]
    edgeType?: string
  }[]
}
```

### 2.4 新增 `edge.capability`

用途：

- 替代 `edge/read.ts` 的 `resolveEdgeCapability`

API：

```ts
edge.capability(input: {
  edge: Edge
  readNodeLocked(nodeId: NodeId): boolean
}): {
  move: boolean
  reconnectSource: boolean
  reconnectTarget: boolean
  editRoute: boolean
  editLabel: boolean
}
```

### 2.5 新增 `edge.routePoints`

用途：

- 替代 `session/edge.ts` 的 handle -> route point 转换

API：

```ts
edge.routePoints(input: {
  edgeId: EdgeId
  edge: Edge
  handles: readonly import('@whiteboard/core/types/edge').EdgeHandle[]
  activeRouteIndex?: number
}): readonly {
  key: string
  kind: 'anchor' | 'insert' | 'control'
  edgeId: EdgeId
  point: Point
  active: boolean
  deletable: boolean
  pick:
    | {
        kind: 'anchor'
        index: number
      }
    | {
        kind: 'segment'
        insertIndex: number
        segmentIndex: number
        axis: 'x' | 'y'
      }
}[]
```

### 2.6 新增 `edge.box`

用途：

- 替代 `session/edge.ts` 的 `readEdgeBox`

API：

```ts
edge.box(input: {
  rect?: Rect
  edge?: Edge
}): {
  rect: Rect
  pad: number
} | undefined
```

### 2.7 新增 `mindmap.addChildTargets`

用途：

- 替代 `session/presentation/mindmapChrome.ts` 的最终坐标算法

API：

```ts
mindmap.addChildTargets(input: {
  structure: import('@whiteboard/core/mindmap').MindmapStructure
  nodeId: NodeId
  rect: Rect
}): readonly {
  targetNodeId: NodeId
  x: number
  y: number
  placement: 'left' | 'right'
}[]
```

说明：

- 只保留纯布局算法
- selection / edit / locked 判断不进入 core

### 2.8 新增 `mindmap.insert`

用途：

- 替代 `procedures/mindmap.ts` 里的相对插入推导 helper

API：

```ts
mindmap.insert: {
  resolveSide(input: {
    structure: import('@whiteboard/core/mindmap').MindmapStructure
    targetNodeId: MindmapNodeId
    side?: 'left' | 'right'
  }): 'left' | 'right'
  buildRelative(input: {
    structure: import('@whiteboard/core/mindmap').MindmapStructure
    targetNodeId: MindmapNodeId
    relation: 'child' | 'sibling' | 'parent'
    side?: 'left' | 'right'
    payload?: MindmapTopicData
  }): MindmapInsertInput | undefined
}
```

### 2.9 新增 `mindmap.topicStyle`

用途：

- 替代 `action/index.ts` 里 mindmap topic style patch 的现场拼装

API：

```ts
mindmap.topicStyle.toNodeStylePatch(input: {
  frameKind?: string
  fill?: string
  stroke?: string
  strokeWidth?: number
}): Partial<NodeStyle>
```

---

## 保留在 `whiteboard-editor` 的内容

以下能力不下沉：

- `session/runtime.ts`
- `session/viewport.ts`
- `session/edit.ts`
- `session/interaction.ts`
- `boundary/*`
- `write/*`
- `tool service`
- `toolbar / overlay / panel 是否显示`
- `frame-throttled` 调度本身
- 基于业务交互语义的 action orchestration

但这些本地代码只允许做组合，不允许再承载基础派生读。

---

## 迁移清单

## P0. 直接删除本地转发层

### `whiteboard-editor/src/scene/source.ts`

- 删除 `visibleRect` / `readZoom` 参数
- 改为直接依赖 `query.view`
- 删除 `scene/host/*` 风格的局部解析逻辑

### `whiteboard-editor/src/editor/createEditor.ts`

- 不再传 `visibleRect` / `readZoom`
- 只传 host 级最小 `SceneViewRead`
- scene visible / pick 直接走 `query.view`

### `whiteboard-editor/src/session/read.ts`

- 只保留 session mutable state read
- 不允许继续扩 scene/query 转发

## P1. 删除 selection projection 本地层

### `whiteboard-editor/src/session/projection/selection.ts`

- 删除整个文件
- 迁移到：
  - `editor-scene.query.selection.members`
  - `editor-scene.query.selection.summary`
  - `editor-scene.query.selection.affordance`
  - `editor-scene.query.selection.selected`

### `whiteboard-editor/src/session/source.ts`

- 删除：
  - `selectionProjection`
  - `selectionMembers`
  - `selectionSummary`
  - `selectionAffordance`
  - `selectionNodeSelected`
- 改为直接从 `graph.query.selection.*` 读取

## P2. 删除 edge 派生 helper 本地层

### `whiteboard-editor/src/edge/read.ts`

- 删除：
  - `resolveEdgeCapability`
  - `readEdgeModel`
  - `readEdgeCapability`
  - `readEditableEdgeView`
- 迁移到：
  - `whiteboard-core.edge.capability`
  - `editor-scene.query.edge.capability`
  - `editor-scene.query.edge.editable`

### `whiteboard-editor/src/session/edge.ts`

- 删除：
  - `readEdgeBox`
  - `readSelectedEdgeId`
  - `readSelectedEdgeRoutePoints`
  - 相等性 helper 之外的 route 编辑派生
- 迁移到：
  - `whiteboard-core.selection.members.singleEdge`
  - `whiteboard-core.edge.box`
  - `whiteboard-core.edge.routePoints`
  - `editor-scene.query.edge.box`
  - `editor-scene.query.edge.routePoints`
  - `editor-scene.query.edge.chrome`

### `whiteboard-editor/src/session/source.ts`

- 删除 selected edge chrome 的整段手工组装
- 改为：
  - `selection.members.singleEdge(target)`
  - `graph.query.edge.chrome(...)`

## P3. 删除 mindmap chrome / owner / insert helper 本地层

### `whiteboard-editor/src/session/presentation/mindmapChrome.ts`

- 删除整个文件
- 迁移到：
  - `whiteboard-core.mindmap.addChildTargets`
  - `editor-scene.query.mindmap.addChildTargets`

### `whiteboard-editor/src/action/index.ts`

- 删除 `readMindmapIdForNodes`
- 改为 `graph.query.mindmap.ofNodes(nodeIds)`

- 删除现场 topic style patch 组装
- 改为 `whiteboard-core.mindmap.topicStyle.toNodeStylePatch`

### `whiteboard-editor/src/procedures/mindmap.ts`

- 删除：
  - `readMindmapInsertSide`
  - `buildMindmapRelativeInsertInput`
- 改为：
  - `whiteboard-core.mindmap.insert.resolveSide`
  - `whiteboard-core.mindmap.insert.buildRelative`

保留：

- `buildMindmapEnterPreview`
- preview publish / animation scheduling

原因：

- 这是 editor runtime 的时序与动画问题，不是 core 或 scene 基础读

## P4. 删除 panel 基础统计 helper 本地层

### `whiteboard-editor/src/session/panel.ts`

- 删除：
  - `readSelectionNodeStats`
  - `readSelectionEdgeStats`
- 迁移到：
  - `whiteboard-core.selection.derive.nodeStats`
  - `whiteboard-core.selection.derive.edgeStats`

保留：

- `resolveSelectionOverlay`
- `resolveSelectionToolbar`
- `readNodeScope`
- `readEdgeScope`

原因：

- 这些仍然是 editor UI 语义组合
- 但内部必须直接消费 scene/core 的最终派生结果，不允许自己再回头读 graph 拼基础数据

## P5. 删除仍然只是 query 包装的 action helper

### `whiteboard-editor/src/action/selection.ts`

- 继续保留 selection action orchestration
- 删除任何仅为 query 做中转的 helper
- 直接使用：
  - `graph.query.group.exact`
  - `graph.query.selection.bounds`
  - `graph.query.mindmap.ofNodes`

## P6. `session/source.ts` 最终收敛

### 必须删除的本地派生

- 基于 scene graph 再次拼 selection members
- 基于 render node / edge 再次拼 selection summary
- 基于 edge route / edge state 再次拼 edge chrome
- 基于 structure / node rect / lock 再次拼 mindmap add-child targets

### 最终只保留

- panel / toolbar / overlay 的 UI 语义组合
- marquee worldRect -> screenRect 投影
- draw preview / snap guide / chrome 可见性组合
- session state 对外 source 装配

---

## 删除清单

完成后必须删除以下本地实现：

- `whiteboard-editor/src/session/projection/selection.ts`
- `whiteboard-editor/src/session/presentation/mindmapChrome.ts`
- `whiteboard-editor/src/edge/read.ts` 里所有基础派生 helper
- `whiteboard-editor/src/session/edge.ts` 里所有 route/capability/box 基础派生 helper
- `whiteboard-editor/src/session/panel.ts` 里所有基础统计 helper
- `whiteboard-editor/src/scene/host/*` 风格的 visible / pick 解析 helper

---

## 最终结果

完成后整条链应收敛为：

- `whiteboard-core`
  - capability
  - stats
  - pure geometry/model transform
  - pure mindmap insert/layout algorithm

- `whiteboard-editor-scene`
  - document / graph / render / state 统一读面
  - selection / edge / mindmap 基础派生 query
  - view visible/pick query

- `whiteboard-editor`
  - session mutate
  - action/write orchestration
  - panel/toolbar/overlay 呈现语义
  - host scheduling

这样 editor 不再承担基础读模型的二次 construction，派生重灾区会从本地 helper 堆里彻底清掉。

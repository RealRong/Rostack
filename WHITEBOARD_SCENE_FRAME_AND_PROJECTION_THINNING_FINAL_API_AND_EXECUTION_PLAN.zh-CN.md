# Whiteboard Scene Frame 与 Projection 精简最终 API 与实施方案

## 约束

- 不保留兼容层。
- 不保留两套 reader / runtime facts / projection read path。
- 不把问题重新推回局部 helper。
- 不牺牲精准增量通知性能。
- 文档只定义最终态，不讨论过渡 API。

## 结论

当前 whiteboard 的核心问题不是 `readXxx`、`patchXxx` 数量多，而是缺少一个真正覆盖 projection 整帧状态的统一中轴。

现有 [document/reader.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/document/reader.ts) 只解决 committed `Document` 的读取，不解决以下内容：

- working graph
- indexes
- spatial
- runtime session
- runtime delta facts
- derived ui / render

因此现在才会在这些位置继续长出第二层解释：

- [projection/input.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/projection/input.ts)
- [projection/plan.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/projection/plan.ts)
- [projection/query/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/projection/query/index.ts)
- [model/graph/node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/model/graph/node.ts)
- [model/render/context.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/model/render/context.ts)

最终必须收敛为：

1. 一个统一 `SceneFrame`
2. 一套 runtime facts
3. 三类正式 phase writer

也就是：

- `patchGraphState`
- `patchUiState`
- `patchRenderState`

`document` reader 继续保留，但它只是 `SceneFrame.document` 的一个子能力，不再冒充整条 projection 链的统一 reader。

## 第一部分：最终 API 设计

## 1. 顶层模型

最终 projection 只保留一个正式读取面：

```ts
interface SceneFrame {
  revision(): Revision

  delta: {
    document: MutationDelta
    runtime: SceneRuntimeDelta
  }

  document: DocumentFrame
  runtime: RuntimeFrame
  scene: SceneProjectionFrame
}
```

规则固定为：

- 所有 planner / query / patch 都只吃 `SceneFrame`
- 不再直接把 `working.state()`、`input.runtime`、`documentApi.reader()` 混着传
- 不再在不同 phase 里各自重新拼 active / touched / preview / owner / descendants
- 顶层一级概念只保留 `document / runtime / scene`
- `index / spatial / derived` 不再作为一级概念公开暴露

## 2. `SceneFrame.document`

`document` 只负责 committed document 读取：

```ts
interface DocumentFrame {
  snapshot(): Document
  background(): Document['background'] | undefined

  node(id: NodeId): Node | undefined
  edge(id: EdgeId): Edge | undefined
  group(id: GroupId): Group | undefined
  mindmap(id: MindmapId): MindmapRecord | undefined

  nodeIds(): readonly NodeId[]
  edgeIds(): readonly EdgeId[]
  groupIds(): readonly GroupId[]
  mindmapIds(): readonly MindmapId[]

  canvas: {
    order(): readonly CanvasItemRef[]
    slot(ref: CanvasItemRef): {
      prev?: CanvasItemRef
      next?: CanvasItemRef
    } | undefined
    groupRefs(groupId: GroupId): readonly CanvasItemRef[]
  }
}
```

这里保留 `createDocumentReader` 的价值，但不再让外部误以为它已经覆盖 graph/runtime/projection。

## 3. `SceneFrame.runtime`

这是当前最缺的部分。最终必须成为 runtime 中轴，而不是继续在 [projection/input.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/projection/input.ts) 和 [projection/plan.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/projection/plan.ts) 里重复推导。

```ts
interface RuntimeFrame {
  session: {
    tool(): Tool
    selection(): SelectionTarget
    hover(): HoverState
    edit(): EditSession | null
    interaction(): InteractionSnapshot
    preview(): PreviewSnapshot
  }

  facts: {
    touchedNodeIds(): ReadonlySet<NodeId>
    touchedEdgeIds(): ReadonlySet<EdgeId>
    touchedMindmapIds(): ReadonlySet<MindmapId>

    activeEdgeIds(): ReadonlySet<EdgeId>

    uiChanged(): boolean
    overlayChanged(): boolean
    chromeChanged(): boolean
  }
}
```

最终要求：

- `readEditedEdgeIds`
- `readPreviewNodeIds`
- `readPreviewEdgeIds`
- `readPreviewMindmapIds`
- `readRuntimeTouch`
- `readActiveEdgeIds`

都不再以 helper 形式存在于 planner / render context / input adapter。

这些语义直接成为 `runtime.facts` 的正式能力。

## 4. `SceneFrame.scene`

`scene` 是 projection 当前真值层。它统一承载：

- graph entity view
- index 读法
- spatial 查询
- 所有高层 query

```ts
interface SceneProjectionFrame {
  node(id: NodeId): NodeView | undefined
  edge(id: EdgeId): EdgeView | undefined
  mindmap(id: MindmapId): MindmapView | undefined
  group(id: GroupId): GroupView | undefined

  nodes(): IterableIterator<[NodeId, NodeView]>
  edges(): IterableIterator<[EdgeId, EdgeView]>
  mindmaps(): IterableIterator<[MindmapId, MindmapView]>
  groups(): IterableIterator<[GroupId, GroupView]>

  query: SceneQueryFrame
}
```

最终规则：

- render / hit / selection / snap / frame / edge connect 不再回退到 raw document 解析几何
- `readProjectedNodeRect`、`readProjectedNodeSize`、`readProjectedNodeRotation` 这类 helper 不再作为游离 API 存在
- node / edge / mindmap / group 的最终读取一律以对应 view 为准

## 5. `SceneFrame.scene.query`

面向 selection / frame / hit / bounds / view 这种高层读法，最终统一挂到 `scene.query`，而不是继续 `createSelectionRead / createFrameRead / createHitRead / createViewRead` 并列各自读 `state()`：

```ts
interface SceneQueryFrame {
  relatedEdgeIds(nodeIds: Iterable<NodeId>): readonly EdgeId[]
  descendants(nodeIds: readonly NodeId[]): readonly NodeId[]
  mindmapStructure(value: MindmapId | NodeId | string): {
    id: MindmapId
    rootId: NodeId
    nodeIds: readonly NodeId[]
    tree: MindmapTree
  } | undefined

  selection: {
    members(target: SelectionTarget): SelectionMembersView
    summary(target: SelectionTarget): SelectionSummary
    affordance(target: SelectionTarget): SelectionAffordance
    move(target: SelectionTarget): {
      nodes: readonly SpatialNode[]
      edges: readonly Edge[]
    }
    bounds(target: SelectionTarget): Rect | undefined
  }

  frame: {
    point(point: Point): readonly NodeId[]
    rect(rect: Rect): readonly NodeId[]
    pick(point: Point, options?: { excludeIds?: readonly NodeId[] }): NodeId | undefined
    parent(nodeId: NodeId, options?: { excludeIds?: readonly NodeId[] }): NodeId | undefined
  }

  hit: HitFrame
  bounds: BoundsFrame
  view: ViewFrame
  chrome: ChromeFrame
}
```

这类高层读法仍然可以按模块拆文件实现，但它们的输入只能是 `SceneFrame`，不能再直接各自摸 `state().graph / state().indexes / spatial / runtime.view`。

最终必须移除这类游离 helper 的外部直连地位：

- `readRelatedEdgeIds`
- `readMindmapId`
- `readMindmapStructure`
- `readTreeDescendants`

它们可以保留为 `scene.query` 的内部实现细节，但不能再作为业务层常规入口。

`spatial` 仍然存在，但只作为 `scene.query` 的内部依赖，不再升级为一级概念。

## 6. phase writer 最终形态

顶层正式 phase writer 只保留：

```ts
patchGraphState(input): number
patchUiState(input): number
patchRenderState(input): number
```

其中：

- `graph`
  - patch index
  - patch graph vm
  - 产出 graph phase delta
- `ui`
  - 基于 graph + runtime facts patch ui vm
  - 产出 ui phase delta
- `render`
  - 基于 graph + ui + runtime facts patch render vm

`spatial`、`items` 仍然可以是 projection phase，但它们应被视为底层 state write，不再额外制造一套业务解释层。

## 7. `shared/projection` 与中轴的最终分工

`shared/projection` 与这次收敛有关联，但不负责定义 `SceneFrame`。

最终分工固定为：

### 7.1 `shared/projection` 负责

- phase 调度
- revision / trace / dirty 基础设施
- store sync
- 通用 apply 内核

### 7.2 `shared/projection` 不负责

- `SceneFrame`
- `runtime.facts`
- `scene.query`
- whiteboard 的 owner / descendants / active / overlay / chrome 语义

规则固定为：

- `shared/projection` 只解决“怎么跑”和“怎么同步”
- `whiteboard-editor-scene` 自己定义“读什么”和“建什么”

## 8. `patchXxx` 的保留与删除原则

### 9.1 应保留

以下 `patchXxx` 是正式 phase writer 或实体 writer，应该保留：

- `patchGraphState`
- `patchUiState`
- `patchRenderState`
- `patchSpatial`
- `patchItemsState`
- `patchNode`
- `patchEdge`
- `patchMindmap`
- `patchGroup`

### 9.2 应下沉

以下不应长期停留在 whiteboard domain 层：

- `patchValue`
- `patchFamilyReset`
- `patchFamilyTouched`
- `patchGraphEntity`

原因：

- 它们不是 whiteboard 业务语义
- 它们是通用 projection family/value apply 模式
- 继续留在 domain 层只会鼓励每个模块再包一层自己的 patch helper

长期最优是二选一：

1. 下沉到 `shared/projection`
2. 下沉到 `whiteboard-editor-scene/model/store/apply.ts` 作为唯一底层 apply 内核

但无论落在哪，都不应继续分散在 `render/family.ts`、`graph/entity.ts` 这种半业务半基础设施的位置。

### 9.3 应删除

以下属于“缺 frame 所以二次解释”的 helper，最终应删除：

- `projection/input.ts` 里的 `readPreviewXxx` / `readEditedEdgeIds`
- `projection/plan.ts` 里的 `readRuntimeTouch` / `readGraphTouch`
- `render/context.ts` 里的 `readActiveEdgeIds`
- `graph/node.ts` 里对外暴露的 `readProjectedNodeXxx`

## 9. helper 分类最终规则

最终只允许两类 helper：

1. 算法内部局部函数
2. 基础设施级通用 apply / codec / equality

以下类型不再接受：

- 用来替代 frame 的自由 `readXxx`
- 用来替代 runtime facts 的自由 `readXxx`
- 用来替代正式 store apply 层的半抽象 `patchXxx`
- query / planner / writer 各自重复拼同一份 touched / active / owner / descendants

## 第二部分：实施方案

## Phase 1：建立 `SceneFrame`

目标：

- 在 `whiteboard-editor-scene` 内建立正式 `SceneFrame`
- `createProjectionRead` 改为产出 `SceneFrame`
- `DocumentReader` 收编为 `frame.document`

落地：

- 新增 `frame` 目录或 `projection/frame.ts`
- 合并当前 `source / document / graph / index / spatial / runtime / query` 的读路径
- 对外只暴露一个中轴对象

完成标准：

- 业务代码不再需要同时拿 `source + graph + index + document + state`
- 顶层正式读取口只剩 `document / runtime / scene`

## Phase 2：runtime facts 收口

目标：

- 删除 runtime touched / active 的重复推导

落地：

- 把 [projection/input.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/projection/input.ts) 里的 preview/edit/hover/selection 推导收口为 `runtime.facts`
- planner、render context、ui context 统一读取 `frame.runtime.facts`

完成标准：

- `readEditedEdgeIds`
- `readPreviewNodeIds`
- `readPreviewEdgeIds`
- `readPreviewMindmapIds`
- `readRuntimeTouch`
- 重复的 `readActiveEdgeIds`

全部消失。

## Phase 3：index helper 收口

目标：

- 把 `model/index/read.ts` 从“对外 helper 集”改成 `frame.index` 的内部实现

落地：

- query / planner / graph queue 改为只走 `scene.query`
- mindmap resolve / structure / descendants / relatedEdgeIds 全部经 `scene.query`

完成标准：

- 外层不再直接 import `model/index/read.ts`

## Phase 4：derived read 收口

目标：

- 把 `createSelectionRead / createFrameRead / createHitRead / createViewRead / createChromeRead / createBoundsRead` 统一成 `scene.query.*`

落地：

- 保留模块文件可以，但签名统一改成只吃 `SceneFrame`
- 删除各模块对 `state()` 的自由读取

完成标准：

- query 层不再是“多个 read builder 并列拼装”
- query 层变成 `scene.query` 命名空间

## Phase 5：graph 实体 frame 化

目标：

- 删除对外游离的 `readProjectedNodeXxx` / `readEdgeEntry` 这类二次解释函数

落地：

- 引入规范化 graph entity frame
- `patchNode / patchEdge / patchMindmap / patchGroup` 直接 build 最终 view
- 下游只读 view，不再读 entry + 局部 projection helper

完成标准：

- graph entity 的正式读取只剩 view

## Phase 6：patch apply 下沉

目标：

- 把通用 family/value patch 模式从 domain 层剥离

落地：

- `patchValue`
- `patchFamilyReset`
- `patchFamilyTouched`
- `patchGraphEntity`

统一下沉到一个基础设施位置，优先是 `shared/projection`。

完成标准：

- whiteboard domain 只保留 phase coordinator 和 entity builder
- 不再自己定义第二套“通用 patch 框架”

## Phase 7：phase 文件只保留 orchestration

目标：

- `patchGraphState / patchUiState / patchRenderState` 只承担流程编排

落地：

- context 只做一次性预计算
- queue/fanout/index patch/graph patch/render patch 各自落位
- phase 文件不再包含局部 read helper、局部 diff helper、局部 state 拼装

完成标准：

- phase 文件可以直接回答“这一阶段做什么”
- 不能再回答“这一阶段顺便补了哪套 reader”

## 最终验收标准

达到以下状态才算完成：

- `DocumentReader` 不再被当作 projection 全链路 reader
- `SceneFrame` 成为唯一正式读取中轴
- 顶层概念收敛为 `document / runtime / scene`
- runtime touched / active / preview / edit 不再被多处重复解释
- index / spatial / derived 不再作为一级概念暴露
- scene 级 query 成为唯一高层读法命名空间
- graph 实体不再通过 `readProjectedXxx` 暴露中间态
- 通用 family/value patch 模式下沉到 `shared/projection` 或唯一 apply 内核
- whiteboard domain 层只保留 phase orchestration 与 entity build

## 一句话总结

最终最优解不是“把 `readXxx` 全部改名”，也不是“把 `patchXxx` 再拆更多文件”，而是：

- 用一个真正的 `SceneFrame` 统一读路径
- 用一套 `runtime.facts` 统一 touched / active 语义
- 把顶层概念压缩到 `document / runtime / scene`
- 把通用 patch apply 下沉到 `shared/projection`

这样之后，whiteboard projection 层才能真的只剩流程编排，而不是继续在不同 phase 里重复解释同一份状态。

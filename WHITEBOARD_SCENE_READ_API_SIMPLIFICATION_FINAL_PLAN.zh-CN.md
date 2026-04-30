# Whiteboard Scene Read API 精简最终方案

## 约束

- 不保留兼容层。
- 不继续保留 `query.scene.query.*` 这种多层穿透读法。
- 不用局部 helper 掩盖 API 结构问题。
- 不牺牲增量更新、精准通知和热路径读取性能。
- 文档只定义最终态与实施方案，不讨论过渡 API。

## 结论

当前真正重要的不是单独的 `SceneQuery`，而是整个 `scene` 读取面。

现状的问题是：

- `Query` 顶层已经有 `scene`
- `SceneProjectionQuery` 下面又挂了一个泛名 `query`
- 调用方最终写成 `query.scene.query.mindmap.structure(...)`

这说明抽象边界仍然按“内部实现层”在暴露，而不是按“调用方语义”在暴露。

`SceneProjectionQuery` 里真正重要的是：

1. 一份统一的 scene read surface
2. graph entity 读取
3. scene domain 语义读取

`SceneQuery` 本身并不是最终应该被强调的概念。  
它只是当前把“非实体读取”塞进一个二级对象后的产物。

如果继续保留 `scene.query`：

- 业务侧会长期出现 `query.scene.query.*`
- `EditorHostDeps` 会继续通过 `Pick<...['projection']['query']['scene']['query']...>` 传类型
- 会继续长出 `readEditableEdgeView` 这种“为了适配 awkward API 而存在”的 helper

最终最优不是继续打磨 `SceneQuery`，而是删掉 `scene.query` 这一层，把 scene 的正式能力直接按语义分组挂在 `scene` 上。

## 一、当前主要问题

## 1. `scene.query` 是多余的一层

当前外部调用大量出现：

- `input.graph.query.scene.query.mindmap.structure(...)`
- `ctx.projection.query.scene.query.selection.move(...)`
- `ctx.projection.query.scene.query.edge.capability(...)`

这层 `query` 不提供新的语义，只是把“高层读取”再包了一层。

结果是：

- API 名字重复
- 路径过长
- 上层难以建立稳定的 mental model

## 2. scene 的能力是按“实现类别”分裂的，不是按“对象语义”组织的

当前 scene 下分成两块：

- `scene.node / edge / mindmap / group`
- `scene.query.node / edge / mindmap / group / selection / frame / hit / viewport / overlay`

这会带来一个明显问题：

- 读一个 `mindmap` 的实体，用 `scene.mindmap(id)`
- 读一个 `mindmap` 的结构，用 `scene.query.mindmap.structure(id)`

也就是同一 subject 被拆到两层。

这不是自然模型。

## 3. `EditorSceneApi.query` 命名本身也在放大穿透

当前 editor 侧拿到的是：

```ts
input.projection.query.scene.query.edge.capability(edgeId)
```

这里同时有三层泛名：

- `projection`
- `query`
- `query`

这不是可长期维护的命名。

## 4. `EditorHostDeps` 太宽，`Pick<>` 路径太深

现在大量类型写法类似：

```ts
Pick<EditorHostDeps['projection']['query']['scene'], 'edge'>['edge']
Pick<EditorHostDeps['projection']['query']['scene']['query']['edge'], 'editable'>['editable']
```

这说明：

- feature 输入边界不清晰
- 上层没有拿到“短而稳定的正式 port”
- 类型系统被迫替代 API 设计来拼装上下文

这不是类型定义问题，而是公开输入面不够干净。

## 5. `readEditableEdgeView` 这一类 helper 说明 scene port 仍然不直观

例如当前：

```ts
const readEditableEdgeView = (
  input: {
    readView: ...
    editable?: ...
  },
  edgeId: EdgeId
) => input.editable?.(edgeId) ?? input.readView(edgeId)
```

这个 helper 做的其实只是：

- 先读 editable edge
- 再退回普通 edge view

如果 scene API 本身足够自然，这种 helper 应该不存在，或者至多只剩业务内联：

```ts
const view = scene.edges.editable(edgeId) ?? scene.edges.get(edgeId)
```

helper 之所以长出来，不是因为逻辑复杂，而是因为 API 路径和输入类型太 awkward。

## 6. `mindmapStructure` 与 `mindmap.structure` 并存，语义重复

当前同时存在：

- `scene.query.mindmapStructure(value)`
- `scene.query.mindmap.structure(value)`

这代表语义有重复入口。

最终必须只保留一条正式路径。

最自然的保留方式是：

- `scene.mindmaps.structure(value)`

## 7. `spatial` 作为公开一级子能力仍然偏厚

`spatial` 更像是 scene 的底层索引能力，不是绝大多数业务的目标语义。

公开暴露 `scene.query.spatial.*` 并不总是错，但最终应满足：

- 大多数业务只读 `nodes / edges / selection / frame / hit / viewport`
- 只有 host / pick / snap / 个别底层 feature 才碰 `spatial`

如果 `spatial` 到处被直接消费，说明 scene domain API 仍然不够完整。

## 8. `Frame / Read / 裸函数 / 底层 state` 命名混用

当前同一层公开面同时出现：

- `hit: HitFrame`
- `viewport: ViewportFrame`
- `overlay: OverlayFrame`
- `spatial: SpatialRead`
- `items(): State['items']`
- `snap(rect)`
- `bounds()`

这几种名字表达的不是同一维度：

- `Read` 表达“读取接口”
- `Frame` 表达“某一帧视图”
- 裸函数表达“顶层工具能力”
- `State['items']` 直接暴露底层存储形状

如果这些都混在 `scene` 同一层，调用方无法建立稳定的心智模型。

最终必须统一成一套规则：

- 顶层正式读取面使用 `*Read`
- `scene` 子能力不用 `Frame`，不用 `Read`
- `scene` 子能力只按 subject 命名
- 不直接透出 `State['items']` 这种底层类型
- 不在 `scene` 同一层混放太多裸函数

## 二、最终 API 设计

## 1. 删除 `SceneQuery`

最终不再保留：

```ts
interface SceneProjectionQuery {
  ...
  query: SceneQuery
}
```

改为把 scene 的正式能力直接展开在一个统一 `SceneRead` 上。

## 2. `Query` 重命名为 `EditorSceneRead`

`Query` 这个名字过于抽象，而且会制造 `query.scene.query`。

最终改为：

```ts
interface EditorSceneRead {
  revision(): Revision
  document: DocumentFrame
  runtime: RuntimeFrame
  scene: SceneRead
}
```

规则：

- editor-scene runtime 对外暴露 `read`
- 不再暴露一个叫 `query` 的顶层泛名对象

也就是：

```ts
interface EditorSceneApi {
  revision(): number
  read: EditorSceneRead
  stores: RuntimeStores
  host: ...
}
```

## 3. `scene` 改成按 subject 分组，并统一子能力命名

最终 `scene` 不再分成：

- entity read
- generic query namespace

而是直接按 subject 暴露。

```ts
interface SceneRead {
  nodes: SceneNodes
  edges: SceneEdges
  mindmaps: SceneMindmaps
  groups: SceneGroups
  selection: SceneSelection
  frame: SceneFrame
  hit: SceneHit
  viewport: SceneViewport
  overlay: SceneOverlay
  spatial: SceneSpatial
  items: SceneItems
  snap: SceneSnap
  bounds(): Rect | undefined
}

interface SceneNodes {
  get(id: NodeId): NodeView | undefined
  entries(): IterableIterator<[NodeId, NodeView]>
  idsInRect(rect: Rect, options?: NodeRectHitOptions): readonly NodeId[]
  descendants(nodeIds: readonly NodeId[]): readonly NodeId[]
  relatedEdgeIds(nodeIds: Iterable<NodeId>): readonly EdgeId[]
  owner(id: NodeId): OwnerRef | undefined
}

interface SceneEdges {
  get(id: EdgeId): EdgeView | undefined
  entries(): IterableIterator<[EdgeId, EdgeView]>
  idsInRect(rect: Rect, options?: {
    match?: 'touch' | 'contain'
  }): readonly EdgeId[]
  connectCandidates(rect: Rect): readonly EdgeConnectCandidate[]
  capability(id: EdgeId): EdgeCapability | undefined
  editable(id: EdgeId): EdgeView | undefined
  routePoints(input: {
    edgeId: EdgeId
    activeRouteIndex?: number
  }): readonly EdgeRoutePoint[]
  box(id: EdgeId): EdgeBox | undefined
  chrome(input: {
    edgeId: EdgeId
    activeRouteIndex?: number
    tool: {
      type: string
    }
    interaction: {
      chrome: boolean
      editingEdge: boolean
    }
    edit: EditSession | null
  }): EdgeChromeView | undefined
}

interface SceneMindmaps {
  get(id: MindmapId): MindmapView | undefined
  entries(): IterableIterator<[MindmapId, MindmapView]>
  id(value: MindmapId | NodeId | string): MindmapId | undefined
  structure(value: MindmapId | NodeId | string): MindmapStructureView | undefined
  ofNodes(nodeIds: readonly NodeId[]): MindmapId | undefined
  addChildTargets(input: {
    mindmapId: MindmapId
    selection: SelectionTarget
    edit: EditSession | null
  }): readonly MindmapAddChildTarget[]
  navigate(input: {
    id: MindmapId
    fromNodeId: NodeId
    direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
  }): NodeId | undefined
}

interface SceneGroups {
  get(id: GroupId): GroupView | undefined
  entries(): IterableIterator<[GroupId, GroupView]>
  ofNode(nodeId: NodeId): GroupId | undefined
  ofEdge(edgeId: EdgeId): GroupId | undefined
  target(groupId: GroupId): SelectionTarget | undefined
  exact(target: SelectionTarget): readonly GroupId[]
}

interface SceneSelection {
  members(target: SelectionTarget): SelectionMembersView
  summary(target: SelectionTarget): SelectionSummary
  affordance(target: SelectionTarget): SelectionAffordance
  selected: {
    node(target: SelectionTarget, nodeId: NodeId): boolean
    edge(target: SelectionTarget, edgeId: EdgeId): boolean
  }
  move(target: SelectionTarget): {
    nodes: readonly Node[]
    edges: readonly Edge[]
  }
  bounds(target: SelectionTarget): Rect | undefined
}

interface SceneFrame {
  point(point: Point): readonly NodeId[]
  rect(rect: Rect): readonly NodeId[]
  pick(point: Point, options?: {
    excludeIds?: readonly NodeId[]
  }): NodeId | undefined
  parent(nodeId: NodeId, options?: {
    excludeIds?: readonly NodeId[]
  }): NodeId | undefined
}

interface SceneHit {
  node(input: {
    point: Point
    threshold?: number
    excludeIds?: readonly NodeId[]
  }): NodeId | undefined
  edge(input: {
    point: Point
    threshold?: number
    excludeIds?: readonly EdgeId[]
  }): EdgeId | undefined
  item(input: {
    point: Point
    threshold?: number
    kinds?: readonly ('node' | 'edge' | 'mindmap' | 'group')[]
    exclude?: Partial<{
      node: readonly NodeId[]
      edge: readonly EdgeId[]
      mindmap: readonly MindmapId[]
      group: readonly GroupId[]
    }>
  }): SceneHitItem | undefined
}

interface SceneViewport {
  zoom(): number
  center(): Point
  worldRect(): Rect
  screenPoint(point: Point): Point
  screenRect(rect: Rect): Rect
  background(): SceneBackgroundView
  visible(options?: Parameters<SpatialRead['rect']>[1]): ReturnType<SpatialRead['rect']>
  pick(input: {
    point: Point
    radius?: number
    kinds?: readonly ('node' | 'edge' | 'mindmap' | 'group')[]
    exclude?: Partial<{
      node: readonly NodeId[]
      edge: readonly EdgeId[]
      mindmap: readonly MindmapId[]
      group: readonly GroupId[]
    }>
  }): SceneViewportPick
}

interface SceneOverlay {
  marquee(): {
    rect: Rect
    match: SelectionMarqueeMatch
  } | undefined
  draw(): DrawPreview | null
  guides(): readonly Guide[]
  edgeGuide(): EdgeGuidePreview | undefined
}

interface SceneSnap {
  candidates(rect: Rect): readonly SnapCandidate[]
}

interface SceneSpatial extends SpatialRead {}

interface SceneItems {
  all(): State['items']
}
```

规则固定为：

- `EditorSceneRead` 是顶层 read
- `SceneRead` 是 scene 根对象
- `SceneRead` 下不用 `*Read`
- `SceneRead` 下不用 `*Frame`
- `SceneRead` 下只保留 subject 名字

因此最终不再接受这类混用：

```ts
hit: HitFrame
viewport: ViewportFrame
overlay: OverlayFrame
spatial: SpatialRead
items(): State['items']
snap(rect)
bounds()
```

而统一为：

```ts
scene.hit
scene.viewport
scene.overlay
scene.spatial
scene.items
scene.snap
scene.bounds()
```

具体展开如下：

```ts
interface SceneRead {
  nodes: SceneNodes
  edges: SceneEdges
  mindmaps: SceneMindmaps
  groups: SceneGroups
  selection: SceneSelection
  frame: SceneFrame
  hit: SceneHit
  viewport: SceneViewport
  overlay: SceneOverlay
  spatial: SceneSpatial
  items: SceneItems
  snap: SceneSnap
  bounds(): Rect | undefined
}
```

调用路径将变成：

```ts
scene.mindmaps.structure(id)
scene.edges.capability(edgeId)
scene.nodes.descendants(nodeIds)
scene.nodes.relatedEdgeIds(nodeIds)
scene.snap.candidates(rect)
scene.items.all()
scene.selection.move(target)
scene.frame.pick(point)
scene.viewport.pick(input)
```

而不是：

```ts
query.scene.query.mindmap.structure(id)
query.scene.query.edge.capability(edgeId)
query.scene.query.selection.move(target)
```

## 4. 命名规则统一为“顶层 `*Read`，子层纯 subject”

最终命名统一为：

- `DocumentFrame`
- `RuntimeFrame`
- `SceneRead`
- `EditorSceneRead`
- `SceneNodes`
- `SceneEdges`
- `SceneMindmaps`
- `SceneGroups`
- `SceneSelection`
- `SceneFrame`
- `SceneHit`
- `SceneViewport`
- `SceneOverlay`
- `SceneSpatial`
- `SceneItems`
- `SceneSnap`

不再使用：

- `Query`
- `SceneProjectionQuery`
- `SceneQuery`
- `HitFrame`
- `ViewportFrame`
- `OverlayFrame`
- `SpatialRead` 作为 scene 子能力公开名
- `items(): State['items']` 这种直接暴露底层存储的签名

规则固定为：

- `*Read` 只用于顶层正式读取面
- scene 子能力不再带 `Read`
- scene 子能力不再带 `Frame`
- scene 子能力只按 subject 命名
- scene 子能力不直接透出底层 state 类型

## 5. 默认传整个 `SceneRead`，不再拆很多短 port

最终 editor feature 不再默认拿：

```ts
projection: EditorSceneApi
```

而是在 host 组装时直接下发几个正式中轴：

```ts
interface EditorFeatureContext {
  document: DocumentFrame
  runtime: RuntimeFrame
  scene: SceneRead
  state: EditorStatePorts
  session: EditorSessionPorts
  write: EditorWrite
  layout: WhiteboardLayoutService
  tool: ToolService
  snap: SnapRuntime
  nodeType: NodeTypeSupport
}
```

规则：

- feature 不再知道 `projection.query`
- feature 默认直接拿整个 `scene`
- feature 默认直接拿整个 `document`
- feature 默认直接拿整个 `runtime`
- feature 不再负责穿透层级
- 不默认继续把 `scene` 拆成很多局部小 port

这里的原则是：

- `EditorSceneApi` 太厚，不适合整体传
- `EditorHostDeps` 这类大杂烩 context 也不适合整体传
- 但 `SceneRead` / `DocumentFrame` / `RuntimeFrame` 这类中轴已经足够内聚，适合整体传

因此默认最优不是“很多短 port”，而是：

- 传整个 `scene: SceneRead`
- 传整个 `document: DocumentFrame`
- 传整个 `runtime: RuntimeFrame`
- 只在少数纯算法/跨包边界再收窄

不鼓励把 scene 默认拆成：

- `EdgeSceneRead`
- `MindmapSceneRead`
- `FrameSceneRead`
- `SelectionSceneRead`

如果这些类型只是把 `SceneRead` 的某几个字段再搬一次，它们本质上是在制造第二套 API。

## 6. feature 参数类型不再用长链 `Pick<>`

不再接受这类签名：

```ts
Pick<EditorHostDeps['projection']['query']['scene'], 'edge'>['edge']
```

默认改为直接传整个中轴：

```ts
interface EdgeRouteContext {
  scene: SceneRead
  viewport: SessionViewportRead
  write: Pick<EditorWrite, 'edge'>
}
```

只有在下面几种少数场景才允许收窄：

- 跨包复用的纯算法模块
- 需要极小输入面的纯函数
- 明确要隔离读写边界的低层 service

这类例外场景才可以写成：

```ts
interface EdgeSceneRead {
  get(id: EdgeId): EdgeView | undefined
  editable(id: EdgeId): EdgeView | undefined
  capability(id: EdgeId): EdgeCapability | undefined
}
```

原则是：

- feature 默认拿正式中轴，不拿大杂烩壳子
- feature 参数写业务能力
- 不写来自哪个大对象的路径
- 不让类型系统承担 API plumbing 工作
- 只有例外场景才收窄到局部 port

## 7. `readEditableEdgeView` 这类 helper 最终应消失

有了 `scene.edges` 之后，最终调用直接写成：

```ts
const view = scene.edges.editable(edgeId) ?? scene.edges.get(edgeId)
```

这是自然表达，不需要再包一个 helper。

同类规则也适用于：

- `mindmap resolve + structure + get`
- `group target + exact`
- `frame pick + parent`

如果某个 helper 只是把两个正式 scene 能力再拼一次，最终应删除。

## 8. `mindmapStructure` 统一收敛到 `scene.mindmaps.structure`

最终只保留：

```ts
scene.mindmaps.structure(value)
```

不再同时保留：

- `scene.mindmapStructure`
- `scene.mindmaps.structure`

同一语义只允许一个正式入口。

## 9. `snap / bounds / items / spatial` 的最终位置

最终建议固定为：

- `scene.bounds()`：保留顶层，因为它表达全 scene 边界
- `scene.snap.candidates(rect)`：不再使用裸 `snap(rect)`
- `scene.spatial.*`：保留，但明确为底层能力
- `scene.items.all()`：如果必须公开，就给正式 subject；不再直接用 `items(): State['items']`

规则是：

- 裸函数只保留真正全局的 `bounds()`
- `snap`、`items` 这种应变成正式 subject

## 三、优先级判断

如果只回答“`SceneProjectionQuery` 里 `SceneQuery` 重要还是其他重要”，最终结论是：

1. 最重要的是统一的 `scene` read surface
2. 第二重要的是 subject 分组是否自然
3. `SceneQuery` 本身不重要，应该被消解掉

也就是说：

- 重要的不是 `SceneQuery`
- 重要的也不是单独的 `node(id)` / `edge(id)` 函数
- 重要的是 scene 整体是否已经成为一个短、平、按语义分组的正式读取面

补充一条固定规则：

- 凡是“从 node 或 node 集合出发做关系展开”的能力，优先收进 `scene.nodes.*`

因此最终应收进 `nodes` 的包括：

- `descendants`
- `relatedEdgeIds`
- `owner`

这些都不应继续挂在 `scene` 顶层。

再补一条命名规则：

- 调用方看到的路径必须能直接反映 subject，而不是反映“这是一个 frame 还是 read builder”

因此：

- `scene.hit.item(...)` 可以接受
- `scene.viewport.pick(...)` 可以接受
- `scene.overlay.marquee()` 可以接受
- `scene.spatial.rect(...)` 可以接受
- `scene.query.hit.item(...)` 不接受
- `scene.hitFrame.item(...)` 不接受
- `scene.spatialRead.rect(...)` 不接受

## 四、实施方案

## Phase 1：contracts 重写

目标：

- 删除 `SceneProjectionQuery`
- 删除 `SceneQuery`
- 引入 `EditorSceneRead` / `SceneRead`
- `EditorSceneApi.query` 改为 `EditorSceneApi.read`
- 统一 scene 子能力命名，不再混用 `Frame / Read / 裸函数 / State`

完成标准：

- 公开 contracts 中不再出现 `query.scene.query`
- 命名收敛到 `document / runtime / scene`

## Phase 2：projection builder 收口

目标：

- `createProjectionRead` 改为构建最终 `EditorSceneRead`

落地：

- `document` builder 保留
- `runtime` builder 保留
- `scene` builder 直接产出 subject-grouped surface
- `createFrameRead / createSelectionRead / createHitRead / createViewRead / createChromeRead / createBoundsRead` 可以继续保留模块文件，但仅作为 `SceneRead` 的内部实现
- 内部 builder 产物对外映射为 `SceneNodes / SceneEdges / SceneMindmaps / SceneGroups / SceneSelection / SceneFrame / SceneHit / SceneViewport / SceneOverlay / SceneSpatial / SceneItems / SceneSnap`

完成标准：

- projection 层不再构造一个中间 `SceneQuery`

## Phase 3：editor host 输入薄化

目标：

- feature 不再依赖 `projection.query...`

落地：

- host 创建上下文时直接把 `scene` / `document` / `runtime` 下发
- `EditorHostDeps` 改成薄 context
- 默认传整个 `SceneRead`，不继续拆很多局部 scene port

完成标准：

- editor feature 中不再出现 `ctx.projection.query.scene...`

## Phase 4：feature 参数重写

目标：

- 去掉长链 `Pick<>`

落地：

- 每个 feature 文件默认直接吃正式中轴
- 只在纯算法/跨包边界定义最小输入接口
- 输入字段直接写业务 port 名字
- 不再从 `EditorHostDeps['projection']['query']['scene']` 抽类型

完成标准：

- feature 签名能直接读懂“它依赖哪些能力”
- 看不到层级路径式类型抽取
- 不会为了“最小依赖”再造很多局部 scene port

## Phase 5：helper 清理

目标：

- 删除“只是适配 awkward API 的 helper”

优先删除：

- `readEditableEdgeView`
- 同类 `readXxx + fallback` helper
- 同类 `resolve + structure + get` 二次包装

保留原则：

- 算法 helper 可以保留
- 结构适配 helper 不再保留

## Phase 6：scene 语义入口去重

目标：

- 一个语义只保留一个正式入口

重点收敛：

- `mindmapStructure` -> `scene.mindmaps.structure`
- group 相关能力统一进 `scene.groups.*`
- edge capability / editable / routePoints / chrome 统一进 `scene.edges.*`
- node 关系查询统一进 `scene.nodes.*`
- `snap(rect)` -> `scene.snap.candidates(rect)`
- `items(): State['items']` -> `scene.items.all()`

完成标准：

- 不再存在同义多入口

## Phase 7：命名统一迁移

目标：

- 把所有公开命名统一到最终态

迁移列表：

- 类型重命名
  - `Query` -> `EditorSceneRead`
  - `SceneProjectionQuery` -> 删除
  - `SceneQuery` -> 删除
  - `HitFrame` -> `SceneHit`
  - `ViewportFrame` -> `SceneViewport`
  - `OverlayFrame` -> `SceneOverlay`
  - `SpatialRead` 作为 scene 子能力公开名 -> `SceneSpatial`

- `EditorSceneApi` 字段重命名
  - `query` -> `read`

- `scene` 公开字段重命名
  - `node(id)` -> `nodes.get(id)`
  - `edge(id)` -> `edges.get(id)`
  - `mindmap(id)` -> `mindmaps.get(id)`
  - `group(id)` -> `groups.get(id)`
  - `nodes()` -> `nodes.entries()`
  - `edges()` -> `edges.entries()`
  - `mindmaps()` -> `mindmaps.entries()`
  - `groups()` -> `groups.entries()`
  - `query.selection.*` -> `selection.*`
  - `query.frame.*` -> `frame.*`
  - `query.hit.*` -> `hit.*`
  - `query.viewport.*` -> `viewport.*`
  - `query.overlay.*` -> `overlay.*`
  - `query.edge.*` -> `edges.*`
  - `query.mindmap.*` -> `mindmaps.*`
  - `query.group.*` -> `groups.*`
  - `query.node.idsInRect` -> `nodes.idsInRect`
  - `query.relatedEdgeIds` -> `nodes.relatedEdgeIds`
  - `query.descendants` -> `nodes.descendants`
  - `query.ownerByNode` -> `nodes.owner`
  - `query.snap(rect)` -> `snap.candidates(rect)`
  - `query.items()` -> `items.all()`

- editor 调用路径重命名
  - `projection.query.scene.query.mindmap.structure(id)` -> `projection.read.scene.mindmaps.structure(id)`
  - `projection.query.scene.query.edge.capability(id)` -> `projection.read.scene.edges.capability(id)`
  - `projection.query.scene.node(id)` -> `projection.read.scene.nodes.get(id)`
  - `projection.query.document.node(id)` -> `projection.read.document.node(id)`
  - `projection.query.runtime.facts.*` -> `projection.read.runtime.facts.*`

- host/context 输入重命名
  - `projection: EditorSceneApi` -> `read: EditorSceneRead` 或直接拆成 `document / runtime / scene`

完成标准：

- 代码里不再出现 `query.scene.query`
- 代码里不再出现 `HitFrame / ViewportFrame / OverlayFrame`
- 代码里不再出现 `items(): State['items']`
- 代码里不再出现 `snap(rect)` 作为 scene 顶层裸函数

## 五、验收标准

达到以下状态才算完成：

- 不再出现 `query.scene.query.*`
- `EditorSceneApi` 不再以 `query` 为公开主入口
- `SceneQuery` / `SceneProjectionQuery` 从公开 contracts 删除
- `scene` 能直接回答绝大多数读需求
- feature 不再依赖长链 `Pick<>`
- `SceneRead` / `DocumentFrame` / `RuntimeFrame` 默认作为整体中轴传递
- `readEditableEdgeView` 这类结构适配 helper 消失
- `mindmapStructure` 不再与 `mindmaps.structure` 并存
- `Frame / Read / 裸函数 / State` 命名混用消失
- `scene` 子能力全部收敛到统一命名规则
- 大多数 editor 调用路径缩短为按 subject 的一层命名空间

## 一句话总结

当前问题不是 `SceneQuery` 不够强，而是 `scene` 的公开读取面仍然带着实现分层痕迹。

最终最优解是：

- 删除 `scene.query`
- 删除 `Query` 这类泛名主入口
- 把 scene 直接改成按 subject 分组的正式 read surface
- 默认直接传整个 `SceneRead`
- 只拆外层杂糅壳子，不把 `SceneRead` 再拆成很多局部小口
- 让 editor feature 直接吃 `scene`，而不是穿透 `projection.query.scene.query`

这样之后，调用路径会明显变短，参数类型会自然收敛，helper 数量也会跟着下降。

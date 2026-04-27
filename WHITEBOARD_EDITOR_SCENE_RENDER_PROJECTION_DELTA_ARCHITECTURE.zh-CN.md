# Whiteboard Editor Scene Render / Projection Delta 架构研究与长期方案

## 目的

这份文档研究 `whiteboard/packages/whiteboard-editor-scene` 里 render 这一整块是如何接收变化、如何使用 `shared/projection`、如何消费前面阶段的 delta / changes，并给出一套面向长期的最优增量更新方案。

目标不是只修 `edge render`，而是把整个 `render` 作为 projection 中一个正式、稳定、可扩展的阶段重建清楚。

## 结论摘要

当前 `whiteboard-editor-scene` 的总体分层是对的：

1. `source -> input delta -> projection plan -> graph/spatial/view phase -> surface stores`
2. graph 阶段已经能产出比较有价值的 canonical delta。
3. spatial 阶段已经在用 graph delta 做近似理想的增量 patch。
4. render 阶段的核心问题不是“没有 delta”，而是“delta 的语义在进入 render 之前被压扁了”。

长期最优方案应该是：

1. 保留 `InputDelta` 作为 source 侧粗粒度变化输入。
2. 保留并扩展 `GraphDelta`，把 graph 阶段的真实变化原因沉淀为 canonical changes。
3. 把当前单个 `view` phase 拆成至少 `ui`、`items`、`render` 三部分。
4. 让 `render` 不再直接消费“粗 touched ids”，而是消费前序 phase 产出的 `graph/ui/items` canonical delta。
5. 给 `render` 自己建立一份输出侧 `RenderDelta`，作为 surface sync 和调试观测的正式数据。
6. 扩展 `shared/projection` 的 surface family sync，使其支持 patch / stable ids，而不是每次 `replace + 新 ids 数组`。

最终 API 形态也必须同步收敛：

1. `shared/projection` 的 scope schema 使用 pure string spec。
2. `shared/delta` 的 change schema 使用 pure string spec。
3. 只有 surface field 保留 plain object，因为它承载 `read/isEqual/changed/delta/idsEqual` 这些 runtime 行为。

一句话概括：

`render` 应该像 `spatial` 一样，成为一个“消费 canonical delta，维护自己输出 delta”的正式 phase，而不是继续做一个混合了 UI、items、render cache 和 surface 传输副作用的大杂烩阶段。

---

## 一、当前实现的真实链路

## 1. Source change

上游 `EditorSceneSource` 只发一个粗粒度的 `EditorSceneSourceChange`：

- `document?: true`
- `session.tool/selection/edit/preview?: true`
- `interaction.hover/drag/chrome/editingEdge?: true`
- `view?: true`
- `clock?: true`

对应文件：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/source.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/source.ts`

这个变化通知本质上是“哪个来源通道动了”，不是最终 projection 能直接消费的增量语义。

## 2. SourceInput 把粗变化转成 InputDelta

`runtime/sourceInput.ts` 会把 source change 转成 `InputDelta`：

- `document`: engine publish delta
- `session.draft.edges`
- `session.preview.nodes/edges/mindmaps`
- `session.preview.marquee/guides/draw/edgeGuide`
- `session.selection/hover/edit/interaction`
- `clock.mindmaps`

对应文件：

- `whiteboard/packages/whiteboard-editor-scene/src/runtime/sourceInput.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`

这个阶段的本质是：

1. 保留 engine publish 的文档级 delta。
2. 为 preview / edit / interaction 人工构造 touched id 集。
3. 把 source 变化翻译成 projection 可规划的输入。

## 3. Projection plan 决定跑哪些 phase

`runtime/model.ts` 中 `createEditorSceneProjectionSpec()` 做两件事：

1. `plan()` 决定这次是跑 `graph`，还是只跑 `view`。
2. `phases` 定义 `graph / spatial / view` 三阶段。

当前 phase 图：

1. `graph`
2. `spatial`
3. `view`

其中：

1. bootstrap 或 graph 有变化时，先跑 `graph`。
2. `graph` phase 会 emit `spatial` 和 `view` 的 scope。
3. 没有 graph 变化时，可以直接只跑 `view`。

这说明 `shared/projection` 在 editor-scene 里已经不是“只做重算”，而是一个带 phase plan 和 fanout 的增量调度器。

## 4. Graph phase

`graph` phase 做的事情：

1. 更新 document snapshot。
2. patch indexes。
3. patch canonical `graph.nodes/edges/mindmaps/groups`。
4. 写入 `working.delta.graph`。
5. 根据 graph delta fanout 到 spatial/view。

关键文件：

- `model/graph/patch.ts`
- `model/graph/node.ts`
- `model/graph/edge.ts`
- `model/graph/mindmap.ts`
- `model/graph/group.ts`
- `contracts/delta.ts`

当前 `GraphDelta`：

```ts
interface GraphDelta {
  revision: Revision
  order: boolean
  entities: {
    nodes: IdDelta<NodeId>
    edges: IdDelta<EdgeId>
    mindmaps: IdDelta<MindmapId>
    groups: IdDelta<GroupId>
  }
  geometry: {
    nodes: Set<NodeId>
    edges: Set<EdgeId>
    mindmaps: Set<MindmapId>
    groups: Set<GroupId>
  }
}
```

这个设计的优点很明显：

1. `entities` 表示生命周期或值变化。
2. `geometry` 把“值变化里真正影响空间/渲染几何的那一部分”单独提出来。
3. `order` 独立表达画布顺序变化。

这已经是一个很好的 canonical delta 雏形。

## 5. Spatial phase

`spatial` 几乎是当前最接近理想的增量 phase。

它直接消费 `GraphDelta`：

1. `added/removed/geometry` 决定 patch 哪些 spatial record。
2. `order` 决定 patch spatial order。
3. phase 自己输出 `SpatialDelta`。

关键文件：

- `model/spatial/update.ts`

这是 render 长期方案最重要的参考实现。

## 6. View phase

当前 `view` phase 实际承担了三类不同职责：

1. patch `ui.nodes / ui.edges / ui.chrome`
2. patch `items`
3. patch `render.*`

关键文件：

- `model/view/patch.ts`
- `model/view/ui.ts`
- `model/view/items.ts`
- `model/view/render.ts`

这就是现阶段的核心设计问题：

`view` phase 过载了。

---

## 二、当前 delta 体系的层次与角色

当前实现里其实已经有多层变化语义，但角色没有完全分清。

## 1. Source delta

角色：

1. 表示外部输入通道是否变化。
2. 粗粒度，不保证精准影响域。

形式：

- `EditorSceneSourceChange`

## 2. Input delta

角色：

1. projection plan 的输入。
2. 粗到中等粒度的 invalidation 候选集。

形式：

- `InputDelta`

特点：

1. 含 engine publish 的 document delta。
2. 含 preview/edit/interaction 的 touched ids。
3. 仍然不是 canonical delta。

## 3. Graph delta

角色：

1. graph phase 的真实输出。
2. graph canonical state 的变化摘要。
3. spatial / view 应优先消费它，而不是再回头盯 source delta。

形式：

- `working.delta.graph`

特点：

1. 已经过 equality 判断。
2. 已经有 geometry / order 分层。
3. 比 source delta 更接近“可复用的 phase 输出”。

## 4. ViewPatchScope

角色：

1. 当前 view phase 的输入 scope。
2. 不是 output delta。
3. 本质是“候选脏区”，不是“真实变化集”。

形式：

```ts
interface ViewPatchScope {
  reset: boolean
  chrome: boolean
  items: boolean
  nodes: ReadonlySet<NodeId>
  edges: ReadonlySet<EdgeId>
  statics: ReadonlySet<EdgeId>
  labels: ReadonlySet<EdgeId>
  active: ReadonlySet<EdgeId>
  masks: ReadonlySet<EdgeId>
  overlay: boolean
}
```

问题在于：

1. 它把 graph / ui / items / render 的影响域糊在一起。
2. 它表达的是“可能需要 patch”，不是“实际发生了什么变化”。
3. 它没有保留变化原因，只有 touched ids。

## 5. Surface sync

角色：

1. 把 working state 暴露成 React 可订阅 surface。
2. 当前实现不是增量 patch，而是 update 后统一 `surface.sync()`。

关键文件：

- `shared/projection/src/runtime.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts`

当前 family surface 的问题：

1. 每次 `field.read(state)` 都生成新的 `ids` 数组。
2. `surface.sync()` 对所有 field 执行同步。
3. family surface 走 `replace`，没有利用 `FamilyStore.write.apply()` 的增量能力。

所以 surface 层现在更像“状态导出器”，不是“增量传输器”。

---

## 三、当前实现的优点

这部分很重要。方案不能建立在“全都推翻”的前提上。

## 1. Graph phase 已经是 canonical 层

`patchNode/patchEdge/patchMindmap/patchGroup` 都是在 canonical state 上做 equality，再决定是否写 delta。

这说明：

1. graph 层不是简单转发输入。
2. 它已经具备“为后续 phase 提供真实变化摘要”的能力。

## 2. Spatial phase 是正确方向

spatial 的做法值得 render 复用：

1. 有自己的 output delta。
2. 只 patch 受 graph delta 影响的 records。
3. order 单独处理。

## 3. Render state 与 graph/ui state 已经分层

现在 `working` 中已经分出：

1. `graph`
2. `ui`
3. `render`
4. `items`

这个状态分层是正确的，只是 phase 和 delta 还没完全匹配。

## 4. Render patch 里已经有局部引用复用

例如：

1. `patchNodeRender` 是按 touched node 增量 patch。
2. `patchActive` 是按 active edge 增量 patch。
3. `patchStatics` / `patchLabelsAndMasks` 虽然全量 rebuild，但仍尝试复用旧 view 引用。

这说明当前系统已经有“增量 patch”的意图，只是还没完成。

---

## 四、当前 render 设计的核心问题

## 1. 当前 `view` phase 过载

`patchViewState()` 同时负责：

1. UI state
2. chrome
3. items
4. render caches

后果：

1. 一个 scope 同时服务不同语义层。
2. render 无法只消费 canonical 的 ui/items delta。
3. 无法像 spatial 一样拥有自己的 phase 输出 delta。

## 2. Render 在消费“候选脏区”，不是“真实变化”

当前 `readViewPatchScope()` 里塞入大量 touched ids：

1. graph touched edges
2. preview touched edges
3. selection 相关 edges
4. hover 相关 edges
5. edit 相关 edges

但 render patch 真正需要的不是“这些 edge 可能变了”，而是：

1. route 变了没有
2. style 变了没有
3. label 布局变了没有
4. active state 变了没有
5. order 变了没有

这就是 delta 被压扁的问题。

## 3. Graph delta 的信息没有被 render 吃满

当前 graph delta 至少有：

1. entity lifecycle
2. geometry changed
3. order changed

但 render 只把它转成了一组 `touchedEdges` / `touchedNodes`。

这造成两个问题：

1. `geometry` 与 `style`、`labels`、`membership` 等变化原因没有分开。
2. render 无法按不同输出 family 走不同 patch 路径。

## 4. Edge render 仍有全量 rebuild 区域

目前：

1. `patchStatics()` 只要 `scope.statics` 非空就全量 `buildStaticState()`。
2. `patchLabelsAndMasks()` 只要 `scope.labels/masks` 非空就全量 `buildLabelsAndMasks()`。

这使得 render 的复杂度被总 edge 数放大，而不是只随受影响 edge 数增长。

## 5. Surface sync 仍然是全量同步思路

`shared/projection` 运行时在每次 update 后统一：

1. `currentRevision = revision`
2. `surface.sync()`

而 `surface.sync()` 当前对 family field 的实现是：

1. `field.read(state)` 读出 `{ ids, byId }`
2. `source.write.replace(...)`

这会导致：

1. 传输层做了很多无意义 work。
2. `ids` 引用失稳。
3. React 层即使按 key 订阅，父列表也会被频繁唤醒。

---

## 五、长期最优方案的原则

## 原则 1：分清三种“变化”

必须严格区分：

1. `cause delta`
   - 输入侧发生了什么
   - 例如 source change、InputDelta
2. `phase scope`
   - 哪个 phase 需要运行
   - 例如 graph/view/render scope
3. `output delta`
   - phase 真正产出了哪些变化
   - 例如 GraphDelta、SpatialDelta、未来的 UiDelta、ItemsDelta、RenderDelta

当前最大问题是：

`ViewPatchScope` 同时扮演了 2 和 3 的角色，但其实只能胜任 2。

## 原则 2：render 要像 spatial 一样，拥有自己的 output delta

render 不应该只是“patch 完了就结束”，它应该输出一份正式的 `RenderDelta`：

1. 便于 surface sync
2. 便于调试和测试
3. 便于后续 phase 或 host 观测

## 原则 3：phase scope 保持轻，canonical delta 放进 working.delta

phase scope 适合表达：

1. flag
2. set union
3. 少量路由信息

不适合承载复杂、跨 phase 聚合的大对象。

因此长期设计里：

1. scope 只负责决定 phase 要不要跑。
2. 真正的变化摘要进入 `working.delta.*`。
3. 后续 phase 直接消费 `working.delta.*`。

## 原则 4：surface sync 不能再把自己当 diff 引擎

phase 已经做过 canonical diff 之后，surface 不应再退化回“整张快照 replace”。

surface 的职责应该是：

1. 稳定导出
2. 按 field / family patch
3. 尽量保持 ids / byId identity 稳定

---

## 六、推荐的长期 phase 结构

当前：

1. `graph`
2. `spatial`
3. `view`

长期建议改成：

1. `graph`
2. `spatial`
3. `items`
4. `ui`
5. `render`

依赖关系：

1. `spatial` after `graph`
2. `items` after `graph`
3. `ui` after `graph`
4. `render` after `items`, `ui`

这样做的原因：

1. `items` 是 document order 的派生，和 render static batching 强相关。
2. `ui` 是 session / interaction / graph state 的派生。
3. `render` 依赖 graph + items + ui，但不应该自己再去猜这些层到底变了什么。

## 1. Graph phase

职责：

1. patch canonical graph state
2. patch indexes
3. 输出 `GraphDelta` 与 `GraphChanges`

## 2. Spatial phase

职责：

1. 按 graph delta patch spatial
2. 输出 `SpatialDelta`

## 3. Items phase

职责：

1. patch `working.items`
2. 输出 `ItemsDelta`

## 4. UI phase

职责：

1. patch `ui.nodes`
2. patch `ui.edges`
3. patch `ui.chrome`
4. 输出 `UiDelta`

## 5. Render phase

职责：

1. 消费 `GraphDelta/GraphChanges`
2. 消费 `ItemsDelta`
3. 消费 `UiDelta`
4. patch `render.node`
5. patch `render.edge.statics/active/labels/masks`
6. patch `render.overlay/chrome`
7. 输出 `RenderDelta`

---

## 七、推荐的数据模型

## 1. 保留当前 GraphDelta

当前 `GraphDelta` 对 spatial 非常合适，不应废弃。

它继续负责：

1. entity lifecycle
2. geometry
3. order

## 2. 在 graph 旁边新增 GraphChanges

`GraphDelta` 太粗，不足以支撑 render 的长期最优增量。

建议新增一层语义更强的 `GraphChanges`，使用 pure string `ChangeSchema<T>` 建模。

示意：

```ts
interface GraphChanges {
  order: boolean
  node: {
    lifecycle: IdDelta<NodeId>
    geometry: IdDelta<NodeId>
    content: IdDelta<NodeId>
    owner: IdDelta<NodeId>
  }
  edge: {
    lifecycle: IdDelta<EdgeId>
    route: IdDelta<EdgeId>
    style: IdDelta<EdgeId>
    labels: IdDelta<EdgeId>
    endpoints: IdDelta<EdgeId>
    box: IdDelta<EdgeId>
  }
  mindmap: {
    lifecycle: IdDelta<MindmapId>
    geometry: IdDelta<MindmapId>
    connectors: IdDelta<MindmapId>
    membership: IdDelta<MindmapId>
  }
  group: {
    lifecycle: IdDelta<GroupId>
    geometry: IdDelta<GroupId>
    membership: IdDelta<GroupId>
  }
}

const graphChangeSpec: ChangeSchema<GraphChanges> = {
  order: 'flag',
  node: {
    lifecycle: 'ids',
    geometry: 'ids',
    content: 'ids',
    owner: 'ids'
  },
  edge: {
    lifecycle: 'ids',
    route: 'ids',
    style: 'ids',
    labels: 'ids',
    endpoints: 'ids',
    box: 'ids'
  },
  mindmap: {
    lifecycle: 'ids',
    geometry: 'ids',
    connectors: 'ids',
    membership: 'ids'
  },
  group: {
    lifecycle: 'ids',
    geometry: 'ids',
    membership: 'ids'
  }
}
```

说明：

1. `GraphDelta` 保持低层、结构稳定。
2. `GraphChanges` 表达 render/ui 需要的语义原因。
3. 两者不是互斥，而是并行存在。

## 3. 新增 ItemsDelta

`items` 不能只是一个数组状态，应该有自己的 delta。

建议：

1. 用 `shared/delta/listChange.ts` 计算 `added/removed/orderChanged`
2. 或者把 item key 映射成 string 后用 `entityDelta.fromSnapshots()`

示意：

```ts
interface ItemsDelta {
  revision: Revision
  orderChanged: boolean
  added: readonly SceneItem[]
  removed: readonly SceneItem[]
}
```

`items` 主要供：

1. render statics batching
2. 画布 order 相关导出

## 4. 新增 UiDelta

UI phase 应该输出它自己真正改动了哪些 key，而不是让 render 去重复算。

示意：

```ts
interface UiDelta {
  node: IdDelta<NodeId>
  edge: IdDelta<EdgeId>
  chrome: boolean
}

const uiChangeSpec: ChangeSchema<UiDelta> = {
  node: 'ids',
  edge: 'ids',
  chrome: 'flag'
}
```

这个 delta 表示：

1. 哪些 node ui view 真变了
2. 哪些 edge ui view 真变了
3. chrome view 真变了没有

## 5. 新增 RenderDelta

render phase 应有正式 output delta。

示意：

```ts
interface RenderDelta {
  node: IdDelta<NodeId>
  edge: {
    statics: IdDelta<EdgeStaticId>
    active: IdDelta<EdgeId>
    labels: IdDelta<EdgeLabelKey>
    masks: IdDelta<EdgeId>
  },
  chrome: {
    scene: boolean
    edge: boolean
  }
}

const renderChangeSpec: ChangeSchema<RenderDelta> = {
  node: 'ids',
  edge: {
    statics: 'ids',
    active: 'ids',
    labels: 'ids',
    masks: 'ids'
  },
  chrome: {
    scene: 'flag',
    edge: 'flag'
  }
}
```

这份 delta 用于：

1. surface sync
2. profile / trace
3. 自动化测试

---

## 八、Render phase 应如何消费前序 delta

这是整份方案最核心的部分。

## 1. Node render

依赖：

1. graph node view
2. ui node view

输入变化应来自：

1. `GraphChanges.node.lifecycle`
2. `GraphChanges.node.geometry`
3. `GraphChanges.node.content`
4. `GraphChanges.node.owner`
5. `UiDelta.node`

规则：

1. graph 变化驱动几何/内容更新
2. ui 变化驱动 selected/hovered/editing/patched/resizing 更新
3. 不要因为 edge 或 chrome 变化重算 node render

## 2. Edge statics

依赖：

1. `working.items`
2. edge route svg path
3. edge style

输入变化应来自：

1. `ItemsDelta`
2. `GraphChanges.edge.lifecycle`
3. `GraphChanges.edge.route`
4. `GraphChanges.edge.style`

长期 patch 策略：

1. 先定位受影响的 `styleKey`
2. 再定位受影响 bucket / chunk
3. 只重建受影响 bucket
4. 输出 `RenderDelta.edge.statics`

注意：

1. static layer 不依赖 selection / hover / editing
2. static layer 不应因为 label selected 改变而失效

## 3. Edge labels

依赖：

1. graph edge label 几何和文本
2. edge ui 的 selected / editing / caret

输入变化应来自：

1. `GraphChanges.edge.lifecycle`
2. `GraphChanges.edge.route`
3. `GraphChanges.edge.labels`
4. `UiDelta.edge`

规则：

1. label 文本或布局变了，patch label view
2. selection/editing/caret 变了，只 patch 对应 label view
3. 不要把 mask 几何和 label UI 状态混成一套全量 rebuild

## 4. Edge masks

依赖：

1. edge label maskRect

输入变化应来自：

1. `GraphChanges.edge.lifecycle`
2. `GraphChanges.edge.labels`
3. `GraphChanges.edge.route`

规则：

1. mask 是 label 几何输出，不依赖 selected / editing / hover
2. 不能因为 edge ui 变化重算全部 mask

## 5. Edge active

依赖：

1. edge geometry / box / style
2. hover / selection / editing

输入变化应来自：

1. `GraphChanges.edge.lifecycle`
2. `GraphChanges.edge.route`
3. `GraphChanges.edge.style`
4. `GraphChanges.edge.box`
5. `UiDelta.edge`
6. interaction hover / selection / edit 相关变化

规则：

1. active layer 是高频交互层，应优先做精细增量
2. 它可以接受比 static 稍粗的 patch，但仍应基于 active edge 集做增量

## 6. Overlay

依赖：

1. selected edge
2. edge route handles
3. activeRouteIndex
4. preview edge guide
5. tool / interaction chrome / editingEdge

输入变化应来自：

1. `GraphChanges.edge.route/endpoints/box`
2. `UiDelta.edge`
3. source input 中的 tool / interaction / preview.edgeGuide / edit

overlay 本质上是“强交互、低数量、可全量”的层，可以保留 value store，但要避免把 overlay 的变化污染 static families。

## 7. Chrome render

依赖：

1. chrome preview
2. overlay

输入变化应来自：

1. `UiDelta.chrome`
2. overlay changed

---

## 九、如何更好地使用 shared/projection

## 1. 充分利用 phase 依赖图，不要把所有派生都塞进一个 phase

`shared/projection` 已经支持：

1. `plan()`
2. phase graph
3. scope fanout

editor-scene 目前没有吃满这套能力，因为 `view` phase 包得太大。

长期方案里：

1. `graph` 负责 canonical state
2. `items/ui/render` 拆开
3. `render` 只依赖已经 patch 完的前序派生层

这才是 projection phase graph 的正确打开方式。

## 2. Scope 继续用 flag/set，不要把复杂 patch 计划硬塞进 scope

`shared/projection` 的 scope 当前支持：

1. `flag`
2. `set`
3. `slot`

其中 `slot` 的合并语义是“后写覆盖前写”，不是自定义 reducer。

这意味着：

1. 多上游 phase 同时往一个 slot 塞复杂 patch plan 并不安全。
2. 对 editor-scene 来说，更稳妥的方式是：
   - scope 只表达 phase 是否需要跑
   - 真正的 patch 计划写进 `working.delta.*`

因此，长期方案不应依赖 scope 承载复杂对象合并。

## 3. Surface family sync 需要从 replace 升级为 patch

`shared/projection` 当前 family surface 读的是：

```ts
{ ids, byId }
```

然后在 sync 时直接：

```ts
source.write.replace(field.read(state))
```

这对 editor-scene render 不够。

建议为 `shared/projection` 扩展 family field 能力：

```ts
type ProjectionFamilyField<TState, TKey extends string, TValue> = {
  kind: 'family'
  read(state: TState): {
    ids: readonly TKey[]
    byId: ReadonlyMap<TKey, TValue>
  }
  isEqual?: (left: TValue, right: TValue) => boolean
  idsEqual?: (left: readonly TKey[], right: readonly TKey[]) => boolean
  patch?: (input: {
    previous: {
      ids: readonly TKey[]
      byId: ReadonlyMap<TKey, TValue>
    }
    next: {
      ids: readonly TKey[]
      byId: ReadonlyMap<TKey, TValue>
    }
  }) => {
    ids?: readonly TKey[]
    set?: readonly (readonly [TKey, TValue])[]
    remove?: readonly TKey[]
  } | undefined
}
```

然后：

1. 没有 `patch` 时保持现状。
2. 有 `patch` 时走 `FamilyStore.write.apply()`。
3. `idsEqual` 允许内容相同则复用 ids 引用。

这一步对整个 projection 基建都成立，不只是 editor-scene。

## 4. Surface sync 最终目标：按 field changed 短路

长期还应继续推进：

1. `surface.sync()` 不再每次遍历所有 field 都执行写入。
2. 允许 phase 或 runtime 告诉 surface 哪些 field 真 changed。

这能进一步减少：

1. 无意义 `ids` 写入
2. React 列表层唤醒
3. keyed store 上层的空转 render

---

## 十、推荐的 editor-scene 改造顺序

## Phase 1：先把 view phase 拆开

目标：

1. `view` -> `items + ui + render`
2. render 不再直接依赖 source 侧 touched 集

实施：

1. 新增 `ItemsDelta`
2. 新增 `UiDelta`
3. 新增 phase 和 scope
4. 保持 render patch 逻辑先不大改

收益：

1. phase 责任清晰
2. render 可以正式消费前序 delta

## Phase 2：建立 GraphChanges / RenderDelta

目标：

1. graph 有更细的语义变化输出
2. render 有正式 output delta

实施：

1. 在 `working.delta` 中增加 `graphChanges`
2. 在 `working.delta` 中增加 `render`
3. 用 `shared/delta/changeState` 建模

收益：

1. render patch 可以按原因分流
2. surface sync 有正式输入

## Phase 3：把 render patch 改成真正增量

目标：

1. `patchStatics` 只改受影响 bucket
2. `patchLabelsAndMasks` 只改受影响 edge
3. `patchActive` 继续保持高频精细化

实施：

1. 利用 `GraphChanges.edge.route/style/labels`
2. 利用 `ItemsDelta`
3. 利用 `UiDelta.edge`

收益：

1. render 成本随受影响实体增长
2. 大图拖拽不再被总 edge 数线性放大

## Phase 4：升级 shared/projection surface sync

目标：

1. family field 支持 patch
2. ids 支持稳定 equality
3. surface 按 field 短路

收益：

1. projection 真正完成“增量 state -> 增量 surface”的闭环
2. React 层能完整吃到 editor-scene phase delta 的收益

---

## 十一、推荐的判断标准

以下条件成立，才算 render/projection delta 这块真正走上长期正确方向：

1. `render` 是独立 phase，不再和 ui/items 混在一个 `view` phase 中。
2. `render` 消费的是前序 phase 的 canonical delta，而不是 source touched ids。
3. `render` 自己有正式 `RenderDelta`。
4. `patchStatics` / `patchLabelsAndMasks` 不再以“只要 touched 就全量 rebuild”作为主路径。
5. `shared/projection` surface family 支持 patch / stable ids。
6. React 层的唤醒次数和 phase output delta 一致，而不是和 update 次数线性绑定。

`shared/core/src/store/table.ts` 不应成为新的 projection 直连入口。
正确边界是 `shared/projection` 产出精确 `FamilyPatch`，再由 `createFamilyStore().write.apply()` 下发到 `table` 层。

---

## 十二、最终建议

这块的关键不是“再优化几个 render 函数”，而是把 `render` 从当前的 `view` 杂糅阶段里解放出来，升级为一个正式的 projection phase。

最值得坚持的长期方向是：

1. `source` 只负责粗输入变化。
2. `graph` 负责 canonical state 和 canonical graph changes。
3. `items/ui/render/spatial` 都作为 graph 之后的派生 phase。
4. 每个 phase 都尽量维护自己的 output delta。
5. `shared/projection` 负责 phase 调度和 surface 传输，但 surface 必须支持 patch，而不是永远 `replace`。

如果要用一句设计原则收尾，那就是：

`render` 不应该继续做“根据输入猜哪里脏了”的阶段，而应该做“消费前序 canonical delta，维护自己的 canonical render delta”的阶段。

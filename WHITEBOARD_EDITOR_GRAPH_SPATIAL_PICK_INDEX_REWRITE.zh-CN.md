# `whiteboard-editor-graph` 的 `Spatial Index` 重写方案

## 1. 目标

这份方案只讨论一件事：

> 在 `whiteboard-editor-graph` 内建设一套长期最优的 `SpatialIndex`，把系统中当前存在的全量遍历，尤其是 document 更新和临时态更新时触发的重复扫描成本压到最低。

这里明确不做：

- `PickIndex`
- `pick resolver`
- 用 `editor-graph` 替代 `whiteboard-react` 的 `PickRegistry`

`pick` 继续由 `whiteboard-react` 的 DOM `PickRegistry` 负责。

`SpatialIndex` 的职责只有两个：

1. 给 `whiteboard-editor` 和 `whiteboard-editor-graph` 提供高效的 world-space 查询能力。
2. 让 viewport visible、marquee、hover candidate、几何候选筛选等场景不再每次全量扫图。

---

## 2. 为什么现在必须做

当前 `whiteboard-editor-graph` 里最明显的问题不是“没有 scene 字段”，而是：

1. `graph` 变化时重算范围过大。
2. `scene` 变化时仍然以数组和 `Map` 全量扫描为主。
3. `viewport`、`draft`、`measure` 这种高频变化缺少正式的增量查询底座。

### 2.1 当前 `graph` phase 本身就是全量构建

当前 `graph` phase 会在一次执行里遍历：

- 全量 nodes
- 全量 edges
- 全量 mindmaps
- 全量 groups

并整体重建 `Map`。

这意味着只要某个高频输入触发 `graph` phase，例如：

- 节点拖拽 draft
- 文本编辑后的测量结果
- mindmap preview

就会把本轮几何相关的所有 scene 数据重新推一遍。

### 2.2 当前 `scene` phase 仍然是全量扫

现在的 `scene` 构建基本是：

1. 扫一次 `canvas.order`
2. 扫一次 `graph.nodes`
3. 扫一次 `graph.edges`
4. 扫一次 `graph.owners.mindmaps`
5. 再做一轮 `visible` 投影

这对下面几类高频变化都不理想：

- 仅 viewport 改变
- 仅一个节点 draft position 改变
- 仅一个节点 size 改变
- 仅一个 edge route 改变

因为这些变化并不值得重新遍历整张图。

### 2.3 当前 impact 粒度过粗

当前 `impact` 只有：

- `document`
- `session`
- `measure`
- `interaction`
- `viewport`
- `clock`

这种大类布尔信号。

这会直接导致两个问题：

1. planner 很难知道是“单节点 draft 变化”还是“整份 document 变化”
2. scene/index 更新无法按 item 增量 fanout

所以长期最优不是“给现有 scene 再挂一个树”，而是：

- 重新定义 `SpatialIndex` 在 runtime 中的位置
- 重新定义输入 impact 的粒度
- 重新定义 scene phase 的更新模式

---

## 3. 边界

### 3.1 `whiteboard-engine`

`whiteboard-engine` 只负责 document truth：

- `node -> owner`
- `owner -> nodeIds`
- `edge -> source / target`
- `group -> items`
- `parent -> children`

这些是持久态关系索引，不是 `SpatialIndex`。

### 3.2 `whiteboard-editor-graph`

`whiteboard-editor-graph` 负责 live projection truth：

- projected geometry
- scene order
- viewport visible
- spatial query

因此 `SpatialIndex` 必须放在这里。

### 3.3 `whiteboard-editor`

`whiteboard-editor` 只消费 `editor-graph` 暴露出来的正式查询能力：

- marquee candidate
- viewport visible candidate
- 几何相关语义动作的候选筛选

它不再自己遍历：

- `graph.nodes`
- `graph.edges`
- `scene.items`

去做二次空间查询。

### 3.4 `whiteboard-react`

`whiteboard-react` 保留：

- DOM `PickRegistry`
- pointer 事件桥
- overlay / handle / panel 的 DOM 命中

它不负责 graph 空间索引，也不需要复制一份 scene query 逻辑。

---

## 4. 最终原则

长期最优必须遵守下面五条：

### 4.1 `SpatialIndex` 是正式运行时能力，不是临时 helper

不能再把空间查询分散在：

- `scene.ts`
- `editor read`
- feature 内局部 `filter`
- React 宿主层

### 4.2 `SpatialIndex` 不应作为普通 snapshot 数据发布

`SpatialIndex` 的核心是运行时查询能力，不是响应式渲染 view。

因此它不应该被塞进 `snapshot.scene` 里作为一个普通对象字段再走 equality/publish。

原因很简单：

- 外部 UI 不需要订阅树结构
- 树结构 diff 成本高且没有意义
- 把运行时索引做成发布字段，会让 fanout 变差

正确做法是：

- `snapshot.scene` 只发布真正需要响应式消费的 view
- `runtime.query.spatial` 作为正式 imperative query surface 暴露

### 4.3 `SpatialIndex` 必须支持增量更新

只要输入变化是局部的，索引更新也必须是局部的。

不能接受：

- 改一个 node draft，重建整棵树
- viewport 变化，重新扫全量 graph
- measure 变化一个 node，高亮/框选候选重新扫整图

### 4.4 `viewport visible` 是 `SpatialIndex` 的消费者

不能继续让 `visible` 成为 `spatial` 的上游。

正确关系是：

1. graph geometry 进入 `SpatialIndex`
2. viewport visible 从 `SpatialIndex.rect(visibleWorld)` 得出

### 4.5 `PickRegistry` 与 `SpatialIndex` 严格解耦

DOM pick 和 graph spatial query 是两套不同职责：

- DOM pick 负责“元素命中了谁”
- spatial query 负责“世界坐标范围里有哪些图元候选”

长期最优里二者不应互相污染。

---

## 5. 最终架构

最终结构应收敛成：

```txt
whiteboard-editor-graph
  runtime/
    graph/
    scene/
      order.ts
      visibility.ts
      spatial/
        contracts.ts
        state.ts
        records.ts
        update.ts
        query.ts
```

其中：

- `graph/*`
  - 产出 projected `NodeView / EdgeView / MindmapView / GroupView`
- `scene/order.ts`
  - 维护 scene item canonical order
- `scene/spatial/*`
  - 维护 `SpatialIndexState`
- `scene/visibility.ts`
  - 用 `SpatialIndex` 求当前 viewport visible

最终数据流：

```txt
document/session/measure
  -> graph phase
  -> scene order delta
  -> spatial index delta
  -> visibility derive
  -> publish scene visibility/view
```

关键点是：

- `SpatialIndex` 是 scene 的基础设施
- `visibility` 是 `SpatialIndex` 的派生结果
- 不是反过来

---

## 6. `SpatialIndex` 放在什么位置

长期最优里，`SpatialIndex` 应是 `editor-graph runtime` 的正式内部状态，不是普通 published snapshot 字段。

建议形态：

```ts
interface RuntimeState {
  revision: {
    document: Revision
    graph: Revision
    spatial: Revision
  }
  graph: GraphState
  scene: {
    order: SceneOrderState
    visibility: SceneVisibility
  }
  query: {
    spatial: SpatialIndexState
  }
}
```

外部正式 API：

```ts
interface Runtime {
  snapshot(): Snapshot
  update(input: Input): Result
  subscribe(listener: (snapshot: Snapshot, change: Change) => void): () => void
  query: {
    spatial: SpatialQueryApi
  }
}
```

### 为什么不把 `SpatialIndex` 放进 `snapshot.scene`

因为 `snapshot` 是给响应式订阅用的。

`SpatialIndex` 是给命令式查询用的。

把两者混在一起会产生三个长期问题：

1. 发布面过重
2. equality 无意义
3. runtime 内部算法无法自由替换

所以最终应明确：

- `snapshot` 负责渲染与观察
- `query.spatial` 负责查询与加速

---

## 7. 最终 contract

不需要 TypeScript `namespace` 语法。

类型内部按职责分层即可。

### 7.1 published `SceneSnapshot`

最终 `SceneSnapshot` 应只保留 reactive view：

```ts
interface SceneSnapshot {
  layers: readonly SceneLayer[]
  order: {
    items: readonly SceneItem[]
  }
  visibility: {
    world?: Rect
    items: readonly SceneItem[]
    nodeIds: readonly NodeId[]
    edgeIds: readonly EdgeId[]
    mindmapIds: readonly MindmapId[]
  }
}
```

这里故意不再出现：

- `scene.spatial`
- `scene.pick`

因为：

- `spatial` 是 runtime index
- `pick` 不归 `editor-graph`

### 7.2 internal `SpatialIndexState`

```ts
interface SpatialIndexState {
  records: ReadonlyMap<SpatialKey, SpatialRecord>
  order: SpatialOrderState
  tree: SpatialTreeState
  refs: SpatialRefState
  dependencies: SpatialDependencyState
}
```

### 7.3 `SpatialRecord`

```ts
type SpatialKey = string

interface SpatialRecord {
  key: SpatialKey
  item: SceneItem
  bounds: Rect
  hitBounds: Rect
  flags: {
    hidden: boolean
    queryable: boolean
  }
  order: {
    canvas: number
    z: number
  }
}
```

说明：

- `bounds` 是真实 world bounds
- `hitBounds` 是用于 broad phase 的查询 bounds
- `queryable` 为 `false` 的 item 不进入树
- `SpatialRecord` 必须保持纯净，只表达空间查询需要的最终记录，不携带上游 source 身份或 store 语义

### 7.4 `SpatialOrderState`

```ts
interface SpatialOrderState {
  keys: readonly SpatialKey[]
  zByKey: ReadonlyMap<SpatialKey, number>
  indexByKey: ReadonlyMap<SpatialKey, number>
}
```

### 7.5 `SpatialRefState`

为了把更新范围压小，必须有反向索引：

```ts
interface SpatialRefState {
  byNodeId: ReadonlyMap<NodeId, readonly SpatialKey[]>
  byEdgeId: ReadonlyMap<EdgeId, readonly SpatialKey[]>
  byMindmapId: ReadonlyMap<MindmapId, readonly SpatialKey[]>
}
```

它的作用不是查询，而是 identity 定位与增量更新入口：

- 某个 node 改了，能立刻知道哪些 spatial record 需要更新
- 某个 mindmap 变了，能立刻知道哪些 spatial record 需要重算

没有这层 ref，后面就一定会退回全表扫描。

### 7.6 `SpatialDependencyState`

`SpatialDependencyState` 负责 change fanout 规则，不放进 `SpatialRecord`：

```ts
interface SpatialDependencyState {
  affectedByNode: ReadonlyMap<NodeId, readonly SpatialKey[]>
  affectedByEdge: ReadonlyMap<EdgeId, readonly SpatialKey[]>
  affectedByMindmap: ReadonlyMap<MindmapId, readonly SpatialKey[]>
}
```

这里必须强调：

- `SpatialRecord` 是纯 record
- `SpatialRefState` 是 identity 映射
- `SpatialDependencyState` 是 fanout 映射

不要把这三种职责重新塞回一个 record 里，否则 `editor-graph` 很快又会被上游 source 结构污染。

---

## 8. `SpatialIndex` 到底查询什么

`SpatialIndex` 不是为了替代 DOM pick，而是为了统一这些查询：

### 8.1 point candidate

```ts
spatial.point(point): readonly SceneItem[]
```

用途：

- hover 候选
- proximity 候选
- 世界坐标附近对象筛选

注意：

这只是候选查询，不等于最终 pick。

### 8.2 rect query

```ts
spatial.rect(rect): readonly SceneItem[]
```

用途：

- marquee selection
- visibleWorld
- lasso / frame / batch action candidate

### 8.3 viewport visible

```ts
spatial.visible(worldRect): SceneVisibility
```

这不应该再扫：

- `graph.nodes`
- `graph.edges`
- `graph.owners.mindmaps`

而应完全从 `SpatialIndex.rect(worldRect)` 派生。

### 8.4 exact id lookup

```ts
spatial.record(key): SpatialRecord | undefined
```

用途：

- 给 feature 直接读当前 geometry 记录
- 避免再去扫 `scene.items`

---

## 9. 为什么它能降低遍历成本

真正的收益不在“查询变快”这五个字，而在于整个系统从“每轮扫全图”变成“只更新受影响记录，只查询局部候选”。

### 9.1 document 更新

例如：

- 新增一个 node
- 删除一个 edge
- 修改一个 node position
- canvas order 改变

正确行为应是：

1. 先定位受影响 graph item
2. 只更新这些 item 对应的 `SpatialRecord`
3. 若只是 order 改变，只更新 `order`，不动 tree
4. 若 viewport 不变，不重新做全量 visible 扫描

### 9.2 draft 更新

例如：

- 节点拖拽
- resize
- 编辑时 size 变化

正确行为应是：

1. 只更新被拖拽 / 被 resize 的 node record
2. 再按 dependency fanout 更新受影响 edge / mindmap / group 记录
3. 只更新 tree 中这些记录
4. visible 只重算当前 viewport 的候选结果

### 9.3 preview 更新

例如：

- mindmap subtree move preview
- root move preview

正确行为应是：

1. 只更新 preview 覆盖到的 spatial keys
2. 不触碰其他无关 node / edge / mindmap

### 9.4 viewport 更新

例如：

- pan
- zoom

正确行为应是：

1. `SpatialIndex` 完全不更新
2. 只调用 `spatial.visible(newVisibleWorld)`
3. 只按 rect query 返回候选

这里是收益最直接的一类，因为当前 viewport 变化最不值得扫全图。

---

## 10. 必须补的依赖 fanout

如果只做一棵空间树，但不知道“一个输入变化会影响哪些 spatial record”，最终还是会退回全量 rebuild。

所以长期最优必须正式建设一层 dependency fanout。

### 10.1 primary input

primary input 是输入变化源：

- `node`
- `edge`
- `mindmap`
- `group`
- `canvas.order`
- `viewport`

### 10.2 affected spatial records

典型 fanout 规则：

- node geometry 改变
  - 影响该 node 自己
  - 影响与该 node 连接的 edge
  - 影响包含该 node 的 mindmap bbox
  - 影响包含该 node 的 group bbox

- edge route 改变
  - 影响该 edge 自己

- mindmap layout 改变
  - 影响该 mindmap 自己
  - 影响其 subtree 中 node
  - 影响相关 edge

- canvas order 改变
  - 只影响 `SpatialOrderState`
  - 不影响 `bounds/tree`

### 10.3 必须显式建模

建议建：

```ts
interface SpatialDependencyState {
  affectedByNode: ReadonlyMap<NodeId, readonly SpatialKey[]>
  affectedByEdge: ReadonlyMap<EdgeId, readonly SpatialKey[]>
  affectedByMindmap: ReadonlyMap<MindmapId, readonly SpatialKey[]>
}
```

这层和 `SpatialRefState` 接近，但语义更明确：

- `ref` 是 identity 定位
- `dependency` 是 fanout 更新

二者可以合并实现，但 contract 语义要分清。

---

## 11. 真正的关键不是树，而是增量更新协议

如果输入 side 仍然只告诉 runtime：

- `session.changed = true`
- `measure.changed = true`

那 `SpatialIndex` 还是会被迫大面积重算。

所以长期最优里，必须把 `impact` 改成 item 级 delta。

### 11.1 最终 impact 形态

建议至少做到：

```ts
interface SpatialImpact {
  document: {
    reset: boolean
    orderChanged: boolean
    nodes: IdDelta<NodeId>
    edges: IdDelta<EdgeId>
    mindmaps: IdDelta<MindmapId>
    groups: IdDelta<GroupId>
  }
  session: {
    draftNodes: IdDelta<NodeId>
    draftEdges: IdDelta<EdgeId>
    previewNodes: IdDelta<NodeId>
    previewEdges: IdDelta<EdgeId>
    previewMindmaps: IdDelta<MindmapId>
  }
  measure: {
    textNodes: IdDelta<NodeId>
    edgeLabels: IdDelta<EdgeId>
  }
  viewport: {
    changed: boolean
  }
}
```

这里的重点是：

- 不是“哪一大类变了”
- 而是“哪些 id 变了”

### 11.2 为什么这是第一性条件

因为 `SpatialIndex` 的增量更新算法一定是：

```txt
impact ids -> dependency fanout -> changed spatial keys -> update tree records
```

如果前面的 `impact ids` 缺失，后面所有层都会退化成全量扫描。

---

## 12. `SpatialIndex` 的更新算法

### 12.1 bootstrap

首次构建可以接受一次 full build：

1. 从 `graph` 生成全部 `SpatialRecord`
2. 建立 `SpatialOrderState`
3. 建立 `SpatialRefState`
4. 建树
5. 用当前 `visibleWorld` 得到 `SceneVisibility`

### 12.2 增量更新

后续每轮更新必须是：

```txt
read impact
  -> resolve affected input ids
  -> fanout to spatial keys
  -> patch records
  -> patch tree
  -> patch order if needed
  -> recompute visibility only for current viewport
```

### 12.3 只改 viewport

```txt
viewport changed
  -> skip graph
  -> skip spatial index update
  -> run spatial.visible(visibleWorld)
```

这是最重要的一条。

### 12.4 只改 order

```txt
canvas order changed
  -> patch SpatialOrderState
  -> keep records/tree
  -> recompute visibility.items ordering
```

这里不应改动：

- record bounds
- tree structure

### 12.5 只改单个 node 几何

```txt
node changed
  -> fanout to node/edge/mindmap/group spatial keys
  -> recompute those records
  -> update tree entries
  -> recompute current visibility
```

这里的核心是：

- 只 patch touched records
- 不 rebuild 全树

---

## 13. `SpatialTree` 的实现原则

长期最优里，不应该先把第三方树库写进 contract。

因为真正稳定的是：

- record model
- update protocol
- query API

而不是底层算法名字。

### 13.1 contract 不暴露算法类型

公共 contract 里只保留：

- `SpatialIndexState`
- `SpatialQueryApi`

树实现保持 runtime 内部私有。

### 13.2 选择标准

只看三件事：

1. 支持 point / rect broad phase 查询
2. 支持增量 insert / remove / update
3. 对高频 draft 变化稳定

### 13.3 实施顺序

真正长期最优的顺序是：

1. 先把 `record/ref/dependency/impact/query` 结构搭好
2. 第一版可以先用 `records + touched scan`
3. 再替换成真正的动态空间树

原因是：

- 如果前面的协议没建立，直接上树也救不了全量扫描
- 如果前面的协议已经对了，树替换是局部实现细节

---

## 14. Scene 如何收敛

最终 `scene` 不应再是：

```ts
scene: {
  items
  visible
  spatial
  pick
}
```

而应收敛为：

```ts
scene: {
  order
  visibility
}
query: {
  spatial
}
```

含义非常明确：

- `scene.order`
  - reactive render order truth
- `scene.visibility`
  - reactive visible truth
- `query.spatial`
  - imperative spatial query truth

这样做的好处是：

1. 响应式发布面变小
2. 查询能力成为正式 runtime surface
3. scene 的职责清晰，不再混入内部索引实现

---

## 15. Editor 侧如何消费

`whiteboard-editor` 最终只能通过正式 query API 做空间查询。

例如：

```ts
editor.graph.query.spatial.point(point)
editor.graph.query.spatial.rect(rect)
editor.graph.query.spatial.visible(worldRect)
editor.graph.query.spatial.record(key)
```

典型使用场景：

- marquee selection 候选
- viewport visible
- 世界坐标区域批量操作
- hover candidate 粗筛
- 几何邻近对象粗筛

这里明确禁止再出现：

- editor feature 内直接扫 `graph.nodes`
- editor feature 内直接扫 `scene.items`
- editor/react 内自己拼一份 spatial helper

---

## 16. 最重要的性能收益点

如果方案正确，收益主要来自下面四个地方。

### 16.1 viewport move 不再扫全图

这是最高频、也最容易浪费的一类。

优化后应变成：

- 不改 graph
- 不改 spatial records/tree
- 只做 rect query

### 16.2 draft edit 不再触发整图 scene 扫描

例如拖拽一个节点时：

- 只更新该节点及其依赖的 spatial records
- 不再重新扫所有 nodes / edges / mindmaps

### 16.3 measure 回流不再放大全图成本

例如文本编辑时某个 node 的 size 变化：

- 只更新这个 node 的 spatial record
- 如果是 mindmap，再更新其相关 subtree / bbox 依赖
- 而不是重新遍历整图 scene

### 16.4 大图 marquee 不再全量 filter

以前常见做法是：

- 遍历所有 node/edge
- 判断是否与 rect 相交

优化后应变成：

- 先用 tree 找候选
- 再只对候选做精确判定

---

## 17. 需要同步删除的旧模式

为了避免系统回退，下面这些模式必须一起删除：

- `scene.spatial` 作为 published 数组字段
- 任何 `visible -> spatial` 的派生链
- 任何 `scene.items.filter(...)` 做空间查询的逻辑
- 任何 feature 内自行扫描 `graph.nodes / graph.edges`
- 任何 editor/react 内部的二次 spatial cache

如果这些旧路径还保留，最后一定会出现：

- 新索引没人真正依赖
- 查询逻辑双轨
- 一边增量，一边全量

那这次重构就没有意义。

---

## 18. 最终实施顺序

### 第一步

把 `scene` contract 改成：

- `scene.order`
- `scene.visibility`

并从 published snapshot 中移除：

- `scene.spatial`
- `scene.pick`

### 第二步

在 `editor-graph runtime` 内引入正式 `query.spatial` 状态和 API。

### 第三步

建立 `SpatialRecord / SpatialRef / SpatialDependency / SpatialImpact` 这四层协议。

### 第四步

重写 `scene` phase：

- 先 patch spatial index
- 再由 spatial index 求 visible

### 第五步

把 editor 内所有 marquee / visible / geometry candidate 查询改为只走 `query.spatial`。

### 第六步

删除旧的全量扫描路径。

### 第七步

最后再替换底层 `SpatialTree` 算法实现，确保在不改 public API 的前提下进一步提升大图性能。

---

## 19. 结论

这次重写的核心不是“做一个树”，而是把白板图上的空间查询从松散的数组遍历，收敛成一套正式的、增量可维护的 runtime capability。

最终长期最优形态应是：

1. `whiteboard-engine` 继续只负责 document facts/relations
2. `whiteboard-editor-graph` 拥有唯一的 `SpatialIndex`
3. `scene` 只发布 `order + visibility`
4. `query.spatial` 作为正式 imperative API 暴露
5. `pick` 继续留在 `whiteboard-react` 的 `PickRegistry`
6. document / draft / preview / measure 更新都通过 item 级 impact + dependency fanout 只 patch 局部 spatial records
7. viewport 更新只做 rect query，不再扫全图

只有做到这一层，白板在节点数上来以后，文档更新和临时态更新时的计算成本才会真正稳定下来，而不是继续被各种 `filter/map/forEach` 的全量扫描放大。

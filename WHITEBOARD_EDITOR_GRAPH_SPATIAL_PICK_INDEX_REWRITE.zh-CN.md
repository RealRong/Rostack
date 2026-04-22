# `whiteboard-editor-graph` 的 `spatial / pick` 索引层设计

## 1. 背景

当前 `whiteboard-editor-graph` 的 `scene` 发布里虽然已经有：

- `visible`
- `spatial`
- `pick`

但这三者还没有真正拉开职责。

现在的典型问题是：

1. `spatial` 基本只是 `visible nodeIds / edgeIds / mindmapIds` 的别名，并不是真正可查询的空间索引。
2. `pick` 只是 `visible.items` 的再投影，并不具备 point / rect / stack / topmost 这类拾取语义。
3. `whiteboard-react` 的 pointer 主路径仍然主要依赖 DOM `PickRegistry`，图语义 pick truth 没有真正统一到 `editor-graph`。
4. viewport visible、marquee、hover、pointer hit、未来 canvas/native renderer 命中语义没有统一底层。

这会带来几个长期问题：

- scene 有字段，但没有真正的索引能力
- pointer 语义被 DOM 结构绑死
- hit-test 逻辑容易分散到 editor / react / feature 内部
- 一旦 graph layout 或 geometry 变化，fanout 很难稳定

长期最优里，`scene` 不能只是“给 React 渲染看看”的 view，它必须同时承担：

- render order truth
- visibility truth
- world-space query truth
- semantic pick truth

也就是说，`scene` 必须真正拥有一层正式的 `spatial / pick` 索引。

---

## 2. 目标

`spatial / pick` 索引层的最终目标只有四条：

1. `whiteboard-editor-graph` 成为图上空间查询与图语义拾取的唯一发布方。
2. `whiteboard-editor` 不再自己扫描 graph，也不再拼任何 hit-test helper。
3. `whiteboard-react` 的 DOM pick 只保留为宿主事件桥能力，不再承担 graph truth。
4. 所有可见性、框选、点选、hover、topmost hit、stack hit 都建立在同一份 projection snapshot 上。

非目标也要明确：

- 不做 repo 级共享 `indexes` 包
- 不把 `spatial / pick` 放回 `whiteboard-editor`
- 不照搬 `dataview-engine/src/active/index` 的 demand/search/sort/bucket/calculation 体系
- 不把 UI chrome 的 DOM hit 区和 graph scene hit 区混成一个索引

---

## 3. 边界

索引放哪里，只看“谁拥有那份真相的发布权”。

### 3.1 `whiteboard-engine`

`whiteboard-engine` 只负责 document truth 的关系索引，例如：

- `node -> owner`
- `owner -> nodeIds`
- `edge -> source / target`
- `group -> items`
- `parent -> children`

这些是持久态事实，不属于 `scene spatial / pick`。

### 3.2 `whiteboard-editor-graph`

`whiteboard-editor-graph` 负责 live projection truth：

- projected node / edge / owner geometry
- render order
- visibility
- spatial query
- graph item semantic pick

因此 `spatial / pick` 必须放在这里。

### 3.3 `whiteboard-editor`

`whiteboard-editor` 只消费 `editor-graph` 已发布结果：

- pointer 输入
- session 状态
- action / write orchestration

它不再拥有：

- graph hit-test helper
- selection 框选扫描器
- scene query 二次缓存

### 3.4 `whiteboard-react`

`whiteboard-react` 保留宿主侧 DOM bridge：

- pointer event capture
- DOM overlay / panel / handle 元素绑定
- `element -> pick` 的宿主映射

但它不拥有 graph item 的最终命中真相。

长期最优的职责划分是：

- DOM overlay pick：宿主层
- graph scene pick：`editor-graph`

如果未来切到纯 canvas renderer，graph pick 不应该重写，只需要替换宿主桥。

---

## 4. 先把三个概念拆开

目前最大的问题不是“没有 `spatial / pick` 字段”，而是把三个概念混成了一层。

### 4.1 `order`

`order` 表示图上 item 的渲染顺序与 z 语义。

它回答的问题是：

- 哪些 item 在 scene 中出现
- 它们的 canonical 顺序是什么
- topmost 判定应该以谁为准

### 4.2 `visibility`

`visibility` 表示在当前 viewport 下哪些 item 进入可见集。

它回答的问题是：

- 当前 viewport 下哪些 graph item 需要参与渲染
- 当前 viewport 下 marquee / hover / lazy render 的候选范围是什么

### 4.3 `spatial`

`spatial` 是 world-space broad phase 索引。

它回答的问题是：

- 给一个 `Point`，有哪些 bounds 命中候选
- 给一个 `Rect`，有哪些 item 与之相交
- 给一个 viewport rect，visible items 是谁

### 4.4 `pick`

`pick` 是 semantic narrow phase 索引。

它回答的问题是：

- 某个点最终命中的是哪个 node / edge / mindmap
- topmost target 是谁
- 命中的是 body、field、label、path，还是别的语义分区
- 候选栈顺序是什么

因此最终关系应该是：

1. `order` 给出全局 canonical 顺序
2. `spatial` 做 broad phase
3. `pick` 在 broad phase 候选之上做 semantic narrow phase
4. `visibility` 由 `spatial + viewport` 得出

而不是：

- `visible` 派生 `spatial`
- `visible.items` 派生 `pick`

---

## 5. 最终 contract 形态

不需要 TypeScript `namespace` 语法。

长期最优是把层级直接做进类型内部，让 contract 自己表达职责。

建议把当前：

```ts
scene: {
  items
  visible
  spatial
  pick
}
```

重写为：

```ts
interface SceneSnapshot {
  layers: readonly SceneLayer[]
  order: SceneOrder
  visibility: SceneVisibility
  query: SceneQuery
}

interface SceneOrder {
  items: readonly SceneItem[]
  z: ReadonlyMap<SceneItemKey, number>
}

interface SceneVisibility {
  world?: Rect
  items: readonly SceneItem[]
  nodes: readonly NodeId[]
  edges: readonly EdgeId[]
  mindmaps: readonly MindmapId[]
}

interface SceneQuery {
  spatial: SpatialIndex
  pick: PickIndex
}
```

其中 `SceneItemKey` 只是内部稳定 key，例如：

```ts
type SceneItemKey = string
```

例如：

- `node:${nodeId}`
- `edge:${edgeId}`
- `mindmap:${mindmapId}`

### 5.1 `SpatialIndex`

`SpatialIndex` 不应该只是 id 数组，而应是正式的 query state：

```ts
interface SpatialIndex {
  records: ReadonlyMap<SceneItemKey, SpatialRecord>
  tree: SpatialTree
}

interface SpatialRecord {
  item: SceneItem
  order: {
    z: number
    canvas: number
  }
  geometry: {
    bounds: Rect
    hitBounds: Rect
  }
  flags: {
    hidden: boolean
    interactive: boolean
  }
}
```

说明：

- `bounds` 是几何真实包围盒
- `hitBounds` 是 broad phase 命中包围盒，可以为 edge path 做阈值膨胀
- `tree` 是 runtime 私有空间树，不要把具体算法类型暴露进公共 contract

### 5.2 `PickIndex`

`PickIndex` 应保存 semantic target，而不是只保存 item ref：

```ts
interface PickIndex {
  targets: ReadonlyMap<SceneItemKey, PickTarget>
  order: readonly SceneItemKey[]
}

interface PickTarget {
  item: SceneItem
  order: {
    z: number
    canvas: number
    local: number
  }
  geometry: {
    bounds: Rect
    shapes: readonly PickShape[]
  }
  flags: {
    interactive: boolean
    selectable: boolean
  }
}
```

`PickShape` 按语义分型：

```ts
type PickShape =
  | NodePickShape
  | EdgePickShape
  | MindmapPickShape
```

每种 shape 内部继续按职责分层，而不是字段平铺。

例如 node：

```ts
interface NodePickShape {
  kind: 'node'
  nodeId: NodeId
  part: 'body' | 'field' | 'title'
  geometry: {
    bounds: Rect
  }
  payload: {
    field?: 'text' | 'title'
  }
}
```

例如 edge：

```ts
interface EdgePickShape {
  kind: 'edge'
  edgeId: EdgeId
  part: 'path' | 'label' | 'body'
  geometry: {
    bounds: Rect
    route?: readonly Point[]
  }
  payload: {
    labelId?: string
  }
}
```

关键点是：

- `SpatialIndex` 负责“可能命中谁”
- `PickIndex` 负责“语义上命中了谁”

---

## 6. 运行时结构

`whiteboard-editor-graph` 内部不要继续把 scene 全塞在一个 `runtime/scene.ts` 里。

长期最优建议拆成一个明确的 `scene/` 子域：

```txt
whiteboard/packages/whiteboard-editor-graph/src/scene/
  contracts.ts
  order.ts
  spatial.ts
  pick.ts
  visibility.ts
  query.ts
  build.ts
```

职责如下：

- `contracts.ts`
  - scene index contract
- `order.ts`
  - 从 document canvas order + graph item 生 `SceneOrder`
- `spatial.ts`
  - 生成 `SpatialRecord`
  - 构建 / 更新 `SpatialTree`
- `pick.ts`
  - 生成 `PickTarget`
  - point / stack / topmost narrow phase
- `visibility.ts`
  - 基于 `SpatialIndex + viewport.visibleWorld` 求 `SceneVisibility`
- `query.ts`
  - 对外暴露纯函数查询 API
- `build.ts`
  - scene phase 总装配

这样做有两个好处：

1. 依赖边界直接可见
2. `spatial` 与 `pick` 各自可以独立演进，不再互相伪装成 view 字段

---

## 7. 构建流程

`scene` phase 的最终内部流程应是：

```txt
graph -> order -> spatial -> visibility
               \-> pick
```

更具体一点：

### 7.1 构建 `SceneOrder`

输入：

- `document.root.canvas.order`
- `graph.nodes`
- `graph.edges`
- `graph.owners.mindmaps`

产出：

- 全量 `SceneItem[]`
- 每个 item 的 canonical `z`

注意：

- `order` 只描述全局 scene item 顺序
- 不要把 visibility 混进来

### 7.2 构建 `SpatialRecord`

对每个 graph item 生成一条空间记录：

- node 使用 `layout.bounds`
- edge 使用 `route.bounds`
- mindmap 使用 `tree.bbox`

并补齐：

- `hitBounds`
- `interactive`
- `hidden`
- `z`

### 7.3 构建 `SpatialTree`

用全部 `SpatialRecord.hitBounds` 建立 broad phase 空间树。

这里的重点不是“选哪种树”，而是 contract 不暴露算法。

最终可以使用：

- 动态 AABB tree
- R-tree
- RBush 风格实现

都可以。

但 `SceneSnapshot` 不能泄漏第三方实现类型。

### 7.4 构建 `SceneVisibility`

`visibility` 不能再全量扫 graph。

正确路径是：

1. 读取 `viewport.visibleWorld`
2. 用 `SpatialIndex` 查 rect 相交候选
3. 过滤 `hidden`
4. 按 `SceneOrder.z` 排序回 canonical item 顺序
5. 生成：
   - `items`
   - `nodes`
   - `edges`
   - `mindmaps`

也就是说，`visibility` 是 `spatial` 的消费者，而不是 `spatial` 的上游。

### 7.5 构建 `PickTarget`

`PickTarget` 从 graph item 语义中来：

- node：
  - body
  - text/title field
- edge：
  - path
  - label
- mindmap：
  - 视为 node owner 级语义入口，或只保留 node topic 级 pick

这里必须明确：

`pick` 是语义模型，不是 DOM element ref 列表。

### 7.6 产出最终 `SceneQuery`

最终 scene 不是：

- `visible + visible-derived spatial + visible-derived pick`

而是：

- `order`
- `visibility`
- `query.spatial`
- `query.pick`

---

## 8. 查询 API

长期最优不要让 consumer 直接手写扫 `Map/Array`。

应该由 `whiteboard-editor-graph` 提供一组固定 query 函数，围绕 `SceneQuery` 运行。

例如：

```ts
sceneQuery.visibility.contains(scene.visibility, item)
sceneQuery.spatial.point(scene.query.spatial, point)
sceneQuery.spatial.rect(scene.query.spatial, rect)
sceneQuery.pick.point(scene.query, point)
sceneQuery.pick.stack(scene.query, point)
sceneQuery.pick.top(scene.query, point)
sceneQuery.pick.marquee(scene.query, rect, { match: 'touch' | 'contain' })
```

这里故意不让外部直接碰 `tree`，原因是：

- 保留内部实现更换自由
- 避免 editor/react 各自写一份 query 逻辑
- 保持 query 语义集中

---

## 9. `pick` 的真正语义

`pick` 不是简单的 “point 落到谁的 bounds 上”。

最终应分成两级：

### 9.1 broad phase

先用 `SpatialIndex` 找到 point 周围可能命中的 item。

例如：

- 点在 node bounds 内
- 点接近 edge path 的 hitBounds
- 点在 label bounds 内

### 9.2 narrow phase

再按 `PickTarget.shapes` 做语义判定：

- node body 命中
- node field 命中
- edge label 命中
- edge path 命中

最后按统一顺序决出结果：

1. `z` 高的优先
2. 同 z 下按 `canvas` 顺序
3. 同 item 内按 `local` part 优先级
4. 若仍冲突，再按距离或面积规则决策

这样得到的 `pick.top()` 才是稳定的。

---

## 10. 与 DOM `PickRegistry` 的关系

这里必须明确切开。

### 10.1 DOM `PickRegistry` 保留什么

DOM `PickRegistry` 只保留宿主事件桥能力：

- DOM overlay
- 面板
- transform handles
- selection box DOM 元素
- 需要直接依赖元素树的交互细节

### 10.2 `scene.query.pick` 负责什么

`scene.query.pick` 负责 graph scene 语义：

- node
- edge
- mindmap graph item
- marquee / world rect selection
- 非 DOM 渲染器的命中

### 10.3 最终 pointer 路径

长期最优的 pointer 解析应是：

1. 先问宿主 DOM overlay 有没有命中
2. 如果没有，再问 `scene.query.pick.top(worldPoint)`
3. 如果还没有，才是 `background`

这样 graph truth 不再依赖 DOM 结构。

---

## 11. 更新与 fanout

如果 `spatial / pick` 只是 view 数组，就很难做对增量 fanout。

正式索引层应让 scene change 至少细分为：

```ts
interface SceneChange {
  order: Flags
  visibility: Flags
  query: {
    spatial: Flags
    pick: Flags
  }
}
```

这样可以得到清晰的更新语义：

### 11.1 只改 viewport

变化：

- `visibility` 变化

不应该变化：

- `order`
- `query.spatial`
- `query.pick`

### 11.2 node / edge / mindmap 几何变化

变化：

- `query.spatial`
- `visibility`
- `query.pick`（如果 pick geometry 受影响）

不一定变化：

- `order`

### 11.3 canvas order 变化

变化：

- `order`
- `visibility.items` 顺序
- `query.pick.order`

不一定变化：

- `query.spatial.records.bounds`

这比现在“一整个 `scene` 变了”的 fanout 粒度要稳定得多。

---

## 12. 算法选择原则

长期最优不是先决定“用什么树”，而是先把 contract 和语义分清。

算法选择只遵守三条原则：

1. 支持 point / rect broad phase 查询
2. 支持频繁几何更新
3. 不泄漏到底层 contract

因此最终可以按实现复杂度分阶段：

### 12.1 第一阶段

先用统一 `SpatialRecord[] + O(n)` 查询把 contract 跑通。

这一步的意义是：

- 先把 `spatial / pick / visibility` 责任拆清
- 先让 editor/react 不再自己扫 graph

### 12.2 第二阶段

把 `O(n)` broad phase 替换为真正的 `SpatialTree`。

此时外部 consumer 完全不需要改，因为 query API 不变。

长期最优上，这种顺序比一开始就把第三方树类型写进 contract 更稳。

---

## 13. 不要把什么放进 `spatial / pick`

为了避免 scene index 再次膨胀，下面这些不应该混进来：

- toolbar / panel / context menu hit
- selection box resize handle
- 纯 DOM 编辑态 caret hit
- 宿主组件树的 element ref
- store selector

如果未来确实需要 UI overlay 的 query，也应另开：

- `ui.query.pick`

而不是污染 `scene.query.pick`。

---

## 14. 推荐实施顺序

### 第一步

先重写 `SceneSnapshot` contract：

- `items -> order.items`
- `visible -> visibility`
- `spatial / pick -> query.spatial / query.pick`

### 第二步

把 `scene` phase 内部拆成：

- `order`
- `spatial`
- `visibility`
- `pick`

### 第三步

先用简单实现完成正式 query API：

- point
- rect
- top
- stack
- marquee

### 第四步

让 `whiteboard-editor` 的 marquee / graph hit-test 改为只消费 `editor-graph` scene query。

### 第五步

让 `whiteboard-react` 的 pointer 路径切成：

- DOM overlay pick
- fallback 到 graph scene pick

### 第六步

删除旧的：

- `scene.visible` 驱动的伪 `spatial`
- `visible.items` 驱动的伪 `pick`
- editor/react 内部重复 graph hit-test helper

---

## 15. 最终结论

`spatial / pick` 索引层的本质不是给 `scene` 多挂两个字段，而是把白板图上的空间查询真相收回 `whiteboard-editor-graph`。

长期最优的最终形态应是：

1. `scene.order` 负责全局顺序
2. `scene.visibility` 负责 viewport 可见集
3. `scene.query.spatial` 负责 broad phase world-space 查询
4. `scene.query.pick` 负责 semantic narrow phase 命中
5. `whiteboard-editor` 只消费，不再自建索引
6. `whiteboard-react` 的 DOM registry 只做宿主桥，不再承担 graph truth

这样白板后续无论是：

- marquee
- hover
- click hit
- topmost pick
- future canvas renderer
- 复杂 owner layout 下的 scene fanout

都会建立在同一份一致发布的 graph scene truth 上。

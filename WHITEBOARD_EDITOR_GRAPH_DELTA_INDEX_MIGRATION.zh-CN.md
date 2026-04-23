# `whiteboard-editor-graph` 的 delta / index 分层迁移方案

## 1. 这份文档要解决什么

根目录已经有两份长期方案：

- `WHITEBOARD_EDITOR_GRAPH_DELTA_REWRITE.zh-CN.md`
- `WHITEBOARD_EDITOR_GRAPH_SPATIAL_PICK_INDEX_REWRITE.zh-CN.md`

它们分别回答了：

- delta 长期最优应该长什么样
- spatial index 长期最优应该长什么样

但它们都更偏“最终形态”，还没有把当前代码库如何迁过去拆成一条可执行路线。

这份文档只回答迁移问题：

> 如何在不把 `whiteboard-editor-graph` 一次性推翻重写的前提下，逐步建出统一 `UpdateDelta`、正式 `SpatialIndex`，并把 `ui truth` 从 `graph truth / geometry truth` 中拆出来。

这里先明确一条本文默认前提：

> 这次迁移按单轨重构处理；  
> 不保兼容、不保双轨、不保过渡 adapter；  
> 也允许重构过程中的某些提交或某个阶段临时无法跑通。

也就是说，下面的“阶段”只是重构顺序，不是要求每一阶段都可独立上线或可独立保持运行。

最终目标是同时满足四件事：

1. `ui` 和 `geometry` 分离。
2. `delta` 能驱动 graph 的精确 patch。
3. `delta` 能驱动索引的精确 patch。
4. `SpatialIndex` 成为 `visible / marquee / hover candidate / query` 的统一底座。

---

## 2. 最终目标

最终我们要收敛到下面这条更新链：

```txt
InputDelta
  -> planner scope
  -> patchGraph(...)
       -> GraphDelta.entities
       -> GraphDelta.geometry
  -> patchSpatial(...)
       -> SpatialDelta.records
       -> SpatialDelta.visible
  -> patchUi(...)
       -> PublishDelta.ui
  -> publish(...)
       -> PublishDelta.graph
       -> PublishDelta.scene
```

关键点不是“有 delta”这么简单，而是：

- 一次 update 只有一份统一 `UpdateDelta`
- `graph delta` 和 `spatial delta` 是这份事务 delta 的 namespace
- graph patch 不再全量重建再 diff
- spatial patch 不再自己扫 whole graph 推 touched set
- publisher 最终不再依赖全量 equality compare 推 change

### 2.1 最终分层

最终应明确分成三层 truth：

#### `graph truth`

只包含：

- document 投影后的实体 truth
- geometry / layout / route / bounds / connectors
- scene order 依赖的图元 truth

不包含：

- selected
- hovered
- editing caret
- active route handle
- marquee
- guides
- draw preview

#### `ui truth`

只包含：

- selection
- hover
- chrome overlays
- edit session 显示态
- preview affordance
- active route / active handle / edit chrome

#### `index truth`

只包含：

- 空间查询记录
- order token
- rect / bounds
- visible dirty bit

它是 runtime 内部能力，不是普通 published snapshot 字段。

---

## 3. 当前代码离目标差在哪里

### 3.1 `InputDelta` 已经有了，但还只是 planner seed

这是现状里最接近长期目标的一部分。

当前已经有按 consumer 分组的 `InputDelta`：

- `document`
- `graph`
- `ui`
- `scene`

也已经有：

- `graph.mindmaps.tick`
- document `IdDelta`
- preview/edit/draft 级别的 touched ids

所以迁移不是从零开始。

但现在 `InputDelta` 主要只用于 planner 判断 phase 要不要跑，还没有进一步变成：

- graph patch scope
- spatial patch scope
- publish patch scope

也就是说：

> 现在只有“按 delta 调度”，还没有“按 delta patch”。

### 3.2 `graph truth` 里混了很多 `ui truth`

当前 `NodeView` / `EdgeView` 里混了大量 UI 字段，例如：

- `NodeView.render.selected`
- `NodeView.render.hovered`
- `NodeView.render.editing`
- `NodeView.render.resizing`
- `EdgeView.render.selected`
- `EdgeView.render.activeRouteIndex`
- `EdgeView.render.editingLabelId`
- `EdgeLabelView.editable`
- `EdgeLabelView.caret`

这会直接导致一个结构性问题：

- 只改 selection / hover / edit
- graph family 也会被认为变了
- graph phase 就很难真正静下来

所以文档目标里的“`ui.*` 不再唤醒 graph”不是简单改 planner，而是要先拆 contract。

### 3.3 当前 `graph` phase 仍然是全量构建

现在的 `graph` phase 本质还是：

1. 扫全量 nodes
2. 扫全量 edges
3. 扫全量 mindmaps
4. 扫全量 groups
5. 全量重建 `Map`

因此：

- 单节点 draft
- 单 edge preview
- 单 mindmap tick
- 单 label measure

都会把 graph 整体重跑一遍。

### 3.4 当前 `publisher` 仍然是全量 compare

现在的 `publisher` 仍然主要靠：

- `publishFamily`
- `publishValue`
- equality compare

所以即使上游未来开始 patch，若 publisher 还维持当前模式，增量收益也会被吃掉一大块。

### 3.5 当前 `scene` 还不是正式的 `SpatialIndex`

现在的 `scene` 更像一个 derived snapshot：

- `items`
- `visible`
- `spatial`
- `pick`

但它没有真正的 index state，也没有稳定的增量 record patch 语义。

当前很多 query 仍然是：

- 扫 document list
- 读 graph view
- 再做几何过滤

所以 index 的收益还没有真正落到 editor 热路径上。

### 3.6 仍有少量输入没有按最终目标接通

长期目标要求 host 直接提供精确 seed。

当前虽然已经有相当一部分 seed，但仍有几个缺口要注意：

- hover 还没有作为正式 `ui.hover` 接到 projection runtime
- text / label measure 还没有以最终形态进入 runtime input
- graph fanout 依赖表还不够完整

这不妨碍迁移开始，但意味着不能一步切到最终形态。

---

## 4. 迁移总原则

### 4.1 先拆 contract，再谈性能收益

只要 `graph truth` 里还含 UI 字段，就不可能得到真正稳定的 graph delta。

因此第一优先级不是 index，而是：

- graph/ui 边界切干净

### 4.2 单轨重构，不做兼容层

这次迁移虽然按阶段组织，但实现原则是单轨：

- 不新增兼容 facade
- 不新增 adapter 过渡层
- 不保留 old/new 双实现并行
- 不为了中途可运行保留 fallback compare

如果某个阶段改到一半时：

- 类型暂时不通过
- 测试暂时失败
- React 消费方暂时没跟上

这是允许的。

真正不允许的是：

- 为了让中途跑通，把旧 contract 再包一层继续留着
- 为了让中途跑通，把 old graph publish 和 new delta publish 双轨并行
- 为了让中途跑通，把整图扫描路径长期保留下来

### 4.3 delta 只记“本轮 touched 了什么”

delta 里只放：

- ids
- keys
- flags
- dirty bit

不放：

- `NodeView`
- `EdgeView`
- `SceneSnapshot`
- tree query 中间态

### 4.4 `SpatialIndex` 是 runtime 能力，不是 published snapshot 字段

最终应暴露：

```ts
runtime.query.spatial
```

而不是把整棵 index 树塞进 `snapshot.scene` 去 publish。

### 4.5 阶段只是重构顺序，不是上线边界

本文里的阶段用于组织问题，不表示：

- 每一阶段都必须可运行
- 每一阶段都必须可合并
- 每一阶段都必须保持 API 稳定

如果 runtime contract 改动会连带影响：

- editor read
- input runtime
- React hooks
- view components

那就一起改，不加桥接层。

---

## 5. 最终 contract 目标

### 5.1 `InputDelta`

`InputDelta` 保留当前方向，但继续补齐缺失 seed。

长期目标仍然是：

- `document.*`
- `graph.nodes.*`
- `graph.edges.*`
- `graph.mindmaps.*`
- `ui.*`
- `scene.viewport`

其中只有下面这些允许唤醒 graph patch：

- `document.*`
- `graph.nodes.*`
- `graph.edges.*`
- `graph.mindmaps.*`

下面这些不允许再唤醒 graph：

- `ui.selection`
- `ui.hover`
- `ui.marquee`
- `ui.guides`
- `ui.draw`
- `ui.edit`
- `scene.viewport`

### 5.2 `GraphDelta`

最低需要下面两层：

```ts
interface GraphDelta {
  order: boolean
  entities: {
    nodes: IdDelta<NodeId>
    edges: IdDelta<EdgeId>
    mindmaps: IdDelta<MindmapId>
    groups: IdDelta<GroupId>
  }
  geometry: {
    nodes: ReadonlySet<NodeId>
    edges: ReadonlySet<EdgeId>
    mindmaps: ReadonlySet<MindmapId>
    groups: ReadonlySet<GroupId>
  }
}
```

其中：

- `entities.*`
  - 驱动 graph family publish
- `geometry.*`
  - 驱动 spatial patch fanout

### 5.3 `SpatialDelta`

最低需要：

```ts
interface SpatialDelta {
  order: boolean
  records: IdDelta<SpatialKey>
  visible: boolean
}
```

### 5.4 `UiSnapshot`

`UiSnapshot` 应吸收所有 UI truth：

- selection
- chrome
- hover
- edit chrome
- edge active route / node resize affordance
- preview overlays

### 5.5 `GraphSnapshot`

`GraphSnapshot` 最终只保留：

- base
- owner
- geometry / layout
- route
- label placement
- tree / bbox / connectors

不再保留：

- selected
- hovered
- editing caret
- active route index
- editing label id
- preview overlay state

### 5.6 禁止兼容层

迁移过程中不引入：

- legacy read facade
- graph/ui 混合镜像
- adapter-only contract
- old/new 双轨 publisher

如果 `GraphSnapshot` 和 `UiSnapshot` 的边界改了，就同步改：

- editor read
- input runtime
- React hooks
- view consumption

而不是再做一层临时桥接。

---

## 6. 推荐迁移顺序

下面这条顺序是为了把风险拆散。

### 阶段一：先做 graph / ui 分层，不引入 index

目标：

- 把 UI 字段从 graph 真相里拆出去
- 建立后续 delta / index 所需的干净 truth 边界

这一阶段只做 contract 和 state 重排，不追求性能收益最大化，也不要求中途保持可运行。

#### 6.1 具体动作

1. 在 `whiteboard-editor-graph` 内引入新的内部 graph state contract。
2. 把以下字段迁出 graph state：

- node selected / hovered / editing / resizing
- edge selected / activeRouteIndex / editingLabelId
- label caret / editable
- draw hidden / marquee / guides / preview chrome

3. 同步改 `ui` phase、editor read、input runtime、React 消费侧，让 UI truth 直接从新边界读取。

#### 6.2 这一阶段为什么必须先做

因为只要这些字段还在 graph family 里：

- `ui.selection` 变化就会制造 graph family changed
- graph delta 和 ui delta 无法干净分层
- 后面做精确 patch 会不断被 UI 噪音污染

#### 6.3 阶段完成标准

- 只改 selection / hover / edit / marquee / guides / draw
- graph internal truth 不再包含这些 UI 字段
- graph phase 不需要被这些输入唤醒
- ui 消费链全部切到新 truth

---

### 阶段二：引入 graph patch helpers 和 `GraphDelta`

目标：

- graph 从“全量 build map”改成“patch touched entries”
- graph patch 过程中同步写 `GraphDelta`

#### 6.4 具体动作

1. 给 planner 增加 graph dirty scope。
2. phase 不再只接收“graph 要不要跑”，而是接收：

- touched node ids
- touched edge ids
- touched mindmap ids
- touched group ids

3. 在 `whiteboard-editor-graph` 包内引入低层 patch helper：

- `patchFamilyEntry`
- `patchOrderedIds`
- `markAdded`
- `markUpdated`
- `markRemoved`
- `markGeometryTouched`

4. 把 `graph` phase 改成：

- patch nodes
- fanout 到 dependent edges / mindmaps / groups
- patch edges
- patch mindmaps
- patch groups
- 顺手写 `GraphDelta`

#### 6.5 fanout 最低要求

至少需要显式定义下面几条：

- node geometry touched
  - 影响相关 edge
  - 影响 owner mindmap
  - 影响 owner group
- edge endpoint / route touched
  - 影响 edge geometry
- mindmap layout touched
  - 影响 member node rect
  - 影响 mindmap bbox / connectors
  - 影响 owner group
- group items / member bounds touched
  - 影响 group frame

#### 6.6 这一阶段的约束

这一阶段不为了“中途还能跑”而保留：

- compare-driven graph publish 兜底
- graph 全量 build 的旧实现
- old/new patch helper 双轨

如果 graph patch 改造会把 branch 暂时改到不通过，也是允许的。

#### 6.7 阶段完成标准

- 单节点 draft 不再全量重建 graph map
- 单 edge preview 不再全量重建 graph map
- 单 mindmap tick 只 patch 相关 mindmap subtree
- graph phase 能稳定产出 `GraphDelta`

---

### 阶段三：引入正式 `SpatialIndexState`

目标：

- 在 runtime 内建立真正的 spatial state
- `SpatialIndex` 开始消费 `GraphDelta.geometry`

#### 6.8 具体动作

1. 在 runtime 内新增：

```txt
scene/spatial/
  contracts.ts
  state.ts
  records.ts
  update.ts
  query.ts
```

2. 定义 `SpatialKey`：

- `node:${id}`
- `edge:${id}`
- `mindmap:${id}`
- `group:${id}`

3. 定义 `SpatialRecord` 最低字段：

- key
- kind
- bounds
- order token
- hit/query 所需最小元数据

4. `patchSpatial(...)` 只消费：

- `GraphDelta.entities`
- `GraphDelta.geometry`
- `graph.order`
- `scene.viewport`

5. spatial patch 过程中同步写 `SpatialDelta`。

#### 6.9 这里的边界

`SpatialIndex` 不负责：

- DOM pick
- overlay pick
- React element registry

它只负责 world-space query。

#### 6.10 阶段完成标准

- runtime 内存在正式 `spatial state`
- spatial patch 是 record-level patch，不是全量重建
- viewport 变化只标记 `spatial.visible = true`，不制造假的 record update

---

### 阶段四：让 scene visible 和 editor query 切到 `SpatialIndex`

目标：

- 让 index 开始产生真实收益

#### 6.11 具体动作

1. `scene.visible` 改成从 `runtime.query.spatial.rect(visibleWorld)` 推导。
2. editor 的热点查询改成优先走 spatial：

- marquee candidate
- idsInRect
- hover candidate
- edge connect candidate 预筛选
- viewport visible candidate

#### 6.12 为什么这一阶段不能提前做

如果 graph patch 还没稳定，spatial 只能吃到粗 touched 集合，最后会退化成：

- graph 已经局部 patch
- spatial 还在整图扫

这样收益会被冲掉。

#### 6.13 阶段完成标准

- viewport visible 不再依赖全量扫 graph family
- marquee / rect query 不再默认扫 document list
- hover candidate 有正式 spatial 预筛选

---

### 阶段五：把 publisher 改成 delta-driven

目标：

- 让 publish 成为增量链路的最后一环，而不是重新 compare 一轮

#### 6.14 具体动作

1. 新增 `PublishDelta` 投影层。
2. graph publish 改成优先吃 `GraphDelta.entities.*`。
3. scene publish 改成优先吃：

- `graph.order`
- `spatial.order`
- `spatial.visible`

4. ui publish 改成优先吃 ui patch 自身写出的 publish bits。
5. 删除对应的 equality compare 驱动路径，不保留 fallback。

#### 6.15 阶段完成标准

- graph family publish 不再默认全量 compare
- scene publish 不再默认 compare 整个 `SceneSnapshot`
- ui publish 不再靠“前后整块 compare”推断变化

---

### 阶段六：删除旧实现和死代码

目标：

- 真正完成单轨迁移并清空旧路径

#### 6.16 要删掉的东西

- graph 全量构建旧路径
- publisher compare 驱动旧路径
- editor read / input / React 中只服务旧 contract 的残留代码
- query 中的整图扫描旧路径

#### 6.17 阶段完成标准

- 运行时只有一套 truth
- 运行时只有一套 delta
- graph / index / publish 全部由同一条 delta 链驱动

---

## 7. 迁移时最容易踩的坑

### 7.1 把 UI 拆层做成桥接层泥潭

正确做法是：

- 直接改 runtime truth
- 同步改 editor read / input / React 消费侧
- 不额外发明兼容 contract

不要为了降低单次改动表面积，再加一层 legacy facade 或 adapter。

### 7.2 graph patch 还没稳定就提前硬切 spatial

如果 graph 仍然是粗 patch，spatial 很容易退化成大面积 fanout。

先让 `GraphDelta.geometry` 稳定，再让 index 依赖它。

### 7.3 让 `SpatialIndex` 承担 DOM pick 职责

这会把 graph query 和 DOM 事件系统重新耦合起来。

必须坚持：

- spatial 是 world query
- pick 是 DOM hit

### 7.4 delta 里塞大对象

一旦把 view / record / snapshot 塞进 delta，delta 就会开始变成第二份状态树。

这会直接毁掉后续可维护性。

### 7.5 想做自动推断 fanout 框架

whiteboard 的关键不是“字段有没有变”，而是：

- 它属于 graph 还是 ui
- 它算不算 geometry touched
- 它要 fanout 给谁

这些规则必须继续写在 whiteboard 领域 patcher 里，不能交给通用自动框架猜。

---

## 8. 推荐的阶段性交付物

这里的“交付物”指逻辑里程碑，不表示每一项都必须独立可运行或独立可合并。

### 8.1 第一阶段交付物

- 新的 internal graph/ui contract
- 只改 UI 输入时 graph 不变的测试

### 8.2 第二阶段交付物

- graph patch helpers
- `GraphDelta`
- graph dirty scope planner
- 单节点 / 单 edge / 单 mindmap patch 测试

### 8.3 第三阶段交付物

- `SpatialIndexState`
- `SpatialDelta`
- `runtime.query.spatial`
- index record patch 测试

### 8.4 第四阶段交付物

- visible 改走 spatial
- marquee / idsInRect / hover candidate 改走 spatial
- 热路径回归测试

### 8.5 第五阶段交付物

- `PublishDelta`
- delta-driven publisher
- 删除 compare 驱动 publish

---

## 9. 我建议的实际实施顺序

如果只看“长期正确性”，很多步骤都合理。

但如果看当前代码基和风险，实际落地顺序建议是：

1. 先拆 `ui truth` 和 `graph truth`
2. 再做 `GraphDelta`
3. 再做 `SpatialIndexState`
4. 再让 query 和 visible 切到 index
5. 最后再改 publisher

原因很简单：

- 不先拆层，graph delta 会被 UI 噪音污染
- 不先有 graph delta，index patch scope 不稳定
- 不先让 index 稳定，query 切换会放大风险
- publisher 放到最后，是因为它依赖 graph/index truth 边界已经稳定

---

## 10. 最终结论

这次迁移不应理解成“给现有 graph 补一套 delta”和“给现有 scene 挂一棵树”。

正确理解是：

1. 先把 `graph truth`、`ui truth`、`index truth` 拆开。
2. 用 `InputDelta -> GraphDelta -> SpatialDelta -> PublishDelta` 形成单事务增量链。
3. 让 graph 精确 patch 成为 index 精确 patch 的上游。
4. 让 index query 成为 scene visible 和 editor 热路径查询的底座。

最终系统要达到的不是“多了一份 delta”或“多了一棵 index”，而是：

> 同一份事务 delta，既能驱动 graph 精确更新，也能驱动 index 精确更新；  
> `ui` 不再污染 graph；  
> graph 不再逼着 scene/index 做整图扫描；  
> publish 不再靠全量 compare 回推变化。

这才是这条迁移线真正的终点。

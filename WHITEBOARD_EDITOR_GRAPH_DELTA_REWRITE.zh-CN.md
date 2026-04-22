# `whiteboard-editor-graph` 的单事务 `UpdateDelta` 设计

## 1. 结论先说

长期最优里，`whiteboard-editor-graph` 必须有 delta。

但这个 delta 不应该是：

- `graph` 跑完以后再 diff 一份
- `spatial` 跑完以后再 diff 一份
- `publish` 前后再 diff 一份

最终最优形态应该是：

> 每次 runtime update 只有一份统一的 `UpdateDelta`；  
> `graph delta`、`spatial delta`、`publish delta` 只是这份 delta 里的不同 namespace；  
> 它们都必须在 patch 过程中顺手写出，绝不能在 phase 结束后靠 `prev/next diff` 反推。

换句话说：

- 概念上要分 `graph delta` 和 `spatial delta`
- 实现上不能有两套独立 delta 系统
- 运行时里只能有一份单事务 delta builder

---

## 2. 为什么不能靠 diff

如果 delta 是靠 diff 生成，成本会被放大两次。

### 2.1 先算一遍，再比一遍

最坏路径会变成：

1. 全量算出 next graph
2. 再拿 `prev graph / next graph` 做一轮比较
3. 全量算出 next spatial
4. 再拿 `prev spatial / next spatial` 做一轮比较

这样会把系统重新拖回：

- 先重建
- 再扫描
- 再归纳 delta

本质上和现在全量扫描没有根本区别。

### 2.2 diff 还会逼出更多中间态

为了 diff，系统通常会被迫保留：

- previous state
- next state
- diff temp result

这会导致：

- 内存压力上升
- phase 边界变脏
- 更新链更难理解

### 2.3 对高频临时态尤其差

白板最贵的不是低频 document commit，而是高频临时态：

- 拖拽
- resize
- 文本编辑测量回流
- mindmap preview
- viewport move

这些场景下，delta 如果还靠 diff，本身就会成为热点。

所以结论很明确：

> delta 必须是 patch 副产物，不是 patch 后的分析产物。

---

## 3. 为什么又必须分层

虽然只能有一份 delta，但这份 delta 内部必须分层。

因为这些变化不属于同一个语义层：

- input seed
- graph truth 变化
- spatial index 变化
- publish view 变化

如果只用一份粗粒度的：

```ts
changedIds: Set<string>
```

后果会很差：

- graph phase 不知道哪些只是 geometry touched
- spatial phase 不知道哪些是 order changed
- publish phase 不知道哪些需要对外通知

所以长期最优不是“一份粗 delta”，而是：

```ts
interface UpdateDelta {
  input: ...
  graph: ...
  spatial: ...
  publish: ...
}
```

也就是：

- 一份事务
- 分层 namespace

---

## 4. 最终原则

最终方案必须满足下面七条。

### 4.1 一次 update 只创建一份 delta

每次 `runtime.update(input)`：

- 创建一个空的 delta builder
- 所有 phase 都只写这一个对象
- phase 结束后不再创建第二份 delta

### 4.2 delta 由输入侧直接提供种子

host 输入必须直接告诉 runtime：

- 哪些 document ids 改了
- 哪些 draft ids 改了
- 哪些 preview ids 改了
- 哪些 measure ids 改了
- viewport 是否变化

而不是只给：

- `session.changed = true`
- `measure.changed = true`

### 4.3 graph patch 时顺手产出 `graph delta`

例如 patch node 时就直接登记：

- `nodes.updated.add(nodeId)`
- `geometry.nodes.add(nodeId)`

而不是 patch 完 node map 再回头比。

### 4.4 spatial patch 时顺手产出 `spatial delta`

例如 patch spatial record 时就直接登记：

- `records.updated.add(key)`
- `visibilityDirty = true`

### 4.5 publish change 不再靠全量 equality 扫描推断

对外 publish change 应由 `UpdateDelta` 投影出来，而不是再走一轮大面积 `isEqual`。

### 4.6 delta 不携带大对象

delta 只保存：

- ids
- keys
- flags
- dirty bits

不保存：

- 完整 `NodeView`
- 完整 `EdgeView`
- 完整 `SceneSnapshot`

### 4.7 delta 只表达“本次事务改了什么”

delta 不是历史，不是日志，不是 undo record。

它只服务当前 update 事务里的：

- phase planning
- fanout
- publish

---

## 5. 最终结构

建议直接定义：

```ts
interface UpdateDelta {
  reset: boolean
  input: InputDelta
  graph: GraphDelta
  spatial: SpatialDelta
  publish: PublishDelta
}
```

其中：

- `input`
  - 输入种子
- `graph`
  - graph phase patch 结果
- `spatial`
  - spatial phase patch 结果
- `publish`
  - 对外 change 投影结果

这里要强调：

- `graph delta` 和 `spatial delta` 必须保留
- 但它们是 `UpdateDelta` 的 namespace
- 不是两套平级 runtime 系统

---

## 6. `InputDelta`

`InputDelta` 是唯一的外部输入种子。

它必须由 host/input 侧直接构造，不允许 runtime 自己从 `prev/next input` 再推。

这里最重要的不是“输入原先来自哪个容器”，而是：

> 这个输入会唤醒哪一层 patch。

所以长期最优里，不应该再按：

- `session`
- `measure`
- `viewport`
- `interaction`
- `clock`

这种原始来源分组。

而应该按 projection consumer 分组：

- `document`
- `graph`
- `ui`
- `scene`

这里允许一份外部事件同时 seed 多个 consumer。

例如：

- node 文本编辑
  - 会 seed `graph.nodes.edit`
  - 也会 seed `ui.edit`

这不是重复建模，而是在显式表达：

- 哪一部分影响 graph truth
- 哪一部分只影响 ui truth

建议形态：

```ts
interface InputDelta {
  document: {
    reset: boolean
    order: boolean
    nodes: IdDelta<NodeId>
    edges: IdDelta<EdgeId>
    mindmaps: IdDelta<MindmapId>
    groups: IdDelta<GroupId>
  }
  graph: {
    nodes: {
      draft: IdDelta<NodeId>
      preview: IdDelta<NodeId>
      text: IdDelta<NodeId>
      edit: IdDelta<NodeId>
    }
    edges: {
      draft: IdDelta<EdgeId>
      preview: IdDelta<EdgeId>
      label: IdDelta<EdgeId>
      edit: IdDelta<EdgeId>
    }
    mindmaps: {
      preview: IdDelta<MindmapId>
      tick: ReadonlySet<MindmapId>
    }
  }
  ui: {
    selection: boolean
    hover: boolean
    marquee: boolean
    guides: boolean
    draw: boolean
    edit: boolean
  }
  scene: {
    viewport: boolean
  }
}
```

字段含义也要明确：

- `document`
  - 持久态 document delta
- `graph`
  - 会直接影响 graph patch 的临时态 seed
- `ui`
  - 只唤醒 ui patch，不应触发 graph
- `scene`
  - 只唤醒 scene/visibility patch，不应触发 graph

这里有三条边界必须写死：

1. `scene.viewport` 只影响 scene，不影响 graph。
2. `ui.selection / ui.hover / ui.marquee / ui.guides / ui.draw` 只影响 ui，不影响 graph。
3. 时间驱动输入不能再是粗 `clock: boolean`，只能是面向 graph entity 的定向 seed，例如 `graph.mindmaps.tick`。

### 6.4 哪些字段允许唤醒 graph

长期最优里，只有下面这些输入种子可以唤醒 graph patch：

- `document.*`
- `graph.nodes.*`
- `graph.edges.*`
- `graph.mindmaps.*`

而下面这些不允许再唤醒 graph：

- `ui.selection`
- `ui.hover`
- `ui.marquee`
- `ui.guides`
- `ui.draw`
- `scene.viewport`

如果后续实现里这些字段还能让 graph 脏掉，就说明 graph/ui/scene 边界还没有切干净。

关于你指出的两个具体点，这里直接定结论：

### 6.1 为什么不用 `session / measure / interaction / clock`

因为那是在按“输入来自哪里”建模，而不是按“谁消费这个输入”建模。

对白板运行时来说，真正重要的是：

- 哪些输入会唤醒 graph patch
- 哪些输入只唤醒 ui
- 哪些输入只唤醒 scene

如果继续按原始来源分组，planner 和 patcher 会一直被迫跨多个 namespace 做 join，结构会很别扭。

### 6.2 `graph.edges.label` 是否保留

如果 edge label 的：

- size
- placement
- rect
- mask
- bounds

仍然属于 `EdgeView` 的一部分，那 `graph.edges.label` 就必须保留。

因为这时 label measurement 会直接影响 graph 结果，而不是只影响 ui。

但它不应表现为“measure 整体触发 projection”，而应表现为：

- 只触发 `touched edgeIds` 的 graph patch

如果未来 edge label 几何被整体移出 `EdgeView`，那就直接删除 `graph.edges.label`，而不是重新引入一个泛化的 `measure` namespace。

### 6.3 `graph.mindmaps.tick` 是什么

当前 `clock` 真正会影响 graph 的，本质上只是时间驱动的 mindmap enter 动画。

所以长期最优里不应该保留：

```ts
clock: { changed: boolean }
```

而应该收敛成：

```ts
graph: {
  mindmaps: {
    tick: ReadonlySet<MindmapId>
  }
}
```

也就是说：

- 不是“时间变了，所以 graph 变了”
- 而是“这些 mindmap 正在被时间驱动，需要 patch”

### 为什么 `InputDelta` 是第一性条件

因为后面所有增量都建立在它上面：

```txt
input delta
  -> graph touched ids
  -> spatial touched keys
  -> publish change
```

如果 `InputDelta` 不精确，后面每一层都会退化成大面积扫描。

---

## 7. `GraphDelta`

`GraphDelta` 是 graph phase patch graph state 时同步写出的结果。

建议直接分两类：

1. entity 生命周期
2. geometry / layout touched

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

### 为什么要把 `entities` 和 `geometry` 分开

因为它们的下游用途不同。

#### `entities`

用于：

- graph family publish
- add/update/remove state patch
- 生命周期管理

#### `geometry`

用于：

- spatial fanout
- visible invalidation
- 几何相关派生

如果把两者混成一个 `updatedIds`，后面会很难判断：

- 这次只是文字颜色变了
- 还是 geometry 真的变了

长期最优里，这个区分必须显式存在。

### `GraphDelta` 应该如何产生

举例：

#### patch node view

```txt
patchNode(nodeId)
  -> if add: graph.entities.nodes.added.add(nodeId)
  -> if remove: graph.entities.nodes.removed.add(nodeId)
  -> if update: graph.entities.nodes.updated.add(nodeId)
  -> if geometry changed: graph.geometry.nodes.add(nodeId)
```

#### patch edge view

```txt
patchEdge(edgeId)
  -> if add/update/remove -> graph.entities.edges.*
  -> if route/bounds changed -> graph.geometry.edges.add(edgeId)
```

#### patch mindmap

```txt
patchMindmap(mindmapId)
  -> graph.entities.mindmaps.*
  -> if layout/bbox/connectors changed -> graph.geometry.mindmaps.add(mindmapId)
```

关键点是：

- 在 patch 点直接写 delta
- 不做后置 diff

---

## 8. `SpatialDelta`

`SpatialDelta` 由 spatial patch 过程写出。

建议形态：

```ts
interface SpatialDelta {
  order: boolean
  records: IdDelta<SpatialKey>
  visible: boolean
}
```

### 含义

- `order`
  - scene order 改了，但未必改 tree bounds
- `records`
  - 哪些 spatial record add/update/remove
- `visible`
  - 当前 viewport visible 是否需要重算

### 为什么不需要更重的 `SpatialDelta`

因为 `SpatialDelta` 的核心职责只有两个：

1. 驱动 spatial 内部 patch
2. 告诉 publish/scene 本轮 visible 是否脏了

它不需要携带：

- tree 节点明细
- rect query 中间结果
- 完整 visible 列表

这些都属于运行时内部过程，不属于 delta。

### `SpatialDelta` 应如何产生

```txt
patchSpatialRecord(key)
  -> if add: spatial.records.added.add(key)
  -> if remove: spatial.records.removed.add(key)
  -> if update: spatial.records.updated.add(key)
  -> spatial.visible = true
```

```txt
patchSpatialOrder()
  -> spatial.order = true
  -> spatial.visible = true
```

```txt
viewport changed
  -> do not touch spatial.records
  -> spatial.visible = true
```

这里再次强调：

- `viewport` 变化不应该制造假的 `SpatialRecord.updated`
- 它只应该让 visible 结果变脏

---

## 9. `PublishDelta`

`PublishDelta` 是对外最终 `Change` 的投影层。

它不是内部 patch 工作集，而是给：

- snapshot 订阅者
- editor facade
- React host

看的最小变化面。

建议形态：

```ts
interface PublishDelta {
  graph: {
    nodes: ReadonlySet<NodeId>
    edges: ReadonlySet<EdgeId>
    mindmaps: ReadonlySet<MindmapId>
    groups: ReadonlySet<GroupId>
  }
  scene: {
    order: boolean
    visible: boolean
  }
  ui: {
    selection: boolean
    chrome: boolean
  }
}
```

### 为什么还要有 `PublishDelta`

因为 runtime 内部 delta 和对外 change 不是一回事。

例如：

- spatial tree patch 了 12 个 key
- 但外部只需要知道 `scene.visible = true`

所以必须把：

- 内部工作集 delta
- 对外发布 change

分开。

### `PublishDelta` 应如何生成

它不应该通过 diff 生成，而应该由已有 delta 投影：

```txt
publish.graph.nodes
  <- graph.entities.nodes.added/updated/removed

publish.scene.order
  <- graph.order || spatial.order

publish.scene.visible
  <- spatial.visible
```

也就是说：

> `PublishDelta` 是从同一份事务 delta 投影出来的，不是额外计算出来的第二份真相。

---

## 10. 运行时执行顺序

最终 update 应是：

```txt
create UpdateDeltaBuilder from input.delta
  -> patch graph, append graph delta
  -> patch spatial, append spatial delta
  -> patch ui, append ui publish bits
  -> publish snapshot using delta-aware patch result
  -> finalize Change from publish delta
```

### 10.1 推荐伪代码

```ts
const delta = createUpdateDelta(input.delta)

patchGraph(runtime.graph, input, delta)
patchSpatial(runtime.query.spatial, runtime.graph, input, delta)
patchSceneVisibility(runtime.scene, runtime.query.spatial, input, delta)
patchUi(runtime.ui, runtime.graph, input, delta)

const result = publish(runtime, delta)
```

这里的关键是：

- `delta` 只创建一次
- 所有 patch 函数只 append
- 没有任何一层再去扫描 whole state 做 diff

---

## 11. Planner 也应该吃 delta，不该再吃粗 flags

当前 whiteboard 的 planner 还是按：

- `document.changed`
- `session.changed`
- `measure.changed`

这种粗粒度 flags 决定 phase。

长期最优里应该改成：

```txt
input delta
  -> planner
  -> decide graph/spatial/visibility/ui patch scopes
```

### 11.1 最终 planner 判断逻辑

#### 只改 viewport

```txt
input.scene.viewport = true
  -> skip graph patch
  -> skip spatial record patch
  -> run visibility derive only
```

#### 只改 node draft

```txt
input.graph.nodes.draft.updated = {nodeId}
  -> patch touched node graph
  -> patch dependent spatial records
  -> recompute visible
```

#### 只改 text measure

```txt
input.graph.nodes.text.updated = {nodeId}
  -> patch touched node graph
  -> patch dependent mindmap/group/edge if geometry changed
  -> patch spatial
  -> recompute visible
```

#### 只改 hover / selection

```txt
input.ui.hover = true
input.ui.selection = true
  -> skip graph patch
  -> skip spatial patch
  -> patch ui only
```

#### 只改动画 tick

```txt
input.graph.mindmaps.tick = {mindmapId}
  -> patch touched mindmap graph
  -> patch dependent spatial records
  -> recompute visible
```

planner 不再决定“整段 graph phase 要不要跑”，而是决定：

- 哪些 patcher 要跑
- patch scope 是什么

---

## 12. 不要让 delta 变成第二套状态树

这是一个很容易踩的坑。

delta 必须保持瘦身。

### 12.1 delta 里不要放

- `NodeView`
- `EdgeView`
- `MindmapView`
- `SpatialRecord`
- `SceneVisibility`

### 12.2 delta 里只放

- ids
- keys
- flags
- dirty bit

### 12.3 为什么

因为一旦 delta 携带大对象，它就会变成：

- 半份 next state
- 半份 patch log

最后复杂度会急剧上升。

delta 只该回答一个问题：

> 本轮事务里，哪些东西被动过。

---

## 13. `IdDelta` 的基础形态

建议统一约束 repo 内所有增量集合都用同一形态：

```ts
interface IdDelta<TId extends string> {
  added: ReadonlySet<TId>
  updated: ReadonlySet<TId>
  removed: ReadonlySet<TId>
}
```

如果某一层只需要 touched set，也可以在 builder 内部先收集：

```ts
interface MutableIdDelta<TId extends string> {
  added: Set<TId>
  updated: Set<TId>
  removed: Set<TId>
}
```

这样好处是：

- graph/spatial/input 全部统一
- 不需要每层发明自己的三元组结构

---

## 14. 基础设施复用边界

带自动收集 delta 的 patch，长期最优里需要有基础设施复用。

但这个复用必须非常克制。

正确方向不是做一个高层“自动 patch / 自动 compare / 自动 fanout 框架”，而是只复用低层 patch/delta 原语，把领域语义 patch 规则继续留在各阶段手写。

### 14.1 为什么不能全手写

如果完全不抽基础设施，很快就会出现重复：

- 每层都手写 `added / updated / removed`
- 每层都手写 dirty flag
- 每层都手写 patch map / patch ordered ids
- 每层都定义自己的 delta builder

这样虽然语义清楚，但工程上会产生大量重复低层样板。

### 14.2 为什么也不能做高层自动框架

如果走另一个极端，试图做：

- 基于 `prev/next` compare 的自动 patch infra
- 基于 Proxy 的 mutation 跟踪
- 通用 “patch object and infer delta” 框架
- 自动 fanout 推断系统

最后一定会回退成：

- 隐式规则很多
- delta 意义不透明
- phase 依赖链变脏
- 为了自动化重新引入 diff

对白板来说，这种抽象是危险的。

因为真正重要的不是“某个对象字段变了没”，而是：

- 这个变化在语义上属于 `graph` 还是 `spatial`
- 它是否算 geometry touched
- 它是否需要 fanout 到 edge / mindmap / group
- 它最终是否需要对外 publish

这些都不可能交给通用自动框架正确推断。

### 14.3 应该沉到基础设施的部分

可以复用、也值得复用的，是低层 delta primitive：

- `IdDelta<TId>`
- `MutableIdDelta<TId>`
- `UpdateDeltaBuilder`
- `markAdded / markUpdated / markRemoved`
- `markFlagChanged`
- `patchMapEntry`
- `patchOrderedIds`
- `finalizeDelta`

这层基础设施只负责：

- 收集 touched ids / keys
- 管理 added / updated / removed
- 管理 flag / dirty bit
- 提供稳定的小粒度 patch 原语

它不负责理解 whiteboard 领域语义。

### 14.4 必须留在各阶段手写的部分

这些规则必须继续显式写在 graph/spatial/ui patcher 里：

- node patch 的语义规则
- edge route 变化是否属于 geometry 变化
- mindmap layout 变化如何 fanout
- group bounds 在什么条件下更新
- spatial record 受哪些 graph touched 影响
- publish change 如何从内部 delta 投影出去

这些都是领域语义，不应该被抽进 shared 自动系统。

### 14.5 最终推荐分层

长期最优建议明确分三层：

1. `shared` 低层 delta primitives
2. `whiteboard-editor-graph` 包内 patch helpers
3. 各 phase 手写语义 patch

形态类似：

```ts
const delta = createUpdateDeltaBuilder()

patchFamilyEntry(...)
patchSpatialRecord(...)

patchNode(nodeId, ctx, delta)
patchMindmap(mindmapId, ctx, delta)
fanoutNodeGeometry(nodeId, ctx, delta)
```

也就是说：

- `delta collection` 是基础设施
- `delta meaning` 必须留在领域 patcher

### 14.6 最终边界判断

判断一段逻辑应不应该抽进基础设施，只看一条：

> 如果它只是在帮助收集 delta、维护小型 patch 原语，就可以复用；  
> 如果它开始决定 whiteboard 语义、geometry 语义、fanout 语义，就必须回到各阶段手写。

---

## 15. 和 `SpatialIndex` 的关系

`SpatialIndex` 不是另一套独立 runtime。

它只是同一条 update 事务里的下游消费者：

```txt
InputDelta
  -> GraphDelta
  -> SpatialDelta
  -> PublishDelta
```

所以设计上必须避免两种错误：

### 错误一

先 patch graph，完全不记 delta；  
然后 spatial 自己再扫 graph 推 touched set。

这会让 graph 增量收益丢失。

### 错误二

graph 一套 delta，spatial 再独立做一套 diff delta。

这会让 delta 系统重复。

正确做法是：

- graph patch 时直接登记 geometry touched
- spatial 只消费这些 touched ids 做 fanout

---

## 16. 对 `publisher` 的最终要求

当前 whiteboard 的 publisher 还是以：

- `publishFamily`
- `publishValue`
- equality compare

为主。

长期最优里，publisher 应该转成：

- 优先吃 `UpdateDelta`
- 只对 touched family 做 patch publish
- 不再默认全量 family compare

### 最终发布思路

```txt
graph family publish
  <- graph.entities.*

scene publish
  <- publish.scene.*

ui publish
  <- publish.ui.*
```

只有在极少数没有 delta seed 的历史残留点，才允许 fallback compare。

而最终形态里，这种 fallback 也应删掉。

---

## 17. 最终实施顺序

### 第一步

先把 `Input.impact` 重写成正式 `InputDelta`。

### 第二步

把 runtime 内部引入统一的 `UpdateDeltaBuilder`。

### 第三步

重写 graph patch：

- 不再全量重建再 publish
- 改成 patch graph state 并顺手写 `GraphDelta`

### 第四步

重写 spatial patch：

- 只消费 `GraphDelta.geometry`
- 顺手写 `SpatialDelta`

### 第五步

重写 planner：

- 从粗 flags 改成 input delta 驱动

### 第六步

重写 publisher：

- 从 equality compare 驱动
- 改成 `PublishDelta` 驱动

### 第七步

删掉所有基于 `prev/next diff` 的补救路径，不留双轨。

---

## 18. 最终结论

`whiteboard-editor-graph` 的长期最优 delta 设计不是：

- graph 一套 delta
- spatial 一套 delta
- publisher 再来一套 change

三套系统各自运行。

也不是：

- 每层先算完 next
- 再各自 diff 出 delta

最终长期最优只有一个答案：

1. 每次 update 只有一份统一 `UpdateDelta`
2. 这份 delta 内部分成 `input / graph / spatial / publish` 四层 namespace
3. `graph delta` 和 `spatial delta` 必须存在，但只是同一事务里的两个工作集
4. 所有 delta 都必须在 patch 过程中顺手产出
5. 不允许 phase 结束后再通过 diff 回推 delta
6. publisher 最终也应由 delta 驱动，而不是由 equality compare 驱动

这样才能同时满足：

- graph 增量
- spatial 增量
- publish 增量
- 高并发临时态下的低成本更新

否则系统最后一定会回退成：

- 上游 patch 一次
- 下游再扫一次
- publish 再比一次

也就不可能真正把白板的实时更新成本压下来。

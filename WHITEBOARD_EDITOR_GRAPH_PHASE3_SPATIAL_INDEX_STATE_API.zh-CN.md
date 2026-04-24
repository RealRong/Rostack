# `whiteboard-editor-graph` 阶段三 `SpatialIndexState / SpatialDelta` 详细设计

## 1. 文档目标

这份文档只讨论迁移总文档里的阶段三：

> 引入正式 `SpatialIndexState`，  
> 让 `SpatialIndex` 开始消费 `GraphDelta.geometry`。

这里不讨论：

- `scene.visible` 正式切到 spatial query
- marquee / hover candidate / idsInRect 的查询切换
- delta-driven publisher
- DOM pick / overlay pick
- 最终 `PublishDelta`

这份文档只回答一个问题：

> 在阶段二已经完成 `graph patch + GraphDelta` 的前提下，  
> 阶段三的 runtime 内部 spatial state、spatial phase、`SpatialDelta`、`runtime.query.spatial` API 应该长什么样。

---

## 2. 硬约束

这份设计继承迁移总文档和前两阶段文档里的前提：

- 单轨重构
- 不保兼容 facade
- 不保 old/new 双实现并行
- 允许重构中途暂时无法跑通

阶段三也继续遵守这一条：

> 不为了“中途还能运行”保留旧整图 spatial rebuild 路径。  
> 不为了“中途还能运行”再造一层 spatial delta adapter。  
> 不为了“中途还能运行”把 scene visible 提前硬切到尚未稳定的 index。

阶段三的基础前提也明确一下：

1. 阶段一已经完成，`graph truth` 和 `ui truth` 已经拆开。
2. 阶段二已经完成，graph phase 已经是 in-place patch。
3. `working.delta.graph` 已经能稳定产出 `GraphDelta`。
4. `projection-runtime` 已经支持 typed `scope / emit`。

---

## 3. 阶段三要解决的核心问题

阶段二之后，当前更新链已经有了干净的 `GraphDelta`，但 scene / query 侧仍然缺一层正式 index runtime。核心问题有三个。

### 3.1 现在还没有正式 `SpatialIndexState`

当前 `scene` 仍然只是一个 derived snapshot：

- `items`
- `visible`
- `spatial`
- `pick`

它不是正式的 index state，也没有稳定的 record patch 语义。

这会带来一个直接问题：

- graph 虽然已经局部 patch
- scene / query 还没有一个可复用的下游增量状态

### 3.2 graph 已经有精确 delta，但 spatial 还没有消费它

阶段二之后，graph patch 已经能写出：

- `GraphDelta.entities.*`
- `GraphDelta.geometry.*`
- `GraphDelta.order`

如果阶段三不把这些直接接进 spatial：

- graph 仍然得不到真正的下游收益
- index 仍然会退化成“再扫一遍 whole graph 推 touched set”

这正是迁移总文档明确要避免的错误。

### 3.3 `runtime.query.spatial` 还不存在

阶段四要把：

- `scene.visible`
- marquee candidate
- hover candidate
- idsInRect

逐步切到 spatial。

但如果阶段三不先把：

```ts
runtime.query.spatial
```

建出来，阶段四就没有一个稳定底座可接。

所以阶段三的第一性目标是：

> 不是先把 visible/query 硬切到 spatial，  
> 而是先把正式 `SpatialIndexState`、`SpatialDelta` 和 `runtime.query.spatial` 建出来。

---

## 4. 阶段三结束后的目标状态

阶段三结束后，应满足下面这条更新链：

```txt
InputDelta
  -> planner graph scope / spatial scope
  -> graph phase patch working.graph
       -> working.delta.graph
       -> emit spatial scope
  -> spatial phase patch working.spatial
       -> SpatialDelta.records
       -> SpatialDelta.visible
  -> ui / scene 暂时仍按现有方式运行
  -> runtime.query.spatial 已可用
```

这里有四个关键边界：

1. graph 是上游，spatial 是下游。
2. spatial phase 的 record patch 必须直接消费 `working.delta.graph`。
3. 阶段三只建立正式 index state，不提前切 scene visible/query 消费链。
4. `SpatialIndex` 是 runtime 内部能力，不是 published snapshot 字段。

也就是说：

> 阶段三的核心产物不是 visible 改造，  
> 而是让同一份 graph patch 事务能继续驱动正式 spatial patch。

---

## 5. 当前代码结构对阶段三意味着什么

先把阶段二之后的几个事实写清楚：

### 5.1 `working.delta.graph` 已经是正式上游

阶段二以后，graph phase 不再需要对外重新 encode 一份 touched ids。

对 spatial 来说，当前最正确的输入就是：

- `working.graph`
- `working.delta.graph`

前者提供当前 graph truth。  
后者提供本轮事务里哪些 entity / geometry / order 真正 touched 了。

### 5.2 spatial phase 不应该重新扫 whole graph 推 touched set

阶段三如果让 spatial 自己做下面这件事：

```txt
scan working.graph
  -> compare previous spatial records
  -> derive touched records
```

本质上就是把阶段二刚建立起来的 graph 增量收益重新抹掉。

正确方向应该是：

```txt
GraphDelta
  -> spatial patch seeds
  -> record-level patch
```

### 5.3 `runtime.query.spatial` 不等于 published `scene.spatial`

阶段三要建立的是 runtime 内部查询能力。

所以这里不能把目标理解成：

- 把 index tree 塞进 `snapshot.scene`

正确目标应该是：

- `working.spatial` 内部持有正式 index state
- `runtime.query.spatial` 对外暴露 world-space query

---

## 6. 阶段三的状态与 contract 设计

## 6.1 `WorkingState` 要增加 `spatial` 和 `delta.spatial`

阶段三以后，`working` 推荐显式带下面两块：

```ts
interface WorkingState {
  revision: {
    document: Revision
  }
  graph: GraphState
  spatial: SpatialIndexState
  ui: UiState
  scene: SceneSnapshot
  delta: {
    graph: GraphDelta
    spatial: SpatialDelta
  }
}
```

这里有两个边界要写死：

- `working.spatial`
  - 是正式 index state
- `working.delta.spatial`
  - 是本轮 spatial patch 的正式内部事务输出

它们都属于 runtime truth，不属于 published snapshot。

### 6.2 `SpatialKey`

阶段三推荐直接定义成稳定字符串主键：

```ts
type SpatialKey =
  | `node:${NodeId}`
  | `edge:${EdgeId}`
  | `mindmap:${MindmapId}`
```

这里和阶段二 `dirty token` 的边界不一样。

`SpatialKey` 不是 phase 编排 token，而是 index record 的正式主键。  
它会被：

- `records` map
- spatial tree
- `SpatialDelta.records`
- `runtime.query.spatial.get(key)`

直接共用。

所以这里用稳定字符串是合理的，它不是“先 encode 再 parse 回 scope”的调度负担，而是 record identity 本身。

### 6.3 `SpatialRecord`

阶段三的 `SpatialRecord` 不要做太重，最低建议收敛成：

```ts
type SpatialItemRef =
  | { kind: 'node', id: NodeId }
  | { kind: 'edge', id: EdgeId }
  | { kind: 'mindmap', id: MindmapId }

type SpatialKind = SpatialItemRef['kind']

interface SpatialRecord {
  key: SpatialKey
  kind: SpatialKind
  item: SpatialItemRef
  bounds: Rect
  order: number
}
```

语义：

- `key`
  - record 主键
- `kind`
  - query filter 用
- `item`
  - 直接回到 graph/editor item ref
- `bounds`
  - world-space query 的最小几何
- `order`
  - query 结果稳定排序和后续 visible/pick 预筛选所需的顺序 token

这里刻意不放：

- DOM node
- React element ref
- edge path 全量几何
- mindmap tree 明细
- selection / hover / chrome

因为这些都不是 spatial index 自己的 truth。

### 6.4 `SpatialRecord` 的存在边界

阶段三建议把“有没有 spatial record”定义成：

- 只对 `node / edge / mindmap` materialize record
- 对应 graph entity 仍存在
- 且当前有可查询的 `bounds`

这里把 group 的边界也一起写死：

- `group.frame.bounds` 仍然属于 graph structural geometry
- group 默认不进入 `SpatialRecord` / `SpatialTree` / `runtime.query.spatial`
- group shell / promotion 属于 selection / marquee / drag 派生出来的 ui/chrome 语义

因此：

- entity 被删除
  - spatial record remove
- entity 仍存在但 bounds 变成 `undefined`
  - spatial record 也 remove

这意味着：

> `SpatialDelta.records.removed` 记录的是 index record 生命周期，  
> 不要求和 graph entity 生命周期一一同构。

例如：

- edge 还存在
- 但当前 route 还没形成有效 bounds

这时 spatial record 可以被删除，而 graph entity 不删除。

如果后续需要“点击 group shell 的空白 frame 区域”这类能力，  
命中入口也应该优先落在 DOM/chrome pick，  
而不是把 group 变成一类常驻 spatial record。

### 6.5 `SpatialIndexState`

阶段三不要求把具体树结构绑定死在文档里，但至少要把 state 语义固定成下面这样：

```ts
interface SpatialIndexState {
  records: Map<SpatialKey, SpatialRecord>
  tree: SpatialTree
  visible: {
    dirty: boolean
  }
}

interface SpatialTree {
  insert(record: SpatialRecord): void
  update(previous: SpatialRecord, next: SpatialRecord): void
  remove(record: SpatialRecord): void
  rect(rect: Rect): readonly SpatialKey[]
  point(point: Point): readonly SpatialKey[]
}
```

这里要注意三点：

1. `records`
   - 是 canonical record store
2. `tree`
   - 是 query 加速结构
3. `visible.dirty`
   - 是给阶段四保留的 scene visible 脏位

阶段三这里不需要先把 visible cache 也做成完整状态。  
只要先把“visible 已经脏了”这件事正式化即可。

### 6.6 `SpatialDelta`

阶段三直接落正式类型：

```ts
interface SpatialDelta {
  order: boolean
  records: IdDelta<SpatialKey>
  visible: boolean
}
```

这里的含义必须写死：

- `order`
  - spatial record 的 scene 顺序 token 变了
- `records`
  - spatial record add/update/remove
- `visible`
  - 当前 viewport visible 结果需要重算

这里再补一条边界：

> `order` 和 `records.updated` 不是一回事。

如果只是 scene order 变了：

- 允许原地更新 record.order
- `SpatialDelta.order = true`
- `SpatialDelta.visible = true`
- 不要求把所有 record 都塞进 `records.updated`

这样可以避免 order 变化把 record lifecycle delta 污染得太重。

---

## 7. runtime scope 与 phase 编排设计

阶段二已经把 runtime 升级成 `scope / emit`。  
阶段三这里要把 spatial phase 正式接进来。

### 7.1 `SpatialPatchScope`

阶段三推荐把 spatial phase 输入收敛成很薄的一层：

```ts
interface SpatialPatchScope {
  reset: boolean
  graph: boolean
  visible: boolean
}
```

它的语义是：

- `reset`
  - 这一轮按 spatial 全量重建语义处理
- `graph`
  - 这一轮需要消费当前 `working.delta.graph`
- `visible`
  - 这一轮至少要把 `SpatialDelta.visible` 和 `working.spatial.visible.dirty` 置脏

这里刻意不把 graph touched ids 再复制一份进 `SpatialPatchScope`。  
原因是这些精确 ids 已经在 `working.delta.graph` 里了，阶段三不需要再造重复载体。

### 7.2 阶段三的 `EditorPhaseScopeMap`

阶段三以后，推荐收敛成：

```ts
interface EditorPhaseScopeMap {
  graph: GraphPatchScope
  spatial: SpatialPatchScope
  ui: undefined
  scene: undefined
}
```

这里的边界非常明确：

- graph phase 的正式领域输出在 `working.delta.graph`
- spatial phase 的正式领域输出在 `working.delta.spatial`
- phase 之间的调度路由负载走 `scope / emit`

### 7.3 planner 和 graph emit 的分工

阶段三这里建议固定成混合模型：

#### planner 负责

- graph input delta -> `graph` scope
- viewport 变化 -> `spatial.visible = true`

也就是说，纯 viewport 变化时，planner 可以直接返回：

```ts
createPlan({
  phases: new Set(['spatial', 'scene']),
  scope: {
    spatial: {
      reset: false,
      graph: false,
      visible: true
    }
  }
})
```

#### graph phase 负责 emit

graph patch 完成后，直接根据本轮 `working.delta.graph` emit：

```ts
emit: {
  spatial: {
    reset: context.scope.reset,
    graph: graphDelta.order || hasAnyGraphRecordWork(graphDelta),
    visible: graphDelta.order || hasAnyGraphRecordWork(graphDelta)
  }
}
```

这里的 `hasAnyGraphRecordWork(...)` 最低只需要看：

- `entities.*.added`
- `entities.*.removed`
- `geometry.*`

`entities.updated` 但 geometry 没变时，不要求唤醒 spatial record patch。

### 7.4 为什么 spatial 不直接读 input delta

因为阶段三的目标不是“按 input seed 再做第二套推导”，而是：

```txt
InputDelta
  -> GraphDelta
  -> SpatialDelta
```

如果 spatial 直接再读：

- `document.*`
- `graph.nodes.*`
- `graph.edges.*`

它就会重新拥有一套自己的 touched 推导逻辑。

这会把阶段二刚建立起来的 graph 增量链打断。

所以阶段三必须写死：

> spatial phase 的正式上游是 `working.delta.graph`，  
> 不是原始 `input.delta`。

---

## 8. spatial patch helper 设计

阶段三也应该遵守和阶段二同一条原则：

> 需要底层复用设施，但不要做成自动规则引擎。

也就是说：

- spatial helper 只负责 record patch、tree patch、delta 写入
- 记录来源仍然按 node / edge / mindmap 显式手写
- group shell / promotion 继续留在 ui/chrome / selection 路径，不进 spatial helper

### 8.1 `toSpatialKey`

最低需要：

```ts
function toSpatialKey(input: SpatialItemRef): SpatialKey
```

这是正式 key builder，不是 phase token encoder。

### 8.2 `patchSpatialRecord`

最核心的原语建议是：

```ts
type SpatialPatchAction = 'unchanged' | 'added' | 'updated' | 'removed'

function patchSpatialRecord(input: {
  state: SpatialIndexState
  key: SpatialKey
  next: SpatialRecord | undefined
  delta: IdDelta<SpatialKey>
}): SpatialPatchAction
```

语义：

- `next === undefined`
  - 从 `records` 和 `tree` 删除
- add
  - 同时写 `records`、`tree`、`delta.records.added`
- update
  - 同时 patch `records`、`tree`、`delta.records.updated`
- unchanged
  - 不动

它和阶段二 `patchFamilyEntry` 的区别在于：

- 这里 patch 的不只是 `Map`
- 还要同步维护 tree

### 8.3 `patchSpatialOrder`

阶段三需要一条单独原语处理 order：

```ts
function patchSpatialOrder(input: {
  state: SpatialIndexState
  snapshot: DocumentSnapshot
  delta: SpatialDelta
}): void
```

它只做两件事：

1. 更新 record.order
2. 把 `delta.order` 置成 `true`

它不负责写 `delta.records.updated`。

### 8.4 `markSpatialVisibleDirty`

阶段三建议显式暴露：

```ts
function markSpatialVisibleDirty(input: {
  state: SpatialIndexState
  delta: SpatialDelta
}): void
```

它只做：

- `state.visible.dirty = true`
- `delta.visible = true`

这样可以把：

- graph record 变化
- order 变化
- viewport 变化

统一收敛到一条 visible 脏位写法。

---

## 9. spatial phase 的 patch 上下文

阶段三推荐内部语义结构：

```ts
interface SpatialPatchContext {
  input: Input
  working: WorkingState
  graphDelta: GraphDelta
  spatial: SpatialIndexState
  scope: SpatialPatchScope
  delta: SpatialDelta
}
```

这里：

- `graphDelta`
  - 本轮 graph 上游 delta
- `spatial`
  - 本轮 patch 目标
- `scope`
  - runtime merge 后传入的 spatial scope
- `delta`
  - 本轮 spatial patch 输出

这里再补一条边界：

> spatial phase 不从 `scene` 里反推 record。  
> 它只从 `working.graph` 和 `working.delta.graph` 生成/删除/更新 spatial record。

---

## 10. spatial phase 的总体执行顺序

阶段三建议固定成下面这条顺序：

```txt
read phase scope -> reset spatial delta
  -> if reset: rebuild spatial records from current graph
  -> else if scope.graph: patch spatial records from GraphDelta
  -> if graphDelta.order: patch spatial order
  -> if scope.visible or records/order changed: mark visible dirty
```

这里有三个关键点：

1. spatial phase 不是自己扫 whole graph 推 touched set。
2. spatial phase 只在 `reset` 语义下允许全量 rebuild。
3. viewport 变化只走 visible dirty，不制造假的 record update。

### 为什么 reset 允许全量 rebuild

因为 `reset` 不是旧 fallback，而是事务语义本身：

- bootstrap
- document reset
- graph reset downstream

在这类语义下：

```txt
clear spatial state
  -> rebuild from current working.graph
```

是合理的。

### 为什么普通 graph patch 不能全量 rebuild spatial

因为阶段三的核心收益就是：

```txt
GraphDelta.geometry
  -> SpatialDelta.records
```

如果普通 update 里 spatial 还整图 rebuild，那 graph delta 就失去意义了。

---

## 11. 每类 spatial record 的 patch 规则

## 11.1 `patchNodeRecord(nodeId)`

### 输入来源

- `working.graph.nodes`
- `working.delta.graph.entities.nodes`
- `working.delta.graph.geometry.nodes`
- document scene order

### record 规则

如果 node 已不存在，或者 node bounds 不存在：

1. 删除 `node:${id}` record
2. 写 `SpatialDelta.records.removed`

如果 node 仍存在且有 bounds：

```ts
{
  key: `node:${id}`,
  kind: 'node',
  item: { kind: 'node', id },
  bounds: node.geometry.bounds,
  order: readSceneOrder(...)
}
```

### 什么时候需要 patch node record

- graph entity add/remove
- graph geometry.nodes touched
- reset

`entities.updated` 但 geometry 没变时，不要求 patch spatial record。

## 11.2 `patchEdgeRecord(edgeId)`

### 输入来源

- `working.graph.edges`
- `working.delta.graph.entities.edges`
- `working.delta.graph.geometry.edges`
- document scene order

### record 规则

edge 的 spatial bounds 来自：

- `edge.route.bounds`

如果 bounds 不存在：

- spatial record remove

否则：

```ts
{
  key: `edge:${id}`,
  kind: 'edge',
  item: { kind: 'edge', id },
  bounds: edge.route.bounds,
  order: readSceneOrder(...)
}
```

## 11.3 `patchMindmapRecord(mindmapId)`

### 输入来源

- `working.graph.owners.mindmaps`
- `working.delta.graph.entities.mindmaps`
- `working.delta.graph.geometry.mindmaps`
- document scene order

### record 规则

mindmap 的 spatial bounds 来自：

- `mindmap.tree.bbox`

如果 bbox 不存在：

- spatial record remove

否则：

```ts
{
  key: `mindmap:${id}`,
  kind: 'mindmap',
  item: { kind: 'mindmap', id },
  bounds: mindmap.tree.bbox,
  order: readSceneOrder(...)
}
```

## 11.4 `group` 的边界：不生成 spatial record

阶段三这里把 group 的职责固定成：

- group 继续存在于 `working.graph.owners.groups`
- `group.frame.bounds` 继续由 graph patch 维护
- 但 group 不 materialize 成 `SpatialRecord`

原因是：

- group 默认不是常驻渲染实体
- group 默认不是 world-space `rect/point` query 目标
- 它更像结构 owner 和派生 frame

group shell 只在下面几类语义下出现：

1. 选中了 group 内 node / edge，selection 被提升或归约到 group
2. marquee 命中了 group 内 node / edge，chrome 需要显示 group shell
3. 拖拽 group 内 node / edge，交互需要显示 group shell / move affordance

因此阶段三推荐固定边界：

- `runtime.query.spatial.rect/point` 只返回 `node / edge / mindmap`
- group shell 的显示由 selection / marquee / drag 结果派生
- 如果 shell 需要命中空白 frame 区域，入口放在 DOM/chrome pick，不放进常驻 spatial index

这也意味着：

- 不存在 `group:${id}` 这类 `SpatialKey`
- 不存在 `kind: 'group'` 的 `SpatialRecord`
- 不需要 `patchGroupRecord(groupId)`
- 不需要 `readGroupOrder(...)`

---

## 12. `runtime.query.spatial` API

阶段三就应该正式引入：

```ts
runtime.query.spatial
```

推荐最小 API：

```ts
interface SpatialRead {
  get(key: SpatialKey): SpatialRecord | undefined
  rect(
    worldRect: Rect,
    options?: {
      kinds?: readonly SpatialKind[]
    }
  ): readonly SpatialRecord[]
  point(
    worldPoint: Point,
    options?: {
      kinds?: readonly SpatialKind[]
    }
  ): readonly SpatialRecord[]
}
```

语义：

- `get`
  - 按 key 读单 record
- `rect`
  - world-space rect query
- `point`
  - world-space point query

这里返回 `SpatialRecord[]` 而不是 DOM hit 结果，也不是 React element。

因为阶段三必须坚持：

- spatial 只做 world query
- 最终精确命中仍由 graph geometry / DOM 系统继续处理

这里的 `kinds` 也只包含 `node / edge / mindmap`，不包含 `group`。

### 排序要求

`rect` / `point` 的结果都应按 `record.order` 做稳定排序。  
这样阶段四切 hover/marquee/visible 时，不需要再给 query 层补一套排序规则。

---

## 13. 与 `scene` / publisher 的关系

## 13.1 `scene` 暂时不切到 spatial

阶段三不要求马上改：

- `scene.visible`
- `scene.items`
- `scene.pick`

也就是说：

- `scene` phase 暂时仍可继续沿用当前实现
- 但 runtime 内部已经必须有正式 `working.spatial`

### 为什么阶段三不直接切 scene

因为阶段三的任务是先把 index state 自己稳定下来。

如果这一步把下面几件事一起做：

- 建 spatial state
- 改 visible
- 改 query
- 改 publish

调试面会一下子变太宽。

## 13.2 `scene` phase 的依赖建议

阶段三推荐把 phase 顺序收敛成：

```txt
graph -> spatial -> scene
```

即使 `scene` 暂时还没正式消费 `runtime.query.spatial`，也建议先把依赖图稳定成这条链。  
这样阶段四切 visible/query 时，不需要再改 phase order。

## 13.3 publisher 暂时不接 `SpatialDelta`

阶段三不要求马上改 publisher。

也就是说：

- `publisher.ts` 暂时仍可继续用当前 compare-driven 实现
- 但 `working.delta.spatial` 不能缺席

因为阶段五会直接消费它。

---

## 14. 文件落位建议

推荐在 `whiteboard-editor-graph` 内新增下面这些文件：

```txt
src/runtime/spatial/
  contracts.ts
  state.ts
  records.ts
  update.ts
  query.ts

src/phases/spatial.ts
```

并改动：

```txt
src/contracts/delta.ts
src/contracts/working.ts
src/runtime/createWorking.ts
src/runtime/createSpec.ts
src/runtime/planner.ts
src/runtime/query.ts
src/runtime/phaseNames.ts
src/phases/index.ts
src/phases/scene.ts
```

### 各文件职责

#### `runtime/spatial/contracts.ts`

放：

- `SpatialKey`
- `SpatialKind`
- `SpatialRecord`
- `SpatialPatchScope`
- `SpatialRead`

#### `runtime/spatial/state.ts`

放：

- `SpatialIndexState`
- `createSpatialState`
- `resetSpatialState`

#### `runtime/spatial/records.ts`

放：

- `toSpatialKey`
- `readNodeSpatialRecord`
- `readEdgeSpatialRecord`
- `readMindmapSpatialRecord`
- `readSceneOrder`

不放 `readGroupSpatialRecord`。  
group shell / promotion 继续留在 ui/chrome / selection 路径。

#### `runtime/spatial/update.ts`

放：

- `createSpatialDelta`
- `resetSpatialDelta`
- `patchSpatialRecord`
- `patchSpatialOrder`
- `markSpatialVisibleDirty`
- `patchSpatial(...)`

#### `runtime/spatial/query.ts`

放：

- `createSpatialRead`
- `queryRect`
- `queryPoint`

#### `phases/spatial.ts`

只保留 orchestrator，不再把全部 record 细节塞进 phase 文件。

---

## 15. 阶段三完成标准

阶段三完成时，应满足下面这些结果：

1. runtime 内存在正式 `working.spatial`。
2. `working.delta.spatial` 每轮都能稳定产出 `SpatialDelta`。
3. graph phase 不再逼 spatial 自己扫 whole graph 推 touched set。
4. spatial phase 正式消费 `working.delta.graph` 做 record-level patch。
5. `SpatialKey` / `SpatialRecord` / `runtime.query.spatial` 都已正式存在，且范围只覆盖 `node / edge / mindmap`。
6. reset 语义下允许 spatial 全量 rebuild；普通 update 不允许退化成整图 rebuild。
7. viewport 变化只会让 `SpatialDelta.visible = true`，不会制造假的 `SpatialDelta.records.updated`。
8. order 变化只会让 `SpatialDelta.order = true`，不会强行把全部 record 塞进 `records.updated`。
9. `scene.visible`、marquee、hover candidate 暂时仍未切到 spatial。
10. 不新增 old/new 双轨 index 实现。

---

## 16. 这一阶段故意不解决什么

为了把范围收住，阶段三明确不解决：

- `scene.visible` 正式改走 spatial
- marquee / idsInRect / hover candidate 切到 spatial
- delta-driven publisher
- DOM pick / overlay pick
- `PublishDelta`

尤其最后一条边界要再写一次：

> 阶段三只建立 index state 和 query 能力，  
> 不把它提前升级成最终 publish 系统或最终交互系统。

---

## 17. 最终结论

阶段三最核心的设计，不是“把 scene 也做成一棵树”，而是确立下面这条结构约束：

1. spatial 是 graph 的正式下游，不再自己重推 touched set。
2. spatial phase 的正式输入是 `working.delta.graph + SpatialPatchScope`。
3. `SpatialIndexState` 是 runtime 内部 truth，不是 published snapshot 字段。
4. `SpatialDelta` 只记录 record lifecycle、order 和 visible dirty，不携带大对象或 query 中间态。
5. `runtime.query.spatial` 先建出来，但范围只覆盖 `node / edge / mindmap`，visible/query 切换留到下一阶段。
6. group 保持为 graph structural owner；group shell / promotion 继续留在 ui/chrome 语义层。

用一句话总结：

> 阶段二解决的是 graph 如何精确 patch 并写出 `GraphDelta`；  
> 阶段三解决的是如何让同一份 `GraphDelta` 继续驱动正式 `SpatialIndexState` 和 `SpatialDelta`。

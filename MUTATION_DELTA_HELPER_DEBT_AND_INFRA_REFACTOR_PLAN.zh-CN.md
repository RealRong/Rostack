# MutationDelta Helper 债务与底层重构方案

## 目标

本文档不是讨论某一个包的局部清理，而是全面审计这条链路：

- `shared/mutation`
- `shared/projection`
- `dataview/packages/dataview-engine`
- `whiteboard/packages/whiteboard-engine`
- `whiteboard/packages/whiteboard-editor-scene`

重点回答一个问题：

- 现在代码里还存在大量 `read* / append* / collect* / has*` helper，这到底是不是说明 `MutationDelta` 设计本身不够好？

结论先说：

- 是，确实存在一批 helper，本质上是在替底层 delta 读模型补课。
- 但不是“所有 helper 都说明 delta 设计不好”。
- 真正有问题的是那些负责“解释 delta 语义”的 helper。
- 那些负责几何、队列、相等性、runtime input diff 的 helper，大部分是正常局部实现，不应混为一谈。

本文档的目标是把：

- 哪些 helper 是模型债务
- 哪些 helper 是正常实现
- 应该怎样从底层设施重构，而不是继续在 dataview/whiteboard 局部打补丁

全部说清楚。

---

## 一句话结论

当前 `MutationDelta` 的问题不在于“没有 `changes.has/get`”，而在于：

- `has/get` 只提供了最低级别的 key 读取能力
- 但没有提供“如何读取 ids / paths / path-aspect / touched-set / 组合语义 / fanout 规则”的正式读设施

于是上层被迫自己发明：

- `readIds`
- `readPaths`
- `readTouchedRecords`
- `readTouchedFields`
- `readChangeIds`
- `collectPatchIds`
- `pathsMatch`
- `collectPathFieldIds`
- `appendTouchedIds`
- 手写 semantic key 路由表

这说明当前模型只完成了“原始 delta 容器”的设计，还没有完成“正式读模型”的设计。

也就是说：

- `MutationDelta` 现在是可存储、可传递的
- 但还不是“足够强、足够稳定、足够低重复”的最终消费接口

---

## 审计结论总表

### 1. `shared/mutation`

当前优点：

- 已经把写侧输入和读侧 normalized delta 分开
- `delta.changes` 已经不再是裸对象，而是 `MutationChangeMap`
- `delta.changes.has/get/keys/entries/size` 已经统一

当前缺口：

- 没有正式的 `MutationChangeReader`
- 没有正式的 typed path codec
- 没有正式的 semantic key schema
- 没有正式的 grouped selector / compiled selector
- 没有正式的 summary / touched-set / path-match 设施

结论：

- `shared/mutation` 只完成了“delta 容器层”
- 还没完成“delta 读模型层”

### 2. `shared/projection`

当前状态：

- 旧 runtime 已经删掉，这是对的
- 但 `createProjection.ts` 里仍然有一层通用 delta 解释逻辑，比如：
  - `collectChangeIds(...)`
  - `collectPatchIds(...)`
  - `compilePatchBuilder(...)`

这层逻辑本身并不错误，因为 projection 需要 generic patch builder。

问题在于：

- projection 有自己的“读取 ids/path 的办法”
- dataview 有自己的“读取 ids/path 的办法”
- whiteboard 有自己的“读取 ids/path 的办法”
- projection 的 `changed.keys` / `patch.create|update|remove|order` 仍然只能接原始 string key 列表

这说明 decode 逻辑没有真正下沉到 `shared/mutation`。

进一步说：

- `shared/projection` 现在更像“半个 projection 编译器 + 半个 delta 解释器”
- `compileChangedMatcher(...)` 和 `compilePatchBuilder(...)` 本来应该消费更高层的 selector / reader 结果
- 但由于底层没有正式 selector，它只能自己用 `delta.changes.has/get` 重建一遍最小解释逻辑

### 3. dataview-engine

当前最明显的问题层。

`dataview/packages/dataview-engine/src/active/projection/dirty.ts` 实际上已经形成了一套“dataview 自己的 delta 解释层”。

它负责：

- `readIds(...)`
- `readPaths(...)`
- `collectIds(...)`
- `collectPathFieldIds(...)`
- `collectRecordIdsFromPaths(...)`
- `readTouchedRecords(...)`
- `readTouchedFields(...)`
- `readValueFields(...)`
- `readTouchedViews(...)`
- `hasRecordSetChange(...)`
- `hasFieldSchemaChange(...)`
- `hasViewQueryChange(...)`
- `pathsMatch(...)`

这层的问题不是“实现错了”，而是：

- dataview 把 `MutationDelta` 再解释成了自己的一套读取协议
- query/membership/index/projection/performance/trace 全都依赖这层
- 于是 delta 语义被重新埋在 dataview 包内部

并且这层还有重复：

- `runtime/performance.ts` 自己又写了一套 `readIds/readPaths/hasChange/countIds/countPaths`
- `active/index/trace.ts` 再复用 `projection/dirty.ts`
- `projection/createDataviewProjection.ts`、`membership/stage.ts` 里还有手写 `delta.changes.has('a') || has('b') ...` 这一类 coarse invalidation 列表

结论：

- dataview 目前是“有统一 helper 文件”
- 但这不等于问题解决了
- 它只是把债务集中到了一个 dataview 本地层

### 4. whiteboard-engine

当前反而比较干净。

审计结果：

- engine 本身没有再自建一层 delta 解释器
- commit 直接暴露 normalized `MutationDelta`
- 测试直接断言 `delta.changes.get(...)`

结论：

- `whiteboard-engine` 不是主要问题层
- 问题主要发生在消费侧，而不是 commit 暴露侧

### 5. whiteboard-editor-scene

当前问题比 dataview 更分散，但本质相同。

主要分三类：

#### 5.1 图变更 decode helper

`model/graph/patch.ts` 里现在仍然有：

- `readChangeIds(...)`
- `toConcreteIds(...)`
- `addChangeIdsToSet(...)`
- `readGraphTargets(...)`

这说明 graph phase 还在自己解释：

- 一个 semantic key 有没有 ids
- ids 是 `all` 还是具体集合
- 哪些 key 属于 node/edge/mindmap/group

这类 helper 本质上是 delta 读模型缺口。

#### 5.2 graph dirty fanout helper

同一个文件里还有：

- `markEdgeGeometryDirty(...)`
- `markMindmapGeometryDirty(...)`
- `markGroupGeometryDirty(...)`

它们不是单纯 decode helper，而是在做：

- semantic key / graph delta
  -> render invalidation channel

这类 helper 说明另一个问题：

- 系统没有正式的“变更路由 / fanout 声明”
- 所以上层只能手写 fanout 代码

#### 5.3 render touched-merge helper

`model/render/patch.ts` 里有大量：

- `appendTouchedIds(...)`
- `collectNodeRenderIds(...)`
- `collectStaticsEdgeIds(...)`
- `collectLabelEdgeIds(...)`
- `collectMaskEdgeIds(...)`
- `collectActiveEdgeIds(...)`

这里的问题和 `MutationDelta` 本体不完全相同，更接近：

- `IdDelta` / dirty-bag 的组合能力太弱

因为 render 其实已经不在直接读 `MutationDelta` 了，而是在读：

- `state.dirty.graph`
- `state.delta.ui`
- `state.delta.items`

但这些结构本身缺少：

- `union`
- `appendTouched`
- `touchedMany`
- `anyOf`

这导致 render 只能自己堆收集 helper。

#### 5.4 coarse invalidation key-list

除了 `read*` helper 之外，scene runtime 里还有另一类明显信号：

- `runtime/model.ts` 的 items phase 手写
  `canvas.order | node.create | node.delete | edge.create | ...`
- graph patch 之外，还有若干 phase 在本地直接列 semantic key 白名单

这类代码的问题不是“helper 名字多”，而是：

- selector 仍然是手写的
- coarse invalidation 规则没有正式编译层
- key-list 很容易在后续新增 semantic key 时漏改

### 6. `runtime/sourceInput.ts`

这里也有很多 helper：

- `readEditedEdgeIds(...)`
- `readPreviewNodeIds(...)`
- `readPreviewEdgeIds(...)`
- `readPreviewMindmapIds(...)`
- `readActiveMindmapTickIds(...)`
- `createPreviewDelta(...)`

但这批 helper 不属于 `MutationDelta` 模型债务。

原因很简单：

- 它们处理的是 runtime local 输入 diff
- 不是 document mutation decode
- 本质上属于 scene 输入层的正常局部逻辑

结论：

- 不要把这类 helper 和 delta 设计问题混为一谈

---

## 哪些 helper 真的是“模型不好”的信号

下面这几类 helper，基本都说明底层模型还不够：

### A. “从 change 里把 ids/paths 读出来” 的 helper

典型例子：

- `readIds(...)`
- `readPaths(...)`
- `readChangeIds(...)`
- `toConcreteIds(...)`
- `collectPatchIds(...)`

它们说明：

- `MutationChange` 虽然已经 object 化
- 但 object 本身没有正式 reader

### B. “从 string path 里再解析业务语义” 的 helper

典型例子：

- `collectPathFieldIds(...)`
- `pathsMatch(...)`
- `path.split('.')`
- `path.startsWith(...)`

它们说明：

- `paths` 还是 stringly-typed payload
- 上层必须自己知道 path grammar
- 没有 path codec / path schema

这是当前整条链里最核心的设计缺口之一。

### C. “把多个 semantic key 手工并到一个 touched set” 的 helper

典型例子：

- `readTouchedRecords(...)`
- `readTouchedFields(...)`
- `readTouchedViews(...)`
- `readGraphTargets(...)`

它们说明：

- 系统没有正式的 grouped selector
- domain 每次都要自己写 union 规则

### D. “同一 semantic key 再 fanout 到多个下游 invalidation channel” 的 helper

典型例子：

- `markEdgeGeometryDirty(...)`
- `markMindmapGeometryDirty(...)`
- `markGroupGeometryDirty(...)`

它们说明：

- 系统没有正式的 change routing / fanout 设施

### E. “对 IdDelta 做 touched union / merge” 的 helper

典型例子：

- `appendTouchedIds(...)`
- `collectNodeRenderIds(...)`

它们不完全是 `MutationDelta` 设计问题，但说明：

- `shared/delta` 的组合能力还不够

### F. “手写一长串 `delta.changes.has(...)`” 的 helper / 内联逻辑

典型例子：

- `hasRecordSetChange(...)`
- `hasDeltaChanges(...)`
- `ctx.input.delta.changes.has('canvas.order') || ...`

它们说明：

- 系统没有正式的 `anyKey(...)` / selector 编译能力
- 哪些 semantic key 组成一个“粗粒度触发器”仍然靠本地硬编码
- 这和 `readTouched*` 一样，本质上也是 selector 没有下沉

---

## 哪些 helper 不应该被错误清理

下面这几类 helper 大多是正常实现，不应一概删除：

### 1. 纯 view / geometry / equality helper

例如：

- `isNodeRenderViewEqual(...)`
- `isStaticViewEqual(...)`
- `isMaskViewEqual(...)`

这是正常 domain 逻辑，不是 delta 设计问题。

### 2. 纯 runtime input diff helper

例如 `sourceInput.ts` 里的 preview/edit/clock 读取函数。

这是 scene local 输入层，不是 document delta 读模型。

### 3. graph patch 执行期 queue / fanout helper

例如：

- `fanoutNodeGeometry(...)`
- `patchMindmaps(...)`
- `patchGroups(...)`

这属于执行算法，不等于 delta 解释层。

真正的问题不是“有 queue/fanout helper”，而是：

- queue seed 和 fanout 路由里混入了很多 semantic key decode 逻辑

### 4. 纯 domain 聚合 helper

例如：

- `spatial/update.ts` 里的 `collectRecordIds(...)`

这类 helper 做的是：

- 若干现成 set 的普通并集
- 为 patch 算法准备遍历输入

它不是 `MutationDelta` 债务，也不是 selector 债务。

### 5. 对已有底层能力的重复包装

例如：

- `index/update.ts` 里的 `collectTouchedIds(...)`

这类 helper 和上面几类不一样，它不说明“缺底层设施”，而是说明：

- 底层已经有 `idDelta.touched(...)`
- 但局部代码还在重复实现同一语义

这种情况应该直接收敛到现有底层 API，而不是再为它设计新协议。

---

## 根因

把整条链看完后，根因可以收敛成 5 条。

### 根因 1：`MutationDelta` 只有容器 API，没有 reader API

现在只有：

- `delta.changes.has(key)`
- `delta.changes.get(key)`

但没有：

- `change.ids()`
- `change.paths()`
- `change.touches(id)`
- `change.pathsOf(id)`
- `change.matches(pathSelector)`
- `delta.any(keys)`
- `delta.unionIds(keys)`

结果是每个消费方都要自己重新写一层。

### 根因 2：path payload 是字符串协议，而不是 typed path model

最典型的是 dataview：

- `record.values` 的 path 需要再解释为 fieldId
- `view.query` 的 path 需要再解释为 `search/filter/sort/group/order`

这说明：

- `paths` 不是最终消费模型
- 它只是最低层传输格式

### 根因 3：没有 semantic key schema / selector schema

上层一直在手写：

- 哪些 key 属于 record touched
- 哪些 key 属于 field touched
- 哪些 key 触发 items
- 哪些 key 触发 graph dirty
- 哪些 key 组成 coarse invalidation trigger

这类规则没有集中声明，只能散落在 helper 里。

这也是为什么现在既会出现：

- `readTouchedRecords(...)`
- `readGraphTargets(...)`

也会出现：

- `hasRecordSetChange(...)`
- `delta.changes.has('a') || has('b') || has('c')`

两者表面形式不同，本质上都是 selector 没有正式建模。

### 根因 4：没有正式的 change routing / fanout 基础设施

例如 whiteboard：

- `edge.route`
  既影响 `edge.route`
  也影响 `edge.labels`
  也影响 `edge.endpoints`
  也影响 `edge.box`

如果没有统一 fanout 描述层，这种映射只能散在 patch 代码里。

### 根因 5：`shared/delta` 缺少组合 API

`IdDelta` 现在只有：

- `create/reset/add/update/remove/hasAny/touched/clone/assign`

但缺少：

- `appendTouched(target, delta)`
- `touchedMany(...deltas)`
- `hasAnyOf(...deltas)`
- `union(...deltas)`

于是 render 这类 hot path 只能自己拼。

---

## 最终重构方向

原则只有一条：

- 不再在 dataview / whiteboard 局部继续发明 helper 协议
- 要把“解释 delta 的能力”下沉到共享底层

最终重构目标应该分成三层。

---

## 一层：把 `shared/mutation` 升级为真正的读模型层

### 目标

让消费方不再手写：

- `readIds`
- `readPaths`
- `toConcreteIds`
- `pathsMatch`

### 建议 API

不是继续暴露原始 object，而是引入正式 reader：

```ts
interface MutationChangeReader<TId extends string = string, TPath = string> {
  exists(): boolean
  ids(): readonly TId[] | 'all' | undefined
  hasIds(): boolean
  touches(id: TId): boolean | 'unknown'
  paths(): Readonly<Record<TId, readonly TPath[] | 'all'>> | 'all' | undefined
  pathsOf(id: TId): readonly TPath[] | 'all' | undefined
  matches(id: TId, matcher: (path: TPath) => boolean): boolean | 'unknown'
  order(): boolean
  payload<T = unknown>(key: string): T | undefined
}

interface MutationDeltaReader {
  has(key: string): boolean
  change<TId extends string = string, TPath = string>(key: string): MutationChangeReader<TId, TPath>
  any(keys: readonly string[]): boolean
}
```

这里最关键的是：

- `change(...)` 返回 reader，而不是裸 object
- `ids/paths/order/payload` 都通过 reader 读取

这样：

- projection
- dataview
- whiteboard

都不需要再各写一套 `readIds/readPaths`

### 必须补上的 path codec

仅靠 reader 还不够。

因为 dataview/whiteboard 的很多 path 不是 plain string，而是有 grammar 的。

所以还需要：

```ts
interface MutationPathCodec<TPath> {
  parse(path: string): TPath | undefined
  format(path: TPath): string
  matches(path: string, matcher: (value: TPath) => boolean): boolean
}
```

然后 reader 支持：

```ts
change.paths(codec)
change.pathsOf(id, codec)
change.matches(id, codec, matcher)
```

这样 dataview 就不用再：

- `path.split('.')`
- `path.startsWith('sort.')`
- `path === 'title'`

手工解析 path 语义。

---

## 二层：引入 semantic key schema / compiled selector

仅有 low-level reader 还不够。

因为 domain 还需要反复定义：

- touched records
- touched fields
- touched views
- items trigger
- graph targets
- graph dirty fanout

这部分不该每次手写在业务包里。

### 建议方向

在 `shared/mutation` 上继续提供 schema/selector 编译器：

```ts
const dataviewDelta = defineMutationSchema({
  'record.create': ids<RecordId>(),
  'record.title': ids<RecordId>(),
  'record.values': paths<RecordId, RecordValuePath>(recordValuePathCodec),
  'view.query': paths<ViewId, ViewQueryPath>(viewQueryPathCodec),
  ...
})
```

然后基于 schema 声明 selector：

```ts
const dataviewSelectors = dataviewDelta.compile({
  touchedRecords: unionIds([
    'record.create',
    'record.title',
    'record.type',
    'record.meta',
    'record.delete',
    idsFromPaths('record.values')
  ]),
  touchedFields: unionFieldIds([
    literalIds(['title'], when('record.title')),
    'field.create',
    'field.delete',
    'field.schema',
    'field.meta',
    extractPathFieldIds('record.values')
  ]),
  hasRecordSetChange: anyKey(['record.create', 'record.delete']),
  viewQueryAspect: aspectMatcher('view.query', viewQueryPathCodec)
})
```

whiteboard 也一样：

```ts
const whiteboardDelta = defineMutationSchema({
  'node.create': ids<NodeId>(),
  'edge.route': ids<EdgeId>(),
  'mindmap.structure': ids<MindmapId>(),
  ...
})
```

然后编译：

```ts
const whiteboardSelectors = whiteboardDelta.compile({
  graphTargets: routeTargets({...}),
  itemsTrigger: anyKey([...]),
  graphDirty: fanout({...})
})
```

### 这个层的价值

这样以后：

- dataview 的 `projection/dirty.ts`
- dataview 的 `runtime/performance.ts`
- whiteboard 的 `graph patch`
- whiteboard 的 items trigger

都不再自己解释 semantic key，而是统一消费 compiled selector。

---

## 三层：为内部 dirty / delta 补组合能力

这层主要不是 `MutationDelta` 本体，而是 `shared/delta`。

### 现在的问题

`IdDelta` 只有基础操作，没有组合操作。

所以大家只能写：

- `appendTouchedIds(...)`
- `collect...Ids(...)`

### 建议 API

直接在 `shared/delta` 补下面这些能力：

```ts
idDelta.appendTouched(target, delta)
idDelta.touchedMany(...deltas)
idDelta.hasAnyOf(...deltas)
idDelta.union(...deltas)
idDelta.merge(target, ...sources)
```

这样 render 里的很多 helper 可以直接消失，变成：

```ts
const touchedNodeIds = idDelta.touchedMany(
  working.dirty.graph.node.lifecycle,
  working.dirty.graph.node.geometry,
  working.dirty.graph.node.content,
  working.dirty.graph.node.owner,
  working.delta.ui.node
)
```

这不是局部 patch，而是把重复组合模式收回到底层集合设施。

---

## 分层改造建议

### Phase 1. 先补 `shared/mutation` reader API

目标：

- 消灭各包里的 `readIds/readPaths/readChangeIds/toConcreteIds`

完成标志：

- `shared/projection`
- `dataview`
- `whiteboard-editor-scene`

都改成读正式 reader，而不是读裸 `MutationChange`

### Phase 2. 引入 path codec

目标：

- 消灭 `split('.')`
- 消灭 `startsWith(...)`
- 消灭 path aspect 手工判断

优先级最高的两个 codec：

- dataview `record.values`
- dataview `view.query`

### Phase 3. 引入 compiled selector

目标：

- 消灭 dataview `projection/dirty.ts` 这种“本地第二读模型”
- 消灭 whiteboard `readGraphTargets(...)` 这种手写 key-router

最终：

- dataview 有单一 selector registry
- whiteboard 有单一 selector registry

### Phase 4. 引入 change routing / fanout 编译能力

目标：

- 消灭 `markEdgeGeometryDirty(...)` 这类散落的 fanout 逻辑

最终：

- 一个 semantic key 影响哪些 dirty channel，统一声明

### Phase 5. 补 `shared/delta` 组合 API

目标：

- 消灭 `appendTouchedIds(...)`
- 压缩 render/local phase 的 touched-set helper

### Phase 6. 统一 performance / trace summary

目标：

- dataview `runtime/performance.ts` 不再自己重复一套 delta summary 逻辑

最终：

- summary / touched count / touched entity count 由共享 selector 或共享 summary builder 统一生成

---

## 最终态应该长什么样

最终态不应该是：

- `shared/mutation` 提供一个最低层 map
- dataview 再发明 `projection/dirty.ts`
- performance 再发明一份读法
- whiteboard graph 再发明一份读法
- render 再发明一份 touched merge

最终态应该是：

### `shared/mutation`

负责：

- normalized storage model
- formal reader API
- path codec
- selector compiler
- summary / touched helpers

### `shared/projection`

负责：

- 消费 compiled selector
- 把 selector 接到 generic `changed/patch` 编译流程

### dataview

只保留：

- dataview semantic schema
- dataview selector declarations
- 业务 stage 决策逻辑

不再保留：

- 一整层手写 delta 解码 helper

### whiteboard-editor-scene

只保留：

- graph patch 算法
- render patch 算法
- ui/runtime 算法

不再保留：

- `readChangeIds`
- `toConcreteIds`
- 手写 semantic key router
- 手写 key -> dirty fanout 表达

---

## 明确不建议的方向

### 1. 继续在 dataview/whiteboard 本地堆 helper

例如再加：

- `readTouchedNodes`
- `readTouchedEdges`
- `readQueryAspect`
- `collectDirtyFields`

这类只会继续把债务埋在业务包里。

### 2. 只做 grep 式局部删除

如果只把 helper 名字删掉，但不补 reader/schema/selector 基础设施，最终只会变成：

- 更多内联重复代码

这会更糟。

### 3. 把 string path 继续当最终语义模型

如果还允许上层继续 `split('.') / startsWith(...)`，那就说明 path codec 这件事没有真正完成。

---

## 最终结论

现在这条链上确实还有一批 helper，是因为 `MutationDelta` 设计还停留在“原始读能力”层，没有走到“正式消费模型”层。

真正该重构的不是某一个 `read*` 函数，而是下面三件底层设施：

1. `shared/mutation` 要提供正式 reader API，而不是只给 `has/get`
2. `shared/mutation` 要提供 path codec 和 compiled selector，而不是让每个域自己 parse string path
3. `shared/delta` 要提供组合能力，让内部 dirty/delta 不再靠本地 `append/collect` helper 生存

如果这三层不补，helper 还会继续长回来。

如果这三层补齐：

- dataview 的本地 delta 解释层会自然消失
- whiteboard 的 graph key-router / dirty fanout 会自然收敛
- projection generic patch builder 也能接到统一 reader/selector，而不是继续成为半套解释器

这才是“尽可能以底层设施或者模型为目标重构，而不是局部 patch”的正确方向。

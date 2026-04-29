# Projection 变薄最终 API 与实施方案

## 结论

- 不保留兼容层。
- 不保留两套 runtime、delta、impact、store sync 语义。
- `shared/projection` 不需要整体推倒重写。
- 真正要削掉的是它当前偏厚的 `surface -> snapshot -> patch -> store` 出口协议。
- `phase graph / planner / dirty propagation / trace / store runtime` 可以保留。
- dataview 和 whiteboard 都改成：domain runtime 直接产出精确 store 增量，`shared/projection` 只负责编排和写入 store。

这份文档只分两部分：

1. `shared/projection`、dataview、whiteboard 的最终 API 设计
2. 各阶段实施方案

## 第一部分：最终 API 设计

## 1. shared/projection

### 1.1 最终职责

`shared/projection` 最终只保留五类职责：

- phase graph
- planner 执行顺序
- dirty propagation
- store runtime
- trace / capture

它不再负责：

- 逼 domain 先构造 `surface`
- 逼 domain 先产出 `ProjectionFamilySnapshot`
- 逼 domain 再从 `previous/next snapshot` 反推 `patch`
- 代替 domain 定义语义层

结论一句话：

**`shared/projection` 保留骨架，不保留厚 surface 协议。**

### 1.2 最终 store 协议

当前最该改的不是 phase，而是 store 出口。

最终 store 协议应直接表达“要写什么”，而不是“先读完整 snapshot，再算 patch”。

```ts
export interface ProjectionValueSnapshot<TValue> {
  value: TValue
}

export interface ProjectionFamilySnapshot<TKey extends string | number, TValue> {
  ids: readonly TKey[]
  byId: ReadonlyMap<TKey, TValue>
}

export type ProjectionValueChange<TValue> =
  | 'skip'
  | {
      value: TValue
    }

export type ProjectionFamilyChange<TKey extends string | number, TValue> =
  | 'skip'
  | 'replace'
  | {
      ids?: readonly TKey[]
      set?: readonly (readonly [TKey, TValue])[]
      remove?: readonly TKey[]
    }
```

约束很明确：

- `change` 必须已经是 domain/runtime 知道的精确增量
- `shared/projection` 不再给 domain 一个 `previous/next` 回调让它再算 patch
- `read` 只用于初始化或 `replace`

### 1.3 最终 store spec

把当前 `surface` 改名为 `stores`，语义更直接。

```ts
export interface ProjectionValueStoreSpec<TState, TValue> {
  kind: 'value'
  read(state: TState): TValue
  change(state: TState): ProjectionValueChange<TValue>
  isEqual?: (left: TValue, right: TValue) => boolean
}

export interface ProjectionFamilyStoreSpec<
  TState,
  TKey extends string | number,
  TValue
> {
  kind: 'family'
  read(state: TState): ProjectionFamilySnapshot<TKey, TValue>
  change(state: TState): ProjectionFamilyChange<TKey, TValue>
  isEqual?: (left: TValue, right: TValue) => boolean
  idsEqual?: (left: readonly TKey[], right: readonly TKey[]) => boolean
}

export type ProjectionStoreSpec<TState> =
  | ProjectionValueStoreSpec<TState, any>
  | ProjectionFamilyStoreSpec<TState, any, any>

export type ProjectionStoreTree<TState> = {
  [key: string]: ProjectionStoreSpec<TState> | ProjectionStoreTree<TState>
}
```

这个协议比当前版本薄在三点：

- 没有 `changed(context)` 和 `patch(context)` 两层分裂
- 没有 `previous/next snapshot` 回调
- 没有 domain 为了 store sync 维护 snapshot cache 的必要

### 1.4 最终 projection API

planner 和 phase graph 保留，但 API 要收紧。

```ts
export interface ProjectionPlan<TPhaseName extends string> {
  phases?: readonly TPhaseName[]
}

export interface ProjectionPhaseContext<TInput, TState> {
  input: TInput
  state: TState
  revision: Revision
}

export type ProjectionPhase<TInput, TState, TPhaseName extends string> = (
  context: ProjectionPhaseContext<TInput, TState>
) => void

export interface ProjectionSpec<
  TInput,
  TState,
  TRead,
  TCapture,
  TPhaseName extends string,
  TStores extends ProjectionStoreTree<TState>
> {
  createState(): TState
  createRead(runtime: {
    state: () => TState
    revision: () => Revision
    capture: () => TCapture
  }): TRead
  capture(input: {
    state: TState
    read: TRead
    revision: Revision
  }): TCapture
  stores: TStores
  plan(input: {
    input: TInput
    state: TState
    read: TRead
    revision: Revision
  }): ProjectionPlan<TPhaseName>
  phases: Record<TPhaseName, ProjectionPhase<TInput, TState, TPhaseName>>
}
```

最终 runtime：

```ts
export interface ProjectionRuntime<
  TInput,
  TState,
  TRead,
  TCapture,
  TStoresRead,
  TPhaseName extends string
> {
  revision(): Revision
  state(): TState
  read: TRead
  stores: TStoresRead
  capture(): TCapture
  update(input: TInput): {
    revision: Revision
    trace: ProjectionTrace<TPhaseName>
  }
}
```

这里保留的复杂度只有：

- 哪些 phase 要跑
- phase 顺序
- 执行 trace
- 如何把 domain 已经知道的增量写进 stores

不再保留的复杂度是：

- generic surface DSL
- generic family patch builder
- previous/next snapshot 反推 patch

## 2. Dataview

### 2.1 最终边界

dataview 最终结构应收口到：

```ts
MutationDelta
  -> DataviewMutationDelta
  -> active runtime
  -> ViewState
  -> exact store changes
```

不再保留：

- `DataviewDeltaFacts`
- `frame -> reasons -> action` 厚中间层
- `DataviewIndexBank`
- `entries/currentKey/switch`
- `active.patches.*`
- family snapshot cache

### 2.2 最终输入

```ts
export interface DataviewProjectionInput {
  document: DataDoc
  delta: DataviewMutationDelta
}
```

`DataviewMutationDelta` 是唯一 dataview mutation 读取模型。

它的定位只是一层薄 domain view：

- 基于 canonical `MutationDelta`
- 提供 dataview 可直接消费的 typed change/select 能力
- 不再派生独立 facts 模型

### 2.3 最终 active spec

```ts
export interface DataviewActiveSpec {
  id: ViewId
  view: View
  query: QueryPlan
  section?: {
    fieldId: FieldId
    mode?: ViewGroup['mode']
    sort?: ViewGroup['bucketSort']
    interval?: ViewGroup['bucketInterval']
    showEmpty: boolean
  }
  calcFields: readonly FieldId[]
  demand: NormalizedIndexDemand
}
```

### 2.4 最终 state

dataview 最终只保留一个 active runtime 主状态。

```ts
export interface DataviewActiveIndex {
  demand: NormalizedIndexDemand
  state: IndexState
}

export interface DataviewStoreChanges {
  active: ProjectionValueChange<ViewState | undefined>
  fields: ProjectionFamilyChange<FieldId, Field>
  sections: ProjectionFamilyChange<SectionId, Section>
  items: ProjectionFamilyChange<ItemId, ItemPlacement>
  summaries: ProjectionFamilyChange<SectionId, CalculationCollection>
}

export interface DataviewRuntimeState {
  revision: Revision
  document: DataDoc
  active?: {
    spec: DataviewActiveSpec
    index: DataviewActiveIndex
    query: QueryPhaseState
    membership: MembershipPhaseState
    summary: SummaryPhaseState
    view: ViewState
  }
  changes: DataviewStoreChanges
}
```

明确约束：

- 不保留 `entries/currentKey/switch`
- 只保留当前 active index
- `active spec` 变化就 rebuild 当前 index

### 2.5 最终 projection phases

dataview 顶层 projection phase 只保留一个：

```ts
export type DataviewProjectionPhaseName = 'active'
```

`index / query / membership / summary / publish` 都下沉为 dataview active runtime 内部阶段，不再暴露成 shared/projection 顶层 phase。

也就是说，顶层只有：

```ts
createProjection({
  stores,
  plan: () => ({ phases: ['active'] }),
  phases: {
    active(ctx) {
      ctx.state = updateDataviewRuntime(ctx.state, ctx.input.document, ctx.input.delta)
    }
  }
})
```

### 2.6 最终 stores

dataview 最终公开这些 stores：

```ts
type DataviewStores = {
  active: value<ViewState | undefined>
  fields: family<FieldId, Field>
  sections: family<SectionId, Section>
  items: family<ItemId, ItemPlacement>
  summaries: family<SectionId, CalculationCollection>
}
```

关键点：

- `read(state)` 直接读当前 runtime state
- `change(state)` 直接读 `state.changes.*`
- 不再构造 `ProjectionFamilySnapshot` cache
- 不再保留 `active.patches.fields/sections/items/summaries`

### 2.7 最终 active API

读写边界也一起收口：

```ts
export interface DataviewCurrent {
  rev: number
  doc: DataDoc
  active?: ViewState
  docActiveViewId?: ViewId
  docActiveView?: View
}
```

规则：

- `current.active` 是 published projection `ViewState`
- `current.docActiveViewId/current.docActiveView` 是当前 document active view

写路径从 `docActiveView` 读。

读路径从 `active` 读。

不再通过 `engine.current().active?.view` 同时承担写入和展示语义。

## 3. Whiteboard

### 3.1 最终边界

whiteboard 的方向和 dataview 一样，但它当前已经更接近目标。

因为它已经有：

- phase graph
- domain-owned runtime state
- `state.delta.graph/items/ui/render/...`

所以 whiteboard 不需要重写执行模型，主要是把 `shared/projection` 出口从 `surface/snapshot/patch` 换成直接消费这些 domain delta。

### 3.2 最终输入

```ts
export interface WhiteboardProjectionInput {
  document: Input['document']
  delta: WhiteboardMutationDelta
}
```

`WhiteboardMutationDelta` 同样只是一层薄 domain delta view：

- 基于 canonical `MutationDelta`
- 提供 whiteboard 的 typed select/change 能力
- 不再派生另一套 helper-heavy runtime 语义层

### 3.3 最终 phases

whiteboard 顶层 phases 可以保留现有结构：

```ts
export type WhiteboardProjectionPhaseName =
  | 'document'
  | 'graph'
  | 'spatial'
  | 'items'
  | 'ui'
  | 'render'
```

这是合理的，因为 whiteboard 本来就是多阶段、多子系统 runtime。

复杂度不在 phase 数量，而在 store 出口协议。

### 3.4 最终 state

whiteboard 最终继续保留它自己的 working state：

```ts
export interface WhiteboardWorkingState {
  document: ...
  graph: ...
  spatial: ...
  items: ...
  ui: ...
  render: ...
  delta: {
    document: WhiteboardDocumentStoreChanges
    graph: WhiteboardGraphStoreChanges
    spatial: WhiteboardSpatialStoreChanges
    items: WhiteboardItemsStoreChanges
    ui: WhiteboardUiStoreChanges
    render: WhiteboardRenderStoreChanges
  }
}
```

这里的重点不是字段名字，而是职责：

- phase 更新 runtime state
- phase 同时更新对应的 store changes
- store changes 直接就是 projection store 的输入

也就是说：

- `state.delta.*` 继续保留
- 但它的目标明确变成“domain-owned exact store changes”
- 不再只是为了再转换成 `ProjectionFamilyPatch`

### 3.5 最终 stores

whiteboard 最终 stores 仍然覆盖这些公开面：

```ts
type WhiteboardStores = {
  document: {
    revision: value<Revision>
    background: value<Background>
  }
  graph: {
    node: family<NodeId, GraphNodeView>
    edge: family<EdgeId, GraphEdgeView>
    mindmap: family<MindmapId, MindmapView>
    group: family<GroupId, GroupView>
    state: {
      node: family<NodeId, NodeUiState>
      edge: family<EdgeId, EdgeUiState>
      chrome: value<GraphChromeState>
    }
  }
  render: {
    node: family<NodeId, NodeRenderView>
    edge: {
      statics: family<EdgeStaticId, EdgeStaticView>
      active: family<EdgeId, EdgeActiveView>
      labels: family<EdgeLabelKey, EdgeLabelView>
      masks: family<EdgeId, EdgeMaskView>
    }
    chrome: {
      scene: value<SceneChromeRender>
      edge: value<EdgeOverlayRender>
    }
  }
  items: family<SceneItemKey, SceneItemView>
}
```

但 stores 的实现方式改成：

- `read(state)` 直接读 working state
- `change(state)` 直接读 `state.delta.*`
- 不再先 `entityDelta -> ProjectionFamilyPatch -> surface.patch`

### 3.6 Whiteboard 的关键判断

whiteboard 这条链已经证明一件事：

- phase graph/planner 不是主要复杂度来源
- 主要复杂度来自 domain delta 还要被转换成 projection patch 协议

所以 whiteboard 的核心工作不是重写 phase，而是删掉这层重复翻译。

## 第二部分：实施方案

## Phase 1. shared/projection 先削出口，不动骨架

目标：

- 保留 phase graph
- 保留 planner
- 保留 dirty propagation
- 保留 trace
- 把 `surface` 重写为 `stores`

实施内容：

- 删除 `changed(context)` + `patch(context)` 双层协议
- 删除 `previous/next snapshot -> patch` 这层 API
- 新增 `change(state)` 直接返回精确 store change
- `read(state)` 只保留给初始化和 `replace`

完成标准：

- `shared/projection` 仍然负责 orchestration
- 但不再要求 domain 提供厚 `surface/snapshot/patch` 语义

## Phase 2. Dataview 收口到单 active runtime

目标：

- 删除 dataview 顶层厚中间层
- 删除多 view index bank
- 删除厚 reasons

实施内容：

- 删掉 `DataviewDeltaFacts`
- 删掉 `DataviewIndexBank`
- 删掉 `entries/currentKey/switch`
- 删掉 `active.patches.*`
- 删掉 family snapshot cache
- 把 state 收口为单 `active` + `changes`

完成标准：

- dataview runtime 主链收口到：

```ts
document + DataviewMutationDelta
  -> resolve active spec
  -> run active runtime
  -> write exact store changes
```

## Phase 3. Dataview 顶层 projection 只保留 active

目标：

- shared/projection 顶层不再理解 dataview 内部 index/query/membership/summary

实施内容：

- 顶层 phase 收口成 `active`
- `index/query/membership/summary/publish` 全部下沉到 dataview runtime 内部
- `plan()` 只决定是否执行 `active`

完成标准：

- dataview 的 projection 壳只剩 orchestration
- dataview 语义完全由 dataview runtime 自己负责

## Phase 4. Dataview stores 改为直接消费 `state.changes`

目标：

- store sync 继续保持精确增量通知
- 但不再通过 snapshot cache 和 patch builder 实现

实施内容：

- `active` store 直接消费 `changes.active`
- `fields/sections/items/summaries` 直接消费 `changes.*`
- 删除 `readFieldSnapshot/readSectionSnapshot/readItemSnapshot/readSummarySnapshot`
- 删除 `readFamilyPatch(...)`

完成标准：

- dataview store sync 只依赖 runtime 已知变化
- 不再依赖 “先构造 snapshot，再反推 patch”

## Phase 5. Whiteboard 保留 phases，改 store 出口

目标：

- 不重写 whiteboard phases
- 不重写 whiteboard working state
- 只删掉出口重复翻译

实施内容：

- 保留 `document/graph/spatial/items/ui/render`
- 保留 `state.delta.*`
- 让 `state.delta.*` 直接成为 `stores.change(state)` 的输入
- 删除 `toFamilyPatchOrSkip(...)`
- 删除 `entityDelta.fromIdDelta(...) -> ProjectionFamilyPatch` 这一层 projection 适配

完成标准：

- whiteboard phases 继续跑
- store sync 直接消费 whiteboard runtime 自己的 exact deltas

## Phase 6. Whiteboard 和 Dataview 同步统一到一套 shared/projection 出口

目标：

- 不是让两个 domain 长得一样
- 而是让它们都通过同一套薄 store 协议接 shared/projection

实施内容：

- dataview 输出 `DataviewStoreChanges`
- whiteboard 输出 `Whiteboard...StoreChanges`
- `shared/projection` 统一消费 `value change / family change / replace / skip`

完成标准：

- 两个 domain 都不再维护自己的 projection surface adapter
- 两个 domain 只保留 domain runtime + exact store changes

## Phase 7. 删除旧 projection surface 语义

目标：

- 文档和代码都不再保留“新旧两套 projection 协议并存”

实施内容：

- 删除 `ProjectionSurfaceTree`
- 删除 `ProjectionValueField.changed`
- 删除 `ProjectionFamilyField.patch(previous, next)`
- 删除 projection 内部 family patch builder
- 删除 domain 侧为适配 surface 维护的缓存和 helper

完成标准：

- 仓库里只剩一套 projection 出口协议
- 不再有 compatibility runtime

## Phase 8. 收口读写边界

目标：

- 把 projection published state 和 document state 的职责分清

实施内容：

- dataview `engine.current()` 增加 `docActiveViewId/docActiveView`
- 写路径切到 document active view
- 读路径继续使用 published projection view
- whiteboard 继续保持 read/capture 与 working/document 的清晰分层

完成标准：

- 写路径不再依赖 projection snapshot 结构
- projection 只承担发布态和订阅态职责

## 最终判断

最终最重要的不是“phase 多不多”，而是“语义解释了几次”。

这次重构后的最终模型应该是：

- `shared/mutation` 负责 canonical document delta
- dataview / whiteboard 各自负责 domain runtime
- domain runtime 直接产出 exact store changes
- `shared/projection` 负责 phase orchestration + store apply

如果按这个方向收口：

- `shared/projection` 不需要大改骨架
- dataview 复杂度会明显下降，因为它当前最厚
- whiteboard 改动会更集中，因为它当前 runtime 结构本来就相对合理

最终一句话：

**保留 projection 骨架，删除 projection 语义层；保留 domain runtime，删除 domain 为 projection 出口做的重复翻译。**

# Projection Glue 变薄最终 API 与实施方案

## 约束

- 不保留兼容层。
- 不引入第二套 projection runtime。
- 不回到 `surface/snapshot/patch` 厚协议。
- `shared/projection` 继续只保留骨架职责：
  - phase orchestration
  - store runtime
  - trace / capture
- 优化目标只针对 dataview / whiteboard 在接 `shared/projection` 时残留的 glue 层厚度。

## 第一部分：最终 API 设计

## 1. shared/projection

`shared/projection` 最终 API 保持不再扩张：

```ts
type ProjectionValueChange<T> =
  | 'skip'
  | { value: T }

type ProjectionFamilyChange<TKey extends string | number, TValue> =
  | 'skip'
  | 'replace'
  | {
      ids?: readonly TKey[]
      set?: readonly (readonly [TKey, TValue])[]
      remove?: readonly TKey[]
    }

interface ProjectionValueStoreSpec<TState, TValue> {
  kind: 'value'
  read(state: TState): TValue
  change(state: TState): ProjectionValueChange<TValue>
}

interface ProjectionFamilyStoreSpec<TState, TKey extends string | number, TValue> {
  kind: 'family'
  read(state: TState): {
    ids: readonly TKey[]
    byId: ReadonlyMap<TKey, TValue>
  }
  change(state: TState): ProjectionFamilyChange<TKey, TValue>
  idsEqual?: (left: readonly TKey[], right: readonly TKey[]) => boolean
  isEqual?: (left: TValue, right: TValue) => boolean
}
```

共享层不再新增 domain 语义 helper。

共享层不负责：

- domain snapshot cache
- domain patch builder
- domain family diff helper
- dataview / whiteboard 专用 projection builder

## 2. dataview 最终 API

### 2.1 projection 顶层

顶层继续只有一个 phase：

```ts
type DataviewProjectionPhaseName = 'active'
```

顶层继续只做：

```ts
document + DataviewMutationDelta
  -> createDataviewFrame
  -> ensureDataviewIndex
  -> createDataviewActivePlan
  -> runDataviewActive
```

### 2.2 state

```ts
interface DataviewState {
  revision: Revision
  active: DataviewActiveState
}

interface DataviewActiveState {
  spec?: DataviewActiveSpec
  index?: DataviewActiveIndex
  query: QueryPhaseState
  membership: MembershipPhaseState
  summary: SummaryPhaseState
  snapshot?: ViewState
  changes: DataviewStoreChanges
}
```

### 2.3 stores

最终 stores 保持：

```ts
type DataviewStores = {
  active: value<ViewState | undefined>
  fields: family<FieldId, Field>
  sections: family<SectionId, Section>
  items: family<ItemId, ItemPlacement>
  summaries: family<SectionId, CalculationCollection>
}
```

但 dataview projection glue 要继续压薄到：

- `createDataviewProjection.ts` 只做接线
- spec 直接从 state 读取 store-ready 结构
- 不再自己拼大量 `ProjectionFamilySnapshot`
- 不再自己承担 family 结构转换逻辑

### 2.4 spec 直接映射

dataview 最终要求不是引入 projection-local helper，而是把 runtime 输出形状收口到可直接被 spec 消费：

```ts
stores: {
  active: {
    kind: 'value',
    read: state => state.active.snapshot,
    change: state => state.active.changes.active
  },
  fields: {
    kind: 'family',
    read: state => state.active.fields,
    change: state => state.active.changes.fields
  },
  sections: {
    kind: 'family',
    read: state => state.active.sections,
    change: state => state.active.changes.sections
  },
  items: {
    kind: 'family',
    read: state => state.active.items,
    change: state => state.active.changes.items
  },
  summaries: {
    kind: 'family',
    read: state => state.active.summaries,
    change: state => state.active.changes.summaries
  }
}
```

不允许出现：

- `createDataviewValueStore(...)`
- `createDataviewFamilyStore(...)`
- `createDataviewSnapshotStores(...)`

### 2.5 读写边界

```ts
interface DataviewCurrent {
  rev: number
  doc: DataDoc
  active?: ViewState
  docActiveViewId?: ViewId
  docActiveView?: View
}
```

继续保持：

- `active` 只表示 published projection view
- `docActiveViewId/docActiveView` 只表示 document active view

## 3. whiteboard 最终 API

### 3.1 projection 顶层

whiteboard 顶层 phases 保持：

```ts
type WhiteboardProjectionPhaseName =
  | 'document'
  | 'graph'
  | 'spatial'
  | 'items'
  | 'ui'
  | 'render'
```

不再改 phase 结构。

### 3.2 state

继续保持 working state + phase-owned deltas：

```ts
interface WorkingState {
  ...
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

### 3.3 stores

最终 stores 保持：

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

### 3.4 spec 直接映射

whiteboard 也按同一原则收口：不引入 whiteboard projection-local helper，而是让 state 直接暴露 spec 需要的 read shape 与 change shape。

目标形式：

```ts
stores: {
  graph: {
    node: {
      kind: 'family',
      read: state => state.graph.nodes,
      change: state => state.delta.graph.node
    },
    edge: {
      kind: 'family',
      read: state => state.graph.edges,
      change: state => state.delta.graph.edge
    }
  }
}
```

不允许出现：

- `createMapFamilyStore(...)`
- `createSnapshotFamilyStore(...)`
- `createValueStoreSpec(...)`

### 3.5 stable reader

`createStableMapFamilyRead(...)` / `createStableFamilyRead(...)` 不作为最终模型保留。

它们只是在 state 还没有直接暴露 store-ready family view 时，用来补 `{ ids, byId }` 读取形状。

长期最优要求是：

```ts
state.graph.nodes = {
  ids,
  byId
}
```

然后 spec 直接读取：

```ts
read: state => state.graph.nodes
change: state => state.delta.graph.node
```

因此最终不允许保留：

- `createStableMapFamilyRead(...)`
- `createStableFamilyRead(...)`

如果短期内仍存在这些 helper，也只允许作为迁移中的临时补形状工具，不能进入最终 API 设计。

## 第二部分：实施方案

## Phase 1. dataview 压薄 projection glue

目标：

- `createDataviewProjection.ts` 变成纯接线层

实施内容：

- 让 dataview active runtime 直接持有 store-ready family read 结构
- 让 `DataviewStoreChanges` 与这些 read 结构一一对应
- 让 projection 文件只保留：
  - runtime read
  - capture
  - stores wiring
  - active phase wiring

完成标准：

- projection 主文件不再包含大段 family snapshot 组装逻辑
- 不引入任何 dataview projection-local helper

## Phase 2. dataview 继续压薄 stores 输入结构

目标：

- dataview runtime 输出结构更直接对接 stores

实施内容：

- 让 `DataviewStoreChanges` 与 `snapshot` 配套输出
- 直接在 active runtime state 中引入只读 family view：
  - `fields`
  - `sections`
  - `items`
  - `summaries`
- projection 不再自己从 `ViewState` 临时重建 map

完成标准：

- dataview projection glue 不再需要重复拼 family read snapshot

## Phase 3. whiteboard 压缩 store spec 样板

目标：

- whiteboard projection 主文件更短、更直

实施内容：

- 让 working state 直接暴露 store-ready read 结构
- 让 `delta.*` 直接对齐这些 read 结构
- stores spec 直接从 state 映射，不经过 whiteboard projection-local builder
- 把当前 `Map -> { ids, byId }` 的稳定化逻辑下沉到 runtime/state 内部
- 删除 projection 层的 stable reader helper

完成标准：

- `runtime/model.ts` 中的 `stores` 定义长度明显下降
- 重复的 `kind/read/change/idsEqual` 不再成片出现
- 不引入 whiteboard projection-local helper

## Phase 4. whiteboard stable reader 收口

目标：

- 彻底删除 projection 层的 stable reader helper

实施内容：

- 在 working state 中直接持有：
  - `graph.nodes`
  - `graph.edges`
  - `graph.mindmaps`
  - `graph.groups`
  - `graph.state.nodes`
  - `graph.state.edges`
  - `render.nodes`
  - `render.edge.statics`
  - `render.edge.active`
  - `render.edge.labels`
  - `render.edge.masks`
  - `items`
- projection spec 只从这些 view 直接读取
- 删除 `createStableMapFamilyRead(...)`
- 删除 `createStableFamilyRead(...)`

完成标准：

- projection 层不再承担 `Map -> family snapshot` 结构协调
- projection 层不再有 stable reader helper

## Phase 5. 清理 projection wrapper 的冗余适配

目标：

- wrapper 只保留接口适配，不承担语义

实施内容：

- 检查 dataview engine 对 projection 的读取面
- 检查 whiteboard `createEditorSceneProjectionRuntime` / `createEditorSceneRuntime`
- 只保留：
  - 对外接口整形
  - source input -> runtime input 适配
- 不新增任何 projection 派生语义

完成标准：

- wrapper 不再出现重复 planner / repeated capture / repeated diff

## Phase 6. 最终清理标准

dataview 不应再有：

- projection 文件内的大段 family snapshot 组装
- projection 文件内重复的 changed 判定 glue
- projection 层再次解释 query/membership/summary 语义
- dataview projection-local helper 层

whiteboard 不应再有：

- 大段重复 store spec 样板
- stable reader helper
- projection 层重复 graph/render/ui 语义判断
- whiteboard projection-local helper 层

shared/projection 不应再有：

- 新增任何 domain helper
- 回到 `surface/patch` 模式
- 为 dataview/whiteboard 的局部样板问题引入通用 DSL

## 最终要求

- `shared/projection` 继续保持薄骨架，不再扩张。
- dataview 继续压薄 projection glue，直接按 spec 映射 runtime 输出。
- whiteboard 继续压薄 store spec 声明，直接按 spec 映射 runtime 输出。
- 所有优化都以“减少 glue 和样板”为目标，不再新增抽象层，不再新增 domain projection helper。

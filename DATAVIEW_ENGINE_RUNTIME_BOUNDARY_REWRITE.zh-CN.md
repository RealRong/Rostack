# Dataview Engine / Runtime 最终边界重构方案

本文只回答一个问题：

`dataview-engine`、`dataview-runtime`、`shared/core/store` 这三层，长期最优的职责边界到底应该怎么切。

本文明确前提：

- 不在乎重构成本
- 不需要兼容
- 不保留双轨实现
- 性能不能下降
- 目标是最终形态，不是过渡形态

---

## 1. 最终结论

长期最优的答案很明确：

1. `engine` 不应该知道 `store`
2. `engine` 不应该暴露 `source`
3. `runtime` 应该拥有 `source adapter`
4. `store` 只属于 `runtime` 的发布与订阅层
5. `item` 这类大表热点，应该在 `runtime adapter` 内用专用 `KeyTableStore`

一句话概括：

> `engine` 负责算真相，`runtime` 负责把真相变成响应式 source，`react` 负责消费 source 和 model

所以最终正确方向不是：

- 继续让 `engine` 内建 store
- 继续让 `engine` 对外暴露 `source`
- 继续让 `createEngine()` 顺手组装 UI 响应式发布层

最终正确方向是：

- `createEngine()` 只产出纯内核和同步 API
- `createDataViewRuntime()` 再基于 `engine.core` 创建 source adapter 和 model

---

## 2. 为什么现在的边界不对

当前实现的问题不是“有一层 adapter”，而是 adapter 放错了地方。

现在的结构大致是：

1. `engine core` 产出 `snapshot + change`
2. `engine` 内部直接创建 `createEngineStoreSourceAdapter`
3. `engine` 把 `source` 暴露给外部
4. `dataview-runtime` 再消费这份 `source`

这有四个根问题。

### 2.1 所有权反了

真正依赖 `store` 的不是 `engine`，而是：

- `dataview-runtime` 的 page/session
- `dataview-runtime` 的 selection/marquee/valueEditor
- `dataview-runtime` 的 table/gallery/kanban model
- `dataview-react` 的订阅和渲染

也就是说：

- `engine` 是数据生产者
- `runtime` 才是响应式消费宿主

但现在却是生产者在持有消费侧基础设施。

### 2.2 engine 公共合同被 store 污染

当前 `EngineSource`、`EntitySource`、`SectionSource`、`ItemSource` 都直接引用：

- `ReadStore`
- `KeyedReadStore`

这会把 `store` 从“实现细节”抬升成“engine 语义的一部分”。

一旦未来想：

- 换 store 实现
- 做非响应式宿主
- 做 worker/bridge/event adapter
- 做直接 snapshot host

都会先碰到 `engine contracts` 的阻力。

### 2.3 engine API 也被 adapter 反向塑形

当前不只是 `source` 耦合 store，连 `engine` 自己的公共 API 也已经被带偏。

典型例子：

- `ActiveViewApi.id/config/state` 直接是 `ReadStore`
- `fields/views/records` API 通过 `source` 读数据
- `active/context` 通过 runtime store 建状态入口

这意味着 engine 的 API 不再直接建立在：

- `document`
- `active snapshot`
- `dispatch`

而是建立在：

- 某种特定发布形态

这是方向性错误。

### 2.4 性能优化被迫混入 engine

你前面定位的很多热点，其实都发生在发布链：

- item fanout
- keyed patch
- source apply
- listener compare

这些优化本来都应该属于 runtime adapter。

如果 store 继续留在 engine 里，就会不断出现这种问题：

- 一个 runtime 层的发布优化，最后要修改 engine contract
- 一个 UI 订阅问题，最后会污染 engine 设计

这会让系统长期很难收敛。

---

## 3. 最终分层

长期最优建议固定成 4 层。

### 3.1 `@dataview/engine`

职责：

- document commit
- active derive
- index/cache/runtime state
- snapshot production
- change production
- 同步读 API
- 同步写 API

明确不负责：

- `store`
- `source`
- React 订阅
- runtime model
- selection/page/marquee 这类交互状态

### 3.2 `@dataview/runtime`

职责：

- 把 `engine.core` 变成响应式 `source`
- 持有 `store` / `KeyedStore` / `KeyTableStore`
- 管理 page/session/selection/marquee/valueEditor
- 产出 table/gallery/kanban/page model

一句话：

> `runtime` 是 engine 的响应式宿主

### 3.3 `@dataview/react`

职责：

- 订阅 runtime source / runtime model
- 视图组件、hooks、虚拟化、渲染联动

明确不负责：

- engine 结果推导
- source patch
- store adapter

### 3.4 `@shared/core/store`

职责：

- 提供通用 store 基础设施
- 提供大型 keyed table 专用设施

建议最终同时保留两类设施：

- 通用 `ValueStore` / `KeyedStore`
- 大表专用 `KeyTableStore`

但它们都只属于 runtime adapter，不属于 engine。

---

## 4. 最终职责归属

### 4.1 engine 拥有的东西

下面这些必须归 `engine`：

- `EngineState`
- `EngineSnapshot`
- `EngineChange`
- `EngineResult`
- `EngineCore`
- `EngineReadApi`
- `ActiveViewApi`
- `FieldsApi`
- `ViewsApi`
- `RecordsApi`
- `dispatch`

这里有个关键约束：

- 这些 API 都必须建立在同步读模型上
- 不得依赖 `ReadStore`
- 不得依赖 `KeyedReadStore`

### 4.2 runtime 拥有的东西

下面这些必须归 `runtime`：

- `EngineSource`
- `DocumentSource`
- `ActiveSource`
- `ItemSource`
- `SectionSource`
- `createEngineSource`
- `createDataViewRuntime`
- 各类 session / model / controller

也就是说：

- `contracts/source.ts` 不应留在 engine
- source contract 应迁到 runtime

### 4.3 react 拥有的东西

下面这些继续归 `react`：

- hooks
- view components
- pointer/keyboard behavior
- virtual layout
- DOM 交互

react 不应该反向要求 engine 暴露 store。

---

## 5. 最终主流程

最终整条链应该收敛成下面 6 步：

1. `commit`
2. `derive`
3. `change`
4. `publish result`
5. `runtime source apply`
6. `runtime model/session react`

展开后是：

1. `engine.commit` 修改 document
2. `engine` 跑完整 derive，得到 next snapshot
3. `engine` 同时产出精确 `change`
4. `engine.core.subscribe` 发布 `EngineResult`
5. `runtime` 的 source adapter 按 `change` apply 到 store
6. `runtime` 的 model/session 再基于 source 派生

这里有两个硬约束：

- source adapter 不允许再做 `previousSnapshot/nextSnapshot` diff
- model/session 不允许自己再猜业务变化

---

## 6. engine 的最终公共 API

最终 `engine` 只保留纯内核和同步 API。

### 6.1 Engine

```ts
export interface Engine {
  core: EngineCore
  read: EngineReadApi
  active: ActiveViewApi
  views: ViewsApi
  fields: FieldsApi
  records: RecordsApi
  document: DocumentApi
  history: HistoryApi
  performance: PerformanceApi
  dispatch: (action: Action | readonly Action[]) => ActionResult
}
```

最终明确删除：

- `source`

也就是说，下面这种形态不再成立：

```ts
engine.source.active.items.ids
engine.source.active.sections.summary
```

这是 runtime 的事情，不是 engine 的事情。

### 6.2 EngineCore

```ts
export interface EngineCore {
  read: {
    result: () => EngineResult
    snapshot: () => EngineSnapshot
    change: () => EngineChange | undefined
    document: () => DataDoc
    active: () => ActiveSnapshot | undefined
  }
  commit: {
    actions: (actions: readonly Action[]) => ActionResult
    replace: (document: DataDoc) => ActionResult
    undo: () => ActionResult
    redo: () => ActionResult
    clearHistory: () => void
  }
  history: {
    state: () => HistoryState
    canUndo: () => boolean
    canRedo: () => boolean
  }
  subscribe: (listener: (result: EngineResult) => void) => () => void
}
```

### 6.3 EngineReadApi

```ts
export interface EngineReadApi {
  document: () => DataDoc
  record: (recordId: RecordId) => DataRecord | undefined
  field: (fieldId: FieldId) => CustomField | undefined
  view: (viewId: ViewId) => View | undefined
  activeViewId: () => ViewId | undefined
  activeView: () => View | undefined
  activeState: () => ActiveSnapshot | undefined
}
```

这层只做同步读，不做响应式订阅。

### 6.4 ActiveViewApi

最终 `ActiveViewApi` 也不应暴露 store。

```ts
export interface ActiveViewApi {
  id: () => ViewId | undefined
  view: () => View | undefined
  state: () => ActiveSnapshot | undefined
  read: ActiveViewReadApi
  changeType: (type: ViewType) => void
  search: {
    set: (query: string) => void
  }
  filters: {
    add: (fieldId: FieldId) => void
    update: (index: number, rule: FilterRule) => void
    setPreset: (index: number, presetId: string) => void
    setValue: (index: number, value: FilterRule['value'] | undefined) => void
    setMode: (mode: Filter['mode']) => void
    remove: (index: number) => void
    clear: () => void
  }
  sort: {
    add: (fieldId: FieldId, direction?: SortDirection) => void
    update: (fieldId: FieldId, direction: SortDirection) => void
    keepOnly: (fieldId: FieldId, direction: SortDirection) => void
    move: (from: number, to: number) => void
    replace: (index: number, sorter: Sorter) => void
    remove: (index: number) => void
    clear: () => void
  }
  group: {
    set: (fieldId: FieldId) => void
    clear: () => void
    toggle: (fieldId: FieldId) => void
    setMode: (mode: string) => void
    setSort: (sort: BucketSort) => void
    setInterval: (interval: ViewGroup['bucketInterval']) => void
    setShowEmpty: (value: boolean) => void
  }
  sections: {
    show: (sectionKey: string) => void
    hide: (sectionKey: string) => void
    collapse: (sectionKey: string) => void
    expand: (sectionKey: string) => void
    toggleCollapse: (sectionKey: string) => void
  }
  summary: {
    set: (fieldId: FieldId, metric: CalculationMetric | null) => void
  }
  display: {
    replace: (fieldIds: readonly FieldId[]) => void
    move: (fieldIds: readonly FieldId[], beforeFieldId?: FieldId | null) => void
    show: (fieldId: FieldId, beforeFieldId?: FieldId | null) => void
    hide: (fieldId: FieldId) => void
    clear: () => void
  }
  table: {
    setColumnWidths: (widths: Partial<Record<FieldId, number>>) => void
    setVerticalLines: (value: boolean) => void
    setWrap: (value: boolean) => void
    insertFieldLeft: (
      anchorFieldId: FieldId,
      input?: { name?: string, kind?: CustomFieldKind }
    ) => CustomFieldId | undefined
    insertFieldRight: (
      anchorFieldId: FieldId,
      input?: { name?: string, kind?: CustomFieldKind }
    ) => CustomFieldId | undefined
  }
  gallery: GalleryApi
  kanban: KanbanApi
  records: ActiveRecordsApi
  items: ActiveItemsApi
  cells: ActiveCellsApi
}
```

注意：

- `id/config/state` 这类 `ReadStore` 字段全部改成同步函数
- runtime 如果要响应式订阅，再自己建 source

---

## 7. runtime 的最终公共 API

runtime 是响应式宿主，所以这里才应该出现 `source`。

### 7.1 EngineSource

这份 contract 应迁到 `@dataview/runtime`，不再属于 `@dataview/engine`。

```ts
export interface EngineSource {
  doc: DocumentSource
  active: ActiveSource
}
```

### 7.2 DocumentSource

```ts
export interface DocumentSource {
  records: EntitySource<RecordId, DataRecord>
  fields: EntitySource<FieldId, CustomField>
  views: EntitySource<ViewId, View>
}
```

### 7.3 ActiveSource

```ts
export interface ActiveSource {
  view: {
    ready: ReadStore<boolean>
    id: ReadStore<ViewId | undefined>
    type: ReadStore<View['type'] | undefined>
    current: ReadStore<View | undefined>
  }
  meta: {
    query: ReadStore<ActiveViewQuery>
    table: ReadStore<ActiveViewTable>
    gallery: ReadStore<ActiveViewGallery>
    kanban: ReadStore<ActiveViewKanban>
  }
  items: ItemSource
  sections: SectionSource
  fields: {
    all: EntitySource<FieldId, Field>
    custom: EntitySource<FieldId, CustomField>
  }
}
```

### 7.4 ItemSource

长期最优形态下，`ItemSource` 仍然可以保留现在的读面，但它必须是 runtime adapter 的产物。

```ts
export interface ItemSource {
  ids: ReadStore<readonly ItemId[]>
  table: KeyTableReadStore<ItemId, ItemValue>
  read: {
    record: KeyedReadStore<ItemId, RecordId | undefined>
    section: KeyedReadStore<ItemId, SectionKey | undefined>
    placement: KeyedReadStore<ItemId, ItemPlacement | undefined>
  }
}
```

关键点：

- 真源是 `table`
- `read.record / read.section / read.placement` 只是投影
- 这层设计属于 runtime，不属于 engine

### 7.5 createEngineSource

runtime 需要一个低层 adapter 入口。

```ts
export interface EngineSourceRuntime {
  source: EngineSource
  reset: (snapshot: EngineSnapshot) => void
  apply: (change: EngineChange | undefined, snapshot: EngineSnapshot) => void
  clear: () => void
  dispose: () => void
}

export interface CreateEngineSourceInput {
  core: EngineCore
}

export const createEngineSource: (
  input: CreateEngineSourceInput
) => EngineSourceRuntime
```

它的职责很明确：

1. 基于 `core.read.snapshot()` 初始化 source
2. 订阅 `core.subscribe(result => ...)`
3. 按 `change` apply 到 store
4. 不做 snapshot-to-snapshot diff

### 7.6 createDataViewRuntime

高层 runtime 组装器继续存在，但它应内部持有 source runtime。

```ts
export interface CreateDataViewRuntimeInput {
  engine: Engine
  initialPage?: PageSessionInput
}

export interface DataViewRuntime {
  engine: Engine
  source: DataViewSource
  session: DataViewSessionApi
  intent: DataViewIntentApi
  model: DataViewModel
  dispose(): void
}
```

组装顺序应该是：

1. `createEngineSource({ core: engine.core })`
2. 基于 source 创建 page/session/selection/marquee/valueEditor
3. 基于 source 创建 table/gallery/kanban/page model
4. 暴露 runtime 对外接口

也就是说：

- `DataViewRuntime` 继续可以暴露 `source`
- 但 `source` 来自 `runtime`
- 不再来自 `engine`

---

## 8. 为什么 KeyTableStore 必须放在 runtime

`KeyTableStore` 这类设施，虽然看起来和数据结构有关，但本质上仍然属于发布层，不属于 engine。

原因有四个。

### 8.1 它解决的是发布问题，不是推导问题

`KeyTableStore` 解决的是：

- 只比较已订阅 key
- 大 patch 不 clone 全表
- 单真源表按字段投影

这些都是 runtime source 发布问题，不是 engine derive 问题。

### 8.2 engine 不需要知道订阅模型

engine 只需要知道：

- 本次 `ItemChange` 变了哪些 item
- 每个 item 的新值是什么

engine 不需要知道：

- 哪些 key 被 UI 订阅
- 哪些字段需要投影成 store
- 哪些 key 需要 compare

这些都是 runtime adapter 的内部实现。

### 8.3 这样才能支持非 store adapter

如果未来除了 `store adapter` 还有：

- `event adapter`
- `devtools adapter`
- `worker bridge adapter`
- `snapshot host adapter`

它们都不需要 `KeyTableStore`。

只有 runtime source adapter 需要。

### 8.4 这样才能避免 engine contracts 再次膨胀

如果把 `KeyTableStore` 相关 contract 写进 engine，就会再次出现：

- 一个 runtime 优化反向进入 engine 合同

这正是应该避免的事。

---

## 9. engine 内部 API 该怎么改

既然 engine 不再持有 source，那 engine 自己的各类 API 也要同步收口。

### 9.1 `fields / views / records` 不再读 source

最终它们都应直接基于：

- `core.read.document()`
- `dispatch`

而不是：

- `source.doc.fields`
- `source.doc.views`
- `source.doc.records`

这层 API 本来就是同步 API，没有理由建立在 store 上。

### 9.2 `active/context` 不再读 store

最终 `ActiveContext` 应直接读：

- `core.read.active()`
- `core.read.document()`

而不是：

- `stateStore`
- `source.active.view.current`

建议最终形态：

```ts
export interface ActiveContext {
  id: () => ViewId | undefined
  view: () => View | undefined
  snapshot: () => ActiveSnapshot | undefined
  reader: DocumentReader
  dispatch: (action: Action | readonly Action[]) => ActionResult
  patch: (
    resolve: (view: View, reader: DocumentReader) => ViewPatch | undefined
  ) => boolean
}
```

### 9.3 `EngineReadApi` 才是 engine 的统一读入口

最终所有 engine 内同步读，都应该尽量收敛到：

- `core.read.*`
- `read.*`

而不是散落在 source store 上。

---

## 10. runtime source adapter 的最终实现原则

runtime adapter 不负责推理，只负责 apply。

### 10.1 Document

- doc records/fields/views 用普通 `KeyedStore`
- `EntityChange` 直接 apply

### 10.2 Active meta

- view ready/id/type/current 用 `ValueStore`
- query/table/gallery/kanban 用 `ValueStore`
- `ActiveViewChange` 直接 apply

### 10.3 Items

- `ids` 用 `ValueStore`
- `table` 用 `KeyTableStore<ItemId, ItemValue>`
- `record/section/placement` 用 `table.project.field(...)`

### 10.4 Sections

- `keys` 用 `ValueStore`
- `values` 用普通 `KeyedStore`
- `summary` 用普通 `KeyedStore`

### 10.5 apply 规则

所有 apply 都遵守一条原则：

- 只消费 `EngineChange`
- 不回头看 `previousSnapshot`

---

## 11. 最终目录布局

建议最终按下面的目录收口。

### 11.1 `@dataview/engine`

```text
dataview/packages/dataview-engine/src/
  api/
    createEngine.ts
    read.ts
    active.ts
    fields.ts
    views.ts
    records.ts
  core/
    runtime.ts
    change.ts
    result.ts
  active/
    ...
  mutate/
    ...
  document/
    ...
  contracts/
    api.ts
    core.ts
    change.ts
    view.ts
    shared.ts
```

明确删除：

- `contracts/source.ts`
- `publish/store/runtime.ts`

### 11.2 `@dataview/runtime`

```text
dataview/packages/dataview-runtime/src/
  source/
    contracts.ts
    createEngineSource.ts
    items.ts
    sections.ts
    document.ts
  dataview/
    runtime.ts
    types.ts
  model/
    ...
  page/
    ...
  selection/
    ...
  marquee/
    ...
  valueEditor/
    ...
```

收口原则：

- source contract 归 runtime
- source adapter 归 runtime
- runtime model 和 session 直接依赖这层 source

---

## 12. 最终依赖关系

最终依赖方向必须单向。

```text
shared/core
  -> dataview-engine
  -> dataview-runtime
  -> dataview-react
```

更具体地说：

- `engine` 可以依赖 `shared/core` 的通用集合/相等/工具
- `engine` 不依赖 `shared/core/store`
- `runtime` 依赖 `engine contracts + shared/core/store`
- `react` 依赖 `runtime`

不能再出现：

- `engine` 依赖 runtime
- `engine contracts` 内嵌 runtime source 语义

---

## 13. 实施顺序

这部分按“不兼容、一步到位”来拆。

### 第一步：冻结最终 contract

冻结下面这些 engine contract：

- `Engine`
- `EngineCore`
- `EngineResult`
- `EngineSnapshot`
- `EngineChange`
- `EngineReadApi`
- `ActiveViewApi`

同时冻结下面这些 runtime contract：

- `EngineSource`
- `DocumentSource`
- `ActiveSource`
- `ItemSource`
- `SectionSource`
- `EngineSourceRuntime`

### 第二步：从 engine 删除 source

必须完成：

- `Engine` 删掉 `source`
- `contracts/source.ts` 从 engine 移除
- `createEngine.ts` 不再 import source adapter

完成标准：

- `createEngine()` 只返回 core 和同步 API

### 第三步：收回 engine 内部同步读

必须完成：

- `fields/views/records` 改为直接读 `core.read.document()`
- `active/context` 改为直接读 `core.read.active()`
- `ActiveViewApi` 改成同步函数，不再暴露 store

### 第四步：在 runtime 新建 source adapter

新增：

- `createEngineSource({ core })`
- runtime source contracts
- runtime item/section/document apply 逻辑

完成标准：

- runtime 能独立从 `engine.core` 建 source

### 第五步：把 item 热路径切到 KeyTableStore

必须完成：

- `ItemSource` 真源改成 `table`
- `record/section/placement` 改成投影
- 删除三份物理 item keyed store fanout 真源

完成标准：

- item source 发布只 apply 一次

### 第六步：重写 createDataViewRuntime 组装

必须完成：

- runtime 内部调用 `createEngineSource`
- page/session/model 全部消费 runtime 自己的 source
- 不再依赖 `engine.source`

### 第七步：删除旧实现

必须删除：

- `dataview-engine/src/publish/store/runtime.ts`
- engine 内所有 `store.*` source 发布逻辑
- 所有 `previousSnapshot/nextSnapshot` 二次 diff 逻辑

---

## 14. 删除清单

下面这些旧模式必须一起删，不保留兼容。

### 14.1 engine 侧

- `Engine.source`
- `contracts/source.ts`
- `createEngineStoreSourceAdapter`
- `createEngine.ts` 里对 source adapter 的组装
- `ActiveViewApi` 里的 `ReadStore` 字段
- 所有通过 `source` 驱动 engine 同步读 API 的实现

### 14.2 发布链侧

- item 三份物理真源 store
- adapter 内的 snapshot-to-snapshot diff
- 任何“根据前后快照再猜变化”的帮助函数

### 14.3 正确性风险侧

必须避免保留这种中间状态：

- engine snapshot 已更新
- runtime source 还是旧的
- UI 读到的是 adapter 残留值

最终只能保留一种机制：

- `EngineResult` 发布
- runtime 按本轮 `change` apply

---

## 15. 为什么这是长期最优

这个方案同时满足四个目标。

### 15.1 复杂度最低

边界足够清楚：

- engine 算
- runtime 发
- react 读

没有职责交叉。

### 15.2 错误率最低

导致“旧值、错位、分裂状态”的根源，基本都来自边界混乱。

边界切干净后：

- source 不再是 engine 的第二真相
- adapter 不再自己猜变化
- runtime 只 apply 本轮 change

错误面会明显收缩。

### 15.3 性能不会下降

这个方案不是为了“更干净而牺牲性能”，相反它给性能留下了更大的优化空间：

- engine 不再背 store 成本
- runtime 可以专门为 item/source 引入 `KeyTableStore`
- 大表订阅优化只放在需要的地方

### 15.4 可扩展性更强

以后如果要新增：

- devtools adapter
- worker bridge adapter
- event stream adapter
- 无 store 的 host

都不需要再改 engine 语义。

---

## 16. 最终判断标准

重构完成后，系统应满足下面这些条件。

### 16.1 架构判断

- `engine` 不依赖 `shared/core/store`
- `engine` 不暴露 `source`
- `runtime` 拥有 source contract 和 source adapter

### 16.2 API 判断

- `Engine` 只暴露 core 和同步 API
- `ActiveViewApi` 不再暴露 `ReadStore`
- `DataViewRuntime` 的 `source` 来自 runtime 自己

### 16.3 数据判断

- 每次 commit 只产生一份 `snapshot`
- 每次 commit 只产生一份 `change`
- runtime adapter 只 apply 这份 `change`

### 16.4 性能判断

- item/source 发布热点不再污染 engine
- 大表优化集中在 runtime `KeyTableStore`
- adapter 不再做 snapshot-to-snapshot diff

---

## 17. 最终建议

如果按长期最优来做，这次不应该再理解成“继续优化 engine 里的 store adapter”。

真正应该做的是：

1. 把 `store` 从 engine 里彻底移出去
2. 把 `source` 从 engine contract 里彻底移出去
3. 把 `runtime` 明确升级成 engine 的响应式宿主
4. 把 item 大表优化集中收敛到 runtime adapter 的 `KeyTableStore`

最终系统的稳定形态应该是：

```ts
const engine = createEngine({ document })
const runtime = createDataViewRuntime({ engine })
```

其中：

- `engine` 只负责算
- `runtime` 只负责发
- `react` 只负责用

这是复杂度最低、错误率最低、长期性能也最稳的边界设计。

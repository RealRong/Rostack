# Dataview Engine 单 Active View 最终重构清单

## 文档定位

这份文档是 `dataview/src/engine` 的最终收口方案，前提已经明确：

- 运行时全局只有一个 active view。
- 不需要多面板并行存在。
- 不需要同时维护多个 view runtime。
- 不需要预热 inactive view。
- 切换 view 时允许重建当前 active runtime。

因此，这份方案不再为“未来可能出现的多 view 并行 runtime”预留结构。

这不是保守兼容方案，也不是局部整理建议，而是基于单 active view 约束做出的更简单、更激进、也更适合当前产品的长期版本。

## 核心结论

当前 `engine` 最大的问题，不是算法不够强，而是围绕“当前 active view”这个单一事实，仍然堆出了太多中间层：

- `action`
- `command`
- `operation`
- `index`
- `project/runtime`
- `project/publish`
- `store/active`
- `api/public`
- `facade/view`

这些层里有不少在做的其实是同一件事：

- 重新包装 active view 状态
- 重新拼接上下文
- 重新命名同一组数据
- 重新把一次写入拆成另一种中间形式

在“全局只有一个 active view”的前提下，这些层里有一大半都应该被压平。

一句话结论：

- 保留多 view 的文档数据模型。
- 删除多余的多 session runtime 心智模型。
- 把 engine 收口成 `doc + active runtime + write planner` 三个主轴。

## 对当前代码的判断

## 1. `activeViewId` 驱动 index demand 不是问题，应该被接受

当前 `resolveIndexDemand(document, activeViewId)` 直接按 active view 推导 demand，见：

- `dataview/src/engine/project/runtime/demand.ts`
- `dataview/src/engine/store/state.ts`

如果要支持多个并行 runtime，这会成为结构限制。

但在你当前明确不要多面板、不要多 runtime 的前提下，这恰恰是正确的简化。

也就是说，这里不该继续往“全局 per-view index registry”方向演进，而应该明确承认：

- index 就是当前 active view 服务的 active index
- 它和 active view 生命周期绑定是合理的

后续方案里应该保留这一点，而不是把它视为必须消除的耦合。

## 2. 真正多余的是 `project/runtime -> publish -> store/active` 三层包装

当前 active view 派生链路里，存在明显重复包装：

- `project/runtime` 生成内部派生状态
- `project/publish` 再把它包装成更像 public 的结构
- `store/active` 再把 `project.*` 拼成 `ActiveViewState`
- `store/active/read.ts` 再补 `cell`、`planMove`、`filterField`、`groupField`

这条链过长，而且所有层都围绕“当前 active view”工作，并没有真正的多 session 价值。

在单 active view 模式下，正确做法是：

- 删除 `project` 这个中间主语
- 直接建立 `active runtime`
- internal 只保留一份 `ViewSnapshot`
- public `engine.view.state` 直接读它

也就是说，应该从：

```text
doc -> index -> project/runtime -> project/publish -> store/active -> current view api
```

变成：

```text
doc -> currentViewIndex -> currentViewSnapshot -> current view api
```

## 3. `lowerAction -> runCommands` 双阶段写入链过重

当前主写入路径是：

- `resolveActionBatch(...)`
- `lowerAction(...)`
- `runCommands(...)`
- `applyOperations(...)`

这里的问题是：

- action 层循环维护一次 `workingDocument`
- command 层循环又维护一次 `workingDocument`
- `lowerAction` 与 `runCommands` 都在做存在性校验、结构校验、补默认值、生成下游 payload

这条链条在“engine 想保留一套 command IR”时还能自圆其说。

但对你现在的目标来说，这条链已经明显过度设计了。

最终应该改成：

```text
dispatch(action)
  -> planActions(document, actions)
  -> applyOperations(document, operations)
  -> deriveView(document, delta)
```

也就是：

- 只保留一套 planner
- planner 直接产出 operation plan
- 不再保留现有 `command` 这一层的中间抽象

## 4. `facade/view/index.ts` 已经不是 façade，而是 active runtime 的上帝对象

当前这个文件同时承担：

- active store 装配
- patch action 构造
- query 写入
- group 规则写值
- item move
- item create
- cell 写入
- table/gallery/kanban 特化
- 字段创建与显示列插入

它的问题不是“大”，而是：

- 轻量 patch 操作和重业务动作混在一起
- 上下文缺失，只能靠 `withView`、`withField`、`withGroupField` 这类 helper 拼
- active runtime 的真实规则被埋在 façade 里

在单 active view 模式下，更应该直接拆成 active domain services：

- `active/query`
- `active/items`
- `active/cells`
- `active/display`
- `active/table`
- `active/gallery`
- `active/kanban`

façade 本身只能保留薄路由。

## 5. 当前命名重复，且很多名字在单 active view 语义下已经没有必要

当前有一组很重的名字：

- `EngineReadApi`
- `ActiveReadApi`
- `ActiveEngineApi`
- `ViewsEngineApi`
- `FieldsEngineApi`
- `RecordsEngineApi`
- `ProjectState`
- `ProjectionState`

这些名字的问题不只是长，更重要的是：

- 很多名字是在为“可能还有别的 engine/view/runtime 变体”做区分
- 但你的产品语义并不需要那么多区分

在单 active view 模式下，命名应该更直接：

- `DocumentReadApi`
- `ViewApi`
- `ViewReadApi`
- `ViewsApi`
- `FieldsApi`
- `RecordsApi`
- `ViewIndex`
- `ViewSnapshot`
- `ViewCache`
- `PerformanceApi`
- `ViewItem`
- `ItemList`

## 最终架构决策

## 一、保留什么

- 保留 `DataDoc.views` 和 `DataDoc.activeViewId`
- 保留 `engine.views` 作为 view 集合管理
- 保留 `engine.view` 作为唯一完整当前 view API
- 保留 active view 驱动的 index 体系
- 保留 performance trace 与 history
- 保留 search/group/sort/calculation 这些索引与汇总算法

## 二、删除什么

- 删除 `project` 作为中间 runtime 主语
- 删除“可能存在多个并行 session”的设计预留
- 删除 `command` 这层中间 IR
- 删除 `store/active` 对 active state 的二次包装
- 删除 scoped view runtime façade 的心智模型
- 删除 inactive view runtime 预热/缓存方向

## 三、明确接受什么代价

- `view.open(viewId)` 时可以重建当前 active runtime
- 不为 inactive view 维持派生缓存
- 不追求切 view 时复用旧 active runtime 身份

这是有意识的简化，不是退化。

## 目标结构

建议最终收口为：

```text
dataview/src/engine/
  api/
    createEngine.ts
    public/
      engine.ts
      index.ts
  contracts/
    public.ts
    internal.ts
  state/
    store.ts
    history.ts
    performance.ts
  mutate/
    planner/
      index.ts
      record.ts
      value.ts
      field.ts
      view.ts
      shared.ts
      validate.ts
  derive/
    activeIndex/
      ...
    active/
      runtime.ts
      snapshot.ts
      query.ts
      sections.ts
      calculations.ts
      collections.ts
  services/
    views.ts
    fields.ts
    records.ts
    active/
      index.ts
      query.ts
      items.ts
      cells.ts
      display.ts
      table.ts
      gallery.ts
      kanban.ts
```

这里最重要的不是目录名，而是依赖方向：

- `contracts/internal.ts` 只给 engine 内部用
- `contracts/public.ts` 只给外部与 services 边界用
- `derive/active/*` 不 import `api/public`
- `api/createEngine.ts` 只做装配
- `services/*` 不承载核心派生规则

## 目标 store 形状

单 active view 模式下，store 应该非常直接：

```ts
interface EngineState {
  rev: number
  doc: DataDoc
  history: HistoryState
  currentView: {
    demand: ViewDemand
    index: ViewIndex
    cache: ViewCache
    snapshot: ViewSnapshot
  }
}
```

这里的关键点：

- 不再有 `project`
- 不再有 `cache.indexDemand + cache.projection` 的拆散组合
- 所有当前 view runtime 相关状态都放在 `currentView` 下

## 目标 derive 链路

最终链路应该是：

```text
dispatch(action)
  -> planActions(base.doc, actions)
  -> applyOperations(base.doc, operations)
  -> resolveViewDemand(nextDoc, nextDoc.activeViewId)
  -> deriveViewIndex(previous.currentView.index, nextDoc, delta, demand)
  -> deriveViewSnapshot(previous.currentView.snapshot, previous.currentView.cache, nextDoc, viewIndex, delta)
  -> commit(nextState)
```

这里要点只有两个：

- current view index 继续只服务当前 active view
- current view snapshot 是唯一当前 view 派生快照

## 最终命名规则

最终 API 命名必须同时满足四个条件：

- 短，但不能靠缩写变短。
- 语义直接，不要靠上下文猜。
- 使用行业常见词。
- singular / plural 一致，看到名字就知道是“当前对象”还是“集合”。

硬性规则如下：

- 用完整单词，不使用业务缩写：
  - `performance`，不用 `perf`
  - `summary`，不用 `calc`
  - `current`，不用 `ctx` 一类缩写
  - `item`，不用 `appearance`
- 当前运行时对象使用单数：
  - `view`
  - `document`
  - `history`
  - `performance`
- 集合管理对象使用复数：
  - `views`
  - `fields`
  - `records`
- 持久化配置统一叫 `config`
- 运行时快照统一叫 `state`
- 操作动词只使用下面这些常见词：
  - `get`
  - `list`
  - `open`
  - `create`
  - `rename`
  - `update`
  - `replace`
  - `remove`
  - `move`
  - `set`
  - `clear`
  - `toggle`

## 最终 public API 设计

建议最终稳定版：

```ts
interface Engine {
  read: DocumentReadApi
  view: ViewApi
  views: ViewsApi
  fields: FieldsApi
  records: RecordsApi
  document: DocumentApi
  history: HistoryApi
  performance: PerformanceApi
  dispatch: (action: Action | readonly Action[]) => ActionResult
}
```

约束如下：

- `engine.views` 只做 view 集合管理
- `engine.view` 是唯一完整当前 view API
- 任何依赖 sections、items、group runtime 的能力，只能存在于 `engine.view`
- 顶层显式暴露 `dispatch`，其余 service 只是便利层

### `DocumentReadApi`

```ts
interface DocumentReadApi {
  document: ReadStore<DataDoc>
  recordIds: ReadStore<readonly RecordId[]>
  record: KeyedReadStore<RecordId, DataRecord | undefined>
  fieldIds: ReadStore<readonly CustomFieldId[]>
  field: KeyedReadStore<CustomFieldId, CustomField | undefined>
  viewIds: ReadStore<readonly ViewId[]>
  view: KeyedReadStore<ViewId, View | undefined>
}
```

说明：

- 这里是文档级只读入口。
- 这里的 `field` 指文档中持久化的自定义字段，不负责 active view 的可见字段列表。

### `ViewsApi`

```ts
interface ViewsApi {
  list: () => readonly View[]
  get: (viewId: ViewId) => View | undefined
  open: (viewId: ViewId) => void
  create: (input: {
    name: string
    type: ViewType
  }) => ViewId | undefined
  rename: (viewId: ViewId, name: string) => void
  duplicate: (viewId: ViewId) => ViewId | undefined
  remove: (viewId: ViewId) => void
}
```

说明：

- `views` 只负责持久化 view 集合管理。
- `views` 不暴露当前 view runtime。

### `ViewApi`

```ts
interface ViewApi {
  id: ReadStore<ViewId | undefined>
  config: ReadStore<View | undefined>
  state: ReadStore<ViewState | undefined>
  select: <T>(
    selector: (state: ViewState | undefined) => T,
    isEqual?: Equality<T>
  ) => ReadStore<T>
  read: ViewReadApi

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
    move: (
      fieldIds: readonly FieldId[],
      beforeFieldId?: FieldId | null
    ) => void
    show: (
      fieldId: FieldId,
      beforeFieldId?: FieldId | null
    ) => void
    hide: (fieldId: FieldId) => void
    clear: () => void
  }

  table: {
    setColumnWidths: (widths: Partial<Record<FieldId, number>>) => void
    setVerticalLines: (value: boolean) => void
    insertFieldLeft: (
      anchorFieldId: FieldId,
      input?: {
        name?: string
        kind?: CustomFieldKind
      }
    ) => CustomFieldId | undefined
    insertFieldRight: (
      anchorFieldId: FieldId,
      input?: {
        name?: string
        kind?: CustomFieldKind
      }
    ) => CustomFieldId | undefined
  }

  gallery: GalleryApi
  kanban: KanbanApi
  items: ViewItemsApi
  cells: ViewCellsApi
}
```

说明：

- `view` 是当前 view runtime 的唯一完整入口。
- `config` 表示当前 view 的持久化配置。
- `state` 表示当前 view 的运行时快照。
- `summary` 是最终公开名，不再使用 `calc`。

### `ViewState`

```ts
type ItemId = string

interface ViewState {
  view: View
  query: ViewQuery
  records: ViewRecords
  sections: SectionList
  items: ItemList
  fields: FieldList
  summaries: ReadonlyMap<SectionKey, FieldSummaryCollection>
}

interface ViewQuery {
  search: ViewSearchProjection
  filters: ViewFilterProjection
  group: ViewGroupProjection
  sort: ViewSortProjection
}

interface ViewRecords {
  matched: readonly RecordId[]
  ordered: readonly RecordId[]
  visible: readonly RecordId[]
}
```

说明：

- `matched` 表示当前 active view 经过 index 排序后的记录序列，还未叠加 view 手动顺序。
- `ordered` 表示叠加 view 手动顺序后的记录序列；当存在显式 sort 时，通常与 `matched` 相同。
- `visible` 表示在 `ordered` 基础上应用 search/filter 后的结果；section 折叠/隐藏只影响 `sections` 与 `items`，不再回写这里。
- `items` 是最终公开名，不再使用 `appearances`。
- `fields` 在 `ViewState` 上下文里已经天然表示“当前 view 显示字段”，不需要再额外加 `visible` 前缀。

### `ViewReadApi`

```ts
interface ViewReadApi {
  record: (recordId: RecordId) => DataRecord | undefined
  field: (fieldId: FieldId) => Field | undefined
  section: (sectionKey: SectionKey) => Section | undefined
  item: (itemId: ItemId) => ViewItem | undefined
  cell: (cell: CellRef) => ViewCell | undefined
  filterField: (index: number) => Field | undefined
  groupField: () => Field | undefined
}
```

说明：

- `read` 只保留读取动作。
- `planMove` 属于移动规划，不属于读取，因此不放在 `read` 下。

### `ViewItemsApi` 与 `ViewCellsApi`

```ts
interface ViewItemsApi {
  planMove: (
    itemIds: readonly ItemId[],
    target: Placement
  ) => MovePlan
  move: (
    itemIds: readonly ItemId[],
    target: Placement
  ) => void
  create: (input: {
    section: SectionKey
    title?: string
    values?: Partial<Record<CustomFieldId, unknown>>
  }) => RecordId | undefined
  remove: (itemIds: readonly ItemId[]) => void
}

interface ViewCellsApi {
  set: (
    cell: CellRef,
    value: unknown
  ) => void
  clear: (cell: CellRef) => void
}
```

### `FieldsApi`

```ts
interface FieldsApi {
  list: () => readonly CustomField[]
  get: (fieldId: CustomFieldId) => CustomField | undefined
  create: (input: {
    name: string
    kind?: CustomFieldKind
  }) => CustomFieldId | undefined
  rename: (fieldId: CustomFieldId, name: string) => void
  update: (fieldId: CustomFieldId, patch: Partial<Omit<CustomField, 'id'>>) => void
  replace: (fieldId: CustomFieldId, field: CustomField) => void
  changeType: (
    fieldId: CustomFieldId,
    input: {
      kind: CustomFieldKind
    }
  ) => void
  duplicate: (fieldId: CustomFieldId) => CustomFieldId | undefined
  remove: (fieldId: CustomFieldId) => boolean
  options: {
    append: (fieldId: CustomFieldId) => FieldOption | undefined
    create: (fieldId: CustomFieldId, name: string) => FieldOption | undefined
    reorder: (fieldId: CustomFieldId, optionIds: readonly string[]) => void
    update: (
      fieldId: CustomFieldId,
      optionId: string,
      patch: {
        name?: string
        color?: string
        category?: StatusCategory
      }
    ) => FieldOption | undefined
    remove: (fieldId: CustomFieldId, optionId: string) => void
  }
}
```

### `RecordsApi`

```ts
interface RecordsApi {
  get: (recordId: RecordId) => DataRecord | undefined
  create: (input?: {
    values?: Partial<Record<CustomFieldId, unknown>>
  }) => RecordId | undefined
  remove: (recordId: RecordId) => void
  removeMany: (recordIds: readonly RecordId[]) => void
  values: {
    set: (recordId: RecordId, fieldId: FieldId, value: unknown) => void
    clear: (recordId: RecordId, fieldId: FieldId) => void
  }
}
```

### `DocumentApi`、`HistoryApi`、`PerformanceApi`

```ts
interface DocumentApi {
  export: () => DataDoc
  replace: (document: DataDoc) => DataDoc
}

interface HistoryApi {
  state: () => HistoryState
  canUndo: () => boolean
  canRedo: () => boolean
  undo: () => CommitResult
  redo: () => CommitResult
  clear: () => void
}

interface PerformanceApi {
  traces: {
    last: () => CommitTrace | undefined
    list: (limit?: number) => readonly CommitTrace[]
    clear: () => void
  }
  stats: {
    snapshot: () => PerformanceStats
    clear: () => void
  }
}
```

## `engine.views` 的职责

只保留：

- `list`
- `get`
- `open`
- `create`
- `rename`
- `duplicate`
- `remove`

不允许：

- scoped runtime façade
- inactive view 的 read/select/session 操作
- `items` / `cells` / `planMove` 这类 active-only 能力

## `engine.view` 的职责

`engine.view` 是唯一完整当前 view API，包含：

- 当前 active view 的读取
- 当前 current view snapshot 的订阅
- query 相关写入
- display/layout 相关写入
- items move/create/remove
- cells set/clear
- table/gallery/kanban 特化行为

也就是说：

- 只有这里可以消费当前 view runtime
- 只有这里允许操作 item、section、cell

## 目标类型命名

建议统一如下：

| 当前 | 最终名称 |
| --- | --- |
| `engine.active` | `engine.view` |
| `engine.perf` | `engine.performance` |
| `EngineReadApi` | `DocumentReadApi` |
| `ActiveEngineApi` | `ViewApi` |
| `ActiveReadApi` | `ViewReadApi` |
| `ViewsEngineApi` | `ViewsApi` |
| `FieldsEngineApi` | `FieldsApi` |
| `RecordsEngineApi` | `RecordsApi` |
| `ProjectState` | `ViewSnapshot` |
| `ProjectionState` | `ViewCache` |
| `IndexState` | `ViewIndex` |
| `AppearanceId` | `ItemId` |
| `Appearance` | `ViewItem` |
| `AppearanceList` | `ItemList` |
| `appearances` | `items` |
| `calc` | `summary` |
| `perf` | `performance` |

这里不追求“最学术正确”的命名，而追求与你的真实约束一致：

- 全局只有一个 active runtime
- 所以 internal name 也应该承认自己是 active-only

## 必须保留的内部模型

下面这些结构仍然有价值，不该推倒：

- record index
- search index
- group index
- sort index
- calculation aggregate state
- commit trace
- history replay

也就是说：

- 算法层保留
- 包装层削掉

## 必须删除的内部模型

下面这些概念应该被彻底删除或吸收：

- `project` 作为目录和类型主语
- `publish` 作为单独中间层
- `store/active` 作为 active state 二次拼装层
- `LoweredCommand`
- `LowerActionResult`
- `ResolvedWriteBatch` 里依赖 command 语义的旧结构
- `createCommandContext`

## 一次性迁移 checklist

落地说明：

- 下列项已全部完成。
- D 阶段最终以 `planActions(...)` + `PlannedWriteBatch` 落地；planner 直接产出 canonical operations、semantic delta draft 与 issues，commit result 再从最终 delta 归纳 created entities，避免重复维护第二份 created 状态。

### A. 锁定单 active view 约束

- [x] 在根方案和实现注释里明确：runtime 全局只有一个 active view。
- [x] 不再设计 per-view runtime cache。
- [x] 不再为 inactive view 维护 snapshot/index。

### B. 先收口类型边界

- [x] 新建 `contracts/internal.ts` 与 `contracts/public.ts`。
- [x] internal runtime 全面移除对 `api/public` 的依赖。
- [x] `project/runtime/state.ts` 现有类型全部迁到 internal contract。
- [x] `readModels.ts`、`viewProjections.ts`、`refs.ts` 重新分配归属。

完成标准：

- internal derive 层在不 import public api type 的情况下可独立编译。

### C. 删除 `project` 主语，改成 active runtime

- [x] `project/runtime` 改为 `derive/active`
- [x] `project/publish` 合并进 `derive/active/snapshot`
- [x] `ProjectState` 改为 `ViewSnapshot`
- [x] `ProjectionState` 改为 `ViewCache`
- [x] `store.state` 中的 `project` 字段改为 `currentView.snapshot`

完成标准：

- engine 内部不再出现 `project.*` 作为 active runtime 的统称。

### D. 压平写入链

- [x] 新建统一入口 `planActions(...)`
- [x] 按 domain 拆 planner：`record`、`value`、`field`、`view`
- [x] `action/lower.ts` 拆除
- [x] `runCommands.ts` 拆除
- [x] `command/context.ts` 拆除
- [x] planner 直接产出 operations、delta draft、issues、created entities

完成标准：

- `dispatch(action)` 到 operations 之间只有一层 planner。

### E. 合并 active state 包装层

- [x] 删除 `store/active/state.ts` 中的 active state 拼装逻辑
- [x] 删除 `store/active/read.ts` 中对 snapshot 空洞的补模型职责
- [x] `engine.view.state` 直接订阅 `currentView.snapshot`
- [x] `engine.view.read` 只保留解析型 helper，不再承担“补足 public state”职责
- [x] `planMove` 从 `read` 挪到 `items`

完成标准：

- active snapshot 只有一个来源，不再先 publish 再 store 拼装。

### F. 拆分 active services

- [x] 把当前 `facade/view/index.ts` 拆成 domain files
- [x] `items.move` 与 `items.create` 下沉到 `services/active/items.ts`
- [x] `cells.set/clear` 下沉到 `services/active/cells.ts`
- [x] query/group/display/table/gallery/kanban 各自独立
- [x] façade 入口文件只负责组装

完成标准：

- 不再存在单个 active façade 文件承载所有规则。

### G. 统一 public API 命名

- [x] `ViewsEngineApi` 改为 `ViewsApi`
- [x] `FieldsEngineApi` 改为 `FieldsApi`
- [x] `RecordsEngineApi` 改为 `RecordsApi`
- [x] `EngineReadApi` 改为 `DocumentReadApi`
- [x] `ActiveEngineApi` 改为 `ViewApi`
- [x] `ActiveReadApi` 改为 `ViewReadApi`
- [x] `engine.active` 改为 `engine.view`
- [x] `engine.perf` 改为 `engine.performance`
- [x] `calc` namespace 改为 `summary`
- [x] `appearance` / `appearances` 改为 `item` / `items`
- [x] `CurrentViewRecords.matchedIds/sortedIds/visibleIds` 改为 `matched/ordered/visible`
- [x] `visibleFields` 改为 `fields`
- [x] `group` 中的 section 操作拆到 `sections`
- [x] `display.replaceFields/moveFields/showField/hideField/clearFields` 改为 `display.replace/move/show/hide/clear`
- [x] `table.setColumnWidths` 与 `table.setWidths` 统一成 `setColumnWidths`
- [x] `records.field.set/clear` 改成 `records.values.set/clear`

完成标准：

- 同类行为只保留一套命名。

### H. 清理旧 API 残影

- [x] bench/test/fixtures 全量改成新 API
- [x] 删除仓库内所有 `engine.view(...)` 风格旧调用
- [x] 删除仓库内所有 `engine.project.*` 风格旧调用
- [x] 删除仓库内所有 `engine.records.setValue(...)` 风格旧调用

完成标准：

- 仓库内部不再存在旧 API 心智残影。

### I. 保持 active-coupled performance 模型

- [x] 保留 active view 驱动的 demand 模型
- [x] 保留 `reuse/sync/rebuild` trace 能力
- [x] 确保切 view 时重建 active runtime 路径可观测
- [x] benchmark 重点覆盖 active write 与 active switch，不再验证不存在的多 runtime 场景

完成标准：

- 性能模型服务当前产品事实，而不是未来假设。

## 不该再做的事

后续重构中，下面这些方向不应该再被引入：

- 为 inactive view 预留 runtime cache
- 为未来多面板加 `byViewId` session registry
- 为 command 体系保留第二套中间 IR
- 再引入一个介于 derive 与 public state 之间的新 publish 层
- 再造一层 `active store` 来拼已有 snapshot

这些都只会把已经明确不需要的复杂度重新带回来。

## 最终验收标准

这次重构完成后，真正达标应该满足以下条件：

- engine 内部只存在一个 active runtime 主轴
- active index 与 active snapshot 生命周期一致
- `project` 作为 active runtime 主语被彻底删除
- 写入链只有一套 planner
- active public state 只有一个来源
- façade 变薄，业务规则回到 domain services
- bench/test 不再出现旧 API 残影

如果重构完成后还存在以下任一情况，就说明没有真正做简单：

- internal 还在 import public types
- active state 还要靠二次包装拼出来
- write path 还保留 `action -> command -> operation` 双阶段
- 还在讨论 inactive view runtime cache
- 一个 active façade 文件仍然承载所有业务规则

## 结论

在“全局只有一个 active view”的约束下，Dataview engine 的长期最优方向不是做更通用，而是做更诚实：

- 承认 runtime 是 active-only
- 承认切 view 可以重建 runtime
- 保留真正有价值的 index 与 performance 基础
- 删除所有为并不存在的多 runtime 场景预留的中间层

最终应该把 engine 收口成一个非常清楚的结构：

- 文档层负责持久化 view 集合
- planner 负责把 action 规划成写入
- active runtime 负责当前 view 的派生与读取
- façade 只负责提供薄 API

这才是你当前约束下真正简单、真正稳、也真正适合长期演进的方案。

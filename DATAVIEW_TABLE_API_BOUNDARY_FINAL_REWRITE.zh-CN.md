# Dataview Table API / Type 最终边界重构方案

本文只回答一个问题：

在 `currentView` rewrite 已经完成、`table` 链已经切到 `runtime-owned table runtime` 之后，
如果继续只从 API、类型字段、职责边界这三个维度追求长期最优，
`engine -> runtime source -> runtime table feature -> react table` 这条链最终应该怎么收。

本文前提明确写死：

- 只要阻碍长期最优的都可以删
- 不在乎重构成本
- 不需要过渡和兼容
- 不保留别名、桥接层、双轨实现
- 无条件重构
- 优先改底层模型，不接受为了少改上层而保留别扭 API

相关上下文：

- [DATAVIEW_ENGINE_RUNTIME_BOUNDARY_REWRITE.zh-CN.md](/Users/realrong/Rostack/DATAVIEW_ENGINE_RUNTIME_BOUNDARY_REWRITE.zh-CN.md)
- [DATAVIEW_ENGINE_IMPACT_DELTA_REWRITE.zh-CN.md](/Users/realrong/Rostack/DATAVIEW_ENGINE_IMPACT_DELTA_REWRITE.zh-CN.md)
- [DATAVIEW_TABLE_CURRENT_VIEW_LONG_TERM_REWRITE.zh-CN.md](/Users/realrong/Rostack/DATAVIEW_TABLE_CURRENT_VIEW_LONG_TERM_REWRITE.zh-CN.md)
- 当前 table runtime：
  - [runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/table/runtime.ts)
- 当前 runtime source contract：
  - [contracts.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/contracts.ts)
- 当前 table model：
  - [types.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/table/types.ts)
  - [api.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/table/api.ts)
- 当前 react table controller：
  - [controller.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/controller.ts)

---

## 1. 最终结论

这轮再往下收，结论已经很明确。

### 1.1 `DataViewRuntime.table` 应该成为 table 的唯一 public feature boundary

最终不应该再并存：

- `source.active.*`
- `table runtime`
- `table model`
- `react controller` 再转发一份数据 store

长期最优只有一种：

> `runtime.table` 是 table 数据边界；
> `react` 只额外持有 UI / interaction / DOM runtime。

### 1.2 `table model` 整层应该删

当前 `DataViewTableModel` 里大部分内容都在重复表达已经存在于 `table runtime` 或 `source.active` 的东西：

- `TableBody` 重复 `viewId / grouped / wrap / showVerticalLines / columns / sections`
- `TableSection` 重复 raw `Section`
- `TableSummary` 只是把 `byField` 再包一层

这层不是长期稳定抽象，而是旧链条留下来的“中间拼装层”。

最终应该：

> 删除 `dataview-runtime/src/model/table/*`，
> table feature 只保留 `runtime.table` 这一层 public 数据合同。

### 1.3 `TableController` 不应该继续同时承载“数据 runtime + UI runtime”

当前 [controller.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/controller.ts) 仍然是一个大包对象，
同时暴露：

- 数据域：`grid/view/sections/record/column/summary/section`
- 交互域：`selection/select/fill/rail/can/hover`
- DOM / layout / virtual：`nodes/dom/rowHit/layout/virtual`
- imperative action：`focus/openCell/revealCursor/revealRow`

这说明 `react` 侧虽然不再 owner `currentView`，
但仍然 owner 了一个过宽的 feature facade。

长期最优应该是：

- `useDataView().table` 提供 table 数据
- `TableProvider` 只提供 table UI runtime

也就是：

> 删掉现在这个混合型 `TableController`，
> 拆成 `TableRuntime` 和 react-private `TableUiRuntime` 两条线。

### 1.4 当前 table runtime 还没有完全收成“简单清晰的一种语言”

当前 public 类型里仍然残留几处不和谐点：

- `TableRecordAccess` 和 `grid.items.read.*` 重复
- `TableSectionContext { sections }` 只是单字段包装
- `TableViewContext` 同时混 `view + query + table`，语言不自洽
- `runtime source` 仍然暴露 `ItemSource.table`
- `runtime` public type 继续直接暴露 engine 命名：`ActiveViewQuery`、`ActiveViewTable`

这些都不是最终形态。

---

## 2. 当前剩余问题

下面这些都属于“已经不需要过渡了，但还没完全收干净”的问题。

## 2.1 `TableRecordAccess` 是重复层

当前 table runtime 同时有：

- `grid.items.read.record`
- `grid.items.read.section`
- `record.recordId`
- `record.sectionKey`

对应定义见：

- [runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/table/runtime.ts#L22)
- [runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/table/runtime.ts#L37)

这会导致上层出现两套拿同一语义的方式。

典型例子：

- [useRowReorder.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/hooks/useRowReorder.tsx#L121)
- [CreateRecordBlock.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/body/CreateRecordBlock.tsx#L61)

这不是“方便”，而是 API 不收敛。

长期最优：

> 删掉 `TableRecordAccess`，
> item -> record / section 一律通过 `grid.items.read.*` 读取。

## 2.2 `TableSectionContext` 是纯包装噪音

当前：

```ts
export interface TableSectionContext {
  sections: SectionList
}
```

使用方又必须写成：

- `sections.sections.ids`
- `sections.sections.get(...)`

例如：

- [virtual/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/virtual/runtime.ts#L271)
- [useRowReorder.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/hooks/useRowReorder.tsx#L126)

这层没有新增语义，只是在 public API 上多包了一层。

长期最优：

> `TableRuntime.sections` 直接返回 `ReadStore<SectionList | undefined>`，
> 不保留 `TableSectionContext`。

## 2.3 `TableViewContext` 不是自洽的 table view API

当前：

```ts
export interface TableViewContext {
  view: View
  query: ActiveViewQuery
  table: ActiveViewTable
}
```

问题不在字段多少，而在它混了三套语言：

- raw document `View`
- engine snapshot projection `ActiveViewQuery`
- engine snapshot projection `ActiveViewTable`

结果消费者必须写：

- `view.view.sort`
- `view.query.filters.rules`
- `view.table.calc`
- `view.view.options.table.widths`

例如：

- [capabilities.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/capabilities.ts#L24)
- [useColumnResize.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/hooks/useColumnResize.ts#L39)
- [ColumnHeader.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/column/ColumnHeader.tsx#L367)

这说明它不是“清晰的 table view state”，而是“拼了能用但内部语言不统一的上下文对象”。

长期最优：

> 不再把 raw `View` 和 engine `ActiveView*` 直接塞进 table runtime public contract。

table runtime 应该有自己 runtime-owned 的 table view state。

## 2.4 `DataViewTableModel` 整层是重复结构

当前 `TableBody` / `TableSection` / `TableSummary`：

- [types.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/table/types.ts#L18)

派生逻辑：

- [api.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/table/api.ts#L67)

问题分别是：

- `TableBody.empty` 目前 table 视图不消费
- `TableBody.sectionKeys` 与 raw `sections.ids` 重复
- `TableSection` 与 raw `Section` 重复
- `TableSummary` 只把 `CalculationCollection.byField` 再包一层

这层存在的唯一历史原因是“旧 react table 需要一个中间 model 层”，
但在 `runtime.table` 已经存在之后，它就变成冗余了。

长期最优：

> 删除整个 `DataViewTableModel`，
> 不再让 `table` 有 `runtime.table` 之外的第二套 public 数据边界。

## 2.5 `ItemSource.table` 是实现细节泄漏

当前 `ItemSource` public contract 暴露了：

- `ids`
- `table`
- `read.record`
- `read.section`
- `read.placement`

定义见：

- [contracts.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/contracts.ts#L46)

但真正写这个 key-table 的只有 source adapter 自己：

- [createEngineSource.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/createEngineSource.ts#L354)

搜索下来，没有业务层消费 `source.active.items.table`。

这说明它已经不是“public contract”，只是“宿主实现细节被放出去了”。

长期最优：

> `ItemSource.table` 直接删掉，
> `KeyTableStore` 降成 `createEngineSource()` 私有实现。

## 2.6 runtime public type 继续直接暴露 engine 命名，不是好边界

当前 runtime source 和 table runtime public contract 直接使用：

- `ActiveViewQuery`
- `ActiveViewTable`

例如：

- [contracts.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/contracts.ts#L25)
- [runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/table/runtime.ts#L27)

这会让 runtime public boundary 继续带着 engine snapshot 命名。

engine 内部当然可以继续叫 `ActiveViewQuery/ActiveViewTable`，
但 runtime public contract 不该继续照搬这套内部语言。

长期最优：

> runtime 自己拥有自己的 public naming，
> engine type 只作为内部输入，不直接成为 runtime public vocabulary。

## 2.7 还有一批明显的低级残留字段

这些不是方向性问题，但都说明旧形状还没完全清理干净：

- `useDataViewRuntime()` 实际返回 `model`，命名错误
  - [provider.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/dataview/provider.tsx#L52)
- `CreateRecordBlockProps.columns/showVerticalLines/template` 当前都没被真正使用
  - [CreateRecordBlock.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/body/CreateRecordBlock.tsx#L24)
- `CreateRecordBlock` 里 `cellClassName` 已经完全无用
  - [CreateRecordBlock.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/body/CreateRecordBlock.tsx#L106)
- `SectionHeader` 报错文案还在说 `current view`
  - [SectionHeader.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/body/SectionHeader.tsx#L29)

这些都应该直接清掉，不需要过渡。

---

## 3. 最终分层

## 3.1 engine

`engine` 继续负责：

- snapshot 真相
- delta 真相
- raw `ViewState`
- raw `ActiveViewQuery`
- raw `ActiveViewTable`

但这些都只属于 engine 内部和 engine public 内核合同。

它们不是 runtime feature public API。

## 3.2 runtime source

`runtime source` 继续负责 artifact host：

- `view`
- `meta`
- `records`
- `fields`
- `sections`
- `items`
- `summaries`

但 source 只负责：

- 宿主 snapshot / delta
- 暴露 artifact-level 响应式读取

它不应该顺手暴露内部宿主结构。

所以长期最优 source contract 应该是：

```ts
export interface SectionSource extends store.KeyedReadStore<SectionKey, Section | undefined> {
  ids: store.ReadStore<readonly SectionKey[]>
}

export interface ItemSource {
  ids: store.ReadStore<readonly ItemId[]>
  read: {
    recordId: store.KeyedReadStore<ItemId, RecordId | undefined>
    sectionKey: store.KeyedReadStore<ItemId, SectionKey | undefined>
    placement: store.KeyedReadStore<ItemId, ItemPlacement | undefined>
  }
}
```

这里有三个明确动作：

1. `SectionSource.keys` 改成 `ids`
2. `read.record` 改成 `read.recordId`
3. `read.section` 改成 `read.sectionKey`

这些都不是兼容优化，而是把 public naming 收干净。

## 3.3 runtime table feature

`runtime.table` 应该成为 table 唯一 public feature 数据边界。

它负责：

- table grid raw domain
- table view runtime-owned state
- table per-column derived meta
- table per-section summary

它不再负责：

- 兼容旧 `ViewState`
- 暴露 raw `View`
- 暴露冗余 wrapper
- 重复 `table model`

## 3.4 react table

`react table` 只负责：

- selection / hover / fill / pointer / keyboard
- DOM registry
- virtual layout / measurement
- imperative open / focus / reveal

也就是：

> `react` 只 owner UI runtime，不 owner feature data runtime。

---

## 4. 最终 API

下面是建议直接收敛到的最终 public API。

## 4.1 最终 `TableRuntime`

```ts
export interface TableGrid {
  items: ItemList
  fields: FieldList
  sections: SectionList
}

export interface TableQueryState {
  search: ViewSearchProjection
  filters: ViewFilterProjection
  group: ViewGroupProjection
  sort: ViewSortProjection
}

export interface TableViewState {
  id: ViewId
  query: TableQueryState
  displayFieldIds: readonly FieldId[]
  widths: ReadonlyMap<FieldId, number>
  wrap: boolean
  showVerticalLines: boolean
  calcByField: ReadonlyMap<FieldId, CalculationMetric | undefined>
}

export interface TableColumnState {
  field: Field
  grouped: boolean
  sortDir?: SortDirection
  calc?: CalculationMetric
}

export interface TableRuntime {
  grid: ReadStore<TableGrid | undefined>
  view: ReadStore<TableViewState | undefined>
  column: KeyedReadStore<FieldId, TableColumnState | undefined>
  summary: KeyedReadStore<SectionKey, CalculationCollection | undefined>
}
```

这套 API 有几个关键点：

### 1. `grid` 直接包含 `sections`

不再保留：

- `TableSectionContext`
- `TableRecordAccess`

item / section / record 相关读取统一走：

- `grid.items.read.recordId`
- `grid.items.read.sectionKey`
- `grid.sections`

### 2. `view` 只暴露 table 真正需要的 state

table 运行时需要的是：

- `viewId`
- query
- visible/display field ids
- widths
- wrap
- vertical lines
- calc

不是 raw `View` 全对象。

所以这里不再暴露：

- `view: View`
- `table: ActiveViewTable`

而是收成 flat、runtime-owned 的 `TableViewState`。

### 3. `column` 保留，`section` 删除

保留 `column` 的原因是它确实承载了 field 级派生：

- grouped
- sortDir
- calc

这不是 raw source 直接就有的。

但 `section` 不应该保留，
因为 raw `Section` 已经足够表达：

- key
- label
- collapsed
- itemIds

额外包一个 `TableSection` 没有价值。

### 4. `summary` 直接返回 raw `CalculationCollection`

不再保留：

```ts
export interface TableSummary {
  byField: ReadonlyMap<FieldId, CalculationResult>
}
```

这层 wrapper 没有意义。

## 4.2 `DataViewTableModel` 删除

最终：

- 删除 `TableBody`
- 删除 `TableSection`
- 删除 `TableSummary`
- 删除 `DataViewTableModel`
- 删除 `createTableModel()`
- 删除 `dataView.model.table`

`table` 视图不再依赖第二套中间 model。

## 4.3 最终 `TableUiRuntime`

react 侧应该只保留 UI runtime：

```ts
interface TableUiRuntime {
  body: ReadStore<TableBodyRenderState | null>
  selection: TableSelectionRuntime
  select: TableSelectRuntime
  fill: TableFillRuntime
  rail: TableRailRuntime
  can: TableCanRuntime
  chrome: {
    row: KeyedReadStore<ItemId, TableRowChrome>
    cell: KeyedReadStore<CellRef, TableCellChrome>
  }
  layout: TableLayout
  virtual: TableVirtualRuntime
  nodes: Nodes
  dom: Dom
  rowHit: RowHit
  hover: TableHoverRuntime
  interaction: InteractionApi
  focus: () => void
  openCell: (input: CellOpenInput) => boolean
  revealCursor: () => void
  revealRow: (rowId: ItemId) => void
  dispose: () => void
}
```

这里故意不再放：

- `grid`
- `view`
- `sections`
- `column`
- `summary`

这些都属于 `runtime.table`，
不应该再通过 react controller 转发一份。

---

## 5. 必删项

在“无条件重构、不要兼容”的前提下，下面这些建议直接删除。

### runtime source

- `ItemSource.table`
- `SectionSource.keys`
- `ItemSource.read.record`
- `ItemSource.read.section`

### runtime table

- `TableRecordAccess`
- `TableSectionContext`
- `TableViewContext`
- `DataViewTableModel`
- `TableBody`
- `TableSection`
- `TableSummary`

### react table

- `TableController` 里所有数据类字段：
  - `grid`
  - `view`
  - `sections`
  - `record`
  - `column`
  - `summary`
  - `section`
- 所有只为旧结构保留下来的 props / wrapper / helper

### react dataview public hook

- `useDataViewRuntime`

它要么重命名成 `useDataViewModel`，
要么就真正返回完整 runtime。

长期最优更推荐：

```ts
export const useDataViewModel = () => useDataView().model
```

---

## 6. 命名原则

后续所有重构都应遵守下面这些命名原则。

## 6.1 runtime public contract 不直接照搬 engine internal naming

不再在 runtime public contract 中继续暴露：

- `ActiveViewQuery`
- `ActiveViewTable`

runtime 应该拥有自己的 public names：

- `TableQueryState`
- `TableViewState`

## 6.2 key / id 命名统一

collection 类 source 一律优先：

- `ids`

而不是有的叫：

- `ids`
- `keys`

并存。

## 6.3 读取字段带上语义后缀

不再保留：

- `record`
- `section`

这种在某些语境下容易和实体对象混淆的命名。

统一用：

- `recordId`
- `sectionKey`

## 6.4 table feature public type 不再混 raw object 和 derived projection

像当前这种：

- `view: View`
- `query: ActiveViewQuery`
- `table: ActiveViewTable`

放在一个对象里，是最容易长期长歪的形状。

最终 runtime public type 要么：

- raw-only

要么：

- feature-owned derived-only

不能再混。

---

## 7. 推荐落地顺序

虽然本文不讨论过渡方案，但如果实际要按“最终形态”落地，推荐顺序是：

1. 先重写 `runtime.table` 的 public API
2. 同步删除 `DataViewTableModel`
3. 让 react table 全量改为直接消费 `useDataView().table`
4. 把 `TableController` 收缩成 `TableUiRuntime`
5. 清理 `runtime source` 里的 `ItemSource.table` 和命名噪音
6. 最后统一清理所有残留字段、错名 hook、报错文案、无用 props

这个顺序的原因很简单：

- 先定数据边界
- 再删中间层
- 最后收 UI facade

不能反过来。

---

## 8. 最终一句话

如果完全不考虑成本、兼容和过渡，
那这条链的长期最优不是“继续在现有类型上修修补补”，
而是直接收成下面这条规则：

> `runtime.table` 是 table 唯一 public 数据边界；
> `react table` 只持有 UI runtime；
> 所有重复 wrapper、实现泄漏字段、错层 facade、engine 命名穿透，全部直接删除。

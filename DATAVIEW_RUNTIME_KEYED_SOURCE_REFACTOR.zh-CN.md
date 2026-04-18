# Dataview Runtime Keyed Read Source 重构方案

## 背景

当前 `dataview-runtime` 的 model 层已经有不少 keyed store，但很多只是“表面 keyed”：

- [`dataview/packages/dataview-runtime/src/model/gallery/api.ts`](dataview/packages/dataview-runtime/src/model/gallery/api.ts)
- [`dataview/packages/dataview-runtime/src/model/kanban/api.ts`](dataview/packages/dataview-runtime/src/model/kanban/api.ts)
- [`dataview/packages/dataview-runtime/src/model/table/api.ts`](dataview/packages/dataview-runtime/src/model/table/api.ts)
- [`dataview/packages/dataview-runtime/src/model/page/api.ts`](dataview/packages/dataview-runtime/src/model/page/api.ts)
- [`dataview/packages/dataview-engine/src/runtime/selectors/core.ts`](dataview/packages/dataview-engine/src/runtime/selectors/core.ts)
- [`dataview/packages/dataview-engine/src/runtime/selectors/document.ts`](dataview/packages/dataview-engine/src/runtime/selectors/document.ts)

核心问题有两层：

1. `engine.select.*` 和 `engine.active.select(...)` 的底层 source 仍然是 whole runtime store / whole active state。
2. `dataview-runtime/model/*` 的 keyed store 普遍是 `createKeyedDerivedStore(get: key => read(activeStateStore)...)`，所以任意 active state 变化都会先把大量 keyed node 打脏。

这导致现在即使已经有 keyed family cache：

- item 改一个值，很多 card / section / header keyed node 仍然会先 dirty。
- query 改动一次，很多 table header / page toolbar / gallery card keyed node 会先重算。
- 即使最终 `isEqual` 挡住 React commit，dirty fan-out 和 per-key 重算成本已经发生。

这份文档给出不考虑兼容成本的最终重构方案。目标不是“局部修补”，而是把 `dataview-runtime model` 的 keyed read source 从根上改成真正 keyed。

## 目标

- 让 hot path 上的 keyed read 真正依赖 keyed source，而不是 whole `ViewState` / whole `DataDoc`。
- 把 `engine -> runtime -> react` 的读路径拆成单向分层：
  - `engine.source`
  - `runtime.source`
  - `runtime.model`
  - `react`
- 删除 `readActiveTypedViewState(...)` 这类在 model 层反复做类型判断的模式。
- 让 root model 只承载 coarse-grained 状态，per-item / per-section / per-field 数据全部走 keyed source。
- 公共 API 命名尽量短、稳定、可复用，不引入新的 selector DSL 或大而泛的工具层。

## 非目标

- 不追求保留现有 `engine.select.*`、`runtime.read.*`、`model.*Base` 等兼容层。
- 不在 `react` 组件里继续拼 source。source 和 model 都应在 runtime/engine 层完成。
- 不把低频页面编辑器也过度 keyed 化。高频热路径优先，低频路径保持简单。

## 最终分层

最终结构：

```text
engine.source
  -> runtime.source
    -> runtime.model
      -> react
```

分层职责：

- `engine.source`
  - 负责把 document 和 active snapshot 维护成真正可 keyed 订阅的基础读图。
  - 是所有热读路径的 canonical source。
- `runtime.source`
  - 把 `engine.source` 与 runtime session state 组合成 dataview 级 source。
  - 包括 selection、inline editing、page query UI 等会影响 model 的本地状态。
- `runtime.model`
  - 只做 view-facing projection。
  - 只依赖 `runtime.source`，不再直接读 whole engine state。
- `react`
  - 只消费 `runtime.model` 或 `runtime.source`。
  - 不再自己从 `engine.active.state` / `engine.select.document` 派生热模型。

依赖规则：

- 下层绝不能反向读上层。
- `react` 不得再直接依赖 `engine.active.state` 作为热 source。
- `runtime.model` 不得再依赖 `ReadStore<ViewState | undefined>` 或 `ReadStore<DataDoc>`。

## 命名规则

这次重构统一采用下面的命名规则，避免继续出现 `Base`、`Data`、`ById`、`Vm` 这类重复后缀。

- 单数名词：keyed source
  - `record`
  - `field`
  - `view`
  - `item`
  - `section`
  - `summary`
- 复数加 `Ids` / `Keys`：有序 id 列表
  - `recordIds`
  - `fieldIds`
  - `viewIds`
  - `itemIds`
  - `sectionKeys`
- 单个标量状态：直接用领域词
  - `viewId`
  - `viewType`
  - `grouped`
  - `groupFieldId`
  - `sortDir`
  - `wrap`
- view model 类型不再带 `Data` / `Base`
  - `GalleryBody`
  - `GallerySection`
  - `GalleryCard`
  - `KanbanBoard`
  - `KanbanSection`
  - `KanbanCard`
  - `TableBody`
  - `TableColumn`
  - `TableSection`
  - `TableSummary`
  - `PageQuery`

## 最终公共 API

### 1. Engine

最终 `engine` 公开两套读接口：

- `engine.read`
  - 保留命令式、瞬时读取。
  - 适合动作执行、一次性查询、非热路径逻辑。
- `engine.source`
  - 新的 canonical reactive source。
  - 所有 runtime model 和高频 react 逻辑都必须从这里读。

最终形态：

```ts
interface Engine {
  read: EngineReadApi
  source: EngineSource
  active: ActiveViewApi
  records: RecordsApi
  views: ViewsApi
  fields: FieldsApi
}
```

### 2. EngineSource

```ts
interface EngineSource {
  doc: DocumentSource
  active: ActiveSource
}
```

#### 2.1 DocumentSource

```ts
interface DocumentSource {
  document: ReadStore<DataDoc>

  recordIds: ReadStore<readonly RecordId[]>
  record: KeyedReadStore<RecordId, DataRecord | undefined>

  fieldIds: ReadStore<readonly FieldId[]>
  field: KeyedReadStore<FieldId, CustomField | undefined>

  viewIds: ReadStore<readonly ViewId[]>
  view: KeyedReadStore<ViewId, View | undefined>
}
```

命名上不再用 `records.byId` / `fields.byId` / `views.byId`。直接用：

- `doc.record`
- `doc.field`
- `doc.view`

这样更短，也更接近“这是 keyed source”这个语义。

#### 2.2 ActiveSource

```ts
interface ActiveSource {
  ready: ReadStore<boolean>
  viewId: ReadStore<ViewId | undefined>
  viewType: ReadStore<View['type'] | undefined>
  view: ReadStore<View | undefined>

  itemIds: ReadStore<readonly ItemId[]>
  item: KeyedReadStore<ItemId, ViewItem | undefined>
  itemIndex: KeyedReadStore<ItemId, number | undefined>

  sectionKeys: ReadStore<readonly SectionKey[]>
  section: KeyedReadStore<SectionKey, Section | undefined>
  sectionItemIds: KeyedReadStore<SectionKey, readonly ItemId[] | undefined>

  fieldIds: ReadStore<readonly FieldId[]>
  field: KeyedReadStore<FieldId, Field | undefined>

  customFieldIds: ReadStore<readonly FieldId[]>
  customField: KeyedReadStore<FieldId, CustomField | undefined>

  summary: KeyedReadStore<SectionKey, CalculationCollection | undefined>

  query: ActiveQuerySource
  table: ActiveTableSource
  gallery: ActiveGallerySource
  kanban: ActiveKanbanSource
}
```

#### 2.3 ActiveQuerySource

```ts
interface ActiveQuerySource {
  search: ReadStore<ViewSearchProjection>
  filters: ReadStore<ViewFilterProjection>
  sort: ReadStore<ViewSortProjection>
  group: ReadStore<ViewGroupProjection>

  grouped: ReadStore<boolean>
  groupFieldId: ReadStore<FieldId | ''>

  filterFieldIds: ReadStore<readonly FieldId[]>
  sortFieldIds: ReadStore<readonly FieldId[]>
  sortDir: KeyedReadStore<FieldId, SortDirection | undefined>
}
```

这里不再让 table header 自己扫描 `sort.rules.find(...)`。`sortDir(fieldId)` 作为 query source 的一部分直接提供。

#### 2.4 Typed Active Sources

```ts
interface ActiveTableSource {
  wrap: ReadStore<boolean>
  showVerticalLines: ReadStore<boolean>
  calc: KeyedReadStore<FieldId, CalculationMetric | undefined>
}

interface ActiveGallerySource {
  wrap: ReadStore<boolean>
  size: ReadStore<CardSize>
  layout: ReadStore<CardLayout>
  canReorder: ReadStore<boolean>
  groupUsesOptionColors: ReadStore<boolean>
}

interface ActiveKanbanSource {
  wrap: ReadStore<boolean>
  size: ReadStore<CardSize>
  layout: ReadStore<CardLayout>
  canReorder: ReadStore<boolean>
  groupUsesOptionColors: ReadStore<boolean>
  fillColumnColor: ReadStore<boolean>
  cardsPerColumn: ReadStore<KanbanCardsPerColumn>
}
```

这里明确做一个取舍：

- `active.viewType` 仍然存在，用于 coarse-grained 顶层判断。
- 但 view model 不再在每个 keyed getter 里调用 `readActiveTypedViewState(...)`。
- typed source 自身负责在 view type 不匹配时返回空值或默认值。

这意味着 `readActiveTypedViewState(...)` 应被删除，不再作为 model 层 helper。

### 3. DataViewRuntime

最终 `runtime` 结构：

```ts
interface DataViewRuntime {
  engine: Engine
  source: DataViewSource
  model: DataViewModel
  session: DataViewSessionApi
  intent: DataViewIntentApi
  dispose(): void
}
```

`runtime.read` 这层建议删除。原因：

- 它本质上把 coarse whole-store read 和 reactive source 混在一起。
- 真正热路径应该读 `runtime.source`。
- 一次性命令式读取应该走 `engine.read` / `engine.active.read`。

#### 3.1 DataViewSource

```ts
interface DataViewSource {
  doc: DocumentSource
  active: ActiveSource

  page: PageSource
  selection: SelectionSource
  inline: InlineSource
}
```

```ts
interface PageSource {
  queryVisible: ReadStore<boolean>
  queryRoute: ReadStore<QueryBarEntry | null>
}

interface SelectionSource {
  member: KeyedReadStore<ItemId, boolean>
  preview: KeyedReadStore<ItemId, boolean | null>
}

interface InlineSource {
  editing: KeyedReadStore<InlineKey, boolean>
}
```

其中：

- `doc` 和 `active` 直接透传自 `engine.source`
- `page`、`selection`、`inline` 来自 runtime session

### 4. DataViewModel

```ts
interface DataViewModel {
  page: PageModel
  table: TableModel
  gallery: GalleryModel
  kanban: KanbanModel
}
```

#### 4.1 PageModel

```ts
interface PageModel {
  body: ReadStore<PageBody>
  header: ReadStore<PageHeader>
  toolbar: ReadStore<PageToolbar>
  query: ReadStore<PageQuery>
  settings: ReadStore<PageSettings>
}
```

#### 4.2 TableModel

```ts
interface TableModel {
  body: ReadStore<TableBody | null>
  column: KeyedReadStore<FieldId, TableColumn | undefined>
  section: KeyedReadStore<SectionKey, TableSection | undefined>
  summary: KeyedReadStore<SectionKey, TableSummary | undefined>
}
```

#### 4.3 GalleryModel

```ts
interface GalleryModel {
  body: ReadStore<GalleryBody | null>
  section: KeyedReadStore<SectionKey, GallerySection | undefined>
  card: KeyedReadStore<ItemId, GalleryCard | undefined>
  content: KeyedReadStore<ItemId, CardContent | undefined>
}
```

#### 4.4 KanbanModel

```ts
interface KanbanModel {
  board: ReadStore<KanbanBoard | null>
  section: KeyedReadStore<SectionKey, KanbanSection | undefined>
  card: KeyedReadStore<ItemId, KanbanCard | undefined>
  content: KeyedReadStore<ItemId, CardContent | undefined>
}
```

## 各 model 的最终依赖设计

这一部分是整个方案最关键的约束。每个 model store 必须明确“允许依赖哪些 source，不允许依赖哪些 whole store”。

### 1. PageModel

#### `page.body`

允许依赖：

- `active.viewType`
- `active.itemIds`

不允许依赖：

- whole `active.state`
- whole `currentViewStore`

最终输出：

```ts
interface PageBody {
  viewType?: View['type']
  empty: boolean
}
```

#### `page.header`

允许依赖：

- `active.viewId`
- `active.view`

#### `page.toolbar`

允许依赖：

- `doc.viewIds`
- `doc.view`
- `active.viewId`
- `active.view`
- `active.query.filters`
- `active.query.sort`
- `doc.fieldIds`
- `doc.field`
- `page.queryVisible`
- `page.queryRoute`

额外规则：

- `availableFilterFields`
  - 只依赖 `doc.fieldIds` + `doc.field` + `active.query.filterFieldIds`
- `availableSortFields`
  - 只依赖 `doc.fieldIds` + `doc.field` + `active.query.sortFieldIds`
- 不再从 whole `DataDoc` 或 whole `ViewState` 整体推导

#### `page.query`

允许依赖：

- `page.queryVisible`
- `page.queryRoute`
- `active.view`
- `active.query.filters`
- `active.query.sort`
- `doc.fieldIds`
- `doc.field`

#### `page.settings`

允许依赖：

- `doc.viewIds`
- `doc.fieldIds`
- `doc.field`
- `active.view`
- `active.query.filters`
- `active.query.sort`
- `active.query.group`

### 2. TableModel

#### `table.body`

最终输出建议：

```ts
interface TableBody {
  viewId: ViewId
  empty: boolean
  grouped: boolean
  wrap: boolean
  showVerticalLines: boolean
  columnIds: readonly FieldId[]
  sectionKeys: readonly SectionKey[]
}
```

允许依赖：

- `active.viewId`
- `active.query.grouped`
- `active.itemIds`
- `active.fieldIds`
- `active.sectionKeys`
- `active.table.wrap`
- `active.table.showVerticalLines`

不允许继续把下面这些 whole object 直接塞进 root body：

- `ItemList`
- `SectionList`
- `FieldList`

原因：

- root body 只需要 order 和全局选项。
- 具体 item / section / field 数据应该由 keyed child store 自己读取。
- 否则 root rerender 会随着任意 item / section 局部改动扩大。

#### `table.column(fieldId)`

最终输出：

```ts
interface TableColumn {
  field?: Field
  grouped: boolean
  sortDir?: SortDirection
  calc?: CalculationMetric
}
```

允许依赖：

- `active.field(fieldId)`
- `active.query.groupFieldId`
- `active.query.sortDir(fieldId)`
- `active.table.calc(fieldId)`

不允许依赖：

- whole `active.query`
- `sort.rules.find(...)`
- whole `view.calc`

#### `table.section(sectionKey)`

允许依赖：

- `active.section(sectionKey)`

输出只保留 UI 需要的字段：

```ts
interface TableSection {
  key: SectionKey
  label: Section['label']
  collapsed: boolean
  count: number
}
```

#### `table.summary(sectionKey)`

允许依赖：

- `active.summary(sectionKey)`

输出：

```ts
interface TableSummary {
  byField: ReadonlyMap<FieldId, CalculationResult>
}
```

这里建议把当前 `footer(scopeId)` 更名为 `summary(sectionKey)`：

- 语义更准确。
- 以后 section summary、footer summary、pinned summary 可以共用。

### 3. GalleryModel

#### `gallery.body`

最终输出建议：

```ts
interface GalleryBody {
  viewId: ViewId
  empty: boolean
  grouped: boolean
  groupUsesOptionColors: boolean
  sectionKeys: readonly SectionKey[]
}
```

允许依赖：

- `active.viewId`
- `active.itemIds`
- `active.query.grouped`
- `active.sectionKeys`
- `active.gallery.groupUsesOptionColors`

不再把 `sectionCountByKey` 塞进 root body。

原因：

- section count 是天然 keyed 数据。
- 应该由 `gallery.section(sectionKey)` 提供。
- root body 不应该携带 per-section map。

#### `gallery.section(sectionKey)`

允许依赖：

- `active.section(sectionKey)`

输出：

```ts
interface GallerySection {
  key: SectionKey
  label: Section['label']
  count: number
}
```

#### `gallery.card(itemId)`

card 只承载“外层 chrome / 交互”数据，不再混入属性内容。

最终输出建议：

```ts
interface GalleryCard {
  viewId: ViewId
  itemId: ItemId
  recordId: RecordId
  size: CardSize
  layout: CardLayout
  wrap: boolean
  canDrag: boolean
  selected: boolean
  editing: boolean
}
```

允许依赖：

- `active.viewId`
- `active.item(itemId)`
- `active.gallery.size`
- `active.gallery.layout`
- `active.gallery.wrap`
- `active.gallery.canReorder`
- `selection.preview(itemId)`
- `selection.member(itemId)`
- `inline.editing({ viewId, itemId })`

不允许依赖：

- whole `active.fields.custom`
- whole `record`
- whole `extraStateStore`

#### `gallery.content(itemId)`

最终输出建议：

```ts
interface CardContent {
  title: string
  placeholder: string
  props: readonly CardProp[]
  hasProps: boolean
}

interface CardProp {
  field: CustomField
  value: unknown
}
```

允许依赖：

- `active.item(itemId)`
- `doc.record(recordId)`
- `active.customFieldIds`
- `active.customField(fieldId)`

这里不再依赖 `active.fields.custom` 整个字段对象数组。

### 4. KanbanModel

#### `kanban.board`

最终输出：

```ts
interface KanbanBoard {
  viewId: ViewId
  grouped: boolean
  sectionKeys: readonly SectionKey[]
  groupField?: Field
  fillColumnColor: boolean
  groupUsesOptionColors: boolean
  cardsPerColumn: KanbanCardsPerColumn
}
```

允许依赖：

- `active.viewId`
- `active.query.grouped`
- `active.query.groupFieldId`
- `active.field(groupFieldId)`
- `active.sectionKeys`
- `active.kanban.fillColumnColor`
- `active.kanban.groupUsesOptionColors`
- `active.kanban.cardsPerColumn`

#### `kanban.section(sectionKey)`

允许依赖：

- `active.section(sectionKey)`

输出：

```ts
interface KanbanSection {
  key: SectionKey
  label: Section['label']
  bucket?: Section['bucket']
  collapsed: boolean
  count: number
  color?: string
}
```

#### `kanban.card(itemId)`

最终输出：

```ts
interface KanbanCard {
  viewId: ViewId
  itemId: ItemId
  recordId: RecordId
  size: CardSize
  layout: CardLayout
  wrap: boolean
  canDrag: boolean
  selected: boolean
  editing: boolean
  color?: string
}
```

允许依赖：

- `active.viewId`
- `active.item(itemId)`
- `active.section(item.sectionKey)`
- `active.kanban.size`
- `active.kanban.layout`
- `active.kanban.wrap`
- `active.kanban.canReorder`
- `active.kanban.groupUsesOptionColors`
- `selection.preview(itemId)`
- `selection.member(itemId)`
- `inline.editing({ viewId, itemId })`

#### `kanban.content(itemId)`

允许依赖：

- `active.item(itemId)`
- `doc.record(recordId)`
- `active.customFieldIds`
- `active.customField(fieldId)`

与 gallery 一样，content 只负责 record value + field projection，不再依赖 whole active state。

## source 的构建方式

只重写 `runtime/model/*` 不够。真正的 keyed source 必须从 engine 层开始建立。

### 1. DocumentSource 的构建

`DocumentSource` 不应继续通过 `createRuntimeKeyedSelector(get: key => read(runtime.store))` 构建。

正确做法：

- document commit 时直接 patch `record` / `field` / `view` keyed store
- `recordIds` / `fieldIds` / `viewIds` 单独维护为 ordered id store
- `document` whole store 保留给低频读取、序列化、调试

也就是：

- entity keyed source 由 commit patch 驱动
- 不是从 whole `DataDoc` 每次派生出来

### 2. ActiveSource 的构建

`ActiveSource` 也不应继续从 whole `ViewState` 派生。

最终做法：

- active snapshot 产出时，同时生成 `ActiveSourcePatch`
- commit runtime 把 patch 写入各个 active source store
- keyed source 直接按 changed key patch

建议的内部 patch 形态：

```ts
interface ActiveSourcePatch {
  ready?: boolean
  viewId?: ViewId
  viewType?: View['type']
  view?: View | undefined

  itemIds?: readonly ItemId[]
  item?: KeyedStorePatch<ItemId, ViewItem>
  itemIndex?: KeyedStorePatch<ItemId, number>

  sectionKeys?: readonly SectionKey[]
  section?: KeyedStorePatch<SectionKey, Section>
  sectionItemIds?: KeyedStorePatch<SectionKey, readonly ItemId[]>

  fieldIds?: readonly FieldId[]
  field?: KeyedStorePatch<FieldId, Field>

  customFieldIds?: readonly FieldId[]
  customField?: KeyedStorePatch<FieldId, CustomField>

  summary?: KeyedStorePatch<SectionKey, CalculationCollection>

  query?: ActiveQueryPatch
  table?: ActiveTablePatch
  gallery?: ActiveGalleryPatch
  kanban?: ActiveKanbanPatch
}
```

关键点：

- 更新 item A 时，只 patch `item(A)`、`itemIndex(A)`、它所在 section 的 `sectionItemIds` / `section` 计数。
- 改 sort 时，只 patch `query.sort`、`query.sortFieldIds`、相关 `sortDir(fieldId)`。
- 改 calc 时，只 patch 受影响的 `table.calc(fieldId)`。
- 改 summary 时，只 patch 受影响的 `summary(sectionKey)`。

### 3. `ViewState` 的去热路径化

`engine.active.state` 不需要立刻删除，但必须降级为：

- 低频调试读
- 兼容少量命令式逻辑
- 测试断言辅助

禁止再作为下列代码的热 source：

- `runtime.model.*`
- react view runtime 的 item/section/column/card keyed store

## 共享 card 模型的统一收口

gallery 和 kanban 现在都有一份几乎相同的 card/content 逻辑。最终应该在 `dataview-runtime` 内部做统一的 shared builder。

建议内部抽成：

```ts
interface CardChromeInput {
  viewId: ReadStore<ViewId | undefined>
  item: KeyedReadStore<ItemId, ViewItem | undefined>
  selected: KeyedReadStore<ItemId, boolean>
  preview: KeyedReadStore<ItemId, boolean | null>
  editing: KeyedReadStore<InlineKey, boolean>
}

interface CardContentInput {
  item: KeyedReadStore<ItemId, ViewItem | undefined>
  record: KeyedReadStore<RecordId, DataRecord | undefined>
  customFieldIds: ReadStore<readonly FieldId[]>
  customField: KeyedReadStore<FieldId, CustomField | undefined>
}
```

统一原则：

- chrome 和 content 分离
- selection/inline 改动不触发 property content 重算
- record value 改动不触发外层 drag / selected / editing chrome 重算

## root model 的收缩原则

所有 root model 都遵守同一条规则：

- root 只放 order、全局开关、少量 coarse-grained 状态
- per-key 数据绝不放进 root

具体禁止项：

- `gallery.body.sectionCountByKey`
- `table.body.items`
- `table.body.sections`
- `table.body.columns`
- 任意 `Map<id, data>` / `Record<id, data>` 类型的嵌入 root payload

如果某个值天然以 key 区分，就必须做成 keyed source / keyed model。

## 实施后的文件布局

建议直接按下面的目录重排：

```text
dataview/packages/dataview-engine/src/source/
  index.ts
  document.ts
  active/
    index.ts
    core.ts
    query.ts
    table.ts
    gallery.ts
    kanban.ts

dataview/packages/dataview-runtime/src/source/
  index.ts
  page.ts
  selection.ts
  inline.ts

dataview/packages/dataview-runtime/src/model/
  index.ts
  page.ts
  table.ts
  gallery.ts
  kanban.ts
  card.ts
  types.ts
```

对应清理：

- 删除 `dataview/packages/dataview-runtime/src/model/shared.ts` 中的 `readActiveTypedViewState`
- 删除 `*Base`、`*Data` 命名
- 删除 `createPageModel/createTableModel/createGalleryModel/createKanbanModel` 的多 store 参数风格

最终各 model creator 统一成：

```ts
createPageModel({ source })
createTableModel({ source })
createGalleryModel({ source })
createKanbanModel({ source })
```

## 迁移顺序

### Phase 1

先落 `engine.source.doc`

目标：

- `recordIds`
- `record`
- `fieldIds`
- `field`
- `viewIds`
- `view`

完成后，`runtime.model.page` 和 card content 就可以先摆脱 whole `DataDoc` 依赖。

### Phase 2

落 `engine.source.active.core`

目标：

- `ready`
- `viewId`
- `viewType`
- `view`
- `itemIds`
- `item`
- `itemIndex`
- `sectionKeys`
- `section`
- `sectionItemIds`
- `fieldIds`
- `field`
- `customFieldIds`
- `customField`
- `summary`

### Phase 3

落 `engine.source.active.query`

目标：

- `search`
- `filters`
- `sort`
- `group`
- `grouped`
- `groupFieldId`
- `filterFieldIds`
- `sortFieldIds`
- `sortDir`

### Phase 4

落 `engine.source.active.table/gallery/kanban`

目标：

- `table.calc`
- `table.wrap`
- `table.showVerticalLines`
- `gallery.wrap/size/layout/canReorder/groupUsesOptionColors`
- `kanban.wrap/size/layout/canReorder/groupUsesOptionColors/fillColumnColor/cardsPerColumn`

### Phase 5

重写 `runtime.source`

目标：

- `page.queryVisible`
- `page.queryRoute`
- `selection.member`
- `selection.preview`
- `inline.editing`

### Phase 6

重写 `runtime.model`

顺序：

1. `page`
2. `table`
3. `gallery`
4. `kanban`

原因：

- `page` 最容易先验证 `doc` / `query` source 是否合理
- `table` 最依赖 `query.sortDir` / `table.calc`
- `gallery` / `kanban` 最适合复用 shared card builder

### Phase 7

迁移 react 消费端，删除旧读路径

要求：

- 不再从 `engine.active.state` 搭建热 keyed store
- 不再从 `engine.select.document` / `engine.select.records.byId` 搭建热 keyed store
- 直接消费 `runtime.model` 或 `runtime.source`

## 验收标准

### 1. 依赖图标准

下面这些模式在完成后必须为零：

```ts
createKeyedDerivedStore({
  get: key => {
    const active = read(activeStateStore)
    ...
  }
})
```

```ts
createKeyedDerivedStore({
  get: key => read(documentStore)
})
```

### 2. 行为标准

- 修改单个 record value
  - 只打脏受影响 item 的 `content`
  - 不应先打脏所有 card keyed node
- 修改单个 section collapsed
  - 只打脏该 section keyed node 和必要的 root order/layout
- 修改单个字段 calc
  - 只打脏对应 `table.column(fieldId)`
- 修改 sort
  - 只打脏 `page.toolbar`、`page.query`、相关 `table.column(fieldId)`、必要 root order
- view type 切换
  - 允许 coarse-grained root 重建
  - 但不应出现 keyed cycle 或全量 selector 脏扩散

### 3. 引用稳定性标准

- `record(id)` 在该 record 未变化时引用稳定
- `item(id)` 在该 item 未变化时引用稳定
- `section(key)` 在该 section 未变化时引用稳定
- `field(id)` 在该 field 未变化时引用稳定
- `itemIds` / `sectionKeys` / `fieldIds` 在顺序未变化时引用稳定

### 4. 性能标准

50k 数据量下至少满足：

- 单 record value edit 不再让所有 mounted card keyed node 先 dirty
- query/filter/sort 改动不再触发 table/gallery/kanban 大量“无意义 keyed 重算”
- table header 的热路径不再含 `sort.rules.find(...)`
- page toolbar/query 的 available fields 计算不再依赖 whole doc + whole active state 重建

## 最终决策摘要

这次重构的核心不是“多写几个 keyed store”，而是把 keyed source 真正提前到 engine 层。

最终决策是：

1. 新增 `engine.source`，作为唯一 canonical reactive source。
2. 新增 `runtime.source`，组合 engine source 和 session source。
3. `runtime.model` 只依赖 `runtime.source`。
4. 删除 `readActiveTypedViewState(...)` 以及所有 `get: key => read(activeStateStore)` 型 keyed model。
5. root model 只保留 coarse-grained 状态，per-key 数据一律下放到 keyed source。
6. 命名统一收敛到 `record / field / view / item / section / summary` 与 `*Ids / *Keys`。

如果按这份方案完整落地，`dataview-runtime model` 的 keyed read source 才算真正从“表面 keyed”变成“结构上 keyed”。

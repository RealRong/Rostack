# DataView Runtime 视图模型化重构方案

## 目标

把 `dataview-react` 里“组件自己拼业务展示态”的模式收回到 runtime。

最终目标不是单纯做精细订阅，而是建立一套明确边界：

- runtime 负责把原始状态组装成可直接渲染的视图数据
- React 组件只消费这些视图数据，并发出 command / intent
- 局部 UI 状态仍留在 React

这可以理解为 MVVM，但这里不使用 `*Vm` 命名，统一使用短而直接的名词。

## 核心判断

当前的主要问题不是只有订阅太粗，而是**状态派生的位置错了**。

现在很多组件都在做这类事情：

- 订阅 `currentView` / `document` / `session`
- 在 render 里 `.find()` / `.map()` / 拼布尔值 / 拼 summary / 拼显示态
- 再把这些临时结果传给子组件

这意味着：

- React 在承担 view model 组装职责
- 组件 render 成了业务派生层
- 想优化性能时，只能不断补 selector / memo / isEqual

长期最优方向应当是：

- runtime 先产出稳定的、按消费边界拆分好的视图数据
- React 不再对原始状态做二次解释

## 不做什么

### 不做一个巨大的整页对象

不建议做这种东西：

```ts
dataView.view: ReadStore<WholeDataView>
table.view: ReadStore<WholeTable>
```

原因很简单：

- 它只是把“宽状态”换了个名字
- React 仍然会被一个大对象 invalidation 拖着走
- 叶子组件还是会重新拆这个大对象

所以这里不是“把所有东西塞进一个大 VM”，而是：

- runtime 负责组装
- 但按消费边界拆成多份 projection
- 叶子组件走 keyed read

## 最终原则

可以直接定成一条架构规则：

**React 组件禁止从多个 raw store / runtime store 现场拼业务展示态；runtime 必须先产出按消费边界拆分的视图数据，React 只读取这些数据并发命令。**

更具体一点：

- root 组件读取 coarse-grained 数据
- 重复子项读取 keyed 数据
- 事件处理优先调用 runtime command / intent
- 局部 UI 草稿态留在 React

## 命名规则

命名尽量短，不引入重复后缀。

### 统一规则

- 不用 `Vm`
- 不用 `Projection`
- 不用 `DerivedState`
- 不用 `ResolvedFooState`
- 优先用直接名词

例如：

- `body`
- `row`
- `header`
- `footer`
- `section`
- `cell`
- `card`
- `toolbar`
- `queryBar`
- `settings`

### store 命名规则

如果一个字段本身就是 store，就直接按内容命名：

```ts
body: ReadStore<TableBody>
row: KeyedReadStore<ItemId, TableRow>
header: KeyedReadStore<FieldId, TableHeader>
```

不要写成：

```ts
bodyVm
rowVm
headerProjection
rowStateView
```

### hook 命名规则

React hook 也直接对应语义：

```ts
useTableBody()
useTableRow(itemId)
useTableHeader(fieldId)
useTableFooter(scopeId)
useGalleryCard(itemId)
useKanbanSection(sectionKey)
```

不要写成：

```ts
useTableRowVm()
useResolvedHeaderProjection()
useRowRenderStateView()
```

## 分层

建议把 runtime 明确拆成五层，单向依赖。

### 1. raw

原始数据与原始会话状态：

- engine active/document/query/result
- selection
- marquee
- drag
- inline session
- page session

这一层不面向 React 直接消费。

### 2. intent / command

用户意图与写操作入口：

- `command`
- `intent`

例如：

- `selection.command`
- `intent.marquee`
- `engine.active.items.move`

这一层也不应该在 React 里被重新包装很多次。

### 3. feature model

针对功能域组装中间模型：

- table selection chrome
- table capabilities
- query field availability
- grouping summary
- footer summary
- card presentation

这一层是 runtime 内部的派生层。

### 4. view data

最终给 React 的可渲染数据：

- `body`
- `row`
- `header`
- `footer`
- `card`
- `toolbar`
- `queryBar`

这一层才是 React 的主要读取面。

### 5. local ui

只留给 React 的局部状态：

- popover open
- input draft
- hover 仅用于本组件视觉反馈
- 菜单展开项

这一层不回流到 runtime，除非它已经跨组件或跨 feature。

## DataView 顶层 API

建议把 dataview runtime 暴露面收敛成下面这种结构：

```ts
interface DataViewRuntime {
  page: PageRuntime
  table: TableRuntime | null
  gallery: GalleryRuntime | null
  kanban: KanbanRuntime | null
  selection: SelectionRuntime
  marquee: MarqueeRuntime
  drag: DragRuntime
  inline: InlineRuntime
  command: DataViewCommand
  intent: DataViewIntent
}
```

注意点：

- `table/gallery/kanban` 是当前 active view 的视图运行时入口
- React 不直接再去拼 `engine.active.state` 里的细节
- page feature 也不应再到处直接从 `document` 和 `active.state` 现算

## Page 层设计

page 层最适合先做“视图数据化”，因为现在 query / toolbar / settings 的重复派生最散。

建议 API：

```ts
interface PageRuntime {
  body: ReadStore<PageBody>
  header: ReadStore<PageHeader>
  toolbar: ReadStore<PageToolbar>
  queryBar: ReadStore<PageQueryBar>
  settings: ReadStore<PageSettings>
}
```

### `body`

```ts
interface PageBody {
  viewType?: 'table' | 'gallery' | 'kanban'
  empty: boolean
}
```

### `header`

```ts
interface PageHeader {
  viewId?: ViewId
  viewType?: ViewType
  viewName?: string
}
```

### `toolbar`

```ts
interface PageToolbar {
  views: readonly View[]
  activeViewId?: ViewId
  search: string
  filterCount: number
  sortCount: number
  availableFilterFields: readonly Field[]
  availableSortFields: readonly Field[]
}
```

### `queryBar`

```ts
interface PageQueryBar {
  visible: boolean
  filters: readonly FilterEntry[]
  sorts: readonly SortEntry[]
  availableFilterFields: readonly Field[]
  availableSortFields: readonly Field[]
}
```

### `settings`

```ts
interface PageSettings {
  viewsCount: number
  fields: readonly Field[]
  currentView?: View
  filter?: FilterView
  sort?: SortView
  group?: GroupView
}
```

这里的重点不是类型细节，而是：

- `Toolbar.tsx`、`ViewQueryBar.tsx`、`ViewSettings` 面板以后不再自己拼 `document + currentView + query projection`
- page runtime 先把数据准备好

## Table 层设计

table 是最适合彻底模型化的，因为它最依赖重复子项与 keyed read。

建议最终 API：

```ts
interface TableRuntime {
  body: ReadStore<TableBody>
  row: KeyedReadStore<ItemId, TableRow>
  header: KeyedReadStore<FieldId, TableHeader>
  footer: KeyedReadStore<string, TableFooter | undefined>
  section: KeyedReadStore<SectionKey, TableSection>
  cell: KeyedReadStore<CellKey, TableCell>
  drag: TableDrag
  marquee: TableMarquee
  command: TableCommand
}
```

### `body`

`body` 只给 root 组件消费。

```ts
interface TableBody {
  viewId: ViewId
  columns: readonly Field[]
  template: string
  wrap: boolean
  showVerticalLines: boolean
  grouped: boolean
  blocks: readonly TableBlock[]
  totalHeight: number
  startTop: number
  containerWidth: number
  rowHeight: number
  marqueeActive: boolean
  dragActive: boolean
  locked: boolean
}
```

它应该吸收现在 `Body.tsx` 和 `BlockContent.tsx` 里很多分散订阅。

### `row`

`row` 是核心。

```ts
interface TableRow {
  recordId?: RecordId
  selected: boolean
  previewSelected: boolean
  exposed: boolean
  canDrag: boolean
  tone?: 'default' | 'selected' | 'dragging'
  selectionVisible: boolean
  selectedFieldStart?: number
  selectedFieldEnd?: number
  focusFieldId?: FieldId
  hoverFieldId?: FieldId
  fillFieldId?: FieldId
}
```

`Row.tsx` 以后只读 `row(itemId)`，不再自己拼：

- `rowRail`
- committed selection
- marquee preview selection
- capabilities
- rowRender

### `header`

```ts
interface TableHeader {
  grouped: boolean
  sortDirection?: 'asc' | 'desc'
  calculationMetric?: CalculationMetric
}
```

`ColumnHeader.tsx` 不再自己扫 `currentView.query.sort.rules.find(...)`。

### `footer`

```ts
interface TableFooter {
  summaryByFieldId: ReadonlyMap<FieldId, SummaryResult>
}
```

`ColumnFooterBlock.tsx` 不再订阅整个 `currentView`。

### `section`

```ts
interface TableSection {
  key: SectionKey
  label: string
  collapsed: boolean
  count: number
}
```

`SectionHeader.tsx` 不该再读整个 `currentView`。

### `cell`

```ts
interface TableCell {
  selected: boolean
  frame: boolean
  hover: boolean
  fill: boolean
  exists: boolean
}
```

如果未来 cell 继续变复杂，`Cell.tsx` 也不应该再从 row 侧二次推导。

## Gallery 层设计

gallery 现在主要问题不是单点逻辑太重，而是宽 context 把整棵树绑住了。

建议 API：

```ts
interface GalleryRuntime {
  body: ReadStore<GalleryBody>
  section: KeyedReadStore<SectionKey, GallerySection>
  card: KeyedReadStore<ItemId, GalleryCard>
  drag: GalleryDrag
  marquee: GalleryMarquee
  command: GalleryCommand
}
```

### `body`

```ts
interface GalleryBody {
  viewId: ViewId
  empty: boolean
  grouped: boolean
  blocks: readonly GalleryBlock[]
  totalHeight: number
  columnCount: number
  indicator?: {
    left: number
    top: number
    height: number
  }
}
```

### `section`

```ts
interface GallerySection {
  key: SectionKey
  label: string
  count: number
}
```

### `card`

```ts
interface GalleryCard {
  viewId: ViewId
  fields: readonly CustomField[]
  size: CardSize
  layout: CardLayout
  wrap: boolean
  canDrag: boolean
  selected: boolean
  editing: boolean
}
```

这里的重点是：

- `Card.tsx` 不再从一个大 context 里读 `active + extra + runtime`
- 卡片展示配置直接由 `card(itemId)` 给出
- `RecordCard` 保持叶子化

## Kanban 层设计

kanban 和 gallery 一样，也应该把宽 context 拆掉。

建议 API：

```ts
interface KanbanRuntime {
  board: ReadStore<KanbanBoard>
  section: KeyedReadStore<SectionKey, KanbanSection>
  card: KeyedReadStore<ItemId, KanbanCard>
  drag: KanbanDrag
  marquee: KanbanMarquee
  command: KanbanCommand
}
```

### `board`

```ts
interface KanbanBoard {
  viewId: ViewId
  grouped: boolean
  columnWidth: number
  columnMinHeight: number
  fillColumnColor: boolean
  groupUsesOptionColors: boolean
}
```

### `section`

```ts
interface KanbanSection {
  key: SectionKey
  label: string
  collapsed: boolean
  count: number
  visibleIds: readonly ItemId[]
  visibleCount: number
  hiddenCount: number
  showMoreCount: number
  isDropTarget: boolean
  indicatorTop?: number
  color?: string
}
```

### `card`

```ts
interface KanbanCard {
  viewId: ViewId
  fields: readonly CustomField[]
  size: CardSize
  layout: CardLayout
  wrap: boolean
  canDrag: boolean
  selected: boolean
  editing: boolean
  color?: string
}
```

这样：

- `Column.tsx` 不再自己拼 `isColumnTarget`
- `ColumnBody.tsx` 不再自己拼 `visibleIds/hiddenCount/showMoreCount/indicatorTop`
- `Card.tsx` 不再自己从 context + engine 现场找 color 和展示配置

## Inline / selection / marquee / drag 设计

这些不是“页面视图数据”，但它们是视图数据的原料，所以也要收敛命名与输出方式。

### `inline`

```ts
interface InlineRuntime {
  target: ReadStore<InlineTarget | null>
  editing: KeyedReadStore<string, boolean>
}
```

说明：

- `editing(key)` 解决现在 `useCardEditingState` 这种 N 卡片 selector 重跑问题

### `selection`

```ts
interface SelectionRuntime {
  membership: KeyedReadStore<ItemId, boolean>
  scope: KeyedReadStore<SelectionScope<ItemId>, SelectionScopeState>
  command: SelectionCommand
}
```

### `marquee`

```ts
interface MarqueeRuntime {
  active: ReadStore<boolean>
  membership: KeyedReadStore<ItemId, boolean>
  scope: KeyedReadStore<SelectionScope<ItemId>, SelectionScopeState>
  intent: MarqueeIntent
}
```

### `drag`

```ts
interface DragRuntime {
  active: ReadStore<boolean>
  state: ReadStore<DragState | null>
}
```

这些 runtime 不要求 React 自己二次解释。

## React 侧最终形态

React 侧的理想调用方式应当像这样：

### table

```ts
const body = useTableBody()
const row = useTableRow(itemId)
const header = useTableHeader(fieldId)
const footer = useTableFooter(scopeId)
```

### gallery

```ts
const body = useGalleryBody()
const card = useGalleryCard(itemId)
const section = useGallerySection(sectionKey)
```

### kanban

```ts
const board = useKanbanBoard()
const section = useKanbanSection(sectionKey)
const card = useKanbanCard(itemId)
```

### page

```ts
const toolbar = usePageToolbar()
const queryBar = usePageQueryBar()
const settings = usePageSettings()
```

React 组件里不应再出现这类代码：

```ts
const currentView = useStoreValue(table.currentView)
const selected = useKeyedStoreValue(dataView.selection.store.membership, itemId)
const previewSelected = useKeyedStoreValue(dataView.session.marquee.preview.membership, itemId)
const exposed = useStoreSelector(table.rowRail, rowId => rowId === itemId)
```

这类组装应全部提前收进 runtime。

## 哪些状态必须留在 React

不要走极端，不是所有东西都进 runtime。

明确留在 React 的：

- popover open
- input draft
- menu open key
- 只影响当前组件的 hover
- 只影响当前组件的 focus ring 过渡

判断标准：

- 是否跨组件共享
- 是否由多个 raw store 派生
- 是否需要被多个子树复用

只要这三个问题都是否，就留在 React。

## 实施顺序

### 第一阶段：把最明显的叶子拼装移到 runtime

- `table.row`
- `table.header`
- `table.footer`
- `inline.editing`

这是收益最大的一阶段。

### 第二阶段：page feature 视图数据化

- `page.toolbar`
- `page.queryBar`
- `page.settings`

这会大幅减少 `Toolbar.tsx`、`ViewQueryBar.tsx`、`ViewSettings` 面板里的临时派生。

### 第三阶段：gallery / kanban 去宽 context

- 用 `body/section/card` 替代 `{ active, extra, runtime }`
- 让 root 读 coarse data，leaf 读 keyed data

### 第四阶段：删掉 React 中间兼容层

- 不保留老的 re-export
- 不保留旧 selector 适配层
- 组件直接迁到新 runtime API

## 最终形态总结

最终不是：

- React 组件精细订阅 raw state

而是：

- runtime 先把视图数据拼好
- React 精细订阅这些视图数据

也不是：

- 一个巨大的 `viewModel`

而是：

- `body`
- `row`
- `header`
- `footer`
- `card`
- `section`
- `toolbar`
- `queryBar`

这些都由 runtime 提前组装好，并按消费边界拆开。

这套结构的直接收益有三点：

- React render 不再承担业务派生
- 订阅粒度天然跟随消费边界，而不是靠组件内 selector 硬抠
- API 名称短、稳定、直观，不会继续长成 `resolvedProjectionViewState`

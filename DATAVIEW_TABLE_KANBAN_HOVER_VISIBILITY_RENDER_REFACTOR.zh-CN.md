# DATAVIEW table / kanban 全局 hover / visibility / render 混合源重构方案

## 1. 背景

`DATAVIEW_STORE_READ_PATH_PERF_AUDIT.zh-CN.md` 已经确认，dataview 当前读路径上的一类核心问题不是“有没有缓存”，而是：

- 热状态仍然挂在 whole store 上
- keyed getter 在读取时又回头去读 whole state / whole map
- row / section 这类组件消费的是混合后的大对象，导致无关字段变化也会一起失效

当前最典型的 3 个入口是：

- `dataview/packages/dataview-react/src/views/table/hover.ts`
- `dataview/packages/dataview-react/src/views/table/rowRender.ts`
- `dataview/packages/dataview-react/src/views/kanban/runtime.ts`

它们共同的问题是：对外看起来像 keyed source，实际上热依赖仍然是 whole hover state、whole selection chrome、whole visibility map。

这份文档的目标不是做“局部补丁”，而是给出一套可以一步到位实施、后续长期可复用的最终设计。

## 2. 目标

### 2.1 目标

- table 的 hover / selection / fill / rail / chrome 按真实数据边界拆开
- kanban 的 section 基础数据、visibility、layout 分层
- 热读路径只依赖 exact-key source，不允许 keyed getter 再去读 whole map
- React 组件只消费两类 source：
  - coarse-grained 全局低频 source
  - exact-key 的 row / cell / section source
- 命名尽量短，重复概念统一挂到 namespace 下
- 不保留兼容层，不做 re-export 过渡

### 2.2 非目标

- 不在这一轮改变交互语义
- 不把所有 view 都抽成统一大框架后再落地
- 不为了“单 hook”继续拼一个更大的混合 store

## 3. 现状问题

### 3.1 table hover 仍然是伪 keyed

`createHover()` 当前暴露：

- `target: ReadStore<TableHoverTarget | null>`
- `cell: KeyedReadStore<CellRef, boolean>`
- `row: KeyedReadStore<ItemId, boolean>`

但 `cell` / `row` 的实现本质上都在 keyed getter 内读取 `state`：

- `hoveredCellOf(read(state).target)`
- `hoveredRowIdOf(read(state).target)`

结果是 hover 每变化一次，整个 hover family 都会先 dirty，然后再在 per-key getter 里判断“是不是我”。

这不是 keyed invalidation，只是 whole invalidation 外包给 keyed cache。

### 3.2 table row render 仍然混合了多种热源

`rowRender.ts` 里当前把以下内容混在一起：

- grid selection
- focus cell
- fill handle
- hover target
- value editor open
- capability

然后输出一个 `RowRenderState`：

- `selectionVisible`
- `selectedFieldStart`
- `selectedFieldEnd`
- `focusFieldId`
- `hoverFieldId`
- `fillFieldId`

问题不只是“字段多”，而是粒度错了：

- hover 的真实边界是 cell，不是 row
- focus 的真实边界是 cell，不是 row
- fill handle 的真实边界是 cell，不是 row
- selection visible 是全局低频布尔，不应该塞进每个 row 热 getter

结果是一个 cell 的 hover / focus / fill 变化，也会先让整行的 row render source 变脏，再由 Row 重新把状态分发给所有 Cell。

### 3.3 table controller 继续把热状态混回单一 row source

`table/controller.ts` 当前又把：

- row item selection
- row rail exposed
- can drag
- selection visible
- selected field range
- focus field
- hover field
- fill field

重新拼成 `table.row(rowId)`。

这意味着：

- Row 订阅的是一个大对象
- Cell 的 chrome 由 Row 重新计算后以 props 形式下发
- row/item 级状态和 cell/grid 级状态继续耦合

这会让“组件 memo 已经命中”的收益明显下降，因为热字段依然都在 Row 这一层聚集。

### 3.4 kanban visibility 仍然由 whole map 驱动

`useSectionVisibility()` 当前返回：

- `bySection: Map<SectionKey, KanbanSectionVisibility>`
- `showMore(sectionKey)`

随后 `runtime.ts` 又把 `bySection` 放进单个 `visibilityStore`，并在 `section(key)` getter 中执行：

```ts
const currentVisibility = read(visibilityStore).get(key)
```

这等价于：

- 任意 section 的 `showMore`
- 任意 section 的 `visibleIds`
- 任意 section 的 `hiddenCount`

都会先让所有 `section(key)` getter 变脏。

### 3.5 kanban section 把基础数据和 visibility 混成一个对象

当前 `KanbanSectionData` 是：

- runtime model `KanbanSection`
- 再拼上 `visibleIds`
- `visibleCount`
- `hiddenCount`
- `showMoreCount`

这会带来两个问题：

1. `ColumnHeader` 其实只需要基础 section 数据，但会跟着 visibility 变化一起 rerender。
2. `ColumnBody` 的热窗口数据被塞回 section model，后续任何 section 相关消费者都更容易误用这个大对象。

### 3.6 kanban layout 和 visibility 也耦合过深

`useKanbanGeometry()` 当前输入是：

- `sections`
- `visibilityBySection`

内部再用：

- `bodyVersion`
- `bodyRectBySectionKey`
- `buildBoardLayout(...)`

这里的问题不是 `board layout` 不能是 whole store，而是：

- 用 whole visibility map 驱动 geometry
- 用 `bodyVersion` 让所有 section 的 body rect 统一重算
- 由 React hook 层维护大块聚合对象，再喂给 keyed getter

`board layout` 这种 whole 结构可以存在，但它应该只服务于 drag hit test / marquee hit test 这类 imperative 场景，不应该反向渗透回 section 的热渲染源。

## 4. 设计原则

### 4.1 热状态按真实边界拆源

- row/item 级状态只进 row keyed source
- cell/grid 级状态只进 cell keyed source
- section 基础数据和 section 可见窗口分离
- geometry/layout 和 render source 分离

### 4.2 whole source 只保留给 imperative 逻辑

允许保留 whole source 的场景：

- 当前 hover target / pointer
- 当前 grid selection snapshot
- 当前 focused cell / fill handle
- kanban board layout

但这些 whole source 只能给以下场景使用：

- command / intent
- drag / marquee hit test
- 调试或诊断

不允许让热 keyed getter 直接依赖这些 whole source。

### 4.3 render 概念改名为 chrome

`render` 语义太宽，容易继续把：

- hover
- selection
- capability
- layout
- visibility

全部塞进去。

这里统一改成 `chrome`，只表示组件最终用于渲染的视觉状态投影。

也就是说：

- `hover` 是交互源
- `select` 是选择源
- `fill` 是填充源
- `visibility` 是窗口源
- `layout` 是几何源
- `chrome` 是消费端最终视觉投影

### 4.4 允许 runtime 输出组合结果，但组合结果必须是正确粒度

禁止的是“在 keyed getter 内读 whole hot source”，不是禁止 runtime 产出组合结果。

可以有：

- `table.chrome.row`
- `table.chrome.cell`

但不可以把它们重新做成：

- 一个 row 里塞所有 cell 的 hover / focus / fill
- 一个 section 里塞整个 visibility map 的投影

## 5. 最终架构

### 5.1 table

table 最终拆成 6 个 namespace：

- `table.hover`
- `table.select`
- `table.fill`
- `table.rail`
- `table.can`
- `table.chrome`

依赖关系如下：

```text
table.hover.target  -> table.hover.row / table.hover.cell
table.select.rows   -> table.chrome.row
table.select.cells  -> table.chrome.cell
table.fill.handle   -> table.fill.cell -> table.chrome.cell
table.rail.row      -> table.chrome.row
table.can.*         -> table.chrome.row / table.fill.cell
```

最终组件消费规则：

- `Row` 只读 `table.chrome.row(itemId)`
- `Cell` 只读 `table.chrome.cell(cellRef)`
- Row 不再把 cell 级 chrome 通过 props 下发给每个 `Cell`

### 5.1.1 最终 API

```ts
interface TableRowChrome {
  selected: boolean
  exposed: boolean
  canDrag: boolean
}

interface TableCellChrome {
  selected: boolean
  focus: boolean
  hover: boolean
  fill: boolean
}

interface TableRuntime {
  hover: {
    target: ReadStore<TableHoverTarget | null>
    row: KeyedReadStore<ItemId, boolean>
    cell: KeyedReadStore<CellRef, boolean>
    set(target: TableHoverTarget | null, point?: Point | null): void
    clear(point?: Point | null): void
  }
  select: {
    rows: KeyedReadStore<ItemId, boolean>
    cells: {
      state: ReadStore<GridSelection | null>
      range: ReadStore<GridSelectionEdges | undefined>
      visible: ReadStore<boolean>
      cursor: ReadStore<CellRef | undefined>
      selected: KeyedReadStore<CellRef, boolean>
      focus: KeyedReadStore<CellRef, boolean>
    }
  }
  fill: {
    handle: ReadStore<CellRef | undefined>
    cell: KeyedReadStore<CellRef, boolean>
  }
  rail: {
    active: ReadStore<ItemId | null>
    row: KeyedReadStore<ItemId, boolean>
    set(rowId: ItemId | null): void
  }
  can: {
    hover: ReadStore<boolean>
    fill: ReadStore<boolean>
    rowDrag: ReadStore<boolean>
  }
  chrome: {
    row: KeyedReadStore<ItemId, TableRowChrome>
    cell: KeyedReadStore<CellRef, TableCellChrome>
  }
}
```

说明：

- `hover.target`、`select.cells.state`、`select.cells.range`、`select.cells.cursor`、`fill.handle` 都是 imperative source
- 热渲染只消费 `hover.row`、`hover.cell`、`select.rows`、`select.cells.selected`、`select.cells.focus`、`fill.cell`、`chrome.row`、`chrome.cell`
- `TableRowData` 和 `RowRenderState` 删除
- `rowRender.ts` 删除

### 5.1.2 实现方式

#### a. `table.hover`

`hover.target` 仍然保留为单值状态，但 `row` / `cell` 不再通过 keyed getter 去读 `target`，而是在 `set()` / `clear()` 时做增量 patch：

- 取旧 target
- 解析旧 row / old cell
- 解析新 row / new cell
- 只 patch 旧 key 和新 key

效果：

- hover 从 A 移到 B，只会影响 A 和 B 两个 row key、两个 cell key
- 不再由 whole hover state 让所有 hover family entry 先 dirty

#### b. `table.select.rows`

`rows` 是最终 row item selection membership：

- 内部把 committed selection 和 preview selection 合并
- 对外直接给 `KeyedReadStore<ItemId, boolean>`

这样 Row 不需要再自己读 preview / committed 两套 source。

#### c. `table.select.cells`

`select.cells.state` 仍保留 whole grid selection snapshot，服务于：

- keyboard navigation
- reveal cursor
- fill 逻辑
- value editor open cell

但热渲染不直接读它。

最终要有 2 个 keyed source：

- `selected(cellRef)` 表示该 cell 是否在当前 grid selection 内
- `focus(cellRef)` 表示该 cell 是否是当前 focus cell

实现上不应继续写成：

```ts
createKeyedDerivedStore({
  get: cell => {
    const range = read(gridSelectionStore)
    ...
  }
})
```

正确做法是：

- selection 更新时先计算一次 old edges / new edges
- 按 delta patch 受影响的 row / cell key
- `selected` / `focus` 变成真正的 keyed membership source

`visible` 仍然可以是全局布尔，因为它是低频开关，不按 key 变化。

#### d. `table.fill`

`fill.handle` 仍然保留 whole cell snapshot，服务于命令和拖拽逻辑。

`fill.cell` 则只在以下情况 patch：

- old handle cell
- new handle cell
- `can.fill` 从 false -> true / true -> false

这样 fill handle 不会再让所有 row getter 变脏。

#### e. `table.chrome.row`

`chrome.row` 只负责 row 级最终消费态：

- `selected`
- `exposed`
- `canDrag`

依赖来源：

- `table.select.rows`
- `table.rail.row`
- `table.can.rowDrag`

这是允许的组合结果，因为它的粒度仍然是 row。

#### f. `table.chrome.cell`

`chrome.cell` 是最终热点源，负责 cell 的视觉状态：

- `selected`
- `focus`
- `hover`
- `fill`

依赖来源：

- `table.select.cells.selected`
- `table.select.cells.focus`
- `table.hover.cell`
- `table.fill.cell`
- `table.select.cells.visible`

这里 `visible` 是全局布尔，但它只是低频 gate，不应该再回退到 row 级混合源。

### 5.1.3 React 接入规则

最终接入方式：

- `Row.tsx` 订阅 `table.chrome.row(itemId)`
- `Cell.tsx` 订阅 `table.chrome.cell({ itemId, fieldId })`
- `Row.tsx` 不再把 `selectedFieldStart` / `hoverFieldId` / `fillFieldId` 等信息经 props 传给 `Cell`

这会直接带来两个结果：

1. 同一行内 hover 从 A 列移动到 B 列时，Row 不 rerender，只更新 A / B 两个 Cell。
2. focus / fill / grid selection 的局部变化不再先污染整行。

### 5.2 kanban

kanban 最终拆成 4 个 namespace：

- `kanban.board`
- `kanban.section`
- `kanban.visibility`
- `kanban.layout`

依赖关系如下：

```text
kanban.section            -> Column / ColumnHeader / ColumnBody
kanban.visibility.section -> ColumnBody
kanban.layout.body        -> kanban.layout.board
kanban.visibility.section -> kanban.layout.board
kanban.layout.board       -> drag / marquee hit test only
```

### 5.2.1 最终 API

```ts
interface KanbanVisibility {
  ids: readonly ItemId[]
  visible: number
  hidden: number
  more: number
}

interface KanbanLayout {
  board: ReadStore<BoardLayout | null>
  body: KeyedReadStore<SectionKey, Rect | undefined>
  measure: {
    body(sectionKey: SectionKey): (node: HTMLDivElement | null) => void
    card(itemId: ItemId): (node: HTMLElement | null) => void
  }
}

interface KanbanRuntime {
  board: ReadStore<KanbanBoard>
  section: KeyedReadStore<SectionKey, KanbanSection | undefined>
  visibility: {
    section: KeyedReadStore<SectionKey, KanbanVisibility | undefined>
    showMore(sectionKey: SectionKey): void
    reset(): void
  }
  layout: KanbanLayout
  card: DataViewKanbanModel['card']
  content: DataViewKanbanModel['content']
}
```

说明：

- 删除 `KanbanSectionData`
- 删除 `visibility.bySection: Map<SectionKey, ...>`
- `ColumnHeader` 不再被 `visibleIds` / `showMoreCount` 牵连
- `layout.board` 允许是 whole store，但仅给 drag / marquee / hit test 使用

### 5.2.2 `kanban.section`

`kanban.section` 只保留基础 section 数据：

- `key`
- `label`
- `bucket`
- `collapsed`
- `count`
- `color`

不再混入：

- `visibleIds`
- `visibleCount`
- `hiddenCount`
- `showMoreCount`

原因很直接：

- 这些字段属于 visibility window，不属于 section model
- 把它们塞回 `section(key)` 会让 header 跟着 body 一起抖动

### 5.2.3 `kanban.visibility.section`

`visibility.section(key)` 是唯一的 section window source。

内部 authoritative state 只需要维护：

- 每列 expanded count
- 当前 `cardsPerColumn`
- 每列当前 item count

然后按 key 输出：

```ts
{
  ids,
  visible,
  hidden,
  more
}
```

关键约束：

- `showMore(sectionKey)` 只 patch 该 key
- section 增删时，只 patch 受影响的 key
- `viewId` / `cardsPerColumn` 变化时，允许整组 reset，但不能再经由 `Map -> keyed getter -> .get(key)` 传播

### 5.2.4 `kanban.layout`

`layout` 要分成两层：

1. `layout.body(sectionKey)`：section body 的 keyed rect source
2. `layout.board`：whole board layout，只给 drag / marquee / hit test

`layout.body` 的更新必须是按 key 的：

- body node mount / unmount
- body rect change

不能再依赖 `bodyVersion + whole map rebuild`。

`layout.board` 允许是 whole 结构，因为：

- drag drop target 计算天然就是跨 section 的
- marquee hit test 天然需要看整个 board

但 `layout.board` 不允许再被 section keyed getter 回读。

### 5.2.5 React 接入规则

最终接入方式：

- `Column.tsx` 只读 `board` 和 `section(sectionKey)`
- `ColumnHeader.tsx` 只读 `board` 和 `section(sectionKey)`
- `ColumnBody.tsx` 读：
  - `board`
  - `section(sectionKey)`
  - `visibility.section(sectionKey)`
  - `layout.measure.body(sectionKey)`

结果：

- `showMore` 只导致目标列 body rerender
- `ColumnHeader` 不再因为 `visibleIds` 改变而更新
- layout 的 whole board 变化不会回流污染 section source

## 6. 命名规则

### 6.1 namespace 规则

重复概念统一按 namespace 分类：

- `table.hover.*`
- `table.select.*`
- `table.fill.*`
- `table.rail.*`
- `table.can.*`
- `table.chrome.*`
- `kanban.visibility.*`
- `kanban.layout.*`

### 6.2 命名收缩规则

优先短名，但短名必须在 namespace 内仍然自解释：

- `section` 而不是 `sectionData`
- `visibility.section` 而不是 `visibilityBySection`
- `layout.body` 而不是 `bodyRectBySectionKey`
- `chrome.cell` 而不是 `rowRender`
- `ids / visible / hidden / more` 而不是 `visibleIds / visibleCount / hiddenCount / showMoreCount`

### 6.3 whole source 的保留名

whole source 统一使用以下少数命名：

- `target`
- `state`
- `range`
- `cursor`
- `handle`
- `board`

这些名字一旦出现，就默认属于 imperative / low-frequency source，不允许被热 keyed getter 直接依赖。

## 7. 禁止模式

以下模式在这次重构后统一禁止：

### 7.1 keyed getter 读 whole map

```ts
createKeyedDerivedStore({
  get: key => read(globalMapStore).get(key)
})
```

### 7.2 keyed getter 读 whole hot state

```ts
createKeyedDerivedStore({
  get: key => {
    const state = read(wholeStateStore)
    ...
  }
})
```

### 7.3 用 row / section 大对象重新混回热字段

例如：

- 把 cell hover / focus / fill 塞回 row
- 把 visibleIds / hiddenCount 塞回 section

### 7.4 React 组件消费“冷热混合大对象”

例如：

- `Row` 同时拿 row selection、grid selection、hover field、fill field
- `ColumnHeader` 拿到包含 `visibleIds` 的 section 对象

### 7.5 由 React hook 聚合 whole map 再反喂 keyed source

例如：

- `useMemo(() => new Map(...))`
- `createValueStore(bySection)`
- `section(key) => read(mapStore).get(key)`

这是这轮必须彻底拆掉的反模式。

## 8. 模块与文件重组

建议按 view 下的 runtime namespace 重组，不再继续平铺“功能名 + 大杂烩 getter”：

### 8.1 table

建议目标文件：

- `dataview/packages/dataview-react/src/views/table/runtime/hover.ts`
- `dataview/packages/dataview-react/src/views/table/runtime/select.ts`
- `dataview/packages/dataview-react/src/views/table/runtime/fill.ts`
- `dataview/packages/dataview-react/src/views/table/runtime/rail.ts`
- `dataview/packages/dataview-react/src/views/table/runtime/chrome.ts`
- `dataview/packages/dataview-react/src/views/table/controller.ts`

删除：

- `dataview/packages/dataview-react/src/views/table/rowRender.ts`

### 8.2 kanban

建议目标文件：

- `dataview/packages/dataview-react/src/views/kanban/runtime/visibility.ts`
- `dataview/packages/dataview-react/src/views/kanban/runtime/layout.ts`
- `dataview/packages/dataview-react/src/views/kanban/runtime.ts`
- `dataview/packages/dataview-react/src/views/kanban/types.ts`

删除旧接口：

- `KanbanSectionData`
- `visibility.bySection`

是否需要单独目录不重要，关键是 namespace 边界必须在代码结构里也对应起来，不能继续把 hover / visibility / layout / render 混在一个 runtime 文件里。

## 9. 实施方案

### 9.1 第一阶段：table hover 真 keyed 化

目标：

- 保留 `hover.target`
- 把 `hover.row` / `hover.cell` 改成增量 patch source

完成标准：

- hover 从 A 到 B 时，只产生 old/new 两组 key 失效
- `createKeyedDerivedStore(... read(state) ...)` 从 hover 实现中消失

### 9.2 第二阶段：table row/item selection 与 grid selection 分层

目标：

- `table.select.rows` 直接输出最终 row membership
- `table.select.cells` 提供 `selected` / `focus`

完成标准：

- Row 不再自己合并 preview / committed selection
- grid selection 不再通过 row getter 传播到 Row

### 9.3 第三阶段：删除 rowRender，改成 row / cell chrome

目标：

- 新增 `table.chrome.row`
- 新增 `table.chrome.cell`
- 删除 `RowRenderState`
- 删除 `TableRowData`

组件改造：

- `Row.tsx` 改读 `table.chrome.row`
- `Cell.tsx` 自己读 `table.chrome.cell`

完成标准：

- cell hover / focus / fill 不再让 Row rerender
- Row 不再传 `selectedFieldStart` / `hoverFieldId` / `fillFieldId` 给 Cell

### 9.4 第四阶段：kanban visibility 去 whole map 化

目标：

- `useSectionVisibility()` 从“返回 whole map”改成“返回 keyed visibility runtime”
- 新增 `visibility.section(key)`
- 删除 `visibility.bySection`

完成标准：

- `showMore(sectionKey)` 只使目标 section 的 visibility source 失效
- `section(key)` 不再读取 whole visibility map

### 9.5 第五阶段：kanban section / visibility / layout 分层

目标：

- `section` 只保留基础数据
- `ColumnHeader` 只读 `section`
- `ColumnBody` 读 `visibility.section`
- `layout.body(sectionKey)` 改成真正 keyed rect source

完成标准：

- `KanbanSectionData` 删除
- `ColumnHeader` 不再受 `showMore` 影响
- `bodyVersion` 和 whole body rect map 退出热渲染路径

### 9.6 第六阶段：清理旧实现与导出

必须删除：

- 旧 `rowRender` 文件及其导出
- `TableRowData`
- `RowRenderState`
- `KanbanSectionData`
- `visibility.bySection`

原则：

- 不保留 re-export
- 不保留兼容 wrapper
- 不保留“新旧 API 同时存在一段时间”的中间态

## 10. 验证口径

### 10.1 table

需要验证：

- hover 单步移动时，只更新 old/new row/cell
- 同行跨列 hover 时，Row 不 rerender
- focus cell 变化时，只更新 old/new focus cell
- fill handle 变化时，只更新 old/new fill cell
- value editor open / close 时，只影响 `chrome.cell` 的低频 gate，不回退到 row 级混合重算

### 10.2 kanban

需要验证：

- `showMore(sectionKey)` 只让目标列 body rerender
- `ColumnHeader` 不跟着 `visibleIds` 变化更新
- body mount / unmount / size change 只更新对应 `layout.body(sectionKey)`
- marquee / drag 仍可从 `layout.board` 正常命中

### 10.3 读路径审计标准

重构完成后，必须满足：

- 热 keyed getter 内不再出现 `read(wholeHotStore)`
- 热 keyed getter 内不再出现 `read(wholeMapStore).get(key)`
- row / section 对象不再承载下一级热点字段

## 11. 预期收益

这次重构的收益不是“少几个 hook”，而是 invalidation 边界恢复正确：

- table hover：从 whole hover invalidation 变成 old/new key invalidation
- table cell chrome：从 row 级热重算下发，变成 cell 级直读
- kanban show more：从 whole map invalidation 变成 target section invalidation
- kanban header：从 visibility 连带更新中解耦出来

如果只做 React memo 或 selector，而不拆这些源，收益会很快碰到上限。真正的长期杠杆是把 hover / selection / visibility / layout / chrome 的边界重新拉直。

## 12. 最终决策

最终采用以下方向：

- table 删除 `rowRender`，改为 `hover / select / fill / rail / can / chrome`
- table 的热点最终下沉到 `chrome.cell`
- kanban 删除 `KanbanSectionData` 和 `visibility.bySection`
- kanban 拆成 `section / visibility / layout`
- `layout.board` 仅保留给 drag / marquee / hit test
- 不保留兼容层，直接迁到最终 API

这套设计的核心不是“多拆几个 store”，而是把真正会高频变化的数据边界和组件消费边界对齐。只有这样，family 缓存、keyed source、React memo 才能真正产生乘法收益。

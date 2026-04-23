# DATAVIEW Table Row / Cell Rerender 长期最优重构方案

## 前提

- 目标不是继续在 `Row` / `Cell` 上追加 `memo`、自定义 compare、局部缓存。
- 目标是把 table 渲染链路的职责重新摆正，让 React 不再自己拼 active row / cell 数据。
- 只接受一步到位方案，不保留兼容 API，不保留过渡层，不保留旧粗粒度模型。
- 优先级是：
  1. 先修正底层订阅边界
  2. 再删除不该存在的中间拼装层
  3. 最后才讨论局部渲染细节

这里有一个明确边界：

- UI 命令路径可以继续直接调用 `engine.active.*`、`engine.fields.*`、`engine.records.*`
- 但 UI 渲染订阅路径不应再直接读：
  - `source.document.records`
  - `source.active.items.read.record`
  - `engine.active.read.cell(...)`
  - React 层自己拼出来的 `current row / current cell / current view`

也就是说，命令可以直达 engine，渲染数据必须走 runtime model。

## 当前根因

### 1. `Row` 订阅边界过大

当前 [Row.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/row/Row.tsx) 有两层问题：

- 它订阅整个 `table.body`
- 它再订阅 `itemId -> recordId -> record`
- 然后在 row 内部把所有 column 的 value 一次性算出来，再扇出给每个 `Cell`

结果是：

- 虚拟窗口滚动
- measurement 更新
- container width 变化
- wrap / vertical lines 变化
- 单个字段值变化

都可能被放大成整行 rerender，进而让整行所有 cell 重新参与渲染比较。

### 2. `Cell` 只是被动接收父层扇出的值

当前 [Cell.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/cell/Cell.tsx) 的 `value`、`recordId`、`exists`、`field`、`viewId`、`wrap`、`showVerticalLines` 都来自父组件。

这说明：

- `Cell` 没有自己的数据边界
- 真正的订阅粒度仍然停留在 row 级
- `Cell` 的 `memo` 只能做“父组件已经重跑之后的补救”

这不是长期模型，只是局部缓冲。

### 3. `uiRuntime.body` 混合了三类完全不同的状态

当前 [uiRuntime.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/uiRuntime.ts) 的 `TableBodyRenderState` 同时混了：

- active view render data
  - `viewId`
  - `columns`
  - `rowCount`
  - `grouped`
  - `wrap`
  - `showVerticalLines`
- virtual window data
  - `blocks`
  - `totalHeight`
  - `startTop`
  - `measurementIds`
  - `containerWidth`
- interaction data
  - `marqueeActive`

这会导致本来只该影响 body 布局的变化，顺着 `table.body` 传到所有 row。

### 4. `TableModel` 还缺少真正的 row / cell artifact

当前 [table.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/table.ts) 只提供：

- `grid`
- `view`
- `column`
- `summary`

这套模型太粗：

- 有 table body，但没有 table row
- 有 view/query 拼装，但没有 table cell
- React 只能继续绕回 `source.active` 和 `source.document`

这正是边界别扭的根因。

### 5. document source 没有 field value 粒度

当前 [createDocumentSource.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/createDocumentSource.ts) 只发布：

- `records`
- `fields`
- `views`

没有：

- `(recordId, fieldId) -> value`

所以哪怕 runtime 新建 `table.cell` store，如果内部仍然订阅整条 `record`，单个字段变化依然会让同一 record 下所有 cell 重新计算。

这说明 row/cell 重构如果不补 document value source，最终只能做到“把问题从 React 挪到 runtime”，做不到真正顺直。

## 长期最优原则

### 1. public model 要直接对齐 rendered artifact

table 渲染真正需要的是：

- body
- section
- row
- cell
- summary

而不是：

- `grid`
- `view`
- React 本地再 resolve 一次的 `columns`

### 2. runtime model 负责“可订阅渲染数据”

runtime model 的职责是：

- 把 active/document/source 拼成稳定的渲染 artifact
- 给 React 提供正确粒度的订阅点

runtime model 不该把“最后一层 row/cell 拼装工作”留给 React。

### 3. React table runtime 只保留 UI-only 状态

React table runtime 应只负责：

- selection / hover / fill / rail / marquee
- dom registry
- viewport / virtual window / measurement
- reveal / open editor / pointer interaction

它不该再承担 active body data 的拼装发布。

### 4. 缺失即 `undefined`，不要再额外传 `exists`

长期最优里：

- `row` 不存在就是 `undefined`
- `cell` 不存在就是 `undefined`

不再传：

- `exists`
- `recordId?`
- `value?`

这种“父层先猜一层，再把缺失状态往下塞”的 props。

## 最终边界

### 一. document source 最终形态

必须补一个 document field-value source，推荐直接叫 `values`：

```ts
export interface RecordValueRef {
  recordId: RecordId
  fieldId: FieldId
}

export interface DocumentSource {
  meta: store.ReadStore<DataDoc['meta']>
  records: EntitySource<RecordId, DataRecord>
  values: store.KeyedReadStore<RecordValueRef, unknown>
  fields: ListedEntitySource<FieldId, CustomField>
  views: ListedEntitySource<ViewId, View>
}
```

这个 source 的职责很明确：

- 只负责发布 document field value
- 不负责 active item / section / view 语义

实现原则：

- 不需要新 document delta 协议
- 仍然可以基于现有 `DocDelta.records.update`
- 当某条 record 更新时，在 runtime source 内部把它展开成这一条 record 下所有 field key 的 patch
- 依靠 keyed store equality，只有真正变化的 field value 才通知对应 cell subscriber

也就是说，这一层是“简单展开”，不是新一套复杂增量系统。

### 二. `TableModel` 最终形态

当前 `grid / view / column / summary` 不是最终形态。长期最优应直接改成：

```ts
export interface TableColumn {
  field: Field
  width: number
  grouped: boolean
  sortDir?: SortDirection
  calc?: CalculationMetric
}

export interface TableBody {
  viewId: ViewId
  columns: readonly TableColumn[]
  rowCount: number
  grouped: boolean
  wrap: boolean
  showVerticalLines: boolean
}

export interface TableRow {
  itemId: ItemId
  recordId: RecordId
  sectionId: SectionId
}

export interface TableCell {
  itemId: ItemId
  recordId: RecordId
  viewId: ViewId
  field: Field
  value: unknown
}

export interface TableModel {
  body: store.ReadStore<TableBody | null>
  sectionIds: store.ReadStore<readonly SectionId[]>
  section: store.KeyedReadStore<SectionId, Section | undefined>
  row: store.KeyedReadStore<ItemId, TableRow | undefined>
  cell: store.KeyedReadStore<CellRef, TableCell | undefined>
  summary: store.KeyedReadStore<SectionId, CalculationCollection | undefined>
}
```

这套 API 的关键点：

- `body` 只描述 table 自身的静态渲染骨架
- `columns` 直接是可渲染 column artifact，不再拆成 `view.displayFieldIds + widths + column`
- `row` 是 item 级 artifact
- `cell` 是最终 render 单元
- `sectionIds + section` 取代 `grid.sections`
- `summary` 继续独立保留

明确删除：

- `TableGrid`
- `TableViewState`
- `TableColumnState`
- `TableQueryState`
- `grid`
- `view`
- `column`

这些名字不是 rendered artifact 语言，继续保留只会让 React 继续自己拼。

### 三. React table ui runtime 最终形态

`dataview-react` 里的 table ui runtime 只保留 UI-only 部分：

- `locked`
- `valueEditorOpen`
- `selection`
- `select`
- `fill`
- `rail`
- `can`
- `chrome`
- `layout`
- `virtual`
- `nodes`
- `dom`
- `rowHit`
- `interaction`
- `hover`
- `focus`
- `openCell`
- `revealCursor`
- `revealRow`

明确删除：

- `body: store.ReadStore<TableBodyRenderState | null>`
- `TableBodyRenderState`
- `sameBodyRenderState`
- `resolveDisplayedColumns`

原因很简单：

- body 是 runtime model 的职责
- viewport/window/measurement 是 ui runtime 的职责
- 这两类状态不应被打包成一个 mega-store

### 四. `openCell` 最终不再依赖 `engine.active.read.cell`

当前 `openCell.resolveCell` 仍然走 `engine.active.read.cell(...)`。

长期最优不应该这样。

`openCell` 真正需要的只是：

- `itemId -> recordId`
- `fieldId`

所以最终改成：

- 通过 `table.row(itemId)` 取 `recordId`
- 直接组合出 editor 需要的 `{ recordId, fieldId }`

这说明：

- `engine.active.read.cell` 可以继续作为 imperative read API 保留
- 但它不再属于 React table render / editor open 链路

## React 渲染最终形态

### 1. `Body` 只订阅顶层需要的几个 store

`Body` 最终只负责拼装顶层 render 输入：

- `runtime.model.table.body`
- `runtime.model.table.sectionIds` / `section`
- `table.virtual.window`
- `table.virtual.layout`
- `table.virtual.measurement.plan`
- `table.virtual.viewport`
- `table.virtual.interaction`

也就是说：

- `Body` 可以在顶层组合这些 store
- 但不能再把它们重新打成一个 `table.body` 再向下广播

### 2. `Row` 只订阅 row + row chrome + table body

`Row` 最终应该只读：

- `model.table.row(itemId)`
- `model.table.body`
- `table.chrome.row(itemId)`

它不再读：

- `source.active.items.read.record`
- `source.document.records`
- 虚拟窗口状态

`Row` 的职责收缩成：

- 负责行壳子
- 负责 rail / drag / selection 交互
- 负责把 `body.columns` 映射成 `CellRef[]`

不再负责算每个 cell 的值。

### 3. `Cell` 只订阅 cell + cell chrome + body 样式选项

`Cell` 最终应该只读：

- `model.table.cell(cellRef)`
- `table.chrome.cell(cellRef)`
- `model.table.body`

`Cell` 不再接收：

- `recordId`
- `field`
- `value`
- `exists`
- `viewId`

这些都应该来自自己的 store。

最优组件形态应拆成两层：

- `CellSlot`
  - 只读 `model.table.cell(cellRef)`
  - 如果没有值，直接 `return null`
- `PresentCell`
  - 只在 cell 存在时挂载
  - 再读 `chrome`
  - 渲染真实内容

这样可以自然避免“空 cell 也先订阅 chrome 再 return null”。

### 4. `ColumnHeader` 不再自己拼 `column + activeView`

长期最优里：

- `ColumnHeader` 直接吃 `TableColumn`
- 不再额外订阅 `model.table.column`
- 不再额外订阅 `model.table.view`

header 需要的 render 信息都已经在 `TableColumn` 里：

- `field`
- `width`
- `grouped`
- `sortDir`
- `calc`

命令行为如果需要更多上下文，直接走 engine imperative API 即可，不需要把整包 `view.query.sort.rules` 继续挂进 render 订阅。

## 需要补的底层设施

### 1. document value runtime

新增一套简单的 source runtime：

- 输入：`DocDelta.records`
- 输出：`DocumentSource.values`

要求：

- reset 时一次性铺满全部 `(recordId, fieldId) -> value`
- apply 时只处理 `delta.records.update/remove`
- remove record 时删除这条 record 下全部 field value key

这套设施是整个重构里唯一必须新增的底层基础设施。

### 2. row / cell keyed model

`TableModel` 里新增：

- `row(itemId)`
- `cell(cellRef)`

其依赖关系应是：

- `row(itemId)`
  - 读 `active.items.read.placement`
- `cell(cellRef)`
  - 读 `table.body`
  - 读 `row(itemId)`
  - 读 `document.values({ recordId, fieldId })`
  - 读 `active.fields.all(fieldId)`

这样一来：

- item placement 变化，只影响对应 row/cell
- field value 变化，只影响对应 cell
- column display / wrap / lines 变化，只影响依赖 body 的渲染层

### 3. `CellRef` / `RecordValueRef` key helper 的归位

当前 `tableCellKey` 仍放在 React table runtime 目录下，这不是长期最优。

长期最优里应当：

- `CellRef` key helper 放到 runtime / shared 的中性位置
- `RecordValueRef` 也有同样的 key helper

原因：

- 这已经不是 React 专属工具
- model / source / ui runtime 都会复用

这一步不是性能优化，而是边界归位。

## 需要删除或整体替换的旧实现

### 一. runtime model

需要整体删除或替换：

- [table.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/table.ts) 里的：
  - `TableGrid`
  - `TableQueryState`
  - `TableViewState`
  - `TableColumnState`
  - `grid`
  - `view`
  - `column`

原因：

- 这些类型都是“中间拼装态”
- 不是最终 render artifact
- 它们逼着 React 再自己做一轮拼装

### 二. React table ui runtime

需要删除：

- [uiRuntime.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/uiRuntime.ts) 里的 `body`
- `TableBodyRenderState`
- `sameBodyRenderState`
- `resolveDisplayedColumns`

### 三. React table render 组件里的直接 source 读取

需要移除：

- [Row.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/row/Row.tsx) 里对：
  - `source.active.items.read.record`
  - `source.document.records`
  - `fieldApi.value.read(record, field.id)`
- [Cell.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/cell/Cell.tsx) 里父层传入的：
  - `recordId`
  - `field`
  - `value`
  - `exists`
  - `viewId`
- [Body.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/body/Body.tsx) 和
  [usePointer.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/hooks/usePointer.ts)
  里对 `source.document.records` 的直接存在性读取

### 四. `openCell` 解析路径

需要移除：

- `uiRuntime` 内部通过 `engine.active.read.cell(...)` 解析 editor target 的实现

## 最终实施顺序

### 阶段 1. 补 document value source

改动范围：

- `dataview/packages/dataview-runtime/src/source/contracts.ts`
- `dataview/packages/dataview-runtime/src/source/createDocumentSource.ts`
- 可能补一个新的 value source runtime 文件

产物：

- `source.document.values`

完成标准：

- 不改 React table 也能单独验证 value source 是否正确 patch / reset

### 阶段 2. 重写 `TableModel`

改动范围：

- `dataview/packages/dataview-runtime/src/model/table.ts`
- `dataview/packages/dataview-runtime/src/model/index.ts`
- `dataview/packages/dataview-runtime/src/model/types.ts`
- 所有使用 `grid/view/column` 的 runtime / react 调用方

产物：

- 新 `TableModel`
- 删除旧 `grid/view/column`

完成标准：

- table runtime 不再需要“字段列表 + view 配置 + column 状态”三份数据拼装才能渲染

### 阶段 3. 删除 `uiRuntime.body`

改动范围：

- `dataview/packages/dataview-react/src/views/table/uiRuntime.ts`
- `Body.tsx`
- `BlockContent.tsx`

产物：

- ui runtime 只保留 UI-only 状态
- `Body` 直接组合 runtime body 与 virtual state

完成标准：

- `Row` 不再因为虚拟窗口 / measurement / marquee 变化而被 `table.body` 扇出影响

### 阶段 4. 改写 `Row` / `Cell`

改动范围：

- `Row.tsx`
- `Cell.tsx`
- 相关 `ColumnHeader` / `SectionHeader` / `CreateRecordBlock`
- `usePointer.ts`
- `Body.tsx`
- `openCell.ts`

产物：

- `Row` 不再读取 record
- `Cell` 自己读取 cell model
- `Cell` 缺失时直接不挂载内容组件

完成标准：

- 单 cell value 变化时，不再引发整 row 的 value fanout 重算

### 阶段 5. 清理类型与 helper

改动范围：

- 删除旧 table model 类型
- 调整 key helper 的归属位置
- 清理所有只为旧模型服务的比较函数和临时 props

完成标准：

- 仓库中不再残留 `grid/view/column` 这套旧 table render 语言
- `TableBodyRenderState` 彻底消失
- React table render 路径不再直接读 document/source 去拼 row/cell

## 明确不做的事

- 不做 row 级缓存图
- 不做 cell value 本地 memo registry
- 不做“先保留旧 `grid/view/column`，再外面包一层 `row/cell`”的兼容模式
- 不做新的复杂 diff 协议
- 不做把 `engine.active.read.cell` 包成订阅式 adapter 的折中方案

这些做法都会把复杂度继续堆在中间层，不是长期最优。

## 结论

这条链真正的问题不是 `Cell` compare 函数不够强，也不是 `Row` 少了一个 `memo`。

真正的问题是：

- runtime 没有发布 row / cell artifact
- document source 没有 value 粒度
- React table runtime 还在发布一个混合了 body / virtual / interaction 的 mega-store

长期最优方案只有一条：

- 补 `document.values`
- 把 `TableModel` 改成 `body / section / row / cell / summary`
- 删除 `uiRuntime.body`
- 让 React 只消费 runtime model 和 UI-only runtime

这样整条链才会顺。

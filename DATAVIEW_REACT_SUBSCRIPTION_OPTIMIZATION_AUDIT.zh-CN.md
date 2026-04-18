# DataView React 订阅与重渲染优化审计

## 目标

这份文档只讨论 `dataview/packages/dataview-react` 当前还能继续优化的订阅与渲染模式，重点是两类问题：

- `useStoreSelector(...)` 订阅大 store，虽然未必导致所有组件都 commit rerender，但会导致所有订阅者的 selector 在 store 变化时都执行一遍。
- `useStoreValue(...)` / `useDataViewValue(...)` 直接订阅宽对象或宽 context，导致热路径上的根组件、重复子项或整棵子树被动重渲染。

本文不写代码实现，只给出长期最优、简单清晰的收敛方向。

## 先给结论

当前最值得继续优化的不是再去做零散的 `memo`，而是继续把“宽 store + 子项 selector”的模式改成“预投影 / keyed store / coarse-grained root + fine-grained leaf”。

优先级建议：

1. `table rowRail` 和类似的“单值 store + N 个 Row/Card 布尔 selector”。
2. `ColumnHeader` 对 `currentView` 的重复扫描。
3. `gallery/kanban` 的宽 context，把整棵卡片树绑在 `active/extra/runtime` 上。
4. `section/footer` 这种重复块组件对 `table.currentView` 的宽订阅。
5. page 侧 query / document 的重复投影与重复派生。
6. 少量单组件但高频更新的多次 selector 订阅，例如 `BlockContent`。

## 判定标准

### 什么叫“真的有问题”

- 一个列表里有很多重复子项，每个子项都订阅同一个 store，即使最终只有极少数子项 commit rerender，所有 selector 也会在每次 store 更新时重跑。
- 一个 context value 很宽，任意一个字段变化都会让所有消费该 context 的后代重新 render。
- 一个 selector 内部还在做 `.find()` / `.includes()` / `.map()` / `new Map()` 之类的派生，这意味着不仅是“重跑次数多”，单次重跑成本也在扩大。

### 什么暂时不用动

- 只有单个实例的 host 组件，即使订阅比较宽，也通常不是瓶颈。
- 真正需要整块刷新的一层 root 组件，可以接受 coarse-grained 订阅，但应避免把这个宽状态继续传到叶子节点。

## 底层语义确认

`useStoreSelector` 当前实现本质上是：

- 订阅原始 store。
- 每次 store 触发时调用 selector 重新读 snapshot。
- 用 `isEqual` 决定这次是否复用缓存值。

也就是说，它没有“按 key 精确订阅”的能力。  
因此下面这种模式：

```ts
useStoreSelector(table.rowRail, rowId => rowId === props.itemId)
```

虽然不是“所有 Row 都一定 commit rerender”，但一定是“每次 `table.rowRail` 更新时，所有 Row 的 selector 都执行一次”。

这个差异必须明确：

- 坏味道一：selector 全量重跑。
- 更坏味道：组件全量 rerender。

前者已经足够在 10k/50k 级别变成热点。

## 高优先级问题

### 1. `table.rowRail` 是典型的坏模式

涉及文件：

- `dataview/packages/dataview-react/src/views/table/components/row/Row.tsx`

当前模式：

```ts
const exposed = useStoreSelector(
  table.rowRail,
  rowId => rowId === props.itemId
)
```

问题：

- `table.rowRail` 是一个 `ItemId | null` 的单值 store。
- 每个 Row 都在基于它算自己的 `exposed`。
- 只要鼠标移过不同 row，或 rail 显隐切换，所有已挂载 Row 的 selector 都会执行。

这类模式在列表组件里最该避免，因为它是 `1 个 store 更新 -> N 个叶子 selector 执行`。

长期最优设计：

- 不再把 `rowRail` 暴露为单值 store 让每个 Row 自己判断。
- 直接提供 `rowRail.exposedById: KeyedReadStore<ItemId, boolean>`。
- 如果语义上其实只有一个 exposed row，也可以内部仍存单值，但 React 消费层只能看到 keyed membership。

建议 API 方向：

```ts
interface TableRowRailRuntime {
  activeId: ReadStore<ItemId | null>
  exposedById: KeyedReadStore<ItemId, boolean>
  set: (rowId: ItemId | null) => void
}
```

这样可以保留底层简单状态，同时给 React 层提供精确订阅。

### 2. `useCardEditingState` 也是同类问题

涉及文件：

- `dataview/packages/dataview-react/src/views/shared/useCardTitleEditing.ts`

当前模式：

```ts
useDataViewValue(
  dataView => dataView.inlineSession.store,
  target => (
    target?.viewId === input.viewId
      && target.itemId === input.itemId
  )
)
```

问题：

- gallery / kanban 每张卡片都会跑这个 selector。
- inline editing target 变化时，所有卡片都会重新算一遍“是不是我在编辑”。
- 这是和 `rowRail` 完全同构的问题。

长期最优设计：

- `inlineSession` 直接提供 keyed membership。
- key 建议是组合 key：`viewId + itemId`。

建议 API 方向：

```ts
interface InlineSessionRuntime {
  target: ReadStore<InlineTarget | null>
  editingByTarget: KeyedReadStore<string, boolean>
}
```

配套提供：

```ts
const inlineTargetKey = (viewId: ViewId, itemId: ItemId) => `${viewId}\u0000${itemId}`
```

这样 `RecordCard` 的编辑态会退化成真正的点状订阅。

### 3. `ColumnHeader` 对 `currentView` 的重复扫描

涉及文件：

- `dataview/packages/dataview-react/src/views/table/components/column/ColumnHeader.tsx`

当前模式：

```ts
const headerState = useStoreSelector(
  table.currentView,
  currentView => ({
    grouped: ...,
    sortDirection: currentView.query.sort.rules.find(...),
    calculationMetric: currentView.view.calc[props.field.id]
  }),
  sameHeaderState
)
```

问题：

- 每个列头都订阅同一个 `table.currentView`。
- 每次 `currentView` 改变时，所有列头 selector 重跑。
- selector 里还做了 `sort.rules.find(...)`，即每列一次线性扫描。
- 总复杂度接近 `列数 * sort 规则数 * currentView 变更次数`。

这在 filter/sort/group/字段配置变化时会被持续放大。

长期最优设计：

- 在 controller 层先把 header 元数据投影好。
- React 叶子层只按 `fieldId` 取结果。

建议 API 方向：

```ts
interface TableHeaderState {
  grouped: boolean
  sortDirection?: 'asc' | 'desc'
  calculationMetric?: CalculationMetric
}

interface TableHeaderRuntime {
  byFieldId: KeyedReadStore<FieldId, TableHeaderState>
}
```

内部投影时只做一次：

- `groupedFieldId`
- `sortDirectionByFieldId`
- `calculationMetricByFieldId`

然后每个 `ColumnHeader` 只取 `byFieldId(field.id)`。

### 4. `gallery/kanban` 的宽 context 仍然过宽

涉及文件：

- `dataview/packages/dataview-react/src/views/gallery/context.tsx`
- `dataview/packages/dataview-react/src/views/kanban/context.tsx`
- `dataview/packages/dataview-react/src/views/gallery/components/Card.tsx`
- `dataview/packages/dataview-react/src/views/kanban/components/Card.tsx`
- `dataview/packages/dataview-react/src/views/gallery/components/Grid.tsx`
- `dataview/packages/dataview-react/src/views/kanban/components/Column.tsx`
- `dataview/packages/dataview-react/src/views/kanban/components/ColumnBody.tsx`

当前模式：

- provider 的 context value 是 `{ active, extra, runtime }`。
- `Card / Column / Grid / ColumnBody / KanbanCanvas` 都直接消费这个宽 context。

问题：

- 任何 `active` 或 `extra` 的引用变化，都会让所有消费该 context 的后代 render。
- `RecordCard` 本来已经把 record / selection / marquee membership 收窄成 keyed store 了，但外面那层 `Card` 包装组件还是会因为 context 变化被全部拉起来。
- 这会抵消一部分之前做过的细粒度优化。

长期最优设计：

- 不再把 `active + extra + runtime` 整包塞进一个 context。
- context 只保留真正稳定、跨层共享、且不值得 props drilling 的 runtime ref / API。
- 视图配置和卡片展示配置改成更窄的 projection 或直接从父组件传 props。

建议拆分方向：

```ts
interface GalleryRuntimeContextValue {
  runtime: GalleryViewRuntime
}

interface GalleryViewConfig {
  viewId: ViewId
  fields: readonly CustomField[]
  card: {
    size: CardSize
    layout: CardLayout
    wrap: boolean
  }
  canDrag: boolean
}
```

推荐规则：

- root 消费宽状态。
- row/card/column 只消费稳定 runtime 和自己的窄 props。
- 叶子不要直接依赖整个 `active` 或整个 `extra`。

这是 gallery / kanban 下一阶段最该做的结构性收敛。

### 5. `SectionHeader` / `ColumnFooterBlock` 还在订阅整个 `table.currentView`

涉及文件：

- `dataview/packages/dataview-react/src/views/table/components/body/SectionHeader.tsx`
- `dataview/packages/dataview-react/src/views/table/components/body/ColumnFooterBlock.tsx`

问题一：`SectionHeader`

- `SectionHeader` 里读了 `const currentView = useStoreValue(table.currentView)`。
- 实际 render 中并没有真正使用这个订阅结果。
- 这是纯冗余订阅，应该直接移除。

问题二：`ColumnFooterBlock`

- `ColumnFooterBlock` 为了 `currentView.summaries.get(scopeId)` 订阅了整个 `table.currentView`。
- 一个表如果 section 多，footer block 就多。
- 任何 `currentView` 变化都会把所有 footer block 拉起来。

长期最优设计：

- `SectionHeader` 直接删掉无用订阅。
- `ColumnFooterBlock` 改成按 scope 精确订阅。

建议 API 方向：

```ts
interface TableSummaryRuntime {
  byScopeId: KeyedReadStore<string, ReadonlyMap<FieldId, SummaryResult> | undefined>
}
```

这样 footer block 只因为自己 scope 的 summary 变化而更新。

## 中优先级问题

### 6. `Row.tsx` 里 `canRowDrag` 仍然是 N 行共享一个对象 store

涉及文件：

- `dataview/packages/dataview-react/src/views/table/components/row/Row.tsx`
- `dataview/packages/dataview-react/src/views/table/capabilities.ts`

当前模式：

```ts
const canRowDrag = useStoreSelector(
  table.capabilities,
  capabilities => capabilities.canRowDrag
)
```

问题：

- 和 `rowRail` 一样，所有 Row 都在订阅同一个 capability store。
- 虽然 `capabilities` 变化频率远低于 `rowRail`，但模式本身仍不理想。

长期最优设计：

- `table.capabilities` 不应该只暴露对象 store。
- 常用布尔位直接暴露为单独 projection store。

建议 API 方向：

```ts
interface TableCapabilitiesRuntime {
  state: ReadStore<Capabilities>
  canHover: ReadStore<boolean>
  canRowDrag: ReadStore<boolean>
  canColumnResize: ReadStore<boolean>
  showFillHandle: ReadStore<boolean>
}
```

这样 Row 不再为了解一个布尔值去订阅整个 capability 对象。

### 7. `BlockContent` 对同一个 hot store 有多次 selector 订阅

涉及文件：

- `dataview/packages/dataview-react/src/views/table/components/body/BlockContent.tsx`

当前模式：

```ts
const totalHeight = useStoreSelector(table.virtual.window, snapshot => snapshot.totalHeight)
const startTop = useStoreSelector(table.virtual.window, snapshot => snapshot.startTop)
const blocks = useStoreSelector(table.virtual.window, snapshot => snapshot.items, sameBlocks)
const containerWidth = useStoreSelector(table.virtual.viewport, snapshot => snapshot.containerWidth)
```

问题：

- `table.virtual.window` 是滚动热路径。
- 这里针对同一个 store 建了 3 次订阅，意味着同一次更新会重复执行多次 snapshot 读取和 selector。
- 单次成本不大，但它正好在高频路径上。

长期最优设计：

- 合并成一个更窄但完整的 render projection。

建议 API 方向：

```ts
interface TableRenderWindowProjection {
  totalHeight: number
  startTop: number
  blocks: readonly RenderBlock[]
}
```

然后：

- `BlockContent` 只订阅一次 `table.virtual.renderWindow`。
- `viewport.containerWidth` 仍保留单独 store 即可。

### 8. 表格 root 层几个 hook 仍然在读整个 `currentView`

涉及文件：

- `dataview/packages/dataview-react/src/views/table/hooks/useRowReorder.tsx`
- `dataview/packages/dataview-react/src/views/table/hooks/useColumnResize.ts`
- `dataview/packages/dataview-react/src/views/table/hooks/useColumnReorder.ts`
- `dataview/packages/dataview-react/src/views/table/hooks/usePointer.ts`
- `dataview/packages/dataview-react/src/views/table/components/body/Body.tsx`

问题：

- 这些 hook 都挂在 `Body` 这一个 root 上，不是 N 倍叶子问题，所以优先级低于前面几项。
- 但它们读的是整个 `currentView`，导致只要 active view state 任何相关部分变动，`Body` 和整套 hook 逻辑就会重跑。

这里不建议过度碎片化，但建议做两件事：

- 把事件处理真正需要的值，尽量在回调内 `get()`，而不是 render 阶段全部订阅。
- 对明显独立的结构继续做 projection，比如 `table.columns`、`table.items`、`table.sections`、`table.options.wrap`。

### 9. page 侧 document / query projection 重复而分散

涉及文件：

- `dataview/packages/dataview-react/src/page/Toolbar.tsx`
- `dataview/packages/dataview-react/src/page/features/viewQuery/ViewQueryBar.tsx`
- `dataview/packages/dataview-react/src/page/features/sort/SortPopover.tsx`
- `dataview/packages/dataview-react/src/page/features/viewSettings/panels/RootPanel.tsx`
- `dataview/packages/dataview-react/src/page/features/viewSettings/panels/QueryFieldPickerPanel.tsx`
- `dataview/packages/dataview-react/src/page/features/viewSettings/panels/ViewFieldsPanel.tsx`
- `dataview/packages/dataview-react/src/page/features/viewSettings/panels/LayoutPanel.tsx`
- 以及其他 view settings 面板

常见模式：

- 订阅整个 `document`，然后每次 render 做 `getDocumentFields(document)` / `getDocumentViews(document)`。
- 同时再订阅 `engine.active.config`、`engine.active.state.query.filters`、`sort`、`group`。
- 多个面板各自重复算 `availableFilterFields` / `availableSorterFields` / `fieldMap` / summary label。

问题：

- 大多是冷路径，不会像 table row 一样立即炸。
- 但逻辑重复多，派生分散，状态边界不清晰。
- query bar、toolbar、view settings 在 filter/sort/group 编辑时会有一串重复计算。

长期最优设计：

- page feature 层不要到处临时 `useDataViewValue(...)` 再现场派生。
- 收敛成 feature projection store。

建议 API 方向：

```ts
interface ToolbarProjection {
  views: readonly View[]
  currentView?: View
  queryBar: QueryBarState
  searchQuery: string
  filterRules: readonly FilterRuleEntry[]
  sortRules: readonly SortRuleEntry[]
  availableFilterFields: readonly Field[]
  availableSorterFields: readonly Field[]
}

interface ViewSettingsProjection {
  fields: readonly Field[]
  viewsCount: number
  currentView?: View
  filterProjection: ...
  sortProjection: ...
  groupProjection: ...
}
```

重点不是“再建很多 hook”，而是：

- 每个 feature 一份 projection。
- 统一在 projection 层派生。
- 组件只消费 projection 结果。

## 低优先级问题

### 10. `FieldValueEditorHost` 订阅整个 document

涉及文件：

- `dataview/packages/dataview-react/src/page/hosts/FieldValueEditorHost.tsx`

问题：

- 编辑器 host 打开时会订阅整个 document，然后按 `field.recordId / field.fieldId` 找 record 和 field。
- 这会让 editor host 在任意 document 改动时都刷新。

为什么优先级低：

- 只有一个实例。
- 打开编辑器时本来就处于交互态。
- 真正瓶颈通常不在这里。

更理想的方向：

- value editor session 里直接保存已解析的 `recordId / fieldId / field kind meta`，或提供更窄的 selector store。

### 11. `PageTitle` 订阅整个 document

涉及文件：

- `dataview/packages/dataview-react/src/page/PageTitle.tsx`

问题：

- 这里用的是 perf preset 页面语义，订阅 document 后会展示 record/field/view 数量。
- 不是常规产品热路径。

建议：

- 不作为优先优化对象。

## 已经做得对的模式

这些模式应该继续复用，不要回退：

- `useKeyedStoreValue(dataView.selection.store.membership, itemId)`
- `useKeyedStoreValue(dataView.session.marquee.preview.membership, itemId)`
- `useKeyedStoreValue(table.rowRender, itemId)`
- `useKeyedStoreValue(dataView.selection.store.scopeSummary, scope)`
- `createKeyedDerivedStore(...)` / `createProjectedStore(...)`

这些模式的共同点：

- root 做粗投影。
- leaf 做 keyed read。
- 不让 N 个叶子对同一个宽 store 各自写 selector。

## 建议的统一规则

以后在 `dataview-react` 里可以强制遵守这几条：

### 规则 1

重复子项组件里，禁止直接写这类模式：

```ts
useStoreSelector(bigStore, state => state.id === props.id)
useStoreSelector(bigStore, state => state.someMap[props.id] ?? false)
useDataViewValue(storeResolver, state => state?.itemId === props.itemId)
```

应改为：

- `KeyedReadStore`
- 或 controller/runtime 先做 projection，再让叶子按 key 读取。

### 规则 2

selector 内禁止做线性扫描作为常态路径：

- `.find(...)`
- `.filter(...).length`
- `.includes(...)`
- `new Map(...)`

这些都应该提升到 projection 层，先预计算。

### 规则 3

context 不应承载整个 active view state 给大量叶子消费。

context 只放：

- 稳定 runtime API
- 稳定 ref
- 少量真正跨层共享的 coarse-grained 状态

其余都应该：

- 父组件 props 下传
- 或 leaf 走 keyed store

### 规则 4

单组件如果处于高频更新路径，优先减少对同一个 store 的多重订阅。

例如：

- virtual window
- drag session
- marquee session

应优先合并成单次 projection。

## 推荐的执行顺序

### 第一阶段

- `Row.tsx` 的 `table.rowRail` 改为 keyed membership。
- `useCardEditingState` 改为 keyed membership。
- `ColumnHeader` 改为 `headerMeta.byFieldId`。
- 删除 `SectionHeader` 的无用 `currentView` 订阅。
- `ColumnFooterBlock` 改为 `summaryByScopeId`。

这一阶段收益最大，风险最低。

### 第二阶段

- 拆 `gallery/kanban` 宽 context。
- 把 `Card / Column / ColumnBody / Grid` 从“直接吃大 context”改为“root 吃大状态，leaf 吃窄 props + runtime”。

这一阶段收益是减少卡片视图的整树被动 render。

### 第三阶段

- page feature 层统一 projection。
- 合并 `BlockContent` 等高频单组件的重复订阅。
- 再看 table body 级别 hook 是否需要继续收窄 `currentView`。

## 最终判断

如果只选最该做的几个点，结论很明确：

- `Row.tsx` 的 `table.rowRail` 是最典型、最应该消灭的坏例子。
- `useCardEditingState` 是 card 视图里完全同构的问题，也应该一起收掉。
- `ColumnHeader` 现在是“每列订阅同一个宽 store，再各自扫 query 配置”，这是第二个明确的结构性热点。
- `gallery/kanban` 目前最大的潜在浪费不是 leaf 内部逻辑，而是宽 context 把整棵树绑死。

也就是说，下一轮优化不应再围绕零碎 `memo` 打补丁，而应继续沿着已经验证过的方向推进：

- 宽状态只在 root 消费。
- 叶子一律 keyed / projected。
- feature 自己有 projection，组件不临时现算。


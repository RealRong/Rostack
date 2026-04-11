# Dataview Active View Typed Ready State 下沉方案

## 1. 目标

这份文档解决一个明确问题：

- `kanban / gallery / table` 视图里，大量“active state -> currentView -> 再派生 fields / group / sort / map / lookup”的工作，不应该继续在 React hook 里完成。

长期最优应该是：

- React 只负责 UI 会话态与交互编排。
- engine 负责把 active view 的领域读模型提前准备好。
- `kanban / gallery / table` 各自拿到已经 ready 的 typed state 与 typed read API。

本文只描述最终结构，不考虑兼容层与过渡层。


## 2. 结论摘要

结论很明确：

- 这些派生应该下沉到 engine。
- 但不能把所有东西都硬塞进一个越来越肥的 `ActiveViewState`。
- 正确做法不是继续扩张通用 `engine.active.state`，而是在它之上建立按 view type 分化的 ready state。

最终建议结构：

```ts
engine.active.state
engine.active.read
engine.active.select(...)

engine.active.table.state
engine.active.table.read

engine.active.gallery.state
engine.active.gallery.read

engine.active.kanban.state
engine.active.kanban.read
```

其中：

- `engine.active.state` 保持通用 active projection。
- `engine.active.table/gallery/kanban.state` 提供已经准备好的 typed ready state。
- `engine.active.table/gallery/kanban.read` 提供该视图类型常用 lookup API。

React 不应再负责：

- 识别 active view 是否为某种类型
- 把 `ActiveViewState` 收窄成 `currentView`
- 从 sections / appearances / fields 自己构造 lookup map
- 从 group / sort / options 推出 `canReorder` 之类领域判断

React 仍然负责：

- dragging
- marquee 适配
- selection 的页面级编排
- “show more” 这类纯 UI 展示策略
- 容器尺寸、虚拟列表、拖拽命中、滚动联动


## 3. 为什么这部分不该留在 React

当前 `kanban / gallery / table` controller 里，React 在做三类事：

1. 从 `engine.active.state` 判断当前是不是目标 view type。
2. 把通用 active state 收窄成该视图的 ready state。
3. 基于 ready state 再派生 lookup 和行为判断。

第 1、2、3 类都属于 engine 领域读模型，而不是 UI 逻辑。

这些逻辑留在 React 会带来几个问题：

- 同样的 ready 判定会在多个 hook 里重复。
- 同样的 lookup 会在多个 hook 里重复 `useMemo(new Map(...))`。
- React 层被迫知道太多 projection 细节。
- controller 变成“先建领域状态，再接交互逻辑”的混合体，文件越来越绕。
- 同一份派生逻辑未来会在 `toolbar / panel / body / runtime` 多处扩散。

更关键的是，这些东西不是“组件局部策略”，而是“active view 的稳定读模型”。

所以它们应该由 engine 提前准备，而不是由 React 临时拼装。


## 4. 哪些应该下沉，哪些不应该

## 4.1 应该下沉到 engine 的部分

以下内容都属于领域读模型：

- active view 是否是 `table / gallery / kanban`
- `appearances / sections / fields / calculations` 是否 ready
- `group / sort / filter / search`
- `groupField`
- `customFields`
- `cardsPerColumn`
- `fillColumnColor`
- `showFieldLabels`
- `cardSize`
- `canReorder`
- `appearanceId -> sectionKey`
- `sectionKey -> color`
- `appearanceId -> recordId -> record`
- `visible field ids`
- `fieldId -> visible column index`
- `sectionKey -> recordIds`

这些都只依赖：

- document
- active view
- active projection
- view options

所以应由 engine 统一生产。

## 4.2 不应该下沉到 engine 的部分

以下内容仍然应该留在 React 或 page runtime：

- `dragging`
- `hover`
- marquee adapter
- DnD session
- 容器 DOM / scroll / layout cache
- 虚拟滚动窗口
- `expandedCountBySectionKey`
- `showMore / hiddenCount / readVisibleIds`

这些不是 document 领域状态，而是纯 UI 会话态或展示态。

除非未来明确要把它们持久化为 view option，否则不应该进入 engine。


## 5. 不要继续扩张通用 `ActiveViewState`

不能把 `kanban / gallery / table` 的派生继续直接塞进 `ActiveViewState`。

这样会出现几个明显问题：

- `ActiveViewState` 会变成一个巨大的杂糅对象。
- 类型会充满 `table? / gallery? / kanban?` 之类分支。
- React 还是要继续判断当前 active view 是什么类型。
- 最终只是把复杂度从 React 平移到一个更肥的通用对象里。

所以长期最优不是：

- 给 `ActiveViewState` 一直加字段

而是：

- 保持 `ActiveViewState` 只承载通用 active projection
- 再为具体 view type 建立 typed ready state


## 6. 最终类型结构

## 6.1 通用 active 层

```ts
interface ActiveEngineApi extends ViewEngineApi {
  id: ReadStore<ViewId | undefined>
  view: ReadStore<View | undefined>
  state: ReadStore<ActiveViewState | undefined>
  select: ActiveSelectApi
  read: ActiveViewReadApi

  table: ActiveTableApi
  gallery: ActiveGalleryApi
  kanban: ActiveKanbanApi
}
```

注意：

- `table / gallery / kanban` 不是顶层 `engine.table`，而是 `engine.active.table`。
- 因为这些 typed ready state 都是 active view 的 typed projection，而不是 view collection service。


## 6.2 typed ready state

建议引入统一命名：

- `ActiveTableState`
- `ActiveGalleryState`
- `ActiveKanbanState`

它们的共同原则：

- 如果当前 active view 不是该类型，返回 `undefined`
- 如果当前 active view 是该类型，则返回 ready state，不再混入 `appearances? / sections? / fields?` 这种半可选结构

例如：

```ts
interface ActiveKanbanState {
  view: View & { type: 'kanban' }
  filter: ViewFilterProjection | undefined
  group: ViewGroupProjection | undefined
  search: ViewSearchProjection | undefined
  sort: ViewSortProjection | undefined
  records: RecordSet | undefined
  sections: readonly Section[]
  appearances: AppearanceList
  fields: FieldList
  calculations: ReadonlyMap<SectionKey, CalculationCollection> | undefined

  groupField: Field | undefined
  customFields: readonly CustomField[]
  cardsPerColumn: KanbanCardsPerColumn
  fillColumnColor: boolean
  canReorder: boolean
}
```

`ActiveGalleryState` 与 `ActiveTableState` 同理。

关键点：

- typed ready state 不是原始 state 的原封不动暴露
- 它是已经为该视图类型准备好的最终读模型


## 7. typed read API 设计

除了 `state` 之外，还应该提供该类型自己的 `read`。

原因：

- 有些 lookup 值适合按需读取，不适合塞进 state
- React 不该自己建立 `Map`
- 这些读能力本身很稳定，应该是 engine 的同步只读 API

建议设计：

```ts
interface ActiveKanbanReadApi {
  getRecord: (appearanceId: AppearanceId) => Row | undefined
  getSectionKey: (appearanceId: AppearanceId) => SectionKey | undefined
  getSectionColor: (sectionKey: SectionKey) => string | undefined
  getAppearanceColor: (appearanceId: AppearanceId) => string | undefined
}

interface ActiveGalleryReadApi {
  getSectionColor: (sectionKey: string) => string | undefined
  getSectionKey: (appearanceId: AppearanceId) => string | undefined
}

interface ActiveTableReadApi {
  getVisibleFieldIndex: (fieldId: FieldId) => number
  getColumnField: (fieldId: FieldId) => Field | undefined
}
```

再往上组合成：

```ts
interface ActiveKanbanApi {
  state: ReadStore<ActiveKanbanState | undefined>
  read: ActiveKanbanReadApi
}

interface ActiveGalleryApi {
  state: ReadStore<ActiveGalleryState | undefined>
  read: ActiveGalleryReadApi
}

interface ActiveTableApi {
  state: ReadStore<ActiveTableState | undefined>
  read: ActiveTableReadApi
}
```


## 8. ready 的判定规则

typed ready state 的核心不是“类型名不同”，而是“ready 语义明确”。

建议统一规则：

- 当前没有 active view：typed state 为 `undefined`
- 当前 active view 类型不匹配：typed state 为 `undefined`
- 当前 active view 类型匹配，但投影未准备好：typed state 为 `undefined`
- 当前 active view 类型匹配，且所需 projection 已完整：返回 ready state

也就是说，typed state 一旦存在，就表示：

- 可以直接被该视图的 controller / host / panel 使用
- 不再需要再判断 `appearances? / sections? / fields?`

这比现在 React 自己反复写：

- `state?.view.type === 'kanban'`
- `state?.appearances`
- `state?.sections`
- `state?.fields`

要干净得多。


## 9. engine 内部怎么准备

## 9.1 不要在 React 里做 selector 级重组

这些 typed ready state 应该在 engine store/selectors 层完成，而不是在 React hook 里 `useMemo`。

建议实现位置：

- `dataview/src/engine/store/selectors.ts`
- 或者在 active selector 之上拆一个 `activeTyped.ts`

目标是：

- active 通用 state 在 selector 层准备
- typed ready state 也在 selector 层准备
- facade 只负责公开 API，不再重组数据

## 9.2 建议的内部构造顺序

建议按下面的层次构造：

1. `read.document / read.view / read.record`
2. `active.id / active.view / active.state`
3. `active.read`
4. `active.table.state / active.gallery.state / active.kanban.state`
5. `active.table.read / active.gallery.read / active.kanban.read`

也就是说：

- typed state 建立在 `active.state` 上
- typed read 建立在 typed state 上

这样层次最清楚，也不会绕。


## 10. `kanban` 应该怎么接

`kanban` 是最典型、最应该先下沉的。

当前 React 里还在做的非 UI 派生有：

- `currentView`
- `group`
- `sort`
- `fields`
- `groupField`
- `groupUsesOptionColors`
- `fillColumnColor`
- `cardsPerColumn`
- `canReorder`
- `sectionKeyById`
- `sectionColorByKey`
- `readRecord`
- `readSectionColorId`
- `readAppearanceColorId`

这些长期都应该转成：

```ts
const state = useStoreValue(engine.active.kanban.state)
const read = engine.active.kanban.read
```

React controller 只留下：

- `expandedCountBySectionKey`
- `showMore`
- `hiddenCount`
- `readVisibleIds`
- marquee / drag / selection runtime

也就是说，`useKanbanController` 最终应该变成一个很薄的 UI 协调层。


## 11. `gallery` 应该怎么接

`gallery` 与 `kanban` 结构相近，也应按同样策略处理。

当前 React 里仍有这些 engine 级派生：

- `currentView`
- `groupProjection`
- `sortProjection`
- `fields`
- `groupUsesOptionColors`
- `sections`
- `sectionColorByKey`
- `canReorder`

其中：

- `sections` 在 `gallery` 里有一层“如果未分组，就构造单个 all section”的视图语义
- 这不是纯 UI 会话逻辑，而是 gallery 的领域读模型

所以建议 `ActiveGalleryState` 直接准备：

- `sections`
- `customFields`
- `groupField`
- `groupUsesOptionColors`
- `canReorder`

并保证这里的 `sections` 已经是 gallery 最终展示用的 section 结构，而不是让 React 继续判断 grouped / ungrouped 再做重组。

最终 `useGalleryController` 应主要保留：

- virtual layout
- dragging
- marquee
- selection


## 12. `table` 应该怎么接

`table` 目前表面上比 `kanban / gallery` 轻，但本质问题一样：

- React 仍然在拿通用 active state 再组装 table 当前投影
- column lookup / visible field / group / sort 等信息没有完全落到 engine 里

建议 `ActiveTableState` 直接准备：

- `view`
- `appearances`
- `sections`
- `fields`
- `calculations`
- `group`
- `sort`
- `groupField`
- `customFields`
- `visibleFieldIds`
- `showVerticalLines`

建议 `ActiveTableReadApi` 补：

- `getVisibleFieldIndex(fieldId)`
- `getColumnField(fieldId)`
- `getCalculation(sectionKey, fieldId)`，如果 table footer/calc 确实高频需要

这样 table controller / cell / column header 就不该再自己拼“当前 table 视图上下文”。


## 13. 命名建议

命名上尽量短，不要抽象缩写。

建议：

- `ActiveTableState`
- `ActiveGalleryState`
- `ActiveKanbanState`
- `ActiveTableApi`
- `ActiveGalleryApi`
- `ActiveKanbanApi`
- `createActiveTableApi`
- `createActiveGalleryApi`
- `createActiveKanbanApi`
- `createActiveTableStateStore`
- `createActiveGalleryStateStore`
- `createActiveKanbanStateStore`

不建议：

- `projectionReadyState`
- `resolvedCurrentView`
- `typedProjectionContext`
- `viewModeRuntimeState`

这些名字都偏绕。

`ready` 这个语义可以存在于文档和实现思路里，但不一定非要出现在最终公开 API 名字里。

公开 API 更适合直接叫：

- `engine.active.kanban.state`

而不是：

- `engine.active.kanban.readyState`

因为 typed state 的存在本身就已经表示 ready。


## 14. 对 `ActiveViewState` 本身的进一步建议

长期看，`ActiveViewState` 也可以进一步收口。

现在它的多个字段仍然是 `| undefined`。

这虽然可以工作，但会迫使 typed state 构造时反复做 ready 判定。

更长期的最优方向是：

- `active.state` 只暴露两种情况
  - 没有 active view：`undefined`
  - 有 active view：就是完整可用的通用 active state

这样 typed state 的构造就会更干净。

但这一步属于 active runtime 的进一步收口，不是 typed state 设计的前置条件。

可以先做 typed state，再决定要不要继续收紧通用 state。


## 15. 分阶段实施方案

## 阶段 1：在 engine 内补 typed state store

目标：

- 补 `active.table.state`
- 补 `active.gallery.state`
- 补 `active.kanban.state`

要求：

- 一旦返回非 `undefined`，即表示 ready
- React 不再自己判断 `appearances / sections / fields`

## 阶段 2：在 engine 内补 typed read API

目标：

- 补 `active.table.read`
- 补 `active.gallery.read`
- 补 `active.kanban.read`

要求：

- 把 React 里的 `Map` 与 lookup helper 下沉
- 优先提供同步读，不引入新的 store 粒度

## 阶段 3：先改 `kanban`

原因：

- 当前 `kanban` controller 最复杂
- 收益最大
- 最能验证 typed state 设计是否合理

目标：

- `useKanbanController` 只保留 UI 会话态与交互逻辑
- 删掉 `activeState/currentView` 这类重组层

## 阶段 4：改 `gallery`

目标：

- 把 grouped / ungrouped section 派生收回 engine
- 让 gallery controller 只剩 virtual + drag + selection

## 阶段 5：改 `table`

目标：

- 把 table current projection 与 column lookup 收回 engine
- 把 header / cell / input 上下文进一步打平

## 阶段 6：删旧 React 派生实现

要求：

- 删除 React 内重复的 `currentView` typed guard
- 删除重复 `Map` 构造
- 删除 view-specific “projection ready” helper
- 不保留双轨读路径


## 16. 最终 React 侧应呈现的形态

理想状态下：

### `kanban`

```ts
const state = useStoreValue(engine.active.kanban.state)
const read = engine.active.kanban.read
```

然后 controller 只处理：

- `expandedCountBySectionKey`
- `showMore`
- `drag`
- `selection`
- `marquee`

### `gallery`

```ts
const state = useStoreValue(engine.active.gallery.state)
const read = engine.active.gallery.read
```

然后 controller 只处理：

- virtual layout
- selection
- marquee
- drag

### `table`

```ts
const state = useStoreValue(engine.active.table.state)
const read = engine.active.table.read
```

然后 table 运行时只处理：

- grid selection
- pointer / fill / keyboard
- 列宽拖拽
- DOM 命中与滚动


## 17. 最终结论

长期最优不是继续在 React 里优化这些 hook，而是把“active view 的 typed ready 派生”直接收进 engine。

应该明确分层：

- engine：
  - 通用 active state
  - typed ready state
  - typed read API

- React：
  - UI session state
  - DnD / marquee / pointer / virtual runtime
  - 最后一层展示策略

这条线完成后，`kanban / gallery / table` 的 controller 都会明显变薄，而且不会再到处重复“判断当前 active view 是不是某种类型，再把 state 组装一遍”的代码。

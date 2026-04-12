# Dataview Table Active State 最终收口方案

## 1. 目标

这份文档只讨论 table 这条读链最终应该怎么收口。

核心问题是：

- `dataview/src/react/views/table/currentView.ts` 是否还有必要
- `dataview/src/react/views/table/projection.ts` 是否还有必要
- `TableProvider` 里这段是否本质上又绕了一圈

```ts
const currentView = useMemo(() => createTableViewStore({
  engine
}), [engine])
```

结论非常明确：

- 这条链长期不应该保留
- 但最终方案不是把 `ActiveTableState` 升级成完整 table projection
- 最终方案是 table 直接使用通用的 `ActiveViewState`
- `ActiveTableState` 整体删除
- `showVerticalLines` 谁用谁单独订阅，不再保留 table projection store

本文只描述最终结构，不考虑兼容层、过渡层、双轨实现。


## 2. 当前问题本质

当前 table 这条线大致是：

1. engine 提供 `active.state`
2. engine 提供 `active.table.state`
3. React table 再通过 `createTableViewStore(...)` 把两者拼成 `TableCurrentView`
4. controller 和下游组件再消费这份 React 本地拼出来的 projection

这里最核心的问题不是“多一层 `useMemo`”。

真正的问题是：

- React 在重新定义 table 的领域读模型

这会产生几个副作用：

- `currentView.ts` 变成 React 本地 projection 类型壳
- `projection.ts` 变成 React 本地 projection 拼装器
- `TableProvider` 变成 projection 装配入口
- table 下游模块依赖的标准上下文不是 engine 一等能力，而是 React 二次产物

这条线绕的根源是：

- engine 已经提供了 active projection
- React 又自己拼了一份 table projection


## 3. 最终结论

长期最优不是：

- 把 `ActiveTableState` 做大
- 再让 React 继续吃一份 table 专属完整 projection

而是：

- 让 table 主体直接使用 `ActiveViewState`
- 把原本塞在 `ActiveTableState` 里的通用字段并回 `ActiveViewState`
- 删除 `ActiveTableState`
- 删除 React 本地 `currentView/projection` 组装层
- `showVerticalLines` 由真正使用它的组件局部订阅

一句话概括：

- table 不再拥有自己的 projection state
- table 的运行时主上下文就是 `engine.active.state`


## 4. 为什么不应该保留完整 `ActiveTableState`

表面上有一个看起来也成立的方案：

- 把 `ActiveTableState` 升级成完整 table projection
- 然后让 React table 直接消费 `engine.active.table.state`

这个方案比 React 本地拼装当然更好，但它仍然不是最优。

原因是：

- table 真正高频依赖的大部分数据本来就是 active 通用 projection
- 如果只是为了 table 再复制一套完整 state，本质上还是多了一套概念
- 后续很容易出现“到底谁才是 table 主上下文”的语义分裂

更重要的是，目前 table 真正特殊的字段其实非常少。

从语义归属看：

- `groupField` 不是 table 专属
- `customFields` 不是 table 专属
- `visibleFieldIds` 不应该作为独立 state 字段存在
- 真正 table-only 的，只剩一个 `showVerticalLines`

如果为了一个布尔值继续保留整套 `ActiveTableState`，这层抽象已经不值了。


## 5. 对现有字段的最终判断

## 5.1 `groupField`

这个字段应该并入通用 `ActiveViewState`。

原因：

- 它表达的是 active projection 的通用归一化结果
- gallery / kanban / table 都可能关心它
- 它不是 table 的私有语义

所以长期最优是：

- `groupField` 进入 `ActiveViewState`


## 5.2 `customFields`

这个字段也应该并入通用 `ActiveViewState`。

原因：

- 它本质上是 active fields 的一个通用派生结果
- 很多上层 UI 都可能复用
- 它不是 table 专属能力

所以长期最优是：

- `customFields` 进入 `ActiveViewState`


## 5.3 `visibleFieldIds`

这个字段不应该并入 `ActiveViewState`，也不应该继续作为独立 projection 字段存在。

原因很简单：

- 它只是 `view.display.fields` 的别名
- 没有新增语义
- 如果继续暴露它，只会让代码里出现两套等价来源

长期最优不是：

- 再给它一个新的字段名

而是统一约定：

- table 一律直接使用 `state.view.display.fields`


## 5.4 `showVerticalLines`

这个字段不应该支撑一个独立 `ActiveTableState`。

它的合理处理方式是：

- 谁用谁直接从 `state.view.options.table.showVerticalLines` 订阅

也就是说：

- 不为它保留一层 table projection state
- 不为它保留一个专门的 table store


## 6. 最终类型结构

最终建议把通用 active state 收敛成：

```ts
interface ActiveViewState {
  view: View
  filter: ViewFilterProjection
  group: ViewGroupProjection
  groupField: Field | undefined
  search: ViewSearchProjection
  sort: ViewSortProjection
  records: RecordSet
  sections: readonly Section[]
  appearances: AppearanceList
  fields: FieldList
  customFields: readonly CustomField[]
  calculations: ReadonlyMap<SectionKey, CalculationCollection>
}
```

然后删除：

```ts
interface ActiveTableState
```

也就是说：

- table 不再有 `engine.active.table.state`
- table 主体直接使用 `engine.active.state`


## 7. table 侧最终读取原则

table 主体以后只认一份主上下文：

```ts
const state = engine.active.state
```

其中：

- `view` 直接来自 `state.view`
- `group` 直接来自 `state.group`
- `sort` 直接来自 `state.sort`
- `groupField` 直接来自 `state.groupField`
- `appearances` 直接来自 `state.appearances`
- `sections` 直接来自 `state.sections`
- `fields` 直接来自 `state.fields`
- `customFields` 直接来自 `state.customFields`
- `visibleFieldIds` 直接来自 `state.view.display.fields`
- `calculations` 直接来自 `state.calculations`

而：

- `showVerticalLines` 由用到它的组件直接订阅 `state.view.options.table.showVerticalLines`


## 8. React 侧最终形态

## 8.1 `TableProvider`

最终不再需要：

```ts
const currentView = useMemo(() => createTableViewStore({
  engine
}), [engine])
```

也不再需要：

- `createTableViewStore(...)`
- React 本地 merge `active.state + active.table.state`

最终 `TableProvider` 只需要把 engine 的 active state 直接交给 controller。


## 8.2 `currentView.ts`

这个文件长期不应该保留。

它目前承担的事情包括：

- 定义 React 本地 table projection 类型
- 定义 React 本地 equality

这些职责都不该存在于 React。

最终应直接删除：

- `dataview/src/react/views/table/currentView.ts`


## 8.3 `projection.ts`

这个文件长期也不应该保留。

它目前承担的是：

- 把 `engine.active.state` 和 `engine.active.table.state` 再 merge 一次

这本质上就是 React 本地 projection 工厂。

最终应直接删除：

- `dataview/src/react/views/table/projection.ts`


## 9. controller 应该怎么接

`createTableController(...)` 最终仍然可以保留一个 `currentViewStore` 或类似命名的参数。

但这里的“current view”不再意味着：

- React 本地拼出来的一份 table projection

而是意味着：

- 直接传入 `engine.active.state`

如果 controller 内部需要 table 类型收窄，也只保留一层非常薄的类型边界，不做 projection 再包装。

也就是说，允许存在这种东西：

```ts
type TableActiveState = ActiveViewState & {
  view: View & {
    type: 'table'
  }
}
```

但不允许存在这种东西：

- React 本地再建一份新的 table store
- React 本地再写一份 table equality
- React 本地再 merge 一次 active state

这里要区分得很清楚：

- 薄类型收窄是允许的
- 新 projection 层是不允许的


## 10. 关于订阅粒度

一个常见担心是：

- 如果 table 全部直接使用 `ActiveViewState`，会不会导致重渲染范围太大

这个担心有价值，但解决方式不能是保留 React 本地 projection。

正确顺序应该是：

1. 先把 ownership 收对
2. 再处理订阅粒度

也就是说：

- 先让 table 主体完全回到 `engine.active.state`
- 然后再看是否需要补通用 selector 能力

如果后续需要更细粒度，正确方向是：

- `engine.active.select(...)`
- 更细的 engine 级 selector
- keyed read

而不是：

- React 再自己拼一层 table current view


## 11. 需要删除的东西

最终应删除：

- `ActiveTableState`
- `engine.active.table.state`
- `dataview/src/react/views/table/currentView.ts`
- `dataview/src/react/views/table/projection.ts`
- `TableProvider` 里的 `createTableViewStore({ engine })`
- React 本地的 table projection equality

最终保留的只有：

- `engine.active.state`
- `engine.active.select(...)`
- table 局部组件对 `state.view.options.table.showVerticalLines` 的按需订阅
- 必要时一个极薄的 table 类型收窄别名


## 12. 最终收益

按这个方案收口后，收益是非常直接的：

- table 读边界明显更清楚
- React host 明显变薄
- 不再有 React 本地二次 projection
- 不再有 table 专属 state 的概念噪音
- `visibleFieldIds` 不再重复命名
- `groupField / customFields` 归属回到通用 active state
- `showVerticalLines` 回到真正使用它的局部组件

最关键的收益是：

- table 终于不再维护一套“伪独立运行时状态”
- 它真正回到了 active 通用 projection 体系里


## 13. 最终结论

`dataview/src/react/views/table/currentView.ts` 长期没有必要存在。

`useMemo(() => createTableViewStore({ engine }), [engine])` 虽然实现上没问题，但结构上确实是在绕一圈。

长期最优不是：

- 再保留一个完整 `ActiveTableState`

而是：

- table 直接使用 `ActiveViewState`
- `groupField` 和 `customFields` 并入通用 `ActiveViewState`
- `visibleFieldIds` 删除为独立字段，统一直接使用 `view.display.fields`
- `showVerticalLines` 谁用谁单独订阅
- 删除 `ActiveTableState`
- 删除 `currentView.ts`
- 删除 `projection.ts`

这才是 table 这条线真正压平后的最终形态。

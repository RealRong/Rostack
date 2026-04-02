# dataview `useDataView` 上下文收敛方案

## 结论

建议把当前 `EditorContextValue` 升级为正式的 `DataViewContextValue`，并提供一个统一入口：

- `useDataView()`

这个方向是对的，能降低 React 接入层的样板复杂度，也更符合当前 dataview 的实际结构。

但不建议直接把所有状态值和平铺 API 一股脑塞进一个大对象里，更不建议做一层 `stores` 再重复暴露同名顶层字段。

更合理的目标是：

- 一个稳定的根上下文句柄
- 按 domain 分组组织 `store` 和 controller
- 响应式读取继续通过 store hook 进行
- 只删除低价值壳 hook，保留少数真正有订阅价值的 hook

## 当前问题

当前 [dataview/src/react/editor](/Users/realrong/Rostack/dataview/src/react/editor) 下有：

- [index.ts](/Users/realrong/Rostack/dataview/src/react/editor/index.ts)
- [provider.tsx](/Users/realrong/Rostack/dataview/src/react/editor/provider.tsx)
- [useCurrentView.ts](/Users/realrong/Rostack/dataview/src/react/editor/useCurrentView.ts)
- [useDocument.ts](/Users/realrong/Rostack/dataview/src/react/editor/useDocument.ts)
- [useEngine.ts](/Users/realrong/Rostack/dataview/src/react/editor/useEngine.ts)
- [usePage.ts](/Users/realrong/Rostack/dataview/src/react/editor/usePage.ts)

这里的问题不是“没有封装”，而是“封装层次不够稳定”：

1. 根 context 没有被当成正式的 dataview runtime/session API 使用。
2. 一部分 hook 只是薄包装，没有形成明确的抽象价值。
3. 调用点经常需要并列拿多个 hook，例如：
   - `useEngine()`
   - `usePageActions()`
   - `useCurrentView()`
4. `editor` 这个目录名本身也开始偏离真实职责，它更像 dataview session/context access，而不是 editor core。

## 不建议直接采用的形状

下面这种设计方向不建议直接照搬：

```ts
export interface DataviewContextValue {
  engine: GroupEngine
  currentView: CurrentViewApi
  stores: {
    page
    propertyEdit
    currentView
  }
  page: PageSessionApi
  propertyEdit: PropertyEditApi
}
```

主要问题有两个：

1. 字段语义重复

- `page` 是 action API，但 `stores.page` 又是状态 store
- `propertyEdit` 是 API，但 `stores.propertyEdit` 又是 session store
- `currentView` 既像 domain，又还有 `stores.currentView`

这会让调用点不断判断“应该用顶层字段还是 stores 里的字段”。

2. 容易演化成新的大桶

一旦存在一个兜底的 `stores` 容器，后续任何 store 都很容易继续往里塞，最后只会从一个大桶换成另一个大桶。

## 推荐的数据结构

建议按 domain 分组，而不是顶层平铺加重复字段：

```ts
export interface DataViewContextValue {
  engine: GroupEngine

  page: PageSessionApi & {
    store: ReadStore<ResolvedPageState>
  }

  valueEditor: PropertyEditApi & {
    sessionStore: ValueStore<PropertyEditSession | null>
  }

  currentView: {
    store: ReadStore<CurrentView | undefined>
    get: () => CurrentView | undefined
  }
}
```

这个结构有几个优点：

1. domain 边界明确

- `page`
- `valueEditor`
- `currentView`

每个 domain 都把“状态入口”和“行为入口”放在一起，但不再额外包一层 `actions/api`。

2. 避免重复命名

不再需要：

- `stores.page`
- `page`
- `stores.currentView`
- `currentView`

这种双份暴露。

3. 更符合当前架构

当前 dataview React 侧已经明显是三条会话链：

- 页面 session
- value editor session
- 当前活动 view 会话

## 关于命名

建议不要继续使用 `propertyEdit` 这个名字。

前面的目录重排已经在逐步消解它，当前真实职责已经更接近：

- `valueEditor`

所以 context 里建议统一为：

- `valueEditor.open(...)`
- `valueEditor.close(...)`
- `valueEditor.sessionStore`

而不是继续保留：

- `propertyEdit`

## `useDataView()` 应该是什么

`useDataView()` 应该返回一个稳定的 session/runtime handle，而不是一个包含实时响应式值的大对象。

建议语义：

```ts
const dataView = useDataView()
```

然后：

- `dataView.engine`
- `dataView.page`
- `dataView.page.store`
- `dataView.currentView.store`
- `dataView.valueEditor`

## 一个关键原则：不要把实时值直接挂进 context value

不建议这样做：

```ts
export interface DataViewContextValue {
  engine: GroupEngine
  currentView: CurrentView | undefined
  pageState: ResolvedPageState
}
```

原因是这会导致 provider 每次状态变化时，所有 context consumer 一起重渲染，失去当前 store 体系的细粒度订阅优势。

正确方式应该是：

- context 暴露稳定句柄
- store hook 负责响应式订阅

例如：

```ts
const dataView = useDataView()
const currentView = useStoreValue(dataView.currentView.store)
const pageState = useStoreValue(dataView.page.store)
```

## 哪些 hook 可以删除

建议删除的低价值 hook：

- `useEditorContext`
- `useEngine`
- `usePageActions`
- `useActiveView`
- `useViews`
- `useProperties`

这些 hook 的问题是：

- 很多只是 context 字段的薄包装
- 业务组件经常还要多个并列组合使用
- 没有形成强约束的抽象边界

## 哪些 hook 建议暂时保留

建议暂时保留的高价值 hook：

- `useCurrentView`
- `usePageValue`
- `usePropertyById`
- `useViewById`

原因：

1. 它们承担 selector / 订阅语义

例如：

- `useCurrentView(selector, isEqual)`
- `usePageValue(selector, isEqual)`

这类 hook 不是简单转发，而是“订阅入口”。

2. 它们承担 keyed store 的细粒度读取

例如：

- `usePropertyById`
- `useViewById`

如果一口气全部删掉，调用点会退化成很多重复的 `useStoreValue` / `useExternalValue` 模板代码。

## 推荐的过渡策略

### Phase 1

引入：

- `DataViewContextValue`
- `useDataView()`

并保留现有 selector/keyed hooks。

### Phase 2

删除低价值壳 hook：

- `useEngine`
- `usePageActions`
- `useActiveView`
- `useViews`
- `useProperties`
- `useEditorContext`

调用方统一改成：

```ts
const dataView = useDataView()
```

### Phase 3

评估是否继续缩减 selector hook。

如果后续发现：

- `useCurrentView`
- `usePageValue`

仍然足够清晰，就可以保留。

如果后续想进一步统一风格，再考虑是否全部收口成：

- `useDataView() + useStoreValue(...)`

## 目录层面的建议

如果继续推进这次重构，建议不要长期保留 `react/editor` 这个名字。

更准确的目录名可以是：

```text
react/context/
  provider.tsx
  useDataView.ts
```

或者：

```text
react/dataview/
  provider.tsx
  useDataView.ts
```

原因：

- 它现在承载的是 dataview session/runtime context
- 不只是 editor 功能
- `editor` 这个命名已经开始误导职责

## 落地时的注意点

1. 不要在 `useDataView()` 返回对象里塞“会调用 hook 的函数”。

不建议这种设计：

```ts
const dataView = useDataView()
const currentView = dataView.currentView.use()
```

这样会让 hooks 规则和可读性都变差。

2. 不要让 context value 直接携带大对象实时值。

否则会放大渲染范围。

3. `valueEditor` 命名应和前面的目录重排保持一致。

不要把已经在消解的 `propertyEdit` 概念又通过 context 带回来。

## 最终建议

建议推进，而且值得做。

但最佳版本不是“一个万能大 hook 替掉所有东西”，而是：

- 一个正式的 `DataViewContextValue`
- 一个正式的 `useDataView()`
- domain 化组织 `store` 和 controller
- 删除低价值壳 hook
- 保留少量真正有价值的 selector / keyed hooks

这样能降低复杂度，同时不会把响应式边界搞糊。

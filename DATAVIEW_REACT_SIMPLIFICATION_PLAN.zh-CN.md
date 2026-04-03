# dataview React 整体简化方案

## 结论

`dataview/src/react` 现在的主要问题，不是单个文件复杂，而是 runtime 装配、页面 session、当前 view、瞬时交互状态、页面 host 之间的边界还不够稳定。

当前代码已经比前几轮干净很多，但还存在几个明显信号：

- `provider.tsx` 已经变成整个 React runtime 的 composition root，同时还夹杂具体 domain 规则
- `currentView/store.ts` 名义上是 store，实际更像 active view projection adapter
- `page/session` 里有 page chrome state，也承担了一部分 runtime 解析职责
- `dataview/` 下的 hooks 呈现重复模式，说明 API 组织还没完全收敛
- `useDataView().engine / page / selection / inlineSession / valueEditor` 的消费方式较原始，很多组件直接拿整个 runtime 自己拆

长期最优不应该再继续“边改边在现有层里加东西”，而是要把 `react` 目录收敛成明确的三层：

1. runtime 装配层
2. page shell / active view 层
3. 独立 transient domain 层

## 当前结构里的核心问题

## 1. `provider.tsx` 过胖

当前 [provider.tsx](/Users/realrong/Rostack/dataview/src/react/dataview/provider.tsx) 同时负责：

- 创建 `page`
- 创建 `selection`
- 创建 `inlineSession`
- 创建 `valueEditor`
- 派生 `pageStateStore`
- 创建 `currentView`
- 绑定 `inlineSession` 与 `currentView` 的清理规则
- 组装 `DataViewContextValue`

这意味着：

- 它不是单纯的 React Provider
- 它实际上是 DataView React runtime 的总装配器

问题不在于“东西多”，而在于这些逻辑都堆在组件函数里，导致：

- 很难看出哪些是 pure runtime factory
- 哪些是 React 生命周期绑定
- 哪些是 domain 规则

## 2. `currentView/store.ts` 命名和职责不匹配

当前 [store.ts](/Users/realrong/Rostack/dataview/src/react/currentView/store.ts) 实际做的是：

- 根据 `document + page.activeViewId` 解析 active view id
- 读取 active projection
- 同步 `selection`
- 把 projection 和 commands 拼成 `CurrentView`

它已经不再拥有复杂内部状态，也没有独立 domain 语义。

所以它更像：

- active view adapter
- active projection read model

而不是：

- 一个真正的 currentView state domain

继续叫 `store.ts` 会误导后续设计。

## 3. `page/session` 里混了两类东西

当前 `page/session` 主要包含两类内容：

### 第一类：page chrome session

- active view
- query bar
- settings
- blocking surface

### 第二类：resolved runtime view of page session

- `resolveActiveViewId`
- `resolveQueryBarState`
- `resolveSettingsState`
- `resolvePageState`
- `createResolvedPageStateStore`

这两类不是一个层次。

前者是：

- page session model

后者是：

- runtime derived state

把两者继续堆在同一目录下，后续只会让 `page/session` 越来越像一个“兜底杂物间”。

## 4. transient domain 已经形成，但还没彻底收敛

现在已经形成几个相对独立的 transient domain：

- `selection`
- `inlineSession`
- `valueEditor`
- table 内部的 `gridSelection`

这是正确方向。

但它们的装配、命名和接入风格还不完全一致：

- `selection` 和 `inlineSession` 已独立
- `valueEditor` 还停留在 page/valueEditor 目录下，并且其 API 组装逻辑还在 provider 里
- `gridSelection` 还是 table controller 内部局部状态

这里还没错，但还没到“长期稳定”的状态。

## 5. `dataview/` hooks 层重复明显

现在这些 hook 文件：

- [usePage.ts](/Users/realrong/Rostack/dataview/src/react/dataview/usePage.ts)
- [useSelection.ts](/Users/realrong/Rostack/dataview/src/react/dataview/useSelection.ts)
- [useInlineSession.ts](/Users/realrong/Rostack/dataview/src/react/dataview/useInlineSession.ts)
- [useCurrentView.ts](/Users/realrong/Rostack/dataview/src/react/dataview/useCurrentView.ts)

已经呈现出很稳定的重复模式：

- `useX()`
- `useXValue(selector, isEqual?)`

这说明 API 已经自然收敛到了：

- “domain store + domain selector hook”

但实现还没抽象。

## 6. Host 与 domain 的边界还不够清楚

当前 page 侧 host 包括：

- [PageInteractionHost.tsx](/Users/realrong/Rostack/dataview/src/react/page/PageInteractionHost.tsx)
- [KeyboardHost.tsx](/Users/realrong/Rostack/dataview/src/react/page/KeyboardHost.tsx)
- [host.tsx](/Users/realrong/Rostack/dataview/src/react/page/valueEditor/host.tsx)

这些 host 本质上是：

- runtime side effects
- page-scoped portals
- global interaction bridges

但它们现在分散在：

- `page/`
- `page/valueEditor/`

目录表达还不够统一。

## 长期最优的目标结构

推荐把 `dataview/src/react` 相关部分收敛为下面的结构：

```txt
react/
  dataview/
    provider.tsx
    runtime.ts
    hooks.ts
    index.ts

  runtime/
    currentView/
      store.ts
      commands.ts
      types.ts
      index.ts
    selection/
      api.ts
      store.ts
      types.ts
      index.ts
    inlineSession/
      api.ts
      types.ts
      index.ts
    valueEditor/
      api.ts
      host.tsx
      types.ts
      index.ts

  page/
    session/
      api.ts
      types.ts
      settings.ts
      index.ts
    state/
      resolved.ts
      activeView.ts
      index.ts
    hosts/
      KeyboardHost.tsx
      InteractionHost.tsx
      index.ts
    Page.tsx
    Body.tsx
    Toolbar.tsx
    Header.tsx
    index.ts
```

这不是要求一次性完全照搬目录名，而是要表达稳定边界：

- `dataview/` 只负责 public React runtime API
- `runtime/` 放 runtime domain
- `page/session` 只放 page shell session model
- `page/hosts` 放页面级副作用 host

## 推荐的职责边界

## 1. `dataview/` 只做 public runtime facade

目标是让 `dataview/` 目录变成纯 facade：

- 创建 runtime
- 提供 context
- 暴露 hooks
- 暴露 public types

它不应该再承担具体 domain 的业务装配细节。

### 推荐包含

- `provider.tsx`
- `runtime.ts`
- `hooks.ts`
- `index.ts`

### 不应该继续堆在这里的内容

- value editor session 归一化细节
- inline session 同步规则
- active view 手写订阅逻辑

## 2. `currentView` 应定义为 active projection runtime，而不是 state domain

现在 `selection` 已经迁走后，`currentView` 更纯了。

建议进一步明确：

- `currentView` 只表示当前 active view 的 projection read model
- 它不再负责 page-global transient state

因此它的职责应固定为：

- 解析 active projection
- 提供 projection commands
- 提供当前 view 的只读结构

不再承载：

- selection
- inline session
- value editor

### 命名建议

当前 `currentView/store.ts` 可考虑改成更准确的名字：

- `runtime/currentView/store.ts`
- 或 `runtime/currentView/readModel.ts`

如果继续保留 `store.ts`，至少语义上要明确它是：

- active current view read store

不是一个“大而全”的 currentView domain。

## 3. `page/session` 只保留 page shell session model

建议把 `page/session` 的边界收缩成：

- `PageSessionState`
- `PageSessionApi`
- `settings` route helpers

而把所有 resolved / derived 逻辑移出去。

### 适合留在 `page/session/`

- `types.ts`
- `api.ts`
- `settings.ts`

### 更适合迁出

- `resolveActiveViewId`
- `resolvePageState`
- `createResolvedPageStateStore`

这些更像 runtime state composition，不像 session model。

推荐移动到：

- `react/page/state/`
- 或 `react/runtime/page/`

## 4. transient domain 全部平级化

长期建议把下面这些视为同级 runtime domain：

- `selection`
- `inlineSession`
- `valueEditor`

对应到 `DataViewContextValue`：

```ts
export interface DataViewContextValue {
  engine: GroupEngine
  page: PageSessionApiWithStore
  currentView: ReadStore<CurrentView | undefined>
  selection: SelectionApi
  inlineSession: InlineSessionApi
  valueEditor: ValueEditorApiWithStore
}
```

这里面没有必要再人为区分：

- 谁是“真正 page 级”
- 谁是“半 page 级”

只要它们都属于当前 `Page` React 生命周期下的 transient runtime state，就应该平级存在。

## 5. host 应统一视为 page runtime host

建议统一 host 的概念：

- keyboard host
- interaction host
- value editor host

它们本质上都是 page runtime host。

所以更稳定的组织方式是：

- `page/hosts/`

而不是分散在：

- `page/`
- `page/valueEditor/`

如果暂时不挪目录，至少概念上应该在文档和命名上统一。

## 对外 API 的简化方向

## 1. `currentView` 不需要再包 `{ store, get }`

现在 `DataViewContextValue.currentView` 还是：

```ts
{
  store: ReadStore<CurrentView | undefined>
  get: () => CurrentView | undefined
}
```

这层包装没有长期价值。

因为 `ReadStore` 本身就有：

- `get()`
- `subscribe()`

推荐直接改成：

```ts
currentView: ReadStore<CurrentView | undefined>
```

这样：

- provider 更简单
- hooks 也更直接
- API 更一致

同理，如果后续愿意，`page` 和 `valueEditor` 也可以收敛成更明确的模式：

- `page: PageSessionApi & { store: ReadStore<ResolvedPageState> }`
- `valueEditor: ValueEditorApi & { store: ValueStore<ValueEditorSession | null> }`

但 `currentView` 这层额外包装是最没必要的。

## 2. `dataview/` hooks 应抽成统一模式

当前已经自然形成：

- `useX()`
- `useXValue(selector, isEqual?)`

建议统一成一个内部 helper，比如：

- `createStoreHooks(name, selectStore)`
- 或直接保留重复文件，但明确这是稳定模板

我更推荐保留薄文件，但内部用统一 helper，原因是：

- public API 仍然清楚
- 实现不重复
- 后续新增 domain 不再复制粘贴

## 3. 更推荐增加面向职责的 hooks

当前很多组件直接写：

- `useDataView().engine`
- `useDataView().page`
- `useDataView().selection`

这会让组件对整体 runtime 结构耦合过深。

建议逐步增加更明确的 hooks：

- `useEngine()`
- `usePageApi()`
- `useSelectionApi()`
- `useValueEditorApi()`

目标不是减少能力，而是减少组件直接感知整个 runtime object。

## 当前最值得优先落地的简化项

## 第一优先级

### 1. 新增 `createDataViewRuntime(...)`

这是最关键的一步。

把现在 `provider.tsx` 里的创建逻辑整体搬进纯函数工厂：

```ts
createDataViewRuntime({
  engine,
  initialPage
})
```

返回：

- `contextValue`
- `dispose`

以及可能需要的内部 stores / apis。

这样：

- React provider 变薄
- runtime 逻辑集中
- 后续 domain 增减更可控

### 2. `currentView/store.ts` 改成纯 derived read model

当前它还在手写：

- `createValueStore`
- `sync`
- `unsubscribeDocument`
- `unsubscribePage`

长期更适合改成：

- 基于 `createDerivedStore`

当前唯一还需要注意的是：

- `syncSelection(selectionStore, appearances.ids)` 这种副作用型 reconcile

建议把这个副作用从 `currentView` 内部拿掉，改成 runtime 层统一绑定规则：

- 当 currentView 变化时同步 selection

这样 `currentView` 本身就能变成纯 derived read model。

### 3. `page/session/state.ts` 拆分

建议至少拆成：

- `page/session/*`
- `page/state/resolved.ts`

这一步会直接让 page 相关边界清楚很多。

## 第二优先级

### 4. `valueEditor` 抽成完整独立 domain

现在它的：

- `types`
- `host`
- session 归一化逻辑

还分散在 `page/valueEditor` 和 `provider.tsx`。

建议统一成：

- `runtime/valueEditor/api.ts`
- `runtime/valueEditor/types.ts`
- `runtime/valueEditor/host.tsx`

这样和 `selection / inlineSession` 同一个层级。

### 5. host 目录统一

把：

- `PageInteractionHost`
- `PageKeyboardHost`
- `PropertyValueEditorHost`

统一成 page hosts 概念。

## 第三优先级

### 6. `dataview/index.ts` 与 `react/index.ts` 对外导出分层

当前 [index.ts](/Users/realrong/Rostack/dataview/src/react/index.ts) 对外暴露很多 runtime 细节。

长期建议区分：

- 面向产品使用者的 stable exports
- 面向内部实现的 runtime exports

当前先不一定要改 public API，但应该在文档里明确：

- 不是所有 `dataview/react` exports 都应该继续扩散

## 不建议现在做的事情

## 1. 不建议把所有状态都塞回 `page`

虽然 `selection / inlineSession / valueEditor` 都是 page 生命周期内状态，但它们不应该被重新混进：

- `page.session`
- `page` 单一大对象

否则只是回到更早的混乱版本。

## 2. 不建议把 `currentView` 再做成超级中心

已经拆出去的东西：

- selection

不要再绕一圈挂回去。

`currentView` 应该继续变薄，而不是重新长胖。

## 3. 不建议现在就把 table `gridSelection` 并进全局

`gridSelection` 仍然有强 table 局部语义：

- 二维网格
- 单元格坐标
- 填充/批量编辑

当前保留在 table controller 内部是合理的。

## 推荐的最终架构图

```ts
DataViewProvider
  -> createDataViewRuntime()
    -> pageSession
    -> resolvedPageState
    -> currentView
    -> selection
    -> inlineSession
    -> valueEditor
    -> runtime bindings

Page
  -> page hosts
  -> toolbar / query / settings
  -> active view body
```

其中：

- `pageSession` 负责 shell session
- `currentView` 负责 active projection
- `selection / inlineSession / valueEditor` 负责 transient interaction domain
- `hosts` 负责跨组件 side effects 和 portals

## 推荐迁移顺序

### 第一步

新增：

- `dataview/src/react/dataview/runtime.ts`

把 `provider.tsx` 内的装配整体迁入。

### 第二步

把 `currentView/store.ts` 改造成更纯的 read model。

目标是：

- 不再自己管理手写 mutable store 生命周期
- 尽量减少内部副作用

### 第三步

拆 `page/session/state.ts`。

把：

- session model
- resolved state

分离开。

### 第四步

把 `valueEditor` 提升为平级 runtime domain。

### 第五步

收敛 `dataview/` hooks 与 exports。

## 一句话结论

`dataview/src/react` 的整体简化重点，不是继续删目录，而是把运行时装配、active view、page shell session、transient interaction domain 这四类职责彻底分开，让 `provider.tsx` 变成薄壳，让 `currentView` 变成纯 active projection read model。

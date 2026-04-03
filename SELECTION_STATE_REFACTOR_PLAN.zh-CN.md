# dataview selection 状态重构方案

## 结论

`selection` 应该从 `currentView` 的实现里抽出来，提升为 page 级的 React runtime transient state。

但不建议把它直接塞进 `page.session`。

长期最优的边界是：

- `selection` 不属于 engine/core
- `selection` 不属于 `currentView` projection
- `selection` 也不属于 `page.query/settings/surface` 这类 page chrome session
- `selection` 属于 `DataView` 下独立的 page-global runtime domain

推荐目标组织：

- `dataView.selection`

而不是：

- `currentView.selection`
- `page.selection`
- `page.session.selection`

## 为什么不该继续放在 currentView

现在的 `selection` 挂在 `currentView` 上，主要是历史实现方便：

- 它依赖当前 active view
- 它依赖当前 projection 的 `appearances.ids`
- 它的命令入口目前也放在 `currentView.commands.selection`

但从职责看，这个归属并不准确。

`currentView` 更接近：

- 当前 view 的 projection 结果
- 当前 view 的可读结构
- 基于 projection 的只读衍生能力

而 `selection` 本质上是：

- 用户在当前页面上的临时交互状态
- 会被页面级键盘事件驱动
- 会被视图级鼠标交互驱动
- 会影响删除、拖拽、编辑、批量操作等页面行为

也就是说：

- `currentView` 是“当前看到了什么”
- `selection` 是“用户当前在这个页面上选中了什么”

后者不是 projection 本身。

## 为什么也不建议放进 page.session

虽然 `selection` 是 page 级状态，但不应该直接进入 `page.session`。

原因有三个。

### 1. page.session 目前承载的是 page chrome / shell session

现在 `page.session` 主要管理的是：

- `activeViewId`
- `query`
- `settings`
- `surface`

这些状态都更接近：

- 页面壳层 UI
- toolbar / popover / panel / modal 路由
- page 级 chrome 交互

而 `selection` 不是这类状态。

### 2. selection 强依赖 projection 身份

当前 `selection` 保存的是：

```ts
export interface SelectionState {
  ids: readonly AppearanceId[]
  anchor?: AppearanceId
  focus?: AppearanceId
}
```

这里的 `AppearanceId` 明确是当前 projection 身份，不是 document 层稳定 id。

它的以下行为也都必须依赖当前 view projection：

- normalize
- toggle
- extend
- step
- reconcile / sync

如果把它直接放进 `page.session`，会让 page session 和 projection 耦合得更深。

### 3. selection 是 runtime transient state，不是 page shell session model

它和以下状态更接近：

- `valueEditor`
- `inlineSession`
- table `gridSelection`

共同点是：

- 生命周期绑定当前 `Page` React 实例
- 不需要 document 持久化
- 不需要 page chrome 路由语义
- 需要和具体运行时组件、DOM、projection 协同

所以更合适的归属是：

- `DataView` runtime domain

而不是：

- `page.session`

## 推荐的新边界

推荐把 selection 提升为独立 domain：

```ts
dataView.selection
```

语义定义为：

- 当前页面中当前活动 view 的 appearance selection

由于当前产品约束是：

- 同时只有一个 view 显示

因此当前阶段不需要做“按 viewId 分桶保存多份 selection”。

当前阶段只需要一份全局 selection：

```ts
export interface SelectionState {
  ids: readonly AppearanceId[]
  anchor?: AppearanceId
  focus?: AppearanceId
}
```

当 active view 变化时：

- 直接清空
- 或根据新的 `appearances.ids` 做一次 reconcile

当前建议优先选：

- active view 变化时直接清空

原因：

- 模型最简单
- 行为最稳定
- 避免旧 view 的 appearance 身份泄漏到新 view

## 推荐 API

### 1. selection state

```ts
export interface SelectionState {
  ids: readonly AppearanceId[]
  anchor?: AppearanceId
  focus?: AppearanceId
}
```

### 2. selection api

```ts
export interface SelectionApi {
  store: ValueStore<SelectionState>
  get(): SelectionState
  clear(): void
  set(
    ids: readonly AppearanceId[],
    options?: {
      anchor?: AppearanceId
      focus?: AppearanceId
    }
  ): void
  toggle(ids: readonly AppearanceId[]): void
  extend(to: AppearanceId): void
  all(): void
}
```

### 3. projection-bound helper

因为 `selection` 的所有写操作都依赖当前 `appearances.ids`，因此 API 最好在创建时就绑定当前 order reader：

```ts
createSelectionApi({
  order: () => currentView?.appearances.ids ?? []
})
```

也就是说：

- store 属于 page-global runtime
- 但它的更新规则通过 `order()` 读取当前 active projection

这样职责更清晰。

## currentView 还保不保留 selection

建议分两步。

### 第一步

保留 facade：

- `currentView.selection`
- `currentView.commands.selection`

但它们底层不再拥有自己的 store，而是转发到 `dataView.selection`。

这样可以：

- 先把所有权迁出去
- 不一次性重写大量消费点

### 第二步

逐步把 React 侧调用改成：

- `useDataView().selection`
- `useSelection()`
- `useSelectionValue()`

等主要消费点都迁完后，再移除：

- `currentView.selection`
- `currentView.commands.selection`

最终让 `currentView` 回到更纯的 projection 角色。

## 为什么这比“继续挂在 currentView 上”更好

### 1. page 级入口和状态所有权一致

当前像页面快捷键这种入口，本质上是 page 级行为：

- `Cmd/Ctrl + A`
- `Esc`
- 删除选中项

这些逻辑不应该先拿到 `currentView`，再间接改一个其实是 page 级的状态。

状态和入口对齐后，链路会更直：

- page keyboard
- page interaction
- dataView.selection

### 2. currentView 更容易简化

一旦把 selection 拿走，`currentView` 更容易收缩成：

- projection
- projection commands

而不是：

- projection
- projection-local interaction state
- page-wide selection bridge

### 3. 更方便后续处理跨视图 transient state

你现在已经有：

- `valueEditor`
- `inlineSession`

把 `selection` 也抽成独立 domain 后，`DataView` 顶层 runtime 会更清晰：

- `dataView.page`
- `dataView.currentView`
- `dataView.selection`
- `dataView.inlineSession`
- `dataView.valueEditor`

这个结构比把所有 transient state 都塞进 `currentView` 更稳。

## 不建议现在做的事情

当前阶段不建议：

- 把 selection 下沉到 engine
- 把 selection 持久化到 document
- 为每个 view 同时维护一份 selection map
- 把 table `gridSelection` 也一起并进同一轮

原因：

- 这些都会把问题扩大
- 当前产品规则下没有必要
- 先把 row/card selection 的 page-global ownership 理顺，收益已经很大

## 推荐目录

推荐新增：

- `dataview/src/react/selection/types.ts`
- `dataview/src/react/selection/api.ts`
- `dataview/src/react/selection/index.ts`

推荐新增 dataview hooks：

- `dataview/src/react/dataview/useSelection.ts`

推荐 provider 接入：

- `dataview/src/react/dataview/provider.tsx`

## 推荐迁移顺序

### 第一步：抽出独立 selection domain

目标：

- 新建 `react/selection`
- 复用现有 `selection.ts` 里的纯算法
- provider 暴露 `dataView.selection`

此时先不动大量业务组件。

### 第二步：让 currentView 成为 facade

把：

- `currentView.selection`
- `currentView.commands.selection`

改成基于 `dataView.selection` 的转发层。

这样 `currentView/store.ts` 就不再拥有自己的 selection store。

### 第三步：React 消费点逐步迁移

把常见消费点逐步迁移成直接读：

- gallery controller
- kanban selection
- page keyboard host
- table row selection

优先迁“页面级”和“容器级”入口。

### 第四步：裁掉 currentView.selection 兼容层

当所有 React 侧消费点都完成迁移后，删除：

- `CurrentView.selection`
- `Commands.selection`

并同步清理相关类型。

## 对 table 的影响

table 当前有两层选择：

1. row selection
2. grid selection

这次重构只应该处理第 1 层：

- row selection = page-global `selection`

不处理第 2 层：

- grid selection 仍然由 table controller 自己管理

原因：

- 它们语义不同
- grid selection 依赖 table 特有的二维坐标和单元格导航
- 混在一轮会让边界再次变脏

## 最终目标图

```ts
export interface DataViewContextValue {
  engine: GroupEngine
  page: PageSessionApi
  currentView: CurrentViewApi
  selection: SelectionApi
  inlineSession: InlineSessionApi
  valueEditor: ValueEditorApi
}
```

其中：

- `currentView` 负责“当前 view 是什么、它的 projection 是什么”
- `selection` 负责“当前页面在 active view 中选中了什么”
- `inlineSession` 负责“当前页面里哪个 appearance 正在 inline edit”
- `valueEditor` 负责“当前打开的值编辑器会话”

这个拆法职责最稳定。

## 一句话结论

`selection` 应该提升为 `DataView` 下独立的 page-global runtime state，而不是继续挂在 `currentView` 上，也不是直接混进 `page.session`。

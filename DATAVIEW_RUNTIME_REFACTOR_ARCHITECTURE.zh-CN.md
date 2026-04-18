# DATAVIEW Runtime 重构方案

## 1. 目标

本文档讨论的是 dataview 当前 runtime 装配方式是否应该重构，以及如果允许不计迁移成本、以长期最优为目标，应该重构成什么样。

结论先写清楚：

- 现在 [dataview/packages/dataview-react/src/dataview/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/dataview/runtime.ts) 这一层复杂度确实偏高
- 当前复杂度的核心来源不是 React，而是 headless runtime、UI host、engine write、query read、session policy 被混在一起
- 有必要把大部分 `src/runtime` 从 `dataview-react` 里抽成新的 headless runtime 包
- 但不建议只是“把文件挪出去”，而是应该连模型一起重做，明确单向依赖和层级边界

本文档的目标是：

- 尽量减少复杂度
- 尽量减少中间层翻译
- 允许彻底重构，不为兼容旧结构强行妥协
- 把 `local state`、`local state mutate`、`persist write`、`query/read`、`user intent/action` 明确拆开
- 每层只依赖下一层，不允许横向互调和反向耦合

## 2. 当前问题

### 2.1 `dataview-react` 同时承担了太多职责

当前 `dataview-react` 里至少混着五类东西：

- React provider / hook / host 组件
- headless session controller
- engine 读写编排
- 跨域互斥策略
- 局部 UI 交互状态

以 [dataview/packages/dataview-react/src/dataview/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/dataview/runtime.ts) 为例，这个文件现在同时在做：

- 创建 page session
- 创建 drag / marquee / selection / inlineSession / createRecord / valueEditor
- 根据 active view 和 items 维护 session 有效性
- 处理 selection 和 inline editing 的互斥
- 创建 page derived state
- 汇总 dispose 生命周期

这意味着它并不是一个简单的 assembly 文件，而是一个隐式的“会话编排中心”。

### 2.2 当前的 runtime controller 不是 React 特有问题

例如这些模块，本质上都更像 headless controller，而不是 React 组件能力：

- [dataview/packages/dataview-react/src/runtime/selection/controller.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/runtime/selection/controller.ts)
- [dataview/packages/dataview-react/src/runtime/inlineSession/api.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/runtime/inlineSession/api.ts)
- [dataview/packages/dataview-react/src/runtime/createRecord/api.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/runtime/createRecord/api.ts)
- [dataview/packages/dataview-react/src/runtime/valueEditor/api.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/runtime/valueEditor/api.ts)
- [dataview/packages/dataview-react/src/runtime/store.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/runtime/store.ts)

这些模块大多数并不依赖 React DOM，也不依赖 hook。它们只是碰巧目前放在 `dataview-react` 里。

### 2.3 “状态”和“状态修改器”没有被拆开

当前很多 controller 的暴露方式是：

- 一个 store
- 一组 command / open / close / enter / exit 方法
- 有时再附带 query / subscribe / listener

这种模式短期写起来很方便，但长期会出现两个问题：

- 读侧和写侧都直接拿同一个 runtime 对象，边界不清晰
- 任何 feature 都容易顺手去调别的 domain 的 mutate API，形成网状依赖

比如：

- inline session 会因为 selection 改变而被 runtime 强制关闭
- marquee host 会直接读写 selection、inline session、value editor
- value editor host 会直接调用 engine 写字段
- create record 成功后会立刻调用具体 view 的打开逻辑

这些都说明“意图层”“状态层”“写入层”没有分离。

### 2.4 cross-domain policy 被写成了散落绑定

当前系统里存在很多真实的业务规则，例如：

- view 改变时 inline session 失效
- selection 出现时 inline session 要退出
- value editor 打开时 page lock 生效
- create record 成功后需要尝试打开 editor

这些规则本身不是问题，问题在于它们目前主要通过：

- runtime 里订阅 A 再改 B
- host 里读 A 再改 B
- 组件里拿整个 `useDataView()` 后随时横向调用

结果是：

- 策略没有统一归属
- 状态流向不清晰
- 新增一个 feature 时，很难知道应该把规则放在哪一层

### 2.5 `page state` 实际上掺了多种性质的数据

[dataview/packages/dataview-react/src/page/session/api.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/session/api.ts) 和 [dataview/packages/dataview-react/src/page/state/page.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/state/page.ts) 当前把这些东西放在一起：

- query/settings 的 UI session
- value editor open 派生出的 lock
- active view/document 驱动出的合法化逻辑

这会让 `page` 看起来像一个统一领域，但它其实不是。它是：

- 一部分本地 UI route state
- 一部分来自 engine/read model 的衍生结果
- 一部分来自 editor session 的聚合状态

也就是不同来源的数据被组在一个对象里。

## 3. 根因判断

核心根因不是“实现细节不好”，而是模型顺序反了。

现在更像这样：

1. 先为每个 feature 建一个 controller
2. 然后在一个 runtime 里把 controller 拼起来
3. 再用订阅和 host 去修补 feature 之间的关系

长期更合理的顺序应该是：

1. 先定义清晰的层次和依赖方向
2. 再定义每层的数据边界
3. 最后为每个子域实现 reducer / service / adapter

也就是说，现在缺的不是一个新的 `runtime.ts`，而是一个更基础的 runtime 分层模型。

## 4. 重构目标

### 4.1 目标架构原则

新的 runtime 必须满足：

- 单向依赖
- 读写分离
- 用户意图与持久写入分离
- React 只是 host，不是业务编排中心
- engine 只负责持久数据读写，不负责 UI session
- query/read 不直接持有 UI mutate 能力
- local state 不直接执行 persist write
- 所有跨域策略都进入显式 orchestration 层

### 4.2 要避免的反模式

重构后必须避免：

- `useDataView()` 暴露一个巨大的万能 runtime 对象
- 组件同时拿到 state + mutate + engine write + orchestration 能力
- controller 之间互相直接调用
- derived state 反向修改源状态
- host 组件承担业务策略
- “先创建对象，再靠各种 subscribe 补规则”的模式继续扩散

## 5. 最终推荐分层

长期最优建议把 runtime 重构为 5 层，严格单向依赖：

```text
user intent/action
  -> local state mutate
    -> local state
      -> persist write
        -> query/read
```

这里的关键不是命名，而是职责顺序。

### 5.1 第 1 层：`query/read`

职责：

- 提供 document / active view / item list / record snapshot / field schema 等只读能力
- 提供稳定、可订阅、可复用的 read model
- 不暴露任何本地 UI state
- 不暴露任何持久写入动作

它是整个 runtime 最底层的事实来源。

建议直接依赖 engine，但做一层最薄的 query facade，避免上层到处散读 engine 内部结构。

例如：

```ts
interface DataViewReadModel {
  document: ReadStore<DataDoc>
  activeViewId: ReadStore<ViewId | undefined>
  activeView: ReadStore<View | undefined>
  activeItems: ReadStore<ItemList | undefined>
  activeViewState: ReadStore<ViewState | undefined>
}
```

这里强调一点：

- `read model` 只回答“现在是什么”
- 不回答“接下来该怎么改”

### 5.2 第 2 层：`persist write`

职责：

- 对 engine 写入能力做清晰封装
- 把持久化写操作标准化成少量 use case
- 不读写 local UI session
- 不决定何时调用

例如：

```ts
interface DataViewWriteService {
  records: {
    create(input: ActiveRecordCreateInput): RecordId | undefined
    remove(ids: readonly RecordId[]): void
    setField(recordId: RecordId, fieldId: FieldId, value: unknown): void
    clearField(recordId: RecordId, fieldId: FieldId): void
  }
  views: {
    setFilter(...): void
    setSort(...): void
    setGroup(...): void
  }
}
```

这一层本质上是“持久命令服务”。

注意：

- 它不维护 selection
- 不知道 value editor
- 不知道 popover
- 不知道是否来自 table / kanban / gallery

### 5.3 第 3 层：`local state`

职责：

- 维护纯本地 session state
- state 必须是可序列化、可快照、易推导的 plain object
- 不直接执行 engine write
- 不直接依赖 React

建议把当前分散 controller store 的做法，收敛为一个统一的 session state tree：

```ts
interface DataViewSessionState {
  pageUi: {
    queryBar: {
      visible: boolean
      route: QueryBarRoute | null
    }
    settings: {
      visible: boolean
      route: SettingsRoute
    }
  }
  editing: {
    inline: InlineEditState | null
    valueEditor: ValueEditorState | null
  }
  selection: SelectionState
  creation: CreateFlowState | null
  marquee: MarqueeState | null
}
```

要求：

- 这里只存“本地状态本身”
- 不放 engine document
- 不放 `activeView` 的只读投影
- 不放会随时失效的 DOM 节点引用
- 不放实际写操作函数

### 5.4 第 4 层：`local state mutate`

职责：

- 只负责改本地 state
- 用 reducer / command handler 的方式显式定义动作
- 不直接执行 persist write
- 不依赖 React host

建议形式：

```ts
type DataViewLocalAction =
  | { type: 'page.query.open', route: QueryBarRoute }
  | { type: 'page.query.close' }
  | { type: 'editing.inline.enter', target: InlineTarget }
  | { type: 'editing.inline.exit', reason: InlineExitReason }
  | { type: 'editing.valueEditor.open', session: ValueEditorState }
  | { type: 'editing.valueEditor.close', reason: ValueEditorCloseReason }
  | { type: 'selection.replace', ids: readonly ItemId[] }
  | { type: 'creation.start', draft: CreateFlowState }
  | { type: 'creation.finish' }
```

这一层只产出下一个本地 state。

建议不要继续保留“每个模块一个自定义 controller API”的形态，而是统一成：

- `getState()`
- `subscribe()`
- `dispatch(localAction)`

最多在外层加很薄的 typed action creator，不再给每个 domain 发明一套 `open/close/enter/exit/clear/restore` 风格 API。

### 5.5 第 5 层：`user intent/action`

职责：

- 接收用户语义级意图
- 负责编排 local mutate、persist write、query read
- 是唯一允许跨层调用的 orchestration 层
- 所有跨域策略都写在这里

这层不再是一个大而全的 `runtime.ts`，而应该是“按 use case 拆分的 intent handlers”。

例如：

```ts
interface DataViewIntentApi {
  createRecord(input: CreateRecordIntent): Promise<void>
  openValueEditor(input: OpenValueEditorIntent): void
  commitValueEditor(input: CommitValueEditorIntent): void
  beginInlineTitleEdit(input: BeginInlineTitleEditIntent): void
  applySelection(input: ApplySelectionIntent): void
  openQueryBar(input: OpenQueryBarIntent): void
}
```

这层的规则应该显式可读，例如：

- `createRecord` 先根据 read model 校验 owner view
- 再调用 write service 创建 record
- 再更新 `creation` local state
- 再等待 read model 出现对应 item
- 再派发 `open editor` 的本地动作

也就是说，跨域时序必须写在 intent 层，而不是散落在 host 和 controller 订阅里。

## 6. 建议的新包边界

建议新增 `dataview-runtime` 包，或者命名为 `dataview-session` 也可以，但从职责上看 `dataview-runtime` 更直观。

长期建议的包边界如下。

### 6.1 `dataview-engine`

职责不变：

- document model
- active view query
- persistent writes

### 6.2 `dataview-runtime`

这是新增的 headless 包，负责：

- read model facade
- write service facade
- local session state
- local reducers / dispatch
- intent handlers / orchestration
- policy rules

它不包含：

- React hook
- React provider
- JSX host
- DOM anchor / popover position / overlay

### 6.3 `dataview-react`

重构后只保留 React 相关内容：

- provider
- hook
- store selector hook
- host 组件
- DOM anchor / overlay / position adapter
- table / gallery / kanban 这些 view 实现

它通过 `dataview-runtime` 消费 headless runtime，不再自己定义 runtime 主体。

## 7. 推荐目录结构

建议最终形态接近下面这样：

```text
packages/
  dataview-engine/
  dataview-runtime/
    src/
      read/
        model.ts
        facade.ts
      write/
        records.ts
        views.ts
        service.ts
      state/
        types.ts
        reducer.ts
        store.ts
      intent/
        createRecord.ts
        valueEditor.ts
        inlineEdit.ts
        selection.ts
        queryBar.ts
      policy/
        editing.ts
        selection.ts
        lifecycle.ts
      session/
        createSession.ts
        types.ts
  dataview-react/
    src/
      dataview/
        provider.tsx
        hooks.ts
      hosts/
        ValueEditorHost.tsx
        MarqueeHost.tsx
      adapters/
        domAnchor.ts
        overlay.ts
      views/
        table/
        gallery/
        kanban/
```

## 8. 关键设计决策

### 8.1 保留 `useDataView()` 主入口，但必须改成分区对象

现在的问题，不是一定不能有 `useDataView()`，而是当前 `useDataView()` 更像一个扁平的万能 runtime 对象，任何组件都能顺手做很多事。

长期更合适的形态是：

```ts
const dataView = useDataView()
```

但它返回的不是一个平铺的大对象，而是少数几个稳定分区：

```ts
dataView.read
dataView.session
dataView.intent
```

必要时，少量底层 host 或调试工具可以再拿：

```ts
dataView.write
```

但原则上，大多数 React 组件只应该依赖：

- `dataView.read`
- `dataView.session`
- `dataView.intent`

不应该大量直接依赖 `write`。

如果未来在个别复杂场景下需要拆 hook，也应该只是这一级别：

```ts
const read = useDataViewRead()
const session = useDataViewSession()
const intent = useDataViewIntent()
```

而不是继续往外暴露一堆零散的小 hook。

### 8.2 不再让 host 组件承载业务策略

例如 value editor host 未来应只负责：

- 根据 local state 渲染弹层
- 把 DOM 事件翻译成 intent
- 做定位和尺寸计算

它不应该直接：

- 调 engine 写字段
- 决定 selection 如何同步
- 决定 page lock 的业务含义

这些都应该在 intent 层和 local reducer 层完成。

### 8.3 page/query/settings 要回归纯 UI session

`pageUi` 只存本地 route 和可见性：

- query bar 是否显示
- 当前 filter/sort picker route
- settings route

像 `valueEditorOpen -> lock` 这种聚合结果，不应继续存回 page state，而应做 selector：

```ts
const pageLock = dataView.session.select.pageLock()
```

也就是：

- 原始状态只存最小事实
- 聚合结果用 selector 派生

### 8.4 selection 要继续 headless，但只保留为 state machine

selection 是最适合 headless 化的模块之一，应该保留，但要改边界：

- selection domain 和 snapshot 可以继续存在
- selection reducer / action 继续是纯逻辑
- 但 selection 不应该再通过 runtime binding 去直接驱逐 inline session

正确做法是：

- 用户触发 selection intent
- intent handler 根据 policy 决定是否同时 dispatch `editing.inline.exit`
- 然后再 dispatch `selection.replace`

也就是把“策略”从 `subscribe(A) => mutate(B)` 改成“在 intent handler 里显式编排”。

### 8.5 create record / value editor / inline edit 都改成 flow

当前这几类能力本质上都不是简单 controller，而是时序流程：

- create record: create -> wait visible -> open editor
- value editor: open -> edit -> commit/cancel -> maybe close action
- inline edit: enter -> commit/cancel -> exit

所以它们更适合建成 `flow state + intent handler`，而不是单纯的 `open()/close()` 对象。

## 9. 推荐的数据流

### 9.1 创建 record

目标流转：

```text
UI click
  -> intent.createRecord
    -> read model 校验上下文
    -> writeService.records.create(...)
    -> dispatch(creation.start)
    -> 等待 read model 中出现 record/item
    -> dispatch(editing.valueEditor.open 或 editing.inline.enter)
    -> dispatch(creation.finish)
```

这里有几个重要点：

- “等待 item 出现”的逻辑属于 intent flow
- 不属于 view 组件自己写的 `requestAnimationFrame + retry`
- 也不属于 engine

### 9.2 提交 value editor

目标流转：

```text
UI editor submit
  -> intent.commitValueEditor
    -> read 当前 session
    -> writeService.records.setField / clearField
    -> dispatch(editing.valueEditor.close)
    -> 按 policy 决定后续动作
```

这样 host 不需要知道字段写入细节。

### 9.3 选择一条记录

目标流转：

```text
UI pointer/keyboard
  -> intent.applySelection
    -> 依据 policy 判断是否关闭 inline edit / value editor
    -> dispatch(editing.inline.exit?)
    -> dispatch(editing.valueEditor.close?)
    -> dispatch(selection.replace / add / toggle)
```

这样 selection 与 editing 的互斥逻辑就从散落订阅变成显式业务规则。

## 10. 如何减少中间层翻译

这次重构里，减少复杂度的关键不是“文件数更少”，而是“翻译次数更少”。

建议采用以下原则。

### 10.1 统一 intent 输入模型

不要再让每个视图自己拼一套半自定义参数。

例如 `create record` 只保留一个长期输入模型：

```ts
interface CreateRecordIntent {
  ownerViewId?: ViewId
  sectionKey?: SectionKey
  before?: ItemId
  initialValues?: Partial<Record<FieldId, unknown>>
  open?: {
    kind: 'value-editor' | 'inline-title' | 'none'
    fieldId?: FieldId
    seedDraft?: string
  }
}
```

table / kanban / gallery / toolbar 只是构造这个 intent，不再各自实现一套 create 时序。

### 10.2 selector 输出直接面向消费方

不要再先做一个“page state 聚合对象”，然后每个 host 再从中反推自己要的东西。

但这里也要避免另一个极端：

- 不要把公共接口做成满天飞的 `selectXxx`
- 不要让业务组件去记忆一堆零散 selector 名字

更合适的方式是把 selector 收敛到 `session` 域下面，对外只暴露两种稳定访问方式：

```ts
const dataView = useDataView()

const isValueEditorOpen = dataView.session.select.isValueEditorOpen()
const pageLock = dataView.session.select.pageLock()
const canStartMarquee = dataView.session.select.canStartMarquee()
const activeInlineTarget = dataView.session.select.activeInlineTarget()
```

或者提供一个通用 selector hook：

```ts
const pageLock = useDataViewSessionSelector(
  state => state.derived.pageLock
)
```

也就是说：

- selector 仍然需要
- 但 selector 应该收口到 `session.select` 或统一 selector hook
- selector 是访问方式，不应该成为到处散落的产品级主 API

### 10.3 DOM 信息只在 React adapter 层存在

例如：

- anchor rect
- overlay container
- measured height
- hovered element

这些都不要进入 headless runtime state。

headless runtime 最多接受已经归一化后的输入，例如：

```ts
type AnchorRect = {
  x: number
  y: number
  width: number
}
```

## 11. 建议删除的旧模式

重构时建议明确删除这些模式，而不是保留兼容壳：

- `createDataViewSession()` 这种“大组装 + 绑定 + dispose”中心
- `page.store + page.query + page.settings` 这种混合 UI route 与聚合结果的模型
- 每个 runtime 模块都暴露一套自定义 controller API
- host 组件直接操作 engine write
- runtime 内部通过订阅彼此来表达业务规则
- 组件通过扁平 `useDataView()` 直接拿所有能力

如果还保留这些旧模式，只是把文件挪到新包，复杂度不会真正下降。

## 12. 迁移方案

虽然本文档允许不计成本重构，但真正落地时仍建议分三阶段。

### 12.1 第一阶段：先做模型切分，不拆产品行为

先把现有能力按边界切开：

- 抽出 `read model`
- 抽出 `write service`
- 建立统一 session state tree
- 把 page/query/settings/valueEditor/inline/creation/marquee/selection 迁入同一个 headless session store

这一阶段不要求外部 API 完全变，但内部关系要先理顺。

### 12.2 第二阶段：把业务规则迁到 intent 层

逐步去掉这些订阅式耦合：

- selection 改变自动关 inline
- active view 改变自动取消 creation/open retry
- value editor open 推导 page lock

把它们改成：

- local reducer
- selector
- intent handler

### 12.3 第三阶段：React 只剩 host 和 adapter

当 headless runtime 稳定后，再让 `dataview-react` 只承担：

- provider
- hooks
- host
- DOM adapter
- 视图组件

此时再正式拆出 `dataview-runtime` 包最干净。

## 13. 最终建议

我的判断是：

- 有必要拆新包
- 但真正值得做的是“runtime 模型重构”，不是“目录迁移”

长期最优方案是：

1. 新建 `dataview-runtime`
2. 以 `read / write / local state / local mutate / user intent` 五层重做 runtime
3. 把所有 cross-domain policy 收敛到 intent/orchestration 层
4. React 退回到 host 和 adapter
5. 最终让 `useDataView()` 保留主入口，但返回清晰分区的 `read / session / intent` 对象，而不是扁平万能对象

如果这套方案做到位，收益会非常明显：

- 复杂度显著下降
- 中间层翻译显著减少
- feature 间耦合关系变得可读
- table / kanban / gallery / toolbar 可以共享同一套 headless flow
- 后续继续做 create record、inline editing、value editor、selection policy 时，不需要再往 `runtime.ts` 里继续堆绑定逻辑

## 14. 一句话结论

应该拆，而且应该彻底按单向分层重做：

`query/read -> persist write -> local state -> local state mutate -> user intent/action` 这几层各司其职；React 侧可以保留 `useDataView()` 主入口，但它只能是分区后的消费壳，不能继续做扁平 runtime 编排中心。

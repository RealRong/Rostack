# Dataview Engine Runtime React 主链收敛方案

本文聚焦一件事：

在 `active derive runtime` 已经完成 projection-runtime 重写之后，重新审视 `dataview` 的整条运行链：

```text
engine -> runtime -> react
```

目标不是局部修 bug，也不是只看某个热点函数，而是回答下面三个问题：

1. 现在整条链到底怎么流动
2. 中间哪些层是必要边界，哪些是冗余中转
3. 长期最优、复杂度最低、性能不下降的最终形态应该是什么

约束保持不变：

- 不为兼容保留历史层
- 不为了“抽象好看”增加新中间层
- 先保证边界清楚，再讨论收敛
- 不牺牲当前按 store/keyed store 增量更新的性能基础

---

## 1. 当前主链

当前整条链可以准确拆成 5 段。

### 1.1 engine

`engine` 负责：

- document commit
- index derive
- active projection derive
- 产出 `EngineResult`

最终对外语言是：

- `snapshot`
- `delta`

也就是说，`engine` 的公共出口已经很干净：

```text
EngineCore.subscribe(result)
result = {
  snapshot,
  delta
}
```

这部分边界是对的。

### 1.2 runtime/source

`runtime/source` 的职责是把 engine 的：

- `snapshot`
- `delta`

转换成：

- `ReadStore`
- `KeyedReadStore`
- 细粒度增量同步源

核心入口是：

- `dataview/packages/dataview-runtime/src/source/createEngineSource.ts`

它做了两件事：

1. 初始 `snapshot -> source stores`
2. 后续 `delta + snapshot -> patch stores`

一句话：

> `runtime/source` 是 engine 公共结果到 runtime 订阅源的 adapter。

### 1.3 runtime/dataview

`dataview-runtime` 的总装配入口是：

- `dataview/packages/dataview-runtime/src/dataview/runtime.ts`

这里会在 source 之上继续组装：

- page session
- inline session
- value editor
- selection
- marquee
- table runtime
- page/gallery/kanban model

所以这里本质上是在做：

```text
source -> runtime session + runtime model + runtime intent
```

### 1.4 react session/provider

`dataview-react` 的 provider 层：

- 创建 `DataViewRuntime`
- 再补 react 专属的 `drag / marquee bridge`
- 放入 React Context

入口是：

- `dataview/packages/dataview-react/src/dataview/runtime.ts`
- `dataview/packages/dataview-react/src/dataview/provider.tsx`

这一层的本质不是业务投影，而是：

- 宿主注入
- React 生命周期管理
- React 专属 bridge

### 1.5 react view runtime

不同视图现在走的是不同路线。

#### table

当前 table 是：

```text
active source
  -> table runtime
  -> table ui runtime
  -> components
```

#### gallery

当前 gallery 是：

```text
active source
  -> gallery model
  -> gallery react runtime
  -> components
```

#### kanban

当前 kanban 是：

```text
active source
  -> kanban model
  -> kanban react runtime
  -> components
```

这三个分支并不完全一致，这正是今天复杂度继续存在的来源之一。

---

## 2. 哪些层是必要的

不是中间层越少越好。

真正长期稳定的系统，不是把所有层都删掉，而是只保留真正承载边界的层。

当前链路里，下面这些层我认为是必要的。

## 2.1 `engine -> runtime/source` 是必要 adapter

这层不该删除。

原因很简单：

- `engine` 对外讲的是 `snapshot + delta`
- `react` 消费的是订阅式 store
- 中间必须有一层把 engine 结果翻译成 runtime 可订阅源

如果把这层删掉，结果只会是：

- 要么 react 自己理解 `snapshot + delta`
- 要么 runtime/model 各处重复写 patch 逻辑

这两种都更差。

所以：

> `runtime/source` 是必要边界，不是冗余层。

## 2.2 `tableRuntime` 是必要的 view-domain 读模型

`tableRuntime` 的职责是把通用 `ActiveSource` 收成 table 自己稳定消费的读模型：

- `grid`
- `view`
- `column`
- `summary`

这层不是 UI 层。

这层也不是 source adapter。

它的正确定位是：

> table 视图域自己的 runtime read model。

这层继续存在是合理的。

## 2.3 `tableUiRuntime` 也是必要的

`tableUiRuntime` 处理的是：

- selection
- hover
- fill
- chrome
- virtual
- DOM reveal
- interaction

这些不是 `tableRuntime` 的职责。

它们属于明确的：

- UI runtime
- 交互 runtime
- layout runtime

所以：

> `tableRuntime -> tableUiRuntime` 这条双层结构是合理的，不是冗余。

## 2.4 react provider 层也是必要的

React provider 负责：

- create runtime
- context 注入
- dispose
- react bridge

这一层足够薄，也确实在做宿主该做的事。

不需要继续收。

---

## 3. 明确存在的冗余

真正明显的冗余，主要不在 engine，也不在 source adapter，而是在 runtime 与 react 的上层组合方式。

## 3.1 `EngineSourceRuntime.apply/reset` 是过度暴露

当前 `EngineSourceRuntime` 对外暴露：

- `source`
- `reset`
- `apply`
- `clear`
- `dispose`

但从实际使用看，真正被外部依赖的几乎只有：

- `source`
- `dispose`

`reset/apply` 更像 source runtime 自己的内部执行能力，而不像稳定公共 API。

这类 API 暴露的问题不是性能，而是：

- 让外部误以为 source 可以被任意二次驱动
- 增加边界理解成本
- 让 source runtime 看起来像“半公开可控执行器”

长期最优应当收成：

```ts
interface EngineSourceRuntime {
  source: EngineSource
  dispose(): void
}
```

`reset/apply/clear` 留内部实现，不再作为 runtime 公共面。

## 3.2 `source.page` 是重复中间层

当前 `dataview-runtime` 又额外导出：

- `source.page.queryVisible`
- `source.page.queryRoute`

但这两个值本质上只是从 `pageStateStore` 再拆出来。

这类问题的本质是：

- `page session` 已经是页面态真相
- `source.page` 又复制一份页面态投影

这不是底层模型，只是便利层。

长期最优建议：

- 删除 `source.page`
- 页面相关读取直接来自 `session.page.store`

## 3.3 `session.store` 是聚合便利层，不是必要真相

当前还有一层：

- `session.store`

它把：

- page
- editing
- selection

重新组装成一个总 store。

这不是错误，但它也不是必需真相层。

如果长期要收敛边界，建议只保留两种东西：

1. 细粒度 session 子域 store
2. 真正高频消费的聚合 selector

而不是始终保留一个大而全的 `session.store`。

如果这个总 store 使用面很少，可以直接删。

## 3.4 `active.view.ready` 是冗余布尔位

当前 `ActiveSource.view` 里有：

- `ready`
- `id`
- `type`
- `current`

其中 `ready` 基本可以由：

- `id !== undefined`
- 或 `current !== undefined`

直接推导。

这是典型的重复真相。

长期最优应删除：

- `active.view.ready`

只保留：

- `id`
- `type`
- `current`

## 3.5 gallery 的 domain facts 被投影了两次

当前 gallery 已经有：

- `runtime/model/gallery`

它会产出：

- `body`
- `section`
- `card`
- `content`

但在 react 的：

- `views/gallery/runtime.ts`

里，又重新从 source 直接读取并再次投影：

- `sections`
- `grouped`
- `size`
- `canReorder`

也就是说，同一份 active facts 被拆成了两条并行链：

```text
source -> gallery model
source -> gallery react runtime
```

然后这两条链在 react runtime 里重新汇合。

这就是明确冗余。

问题不只是“多写几行”，而是：

- domain read model 不再唯一
- 同类语义分散到 model 和 react runtime
- 后续改字段时容易漏一边

## 3.6 kanban 的重复更明显

`kanban model` 已经提供：

- `board`
- `section`
- `card`
- `content`

但 `views/kanban/runtime.ts` 里仍然直接从 source 再读：

- sections
- grouped
- cardsPerColumn
- canDrag

然后再把 `model.kanban.board` 混进来。

这说明：

> `kanban model` 和 `kanban react runtime` 的职责边界还没有完全收干净。

这是整条链里目前最值得继续收的地方。

---

## 4. 还有一类“小冗余”

这些问题没有上面严重，但全局看会持续制造维护成本。

## 4.1 `ids + keyed store -> list` 的 materialize 逻辑到处重复

现在已经有：

- `createEntityListStore(...)`

但很多地方还是自己手写：

- `ids -> get(key) -> flatMap -> list`

尤其是：

- gallery runtime 的 `sectionsStore`
- kanban runtime 的 `sectionsStore`

这类逻辑应继续往更底层设施收：

```ts
createPresentKeyedListStore({
  ids,
  values
})
```

让“把 ids + keyed store 转成有序实体列表”成为统一基础设施。

## 4.2 table UI runtime 仍然直接穿透 engine read

在 table UI runtime 里，打开 cell 时会直接调：

- `engine.active.read.cell(...)`

这不是性能问题，而是边界略脏。

长期最优应该是：

- 读统一来自 runtime/source/model
- 写统一来自 engine/intent/api

不要在 UI runtime 内部混用 runtime read 与 engine read。

---

## 5. 当前复杂度到底主要高在哪

不是 `engine -> source` 这层高。

也不是 `tableRuntime -> tableUiRuntime` 这层高。

真正让链路复杂的，是下面两件事同时存在：

1. `source` 作为基础层已经很完整
2. 但 `model` 没有成为视图域唯一读模型
3. 于是 react runtime 又继续直接面向 source 做第二轮 domain projection

一旦出现这种模式，系统就会变成：

```text
同一份事实
  -> source 里一份
  -> model 里一份
  -> react runtime 里又一份
```

这才是现在真正的复杂度来源。

---

## 6. 长期最优的最终职责切分

长期最优不是继续堆新层，而是把现有层职责切干净。

最终建议固定成下面这套结构。

## 6.1 engine

只负责：

- document write / history
- index derive
- active derive
- `snapshot + delta`

明确不负责：

- store
- view model
- react layout

## 6.2 runtime/source

只负责：

- engine result -> subscribable stores

它是基础 adapter。

不负责：

- 页面态
- 视图域组合语义
- react UI 行为

## 6.3 runtime/model

应该成为：

> 各视图域唯一的 read model 层。

也就是说：

- `tableRuntime`
- `galleryModel`
- `kanbanModel`
- `pageModel`

都应该在这一层完成各自 domain projection。

最终 react 不应再重复做一遍同类 projection。

## 6.4 react runtime

react runtime 只负责：

- layout
- virtual
- drag
- hover
- marquee bridge
- interaction
- DOM registry / hit test

一句话：

> react runtime 只处理“如何展示和交互”，不再处理“业务数据怎么投影”。

---

## 7. 按视图看最终收敛目标

## 7.1 table

table 目前已经接近最终形态：

```text
source
  -> tableRuntime
  -> tableUiRuntime
  -> components
```

这里只需要继续收的小点是：

- 避免 UI runtime 直接穿透 engine read
- 把少量列表 materialize 继续抽成基础设施

table 整体结构不需要大改。

## 7.2 gallery

gallery 长期最优应改成：

```text
source
  -> galleryRuntimeModel
  -> galleryReactRuntime(layout/drag/marquee only)
  -> components
```

其中：

- grouped
- section list
- section count
- size / wrap / canDrag
- card 领域态

都应由 runtime model 单独产出。

react runtime 不再自己从 source 再读一遍这些事实。

## 7.3 kanban

kanban 长期最优也应改成：

```text
source
  -> kanbanRuntimeModel
  -> kanbanReactRuntime(layout/visibility/drag only)
  -> components
```

其中：

- grouped
- board config
- section domain data
- card domain data

全部由 model 产出。

react runtime 只保留：

- layout
- visibility window
- drag
- marquee scene

---

## 8. API 收敛建议

这里给出长期最优的 public/internal 收敛方向。

## 8.1 `EngineSourceRuntime`

建议收成：

```ts
interface EngineSourceRuntime {
  source: EngineSource
  dispose(): void
}
```

不再暴露：

- `reset`
- `apply`
- `clear`

## 8.2 `DataViewRuntime`

建议长期只保留 4 类面：

```ts
interface DataViewRuntime {
  engine: Engine
  source: DataViewSource
  session: DataViewSessionApi
  intent: DataViewIntentApi
  model: DataViewModel
  dispose(): void
}
```

其中进一步建议：

- `source.page` 删除
- `source.active.view.ready` 删除
- `session.store` 如果使用面很少，也删除

## 8.3 视图统一模式

三个视图最终统一成下面的模式：

```text
source
  -> runtime view model
  -> react ui runtime
  -> component
```

不要再出现：

```text
source
  -> runtime model
source
  -> react runtime
```

这种双轨投影。

---

## 9. 实施顺序

如果要继续做下一轮收敛，建议按下面顺序。

## 第一阶段：先删 source/runtime 的明显冗余 API

先删：

- `EngineSourceRuntime.apply`
- `EngineSourceRuntime.reset`
- `EngineSourceRuntime.clear`
- `source.page`
- `active.view.ready`

这一步风险最低，收益也最直接。

## 第二阶段：统一列表 materialize 基础设施

补一个统一底层 helper，例如：

```ts
createPresentKeyedListStore({
  ids,
  values
})
```

替换：

- `createEntityListStore`
- gallery runtime 自写的 `sectionsStore`
- kanban runtime 自写的 `sectionsStore`
- 其他同类 `ids -> keyed store -> list` 逻辑

## 第三阶段：把 gallery model 拉成唯一 domain read model

把当前 react runtime 里直接读取 source 的 domain facts 全部迁回 gallery model。

react runtime 只保留：

- virtual layout
- drag
- marquee

## 第四阶段：把 kanban model 拉成唯一 domain read model

把当前 react runtime 里直接读取 source 的：

- grouped
- sections
- cardsPerColumn
- canDrag

等事实迁回 kanban model。

react runtime 只保留：

- layout
- visibility
- drag
- marquee

## 第五阶段：统一 table/gallery/kanban 的 runtime 组织方式

最终把三条线都收成：

```text
view runtime model
view react runtime
```

其中：

- 前者只讲数据
- 后者只讲交互与布局

---

## 10. 最终结论

现在这条链里，最核心的判断如下。

### 10.1 不是所有中间层都冗余

必须保留的层有：

- `engine -> runtime/source`
- `tableRuntime`
- `tableUiRuntime`
- react provider

这些层都在承接真实边界。

### 10.2 当前真正的冗余主要在 runtime 与 react 之间

尤其是：

- gallery
- kanban

这两条线仍然存在：

- model 已经投影一遍
- react runtime 又从 source 再投影一遍

这才是当前长期复杂度的主要来源。

### 10.3 长期最优不是继续加层，而是把现有层职责切干净

最终应固定成：

```text
engine
  -> runtime/source
  -> runtime/view model
  -> react/ui runtime
  -> component
```

并满足：

- source 不再夹带 page 这类额外便利层
- model 成为视图域唯一 read model
- react runtime 不再重复做业务投影
- UI 读路径尽量不再穿透回 engine read

一句话概括：

> 这条链路的问题已经不在 engine，而在 runtime 上层还没有完全收敛成“单一数据投影 + 单一 UI runtime”的最终结构。

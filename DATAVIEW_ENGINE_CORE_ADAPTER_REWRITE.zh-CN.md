# Dataview Engine Core / Adapter 重构方案

本文只回答一个问题：

如果 `dataview-engine` 彻底按“core 不再内建 store，store 只作为 adapter 接入”的方向重构，最终形态、API 设计和实施顺序应该是什么。

本文默认前提：

- 不考虑兼容成本
- 不保留双轨实现
- 性能不能下降
- 核心目标是降低复杂度、降低重复计算、降低出错概率

---

## 1. 最终结论

长期最优方案是：

1. `engine core` 只维护普通运行时状态，不引入响应式 `store`
2. `engine core` 每次 commit 只产出一份新的 `snapshot` 和一份精确的 `change`
3. `store`、`source`、事件分发、UI 订阅都改成 `adapter`
4. adapter 只能消费 `change`，不能自己拿 `previousSnapshot/nextSnapshot` 再 diff
5. `createEngine()` 变成组装器，而不是把 `store` 当成 engine 内部语言

一句话概括：

> `dataview-engine` 的核心模型应该是 `state + snapshot + change`，而不是 `state + store + 再次 diff`

---

## 2. 为什么必须这样改

当前实现的根问题不是某几个热点函数，而是层次混了。

现在的主链大致是：

1. commit 修改 document
2. engine 内部算出新的 active snapshot
3. `source/runtime.ts` 再拿 `previousSnapshot/nextSnapshot` 做一遍 diff
4. diff 结果再喂给 `shared/core/store`
5. react/runtime 再从 store 里读

这会天然带来四类问题。

### 2.1 重复计算

典型例子就是当前的 item/source 同步：

- publish 阶段已经知道 item / section / placement 的结果
- `source/runtime.ts` 还是会重新扫一遍 `previous/next`
- `patchEntityValues()` 又会对同一批 `50k` item 做多轮 `get + compare + remove`
- `keyed.patch()` 再 clone map、再 commit、再 notify

这不是局部实现差，而是数据已经有了，后面却还在猜变化。

### 2.2 语义分裂

当前系统里同时存在：

- engine snapshot 语义
- source store 语义
- UI 订阅语义

一旦发布时间点或复用判断有一点偏差，就会出现“snapshot 是新的，但 store 还是旧的”这种问题。之前 summary 读旧值，本质上就是这个。

### 2.3 核心层被发布机制反向塑形

engine 本来应该关心：

- 文档是什么
- 当前 view 的结果是什么
- 本次 commit 变了什么

但现在它还要顺带照顾：

- `ValueStore`
- `KeyedStore`
- `DerivedStore`
- keyed patch 形式
- 订阅粒度

这会让内部模型越来越像“为了喂 store 而设计”，而不是“为了算对、算快而设计”。

### 2.4 出错面扩大

只要 adapter 自己再做 diff，就会多出一层：

- 等价判断
- 复用判断
- 删除判断
- 发布顺序
- listener fanout

这些都不是业务真相，却会制造业务 bug。

---

## 3. 重构目标

这次重构只追求四件事：

1. 核心计算只做一次
2. 变化只定义一次
3. 发布只 apply，不再推导
4. 核心和 adapter 清晰分层

对应到系统边界：

- `engine core` 负责 committed truth 和 active truth
- `publish adapter` 负责把 truth 投影成不同消费形式
- `react/runtime` 负责消费 adapter 输出

---

## 4. 非目标

下面这些不属于本次 core 重构的主目标：

- 重写 view/query/index 的业务语义
- 调整 react 组件树
- 改 UI store 实现细节
- 为兼容旧 API 保留过渡层

如果旧模型阻碍最终形态，应直接删除旧模型，而不是继续做兼容包装。

---

## 5. 最终分层

最终建议把 `dataview-engine` 拆成 3 层。

### 5.1 Core

职责：

- 保存运行时状态
- 执行 commit
- 维护 active runtime cache / index / history
- 产出 `snapshot`
- 产出 `change`
- 发布 `result`

核心要求：

- 不依赖 `shared/core/store`
- 不依赖 `ValueStore / KeyedStore / DerivedStore`
- 可以有 `Map`、cache、index、pool 这类普通可变基础设施

### 5.2 Publish

职责：

- 消费 `snapshot + change`
- 投影为 store / event / source / devtools 所需形式

核心要求：

- 只能 apply `change`
- 不能自己比较 `previousSnapshot/nextSnapshot`
- 不能重新推导业务变化

### 5.3 API

职责：

- 组装 core 和 adapter
- 暴露对外 API
- 给 `dataview-runtime` 和 `dataview-react` 提供稳定入口

---

## 6. 最终运行时模型

### 6.1 Core 内部状态

```ts
export interface EngineState {
  rev: number
  doc: DataDoc
  history: EngineHistoryState
  active: {
    plan?: ViewPlan
    index: IndexState
    cache: ViewCache
    snapshot?: ActiveSnapshot
  }
}
```

说明：

- 这里只保留普通对象状态
- `index`、`cache` 继续保留，因为它们是算法基础设施
- `snapshot` 是当前 active view 的稳定结果
- 不再有 `RuntimeStore = ValueStore<EngineRuntimeState>` 这种根 store

### 6.2 Core 输出

```ts
export interface EngineResult {
  rev: number
  snapshot: EngineSnapshot
  change?: EngineChange
  perf?: EnginePerf
}
```

这里有一个关键原则：

- `snapshot` 表示“现在是什么”
- `change` 表示“这次从上一次变成现在，具体变了什么”

两者都必须由 core 一次性产出。

---

## 7. 最终核心数据模型

### 7.1 EngineSnapshot

```ts
export interface EngineSnapshot {
  doc: DataDoc
  active?: ActiveSnapshot
}
```

### 7.2 ActiveSnapshot

```ts
export interface ActiveSnapshot {
  view: {
    id: ViewId
    type: View['type']
    current: View
    query: ActiveViewQuery
    table: ActiveViewTable
    gallery: ActiveViewGallery
    kanban: ActiveViewKanban
  }
  records: ViewRecords
  items: ItemList
  sections: SectionList
  fields: FieldList
  summaries: ViewSummaries
}
```

约束：

- `ActiveSnapshot` 必须已经是 publish-ready 的稳定结果
- adapter 不允许再从它里面“猜测变化”

### 7.3 EngineChange

```ts
export interface EngineChange {
  doc?: DocumentChange
  active?: ActiveChange
}
```

### 7.4 DocumentChange

```ts
export interface DocumentChange {
  records?: EntityChange<RecordId, DataRecord>
  fields?: EntityChange<FieldId, CustomField>
  views?: EntityChange<ViewId, View>
}
```

### 7.5 ActiveChange

```ts
export interface ActiveChange {
  reset?: true
  view?: ActiveViewChange
  records?: ActiveRecordsChange
  items?: ItemChange
  sections?: SectionChange
  summaries?: SummaryChange
  fields?: {
    all?: EntityChange<FieldId, Field>
    custom?: EntityChange<FieldId, CustomField>
  }
}
```

这里的原则是：

- `change` 按职责分块
- 不做 patch 中间语言大扁平
- 也不做无穷嵌套
- adapter 能直接消费

---

## 8. 变化模型设计

### 8.1 通用实体变化

```ts
export interface EntityChange<K, T> {
  ids?: readonly K[]
  set?: readonly (readonly [K, T])[]
  remove?: readonly K[]
}
```

使用场景：

- `doc.records`
- `doc.fields`
- `doc.views`
- `active.fields.all`
- `active.fields.custom`

### 8.2 ActiveViewChange

```ts
export interface ActiveViewChange {
  ready?: boolean
  id?: ViewId
  type?: View['type']
  current?: View
  query?: ActiveViewQuery
  table?: ActiveViewTable
  gallery?: ActiveViewGallery
  kanban?: ActiveViewKanban
}
```

原则：

- 这里只表达值变化
- 不再拆成多层 publish phase

### 8.3 ActiveRecordsChange

```ts
export interface ActiveRecordsChange {
  matched?: readonly RecordId[]
  ordered?: readonly RecordId[]
  visible?: readonly RecordId[]
}
```

### 8.4 ItemChange

item 是这次重构最重要的一块。

最终不要再把 item 拆成三份平行 diff。

```ts
export interface ItemValue {
  record: RecordId
  section: SectionKey
  placement: ItemPlacement
}

export interface ItemChange {
  ids?: readonly ItemId[]
  set?: readonly (readonly [ItemId, ItemValue])[]
  remove?: readonly ItemId[]
}
```

关键点：

- core 只产出一份 `ItemChange`
- adapter 如果内部还要维护 `record/section/placement` 三个读面，可以在 adapter 内部再 fan out
- 但 fan out 只允许基于这份精确 `set/remove` 做 apply
- 不允许重新扫 `previous/next` 全量比较

这能直接消灭当前：

- `patchEntityValues(record)`
- `patchEntityValues(section)`
- `patchEntityValues(placement)`

这三轮重复全量 diff。

### 8.5 SectionChange

```ts
export interface SectionChange {
  keys?: readonly SectionKey[]
  set?: readonly (readonly [SectionKey, Section])[]
  remove?: readonly SectionKey[]
}
```

### 8.6 SummaryChange

```ts
export interface SummaryChange {
  set?: readonly (readonly [SectionKey, CalculationCollection])[]
  remove?: readonly SectionKey[]
}
```

---

## 9. 最终 Core API 设计

这里不使用 `namespace`，而是用 interface 内按职责拆分。

### 9.1 EngineCore

```ts
export interface EngineCore {
  read: EngineCoreRead
  commit: EngineCoreCommit
  history: EngineCoreHistory
  subscribe: (listener: (result: EngineResult) => void) => () => void
}
```

### 9.2 EngineCoreRead

```ts
export interface EngineCoreRead {
  result: () => EngineResult
  snapshot: () => EngineSnapshot
  change: () => EngineChange | undefined
  document: () => DataDoc
  active: () => ActiveSnapshot | undefined
}
```

### 9.3 EngineCoreCommit

```ts
export interface EngineCoreCommit {
  actions: (actions: readonly Action[]) => ActionResult
  replace: (document: DataDoc) => ActionResult
  undo: () => ActionResult
  redo: () => ActionResult
  clearHistory: () => void
}
```

### 9.4 EngineCoreHistory

```ts
export interface EngineCoreHistory {
  state: () => HistoryState
  canUndo: () => boolean
  canRedo: () => boolean
}
```

说明：

- `EngineCore` 自己就是可直接测试的最小真核
- 所有写入都回到 `commit`
- 所有订阅都只订阅 `EngineResult`
- 不再暴露内部 store

---

## 10. 最终 Publish Adapter API 设计

### 10.1 通用 Adapter 约束

```ts
export interface EngineAdapter<TTarget> {
  target: () => TTarget
  reset: (snapshot: EngineSnapshot) => void
  apply: (change: EngineChange, snapshot: EngineSnapshot) => void
  clear: () => void
}
```

约束：

- `reset` 只用于首次构建或整体清空
- `apply` 只能基于 `change`
- `apply` 不能做 `previousSnapshot/nextSnapshot` diff

### 10.2 StoreAdapter

```ts
export interface StoreAdapter extends EngineAdapter<EngineSource> {}
```

它的职责不是“根据两个 snapshot 推断 store 变化”，而是：

1. 接收 core 给出的 `EngineChange`
2. 把 `DocumentChange` / `ActiveChange` 直接 apply 到 store
3. 对 item 这种复合结构，在 adapter 内 fan out 到需要的 keyed store

### 10.3 EventAdapter

```ts
export interface EventAdapter extends EngineAdapter<EngineEvents> {}
```

适用场景：

- devtools
- trace
- 外部桥接
- worker 同步

### 10.4 SnapshotAdapter

```ts
export interface SnapshotAdapter extends EngineAdapter<EngineSnapshot> {}
```

适用场景：

- 非响应式环境
- 测试环境
- 简单 runtime 宿主

---

## 11. 最终 Store Source API 设计

`EngineSource` 不再属于 core contract，而是 store adapter contract。

也就是说：

- `contracts/source.ts` 应迁到 adapter 层
- core 层不应该依赖 `ReadStore` / `KeyedReadStore`

### 11.1 StoreSource

```ts
export interface EngineSource {
  doc: {
    records: EntitySource<RecordId, DataRecord>
    fields: EntitySource<FieldId, CustomField>
    views: EntitySource<ViewId, View>
  }
  active: {
    view: {
      ready: ReadStore<boolean>
      id: ReadStore<ViewId | undefined>
      type: ReadStore<View['type'] | undefined>
      current: ReadStore<View | undefined>
    }
    meta: {
      query: ReadStore<ActiveViewQuery>
      table: ReadStore<ActiveViewTable>
      gallery: ReadStore<ActiveViewGallery>
      kanban: ReadStore<ActiveViewKanban>
    }
    items: ItemSource
    sections: SectionSource
    fields: {
      all: EntitySource<FieldId, Field>
      custom: EntitySource<FieldId, CustomField>
    }
  }
}
```

### 11.2 ItemSource

保持现有读面没有问题，但它必须变成 adapter 自己的投影，而不是 core 的真实模型。

```ts
export interface ItemSource {
  ids: ReadStore<readonly ItemId[]>
  read: {
    record: KeyedReadStore<ItemId, RecordId | undefined>
    section: KeyedReadStore<ItemId, SectionKey | undefined>
    placement: KeyedReadStore<ItemId, ItemPlacement | undefined>
  }
}
```

重点不是这层 API 要不要保留，而是：

- 它不再反向塑造 core
- 它只是一种发布形态

---

## 12. createEngine 最终组装方式

最终 `createEngine()` 应该只是装配器。

```ts
export interface Engine {
  core: EngineCore
  source: EngineSource
  active: ActiveViewApi
  views: ViewsApi
  fields: FieldsApi
  records: RecordsApi
  document: DocumentApi
  history: HistoryApi
  performance: PerformanceApi
  dispatch: (action: Action | readonly Action[]) => ActionResult
}
```

组装流程：

1. 创建 `EngineCore`
2. 创建 `StoreAdapter`
3. 用 `core.read.snapshot()` 做一次 `adapter.reset()`
4. 订阅 `core.subscribe(result => adapter.apply(result.change, result.snapshot))`
5. 基于 `core + source adapter` 组装 `active/views/fields/records` API

注意：

- `source` 仍然可以继续对外暴露
- 但它是 adapter 产物，不再是 engine core 的一部分

---

## 13. 主流程应该如何收敛

当前流程最大的问题是阶段太多，而且很多阶段只是为了“重新变成可发布形态”。

长期最优的 core 主流程应该收敛成下面 4 步：

1. `mutate`
2. `derive`
3. `change`
4. `publish`

### 13.1 mutate

职责：

- 应用 action / operation / replace / undo / redo
- 产出 next document 和 document impact

### 13.2 derive

职责：

- resolve active plan
- sync index
- run active snapshot
- 得到 next active snapshot

### 13.3 change

职责：

- 直接基于本次 derive 过程中的精确信息产出 `EngineChange`
- 不在 adapter 再做一次 diff

### 13.4 publish

职责：

- 把 `EngineResult` 发给 listener
- 由 adapter 按 `change` apply

核心原则：

- core 只算一次
- change 只定义一次
- adapter 只 apply 一次

---

## 14. 哪些现有模块应该删除或迁移

### 14.1 应直接删除的模式

下面这些模式应该从 core 里直接清理掉：

- `RuntimeStore = ValueStore<EngineRuntimeState>`
- `source/runtime.ts` 里基于 `previousSnapshot/nextSnapshot` 的再次 diff
- `patchEntityValues(previousIds, nextIds, previousGet, nextGet)` 这种通用 re-diff 帮助函数
- 任何 adapter 侧的“猜变化”逻辑

### 14.2 应迁到 adapter 层的模块

- `contracts/source.ts`
- `source/runtime.ts`
- 依赖 `shared/core/store` 的 source 发布逻辑

建议迁移到：

```text
dataview/packages/dataview-engine/src/publish/store/
  contracts.ts
  runtime.ts
  items.ts
  sections.ts
  fields.ts
```

### 14.3 应保留在 core 的模块

- `active/*`
- `mutate/*`
- `document/*`
- `runtime/history.ts`
- `runtime/performance.ts`
- index / summary / membership / query 这类真实业务计算

前提是：

- 它们不依赖 `store`
- 它们只产出普通结果结构

---

## 15. Item 链路的最终落地方式

这是本次方案里收益最大的一段。

### 15.1 Core 最终输出

core publish membership 时直接产出：

```ts
export interface ItemPublish {
  ids: readonly ItemId[]
  values: ReadonlyMap<ItemId, ItemValue>
  change: ItemChange
}
```

或者不保留 `values` 也可以，只要 `ActiveSnapshot.items` 和 `ItemChange` 都已经齐全。

### 15.2 Adapter 最终 apply

store adapter 收到 `ItemChange` 后：

1. `ids.set(change.ids ?? snapshot.active.items.ids)`
2. 对 `set` 中的每个 `[itemId, value]`：
   - `record.set(itemId, value.record)`
   - `section.set(itemId, value.section)`
   - `placement.set(itemId, value.placement)`
3. 对 `remove` 中的每个 `itemId`：
   - `record.delete(itemId)`
   - `section.delete(itemId)`
   - `placement.delete(itemId)`

这仍然会有三份 store 写入，但它们不再需要：

- 三轮全量扫描
- 三轮 `previousGet/nextGet`
- 三轮 `collectRemovedKeys`

也就是说：

- 复杂度降了
- 性能也会更好

---

## 16. Summary / Section / Field 的统一原则

这三类数据不必搞特殊系统，统一沿用“core 给精确 change，adapter 只 apply”即可。

### 16.1 Section

- core 直接产出 `SectionChange`
- adapter 只负责 `keys.set` 和 keyed `set/remove`

### 16.2 Summary

- core 直接产出 `SummaryChange`
- adapter 不再从前后 summary map 里自己读差异

### 16.3 Field

- doc fields 和 active fields 都统一为 `EntityChange`
- adapter 只是不同目标的 apply 方式不同

---

## 17. ActiveContext 和 Read API 应该怎么改

当前 `active/context.ts` 还在基于 runtime store 创建 derived store，这也属于“store 侵入 core”。

长期最优应该改成：

```ts
export interface ActiveContext {
  id: () => ViewId | undefined
  view: () => View | undefined
  snapshot: () => ActiveSnapshot | undefined
  reader: DocumentReader
  dispatch: (action: Action | readonly Action[]) => ActionResult
  patch: (
    resolve: (view: View, reader: DocumentReader) => ViewPatch | undefined
  ) => boolean
}
```

也就是说：

- `snapshot()` 直接读 core 当前结果
- 不再需要 `stateStore = createDerivedStore(...)`

如果上层 UI 确实要 store，再从 adapter 层拿，不要让 context 反向依赖 engine 内部 store。

---

## 18. 目录重组建议

建议最终目录形态如下：

```text
dataview/packages/dataview-engine/src/
  core/
    contracts.ts
    runtime.ts
    result.ts
    commit.ts
    history.ts
  active/
    ...
  mutate/
    ...
  document/
    ...
  publish/
    store/
      contracts.ts
      runtime.ts
    event/
      contracts.ts
      runtime.ts
  api/
    createEngine.ts
    active.ts
    views.ts
    fields.ts
    records.ts
    read.ts
  contracts/
    api.ts
    core.ts
    change.ts
    snapshot.ts
```

收口原则：

- `contracts/source.ts` 从核心 contracts 中移走
- `runtime/store.ts` 删除
- `source/runtime.ts` 删除或迁到 `publish/store/runtime.ts`

---

## 19. 实施顺序

下面的顺序是“一步到位的最终形态拆解”，不是兼容方案。

### 第一步：冻结最终 contract

先新增并冻结这些类型：

- `EngineSnapshot`
- `ActiveSnapshot`
- `EngineChange`
- `DocumentChange`
- `ActiveChange`
- `EntityChange`
- `ItemChange`
- `SectionChange`
- `SummaryChange`
- `EngineResult`
- `EngineCore`

要求：

- 先定 contract
- 后改实现
- 中间不反复推翻命名

### 第二步：重写 core runtime

目标：

- 删除 `RuntimeStore`
- 用普通对象状态替代 `ValueStore<EngineRuntimeState>`
- 改成 listener set 发布 `EngineResult`

完成标准：

- commit 路径不再依赖 `store.set`
- core 可以独立单测，不需要 `shared/core/store`

### 第三步：把 change 生产收回 core

目标：

- 当前 active runtime 内部已经知道哪些东西变了
- 必须在那里直接产出 `EngineChange`

完成标准：

- `source/runtime.ts` 不再负责推导 active change
- item / section / summary / fields 都由 core 直接给 delta

### 第四步：重写 store adapter

目标：

- adapter 只消费 `EngineChange`
- 不再做 snapshot-to-snapshot diff

完成标准：

- 删除 `patchEntityValues()`
- 删除 `collectRemovedKeys()`
- 删除 `syncActiveSnapshot(previous, next)` 这种再次 diff 入口

### 第五步：重写 createEngine 装配

目标：

- `createEngine()` 改成 core + adapter 装配器
- `source` 改为 adapter 产物

完成标准：

- `active/context.ts` 不再依赖 runtime store
- `api/read.ts` 和 `api/createEngine.ts` 直接读 core

### 第六步：彻底清理旧模型

必须删除：

- `runtime/store.ts`
- core 层所有 `store.*` 依赖
- adapter 中所有“根据 previous/next snapshot 猜变化”的辅助逻辑

---

## 20. 重构完成后的判断标准

如果重构完成，系统应满足下面这些条件。

### 20.1 架构判断

- core 内没有 `shared/core/store`
- `EngineSource` 不属于 core contract
- `createEngine()` 是装配器，不是 store runtime 容器

### 20.2 数据判断

- 每次 commit 都只产生一份 `snapshot`
- 每次 commit 都只产生一份 `change`
- adapter 不需要再看 `previousSnapshot`

### 20.3 性能判断

- item/source 不再出现三轮全量 diff
- 不再有 adapter 侧的二次全量 compare
- keyed store patch 只消费精确变更，而不是消费重建出来的全量 diff

### 20.4 正确性判断

- 不再出现 snapshot 新了但 source 旧了的分裂状态
- summary / section / item 的发布时间点统一
- 所有 UI 读到的都是同一轮 commit 的结果

---

## 21. 最终建议

这次重构不应该理解成“把 store 换个位置”。

真正要做的是：

1. 把 `store` 从 engine 内部语言降级为外部发布形态
2. 把 `snapshot + change` 升级成 engine 的唯一输出
3. 把“再次 diff”这件事从 adapter 层彻底删除

长期最优不是“engine 只做 snapshot，adapter 自己想办法同步”。

长期最优是：

- core 负责真相
- core 负责变化
- adapter 只负责 apply

只有这样，复杂度、错误率和性能三个目标才能同时成立。

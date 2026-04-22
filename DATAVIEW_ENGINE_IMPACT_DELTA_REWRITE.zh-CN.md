# Dataview Engine Impact / Delta 最终重构方案

本文只回答一个问题：

在下面这些前提都成立时，`dataview-engine` 的变化模型到底应该怎么重构，才是长期最优解。

- 不在乎重构成本
- 不需要兼容
- 不保留双轨实现
- 底层模型如果别扭，优先改底层模型
- `shared/projection-runtime` 是未来给 `engine` 用的
- `dataview-runtime` 不负责 phase runtime，只负责 source/store 宿主

这份文档不是脱离代码空谈，而是建立在下面这些现状上：

- 边界文档 [DATAVIEW_ENGINE_RUNTIME_BOUNDARY_REWRITE.zh-CN.md](/Users/realrong/Rostack/DATAVIEW_ENGINE_RUNTIME_BOUNDARY_REWRITE.zh-CN.md)
- KeyTable 文档 [DATAVIEW_ENGINE_KEY_TABLE_STORE_REWRITE.zh-CN.md](/Users/realrong/Rostack/DATAVIEW_ENGINE_KEY_TABLE_STORE_REWRITE.zh-CN.md)
- 当前 engine public contract：
  - [core.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/core.ts)
  - [change.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/change.ts)
  - [cache.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/cache.ts)
- 当前 active derive 主链：
  - [active/snapshot/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/runtime.ts)
  - [mutate/commit/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/mutate/commit/runtime.ts)
- 当前 runtime source adapter：
  - [createEngineSource.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/createEngineSource.ts)
- 当前 runtime source contract：
  - [contracts.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/contracts.ts)

---

## 1. 先把四个关键判断钉死

这四点是这次收敛后必须固定下来的结论。

## 1.1 public 边界只保留一种语言

`EngineDelta.doc = CommitImpact` 不是最终最优方案。

原因很直接：

- `CommitImpact` 是 mutation invalidation 语言
- public `delta` 应该是 published artifact 语言
- 把两者塞进同一个 `EngineDelta` 会让 public 边界再次混层

所以最终方案必须是下面二选一：

1. `impact` 和 `delta` 分开公开
2. public 边界只公开 artifact-shaped `delta`

这份文档选择第二种。

也就是说：

- `CommitImpact` 继续存在
- 但它退回 engine 内部语言
- public 边界只公开一种语言：artifact-shaped `delta`

一句话：

> `CommitImpact` 不应该进入 public `EngineDelta`。

## 1.2 publish 仍然只有一个 stage

不建议把：

- `view`
- `meta`
- `fields`
- `sections`
- `items`
- `summaries`

真的拆成 6 个独立 phase。

原因不是语义不对，而是工程成本不对：

- phase 数量会上升
- 调度和 trace 会变复杂
- 依赖图会膨胀
- 调试成本会上升

更稳的方案是：

1. internal 继续保留：
   - `query`
   - `membership`
   - `summary`
2. 最后仍然只有一个 `publish` stage
3. `publish` 内部按 artifact writer 顺序产：
   - `view`
   - `meta`
   - `records`
   - `fields`
   - `sections`
   - `items`
   - `summaries`
4. `publish` 顺手组装 public `ActiveDelta`

一句话：

> phase graph 保持小，public delta 由单一 publish stage 内部 writer 产出。

## 1.3 runtime `active.state` 不是最终合同

这里必须区分两件事。

### engine sync read

下面这类同步读接口可以继续存在：

- `engine.read.activeState()`
- `engine.active.state()`

这是 engine 的同步读 API，不是 runtime source，不会破坏边界。

### runtime source

`dataview-runtime` 里的 `source.active.state` 不应该成为永久合同。

当前代码里，它已经基本只剩历史逃生口价值：

- runtime/react 大多数消费方已经走细粒度 source
- 真正还依赖整包 `ViewState` 的，主要是 table controller 这类旧入口

所以最终方向应当是：

1. `source.active.state` 暂时保留为 runtime-only 过渡逃生口
2. public 最终 source contract 删除 `active.state`
3. 为了删除它，必须补齐缺失的 published artifact

这里最关键的缺口就是：

- `active.records`

因为当前 runtime source 没有：

- `matched`
- `ordered`
- `visible`

这些信息还被包在整包 `ViewState` 里。

所以最终 public 模型必须补上：

- `active.records`
- 对应的 `ActiveDelta.records`

至于 table/grid 这类仍然需要 `(items + fields)` 组合视图的地方，最终不应该继续偷读 `active.state`，而应该改成：

- runtime-local composite store

也就是：

- source 只暴露细粒度 artifact
- runtime 内部按需要组装 table/grid 专用组合视图

一句话：

> `source.active.state` 不是最终合同，最终应删除；删除前必须先补齐 `records`，再把剩余整包读取替换成 runtime-local composite store。

## 1.4 `projection-runtime` 是后续替换，不和 delta rewrite 绑死

`shared/projection-runtime` 属于 engine，这点方向是对的。

但它不应该和 delta rewrite 绑成一次交付。

更稳的顺序是：

1. 先把 public 语言从 `change` 改成 `delta`
2. 让当前 concrete active runtime 直接产 `delta`
3. runtime adapter 切到消费 `snapshot + delta`
4. 删除 snapshot diff
5. 最后再评估是否把 concrete active runtime 收进 `shared/projection-runtime`

原因很简单：

- “public 语言替换”
- “runtime 抽象替换”

这是两次不同的底层替换。

如果绑在一起做，你很难判断新问题到底来自：

- delta 边界
- 还是 phase runtime 抽象

一句话：

> `projection-runtime` 方向是对的，但不应该和 delta rewrite 强绑定成一个交付。

---

## 2. 最终结论

长期最优方案收敛成下面这几条：

1. `CommitImpact` 保留，但只作为 engine 内部 invalidation truth
2. `BaseImpact` 保留，但只作为 engine 内部 dirty helper
3. 删掉当前 public `EngineChange` / `ActiveChange` / `ItemChange` 这整套 store-shaped patch 合同
4. public 边界只保留一种语言：artifact-shaped `delta`
5. `delta` 直接对齐 runtime source 真正消费的 published artifact
6. internal 继续保留：
   - `query`
   - `membership`
   - `summary`
   - `publish`
7. `publish` 是唯一对外变化出口
8. runtime 只消费 `snapshot + delta`
9. `source.active.state` 只作为过渡逃生口，最终删除
10. `shared/projection-runtime` 以后进入 engine，但不作为这次 delta rewrite 的前置条件

一句话概括：

> public 边界最终只应暴露 published artifact delta，不暴露 invalidation 语言，也不暴露 runtime patch 语言。

---

## 3. 当前模型为什么别扭

现在的问题不是“delta 太少”，而是 public 边界混了三种语言。

当前同时存在：

1. `CommitImpact`
2. internal stage delta
3. public `EngineChange`

这三种语言分别对应：

1. invalidation truth
2. derive truth
3. runtime patch truth

但今天的 public contract 把第 3 种语言暴露出去了，还想把第 1 种语言混进去，这就是根问题。

具体表现为三点。

## 3.1 public `change` 已经长成 runtime patch

当前 [change.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/change.ts) 里的：

- `EntityChange`
- `ItemChange`
- `SectionChange`
- `SummaryChange`

本质上都在表达：

- 某个 source/store 应该怎么 patch

这不属于 engine public contract。

## 3.2 publish 没有 public delta

当前 derive 链内部已经知道很多变化，但 publish 没有直接产出 public delta。

结果就是：

- commit 末尾还要再跑一遍 snapshot diff

也就是今天的：

- `projectDocumentChange`
- `projectActiveChange`
- `projectEngineChange`

这条链不是最终模型的一部分，只是旧 change 合同的补洞逻辑。

## 3.3 runtime source 还没完全去掉整包逃生口

当前 runtime source 里还有：

- `active.state`

这说明 public published artifact 还没补齐。

尤其是：

- `active.records`

还没有被独立暴露出来。

---

## 4. 最终 public API

这一节只给最终建议的 public API，不再混中间层命名。

## 4.1 基础通用类型

```ts
export interface CollectionDelta<Key> {
  list?: true
  update?: readonly Key[]
  remove?: readonly Key[]
}
```

语义：

- `list?: true`
  表示这组 key 的全集或顺序发生变化
- `update`
  表示这些 key 对应的值需要从 snapshot 读取并刷新
- `remove`
  表示这些 key 需要从 runtime source 移除

这里故意不用：

- `idsChanged`
- `keysChanged`
- `changed`

原因是这些名字都在重复表达“变了”。

presence 就是语义。

## 4.2 `DocDelta`

```ts
export interface DocDelta {
  records?: CollectionDelta<RecordId>
  fields?: CollectionDelta<FieldId>
  views?: CollectionDelta<ViewId>
}
```

关键点：

- `DocDelta` 是 artifact-shaped，不是 `CommitImpact`
- runtime 需要值时，从 `snapshot.doc` 读取

## 4.3 `ActiveDelta`

```ts
export interface ActiveDelta {
  reset?: true
  view?: true
  meta?: {
    query?: true
    table?: true
    gallery?: true
    kanban?: true
  }
  records?: {
    matched?: true
    ordered?: true
    visible?: true
  }
  fields?: {
    all?: CollectionDelta<FieldId>
    custom?: CollectionDelta<FieldId>
  }
  sections?: CollectionDelta<SectionKey>
  items?: CollectionDelta<ItemId>
  summaries?: CollectionDelta<SectionKey>
}
```

这份合同里有几个刻意的设计。

### 1. 没有 `CommitImpact`

public boundary 只保留 artifact delta。

### 2. 没有 `ActiveBaseDelta`

public API 直接暴露 artifact 本身：

- `view`
- `meta`
- `records`
- `fields`
- `sections`
- `items`
- `summaries`

不再套一层 `base`。

### 3. 没有 `xxxChanged`

例如：

- `view?: true`
- `meta.query?: true`
- `records.visible?: true`
- `items.list?: true`

presence 就是语义。

### 4. `records` 被显式补进 public 模型

这是为了最终删除 runtime `active.state`。

如果没有：

- `matched`
- `ordered`
- `visible`

这些 published artifact，整包 snapshot 逃生口就删不掉。

## 4.4 `EngineDelta`

```ts
export interface EngineDelta {
  doc?: DocDelta
  active?: ActiveDelta
}
```

## 4.5 `EngineResult`

```ts
export interface EngineResult {
  rev: number
  snapshot: EngineSnapshot
  delta?: EngineDelta
}
```

## 4.6 `EngineCore.read`

```ts
export interface EngineCoreRead {
  result: () => EngineResult
  snapshot: () => EngineSnapshot
  delta: () => EngineDelta | undefined
  document: () => DataDoc
  active: () => ActiveSnapshot | undefined
}
```

这里明确替换：

- `change()` -> `delta()`

---

## 5. 最终 runtime source API

既然 public `delta` 要直接对齐 runtime source 的消费面，那 source contract 也应一起收敛。

## 5.1 `ActiveSource`

```ts
export interface ActiveSource {
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
  records: {
    matched: ReadStore<readonly RecordId[]>
    ordered: ReadStore<readonly RecordId[]>
    visible: ReadStore<readonly RecordId[]>
  }
  fields: {
    all: EntitySource<FieldId, Field>
    custom: EntitySource<FieldId, CustomField>
  }
  sections: SectionSource
  items: ItemSource
  summaries: KeyedReadStore<SectionKey, CalculationCollection | undefined>
}
```

这里和当前 runtime source 相比，有两个重要变化。

### 1. 新增 `records`

这一步是删除 `active.state` 的前置条件。

### 2. 删除 `active.state`

最终 public runtime source 不再暴露整包 `ViewState` store。

## 5.2 `SectionSource`

```ts
export interface SectionSource extends KeyedReadStore<SectionKey, Section | undefined> {
  keys: ReadStore<readonly SectionKey[]>
}
```

## 5.3 `ItemSource`

```ts
export interface ItemSource {
  ids: ReadStore<readonly ItemId[]>
  table: KeyTableReadStore<ItemId, ItemValue>
  read: {
    record: KeyedReadStore<ItemId, RecordId | undefined>
    section: KeyedReadStore<ItemId, SectionKey | undefined>
    placement: KeyedReadStore<ItemId, ItemPlacement | undefined>
  }
}
```

这和 KeyTable 方向是一致的：

- item 的 runtime 真源是一张 table
- engine public delta 不给 `ItemValue`
- runtime source adapter 再从 snapshot 里 materialize `ItemValue`

## 5.4 table/grid 的最终处理方式

删除 `active.state` 之后，table/grid 仍然可能需要一个组合视图来驱动：

- selection reconcile
- fill handle
- grid cursor move

这类场景不应该反向要求 source 再暴露整包 snapshot。

正确做法是：

- runtime 内部创建 table/grid 专用 composite store

它可以由下面这些细粒度 source 组合而成：

- `active.items`
- `active.fields`
- `active.records`

是否需要额外公开 `rows`，不应现在预设。

当前最稳的方案是：

- 先补 `records`
- 再把 table/grid 的整包依赖替换成 runtime-local composite store

---

## 6. engine 内部最终结构

public API 收敛以后，engine 内部结构反而可以保持简单。

## 6.1 internal 继续保留四段

1. `query`
2. `membership`
3. `summary`
4. `publish`

不要把 publish 拆成更多独立 phase。

## 6.2 publish 内部按 artifact writer 工作

唯一的 `publish` stage 内部顺序建议是：

1. `view`
2. `meta`
3. `records`
4. `fields`
5. `sections`
6. `items`
7. `summaries`

每个 writer 同时做两件事：

1. 产 published snapshot artifact
2. 产对应 sub-delta

最后由 publish 汇总成：

- `ActiveSnapshot`
- `ActiveDelta`

## 6.3 internal stage delta 继续保留

下面这些 internal delta 继续有价值：

- `QueryDelta`
- `MembershipDelta`
- `SummaryDelta`

但它们只用于：

- dirty planning
- incremental derive
- trace/perf
- publish 决策

不直接成为 public API。

---

## 7. `CommitImpact` 最终放在哪里

因为 public boundary 只保留 artifact-shaped `delta`，所以 `CommitImpact` 的最终位置也要说清楚。

## 7.1 保留在 engine 内部

`CommitImpact` 继续作为：

- operation.apply 的输出
- `BaseImpact` 的输入
- derive planner 的 invalidation truth

## 7.2 不进入 public `EngineDelta`

这是这次收敛后最重要的改动。

因为只要它进入 public `delta`，public boundary 就重新变成两种语言混用：

- invalidation language
- artifact language

这会让 runtime adapter 和调用方都变复杂。

## 7.3 如果以后需要低层调试信息

也不应该把它塞回主数据路径。

更合理的放置方式是：

- performance trace
- debug API
- devtools hook

而不是：

- `EngineResult.delta.doc = CommitImpact`

---

## 8. 旧模型该删什么

如果按最终方向改，我建议直接删掉下面这些东西。

## 8.1 删掉 old public change contract

也就是：

- [change.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/change.ts)

里面这整套：

- `EngineChange`
- `ActiveChange`
- `DocumentChange`
- `EntityChange`
- `ItemChange`
- `SectionChange`
- `SummaryChange`

都应该整体删除。

## 8.2 删掉 snapshot diff 投影链

也就是：

- `projectDocumentChange`
- `projectActiveChange`
- `projectEngineChange`

一旦 publish 直接产 public `delta`，这条链就不再有存在必要。

## 8.3 删掉 runtime public `active.state`

这是最终目标，不是可选项。

但要分两步：

1. 先补 `active.records`
2. 再把剩余整包依赖替换掉

---

## 9. 推荐落地顺序

这里按“先稳住 public 边界，再替换内部实现”的顺序走。

## 第一阶段：先换 public 语言

1. `EngineResult.change` 改成 `delta`
2. `EngineCore.read.change()` 改成 `delta()`
3. 定义新的：
   - `CollectionDelta`
   - `DocDelta`
   - `ActiveDelta`
   - `EngineDelta`
4. 删除 old `contracts/change.ts`

这一阶段的目标是先把 public contract 矫正。

## 第二阶段：当前 concrete runtime 直接产 delta

5. 保持 internal 还是：
   - `query`
   - `membership`
   - `summary`
   - `publish`
6. 让 `publish` 直接产 public `ActiveDelta`
7. 让 doc publish 直接产 `DocDelta`
8. 删除 snapshot diff

这一阶段的目标是先让“public delta rewrite”独立成立。

## 第三阶段：runtime adapter 切到 `snapshot + delta`

9. runtime source adapter 改成消费：
   - `snapshot`
   - `delta`
10. 内部自己生成 store patch
11. item source 继续走 `KeyTableStore`

这一阶段完成后，engine/runtime 边界已经闭环。

## 第四阶段：删除 runtime `active.state`

12. 补齐：
   - `active.records`
13. 把 table/grid 剩余整包依赖改成 runtime-local composite store
14. 删除 public `active.state`

这一阶段是 source contract 的最终收口。

## 第五阶段：再决定是否引入 `projection-runtime`

15. 评估当前 concrete active runtime 是否已经足够清晰
16. 如果 phase graph 样板和依赖传播仍然值得收敛，再把 active runtime 收进 `shared/projection-runtime`

这里要强调：

- 这是后续优化
- 不是 delta rewrite 的前置条件

---

## 10. 最终结论

按照这次收敛后的四个关键判断，最终最稳的模型其实很简单：

1. `CommitImpact` 留在 engine 内部，不进入 public `delta`
2. public 边界只保留一种语言：artifact-shaped `delta`
3. `publish` 仍然是一个 stage，只在内部按 artifact writer 产 sub-delta
4. runtime `active.state` 不是最终合同，最终应删除
5. 为了删除 `active.state`，public 模型必须补上 `active.records`
6. `shared/projection-runtime` 属于 engine，但不和 delta rewrite 绑成一次交付

一句话概括：

> 先把 public 边界收敛成 `snapshot + artifact delta`，再决定要不要用 `projection-runtime` 重写 engine 内部调度。

这才是当前代码、runtime/source 现状、以及未来 boundary 方向同时成立时，最清晰、最稳、也最容易继续演进的方案。

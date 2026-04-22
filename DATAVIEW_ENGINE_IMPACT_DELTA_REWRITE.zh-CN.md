# Dataview Engine Impact / Delta 最终重构方案

本文只回答一个问题：

在下面这些前提都成立时，`dataview-engine` 的变化模型到底应该怎么重构，才是长期最优解。

- 不在乎重构成本
- 不需要兼容
- 不保留双轨实现
- 底层模型如果别扭，优先改底层模型
- `shared/projection-runtime` 是未来给 `engine` 用的
- `dataview-runtime` 不负责 phase runtime，只负责 source/store 宿主

本文不是脱离代码空谈，而是基于下面这些已经存在的边界与实现来推：

- 根目录文档 [DATAVIEW_ENGINE_RUNTIME_BOUNDARY_REWRITE.zh-CN.md](/Users/realrong/Rostack/DATAVIEW_ENGINE_RUNTIME_BOUNDARY_REWRITE.zh-CN.md)
- 根目录文档 [DATAVIEW_ENGINE_KEY_TABLE_STORE_REWRITE.zh-CN.md](/Users/realrong/Rostack/DATAVIEW_ENGINE_KEY_TABLE_STORE_REWRITE.zh-CN.md)
- 当前 engine public contract：
  - [core.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/core.ts)
  - [change.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/change.ts)
  - [cache.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/cache.ts)
- 当前 active derive 主链：
  - [active/snapshot/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/runtime.ts)
  - [mutate/commit/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/mutate/commit/runtime.ts)
- 当前 runtime source adapter：
  - [createEngineSource.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/createEngineSource.ts)
- 当前大型 table store：
  - [keyTable.ts](/Users/realrong/Rostack/shared/core/src/store/keyTable.ts)

也就是说，这份文档讨论的不是“要不要分层”，而是：

> 在 `engine` 已经不该暴露 source/store 的前提下，`impact`、`delta`、`snapshot` 三者最终应该怎么分工。

---

## 1. 最终结论

长期最优方案非常明确：

1. `CommitImpact` 保留，作为 document mutation 的真源
2. `BaseImpact` 继续存在，但只作为 engine 内部 dirty planner helper
3. 删掉当前 public `EngineChange` / `ActiveChange` / `ItemChange` 这整套 store-shaped patch 合同
4. `engine` 对外从 `snapshot + change` 改成 `snapshot + delta`
5. public `delta` 直接对齐 runtime source 真正消费的 published artifact
6. internal `QueryDelta / MembershipDelta / SummaryDelta` 继续保留，但留在 engine 内部
7. `shared/projection-runtime` 进入 `engine`，用于 active derive phase runtime
8. `dataview-runtime` 只消费 `snapshot + delta`，再自己决定如何更新 source/store

一句话概括：

> `CommitImpact` 是 document invalidation truth，public `delta` 是 published artifact truth，runtime patch 是 adapter truth，这三层不能再混。

---

## 2. 先说最重要的修正

我前一版判断里有一个方向需要纠正：

- `QueryDelta`
- `MembershipDelta`
- `SummaryDelta`

这些 delta 的方向是对的，但它们最适合做 engine 内部 stage delta，不适合直接成为 public `EngineDelta.active`。

原因很简单：

- `dataview-runtime` 消费的是 published snapshot
- 它真正更新的是 source：
  - `view`
  - `meta`
  - `fields`
  - `sections`
  - `items`
  - `summaries`
- 它并不直接消费 engine 内部的 query state / membership state / summary state

所以最终 public `ActiveDelta` 最好直接对齐 published artifact，而不是把内部 stage delta 原样抬出去。

换句话说：

- `QueryDelta / MembershipDelta / SummaryDelta` 留在 engine 内部
- publisher 最后把它们折叠成 public `ActiveDelta`

这是最顺的模型。

---

## 3. 当前模型为什么别扭

现在的问题不是“delta 不够多”，而是变化语言混层了。

当前大致有四层变化语言：

1. `CommitImpact`
2. `BaseImpact`
3. internal `SnapshotChange(query/membership/summary)`
4. public `EngineChange(doc/active payload patch)`

它们混在一起以后，会出现四个根问题。

## 3.1 engine public contract 已经长成 runtime patch

当前 [change.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/change.ts) 里的：

- `EntityChange`
- `ItemChange`
- `SectionChange`
- `SummaryChange`

本质上都在表达：

- 某个 source/store 应该怎么 patch

这不是 engine 真相，而是 runtime adapter 真相。

只要这套合同还留在 engine public API，边界就永远不干净。

## 3.2 publish 没有自己的 delta

当前 internal `SnapshotChange` 只覆盖：

- query
- membership
- summary

但 runtime source 真正消费的 published artifact 是：

- active view
- active meta
- active fields
- sections
- items
- summaries

也就是说：

- publish 已经产出了 snapshot
- 但没有产出对应 public delta

所以 commit 末尾才会被迫再跑一遍 snapshot diff。

## 3.3 snapshot diff 是旧模型补洞

今天 [core/change.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/core/change.ts) 存在的根原因不是它“算法不好”，而是它在替缺失的 publish delta 补洞。

它做的事本质上是：

1. 上游已经知道哪些 artifact 变了
2. 但没有 public delta
3. 于是最后只好拿 `previousSnapshot/nextSnapshot` 再猜一遍

这个方向整体就是错的。

## 3.4 `projection-runtime` 容易被放错层

如果把 `shared/projection-runtime` 放到 `dataview-runtime`，那 runtime 就重新拥有了一套 derive 语义。

这会直接破坏已经定下来的边界：

- engine 负责 derive
- runtime 负责 publish/source

所以 `projection-runtime` 必须是 engine 内部设施。

---

## 4. 最终应该只保留三种变化语言

长期最优模型里，变化语言应该只剩三层，而且职责必须分开。

## 4.1 `CommitImpact`

职责：

- 表达 document mutation 发生了什么
- 表达 records / fields / views / activeView 哪些部分被 touched
- 表达 queryAspects / layoutAspects / calculationFields 这类 invalidation 信息

定位：

- document invalidation truth

明确不负责：

- source patch
- runtime payload
- published artifact delta

一句话：

> `CommitImpact` 是 document 的变化真源。

## 4.2 `BaseImpact`

职责：

- 从 `CommitImpact` 派生 engine 内部更方便消费的 dirty signal

典型字段：

- `touchedRecords`
- `touchedFields`
- `valueFields`
- `schemaFields`
- `recordSetChanged`

定位：

- engine runtime helper

明确不负责：

- public contract
- runtime/source consumption

一句话：

> `BaseImpact` 应继续存在，但只能是 engine 内部工具类型。

## 4.3 public `EngineDelta`

职责：

- 表达这次 commit 后，runtime source 真正关心的 published artifact 哪些变了

定位：

- published artifact delta

明确不负责：

- store patch payload
- keyed patch 细节
- runtime listener fanout 细节

一句话：

> public `delta` 只回答“哪些 published artifact 变了”，不回答“store 该怎么 patch”。

---

## 5. 命名原则

如果目标是 API 简单清晰，那命名也要一起收敛。

## 5.1 public API 用 `delta`，不用 `change`

原因：

- `change` 在当前代码里已经被污染成 patch 语义
- `delta` 更接近“变化信息”
- 对外新模型应该主动和旧 `change.ts` 切开

所以最终建议：

- `EngineResult.change` 改成 `EngineResult.delta`
- `EngineCore.read.change()` 改成 `EngineCore.read.delta()`

## 5.2 不要 `xxxChanged` 后缀

像：

- `viewChanged`
- `tableChanged`
- `visibleChanged`
- `orderChanged`

这种名字信息噪音太多，而且一眼看不出它对应哪个 published artifact。

public delta 最好直接写成名词：

- `view`
- `meta.query`
- `items.ids`
- `sections.keys`

也就是：

- presence 表示变化
- 不用 `changed` 后缀

## 5.3 public delta 的结构直接对齐 runtime source

当前 runtime source contract 已经很清楚，主要就是：

- `view`
- `meta`
- `fields`
- `sections`
- `items`
- `summaries`

所以 public `ActiveDelta` 也应该按这个结构长。

不要再引入一个和 runtime source 不对齐的中间层，比如：

- `ActiveBaseDelta`
- `PublishDelta`

这类名字在 engine 内部可以存在，但放到 public API 反而会让理解成本上升。

---

## 6. 最终 public 合同应该长什么样

我建议把最终 public 合同直接收敛成下面这组。

## 6.1 `EngineResult`

```ts
export interface EngineResult {
  rev: number
  snapshot: EngineSnapshot
  delta?: EngineDelta
}
```

## 6.2 `EngineCore.read`

```ts
export interface EngineCoreRead {
  result: () => EngineResult
  snapshot: () => EngineSnapshot
  delta: () => EngineDelta | undefined
  document: () => DataDoc
  active: () => ActiveSnapshot | undefined
}
```

这里直接删掉：

- `change: () => EngineChange | undefined`

## 6.3 `EngineDelta`

```ts
export interface EngineDelta {
  doc: CommitImpact
  active?: ActiveDelta
}
```

这里故意不用 `impact` 字段名，而用 `doc`，原因是：

- public contract 要直接体现这部分对应 `snapshot.doc`
- `CommitImpact` 已经说明值类型本身是 impact

调用时也更直观：

- `result.delta?.doc`
- `result.delta?.active`

## 6.4 `MemberDelta`

```ts
export interface MemberDelta<Key> {
  update: readonly Key[]
  remove: readonly Key[]
}
```

这就是 public delta 里最基础的复用形状：

- 谁需要刷新
- 谁被移除

不携带 payload。

## 6.5 `EntityDelta`

```ts
export interface EntityDelta<Key> extends MemberDelta<Key> {
  ids?: true
}
```

适用场景：

- 有 ids/source list 的实体集合

例如：

- `fields.all`
- `fields.custom`
- `items`

`ids?: true` 表示：

- ids 顺序或全集发生变化

## 6.6 `SectionDelta`

```ts
export interface SectionDelta extends MemberDelta<SectionKey> {
  keys?: true
}
```

这里用 `keys`，不叫 `ids`，因为 runtime source 本身就是：

- `sections.keys`

API 直接对齐 runtime source 更清楚。

## 6.7 `SummaryDelta`

```ts
export interface SummaryDelta extends MemberDelta<SectionKey> {}
```

summary 没有单独的 ids store，所以不需要 `ids/keys` 标记。

## 6.8 `ActiveDelta`

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
  fields?: {
    all?: EntityDelta<FieldId>
    custom?: EntityDelta<FieldId>
  }
  sections?: SectionDelta
  items?: EntityDelta<ItemId>
  summaries?: SummaryDelta
}
```

这份合同有几个刻意的特点。

### 1. 没有 `ActiveBaseDelta`

public API 直接暴露 artifact 本身：

- `view`
- `meta`
- `fields`
- `sections`
- `items`
- `summaries`

不再套一层 `base/publish`。

### 2. 没有 `changed` 后缀

例如：

- `view?: true`
- `meta.query?: true`
- `items.ids?: true`

presence 就是语义。

### 3. 直接对齐 runtime source

runtime source 当前最核心的更新面就是这些字段。

所以 runtime adapter 拿到 delta 后，可以直接按同一层级 apply。

---

## 7. 这个 public API 为什么比上一版更对

因为它同时满足三件事：

1. 不再泄漏 store patch 语义
2. 不再把 engine 内部 stage delta 硬抬成 public contract
3. 直接对齐 runtime source 的真实消费面

## 7.1 它不是 adapter patch

它不会再出现：

- `set`
- `remove payload`
- `ItemValue`
- `Section`
- `CalculationCollection`

这些都留给 runtime 从 snapshot 里读。

## 7.2 它也不是 internal stage delta

它不会再出现：

- `QueryDelta`
- `MembershipDelta`
- `SummaryDelta`

因为 runtime 不直接消费这些内部状态。

## 7.3 它正好卡在 engine 和 runtime 的边界上

它表达的是：

- 哪些 published artifact 变了

而这正是 runtime source adapter 真正需要知道的东西。

---

## 8. internal stage delta 该怎么处理

这里也要说清楚：

internal stage delta 不是不要了，而是不要直接变成 public API。

## 8.1 内部保留

下面这些类型继续保留，而且很重要：

- `QueryDelta`
- `MembershipDelta`
- `SummaryDelta`

它们适合做：

- dirty planning
- phase 依赖传播
- summary/incremental derive
- perf trace

## 8.2 不直接公开

public `EngineDelta.active` 不应该直接长成：

- `query`
- `membership`
- `summary`

这种结构。

因为这会让 runtime 被迫理解 engine 内部 runtime state。

## 8.3 正确出口

正确做法是：

1. internal phases 先产出 internal delta
2. publish phases 再产出 published artifact delta
3. publisher 最终统一组装 public `ActiveDelta`

也就是说：

> stage delta 是 engine 内部真源，public delta 是 publisher 折叠后的对外真源。

---

## 9. `shared/projection-runtime` 在最终模型里的角色

这里结论必须非常明确：

> `shared/projection-runtime` 属于 engine，不属于 dataview-runtime。

## 9.1 它应该承接什么

它应该成为 active derive 的统一 phase runtime，负责：

1. 根据 `CommitImpact/BaseImpact` 做 dirty planning
2. 跑 phase graph
3. fanout dependent phases
4. 收集 internal phase delta
5. 最终由 publisher 组装：
   - active snapshot
   - public `ActiveDelta`
   - trace

## 9.2 它不应该承接什么

它不应该负责：

- source/store patch
- keyed table apply
- runtime source fanout
- react 订阅

这些都属于 `dataview-runtime`。

## 9.3 为什么这和当前代码是对齐的

因为当前 runtime 已经有自己的 source adapter：

- [createEngineSource.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/createEngineSource.ts)

而 `projection-runtime` 现在还没有进 dataview-runtime 主链。

这恰好说明：

- 把它放进 engine，是顺着当前边界走
- 把它放进 runtime，反而会把 derive 真相拉错层

---

## 10. 最终 active runtime 结构怎么拆最好

如果按最终形态重写 active runtime，我建议 phase 继续保留两层：

## 10.1 internal derive phases

1. `query`
2. `membership`
3. `summary`

这些 phase 继续产 internal delta。

## 10.2 publish phases

4. `view`
5. `meta`
6. `fields`
7. `sections`
8. `items`
9. `summaries`

这样拆的关键价值不是为了更多抽象，而是为了让 public `ActiveDelta` 有天然来源。

当前最大的问题不是 publish 算不出来，而是：

- publish 没有产 public delta

只要 publish phase 自己开始产 delta，`projectActiveChange()` 这条 snapshot diff 路就应该整体删除。

---

## 11. runtime source adapter 该怎么消费新模型

runtime 拿到的是：

1. `snapshot`
2. `delta`

然后按下面规则工作。

## 11.1 document 部分

runtime 读取：

- `delta.doc`
- `snapshot.doc`

自己决定：

- 哪些 document record source 要刷新
- 哪些 field source 要刷新
- 哪些 view source 要刷新

这里完全不需要 engine 再给：

- `DocumentChange.set/remove`

## 11.2 active 部分

runtime 读取：

- `delta.active`
- `snapshot.active`

然后：

- `reset` 时直接 reset active source
- `view` 存在时刷新：
  - `ready`
  - `id`
  - `type`
  - `current`
- `meta.query/table/gallery/kanban` 存在时刷新对应 value store
- `fields` 存在时按 ids/update/remove 刷新 field source
- `sections` 存在时按 keys/update/remove 刷新 section source
- `items` 存在时按 ids/update/remove 刷新 item key table
- `summaries` 存在时刷新 section summary source

关键点是：

- runtime patch 仍然存在
- 但 patch 是 runtime 自己的内部行为
- 不再是 engine public contract 的一部分

## 11.3 item delta 为什么必须是 id-first

这点和 KeyTable 文档完全一致。

`items` 最优 public delta 应该只给：

- `ids?: true`
- `update: readonly ItemId[]`
- `remove: readonly ItemId[]`

然后 runtime source adapter 再从 `snapshot.active.items` 里读取：

- `record`
- `section`
- `placement`

写入自己的 `KeyTableStore<ItemId, ItemValue>`。

也就是说：

- engine 不给 `ItemValue`
- runtime 才去 materialize `ItemValue`

这才符合最终边界。

---

## 12. 当前旧合同应该删什么

如果按最终正确方向改，我建议直接删掉下面这些东西。

## 12.1 删掉 old public change contract

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

都应整体删除。

## 12.2 删掉 snapshot diff 投影链

也就是：

- `projectDocumentChange`
- `projectActiveChange`
- `projectEngineChange`

只要 public delta 开始由 publisher 直接产出，这些函数就没有存在必要。

## 12.3 删掉 engine 内任何 store-shaped payload 构造器

只要 engine 里还在做下面这些事，就说明边界还没完全改干净：

- 构造 `set/remove`
- 构造 `ItemValue`
- 构造 `Section` patch payload
- 构造 `CalculationCollection` patch payload

这些都应该留给 runtime source adapter。

---

## 13. 推荐落地顺序

如果直接走最终形态，我建议按下面顺序做。

## 第一阶段：先换 public 语言

1. `EngineResult.change` 改成 `delta`
2. `EngineCore.read.change()` 改成 `delta()`
3. 定义新的 `EngineDelta`
4. 删掉 old `contracts/change.ts`

这一阶段的目标是先把 public API 纠正。

## 第二阶段：把 public delta 改成 published artifact 视角

5. internal `QueryDelta/MembershipDelta/SummaryDelta` 保持 internal
6. publish phases 开始产：
   - `view`
   - `meta`
   - `fields`
   - `sections`
   - `items`
   - `summaries`
7. publisher 统一组装 public `ActiveDelta`

这一阶段的目标是让 runtime 真正拿到自己需要的 delta。

## 第三阶段：删除 snapshot diff

8. 删除 `projectDocumentChange`
9. 删除 `projectActiveChange`
10. 删除 `projectEngineChange`
11. commit 末尾不再基于 `previous/next snapshot` 反推 change

这一阶段做完，旧 change model 就基本退场了。

## 第四阶段：把 active runtime 切到 `projection-runtime`

12. 用 `shared/projection-runtime` 托管 active phase graph
13. planner 直接吃 `CommitImpact/BaseImpact`
14. publisher 统一产 `snapshot + delta + trace`

这一阶段才是 engine derive runtime 的统一。

## 第五阶段：runtime source adapter 切到新 delta

15. runtime 改成消费 `snapshot + delta`
16. runtime 内部自己生成 store patch
17. item source 继续走 `KeyTableStore`

这一阶段完成后，engine/runtime 边界就彻底闭环了。

---

## 14. 最终结论

如果把边界文档、KeyTable 文档、当前 engine contract、以及 runtime source adapter 一起看，最佳最终形态其实很清楚：

1. `CommitImpact` 继续作为 document invalidation 真源
2. `BaseImpact` 继续作为 engine 内部 dirty helper
3. internal stage delta 继续留在 engine 内部
4. public `EngineDelta` 直接对齐 runtime source 真实消费的 published artifact
5. public API 用 `delta`，不用 `change`
6. public delta 用名词层级和 presence 语义，不用 `xxxChanged`
7. `shared/projection-runtime` 进入 engine，承接 active phase runtime
8. `dataview-runtime` 只消费 `snapshot + delta`，自己决定如何 patch source/store

一句话概括：

> engine 应该输出 published artifact delta，而不是 runtime patch，也不是 internal stage delta。

这才是当前代码、边界文档和未来 `projection-runtime` 方向同时成立时，最干净、最稳定、也最容易继续优化的模型。

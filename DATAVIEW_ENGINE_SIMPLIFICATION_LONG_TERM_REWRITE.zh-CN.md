# Dataview Engine 长期简化与可读性重构方案

本文只讨论一件事：

在当前性能热点已经基本收敛之后，`dataview-engine` 还能从架构、类型、目录、文件组织上做哪些长期最优的简化，让底层模型更顺、更少中间层、更好读。

前提固定如下：

- 不在乎重构成本
- 不需要兼容
- 不保留过渡层
- 优先改底层模型，不做表面缝补
- 目标是最终形态，不是平滑迁移

---

## 1. 当前判断

当前 `dataview-engine` 的主要问题已经不是“算得慢”，而是“组织得不够收敛”。

这轮看下来，复杂度主要来自 6 类来源：

1. public contract 和 internal phase state 混在一起
2. 同一条 active 主链同时使用了 `projection / snapshot / publish / runtime` 四套命名
3. publish 相关逻辑被散落在多个目录
4. 小文件过多，但真正复杂的大文件又没有按职责拆开
5. 一些 pre-rewrite 遗留的泛型工具和死代码还没删干净
6. 底层上下文、delta helper、empty state、reader helper 仍然有重复实现

当前代码体量的几个事实：

- `dataview/packages/dataview-engine/src` 现在有 `99` 个源文件
- 总行数约 `16516`
- `40` 行以内的小文件有一批，其中不少只是转发、别名或单一薄包装
- 但同时又存在一个明显过大的文件：
  - [query/derive.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/query/derive.ts)
  - 当前约 `1247` 行

这说明现在的主要问题不是“文件太多”或者“文件太少”，而是切分粒度不均衡，且概念边界没有完全收干净。

一句话概括：

> 下一步最值得做的不是继续做局部优化，而是把 internal model、目录命名、public contract、active 主链结构一起收成一套统一语言。

---

## 2. 这轮研究后的核心结论

### 2.1 `contracts/` 里混入了不该 public 的 internal state

下面这些并不是 engine public API，而是 active derive runtime 内部状态：

- [contracts/query.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/query.ts)
- [contracts/membership.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/membership.ts)
- [contracts/summary.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/summary.ts)
- [contracts/stage.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/stage.ts)
- [contracts/state.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/state.ts)

这些类型没有给 runtime/react/public consumer 建模，它们只是：

- query phase state
- membership phase state
- summary phase state
- derive action

把它们放在 `contracts/` 下，会造成两个问题：

- 读代码的人会误以为这些是 public boundary 的一部分
- internal phase state 的演进会被“contracts”这个名字绑住，导致底层模型不够敢改

长期最优做法：

- `contracts/` 只保留真正 public 的 engine contract
- phase state 全部迁到 `active/internal` 或 `active/state`

### 2.2 active 主链的命名还没有统一

当前 active 链同时存在这些概念：

- `active/projection/*`
- `active/snapshot/*`
- `active/snapshot/publish/*`
- `active/snapshot/base/*`

这会造成非常差的阅读体验：

- `projection` 是 runtime orchestration
- `snapshot` 有时指 phase state，有时指 published artifact
- `publish` 有时是 stage，有时是 helper
- `base` 实际上是在做 published base artifact assembly

现在最不顺的点不是实现错，而是名字不一致。

长期最优做法不是再加一层，而是统一成一套词：

- `active/runtime/*` 只承接 phase runtime
- `active/query/*` 只承接 query phase
- `active/membership/*` 只承接 membership phase
- `active/summary/*` 只承接 summary phase
- `active/publish/*` 只承接 published artifact assembly

也就是说，最终应该删除：

- `active/projection/`
- `active/snapshot/`

改成单一主链目录。

### 2.3 publish 逻辑现在被拆散了，读链路要来回跳

今天 publish 相关逻辑分散在：

- [membership/publish.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/membership/publish.ts)
- [summary/publish.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/summary/publish.ts)
- [publish/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/publish/runtime.ts)
- [publish/delta.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/publish/delta.ts)
- [base/index.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/base/index.ts)
- [base/query.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/base/query.ts)
- [base/fields.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/base/fields.ts)
- [base/viewModes.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/base/viewModes.ts)

这会让“publish 出口”没有单一所有者。

长期最优做法：

- 所有 published artifact assembly 都放进 `active/publish/`
- `query/membership/summary` phase 只负责 internal state + internal delta
- publish 阶段统一负责：
  - view/meta base artifact
  - sections/items artifact
  - summaries artifact
  - active delta projection

### 2.4 现在还有明显的 dead code 和 one-off abstraction

这轮直接看到几处应该删除的东西：

1. [active/snapshot/trace.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/trace.ts)
   - `buildStageMetrics` 目前没有任何调用
   - 这是纯死代码，应该直接删

2. [active/snapshot/stage.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/stage.ts)
   - `runSnapshotStage` 现在只剩 query runtime 在用
   - membership / summary / publish 已经不走它
   - 这不是通用基础设施，只是一个残留泛型包装
   - 最终应该内联回 query phase

3. [api/engine.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/api/engine.ts)
   - 只有 3 行转发
   - [index.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/index.ts) 可以直接导出最终 public API

4. [summary/empty.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/summary/empty.ts)
   - 单独一个顶层 `summary/` 目录只放 empty helper，不值得保留
   - 应并回 summary state/publish 模块

5. [active/index/context.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/context.ts)
   - 本质上只是对 [document/reader.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/document/reader.ts) 的再包装
   - 长期应该删掉，统一 document context 入口

### 2.5 底层 helper 和 empty constant 还有重复

明确已经重复的几类：

1. `createCollectionDelta`
   - [core/delta.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/core/delta.ts)
   - [publish/delta.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/publish/delta.ts)
   - [membership/publish.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/membership/publish.ts)

2. empty delta 常量
   - [projection/working.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/projection/working.ts)
   - [membership/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/membership/runtime.ts)
   - [summary/sync.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/summary/sync.ts)

3. document context creation
   - [api/createEngine.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/api/createEngine.ts)
   - [core/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/core/runtime.ts)
   - [mutate/commit/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/mutate/commit/runtime.ts)
   - [active/index/context.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/context.ts)

4. group field 解析逻辑
   - [active/commands/query.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/commands/query.ts)
   - [active/commands/sections.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/commands/sections.ts)

这类重复不复杂，但持续增加阅读成本。

### 2.6 一些类型本身就是冗余或命名不一致

目前已经能直接确认的有：

1. [contracts/core.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/core.ts)
   - `ActiveSnapshot = ViewState`
   - 纯别名，没有独立语义，应该删

2. [contracts/shared.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/shared.ts)
   - `SectionData` + `type Section = SectionData`
   - `SectionData` 没有别处使用，应该只保留 `Section`

3. [contracts/shared.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/shared.ts)
   - `ItemIdPool` 目前只在 engine internal 使用
   - 不应继续放在 public contract

4. [active/index/contracts.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/contracts.ts)
   - `FieldContext` 未使用
   - `IndexDeriveInput` 未使用
   - 应直接删除

5. history capacity 命名不一致
   - internal: `history.cap`
   - public: `history.capacity`
   - 应统一为 `capacity`

### 2.7 active API 被切成太多极薄的 factory 文件

当前这些文件都很薄：

- [commands/summary.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/commands/summary.ts)
- [commands/gallery.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/commands/gallery.ts)
- [commands/kanban.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/commands/kanban.ts)
- [commands/display.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/commands/display.ts)
- [commands/sections.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/commands/sections.ts)

这些文件不是“高复用模块”，更像是 API 碎片。

长期最优做法：

- active API 按领域并成更少的文件
- 把重复的 `base.patch(...)`、`reader.fields.get(...)`、group field 解析抽成 context helper

### 2.8 `query/derive.ts` 过大，而且职责混杂

[query/derive.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/query/derive.ts) 现在把下面这些东西全塞在一起了：

- search candidate resolve
- search exact match
- bucket filter candidate
- sorted filter candidate
- predicate filter
- order projection
- reverse/empty-last order helper
- query state publish

这不是“一个模块很强”，而是“多个局部算法被堆在一个文件里”。

长期最优做法不是继续把更多小优化加进去，而是按职责拆成 4 块：

1. `query/search.ts`
2. `query/filterCandidates.ts`
3. `query/order.ts`
4. `query/state.ts`

这样做会增加少量文件，但会显著降低主文件认知负担。

---

## 3. 长期最优原则

下一轮重构建议严格按下面 6 条原则推进。

### 3.1 public contract 只讲 public 语言

`contracts/` 只保留：

- engine public snapshot/delta/result
- engine public read/write API
- engine public artifact types

不再放：

- phase working state
- derive action
- internal helper type
- engine internal pool/runtime scratch type

### 3.2 一个概念只在一个目录落地

最终应该做到：

- query phase 只在 `active/query`
- membership phase 只在 `active/membership`
- summary phase 只在 `active/summary`
- publish artifact 只在 `active/publish`
- runtime orchestration 只在 `active/runtime`

禁止继续出现：

- 一半在 `snapshot`
- 一半在 `projection`
- 一半在 phase 目录
- 一半在 publish 目录

### 3.3 删除伪抽象，保留真边界

该删的：

- 只被一个地方调用的“通用”helper
- 只做转发的 barrel/file
- 只为了命名好看存在的 alias type

该保留的：

- public contract boundary
- active phase boundary
- commit / history / active runtime 三大职责边界

### 3.4 小文件要并，超大文件要拆

不是盲目减少文件数，而是追求合理粒度：

- 15 到 40 行的薄包装文件，优先并
- 1000 行级别且混多种职责的文件，优先拆

### 3.5 helper 必须有唯一 owner

下面这些能力，最终都应该只保留一个 owner：

- collection delta builder
- empty delta constants
- document read context
- group field resolve
- view patch helper

### 3.6 internal model 优先简单，不优先抽象

例如：

- `ItemIdPool` 这种 internal runtime object，不要放到 public contract
- `ActiveSnapshot = ViewState` 这种别名直接删
- `SectionData` 这种无意义中转类型直接删

---

## 4. 最终目录形态

长期最优建议收敛成下面这类结构：

```text
src/
  index.ts
  createEngine.ts
  contracts/
    api.ts
    core.ts
    delta.ts
    history.ts
    performance.ts
    shared.ts
    view.ts
  core/
    runtime.ts
    history.ts
    performance.ts
    delta.ts
  document/
    reader.ts
  active/
    plan.ts
    state.ts
    api/
      active.ts
      context.ts
      read.ts
      query.ts
      layout.ts
      records.ts
      items.ts
    runtime/
      runtime.ts
      planner.ts
      trace.ts
      working.ts
    query/
      runtime.ts
      search.ts
      filterCandidates.ts
      order.ts
      state.ts
    membership/
      runtime.ts
      derive.ts
    summary/
      runtime.ts
      derive.ts
    publish/
      runtime.ts
      base.ts
      delta.ts
      sections.ts
      summaries.ts
    shared/
      delta.ts
      selection.ts
      partition.ts
      transition.ts
      rows.ts
      itemIdPool.ts
      sections.ts
  mutate/
    commit/
      runtime.ts
      trace.ts
    planner/
      index.ts
      scope.ts
      fields.ts
      records.ts
      views.ts
    issues.ts
```

这里最重要的不是树形长什么样，而是 4 个明确变化：

1. 删除 `active/projection`
2. 删除 `active/snapshot`
3. 删除 root `summary/`
4. 删除 internal state 对 `contracts/*` 的占用

---

## 5. 最终 public API

长期最优 public API 应该继续保持很小。

## 5.1 保留的 public 出口

`@dataview/engine` 最终只保留：

- `createEngine`
- engine public types
- 少量明确需要 public 的纯函数 helper

建议最终形态：

```ts
export { createEngine } from './createEngine'

export type {
  CreateEngineOptions,
  Engine,
  EngineCore,
  EngineResult,
  EngineSnapshot,
  EngineDelta,
  ActiveDelta,
  ViewState,
  CellRef,
  MoveTarget,
  MovePlan,
  ViewCell,
  ItemId,
  ItemPlacement,
  ItemList,
  Section,
  SectionKey,
  SectionList,
  FieldList
} from './contracts'
```

## 5.2 建议从 public API 删除的东西

### `EMPTY_VIEW_GROUP_PROJECTION`

这个值本质上是 UI fallback，不是 engine contract。

现在它被：

- engine internal projection
- runtime source
- react page panel

一起拿来当默认值。

长期最优做法是：

- engine internal 自己保留 private empty group value
- runtime/react 自己决定自己的 UI fallback
- engine public 不再导出 `EMPTY_VIEW_GROUP_PROJECTION`

### `ItemIdPool`

它只属于 engine internal active publish working state，不应出现在 public contract。

---

## 6. 必须做的底层模型收敛

### 6.1 把 internal phase state 从 public contract 挪出去

最终建议合并成一个 internal 文件：

```ts
export type PhaseAction = 'reuse' | 'sync' | 'rebuild'

export interface QueryPhaseState { ... }
export interface MembershipPhaseState { ... }
export interface SummaryPhaseState { ... }

export const emptyQueryPhaseState = () => ...
export const emptyMembershipPhaseState = () => ...
export const emptySummaryPhaseState = () => ...
```

好处：

- active runtime 的 working memory 有固定 owner
- public contract 不再被 internal phase 细节污染

### 6.2 统一 document context

现在 document context 分散在多处创建。

最终建议只保留一个入口：

```ts
export interface DocumentReadContext {
  document: DataDoc
  reader: DocumentReader
  fieldIds: readonly FieldId[]
  fieldIdSet: ReadonlySet<FieldId>
  fieldsById: ReadonlyMap<FieldId, Field>
  activeViewId?: ViewId
  activeView?: View
}

export const createDocumentReadContext(document: DataDoc): DocumentReadContext
```

然后：

- engine bootstrap 用它
- commit runtime 用它
- index derive 直接吃它，不再包一层 `active/index/context.ts`

### 6.3 把 delta helper 收成一个 internal util

最终只保留一份：

```ts
export const createCollectionDelta = ...
export const buildKeyedCollectionDelta = ...
```

owner 建议放在：

- `active/shared/delta.ts`
  或
- `core/delta.ts` if 仅 engine internal 公共使用

### 6.4 统一 empty delta / empty state

不要再到处定义：

- `EMPTY_QUERY_DELTA`
- `EMPTY_MEMBERSHIP_DELTA`
- `EMPTY_SUMMARY_DELTA`

最终应该由对应 phase state module 统一导出。

### 6.5 history state 字段统一

internal / public 全部统一为：

```ts
capacity
```

不要再混用：

- `cap`
- `capacity`

---

## 7. active API 的长期最优形态

当前 `api/active.ts` 装配了很多极薄的 command factory。

长期最优建议按“用户看得懂的 domain”合并成下面 4 组：

1. `query.ts`
   - `search`
   - `filters`
   - `sort`
   - `group`
   - `sections`

2. `layout.ts`
   - `display`
   - `summary`
   - `table`
   - `gallery`
   - `kanban`

3. `records.ts`
   - active records create

4. `items.ts`
   - move / remove / planMove
   - cells

同时给 `ActiveViewContext` 增加两个 helper：

```ts
resolveGroupField(): Field | undefined
patchView(resolve: (...) => ViewPatch | undefined): boolean
```

这样 [query.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/commands/query.ts) 和 [sections.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/commands/sections.ts) 里重复的 group field 解析就能完全删掉。

---

## 8. `query/derive.ts` 的最终拆法

这个文件必须重构，但重构方式不能搞抽象框架。

长期最优拆法建议非常直接：

### 8.1 `query/search.ts`

只负责：

- indexed search candidate
- exact search
- search source key / revision key

### 8.2 `query/filterCandidates.ts`

只负责：

- bucket filter candidate
- sorted filter candidate
- filter candidate merge
- predicate rule resolve

### 8.3 `query/order.ts`

只负责：

- matched order
- view order
- reverse / empty-last helper
- membership projection helper

### 8.4 `query/state.ts`

只负责：

- `publishQueryState`
- `ViewRecords` publish
- visible diff
- query delta

### 8.5 `query/runtime.ts`

只保留：

- action resolve
- reuse resolve
- phase orchestration

这会让 query 主链变成一个正常可读的 200 到 300 行 runtime 文件，而不是今天这种一眼看不出结构的大杂烩。

---

## 9. mutate / commit 还可以继续收的一处

[mutate/planner/index.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/mutate/planner/index.ts) 里有一份 planner 自己的 document operation apply switch：

- `applyPlannerOperation`
- `applyPlannerOperations`

这本质上是在复制一份 operation 语义。

长期最优做法：

- planner 不要维护自己的 shadow apply 逻辑
- 把“单步 operation apply”沉到统一的 operation helper
- planner 和 commit 共享同一个 operation 语义实现

这件事的价值不在性能，而在于：

- 避免 planner/commit 语义漂移
- 减少一份大 switch 的维护面

---

## 10. 建议直接删除或收口的清单

下面这些可以进入第一批删除/收口名单：

- [active/snapshot/trace.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/trace.ts)
- [active/snapshot/stage.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/stage.ts)
- [api/engine.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/api/engine.ts)
- [contracts/state.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/state.ts)
- [contracts/query.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/query.ts)
- [contracts/membership.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/membership.ts)
- [contracts/summary.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/summary.ts)
- [contracts/stage.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/stage.ts)
- [active/index/context.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/context.ts)
- [summary/empty.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/summary/empty.ts)

下面这些名字或类型建议直接收口：

- `ActiveSnapshot`
- `SectionData`
- `ItemIdPool` public export
- `FieldContext`
- `IndexDeriveInput`
- `history.cap`

---

## 11. 落地顺序

建议按下面顺序推进，不要并行乱改。

### Phase 1. 清理 public/internal contract

- phase state 挪出 `contracts/`
- 删除 `ActiveSnapshot`、`SectionData`、`ItemIdPool` public export
- 收紧 `index.ts` 的 public export
- 去掉 `EMPTY_VIEW_GROUP_PROJECTION` 的 public 暴露

### Phase 2. 收敛 active 主目录

- 删除 `active/projection`
- 删除 `active/snapshot`
- 改成 `active/runtime + active/query + active/membership + active/summary + active/publish`

### Phase 3. 统一底层 helper owner

- 统一 document context
- 统一 delta helper
- 统一 empty state / empty delta
- 统一 history capacity 字段

### Phase 4. 合并 active API 薄文件

- 合并 query/sections
- 合并 display/summary/table/gallery/kanban
- 给 context 补 group field helper

### Phase 5. 拆 query 大文件

- 拆 `query/derive.ts`
- 删 `runSnapshotStage`
- 让 `query/runtime.ts` 只保留 phase orchestration

### Phase 6. 收 planner operation 语义

- 删除 planner shadow apply
- 使用统一 operation helper

---

## 12. 最终结论

这轮研究后，我认为 `dataview-engine` 的长期最优方向已经很明确：

1. 先把 public contract 和 internal state 彻底拆开
2. 再把 active 主链统一成一套目录和命名
3. publish 相关逻辑全部归一到单一目录
4. 删除死代码、伪抽象、薄转发文件
5. 合并过碎的 API 文件
6. 拆开真正过大的 query 文件

如果按这个方案做，最终收获不是“好像整洁了一点”，而是 4 个根本变化：

- engine public boundary 会更干净
- internal active runtime 会更好改
- 目录与文件跳转成本会明显下降
- 后续再做优化或功能重构时，底层模型不会继续别扭

一句话总结最终形态：

> `dataview-engine` 应该收敛成一个 public contract 很薄、active runtime 目录单一、publish owner 明确、query 模块职责清楚的内核，而不是继续保留今天这种“重构过很多轮，但旧名词和旧碎片还没完全清干净”的形态。

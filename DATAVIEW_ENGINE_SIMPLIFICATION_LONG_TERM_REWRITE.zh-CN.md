# Dataview Engine 长期最优简化方案

本文只讨论一件事：

在当前 `dataview-engine` 性能热点已经基本收敛之后，整条链上还剩哪些“别扭”的地方，应该如何按长期最优一次性收掉。

前提固定如下：

- 不在乎重构成本
- 不需要兼容
- 不保留过渡层
- 只要阻碍长期最优，就直接删
- 如果底层模型别扭，优先改底层模型

---

## 1. 当前判断

当前 `dataview-engine` 的主链已经基本收敛到了正确方向：

- `active` 主链已经是 `query -> membership -> summary -> publish`
- `publish` 没有再被拆成过多 phase
- `projection-runtime` 已经归到 engine 侧，不再让 runtime/react 自己拼 active publish
- 之前最明显的兼容层、过渡目录、consumer helper 已经删掉一批

所以现在的主要问题，已经不是“phase graph 还不够优雅”，而是下面 4 类边界问题：

1. public artifact model 里还残留 sentinel 和不自然字段
2. read API 有重复 owner，document / active / core 之间边界不够硬
3. contracts 的 owner 还不够收敛，public barrel 和 internal leaf 混着用
4. 少数基础设施实现虽然快，但模型还是偏拧巴

一句话概括：

> 下一步不该继续折腾 phase 数量，也不该再加抽象层，而是应该把 public model、read boundary、contracts owner 和少数底层 primitive 一次收干净。

---

## 2. 这轮扫描后的核心结论

这轮看下来，真正还值得动的地方主要有 6 处，前 4 处属于必须收敛。

### 2.1 `ViewGroupProjection` 还是 sentinel model，这是当前最不和谐的 public shape

当前 `query.group` 的 public shape 仍然是：

```ts
export interface ViewGroupProjection {
  active: boolean
  fieldId: FieldId | ''
  field?: Field
  mode: string
  bucketSort?: BucketSort
  bucketInterval?: number
  showEmpty: boolean
  availableModes: readonly string[]
  availableBucketSorts: readonly BucketSort[]
  supportsInterval: boolean
}
```

这个模型的问题不是“丑”，而是它会持续把复杂度往外扩散：

- 未分组靠 `active: false`
- 同时又要求 `fieldId: ''`
- `mode` 还得给空字符串
- runtime/react 不得不自己保留一份空 group fallback

这已经外溢到了 consumer 侧：

- `dataview-runtime/src/source/createEngineSource.ts`
- `dataview-react/src/page/features/viewSettings/panels/GroupingPanel.tsx`
- `dataview-react/src/views/table/uiRuntime.ts`

这说明问题不在 consumer，而在 engine public model。

长期最优做法：

- `group` 不再“永远存在”
- 未分组直接用 `undefined`
- 删除 `active`
- 删除 `fieldId: ''`
- 删除所有 public empty group 常量

最终 API 应该改成：

```ts
export interface ViewGroupProjection {
  fieldId: FieldId
  field?: Field
  mode: string
  bucketSort?: BucketSort
  bucketInterval?: number
  showEmpty: boolean
  availableModes: readonly string[]
  availableBucketSorts: readonly BucketSort[]
  supportsInterval: boolean
}

export interface ActiveViewQuery {
  search: ViewSearchProjection
  filters: ViewFilterProjection
  group?: ViewGroupProjection
  sort: ViewSortProjection
}
```

最终语义：

- `query.group === undefined` 表示未分组
- `query.group.fieldId` 永远是真 field id
- `query.group.field` 允许缺失，表达“view 配了 group，但 field 当前不存在”

这套模型会直接把很多 awkward fallback 一起删除。

### 2.2 `ActiveDelta` 还没有完全对齐 published artifact，`meta` 这一层是多余的

当前 `ActiveDelta` 里存在：

```ts
meta?: {
  query?: true
  table?: true
  gallery?: true
  kanban?: true
}
```

这和当前 published artifact 不一致。

当前 `ViewState` 的顶层是：

- `view`
- `query`
- `records`
- `sections`
- `items`
- `fields`
- `table`
- `gallery`
- `kanban`
- `summaries`

但 `ActiveDelta` 却把其中一部分又塞到了 `meta` 里。

这会带来两个问题：

- public delta 语言没有完全贴住 published artifact
- source/runtime 订阅时还要多想一层“meta 到底是不是 artifact”

长期最优做法：

- 删除 `meta`
- `ActiveDelta` 顶层字段直接和 `ViewState` 顶层 artifact 对齐

最终 API 应该改成：

```ts
export interface ActiveDelta {
  reset?: true
  view?: true
  query?: true
  table?: true
  gallery?: true
  kanban?: true
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

这里不需要再造新的 delta 语言。

只需要做到一句话：

> published snapshot 长什么样，public delta 就尽量按同样的 artifact 颗粒度表达变化。

### 2.3 read surface 还是有重复 owner，document / active / core 需要彻底收口

现在同一份数据存在多个别名入口：

- `core.read.active()`
- `engine.read.activeState()`
- `engine.active.state()`

还有 document 侧重复：

- `core.read.document()`
- `engine.read.document()`
- `engine.document.export()`

active context 内部甚至还有：

- `state`
- `snapshot`

这类别名的长期危害很明确：

- 谁是正式 owner 不清晰
- 消费者容易跨层拿数据
- 阅读代码时会反复判断“这是语义不同，还是同义别名”

长期最优边界应该很硬：

### public 最终 owner

- `engine.core`
  - 只负责最底层结果流、commit、history
- `engine.read`
  - 只负责 document selector
- `engine.active`
  - 只负责 active view snapshot + active command

### final public API

```ts
export interface EngineCoreRead {
  result: () => EngineResult
}

export interface EngineReadApi {
  document: () => DataDoc
  record: (recordId: RecordId) => DataRecord | undefined
  field: (fieldId: FieldId) => CustomField | undefined
  view: (viewId: ViewId) => View | undefined
}

export interface DocumentApi {
  replace: (document: DataDoc) => DataDoc
}

export interface ActiveViewApi {
  id: () => ViewId | undefined
  view: () => View | undefined
  state: () => ViewState | undefined
  read: ActiveViewReadApi
  ...
}
```

明确删除：

- `EngineCoreRead.snapshot`
- `EngineCoreRead.delta`
- `EngineCoreRead.document`
- `EngineCoreRead.active`
- `EngineReadApi.activeViewId`
- `EngineReadApi.activeView`
- `EngineReadApi.activeState`
- `DocumentApi.export`
- `ActiveViewContext.snapshot`

如果外部要拿 activeViewId，直接读：

```ts
engine.read.document().activeViewId
```

如果外部要拿 active snapshot，直接读：

```ts
engine.active.state()
```

不再提供中间别名。

### 2.4 `ActiveViewReadApi` 也还有一点“便利过头”，应该收成 primitive read

当前 `ActiveViewReadApi` 里除了这些 primitive：

- `record`
- `field`
- `section`
- `placement`
- `cell`

还额外提供了：

- `filterField`
- `groupField`

这两个并不是 boundary 级能力，只是基于 `state().query` 再加一次 convenience resolve。

长期最优不应该继续往 `read` 里塞这种“半领域 helper”。

最终建议：

```ts
export interface ActiveViewReadApi {
  record: (recordId: RecordId) => DataRecord | undefined
  field: (fieldId: FieldId) => Field | undefined
  section: (sectionKey: SectionKey) => Section | undefined
  placement: (itemId: ItemId) => ItemPlacement | undefined
  cell: (cell: CellRef) => ViewCell | undefined
}
```

明确删除：

- `filterField`
- `groupField`

消费方如果要拿 group field，就按 public artifact 自己读：

```ts
const group = engine.active.state()?.query.group
const field = group
  ? engine.active.read.field(group.fieldId)
  : undefined
```

这比继续往 `read` 上堆 convenience 更稳。

### 2.5 result type 的 owner 还不对，`contracts/api.ts` 不应该拥有 `CommitResult`

当前 contract 依赖关系还是有明显的 owner 反向味道：

- `contracts/api.ts` 定义 `CommitResult / ActionResult`
- `contracts/core.ts` 反过来依赖 `contracts/api.ts`
- `contracts/history.ts` 也依赖 `contracts/api.ts`

这说明 `CommitResult` 被放在 façade 层了。

长期最优做法很简单：

- 新增 `contracts/result.ts`
- 把 `CommitResult / ActionResult / CreatedEntities` 挪进去
- `api.ts / core.ts / history.ts` 都依赖 `result.ts`

最终 contract owner 应该是：

```text
contracts/
  api.ts
  core.ts
  delta.ts
  history.ts
  performance.ts
  result.ts
  shared.ts
  view.ts
```

原则固定为：

- `api.ts` 只定义 public engine façade
- `core.ts` 只定义 core contract
- `result.ts` 只定义 commit result

### 2.6 internal import discipline 还不够硬，public barrel 不该继续给 engine 内部使用

现在 engine 内部仍然有不少文件直接 import：

```ts
import type { ... } from '@dataview/engine/contracts'
```

这会让 internal module 和 public barrel 继续缠在一起。

长期最优必须定一条硬规则：

- `@dataview/engine/contracts` 只给包外消费者用
- engine 内部一律 import leaf contract file
- internal state 一律从 `active/state` 或 local file 取

也就是说，engine 内部允许：

```ts
import type { ViewState } from '@dataview/engine/contracts/view'
import type { ActiveDelta } from '@dataview/engine/contracts/delta'
```

但不再允许：

```ts
import type { ViewState, ActiveDelta } from '@dataview/engine/contracts'
```

这不是代码风格问题，而是 boundary owner 问题。

---

## 3. 哪些地方不建议再折腾

为了避免再次把复杂度折回去，下面这些方向不建议再动。

### 3.1 不要把 publish 再拆成更多独立 phase

当前保留：

- `query`
- `membership`
- `summary`
- `publish`

这个数量已经足够稳定。

长期最优不是把 publish 再拆成：

- view
- query
- fields
- sections
- items
- summaries

而是保持单一 `publish` phase，在内部按 artifact writer 分工。

### 3.2 不要再给 runtime/react 增加“补 shape”的本地拼装

如果 engine public shape 别扭，就改 engine shape。

不再接受下面这类模式：

- react 侧自己拼 `currentView`
- runtime/source 自己补 empty group
- consumer 再包一层 selector 去修 engine output

长期最优是：

> engine publish 出来的 public artifact 本身就该是可直接消费的最终形态。

### 3.3 不要为了文件数好看去重新打散 `active/runtime/runtime.ts`

`active/runtime/runtime.ts` 现在虽然文件偏大，但职责仍然单一：

- runtime spec
- phase orchestration
- publisher
- update entry

这类文件只要 owner 清楚，就不值得再拆一层“helper file”去制造跳转成本。

同理，`active/membership/derive.ts` 当前也不是最优美的文件尺寸，但还没有到必须为了分文件而分文件的程度。

---

## 4. 最终 public API

如果按长期最优收敛，最终 API 应该明确到下面这层。

## 4.1 engine root

```ts
export interface Engine {
  core: EngineCore
  read: EngineReadApi
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

这里保留 `document` namespace 的唯一理由，是它拥有 `replace()` 这类文档级写操作。

它不再承担 read。

## 4.2 core

```ts
export interface EngineCoreRead {
  result: () => EngineResult
}

export interface EngineCore {
  read: EngineCoreRead
  commit: EngineCoreCommit
  history: EngineCoreHistory
  subscribe: (listener: (result: EngineResult) => void) => () => void
}
```

`core` 是低层结果流，不再提供多个别名读口。

## 4.3 active query

```ts
export interface ActiveViewQuery {
  search: ViewSearchProjection
  filters: ViewFilterProjection
  group?: ViewGroupProjection
  sort: ViewSortProjection
}
```

## 4.4 active read

```ts
export interface ActiveViewReadApi {
  record: (recordId: RecordId) => DataRecord | undefined
  field: (fieldId: FieldId) => Field | undefined
  section: (sectionKey: SectionKey) => Section | undefined
  placement: (itemId: ItemId) => ItemPlacement | undefined
  cell: (cell: CellRef) => ViewCell | undefined
}
```

## 4.5 active delta

```ts
export interface ActiveDelta {
  reset?: true
  view?: true
  query?: true
  table?: true
  gallery?: true
  kanban?: true
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

---

## 5. 底层基础设施的最终处理

### 5.1 `active/shared/patch.ts` 需要从“聪明 object”改成显式模型

当前 `createMapOverlay()` 的核心问题不是性能，而是模型太取巧：

- 用 object literal 假装 `ReadonlyMap`
- 依赖多处 `as unknown as`
- 需要额外维护 overlay depth

这类实现对底层维护者不友好，也会让类型系统变成配角。

长期最优建议只有两个选项：

### 选项 A，推荐

引入显式 `OverlayMap<K, V>` 类，实现 `ReadonlyMap<K, V>`：

- 明确持有 `previous / set / delete`
- 明确实现 `get / has / size / forEach / entries / keys / values / Symbol.iterator`
- 不再使用 `as unknown as`

这是我更推荐的最终形态。

原因很简单：

- 还能保留 overlay 的结构共享收益
- 但底层模型终于是正常的对象模型

### 选项 B

直接在 `finish()` 时 materialize 成 `Map`

优点：

- 最简单

缺点：

- 会放弃 overlay 结构共享

如果当前性能已经完全够用，选 B 也成立；如果还想保留现在这套 patch infra 的价值，选 A 更平衡。

### 5.2 `createMapPatchBuilder` / `createArrayPatchBuilder` 可以保留

这两个 builder 的 owner 目前是清晰的，问题不在它们本身，而在 overlay materialization 的表达方式。

所以长期最优不是删掉 patch infra，而是把最终 `finish()` 的模型收顺。

---

## 6. 目录与 owner

当前目录大方向已经对了：

```text
src/
  active/
    api/
    index/
    membership/
    publish/
    query/
    runtime/
    shared/
    summary/
  api/
  contracts/
  core/
  document/
  mutate/
```

这轮不建议再做大规模目录改名。

真正需要动的是 owner 规则，不是目录名字：

- `contracts/` 只放 public contract
- `active/state.ts` 只放 active internal phase state
- `active/shared/*` 只放 active private infra primitive
- `api/*` 只组 public engine façade
- `core/*` 只组 low-level engine core

换句话说：

> 当前目录大体可接受，剩下的问题主要不是目录树错，而是 public type / read owner / internal import discipline 还没有完全收硬。

---

## 7. 删除清单

按长期最优落地时，应该明确删除下面这些东西。

### 7.1 public 类型与字段

- `ViewGroupProjection.active`
- `ViewGroupProjection.fieldId: ''`
- `ActiveDelta.meta`

### 7.2 public API

- `EngineCoreRead.snapshot`
- `EngineCoreRead.delta`
- `EngineCoreRead.document`
- `EngineCoreRead.active`
- `EngineReadApi.activeViewId`
- `EngineReadApi.activeView`
- `EngineReadApi.activeState`
- `DocumentApi.export`
- `ActiveViewReadApi.filterField`
- `ActiveViewReadApi.groupField`

### 7.3 internal alias / duplication

- `ActiveViewContext.snapshot`
- engine internal 对 `@dataview/engine/contracts` barrel 的直接依赖

### 7.4 consumer fallback

- runtime/source 的 empty group fallback
- react/page settings 的 empty group fallback

这些 fallback 应该随着 `query.group?: ...` 一起自然消失。

---

## 8. 推荐落地顺序

如果要按“风险最小、收益最大”的顺序推进，我建议只分 4 步。

### 阶段 1：public model 收敛

- 把 `query.group` 改成 optional
- 删除 `ViewGroupProjection.active`
- 删除 `fieldId: ''`
- 把 `ActiveDelta.meta` 扁平化

这是收益最大的一步，因为它会直接清掉 runtime/react 侧一批 awkward fallback。

### 阶段 2：read boundary 收口

- 删除 `engine.read.activeViewId / activeView / activeState`
- 删除 `engine.document.export`
- 删除 `ActiveViewReadApi.filterField / groupField`
- 删除 `ActiveViewContext.snapshot`
- 把 consumer 和 internal call site 全部收敛到正式 owner

这一步会显著减少“数据到底该从哪层读”的噪音。

### 阶段 3：contract owner 收敛

- 新增 `contracts/result.ts`
- 挪走 `CommitResult / ActionResult / CreatedEntities`
- 清理 `api.ts / core.ts / history.ts` 之间的反向依赖
- 清理 engine internal 的 public barrel import

这一步是为了把 type graph 收顺。

### 阶段 4：patch primitive 收顺

- 把 `createMapOverlay()` 改成显式 `OverlayMap` 或 plain `Map`
- 删除 `as unknown as`
- 保留 builder，不保留“伪 ReadonlyMap”

这一步更多是底层维护性收益，不是直接业务收益。

---

## 9. 最终结论

当前 `dataview-engine` 已经不需要再做“大结构重写”。

下一步真正值得做的，不是再改 phase graph，不是再拆 publish，不是再加 runtime abstraction，而是把最后这些边界噪音一次收干净：

1. 把 `query.group` 从 sentinel model 改成自然 optional model
2. 把 `ActiveDelta` 改成真正 artifact-shaped delta
3. 把 `document / active / core` 的 read owner 收口
4. 把 `CommitResult` 从 `api.ts` 挪到独立 contract owner
5. 把 engine internal 对 public barrel 的依赖清掉
6. 把 `patch.ts` 从聪明技巧改成正常底层模型

如果这 6 点全部做完，`dataview-engine` 在“底层模型是否顺手、public API 是否清楚、代码是否好读”这三个维度上，基本就会进入最终形态。

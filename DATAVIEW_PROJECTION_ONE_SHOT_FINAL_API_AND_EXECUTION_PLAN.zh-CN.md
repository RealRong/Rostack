# Dataview Projection 一步到位最终 API 与实施方案

## 目标

这份文档只讨论一种落地方式：

- **不保留兼容层**
- **不保留旧 projection runtime**
- **不保留旧 projection delta**
- **不保留旧 impact 模型**
- **dataview projection 一步到位切到 shared/projection 的最终形态**

这里的“最终形态”不是“在现有三套 runtime 外面再包一层统一入口”，而是：

1. `shared/projection` 只保留一套正式 public API。
2. dataview 只保留一个 projection runtime。
3. mutation 到 projection 的唯一持久化变化事实只有 `MutationDelta`。
4. dataview 内部不再存在 `DocumentDelta / ActiveDelta / DataviewDelta / BaseImpact` 这类第二套协议。

## 强约束

本方案的硬约束如下：

1. `MutationDelta` 是 mutation 到 dataview projection 的唯一持久化输入。
2. dataview projection 只有一个 runtime，`index / query / membership / summary / publish` 只能是内部 phase，不能再是对外可见的三套 projection runtime。
3. dataview 不能再保留一套 `impact` 中间层把 `MutationDelta` 翻译成另一套长期存在的协议对象。
4. dataview 不能再保留 `DocumentDelta / ActiveDelta / DataviewDelta` 作为 projection 主协议。
5. `shared/projection` 不能再同时公开 `createProjectionRuntime + ProjectionSpec<...>` 和新的 `createProjection(...)` 作为两套正式 API。
6. dataview engine 不能再通过 mutation `publish` hook 生成 projection 结果。
7. dataview runtime consumer 也必须一起切换，不能靠旧 `publish.delta.doc / publish.delta.active` 存活。

如果以上任意一点不满足，本轮就不算“全部切换到新的上面”。

## 现状问题

当前 dataview projection 侧同时存在四层重复结构：

### 1. 多套 runtime

当前外部可见上实际是三套 projection runtime：

- `active/index/projection.ts`
- `active/projection/runtime.ts`
- `mutation/projection/document.ts`

再往外还有一层 orchestration：

- `mutation/projection/runtime.ts`

这不是一个 projection runtime，而是“3 个 runtime + 1 个 glue runtime”。

### 2. 多套 delta

当前除了 `MutationDelta` 之外，还保留：

- `contracts/delta.ts` 里的 `DocumentDelta`
- `contracts/delta.ts` 里的 `ActiveDelta`
- `contracts/delta.ts` 里的 `DataviewDelta`
- `mutation/documentDelta.ts`
- `active/publish/activeDelta.ts`

这导致 mutation 已经生成了 `MutationDelta`，projection 还要继续把它投影成另一套 delta 才能工作。

### 3. 多套 impact

当前 `active/projection/impact.ts` 里的 `BaseImpact` 已经不是“临时 helper”，而是 active/index projection 的主输入协议之一：

- `active/index/runtime.ts`
- `active/query/stage.ts`
- `active/membership/stage.ts`
- `active/summary/stage.ts`

都在依赖 `BaseImpact`。

只要 `BaseImpact` 还存在，`MutationDelta` 就没有真正直达 projection phase。

### 4. mutation publish 仍然耦合 projection

当前 `createEngine.ts` 仍然通过：

- `mutation/publish.ts`
- `mutation/projection/runtime.ts`

把 projection 结果挂回 mutation engine。

这与最终方案文档里“`MutationEngine` 不再接收 `publish`”直接冲突。

## 最终架构

最终 dataview 架构固定为：

```ts
intent
  -> MutationEngine.execute/apply
  -> commit { document, delta, ... }
  -> DataviewProjection.update({ document, delta, runtime })
  -> phases: document -> index -> query -> membership -> summary -> view
  -> projection state + stores + output
```

其中：

- mutation 层只负责 document + normalized `MutationDelta`
- projection 层只消费 `document + delta + runtime`
- dataview engine 负责把 commit 推给 projection runtime
- engine consumer 直接读 projection stores / output，不再读 `publish.delta`

## `shared/projection` 最终设计

## 只保留一个 public constructor

最终只保留：

```ts
import { createProjection } from '@shared/projection'
```

不再把以下内容作为正式 public API：

- `createProjectionRuntime`
- `ProjectionSpec<...>`
- domain 自己再包一层 runtime facade 才能好用

可以允许内部继续复用现有 runtime 实现，但外部 public contract 必须只剩一套。

## 最终 public API

```ts
type ProjectionRuntime<TInput, TOutput, TRead, TStores> = {
  revision(): number
  current(): TOutput
  read: TRead
  stores: TStores
  update(input: TInput): {
    revision: number
    output: TOutput
    trace: ProjectionTrace
  }
  subscribe(listener: (result: {
    revision: number
    output: TOutput
    trace: ProjectionTrace
  }) => void): () => void
}

const runtime = createProjection({
  createState,
  createRead,
  output,
  surface,
  phases
})
```

设计原则：

- `current()` 取代 `capture()`
- `output(...)` 取代 `capture(...)`
- `update(...)` 直接返回 `output`
- `stores/read/output` 是 projection 的正式公开结果

## 输入契约固定

对 mutation-backed projection，shared/projection 的标准输入固定为：

```ts
type ProjectionInput<TDocument, TRuntime> = {
  document: TDocument
  delta: MutationDelta
  runtime: TRuntime
}
```

这里不允许再插入：

- `DocumentDelta`
- `ActiveDelta`
- `DataviewDelta`
- `BaseImpact`
- `trace`
- `footprint`
- op batch

projection 的 phases 只能直接基于：

- `document`
- `delta`
- `runtime`

做 dirty 初始化和派生。

## surface 的最终能力

### 1. 声明式 changed

```ts
surface: {
  active: {
    kind: 'value',
    read: (state) => state.view.snapshot,
    changed: {
      keys: [
        'document.activeView',
        'view.create',
        'view.delete',
        'view.query',
        'view.layout',
        'view.calc',
        'record.create',
        'record.delete',
        'record.values',
        'field.create',
        'field.delete',
        'field.schema'
      ]
    }
  }
}
```

语义固定：

- `keys` 命中任一 semantic key，field changed
- 仍允许函数 fallback
- 但 domain 不应再为常见情况手写 changed 函数

### 2. 简单 family 的声明式 patch

```ts
surface: {
  sections: {
    kind: 'family',
    read: (state) => state.view.sections,
    patch: {
      create: ['view.layout', 'view.query', 'record.create'],
      update: ['record.values', 'field.schema', 'view.calc'],
      remove: ['record.delete', 'view.delete'],
      order: ['view.layout', 'view.query']
    }
  }
}
```

语义固定：

- `create` 命中的 ids 进入 `set`
- `update` 命中的 ids 进入 `set`
- `remove` 命中的 ids 进入 `remove`
- `order` 命中时刷新 ids
- 没命中时返回 `'skip'`

但这里有明确边界：

- 声明式 patch 只适用于简单 family
- runtime 不能为了声明式 patch 再去全量 diff `previous/next`
- runtime 不能每轮重新解释 patch 配置

正确实现必须是：

- projection 创建时预编译 patch 规则
- update 时直接从 `MutationDelta` 提取 touched ids
- 只生成 `set/remove/order` 所需的最小 patch

复杂 family 必须允许使用函数式 patch builder，不能强推 declarative。

## 性能边界

`surface.changed` 的声明式 semantic key 本身不应成为性能问题，前提是：

- key matcher 在 projection 创建时预编译
- update 时只做常量级查表

也就是说，它的运行时成本应接近手写：

```ts
hasDeltaChange(delta, 'view.query')
|| hasDeltaChange(delta, 'record.values')
|| hasDeltaChange(delta, 'field.schema')
```

真正需要谨慎的是 family patch。

如果 family patch 的实现退化成：

- 每次 update 重新解析配置
- 每次都对 `previous/next family` 做全量 diff
- 为了 declarative API 强行重新推导 phase 已经知道的 changed ids

那性能就会变差。

因此 shared/projection 的最终规则必须固定为：

1. `surface.changed` 可以广泛声明式化。
2. family patch 只对简单 family 提供声明式能力。
3. 复杂 family 必须允许 phase-owned patch builder。
4. runtime 禁止因为声明式 patch 退化成全量 diff。

## phase API

最终 phase API 不暴露 `scope / action / emit`。

最终形态固定为：

```ts
const projection = createProjection({
  createState,
  createRead,
  output,
  surface,
  phases: {
    document(ctx) {},
    index(ctx) {},
    query(ctx) {},
    membership(ctx) {},
    summary(ctx) {},
    view(ctx) {}
  }
})
```

每个 phase：

- 直接读取 `ctx.input`
- 直接修改 `ctx.state`
- 直接修改 `ctx.dirty`
- 直接写入 `ctx.phase.<name>.changed`

也就是说：

- 不需要 `scope`
- 不需要 `run(context) => { action }`
- 不需要 `run(context) => { emit }`

但这不等于不要增量调度。增量调度仍然存在，只是内化到统一 `context` 里。

shared/projection 只下沉：

- runtime
- 固定 phase 顺序执行
- `dirty` / `changed` 上下文管理
- declarative surface changed
- simple-family declarative patch
- custom patch builder hook
- trace/output

不下沉领域派生逻辑。

## projection context 最终模型

最终 shared/projection 提供给 phase 的不是 scope，而是一个统一的可变 context：

```ts
type ProjectionContext<TInput, TState, TPhaseName extends string> = {
  input: TInput
  state: TState
  revision: number
  dirty: {
    reset: boolean
    delta: MutationDelta
    [phaseOrFlag: string]: unknown
  }
  phase: Record<TPhaseName, {
    changed: boolean
    startedAt: number
    endedAt: number
  }>
}
```

其中语义固定：

- `input` 是本次 `projection.update(...)` 的原始输入
- `state` 是 projection 工作状态
- `revision` 是 projection revision
- `dirty` 是 phase 间传递的脏信息和增量调度标记
- `phase.*.changed` 表示该 phase 这轮是否真的修改了 state

因此，原来 `scope` 的职责全部归入 `ctx.dirty`，原来 `action / emit` 的职责分别归入：

- `ctx.phase.<name>.changed`
- `ctx.dirty.<downstream>`

## 为什么不要 `scope / action / emit`

原因不是这些语义不需要，而是这些语义不值得作为 public API 暴露：

- `scope` 只是 phase 的脏范围载体，本质上就是 context 上的一段临时字段
- `action` 只是“这个 phase 改没改”，完全可以内化成 `ctx.phase.<name>.changed`
- `emit` 只是“下游谁需要继续跑”，完全可以内化成 `ctx.dirty.<name> = true`

如果继续暴露 `scope / action / emit`，shared/projection 的 public API 会被框架细节污染，domain phase 读起来也会更绕。

对 dataview 这种固定 pipeline，这层抽象没有收益。

## dataview 最终设计

## 只保留一个 runtime

最终 dataview 只能有一个 projection runtime：

```ts
const projection = createDataviewProjection()
```

内部 phases 固定为：

- `document`
- `index`
- `query`
- `membership`
- `summary`
- `view`

这里：

- `document` phase 负责 active view、reader、plan、projection-local snapshot 入口
- `index` phase 负责索引增量
- `query` phase 负责 matched / ordered / visible
- `membership` phase 负责 section membership
- `summary` phase 负责 summaries
- `view` phase 负责最终 `ViewState` 与 surface

**这六个 phase 是一套 runtime 内部结构，不再是外部可见的多个 projection runtime。**

## dataview 不再保留 impact 类型

最终 dataview phase 输入里不再出现：

- `BaseImpact`
- `createBaseImpact(...)`

必须改成：

- projection runtime 初始化统一 `ctx.dirty`
- phases 直接读取 `ctx.dirty.delta`
- phases 直接把需要的脏事实写入 `ctx.dirty`

也就是说，最终 dataview 允许有：

- `ctx.dirty`
- phase-local helper

但不允许再有一个全局长期存在的 `impact` 协议对象。

允许存在的 helper 只能是短生命周期纯函数，例如：

```ts
const readTouchedRecords = (delta: MutationDelta) => ...
const readChangedViews = (delta: MutationDelta) => ...
const readSchemaFieldIds = (delta: MutationDelta) => ...
```

但这些 helper 不能再组合成对外暴露的 `BaseImpact` 类型。

## dataview 不再保留 projection delta

最终 dataview 不再保留：

- `DocumentDelta`
- `ActiveDelta`
- `DataviewDelta`
- `projectDocumentDelta(...)`
- `projectActiveDelta(...)`

projection 的唯一 delta 就是 mutation commit 提供的 `MutationDelta`。

projection 输出是：

- `ViewState`
- stores
- read api
- projection trace

而不是另一套 commit delta。

## dataview 的 surface 策略

dataview 不应把所有 surface 都强行 declarative 化，而应区分两类。

### 可以声明式 changed 的 surface

这类 surface 主要依赖 semantic key 命中，适合由 shared/projection 下沉：

- `active`
- `fields`
- 部分 `summaries`

### 只能保留 phase-owned patch builder 的 family

这类 family 已经处于 dataview 的 hot path，不能为了统一 API 牺牲运行时：

- `items`
- `sections`
- 任何已经由 phase 精确算出 changed ids / order patch 的 family

这些 family 的最终要求是：

- surface store 仍由 shared/projection 管
- patch 生成权留在 dataview phase
- runtime 只应用 phase 产出的 patch，不再二次推导

## dataview projection 最终 API

```ts
type DataviewProjectionInput = {
  document: DataDoc
  delta: MutationDelta
  runtime: {}
}

type DataviewProjectionOutput = {
  activeViewId?: ViewId
  active?: ViewState
}

type DataviewProjectionRuntime = {
  revision(): number
  current(): DataviewProjectionOutput
  read: {
    activeViewId(): ViewId | undefined
    active(): ViewState | undefined
    record(recordId: RecordId): DataRecord | undefined
    field(fieldId: FieldId): Field | undefined
    section(sectionId: SectionId): Section | undefined
    item(itemId: ItemId): ItemPlacement | undefined
  }
  stores: {
    active: ReadStore<ViewState | undefined>
    fields: {
      ids: ReadStore<readonly FieldId[]>
      byId: KeyedReadStore<FieldId, Field | undefined>
    }
    sections: {
      ids: ReadStore<readonly SectionId[]>
      byId: KeyedReadStore<SectionId, Section | undefined>
    }
    items: {
      ids: ReadStore<readonly ItemId[]>
      byId: KeyedReadStore<ItemId, ItemPlacement | undefined>
    }
    summaries: {
      ids: ReadStore<readonly SectionId[]>
      byId: KeyedReadStore<SectionId, unknown>
    }
  }
  update(input: DataviewProjectionInput): {
    revision: number
    output: DataviewProjectionOutput
    trace: DataviewProjectionTrace
  }
  subscribe(listener: (result: {
    revision: number
    output: DataviewProjectionOutput
    trace: DataviewProjectionTrace
  }) => void): () => void
}
```

这里故意没有：

- `delta?: DataviewDelta`
- `impact`
- `indexProjection`
- `activeProjection`
- `documentProjection`

## dataview engine 最终 API

mutation 与 projection 解耦后，engine 推荐改成：

```ts
type DataviewCurrent = {
  rev: number
  doc: DataDoc
  active?: ViewState
}

type Engine = {
  current(): DataviewCurrent
  subscribe(listener: (current: DataviewCurrent) => void): () => void
  doc(): DataDoc
  execute(...)
  apply(...)
  replace(...)
  commits: CommitStream<MutationCommitRecord<...>>
  history: HistoryPort<...>
  projection: DataviewProjectionRuntime
}
```

这里：

- `current().active` 来自 projection.current()
- `engine.projection` 是正式公开能力
- 不再返回 `publish.delta`
- 不再通过 mutation `publish` hook 维护 current

## dataview consumer 最终接法

当前 `dataview-runtime/src/source/createEngineSource.ts` 通过：

- `publish.delta.doc`
- `publish.delta.active`

做 source apply。

一步到位方案下，这条链必须一起删除。最终 consumer 只能有两种接法：

1. 直接读 `engine.projection.stores`
2. 订阅 `engine.projection.subscribe(...)` 并读取 `output`

不允许再保留“先从 projection 生成 `DataviewDelta`，再让 runtime source apply”的旧桥接。

## dataview 内部 phase 设计

dataview 的六个 phase 不通过 `scope -> emit` 串联，而是通过统一 context 串联：

- phase 直接改 `ctx.state`
- phase 直接改 `ctx.dirty`
- phase 直接标记 `ctx.phase.<name>.changed`

下面的“职责”都按这个模型理解。

## `document` phase

职责：

- 接收最新 `document`
- 建立 `DocumentReader`
- 解析当前 active view
- 生成 `ViewPlan`
- 初始化本轮 dirty 传播

输入：

- `ctx.input.document`
- `ctx.dirty.delta`

输出到 state：

- `reader`
- `activeViewId`
- `activeView`
- `plan`

写入 dirty：

- `ctx.dirty.index`
- `ctx.dirty.query`
- `ctx.dirty.membership`
- `ctx.dirty.summary`
- `ctx.dirty.view`

推荐写法：

```ts
document(ctx) {
  const previousActiveViewId = ctx.state.document.activeViewId
  const read = createDocumentReadContext(ctx.input.document)
  const plan = resolveViewPlan(read, read.activeViewId)

  ctx.state.document.reader = read
  ctx.state.document.activeViewId = read.activeViewId
  ctx.state.document.activeView = read.activeView
  ctx.state.document.plan = plan

  if (ctx.dirty.reset) {
    ctx.dirty.index = true
    ctx.dirty.query = true
    ctx.dirty.membership = true
    ctx.dirty.summary = true
    ctx.dirty.view = true
    ctx.phase.document.changed = true
    return
  }

  if (
    hasDeltaChange(ctx.dirty.delta, 'document.activeView')
    || read.activeViewId !== previousActiveViewId
  ) {
    ctx.dirty.query = true
    ctx.dirty.membership = true
    ctx.dirty.summary = true
    ctx.dirty.view = true
    ctx.phase.document.changed = true
  }
}
```

## `index` phase

职责：

- 基于 `MutationDelta` 的 field/record/view semantic change 做索引增量

注意：

- `IndexDelta` 只能作为 phase 内部结果或 state 局部缓存
- 不能再作为独立 projection runtime 的外部协议存在

也就是说：

- 可以有 `state.index.delta`
- 不能有 `createIndexProjectionRuntime()`

推荐写法：

```ts
index(ctx) {
  if (!ctx.dirty.index) {
    return
  }

  const result = deriveIndex({
    previous: ctx.state.index.state,
    previousDemand: ctx.state.index.demand,
    document: ctx.input.document,
    delta: ctx.dirty.delta,
    plan: ctx.state.document.plan
  })

  ctx.state.index.state = result.state
  ctx.state.index.delta = result.delta

  if (!result.changed) {
    return
  }

  ctx.phase.index.changed = true

  if (result.affectsQuery) {
    ctx.dirty.query = true
  }
  if (result.affectsMembership) {
    ctx.dirty.membership = true
  }
  if (result.affectsSummary) {
    ctx.dirty.summary = true
  }
  if (result.affectsView) {
    ctx.dirty.view = true
  }
}
```

## `query` phase

职责：

- 计算 matched / ordered / visible
- 根据 `document.activeView`、`view.query`、`record.values`、`field.schema` 等 semantic key 判脏

最终必须直接读 `ctx.dirty`，不再读 `BaseImpact`。

语义上：

- `ctx.dirty.query` 为假时直接跳过
- phase 自己根据 `ctx.dirty.delta` 和 `ctx.state.document.plan` 决定增量还是重建
- query changed 后直接设置 `ctx.dirty.membership = true`、`ctx.dirty.summary = true`、`ctx.dirty.view = true`

## `membership` phase

职责：

- 计算 section membership
- 依赖 query phase 与 group field 变化

最终 dirty source：

- `view.query`
- `view.layout`
- `record.create`
- `record.delete`
- `record.values`
- `field.schema`

不再读取 `dataviewTrace.*`。

语义上：

- `membership` 是否运行只看 `ctx.dirty.membership`
- `membership` 更新后直接推动 `ctx.dirty.summary` 与 `ctx.dirty.view`

## `summary` phase

职责：

- 计算 summaries
- 依赖 calculation field 与 section membership 变化

最终 dirty source：

- `view.calc`
- `field.schema`
- `record.values`
- `view.layout`

不再读取 `dataviewTrace.*`。

语义上：

- `summary` 是否运行只看 `ctx.dirty.summary`
- `summary` 更新后直接推动 `ctx.dirty.view`

## `view` phase

职责：

- 组装最终 `ViewState`
- 同步 active / fields / sections / items / summaries surface

这个 phase 产出最终 output，不再单独存在一个 `publish` runtime。

推荐写法：

```ts
view(ctx) {
  if (!ctx.dirty.view) {
    return
  }

  const next = buildViewState({
    document: ctx.input.document,
    activeView: ctx.state.document.activeView,
    plan: ctx.state.document.plan,
    query: ctx.state.query,
    membership: ctx.state.membership,
    summary: ctx.state.summary,
    index: ctx.state.index.state
  })

  if (next === ctx.state.view.snapshot) {
    return
  }

  ctx.state.view.snapshot = next
  ctx.phase.view.changed = true
}
```

## `shared/projection` 与 dataview 的边界

边界固定如下：

### `shared/projection` 负责

- runtime 执行
- `dirty` / `changed` 上下文管理
- phase DAG
- stores
- declarative changed
- simple-family declarative patch
- custom patch builder hook
- output/trace

### dataview 负责

- `MutationDelta` -> `ctx.dirty` 的领域规则
- query / membership / summary / index 的派生算法
- `ViewState` 的最终组装
- hot-path family 的精确 patch 生成

### 明确不允许

- shared/projection 解析 dataview view plan 语义
- dataview 保留自己的 projection runtime framework
- dataview 再定义一套 impact 或 delta 协议

## 必删项

一步到位方案下，以下内容不能保留。

## shared/projection 必删/必隐藏

- 对外导出的 `createProjectionRuntime`
- 对外暴露的 `ProjectionSpec<...>` 作为正式写法

如果内部继续复用，可以保留实现文件，但必须从 public surface 移除。

## dataview-engine 必删

- `src/mutation/projection/runtime.ts`
- `src/mutation/projection/spec.ts`
- `src/mutation/projection/document.ts`
- `src/active/projection/runtime.ts`
- `src/active/index/projection.ts`
- `src/contracts/delta.ts`
- `src/mutation/documentDelta.ts`
- `src/active/publish/activeDelta.ts`
- `src/active/projection/impact.ts`

以及所有对这些结构的直接依赖。

## dataview-engine 必改

- `src/createEngine.ts`
- `src/contracts/api.ts`
- `src/contracts/result.ts`
- `src/mutation/types.ts`
- `src/active/query/stage.ts`
- `src/active/membership/stage.ts`
- `src/active/summary/stage.ts`
- `src/active/index/runtime.ts`

## dataview-runtime 必改

- `src/source/createEngineSource.ts`
- `src/source/createDocumentSource.ts`
- `src/source/createActiveSource.ts`

如果这些 runtime source 的存在仍然以“吃 old delta”为前提，那么也应整体删除并改成直接连接 projection stores。

## 实施方案

## Phase 1. 先改 `shared/projection` public API

必须完成：

- 新增唯一 public `createProjection`
- `current()` 替代 `capture()`
- `output(...)` 替代 `capture(...)`
- `surface.changed` 支持声明式 semantic key
- simple-family surface 支持声明式 patch
- complex-family surface 支持 custom patch builder
- `createProjectionRuntime` 从 public export 移除

验收标准：

- dataview 不再需要直接写 `ProjectionSpec<...>`
- dataview 不再需要自己包 facade 才能补 output/current 语义

## Phase 2. 实现单一 dataview projection runtime

必须完成：

- 新建 `createDataviewProjection()`
- phases 固定为 `document/index/query/membership/summary/view`
- 删除 `indexProjection + activeProjection + documentProjection` 三套 runtime 结构
- runtime 初始化统一 `ctx.dirty`
- phases 通过修改 `ctx.state / ctx.dirty / ctx.phase` 串联

验收标准：

- dataview projection 目录里只剩一套 runtime
- 对外不再存在 projection glue runtime

## Phase 3. 删除 impact

必须完成：

- 删除 `BaseImpact`
- 删除 `createBaseImpact(...)`
- query / membership / summary / index 全部改成读 `ctx.dirty`

验收标准：

- `rg "BaseImpact|createBaseImpact"` 在 dataview-engine 中无结果

## Phase 4. 删除 old delta contract

必须完成：

- 删除 `DocumentDelta`
- 删除 `ActiveDelta`
- 删除 `DataviewDelta`
- 删除 `projectDocumentDelta(...)`
- 删除 `projectActiveDelta(...)`

验收标准：

- `rg "DocumentDelta|ActiveDelta|DataviewDelta|projectDocumentDelta|projectActiveDelta"` 在 dataview packages 中无结果

## Phase 5. 从 engine 中移除 mutation publish hook

必须完成：

- `MutationEngine` 不再接收 dataview publish spec
- dataview engine 自己维护 projection runtime
- commit subscribe 直接驱动 projection.update(...)
- `engine.current()` 直接组合 `{ rev, doc, active }`

验收标准：

- `createEngine.ts` 中不再出现 `createDataviewPublishSpec`
- `mutation/publish.ts` 被删除

## Phase 6. 迁移 runtime consumers

必须完成：

- `dataview-runtime` 不再依赖 `publish.delta.doc`
- `dataview-runtime` 不再依赖 `publish.delta.active`
- runtime source 改为直接读 projection stores 或 projection output

验收标准：

- `rg "publish\\.delta|delta\\.doc|delta\\.active"` 在 dataview packages 中无残留

## 最终验收标准

全部完成后，必须同时满足：

1. `shared/projection` 对外只有一套正式 API：`createProjection(...)`
2. dataview 只有一个 projection runtime
3. dataview projection 的唯一持久化输入是 `MutationDelta`
4. dataview 不再保留 `BaseImpact`
5. dataview 不再保留 `DocumentDelta / ActiveDelta / DataviewDelta`
6. dataview engine 不再通过 mutation `publish` hook 驱动 projection
7. dataview consumer 不再通过 old projection delta 同步 source
8. `index/query/membership/summary/view` 只是单一 runtime 的内部 phases
9. 没有任何“新 runtime + 旧 runtime 并存”的过渡结构
10. 没有任何“新 delta + 旧 delta 并存”的过渡结构
11. dataview hot-path family 不因为 shared declarative patch 退化成全量 diff

## 最终结论

如果目标真的是“全部切换到新的上面”，那就不能接受下面这些做法：

- 保留 `createProjectionRuntime` 当正式 API，再额外加一个 `createProjection`
- 保留 `indexProjection / activeProjection / documentProjection`，只是统一输入
- 保留 `BaseImpact` 作为中间层
- 保留 `DocumentDelta / ActiveDelta / DataviewDelta` 给 consumer 继续用
- 保留 mutation publish hook，只是内部实现换成 `MutationDelta`

这些都不是一步到位，只是旧架构外面套了一层新壳。

dataview projection 的一步到位最终态只能是：

- `shared/projection` 统一成一套 final API
- dataview 统一成一个 runtime
- `MutationDelta` 成为唯一持久化输入事实
- old delta / impact / glue runtime 一次性删除
- engine consumer 一起切到 projection stores / output
- declarative changed 只负责常见判脏
- 简单 family 才用 declarative patch，复杂 family 继续由 phase 直接产出 patch

只有这样，projection 这条链路才算真正完成切换，而不是长期背着两套协议继续跑。

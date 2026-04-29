# Dataview Projection 长期最优重构方案

## 目标

本文档只讨论 dataview 的 projection 链路，不讨论 whiteboard。

目标不是做“低成本渐进修补”，而是回答下面这个更硬的问题：

- 如果完全不在乎重构成本，只追求长期最优，dataview projection 这条链到底应该怎么重写？

同时直接回答一个眼前问题：

- `runQueryStage(input: { plan, reader, activeViewId, view, queryPlan, index, previous })` 这种签名是不是参数太多？

结论先说：

- 是，参数过多，而且这不是单点签名问题。
- 它说明整个 projection 链的边界切分还不够对。
- 真正应该重写的，不是把 `runQueryStage` 再包一层 `ctx` 就结束。
- 长期最优是把 dataview projection 改成：
  - `frame`
  - `index`
  - `active`
- 其中 `query / membership / summary / publish` 不再作为 projection phase 存在，而是降为 `active` phase 内部 pipeline。

本文档明确不保留兼容设计。

- 不保留旧 dirty 传播模型。
- 不保留 stage 自己 resolve action 的模型。
- 不保留 `runtime: {}` 这种空占位输入。
- 不保留 “ViewPlan 是配置 plan，ProjectionPlan 又是执行 plan” 但命名混在一起的状态。

---

## 一句话结论

`runQueryStage(...)` 参数多，不是因为写法不够漂亮，而是因为它在暴露一个事实：

- query stage 真正依赖的不是若干离散参数
- 而是一份 update-scoped execution frame

更进一步：

- query / membership / summary / publish 四个 stage 共用的上下文远大于各自独有上下文
- 这说明真正的边界不该切在 stage function 之间
- 而应该切在更上层的 `active view execution pipeline`

所以长期最优不是：

- `runQueryStage({ ...很多参数... })`

也不是：

- `runQueryStage(ctx)`

而是：

- `runDataviewActivePipeline(ctx)`

query / membership / summary / publish 变成它的内部步骤。

---

## 先回答你的问题

## 1. 参数多是不是一定说明设计不好

不一定。

纯函数很多时候参数多也正常。

但在 dataview 这里，它确实说明边界没切好，因为这些参数并不是彼此独立的。

以 query 为例：

```ts
runQueryStage({
  plan,
  reader,
  activeViewId,
  view,
  queryPlan,
  index,
  previous
})
```

这里其实已经暴露出三个隐藏对象：

1. view frame  
   `reader + activeViewId + view + queryPlan`

2. upstream runtime  
   `previous`

3. index runtime  
   `index`

如果一个函数的参数本质上已经在暗示“其实应该有三个上层对象”，那说明签名只是病征，不是病根。

## 2. 真正的问题不是 query stage，而是 projection 链边界错位

query stage 参数多，只是最容易看到的地方。

同类问题其实整条链都有：

- `deriveIndex(...)` 也在吃一大包文档、delta、demand、previous
- `runMembershipStage(...)` 进一步吃 query state、query delta、index、index delta、view、delta、previousViewId
- `runSummaryStage(...)` 又继续吃 membershipAction、membershipDelta、indexDelta、calcFields
- `runPublishStage(...)` 还要拆传 `previousRecords / previousSections / previousItems / previousSummaries`

所以真正的问题不是：

- “某个 stage 的参数太多”

而是：

- “系统没有定义好 update-scoped frame、execution plan、active runtime 这几个边界对象”

---

## 当前链路审计

下面按整条 dataview projection 链做审计。

## 1. `createEngine.ts` 到 projection 输入层

当前入口在：

- `dataview/packages/dataview-engine/src/createEngine.ts`

这里有一个明显信号：

- projection update 输入里带了 `runtime: {}`

但 dataview projection 实际根本不使用 runtime。

这说明当前 `DataviewProjectionInput` 已经有无效边界：

- 输入类型比真实需求更宽
- dataview 在消费 shared/projection 时带了一个空占位层

这不是大 bug，但它说明 dataview projection 输入模型还没有清到最终形态。

### 结论

长期最优里应该直接删掉：

```ts
interface DataviewProjectionInput {
  document: DataDoc
  delta: DataviewMutationDelta
}
```

不再保留：

```ts
runtime: {}
```

---

## 2. 当前 `ViewPlan` 命名本身就不够准

当前在：

- `dataview/packages/dataview-engine/src/active/plan.ts`

`ViewPlan` 其实承载的是：

- query descriptor
- index demand
- section descriptor
- calcFields

这更像：

- resolved active view descriptor

而不是：

- projection execution plan

现在最大的命名问题是：

- `ViewPlan` 叫 plan
- 但它其实是静态配置解析结果
- 后面我们又想再引入真正的 projection execution plan

这会让“plan”这个词在代码里同时指两件完全不同的东西。

### 结论

长期最优应该先做命名拆分：

- 现在的 `ViewPlan` 重命名为 `DataviewViewDescriptor` 或 `ResolvedActiveView`
- 把 `plan` 这个名字留给真正的执行决策

这是非常值得做的，不只是命名洁癖。

它会直接减少 projection 链的语义混乱。

---

## 3. `createDataviewProjection.ts` 把 persistent state 和 update-scoped frame 混在了一起

当前在：

- `dataview/packages/dataview-engine/src/projection/createDataviewProjection.ts`

state 里现在既有长期状态，也有本轮 update 才有意义的临时信息：

- `document.read`
- `document.view`
- `document.plan`
- `document.previousActiveViewId`
- `document.previousPlan`
- `membership.previous`
- `summary.previous`
- `view.previous`

这说明现在缺少一个正式的：

- update-scoped frame / work / scratch model

于是本轮临时上下文被硬塞进 persistent state。

### 这会带来三个问题

1. state 定义失真  
   看起来像“长期状态”，其实很多字段只是单轮过渡态。

2. phase 签名膨胀  
   因为 stage 需要从很多位置拼“当前轮”的上下文。

3. reset / previous 逻辑到处散  
   比如 `previous` 字段只是为了同一轮推导 patch，却被存成长期成员。

### 结论

长期最优应该显式引入：

- `DataviewProjectionFrame`

并把 update-scoped 信息统一收进去，而不是继续塞在 state.document / state.view 里。

---

## 4. 当前 projection 有两套决策 owner

这是整条链最大的结构问题。

第一套 owner 在 projection phase 外层：

- `ctx.dirty.index = true`
- `ctx.dirty.query = true`
- `ctx.dirty.membership = true`
- `ctx.dirty.summary = true`
- `ctx.dirty.view = true`

第二套 owner 在 stage 内部：

- `resolveQueryAction(...)`
- `resolveMembershipAction(...)`
- `resolveSummaryAction(...)`
- `runPublishStage(...)` 最后又根据结果反推 action

这意味着同一轮执行决策被解释了两遍甚至三遍。

### 这不是实现细节，而是架构问题

只要 action owner 不唯一，就一定会继续长出：

- helper
- duplicated checks
- phase propagation
- 漏改风险

### 结论

长期最优必须满足：

- 每一个 action 只有一个 owner

更具体地说：

- index action 的 owner 只能是 index planner
- active pipeline action 的 owner 只能是 active planner
- publish 绝对不能再根据结果反推 action

---

## 5. delta facts 被重复推导

当前 document phase 已经在算：

- touchedRecords
- touchedFields
- valueFields
- schemaFields
- recordSetChanged

但 `active/index/runtime.ts` 的 `createIndexDeriveContext(...)` 又重新从 delta 里算一遍。

query / membership / summary 的 action resolve 逻辑也各自又再看一遍 delta。

这说明现在缺少统一的：

- `DataviewDeltaFacts`

于是每层都在自己读 delta。

### 结论

长期最优应该让 frame compiler 一次性产出：

```ts
interface DataviewDeltaFacts {
  activeViewChanged: boolean
  recordSetChanged: boolean
  touchedRecords: ReadonlySet<RecordId> | 'all'
  touchedFields: ReadonlySet<FieldId> | 'all'
  valueFields: ReadonlySet<FieldId> | 'all'
  schemaFields: ReadonlySet<FieldId>
  viewQueryChanged: ReadonlySet<DataviewQueryAspect> | 'all'
  viewCalcChanged: boolean
}
```

后续 index planner 和 active planner 都只消费 facts，不再自己回读 raw delta。

---

## 6. `query / membership / summary / publish` 其实不是 projection phase

这是本文最关键的判断。

现在从 shared/projection 视角看，dataview 有 6 个 phase：

- document
- index
- query
- membership
- summary
- view

但真正暴露给 surface 的变化几乎都只在最终 snapshot：

- `active`
- `fields`
- `sections`
- `items`
- `summaries`

这些 surface 全都只看最终 `view.changed`。

这说明：

- `query / membership / summary / publish` 对 projection runtime 来说并不是独立 surface phase
- 它们其实只是 active view 派生链的内部步骤

### 结论

长期最优应该把 projection phase 缩到：

1. `frame`
2. `index`
3. `active`

其中：

- `active` phase 内部再跑 `query -> membership -> summary -> publish`

这样边界才是对的。

---

## 最终设计原则

## 原则 1：先定义 frame，再定义 stage

不是先写 `runQueryStage(...)`，然后发现参数很多，再包一层对象。

而是先定义：

- 当前这轮 update 的 immutable frame 是什么

再让 query/membership/summary/publish 去消费这份 frame。

## 原则 2：stage 不应作为稳定 API 暴露

长期最优里：

- `runQueryStage`
- `runMembershipStage`
- `runSummaryStage`
- `runPublishStage`

都不应该被视为 projection 的核心 API。

它们只是 `runDataviewActivePipeline(...)` 的内部步骤。

## 原则 3：配置 descriptor 和执行 plan 必须分开命名

保留：

- `DataviewViewDescriptor`

新增：

- `DataviewIndexPlan`
- `DataviewActivePlan`

不再混用一个 `ViewPlan` 或 `plan` 来同时表示：

- “视图配置解析结果”
- “本轮执行决策”

## 原则 4：action 是执行前决策，changed 是执行后事实

这两个概念必须彻底分开。

所以：

- planner 负责 `reuse / sync / rebuild`
- executor 负责 `changed / delta / patch / metrics`

publish 不允许再反推 action。

---

## 最终模型

## 1. `DataviewViewDescriptor`

替代当前 `ViewPlan`。

```ts
interface DataviewViewDescriptor {
  viewId: ViewId
  view: View
  query: QueryPlan
  indexDemand: NormalizedIndexDemand
  section?: {
    fieldId: FieldId
    mode?: ViewGroup['mode']
    sort?: ViewGroup['bucketSort']
    interval?: ViewGroup['bucketInterval']
    showEmpty: boolean
  }
  calcFields: readonly FieldId[]
  descriptorKey: string
}
```

它表达的是：

- 当前 active view 的解析后配置

不是：

- 本轮执行计划

## 2. `DataviewDeltaFacts`

frame compiler 一次性产出。

```ts
interface DataviewDeltaFacts {
  activeViewChanged: boolean
  recordSetChanged: boolean
  touchedRecords: ReadonlySet<RecordId> | 'all'
  touchedFields: ReadonlySet<FieldId> | 'all'
  valueFields: ReadonlySet<FieldId> | 'all'
  schemaFields: ReadonlySet<FieldId>
  viewQueryChanged: ReadonlySet<DataviewQueryAspect> | 'all'
  viewCalcChanged: boolean
}
```

## 3. `DataviewProjectionFrame`

这一轮 update 的统一输入上下文。

```ts
interface DataviewProjectionFrame {
  revision: Revision
  document: DataDoc
  reader: DocumentReader
  delta: DataviewMutationDelta
  facts: DataviewDeltaFacts
  active?: DataviewViewDescriptor
  previousActiveViewId?: ViewId
  previousDescriptorKey?: string
}
```

注意：

- frame 是 update-scoped 的
- 不应该继续和 persistent state 混在一起

## 4. `DataviewIndexRuntime`

```ts
interface DataviewIndexRuntime {
  state?: IndexState
  demand: NormalizedIndexDemand
  action: 'reuse' | 'sync' | 'rebuild'
  delta?: IndexDelta
  trace?: IndexTrace
}
```

## 5. `DataviewActivePlan`

这才是真正的动态执行计划。

```ts
interface DataviewActivePlan {
  reset: boolean
  query: {
    action: 'reuse' | 'sync' | 'rebuild'
    reuse?: {
      matched: boolean
      ordered: boolean
    }
  }
  membership: {
    action: 'reuse' | 'sync' | 'rebuild'
  }
  summary: {
    action: 'reuse' | 'sync' | 'rebuild'
    touchedSections?: ReadonlySet<SectionId> | 'all'
  }
  publish: {
    action: 'reuse' | 'sync' | 'rebuild'
  }
}
```

## 6. `DataviewActiveRuntime`

active pipeline 的长期状态。

```ts
interface DataviewActiveRuntime {
  query: QueryPhaseState
  membership: MembershipPhaseState
  summary: SummaryPhaseState
  snapshot?: ViewState
  itemIds: ItemIdPool
  patches: {
    fields?: EntityDelta<FieldId>
    sections?: EntityDelta<SectionId>
    items?: EntityDelta<ItemId>
    summaries?: EntityDelta<SectionId>
  }
  trace: {
    query: DataviewStageTrace
    membership: DataviewStageTrace
    summary: DataviewStageTrace
    publish: DataviewStageTrace
    snapshot: SnapshotTrace
  }
}
```

注意：

- `previous` 不再作为长期字段挂在 state 上
- previous runtime 直接作为本轮 executor 输入

---

## 最终 projection 形态

长期最优不再是 6 phase，而是 3 phase。

## 1. `frame` phase

职责：

- 创建 `DocumentReader`
- 解析 active view
- 解析 `DataviewViewDescriptor`
- 编译 `DataviewDeltaFacts`
- 组装 `DataviewProjectionFrame`

输出：

- `frame`

不做：

- dirty 传播
- query/membership/summary 的 action 判定

## 2. `index` phase

职责：

- 消费 `frame.active?.indexDemand`
- 根据 previous index runtime 和 facts 产出 next index runtime

输出：

- `DataviewIndexRuntime`

说明：

- index action 可以在 index runtime 内部或 index planner 决策
- 但 owner 必须唯一

## 3. `active` phase

职责：

1. 根据 `frame + previousActive + indexRuntime` 编译 `DataviewActivePlan`
2. 按顺序运行：
   - query
   - membership
   - summary
   - publish
3. 产出最终 `DataviewActiveRuntime`

输出：

- snapshot
- patches
- traces

这才是 dataview projection 的正确结构。

---

## 最终 API 设计

下面给出长期最优的最终 API。

## 1. 对外 projection 输入输出

```ts
export interface DataviewProjectionInput {
  document: DataDoc
  delta: DataviewMutationDelta
}

export interface DataviewProjectionOutput {
  activeViewId?: ViewId
  active?: ViewState
}
```

`runtime: {}` 删除。

## 2. 核心内部 API

### `compileDataviewFrame(...)`

```ts
declare function compileDataviewFrame(input: {
  revision: Revision
  document: DataDoc
  delta: DataviewMutationDelta
  previous?: {
    activeViewId?: ViewId
    descriptorKey?: string
  }
}): DataviewProjectionFrame
```

### `deriveDataviewIndex(...)`

```ts
declare function deriveDataviewIndex(input: {
  frame: DataviewProjectionFrame
  previous: DataviewIndexRuntime
}): DataviewIndexRuntime
```

### `compileDataviewActivePlan(...)`

```ts
declare function compileDataviewActivePlan(input: {
  frame: DataviewProjectionFrame
  previous: DataviewActiveRuntime
  index: DataviewIndexRuntime
}): DataviewActivePlan
```

### `runDataviewActivePipeline(...)`

这是新的核心执行 API。

```ts
declare function runDataviewActivePipeline(input: {
  frame: DataviewProjectionFrame
  index: DataviewIndexRuntime
  plan: DataviewActivePlan
  previous: DataviewActiveRuntime
}): DataviewActiveRuntime
```

这才应该成为 active view projection 的稳定边界。

## 3. stage 函数的最终定位

长期最优里，stage 函数不再作为顶层 API 设计目标。

也就是说，下面这些函数可以继续存在：

- `runQueryStep(...)`
- `runMembershipStep(...)`
- `runSummaryStep(...)`
- `publishActiveView(...)`

但它们应该：

- 变成 `runDataviewActivePipeline(...)` 的内部实现细节
- 吃 pipeline-local context
- 不再单独暴露一个“大而扁平”的外部签名

## 4. 如果仍然保留 query/membership/summary 子步骤

那也应该是这样：

```ts
interface DataviewActivePipelineContext {
  frame: DataviewProjectionFrame
  index: DataviewIndexRuntime
  plan: DataviewActivePlan
  previous: DataviewActiveRuntime
}

declare function runQueryStep(
  ctx: DataviewActivePipelineContext
): QueryStageResult
```

而不是：

```ts
runQueryStage({
  plan,
  reader,
  activeViewId,
  view,
  queryPlan,
  index,
  previous
})
```

这两者的区别不是“对象包了一层”，而是：

- 前者的边界对象是有语义的
- 后者只是把真实边界打散成了参数列表

---

## 哪些地方应该重写

这里直接给结论，不绕。

## 必须重写

### 1. `projection/createDataviewProjection.ts`

原因：

- 当前 6 phase 边界不对
- 当前 state 混入大量 update-scoped 信息
- 当前 dirty 传播是旧模型

处理：

- 整体重写为 `frame / index / active`

### 2. `active/plan.ts`

原因：

- 当前 `ViewPlan` 命名和职责混乱
- 没有 `DataviewDeltaFacts`
- 没有 active execution plan

处理：

- 拆成：
  - `descriptor.ts`
  - `frame.ts`
  - `activePlan.ts`

### 3. `active/index/runtime.ts`

原因：

- 当前接口围绕 raw `document + delta + demand + previousDemand`
- 还在内部自己重算 delta facts

处理：

- 改成直接消费 `DataviewProjectionFrame`
- 只负责 index runtime 派生

### 4. `active/query/stage.ts`
### 5. `active/membership/stage.ts`
### 6. `active/summary/stage.ts`
### 7. `active/publish/stage.ts`

原因：

- 当前这些 stage 在同时承担：
  - action resolve
  - runtime derive
  - delta build
  - metrics

处理：

- 降为 active pipeline 内部步骤
- 从“顶层 stage API”改成“pipeline internal step”
- 删除独立 action resolve owner

### 8. `active/state.ts`

原因：

- 当前 state 结构按旧 phase 切
- 混了长期状态和单轮 previous/reset 过渡态

处理：

- 改成：
  - `DataviewIndexRuntime`
  - `DataviewActiveRuntime`
  - 如需持久 frame 元信息，只保留极少数字段

## 建议一起重写

### 9. `createEngine.ts`

处理：

- 删除 projection input 里的 `runtime: {}`

### 10. `runtime/performance.ts` 与 trace 相关模块

处理：

- 改为消费新 runtime / pipeline trace 结构
- 不再从旧 phase state 拼 trace

### 11. 测试

处理：

- 以 `frame -> index -> active` 的新边界重写测试
- 新增：
  - frame compile tests
  - active plan tests
  - active pipeline tests

---

## 不值得做的方案

这里把几个“看起来能缓解、但不是长期最优”的方案直接排除。

## 1. 只给 `runQueryStage` 包一个 input type

不够。

这只是在保留旧边界的前提下把参数折叠一下。

病根没变：

- phase 还是切错了
- action owner 还是分裂的
- frame 还是没定义

## 2. 继续保留 6 phase，只是把 dirty 改成 plan

也不够。

因为 `query / membership / summary / publish` 本来就不是 projection surface phase。

继续保留它们为 shared/projection phase，只会让 shell 过重。

## 3. 让 publish 根据结果反推 action

不能留。

这是把执行前决策和执行后事实混起来，长期一定会继续制造歧义。

---

## 推荐实施顺序

如果按长期最优路线做，建议顺序如下。

## Phase 1. 模型和命名清理

- `ViewPlan` 重命名为 `DataviewViewDescriptor`
- 新增 `DataviewDeltaFacts`
- 新增 `DataviewProjectionFrame`
- 删除 `DataviewProjectionInput.runtime`

## Phase 2. frame compiler 落地

- 从当前 document phase 抽出 `compileDataviewFrame(...)`
- 所有 delta facts 统一在这里产出

## Phase 3. index runtime 改造

- `deriveDataviewIndex(...)` 改为直接吃 frame
- 删除 index 内部重复 delta fact 推导

## Phase 4. active plan compiler 落地

- 把 query/membership/summary/publish 的 action resolve 逻辑统一抽到 `compileDataviewActivePlan(...)`

## Phase 5. active pipeline 重写

- 新增 `runDataviewActivePipeline(...)`
- query/membership/summary/publish 降成内部步骤

## Phase 6. projection shell 重写

- `createDataviewProjection.ts` 改成 `frame / index / active`
- 删除 `ctx.dirty.index/query/membership/summary/view`

## Phase 7. trace / tests / dead code 清理

- 改 trace 组装方式
- 删除旧 stage action resolve
- 删除旧 previous/reset 过渡字段

---

## 最终判断

最后把判断写死：

1. `runQueryStage(...)` 参数多，确实说明设计还不够好。  
   但问题不在这个函数本身，而在整条 projection 链没有定义好 frame 和 active pipeline 边界。

2. 长期最优不是“stage 直接吃 plan”这么简单。  
   更进一步，应该让 query/membership/summary/publish 退出 projection 顶层 phase，降成 `active` phase 内部步骤。

3. dataview projection 的正确长期形态应该是：  
   `frame -> index -> active`

4. 真正新的核心 API 应该是：  
   - `compileDataviewFrame(...)`
   - `deriveDataviewIndex(...)`
   - `compileDataviewActivePlan(...)`
   - `runDataviewActivePipeline(...)`

5. 如果只改签名、不重切边界，helper 和重复解释一定还会回来。  
   想彻底结束这类问题，必须重写 projection 的上层边界，而不是继续修 stage 函数的表面参数。

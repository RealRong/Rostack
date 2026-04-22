# Dataview Engine Active Derive Runtime Projection-Runtime 迁移重构方案

本文只讨论一件事：

在下面这些前提已经成立时，如何让 `shared/projection-runtime` 重写 `dataview-engine` 的 `active derive runtime`，并把这件事做到长期最优。

- 不在乎重构成本
- 不需要兼容
- 不保留双轨实现
- 目标是最终形态，不是过渡形态
- 只重写 `active derive runtime`
- 明确不重写：
  - document commit
  - history
  - source/store adapter
  - react/runtime 宿主
  - `deriveIndex`

这份文档建立在下面这些现状上：

- 边界文档 [DATAVIEW_ENGINE_RUNTIME_BOUNDARY_REWRITE.zh-CN.md](/Users/realrong/Rostack/DATAVIEW_ENGINE_RUNTIME_BOUNDARY_REWRITE.zh-CN.md)
- delta 文档 [DATAVIEW_ENGINE_IMPACT_DELTA_REWRITE.zh-CN.md](/Users/realrong/Rostack/DATAVIEW_ENGINE_IMPACT_DELTA_REWRITE.zh-CN.md)
- 当前 active 主链：
  - [runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/runtime.ts)
  - [runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/runtime.ts)
  - [runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/query/runtime.ts)
  - [runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/membership/runtime.ts)
  - [runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/summary/runtime.ts)
  - [runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/publish/runtime.ts)
- 当前 projection runtime：
  - [createRuntime.ts](/Users/realrong/Rostack/shared/projection-runtime/src/runtime/createRuntime.ts)
  - [update.ts](/Users/realrong/Rostack/shared/projection-runtime/src/runtime/update.ts)
  - [runtime.ts](/Users/realrong/Rostack/shared/projection-runtime/src/contracts/runtime.ts)
  - [phase.ts](/Users/realrong/Rostack/shared/projection-runtime/src/contracts/phase.ts)

---

## 1. 最终结论

长期最优方案很明确：

1. `projection-runtime` 只接管 `active derive runtime`
2. `engine` 继续自己负责：
   - document commit
   - history
   - `resolveViewPlan`
   - `deriveIndex`
   - public `snapshot + delta`
3. `projection-runtime` 不进入 `runtime/source/store` 边界
4. `projection-runtime` 不接管 document write 语义
5. `activeProjectionRuntime` 必须长期复用，但正确 owner 是 engine internal `commit/write runtime`，不是 `CoreRuntime`
6. `projection-runtime` 的职责只剩：
   - active phase planner
   - phase orchestration
   - phase fanout
   - publish 出口
   - active trace

一句话概括：

> `projection-runtime` 不是重写整个 engine，而是成为 engine 内部专门承接 `query -> membership -> summary -> publish` 的 active phase runtime。

---

## 2. 为什么现在适合做这件事

前面这轮边界与 delta 收敛做完以后，active 主链已经满足了 projection-runtime 接管的前提。

### 2.1 active 链已经天然是 phase graph

当前 active derive 主链本质上就是：

1. `query`
2. `membership`
3. `summary`
4. `publish`

每个阶段都已经有：

- 自己的输入
- 自己的 `resolveAction`
- 自己的 internal state
- 自己的 internal delta
- 自己的 metrics

也就是说，现在缺的已经不是 phase 语义，而只是缺一个统一 runtime 来承接这些 phase。

### 2.2 public delta 已经纠正到正确方向

现在 engine 对外已经是 `snapshot + delta` 语言，而不是 runtime patch 语言。

这意味着：

- active derive 可以只关心如何产出 snapshot/delta
- runtime source adapter 继续只关心消费 snapshot/delta
- `projection-runtime` 不需要知道 store/source

边界终于是干净的。

### 2.3 当前 orchestration 已经开始重复

当前手写 orchestration 里已经出现了一整套固定样板：

- 选择阶段执行顺序
- 计时
- 判断 changed/reuse
- 向下游 fanout
- 汇总 trace
- publish 最终产物

这套逻辑本身不复杂，但已经足够重复，继续手写下去不会带来更多业务价值。

### 2.4 现在的切口刚好足够窄

如果这次只重写 active derive runtime，那么：

- 上游 commit/history 不动
- index 不动
- 下游 runtime/source/store 不动
- public contracts 只做很小的 engine internal 调整

这是一个复杂度最低的切口。

---

## 3. 明确哪些不重写

这部分必须先钉死，否则范围会失控。

## 3.1 不重写 document commit

下面这些继续保留在 engine 现有实现中：

- action planning
- operation apply
- history undo/redo
- load/replace
- `CommitImpact`
- `BaseImpact`

原因很简单：

- 这些是 document write path
- 不是 phase runtime
- 强行塞进 projection-runtime 只会把两套模型混在一起

## 3.2 不重写 `deriveIndex`

`deriveIndex` 继续留在 active derive runtime 外面。

原因：

- index 本质上是 active derive 的前置输入层
- 它有自己独立的 demand、delta、trace、缓存语义
- 它不是 `query/membership/summary/publish` 这条 published artifact phase graph 的一部分

一句话：

> index 是 active phase graph 的上游输入，不是 active phase graph 内部节点。

## 3.3 不重写 runtime source adapter

下面这些明确不动：

- [createEngineSource.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/createEngineSource.ts)
- `KeyTableStore`
- runtime source contracts
- react 消费层

原因：

- 那是 `engine -> runtime` 边界之后的宿主层
- `projection-runtime` 不应该越过这个边界

## 3.4 不重写整个 CoreRuntime

`CoreRuntime` 继续是 engine 自己的根运行时。

也就是说：

- `CoreRuntime` 不被 projection-runtime 替代
- `CoreRuntime` 继续只做 state/result 容器
- `CoreRuntime` 不应该托管 `activeProjectionRuntime`

原因很简单：

- `activeProjectionRuntime` 只有 commit/write path 会用
- 它是带 working memory 的执行器，不是根状态容器的一部分
- 把它挂进 `CoreRuntime`，会让根 runtime 重新变成一个什么都管的 bucket
- 后面也更容易被其他模块误用，边界会再次变脏

一句话：

> `CoreRuntime` 应保持瘦身，`activeProjectionRuntime` 不应成为它的字段。

## 3.5 `activeProjectionRuntime` 的正确位置

`activeProjectionRuntime` 需要长期存活，但不需要挂在通用 runtime 根对象上。

长期最优 owner 应该是：

- engine internal `commit/write runtime`

也就是今天 [runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/mutate/commit/runtime.ts) 这条链背后的执行器。

原因：

- 只有 write/load/undo/redo 后需要推进 active derive
- active derive working memory 只服务 commit 之后的结果生产
- owner 越靠近真实使用方，职责越清楚

一句话：

> `activeProjectionRuntime` 应归 commit runtime 持有，而不是归 `CoreRuntime` 持有。

---

## 4. 最终职责切分

最终长期最优的职责切分如下。

### 4.1 engine commit/write runtime

继续负责：

1. 生成 `CommitImpact`
2. 生成 `BaseImpact`
3. 解析当前 view plan
4. 跑 `deriveIndex`
5. 调用 `active projection runtime`
6. 组装 `EngineResult`

### 4.2 `CoreRuntime`

继续只负责：

1. 持有 `EngineState`
2. 持有 `EngineResult`
3. 提供 `commit/updateState/subscribe`

明确不负责：

- active derive orchestration
- active working memory
- active phase graph

### 4.3 active projection runtime

只负责：

1. 根据 `BaseImpact + indexDelta + plan facts` 做 phase planning
2. 顺序执行：
   - `query`
   - `membership`
   - `summary`
   - `publish`
3. 管理 active 长生命周期 working state
4. 输出：
   - `ViewState | undefined`
   - `ActiveDelta | undefined`
   - `ViewTrace`

### 4.4 dataview-runtime

继续只负责：

1. 消费 engine 的 `snapshot + delta`
2. 生成 source/store
3. 驱动 react/model

---

## 5. 最终架构

最终结构建议固定成下面这样：

```text
commit/write runtime
  -> resolveViewPlan
  -> deriveIndex
  -> activeProjectionRuntime.update(...)
       -> planner
       -> query
       -> membership
       -> summary
       -> publish
  -> coreRuntime.commit(...)
  -> engine result(snapshot + delta)
  -> runtime source adapter
```

这里有一个关键约束：

> `publish` 仍然是 active derive runtime 内唯一对外出口。

也就是说：

- `query/membership/summary` 只产 internal state/delta
- 最后只有 `publish` 产 public `ViewState + ActiveDelta`

这和前面的 delta 文档完全一致。

---

## 6. 最终内部模型

## 6.1 `ActivePhaseName`

```ts
export type ActivePhaseName =
  | 'query'
  | 'membership'
  | 'summary'
  | 'publish'
```

不再额外引入更多 phase。

原因：

- 当前图就是线性的
- 更多 phase 只会增加调度和调试成本
- `publish` 内部如果还要按 artifact 拆 writer，也只在 publish 内部拆，不上升成独立 phase

## 6.2 `ActiveProjectionInput`

```ts
export interface ActiveProjectionInput {
  read: {
    reader: DocumentReader
    fieldsById: ReadonlyMap<FieldId, Field>
  }
  view: {
    plan?: ViewPlan
    previousPlan?: ViewPlan
  }
  index: {
    state: IndexState
    delta?: IndexDelta
  }
  impact: BaseImpact
}
```

这里的原则是：

- planner 和 phase 只拿真正会消费的 active derive 输入
- 不把整个 `DocumentReadContext` 这种过胖组装对象塞进来
- 不保留 `activeViewId/view` 这类重复真相
- 不把 `capturePerf` 这类执行策略字段混进业务输入

这里有三个刻意收紧点。

### 1. 不传整个 `documentContext`

当前 active derive 真正用到的读取面只有：

- `reader`
- `fieldsById`

所以最终输入只保留：

- `read.reader`
- `read.fieldsById`

不再把下面这些与 active runtime 无关的组装结果一并带进来：

- `document`
- `fieldIds`
- `fieldIdSet`

这里 `fieldsById` 虽然语义上可由 `reader.fields.get()` 推导，但仍然保留，原因是：

- `publish`
- `summaries`

这两块已经天然按 `Map<FieldId, Field>` 读得更顺，也更适合热路径复用。

### 2. 不传重复的 active view 真相

当前 `DocumentReader` 已经能读：

- `reader.views.activeId()`
- `reader.views.active()`

所以：

- `activeViewId`
- `view`

都不应该和 `reader` 同时出现在 input 里。

否则会形成双真相。

最终与 view 相关的输入只保留：

- `view.plan`
- `view.previousPlan`

### 3. `capturePerf` 不属于业务输入

`capturePerf` 是 runtime 执行开关，不是 active derive 输入事实。

它应当归：

- `createActiveProjectionRuntime(...)`
- 或 commit/write runtime 初始化配置

而不是归 `update(input)`。

## 6.3 不需要 `ActiveProjectionChange`

长期最优不需要单独的 `ActiveProjectionChange`。

原因很直接：

- `impact` 已经在 `input` 里
- `index.delta` 已经在 `input` 里
- `viewChanged` 是可推导事实
- `planChanged` 也是可推导事实

也就是说，`ActiveProjectionChange` 只是把已有事实复制了一份。

这会带来两个问题：

1. 双真相
2. 额外同步成本

例如：

- `input.index.delta`
- `change.indexDelta`

这两者一旦不一致，就会立刻形成错误源。

所以长期最优做法是：

- `activeProjectionRuntime.update()` 只接收一份 `ActiveProjectionInput`
- planner 也直接基于同一份 input 做计划

最终应当把 `projection-runtime` contract 一起收紧成下面这样：

```ts
interface Planner<TInput, TSnapshot, TPhaseName extends string> {
  plan(input: {
    input: TInput
    previous: TSnapshot
  }): Plan<TPhaseName>
}

interface ActiveProjectionRuntime {
  update(input: ActiveProjectionInput): {
    snapshot?: ViewState
    delta?: ActiveDelta
    trace: ViewTrace
  }
}
```

也就是说：

- `TInputChange` 整体删掉
- planner 不再吃第二份 `change`
- active runtime 自己也不再维护两套输入模型

一句话：

> planner 直接看 active input，而不是再维护一份重复的 active change。

## 6.4 `ActiveProjectionWorking`

```ts
export interface ActiveProjectionWorking {
  query: {
    state: QueryState
    records: ViewRecords
    delta: QueryDelta
  }
  membership: {
    state: MembershipState
    delta: MembershipDelta
    action: DeriveAction
  }
  summary: {
    state: SummaryState
  }
  publish: {
    itemIds: ItemIdPool
    snapshot?: ViewState
    delta?: ActiveDelta
  }
}
```

这里最关键的设计有两点。

### 1. working 按 phase 拆槽

不要再做一个扁平大对象，也不要做一个抽象到看不懂的 phase result registry。

直接按职责拆：

- `working.query`
- `working.membership`
- `working.summary`
- `working.publish`

这已经足够清楚，而且类型非常稳定。

同时，working 里只保留真正被下游消费的东西：

- `query.action` 不保留
  原因：下游不消费
- `summary.delta` 不保留
  原因：publish 不消费
- `summary.action` 不保留
  原因：下游不消费
- `publish.action` 不保留
  原因：trace 由 runtime 自己持有，不需要写进 working

一句话：

> working 只放长期状态和下游依赖，不放已经没有消费者的阶段附带信息。

### 2. `ViewCache` 退场

当前 [cache.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/cache.ts) 里的 `ViewCache` 本质上就是 active phase runtime 的长期工作状态。

长期最优形态里，它不应该再挂在 `EngineState` 上，而应该直接变成 `projection-runtime` 持有的 `working`。

一句话：

> `ViewCache` 不是 engine state 真相，而是 active runtime 的内部工作内存。

---

## 7. 最终 engine internal 形态

## 7.1 `EngineState.active`

长期最优建议收敛成：

```ts
export interface ActiveRuntimeState {
  plan?: ViewPlan
  index: IndexState
}
```

这里明确删掉：

- `cache`
- `snapshot`

原因：

- `cache` 已经迁入 `projection-runtime.working`
- `snapshot` 已经是 public result 真相，不需要再在 internal state 里重复保存一份

也就是说，长期最终形态里：

- `EngineState` 保存：
  - document/history/index/plan
- `projection-runtime` 保存：
  - active working + previous active snapshot
- `EngineResult` 保存：
  - public snapshot + public delta

这三层职责才是最干净的。

## 7.2 `CoreRuntime`

`CoreRuntime` 应当继续保持为瘦的 state/result 容器。

最终语义应当是：

```ts
interface CoreRuntime {
  state(): EngineState
  result(): EngineResult
  updateState(next: EngineState): void
  commit(next: {
    state: EngineState
    result: EngineResult
  }): void
  subscribe(listener: (result: EngineResult) => void): () => void
}
```

这里明确不应该再出现：

- `activeRuntime`
- 任何 active working memory
- 任何 active phase graph

原因：

- `CoreRuntime` 是根状态容器
- 不是 active 执行器 owner
- 如果把 active runtime 放进来，后续一定会被继续塞别的执行器

一句话：

> `CoreRuntime` 保持容器化，不承接 active derive kernel。

## 7.3 commit/write runtime owner

这里不必再新增一个额外的公共 `CommitRuntime` 接口。

长期最优只需要固定一个 owner 关系：

- 现有 `createWriteControl()` 背后的 write runtime
  或
- 与它等价的 engine internal commit runtime

负责长期持有：

- `CoreRuntime`
- `PerformanceRuntime`
- `ActiveProjectionRuntime`

这里的关键不是名字，而是 owner 关系。

无论最后继续沿用 `createWriteControl()`，还是内部重命名成 commit runtime，都应满足同一个约束：

> `activeProjectionRuntime` 由 commit/write runtime 长期持有并复用。

## 7.4 `ActiveProjectionRuntime`

```ts
export interface ActiveProjectionRuntime {
  update(input: ActiveProjectionInput): {
    snapshot?: ViewState
    delta?: ActiveDelta
    trace: ViewTrace
  }
}
```

这个 runtime 自己持有：

- `working`
- previous active snapshot
- phase graph

不持有：

- document
- engine state
- source/store

这里再强调一次：

- 它不进入 `EngineState`
- 它不进入 `CoreRuntime`
- 它只归 commit/write runtime 持有

这里也刻意不暴露：

- `snapshot()`

原因：

- commit/write runtime 只需要 `update()` 的结果
- public snapshot 真相已经在 `EngineResult`
- 再暴露一个 `snapshot()` 只会增加额外读取面

---

## 8. planner 应该怎么设计

planner 的职责不是决定最终 action，而只是决定这次从哪个 phase 开始。

这是一个非常关键的边界。

### 8.1 planner 只做入口种子

planner 只回答：

- 本次先启动哪些 phase

例如：

- query 相关变化：从 `query` 起跑
- group/bucket 相关变化：从 `membership` 起跑
- calculation 相关变化：从 `summary` 起跑
- 纯 publish/base 变化：从 `publish` 起跑

### 8.2 phase 自己仍然决定 action

真正的：

- `reuse`
- `sync`
- `rebuild`

仍然保留在每个 phase 自己的 `resolveAction` 里。

也就是说：

- planner 负责粗粒度入口
- phase 负责精粒度行为

这样可以最大化复用当前阶段逻辑，不需要把全部业务判断搬到 planner。

### 8.3 fanout 继续靠 changed 传播

当前 `projection-runtime` 的 changed fanout 对 active 这条线已经够用。

原因：

- phase 图是线性的
- 详细 dirty 语义已经存在于各阶段 delta 里
- 下游 phase 本来就会读取上游 delta

所以长期最优不是先把 `projection-runtime` 改成一个很复杂的 dirty engine，而是先让 active runtime 直接落进去。

一句话：

> active runtime 这次迁移，不需要先重写 projection-runtime 的泛化 dirty 模型。

---

## 9. phase 应该怎么落

长期最优不是重写四个阶段的业务逻辑，而是重写 orchestration。

## 9.1 query

保留现有：

- `resolveQueryAction`
- `buildQueryState`
- `runQueryStage` 内的主要逻辑

只把它包装成 projection-runtime 的 `phase.run(context)`。

## 9.2 membership

保留现有：

- `resolveMembershipAction`
- `syncMembershipState`
- `buildMembershipDelta`

同样只改成 phase wrapper。

## 9.3 summary

保留现有：

- `resolveSummaryAction`
- `deriveSummaryState`

继续让它读取：

- `working.membership.state`
- `working.membership.delta`

## 9.4 publish

保留现有：

- `publishViewBase`
- `publishSections`
- `publishSummaries`
- `projectActiveDelta`

但它在 projection-runtime 里的语义要更明确：

- `publish` 是最后一个 phase
- 它写入 `working.publish.snapshot`
- 它写入 `working.publish.delta`
- runtime publisher 只负责把这两个值拿出去

也就是说：

> publish phase 产真相，runtime publisher 只是搬运，不再做业务推导。

---

## 10. projection-runtime 是否需要先重写

结论是：

> 不需要先重写 projection-runtime 的执行模型，但需要先收紧它的输入 contract。

原因如下。

### 10.1 当前 contract 已经够用

当前 projection-runtime 已经有：

- `planner`
- `phases`
- `publisher`
- `working`
- `previous snapshot`
- `changed fanout`
- `trace`

对 active 这条线来说，这已经足够。

真正需要先改的只有一件事：

- 删掉 `TInputChange`

也就是把：

- `update(input, change)`
- `planner.plan({ change, previous })`

统一收成：

- `update(input)`
- `planner.plan({ input, previous })`

这属于 contract 收紧，不属于 runtime 模型重写。

### 10.2 不要为了 active runtime 过度泛化 projection-runtime

如果为了这次迁移，先去给 projection-runtime 加下面这些大抽象：

- phase output registry
- edge-level dirty transform
- 多层 publish graph
- runtime source bridge

复杂度会立刻反噬。

当前长期最优做法是：

1. 先让 active runtime 用当前 projection-runtime 落地
2. 如果后面真的有第二个 domain 需要同样能力，再回头抽 projection-runtime 的通用能力

一句话：

> 先让 projection-runtime 吃到 Dataview 真实负载，再决定是否继续泛化。

---

## 11. 迁移顺序

## 第一阶段：先落 runtime 包装层

新增 active projection runtime 包装，不改业务逻辑。

建议新增一组 engine internal 文件：

- `dataview/packages/dataview-engine/src/active/projection/runtime.ts`
- `dataview/packages/dataview-engine/src/active/projection/planner.ts`
- `dataview/packages/dataview-engine/src/active/projection/working.ts`
- `dataview/packages/dataview-engine/src/active/projection/publisher.ts`

这一步只做：

- 建 `ActiveProjectionInput`
- 收紧 `projection-runtime` 为单输入 contract
- 建 `ActiveProjectionWorking`
- 建 planner
- 把现有四个 stage 包成 phase

## 第二阶段：让 commit/write runtime 持有 active runtime

把 active runtime 实例移到 engine internal commit/write runtime 内部。

这一步做完后：

- commit path 不再传 `ViewCache`
- active working 改由 projection-runtime 自己持有
- `CoreRuntime` 继续保持瘦身

## 第三阶段：删掉 `ViewCache`

删除：

- [cache.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/cache.ts)
- `EngineState.active.cache`
- 所有 `previousCache` 线程参数

并把这些状态并入 `ActiveProjectionWorking`。

## 第四阶段：删掉手写 orchestration

删除或清空：

- [runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/runtime.ts)
- [runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/runtime.ts)

让 commit path 直接调用：

- `activeProjectionRuntime.update(...)`

## 第五阶段：收掉 active snapshot 重复真相

最终删掉：

- `EngineState.active.snapshot`

让 public active snapshot 真相只剩两处：

1. `projection-runtime` 内部 previous snapshot
2. `EngineResult.snapshot.active`

这一步做完，active derive runtime 的边界会非常干净。

---

## 12. commit 链最终应该长什么样

最终 commit 主链应当收敛成：

```ts
const plan = resolveViewPlan(documentContext, documentContext.activeViewId)
const index = deriveIndex(...)
const nextDocDelta = projectDocumentDelta(...)

const active = commitRuntime.activeRuntime.update({
  read: {
    reader: documentContext.reader,
    fieldsById: documentContext.fieldsById
  },
  view: {
    plan,
    previousPlan: base.active.plan
  },
  index: {
    state: index.state,
    delta: index.delta
  },
  impact: baseImpact
})
const nextDelta = nextDocDelta || active.delta
  ? {
      ...(nextDocDelta
        ? {
            doc: nextDocDelta
          }
        : {}),
      ...(active.delta
        ? {
            active: active.delta
          }
        : {})
    }
  : undefined

const nextState = {
  rev: base.rev + 1,
  doc,
  history,
  active: {
    ...(plan ? { plan } : {}),
    index: index.state
  }
}

const nextResult = {
  rev: nextState.rev,
  snapshot: {
    doc,
    ...(active.snapshot ? { active: active.snapshot } : {})
  },
  ...(nextDelta ? { delta: nextDelta } : {})
}
```

这个结构有三个明确好处：

1. commit path 只管上游事实和总装配
2. active runtime 自己对自己的 working 负责
3. active snapshot/delta 只有一个统一出口

---

## 13. 性能约束

这次迁移必须满足下面这些约束。

## 13.1 不得每次 commit 新建 runtime

`projection-runtime` 必须在 commit/write runtime 初始化时创建一次，然后长期复用。

否则：

- working 无法复用
- item id pool 无法复用
- 每次 commit 都会有额外初始化成本

## 13.2 不得把 working 重新 clone 成新对象

每个 phase 只更新自己的 slot：

- `working.query`
- `working.membership`
- `working.summary`
- `working.publish`

不要为了“不可变好看”牺牲热路径。

## 13.3 publish 继续负责 snapshot 复用

当前：

- store 复用
- section/item 复用
- snapshot 节点复用

这些能力必须保留在 publish phase 里。

projection-runtime 只负责编排，不能破坏 publish 的复用语义。

## 13.4 trace 不得丢

迁移后仍然要保留：

- phase action
- phase metrics
- total time
- active runtime trace

必要时把当前 `deriveMs/publishMs` 放进 phase metrics，不必强行修改 projection-runtime trace contract。

---

## 14. 验证标准

这次迁移完成后，至少要同时满足下面这些约束。

1. public `EngineResult.snapshot/delta` 完全等价
2. runtime source adapter 无需感知这次内部重构
3. 50k 数据下 active derive 性能不劣化
4. active orchestration 代码显著缩短，并且 `ViewCache` 彻底退场
5. `CoreRuntime` 不新增 `activeRuntime` 之类的执行器字段
6. `projection-runtime` 不再保留 `TInputChange` 这类重复输入分叉

如果只是“换了一层 runtime，但：

- `ViewCache` 还在
- 手写 orchestration 还在
- commit path 还要自己串 4 个 stage

那就不算完成。

---

## 15. 最终结论

在当前边界已经清理干净、public delta 已经纠正、active 主链已经天然 phase 化的前提下，`projection-runtime` 重写 `active derive runtime` 是正确方向，而且切口已经足够成熟。

长期最优方案应当固定成下面这几条：

1. 只让 `projection-runtime` 接管 `active derive runtime`
2. 不让它碰 document commit/history/index/source/store
3. `query -> membership -> summary -> publish` 继续保留为唯一 active phase graph
4. `publish` 仍然是唯一 public 出口
5. `ViewCache` 整体退场，迁入 `projection-runtime.working`
6. `activeProjectionRuntime` 由 engine internal commit/write runtime 长期持有
7. `projection-runtime` 收敛成单输入 contract，不再保留 `TInputChange`
8. `activeProjectionRuntime` 不再暴露 `snapshot()` 这类额外读取面
9. `CoreRuntime` 继续只做 state/result 容器
10. commit path 只负责：
   - plan
   - index
   - active runtime update
   - result 组装
11. runtime/react 完全不感知这次重构

一句话概括：

> 这次不是让 projection-runtime 重写 engine，而是让它成为 commit/write runtime 内部专门承接 active derive 的统一运行时内核。

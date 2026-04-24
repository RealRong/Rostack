# Dataview Active Projector 降复杂度方案

## 1. 目标与原则

`dataview/packages/dataview-engine/src/active` 已经接入 `@shared/projector`，方向是对的，但当前仍然只用了最外层 runtime，装配层复杂度还明显偏高。

这次收敛的目标不是重写 query / membership / summary / publish 的领域算法，而是把 active projector 的 orchestration 彻底收敛到长期最优形态：

1. `@shared/projector` 负责 projector 通用机制。
2. `active` 只保留 Dataview 领域 projection 算法与 Dataview 专属 trace。
3. 不保留兼容层，不保留双轨，不做过渡目录。
4. 重构过程中允许阶段性跑不通，目标只看最终结构是否干净。
5. 旧实现一旦被新实现替代，必须直接删除，不能残留 alias、fallback、legacy helper。

---

## 2. 结论

这件事能做，而且值得做。

当前 active 的主要复杂度并不在 query / membership / summary 算法本身，而在 projector 装配层：

1. `active/projector/projector.ts` 把 contracts、phase、publisher、spec、wrapper 全堆在一个大文件里。
2. `active/projector/working.ts` 通过 `runId / previousState / delta / action` 这些“当前轮临时状态”在 phase 间传递信息。
3. `active/projector/planner.ts` 只返回 phase set，下游 phase 仍然要自己重新判断“上游这轮到底有没有跑、跑出来什么”。
4. `publish` 的 reset 与 phase state 生命周期缠在一起，ownership 不清楚。

`@shared/projector` 已经有足够的 primitive 来把这些问题收掉：

- `defineProjectorSpec`
- `definePhase`
- `createPlan`
- `mergePlans`
- phase `scope`
- phase `emit`
- `publishValue / publishList / publishEntityList`
- projector test harness / assert

所以这次不需要再发明一层新的 runtime，也不需要给 Dataview 再造一套本地 projector 基础设施。正确做法是直接把 active projector 收敛到 shared/projector 的最终用法。

---

## 3. 不进入 shared/projector 的部分

下面这些继续留在 Dataview：

- `active/query/*` 的搜索、筛选、排序、visible record 推导。
- `active/membership/*` 的 section / group / bucket 推导。
- `active/summary/*` 的 section summary 计算。
- `active/publish/*` 的 view base、section/item、summary 发布逻辑。
- `active/projector/trace.ts` 对 Dataview performance trace 的适配。
- `mutation/publish.ts` 中 Dataview commit -> active/index/projector 的接线。

原因很简单：这些都是 Dataview 领域 projection 语义，不是 projector 通用设施。

---

## 4. 当前真正的问题

### 4.1 `projector.ts` 是一个过大的装配文件

当前 `dataview/packages/dataview-engine/src/active/projector/projector.ts` 同时定义了：

- `ActiveProjectorInput`
- `ActiveProjectorWorking`
- 4 个 phase
- publisher
- spec
- `createActiveProjector`

这导致：

- 类型边界模糊
- phase 代码难独立阅读
- 与 whiteboard 最终态不一致
- 后续很难继续做 phase scope 收敛

### 4.2 `working` 里混入了当前轮临时通信状态

当前 `ActiveProjectorWorking` 中除了真正的 phase state，还包含：

- `query.delta`
- `query.runId`
- `membership.previousState`
- `membership.delta`
- `membership.action`
- `membership.runId`
- `summary.previousState`
- `summary.delta`
- `summary.runId`

这些都不是长期状态，而是“这一次 update 里为了让下游知道上游发生了什么”临时挂进去的 scratch data。

这类状态留在 working 里会带来两个问题：

1. working 结构膨胀。
2. phase 之间的依赖没有被 projector contract 显式表达，只能靠 `runId` 之类的隐式约定。

### 4.3 planner 没有把 phase 间传播显式化

现在 planner 只能决定：

- 这轮跑不跑 `query`
- 这轮跑不跑 `membership`
- 这轮跑不跑 `summary`
- 这轮跑不跑 `publish`

但它没有表达：

- `query` 跑完后要把哪些结果传给 `membership`
- `membership` 跑完后要把哪些结果传给 `summary`
- `summary` 跑完后要把哪些结果传给 `publish`

于是这些信息只能塞进 `working`。

### 4.4 publish reset 的边界不够清楚

当前 `publishPhase` 里在无 active view 时会调用 `resetActiveProjectorWorking(...)`，这相当于 publish phase 兼管了其它 phase 的 scratch 生命周期。

长期最优边界应该是：

- phase state 自己清晰可读
- publish phase 只负责发布 snapshot/delta
- 当前轮 phase 之间的临时传播通过 `scope` 完成

---

## 5. 最终边界

最终边界应当是：

```txt
shared/projector
  负责：
  - projector orchestration
  - phase DAG
  - phase scope / emit / merge
  - projector spec helper
  - 通用 publish helper
  - projector testing helper

dataview active
  负责：
  - query / membership / summary / publish 领域推导
  - Dataview phase scope 定义
  - Dataview snapshot / delta 语义
  - Dataview trace 适配
```

这次重构不需要扩展 `shared/projector` runtime 契约；只需要把 Dataview active 真正切到它已经提供的正确用法。

---

## 6. 最终目录结构

最终结构建议对齐 whiteboard 的 projector 最终态：

```txt
dataview/packages/dataview-engine/src/active/
  contracts/
    projector.ts
  projector/
    context.ts
    createEmptySnapshot.ts
    createWorking.ts
    planner.ts
    publisher.ts
    spec.ts
    trace.ts
    createActiveProjector.ts
    scopes/
      membershipScope.ts
      summaryScope.ts
      publishScope.ts
  phases/
    query.ts
    membership.ts
    summary.ts
    publish.ts
```

说明：

- `active/query/runtime.ts`、`active/membership/runtime.ts`、`active/summary/runtime.ts`、`active/publish/runtime.ts` 继续保留，作为领域 stage runtime。
- `active/phases/*` 只做 projector phase wrapper，不再塞进 monolithic `projector.ts`。
- `active/projector/*` 只保留 projector 装配层。

---

## 7. 最终 API 设计

### 7.1 contracts

`active/contracts/projector.ts`

```ts
export type ActivePhaseName =
  | 'query'
  | 'membership'
  | 'summary'
  | 'publish'

export interface ActiveProjectorInput {
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

export interface ActiveProjectorRunInput extends ActiveProjectorInput {
  runId: number
}

export interface ActivePhaseMetrics extends ViewStageMetrics {
  deriveMs: number
  publishMs: number
}

export interface ActiveProjectorTrace {
  view: ViewTrace
  snapshot: SnapshotTrace
  snapshotMs: number
}

export interface ActiveProjectorResult {
  snapshot?: ViewState
  delta?: ActiveDelta
  trace: ActiveProjectorTrace
}
```

### 7.2 working

最终 `working` 只保留长期状态，不再保留本轮临时桥接数据：

```ts
export interface ActiveProjectorWorking {
  query: {
    state: QueryPhaseState
    records: ViewRecords
  }
  membership: {
    state: MembershipPhaseState
  }
  summary: {
    state: SummaryPhaseState
  }
  publish: {
    itemIds: ItemIdPool
    snapshot?: ViewState
    delta?: ActiveDelta
  }
}
```

明确删除：

- `query.delta`
- `query.runId`
- `membership.previousState`
- `membership.delta`
- `membership.action`
- `membership.runId`
- `summary.previousState`
- `summary.delta`
- `summary.runId`

这些信息改由 phase `scope` 在当前轮内传递。

### 7.3 scope map

`active` 最终使用显式 phase scope map：

```ts
export interface ActivePhaseScopeMap {
  query: undefined
  membership: MembershipPhaseScope
  summary: SummaryPhaseScope
  publish: PublishPhaseScope
}
```

#### `MembershipPhaseScope`

`query -> membership` 的当前轮传递：

```ts
export interface MembershipPhaseScope {
  query?: {
    action: PhaseAction
    delta: QueryPhaseDelta
  }
}
```

#### `SummaryPhaseScope`

`membership -> summary` 的当前轮传递：

```ts
export interface SummaryPhaseScope {
  membership?: {
    action: PhaseAction
    previous?: MembershipPhaseState
    delta: MembershipPhaseDelta
  }
}
```

#### `PublishPhaseScope`

`planner / membership / summary -> publish` 的当前轮传递：

```ts
export interface PublishPhaseScope {
  reset: boolean
  membership?: {
    previous?: MembershipPhaseState
  }
  summary?: {
    previous?: SummaryPhaseState
    delta: SummaryPhaseDelta
  }
}
```

`publish` phase 需要 `mergeScope`，因为：

- planner 可能先写入 `reset`
- membership phase 可能写入 `membership`
- summary phase 可能写入 `summary`

### 7.4 context / phase alias

`active/projector/context.ts`

```ts
export type ActiveProjectorContext = ProjectorContext<
  ActiveProjectorRunInput,
  ActiveProjectorWorking,
  ViewState | undefined,
  ActivePhaseScopeMap[ActivePhaseName]
>
```

`active/phases/*` 分别使用 `definePhase(...)`，不再在单文件里手写一整组 phase type alias。

### 7.5 spec / publisher / entry

`active/projector/spec.ts`

```ts
export const activeProjectorSpec = defineProjectorSpec({
  createWorking: createActiveProjectorWorking,
  createSnapshot: createEmptyActiveSnapshot,
  plan: activeProjectorPlanner.plan,
  publish: activeProjectorPublisher.publish,
  phases: [
    activeQueryPhase,
    activeMembershipPhase,
    activeSummaryPhase,
    activePublishPhase
  ]
})
```

`active/projector/createActiveProjector.ts`

```ts
export const createActiveProjector = (): ActiveProjector => {
  const projector = createProjector(activeProjectorSpec)
  let runId = 0

  return {
    update(input) {
      runId += 1
      const previous = projector.snapshot()
      const result = projector.update({
        ...input,
        runId
      })

      return {
        snapshot: result.snapshot,
        ...(result.change ? { delta: result.change } : {}),
        trace: createActiveProjectorTrace({
          previous,
          next: result.snapshot,
          projectorTrace: result.trace
        })
      }
    }
  }
}
```

这里保留 Dataview 专属 wrapper，但 projector runtime 本身不再散落在大文件里。

---

## 8. planner 的最终写法

当前 `planner.ts` 是一个大函数，内部持续 `phases.add(...)`。

最终应改成多个独立子规划函数，再用 `mergePlans(...)` 合并：

```ts
export const activeProjectorPlanner = {
  plan: ({ input, previous }) => mergePlans(
    planReset(input, previous),
    planQuery(input, previous),
    planMembership(input, previous),
    planSummary(input, previous),
    planPublish(input, previous)
  )
}
```

### 8.1 `planReset`

当没有 active view / active plan 时：

- 如果 `previous` 存在，返回 `publish`，并附带 `scope.publish = { reset: true }`
- 如果 `previous` 不存在，返回空 plan

即：

```ts
return previous
  ? createPlan({
      scope: {
        publish: {
          reset: true
        }
      }
    })
  : createPlan()
```

### 8.2 其它子 planner

其它 planner 只负责判定自己对应的 phase 是否需要运行：

- `planQuery`
- `planMembership`
- `planSummary`
- `planPublish`

不再让一个函数同时维护全部 phase set。

这样做的收益：

1. 规则边界更清晰。
2. 可单独测试每一类 dirty 规则。
3. 可以直接使用 `@shared/projector` 的 `createPlan / mergePlans`，不再手写 phase set 拼装样板。

---

## 9. phase 之间的最终传播方式

### 9.1 query phase

`active/phases/query.ts`

- 调用 `runQueryStage(...)`
- 更新 `working.query.state`
- 更新 `working.query.records`
- 当 query phase 本轮执行后，向 `membership` emit scope

```ts
emit: {
  membership: {
    query: {
      action: result.action,
      delta: result.delta
    }
  }
}
```

这样 `membership` 不再依赖：

- `working.query.delta`
- `working.query.runId`

### 9.2 membership phase

`active/phases/membership.ts`

- 从 `context.scope?.query` 读取当前轮 query 输出
- 若没有 scope，则表示 query 本轮未跑，按 reuse upstream 处理
- 更新 `working.membership.state`
- 向 `summary` 和 `publish` emit 当前轮 membership 信息

```ts
emit: {
  summary: {
    membership: {
      action: result.action,
      previous: previousState,
      delta: result.delta
    }
  },
  publish: {
    membership: {
      previous: previousState
    }
  }
}
```

这样 `summary` 与 `publish` 不再依赖：

- `working.membership.previousState`
- `working.membership.delta`
- `working.membership.action`
- `working.membership.runId`

### 9.3 summary phase

`active/phases/summary.ts`

- 从 `context.scope?.membership` 读取当前轮 membership 输出
- 若没有 scope，则说明 membership 本轮未跑，按当前 membership state 作为 upstream reuse
- 更新 `working.summary.state`
- 向 `publish` emit 当前轮 summary 信息

```ts
emit: {
  publish: {
    summary: {
      previous: previousState,
      delta: result.delta
    }
  }
}
```

这样 `publish` 不再依赖：

- `working.summary.previousState`
- `working.summary.delta`
- `working.summary.runId`

### 9.4 publish phase

`active/phases/publish.ts`

- 若 `scope.reset === true`，直接发布 reset
- 否则读取：
  - `working.query.records`
  - `working.membership.state`
  - `working.summary.state`
  - `scope.membership?.previous`
  - `scope.summary?.previous`
  - `scope.summary?.delta`

最终 `publish phase` 的输入依赖会非常清晰，而且只依赖：

1. 当前 working state
2. 当前轮 upstream emit 过来的 scope
3. previous snapshot

而不再依赖一堆散落在 working 里的 scratch field。

---

## 10. publish 的最终边界

`active/projector/publisher.ts` 最终保持纯 publish：

```ts
export const activeProjectorPublisher = {
  publish: ({ previous, working }) => ({
    snapshot: working.publish.snapshot,
    change: working.publish.snapshot === previous
      ? undefined
      : working.publish.delta
  })
}
```

说明：

- publisher 不负责 reset query/membership/summary。
- publisher 不负责推导 phase dirty。
- publisher 只读取 `working.publish`。

`publish phase` 自己负责把 `working.publish.snapshot / delta` 写成最终结果。

---

## 11. shared/projector 在 Dataview 中应当如何深度使用

这次收敛不靠“新增更多 shared API”，而是把现有 shared primitive 用到位。

### 11.1 `defineProjectorSpec`

Dataview active 应与 whiteboard 一样使用稳定 spec 常量，不再让大文件同时承担 spec factory 与 phase 实现。

### 11.2 `definePhase`

所有 active phase 直接改成 `definePhase(...)`。

### 11.3 `createPlan / mergePlans`

planner 直接拆成子 plan，再用 shared helper 合并。

### 11.4 `scope / emit / mergeScope`

这是这次收敛的核心。

Dataview active 过去没有真正把 `scope` 当 phase 间通信机制来用，导致必须把临时状态塞进 `working`。  
最终必须把这部分全部改成显式 scope 传播。

### 11.5 publish helper

已有的 shared helper 继续使用：

- `publishEntityList`
- `publishValue`
- `publishList`

但 Dataview 专属的复杂 equality 仍可留在 `active/publish/*`，不强行塞进 shared。

### 11.6 projector test helper

active projector 的装配级测试应直接基于 `@shared/projector` 的 testing helper：

- `createHarness`
- `assertPhaseOrder`
- `assertPublishedOnce`

这样可以把“phase order / scope emit / publish 结果”作为 projector 集成测试单独覆盖，而不是只靠 stage unit test 间接兜底。

---

## 12. 实施步骤

### Phase 1：拆 contracts / spec / phases

1. 新建 `active/contracts/projector.ts`
2. 新建 `active/projector/context.ts`
3. 新建 `active/projector/spec.ts`
4. 新建 `active/projector/publisher.ts`
5. 新建 `active/projector/createWorking.ts`
6. 新建 `active/projector/createEmptySnapshot.ts`
7. 新建 `active/phases/query.ts`
8. 新建 `active/phases/membership.ts`
9. 新建 `active/phases/summary.ts`
10. 新建 `active/phases/publish.ts`

这一阶段结束后，`active/projector/projector.ts` 不再承载 phase/spec 实现。

### Phase 2：引入 phase scope，删除 runId scratch 依赖

1. 定义 `ActivePhaseScopeMap`
2. 引入 `MembershipPhaseScope`
3. 引入 `SummaryPhaseScope`
4. 引入 `PublishPhaseScope`
5. `query -> membership` 改为 emit scope
6. `membership -> summary/publish` 改为 emit scope
7. `summary -> publish` 改为 emit scope

这一阶段结束后，working 中所有当前轮 scratch field 都应被删除。

### Phase 3：planner 改为子 plan 合并

1. 拆出 `planReset`
2. 拆出 `planQuery`
3. 拆出 `planMembership`
4. 拆出 `planSummary`
5. 拆出 `planPublish`
6. 用 `mergePlans(...)` 合并

### Phase 4：publish reset 语义收敛

1. reset 通过 `scope.publish.reset` 进入 publish phase
2. publish phase 内部完成 reset 发布
3. 清理旧的 reset helper 与 publish 生命周期混用逻辑

### Phase 5：测试与清理

1. 保留现有 `runQueryStage / runMembershipStage / runSummaryStage` 单测
2. 新增 active projector 装配级测试
3. 覆盖以下场景：
   - active view 切换
   - 纯 query 变化
   - 纯 membership 变化
   - 纯 summary 变化
   - 纯 publish 变化
   - reset
   - query -> membership -> summary -> publish scope 传递

---

## 13. 必须删除的旧实现

这部分必须明确，不留模糊空间。

### 13.1 必删文件 / 旧形态

以下旧形态必须直接删除或彻底重写，不得保留兼容入口：

1. `dataview/packages/dataview-engine/src/active/projector/projector.ts` 这个 monolithic 装配文件。
2. `dataview/packages/dataview-engine/src/active/projector/working.ts` 里旧的 runId/scratch working 形态。
3. `ActiveProjectorWorking` 中所有 `runId / previousState / delta / action` scratch 字段。
4. 依赖 scratch 字段判断“本轮上游是否执行”的逻辑。
5. planner 单函数内维护全量 phase set 的写法。
6. 任何从旧 `projector.ts` 向新文件的 alias re-export。

### 13.2 不允许保留的过渡方式

下面这些都不允许出现：

- `projector.legacy.ts`
- `projector.next.ts`
- `createActiveProjector2`
- `activeProjectorSpecV2`
- 新旧 phase 同时存在，通过 flag 切换
- 新 scope 逻辑接入后，working scratch field 继续保留一段时间

最终代码里只能有一套 active projector 实现。

---

## 14. 预期收益

完成后 active projector 会得到这些直接收益：

1. 装配层目录与 whiteboard projector 最终态对齐，阅读成本明显下降。
2. `working` 回到真正的长期状态模型，不再承载当前轮临时通信。
3. phase 间依赖改为显式 `scope / emit`，依赖关系清晰。
4. planner 可以按职责拆分，dirty 规则更容易维护与测试。
5. publisher 回到纯发布职责，ownership 清楚。
6. active 对 `@shared/projector` 的利用从“只用 runtime 外壳”升级为“完整使用 spec / phase / scope / plan / test primitive”。

---

## 15. 最终判断

`dataview/packages/dataview-engine/src/active` 完全可以进一步深度利用 `@shared/projector` 来显著降低复杂度，而且这次不需要新增复杂共享 runtime。

正确方向不是把 Dataview 的领域 projection 搬进 shared，而是：

1. 把 active projector 的装配层彻底 spec 化、phase 化、scope 化。
2. 把 phase 间当前轮传播从 `working scratch` 改成 `scope emit`。
3. 把 planner 改成 `createPlan / mergePlans` 组合式写法。
4. 把旧 monolithic projector 实现与所有临时桥接字段一次性删干净。

这是可以直接落到最终态的，不需要过渡。

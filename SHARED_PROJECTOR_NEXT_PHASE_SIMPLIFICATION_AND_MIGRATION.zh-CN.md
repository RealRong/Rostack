# Shared Projector 下一阶段收敛方案

## 1. 前提

本文采用以下原则：

- 不考虑兼容旧实现。
- 不保留双轨 API。
- 新设计一旦落地，旧 helper / 旧 scope / 旧 merge 逻辑必须直接删除。
- 只做 **最通用、复杂度最低、但能显著降低 whiteboard 与 dataview projector 复杂度** 的改动。

因此，本文不讨论大而全的 projector 重写，只讨论下一阶段最值得做的一步。

## 2. 研究结论

对 `dataview/packages/dataview-engine/src/active` 当前 projector 链路的检查结果是：

- active 已经正确地采用了 `query -> membership -> summary -> publish` 的 projector phase 链。
- active 的阶段逻辑本身大多是领域逻辑，不适合继续抽进 shared。
- active 仍然保留了本地 scope 基础设施：
  - `active/projector/scope.ts`
  - `publish/stage.ts` 中的 `mergePublishPhaseScope`
  - 多个阶段里手工 `create*PhaseScope(...)`
- whiteboard editor-graph 的问题更重：
  - `create*PatchScope`
  - `normalize*PatchScope`
  - `merge*PatchScope`
  - `has*PatchScope`
  - `read*PatchScopeKeys`
  - 以及 `KeySet`

这两个项目表面不同，但根因相同：

> `shared/projector` 目前只提供“phase 接受任意 scope + phase 自己负责 merge”的最低层机制，没有把 scope 的结构语义纳入框架。

结果就是每个业务 projector 都会自己补一层本地 scope runtime。

## 3. 下一阶段只做一件事

下一阶段只做一件事：

> 把 **phase scope schema + merge/normalize/isEmpty runtime** 正式收进 `shared/projector`。

这是当前最通用、最小闭环、收益最高的 projector 优化点。

原因很直接：

- dataview active 只需要这一层，就可以删除本地 `projector/scope.ts`。
- whiteboard editor-graph 也只需要这一层，就可以删除大部分 `projector/impact.ts` 里的 scope helper。
- 这个改动不碰阶段领域算法，不碰 publish 领域逻辑，不碰 query/membership/summary/graph/ui 的业务判断。
- 它修正的是框架缺口，而不是继续在业务层搬代码。

## 4. 不做什么

这一阶段明确 **不做** 以下事情：

- 不把 query/membership/summary/graph/ui 的 action 判定抽到 shared。
- 不引入通用 policy DSL。
- 不引入通用 planner DSL。
- 不引入通用 publish DSL 之外的新框架层。
- 不把 dataview 或 whiteboard 的 trace 结构抽到 shared。
- 不把阶段 derive 算法抽象成模板方法。

这些都不是下一阶段最小、最稳、最通用的公共收益点。

## 5. 最终设计

## 5.1 `shared/projector` 新增 scope schema

`shared/projector` 应新增一个极小的 scope schema 设施，只支持三种字段：

- `flag()`
- `set<T>()`
- `slot<T>()`

含义如下：

- `flag()`：布尔标记，merge 规则是 OR。
- `set<T>()`：键集合，merge 规则是 union，运行期归一化为 `ReadonlySet<T>`。
- `slot<T>()`：单值槽位，merge 规则是“后写覆盖前写”，用于承载跨阶段 payload。

这个设计已经足够覆盖 whiteboard 与 dataview 的现有需求，不需要更多字段类型。

## 5.2 API 形态

建议 API 形态如下：

```ts
import {
  defineScope,
  flag,
  set,
  slot
} from '@shared/projector'

const graphScope = defineScope({
  reset: flag(),
  order: flag(),
  nodes: set<NodeId>(),
  edges: set<EdgeId>(),
  mindmaps: set<MindmapId>(),
  groups: set<GroupId>()
})

const publishScope = defineScope({
  reset: flag(),
  membership: slot<{
    previous?: MembershipPhaseState
  }>(),
  summary: slot<{
    previous?: SummaryPhaseState
    delta: SummaryPhaseDelta
  }>()
})
```

phase spec 直接声明自己的 scope schema：

```ts
const publishPhase = {
  name: 'publish',
  deps: ['query', 'membership', 'summary'],
  scope: publishScope,
  run(context) {
    const { reset, membership, summary } = context.scope
  }
}
```

## 5.3 merge 规则

框架内建以下规则：

- `flag`: `current || next`
- `set`: `union(current, next)`
- `slot`: `next !== undefined ? next : current`

这三个规则必须成为 runtime 内建行为，不再由 phase 提供 `mergeScope`。

## 5.4 normalize 规则

phase 在 `run(context)` 中拿到的 `context.scope` 必须已经是归一化结果：

- `flag` 永远是 `boolean`
- `set` 永远是 `ReadonlySet<T>`
- `slot` 永远是 `T | undefined`

也就是说，phase 不再自己写：

- `normalizeScope`
- `readScopeKeys`
- `scope?.reset ?? false`

而是直接写：

```ts
const { reset, nodes, membership } = context.scope
```

## 5.5 empty 规则

框架必须能判断一个 scope 是否为空：

- 所有 `flag` 都是 `false`
- 所有 `set` 都为空
- 所有 `slot` 都是 `undefined`

空 scope 的行为：

- planner/emit 可以直接给出空 scope，runtime 自动忽略。
- 不再要求业务层先写 `hasScope(...)` 再决定是否 emit。

这对 whiteboard 的收益尤其大。

## 5.6 输入类型

`emit` 和 `plan.scope` 接收的是 **scope input**，不是归一化后的 scope value。

具体规则：

- `flag`: `boolean | undefined`
- `set`: `Iterable<T> | ReadonlySet<T> | undefined`
- `slot`: `T | undefined`

这样 planner 与 phase emit 可以直接传入数组、`Set`、`Map.keys()`、对象字面量，不需要额外包装 helper。

## 6. shared/projector 的具体变更

## 6.1 必须新增

新增：

- `defineScope`
- `flag`
- `set`
- `slot`

以及相关类型：

- `ScopeSchema`
- `ScopeInput`
- `ScopeValue`

## 6.2 必须删除

删除旧的 phase 级 scope merge 机制：

- `contracts/phase.ts` 中的 `mergeScope?`

删除后，所有 scoped phase 都必须通过 `scope` schema 声明自己的 scope 结构。

## 6.3 runtime 必须改造

`shared/projector/src/projector/update.ts` 必须改成：

- 根据 phase 的 `scope` schema merge pending scope。
- 根据 phase 的 `scope` schema normalize `context.scope`。
- 对空 scope 做 skip。

不能再调用 phase 自己提供的 `mergeScope`。

## 6.4 `createPlan` / `mergePlans`

`createPlan` / `mergePlans` 可以继续保留当前职责：

- 只做 phase 名和 scope input 的组织
- 不负责 normalize
- 不负责 empty 判断

empty 判断应该留在 runtime，因为只有 runtime 才知道 phase 的 scope schema。

## 6.5 `keySet` 必须退出 phase scope

`shared/projector/src/delta/keySet.ts` 当前只剩 whiteboard phase scope 在用。

在新方案下，phase scope 统一使用 `set<T>() + ReadonlySet<T>`，不再需要：

- `none`
- `all`
- `some`

因此：

- `KeySet` 必须退出 projector phase scope。
- 如果代码库没有其他真实用途，`shared/projector/src/delta/keySet.ts` 应直接删除。
- 对应的 `shared/projector/test/keySet.test.ts` 也应直接删除。

## 7. whiteboard 迁移方案

## 7.1 目标

让 `whiteboard/packages/whiteboard-editor-graph` 完全切到 schema-based scope runtime，删除本地 scope 基础设施。

## 7.2 修改项

### A. 修改 `contracts/delta.ts`

把 phase scope 改成最终形态：

```ts
interface GraphPatchScope {
  reset: boolean
  order: boolean
  nodes: ReadonlySet<NodeId>
  edges: ReadonlySet<EdgeId>
  mindmaps: ReadonlySet<MindmapId>
  groups: ReadonlySet<GroupId>
}

interface SpatialPatchScope {
  reset: boolean
  graph: boolean
}

interface UiPatchScope {
  reset: boolean
  chrome: boolean
  nodes: ReadonlySet<NodeId>
  edges: ReadonlySet<EdgeId>
}
```

不再依赖 `KeySet`。

### B. phase 直接声明 schema

- `phases/graph.ts`
- `phases/spatial.ts`
- `phases/ui.ts`

都直接在 phase spec 上声明 `scope`。

### C. planner 只产出原始 scope input

`projector/impact.ts` 只负责：

- 读取 input / previous / delta
- 收集 touched ids
- 组装 raw scope input
- 返回 `createPlan(...)`

不再负责：

- create
- normalize
- merge
- has
- readKeys

### D. phase 直接消费归一化 scope

例如：

- `graph.ts` 直接读 `context.scope.nodes`
- `ui.ts` 直接读 `context.scope.edges`
- `spatial.ts` 直接读 `context.scope.reset`

不再有：

- `normalizeGraphPatchScope`
- `readGraphPatchScopeKeys`
- `normalizeUiPatchScope`
- `readUiPatchScopeKeys`

## 7.3 必须删除的旧实现

必须删除：

- `whiteboard/packages/whiteboard-editor-graph/src/projector/impact.ts` 中所有 `create*PatchScope`
- `whiteboard/packages/whiteboard-editor-graph/src/projector/impact.ts` 中所有 `normalize*PatchScope`
- `whiteboard/packages/whiteboard-editor-graph/src/projector/impact.ts` 中所有 `merge*PatchScope`
- `whiteboard/packages/whiteboard-editor-graph/src/projector/impact.ts` 中所有 `has*PatchScope`
- `whiteboard/packages/whiteboard-editor-graph/src/projector/impact.ts` 中所有 `read*PatchScopeKeys`
- `whiteboard/packages/whiteboard-editor-graph/src/contracts/delta.ts` 中的 `KeySet`

如果迁移完成后 `impact.ts` 只剩 planner/impact 收集，说明方向正确。

## 8. dataview 迁移方案

## 8.1 目标

让 `dataview/packages/dataview-engine/src/active` 删除本地 `projector/scope.ts`，把跨阶段 payload merge 交给 shared/projector。

## 8.2 修改项

### A. query phase

`query/stage.ts` 不再调用 `createMembershipPhaseScope(...)`。

直接 emit：

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

`membership` phase 的 schema 使用：

```ts
defineScope({
  query: slot<{
    action: PhaseAction
    delta: QueryPhaseDelta
  }>()
})
```

### B. membership phase

`membership/stage.ts` 不再调用：

- `createSummaryPhaseScope`
- `createPublishPhaseScope`

直接 emit：

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

### C. summary phase

`summary/stage.ts` 不再调用 `createPublishPhaseScope(...)`。

直接 emit：

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

### D. publish phase

`publish/stage.ts`：

- 删除 `mergePublishPhaseScope`
- phase 自己声明 `publish` 的 scope schema
- `run(context)` 直接读取归一化后的 `context.scope`

例如：

```ts
const publishScope = defineScope({
  reset: flag(),
  membership: slot<{
    previous?: MembershipPhaseState
  }>(),
  summary: slot<{
    previous?: SummaryPhaseState
    delta: SummaryPhaseDelta
  }>()
})
```

## 8.3 dataview 中必须删除的旧实现

必须删除：

- `dataview/packages/dataview-engine/src/active/projector/scope.ts`
- `publish/stage.ts` 中的 `mergePublishPhaseScope`
- 所有 `createMembershipPhaseScope(...)`
- 所有 `createSummaryPhaseScope(...)`
- 所有 `createPublishPhaseScope(...)`

删除后，active projector 的跨阶段通信应该只剩两类代码：

- phase schema
- `emit` 原始 payload

不再有本地 scope 框架。

## 9. 这一步之后的边界

完成这一步之后，两个项目的 projector 边界会变成：

### shared/projector 负责

- phase graph
- projector update runtime
- scope schema
- scope merge / normalize / isEmpty
- publish/list/entity 等共用 primitive

### whiteboard / dataview 各自负责

- planner
- 阶段 action 决策
- 领域 delta
- working state
- publish snapshot 结构
- trace 结构

这就是正确边界。

## 10. 为什么这是“下一阶段最优”

因为它同时满足四个条件：

- 足够通用：whiteboard 和 dataview 都直接受益。
- 足够小：只补 framework 缺口，不碰领域算法。
- 足够强：能删除一整层本地 scope helper。
- 不过度抽象：只引入 `flag / set / slot` 三种 field 语义。

如果下一阶段还继续在业务包里写本地 scope helper，那么只是把问题继续推迟。

## 11. 实施顺序

建议严格按这个顺序做：

1. 改 `shared/projector`，新增 scope schema，删除 `mergeScope`。
2. 先迁移 `dataview active`，因为它 scope 形态更简单，验证 `slot` 语义是否足够。
3. 再迁移 `whiteboard editor-graph`，删除本地大批量 scope helper 与 `KeySet`。
4. 迁移完成后，删除所有旧 scope helper、旧测试、旧类型，不保留兼容层。

## 12. 验收标准

满足以下条件才算完成：

- `shared/projector` 的 scoped phase 不再有 `mergeScope` 概念。
- `dataview active` 不再存在 `projector/scope.ts`。
- `whiteboard editor-graph` 不再存在 `create/normalize/merge/has/read` 这套 scope helper。
- `KeySet` 不再用于任何 projector phase scope。
- phase `run(context)` 里读取到的 `context.scope` 永远是最终归一化结果。
- 旧实现全部删除，不保留兼容路径。

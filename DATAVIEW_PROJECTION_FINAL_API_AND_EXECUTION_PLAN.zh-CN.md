# Dataview Projection 最终 API 设计与实施方案

## 1. 目标

这份文档只讨论 **不兼容、一步到位、长期最优** 的方案。

并且增加一个明确约束：

- `@shared/projection` 必须尽量 **spec 化**
- public API 必须尽量小
- phase / scope / fanout / store / sync helper 尽量封装在内部
- domain 写的是 projection spec，不是拼装一堆 projection 基元

约束固定如下：

- 不保留 `projector` 术语
- 不保留 `active/projector/*` 私有 wrapper 体系
- 不保留 `ProjectorSpec / ProjectorPlanner / ProjectorPublisher / createProjector(...)`
- 不保留 `@shared/projector`
- dataview 的 document / index / active 都收敛到同一套 projection runtime 思路
- `mutation/publish.ts` 只做 wiring，不再承载读模型实现本身

最终基础设施只保留：

```text
@shared/delta
@shared/projection
```

最终 dataview 的读模型链路固定为：

```text
mutation commit
  -> document projection
  -> index projection
  -> active projection
  -> publish.active / publish.delta
```

---

## 2. 最终架构判断

### 2.1 dataview 本质上是三层 projection

dataview 不是一套 “document + 若干 helper”。

长期最优形态里，它应当明确拆成三层 projection：

1. **document projection**
   - 从 `prev doc / next doc / write trace` 产出 document delta
   - 表达“文档事实变化”

2. **index projection**
   - 从 `document + demand + impact` 产出 index snapshot / delta
   - 表达“为 active view 服务的索引事实”

3. **active projection**
   - 从 `reader + plan + index snapshot/delta + impact` 产出 active snapshot / delta
   - 表达“最终 view 事实”

因此 dataview 的 mutation publish 不应该再自己：

- 手工推 index
- 手工推 active
- 手工拼大段 active delta

它只应该：

- 创建 projection input
- 推进 runtime
- 读取 capture
- 回填 mutation publish 结构

### 2.2 active 不是特殊逻辑，而是一种 projection spec

今天 active 里的：

- query
- membership
- summary
- publish

本质上已经是标准 phase DAG。

长期最优不是继续保留：

- `active/projector/spec.ts`
- `active/projector/planner.ts`
- `active/projector/publisher.ts`

而是把它们合并回一个正式 `ProjectionSpec`：

- `createState`
- `createRead`
- `surface`
- `plan`
- `capture`
- `phases`

也就是说，active 不再有 “projector wrapper 层”，只保留 “projection spec 层”。

### 2.3 index 也必须 projection 化

如果 active 用 projection runtime，而 index 仍然停留在 `deriveIndex(...)` 这种外置 reducer/driver 组合，
dataview 仍然会有两套读模型底座。

长期最优必须是：

- index 也变成正式 projection runtime
- index 自己产出 snapshot / delta / trace
- active 只消费 index 的 projection output

### 2.4 document delta 也不应继续停留在 mutation publish 边上

`projectDocumentDelta(...)` 的本质不是 publish glue，而是 document projection 的 delta 产物。

长期最优里，它也应被视为 projection capture 的一部分，而不是 `mutation/publish.ts` 的本地工具函数。

### 2.5 `@shared/projection` 不应成为“大而全工具箱”

长期最优不是把原来 `projector` 里的 helper 换个包名继续公开。

真正更优雅的方向是：

- domain 只依赖 `ProjectionSpec`
- runtime 内部自己处理 phase graph / scope merge / surface store / fanout
- public API 只暴露最小必要能力

也就是说：

- 不是 “更多 helper”
- 而是 “更少公开面”

---

## 3. shared 层最终 API

## 3.1 `@shared/delta`

职责不变：

- `idDelta`
- `entityDelta`
- `changeState`
- `writeEntityChange`

它只表达“变化”，不表达 runtime。

## 3.2 `@shared/projection`

最终只保留 projection runtime 的 **最小公开面**。

正式 API 应收敛成：

```ts
createProjectionRuntime(spec)

type ProjectionSpec
type ProjectionRuntime
type ProjectionTrace
type Revision
```

也就是说，最终公开面里：

- 不再公开 `defineProjectionModel(...)`
- 不再公开 `createPlan(...) / mergePlans(...)`
- 不再公开 `defineScope(...) / flag() / set() / slot()`
- 不再公开 `ProjectionPhase / ProjectionScopeMap / ProjectionScopeValue`
- 不再公开 `ProjectorStore / createProjectorStore`

domain 只需要写一个 **projection spec**，然后交给 runtime。

### 3.2.1 projection runtime 的正式职责

`createProjectionRuntime(spec)` 负责：

- phase DAG 调度
- scope fanout
- revision
- read facade
- reactive surface
- capture
- trace

但这些都属于 **runtime 内部实现细节**，不应该被 public API 平铺出来。

### 3.2.2 spec 的推荐形态

最终 spec 应当是一个 plain object，而不是一堆 builder 组合。

推荐形态：

```ts
const activeProjectionSpec = {
  createState() {
    ...
  },
  createRead(runtime) {
    ...
  },
  surface: {
    ...
  },
  capture({ state, read, revision }) {
    ...
  },
  plan({ input, state, read, revision }) {
    return {
      phases: ['query', 'membership', 'summary', 'publish'],
      scope: {
        publish: {
          reset: false
        }
      }
    }
  },
  phases: {
    query: {
      after: [],
      run(ctx) {
        return {
          action: 'sync',
          emit: {
            membership: {
              query: ...
            }
          }
        }
      }
    },
    membership: {
      after: ['query'],
      run(ctx) {
        ...
      }
    },
    summary: {
      after: ['membership'],
      run(ctx) {
        ...
      }
    },
    publish: {
      after: ['query', 'membership', 'summary'],
      run(ctx) {
        ...
      }
    }
  }
} satisfies ProjectionSpec<...>

const runtime = createProjectionRuntime(activeProjectionSpec)
```

这里的关键点是：

- spec 是唯一 domain 编写面
- phase graph 用 `phases` plain object + `after`
- plan 直接返回 plain object
- scope 直接返回 plain data
- 不需要 domain 显式调用任何 plan/scope builder

### 3.2.3 scope schema 也应收进 spec，而不是单独导出 DSL

如果 runtime 需要知道 scope merge 语义，也不应该要求 domain 写：

- `defineScope`
- `flag`
- `set`
- `slot`

长期最优应收敛成 spec 内声明式字段：

```ts
phases: {
  publish: {
    after: ['summary'],
    scope: {
      reset: 'flag',
      membership: 'slot',
      summary: 'slot'
    },
    run(ctx) {
      ...
    }
  }
}
```

也就是说：

- scope merge 规则仍存在
- 但它是 spec 字段的一部分
- 不再暴露为独立 DSL API

### 3.2.4 publish helper 的长期最优边界

当前这类能力：

- `projectListChange`
- `publishStruct`
- `publishEntityList`
- `publishEntityFamily`

本质上是 projection snapshot publish helper。

长期最优原则不是直接把它们平铺导出，而是：

- **能内收进 runtime/内部 helper，就内收**
- **只有跨 domain 反复复用且确实稳定的 primitive，才公开**

因此推荐优先级：

1. **完全内部化**
2. 如果必须公开，只允许进入一个子命名空间

也就是说，最多允许这种形态：

```ts
import { projectionPublish } from '@shared/projection'

projectionPublish.diffList(...)
projectionPublish.publishStruct(...)
```

而不是把一整套 helper 平铺成顶级 API。

### 3.2.5 sync helper 的长期最优边界

当前这类能力：

- `composeSync`
- `createValueSync`
- `createEntityDeltaSync`
- `createIdDeltaFamilySync`

本质上是 projection output 对接外部 reactive sink 的 patch helper。

长期最优原则：

- 如果只是少量 runtime/adapter 内部使用，直接内收
- 如果确实要保留，也只允许进入一个子命名空间
- 不允许继续把一组 helper 平铺成一等 API

也就是说，默认不公开；
真有必要时，最多允许：

```ts
import { projectionSync } from '@shared/projection'
```

### 3.2.6 `@shared/projection` 的最终公开面

综合下来，长期最优公开面应尽量缩到：

```ts
createProjectionRuntime(spec)

type ProjectionSpec
type ProjectionRuntime
type ProjectionTrace
type Revision
```

可选但不推荐的补充公开面：

```ts
projectionPublish.*
projectionSync.*
```

其中：

- 默认不公开
- 只有在多个 domain 反复证明稳定后才考虑开放

---

## 4. dataview 最终 API 设计

## 4.1 document projection

### 4.1.1 输入

```ts
type DataviewDocumentProjectionInput = {
  previous: DataDoc
  next: DataDoc
  trace: DataviewTrace
}
```

### 4.1.2 状态

```ts
type DataviewDocumentProjectionState = {
  snapshot: DataDoc
  delta?: DocumentDelta
}
```

### 4.1.3 capture

```ts
type DataviewDocumentProjectionCapture = {
  snapshot: DataDoc
  delta?: DocumentDelta
}
```

### 4.1.4 结论

document projection 可以只有一个 phase：

- `document`

它的职责只是把 authoritative doc 差异转换成标准 delta capture。

---

## 4.2 index projection

### 4.2.1 输入

```ts
type DataviewIndexProjectionInput = {
  document: DataDoc
  demand?: NormalizedIndexDemand
  previousDemand?: NormalizedIndexDemand
  impact: BaseImpact
}
```

### 4.2.2 状态

```ts
type DataviewIndexProjectionState = {
  records: ...
  search: ...
  bucket: ...
  sort: ...
  summaries: ...

  snapshot: IndexState
  delta?: IndexDelta
}
```

### 4.2.3 capture

```ts
type DataviewIndexProjectionCapture = {
  snapshot: IndexState
  delta?: IndexDelta
  trace: IndexTrace
}
```

### 4.2.4 phase

最终应收敛成标准 phase DAG：

- `records`
- `search`
- `bucket`
- `sort`
- `summaries`

如果某些 phase 只是实现细节，也可以合并，但原则是：

- phase 边界由“可复用的索引事实层”决定
- 不由当前文件拆分习惯决定

### 4.2.5 index 的正式 spec

index 不应再停留在外置 `deriveIndex(...)` 驱动形式。

最终应直接写成：

```ts
export const dataviewIndexProjectionSpec: ProjectionSpec<...>
```

而不是：

- runtime + sync + trace 的松散组合

---

## 4.3 active projection

### 4.3.1 输入

```ts
type DataviewActiveProjectionInput = {
  read: {
    reader: DocumentReader
  }
  view: {
    plan?: ViewPlan
    previousPlan?: ViewPlan
  }
  index: {
    snapshot: IndexState
    delta?: IndexDelta
  }
  impact: BaseImpact
}
```

### 4.3.2 状态

```ts
type DataviewActiveProjectionState = {
  query: {
    state: QueryPhaseState
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

### 4.3.3 capture

```ts
type DataviewActiveProjectionCapture = {
  snapshot?: ViewState
  delta?: ActiveDelta
}
```

### 4.3.4 trace

runtime 原始 trace 使用统一：

```ts
ProjectionTrace<'query' | 'membership' | 'summary' | 'publish', ActivePhaseMetrics>
```

dataview 若还需要产品侧 trace 结构，则由 domain adapter 做一层纯映射：

```ts
ProjectionTrace -> ViewTrace / SnapshotTrace
```

这层映射只负责 trace 视图适配，不承担 runtime 语义。

### 4.3.5 active 的正式 spec

active 最终不再拆：

- spec
- planner
- publisher

而是只保留一个正式 spec：

```ts
export const dataviewActiveProjectionSpec: ProjectionSpec<...>
```

其中：

- `createState`：初始化 query / membership / summary / publish working state
- `createRead`：如果当前没有稳定复用需求，先返回最小 facade
- `surface`：正式暴露 active snapshot 的 reactive surface
- `plan`：根据当前 input 和已有 state 决定 phase 集合与 scoped emit
- `capture`：导出 `{ snapshot, delta }`
- `phases`：定义 query / membership / summary / publish 四段 DAG

### 4.3.6 active 的正式 runtime 入口

长期最优不建议保留 `createActiveProjector()`。

推荐最终 API：

```ts
const runtime = createProjectionRuntime(dataviewActiveProjectionSpec)
```

如果仍需要领域级工厂，则它只能是一个极薄的包装：

```ts
export const createDataviewActiveProjectionRuntime = () =>
  createProjectionRuntime(dataviewActiveProjectionSpec)
```

而不是再包一层 `projector` / `planner` / `publisher` 概念。

---

## 5. mutation publish 最终 API

## 5.1 最终职责

`dataview/packages/dataview-engine/src/mutation/publish.ts` 最终只做四件事：

1. 计算 projection input
2. 推进 document / index / active runtime
3. 读取 capture
4. 组装 mutation publish output

它不再负责：

- 自己实现 query / membership / summary / publish 逻辑
- 自己实现 index delta 逻辑
- 自己实现 document delta 逻辑

## 5.2 最终形态

```ts
const documentProjection = createProjectionRuntime(dataviewDocumentProjectionSpec)
const indexProjection = createProjectionRuntime(dataviewIndexProjectionSpec)
const activeProjection = createProjectionRuntime(dataviewActiveProjectionSpec)
```

`reduce(...)` 的固定流程：

```ts
const impact = createBaseImpact(trace)
const read = createDocumentReadContext(doc)
const plan = resolveViewPlan(read, read.activeViewId)

documentProjection.update({
  previous: prev.doc,
  next: doc,
  trace
})

indexProjection.update({
  document: doc,
  demand: plan?.index,
  previousDemand: prev.cache.plan?.index,
  impact
})

activeProjection.update({
  read: {
    reader: read.reader
  },
  view: {
    plan,
    previousPlan: prev.cache.plan
  },
  index: {
    snapshot: indexProjection.capture().snapshot,
    delta: indexProjection.capture().delta
  },
  impact
})

const documentCapture = documentProjection.capture()
const indexCapture = indexProjection.capture()
const activeCapture = activeProjection.capture()
```

然后回填：

```ts
return {
  publish: {
    ...(activeCapture.snapshot
      ? { active: activeCapture.snapshot }
      : {}),
    ...(documentCapture.delta || activeCapture.delta
      ? {
          delta: {
            ...(documentCapture.delta ? { doc: documentCapture.delta } : {}),
            ...(activeCapture.delta ? { active: activeCapture.delta } : {})
          }
        }
      : {})
  },
  cache: {
    ...(plan ? { plan } : {}),
    index: indexCapture.snapshot
  }
}
```

注意这里的重点是：

- publish.ts 只负责编排
- projection runtime 自己负责 snapshot / delta / trace

---

## 6. dataview 目录最终形态

## 6.1 active

最终删除：

```text
src/active/projector/*
src/active/contracts/projector.ts
```

改成：

```text
src/active/contracts/projection.ts
src/active/projection/impact.ts
src/active/projection/metrics.ts
src/active/projection/reset.ts
src/active/projection/spec.ts
src/active/projection/runtime.ts
src/active/projection/trace.ts
```

说明：

- 不再需要 `planner.ts / publisher.ts / context.ts` 这种拆散层
- `impact.ts`：保留领域 impact 解析
- `spec.ts`：唯一正式 active projection spec
- `runtime.ts`：如果需要领域工厂，仅保留最薄的一层创建 runtime
- `trace.ts`：只做 domain trace 映射

## 6.2 index

最终新增：

```text
src/active/index/projection/spec.ts
src/active/index/projection/runtime.ts
src/active/index/projection/trace.ts
```

旧 `runtime.ts / sync.ts / trace.ts` 中属于 projection 语义的部分，统一收口到这层。

## 6.3 document

最终新增：

```text
src/document/projection/spec.ts
src/document/projection/runtime.ts
```

`mutation/documentDelta.ts` 最终退场或下沉到 document projection 内部。

---

## 7. 删除清单

完成后必须删除：

### 7.1 shared

- `@shared/projector`
- `createProjector(...)`
- `ProjectorSpec`
- `ProjectorPlanner`
- `ProjectorPublisher`
- `ProjectorTrace`
- `ProjectorStore`
- `createProjectorStore`
- `defineProjectionModel(...)` 作为 public API
- `createPlan(...) / mergePlans(...)` 作为 public API
- `defineScope(...) / flag() / set() / slot()` 作为 public API

### 7.2 dataview

- `active/projector/*`
- `active/contracts/projector.ts`
- `ActiveProjector*` 命名
- `mutation/publish.ts` 中本地 index/active 实现语义
- 所有 `@shared/projector/*` import

---

## 8. 实施方案

## 8.1 Phase A：先清 shared 包边界

目标：

- `@shared/projector` 彻底删除
- `@shared/projection` 公开面缩到最小
- publish/sync/store 尽量内收，不再平铺暴露

动作：

1. 把 `ProjectionModel` public API 收口成 `ProjectionSpec`
2. 让 `createProjectionRuntime(spec)` 直接吃 plain spec
3. 把 plan/scope DSL 收进 runtime 内部
4. 把 publish helper 收进 runtime 内部或 `projectionPublish.*`
5. 把 sync helper 收进 runtime 内部或 `projectionSync.*`
6. 删除 `createProjectorStore`，不迁移
7. 删除整个 `shared/projector`

完成标准：

- 仓内不再存在 `@shared/projector`
- `@shared/projection` 不再向 domain 暴露大面积 builder/helper API

## 8.2 Phase B：active 一步改成 projection spec

目标：

- `active/projector/*` 彻底退场
- active 直接建立在 `ProjectionSpec` 上

动作：

1. 新建 `src/active/contracts/projection.ts`
2. 新建 `src/active/projection/spec.ts`
3. 把 query / membership / summary / publish 全部并入一个 plain spec
4. 删除 `planner.ts / publisher.ts / spec.ts` 这种拆散层
5. 用 `capture()` 正式导出 `snapshot / delta`
6. `trace.ts` 只保留 trace adapter
7. 测试改成直接测 active projection runtime，不再测 shared harness

完成标准：

- dataview active 不再引用任何 `Projector*`

## 8.3 Phase C：index projection 化

目标：

- `deriveIndex(...)` 从 mutation publish 边上退出
- index 成为正式 projection runtime

动作：

1. 把 records/search/bucket/sort/summaries 并入 index plain spec
2. 把当前 `IndexState / IndexDelta / IndexTrace` 统一收进 index capture
3. mutation publish 改为只推进 index runtime 并读取 capture

完成标准：

- mutation publish 不再直接拥有 index 派生逻辑

## 8.4 Phase D：document projection 化

目标：

- `projectDocumentDelta(...)` 从 publish glue 退场

动作：

1. 新建 document projection spec
2. 让 document delta 从 document projection capture 读取
3. 删除 mutation publish 对本地 document delta helper 的直接依赖

完成标准：

- document delta 成为正式 projection output

## 8.5 Phase E：mutation publish 收口

目标：

- `mutation/publish.ts` 只剩 wiring

动作：

1. 统一 runtime 创建与 reset
2. 统一 projection input 组装
3. 统一从 capture 读 snapshot / delta
4. 统一 performance trace 汇总

完成标准：

- `publish.ts` 中不再出现领域派生实现细节

---

## 9. 测试策略

测试不再依赖 shared 的 projector harness。

最终策略：

1. **active projection 测试**
   - 直接创建 active projection runtime
   - 调 `update(...)`
   - 读取 `capture()` 与 `trace`

2. **index projection 测试**
   - 直接创建 index projection runtime
   - 验证 snapshot / delta / trace

3. **mutation publish 测试**
   - 只验证 wiring 后的 publish 结果
   - 不重复测试 projection 内部细节

---

## 10. 完成标准

这轮做完，必须同时满足：

1. 仓内不再存在 `@shared/projector`
2. dataview 不再存在 `active/projector/*`
3. dataview 不再存在 `Projector*` 命名
4. active 是正式 `ProjectionSpec`
5. index 是正式 `ProjectionSpec`
6. document delta 来自 document projection
7. `mutation/publish.ts` 只剩 wiring
8. 测试直接面向 projection runtime，而不是旧 harness
9. `@shared/projection` public API 收敛到最小 spec/runtime 面

---

## 11. 一句话结论

不做兼容、一步到位的长期最优方案只有一个：

- 删除 `projector`
- dataview 明确拆成 `document projection / index projection / active projection`
- 所有 snapshot / delta / trace 都作为 projection runtime 的正式产物
- `@shared/projection` 只暴露最小 spec/runtime API
- `mutation/publish.ts` 退化成纯编排层

最终 dataview 只保留：

```text
@shared/delta
@shared/projection
dataview domain projection specs
```

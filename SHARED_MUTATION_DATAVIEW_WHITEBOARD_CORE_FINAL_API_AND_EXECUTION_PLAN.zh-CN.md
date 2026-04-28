# Shared Mutation / Dataview Core / Whiteboard Core 最终 API 与实施方案

## 范围与目标

本文档只定义本轮实现边界：

- 完成 `@shared/mutation`
- 完成 `dataview-core`
- 完成 `whiteboard-core`
- projection 暂时不纳入本轮落地

本轮最终目标固定为：

```text
intent
  -> MutationEngine.compile
  -> concrete op batch
  -> MutationEngine.reduce
  -> document + MutationDelta + inverse op history + footprint + issues
```

本轮结束后，projection 只允许把 `MutationDelta` 作为标准 mutation 输入；但 projection 本身的运行时、phase、plan、trace 接缝，统一延后到下一轮整体处理。

## 硬约束

- 不做兼容。
- 不保留过渡层。
- 不新增 adapter。
- 不保留 old publish / old trace / old impact 架构的桥接代码。
- 不允许为了“先跑通”继续让上层 parse op type、parse footprint、diff document 来补 delta。
- 不允许在 dataview / whiteboard 上层继续自定义 shared 已经应该承接的基础能力。
- 不要求阶段之间代码始终可运行；只要求本轮全部完成后整体跑通。

## 本轮不做

- 不重写 `@shared/projection`
- 不重写 dataview active projection
- 不重写 whiteboard editor-scene / render projection
- 不处理 runtime trace 最终形态
- 不处理 `MutationDelta -> projection scope` 的最终 plan API

这些内容只保留一个硬边界：

- mutation 向外只提交标准 `MutationCommit`
- projection 未来只能消费 `commit.delta`

## 最终分层

### `@shared/mutation`

职责固定为：

- 持有 document
- compile intent
- reduce concrete op
- 维护 rev / commit stream
- 生成 `MutationDelta`
- 生成 inverse op history
- 生成 footprint
- 生成 issue

不负责：

- publish
- projection
- render
- surface patch
- runtime trace

### `dataview-core`

职责固定为：

- 定义 dataview intent
- 定义 dataview concrete op
- 定义 canonical entity spec
- 定义 dataview custom op reduce
- 保证所有 dataview mutation 语义完整表达为 `MutationDelta`

不负责：

- active publish
- projection impact
- trace 协议
- 从 mutation 侧派生 projection dirty scope

### `whiteboard-core`

职责固定为：

- 定义 whiteboard intent
- 定义 whiteboard concrete op
- 定义 canonical entity spec
- 定义 whiteboard custom op reduce
- 保证所有 whiteboard mutation 语义完整表达为 `MutationDelta`

不负责：

- render invalidation
- scene projection
- selection / hover / viewport runtime trace
- 从 footprint 反推 render scope

## 最终数据合同

### `MutationEngine`

唯一 constructor 固定为：

```ts
import { MutationEngine } from '@shared/mutation'

const engine = new MutationEngine({
  document,
  normalize,
  services,
  entities,
  custom,
  compile,
  history
})
```

字段固定含义：

- `document`: 初始持久化 document
- `normalize`: commit 后 document 规范化
- `services`: 领域服务
- `entities`: 真实持久化实体 spec
- `custom`: 复杂领域 op reduce 表
- `compile`: intent lowering 表
- `history`: history 策略

### `MutationEngine` public surface

固定为：

```ts
engine.current(): { rev: number; document: Doc }
engine.document(): Doc
engine.read<T>(reader: (document: Doc) => T): T
engine.execute(intentOrIntents, options?): MutationResult
engine.apply(opOrOps, options?): MutationResult
engine.replace(document, options?): MutationReplaceResult
engine.subscribe(listener: (commit: MutationCommit<Doc, Op>) => void): () => void
engine.watch(listener: (current: { rev: number; document: Doc }) => void): () => void
engine.history: HistoryPort<MutationResult>
```

规则固定：

- `execute` 接受单个 intent 或 intent 数组
- `apply` 接受单个 op 或 op 数组
- 不存在 `executeMany`
- 不存在 `applyMany`
- 不存在 `publish`
- 不存在 `commits` 特殊接口
- 不存在 `doc()`

### `MutationCommit`

apply commit 固定为：

```ts
type MutationCommit<Doc, Op> = {
  kind: 'apply'
  rev: number
  at: number
  origin: 'user' | 'remote' | 'system' | 'history'
  document: Doc
  forward: readonly Op[]
  inverse: readonly Op[]
  delta: MutationDelta
  footprint: readonly MutationFootprint[]
  issues: readonly MutationIssue[]
  outputs: readonly unknown[]
}
```

replace commit 固定为：

```ts
type MutationReplaceCommit<Doc> = {
  kind: 'replace'
  rev: number
  at: number
  origin: 'user' | 'remote' | 'system' | 'history'
  document: Doc
  delta: {
    reset: true
  }
  issues: readonly MutationIssue[]
}
```

### `MutationDelta`

运行时 delta 固定为结构化语义事实：

```ts
type MutationDelta = {
  reset?: true
  changes?: Record<string, MutationChange>
}

type MutationChange =
  | true
  | readonly string[]
  | {
      ids?: readonly string[] | 'all'
      paths?: Record<string, readonly string[] | 'all'>
      order?: true
      [payload: string]: unknown
    }
```

规则固定：

- delta 是 mutation 到 projection 的唯一共享事实
- delta 必须直接由 engine/core 产出
- projection 后续不得重新发明 trace-based mutation protocol
- footprint 只服务 history/conflict
- issue 只服务 compile/reduce 结果表达

## `entities` 最终 API

`entities` 只声明真实 document 实体，禁止为了套通用 spec 引入伪实体。

```ts
const entities = {
  node: {
    kind: 'table',
    members: {
      type: 'field',
      position: 'field',
      size: 'field',
      rotation: 'field',
      groupId: 'field',
      owner: 'field',
      locked: 'field',
      data: 'record',
      style: 'record'
    },
    change: {
      geometry: ['position', 'size', 'rotation'],
      list: ['groupId', 'owner'],
      value: ['type', 'locked'],
      data: ['data.**'],
      style: ['style.**']
    }
  }
} as const
```

规则固定：

- `kind` 只保留 `'table' | 'singleton'`
- `members` 只保留 `'field' | 'record'`
- `record` 不再声明额外 `scope`
- canonical family 固定由 engine 自动生成：
  - `<entity>.create`
  - `<entity>.patch`
  - `<entity>.delete`
- canonical patch 的 apply / inverse / merge / empty / touched / footprint / plain change 映射全部由 engine 内建

### `change`

简单稳定映射使用 plain object：

```ts
change: {
  route: ['route.kind', 'route.points.**'],
  labels: ['labels.**'],
  style: ['style.**']
}
```

复杂语义使用函数：

```ts
change: ({ entity, before, after, changed, operation }) => ({
  changes: {
    'node.owner': {
      ids: [entity.id]
    },
    'mindmap.owner': {
      ids: [before?.owner?.id, after?.owner?.id].filter(Boolean)
    }
  }
})
```

硬约束：

- 不允许为了全 spec 化而损失领域语义
- 不允许把复杂 op 拆成多段低层 patch 只为了走 canonical entity patch
- 不允许依赖外部 parse 或 document diff 补 complex delta

## `custom` 最终 API

复杂领域操作保留 custom op，不下沉领域语义，只下沉 reduce 框架。

```ts
const custom = {
  'mindmap.topic.move': {
    reduce: ({ op, document, services, issue }) => ({
      document,
      inverse: [],
      delta: {
        changes: {
          'mindmap.structure': {
            ids: [op.mindmapId],
            topicIds: [op.topicId]
          }
        }
      },
      footprint: [],
      issues: []
    })
  }
} as const
```

规则固定：

- custom op 可以有复杂领域 reduce
- custom op 直接返回完整 `document + inverse + delta + footprint + issues`
- inverse 是 op-based，不是 diff-based
- history 基于 op，不基于 document diff
- custom op 不得把 projection 语义塞进 mutation

## compile 最终 API

compile 只做 intent -> concrete op lowering。

```ts
const compile = {
  'node.move': ({ intent, emit, read, services, fail }) => {
    emit({
      type: 'node.patch',
      id: intent.id,
      patch: {
        position: intent.position
      }
    })
  }
}
```

规则固定：

- compile 不负责 publish
- compile 不负责 projection
- compile helper 不继续外露为上层组装层
- compile loop 由 `MutationEngine` 内建
- typed dispatch 必须直接由 shared/mutation 承接，禁止 `as never`

## dataview-core 最终目标

本轮结束时，dataview-core 必须满足：

- 删除旧 `dataviewReduceSpec`
- 删除旧 `createDataviewCompileScope`
- 删除旧 trace-based mutation spec
- 所有 dataview intent 通过 shared compile contract lowering
- 所有 dataview concrete op 通过 canonical entity spec 或 custom reduce 落地
- 所有 dataview mutation 语义直接体现在 `MutationDelta`

必须覆盖的 dataview 语义：

- record create / patch / delete / reorder
- field create / patch / delete / reorder
- value write / clear / restore
- view create / patch / delete
- view query / layout / calculation 变更
- active view 切换
- external/version 类 mutation 语义

落地原则：

- 能用 canonical entity spec 的必须用 canonical
- 涉及复杂 before/after 语义、聚合语义、restore 语义的必须用 custom
- `trace`、`impact`、`commit impact` 不再作为 mutation 公共协议

## whiteboard-core 最终目标

本轮结束时，whiteboard-core 必须满足：

- 删除旧 reducer-spec / publish-spec 依赖
- 删除 old trace-based mutation finalize 接缝
- 所有 whiteboard intent 通过 shared compile contract lowering
- 所有 whiteboard concrete op 通过 canonical entity spec 或 custom reduce 落地
- 所有 whiteboard mutation 语义直接体现在 `MutationDelta`

必须覆盖的 whiteboard 语义：

- node / edge / group / mindmap / canvas / document 根实体变更
- create / patch / delete / reorder
- graph relation 变化
- edge route / label / mask / style 变化
- group ownership / hierarchy 变化
- mindmap structure / topic move / branch / collapse / layout-request 类 mutation 语义

落地原则：

- 复杂 graph / mindmap 规则保留 custom op
- 不为了 spec 化引入伪实体
- 不通过 reducer impact / render invalidation 反推 mutation delta

## 分阶段实施

### Phase 1. 收口 `@shared/mutation`

必须完成：

- 删除旧 `publish` 架构入口
- 删除旧 operation reducer constructor 外露
- compile loop 下沉到 `MutationEngine`
- history runtime 完全内建
- issue 合同下沉到 shared
- canonical entity patch 内建 apply / inverse / merge / empty / touched / footprint / change
- typed dispatch 收口，消灭上层 `as never`
- 收紧 public export，删除不该给上层直接组装的 helper

阶段产物：

- `@shared/mutation` 成为唯一 mutation runtime
- 上层只传 `document / normalize / services / entities / custom / compile / history`

### Phase 2. dataview-core 接入 shared 最终态

必须完成：

- 删除旧 mutation spec / reduce spec / compile scope 体系
- 把 dataview concrete op 全量迁移到 canonical entity + custom reduce
- 统一 dataview delta 语义 key
- 统一 dataview inverse op 生成
- 删除 mutation 层 trace / impact 协议

阶段产物：

- dataview-core 只对外暴露 intent、op、entities、custom、compile
- dataview-engine 后续只需吃 commit/delta，不再依赖旧 mutation internals

### Phase 3. whiteboard-core 接入 shared 最终态

必须完成：

- 删除旧 reducer spec / finalize trace / publish 接缝
- 把 whiteboard concrete op 全量迁移到 canonical entity + custom reduce
- 统一 whiteboard delta 语义 key
- 统一 whiteboard inverse op 生成
- 移除 mutation 层 render invalidation/impact 协议

阶段产物：

- whiteboard-core 只对外暴露 intent、op、entities、custom、compile
- whiteboard-engine / editor-scene 后续只需吃 commit/delta

### Phase 4. 清理未完成的旧接缝

必须完成：

- 删除 dataview/whiteboard 中仍引用旧 mutation publish/trace/impact 的 core 侧代码
- 删除只为兼容旧 engine wrapper 存在的中间层
- 删除重复 helper、重复类型、重复 compile/runtime glue
- 确认 projection 之外不再有 mutation 协议分叉

阶段产物：

- mutation 主链路只剩一条：
  `shared/mutation -> dataview-core / whiteboard-core`

## 验收标准

全部阶段完成后，必须同时满足：

- `@shared/mutation` 是唯一 mutation runtime
- dataview-core 不再依赖旧 trace/impact/reduce-spec/compile-scope
- whiteboard-core 不再依赖旧 trace/finalize/publish-spec
- mutation commit 的唯一共享事实是 `MutationDelta`
- history 始终是 op-based
- complex domain op 语义没有因通用化而退化
- 没有兼容层、桥接层、中间层、adapter、re-export façade

## 本文档的实施地位

本文档是接下来实现 `shared/mutation -> dataview-core -> whiteboard-core` 的唯一依据。

如果现有代码、旧文档、旧 typecheck、旧 wrapper 与本文档冲突，统一以本文档为准，直接重写，不做兼容。

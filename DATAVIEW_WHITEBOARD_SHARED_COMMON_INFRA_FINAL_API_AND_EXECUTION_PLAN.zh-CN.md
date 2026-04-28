# Dataview / Whiteboard Shared Common Infra 最终 API 与实施方案

## 最终结论

本轮最终目标固定为：`MutationEngine` 接收 intent，产出 concrete op、document、结构化 `MutationDelta`、op-based history 与 canonical footprint；projection 接收 `MutationDelta + runtime trace + document`，产出 projection state 与 render/surface patch。

长期最优不是把所有领域能力都 spec 化。最终边界固定为：

- 标准实体写入、patch apply、inverse、empty、merge、footprint、基础 delta 必须下沉到 `shared/mutation`。
- 复杂领域操作必须保留 custom op，例如 `mindmap.topic.move`、`canvas.delete`、`field.option.setOrder`。
- custom op 的领域语义不下沉，custom reduce 的执行框架、history 存储、undo/redo 调度、footprint 冲突、issue 合同下沉。
- mutation delta 只表达持久化语义变化；projection fanout、layout reconcile、render patch 属于 projection。
- footprint 只服务 history/conflict；projection 禁止从 footprint 推 dirty scope。
- runtime trace 只表达非持久化输入，例如 selection、hover、preview、viewport、measure、clock；mutation 禁止把这些写进 delta。
- 通用 spec 不能导致现有 dataview / whiteboard 语义退化；spec 表达不了的地方必须使用函数。

`entities.<family>.delta` 不作为最终 API 名称。最终命名固定为 `entities.<family>.change`，因为它是“实体成员变更到 semantic change key 的映射规则”；运行时输出才叫 `delta`。

## 最终架构

数据流固定为：

```ts
intent
  -> MutationEngine.compile
  -> concrete op batch
  -> MutationEngine.reduce
  -> document + MutationDelta + footprint + history entry
  -> Projection.update({ document, delta, runtime })
  -> projection phases
  -> surface family/value patches
```

`MutationEngine` 不再接收 `publish`。dataview active publish、whiteboard editor scene、render layer 都是 projection runtime。engine 只负责 mutation 事实，不负责派生视图。

## `@shared/mutation` 最终 API

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

字段含义固定：

- `document`: 初始持久化 document。
- `normalize`: 每次 commit 后统一规范化 document。
- `services`: 领域服务、id 生成、registry、校验服务。
- `entities`: 真实持久化根实体声明。
- `custom`: 复杂领域 concrete op reduce 声明。
- `compile`: intent 到 concrete op 的 lowering 表。
- `history`: 只允许配置 capacity 与捕获 origin；不允许注入 history runtime、serializeKey、conflicts。

`MutationEngine` public surface 固定为：

```ts
engine.current(): { rev: number; document: Doc }
engine.document(): Doc
engine.read<T>(read: (document: Doc) => T): T
engine.execute(intentOrIntents, options?): MutationResult
engine.apply(opOrOps, options?): MutationResult
engine.replace(document, options?): MutationReplaceResult
engine.subscribe(listener: (commit: MutationCommit<Doc, Op>) => void): () => void
engine.watch(listener: (current: { rev: number; document: Doc }) => void): () => void
engine.history: HistoryPort<MutationResult>
```

其中 `history` 是正式公开能力，负责 `undo / redo / clear / sync`，不允许外界注入自定义 history runtime。

`execute` 与 `apply` 均接受单个输入或数组；不再存在 `executeMany` / `applyMany`。

`MutationResult` 固定携带 commit：

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

`replace` 产生 `kind: 'replace'` commit，并固定携带 `delta: { reset: true }`。

issue public shape 固定为：

```ts
type MutationIssue = {
  code: string
  message: string
  severity: 'error' | 'warning'
  path?: string
  details?: unknown
}
```

## Entity Spec

`entities` 只声明真实持久化根实体。禁止为了 canonical 化引入伪实体。

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

- `kind: 'table'` 表示有 id 的实体表。
- `kind: 'singleton'` 表示 document root 一类单例实体。
- `field` 表示原子替换单元，不要求是 primitive；`Point`、`Size`、`EdgeEnd`、`NodeOwner` 都是合法 `field`。
- `record` 表示 path-aware 嵌套结构。
- `record` member 的 key 本身就是 scope；不再写 `{ kind: 'record', scope: 'data' }`。
- canonical op family 由 engine 自动生成，固定为 `<entity>.create`、`<entity>.patch`、`<entity>.delete`。
- canonical create/delete 的 inverse 由 engine 基于实体 snapshot 自动生成。
- canonical patch 的 apply、inverse、merge、empty、path touched、footprint、semantic change 由 engine 基于 `members + change` 自动生成。

path selector 语法固定：

```text
PathSelector ::= member | member "." segment ("." segment)*
segment ::= literal | "*" | "**"
```

匹配规则固定：

- `*` 匹配单段。
- `**` 只允许出现在末尾，匹配任意后代路径。
- `field` member 只能用 member 精确 selector。
- `record` member 允许 member、`member.*`、`member.**`、`member.*.child.**`。
- change path 与 selector 使用双向 overlap 判断；父路径替换和子路径写入都必须命中。

## Entity Change 的平衡点

`change` 默认使用 plain object。plain object 只覆盖“成员/path 到 semantic change key”的稳定映射。

```ts
change: {
  route: ['route.kind', 'route.points.**'],
  labels: ['labels.**'],
  style: ['style.**']
}
```

上面规则产出的 runtime key 固定为 `edge.route`、`edge.labels`、`edge.style`。

当 semantic change 依赖 before/after、图关系、聚合不变量或需要附带领域 payload 时，`change` 必须使用函数：

```ts
change: ({ entity, operation, before, after, changed }) => ({
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

- 不允许为了保持 plain object 而丢失 previous owner、connected edge、active view、mindmap structure 这类语义。
- 不允许通过 parse op type、parse footprint、document diff 兜底补 delta。
- 不允许把复杂领域操作拆成多个低层 patch 只为了走 entity spec。
- 函数是长期 API 的一部分，不是过渡层。

## MutationDelta

运行时 delta 必须是结构化事实，不允许是 `string[]`。

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

canonical entity lifecycle 与 order 也使用 semantic key：

```ts
delta: {
  changes: {
    'node.create': [nodeId],
    'node.geometry': {
      ids: [nodeId],
      paths: {
        [nodeId]: ['position']
      }
    },
    'edge.labels': [edgeId],
    'canvas.order': true
  }
}
```

`MutationDeltaInput` 接受同一结构，并允许 `ids` shorthand；engine 在 commit 前统一 normalize 成 `MutationDelta`。

语义固定：

- `changes` 是唯一 runtime change map。
- key 使用清晰字符串，例如 `node.create`、`node.geometry`、`edge.labels`、`mindmap.structure`、`canvas.order`、`external.version`。
- lifecycle 不再有独立 `update` 层；具体 semantic key 天然表示 touched。
- `order` 表示该 semantic list 的稳定顺序变化。
- `paths` 保存 canonical member path，例如 `data.widthMode`、`style.fontSize`、`members.topic_1.branchStyle.color`。
- `MutationDelta` 是 mutation 到 projection 的唯一输入事实。

engine 必须在 commit 前 normalize delta：

- 合并同 key 的重复 id。
- 合并同 key + id 的重复 path。
- `delete` key 覆盖同 id 的普通 semantic key，但不删除 projection 必须保留的 payload。
- 空 change 删除。
- 空 `changes` 删除。

## Custom Op

custom op 是一等公民，不能被 canonical op 取代。

```ts
const custom = {
  'mindmap.topic.move': {
    reduce: ({ op, document, services, fail }) => {
      const result = reduceMindmapTopicMove({
        document,
        op,
        services,
        fail
      })

      return {
        document: result.document,
        delta: {
          changes: {
            'mindmap.structure': {
              ids: [op.id],
              topicIds: result.affectedTopicIds
            }
          }
        },
        footprint: result.footprint,
        history: {
          forward: [op],
          inverse: [result.inverse]
        }
      }
    }
  }
} as const
```

custom reduce 返回值固定为：

```ts
type CustomReduceResult<Doc, Op> = {
  document?: Doc
  delta?: MutationDeltaInput
  footprint?: readonly MutationFootprintInput[]
  history?: false | {
    forward?: readonly Op[]
    inverse: readonly Op[]
  }
  outputs?: readonly unknown[]
  issues?: readonly MutationIssue[]
}
```

规则固定：

- custom reduce 可以直接返回 next document；不强制通过 canonical patch 表达复杂逻辑。
- custom reduce 必须显式返回 `delta`，除非该 op 明确是 no-op。
- history-tracked custom 必须显式返回 `history.inverse`。
- `history.forward` 省略时，engine 使用当前 concrete op；当前 op 不是可重放 concrete op 时必须显式返回 `forward`。
- `restore` / `move` / `reorder` 这类 inverse custom op 是合法且必须保留的能力。
- snapshot 必须在首次 reduce 时 capture 进 inverse op payload；undo/redo 禁止重新 diff document。
- delta-only custom 必须标记 `history: false`，不生成 history entry。
- custom 的 footprint 必须来自 reduce 结果或 custom footprint 函数；禁止 engine 对 custom 做 document diff。

## History 与 Footprint

history 固定基于 op batch，不基于 document diff。

```ts
type MutationHistoryEntry<Op> = {
  forward: readonly Op[]
  inverse: readonly Op[]
  delta: MutationDelta
  footprint: readonly MutationFootprint[]
}
```

undo 回放 `inverse`，redo 回放 `forward`。history 回放走同一套 reduce pipeline，origin 固定为 `history`，且不产生新的 history entry。

`MutationFootprint` 固定为 shared canonical plain object：

```ts
type MutationFootprint =
  | { kind: 'global'; family: string }
  | { kind: 'entity'; family: string; id: string }
  | { kind: 'field'; family: string; id: string; field: string }
  | { kind: 'record'; family: string; id: string; scope: string; path: string }
  | { kind: 'relation'; family: string; id: string; relation: string; target?: string }
```

规则固定：

- canonical entity op 的 footprint 由 entity spec 自动生成。
- custom op 的 footprint 由 custom reduce 或 custom footprint 函数显式产出。
- shared 内建 conflict 规则；domain 不再传 `serializeKey`、`key`、`conflicts`。
- `relation` 用于 connected edge、owner、mindmap membership、field/value 交叉索引这类真实冲突域。
- footprint 不进入 projection plan。

## Compile

compile 最终是 plain object handler table：

```ts
const compile = {
  'node.move': ({ intent, document, services, emit, output, fail }) => {
    emit({
      type: 'node.patch',
      id: intent.id,
      patch: {
        position: intent.position
      }
    })
  },
  'mindmap.topic.move': ({ intent, emit }) => {
    emit({
      type: 'mindmap.topic.move',
      id: intent.mindmapId,
      input: intent.input
    })
  }
} as const
```

规则固定：

- compile loop 下沉到 engine。
- compile 每处理一个 intent，engine 在内部 working document 上 apply 已 emit 的 concrete ops。
- compile handler 读到的是 working document。
- compile 负责生成 concrete op，包括 id、slot、可重放 payload。
- compile 不 capture inverse snapshot；inverse snapshot 在 reduce/apply 执行时 capture。
- domain 不再传 `compile.createContext`、`compile.apply`、compile facade。

## Projection Handoff

projection update 输入固定为：

```ts
projection.update({
  document: commit.document,
  delta: commit.delta,
  runtime: {
    selection,
    hover,
    edit,
    preview,
    viewport,
    measure,
    clock
  }
})
```

projection 的职责固定：

- 从 `MutationDelta` 读取 persistent dirty facts。
- 从 `runtime` 读取 UI / session / measurement dirty facts。
- 在 plan 阶段把二者合并成 phase scope。
- 在 phase 阶段执行 graph、index、active、layout、render reconcile。
- 在 surface sync 阶段按 field/family changed 短路。

`shared/projection` 最终必须支持 field changed declaration：

```ts
surface: {
  graph: {
    nodes: {
      kind: 'family',
      read: (state) => state.graph.nodes,
      changed: {
        keys: [
          'node.create',
          'node.delete',
          'node.geometry',
          'node.content',
          'node.owner',
          'node.order'
        ]
      }
    }
  }
}
```

复杂 projection fanout 必须保留函数：

```ts
plan: ({ delta, runtime, state }) => {
  return planWhiteboardScene({
    delta,
    runtime,
    graph: state.graph
  })
}
```

规则固定：

- projection 不解析 op。
- projection 不解析 footprint。
- projection 不从 document diff 兜底。
- render patch 由 projection phase 产出，不由 mutation 产出。
- `mindmap.reconcile` 是 projection phase，不是 mutation reduce 的一部分。

## Dataview 最终形态

dataview 根实体固定为：

- `document`
- `record`
- `field`
- `view`

dataview 禁止拆出的伪实体：

- `fieldOption`
- `viewFilter`
- `viewSort`
- `viewGroup`
- `recordValue`

嵌套结构继续留在根实体内：

- `field.options`
- `view.search`
- `view.filter`
- `view.sort`
- `view.calc`
- `view.display`
- `view.orders`
- `view.group`
- `view.options`
- `record.values`

dataview 必须保留 custom：

- `record.fields.writeMany`
- `record.fields.restoreMany`
- `field.replace`
- `field.setKind`
- `field.duplicate`
- `field.option.create`
- `field.option.setOrder`
- `field.option.patch`
- `field.option.remove`
- `view.open`
- `external.version.bump`

原因固定：

- record value 批量写入需要保留按 record/field 的精确 value delta。
- field kind 转换会影响 schema、record values、active projection。
- field option 顺序是嵌套集合顺序语义，不是普通 field patch。
- active view 与 external version 是领域 semantic change，不是单实体 patch。

dataview projection 迁移后：

- document delta 由 `MutationDelta` 直接生成，不再维护 `documentDelta.ts` 的二次推导。
- active/index projection 继续保留领域算法，但输入改为 `MutationDelta + plan cache`。
- `CommitImpact` 保留为 custom reduce 内部语义来源；最终输出必须归一到 `MutationDelta`。

## Whiteboard 最终形态

whiteboard 根实体固定为：

- `document`
- `node`
- `edge`
- `group`
- `mindmap`

whiteboard 禁止拆出的伪实体：

- `canvasItem`
- `edgeLabel`
- `edgeRoutePoint`
- `mindmapMember`

嵌套结构继续留在根实体内：

- `document.canvas.order`
- `edge.labels`
- `edge.route.points`
- `mindmap.members`
- `mindmap.children`
- `mindmap.layout`
- `mindmap.meta`

whiteboard 必须保留 custom：

- `document.insert`
- `canvas.delete`
- `canvas.duplicate`
- `canvas.selection.move`
- `canvas.order.move`
- `node.move`
- `node.text.commit`
- `node.align`
- `node.distribute`
- `node.deleteCascade`
- `node.duplicate`
- `group.merge`
- `group.order.move`
- `group.ungroup`
- `edge.move`
- `edge.reconnect.commit`
- `edge.label.insert`
- `edge.label.patch`
- `edge.label.move`
- `edge.label.delete`
- `edge.route.point.insert`
- `edge.route.point.patch`
- `edge.route.point.move`
- `edge.route.point.delete`
- `edge.route.clear`
- `mindmap.create`
- `mindmap.restore`
- `mindmap.delete`
- `mindmap.move`
- `mindmap.layout`
- `mindmap.topic.insert`
- `mindmap.topic.restore`
- `mindmap.topic.move`
- `mindmap.topic.delete`
- `mindmap.topic.clone`
- `mindmap.topic.patch`
- `mindmap.topic.collapse`
- `mindmap.branch.patch`

原因固定：

- canvas、group、edge route、edge label 都包含顺序语义。
- node move 会影响 connected edge、group、mindmap owner。
- mindmap topic 操作维护 `members / children / nodes / connected edges` 聚合不变量。
- `mindmap.topic.move` 这类 public op 的价值就是一个领域动作，禁止扁平化成多段 patch。

mindmap layout 最终边界固定：

- mutation 只保存 mindmap 聚合输入与用户持久化字段。
- root topic 的 `node.position` 是持久化输入，`mindmap.move` 只修改 root position。
- 非 root topic 的 `node.position` 是 projection-owned 派生结果，禁止作为 canonical document mutation 写入，普通 `node.patch` 也不能修改它。
- topic 的 `node.size` 是持久化 layout input，文本提交、显式 resize、测量提交可以修改它。
- layout reconcile 不能把 computed rect 的 `x/y/width/height` 反写到 document；它只能产出 projection layout rect。
- `mindmap.structure`、`mindmap.layoutSpec`、`mindmap.branchStyle` 进入 `MutationDelta`。
- topic layout rect、bbox、connectors、render geometry 由 projection 的 `mindmap.reconcile` 产出。
- 当前 reducer 中 apply operations 后 flush layout request 并写回 topic position/size 的路径必须移除；新的 flush 只能发出 `mindmap.structure/layoutSpec/branchStyle` dirty fact，不能修改 node geometry。
- export、hit-test、selection、edge routing 必须读取 projection graph/layout 结果，不能退回读取 mutation document 中的派生 layout。

## 实施方案

### Phase 1. 重写 `shared/mutation` public contract

必须完成：

- `MutationEngine` constructor 改为 `{ document, normalize, services, entities, custom, compile, history }`。
- 删除 public `key`、`operations`、`reduce`、`publish`、`compile.createContext`、`compile.apply`。
- commit 结构加入 `delta`，并把 `doc` 字段命名统一为 `document`。
- issue 统一为 `MutationIssue` plain object。
- `execute/apply` 支持单个或数组输入。

### Phase 2. Entity spec compiler 与 canonical op

必须完成：

- 编译 `entities.members`。
- 编译 `entities.change` plain object path matcher。
- 支持 `entities.change` 函数。
- 自动生成 `<entity>.create`、`<entity>.patch`、`<entity>.delete`。
- patch apply / inverse / empty / merge / touched 全部下沉。
- canonical footprint 与 canonical delta 自动生成。

### Phase 3. Custom reduce runtime

必须完成：

- custom reduce 直接返回 `document + delta + footprint + history + outputs + issues`。
- history-tracked custom 强制返回 inverse op。
- delta-only custom 显式 `history: false`。
- undo/redo 固定回放 stored op batch。
- 删除 custom 内部手写 history controller、inverse stack facade、operation runtime constructor。

### Phase 4. Footprint conflict 下沉

必须完成：

- `MutationFootprint` canonical plain object 下沉到 shared。
- 内建 conflict 规则覆盖 `global/entity/field/record/relation`。
- dataview 删除 mutation key codec。
- whiteboard 删除 `serializeHistoryKey` 与 `historyKeyConflicts`。
- custom 只产出 footprint fact，不实现 conflict 算法。

### Phase 5. Delta 到 projection 的接缝

必须完成：

- engine commit 暴露 normalized `MutationDelta`。
- dataview publish projection 改为订阅 commit 并读取 `MutationDelta`。
- whiteboard editor scene projection 改为读取 `MutationDelta + runtime`。
- 删除从 trace/document diff 二次生成 document delta 的兜底路径。
- 删除 projection 从 op/footprint parse dirty scope 的路径。

### Phase 6. `shared/projection` surface changed 下沉

必须完成：

- surface value/family field 支持声明式 `changed`。
- family surface 支持从 `MutationDelta` 直接生成 id patch。
- phase scope 支持从 semantic change key 与 runtime trace 合并。
- 保留复杂 `plan(...)` 函数用于 graph fanout、active view、mindmap reconcile。
- render statics / labels / masks 保持 semantic key / edge 级 patch，不回退为整 family replace。

### Phase 7. Dataview 接入最终态

必须完成：

- 只保留 `dataviewEntities`、`dataviewCustom`、`dataviewCompile`。
- 删除 compile facade、issue facade、operation runtime glue。
- record/field/view 标准写入改成 canonical entity op。
- field option、field replace、record fields writeMany、active view 保留 custom。
- active/index/document projection 输入统一为 `MutationDelta`。

### Phase 8. Whiteboard 接入最终态

必须完成：

- 只保留 `whiteboardEntities`、`whiteboardCustom`、`whiteboardCompile`。
- 删除 `node/update.ts` 与 reducer 内标准 patch inverse 样板。
- node/edge/group 标准写入改成 canonical entity op。
- canvas、edge label、edge route、group、mindmap 保留 custom。
- mindmap layout reconcile 从 mutation reducer 移到 projection phase；非 root topic position 不再写回 document，topic size 继续作为持久化 layout input。
- editor scene graph/render patch 输入统一为 `MutationDelta + runtime`。

### Phase 9. 删除中间层与验收

必须完成：

- 删除所有 `draft.record.*` 的 domain 显式调用。
- 删除所有 `nodePatch`、`edgePatch`、patch runtime 常量。
- 删除所有 `compileXXXSpec`、`createOperationReducer`、operation runtime constructor。
- 删除所有 publish spec。
- 删除所有从 string delta、op type、footprint、document diff 兜底推 projection dirty 的代码。
- 全量 typecheck 与 dataview / whiteboard 测试在所有阶段完成后统一执行。

## 最终验收标准

全部完成后必须满足：

1. `MutationEngine` 是唯一 mutation public entry。
2. `MutationDelta` 是 mutation 到 projection 的唯一持久化变化事实。
3. `entities.change` plain object 覆盖标准 create/patch/delete；复杂语义使用函数或 custom reduce。
4. dataview / whiteboard 不再手写标准 patch apply、inverse、merge、empty、touched。
5. dataview / whiteboard 不再自建 key codec、conflict callback、operation runtime、compile facade、issue facade、publish spec。
6. history 基于 concrete op batch；custom inverse 使用 explicit inverse op，不使用 document diff。
7. footprint 只服务 history/conflict，不进入 projection。
8. projection 只消费 `MutationDelta + runtime trace + document`。
9. mindmap 不引入 `mindmapMember`，不牺牲当前 public op 语义。
10. render / active / scene 的增量更新不回退为 family replace 或 parse 兜底。

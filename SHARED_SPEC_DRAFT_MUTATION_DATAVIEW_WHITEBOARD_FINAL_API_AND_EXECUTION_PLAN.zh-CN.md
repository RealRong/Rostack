# Shared / Spec / Draft / Mutation / Dataview / Whiteboard 最终 API 与实施方案

## 范围

本文件只覆盖以下范围：

- `shared/spec`
- `shared/draft`
- `shared/mutation`
- `dataview/packages/dataview-core`
- `dataview/packages/dataview-engine`
- `whiteboard/packages/whiteboard-core`
- `whiteboard/packages/whiteboard-engine`
- `whiteboard/packages/whiteboard-editor`
- `whiteboard/packages/whiteboard-react`

本文件明确不覆盖：

- `shared/delta`
- `shared/projection`
- dataview / whiteboard trace runtime 下沉
- 一切直接依赖这两者的专项重构

`shared/delta` 与 `shared/projection` 暂时冻结，不在本轮实施计划内。dataview / whiteboard 的 trace、impact、projection runtime 与这两块强耦合，也一并冻结。它们相关的 wrapper、runtime facade、family adapter 只登记为“后续专项处理”，不纳入本文件的执行范围。

## 硬约束

本轮设计与实施必须满足以下硬约束：

1. 不计成本，允许修改底层 op 形状。
2. 不保留兼容层、过渡层、adapter、re-export 同义层。
3. 不要求阶段之间代码可运行，只要求全部完成后一次性跑通。
4. 上层必须最大化直接声明 `spec + plain object + 字符串配置 + callback`。
5. shared 负责吸收 compile / reducer / key codec / record patch / typed dispatch 复杂度。
6. 上层不再维护自己的 compile loop、typed dispatch glue、path helper glue、issue facade。trace facade 若与 projection/runtime 强耦合，则并入后续专项统一处理。

## 结论

排除 `shared/delta` 与 `shared/projection` 之后，当前仍然妨碍长期最优的核心问题只剩六块：

| 编号 | 级别 | 问题 | 典型位置 | 最终动作 |
| --- | --- | --- | --- | --- |
| B1 | 高 | `shared/spec` 仍只是 primitive index 工具，不能直接承载上层 canonical spec compile | `shared/spec/src/index.ts` `whiteboard/packages/whiteboard-editor/src/types/node/compile.ts` `whiteboard/packages/whiteboard-react/src/features/node/registry/compile.ts` | 必须补成最终编译入口，并删除上层二次 compile |
| B2 | 高 | `shared/draft` 仍把 `path` / `patch` 作为上层拼装原语公开，导致 whiteboard node/schema/update 退化为 path patch glue | `shared/draft/src/index.ts` `whiteboard/packages/whiteboard-core/src/node/update.ts` `whiteboard/packages/whiteboard-core/src/registry/schema.ts` | 必须改成字符串 key + plain object record write，`path` 退回 shared 内部 |
| B3 | 高 | `shared/mutation` 还没有收敛成单一 public constructor，compile/reduce/history 语义仍向上泄漏，compile issue 合同也没有完全下沉 | `shared/mutation/src/index.ts` `shared/mutation/src/engine.ts` `dataview/packages/dataview-engine/src/mutation/kernel.ts` `whiteboard/packages/whiteboard-engine/src/mutation/spec.ts` | 必须收敛成 `new MutationEngine(...)`，并把 compile issue plain object 合同固定在 shared |
| B4 | 高 | dataview 仍暴露 alias / compile facade / key facade / issue facade，engine 仍要自己拼 mutation kernel；trace facade 与 projection impact 强耦合 | `dataview/packages/dataview-core/src/operations/index.ts` `compile.ts` `issue.ts` `trace.ts` `key.ts` `dataview/packages/dataview-engine/src/createEngine.ts` | 本轮删除 compile/key/issue façade 与 kernel glue；trace 并入后续 projection 专项 |
| B5 | 高 | whiteboard core 仍靠 compile context、compile handler adapter、schema compile helper、generic field/record op glue 维持整条链路 | `whiteboard/packages/whiteboard-core/src/operations/compile*.ts` `registry/schema.ts` `node/update.ts` | 必须重写为精确 handler + 结构化 patch op，不再靠 path helper 和 adapter |
| B6 | 中 | editor/react 仍各自补 node spec compile wrapper，engine 顶层仍有 execute/apply 类型桥接 | `whiteboard/packages/whiteboard-editor/src/types/node/compile.ts` `whiteboard/packages/whiteboard-react/src/features/node/registry/compile.ts` `whiteboard/packages/whiteboard-engine/src/runtime/engine.ts` | 必须统一为一个 compiled node spec 与一个 mutation engine public API |

## 最终目标

全部完成后，整条链路必须满足：

1. shared 只公开真正可复用的 canonical API。
2. dataview 与 whiteboard 只声明领域 `operations`、`compile handlers`、`publish`、`history`、`services`。
3. 不再有 domain 自己维护的 compile loop。
4. 不再有 domain 自己维护的 reducer constructor / typed dispatch glue。
5. 不再有 `mutationPath.of(...)`、`compileDataUpdate(...)`、`compileStyleUpdate(...)` 这类 path/patch 中间 helper。
6. 不再有 `compileReactNodeSpec`、`compile = compileIntents`、`issue = { create, hasErrors }` 这类别名层。
7. dataview / whiteboard trace facade 与 impact helper 不在本轮硬删，统一并入 projection 专项后一次性收口。
8. 顶层 engine 直接调用 `new MutationEngine(...)`，不再自己拼 kernel/facade。

## 最终 API 设计

### 1. `@shared/spec`

`@shared/spec` 保留 root export，最终只保留两类 canonical 能力：

```ts
import { spec, key } from '@shared/spec'

const table = spec.table(nodeSpec)
const tree = spec.tree(schemaTree)

const tupleKey = key.tuple(['fieldId', 'mode', 'interval'] as const)
const taggedKey = key.tagged(['node', 'edge', 'group', 'mindmap'] as const)
const pathKey = key.path()
```

要求：

- `spec.table(...)` 是唯一的 table compile 入口。
- `spec.tree(...)` 是唯一的 tree compile 入口。
- `key.tuple(...)`、`key.tagged(...)`、`key.path()` 是唯一的 canonical key codec。
- 任何 domain 不再自己维护 `createBucketSpecKey`、`edge:${id}`、`splitDotKey`、`JSON.stringify` 业务 key。

上层允许做的事：

- 传入 plain object spec。
- 用 index 结果做 `get / has / resolve / project`。
- 用 codec 做 `write / read / conflicts`。

上层不允许做的事：

- 基于 `walkSpec(...)` 再自己做一层 compile。
- 基于 `spec.table(...)` 再额外套 `compileReactNodeSpec` 这类 wrapper。
- 再定义新的字符串 key 编码规范。

### 2. `@shared/draft`

`@shared/draft` 的最终公开面必须从“path/patch primitives”收缩为“结构写入与 record patch runtime”。

最终 root API：

```ts
import { draft } from '@shared/draft'

draft.record.read(target, 'data.widthMode')
draft.record.has(target, 'style.fontSize')

draft.record.apply(target, {
  'data.widthMode': 'wrap',
  'data.wrapWidth': 180,
  'style.fontSize': 20,
  'data.kind': undefined
})

draft.record.diff(current, next)
draft.record.inverse(current, {
  'data.widthMode': 'wrap',
  'style.fontSize': 20
})
```

要求：

- 上层永远只写字符串 key。
- 上层永远只写 plain object record write。
- `Path`、`PathKey`、`path.of(...)`、`patch.apply(...)` 退回 shared 内部实现。
- `shared/draft` 可以继续内部使用 path array，但不能要求上层参与。

上层不允许继续出现：

- `mutationPath.of(...)`
- `mutationPath.append(...)`
- `mutationRecord.apply(...)`
- `scope + path + value` 三件套再由上层拼装为 mutation

### 3. `@shared/mutation`

`@shared/mutation` 最终只公开一个 canonical class：

```ts
const engine = new MutationEngine({
  document,
  normalize,
  key: key.path(),
  services,
  operations,
  compile,
  trace,
  publish,
  history
})
```

其中：

```ts
const operations = {
  'record.put': {
    family: 'record',
    apply: ({ doc, inverse, trace }, op, services) => {}
  },
  'record.patch': {
    family: 'record',
    apply: ({ doc, inverse, trace }, op, services) => {}
  }
} as const

const compile = {
  'record.create': ({ intent, emit, issue, doc, services }) => {},
  'record.patch': ({ intent, emit, issue, doc, services }) => {}
} as const
```

要求：

- `MutationEngine` 是唯一 public 入口。
- `compile loop` 由 shared 内建。
- `operation reducer constructor` 由 shared 内建。
- `typed dispatch` 由 shared 内建。
- `working doc` 增量 apply 由 shared 内建。
- `issue / stop / block / source / output` 由 shared 内建。
- `history / publish` 由 shared 内建。
- `trace` 字段继续保留在 constructor 上，但 trace 语义下沉与 spec 化不纳入本轮。
- `key.serialize`、`key.conflicts` 统一来自传入 codec，而不是散落回调。

shared/mutation 不再公开：

- `CommandMutationEngine`
- `OperationMutationRuntime`
- `compileMutationIntents`
- `MutationCompileCtx`
- `MutationCompileHandlerTable`
- `MutationOperationsSpec`
- `createHistoryPort`
- 任何仅为 shared 内部装配服务的 helper type

shared/mutation 最终允许保留的公共类型：

- `MutationOrigin`
- `MutationResult`
- `MutationCommit`
- `MutationHistory`

除此之外的泛型 type 都必须内部化。

### 4. dataview 最终 API

dataview 不再公开 compile/apply/kernel façade，而只保留领域规则与最终 engine。

最终 `@dataview/core/operations` 不再是 facade 集合；只保留 canonical 领域模块：

```ts
export const dataviewIntentHandlers = { ... } as const
export const dataviewOperationTable = { ... } as const
export const dataviewKey = key.path()
```

必须删除：

- `compileIntents`
- `compile = compileIntents`
- `reduceDataviewOperations`
- `apply = reduceDataviewOperations`
- `spec`
- `dataviewMutationOperations`
- `issue = { create, hasErrors }`
- `parseDataviewTargetKey`

`dataview/packages/dataview-engine/src/createEngine.ts` 最终直接调用 shared：

```ts
const engine = new MutationEngine({
  document: options.document,
  normalize: doc => doc,
  key: key.path(),
  services: {
    performance
  },
  operations: dataviewOperationTable,
  compile: dataviewIntentHandlers,
  trace: dataviewTrace,
  publish: dataviewPublish,
  history: dataviewHistory
})
```

必须删除：

- `createDataviewMutationKernel`
- engine 顶层对 `CommandMutationEngine` 的显式泛型拼装
- `execute` 里的 `as readonly Intent[]` / `as Intent`

#### 4.1 issue 本轮直接下沉

`issue` 不需要 dataview 自定义 façade，本轮必须直接下沉到 shared compile issue 合同。

本轮固定方案：

1. dataview 只保留领域错误码字符串 union，不再保留 `issue.ts`。
2. `ValidationCode` 保留为 dataview 领域类型，但直接服务于 shared 的 compile issue plain object。
3. compile handler、validator、scope/report 直接产出 `MutationCompileIssue<ValidationCode, IntentType>`，不再经过 `createIssue(...)` 包装。
4. compile 期的报错、阻断、缺值判断统一直接走 shared 的 `issue / block / stop / require`。
5. `hasValidationErrors(...)` 删除；是否可执行由 shared compile result 或本地 `issues.some(...)` 直接判断，不再保留 dataview alias helper。
6. `operations/index.ts` 不再导出 `issue` 命名空间。

这意味着：

- 本轮允许保留 dataview 自己的错误码字符串集合。
- 本轮不允许再保留 dataview 自己的 issue constructor、issue namespace、issue error-check helper。
- dataview 对 compile issue 的参与只剩“声明领域 code”，不再参与“构建 shared issue 模型”。

#### 4.2 trace 延后到 projection 专项

`trace` 不在本轮下沉。

本轮固定边界：

1. `dataview/packages/dataview-core/src/operations/trace.ts` 与 `internal/impact.ts` 冻结。
2. `dataviewTrace` 继续作为现状 runtime 传给 mutation / active / performance。
3. 不在本轮拆 `has.viewQuery / has.fieldSchema / touchedIds / touchedCount` 这一层语义。
4. trace 的 spec 化、shared 下沉、selector/runtime 收口统一并入后续 projection 专项。

### 5. dataview active/index 最终 API

本轮不改 projection，但 dataview active/index 的 key/spec 仍然必须收口。

最终只保留一份 canonical bucket spec 定义：

```ts
export const bucket = {
  key: key.tuple(['fieldId', 'mode', 'interval'] as const),
  normalize(input): BucketSpec,
  same(left, right): boolean
} as const
```

要求：

- `active/index/bucket.ts`
- `active/index/demand.ts`
- `active/plan.ts`
- `active/query/*`

全部使用同一份 `bucket` canonical module。

必须删除：

- 多处重复的 `createBucketSpec(...)`
- 多处散落的 `bucketSpecKey.write(...)`
- `JSON.stringify` 生成 execution key 的逻辑，改为 shared key codec

最终 query execution key 必须改为：

```ts
const queryKey = key.tuple([
  'search',
  'filters',
  'filterMode',
  'sort',
  'orders'
] as const)
```

### 6. whiteboard core 最终 API

whiteboard core 必须从“compile context + schema compile helper + generic field/record op glue”改成“精确 handler + 结构化 patch op”。

#### 6.1 whiteboard intent compile

最终不再保留：

- `compile.ts`
- `compile-context.ts`
- `compile-handlers.ts`

最终只保留精确 intent key 对应的 plain object handler table：

```ts
export const whiteboardIntentHandlers = {
  'node.create': ({ intent, emit, issue, services, doc }) => {},
  'node.update': ({ intent, emit, issue, services, doc }) => {},
  'edge.create': ({ intent, emit, issue, services, doc }) => {},
  'mindmap.topic.clone': ({ intent, emit, issue, services, doc }) => {}
} as const
```

要求：

- 每个 handler 只处理一个精确 intent type。
- 不再按 `DocumentIntent | CanvasIntent | NodeIntent` 这种大 union 分组。
- 不再有 compile adapter 去吞掉 union output。
- 不再有 `createWhiteboardIntentContext(...)`。

#### 6.2 whiteboard operation 形状

whiteboard 底层 op 必须改。

当前这组 op：

- `node.field.set/unset`
- `node.record.set/unset`
- `edge.field.set/unset`
- `edge.label.field.set/unset`
- `edge.label.record.set/unset`
- `mindmap.topic.field.set/unset`
- `mindmap.topic.record.set/unset`

必须改成结构化 patch op。

最终 op 形状：

```ts
type WhiteboardOperation =
  | {
      type: 'node.patch'
      id: NodeId
      fields?: {
        position?: Point
        size?: Size
        rotation?: number
        groupId?: GroupId | undefined
        owner?: NodeOwner | undefined
        locked?: boolean
      }
      record?: Record<string, unknown>
    }
  | {
      type: 'edge.patch'
      id: EdgeId
      fields?: {
        source?: EdgeEnd
        target?: EdgeEnd
        type?: EdgeType
        groupId?: GroupId | undefined
        locked?: boolean
      }
      record?: Record<string, unknown>
    }
  | {
      type: 'edge.label.patch'
      edgeId: EdgeId
      labelId: string
      fields?: {
        text?: string | undefined
        t?: number | undefined
        offset?: number | undefined
      }
      record?: Record<string, unknown>
    }
  | {
      type: 'edge.route.point.patch'
      edgeId: EdgeId
      pointId: string
      fields?: {
        x?: number
        y?: number
      }
    }
  | {
      type: 'group.patch'
      id: GroupId
      fields?: {
        locked?: boolean
      }
    }
  | {
      type: 'mindmap.topic.patch'
      id: MindmapId
      topicId: NodeId
      fields?: {
        text?: string
        title?: string
        collapsed?: boolean | undefined
      }
      record?: Record<string, unknown>
    }
  | {
      type: 'mindmap.branch.patch'
      id: MindmapId
      topicId: NodeId
      fields?: {
        color?: string | undefined
        line?: string | undefined
      }
    }
```

要求：

- 所有 record 写入统一用字符串 key plain object。
- 所有 patch inverse 都由 shared/draft runtime 生成。
- 所有 footprint 收集基于结构化 patch，不再基于 field.set / record.set 拼接。

#### 6.3 whiteboard schema

`registry/schema.ts` 最终只保留：

- default materialization
- required field validation
- schema field metadata read
- bootstrap materialization

必须删除：

- `compileDataUpdate`
- `compileStyleUpdate`
- `compileFieldRecord`
- 一切“把业务输入编译成 path mutation”的 helper

schema 层最终只负责回答：

- 这个 type 的 schema 是什么
- 默认值是什么
- 缺了哪些 required field
- 一个 record write 是否合法

它不再负责“帮调用者生成 mutation op”。

#### 6.4 whiteboard node update

`node/update.ts` 最终不再处理 path mutation，而只处理结构 patch：

```ts
const patch = {
  fields: {
    position: { x, y },
    locked: true
  },
  record: {
    'data.widthMode': 'wrap',
    'style.fontSize': 18,
    'data.kind': undefined
  }
}
```

要求：

- `applyFieldPatch(...)` 删除。
- `buildFieldInverse(...)` 删除。
- `buildRecordInverse(...)` 改为基于 `draft.record.inverse(...)`。
- `NodeRecordMutation` 这种 path-based mutation type 删除。
- `NodeUpdateInput.records` 改为 plain object 记录写入，而不是 mutation 数组。

### 7. whiteboard engine / editor / react 最终 API

whiteboard 顶层所有 node spec compile wrapper 必须删光。

最终只保留一个 canonical compiler：

```ts
const compiledNodeSpec = compileNodeSpec(spec.nodes)
```

这个 `compileNodeSpec(...)` 不再是 whiteboard/editor 自己拼多个 table index 的 wrapper，而是 shared/spec 编译能力上的领域特化结果。

必须删除：

- `compileReactNodeSpec`
- react 再包一层 `entryByType + renderByType`
- editor/react 各自独立的 compiled node spec 形状

最终：

- editor 使用 `CompiledNodeSpec`
- react 使用同一个 `CompiledNodeSpec`
- engine/service/context 全链路只传这一个结构

whiteboard engine 顶层也必须直接用 shared：

```ts
const engine = new MutationEngine({
  document,
  normalize: normalizeDocument,
  key: historyKey,
  services: {
    registries,
    config
  },
  operations: whiteboardOperationTable,
  compile: whiteboardIntentHandlers,
  trace: whiteboardTrace,
  publish: whiteboardPublish,
  history: whiteboardHistory
})
```

必须删除：

- `createWhiteboardMutationSpec`
- `CommandMutationEngine` 显式泛型拼装
- `core.execute(intent as never, ...)`
- 顶层对 compile blocked issue 的二次 adapter，如果最终错误模型正确，应直接由 shared 输出领域错误

## 必删清单

### shared

- `shared/mutation/src/createMutationEngine.ts`
- `shared/mutation` 对外暴露的其他 runtime class
- `shared/draft` root export 上的 `path`
- `shared/draft` root export 上的 raw `patch` primitive

### dataview

- `dataview/packages/dataview-core/src/operations/compile.ts` 的 compile facade 角色
- `dataview/packages/dataview-core/src/operations/internal/compile/scope.ts`
- `dataview/packages/dataview-core/src/operations/issue.ts` 的 alias 层
- `dataview/packages/dataview-core/src/operations/index.ts` 中 `apply / compile / issue / key` 同义导出
- `dataview/packages/dataview-engine/src/mutation/kernel.ts`
- `dataview/packages/dataview-engine/src/active/plan.ts` 里的局部 `createBucketSpec`
- `dataview/packages/dataview-core/src/operations/key.ts` 里的 parse helper

### whiteboard

- `whiteboard/packages/whiteboard-core/src/operations/compile.ts`
- `whiteboard/packages/whiteboard-core/src/operations/compile-context.ts`
- `whiteboard/packages/whiteboard-core/src/operations/compile-handlers.ts`
- `whiteboard/packages/whiteboard-core/src/registry/schema.ts` 里的 compile helper
- `whiteboard/packages/whiteboard-core/src/node/update.ts` 的 path mutation glue
- `whiteboard/packages/whiteboard-react/src/features/node/registry/compile.ts`
- `whiteboard/packages/whiteboard-engine/src/mutation/spec.ts`

### 冻结但暂不动

以下内容属于 `shared/projection` / `shared/delta` 专项，当前只冻结，不纳入本文件实施：

- `whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts`
- `dataview/packages/dataview-core/src/operations/trace.ts`
- `dataview/packages/dataview-core/src/operations/internal/impact.ts`
- `dataview/packages/dataview-engine/src/active/projection/runtime.ts`
- 一切 family adapter / projection runtime facade

## 新的实施方案

### Phase A. 先收口 `shared/spec` 与 key codec

必须完成：

- 确定 `spec.table(...)` 与 `spec.tree(...)` 是唯一 compile 入口。
- 确定 `key.tuple(...)`、`key.tagged(...)`、`key.path()` 是唯一 codec。
- 删除 domain 侧重复 key codec 规范。
- 让 node spec compile、bucket spec、query execution key 都直接基于这层。

阶段产物：

- dataview bucket/index 只剩一份 canonical bucket spec module。
- whiteboard node spec 只剩一个 canonical compile 结果。

### Phase B. 重写 `shared/draft` 公共面

必须完成：

- 把 `draft.record.read/has/apply/diff/inverse` 做成最终公共 API。
- `path` 与 raw `patch` 退回 shared 内部。
- 所有上层调用改成字符串 key + plain object record write。

阶段产物：

- whiteboard 不再写 `mutationPath.of(...)`。
- schema compile helper 失去存在必要。

### Phase C. 重写 `shared/mutation`

必须完成：

- 只保留 `MutationEngine` 一个 public class。
- compile loop 下沉。
- reducer constructor 下沉。
- typed dispatch 下沉。
- compile issue plain object 合同固定在 shared，并让上层直接使用。
- `key/trace/publish/history` 全部改为 constructor 字段，而不是散落 helper。
- `MutationEngine` 之外的 runtime class 与 compile helper internalize。

阶段产物：

- dataview / whiteboard 都不再自己维护 kernel/spec/runtime facade。

### Phase D. dataview 一步到位接入 shared 最终态

必须完成：

- 删 `compileIntents / reduceDataviewOperations / dataviewMutationOperations` 这类中间层。
- 删 `issue.ts`、`key.ts` 的 façade 角色。
- `ValidationCode` 直接接入 shared compile issue plain object，不再保留 dataview issue constructor / namespace / hasErrors helper。
- `createEngine.ts` 直接装配 shared mutation engine。
- bucket/index/query key 全部统一到 canonical bucket module 与 shared key codec。
- trace 相关模块冻结，不在本阶段改动语义。

阶段产物：

- dataview core 只剩领域 intent handler、operation table、冻结中的 trace runtime。
- dataview engine 不再有 mutation kernel adapter。

### Phase E. whiteboard 重写底层 op 与 compile 链路

这是本轮最大的必做块。

必须完成：

- 重写 whiteboard operation 形状，改为结构化 patch op。
- 删 compile context 与 compile handler adapter。
- 每个 intent type 直接对应精确 handler。
- schema 不再 compile mutation，只做 schema resolve/default/validate。
- node/update 改为共享 record patch runtime。
- definitions 与 reducer 直接消费新 op。

阶段产物：

- whiteboard 全链路不再依赖 path mutation glue。
- `as never` 与 field/value bridge 的主要根源消失。

### Phase F. whiteboard engine / editor / react 收口

必须完成：

- `createWhiteboardMutationSpec` 删除。
- engine 顶层直接装配 shared mutation engine。
- `compileNodeSpec` 变成唯一 canonical node spec compiler。
- `compileReactNodeSpec` 删除。
- editor/react/service/context 统一消费同一个 compiled node spec。

阶段产物：

- whiteboard editor/react 不再维护自己的 compile adapter。

### Phase G. 最后一轮全链路校验

本阶段之前不要求所有阶段单独可运行。

只在全部结构改完后统一做：

- shared typecheck
- dataview typecheck
- whiteboard typecheck
- dataview tests
- whiteboard tests
- engine 级集成回归

## 完成判定

以下条件全部满足，才算本文件完成：

1. `shared/delta`、`shared/projection` 之外，shared/dataview/whiteboard 不再保留 compile/reducer/kernel/adapter/facade 重复实现。
2. `shared/mutation` 对上只剩一个 canonical `MutationEngine` constructor。
3. `shared/draft` 对上不再暴露 path primitives 给业务层拼装 mutation。
4. whiteboard 底层 op 已改成结构化 patch 形状。
5. dataview `issue.ts` 已删除，compile issue 直接使用 shared canonical model。
6. dataview 与 whiteboard engine 顶层都直接装配 shared 最终 API。
7. editor/react 不再各自维护 node spec compile wrapper。
8. 全部完成后一次性 typecheck / test 通过。

## 本轮不做的事

以下事项确定延后，不得夹带进入本轮：

- `shared/delta` API 收缩
- `shared/projection` API 收缩
- dataview / whiteboard trace runtime 下沉与 spec 化
- 基于 projection 的 family store / trace / runtime facade 收口
- scene render / active projection 的专项设计

这些内容单开后续专项文档处理。

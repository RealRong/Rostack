# shared/reducer API 设计与 Whiteboard / Dataview 迁移方案

## 1. 核心结论

可以，而且应该把 `shared/reducer` 收敛成和 `MutationEngine` 类似的主入口：

```ts
const reducer = new Reducer({
  spec: whiteboardReducerSpec
})
```

或者：

```ts
const reducer = new Reducer({
  spec: dataviewReducerSpec
})
```

`shared/reducer` 不应该对外导出一堆 `operationBuffer / issueCollector / mutationTx / mutationTrace / planningContext` 之类的零散工具。那些可以作为内部实现存在，但不应该成为领域项目长期直接依赖的 API。

最终目标是：

- 对外主 API 只有 `Reducer` + `ReducerSpec` + 少量结果类型。
- Whiteboard / Dataview 只提供自己的 `spec`、`ctx` 扩展和 operation handlers。
- inverse、footprint、issues、trace、changeSet、task queue 都由 `Reducer` 内部统一托管。
- 领域 handler 只拿到一个窄的 `ctx`，不直接接触底层 collector/buffer。

这比导出很多 primitives 更能降低复杂度和耦合。

---

## 2. 为什么不要导出很多底层工具

如果 `shared/reducer` 对外暴露：

- `opBuffer`
- `footprint`
- `issues`
- `planContext`
- `reduceContext`
- `reducerTx`
- `reduceTrace`
- `changeSet`

短期看复用度高，但长期会出现和现在 `shared/core` 类似的问题：

1. 领域包会到处直接 import 底层工具，依赖继续发散。
2. Whiteboard handler 会继续操作 `_runtime.changes`、`footprint.add`、`inverse.prepend` 这类底层结构。
3. Dataview compiler/apply/impact 会继续各自组装 context，而不是通过统一入口。
4. `shared/reducer` 会变成新的杂货铺，只是名字比 `shared/core` 更准确。

所以更好的 API 是：

```txt
new Reducer(spec)
```

让 shared 层提供一个稳定 reducer runtime，领域侧只写 spec 与 handlers。

---

## 3. `shared/reducer` 管什么

`Reducer` 负责一次 operation reduce/apply 的通用流程：

```txt
base doc
  -> create draft/current
  -> create state
  -> create internal buffers
  -> run operation handlers
  -> settle
  -> produce result
```

具体包括：

- 按 operation 分发 handler。
- 管理 current / draft / replace / write。
- 收集 inverse operations。
- 收集 history footprint keys。
- 收集 issues。
- 收集 trace/facts。
- 收集 change sets。
- 收集 reconcile/deferred tasks。
- 调用 settle / finalize。
- 返回标准 `ReducerResult`。

`Reducer` 不负责：

- intent compile。
- `MutationEngine` 的 commit orchestration。
- history stack。
- collab。
- publish projector runtime。
- query/read/index。
- 领域 operation 的语义。

---

## 4. 目标包 API

建议 `@shared/reducer` 的长期公开 API 收敛为：

```ts
export { Reducer } from './Reducer'

export type {
  ReducerSpec,
  ReducerContext,
  ReducerResult,
  ReducerIssue,
  ReducerIssueInput,
  ReducerEffect,
  ReducerHandler,
  ReducerHandlerMap,
  ReducerDraftAdapter,
  ReducerFootprintSpec,
  ReducerTraceSpec,
  ReducerChangeSpec,
  ReducerTaskSpec
} from './contracts'
```

可选导出，但不建议领域常规使用：

```ts
export type {
  ReducerInverse,
  ReducerFootprint,
  ReducerIssues,
  ReducerTrace,
  ReducerChanges,
  ReducerTasks
} from './contracts'
```

不建议导出 namespace 工具：

```ts
// 不推荐作为 public API
opBuffer
footprint
issueCollector
planningContext
mutationContext
mutationTx
mutationTrace
changeSet
```

这些可以放在 `shared/reducer/src/internal/*`，供 `Reducer` 实现使用。

---

## 5. 核心 API 设计

## 5.1 `Reducer`

```ts
export class Reducer<
  Doc extends object,
  Op extends { type: string },
  Key,
  State = void,
  Extra = void,
  Change = void,
  Task = void,
  Code extends string = string
> {
  constructor(input: {
    spec: ReducerSpec<Doc, Op, Key, State, Extra, Change, Task, Code>
  })

  reduce(input: {
    doc: Doc
    ops: readonly Op[]
    origin?: string
  }): ReducerResult<Doc, Op, Key, Extra, Change, Task, Code>
}
```

设计原则：

- `Reducer` 是一次 apply/reduce 的 runtime。
- 它是无状态对象，可复用；每次 `reduce()` 创建独立 run context。
- `MutationEngineSpec.apply` 可以直接调用 `reducer.reduce(...)`。
- `Reducer` 不保存 doc，不维护 rev，不发布 write。

---

## 5.2 `ReducerSpec`

```ts
export interface ReducerSpec<
  Doc extends object,
  Op extends { type: string },
  Key,
  State = void,
  Extra = void,
  Change = void,
  Task = void,
  Code extends string = string
> {
  draft?: ReducerDraftAdapter<Doc>

  footprint: ReducerFootprintSpec<Key>

  init(input: {
    doc: Doc
    origin: string
  }): State

  handlers: ReducerHandlerMap<Doc, Op, Key, State, Extra, Change, Task, Code>

  settle?(ctx: ReducerContext<Doc, Op, Key, State, Extra, Change, Task, Code>): void

  done?(ctx: ReducerContext<Doc, Op, Key, State, Extra, Change, Task, Code>): Extra

  emptyExtra?(): Extra

  changes?: ReducerChangeSpec<Change>

  tasks?: ReducerTaskSpec<Task>

  trace?: ReducerTraceSpec<Extra>
}
```

字段解释：

- `draft`：领域 doc 的 COW/draft 适配器；没有则用默认 shallow/COW 策略或显式 `replace`。
- `footprint`：定义 key 序列化，用于去重 footprint。
- `init`：为一次 reduce 初始化领域 state。
- `handlers`：operation type 到 handler 的映射。
- `settle`：所有 operation 跑完后的领域收尾，例如 Whiteboard 的 reconcile。
- `done`：把 state/changes/trace 转成 write extra。
- `emptyExtra`：空操作或全 warning 时的 extra fallback。
- `changes`：可选 change set spec，由 Reducer 内部托管。
- `tasks`：可选 deferred task/reconcile queue spec。
- `trace`：可选 trace/fact spec。

---

## 5.3 `ReducerContext`

领域 handler 只接触这个 ctx：

```ts
export interface ReducerContext<
  Doc extends object,
  Op,
  Key,
  State,
  Extra,
  Change,
  Task,
  Code extends string
> {
  readonly base: Doc
  readonly state: State
  readonly origin: string

  doc(): Doc
  write(): Doc
  replace(doc: Doc): void

  inverse: {
    prepend(op: Op): void
    prependMany(ops: readonly Op[]): void
    append(op: Op): void
    appendMany(ops: readonly Op[]): void
  }

  footprint: {
    add(key: Key): void
    addMany(keys: Iterable<Key>): void
    has(key: Key): boolean
  }

  issue(input: ReducerIssueInput<Code>): void
  require<T>(value: T | undefined, issue: ReducerIssueInput<Code>): T | undefined
  hasErrors(): boolean

  changes: ReducerChanges<Change>
  tasks: ReducerTasks<Task>
  trace: ReducerTrace<Extra>

  stop(result?: Extra): void
}
```

关键点：

- 领域 handler 不直接拿 `OperationBuffer`、`IssueCollector`、`FootprintCollector`。
- `inverse / footprint / changes / tasks / trace` 都是窄接口。
- `changes`、`tasks`、`trace` 是否可用由 spec 决定；不用的项目可以是 no-op。
- `stop()` 用于 Whiteboard 的 shortCircuit 或 Dataview 的 hard block。

---

## 5.4 `ReducerResult`

```ts
export type ReducerResult<
  Doc,
  Op,
  Key,
  Extra = void,
  Change = void,
  Task = void,
  Code extends string = string
> =
  | {
      ok: true
      doc: Doc
      forward: readonly Op[]
      inverse: readonly Op[]
      footprint: readonly Key[]
      extra: Extra
      changes: Change
      tasks: readonly Task[]
      issues: readonly ReducerIssue<Code>[]
    }
  | {
      ok: false
      doc: Doc
      forward: readonly Op[]
      inverse: readonly Op[]
      footprint: readonly Key[]
      changes: Change
      tasks: readonly Task[]
      issues: readonly ReducerIssue<Code>[]
      error: ReducerIssue<Code>
    }
```

与 `MutationEngine` 对接时：

```ts
const result = reducer.reduce({ doc, ops, origin })
if (!result.ok) {
  return {
    ok: false,
    error: {
      code: result.error.code,
      message: result.error.message,
      details: result.issues
    }
  }
}

return {
  ok: true,
  data: {
    doc: result.doc,
    forward: result.forward,
    inverse: result.inverse,
    footprint: result.footprint,
    extra: result.extra
  }
}
```

---

## 5.5 Handler Map

```ts
export type ReducerHandler<
  Doc extends object,
  Op,
  Key,
  State,
  Extra,
  Change,
  Task,
  Code extends string
> = (
  ctx: ReducerContext<Doc, Op, Key, State, Extra, Change, Task, Code>,
  op: Op
) => void

export type ReducerHandlerMap<
  Doc extends object,
  Op extends { type: string },
  Key,
  State,
  Extra,
  Change,
  Task,
  Code extends string
> = {
  [Type in Op['type']]?: ReducerHandler<
    Doc,
    Extract<Op, { type: Type }>,
    Key,
    State,
    Extra,
    Change,
    Task,
    Code
  >
}
```

设计要点：

- 领域 op 必须有 `type: string`。
- handler map 类型可以按 `op.type` 自动 narrow。
- 未注册 handler 由 `Reducer` 产出 issue，而不是静默忽略。

---

## 6. 可选扩展 API

为了避免 public API 过宽，扩展能力通过 spec，而不是导出底层工具。

## 6.1 Changes

```ts
export interface ReducerChangeSpec<Change> {
  create(): Change
  hasAny?(changes: Change): boolean
  clone?(changes: Change): Change
}

export interface ReducerChanges<Change> {
  value(): Change
  mark(path: string, value?: unknown): void
  custom(): Change
}
```

实际项目可以在 `extendContext` 模式下提供更强的领域方法。

Whiteboard 不应该让 handler 调用通用 `changes.mark('nodes', id)`，而应该通过领域 ctx 暴露：

```ts
ctx.mark.nodeUpdated(id)
ctx.mark.edgeRemoved(id)
ctx.mark.mindmapUpdated(id)
```

因此更推荐 `ReducerSpec` 支持 context 扩展。

## 6.2 Context Extension

为了让 Whiteboard / Dataview handler 拿到领域友好的 API，而不是底层通用 API，建议支持 `extend`：

```ts
export interface ReducerSpec<...> {
  // ...基础字段

  extend?<DomainCtx>(input: {
    ctx: ReducerContext<Doc, Op, Key, State, Extra, Change, Task, Code>
  }): DomainCtx

  handlers: ReducerHandlerMap<
    Doc,
    Op,
    Key,
    State,
    Extra,
    Change,
    Task,
    Code
  >
}
```

更完整的类型可以写成：

```ts
export interface ReducerSpec<
  Doc extends object,
  Op extends { type: string },
  Key,
  State = void,
  Extra = void,
  DomainCtx = ReducerContext<Doc, Op, Key, State, Extra, void, void, string>,
  Code extends string = string
> {
  init(input: { doc: Doc; origin: string }): State
  extend?(ctx: ReducerContext<Doc, Op, Key, State, Extra, Code>): DomainCtx
  handlers: ReducerHandlerMap<DomainCtx, Op>
  settle?(ctx: DomainCtx): void
  done?(ctx: DomainCtx): Extra
}
```

推荐最终采用这个方向：**基础 ctx 由 shared 创建，领域 ctx 由 spec.extend 包装。**

这样 Whiteboard handler 看到的是 `WhiteboardReduceCtx`，Dataview handler 看到的是 `DataviewReduceCtx`，而不是 shared 的底层 runtime。

---

## 7. 更简洁的最终 API 版本

为了更像 `MutationEngine`，建议最终把 public API 压到下面这个形态。

```ts
export class Reducer<
  Doc extends object,
  Op extends { type: string },
  Key,
  Extra = void,
  DomainCtx = ReducerContext<Doc, Op, Key, Extra>,
  Code extends string = string
> {
  constructor(input: {
    spec: ReducerSpec<Doc, Op, Key, Extra, DomainCtx, Code>
  })

  reduce(input: {
    doc: Doc
    ops: readonly Op[]
    origin?: string
  }): ReducerResult<Doc, Op, Key, Extra, Code>
}
```

```ts
export interface ReducerSpec<
  Doc extends object,
  Op extends { type: string },
  Key,
  Extra = void,
  DomainCtx = ReducerContext<Doc, Op, Key, Extra>,
  Code extends string = string
> {
  clone?(doc: Doc): Doc
  draft?: ReducerDraftAdapter<Doc>
  serializeKey(key: Key): string

  createContext?(ctx: ReducerContext<Doc, Op, Key, Extra, Code>): DomainCtx

  handlers: ReducerHandlerMap<DomainCtx, Op>

  settle?(ctx: DomainCtx): void
  done?(ctx: DomainCtx): Extra
}
```

```ts
export interface ReducerContext<
  Doc extends object,
  Op,
  Key,
  Extra = void,
  Code extends string = string
> {
  readonly base: Doc
  readonly origin: string

  doc(): Doc
  write(): Doc
  replace(doc: Doc): void

  inverse(op: Op): void
  inverseMany(ops: readonly Op[]): void

  footprint(key: Key): void
  footprintMany(keys: Iterable<Key>): void

  issue(issue: ReducerIssueInput<Code>): void
  require<T>(value: T | undefined, issue: ReducerIssueInput<Code>): T | undefined

  stop(extra?: Extra): void
}
```

这个版本刻意不暴露 `changes/tasks/trace` 到基础 ctx。它们由领域 `createContext` 自己封装。

例如 Whiteboard：

```ts
createContext(ctx) {
  return createWhiteboardReduceContext(ctx)
}
```

Dataview：

```ts
createContext(ctx) {
  return createDataviewReduceContext(ctx)
}
```

这会让 shared API 更薄。

---

## 8. Whiteboard 目标形态

## 8.1 `whiteboardReducerSpec`

```ts
export const whiteboardReducer = new Reducer<
  Document,
  Operation,
  HistoryKey,
  WhiteboardApplyExtra,
  WhiteboardReduceCtx,
  WhiteboardReduceIssueCode
>({
  spec: whiteboardReducerSpec
})
```

```ts
export const whiteboardReducerSpec: ReducerSpec<
  Document,
  Operation,
  HistoryKey,
  WhiteboardApplyExtra,
  WhiteboardReduceCtx,
  WhiteboardReduceIssueCode
> = {
  draft: whiteboardDraftAdapter,
  serializeKey: serializeHistoryKey,

  createContext: (ctx) => createWhiteboardReduceContext(ctx),

  handlers: {
    'document.patch': reduceDocumentPatch,
    'canvas.order': reduceCanvasOrder,
    'node.insert': reduceNodeInsert,
    'node.patch': reduceNodePatch,
    'node.remove': reduceNodeRemove,
    'edge.insert': reduceEdgeInsert,
    'edge.patch': reduceEdgePatch,
    'edge.remove': reduceEdgeRemove,
    'group.insert': reduceGroupInsert,
    'group.patch': reduceGroupPatch,
    'group.remove': reduceGroupRemove,
    'mindmap.topic.insert': reduceMindmapTopicInsert,
    'mindmap.topic.remove': reduceMindmapTopicRemove
  },

  settle: (ctx) => {
    ctx.reconcile.flush()
  },

  done: (ctx) => ({
    changes: ctx.changes.finish(),
    dirty: ctx.dirty.finish(),
    trace: ctx.trace.finish()
  })
}
```

## 8.2 `WhiteboardReduceCtx`

Whiteboard handler 不应该看到 shared 的内部 buffer，而应该看到领域 API：

```ts
export interface WhiteboardReduceCtx {
  readonly base: Document
  readonly origin: string

  doc: {
    current(): DraftDocument
    write(): DraftDocument
    node(id: NodeId): Node | undefined
    edge(id: EdgeId): Edge | undefined
    group(id: GroupId): Group | undefined
    mindmap(id: MindmapId): MindmapRecord | undefined
    patchNode(id: NodeId, patch: Partial<Node>): void
    patchEdge(id: EdgeId, patch: Partial<Edge>): void
    patchGroup(id: GroupId, patch: Partial<Group>): void
  }

  inverse: {
    prepend(op: Operation): void
    prependMany(ops: readonly Operation[]): void
  }

  history: {
    add(key: HistoryKey): void
    node(id: NodeId): void
    edge(id: EdgeId): void
    group(id: GroupId): void
    mindmap(id: MindmapId): void
    document(): void
  }

  mark: {
    document(): void
    canvasOrder(): void
    nodeAdded(id: NodeId): void
    nodeUpdated(id: NodeId): void
    nodeRemoved(id: NodeId): void
    edgeAdded(id: EdgeId): void
    edgeUpdated(id: EdgeId): void
    edgeRemoved(id: EdgeId): void
    groupAdded(id: GroupId): void
    groupUpdated(id: GroupId): void
    groupRemoved(id: GroupId): void
    mindmapAdded(id: MindmapId): void
    mindmapUpdated(id: MindmapId): void
    mindmapRemoved(id: MindmapId): void
  }

  dirty: {
    node(id: NodeId): void
    edge(id: EdgeId): void
    group(id: GroupId): void
    mindmap(id: MindmapId): void
  }

  reconcile: {
    mindmapLayout(id: MindmapId): void
    flush(): void
  }

  issue(code: WhiteboardReduceIssueCode, message: string, path?: string): void
  stop(result?: WhiteboardApplyExtra): void
}
```

这样 shared/reducer 的复杂度被隐藏，Whiteboard reducer handler 也不再到处访问：

```ts
tx._runtime.changes.nodes
ctx.footprint.add(...)
operationBuffer.create...
```

## 8.3 Whiteboard 迁移步骤

### 第一步：新增 Reducer spec，不立刻改 handler

先用 `createWhiteboardReduceContext(ctx)` 包一层，内部仍可复用现有 runtime 结构。

目标是让 `MutationEngineSpec.apply` 从：

```ts
applyWhiteboardOperations(doc, ops)
```

变成：

```ts
whiteboardReducer.reduce({ doc, ops, origin })
```

### 第二步：把 `_runtime` 访问收口

逐步把 handler 里的：

```ts
changeSet.markUpdated(tx._runtime.changes.nodes, id)
tx._runtime.history.footprint.add(key)
tx._runtime.reconcile.tasks.emit(task)
```

改为：

```ts
ctx.mark.nodeUpdated(id)
ctx.history.node(id)
ctx.reconcile.mindmapLayout(id)
```

### 第三步：删除 Whiteboard 自己的通用 reducer plumbing

当 handler 都只依赖 `WhiteboardReduceCtx` 后，可以删除或瘦身：

- `kernel/reduce/runtime.ts` 中的通用 buffer/collector 创建逻辑
- `kernel/reduce/tx.ts` 中的 `mutationTx` 组装逻辑
- 对 `@shared/core` 中 `changeSet/historyFootprint/mutationContext/operationBuffer` 的依赖

Whiteboard 只保留领域 ctx adapter 与 handlers。

## 8.4 Whiteboard 收益

- `whiteboard-core` 不再直接依赖 shared 的一堆 reducer primitives。
- `kernel/reduce` 的底层 orchestration 交给 `Reducer`。
- handler 只依赖领域 ctx，耦合度显著下降。
- change/dirty/history/reconcile 的内部结构可以独立演进。
- `MutationEngineSpec.apply` 变薄。

---

## 9. Dataview 目标形态

## 9.1 `dataviewReducerSpec`

```ts
export const dataviewReducer = new Reducer<
  DataDoc,
  DocumentOperation,
  HistoryKey,
  CommitImpact,
  DataviewReduceCtx,
  DataviewReduceIssueCode
>({
  spec: dataviewReducerSpec
})
```

```ts
export const dataviewReducerSpec: ReducerSpec<
  DataDoc,
  DocumentOperation,
  HistoryKey,
  CommitImpact,
  DataviewReduceCtx,
  DataviewReduceIssueCode
> = {
  draft: dataviewDraftAdapter,
  serializeKey: serializeHistoryKey,

  createContext: (ctx) => createDataviewReduceContext(ctx),

  handlers: {
    'record.insert': reduceRecordInsert,
    'record.patch': reduceRecordPatch,
    'record.remove': reduceRecordRemove,
    'field.insert': reduceFieldInsert,
    'field.patch': reduceFieldPatch,
    'field.remove': reduceFieldRemove,
    'view.insert': reduceViewInsert,
    'view.patch': reduceViewPatch,
    'view.remove': reduceViewRemove
  },

  done: (ctx) => ctx.impact.finish()
}
```

## 9.2 `DataviewReduceCtx`

Dataview handler 应该看到面向文档和 impact 的领域 API：

```ts
export interface DataviewReduceCtx {
  readonly base: DataDoc
  readonly origin: string

  read: {
    record(id: RecordId): DataRecord | undefined
    field(id: FieldId): CustomField | undefined
    view(id: ViewId): DataView | undefined
  }

  write: {
    replace(doc: DataDoc): void
    insertRecord(record: DataRecord): void
    patchRecord(id: RecordId, patch: Partial<DataRecord>): void
    removeRecord(id: RecordId): void
    insertField(field: CustomField): void
    patchField(id: FieldId, patch: Partial<CustomField>): void
    removeField(id: FieldId): void
    insertView(view: DataView): void
    patchView(id: ViewId, patch: Partial<DataView>): void
    removeView(id: ViewId): void
  }

  inverse: {
    prepend(op: DocumentOperation): void
    prependMany(ops: readonly DocumentOperation[]): void
  }

  history: {
    record(id: RecordId): void
    field(id: FieldId): void
    view(id: ViewId): void
    document(): void
  }

  impact: {
    recordInserted(id: RecordId): void
    recordPatched(id: RecordId, aspects?: readonly string[]): void
    recordRemoved(id: RecordId): void
    fieldSchemaChanged(id: FieldId): void
    valueTouched(recordId: RecordId, fieldId: FieldId): void
    viewChanged(id: ViewId): void
    finish(): CommitImpact
  }

  issue(code: DataviewReduceIssueCode, message: string, path?: string): void
  stop(impact?: CommitImpact): void
}
```

这可以替代当前散落的：

```ts
documentApi.*
runtime.replace(nextDocument)
runtime.inverse.prependMany(...)
commitImpact.*
mutationTrace.*
```

## 9.3 Dataview 迁移步骤

### 第一步：用 Reducer 包住现有 operation apply

先不重写所有 operation handler，建立 adapter：

```ts
const legacyCtx = createLegacyDocumentOperationRuntime(ctx)
applyLegacyOperation(legacyCtx, op)
```

这样 `MutationEngineSpec.apply` 可以先统一变成：

```ts
dataviewReducer.reduce({ doc, ops, origin })
```

### 第二步：把 inverse / impact / footprint 从 legacy runtime 抽到 ctx

将 operation handler 从：

```ts
runtime.inverse.prependMany(...)
runtime.replace(documentApi.records.patch(...))
markRecordPatch(impact, ...)
```

逐步改成：

```ts
ctx.inverse.prependMany(...)
ctx.write.patchRecord(...)
ctx.impact.recordPatched(...)
ctx.history.record(id)
```

### 第三步：补齐 `HistoryKey`

Dataview 领域侧新增：

```ts
export type HistoryKey =
  | { type: 'document' }
  | { type: 'record'; id: RecordId }
  | { type: 'field'; id: FieldId }
  | { type: 'view'; id: ViewId }
  | { type: 'value'; recordId: RecordId; fieldId: FieldId }
```

并实现：

```ts
serializeHistoryKey(key)
historyKeyConflicts(left, right)
```

handler 只调用：

```ts
ctx.history.record(id)
ctx.history.value(recordId, fieldId)
```

### 第四步：active / projector 下游化

Reducer 只产出 `CommitImpact`，不直接更新 active：

```txt
Reducer -> ApplyResult.extra = CommitImpact
MutationEngine -> Write.extra = CommitImpact
active/projector subscribe writes
```

这样 Dataview 写入侧和 active/query 侧解耦。

## 9.4 Dataview 收益

- compiler/apply/impact 不再各自拼 context。
- operation handler 不再直接依赖 commit runtime。
- `documentApi.* -> replace` 可以逐步被 `ctx.write.*` 吞掉。
- active/projector 不在 apply 主链中运行。
- Dataview 的复杂度回到字段/记录/视图本身。

---

## 10. 与 `MutationEngine` 的组合

`Reducer` 是 `MutationEngineSpec.apply` 的实现细节。

Whiteboard：

```ts
const whiteboardReducer = new Reducer({
  spec: whiteboardReducerSpec
})

export const whiteboardMutationSpec: MutationEngineSpec<...> = {
  clone: cloneDocument,
  compile: compileWhiteboardIntents,
  apply: ({ doc, ops, origin }) => {
    const result = whiteboardReducer.reduce({ doc, ops, origin })
    return toMutationApplyResult(result)
  },
  publish: whiteboardPublishSpec,
  history: whiteboardHistorySpec
}
```

Dataview：

```ts
const dataviewReducer = new Reducer({
  spec: dataviewReducerSpec
})

export const dataviewMutationSpec: MutationEngineSpec<...> = {
  clone: cloneDataDoc,
  compile: compileDataviewIntents,
  apply: ({ doc, ops, origin }) => {
    const result = dataviewReducer.reduce({ doc, ops, origin })
    return toMutationApplyResult(result)
  },
  publish: dataviewPublishSpec,
  history: dataviewHistorySpec
}
```

这样主轴非常清晰：

```txt
MutationEngine = 写入 orchestration
Reducer = operation apply orchestration
DomainCtx = 领域写入 API
Handlers = 领域 operation 规则
```

---

## 11. 内部实现仍可复用 primitives

虽然不建议 public API 导出很多工具，但 `Reducer` 内部仍然可以使用当前已有代码：

```txt
shared/reducer/src/internal/opBuffer.ts
shared/reducer/src/internal/footprint.ts
shared/reducer/src/internal/issues.ts
shared/reducer/src/internal/trace.ts
shared/reducer/src/internal/changeSet.ts
shared/reducer/src/internal/draft.ts
```

这些 internal 模块可以直接从 `shared/core` 迁入，但不作为包 exports 暴露。

如果测试需要，可以测试 public `Reducer` 行为，而不是测试每个 internal helper 的导出 API。

---

## 12. `shared/reducer` package exports

建议 `package.json` 只暴露：

```json
{
  "exports": {
    ".": "./src/index.ts"
  }
}
```

不要暴露：

```json
{
  "./opBuffer": "...",
  "./footprint": "...",
  "./issues": "...",
  "./trace": "..."
}
```

如果未来确实有强需求，再按成熟场景开放小的 subpath，而不是一开始全部公开。

---

## 13. 迁移顺序

## 阶段 1：新增 `Reducer`，内部复用旧 primitives

- 新建 `shared/reducer`。
- 实现 `Reducer` / `ReducerSpec` / `ReducerContext` / `ReducerResult`。
- 把现有 buffer、issue、footprint、trace 等作为 internal 搬入。
- 不暴露 internal subpath。

## 阶段 2：`shared/mutation/apply` 选择性收敛

有两种选择：

### 选择 A：保留 `shared/mutation/apply`

`Reducer` 作为更高层 API，`shared/mutation/apply` 暂时不动。

优点：迁移风险低。

### 选择 B：用 `Reducer` 替代 `shared/mutation/apply`

`MutationEngineSpec.apply` 推荐统一使用 `Reducer`。

优点：概念更少，长期更简单。

建议选择 B，但可以分阶段做。

## 阶段 3：Whiteboard 先接入 Reducer

- 建 `whiteboardReducerSpec`。
- 建 `WhiteboardReduceCtx` adapter。
- `MutationEngineSpec.apply` 改为调用 `whiteboardReducer.reduce`。
- handler 逐步从 `_runtime` 改为领域 ctx API。

## 阶段 4：Dataview 接入 Reducer

- 建 `dataviewReducerSpec`。
- 建 `DataviewReduceCtx` adapter。
- 初期 adapter 可包住 legacy operation runtime。
- 后续逐步迁移到 `ctx.write/ctx.impact/ctx.history`。
- active/projector 从 reducer 主链剥离。

## 阶段 5：清理 `shared/core`

- 删除或 deprecated `mutationContext/mutationTx/mutationTrace/planningContext/operationBuffer/historyFootprint`。
- 领域包不再从 `@shared/core` import reducer 语义。
- `shared/core` 回到 primitive。

---

## 14. 验收标准

## API 验收

- 领域项目只需要 `new Reducer({ spec })`。
- `@shared/reducer` 不暴露一堆 helper subpath。
- `ReducerSpec` 字段少，核心只有 `draft/serializeKey/createContext/handlers/settle/done`。
- `ReducerContext` 是窄接口，不泄漏 internal buffers。

## Whiteboard 验收

- `MutationEngineSpec.apply` 调用 `whiteboardReducer.reduce`。
- handler 使用 `WhiteboardReduceCtx`。
- `_runtime` 直接访问显著减少，最终只留在 context adapter 内。
- `changeSet/historyFootprint/operationBuffer/mutationTx` 不再从 `@shared/core` 直接使用。

## Dataview 验收

- `MutationEngineSpec.apply` 调用 `dataviewReducer.reduce`。
- operation handler 使用 `DataviewReduceCtx`。
- inverse / impact / footprint 通过 ctx 访问。
- active/projector 消费 write，而不是在 reducer 内部推进。

---

## 15. 最终结论

`shared/reducer` 最好不要设计成一组工具导出，而应该设计成一个薄的 reducer runtime：

```ts
new Reducer({ spec })
```

它和 `MutationEngine` 的分工是：

```txt
MutationEngine：Intent -> Operation[] -> ApplyResult -> Write -> Publish/History
Reducer：Operation[] -> next Doc / inverse / footprint / extra
```

领域项目的复杂度应该通过 `createContext` 收口：

```txt
ReducerContext(shared narrow API)
  -> WhiteboardReduceCtx / DataviewReduceCtx(domain API)
  -> handlers(domain rules)
```

这样比导出很多 primitives 更能降低耦合，也更符合“shared 为多项目构建底层设施、降低复杂度”的目标。

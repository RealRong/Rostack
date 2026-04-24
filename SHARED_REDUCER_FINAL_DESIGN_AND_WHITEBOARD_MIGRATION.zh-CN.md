# shared/reducer 最终设计与 Whiteboard 一次性迁移方案

## 1. 目标

把 operation reduce/apply 的通用 runtime 从领域包中抽离出来，收敛为新的 `@shared/reducer`。

本方案只讨论最终形态，目标是：

- `@shared/reducer` 成为唯一的通用 reduce runtime。
- `@shared/mutation` 不再负责通用 apply/reduce。
- `whiteboard-core` 不再自己维护一套通用 reducer plumbing。
- `whiteboard-engine` 只组合 `MutationEngineSpec`，不再包一层白板专用 apply runtime。

## 2. 强约束

- 不保留兼容层。
- 不保留双轨期。
- 不新增过渡命名。
- 旧实现如果阻碍最终 API，直接替代并删除。
- 可以接受迁移过程中短期不可运行，但最终 tree 必须明显更简单。

这意味着：

- 不保留 `shared/mutation.apply` 作为长期 API。
- 不保留 `whiteboard-core/kernel/reduce/*` 作为长期 runtime 入口。
- 不保留 `reduceOperations -> whiteboardReducer.reduce` 的别名兼容。
- 不保留 `kernel` 名下的 reducer 出口。

## 3. 核心结论

这件事适合做，而且应该做。

当前 whiteboard 的 reducer 路径已经实质上是一套手写 shared runtime：

- `reduce/index.ts` 负责 orchestration。
- `runtime.ts` 负责 draft / change / dirty / footprint / reconcile queue。
- `tx.ts` 负责组装宽 tx API。
- `dispatch.ts` 负责分发 operation。
- `commit.ts` 负责 finalize / impact / short-circuit result。

这些内容里，真正属于 whiteboard domain 的只有：

- operation 语义本身。
- history key 规则。
- dirty / invalidation 语义。
- reconcile 语义。
- final extra / impact 计算。
- lock validate 规则。

通用 runtime 不应该继续留在 `whiteboard-core`。

## 4. 最终分层

### 4.1 `@shared/reducer`

负责：

- 单次 reduce run 的 orchestration。
- draft/current/replace/write 生命周期。
- inverse 收集。
- footprint 收集。
- issue / fail / stop 控制流。
- handler dispatch。
- `beforeEach` / `settle` / `done` 生命周期。
- 标准 `ReducerResult` 输出。

不负责：

- intent compile。
- history stack。
- collab。
- publish。
- query/index/read model。
- 领域 operation 语义。
- whiteboard/dataview 的 change/dirty/trace/reconcile 结构定义。

### 4.2 `@shared/mutation`

保留：

- `MutationEngine`
- `MutationEngineSpec`
- `compile`
- `path`
- `meta`
- `history`
- `collab`

删除：

- `apply`
- `ApplyCtx`
- `ApplyResult`
- `Model`

最终关系应该是：

```txt
intent compile -> MutationEngine
ops reduce/apply -> shared/reducer
```

而不是 `shared/mutation` 同时承担 compile runtime 和 reduce runtime。

### 4.3 `@whiteboard/core`

保留：

- operation 定义
- reducer handler
- history key / collect 规则
- dirty / impact / reconcile 规则
- whiteboard reducer context adapter

删除：

- 自己的通用 reducer runtime
- 对 `@shared/core` reducer primitives 的直接依赖
- `_runtime` 暴露给 handler 的模式

## 5. `@shared/reducer` 最终公开 API

## 5.1 主入口

```ts
export class Reducer<
  Doc extends object,
  Op extends { type: string },
  Key,
  Extra = void,
  DomainCtx = ReducerContext<Doc, Op, Key, Code>,
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

设计要求：

- `Reducer` 是无状态对象。
- 每次 `reduce()` 创建独立 run context。
- `MutationEngineSpec.apply` 直接调用 `reducer.reduce(...)`。

## 5.2 `ReducerSpec`

```ts
export interface ReducerSpec<
  Doc extends object,
  Op extends { type: string },
  Key,
  Extra = void,
  DomainCtx = ReducerContext<Doc, Op, Key, Code>,
  Code extends string = string
> {
  clone?(doc: Doc): Doc
  draft?: ReducerDraftAdapter<Doc>
  serializeKey(key: Key): string

  validate?(input: {
    doc: Doc
    ops: readonly Op[]
    origin: string
  }): ReducerIssueInput<Code> | undefined

  createContext?(ctx: ReducerContext<Doc, Op, Key, Code>): DomainCtx

  beforeEach?(ctx: DomainCtx, op: Op): void

  handlers: ReducerHandlerMap<DomainCtx, Op>

  settle?(ctx: DomainCtx): void

  done?(ctx: DomainCtx): Extra

  emptyExtra?(): Extra
}
```

字段约束：

- `validate` 用于 run 前校验，例如 whiteboard lock validate。
- `beforeEach` 用于集中处理 cross-cutting 逻辑，例如 history footprint collect。
- `createContext` 用于把 shared base ctx 包成领域 ctx。
- `handlers` 是唯一 operation dispatch source，不再做字符串前缀分发。
- `settle` 用于 reconcile。
- `done` 用于生成领域 extra。

## 5.3 `ReducerContext`

shared 基础 ctx 必须刻意保持很薄：

```ts
export interface ReducerContext<
  Doc extends object,
  Op,
  Key,
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

  stop(): void
  fail(issue: ReducerIssueInput<Code>): never
}
```

约束：

- 不把 `changes / dirty / trace / reconcile / task queue` 放进 shared base ctx。
- 这些结构全部由领域 `createContext()` 包装出来。
- `fail()` 是一等控制流，不再依赖 throw 自定义 sentinel。

## 5.4 `ReducerResult`

```ts
export type ReducerResult<
  Doc,
  Op,
  Key,
  Extra = void,
  Code extends string = string
> =
  | {
      ok: true
      doc: Doc
      forward: readonly Op[]
      inverse: readonly Op[]
      footprint: readonly Key[]
      extra: Extra
      issues: readonly ReducerIssue<Code>[]
    }
  | {
      ok: false
      doc: Doc
      forward: readonly Op[]
      inverse: readonly Op[]
      footprint: readonly Key[]
      issues: readonly ReducerIssue<Code>[]
      error: ReducerIssue<Code>
    }
```

共享层不理解 `changes`、`dirty`、`trace`、`impact`，这些都进入 `extra`。

## 6. `@shared/reducer` 不导出的东西

下面这些如果需要存在，只能存在于 `@shared/reducer/internal/*`，不能作为长期 public API：

- `mutationContext`
- `mutationTx`
- `operationBuffer`
- `historyFootprint`
- `changeSet`
- `mutationTrace`
- `issueCollector`
- 各种 reducer runtime buffer

如果当前实现复用这些工具最省事，可以内部搬运或内聚到 `@shared/reducer`，但领域包不能继续直接依赖。

## 7. 需要替代的旧实现

## 7.1 替代 `shared/mutation.apply`

最终要替代：

- [shared/mutation/src/apply.ts](/Users/realrong/Rostack/shared/mutation/src/apply.ts:1)
- [shared/mutation/src/index.ts](/Users/realrong/Rostack/shared/mutation/src/index.ts:1) 里的 `apply` 相关导出

替代后：

- `MutationEngineSpec.apply` 内部调用 `Reducer.reduce(...)`。
- `mutationApply.success(...)` 仍可保留为结果适配 helper，但 `apply` runtime 不再存在于 `@shared/mutation`。

## 7.2 替代 whiteboard 自建 reducer runtime

最终要替代：

- [whiteboard/packages/whiteboard-core/src/kernel/reduce/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/kernel/reduce/index.ts:1)
- [whiteboard/packages/whiteboard-core/src/kernel/reduce/runtime.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/kernel/reduce/runtime.ts:1)
- [whiteboard/packages/whiteboard-core/src/kernel/reduce/tx.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/kernel/reduce/tx.ts:1)
- [whiteboard/packages/whiteboard-core/src/kernel/reduce/types.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/kernel/reduce/types.ts:1)
- [whiteboard/packages/whiteboard-core/src/kernel/reduce/dispatch.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/kernel/reduce/dispatch.ts:1)

这些文件代表的是 whiteboard 自己维护的一套通用 runtime，不应该保留。

## 7.3 替代 whiteboard-engine 的 apply wrapper

最终要替代：

- [whiteboard/packages/whiteboard-engine/src/mutation/apply.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/apply.ts:1)

替代后：

- `whiteboard-engine/src/mutation/spec.ts` 直接 import `whiteboardReducer`。
- 不再额外包一层 `applyWhiteboardOperations(...)`。

## 7.4 替代 `kernel` 名下的 reduce 出口

最终要替代：

- [whiteboard/packages/whiteboard-core/src/kernel/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/kernel/index.ts:1) 中的 `reduceOperations`

`kernel` 应该只保留真正的 kernel / registries 能力，不再承载 reducer runtime。

## 8. Whiteboard 最终结构

## 8.1 最终入口

whiteboard 最终应该显式拥有自己的 reducer：

```ts
export const whiteboardReducer = new Reducer<
  Document,
  Operation,
  HistoryKey,
  WhiteboardReduceExtra,
  WhiteboardReduceCtx,
  WhiteboardReduceIssueCode
>({
  spec: whiteboardReducerSpec
})
```

建议最终公开入口：

```txt
@whiteboard/core/reducer
```

而不是继续挂在：

```txt
@whiteboard/core/kernel
```

## 8.2 最终文件结构

建议 whiteboard 收敛成下面这组文件：

```txt
whiteboard/packages/whiteboard-core/src/reducer/
  index.ts
  spec.ts
  context.ts
  types.ts
  validate.ts
  history.ts
  extra.ts
  handlers/
    document.ts
    node.ts
    edge.ts
    group.ts
    mindmap.ts
```

说明：

- `context.ts`：把 shared base ctx 包成 `WhiteboardReduceCtx`
- `validate.ts`：lock preflight
- `history.ts`：operation -> history footprint collect
- `extra.ts`：changes / dirty / impact / trace finalize
- `handlers/*`：白板 reducer handler

下面这些不再保留为独立通用 runtime 层：

- `kernel/reduce/runtime.ts`
- `kernel/reduce/tx.ts`
- `kernel/reduce/types.ts`
- `kernel/reduce/dispatch.ts`

## 8.3 `WhiteboardReduceCtx`

whiteboard handler 只应该看到领域 API，不应该看到 `_runtime`：

```ts
export interface WhiteboardReduceCtx {
  readonly base: Document
  readonly origin: Origin

  read: {
    document(): Document
    node(id: NodeId): Node | undefined
    edge(id: EdgeId): Edge | undefined
    group(id: GroupId): Group | undefined
    mindmap(id: MindmapId): MindmapRecord | undefined
    canvasOrder(): readonly CanvasItemRef[]
    record(root: unknown, path: Path): unknown
  }

  write: {
    replace(document: Document): void

    createNode(node: Node): void
    patchNode(id: NodeId, patch: Partial<Node>): void
    deleteNode(id: NodeId): void

    createEdge(edge: Edge): void
    patchEdge(id: EdgeId, patch: Partial<Edge>): void
    deleteEdge(id: EdgeId): void

    createGroup(group: Group): void
    patchGroup(id: GroupId, patch: Partial<Group>): void
    deleteGroup(id: GroupId): void

    createMindmap(input: { mindmap: MindmapRecord; nodes: readonly Node[] }): void
    patchMindmap(id: MindmapId, patch: Partial<MindmapRecord>): void
    deleteMindmap(id: MindmapId): void

    setCanvasOrder(order: readonly CanvasItemRef[]): void
  }

  snapshot: {
    node(id: NodeId): Node
    edge(id: EdgeId): Edge
    group(id: GroupId): Group
    mindmap(id: MindmapId): MindmapSnapshot
    canvasSlot(ref: CanvasItemRef): CanvasSlot | undefined
  }

  inverse: {
    prepend(op: Operation): void
    prependMany(ops: readonly Operation[]): void
  }

  history: {
    add(key: HistoryKey): void
    addMany(keys: readonly HistoryKey[]): void
  }

  mark: {
    document(): void
    background(): void
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
    document(): void
    background(): void
    canvasOrder(): void
    node(id: NodeId): void
    edge(id: EdgeId): void
    group(id: GroupId): void
    mindmap(id: MindmapId): void
  }

  reconcile: {
    mindmapLayout(id: MindmapId): void
    flush(): void
  }

  issue(code: WhiteboardReduceIssueCode, message: string, details?: unknown): void
  fail: {
    invalid(message: string, details?: unknown): never
    cancelled(message: string, details?: unknown): never
  }
  stop(): void
}
```

这个 ctx 的作用是把当前 scattered 的：

- `tx._runtime.draft`
- `tx._runtime.changes`
- `tx._runtime.dirty`
- `tx._runtime.history.footprint`
- `tx._runtime.reconcile.tasks`
- `tx.inverse`

全部收口成领域方法。

## 8.4 Whiteboard `spec` 结构

```ts
export const whiteboardReducerSpec: ReducerSpec<
  Document,
  Operation,
  HistoryKey,
  WhiteboardReduceExtra,
  WhiteboardReduceCtx,
  WhiteboardReduceIssueCode
> = {
  draft: whiteboardDraftAdapter,
  serializeKey: serializeHistoryKey,

  validate: ({ doc, ops, origin }) => {
    const violation = validateLockOperations({ document: doc, operations: ops, origin })
    return violation
      ? {
          code: 'cancelled',
          message: readLockViolationMessage(violation.reason, violation.operation)
        }
      : undefined
  },

  createContext: (ctx) => createWhiteboardReduceContext(ctx),

  beforeEach: (ctx, op) => {
    collectWhiteboardHistory(ctx, op)
  },

  handlers: {
    'document.replace': reduceDocumentOperation,
    'document.background': reduceDocumentOperation,
    'canvas.order.move': reduceCanvasOperation,
    'node.create': reduceNodeOperation,
    'node.restore': reduceNodeOperation,
    'node.field.set': reduceNodeOperation,
    'node.field.unset': reduceNodeOperation,
    'node.record.set': reduceNodeOperation,
    'node.record.unset': reduceNodeOperation,
    'node.delete': reduceNodeOperation,
    'edge.create': reduceEdgeOperation,
    'edge.restore': reduceEdgeOperation,
    'edge.field.set': reduceEdgeOperation,
    'edge.field.unset': reduceEdgeOperation,
    'edge.record.set': reduceEdgeOperation,
    'edge.record.unset': reduceEdgeOperation,
    'edge.delete': reduceEdgeOperation,
    'group.create': reduceGroupOperation,
    'group.delete': reduceGroupOperation,
    'mindmap.create': reduceMindmapOperation,
    'mindmap.delete': reduceMindmapOperation,
    'mindmap.topic.insert': reduceMindmapOperation,
    'mindmap.topic.move': reduceMindmapOperation,
    'mindmap.topic.delete': reduceMindmapOperation
  },

  settle: (ctx) => {
    ctx.reconcile.flush()
  },

  done: (ctx) => finishWhiteboardReduce(ctx),

  emptyExtra: () => createEmptyWhiteboardReduceExtra()
}
```

要点：

- history collect 继续集中，不下放到每个 handler。
- reconcile 放在 `settle`。
- `done` 生成 whiteboard 自己的 extra。

## 9. Whiteboard 一次性迁移方案

## 9.1 第一步：先建 `@shared/reducer`

新增包：

```txt
shared/reducer
```

首批只实现 whiteboard 所需最小能力：

- `Reducer`
- `ReducerSpec`
- `ReducerContext`
- `ReducerResult`
- `ReducerDraftAdapter`

不做兼容 wrapper，不导出旧 primitives。

## 9.2 第二步：whiteboard 直接切到新 reducer

直接新增：

- `whiteboard-core/src/reducer/spec.ts`
- `whiteboard-core/src/reducer/context.ts`
- `whiteboard-core/src/reducer/history.ts`
- `whiteboard-core/src/reducer/extra.ts`
- `whiteboard-core/src/reducer/handlers/*`

同时把 `whiteboard-engine/src/mutation/spec.ts` 改成直接调用：

```ts
whiteboardReducer.reduce({ doc, ops, origin })
```

不再经过：

```ts
reduceOperations(...)
applyWhiteboardOperations(...)
```

## 9.3 第三步：迁移 handler 到领域 ctx

迁移目标不是“先包一层旧 tx 继续跑很久”，而是尽快把 handler 改成只依赖 `WhiteboardReduceCtx`。

应该系统替换掉下面这些访问模式：

```ts
tx._runtime.draft
tx._runtime.changes
tx._runtime.dirty
tx._runtime.reconcile.tasks
tx.inverse
changeSet.markUpdated(...)
```

改成：

```ts
ctx.read.*
ctx.write.*
ctx.mark.*
ctx.dirty.*
ctx.reconcile.*
ctx.inverse.*
```

## 9.4 第四步：删除旧实现

当 engine 和 handler 已切完后，直接删除：

- `whiteboard-core/src/kernel/reduce/*`
- `whiteboard-engine/src/mutation/apply.ts`
- `shared/mutation/src/apply.ts`
- `shared/mutation` 中 apply 相关导出

如果 `@shared/core` 中的下面这些工具只剩 reducer 内部需要，则移动到 `@shared/reducer/internal/*` 或直接并入实现：

- `mutationContext`
- `mutationTx`
- `operationBuffer`
- `historyFootprint`
- `changeSet`
- `mutationTrace`

迁移完成后，whiteboard reducer 路径不应该再直接 import 这些工具。

## 10. 明确删除清单

迁移完成后，应明确不存在下面这些长期入口：

- `@shared/mutation.apply`
- `ApplyCtx`
- `ApplyResult`
- `Model`
- `@whiteboard/core/kernel.reduceOperations`
- `whiteboard-core/kernel/reduce/runtime.ts`
- `whiteboard-core/kernel/reduce/tx.ts`
- `whiteboard-core/kernel/reduce/types.ts`
- `whiteboard-core/kernel/reduce/dispatch.ts`
- `whiteboard-engine/mutation/apply.ts`

同时，whiteboard reducer handler 内不应再出现：

- `tx._runtime`
- `changeSet.mark*`
- `historyFootprint.*`
- `operationBuffer.*`
- `mutationTrace.*`

## 11. 验收标准

## 11.1 shared

- `@shared/reducer` 成为唯一 reduce runtime。
- `@shared/mutation` 不再导出 `apply` 相关 API。
- reducer primitives 不再是 public surface。

## 11.2 whiteboard

- `whiteboard-engine` 直接使用 `whiteboardReducer`。
- `whiteboard-core` 不再从 `kernel` 导出 reducer。
- whiteboard reducer handler 只依赖 `WhiteboardReduceCtx`。
- history collect 由集中 hook 处理，不散落到每个 handler。
- reducer 路径不再直接依赖 `@shared/core` 的 reducer primitives。

## 11.3 tree cleanliness

- 没有兼容别名。
- 没有双轨入口。
- 没有旧 runtime 残留文件。
- 命名上只保留 `Reducer` / `reducer`，不再混用 `apply model`、`reduce tx`、`mutation tx` 这类旧术语。

## 12. 结论

`shared/reducer` 应该被设计成：

- 薄 shared runtime
- 厚领域 ctx adapter
- 集中的 lifecycle hook
- 明确替代 `shared/mutation.apply`

whiteboard 的目标不是“把现有 `kernel/reduce` 原样搬家”，而是：

- shared 层只保留通用 reduce runtime
- whiteboard 层只保留白板语义
- 旧的 reducer plumbing 直接删除

这样才是真正降低 `whiteboard-core` 复杂度，而不是把复杂度换个目录名继续保留。

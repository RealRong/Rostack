# Whiteboard Write API

本文定义 whiteboard 写入主轴的最终 API、命名与实施方案。

本文不重复设计思路，只定义长期最优下：

- `core` 负责什么
- `engine` 负责什么
- `editor` 负责什么
- 哪些 API 保留
- 哪些 API 必须删除
- 实施顺序是什么

相关文档：

- [`WHITEBOARD_REDUCER_API.zh-CN.md`](/Users/realrong/Rostack/WHITEBOARD_REDUCER_API.zh-CN.md)
- [`WHITEBOARD_REDUCER_RUNTIME_FINAL_ARCHITECTURE.zh-CN.md`](/Users/realrong/Rostack/WHITEBOARD_REDUCER_RUNTIME_FINAL_ARCHITECTURE.zh-CN.md)

---

## 1. 最终主轴

长期最优下，写入链路固定为：

1. `editor.write.*`
2. `engine.execute(command, { origin })` / `engine.apply(ops, { origin })`
3. `engine.write.compile.*`（仅 `execute`）
4. `core.reduceOperations(document, ops, { origin })`
5. `engine.commitDraft(draft, effect)`
6. `editor session / preview / selection reconcile`

约束：

- `editor` 不直接拼 `Operation[]`
- `engine` 不在 reducer 之后再隐式修改 `Document`
- `core` 不处理 command 语义
- 持久写入一律以 shared operation 为唯一事实

---

## 2. 分层职责

## 2.1 `core`

`core` 只负责：

- operation apply
- inverse 收集
- change / invalidation 收集
- reconcile
- reducer result

`core` 不负责：

- command compile
- editor 布局测量
- history capture 策略
- commit store
- document sanitize after reduce

## 2.2 `engine`

`engine` 只负责：

- semantic command API
- command -> operation compile
- id 分配
- origin 贯穿
- history capture
- commit store
- read invalidate

`engine` 不负责：

- preview state
- interaction session state
- live patch feedback
- reducer 之后的 document rewrite

## 2.3 `editor`

`editor` 只负责：

- UI intent -> semantic command
- layout pre-measure
- selection / tool / preview 协调
- convenience write facade

`editor` 不负责：

- whole-array diff
- aggregate ownership 推导
- collection move / insert / delete diff
- operation 编译
- 持久写入前读取 live preview 再回写

---

## 3. 最终模块

## 3.1 `whiteboard-core`

`whiteboard/packages/whiteboard-core/src/kernel/reduce/` 的最终约束：

- reducer 入口只暴露 `reduceOperations`
- handler 只调用 `tx.*`
- reconcile 只存在于 `core`
- reducer 之后不再存在第二段写入

## 3.2 `whiteboard-engine`

长期最优下，`whiteboard/packages/whiteboard-engine/src/write/` 收敛为：

- `index.ts`
- `types.ts`
- `draft.ts`
- `commit.ts`
- `compile/index.ts`
- `compile/tx.ts`
- `compile/document.ts`
- `compile/canvas.ts`
- `compile/node.ts`
- `compile/group.ts`
- `compile/edge.ts`
- `compile/mindmap.ts`

要求：

- 删除 `planner.ts`
- 不再保留一个巨型 `switch`
- compile 模块按命名空间拆分
- compile handler 只调用 `tx.*`

## 3.3 `whiteboard-editor`

长期最优下，`whiteboard/packages/whiteboard-editor/src/write/` 收敛为：

- `index.ts`
- `types.ts`
- `document.ts`
- `canvas.ts`
- `node.ts`
- `group.ts`
- `edge/index.ts`
- `edge/label.ts`
- `edge/route.ts`
- `mindmap/index.ts`
- `mindmap/root.ts`
- `mindmap/topic.ts`
- `mindmap/branch.ts`
- `history.ts`

要求：

- `document` 不再承载 `canvas.delete`、`canvas.order`、`group.merge`
- `edge` 的 label / route 写入拆到独立命名空间
- `mindmap` 的 root / topic / branch 写入拆到独立命名空间

---

## 4. 顶层类型

## 4.1 `WriteDraft`

`engine` 内部写入草稿统一为：

```ts
type WriteDraft<T = void> =
  | CommandFailure
  | {
      ok: true
      origin: Origin
      doc: Document
      ops: readonly Operation[]
      inverse: readonly Operation[]
      changes: ChangeSet
      invalidation: Invalidation
      value: T
    }
```

约束：

- `origin` 必须贯穿
- `document.replace` 也必须走 `execute -> compile -> reduce`

## 4.2 `Commit`

最终 commit contract：

```ts
type Commit = {
  rev: number
  at: number
  origin: Origin
  doc: Document
  ops: readonly Operation[]
  changes: ChangeSet
}
```

约束：

- history capture / reset 只使用 `draft.origin` 与 `commitDraft(..., effect)`
- read invalidate 只使用 `draft.invalidation`，不进入公开 `Commit`
- `commit` 不允许再隐式改 `doc`

## 4.3 `Writer`

最终 engine writer 接口：

```ts
type Writer = {
  execute: <C extends Command>(
    command: C,
    origin?: Origin
  ) => WriteDraft<CommandOutput<C>>

  apply: (
    ops: readonly Operation[],
    origin?: Origin
  ) => WriteDraft

  undo: () => WriteDraft
  redo: () => WriteDraft

  history: {
    configure(config: Partial<HistoryConfig>): void
    get(): HistoryState
    subscribe(listener: () => void): () => void
    clear(): void
  }
}
```

约束：

- `inverse` 只存在于 `WriteDraft`，不进入公开 `Commit`
- history capture 属于 `engine.commitDraft` 内部职责，不暴露为 `Writer` API
- whole-document replace 不再保留 `Writer.replace` 旁路

---

## 5. `engine.execute` / `engine.apply`

## 5.1 `execute`

最终 contract：

```ts
type Engine = {
  execute: <C extends Command>(
    command: C,
    options?: {
      origin?: Origin
    }
  ) => CommandResult<CommandOutput<C>>
}
```

执行顺序固定为：

1. `compileCommand`
2. `reduceOperations`
3. `commitDraft(draft, effect)`

要求：

- `execute` 不允许直接碰 history
- `execute` 不允许在 reducer 之后调用 `normalizeDocument`
- `document.replace` 不允许绕过 compile / reduce

## 5.2 `apply`

`apply` 只用于：

- collab incoming ops
- import / migration
- internal replay

最终 contract：

```ts
type Engine = {
  apply: (
    ops: readonly Operation[],
    options?: {
      origin?: Origin
    }
  ) => CommandResult
}
```

要求：

- `apply` 不走 command compiler
- `apply` 也必须正确写入 `origin`
- `apply` 不携带 command output

## 5.3 `commitDraft`

`commitDraft` 是 `engine` 内部编排 helper，不进入公开 `Engine` API。

```ts
type CommitHistoryEffect =
  | 'record'
  | 'skip'
  | 'reset'

type commitDraft = <T>(
  draft: WriteDraft<T>,
  effect: CommitHistoryEffect
) => CommandResult<T>
```

约束：

- history effect 由 commit 入口决定，不进入 `WriteDraft`
- 普通 `execute(command)` 默认使用 `record`
- `execute(document.replace)` 使用 `reset`
- `apply(ops)`、`undo()`、`redo()` 使用 `skip`
- read invalidate 只使用 `draft.invalidation`

---

## 6. Engine Compiler API

## 6.1 总入口

```ts
export const compileCommand: (
  command: Command,
  input: {
    document: Document
    registries: CoreRegistries
    ids: IdApi
    nodeSize: Size
  }
) => CompileResult
```

```ts
type CompileResult<T = unknown> =
  | {
      ok: true
      ops: readonly Operation[]
      output: T
    }
  | CommandFailure<'invalid' | 'cancelled'>
```

## 6.2 `CommandCompilerTx`

长期最优下，compiler 使用 tx，而不是巨型 `planner.ts`。

```ts
type CommandCompilerTx = {
  read: {
    document: {
      get(): Document
    }

    canvas: {
      order(): readonly CanvasItemRef[]
    }

    node: {
      get(id: NodeId): Node | undefined
      require(id: NodeId): Node
    }

    edge: {
      get(id: EdgeId): Edge | undefined
      require(id: EdgeId): Edge
    }

    group: {
      get(id: GroupId): Group | undefined
      require(id: GroupId): Group
    }

    mindmap: {
      get(id: MindmapId): MindmapRecord | undefined
      require(id: MindmapId): MindmapRecord
    }
  }

  ids: {
    node(): NodeId
    edge(): EdgeId
    edgeLabel(): string
    edgeRoutePoint(): string
    group(): GroupId
    mindmap(): MindmapId
  }

  emit(op: Operation): void

  fail: {
    invalid(message: string, details?: unknown): never
    cancelled(message: string, details?: unknown): never
  }
}
```

约束：

- compile handler 不直接返回 `Operation[]`
- compile handler 不自己维护全局 `operations` 数组
- compile handler 不直接处理 history
- aggregate 专属断言 helper 不进入 `tx` 基础 contract

---

## 7. 最终 Command 命名

原则：

- 删除 `patch`
- entity 统一使用 `update`
- collection 使用 `insert` / `update` / `move` / `delete`
- aggregate 专属语义使用明确命名

## 7.1 `document`

```ts
type DocumentCommand =
  | {
      type: 'document.replace'
      document: Document
    }
  | {
      type: 'document.insert'
      slice: Slice
      options?: SliceInsertOptions
    }
  | {
      type: 'document.background.set'
      background?: Document['background']
    }
```

## 7.2 `canvas`

```ts
type CanvasCommand =
  | {
      type: 'canvas.delete'
      refs: readonly CanvasItemRef[]
    }
  | {
      type: 'canvas.duplicate'
      refs: readonly CanvasItemRef[]
    }
  | {
      type: 'canvas.order.move'
      refs: readonly CanvasItemRef[]
      mode: OrderMode
    }
```

## 7.3 `node`

保留 `NodeUpdateInput`。

```ts
type NodeCommand =
  | {
      type: 'node.create'
      input: NodeInput
    }
  | {
      type: 'node.update'
      updates: readonly {
        id: NodeId
        input: NodeUpdateInput
      }[]
    }
  | {
      type: 'node.move'
      ids: readonly NodeId[]
      delta: Point
    }
  | {
      type: 'node.align'
      ids: readonly NodeId[]
      mode: NodeAlignMode
    }
  | {
      type: 'node.distribute'
      ids: readonly NodeId[]
      mode: NodeDistributeMode
    }
  | {
      type: 'node.delete'
      ids: readonly NodeId[]
    }
  | {
      type: 'node.deleteCascade'
      ids: readonly NodeId[]
    }
  | {
      type: 'node.duplicate'
      ids: readonly NodeId[]
    }
```

## 7.4 `group`

```ts
type GroupCommand =
  | {
      type: 'group.merge'
      target: {
        nodeIds?: readonly NodeId[]
        edgeIds?: readonly EdgeId[]
      }
    }
  | {
      type: 'group.order.move'
      ids: readonly GroupId[]
      mode: OrderMode
    }
  | {
      type: 'group.ungroup'
      ids: readonly GroupId[]
    }
```

## 7.5 `edge`

删除 `EdgePatch` command surface，改成 `EdgeUpdateInput`。

```ts
type EdgeFieldPatch = {
  source?: EdgeEnd
  target?: EdgeEnd
  type?: EdgeType
  locked?: boolean
  groupId?: GroupId
  textMode?: EdgeTextMode
}

type EdgeRecordMutation =
  | { scope: 'data' | 'style'; op: 'set'; path?: string; value: unknown }
  | { scope: 'data' | 'style'; op: 'unset'; path: string }

type EdgeUpdateInput = {
  fields?: EdgeFieldPatch
  records?: readonly EdgeRecordMutation[]
}

type EdgeCommand =
  | {
      type: 'edge.create'
      input: EdgeInput
    }
  | {
      type: 'edge.update'
      updates: readonly {
        id: EdgeId
        input: EdgeUpdateInput
      }[]
    }
  | {
      type: 'edge.move'
      ids: readonly EdgeId[]
      delta: Point
    }
  | {
      type: 'edge.reconnect'
      edgeId: EdgeId
      end: 'source' | 'target'
      target: EdgeEnd
    }
  | {
      type: 'edge.delete'
      ids: readonly EdgeId[]
    }
```

## 7.6 `edge.label`

```ts
type EdgeLabelUpdateInput = {
  fields?: {
    text?: string
    t?: number
    offset?: number
  }
  records?: readonly (
    | { scope: 'data' | 'style'; op: 'set'; path?: string; value: unknown }
    | { scope: 'data' | 'style'; op: 'unset'; path: string }
  )[]
}

type EdgeLabelCommand =
  | {
      type: 'edge.label.insert'
      edgeId: EdgeId
      label: {
        text?: string
        t?: number
        offset?: number
        style?: Record<string, unknown>
        data?: Record<string, unknown>
      }
      to?: {
        kind: 'start'
      } | {
        kind: 'end'
      } | {
        kind: 'before'
        labelId: string
      } | {
        kind: 'after'
        labelId: string
      }
    }
  | {
      type: 'edge.label.update'
      edgeId: EdgeId
      labelId: string
      input: EdgeLabelUpdateInput
    }
  | {
      type: 'edge.label.move'
      edgeId: EdgeId
      labelId: string
      to: {
        kind: 'start'
      } | {
        kind: 'end'
      } | {
        kind: 'before'
        labelId: string
      } | {
        kind: 'after'
        labelId: string
      }
    }
  | {
      type: 'edge.label.delete'
      edgeId: EdgeId
      labelId: string
    }
```

## 7.7 `edge.route`

```ts
type EdgeRouteCommand =
  | {
      type: 'edge.route.insert'
      edgeId: EdgeId
      point: {
        x: number
        y: number
      }
      to?: {
        kind: 'start'
      } | {
        kind: 'end'
      } | {
        kind: 'before'
        pointId: string
      } | {
        kind: 'after'
        pointId: string
      }
    }
  | {
      type: 'edge.route.update'
      edgeId: EdgeId
      pointId: string
      fields: {
        x?: number
        y?: number
      }
    }
  | {
      type: 'edge.route.set'
      edgeId: EdgeId
      route: {
        kind: 'auto'
      } | {
        kind: 'manual'
        points: Point[]
      }
    }
  | {
      type: 'edge.route.move'
      edgeId: EdgeId
      pointId: string
      to: {
        kind: 'start'
      } | {
        kind: 'end'
      } | {
        kind: 'before'
        pointId: string
      } | {
        kind: 'after'
        pointId: string
      }
    }
  | {
      type: 'edge.route.delete'
      edgeId: EdgeId
      pointId: string
    }
  | {
      type: 'edge.route.clear'
      edgeId: EdgeId
    }
```

## 7.8 `mindmap`

```ts
type MindmapCommand =
  | {
      type: 'mindmap.create'
      input: MindmapCreateInput
    }
  | {
      type: 'mindmap.delete'
      ids: readonly MindmapId[]
    }
  | {
      type: 'mindmap.layout.set'
      id: MindmapId
      layout: Partial<MindmapLayoutSpec>
    }
  | {
      type: 'mindmap.root.move'
      id: MindmapId
      position: Point
    }
```

## 7.9 `mindmap.topic`

删除 `mindmap.topic.patch`，改成 `mindmap.topic.update`。

```ts
type MindmapTopicUpdateInput = {
  fields?: {
    size?: Size
    rotation?: number
    locked?: boolean
  }
  records?: readonly (
    | { scope: 'data' | 'style'; op: 'set'; path?: string; value: unknown }
    | { scope: 'data' | 'style'; op: 'unset'; path: string }
  )[]
}

type MindmapTopicCommand =
  | {
      type: 'mindmap.topic.insert'
      id: MindmapId
      input: MindmapInsertInput
    }
  | {
      type: 'mindmap.topic.move'
      id: MindmapId
      input: MindmapMoveSubtreeInput
    }
  | {
      type: 'mindmap.topic.delete'
      id: MindmapId
      input: MindmapRemoveSubtreeInput
    }
  | {
      type: 'mindmap.topic.clone'
      id: MindmapId
      input: MindmapCloneSubtreeInput
    }
  | {
      type: 'mindmap.topic.update'
      id: MindmapId
      updates: readonly {
        topicId: NodeId
        input: MindmapTopicUpdateInput
      }[]
    }
  | {
      type: 'mindmap.topic.collapse.set'
      id: MindmapId
      topicId: NodeId
      collapsed?: boolean
    }
```

## 7.10 `mindmap.branch`

删除 `mindmap.branch.patch`，改成 `mindmap.branch.update`。

```ts
type MindmapBranchUpdateInput = {
  fields?: {
    color?: string
    line?: MindmapBranchLineKind
    width?: number
    stroke?: MindmapStrokeStyle
  }
}

type MindmapBranchCommand = {
  type: 'mindmap.branch.update'
  id: MindmapId
  updates: readonly {
    topicId: NodeId
    input: MindmapBranchUpdateInput
  }[]
}
```

---

## 8. Editor Write API

最终 `EditorWrite` 根命名空间：

- `write.document`
- `write.canvas`
- `write.node`
- `write.group`
- `write.edge`
- `write.mindmap`
- `write.history`

## 8.1 `write.document`

```ts
type DocumentWrite = {
  replace(document: Document): CommandResult
  insert(
    slice: Slice,
    options?: SliceInsertOptions
  ): CommandResult<Omit<SliceInsertResult, 'operations'>>
  background: {
    set(background?: Document['background']): CommandResult
  }
}
```

## 8.2 `write.canvas`

```ts
type CanvasWrite = {
  delete(refs: readonly CanvasItemRef[]): CommandResult
  duplicate(
    refs: readonly CanvasItemRef[]
  ): CommandResult<Omit<SliceInsertResult, 'operations'>>
  order: {
    move(refs: readonly CanvasItemRef[], mode: OrderMode): CommandResult
  }
}
```

## 8.3 `write.node`

```ts
type NodeWrite = {
  create(...): CommandResult<{ nodeId: NodeId }>
  update(id: NodeId, input: NodeUpdateInput): CommandResult
  updateMany(
    updates: readonly {
      id: NodeId
      input: NodeUpdateInput
    }[]
  ): CommandResult
  move(...): CommandResult
  align(...): CommandResult
  distribute(...): CommandResult
  delete(ids: readonly NodeId[]): CommandResult
  deleteCascade(ids: readonly NodeId[]): CommandResult
  duplicate(ids: readonly NodeId[]): CommandResult<{
    nodeIds: readonly NodeId[]
    edgeIds: readonly EdgeId[]
  }>
}
```

约束：

- 可以做 layout pre-measure
- 不允许读取 live preview 再做持久写入 compile
- `lock` / `shape` / `style` / `text` 如保留，只能是本地 facade sugar，最终统一编译为 `node.update`

## 8.4 `write.group`

```ts
type GroupWrite = {
  merge(target: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }): CommandResult<{ groupId: GroupId }>
  order: {
    move(ids: readonly GroupId[], mode: OrderMode): CommandResult
  }
  ungroup(ids: readonly GroupId[]): CommandResult<{
    nodeIds: readonly NodeId[]
    edgeIds: readonly EdgeId[]
  }>
}
```

## 8.5 `write.edge`

最终拆分为：

```ts
type EdgeWrite = {
  create(...): CommandResult<{ edgeId: EdgeId }>
  update(id: EdgeId, input: EdgeUpdateInput): CommandResult
  updateMany(
    updates: readonly {
      id: EdgeId
      input: EdgeUpdateInput
    }[]
  ): CommandResult
  move(...): CommandResult
  reconnect(...): CommandResult
  delete(ids: readonly EdgeId[]): CommandResult

  label: {
    insert(...): CommandResult<{ labelId: string }>
    update(...): CommandResult
    move(...): CommandResult
    delete(...): CommandResult
  }

  route: {
    insert(...): CommandResult<{ pointId: string }>
    set(...): CommandResult
    update(...): CommandResult
    move(...): CommandResult
    delete(...): CommandResult
    clear(...): CommandResult
  }
}
```

约束：

- 删除基于 `labels: EdgeLabel[]` 的 whole-array 回写
- 删除基于 `route.points: Point[]` 的 whole-array 回写
- `edge.route.set` 如保留，只能是语义 facade，必须在 engine compile 层下沉成 point 级 operation
- `edge.style.*` / `edge.type.*` / `edge.lock.*` / `edge.textMode.*` 仅作为 facade helper，最终都编译为 `edge.update`

## 8.6 `write.mindmap`

最终拆分为：

```ts
type MindmapWrite = {
  create(input: MindmapCreateInput): CommandResult<{
    mindmapId: MindmapId
    rootId: NodeId
  }>
  delete(ids: readonly MindmapId[]): CommandResult

  layout: {
    set(id: MindmapId, layout: Partial<MindmapLayoutSpec>): CommandResult
  }

  root: {
    move(id: MindmapId, position: Point): CommandResult
  }

  topic: {
    insert(id: MindmapId, input: MindmapInsertInput): CommandResult<{ nodeId: NodeId }>
    move(id: MindmapId, input: MindmapMoveSubtreeInput): CommandResult
    delete(id: MindmapId, input: MindmapRemoveSubtreeInput): CommandResult
    clone(id: MindmapId, input: MindmapCloneSubtreeInput): CommandResult<{
      nodeId: NodeId
      map: Record<NodeId, NodeId>
    }>
    update(
      id: MindmapId,
      updates: readonly {
        topicId: NodeId
        input: MindmapTopicUpdateInput
      }[]
    ): CommandResult
    collapse: {
      set(id: MindmapId, topicId: NodeId, collapsed?: boolean): CommandResult
    }
  }

  branch: {
    update(
      id: MindmapId,
      updates: readonly {
        topicId: NodeId
        input: MindmapBranchUpdateInput
      }[]
    ): CommandResult
  }
}
```

约束：

- `moveRoot` 必须发 `mindmap.root.move`
- `topic style` 不再通过 `mindmap.topic.patch`
- `branch style` 不再通过 `mindmap.branch.patch`

---

## 9. 必删项

以下设计必须删除：

- `engine/write/planner.ts`
- reducer 后 `normalizeDocument`
- `engine` commit 阶段写死 `origin: 'user'`
- 公开 `Commit.inverse`
- 公开 `Commit.invalidation`
- 公开 `Commit.impact`
- `WriteDraft.kind`
- `WriteDraft.historyMode`
- `Writer.apply(batch)`
- `Writer.replace`
- `engine.execute` 对 `document.replace` 的绕行写入
- `document` namespace 下的 `canvas` / `group` 写入口
- `node.patch`
- `edge.patch`
- `mindmap.topic.patch`
- `mindmap.branch.patch`
- editor `edge` label whole-array patch
- editor `edge` route whole-array patch
- editor `mindmap.insertByPlacement` 进入公开 write API
- editor 基于 live preview 的持久写入 compile

---

## 10. 强制约束

## 10.1 写入事实

- persisted write 的唯一事实是 `Operation[]`
- reducer 是唯一 apply 层
- commit doc 必须等于 reducer 输出 doc
- whole-document replace 也必须走 command -> operation -> reduce

## 10.2 origin

- `origin` 必须从 `editor` / external caller 传入 `engine`
- `engine` 必须把 `origin` 写进 `WriteDraft`
- `engine` 必须把 `origin` 写进 `Commit`
- history capture / reset / replay 必须使用真实 `origin`

## 10.3 history

- history effect 必须由 `commitDraft(..., effect)` 的入口参数决定
- history effect 不得进入 `WriteDraft`
- `execute(command)` 默认使用 `record`
- `execute(document.replace)` 使用 `reset`
- `apply(ops)`、`undo()`、`redo()` 使用 `skip`

## 10.4 读模型

- editor compile persisted write 只能使用 committed read
- preview / feedback 只能服务于渲染与交互
- preview state 不得参与 `Operation` 编译

## 10.5 normalize / sanitize

- reducer 后不得再 `sanitizeDocument`
- create/update 输入需要 normalize 时，必须前置到：
  - editor layout facade
  - engine compile normalize
  - 或显式 operation sanitize

---

## 11. 实施方案

## 阶段 1：收缩 draft / commit / apply contract

- 在 `engine` 增加 `WriteDraft.origin`
- 从 `WriteDraft` 移除 `kind`
- 在 `engine` 增加 `Commit.origin`
- 从 `Commit` 移除 `inverse`
- 从 `Commit` 移除 `invalidation`
- 从 `Commit` 移除 `impact`
- `Writer.apply` / `Engine.apply` 改为直接接收 `Operation[]`
- `apply` 不再携带 `output`
- 新增 `commitDraft(draft, effect)`
- history capture 改为使用 `draft.origin` 与 `effect`

完成标准：

- remote / system 写入不会再进入 user undo 栈
- `apply` 不再承载伪 command 语义
- history 行为不再塞进 `WriteDraft`
- `Commit` 只保留公开消费需要的事实

## 阶段 2：去掉 whole-document replace 旁路

- 删除 `Writer.replace`
- 删除 `engine.execute` 中对 `document.replace` 的绕行写入
- `document.replace` 改为普通 semantic command，统一走 compile / reduce / commit
- history reset 改为由 `commitDraft(..., 'reset')` 驱动

完成标准：

- whole-document replace 不再绕过 command -> operation 主轴

## 阶段 3：去掉 reducer 后 document rewrite

- 删除 `reduce -> normalizeDocument -> commit` 这段后置改写
- `sanitizeDocument` 只保留为输入归一化 helper，或直接删除
- 必要 bootstrap size 改为：
  - editor layout pre-measure
  - engine compile create normalize

完成标准：

- reducer 输出 doc 与 commit doc 完全一致

## 阶段 4：重做 command surface

- 删除 `node.patch`
- 删除 `edge.patch`
- 删除 `mindmap.topic.patch`
- 删除 `mindmap.branch.patch`
- 增加 `node.update`
- 增加 `edge.update`
- 增加 `edge.label.*`
- 增加 `edge.route.*`
- 增加 `mindmap.layout.set`
- 增加 `mindmap.root.move`
- 增加 `mindmap.topic.update`
- 增加 `mindmap.topic.collapse.set`
- 增加 `mindmap.branch.update`
- `document.background` 改名为 `document.background.set`
- `canvas.order` 改名为 `canvas.order.move`
- `group.order` 改名为 `group.order.move`

完成标准：

- command type 不再包含 `patch`

## 阶段 5：拆掉 `planner.ts`

- 新建 `compile/tx.ts`
- 新建 `compile/document.ts`
- 新建 `compile/canvas.ts`
- 新建 `compile/node.ts`
- 新建 `compile/group.ts`
- 新建 `compile/edge.ts`
- 新建 `compile/mindmap.ts`
- `compile/index.ts` 只做 family dispatch

完成标准：

- engine compile 不再有单文件复杂中心

## 阶段 6：收缩 editor facade

- 新增 `write/canvas.ts`
- 新增 `write/group.ts`
- 把 `document.ts` 中 canvas / group 写入口迁出
- 把 `edge.ts` 中 label / route 拆到子模块
- 把 `mindmap.ts` 拆为 `root` / `topic` / `branch`
- `edge.label.add/patch/remove` 改为 `insert/update/delete`
- `mindmap.moveRoot` 改为直接发 `mindmap.root.move`
- `insertByPlacement` 下沉回 action / input helper，不进入公开 `write` contract

完成标准：

- editor facade 与 engine command namespace 一一对应

## 阶段 7：清理 whole-array diff

- 删除 editor `edge.labels` whole-array patch 逻辑
- 删除 editor `edge.route` whole-array patch 逻辑
- 删除 engine compiler 中针对 `EdgePatch.labels` / `EdgePatch.route` 的 coarse diff compile
- label / route 只走 semantic subcommand

完成标准：

- label / route 不再经过粗粒度 patch surface

## 阶段 8：验证与清理

- 跑 `whiteboard-core` typecheck / test
- 跑 `whiteboard` workspace typecheck / test
- 删除废弃 command type
- 删除废弃 write helper
- 删除废弃 sanitize / planner / patch adapter

完成标准：

- 主轴只剩：
  - editor facade
  - engine compiler
  - core reducer

---

## 12. 最终验收标准

满足以下条件，写入主轴才算真正收束完成：

- `core` 只处理 operation
- `engine` 只处理 semantic command compile 与 commit
- `editor` 只处理 UI intent adapt
- reducer 后没有第二段写入
- history 按真实 `origin` 捕获
- whole-document replace 不再绕过 command -> operation
- `apply` 只接收 `Operation[]`，不再携带 `output`
- `Commit` 不暴露 undo 内部数据
- command surface 不再存在粗粒度 `patch`
- edge label / route 不再 whole-array 回写
- mindmap root / topic / branch 都有独立 semantic command
- 模块命名与命名空间一一对应

# Whiteboard MutationEngine 整体迁移方案

## 1. 文档目标

这份文档只回答一件事：

**Whiteboard 如何整体迁移到 `MutationEngine`，以及迁移完成后的 API 长什么样。**

这里不做兼容，不保留旧术语，不做双轨。

明确约束：

- `Command` 全量改为 `Intent`
- Whiteboard 写入内核全面迁移到 `new MutationEngine(...)`
- `query` 继续保留在 Whiteboard 领域层，不进入 shared mutation engine
- `string path` 全量改为 `Path`

---

## 2. 最终结论

Whiteboard 迁移完成后，整体结构应该变成三层：

1. `shared/mutation`：提供通用 `MutationEngine`
2. `whiteboard-engine` mutation 层：提供 `whiteboardMutationSpec`
3. `whiteboard-engine` 外层 engine：只负责 `query + public API`

最终主轴：

`Intent -> whiteboardMutationSpec.compile -> Operation[] -> MutationEngine.apply -> Write -> WhiteboardProjector -> EnginePublish`

Whiteboard 不再自己手写 commit orchestration。

---

## 3. 为什么 Whiteboard 应该先迁

Whiteboard 是最适合先落 `MutationEngine` 的项目，原因很直接：

- 写入链已经相对独立
- `query` 已经独立在 runtime/query
- `EngineWrite` 已经是标准 shared `Write`
- history / collab 已经大量 shared 化

Whiteboard 当前真正的问题不是“模型不够统一”，而是还保留了几层旧壳：

- `Command` 术语
- `write/compile` 命名
- runtime 里仍然手写 commit 过程
- record op 仍然用 `string path`

这些问题都适合在迁到 `MutationEngine` 时一次性清掉。

---

## 4. 迁移后的总体架构

## 4.1 包内分层

迁移后 `whiteboard/packages/whiteboard-engine/src` 应该明确分成三块：

- `mutation/`
- `runtime/`
- `query/`

其中：

- `mutation/` 负责 Whiteboard 写入语义接入 `MutationEngine`
- `runtime/` 负责组装 Whiteboard 外层 engine
- `query/` 负责读链

## 4.2 迁移后目录建议

```ts
whiteboard/packages/whiteboard-engine/src/
  mutation/
    spec.ts
    compile/
      index.ts
      document.ts
      canvas.ts
      node.ts
      group.ts
      edge.ts
      mindmap.ts
      tx.ts
    apply.ts
    publish.ts
    types.ts
  runtime/
    engine.ts
    state.ts
  query/
    index.ts
    createQuery.ts
  types/
    intent.ts
    result.ts
    engineWrite.ts
```

这里的重点不是目录名本身，而是边界：

- compile / apply / publish 都归到 `mutation/`
- runtime 不再实现写入内核
- query 不再碰 mutation 编排

---

## 5. 迁移后的核心内部 API

## 5.1 `Intent`

当前 `Command` 全量改为 `Intent`。

```ts
export type Intent =
  | DocumentIntent
  | CanvasIntent
  | NodeIntent
  | GroupIntent
  | EdgeIntent
  | MindmapIntent

export type EngineIntent = Intent

export type IntentOutput<I extends Intent> =
  I extends { type: 'document.insert' | 'canvas.duplicate' }
    ? Omit<SliceInsertResult, 'operations'>
    : I extends { type: 'node.create' }
      ? { nodeId: NodeId }
      : I extends { type: 'node.duplicate' }
        ? { nodeIds: readonly NodeId[]; edgeIds: readonly EdgeId[] }
        : I extends { type: 'group.merge' }
          ? { groupId: GroupId }
          : I extends { type: 'group.ungroup' }
            ? { nodeIds: readonly NodeId[]; edgeIds: readonly EdgeId[] }
            : I extends { type: 'edge.create' }
              ? { edgeId: EdgeId }
              : I extends { type: 'edge.label.insert' }
                ? { labelId: string }
                : I extends { type: 'edge.route.insert' }
                  ? { pointId: string }
                  : I extends { type: 'mindmap.create' }
                    ? { mindmapId: MindmapId; rootId: MindmapNodeId }
                    : I extends { type: 'mindmap.topic.insert' }
                      ? { nodeId: MindmapNodeId }
                      : I extends { type: 'mindmap.topic.clone' }
                        ? { nodeId: MindmapNodeId; map: Record<MindmapNodeId, MindmapNodeId> }
                        : void
```

这一步只做一件事：把 Whiteboard 从 `Command` 语义切到统一的 `Intent` 语义。

## 5.2 `IntentResult`

当前 `CommandResult` / `CommandFailure` 改为：

```ts
export type IntentFailure<C extends string = string> = {
  ok: false
  error: ErrorInfo<C>
}

export type IntentResult<T = void, C extends string = string> =
  | {
      ok: true
      data: T
      write: EngineWrite
    }
  | IntentFailure<C>

export type ExecuteResult<I extends Intent = Intent> =
  IntentResult<IntentOutput<I>>
```

Whiteboard 外层不再出现 `CommandResult` 这个命名。

## 5.3 `EngineWrite`

`EngineWrite` 继续保留 shared `Write` 主轴，不再额外造本地格式。

```ts
export type EngineWrite = Write<
  Document,
  Operation,
  HistoryFootprint[number],
  {
    changes: ChangeSet
  }
>
```

这个形态不需要大改，关键是周边 runtime 改成真正围绕它工作。

## 5.4 `whiteboardMutationSpec`

Whiteboard 的写入接入面最终应该收口为一个 spec：

```ts
export type WhiteboardMutationPublish = {
  snapshot: Snapshot
  change: EngineChange
}

export type WhiteboardMutationSpec = MutationEngineSpec<
  Document,
  Intent,
  Operation,
  HistoryFootprint[number],
  WhiteboardMutationPublish,
  unknown,
  {
    changes: ChangeSet
  }
>

export const createWhiteboardMutationSpec = (input: {
  config: BoardConfig
  registries: CoreRegistries
}): WhiteboardMutationSpec => { ... }
```

这个 spec 只做四件事：

- `compile`：`Intent -> Operation[]`
- `apply`：`Operation[] -> doc / inverse / footprint / extra`
- `publish`：`Write -> snapshot / change`
- `history`：提供 footprint conflict 规则

Whiteboard 不需要在 runtime 里重新拼这些东西。

---

## 6. 迁移后的 public engine API

## 6.1 最终 public 形态

迁移后，`whiteboard-engine` 对外仍然只提供一个外层 engine，但它本质上是 `MutationEngine + Query` 的薄壳。

```ts
export interface Engine {
  readonly config: BoardConfig
  readonly query: EngineQuery
  readonly writes: WriteStream<EngineWrite>

  current(): EnginePublish
  subscribe(listener: (publish: EnginePublish) => void): () => void

  execute<I extends Intent>(
    intent: I,
    options?: ExecuteOptions
  ): ExecuteResult<I>

  apply(
    ops: readonly Operation[],
    options?: ApplyOptions
  ): IntentResult
}
```

这里最重要的变化只有两个：

- `Command` -> `Intent`
- 引擎内部的写入实现，全部转到 `MutationEngine`

## 6.2 `EnginePublish`

`EnginePublish` 可以继续保留当前读侧友好的形态，不需要为了 shared 化而改变。

```ts
export interface EnginePublish {
  rev: Revision
  snapshot: Snapshot
  change: EngineChange
}
```

原因很简单：

- 这是 Whiteboard 读链消费的结果
- 它属于领域 publish 模型，不属于 shared mutation engine

shared engine 只需要维护：

- `rev`
- `doc`
- `publish`

外层 engine 再把它映射成最终 `EnginePublish` 即可。

## 6.3 `createEngine`

迁移后，Whiteboard public 创建入口仍然可以保持简单：

```ts
export interface CreateEngineOptions {
  registries?: CoreRegistries
  document: Document
  onDocumentChange?: (document: Document) => void
  config?: Partial<BoardConfig>
}

export const createEngine = (options: CreateEngineOptions): Engine => { ... }
```

但它内部不再自己实现写入内核，而是：

1. 创建 `whiteboardMutationSpec`
2. 创建 `new MutationEngine({ doc, spec })`
3. 创建 `query`
4. 组装 public engine

---

## 7. 迁移后 runtime 的真实职责

迁移完成后，`runtime/engine.ts` 应该非常薄。

它只负责：

- 解析 config / registries
- 创建 `whiteboardMutationSpec`
- 创建 `MutationEngine`
- 把 mutation publish 映射成 `EnginePublish`
- 创建并暴露 `query`
- 透传 `execute / apply / writes / subscribe / current`

它不再负责：

- compile orchestration
- apply orchestration
- write 生成
- history capture
- 本地 commit 流程编排

这些全部交给 `MutationEngine`。

---

## 8. 迁移后 collab / local history 形态

## 8.1 local history

迁移后，Whiteboard 不应该再维护一层额外的 local history controller 包装来“模拟 engine 历史”。

正确形态是：

- 历史主控制器来自 `MutationEngine.history`
- Whiteboard collab 只做状态包装与可用性控制

也就是说：

- `mutationHistory.create(...)` 的创建点从 collab 包回收进 `MutationEngine`
- collab 侧只负责在 `canApply()` 等约束下调用 `engine.apply(...)`

## 8.2 collab

迁移后 `createYjsSession(...)` 的核心依赖关系不变，但要换成新的 engine 语义：

```ts
const coreSession = mutationCollab.create({
  actorId,
  engine: {
    doc: () => engine.current().snapshot.state.root,
    replace: (nextDocument, options) => engine.execute({
      type: 'document.replace',
      document: nextDocument
    }, {
      origin: toEngineOrigin(options?.origin)
    }).ok,
    apply: (ops, options) => engine.apply(ops, {
      origin: toEngineOrigin(options?.origin)
    }).ok,
    writes: engine.writes
  },
  ...
})
```

但这里有两个同步改动必须做：

- `document.replace` 这种意图继续保留为领域 intent，不再特殊走本地 replace runtime
- local history 从“私有 controller”改成直接包装 engine 内部 history

---

## 9. 必须同步完成的模型清理

Whiteboard 在迁到 `MutationEngine` 时，下面这些问题必须一起清掉，否则只是换壳，没有真正完成收口。

## 9.1 `Command` 全面删除

必须删除：

- `types/command.ts`
- `contracts/command.ts`
- `compileCommand`
- `CommandResult`
- `CommandFailure`

统一改成：

- `types/intent.ts`
- `contracts/intent.ts`
- `compileIntent`
- `IntentResult`
- `IntentFailure`

## 9.2 `string path` 全面删除

必须删除：

- operation 上的 `path: string`
- record path helper 里的 string split/join 兼容逻辑
- history key 里的 string path overlap 逻辑

统一改成：

- `Path`
- `path.key(...)`
- shared path 语义下的 overlap / identity

## 9.3 `write/` 目录不再作为长期命名

当前 `write/compile`、`write/apply` 的命名会误导结构边界。

迁移后应该改成：

- `mutation/compile`
- `mutation/apply`
- `mutation/publish`

因为这些模块本质上是 Whiteboard 对 shared mutation engine 的接入层。

---

## 10. 文件级迁移方案

## Phase 1：术语迁移

直接改名：

- `whiteboard/packages/whiteboard-engine/src/types/command.ts`
- `whiteboard/packages/whiteboard-engine/src/contracts/command.ts`

同时更新：

- `whiteboard/packages/whiteboard-engine/src/index.ts`
- `whiteboard/packages/whiteboard-engine/src/contracts/document.ts`
- `whiteboard/packages/whiteboard-engine/src/types/result.ts`

## Phase 2：mutation 接入层重组

从当前文件迁出并重组：

- `whiteboard/packages/whiteboard-engine/src/write/compile/index.ts`
- `whiteboard/packages/whiteboard-engine/src/write/compile/*.ts`
- `whiteboard/packages/whiteboard-engine/src/write/apply.ts`
- `whiteboard/packages/whiteboard-engine/src/change/build.ts`

形成：

- `mutation/spec.ts`
- `mutation/compile/*.ts`
- `mutation/apply.ts`
- `mutation/publish.ts`

## Phase 3：runtime 改成薄壳

重写：

- `whiteboard/packages/whiteboard-engine/src/runtime/engine.ts`

让它只做：

- `MutationEngine` 实例化
- query 组装
- public engine 暴露

删除本地 commit orchestration。

## Phase 4：history / collab 收口

调整：

- `whiteboard/packages/whiteboard-collab/src/localHistory.ts`
- `whiteboard/packages/whiteboard-collab/src/session.ts`

目标：

- local history 直接依赖 engine 内部 history
- collab 只做会话与 provider 包装

## Phase 5：Path 统一

重写：

- `whiteboard/packages/whiteboard-core/src/types/operations.ts`
- `whiteboard/packages/whiteboard-core/src/mutation/recordPath.ts`
- `whiteboard/packages/whiteboard-core/src/spec/history/key.ts`

目标：

- record op 全量改为 `Path`
- footprint path 规则同步升级

---

## 11. 删除清单

迁移完成后，下面这些旧层应当被删除：

- `write/` 作为长期架构命名
- `compileCommand`
- `Command*` 类型体系
- runtime 中的本地 commit orchestration
- collab 中额外的私有历史内核
- string path 兼容逻辑

如果这些层还在，说明 Whiteboard 只是“局部套用了 MutationEngine”，而不是完成了整体迁移。

---

## 12. 最终完成标准

当下面这些条件同时满足时，Whiteboard 才算完成迁移：

- Whiteboard 写入内核由 `new MutationEngine(...)` 驱动
- 外层 engine 只是 `MutationEngine + Query` 的薄壳
- public API 全面使用 `Intent`
- `EngineWrite` 继续使用 shared `Write`
- collab / history 围绕 engine 的 writes 和 history 运转
- record operation 与 footprint 全量使用 `Path`
- runtime 中不再存在手写 commit orchestration

---

## 13. 一句话结论

Whiteboard 的正确迁移方式不是“继续整理现有 engine”，而是：

**把 Whiteboard 的 compile / apply / publish 收口为 `whiteboardMutationSpec`，再让外层 engine 变成一个围绕 `new MutationEngine(...)` 的薄壳。**

这样迁完之后，Whiteboard 的 public API 仍然简单，但底层写入内核就和 Dataview 走到了同一条共享主轴上。

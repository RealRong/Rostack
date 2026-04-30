# Shared Reader / Mutation / Projection 最终 API 与实施方案

## 范围

本文只定义长期最优终态：

- 只保留最终 API 设计。
- 只保留分阶段实施方案。
- 不讨论兼容、过渡、双轨或备选方案。

## 总目标

- `shared/mutation` 成为唯一 mutation 基础设施。
- `shared/projection` 成为唯一 projection 基础设施。
- `delta` 只表达 mutation 语义事实，不承接 projection 派生几何。
- 下游读取统一 reader-first。
- app 包不再在 shared 之上重建第二套读写基础设施。
- API 命名保持最小、清晰、可长期稳定。

## 最终归属

## 1. reader 不归属于 `shared/mutation`

reader 同时被 mutation 和 projection 消费，所以不应归属于其中任何一个包。

最终归属固定为：

- source reader 的具体实现归 app core 包。
- projection read 的具体实现归 app projection 包。
- `shared/mutation` 只消费 source reader。
- `shared/projection` 只消费 projection read。

## 2. 不新增第二套 shared reader 框架

长期最优里，不单独设计一个复杂的 `shared/read` 基础包。

shared 只提供注入点，不提供一整套 reader 平台：

- `shared/mutation` 接收 `createReader`
- `shared/projection` 接收 `createRead`

具体 reader 结构由各 app 自己定义。

## 命名规则

最终命名固定为：

- source 侧统一使用 `Reader`
- projection 侧统一使用 `Read`
- app core 中具体实现使用 `DocumentReader`
- projection 中具体实现使用 `ProjectionRead`
- 工厂函数统一使用 `createXxxReader` 或 `createXxxRead`

避免以下命名：

- `resolver`
- `accessor`
- `helper bag`
- `context helper`
- `readDocument callback`

这些命名要么太弱，要么会把稳定 API 和临时 helper 混在一起。

## 最终分层

## 1. app core

职责：

- 定义 canonical `Document`
- 定义 `DocumentReader`
- 提供 document normalize / patch / canonical op / compile helper

不负责：

- graph / spatial / render / selection 这类 projection 派生读模型

## 2. `shared/mutation`

职责：

- compile intent 到 op
- apply op
- 合并 delta
- 合并 footprint
- 管理 history
- 暴露稳定 mutation runtime

不负责：

- 定义具体 document reader shape
- 推导 projection invalidation
- 承接 derived geometry

## 3. app projection

职责：

- 定义 projection state
- 定义 `ProjectionRead`
- 定义 plan / phase / capture / public query

## 4. `shared/projection`

职责：

- 提供 projection runtime
- 驱动 phase 执行
- 管理 projection store surface
- 注入 app projection 的 `read`

不负责：

- 定义具体 projection read shape
- 定义 app-specific graph / index / spatial 结构

## 最终 API 设计

## 1. app core source reader

每个 app core 都必须提供稳定 source reader。

最小要求：

```ts
interface DocumentReader {
  document(): Document
}
```

真正可用的 reader 应继续按业务模型扩展。

### dataview

dataview 维持当前方向，`DocumentReader` 继续作为 source reader：

- `records`
- `values`
- `fields`
- `views`
- `views.active`

### whiteboard

whiteboard 最终需要补齐正式 `DocumentReader`，最小推荐形态：

```ts
interface WhiteboardDocumentReader {
  document(): Document
  nodes: EntityReader<NodeId, Node>
  edges: EntityReader<EdgeId, Edge>
  groups: EntityReader<GroupId, Group>
  mindmaps: {
    ids(): readonly MindmapId[]
    get(id: MindmapId): MindmapRecord | undefined
    has(id: MindmapId): boolean
    tree(id: MindmapId): MindmapTree | undefined
    subtreeNodeIds(id: MindmapId, rootId?: NodeId): readonly NodeId[]
  }
  canvas: {
    order(): readonly CanvasItemRef[]
    slot(ref: CanvasItemRef): {
      prev?: CanvasItemRef
      next?: CanvasItemRef
    } | undefined
  }
}
```

这个 reader 负责 source 语义读取，不负责 projection geometry / hit / spatial。

## 2. `shared/mutation` 最终 API

### `MutationEngineOptions`

```ts
interface MutationEngineOptions<
  Doc extends object,
  Table extends MutationIntentTable,
  Op extends { type: string },
  Reader,
  Services = void,
  Code extends string = string
> {
  document: Doc
  normalize(doc: Doc): Doc
  createReader(readDocument: () => Doc): Reader
  services?: Services
  entities?: Readonly<Record<string, MutationEntitySpec>>
  custom?: MutationCustomTable<Doc, Op, Reader, Services, Code>
  compile?: MutationCompileHandlerTable<Table, Doc, Op, Reader, Services, Code>
  history?: MutationHistoryOptions | false
}
```

规则：

- `createReader` 只负责把当前 document 适配为 source reader。
- reader 具体类型由 app 决定。
- `shared/mutation` 不定义 app-specific reader shape。

### `MutationCompileHandlerInput`

```ts
interface MutationCompileHandlerInput<
  Doc,
  Intent,
  Op,
  Output,
  Reader,
  Services = void,
  Code extends string = string
> {
  intent: Intent
  source: MutationCompileSource<string>
  document: Doc
  reader: Reader
  services: Services | undefined
  emit(op: Op): void
  emitMany(...ops: readonly Op[]): void
  output(value: Output): void
  issue(issue: MutationCompileIssue<Code>): void
  stop(): { kind: 'stop' }
  fail(issue: MutationCompileIssue<Code>): {
    kind: 'block'
    issue: MutationCompileIssue<Code>
  }
  require<T>(
    value: T | undefined,
    issue: MutationCompileIssue<Code>
  ): T | undefined
}
```

规则：

- compile handler 默认走 `reader`
- `document` 只保留给少数写结构或直连 snapshot 的底层场景

### `MutationCustomReduceInput`

```ts
interface MutationCustomReduceInput<
  Doc,
  Op,
  Reader,
  Services = void,
  Code extends string = string
> {
  op: Op
  document: Doc
  reader: Reader
  origin: Origin
  services: Services | undefined
  fail(issue: MutationCustomFailure<Code>): never
}
```

最终删除：

- `read<T>(reader: (document: Doc) => T): T`

原因很简单：

- 这不是 typed reader
- 这只是在 raw document 上包 callback

### mutation runtime

```ts
interface MutationRuntime<
  Doc,
  Reader
> {
  document(): Doc
  reader(): Reader
}
```

最终 public API 直接提供 `reader()`，不再把 `read((document) => ...)` 当成主接口。

## 3. `shared/projection` 最终 API

### `ProjectionCreateOptions`

```ts
interface ProjectionCreateOptions<
  TInput extends { delta: MutationDelta },
  TState,
  TRead,
  TCapture,
  TStores extends ProjectionStoreTree<TState>,
  TPhaseName extends string
> {
  createState(): TState
  createRead(runtime: {
    state: () => TState
    revision: () => Revision
    capture: () => TCapture
  }): TRead
  capture(input: {
    state: TState
    read: TRead
    revision: Revision
  }): TCapture
  stores: TStores
  plan?: (input: {
    input: TInput
    state: TState
    read: TRead
    revision: Revision
  }) => ProjectionPlan<TPhaseName>
  phases: ProjectionPhaseTable<TInput, TState, TRead, TPhaseName>
}
```

### `ProjectionContext`

```ts
interface ProjectionContext<
  TInput extends { delta: MutationDelta },
  TState,
  TRead,
  TPhaseName extends string = string
> {
  input: TInput
  state: TState
  read: TRead
  revision: Revision
  dirty: ProjectionDirty
  phase: Record<TPhaseName, ProjectionPhaseStatus>
}
```

### `ProjectionPhase`

```ts
type ProjectionPhase<
  TInput extends { delta: MutationDelta },
  TState,
  TRead,
  TPhaseName extends string
> = (
  context: ProjectionContext<TInput, TState, TRead, TPhaseName>
) => void
```

规则：

- plan 用 `read`
- phase 用 `read`
- capture 用 `read`
- public runtime 暴露 `read`
- phase 不再自己拼零散 resolver

## 4. projection read 的最终形态

每个 projection 包都必须有自己的 read root。

### whiteboard

whiteboard projection read 最终应统一到一个 root：

```ts
interface WhiteboardProjectionRead {
  document: WhiteboardDocumentReader
  graph: {
    node(id: NodeId): NodeView | undefined
    edge(id: EdgeId): EdgeView | undefined
  }
  index: {
    ownerByNode(nodeId: NodeId): OwnerRef | undefined
    relatedEdgeIds(nodeIds: Iterable<NodeId>): readonly EdgeId[]
  }
  spatial: SpatialRead
  hit: HitRead
  selection: SelectionRead
  bounds: BoundsRead
  frame: FrameRead
  view: ViewRead
  chrome: ChromeRead
}
```

最终替换零散读取入口：

- `createDocumentResolver`
- `createSpatialRead`
- `createFrameRead`
- `createHitRead`
- `createSelectionRead`

这些能力不删除，但收口到一个 `createProjectionRead(...)`。

### dataview

dataview projection / engine read 继续保持 context-first，但入口统一为一个 read root：

```ts
interface DataviewProjectionRead {
  document: DocumentReader
  active: ActiveRead
  index: IndexRead
  publish: PublishRead
}
```

`IndexReadContext`、`DocumentReadContext` 这类 enrich context 可以保留，但属于 app 内部实现，不再成为 shared contract 缺口的补丁。

## 5. delta / footprint 最终 API

### delta

最终规则：

- `delta` 只表达 mutation semantic facts
- 不表达 projection derived geometry

例如：

- `node.geometry`
- `mindmap.structure`
- `mindmap.layout`
- `canvas.order`
- `external.version`

### footprint

最终规则：

- `footprint` 只表达语义冲突边界
- 不依赖 document diff 作为基础模型

## 6. custom reducer 最终 API

最终 contract 固定为：

```ts
interface MutationCustomReduceResult<Doc, Op> {
  document?: Doc
  delta?: MutationDeltaInput
  footprint?: readonly MutationFootprint[]
  history?: false | MutationCustomHistoryResult<Op>
  outputs?: readonly unknown[]
  issues?: readonly MutationIssue[]
}
```

最终禁止保留第二套 effect DSL。

删除：

- `effects`
- `footprintEffects`
- `extraDelta`
- `extraFootprint`
- `before` 驱动的 helper 推导逻辑

`createWhiteboardCustomResult(...)` 最终只允许两种结果：

- 删除
- 或薄封装成 `document + delta + footprint + history`

## 7. canonical op 最终收口

最终只保留两类 canonical op：

- canonical entity op
- canonical structural op

whiteboard 中以下结构最终上收为 canonical structural op：

- `canvas.order.move`
- `mindmap.topic.insert`
- `mindmap.topic.move`
- `mindmap.topic.delete`
- `edge.label.insert`
- `edge.label.move`
- `edge.route.point.insert`
- `edge.route.point.move`
- `edge.route.point.delete`

不能长期停留在 app-local custom reducer 中。

## 分阶段实施方案

实施原则固定为：

- 每个阶段直接落最终 API
- 不做兼容层
- 不保留旧入口
- 同阶段内一次性更新所有调用方

## 阶段 1：`shared/mutation` reader 化

### 目标

让 mutation compile / custom / runtime 全部拿到 typed reader。

### 工作项

- 给 `MutationEngineOptions` 增加 `createReader`
- 所有 mutation 泛型补上 `Reader`
- 给 `MutationCompileHandlerInput` 增加 `reader`
- 给 `MutationCustomReduceInput` 增加 `reader`
- 删除 `MutationCustomReduceInput.read(...)`
- runtime public API 增加 `reader()`
- 删除以 raw document callback 为中心的 read API

### 完成标准

- compile handler 不再自己构造 reader
- custom reducer 不再调用 `input.read((document) => ...)`
- mutation runtime 对外有稳定 `reader()`

## 阶段 2：dataview 直接接入 shared reader contract

### 目标

让 dataview 成为第一批完全 reader-first 的接入方。

### 工作项

- `dataview-core` 继续保留 `DocumentReader`
- compile handler 直接使用 `input.reader`
- 删除 `createCompileReader(...)`
- 保留 `DocumentReadContext` 作为 app 内部 enrich context
- engine / active / index / publish 继续复用同一套 source reader

### 完成标准

- `compile-base.ts` 不再创建 reader
- compile 入口不再有 app-local reader glue
- dataview source 读路径统一为 `DocumentReader`

## 阶段 3：whiteboard 建立正式 source reader 并迁移 core

### 目标

把 whiteboard 从 raw document helper 模式迁移到正式 source reader。

### 工作项

- 新增 `whiteboard-core/document/reader.ts`
- 把 `custom.ts` 内本地 read helper 迁入 reader
- compile helpers 改成 reader-first
- custom reducers 改成 reader-first
- lock / selection / structural helper 改成 reader-first
- 只在直接写 document 时保留 raw `document`

### 完成标准

- `whiteboard-core/src/operations/custom.ts` 不再自带一组本地 document read API
- compile / custom / lock 默认走 `reader`
- source 读取 contract 稳定落在 `whiteboard-core/document/reader.ts`

## 阶段 4：`shared/projection` read contract 收口

### 目标

让 projection 的 plan / phase / capture / public query 共用同一个 read root。

### 工作项

- `ProjectionContext` 增加 `read`
- `ProjectionPhaseTable` 泛型补上 `TRead`
- 所有 phase 改成从 `context.read` 读取
- `plan(...)` / `capture(...)` / runtime public `read` 保持同一个 read root
- whiteboard 收口为 `createProjectionRead(...)`
- dataview 收口为统一 projection / engine read root

### 完成标准

- phase 不再通过零散闭包或 resolver 读取稳定数据
- projection runtime 的读取入口只有一个 root
- app projection 读模型边界清晰，不再散落

## 阶段 5：清理 custom DSL，完成 canonical 收口

### 目标

让 mutation semantic contract 和 structural op 收口到最终形态。

### 工作项

- custom reducer 只返回 `document / delta / footprint / history`
- 删除 `effects` / `extraDelta` / `extraFootprint`
- 删除依赖 `before + diff` 推导 delta 的 helper
- `createWhiteboardCustomResult(...)` 删除或薄化
- whiteboard structural op 全部上收为 canonical structural op
- projection 只消费 semantic delta，不再消费 derived geometry delta

### 完成标准

- app 包不再维护第二套 custom result DSL
- shared 内不存在“从 document diff 反推 semantic delta”的主路径
- whiteboard / dataview 的 mutation 结果都直接是 semantic delta + footprint

## 最终落地检查表

- `shared/mutation` 只消费 source reader，不拥有 reader 实现
- `shared/projection` 只消费 projection read，不拥有 projection read 实现
- app core 提供 `DocumentReader`
- app projection 提供 `ProjectionRead`
- compile / custom / projection 全部 reader-first
- raw `document` 只用于写入和 snapshot 承载
- `delta` 只表达 mutation 语义
- derived geometry 不进入 mutation contract
- custom reducer 没有第二套 effect DSL
- structural op 不长期停留在 app-local custom reducer

## 最终一句话

长期最优的终态不是让 shared 拥有 reader，而是：

- app 定义自己的 source reader 和 projection read
- `shared/mutation`、`shared/projection` 只消费它们
- compile / custom / projection 统一 reader-first
- mutation 和 projection 边界保持严格干净

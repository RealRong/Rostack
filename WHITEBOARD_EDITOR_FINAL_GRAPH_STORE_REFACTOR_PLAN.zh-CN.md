# Whiteboard Editor 最终 Graph / Store 收敛方案

## 1. 口径

- 本文是 `SHARED_PROJECTOR_STORE_DESIGN_AND_MIGRATION.zh-CN.md`、`WHITEBOARD_EDITOR_AGGRESSIVE_EDITOR_GRAPH_REFACTOR.zh-CN.md`、`WHITEBOARD_EDITOR_GRAPH_OPTIMIZATION_AUDIT.zh-CN.md` 的最终收敛版本。
- 如与旧文档冲突，以本文为准。
- 不保留兼容层，不保留过渡 API，不保留双轨实现。
- 目标不是低风险迁移，而是长期最优结构。
- 已完成的 scope/runtime 收敛不再作为后续工作。
- `graph.ts` 的 queue/fanout 暂时保留在 `whiteboard-editor-graph` 内部，不设计 shared 抽象；只有出现第二个明确消费者时才下沉。

## 2. 最终 API 设计

### 2.1 `shared/projector` 最终公共 API

`shared/projector` 对外只保留 projector 本体、scope、publish，以及 projector 到 reactive store 的标准桥接。

```ts
export {
  createProjector,
  createProjectorStore,
  value,
  family,
  projectListChange,
  publishStruct,
  defineScope,
  flag,
  set,
  slot
} from '@shared/projector'
```

`source/*`、`sync/*`、`publish/*` 子文件不再作为上层业务包的直接依赖；它们是 `shared/projector` 内部实现细节。

#### `ProjectorStore`

```ts
interface ProjectorRuntimeLike<TSnapshot, TChange> {
  snapshot(): TSnapshot
  subscribe(listener: (snapshot: TSnapshot, change: TChange) => void): () => void
}

interface ProjectorStoreValueField<TSnapshot, TChange, TValue> {
  kind: 'value'
  read(snapshot: TSnapshot): TValue
  changed(change: TChange): boolean
  isEqual?: (left: TValue, right: TValue) => boolean
}

interface ProjectorStoreFamilyField<TSnapshot, TChange, TKey extends string, TValue> {
  kind: 'family'
  read(snapshot: TSnapshot): {
    ids: readonly TKey[]
    byId: ReadonlyMap<TKey, TValue>
  }
  delta(change: TChange): import('@shared/projector/delta').IdDelta<TKey> | undefined
  isEqual?: (left: TValue, right: TValue) => boolean
}

type ProjectorStoreField<TSnapshot, TChange> =
  | ProjectorStoreValueField<TSnapshot, TChange, unknown>
  | ProjectorStoreFamilyField<TSnapshot, TChange, string, unknown>

interface ProjectorStoreSpec<TSnapshot, TChange> {
  fields: Record<string, ProjectorStoreField<TSnapshot, TChange>>
}

interface ProjectorStoreFamilyRead<TKey extends string, TValue> {
  ids: store.ReadStore<readonly TKey[]>
  byId: store.KeyedReadStore<TKey, TValue | undefined>
}

interface ProjectorStore<TSnapshot, TChange, TRead> {
  readonly read: TRead
  snapshot(): TSnapshot
  sync(input: {
    previous: TSnapshot
    next: TSnapshot
    change: TChange
  }): void
  dispose(): void
}

declare function createProjectorStore<
  TSnapshot,
  TChange,
  TSpec extends ProjectorStoreSpec<TSnapshot, TChange>
>(input:
  | {
      runtime: ProjectorRuntimeLike<TSnapshot, TChange>
      spec: TSpec
    }
  | {
      initial: TSnapshot
      spec: TSpec
    }
): ProjectorStore<TSnapshot, TChange, InferProjectorStoreRead<TSpec>>
```

builder 只保留两种：

```ts
declare function value<TSnapshot, TChange, TValue>(input: {
  read(snapshot: TSnapshot): TValue
  changed(change: TChange): boolean
  isEqual?: (left: TValue, right: TValue) => boolean
}): ProjectorStoreValueField<TSnapshot, TChange, TValue>

declare function family<TSnapshot, TChange, TKey extends string, TValue>(input: {
  read(snapshot: TSnapshot): {
    ids: readonly TKey[]
    byId: ReadonlyMap<TKey, TValue>
  }
  delta(change: TChange): import('@shared/projector/delta').IdDelta<TKey> | undefined
  isEqual?: (left: TValue, right: TValue) => boolean
}): ProjectorStoreFamilyField<TSnapshot, TChange, TKey, TValue>
```

#### `shared/projector/delta` 最终补齐的 API

`whiteboard-editor-graph`、`dataview`、后续 projector 都应复用统一的 entity change writer，不再各自手写 add/update/remove 判定。

```ts
interface WriteEntityChangeInput<TKey extends string, TValue> {
  delta: import('@shared/projector/delta').IdDelta<TKey>
  id: TKey
  previous: TValue | undefined
  next: TValue | undefined
  equal?: (left: TValue, right: TValue) => boolean
}

declare function writeEntityChange<TKey extends string, TValue>(
  input: WriteEntityChangeInput<TKey, TValue>
): void
```

语义固定为：

- `previous === undefined && next !== undefined` -> `added`
- `previous !== undefined && next === undefined` -> `removed`
- `previous !== undefined && next !== undefined && !equal(previous, next)` -> `updated`
- 其他情况不写入 delta

### 2.2 `whiteboard-core` 最终下沉 API

`whiteboard-editor-graph` 不再解释 document relation，只消费 `whiteboard-core` 的 pure relation API。

```ts
export type NodeOwnerRef =
  | { kind: 'mindmap'; id: MindmapId }
  | { kind: 'group'; id: GroupId }

export interface EdgeEndpointNodeIds {
  source?: NodeId
  target?: NodeId
}

export type GroupItemRef =
  | { kind: 'node'; id: NodeId }
  | { kind: 'edge'; id: EdgeId }
```

```ts
export const documentRelations = {
  nodeOwner(document: Document, nodeId: NodeId): NodeOwnerRef | undefined
}

export const edgeRelations = {
  endpointNodeIds(edge: Edge | undefined): EdgeEndpointNodeIds
}

export const groupRelations = {
  items(document: Document, groupId: GroupId): readonly GroupItemRef[]
}

export const groupSignature = {
  fromItems(items: readonly GroupItemRef[]): string,
  fromTarget(target: import('@whiteboard/core/selection').SelectionTarget): string
}
```

`whiteboard-editor-graph` 只缓存这些 relation 的增量结果，不再在 `domain/index/update.ts` 内定义 relation 规则。

### 2.3 `whiteboard-editor-graph` 最终公共 API

`whiteboard-editor-graph` 是唯一 graph/read projection runtime。`whiteboard-editor` 不再维护自己的 graph adapter、projection sources、graph read model。

公共入口收敛为：

```ts
export {
  createEditorGraph
} from '@whiteboard/editor-graph'

export type {
  EditorGraph,
  EditorGraphSnapshot,
  EditorGraphChange,
  EditorGraphResult,
  EditorGraphQuery,
  EditorGraphStore,
  EditorGraphDirtyEvent,
  EditorGraphUpdateRequest,
  EditorNodeRecord,
  EditorEdgeRecord
} from '@whiteboard/editor-graph'
```

#### `EditorGraph`

```ts
interface EditorGraph {
  readonly query: EditorGraphQuery
  readonly store: EditorGraphStore
  snapshot(): EditorGraphSnapshot
  update(request: EditorGraphUpdateRequest): EditorGraphResult
  subscribe(listener: (result: EditorGraphResult) => void): () => void
}

declare function createEditorGraph(): EditorGraph
```

`createEditorGraphRuntime` 与 `createEditorGraphStore` 不再对外分开暴露；上层只拿一个 facade。

#### `EditorGraphDirtyEvent`

`whiteboard-editor` 只负责上报 dirty event，不再构造 `InputDelta`。

```ts
type EditorGraphDirtyEvent =
  | { kind: 'bootstrap' }
  | {
      kind: 'document'
      previous: EngineSnapshot | null
      next: EngineSnapshot
      delta: EngineDelta
    }
  | {
      kind: 'selection'
      previous: import('@whiteboard/core/selection').SelectionTarget
      next: import('@whiteboard/core/selection').SelectionTarget
    }
  | {
      kind: 'tool'
      previous: ToolState
      next: ToolState
    }
  | {
      kind: 'edit'
      previous: EditSession | null
      next: EditSession | null
    }
  | {
      kind: 'preview'
      previous: PreviewInput
      next: PreviewInput
    }
  | {
      kind: 'hover'
      previous: HoverState
      next: HoverState
    }
  | {
      kind: 'layout'
      nodeIds?: readonly NodeId[]
      edgeIds?: readonly EdgeId[]
    }
  | {
      kind: 'clock'
      now: number
    }
```

#### `EditorGraphUpdateRequest`

`EditorGraph` 内部自行把 dirty event 编译为 `InputDelta` 和 phase scope。`Input`/`InputDelta` 退回 `editor-graph` 内部实现，不再由 `whiteboard-editor` 直接依赖。

```ts
interface EditorGraphUpdateRequest {
  document: {
    previous: EngineSnapshot | null
    current: EngineSnapshot
    delta: EngineDelta
  }
  session: {
    edit: EditSession | null
    draft: DraftInput
    preview: PreviewInput
    tool: ToolState
    selection: SelectionState
    hover: HoverState
    drag: DragState
  }
  measure: MeasureInput
  events: readonly EditorGraphDirtyEvent[]
  now: number
}
```

#### `EditorGraphQuery`

`EditorGraphQuery` 是同步只读查询面，直接对外给 `whiteboard-editor`、actions、input、write 使用。

```ts
interface EditorNodeRecord {
  graph: NodeView
  ui: NodeUiView
}

interface EditorEdgeRecord {
  graph: EdgeView
  ui: EdgeUiView
}

interface EditorGraphQuery {
  snapshot(): EditorGraphSnapshot
  node(id: NodeId): EditorNodeRecord | undefined
  edge(id: EdgeId): EditorEdgeRecord | undefined
  mindmap(id: MindmapId): MindmapView | undefined
  group(id: GroupId): GroupView | undefined
  mindmapId(value: string): MindmapId | undefined
  mindmapStructure(value: MindmapId | NodeId): MindmapView['structure'] | undefined
  relatedEdges(nodeIds: Iterable<NodeId>): readonly EdgeId[]
  groupExact(target: import('@whiteboard/core/selection').SelectionTarget): readonly GroupId[]
  spatial: SpatialRead
  snap(rect: Rect): readonly import('@whiteboard/core/node').SnapCandidate[]
  frame: {
    point(point: Point): readonly NodeId[]
    rect(rect: Rect): readonly NodeId[]
    pick(point: Point, options?: {
      excludeIds?: readonly NodeId[]
    }): NodeId | undefined
    parent(nodeId: NodeId, options?: {
      excludeIds?: readonly NodeId[]
    }): NodeId | undefined
    descendants(nodeIds: readonly NodeId[]): readonly NodeId[]
  }
  items(): readonly SceneItem[]
  chrome(): ChromeView
}
```

对外 query 默认返回已组合的 `EditorNodeRecord` / `EditorEdgeRecord`；`graph/ui` 的阶段拆分继续保留在 `snapshot` 和内部 projector 里，但不再要求上层自己订阅两份 source 再组合。

#### `EditorGraphStore`

`EditorGraphStore` 基于 `shared/projector/createProjectorStore` 构建，是 `EditorGraph` 的组成部分，不再存在 `whiteboard-editor/src/projection/sources.ts`。

```ts
interface EditorGraphStore {
  snapshot: store.ReadStore<EditorGraphSnapshot>
  items: store.ReadStore<readonly SceneItem[]>
  chrome: store.ReadStore<ChromeView>
  nodes: ProjectorStoreFamilyRead<NodeId, EditorNodeRecord>
  edges: ProjectorStoreFamilyRead<EdgeId, EditorEdgeRecord>
  mindmaps: ProjectorStoreFamilyRead<MindmapId, MindmapView>
  groups: ProjectorStoreFamilyRead<GroupId, GroupView>
}
```

`nodeUi`、`edgeUi`、`nodeGraph`、`edgeGraph` 不再作为 `whiteboard-editor` 公共订阅面；它们是 `editor-graph` 内部组织方式，不是外部 API。

#### `editor-graph` 内部结构要求

- `graph / spatial / ui` 三阶段继续保留。
- `projector/spec.ts` 只负责 wiring。
- `createEmptyInput`、`createEmptySnapshot`、`createWorking` 单独拆文件。
- `projector/publish.ts` 只保留 whiteboard 特有 snapshot/change 装配，不再手写 struct reuse。
- `domain/index/update.ts` 只做 index patch，不做 relation 语义解释。

### 2.4 `whiteboard-editor` 最终 API 与模块边界

`whiteboard-editor` 只保留 session、input、actions、write、layout、panel、scheduler，不再拥有 graph read-model。

#### `createEditor`

```ts
export const createEditor = (options): Editor => {
  const session = createEditorSession(...)
  const document = createDocumentRead({ engine: options.engine })
  const layout = createEditorLayout(...)
  const projection = createProjectionController({
    engine: options.engine,
    session,
    layout
  })

  const write = createEditorWrite({
    engine: options.engine,
    history: options.history,
    document,
    graph: projection.graph,
    layout
  })

  const actions = createEditorActionsApi({
    graph: projection.graph,
    ...
  })

  const input = createEditorInputApi({
    boundary,
    host
  })

  return {
    store: createEditorStore(session),
    read: {
      document: document.document,
      graph: {
        snapshot: projection.graph.snapshot,
        query: projection.graph.query,
        store: projection.graph.store
      },
      session: createSessionRead(session),
      history: options.history,
      panel: createEditorPanelRead(...)
    },
    actions,
    input,
    events,
    dispose
  }
}
```

#### `ProjectionController`

`projection/controller.ts` 只做 scheduler 和 dirty event 聚合：

```ts
interface ProjectionController {
  graph: EditorGraph
  mark(event: EditorGraphDirtyEvent): void
  flush(): EditorGraphResult | null
  subscribe(listener: (result: EditorGraphResult) => void): () => void
  dispose(): void
}
```

controller 不再：

- import `InputDelta`
- 构造 `createEmptyEditorGraphInputDelta`
- merge/take `InputDelta`
- 创建 `ProjectionSources`

#### `whiteboard-editor` 保留模块

```text
editor/*
session/*
input/*
action/*
write/*
layout/*
boundary/*
projection/controller.ts
panel/*
document/read/*
```

#### `whiteboard-editor` 删除模块

```text
read/graph.ts
read/node.ts
read/edge.ts
read/edgeShared.ts
read/selection.ts
projection/sources.ts
projection/input.ts
```

`read/public.ts` 只允许保留为极薄聚合器；如果仍承担 graph 适配职责，则直接删除并内联到 `createEditor.ts`。

#### `whiteboard-editor` 允许保留的派生层

只保留 editor-only selector：

- 依赖 viewport 的 screen-space panel/chrome selector
- 依赖 history 的 panel selector
- 依赖 defaults 或 editor policy 的 presentation selector

它们只能消费 `EditorGraph.query/store`，不能重新构造 graph read-model、graph family store、graph adapter。

## 3. 最终分阶段实施方案

### 阶段一：补齐 `shared/projector` 的最终桥接能力

目标：

- 新增 `createProjectorStore`
- 新增 `value` / `family`
- 新增 `writeEntityChange`
- 停止业务包直接依赖 `@shared/projector/sync`

修改范围：

```text
shared/projector/src/index.ts
shared/projector/src/store/*
shared/projector/src/delta/*
```

完成标准：

- `whiteboard-editor`、`whiteboard-editor-graph` 不再 import `@shared/projector/sync`
- `writeUiChange` 这类局部 helper 可以由 shared primitive 覆盖
- `ProjectorStore` 可直接驱动 value/family 两类 reactive store

### 阶段二：收敛 `whiteboard-editor-graph` 公共 facade

目标：

- `createEditorGraphRuntime` 与独立 store 构造合并为 `createEditorGraph`
- `EditorGraph` 对外同时提供 `snapshot/query/store/update/subscribe`
- `query` 和 `store` 默认返回组合后的 node/edge record

修改范围：

```text
whiteboard/packages/whiteboard-editor-graph/src/index.ts
whiteboard/packages/whiteboard-editor-graph/src/contracts/editor.ts
whiteboard/packages/whiteboard-editor-graph/src/runtime/*
whiteboard/packages/whiteboard-editor-graph/src/store/*
```

完成标准：

- `whiteboard-editor` 只 import `createEditorGraph`
- `projection/sources.ts` 的能力已迁入 `whiteboard-editor-graph`
- `EditorGraphStore` 基于 `ProjectorStore` 构建

### 阶段三：把 dirty event 编译彻底迁入 `whiteboard-editor-graph`

目标：

- `whiteboard-editor` 不再感知 `Input` / `InputDelta`
- `whiteboard-editor-graph` 内部根据 dirty event 编译 touched ids、delta、phase scope
- `projection/controller.ts` 收敛为 scheduler

修改范围：

```text
whiteboard/packages/whiteboard-editor/src/projection/controller.ts
whiteboard/packages/whiteboard-editor/src/projection/input.ts  -> 删除
whiteboard/packages/whiteboard-editor-graph/src/input/*
whiteboard/packages/whiteboard-editor-graph/src/runtime/*
```

完成标准：

- `projection/controller.ts` 不再 import `InputDelta`
- `whiteboard-editor/src/projection/input.ts` 删除
- `EditorGraphDirtyEvent` 成为 editor 与 graph 的唯一刷新协议

### 阶段四：删除 `whiteboard-editor` 的 graph read-model

目标：

- `createEditor` 直接消费 `projection.graph`
- 删除 graph/node/edge/selection read adapter
- `Editor.read.graph` 直接暴露 `EditorGraph.query/store`

修改范围：

```text
whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts
whiteboard/packages/whiteboard-editor/src/read/*
whiteboard/packages/whiteboard-editor/src/panel/*
```

完成标准：

- `createGraphRead` 删除
- `read/node.ts`、`read/edge.ts`、`read/selection.ts` 删除
- `Editor.read` 不再提供旧的 node/edge/selection graph adapter

### 阶段五：把 relation / delta / publish 的重复逻辑下沉并清理

目标：

- `domain/index/update.ts` 不再定义 relation 语义
- `node/edge/group/mindmap/ui` 统一使用 `writeEntityChange`
- `projector/publish.ts` 切到 shared `publishStruct`

修改范围：

```text
whiteboard/packages/whiteboard-core/src/*
whiteboard/packages/whiteboard-editor-graph/src/domain/index/update.ts
whiteboard/packages/whiteboard-editor-graph/src/domain/node.ts
whiteboard/packages/whiteboard-editor-graph/src/domain/edge.ts
whiteboard/packages/whiteboard-editor-graph/src/domain/group.ts
whiteboard/packages/whiteboard-editor-graph/src/domain/mindmap.ts
whiteboard/packages/whiteboard-editor-graph/src/phases/ui.ts
whiteboard/packages/whiteboard-editor-graph/src/projector/publish.ts
```

完成标准：

- `readNodeOwner`、`readEdgeNodes`、`rebuildGroupItems`、`setGroupItems` 从 `editor-graph` 移除
- `writeUiChange` 删除
- `patchPublishedValue` 删除

### 阶段六：完成 `editor-graph` 内部结构收尾

目标：

- `projector/spec.ts` 只保留 wiring
- 初始化 helper 单独拆分
- 删除所有旧实现与过时导出

修改范围：

```text
whiteboard/packages/whiteboard-editor-graph/src/projector/spec.ts
whiteboard/packages/whiteboard-editor-graph/src/projector/createEmptyInput.ts
whiteboard/packages/whiteboard-editor-graph/src/projector/createEmptySnapshot.ts
whiteboard/packages/whiteboard-editor-graph/src/projector/createWorking.ts
whiteboard/packages/whiteboard-editor-graph/src/index.ts
```

完成标准：

- `spec.ts` 能一眼读完
- 不再残留旧 runtime/store/projection adapter 导出
- 旧实现文件全部删除，不留别名、不留兼容入口

## 4. 最终验收口径

全部完成后，应满足以下条件：

- `whiteboard-editor-graph` 是唯一 graph/read projection runtime。
- `whiteboard-editor` 不再维护 `GraphRead`、`ProjectionSources`、`InputDelta` adapter、node/edge/selection graph read-model。
- `shared/projector` 提供统一的 `ProjectorStore` 和 entity change writer。
- `whiteboard-core` 提供 pure relation API，`editor-graph` 只维护索引与增量缓存。
- `editor-graph` 对外暴露的是稳定的 facade，而不是内部 phase/sync/source 细节。
- 所有旧实现直接删除，不保留兼容代码。

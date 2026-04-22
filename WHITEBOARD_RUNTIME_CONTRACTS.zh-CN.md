# Whiteboard Runtime Contract 设计稿

本文是 whiteboard 统一重构的第一步。

目标不是解释现状，也不是给旧模型补一个兼容层，而是一次性冻结最终 contract，让后续 `whiteboard-engine`、`whiteboard-editor-graph`、`whiteboard-editor`、`whiteboard-react` 都围绕同一套名字和边界落地。

本文明确假设：

- 不兼容旧 `EngineRead`
- 不兼容旧 editor query/layout/read 链
- 不保留双轨
- 不保留过渡 facade
- 不把旧名字继续带进新系统

---

## 1. 核心判断

不需要使用 TypeScript `namespace`。

这里要区分两件事：

1. 逻辑命名空间
2. TS `namespace` 语法

长期最优需要的是前者，不需要后者。

本文中出现的：

- `core.*`
- `document.*`
- `editor.*`
- `phase.*`
- `source.*`
- `trace.*`

都只是逻辑上的 contract 族，不代表代码里要写：

```ts
namespace document {
  export interface Snapshot {}
}
```

最终代码应使用 ES module 文件组织。

如果调用侧希望保留 `document.Snapshot` 这种阅读体验，可以这样写：

```ts
import type * as core from './contracts/core'
import type * as document from './contracts/document'
import type * as editor from './contracts/editor'
import type * as phase from './contracts/phase'
import type * as source from './contracts/source'
import type * as trace from './contracts/trace'
```

这样得到的是模块别名，不是 TS namespace。

---

## 2. 命名原则

这套 contract 的命名目标只有三个：

1. 简单
2. 稳定
3. 按职责分层

### 2.1 顶层 contract 族

顶层只保留 6 个 contract 族：

- `core`
- `document`
- `editor`
- `phase`
- `source`
- `trace`

不再新增：

- `projection`
- `runtimeModel`
- `published`
- `derived`
- `viewState`
- `payload`
- `delta`
- `patch` 作为跨层公共语言

### 2.2 统一后缀

每个 contract 族内部，只优先使用这些后缀：

- `Snapshot`
- `Change`
- `State`
- `Input`
- `Result`
- `Runtime`
- `Read`
- `Spec`
- `Metrics`

例如：

- `document.Snapshot`
- `document.Change`
- `editor.Snapshot`
- `editor.Change`
- `phase.Spec`
- `phase.Result`
- `source.Sync`
- `trace.Run`

### 2.3 禁止旧式长命名

下面这些命名方向，长期都不应该保留：

- `DocumentEngineSnapshot`
- `DocumentChangeSet`
- `PublishedChangeSet`
- `RuntimePhase`
- `SnapshotSourceSync`
- `EditorGraphPublishedState`
- `ProjectionRuntimeViewModel`

对应的最终命名应该是：

- `document.Snapshot`
- `document.Change`
- `editor.Change`
- `phase.Spec`
- `source.Sync`

### 2.4 结构优先于平铺

类型字段如果超过 5 到 7 个，优先按职责分组，而不是继续平铺。

例如不推荐：

```ts
export interface Snapshot {
  revision: Revision
  nodeById: ReadonlyMap<NodeId, NodeView>
  edgeById: ReadonlyMap<EdgeId, EdgeView>
  ownerById: ReadonlyMap<OwnerId, OwnerView>
  sceneItems: readonly SceneItem[]
  sceneLayers: readonly SceneLayer[]
  spatialIndex: SpatialIndex
  selection: SelectionView
  chrome: ChromeView
}
```

推荐：

```ts
export interface Snapshot {
  revision: Revision
  base: BaseSnapshot
  graph: GraphSnapshot
  scene: SceneSnapshot
  ui: UiSnapshot
}
```

原则很简单：

- 先分职责
- 再谈字段

---

## 3. 推荐文件组织

逻辑 contract 族在代码里的推荐表达方式如下：

```text
contracts/
  core.ts
  document.ts
  editor.ts
  phase.ts
  source.ts
  trace.ts
```

推荐使用方式：

```ts
import type * as core from './contracts/core'
import type * as document from './contracts/document'
import type * as editor from './contracts/editor'
import type * as phase from './contracts/phase'
import type * as source from './contracts/source'
import type * as trace from './contracts/trace'
```

这样有几个好处：

- 阅读上仍然能写 `document.Snapshot`
- 类型定义仍然是普通 ES module
- 不会引入 TS namespace 的额外语义
- 文件边界天然就是 contract 边界

---

## 4. Contract 总览

最终只保留下列核心对象：

```ts
// contracts/document.ts
export interface Snapshot {}
export interface Change {}
export interface Engine {}

// contracts/editor.ts
export interface Input {}
export interface InputChange {}
export interface Snapshot {}
export interface Change {}
export interface Runtime {}
export interface Read {}

// contracts/phase.ts
export type Name = ...
export interface Spec {}
export interface Context {}
export interface Result {}

// contracts/source.ts
export interface Input<TSink> {}
export interface Sync<TSink> {}

// contracts/trace.ts
export interface Phase {}
export interface Run {}
```

这里有两个关键判断：

1. committed truth 用 `document.*`
2. projection truth 用 `editor.*`

因此整个 whiteboard 只有两份 authoritative truth：

- `document.Snapshot`
- `editor.Snapshot`

不再有第三份。

---

## 5. `core` contract 族

`core` 不承载 whiteboard 业务语义，只提供最小通用结构。

```ts
// contracts/core.ts
export type Revision = number
export type Action = 'reuse' | 'sync' | 'rebuild'

export interface Family<TKey, TValue> {
  ids: readonly TKey[]
  byId: ReadonlyMap<TKey, TValue>
}

export interface Ids<TKey> {
  all: ReadonlySet<TKey>
}

export interface Flags {
  changed: boolean
}
```

设计原则：

- `Family` 统一承载 keyed snapshot
- `Ids` 统一承载 changed ids
- `Action` 统一承载 phase 行为

这些结构是通用壳，不带 whiteboard 业务语义。

---

## 6. `document` contract 族

`document` 只代表 committed truth。

它由 `whiteboard-engine` 对外提供。

### 6.1 `document.Snapshot`

```ts
// contracts/document.ts
export interface Snapshot {
  revision: core.Revision
  state: State
  change: Change
}

export interface State {
  root: Document
  facts: Facts
}
```

这里有两个字段层级：

- `state.root`
- `state.facts`

这样做是为了明确区分：

- 原始 document 数据
- engine 归一后的 committed facts

### 6.2 `document.Facts`

```ts
// contracts/document.ts
export interface Facts {
  entities: Entities
  relations: Relations
}

export interface Entities {
  nodes: ReadonlyMap<NodeId, Node>
  edges: ReadonlyMap<EdgeId, Edge>
  owners: Owners
}

export interface Owners {
  mindmaps: ReadonlyMap<MindmapId, Mindmap>
  groups: ReadonlyMap<GroupId, Group>
}

export interface Relations {
  nodeOwner: ReadonlyMap<NodeId, OwnerId | undefined>
  ownerNodes: ReadonlyMap<OwnerId, readonly NodeId[]>
  parentNode: ReadonlyMap<NodeId, NodeId | undefined>
  childNodes: ReadonlyMap<NodeId, readonly NodeId[]>
  edgeNodes: ReadonlyMap<EdgeId, EdgeNodes>
  frameNodes: ReadonlyMap<NodeId, readonly NodeId[]>
  groupItems: ReadonlyMap<GroupId, readonly CanvasItemRef[]>
}

export interface EdgeNodes {
  source?: NodeId
  target?: NodeId
}
```

这里坚持两条原则：

1. `entities` 只放实体
2. `relations` 只放关系

不把 relation 字段平铺到 `Facts` 根上。

### 6.3 `document.Change`

```ts
// contracts/document.ts
export interface Change {
  entities: EntityChange
  relations: RelationChange
  root: core.Flags
}

export interface EntityChange {
  nodes: core.Ids<NodeId>
  edges: core.Ids<EdgeId>
  owners: OwnerChange
}

export interface OwnerChange {
  mindmaps: core.Ids<MindmapId>
  groups: core.Ids<GroupId>
}

export interface RelationChange {
  graph: core.Flags
  ownership: core.Flags
  hierarchy: core.Flags
}
```

这里故意不用 `ChangeSet`。

原因很简单：

- `Change` 足够清楚
- `Set` 是实现细节，不是领域语义

### 6.4 `document.Engine`

```ts
// contracts/document.ts
export interface Engine {
  snapshot(): Snapshot
  subscribe(listener: (snapshot: Snapshot) => void): () => void
  execute(command: Command): CommandResult
  apply(ops: readonly Operation[]): CommandResult
}
```

最终 `whiteboard-engine` 只需要暴露这一层。

它不再提供：

- node geometry
- node rect
- node bounds
- edge item
- mindmap layout
- mindmap scene
- canvas scene
- editor hit-test projection

这些都不属于 `document` contract。

---

## 7. `editor` contract 族

`editor` 代表 projection truth。

它由新的 `whiteboard-editor-graph` 对外提供。

### 7.1 `editor.Input`

`editor.Input` 是 editor runtime 的完整输入面。

```ts
// contracts/editor.ts
export interface Input {
  document: DocumentInput
  session: SessionInput
  measure: MeasureInput
  interaction: InteractionInput
  viewport: ViewportInput
  clock: ClockInput
}

export interface DocumentInput {
  snapshot: document.Snapshot
}

export interface SessionInput {
  edit: EditSession
  preview: PreviewState
  tool: ToolState
}

export interface MeasureInput {
  text: TextMeasureState
}

export interface InteractionInput {
  selection: SelectionState
  hover: HoverState
  drag: DragState
}

export interface ViewportInput {
  viewport: Viewport
}

export interface ClockInput {
  now: number
}
```

这里不把 `edit / preview / viewport / selection / hover` 全堆平在一个接口里。

输入 contract 的目的，是让 phase 一眼看出自己依赖哪个职责域。

### 7.2 `editor.InputChange`

```ts
// contracts/editor.ts
export interface InputChange {
  document: core.Flags
  session: core.Flags
  measure: core.Flags
  interaction: core.Flags
  viewport: core.Flags
  clock: core.Flags
}
```

`InputChange` 保持极简。

更细的影响范围由 runtime 内部 `ImpactPlan` 继续展开。

### 7.3 `editor.Snapshot`

```ts
// contracts/editor.ts
export interface Snapshot {
  revision: core.Revision
  base: BaseSnapshot
  graph: GraphSnapshot
  scene: SceneSnapshot
  ui: UiSnapshot
}
```

这是整个新系统最关键的 contract。

它只保留 5 个一级字段：

- `revision`
- `base`
- `graph`
- `scene`
- `ui`

其中真正的内容分布如下。

### 7.4 `editor.BaseSnapshot`

```ts
// contracts/editor.ts
export interface BaseSnapshot {
  documentRevision: core.Revision
  inputRevision: core.Revision
}
```

`base` 只负责回答两个问题：

- 这份 editor snapshot 建立在哪个 committed document revision 上
- 建立在哪个 input revision 上

### 7.5 `editor.GraphSnapshot`

```ts
// contracts/editor.ts
export interface GraphSnapshot {
  nodes: core.Family<NodeId, NodeView>
  edges: core.Family<EdgeId, EdgeView>
  owners: OwnerViews
}

export interface OwnerViews {
  mindmaps: core.Family<MindmapId, MindmapView>
  groups: core.Family<GroupId, GroupView>
}
```

这里用的是 `graph`，不是 `entities`。

原因是：

- 在 editor 语境里，这些已经不是原始实体
- 而是最终投影后的 graph view

### 7.6 `editor.SceneSnapshot`

```ts
// contracts/editor.ts
export interface SceneSnapshot {
  layers: readonly SceneLayer[]
  items: readonly SceneItem[]
  spatial: SpatialView
  pick: PickView
}
```

这些字段同属一个职责域，因此收在 `scene` 下，不继续平铺到总快照根上。

### 7.7 `editor.UiSnapshot`

```ts
// contracts/editor.ts
export interface UiSnapshot {
  selection: SelectionView
  chrome: ChromeView
}
```

`selection` 和 `chrome` 都不是 graph facts，也不是 scene plumbing。

它们属于 UI projection，因此收口到 `ui`。

### 7.8 `editor.Change`

```ts
// contracts/editor.ts
export interface Change {
  graph: GraphChange
  scene: core.Flags
  ui: UiChange
}

export interface GraphChange {
  nodes: core.Ids<NodeId>
  edges: core.Ids<EdgeId>
  owners: OwnerChange
}

export interface OwnerChange {
  mindmaps: core.Ids<MindmapId>
  groups: core.Ids<GroupId>
}

export interface UiChange {
  selection: core.Flags
  chrome: core.Flags
}
```

这里有一个刻意的命名决定：

- 用 `editor.Change`
- 不用 `PublishedChangeSet`

这是为了让 committed 和 projection 两边保持完全对称：

- `document.Change`
- `editor.Change`

### 7.9 `editor.Runtime`

```ts
// contracts/editor.ts
export interface Runtime {
  snapshot(): Snapshot
  update(input: Input, change: InputChange): Result
  subscribe(listener: (snapshot: Snapshot, change: Change) => void): () => void
}

export interface Result {
  snapshot: Snapshot
  change: Change
  trace?: trace.Run
}
```

`editor.Runtime` 是 authoritative projection runtime。

它的公开返回值只有：

- `editor.Snapshot`
- `editor.Change`
- 可选 `trace.Run`

### 7.10 `editor.Read`

```ts
// contracts/editor.ts
export interface Read {
  snapshot(): Snapshot
  node(id: NodeId): NodeView | undefined
  edge(id: EdgeId): EdgeView | undefined
  mindmap(id: MindmapId): MindmapView | undefined
  group(id: GroupId): GroupView | undefined
}
```

`editor.Read` 只是 snapshot facade。

它不允许：

- 内部再跑半套 runtime
- 直接读 working state
- fallback 到 document projection read

---

## 8. `phase` contract 族

`phase` 是 runtime 内部 contract，但它必须在第一步就冻结，因为它决定了整套架构的稳定边界。

### 8.1 `phase.Name`

```ts
// contracts/phase.ts
export type Name =
  | 'input'
  | 'graph'
  | 'measure'
  | 'structure'
  | 'tree'
  | 'element'
  | 'selection'
  | 'chrome'
  | 'scene'
  | 'publish'
```

命名保持短且职责单一。

不使用：

- `InputNormalizePhase`
- `GraphAssemblePhase`
- `TreeProjectionPhase`

作为 contract 主名字。

这些长名字可以保留在实现文件夹名里，但 contract 层只保留短名字。

### 8.2 `phase.Spec`

```ts
// contracts/phase.ts
export interface Spec {
  name: Name
  deps: readonly Name[]
  run(context: Context): Result
}
```

这里只保留三件事：

- phase 叫什么
- 依赖谁
- 怎么跑

### 8.3 `phase.Context`

```ts
// contracts/phase.ts
export interface Context {
  document: document.Snapshot
  input: editor.Input
  working: Working
  previous?: editor.Snapshot
}

export interface Working {
  graph: GraphWorkingState
  measure: MeasureWorkingState
  structure: StructureWorkingState
  tree: TreeWorkingState
  element: ElementWorkingState
  selection: SelectionWorkingState
  chrome: ChromeWorkingState
  scene: SceneWorkingState
}
```

这里故意不用一个巨大平铺的 `WorkingState`。

原因是 phase context 本身就应该按职责分区。

### 8.4 `phase.Result`

```ts
// contracts/phase.ts
export interface Result {
  action: core.Action
  change: Change
  metrics?: Metrics
}

export interface Change {
  graph: editor.GraphChange
  scene: core.Flags
  ui: editor.UiChange
}

export interface Metrics {
  inputCount?: number
  outputCount?: number
  reusedCount?: number
  rebuiltCount?: number
  durationMs?: number
}
```

`phase.Result.change` 和 `editor.Change` 保持同构。

这样做的收益很大：

- publish 汇总时不用再做第二套翻译
- 每个 phase 的 changed 域天然对齐最终 publish 域

---

## 9. `source` contract 族

`source` 只描述 sink-local 同步。

它不是业务语义层。

### 9.1 `source.Input`

```ts
// contracts/source.ts
export interface Input<TSink> {
  previous?: editor.Snapshot
  next: editor.Snapshot
  change: editor.Change
  sink: TSink
}
```

这里只有四个字段，不再扩展。

更具体的同步细节属于具体 sink。

### 9.2 `source.Sync`

```ts
// contracts/source.ts
export interface Sync<TSink> {
  sync(input: Input<TSink>): void
}
```

这里最终名字就叫 `Sync`。

不叫：

- `SnapshotSourceSync`
- `PublishedSnapshotAdapter`
- `RuntimeSinkBridge`

因为这个职责本来就很简单：

- 把 snapshot 同步进 sink

---

## 10. `trace` contract 族

`trace` 不是第一优先级，但 contract 仍然要冻结，避免每层自己定义一份 trace schema。

### 10.1 `trace.Phase`

```ts
// contracts/trace.ts
export interface Phase {
  name: phase.Name
  action: core.Action
  changed: boolean
  durationMs: number
  metrics?: phase.Metrics
}
```

### 10.2 `trace.Run`

```ts
// contracts/trace.ts
export interface Run {
  revision: core.Revision
  phases: readonly Phase[]
  totalMs: number
}
```

这里只定义最小公共结构。

更细的 profiling 字段如果将来需要，可以放在实现层扩展，但不要污染主 contract。

---

## 11. 最终 public surface

如果把所有 contract 合在一起，最终 public surface 应该非常小。

```ts
type WhiteboardRuntimeContracts = {
  document: {
    engine: document.Engine
    snapshot: document.Snapshot
    change: document.Change
  }
  editor: {
    runtime: editor.Runtime
    read: editor.Read
    snapshot: editor.Snapshot
    change: editor.Change
  }
}
```

真正对外需要长期稳定维护的，核心就这些。

---

## 12. 必须删除的旧 contract

为了保证系统不会回到旧世界，下面这些 contract 名字和模型必须直接删除：

- `EngineRead`
- `NodeRead`
- `EdgeRead`
- `MindmapRead`
- `SceneRead`
- `DocumentEngineSnapshot`
- `DocumentChangeSet`
- `PublishedChangeSet`
- `RuntimePhase`
- `SnapshotSourceSync`

要删除的不只是名字，也是其背后的系统边界：

- engine projection read
- editor selector chain
- source 层二次定义语义

---

## 13. 为什么这套 contract 复杂度更低

复杂度降低，不是因为字段少，而是因为边界更硬。

具体体现在：

### 13.1 只有两份 authoritative truth

- `document.Snapshot`
- `editor.Snapshot`

### 13.2 committed 和 projection 命名完全对称

- `document.Snapshot` / `document.Change`
- `editor.Snapshot` / `editor.Change`

### 13.3 领域边界都通过 contract 族表达

- committed truth 在 `document`
- projection truth 在 `editor`
- runtime steps 在 `phase`
- sink sync 在 `source`

### 13.4 大类型按职责切分，不再平铺

- `editor.Snapshot.base`
- `editor.Snapshot.graph`
- `editor.Snapshot.scene`
- `editor.Snapshot.ui`

### 13.5 对外 surface 小

最终对外需要稳定维护的，只剩很少几类对象。

这才是长期最优真正需要的低复杂度。

---

## 14. 最终冻结的 contract 清单

第一步要冻结的最终 contract，就是下面这些：

- `core.Revision`
- `core.Action`
- `core.Family`
- `document.Snapshot`
- `document.State`
- `document.Facts`
- `document.Change`
- `document.Engine`
- `editor.Input`
- `editor.InputChange`
- `editor.Snapshot`
- `editor.Change`
- `editor.Runtime`
- `editor.Read`
- `phase.Name`
- `phase.Spec`
- `phase.Context`
- `phase.Result`
- `source.Input`
- `source.Sync`
- `trace.Phase`
- `trace.Run`

这份清单冻结后，后续实现只能在这些 contract 下展开，不能再重新发明一套命名体系。

---

## 15. 一句话结论

whiteboard 的第一步，不是先写 runtime 代码，而是先把 committed truth、projection truth、phase、source 这 4 组 contract 用最简单稳定的名字冻结下来。

最终系统应该长期围绕这组对称名字工作：

- `document.Snapshot`
- `document.Change`
- `editor.Snapshot`
- `editor.Change`
- `phase.Spec`
- `source.Sync`

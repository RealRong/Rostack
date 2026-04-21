# Whiteboard Runtime Contract 设计稿

本文是 whiteboard 统一重构的第一步。

目标不是解释现状，也不是给旧模型补一个兼容层，而是一次性冻结最终 contract，让后续 `whiteboard-engine`、`whiteboard-editor-graph`、`whiteboard-editor`、`whiteboard-react` 都围绕同一套名字和边界落地。

本文只做一件事：

- 定义长期最优的 runtime contract

本文明确假设：

- 不兼容旧 `EngineRead`
- 不兼容旧 editor query/layout/read 链
- 不保留双轨
- 不保留过渡 facade
- 不把旧名字继续带进新系统

---

## 1. 命名原则

这套 contract 的命名目标只有三个：

1. 简单
2. 稳定
3. 按职责分层

### 1.1 顶层命名空间

顶层只保留 6 个命名空间：

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

这些词不是永远不能在实现里出现，而是不应出现在最终 public contract 的主路径上。

### 1.2 统一后缀

每个命名空间内部，只优先使用下面这些后缀：

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

### 1.3 禁止旧式长命名

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

也就是说，新 contract 会主动废弃前一版设计讨论中的占位名字。

### 1.4 结构优先于平铺

类型字段如果超过 5 到 7 个，优先收进职责子命名空间，而不是继续平铺。

例如不推荐：

```ts
interface EditorSnapshot {
  revision: number
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
interface EditorSnapshot {
  revision: number
  base: editor.BaseSnapshot
  graph: editor.GraphSnapshot
  scene: editor.SceneSnapshot
  ui: editor.UiSnapshot
}
```

原则很简单：

- 先分职责
- 再谈字段

---

## 2. Contract 总览

最终 contract 图只保留下面这些核心对象：

```ts
namespace document {
  interface Snapshot {}
  interface Change {}
  interface Engine {}
}

namespace editor {
  interface Input {}
  interface InputChange {}
  interface Snapshot {}
  interface Change {}
  interface Runtime {}
  interface Read {}
}

namespace phase {
  type Name = ...
  interface Spec {}
  interface Context {}
  interface Result {}
}

namespace source {
  interface Input<TSink> {}
  interface Sync<TSink> {}
}

namespace trace {
  interface Phase {}
  interface Run {}
}
```

这里有两个关键判断：

1. committed truth 用 `document.*`
2. projection truth 用 `editor.*`

因此整个 whiteboard 只有两份 authoritative truth：

- `document.Snapshot`
- `editor.Snapshot`

不再有第三份。

---

## 3. `core` 命名空间

`core` 不承载 whiteboard 业务语义，只提供最小通用 contract。

```ts
namespace core {
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
}
```

设计原则：

- `Family` 统一承载 keyed snapshot
- `Ids` 统一承载 changed ids
- `Action` 统一承载 phase 行为

不再单独发明：

- `NodeStoreState`
- `EntityProjectionCache`
- `PublishedEntityMap`

这些应该在实现层解决，不进最终 contract。

---

## 4. `document` 命名空间

`document` 只代表 committed truth。

它由 `whiteboard-engine` 对外提供。

### 4.1 `document.Snapshot`

```ts
namespace document {
  export interface Snapshot {
    revision: core.Revision
    state: document.State
    change: document.Change
  }

  export interface State {
    root: Document
    facts: document.Facts
  }
}
```

这里有两个字段层级：

- `state.root`
- `state.facts`

这样做的目的不是层级好看，而是明确区分：

- 原始 document 数据
- engine 归一后的 committed facts

### 4.2 `document.Facts`

```ts
namespace document {
  export interface Facts {
    entities: document.Entities
    relations: document.Relations
  }

  export interface Entities {
    nodes: ReadonlyMap<NodeId, Node>
    edges: ReadonlyMap<EdgeId, Edge>
    owners: document.Owners
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
    edgeNodes: ReadonlyMap<EdgeId, document.EdgeNodes>
    frameNodes: ReadonlyMap<NodeId, readonly NodeId[]>
    groupItems: ReadonlyMap<GroupId, readonly CanvasItemRef[]>
  }

  export interface EdgeNodes {
    source?: NodeId
    target?: NodeId
  }
}
```

这里坚持两条原则：

1. `entities` 只放实体
2. `relations` 只放关系

不把 relation 字段平铺到 `Facts` 根上。

### 4.3 `document.Change`

```ts
namespace document {
  export interface Change {
    entities: document.EntityChange
    relations: document.RelationChange
    root: core.Flags
  }

  export interface EntityChange {
    nodes: core.Ids<NodeId>
    edges: core.Ids<EdgeId>
    owners: document.OwnerChange
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
}
```

这里故意不用 `ChangeSet`。

原因很简单：

- `Change` 足够清楚
- `Set` 是实现细节，不是领域语义

### 4.4 `document.Engine`

```ts
namespace document {
  export interface Engine {
    snapshot(): document.Snapshot
    subscribe(listener: (snapshot: document.Snapshot) => void): () => void
    execute(command: Command): CommandResult
    apply(ops: readonly Operation[]): CommandResult
  }
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

这些都不属于 `document` 命名空间。

---

## 5. `editor` 命名空间

`editor` 代表 projection truth。

它由新的 `whiteboard-editor-graph` 对外提供。

### 5.1 `editor.Input`

`editor.Input` 是 editor runtime 的完整输入面。

```ts
namespace editor {
  export interface Input {
    document: editor.DocumentInput
    session: editor.SessionInput
    measure: editor.MeasureInput
    interaction: editor.InteractionInput
    viewport: editor.ViewportInput
    clock: editor.ClockInput
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
}
```

这里不把 `edit / preview / viewport / selection / hover` 全堆平在一个接口里。

输入 contract 的目的，是让 phase 一眼看出自己依赖哪个职责域。

### 5.2 `editor.InputChange`

```ts
namespace editor {
  export interface InputChange {
    document: core.Flags
    session: core.Flags
    measure: core.Flags
    interaction: core.Flags
    viewport: core.Flags
    clock: core.Flags
  }
}
```

`InputChange` 保持极简。

更细的影响范围由 runtime 内部 `ImpactPlan` 继续展开。

### 5.3 `editor.Snapshot`

```ts
namespace editor {
  export interface Snapshot {
    revision: core.Revision
    base: editor.BaseSnapshot
    graph: editor.GraphSnapshot
    scene: editor.SceneSnapshot
    ui: editor.UiSnapshot
  }
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

### 5.4 `editor.BaseSnapshot`

```ts
namespace editor {
  export interface BaseSnapshot {
    documentRevision: core.Revision
    inputRevision: core.Revision
  }
}
```

`base` 只负责回答两个问题：

- 这份 editor snapshot 建立在哪个 committed document revision 上
- 建立在哪个 input revision 上

### 5.5 `editor.GraphSnapshot`

```ts
namespace editor {
  export interface GraphSnapshot {
    nodes: core.Family<NodeId, editor.NodeView>
    edges: core.Family<EdgeId, editor.EdgeView>
    owners: editor.OwnerViews
  }

  export interface OwnerViews {
    mindmaps: core.Family<MindmapId, editor.MindmapView>
    groups: core.Family<GroupId, editor.GroupView>
  }
}
```

注意这里用的是 `graph`，不是 `entities`。

原因是：

- 在 editor 语境里，这些已经不是原始实体
- 而是最终投影后的 graph view

### 5.6 `editor.SceneSnapshot`

```ts
namespace editor {
  export interface SceneSnapshot {
    layers: readonly editor.SceneLayer[]
    items: readonly editor.SceneItem[]
    spatial: editor.SpatialView
    pick: editor.PickView
  }
}
```

这里也不再平铺：

- `sceneLayers`
- `sceneItems`
- `spatialIndex`
- `pickIndex`

因为这些本来就属于同一个职责域。

### 5.7 `editor.UiSnapshot`

```ts
namespace editor {
  export interface UiSnapshot {
    selection: editor.SelectionView
    chrome: editor.ChromeView
  }
}
```

`selection` 和 `chrome` 都不是 graph facts，也不是 scene plumbing。

它们属于 UI projection，因此收口到 `ui`。

### 5.8 `editor.Change`

```ts
namespace editor {
  export interface Change {
    graph: editor.GraphChange
    scene: core.Flags
    ui: editor.UiChange
  }

  export interface GraphChange {
    nodes: core.Ids<NodeId>
    edges: core.Ids<EdgeId>
    owners: editor.OwnerChange
  }

  export interface OwnerChange {
    mindmaps: core.Ids<MindmapId>
    groups: core.Ids<GroupId>
  }

  export interface UiChange {
    selection: core.Flags
    chrome: core.Flags
  }
}
```

这里有一个刻意的命名决定：

- 用 `editor.Change`
- 不用 `PublishedChangeSet`

这是为了让 committed 和 projection 两边保持完全对称：

- `document.Change`
- `editor.Change`

### 5.9 `editor.Runtime`

```ts
namespace editor {
  export interface Runtime {
    snapshot(): editor.Snapshot
    update(input: editor.Input, change: editor.InputChange): editor.Result
    subscribe(listener: (snapshot: editor.Snapshot, change: editor.Change) => void): () => void
  }

  export interface Result {
    snapshot: editor.Snapshot
    change: editor.Change
    trace?: trace.Run
  }
}
```

`editor.Runtime` 是 authoritative projection runtime。

它的公开返回值只有：

- `editor.Snapshot`
- `editor.Change`
- 可选 `trace.Run`

### 5.10 `editor.Read`

```ts
namespace editor {
  export interface Read {
    snapshot(): editor.Snapshot
    node(id: NodeId): editor.NodeView | undefined
    edge(id: EdgeId): editor.EdgeView | undefined
    mindmap(id: MindmapId): editor.MindmapView | undefined
    group(id: GroupId): editor.GroupView | undefined
  }
}
```

`editor.Read` 只是 snapshot facade。

它不允许：

- 内部再跑半套 runtime
- 直接读 working state
- fallback 到 document projection read

---

## 6. `phase` 命名空间

`phase` 是 runtime 内部 contract，但它必须在第一步就冻结，因为它决定了整套架构的稳定边界。

### 6.1 `phase.Name`

```ts
namespace phase {
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
}
```

命名保持短且职责单一。

不使用：

- `InputNormalizePhase`
- `GraphAssemblePhase`
- `TreeProjectionPhase`

作为 contract 主名字。

这些长名字可以保留在实现文件夹名里，但 contract 层只保留短名字。

### 6.2 `phase.Spec`

```ts
namespace phase {
  export interface Spec {
    name: phase.Name
    deps: readonly phase.Name[]
    run(context: phase.Context): phase.Result
  }
}
```

这里只保留三件事：

- phase 叫什么
- 依赖谁
- 怎么跑

### 6.3 `phase.Context`

```ts
namespace phase {
  export interface Context {
    document: document.Snapshot
    input: editor.Input
    working: phase.Working
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
}
```

这里故意不用一个巨大平铺的 `WorkingState`。

原因是 phase context 本身就应该按职责分区。

### 6.4 `phase.Result`

```ts
namespace phase {
  export interface Result {
    action: core.Action
    change: phase.Change
    metrics?: phase.Metrics
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
}
```

`phase.Result.change` 和 `editor.Change` 保持同构。

这样做的收益很大：

- publish 汇总时不用再做第二套翻译
- 每个 phase 的 changed 域天然对齐最终 publish 域

---

## 7. `source` 命名空间

`source` 只描述 sink-local 同步。

它不是业务语义层。

### 7.1 `source.Input`

```ts
namespace source {
  export interface Input<TSink> {
    previous?: editor.Snapshot
    next: editor.Snapshot
    change: editor.Change
    sink: TSink
  }
}
```

这里只有四个字段，不再扩展。

更具体的同步细节属于具体 sink。

### 7.2 `source.Sync`

```ts
namespace source {
  export interface Sync<TSink> {
    sync(input: source.Input<TSink>): void
  }
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

## 8. `trace` 命名空间

`trace` 不是第一优先级，但 contract 仍然要冻结，避免每层自己定义一份 trace schema。

### 8.1 `trace.Phase`

```ts
namespace trace {
  export interface Phase {
    name: phase.Name
    action: core.Action
    changed: boolean
    durationMs: number
    metrics?: phase.Metrics
  }
}
```

### 8.2 `trace.Run`

```ts
namespace trace {
  export interface Run {
    revision: core.Revision
    phases: readonly trace.Phase[]
    totalMs: number
  }
}
```

这里只定义最小公共结构。

更细的 profiling 字段如果将来需要，可以放在实现层扩展，但不要污染主 contract。

---

## 9. 最终 public surface

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

## 10. 必须删除的旧 contract

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

## 11. 为什么这套 contract 复杂度更低

复杂度降低，不是因为字段少，而是因为边界更硬。

具体体现在：

### 11.1 只有两份 authoritative truth

- `document.Snapshot`
- `editor.Snapshot`

### 11.2 committed 和 projection 命名完全对称

- `document.Snapshot` / `document.Change`
- `editor.Snapshot` / `editor.Change`

### 11.3 领域边界都通过命名空间表达

- committed truth 在 `document`
- projection truth 在 `editor`
- runtime steps 在 `phase`
- sink sync 在 `source`

### 11.4 大类型按职责切分，不再平铺

- `editor.Snapshot.base`
- `editor.Snapshot.graph`
- `editor.Snapshot.scene`
- `editor.Snapshot.ui`

### 11.5 对外 surface 小

最终对外需要稳定维护的，只剩很少几类对象。

这才是长期最优真正需要的“低复杂度”。

---

## 12. 最终冻结的 contract 清单

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

## 13. 一句话结论

whiteboard 的第一步，不是先写 runtime 代码，而是先把 committed truth、projection truth、phase、source 这 4 组 contract 用最简单稳定的名字冻结下来。

最终系统应该长期围绕这组对称命名工作：

- `document.Snapshot`
- `document.Change`
- `editor.Snapshot`
- `editor.Change`
- `phase.Spec`
- `source.Sync`

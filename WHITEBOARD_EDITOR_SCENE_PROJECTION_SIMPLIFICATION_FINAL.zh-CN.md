# Whiteboard Editor Scene Projection Complexity 最小化方案

## 1. 口径

- 本文是 [WHITEBOARD_EDITOR_SCENE_RENDER_SURFACE_FINAL.zh-CN.md](/Users/realrong/Rostack/WHITEBOARD_EDITOR_SCENE_RENDER_SURFACE_FINAL.zh-CN.md) 的姊妹篇。
- 姊妹篇解决的是“哪些 render surface 应进入 `editor-scene`、public surface 如何收口”。
- 本文解决的是更底层的问题：
  - `whiteboard/packages/whiteboard-editor/src/projection/*`
  - `whiteboard/packages/whiteboard-editor-scene/src/*`
  - `shared/projector/*`
  这一整条链，到底该用什么最少、最集成的 infra 把复杂度真正打穿。
- 本文直接取代之前那版“多 spec 拆分”的方案。
- 目标只有一个：
  - **不用兼容旧设计，不做局部 patch，直接收敛到长期最优的最小模型。**

---

## 2. 最终结论

对 `editor-scene` 这条链本身，公开设计上最终只应剩下 **一条基础设施主线**：

- `ProjectionModel`

它内部只依赖一个附属 primitive：

- `InputChangeSpec`

也就是说，从“infra 口径”看，最终不是六个 spec，也不是五个 spec，而是：

1. `InputChangeSpec`
2. `ProjectionModel`

其中：

- `InputChangeSpec` 只负责 source-oriented change tree。
- `ProjectionModel` 直接覆盖：
  - plan
  - phase run
  - canonical read
  - React store bridge
  - optional capture

必须删掉作为独立公共抽象存在的东西：

- `resolve spec`
- `read context spec`
- `project spec`
- `publish spec`
- `phase plan spec`

这些能力不是不存在，而是都应该内聚到 `ProjectionModel` 里，不再分裂成多条基础设施线。

但这里有一个重要前提：

- **这两个抽象是 `editor-scene` 这一条线上层模型的最小形态。**
- **它们不是 `shared/projector` 全局唯一应该剩下的抽象。**

`dataview/packages/dataview-engine/src/active` 目前明确还在使用一套更底层的 phase projector core：

- [createActiveProjector.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/projector/createActiveProjector.ts:10) 直接调用 `createProjector(...)`
- [spec.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/projector/spec.ts:22) 直接提供 `ProjectorSpec`
- [contracts/projector.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/contracts/projector.ts:31) 明确定义 `query / membership / summary / publish` phase
- [publish/stage.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/publish/stage.ts:204) 明确以 `snapshot/delta` 作为最终输出

所以真正长期最优的分层不是“让 `shared/projector` 全部只剩 `InputChangeSpec + ProjectionModel`”，而是：

- 底层保留 generic phase runtime
- 上层再提供 `InputChangeSpec + ProjectionModel`

一句话：

- **真正应该暴露给上层的，不是一堆 spec，而是一个拥有 canonical state/read/store surface 的 projection runtime。**

---

## 3. 为什么现在这条链会复杂

### 3.1 外部在用内部 phase 语言说话

现在 `whiteboard-editor` 传给 `editor-scene` 的变化里，已经带了大量内部 phase 语义，例如：

- `graph.nodes.preview`
- `graph.edges.edit`
- `ui.overlay`
- `ui.draw`

这导致两层重复：

- 外部桥接先做一遍 dirty planning
- scene runtime 内部再做一遍 phase planning

这不是分工，而是重复表达。

### 3.2 同一份 delta lifecycle 被维护了两遍

当前重复非常明确：

- `whiteboard/packages/whiteboard-editor/src/projection/input.ts`
  - `createEmptyEditorGraphInputDelta`
  - `mergeEditorGraphInputDelta`
  - `takeEditorGraphInputDelta`
  - `hasEditorGraphInputDelta`
- `whiteboard/packages/whiteboard-editor-scene/src/projector/spec.ts`
  - `createEmptyInputDelta`

这本质上都是一件事：

- source change schema
- pending change lifecycle

不应该 editor 一份、scene 一份。

### 3.3 query 不是单一数据源

当前 `whiteboard/packages/whiteboard-editor-scene/src/runtime/query.ts` 同时依赖：

- `runtime.snapshot()`
- `runtime.graph()`
- `runtime.indexes()`
- `runtime.spatial()`

结果就是：

- `node(id)` 看 snapshot
- `relatedEdges(nodeIds)` 看 working index
- `mindmapStructure(value)` 又自己 resolve 一遍

这会让 query surface 看起来统一，内部却是 split-brain。

### 3.4 publish/snapshot 在热路径里复制了一套状态

当前 runtime 实际有两份 world：

- working state
- published snapshot

然后再从 snapshot bridge 到 store。

这会多出一整套重复 plumbing：

- publish delta
- family publish
- struct publish
- snapshot assembly
- store sync

这部分不是业务复杂度，是设计层级太多。

### 3.5 `ui / render / items` 被拆得过细

现在 scene 内部虽然名义上分 phase，但从依赖关系上看：

- `ui`
- `render`
- `items`

大部分都属于“view assembly”。

继续把它们拆成多条公开 infra，只会让 planner、publish、read 都更碎。

---

## 4. 最小 infra 原则

### 4.1 只有 source change 能独立 spec 化

`InputChangeSpec` 是值得独立存在的，因为它天然是 schema：

- 需要定义形状
- 需要 create / merge / take / has
- editor bridge 和 scene runtime 都会用到

所以它应该独立。

### 4.2 其他能力不该再各自独立 spec 化

下面这些能力虽然真实存在，但不值得各自拥有独立公共 spec：

- resolve
- read context
- project family lifecycle
- publish namespace lifecycle
- phase planning

原因很简单：

- 它们都只服务于 projection runtime 本身
- 单独抽出去后，调用方不会真正复用，只会多背一层概念

所以正确做法不是“给每件事一个 spec”，而是：

- **把这些能力全部塞回 `ProjectionModel`。**

### 4.3 canonical source 必须只剩一份

最终 runtime 里只能有一个 canonical scene state。

允许存在：

- React stores
- debug capture

但它们都只是 canonical state 的投影，不是第二份运行时真相。

### 4.4 query/read 必须直接站在 canonical state 上

最终 query 不应该再依赖：

- 一半 snapshot
- 一半 working map

而应该只依赖：

- canonical scene state
- build 在该 state 之上的 read API

### 4.5 store bridge 应该是 runtime 内建能力

当前 store bridge 又是单独一层。

长期最优里，runtime 自己就应该同时拥有：

- `state`
- `read`
- `stores`

而不是：

- runtime 产出 snapshot
- 外部再基于 snapshot 建一层 stores

---

## 5. 最终只有两个公开抽象

### 5.1 `InputChangeSpec`

`InputChangeSpec` 只描述 source-oriented change tree，绝不描述内部 phase 语言。

最终 API：

```ts
import {
  defineChangeSpec,
  flag,
  ids,
  set,
  createChangeState,
  mergeChangeState,
  takeChangeState,
  hasChangeState
} from '@shared/projector/change'

export const sceneInputChangeSpec = defineChangeSpec({
  document: {
    reset: flag(),
    order: flag(),
    nodes: ids<NodeId>(),
    edges: ids<EdgeId>(),
    mindmaps: ids<MindmapId>(),
    groups: ids<GroupId>()
  },
  session: {
    tool: flag(),
    selection: flag(),
    hover: flag(),
    edit: flag(),
    interaction: flag(),
    draft: {
      nodes: ids<NodeId>(),
      edges: ids<EdgeId>()
    },
    preview: {
      nodes: ids<NodeId>(),
      edges: ids<EdgeId>(),
      mindmaps: ids<MindmapId>(),
      marquee: flag(),
      guides: flag(),
      draw: flag(),
      edgeGuide: flag()
    }
  },
  clock: {
    mindmaps: set<MindmapId>()
  }
})

const pending = createChangeState(sceneInputChangeSpec)
mergeChangeState(sceneInputChangeSpec, pending, nextChange)
const flushed = takeChangeState(sceneInputChangeSpec, pending)
const dirty = hasChangeState(sceneInputChangeSpec, pending)
```

原则：

- 输入变化只描述事实变化
- 不允许再出现 `graph.*` / `ui.*` / `render.*`

### 5.2 `ProjectionModel`

这是 `editor-scene` 上层 runtime 的唯一主抽象。

它不是“project spec + publish spec + resolve spec + read context spec + phase plan spec”的包装壳。

它本身就直接定义：

- canonical state
- canonical read
- public store surface
- phase planning
- phase execution
- optional capture

最终 API：

```ts
import {
  defineProjectionModel,
  createProjectionRuntime
} from '@shared/projector'

export const sceneProjectionModel = defineProjectionModel({
  change: sceneInputChangeSpec,

  createState: () => createSceneState(),

  createRead: (state) => createSceneRead(state),

  surface: {
    graph: {
      node: family({
        read: state => state.graph.nodes
      }),
      edge: family({
        read: state => state.graph.edges
      }),
      owner: {
        mindmap: family({
          read: state => state.graph.owners.mindmaps
        }),
        group: family({
          read: state => state.graph.owners.groups
        })
      }
    },
    view: {
      node: family({
        read: state => state.view.nodes
      }),
      edge: family({
        read: state => state.view.edges
      }),
      chrome: value({
        read: state => state.view.chrome
      }),
      items: value({
        read: state => state.view.items
      }),
      edgeRender: {
        statics: family({
          read: state => state.view.edgeRender.statics
        }),
        active: family({
          read: state => state.view.edgeRender.active
        }),
        labels: family({
          read: state => state.view.edgeRender.labels
        }),
        masks: family({
          read: state => state.view.edgeRender.masks
        }),
        overlay: value({
          read: state => state.view.edgeRender.overlay
        })
      }
    }
  },

  plan: ({ change, input, read }) => {
    return {
      phases: new Set(['graph', 'spatial', 'view']),
      scope: planSceneScope({ change, input, read })
    }
  },

  phases: [
    sceneGraphPhase,
    sceneSpatialPhase,
    sceneViewPhase
  ],

  capture: (state) => captureSceneSnapshot(state)
})

const runtime = createProjectionRuntime(sceneProjectionModel)
```

运行时 API：

```ts
const runtime = createProjectionRuntime(sceneProjectionModel)

runtime.update({
  input,
  change
})

runtime.state()
runtime.read()
runtime.stores
runtime.subscribe(listener)
runtime.capture()
```

这里的关键不是 `defineProjectionModel` 这个名字，而是：

- **所有 scene projection plumbing 都只从这一处进入。**

---

## 6. `ProjectionModel` 里到底收哪些能力

### 6.1 `createState`

定义唯一 canonical world。

最终 state 形态：

```ts
type SceneState = {
  graph: {
    nodes: Map<NodeId, NodeView>
    edges: Map<EdgeId, EdgeView>
    owners: {
      mindmaps: Map<MindmapId, MindmapView>
      groups: Map<GroupId, GroupView>
    }
  }

  index: {
    ownerByNode: Map<NodeId, SceneOwnerRef>
    edgeIdsByNode: Map<NodeId, readonly EdgeId[]>
    parentByNode: Map<NodeId, NodeId | undefined>
    childrenByNode: Map<NodeId, readonly NodeId[]>
    groupIdsBySignature: Map<string, readonly GroupId[]>
  }

  spatial: SceneSpatialState

  view: {
    nodes: Map<NodeId, NodeUiView>
    edges: Map<EdgeId, EdgeUiView>
    chrome: ChromeView
    items: readonly SceneItem[]
    selectionOverlay: SelectionOverlay | undefined
    mindmapChrome: Map<MindmapId, MindmapChromeView>
    edgeRender: {
      statics: Map<EdgeStaticId, EdgeStaticView>
      active: Map<EdgeId, EdgeActiveView>
      labels: Map<EdgeLabelKey, EdgeRenderLabelView>
      masks: Map<EdgeId, EdgeMaskView>
      overlay: EdgeOverlayView
    }
  }
}
```

要点：

- `graph / index / spatial / view` 是 canonical state。
- 不再存在第二份 published snapshot 作为热路径真相。

### 6.2 `createRead`

`read` 不需要再单独搞 `resolve spec` 或 `read context spec`。

它就是建立在 canonical state 上的一套 scene read API：

```ts
type SceneRead = {
  node(id: NodeId): NodeView | undefined
  edge(id: EdgeId): EdgeView | undefined
  mindmap(id: MindmapId): MindmapView | undefined
  group(id: GroupId): GroupView | undefined

  nodeUi(id: NodeId): NodeUiView | undefined
  edgeUi(id: EdgeId): EdgeUiView | undefined

  items(): readonly SceneItem[]
  chrome(): ChromeView

  query: {
    relatedEdges(nodeIds: Iterable<NodeId>): readonly EdgeId[]
    mindmapId(value: string): MindmapId | undefined
    mindmapStructure(value: string): MindmapStructure | undefined
    groupExact(target: SelectionTarget): readonly GroupId[]
    spatial: SceneSpatialRead
    snap(rect: Rect): readonly SnapCandidate[]
    frame: SceneFrameRead
    hit: {
      edge(input: EdgeHitInput): EdgeId | undefined
    }
  }
}
```

这意味着：

- resolve 只是 `read.query.*` 的一部分
- query 永远只站在一份 state 上取数

### 6.3 `surface`

`surface` 不是 publish spec。

它只是声明：

- runtime 需要把 canonical state 的哪些部分桥接成 store

也就是说：

- `surface` 服务于 React/store bridge
- 不是第二份 snapshot tree

### 6.4 `plan`

`plan` 也不再值得独立一个 `phase plan spec`。

它只是 model 的一个方法：

```ts
plan(args: {
  input: SceneInput
  change: SceneInputChange
  read: SceneRead
}): ProjectionPlan<'graph' | 'spatial' | 'view'>
```

最终只建议保留三个 phase：

- `graph`
- `spatial`
- `view`

这里的 `view` 合并旧的：

- `ui`
- `render`
- `items`

### 6.5 `phases`

phase 负责：

- mutate canonical state
- 标记 surface dirty

phase 不再负责：

- 组装 published snapshot
- 写 publish delta

phase 上下文应该长成：

```ts
type ScenePhaseContext = {
  input: SceneInput
  change: SceneInputChange
  state: SceneState
  read: SceneRead
  dirty: SceneSurfaceDirty
  scope: ScenePhaseScope
}
```

这里的 `dirty` 只描述：

- 哪些 family/value 需要 flush 到 stores

而不是另一套 snapshot publish delta。

### 6.6 `capture`

`capture` 是可选能力，只用于：

- devtools
- debug export
- trace dump

它可以返回：

- `SceneSnapshot`
- `SceneCapture`

但它绝不能再是热路径上的 canonical source。

---

## 7. 必须删除或内聚掉的抽象

以下概念可以存在于实现内部，但不允许再成为独立公共 infra 线：

- `defineResolveSpec`
- `defineReadContextSpec`
- `defineProjectSpec`
- `definePublishSpec`
- `definePhasePlanSpec`

还必须删除这些运行时层级：

- working state -> published snapshot -> store bridge 三段式
- 外部 phase delta -> 内部 phase plan 二段式

最终只允许：

- source change -> projection model -> canonical state/read/stores

---

## 8. 与现有 `shared/projector` 的关系

这里需要修正一个口径：

- `shared/projector` 不是只服务 `editor-scene`
- 它还服务 `dataview active`

而 `dataview active` 用的不是 `editor-scene` 这套问题模型，而是一套更底层的 phased derivation runtime。

### 8.1 `dataview active` 现在实际在用什么

`dataview active` 当前依赖的是 generic projector core：

- phase scope
  - [contracts/projector.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/contracts/projector.ts:83)
- phase planner
  - [planner.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/projector/planner.ts:16)
- generic projector spec/runtime
  - [spec.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/projector/spec.ts:22)
  - [createActiveProjector.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/projector/createActiveProjector.ts:10)
- publish helper
  - [publish/stage.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/publish/stage.ts:204)

这条线的本质是：

- `input -> query/membership/summary/publish phases -> snapshot/delta`

它没有 `editor-scene` 那种长期驻留的：

- canonical state
- canonical read
- store surface

所以它不应该迁移到 `ProjectionModel`。

### 8.2 `shared/projector` 最终应该拆成两层，不是一层

长期最优的做法是把 `shared/projector` 明确拆成：

1. `phase`
2. `change`
3. `model`

其中：

- `phase`
  - generic phased runtime
  - 给 `dataview active` 这种纯流水线 projector 用
- `change`
  - source/input change schema lifecycle
  - 给 `editor-scene` bridge 用
- `model`
  - canonical state/read/stores 一体化 runtime
  - 给 `editor-scene` 这种长期驻留 projection runtime 用

### 8.3 `dataview active` 应该怎么改

`dataview active` 不应该改语义，只应该改依赖分层。

最终应改成显式依赖低层 `phase` 能力：

```ts
import {
  defineScope,
  flag,
  slot,
  createPlan,
  createProjector,
  type ProjectorContext,
  type ProjectorPhase,
  type ProjectorPlanner,
  type ProjectorSpec
} from '@shared/projector/phase'

import {
  publishStruct,
  projectListChange
} from '@shared/projector/publish'
```

如果后面要进一步收口命名，可以继续把 `phase` 这层再命名得更直白一些，例如：

- `createProjector` -> `createPhaseRuntime`
- `ProjectorSpec` -> `PhaseRuntimeSpec`

但这是 phase core 的命名收口问题，不影响它和 `ProjectionModel` 的层级关系。

### 8.4 `editor-scene` 应该怎么改

`editor-scene` 不再直接站在 `phase` root abstraction 上暴露自己的最终设计，而应使用：

```ts
import {
  defineChangeSpec,
  createChangeState,
  mergeChangeState,
  takeChangeState,
  hasChangeState
} from '@shared/projector/change'

import {
  defineProjectionModel,
  createProjectionRuntime,
  family,
  value
} from '@shared/projector/model'
```

也就是说：

- `dataview active` 站在 `phase`
- `editor-scene` 站在 `change + model`

### 8.5 最终结论需要怎样修正

需要修正的不是 `editor-scene` 的最小模型，而是 `shared/projector` 的全局口径：

- `ProjectionModel` 可以保留
- `ChangeSpec` 概念应收窄为 `InputChangeSpec`
- `shared/projector` 底层仍必须保留 generic `phase` runtime

所以全局长期最优不是：

- `shared/projector = InputChangeSpec + ProjectionModel`

而是：

- `shared/projector/phase`
- `shared/projector/change`
- `shared/projector/model`

---

## 9. 现有基础设施该怎么复用

### 9.1 复用 `shared/core/store`

现有这些能力都应该继续复用：

- `createFamilyStore`
- `createStagedValueStore`
- `createStagedKeyedStore`
- `store.batch`

用途：

- `surface` family/value store 承载
- staged commit
- batched notify

### 9.2 staged store 取代 publish snapshot

最终流程应该是：

1. phase 更新 canonical state
2. phase 标记 `dirty`
3. runtime 在 update 尾部统一 flush 对应 stores
4. React 订阅 stores 收到 batched 通知

而不是：

1. phase 更新 working state
2. publish snapshot
3. 再从 snapshot diff 到 stores

### 9.3 query 不再读 stores

stores 只服务 React 订阅和消费。

query/read 永远直接读 canonical state。

这样可以避免：

- query 受 store flush 时序影响
- query 也开始变成第二套真相

---

## 10. `editor-scene` 最终目录建议

为了和上述模型对齐，`editor-scene` 最终结构建议收敛成：

```ts
whiteboard/packages/whiteboard-editor-scene/src/
  contracts/
    input.ts
    change.ts
    state.ts
    read.ts
    runtime.ts

  model/
    graph/
      node.ts
      edge.ts
      mindmap.ts
      group.ts
    spatial/
      patch.ts
      query.ts
    index/
      patch.ts
      read.ts
    view/
      node.ts
      edge.ts
      chrome.ts
      edgeRender.ts
      items.ts

  runtime/
    model.ts
    read.ts
    stores.ts
    createEditorSceneRuntime.ts
```

关键变化：

- `domain/*` 这种宽泛目录删除
- `projector/impact.ts` 不再独立存在，逻辑进入 `runtime/model.ts` 的 `plan`
- `projector/publish.ts` 从热路径删除
- `runtime/query.ts` 收敛为 `runtime/read.ts`

---

## 11. `whiteboard-editor/src/projection` 最终只保留什么

这一层最终只需要：

```ts
whiteboard/packages/whiteboard-editor/src/projection/
  adapter.ts
  bridge.ts
```

### 11.1 `adapter.ts`

职责：

- 把 engine/session/layout 转成 `SceneInput`
- 基于 `sceneInputChangeSpec` 产出 source change

### 11.2 `bridge.ts`

职责：

- 监听 editor 各来源变化
- merge pending change
- 调度 `runtime.update({ input, change })`

### 11.3 必须删除

- `projection/input.ts` 当前这套自定义 delta 生命周期
- editor 侧任何以 `graph.*` / `ui.*` 口径描述 scene 内部 phase 的桥接代码

---

## 12. 详细实施方案

### 12.1 P0: 引入 `InputChangeSpec`，删除双份 delta lifecycle

修改：

- `shared/projector/change`
- `whiteboard/packages/whiteboard-editor/src/projection/*`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/*`

动作：

- 新增 `shared/projector/change`
- 定义 `sceneInputChangeSpec`
- editor bridge 改为只维护 source-oriented change
- 删除 `projection/input.ts` 中的 `create/merge/take/has`
- 删除 `editor-scene/src/projector/spec.ts` 中重复的 `createEmptyInputDelta`

完成标准：

- repo 内只剩一套 scene input change lifecycle
- scene input change 不再出现 phase 命名

### 12.2 P1: 建立 canonical `SceneState` 和 `SceneRead`

修改：

- `whiteboard-editor-scene/src/contracts/*`
- `whiteboard-editor-scene/src/runtime/*`

动作：

- 拆分 `contracts/editor.ts`
- 新建 `contracts/state.ts`
- 新建 `contracts/read.ts`
- 把当前 `runtime/query.ts` 改成只读 canonical state
- 把 `resolveMindmapId`、`relatedEdges`、`groupExact` 等并入 `read.query.*`

完成标准：

- query 不再混用 snapshot 和 working/index/spatial
- runtime 对外只有一份 canonical read API

### 12.3 P2: 把 planner、phase、store bridge 收回 `ProjectionModel`

修改：

- `shared/projector/model`
- `whiteboard-editor-scene/src/runtime/model.ts`

动作：

- 在 `shared/projector/model` 上定义 `defineProjectionModel`
- 把现有 `Spec.plan`、`publish`、`store bridge` 收敛成一体化 runtime
- `editor-scene` 定义自己的 `sceneProjectionModel`
- `projector/impact.ts` 逻辑并入 model 的 `plan`

完成标准：

- 不再需要单独的 `phase plan spec`
- 不再需要单独的 `read context spec`

### 12.4 P3: phase 收敛为 `graph / spatial / view`

修改：

- `whiteboard-editor-scene/src/phases/*`
- `whiteboard-editor-scene/src/model/view/*`

动作：

- 保留 `graph`
- 保留 `spatial`
- 把旧的 `ui + render + items` 合并为 `view`
- `selection overlay`、`mindmap chrome`、`edge render`、`items` 都进入 `view`

完成标准：

- 对外 phase 认知只剩三段
- scene 内部 render/view surface 统一

### 12.5 P4: 删除 snapshot publish 热路径

修改：

- `whiteboard-editor-scene/src/projector/publish.ts`
- `whiteboard-editor-scene/src/projector/spec.ts`
- `whiteboard-editor-scene/src/runtime/*`
- `whiteboard-editor/src/scene/source.ts`

动作：

- 删除 working -> published snapshot 热路径
- 改为 phase 标记 `dirty`，runtime flush stores
- `scene/source.ts` 改为直接消费 runtime.stores
- 仅保留 `capture()` 作为调试/导出能力

完成标准：

- 热路径不再构造 snapshot tree
- React store bridge 直接从 canonical state flush

### 12.6 P5: 删除旧结构和重复命名

修改：

- `whiteboard-editor-scene/src/domain/*`
- `whiteboard-editor-scene/src/projector/*`
- `whiteboard-editor/src/projection/*`

动作：

- 删除 `domain/*`
- 删除独立 `impact.ts`
- 删除独立 `publish.ts`
- 删除旧 `projection/input.ts`
- 删除任何 `defineResolveSpec` / `definePublishSpec` 一类中间抽象尝试

完成标准：

- repo 内只保留一套新的 projection 主线

---

## 13. 最终检查清单

做到下面这些，才算真正把复杂度降下来了：

- editor 侧不再说内部 phase 语言
- scene input change 只剩 source-oriented 一套 schema
- runtime 只有一份 canonical state
- query/read 只读 canonical state
- React store 由 runtime 直接 flush，不再经过 snapshot publish
- scene phase 只剩 `graph / spatial / view`
- `resolve/read/project/publish/plan` 不再各自拥有独立公共 spec

如果这几条里有任意一条没做到，本质上都还是旧架构的变种，不是最终形态。

---

## 14. 一句话总结

这条链长期最优的最小 infra 不是“再发明更多 spec”，而是：

- **底层保留一份 generic `phase` runtime**
- **`editor-scene` 上层使用一份 source-oriented `InputChangeSpec`**
- **再叠一层拥有 state/read/stores/plan/phases/capture 的 `ProjectionModel` runtime**

其余所有 projection plumbing，都应该作为这个 model 的内部能力存在，而不是再拆成多条公开抽象。

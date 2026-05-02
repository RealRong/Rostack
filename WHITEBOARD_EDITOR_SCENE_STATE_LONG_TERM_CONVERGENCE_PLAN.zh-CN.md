# Whiteboard Editor State / Scene / View 长期最优收敛方案

## 目标

这份文档只讨论**长期最优结构**，不考虑兼容层、过渡 API、双轨实现。

文档中的命名统一使用概念名：

- `engine`
- `state`
- `viewport`
- `scene`
- `sync`
- `ui`

这些名字表示职责边界，不要求与当前代码里的 factory 名完全一致。

当前实现大致对应：

- `engine` -> `createEngine()` / `engine.create()`
- `state` -> `createEditorStateRuntime()`
- `scene` -> `createProjectionRuntime()`
- `ui` -> `createEditorSceneUi()`

本文后续优先使用这些短名，不重复引入 `xxxRuntime` 这类实现细节命名。

目标只有一个：

- 打通 `editor-state -> scene -> react/input` 上下游
- 让 scene 直接消费 typed editor delta
- 删除 `whiteboard-editor/src/state/delta.ts` 这类中间翻译层
- 保留最小且稳定的边界

---

## 最终结论

### 结论 1：viewport 不属于 scene，只是 scene 邻接只读依赖；background 不属于 scene，应该放进 `EditorSceneUi`

当前实现里，viewport 相关能力被挂在 scene 附近，但它们并不属于 scene 的核心职责：

- world -> screen 投影：`screenPoint()` / `screenRect()`
- 空间查询窗口：`visibleWorldRect()` / `visible()`
- hit / pick 半径归一化

而 background 更进一步，它连 query 都不是，只是：

- `document.background`
- `viewport.zoom`
- `viewport.center`

这三者的一个 UI 派生值

因此：

- **scene 不拥有 viewport**
- **scene 最多只在少量只读能力上依赖 viewport**
- **background 不应再作为 scene API 存在**
- **viewport 不应进入 editor-state mutation，也不应进入 scene commit/update 流**

长期最优结构应该是：

- `document delta` 负责 whiteboard authored data
- `editor delta` 负责 editor authored / interaction / preview data
- `viewport` 负责 camera / worldRect / screen projection data
- `EditorSceneUi` 负责 background 这类 UI 派生值

也就是说：

- `viewport` 退出 `editorStateMutationModel`
- `viewport` 退出 `EditorStateMutationDelta`
- `viewport` 退出 `EditorDelta`
- `scene` 不再暴露 `scene.viewport`
- `editor` 改为暴露 `editor.viewport`
- `background` 挂到 `EditorSceneUi`

### 结论 2：`whiteboard-editor/src/state/delta.ts` 可以删除，但前提是 editor-state model 和 scene invalidation 单位必须对齐

当前 `state/delta.ts` 之所以存在，不是因为 typed mutation delta 不够 typed，而是因为：

- 上游 editor-state 现在以粗粒度字段建模，例如整块 `overlay.preview`
- 下游 scene 需要细粒度 invalidation，例如：
  - 哪些 node 被 preview touched
  - 哪些 edge 被 hover touched
  - 哪些 mindmap 被 subtree/root preview touched
  - chrome 到底是 selection 变了、draw 变了，还是 edge guide 变了

所以当前问题不是“有没有 typed delta”，而是“typed delta 的 authored model 粒度不对”。

长期最优不是继续维护：

- `EditorDelta`
- `createEditorDeltaFromCommitFlags()`
- `createDocumentDrivenEditorDelta()`
- `mergeEditorDeltas()`

长期最优是：

- 直接把 editor-state authored model 收敛为 scene 真正消费的 invalidation 结构
- 让 scene 直接消费 `MutationDeltaOf<typeof editorStateMutationModel>`
- 只在 scene 内部保留 facts / invalidation 推导，不再保留跨包翻译协议

---

## View 与 Scene 的最终关系

## 判断

即使暂时没有视口裁剪需求，系统仍然需要 viewport，但不需要把它归到 scene：

1. `screenPoint()` / `screenRect()` 是 view 几何换算，不是 scene 数据投影。
2. `visible()` 的窗口定义来自 viewport，但它依赖的是 world 数据查询，不是 scene store 更新生命周期。
3. `pick()` 的 threshold 需要依赖 zoom 做世界坐标归一化。
4. background grid 只是 UI 派生值，不是 scene query。

所以应该把 viewport 从 scene 核心职责里拿出去，而不是继续弱化挂在 `scene.viewport` 名下。

## 结论

真正应该移除的是：

- viewport 进入 editor mutation commit 流
- viewport 进入 scene projection phase 的“delta update”
- viewport 作为 `EditorStateDocument.state.viewport`
- `scene.viewport`
- `scene.viewport.background()`

真正应该保留的是：

- `EditorViewportSnapshot`
- 一个独立的 `editor.viewport`
- world query 对 viewport 的只读依赖
- `EditorSceneUi.background`

## 最终 API

```ts
export interface EditorViewportSnapshot {
  zoom: number
  center: Point
  worldRect: Rect
}

export interface EditorViewport {
  get(): EditorViewportSnapshot
  subscribe(listener: () => void): () => void
  screenPoint(point: Point): Point
  screenRect(rect: Rect): Rect
  worldPoint(point: Point): Point
  visibleWorldRect(): Rect
}
```

按长期最优结构，scene 不再把 viewport 混在 update 里，而是只接收 document/editor 两路 authored 输入。

这里说的是**职责形态**，不是要求当前公开 factory 立刻改名。

示意：

```ts
const scene = ...
```

editor 自己单独持有 viewport。

示意：

```ts
const editor = createEditor({
  scene,
  viewport,
  ui: createEditorSceneUi({
    scene,
    viewport,
  }),
})
```

禁止继续使用：

```ts
scene.viewport
```

也禁止再把 viewport 混进 `editor delta` 或 `editor snapshot`。

## Scene 内部约束

viewport 只应该服务于：

- editor 级别的坐标换算
- world query 的窗口参数
- pick 半径归一化
- `EditorSceneUi.background`

viewport 不应该继续驱动：

- graph phase patch
- document phase patch
- editor authored facts patch
- scene store 推送

换句话说，长期最优结构里：

- graph / spatial / document 的变更来源只有 document delta
- ui / render 的 authored 变更来源只有 editor delta
- screen projection 相关结果通过 `editor.viewport` 只读计算
- background 通过 `EditorSceneUi` 派生

---

## Editor State 的最终 authored model

## 原则

editor-state 可以细粒度，但不能平铺成：

- `hoverNode`
- `hoverEdge`
- `previewNode`
- `previewEdge`

最终 API 必须保持语义分组：

- `hover: { node, edge, mindmap }`
- `preview: { node, edge, mindmap, selection, draw, edgeGuide }`

这不是命名偏好问题，而是 API 边界问题：

- `hover` 是一个语义域
- `preview` 是一个语义域
- 上游 intent、typed delta、下游 scene facts 应该沿同一语义域组织

## 需要的 shared mutation 能力

要实现上面的 grouped API，shared mutation 需要新增一层命名空间能力。

建议新增：

- `group()` 或 `namespace()`

它本身不直接代表 document access，而是只负责组织子 model。

示意：

```ts
const model = defineMutationModel<EditorStateDocument>()({
  state: singleton(...),
  hover: group({
    node: value<NodeId | null>(),
    edge: value<EdgeId | null>(),
    mindmap: value<MindmapId | null>(),
  }),
  preview: group({
    node: mapFamily<NodeId, NodePreview>()(...),
    edge: mapFamily<EdgeId, EdgePreview>()(...),
    mindmap: mapFamily<MindmapId, MindmapPreviewEntry>()(...),
    selection: singleton(...),
    draw: singleton(...),
    edgeGuide: singleton(...),
  }),
})
```

这里的 `group()` 是**命名空间**，不是 document 节点本身。

## 最终 editor-state 结构

```ts
export interface EditorStateDocument {
  state: {
    tool: Tool
    draw: DrawState
    selection: SelectionTarget
    edit: EditSession
    interaction: {
      mode: InteractionMode
      chrome: boolean
      space: boolean
    }
  }
  hover: {
    node: NodeId | null
    edge: EdgeId | null
    mindmap: MindmapId | null
  }
  preview: {
    node: Record<NodeId, NodePreview | undefined>
    edge: Record<EdgeId, EdgePreview | undefined>
    mindmap: Record<MindmapId, MindmapPreviewEntry | undefined>
    selection: {
      marquee?: {
        worldRect: Rect
        match: SelectionMarqueeMatch
      }
      guides: readonly Guide[]
    }
    draw: DrawPreview | null
    edgeGuide?: EdgeGuidePreview
  }
}
```

如果 shared mutation 暂时不能支持 group 下再挂 family，那么也不能回退到平铺命名。长期最优要求是：

- 先扩 shared mutation 的 namespace 能力
- 再落 editor-state model

而不是为了省基础设施，继续扩大命名污染面

## 最终 typed API

### Writer

```ts
writer.state.patch({
  tool,
  selection,
})

writer.hover.patch({
  node: nodeId,
  edge: null,
})

writer.preview.node.patch(nodeId, {
  hidden: true,
})

writer.preview.edge.patch(edgeId, {
  activeRouteIndex: 1,
})

writer.preview.selection.patch({
  marquee,
  guides,
})

writer.preview.draw.set(drawPreview)
writer.preview.edgeGuide.set(edgeGuide)
```

### Reader

```ts
reader.state.get()
reader.hover.get()
reader.preview.node.get(nodeId)
reader.preview.edge.get(edgeId)
reader.preview.mindmap.get(mindmapId)
reader.preview.selection.get()
reader.preview.draw.get()
reader.preview.edgeGuide.get()
```

### Delta

```ts
delta.state.tool.changed()
delta.state.selection.changed()

delta.hover.node.changed()
delta.hover.edge.changed()
delta.hover.mindmap.changed()

delta.preview.node.changed(nodeId)
delta.preview.node.touchedIds()
delta.preview.edge.changed(edgeId)
delta.preview.edge.touchedIds()
delta.preview.mindmap.changed(mindmapId)
delta.preview.mindmap.touchedIds()

delta.preview.selection.changed()
delta.preview.draw.changed()
delta.preview.edgeGuide.changed()
```

禁止再保留：

- `EditorDelta`
- `touchedNodeIds` / `touchedEdgeIds` 这种跨包手工汇总结构
- `createPreviewDelta()`
- `createHoverDelta()`
- commit flag -> delta 的二次翻译

---

## Scene 的最终输入与消费方式

## 最终输入

```ts
export interface SceneDocumentInput {
  snapshot: WhiteboardDocument
  rev: Revision
  delta: WhiteboardMutationDelta
}

export interface SceneEditorInput {
  snapshot: EditorStateDocument
  delta: EditorStateMutationDelta
}
```

scene 的事实推导直接消费 typed delta：

```ts
createRuntimeFacts({
  editor: {
    snapshot,
    delta,
  },
})
```

## scene 内部如何读 editor delta

长期最优结构里，scene 不再先把 editor delta 改写成另一份协议，而是直接按分组读取：

```ts
const touchedNodeIds = union(
  delta.preview.node.touchedIds(),
  delta.hover.node.changed() ? unionIds(previous.hover.node, next.hover.node) : []
)

const touchedEdgeIds = union(
  delta.preview.edge.touchedIds(),
  delta.hover.edge.changed() ? unionIds(previous.hover.edge, next.hover.edge) : []
)

const touchedMindmapIds = union(
  delta.preview.mindmap.touchedIds(),
  delta.hover.mindmap.changed() ? unionIds(previous.hover.mindmap, next.hover.mindmap) : []
)

const overlayChanged =
  delta.hover.node.changed()
  || delta.hover.edge.changed()
  || delta.hover.mindmap.changed()
  || delta.preview.node.touchedIds().size > 0
  || delta.preview.edge.touchedIds().size > 0
  || delta.preview.mindmap.touchedIds().size > 0
  || delta.preview.selection.changed()
  || delta.preview.draw.changed()
  || delta.preview.edgeGuide.changed()
```

注意：

- scene 仍然可以在内部把 typed delta 归纳成 `facts`
- 但这已经是 scene 自己的实现细节
- 不再是 `whiteboard-editor` 对外暴露的一份独立 delta contract

这就是“删除 `state/delta.ts`，但不丢掉 scene facts 推导能力”的正确方式

---

## `create.ts` 的最终角色

`whiteboard-editor/src/editor/create.ts` 长期最优只能做装配，不能再做：

- document commit -> editor reconcile
- editor commit -> scene delta 编排
- suppressed delta 聚合

这些职责应该下沉为独立同步层：

- `state`
- `viewport`
- `sync`

## 最终装配关系

```ts
const engine = ...
const state = ...
const viewport = ...

const scene = ...

const sync = ...

const ui = ...
```

按当前代码语义，对应关系更接近：

```ts
const engine = input.engine
const state = createEditorStateRuntime(...)
const scene = createProjectionRuntime(...)
const sync = /* 现在还内联在 create.ts 里 */
const uiState = createEditorStateView(...)
const ui = createEditorSceneUi({
  scene: scene.scene,
  state: uiState,
  nodeType,
  defaults,
  /* 长期目标再补 viewport/background */
})
```

`create.ts` 只保留：

- 初始化
- facade 暴露
- dispose 编排

---

## 实施方案

## Phase 1：拆 view 通道

目标：

- 从 `EditorStateDocument` 删除 `state.viewport`
- 新建独立 `EditorViewport`
- `scene.viewport` 改为 `editor.viewport`
- `background` 移入 `EditorSceneUi`

实施：

1. 删除 `editorStateMutationModel.state.viewport`
2. 删除 `viewport.set` editor mutation intent
3. 新建：
   - `EditorViewportSnapshot`
   - `EditorViewport`
4. `editor.actions.viewport.*` 改为直接写 `EditorViewport`
5. `scene.viewport` 全部改为 `editor.viewport`
6. `background()` 从 scene 删除，改为 `EditorSceneUi.background`
7. 删除所有“因为 viewport 变化而伪造 editor delta”的逻辑

完成标准：

- `EditorStateMutationDelta` 不再包含 `viewport`
- `editor.viewport` 提供 `screenPoint/screenRect/visibleWorldRect`
- `background` 由 `EditorSceneUi` 提供
- `setRect/setLimits/zoom/center` 不再触发 editor mutation commit

## Phase 2：shared mutation 支持 group / namespace

目标：

- typed writer / reader / delta 支持嵌套命名空间
- 不靠平铺命名表达 grouped API

实施：

1. 在 shared mutation 中新增 `group()` / `namespace()`
2. 让 `MutationWriter` / `MutationReader` / `MutationDeltaOf` 支持递归生成 API
3. 明确 group 不参与 document access，只参与 API 命名和 delta 路径组织

完成标准：

- 可以生成 `writer.preview.node.patch(...)`
- 可以生成 `delta.preview.node.touchedIds()`
- 不需要用扁平顶层名字表达 grouped family

## Phase 3：重建 editor-state model

目标：

- 用 grouped authored model 替换当前粗粒度 `overlay.hover` / `overlay.preview`

实施：

1. 删除当前 `overlay` 结构
2. 新建：
   - `hover`
   - `preview.node`
   - `preview.edge`
   - `preview.mindmap`
   - `preview.selection`
   - `preview.draw`
   - `preview.edgeGuide`
3. input/features 全部改写为直接 patch 对应分组，而不是整块 `overlay.preview.set`

完成标准：

- 不再存在 `overlay.preview.set`
- 不再存在整块 preview diff
- preview/hover 变更天然具备 typed touched ids

## Phase 4：scene 直接消费 `EditorStateMutationDelta`

目标：

- 删除 `whiteboard-editor/src/state/delta.ts`

实施：

1. `createFacts()` 输入改为 typed editor delta
2. `model/facts.ts` 直接消费 grouped editor typed delta
3. 删除：
   - `EditorDelta`
   - `collectEditorCommitFlags()`
   - `createBootstrapEditorDelta()`
   - `createEditorDeltaFromCommitFlags()`
   - `createDocumentDrivenEditorDelta()`
   - `mergeEditorDeltas()`

完成标准：

- scene 不再 import `@whiteboard/editor/state/delta`
- editor-scene 直接依赖 `EditorStateMutationDelta`

## Phase 5：收敛 create.ts

目标：

- `create.ts` 只做装配

实施：

1. 抽出 `sync`
2. document reconcile 使用 commit.document / typed reader，而不是 scene projection document
3. 删除 suppressed commit delta 聚合逻辑
4. scene update 改成 source-specific 更新

完成标准：

- `create.ts` 不再出现 delta merge / suppress / manual scene update 编排
- 跨边界同步规则集中在 sync 层

---

## 必须删除的概念

最终结构里以下概念都不应该存在：

- `EditorDelta`
- `whiteboard-editor/src/state/delta.ts`
- `overlay.hover.set`
- `overlay.preview.set`
- `state.viewport`
- `delta.state.viewport.changed()`
- 因为 `setRect` / `setLimits` 伪造 editor delta
- `scene.viewport`
- `scene.viewport.background()`
- `create.ts` 中的 suppressed delta 聚合

---

## 最终验收标准

最终代码必须满足：

1. document / editor / viewport 三个边界彻底分离。
2. scene 直接消费 `WhiteboardMutationDelta` 和 `EditorStateMutationDelta`。
3. viewport 不再属于 editor-state mutation model。
4. viewport 不再属于 scene API，统一由 `editor.viewport` 暴露。
5. background 不再属于 scene API，统一由 `EditorSceneUi` 暴露。
6. editor-state API 保持 grouped 命名：
   - `hover.*`
   - `preview.*`
7. 不保留 `EditorDelta` 中间协议。
8. `create.ts` 只做装配，不做跨边界 delta 编排。
9. 上下游对同一语义域使用同一组名字，不再出现 authored model、scene facts、react facade 三套不同命名。

---

## 最终判断

长期最优不是：

- 保留当前 `EditorDelta`，只是改个名字
- 保留 `viewport` 在 editor-state 里，再把它从 scene 里“弱化”
- 保留 `scene.viewport` 这层归属
- 继续用整块 `preview` / `hover`，再靠前后快照补 touched ids

长期最优是：

- `document`、`editor`、`viewport` 三路彻底拆开
- editor authored model 改成与 scene invalidation 同构的 grouped model
- scene 直接消费 typed editor delta
- `editor.viewport` 负责 view 几何换算
- `EditorSceneUi` 负责 background 这类 UI 派生
- `state/delta.ts` 被删除，而不是被挪位置

这才是 whiteboard editor / scene 的长期最优收敛形态。

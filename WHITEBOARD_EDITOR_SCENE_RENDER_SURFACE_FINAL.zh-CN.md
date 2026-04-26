# Whiteboard Editor Scene Render / Surface 长期最优方案

## 1. 口径

- 本文回答三个问题：
  - 还有哪些 render / chrome 应该进入 `@whiteboard/editor-scene`
  - `whiteboard/packages/whiteboard-editor/src/scene/source.ts` 的 `stores` 是否应该按命名空间重组
  - `editor.scene` / `editor.session` 现在是否暴露过多
- 目标是最终形态，不保留兼容层，不接受“继续局部 patch 现状”。
- 判断标准只有一条：
  - **只要是 world-space、依赖 document + selection/edit/preview/interaction、且目标是告诉 UI“该画什么”或“该命中什么”，就属于 `editor-scene`。**
  - **只要是 screen-space、DOM 结构、React registry、外部协作态，或纯 UI panel 语义，就不属于 `editor-scene`。**

---

## 2. 结论

### 2.1 还应该进入 `@whiteboard/editor-scene` 的内容

- `selection overlay`
  - 当前 `whiteboard/packages/whiteboard-editor/src/session/source.ts` 里的 `selectionOverlay` 是标准的 scene render payload。
  - 它依赖 selection、affordance、tool、edit、interaction.chrome，本质是“当前画布上该画什么 selection chrome”，不应该挂在 `session.chrome.selection`。

- `mindmap add-child chrome`
  - 当前 `session/source.ts` 里的 `mindmapChrome` 只是 world-space anchor 计算。
  - 它依赖 mindmap structure、selection、edit、node lock、node rect，属于 scene render，而不是 session。

- `edgeGuide.connect` 这一半残留信息
  - 现在 edge guide 已经有一半进入了 `editor-scene`：
    - `previewPath`
    - `snapPoint`
  - 但 `NodeOverlayLayer` 仍然从 `editor.session.chrome.edgeGuide` 读取 `focusedNodeId` / `resolution` 来画激活的 connect handles。
  - 这是分裂数据源，应该并入 `editor.scene.edge.render.overlay`。

- `draw / guides / marquee / mindmap preview` 的公开消费口径
  - 这些数据实际上已经在 `editor-scene` 输入与 snapshot 里了。
  - 问题不是“要不要再下沉”，而是**不要再通过 `editor.session.chrome.*` 二次转发**。
  - 最终应从 `editor.scene.preview.*` 直接消费。

- 删除 `selectedEdgeChrome`
  - 现在 edge route points / endpoint handles 已经在 `editor.scene.edge.render.overlay`。
  - `editor.session.selection.edge.chrome` 已经是重复抽象，应删除，不再保留第二套 edge selected chrome source。

### 2.2 不应该进入 `@whiteboard/editor-scene` 的内容

- `NodeBodyItem` / node registry render / `definition.render(...)`
  - 这是 React + DOM + registry 级别的渲染，不是 scene projector 的职责。

- screen-space viewport 投影
  - 例如 marquee 的 screen rect、presence 的 screen rect、cursor screen position。
  - `editor-scene` 只给 world-space 数据；screen transform 留在 viewport adapter / React。

- panel / toolbar 聚合
  - `selectionToolbar`
  - `selectionNodeScope`
  - `selectionEdgeScope`
  - 这些是 UI panel 语义，不是 scene render。

- 协作态渲染
  - `PresenceLayer` 依赖外部 presence binding，不属于 scene document projection。

- DOM pick ref / editable / pointer scheduling
  - `usePickRef`
  - `frame-throttled` pointer 调度
  - DOM hit element registry
  - 都不应进入 `editor-scene`

一句话：

- **`editor-scene` 负责世界里该出现什么视觉对象。**
- **`editor/react` 负责如何投影到屏幕、如何在 DOM 里挂出来。**

---

## 3. 当前结构的核心问题

### 3.1 `session/source.ts` 还在承载 scene render

当前 `whiteboard/packages/whiteboard-editor/src/session/source.ts` 仍然有这些 scene render / preview 逻辑：

- `selectionOverlay`
- `mindmapChrome`
- `chromeMarquee`
- `chromeDraw`
- `chromeSnap`
- `selectedEdgeChrome`

这会导致两个问题：

- render source 分散在 `editor-scene` 和 `editor/session` 两边
- React 侧无法形成稳定的“scene render only”消费口径

### 3.2 `edgeGuide` 是半迁移状态

- `EdgeOverlayLayer` 已经消费 `editor.scene.edge.render.overlay`
- `NodeOverlayLayer` 仍消费 `editor.session.chrome.edgeGuide`

这说明同一个交互预览被拆成了两套 source。

长期看必须统一成：

- `editor.scene.edge.render.overlay`

其中同时包含：

- `previewPath`
- `snapPoint`
- `connect`

### 3.3 `scene/source.ts` 的 `SceneProjectionStores` 太平

现在是这种命名风格：

- `nodeGraphIds`
- `nodeGraph`
- `edgeGraphIds`
- `edgeGraph`
- `edgeRenderStaticsIds`
- `edgeRenderStatics`
- `edgeRenderLabelsIds`
- `edgeRenderLabels`

问题不是“长”，而是：

- path 信息被硬编码进 field name
- 无法看出哪些属于 `graph`，哪些属于 `render`，哪些属于 `ui`
- 每加一个 family 都要复制一组新 field，扩展性很差

### 3.4 `editor.scene` 暴露重复层

当前同时存在：

- `scene.node`
- `scene.nodes`
- `scene.edge`
- `scene.edges`
- `scene.chrome`

这会带来三类重复：

- 单复数双轨重复
- `get/read/all/getMany` 重复
- 原始 projector `chrome` 结构直接泄露给 consumer

这不是长期最优 API。

---

## 4. 最终 API 设计

### 4.1 `scene/source.ts` 内部 stores 必须按命名空间重组

先定义统一 family 形态：

```ts
type FamilyRead<TId extends string, TValue> = {
  ids: store.ReadStore<readonly TId[]>
  byId: store.KeyedReadStore<TId, TValue | undefined>
}
```

然后 `SceneProjectionStores` 必须改成镜像 snapshot 的树状结构：

```ts
type SceneProjectionStores = {
  snapshot: store.ReadStore<Snapshot>
  items: store.ReadStore<readonly SceneItem[]>

  graph: {
    node: FamilyRead<NodeId, RuntimeNodeView>
    edge: FamilyRead<EdgeId, RuntimeEdgeView>
    owner: {
      mindmap: FamilyRead<MindmapId, MindmapView>
      group: FamilyRead<GroupId, GroupView>
    }
  }

  render: {
    edge: {
      statics: FamilyRead<EdgeStaticId, EdgeStaticView>
      active: FamilyRead<EdgeId, EdgeActiveView>
      labels: FamilyRead<EdgeLabelKey, EdgeRenderLabelView>
      masks: FamilyRead<EdgeId, EdgeMaskView>
      overlay: store.ReadStore<EdgeOverlayView>
    }
    selection: {
      overlay: store.ReadStore<SelectionOverlay | undefined>
    }
    mindmap: {
      chrome: FamilyRead<MindmapId, MindmapChromeView>
    }
  }

  ui: {
    chrome: store.ReadStore<ChromeView>
    node: FamilyRead<NodeId, NodeUiView>
    edge: FamilyRead<EdgeId, EdgeUiView>
  }
}
```

要点：

- 内部 `stores` 只允许出现 namespace path，不允许再有 `edgeRenderLabelsIds` 这种平铺命名。
- `graph` / `render` / `ui` 三层必须明确分开。
- `ui.chrome` 仍可作为 projector 内部总视图存在，但它是内部 store，不应再作为 public API 原样透出。

### 4.2 `editor.scene` 最终只暴露语义域，不暴露重复糖

最终 `EditorSceneSource` 应收敛为下面这组语义域：

```ts
type EditorSceneSource = {
  revision(): number
  items: store.ReadStore<readonly SceneItem[]>

  node: {
    ids: store.ReadStore<readonly NodeId[]>
    byId: store.KeyedReadStore<NodeId, EditorNodeView | undefined>
    capability: store.KeyedReadStore<NodeId, NodeCapability | undefined>
    query: {
      inRect(
        rect: Rect,
        options?: NodeRectHitOptions
      ): readonly NodeId[]
    }
  }

  edge: {
    ids: store.ReadStore<readonly EdgeId[]>
    byId: store.KeyedReadStore<EdgeId, EditorEdgeView | undefined>
    detail: store.KeyedReadStore<EdgeId, EditorEdgeDetail | undefined>
    geometry: store.KeyedReadStore<EdgeId, CoreEdgeView | undefined>
    capability: store.KeyedReadStore<EdgeId, EdgeCapability | undefined>
    label: {
      metrics(ref: EdgeLabelRef): Size | undefined
    }
    query: {
      related(nodeIds: Iterable<NodeId>): readonly EdgeId[]
      inRect(
        rect: Rect,
        options?: { match?: 'touch' | 'contain' }
      ): readonly EdgeId[]
      connectCandidates(rect: Rect): readonly EdgeConnectCandidate[]
      hit(input: {
        point: Point
        threshold?: number
        excludeIds?: readonly EdgeId[]
      }): EdgeId | undefined
    }
    render: {
      statics: FamilyRead<EdgeStaticId, EdgeStaticView>
      active: FamilyRead<EdgeId, EdgeActiveView>
      labels: FamilyRead<EdgeLabelKey, EdgeRenderLabelView>
      masks: FamilyRead<EdgeId, EdgeMaskView>
      overlay: store.ReadStore<EdgeOverlayView>
    }
  }

  mindmap: {
    byId: store.KeyedReadStore<MindmapId, MindmapView | undefined>
    query: {
      id(value: string): MindmapId | undefined
      structure(value: MindmapId | NodeId | string): MindmapView['structure'] | undefined
      navigate(input: {
        id: MindmapId
        fromNodeId: NodeId
        direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
      }): NodeId | undefined
    }
    render: {
      chrome: store.KeyedReadStore<MindmapId, MindmapChromeView | undefined>
    }
  }

  group: {
    byId: store.KeyedReadStore<GroupId, GroupView | undefined>
    query: {
      ofNode(nodeId: NodeId): GroupId | undefined
      ofEdge(edgeId: EdgeId): GroupId | undefined
      target(groupId: GroupId): SelectionTarget | undefined
      exact(target: SelectionTarget): readonly GroupId[]
    }
  }

  selection: {
    target: store.ReadStore<SelectionTarget>
    members: store.ReadStore<SelectionMembers>
    summary: store.ReadStore<SelectionSummary>
    affordance: store.ReadStore<SelectionAffordance>
    view: store.ReadStore<EditorSelectionView>
    node: {
      selected: store.KeyedReadStore<NodeId, boolean>
    }
    edge: {
      selected: store.KeyedReadStore<EdgeId, boolean>
    }
    render: {
      overlay: store.ReadStore<SelectionOverlay | undefined>
    }
  }

  preview: {
    marquee: store.ReadStore<SelectionPreview['marquee'] | undefined>
    draw: store.ReadStore<DrawPreview | null>
    guides: store.ReadStore<readonly Guide[]>
    mindmap: store.ReadStore<MindmapPreview | null>
  }

  spatial: {
    rect: EditorSceneQuery['rect']
    visible: EditorSceneQuery['visible']
  }

  snap: {
    rect: EditorSceneQueryRuntime['snap']
  }

  frame: EditorSceneQueryRuntime['frame']
  geometry: SceneGeometryCache
  scope: SceneScope
  pick: ScenePickSource
}
```

关键点：

- 删除 `scene.nodes`
- 删除 `scene.edges`
- 删除 `scene.chrome`
- 不再暴露 `get/getMany/all/read/model` 这类重复糖
- family 一律统一成 `ids/byId`
- render 一律挂在对应语义域下：
  - `edge.render.*`
  - `selection.render.overlay`
  - `mindmap.render.chrome`
- preview 一律挂在 `scene.preview.*`

### 4.3 `EditorSessionSource` 必须大幅收口

最终 `session` 不应该继续承载 scene render source。

必须删除：

- `editor.session.chrome.marquee`
- `editor.session.chrome.draw`
- `editor.session.chrome.snap`
- `editor.session.chrome.selection`
- `editor.session.mindmap.chrome`
- `editor.session.selection.edge.chrome`

`edgeGuide` 也不应保留在 `session.chrome`。

最终归属：

- `editor.scene.preview.marquee`
- `editor.scene.preview.draw`
- `editor.scene.preview.guides`
- `editor.scene.selection.render.overlay`
- `editor.scene.mindmap.render.chrome`
- `editor.scene.edge.render.overlay`

如果还需要单独读取 edge connect feedback，也应从：

- `editor.scene.edge.render.overlay`

读取，而不是保留 `session.chrome.edgeGuide`。

### 4.4 `EdgeOverlayView` 需要补齐 `connect`

为了解掉 `session.chrome.edgeGuide` 的最后残留，`EdgeOverlayView` 应扩成：

```ts
type EdgeOverlayView = {
  previewPath?: {
    svgPath: string
    style: EdgeStaticStyle
  }
  snapPoint?: Point
  connect?: {
    focusedNodeId?: NodeId
    resolution: ConnectResolution
  }
  endpointHandles: readonly EdgeOverlayEndpointHandle[]
  routePoints: readonly EdgeOverlayRoutePoint[]
}
```

这样：

- `EdgeOverlayLayer` 继续消费 `previewPath` / `snapPoint`
- `NodeOverlayLayer` 改为消费 `overlay.connect`

同一个交互预览对象只保留一份 scene render source。

---

## 5. 哪些 render 迁移后收益最大

### 5.1 selection overlay

收益：

- 去掉 `session/source.ts` 中最重的一块 scene render 逻辑
- `NodeOverlayLayer` 直接消费 `editor.scene.selection.render.overlay`
- selection render 与 selection summary/affordance 保持同一 scene namespace

### 5.2 mindmap add-child chrome

收益：

- `MindmapChrome.tsx` 不再依赖 `editor.session.mindmap.chrome`
- 所有 mindmap world-space 视觉导出都从 `editor.scene.mindmap.*` 读取

### 5.3 preview 口径统一

收益：

- `DrawLayer` / `Marquee` / guides 不再穿过 `session.chrome`
- consumer 明确知道自己在读 scene preview，而不是 session 本地衍生

### 5.4 edgeGuide 合并

收益：

- 去掉 session/scene 双源
- connect handles 与 edge preview path / snap point 来自同一份 overlay

---

## 6. 详细实施方案

### 6.1 `@whiteboard/editor-scene`

需要修改：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/render.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/delta.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projector/publish.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projector/spec.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/domain/render.ts`

实施内容：

- 在 `RenderSnapshot` 中新增：
  - `selection.overlay`
  - `mindmap.chrome`
- 在 `RenderChange` / `RenderPublishDelta` / `RenderPatchScope` 中新增对应 delta
- `EdgeOverlayView` 新增 `connect`
- render phase 直接基于：
  - `interaction.selection`
  - `session.edit`
  - `session.tool`
  - `interaction.chrome`
  - `session.preview.edgeGuide`
  - graph / ui view
  生成：
  - `selection overlay`
  - `mindmap chrome`
  - `edge overlay.connect`

实现原则：

- render phase 只产出 world-space render payload
- 不产出 screen-space rect
- 不产出 DOM-specific style object

### 6.2 `whiteboard-editor/src/scene/source.ts`

需要修改：

- `whiteboard/packages/whiteboard-editor/src/scene/source.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/node.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/edge.ts`

实施内容：

- 把 `SceneProjectionStores` 改成 `graph/render/ui` 三棵树
- 统一 family read 形态为 `ids/byId`
- `createGraphNodeRead` / `createGraphEdgeRead` 改为消费 namespaced sources，而不是平铺字段
- `EditorSceneSource` 改成最终 public API：
  - 删除 `nodes/edges`
  - 删除 `chrome`
  - 新增 `preview`
  - 新增 `selection.render.overlay`
  - 新增 `mindmap.render.chrome`

### 6.3 `whiteboard-editor/src/session/source.ts`

需要删除：

- `selectionOverlay`
- `chromeMarquee`
- `chromeDraw`
- `chromeSnap`
- `selectedEdgeChrome`
- `mindmapChrome`

需要保留的只有真正的 session/domain 数据：

- `tool`
- `draw`
- `edit`
- `interaction`
- `viewport`
- `panel`
- `history`
- `selection.target`

如果还存在 `EditorChromeSource` 这个类型，最终应整体删除，而不是继续缩成一个空壳。

### 6.4 `whiteboard-react`

需要修改：

- `whiteboard/packages/whiteboard-react/src/features/draw/DrawLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/selection/Marquee.tsx`
- `whiteboard/packages/whiteboard-react/src/features/node/components/NodeOverlayLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/mindmap/components/MindmapChrome.tsx`

实施内容：

- `DrawLayer` 改读 `editor.scene.preview.draw`
- `Marquee` 改读 `editor.scene.preview.marquee`
  - 组件内做 world -> screen 投影
- `NodeOverlayLayer`
  - guides 改读 `editor.scene.preview.guides`
  - selection overlay 改读 `editor.scene.selection.render.overlay`
  - connect handles 激活态改读 `editor.scene.edge.render.overlay`
- `MindmapChrome`
  - 改读 `editor.scene.mindmap.render.chrome`

### 6.5 删除旧公开面

最终必须删掉：

- `editor.scene.nodes`
- `editor.scene.edges`
- `editor.scene.chrome`
- `editor.session.chrome`
- `editor.session.mindmap.chrome`
- `editor.session.selection.edge.chrome`

不保留双轨。

---

## 7. 最终判断

### 7.1 还能不能继续往 `editor-scene` 放 render

能，而且应该继续放，但到这里为止只剩三类真正值得动的：

- selection overlay
- mindmap add-child chrome
- edgeGuide.connect 残留

除此之外，其他 React render 大多已经不是“scene render source 不在位”的问题，而是：

- React/DOM 自身渲染成本
- viewport screen projection
- registry render
- 外部状态渲染

### 7.2 `scene/source.ts` 的 stores 要不要按命名空间分类

必须要。

原因不是美观，而是：

- 这是后续继续扩 render family 的唯一可维护方式
- 只有按 namespace 收口，`graph/render/ui` 的边界才清楚
- 否则每加一个 render source 都会继续制造更多平铺 field 和重复 wiring

### 7.3 现在暴露的是不是太多

是。

长期最优口径应该是：

- **内部 `stores` 镜像 snapshot namespace**
- **外部 `editor.scene` 只暴露语义域**
- **不再暴露 raw `chrome`，不再保留单复数双轨，不再保留一堆 getter sugar**

这才是后续继续做 scene render、delta、hit、pick、viewport 解耦时最稳的基础。

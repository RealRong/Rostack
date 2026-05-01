# WHITEBOARD_EDITOR 最终 API 设计

## 1. 目标

这份文档只定义最终公开 API，不讨论过渡方案，不讨论兼容层，也不保留中间态命名。

最终目标是：

- `Editor` 只有一个主读出口：`editor.scene`
- 不再把 `projection`
- `runtime`
- `derived`

这些内部实现术语暴露给使用者。

换句话说，projection 仍然可以作为内部实现存在，但对外公开模型只保留：

```ts
editor.scene
```

---

## 2. 设计原则

### 2.1 单出口

最终公开读口只有一个：

```ts
editor.scene
```

不再公开这些并列出口：

- `editor.projection`
- `editor.state`
- `editor.document`
- `editor.derived`
- `editor.runtime`
- `editor.events`

### 2.2 公开 API 不暴露实现分层术语

`projection`、`runtime`、`derived` 都更像内部实现分层，而不是使用者关心的领域概念。

公开 API 应该表达的是：

- scene 读模型
- editor local state
- selection 组合结果
- chrome 结果
- mindmap 结果

而不是实现过程。

### 2.3 document truth 和 editor local truth 分离

架构上依然保持：

- document truth 只有 `engine`
- editor local truth 只有 `state-engine`
- scene 是 document + editor local state 的最终读模型

但这些 truth source 不需要全部变成公开 API 分组。

### 2.4 本地态保持简单

必须坚持这个原则：

- `document ids/byId` 是为了协作、冲突处理、稳定索引
- `editor local state` 不需要模仿 document schema
- 本地态数组直接整体替换即可

所以 editor local 公开面也保持简单，不为“统一感”强行造一层 `ids/byId`。

### 2.5 chrome 必须成组

所有 toolbar、overlay、marquee、guide、draw preview 等结果统一收进：

```ts
editor.scene.chrome.*
```

不再平铺散落。

---

## 3. 最终顶层 Editor API

最终 `Editor` 对外只保留：

```ts
type Editor = {
  scene: EditorSceneApi
  write: EditorWrite
  dispatch: (
    command: EditorCommand | readonly EditorCommand[]
  ) => void
  input: EditorInputHost
  history: HistoryPort<IntentResult>
  dispose: () => void
}
```

说明：

- `scene`：唯一读出口
- `write`：document 写能力
- `dispatch`：editor local command 入口
- `input`：原始输入 host
- `history`：历史能力
- `dispose`：清理

---

## 4. scene 公开模型总览

最终公开结构收敛成：

```ts
editor.scene
  .document
  .stores
  .editor
  .viewport
  .nodes
  .edges
  .mindmaps
  .groups
  .selection
  .chrome
  .hit
  .pick
  .snap
  .spatial
  .capture()
  .bounds()
```

这里的意思是：

- `document`：document frame read/query
- `stores`：原始 scene stores
- `editor`：editor local 原始 stores
- `viewport/nodes/edges/...`：scene query/helper
- `selection`：selection 的非 chrome 组合结果
- `chrome`：所有 chrome / overlay / preview 结果

最终不再额外公开：

- `scene.runtime.*`
- `scene.derived.*`

---

## 5. scene.document 设计

### 5.1 目标

`scene.document` 提供 document frame 的 read/query 能力。

它不是 store 分组，也不属于 editor local state。

### 5.2 最终结构

```ts
type SceneDocumentApi = DocumentFrame
```

最终读法：

```ts
editor.scene.document.snapshot()
editor.scene.document.node(nodeId)
editor.scene.document.edge(edgeId)
editor.scene.document.group(groupId)
editor.scene.document.mindmap(mindmapId)
editor.scene.document.slice({
  nodeIds: ['node-1']
})
```

---

## 6. scene.stores 设计

### 5.1 目标

`scene.stores` 只放 projection/scene 内部产出的原始 scene stores。

### 5.2 最终结构

```ts
type SceneStoresApi = {
  document: EditorSceneStores['document']
  graph: EditorSceneStores['graph']
  render: EditorSceneStores['render']
  items: EditorSceneStores['items']
}
```

最终读法：

```ts
editor.scene.stores.document
editor.scene.stores.graph
editor.scene.stores.render
editor.scene.stores.items
```

说明：

- `stores` 只保留 scene 图上的 document/graph/render/items
- editor local stores 不放进这里
- 避免出现 `scene.stores.runtime.editor.*` 这种又长又混的结构

---

## 7. scene.editor 设计

### 6.1 目标

`scene.editor` 是 editor local state 的公开原始读口。

这里不再叫：

- `state`
- `runtime`
- `view`

直接用 `editor`，最短也最清楚。

### 6.2 最终结构

```ts
type SceneEditorApi = {
  tool: ReadStore<Tool>
  draw: ReadStore<DrawState>
  selection: ReadStore<SelectionTarget>
  edit: ReadStore<EditSession | null>
  interaction: ReadStore<{
    busy: boolean
    chrome: boolean
    transforming: boolean
    drawing: boolean
    panning: boolean
    selecting: boolean
    editingEdge: boolean
    space: boolean
  }>
  preview: ReadStore<EditorInputPreviewState>
  viewport: ReadStore<Viewport> & {
    pointer(input: {
      clientX: number
      clientY: number
    }): {
      screen: Point
      world: Point
    }
    worldToScreen(point: Point): Point
    worldRect(): Rect
    screenPoint(clientX: number, clientY: number): Point
    size(): {
      width: number
      height: number
    }
  }
}
```

说明：

- `tool/draw/selection/edit/interaction/preview/viewport` 全部直接挂在 `scene.editor`
- 不使用 `toolState/drawState/...` 这种后缀
- `viewport` 保持一个 store，同时附加 pointer / transform helper
- 即时读直接用 store 的 `get()`
- `interaction` 对外公开的是可直接消费的交互派生态，而不是底层 raw interaction record

最终调用示例：

```ts
editor.scene.editor.tool.get()
editor.scene.editor.selection.get()
editor.scene.editor.edit.get()
editor.scene.editor.viewport.get()
editor.scene.editor.viewport.pointer({
  clientX,
  clientY
})
```

### 6.3 为什么不再要 runtime

如果保留公开的 `runtime`，就会重新出现这类调用：

```ts
editor.scene.runtime.editor.viewport.get()
editor.scene.runtime.scene.viewport.screenPoint(...)
```

这会带来两个问题：

1. `runtime` 本身不是领域概念
2. `viewport` 在 `runtime.scene` 和 `runtime.editor` 两边同时出现，公开语义发散

所以最终直接收敛为：

- scene query/helper 放 `editor.scene.viewport/nodes/edges/...`
- editor local source state 放 `editor.scene.editor.*`

---

## 8. scene query / helper 设计

这些能力仍然保留，但不再藏在 `projection.runtime.scene` 这种层级里，而是直接挂到 `scene` 下。

### 7.1 viewport

```ts
editor.scene.viewport.screenPoint(point)
editor.scene.viewport.screenRect(rect)
editor.scene.viewport.background()
```

说明：

- 这是 scene 的 query/helper
- 它和 `scene.editor.viewport` 不冲突
- 两者语义不同：

`scene.viewport`

- 是投影后的 scene 能力
- 提供 screen/world/query helper

`scene.editor.viewport`

- 是 editor local viewport store
- 提供 source state 和 pointer helper

### 7.2 nodes / edges / mindmaps / groups

```ts
editor.scene.nodes.get(nodeId)
editor.scene.edges.get(edgeId)
editor.scene.mindmaps.get(mindmapId)
editor.scene.groups.exact(selection)
```

### 7.3 hit / pick / snap / spatial

```ts
editor.scene.hit.item(input)
editor.scene.pick.schedule(input)
editor.scene.pick.clear()
editor.scene.snap.candidates(input)
editor.scene.spatial.rect(rect)
editor.scene.spatial.point(point)
```

### 7.4 capture / bounds

```ts
editor.scene.capture()
editor.scene.bounds()
```

---

## 9. scene.selection 设计

### 8.1 目标

`scene.selection` 只放 selection 相关但不属于 chrome 的组合结果。

### 8.2 最终结构

```ts
type SceneSelectionApi = {
  members: ReadStore<SelectionMembers>
  summary: ReadStore<SelectionSummary>
  affordance: ReadStore<SelectionAffordance>
  view: ReadStore<EditorSelectionView>
  edge: {
    chrome: ReadStore<SelectedEdgeChrome | undefined>
  }
  node: {
    selected: KeyedReadStore<NodeId, boolean>
    stats: ReadStore<SelectionNodeStats>
    scope: ReadStore<SelectionToolbarNodeScope | undefined>
  }
  edgeStats: {
    stats: ReadStore<SelectionEdgeStats>
    scope: ReadStore<SelectionToolbarEdgeScope | undefined>
  }
}
```

说明：

- `members/summary/affordance/view` 属于 selection 的主体读模型
- `node.selected/stats/scope` 和 edge stats/scope 也继续收在 selection 域下
- 只有真正的 toolbar/overlay/marquee 等视觉 chrome，才会进 `scene.chrome`

### 8.3 关于 edge stats 命名

这里有两种可选方式：

方案 A：

```ts
scene.selection.edge.stats
scene.selection.edge.scope
scene.selection.edge.chrome
```

方案 B：

```ts
scene.selection.edge.chrome
scene.selection.edgeStats.stats
scene.selection.edgeStats.scope
```

最终更推荐方案 A，保持 edge 域聚合：

```ts
scene.selection.edge.chrome
scene.selection.edge.stats
scene.selection.edge.scope
```

所以上面的结构在实现时建议进一步收成：

```ts
type SceneSelectionApi = {
  members: ReadStore<SelectionMembers>
  summary: ReadStore<SelectionSummary>
  affordance: ReadStore<SelectionAffordance>
  view: ReadStore<EditorSelectionView>
  node: {
    selected: KeyedReadStore<NodeId, boolean>
    stats: ReadStore<SelectionNodeStats>
    scope: ReadStore<SelectionToolbarNodeScope | undefined>
  }
  edge: {
    chrome: ReadStore<SelectedEdgeChrome | undefined>
    stats: ReadStore<SelectionEdgeStats>
    scope: ReadStore<SelectionToolbarEdgeScope | undefined>
  }
}
```

这才是最终推荐形态。

---

## 10. scene.chrome 设计

### 9.1 目标

所有 chrome / overlay / preview 结果统一收口到：

```ts
editor.scene.chrome
```

不再平铺到 selection、mindmap、editor 等各处分散命名。

### 9.2 最终结构

```ts
type SceneChromeApi = {
  selection: {
    marquee: ReadStore<EditorMarqueePreview | undefined>
    snapGuides: ReadStore<readonly Guide[]>
    toolbar: ReadStore<SelectionToolbarContext | undefined>
    overlay: ReadStore<SelectionOverlay | undefined>
  }
  draw: {
    preview: ReadStore<DrawPreview | null>
  }
  edge: {
    guide: ReadStore<EdgeGuide>
  }
}
```

最终调用示例：

```ts
editor.scene.chrome.selection.marquee
editor.scene.chrome.selection.snapGuides
editor.scene.chrome.selection.toolbar
editor.scene.chrome.selection.overlay
editor.scene.chrome.draw.preview
editor.scene.chrome.edge.guide
```

说明：

- `toolbar` 和 `overlay` 本质上都是 chrome，不再挂在 selection 主体结果下
- `marquee`、`snap guides`、`draw preview`、`edge guide` 全部统一进 `chrome`

---

## 11. scene.mindmap 设计

### 10.1 目标

mindmap 特有的组合结果单独成组，不混进通用 selection/chrome 顶层。

### 10.2 最终结构

```ts
type SceneMindmapApi = {
  chrome: {
    addChildTargets: KeyedReadStore<MindmapId, MindmapChrome | undefined>
  }
}
```

最终调用示例：

```ts
editor.scene.mindmap.chrome.addChildTargets
```

---

## 12. 最终完整示意

```ts
type Editor = {
  scene: {
    document

    stores: {
      document
      graph
      render
      items
    }

    editor: {
      tool
      draw
      selection
      edit
      interaction
      preview
      viewport
    }

    viewport
    nodes
    edges
    mindmaps
    groups
    hit
    pick
    snap
    spatial

    selection: {
      members
      summary
      affordance
      view
      node: {
        selected
        stats
        scope
      }
      edge: {
        chrome
        stats
        scope
      }
    }

    chrome: {
      selection: {
        marquee
        snapGuides
        toolbar
        overlay
      }
      draw: {
        preview
      }
      edge: {
        guide
      }
    }

    mindmap: {
      chrome: {
        addChildTargets
      }
    }

    capture()
    bounds()
  }

  write
  dispatch
  input
  history
  dispose
}
```

---

## 13. 推荐调用方式

### 12.1 订阅 editor local viewport

```ts
const viewport = useStoreValue(editor.scene.editor.viewport)
```

### 12.2 即时读取 local selection

```ts
const selection = editor.scene.editor.selection.get()
```

### 12.3 做坐标变换

```ts
const screen = editor.scene.viewport.screenPoint(worldPoint)
```

### 12.4 读 selection toolbar

```ts
const toolbar = useStoreValue(
  editor.scene.chrome.selection.toolbar
)
```

### 12.5 读 marquee

```ts
const marquee = useStoreValue(
  editor.scene.chrome.selection.marquee
)
```

### 12.6 读 node selection stats

```ts
const stats = useStoreValue(
  editor.scene.selection.node.stats
)
```

---

## 14. 命名规则总结

后续实现统一遵守下面这些规则：

### 13.1 最终公开读口只有 `editor.scene`

允许：

```ts
editor.scene.*
```

不允许：

```ts
editor.projection.*
editor.runtime.*
editor.derived.*
editor.state.*
```

### 13.2 stores 只放 scene 原始 stores

允许：

```ts
editor.scene.stores.document
editor.scene.stores.graph
```

不允许：

```ts
editor.scene.stores.runtime.editor.viewport
```

### 13.3 editor local state 统一走 `scene.editor`

允许：

```ts
editor.scene.editor.viewport
editor.scene.editor.selection
```

不允许：

```ts
editor.scene.state.viewport
editor.scene.runtime.viewport
editor.scene.view.selectionState
```

### 13.4 不写 State 后缀

允许：

```ts
scene.editor.tool
scene.editor.draw
scene.editor.selection
```

不允许：

```ts
scene.editor.toolState
scene.editor.drawState
scene.editor.selectionState
```

### 13.5 所有 chrome 统一进 `scene.chrome`

允许：

```ts
scene.chrome.selection.toolbar
scene.chrome.draw.preview
scene.chrome.edge.guide
```

不允许：

```ts
scene.selection.toolbar
scene.draw.preview
scene.edgeGuide
```

---

## 15. 最终结论

最终公开 API 不需要把内部实现分层词暴露出去。

最合适的形态是：

- `Editor` 只有一个主读出口：`editor.scene`
- `scene.stores` 表达 scene 原始 stores
- `scene.editor` 表达 editor local 原始 stores
- `scene.viewport/nodes/edges/...` 表达 scene query/helper
- `scene.selection` 表达 selection 主体组合结果
- `scene.chrome` 表达所有 chrome/overlay/preview 结果
- `scene.mindmap` 表达 mindmap 专属组合结果

这样能同时满足四件事：

- 单出口
- 命名短
- 领域语义清楚
- 不再暴露 `projection/runtime/derived` 这些实现术语

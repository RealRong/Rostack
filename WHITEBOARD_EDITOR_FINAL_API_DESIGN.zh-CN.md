# WHITEBOARD_EDITOR 最终 API 设计

## 1. 目标

这份文档只回答一件事：

- 重构完成后，`Editor` 对外最终应该长什么样

这里不讨论过渡方案，不讨论兼容层，也不讨论阶段性折中。
目标是直接定义最终形态，后续实现统一向这里收敛。

---

## 2. 设计原则

### 2.1 单一主出口

`Editor` 的读取主出口只有一个：

```ts
editor.projection
```

不再保留这些并行读口：

- `editor.scene`
- `editor.state`
- `editor.document`
- `editor.derived`
- `editor.events`

### 2.2 projection 不要顶层平铺

`projection` 自己不能再变成新的“大杂烩顶层对象”。
所以最终只保留三类一级分组：

- `stores`
- `runtime`
- `derived`

也就是说，`projection` 顶层不再直接挂：

- `nodes`
- `edges`
- `mindmaps`
- `viewport`
- `selection`
- `overlay`
- `hit`
- `pick`
- `snap`

这些都要收进明确的子分组里。

### 2.3 stores 下不再写 State 后缀

在 `stores` 分支下，`store` 语义已经足够明确，不要再重复写：

- `toolState`
- `drawState`
- `selectionState`
- `editState`
- `interactionState`
- `previewState`

最终统一为：

- `tool`
- `draw`
- `selection`
- `edit`
- `interaction`
- `preview`
- `viewport`

### 2.4 chrome 统一收口

所有 chrome / overlay / preview 相关结果都必须成组，不允许平铺散落。

也就是说，最终命名要尽量长这样：

```ts
projection.derived.scene.chrome.*
projection.derived.editor.chrome.*
```

而不是：

```ts
projection.derived.scene.marquee
projection.derived.scene.draw
projection.derived.scene.edgeGuide
projection.derived.editor.toolbar
projection.derived.editor.overlay
```

### 2.5 document truth 和 editor local truth 分离

最终架构里：

- document truth 只有 `engine`
- editor local truth 只有 `state-engine`
- projection 只负责把 document + editor local state 投影成读模型

本地态继续保持简单结构，不模仿 document 的 `ids/byId`：

- `document ids/byId` 是为了协作、冲突处理、稳定索引
- `editor local state` 不需要为了“统一风格”也搞成 document 那套结构
- 本地数组直接整体替换即可

---

## 3. 最终顶层 Editor API

最终 `Editor` 对外只保留：

```ts
type Editor = {
  projection: EditorProjection
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

- `projection`：唯一读出口
- `write`：document 写能力
- `dispatch`：editor local command 入口
- `input`：原始输入 host
- `history`：历史能力
- `dispose`：清理

最终不再新增：

- `editor.view`
- `editor.runtime`
- `editor.scene`
- `editor.state`

这些都只会让出口再次分叉。

---

## 4. 最终 Projection API

### 4.1 总体结构

最终 `projection` 只保留三类一级分组：

```ts
type EditorProjection = {
  stores: ProjectionStores
  runtime: ProjectionRuntime
  derived: ProjectionDerived
}
```

最终调用感应当接近：

```ts
editor.projection.stores.editor.viewport
editor.projection.runtime.editor.viewport.get()
editor.projection.runtime.scene.viewport.screenPoint(point)
editor.projection.derived.editor.chrome.selection.toolbar
```

---

## 5. stores 设计

### 5.1 目标

`stores` 只做一件事：

- 提供可订阅的原始 store

它不负责复杂 query，不负责命令，也不负责组合逻辑。

### 5.2 最终结构

```ts
type ProjectionStores = {
  document: EditorSceneStores['document']
  graph: EditorSceneStores['graph']
  render: EditorSceneStores['render']
  items: EditorSceneStores['items']

  editor: {
    tool: ReadStore<Tool>
    draw: ReadStore<DrawState>
    selection: ReadStore<SelectionTarget>
    edit: ReadStore<EditSession | null>
    interaction: ReadStore<EditorInteractionStateValue>
    preview: ReadStore<EditorInputPreviewState>
    viewport: ReadStore<Viewport>
  }
}
```

注意：

- 不再使用 `stores.runtime.editor.*`
- 不再使用 `stores.editor.toolState` 这种后缀
- `stores` 下的 `editor` 明确表示“editor local 原始订阅态”

### 5.3 典型读法

```ts
const viewport = useStoreValue(editor.projection.stores.editor.viewport)
const selection = useStoreValue(editor.projection.stores.editor.selection)
const tool = useStoreValue(editor.projection.stores.editor.tool)
```

这是最终推荐写法。

---

## 6. runtime 设计

### 6.1 目标

`runtime` 只做两件事：

- 非订阅式即时读取
- imperative query / helper

为了避免 `projection` 顶层过挤，`runtime` 再分成两类：

- `runtime.scene`
- `runtime.editor`

### 6.2 runtime.scene

`runtime.scene` 放 projection 已经产出的 scene query / helper / spatial / pick 能力。

```ts
type ProjectionSceneRuntime = {
  document: DocumentFrame
  nodes: SceneNodes
  edges: SceneEdges
  mindmaps: SceneMindmaps
  groups: SceneGroups
  selection: SceneSelection
  overlay: SceneOverlay
  viewport: SceneViewport
  snap: SceneSnap
  spatial: SceneSpatial
  hit: SceneHit
  pick: ScenePickRuntime
  capture: () => Capture
  bounds: () => Rect | undefined
}
```

说明：

- 这些能力本来就属于 scene/projection query
- 不应该继续平铺在 `projection` 顶层
- 收进 `runtime.scene` 后，语义会更清楚

最终读法示例：

```ts
editor.projection.runtime.scene.nodes.get(nodeId)
editor.projection.runtime.scene.viewport.screenPoint(point)
editor.projection.runtime.scene.hit.item(input)
editor.projection.runtime.scene.pick.schedule(input)
editor.projection.runtime.scene.bounds()
```

### 6.3 runtime.editor

`runtime.editor` 放 editor local 的即时读取和 viewport helper。

```ts
type ProjectionEditorRuntime = {
  tool(): Tool
  draw(): DrawState
  selection(): SelectionTarget
  edit(): EditSession | null
  interaction(): EditorInteractionStateValue
  preview(): EditorInputPreviewState

  viewport: {
    get(): Viewport
    pointer(input: { clientX: number; clientY: number }): {
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

最终读法示例：

```ts
editor.projection.runtime.editor.tool()
editor.projection.runtime.editor.selection()
editor.projection.runtime.editor.viewport.get()
editor.projection.runtime.editor.viewport.pointer({
  clientX,
  clientY
})
```

### 6.4 为什么 runtime 要拆 scene / editor

这是最终命名里最关键的一步。

如果不拆，`projection.runtime` 会重新挤成一层大平铺：

```ts
projection.runtime.viewport
projection.runtime.nodes
projection.runtime.selection
projection.runtime.pick
projection.runtime.tool
projection.runtime.draw
```

这会再次混淆两类完全不同的东西：

- projection 产出的 scene query
- editor local state 的即时读取

拆成 `scene` / `editor` 后，调用意图一眼就清楚。

---

## 7. derived 设计

### 7.1 目标

`derived` 只放组合结果，不放原始态。

最终也按两类收：

- `derived.scene`
- `derived.editor`

并且所有 chrome 结果都收进 `.chrome`。

### 7.2 derived.scene

```ts
type ProjectionSceneDerived = {
  selection: {
    members: ReadStore<SelectionMembers>
    summary: ReadStore<SelectionSummary>
    affordance: ReadStore<SelectionAffordance>
    view: ReadStore<EditorSelectionView>
    edge: {
      chrome: ReadStore<SelectedEdgeChrome | undefined>
    }
  }

  chrome: {
    selection: {
      marquee: ReadStore<EditorMarqueePreview | undefined>
      snapGuides: ReadStore<readonly Guide[]>
    }
    draw: {
      preview: ReadStore<DrawPreview | null>
    }
    edge: {
      guide: ReadStore<EdgeGuide>
    }
  }

  mindmap: {
    chrome: {
      addChildTargets: KeyedReadStore<MindmapId, MindmapChrome | undefined>
    }
  }
}
```

说明：

- `marquee / snap / draw / edgeGuide` 不再散落平铺
- 统一收进 `scene.chrome`
- `mindmap chrome` 也收进 `mindmap.chrome`

最终读法示例：

```ts
editor.projection.derived.scene.chrome.selection.marquee
editor.projection.derived.scene.chrome.selection.snapGuides
editor.projection.derived.scene.chrome.draw.preview
editor.projection.derived.scene.chrome.edge.guide
editor.projection.derived.scene.mindmap.chrome.addChildTargets
```

### 7.3 derived.editor

```ts
type ProjectionEditorDerived = {
  selection: {
    node: {
      selected: KeyedReadStore<NodeId, boolean>
      stats: ReadStore<SelectionNodeStats>
      scope: ReadStore<SelectionToolbarNodeScope | undefined>
    }
    edge: {
      stats: ReadStore<SelectionEdgeStats>
      scope: ReadStore<SelectionToolbarEdgeScope | undefined>
    }
  }

  chrome: {
    selection: {
      toolbar: ReadStore<SelectionToolbarContext | undefined>
      overlay: ReadStore<SelectionOverlay | undefined>
    }
  }
}
```

说明：

- `toolbar / overlay` 不再直接挂在 `derived.editor.selection`
- 这两个本质上是 chrome，应该收进 `derived.editor.chrome.selection.*`

最终读法示例：

```ts
editor.projection.derived.editor.selection.node.stats
editor.projection.derived.editor.selection.edge.scope
editor.projection.derived.editor.chrome.selection.toolbar
editor.projection.derived.editor.chrome.selection.overlay
```

---

## 8. 最终完整示意

```ts
type Editor = {
  projection: {
    stores: {
      document
      graph
      render
      items
      editor: {
        tool
        draw
        selection
        edit
        interaction
        preview
        viewport
      }
    }

    runtime: {
      scene: {
        document
        nodes
        edges
        mindmaps
        groups
        selection
        overlay
        viewport
        snap
        spatial
        hit
        pick
        capture
        bounds
      }
      editor: {
        tool()
        draw()
        selection()
        edit()
        interaction()
        preview()
        viewport: {
          get()
          pointer(...)
          worldToScreen(...)
          worldRect()
          screenPoint(...)
          size()
        }
      }
    }

    derived: {
      scene: {
        selection: {
          members
          summary
          affordance
          view
          edge: {
            chrome
          }
        }
        chrome: {
          selection: {
            marquee
            snapGuides
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
      }

      editor: {
        selection: {
          node: {
            selected
            stats
            scope
          }
          edge: {
            stats
            scope
          }
        }
        chrome: {
          selection: {
            toolbar
            overlay
          }
        }
      }
    }
  }

  write
  dispatch
  input
  history
  dispose
}
```

---

## 9. 命名规则总结

后续实现统一遵守下面这些规则：

### 9.1 一级语义

- `stores`：可订阅原始态
- `runtime`：即时读 / imperative query
- `derived`：组合结果

### 9.2 scene / editor 分界

- `scene`：projection 产出的 scene query 和 scene read model
- `editor`：state-engine 持有的 editor local state read model

### 9.3 chrome 必须进组

允许：

```ts
derived.scene.chrome.selection.marquee
derived.editor.chrome.selection.toolbar
```

不允许：

```ts
derived.scene.marquee
derived.editor.toolbar
```

### 9.4 stores 下不写 State 后缀

允许：

```ts
stores.editor.viewport
stores.editor.selection
```

不允许：

```ts
stores.editor.viewportState
stores.editor.selectionState
```

### 9.5 projection 顶层不再继续加能力

允许：

```ts
projection.stores.*
projection.runtime.*
projection.derived.*
```

不允许：

```ts
projection.nodes
projection.viewport
projection.pick
projection.selection
```

---

## 10. 推荐调用示例

### 10.1 订阅 viewport

```ts
const viewport = useStoreValue(
  editor.projection.stores.editor.viewport
)
```

### 10.2 即时读取 selection

```ts
const selection = editor.projection.runtime.editor.selection()
```

### 10.3 做坐标变换

```ts
const screen = editor.projection.runtime.scene.viewport.screenPoint(worldPoint)
```

### 10.4 读 selection toolbar

```ts
const toolbar = useStoreValue(
  editor.projection.derived.editor.chrome.selection.toolbar
)
```

### 10.5 读 marquee

```ts
const marquee = useStoreValue(
  editor.projection.derived.scene.chrome.selection.marquee
)
```

---

## 11. 最终结论

最终 `Editor` API 的核心不是“把所有东西都塞进 `projection` 顶层”，而是：

- `projection` 仍然是唯一主读出口
- 但 `projection` 顶层只保留 `stores / runtime / derived`
- scene query 收进 `runtime.scene`
- editor local read 收进 `stores.editor` 和 `runtime.editor`
- 所有 chrome 统一收进 `derived.*.chrome.*`

这样可以同时满足三件事：

- 单出口，不再分叉
- 命名短很多，不再出现 `stores.runtime.editor.*`
- 分层明确，不会把 `projection` 顶层重新挤爆

# Whiteboard Editor Read 中轴最终方案

## 1. 结论

Whiteboard 长期最优的方向不是继续在 React 里修补：

- 某个 renderer 自己读 `edit`
- 某个 hook 自己拼 `selected`
- 某个 observer 自己量完再 patch document
- 某个 chrome 自己额外订阅 node / edge / mindmap 再做局部判断

而是明确收敛成一句话：

**editor 负责产出最终可渲染模型，React 只负责平台渲染与平台输入。**

这里的“最终可渲染模型”包括：

- 最终几何
- 最终编辑态投影
- 最终选择态投影
- 最终 toolbar / handles / add button / route handles 可见性
- 最终 edge label 位置与 mask
- 最终 mindmap tree 的 connectors 与附属 chrome

React 不应该再自己拼这些东西。

---

## 2. 当前问题本质

现在的系统已经朝 editor 中轴走了一大步，但还有几类残留旁路：

### 2.1 React 仍然在拼编辑态

例如：

- node renderer 内部 `useEdit()`
- `matchNodeEdit(...)`
- renderer 自己决定 display / editable host
- renderer 自己决定 draft text / draft wrapWidth / draft fontSize

这会导致：

- edit 状态分散在多个 renderer
- 一个全局 edit 变化会让大量 renderer 参与判断
- mindmap root / child / 普通 text 很容易再次出现局部特判

### 2.2 React 仍然保留历史 writeback 旁路

当前仓库里最典型的是：

- `ResizeObserver -> editor.actions.node.patch(origin: 'system')`

这条线本质上是：

**DOM 变化反写 document。**

这条路即使现在没被默认节点大量使用，也应该删除，因为它会持续制造第二套来源不清楚的几何语义。

### 2.3 React 仍然在保有局部测量 store

例如 edge label：

- React 本地 observer 量 label
- React 本地 keyed store 存 label size
- React 再用本地 size 算 placement / mask

这也不是长期最优，因为：

- label 几何不再由 editor 统一产出
- edge 的渲染模型和 node / mindmap 继续分裂

### 2.4 `editor.read` 暴露给 React 的面仍然偏杂

React 当前会直接读：

- `read.scene.list`
- `read.node.item`
- `read.node.view`
- `read.edge.resolved`
- `read.mindmap.render`
- `store.edit`
- `store.selection`

这意味着 React 看到的不是“最终模型”，而是一堆半成品状态，需要自己再拼。

---

## 3. 最终原则

最终必须明确四条原则。

### 3.1 只有 editor 可以定义逻辑几何

逻辑几何包括：

- node rect / bounds / rotation
- edge path / bounds / markers
- edge label placement / mask rect
- mindmap connectors / bbox / add-child button anchor

React 只能画，不能定义。

### 3.2 只有 editor 可以决定 computed data 是否写回 document

document 里保存 computed data 完全正常，例如：

- `text.size`
- `sticky.style.fontSize`

但什么时候写回，必须只由 editor 的 layout / command / interaction 决定。

React 不能因为：

- DOM mount
- source host 变了
- ResizeObserver 触发

就自己 patch document。

### 3.3 React 只保留平台实现细节

React 允许保留的东西只有：

- DOM 渲染
- pointer / keyboard / context menu bridge
- clipboard bridge
- layout backend 的 DOM measure 实现
- source element 注册

这些都属于平台适配，不属于业务几何与业务状态。

### 3.4 对 React 暴露的 `editor.read` 必须是薄的

editor 内部 query 为了 command / interaction / projection 可以保留丰富能力。

但是：

**暴露给 React 的 public `editor.read` 必须尽量只给最终渲染结果。**

也就是：

- React 不应该看到太多 committed/raw/intermediate store
- React 不应该拿 `item + edit + selection + chrome` 再自己合成最终显示

---

## 4. 哪些东西必须收到 editor 中轴

这里分成“必须收回”和“可以暂留为平台细节”。

## 4.1 必须收回 editor 的内容

### A. node 的编辑态投影

必须从 renderer 挪回 editor：

- 当前 node 是否在编辑
- 当前 draft text
- 当前 draft caret
- 当前 draft size
- 当前 draft fontSize
- 当前 draft wrapWidth
- display / edit 下的统一文本内容

最终 React 不再 `useEdit()`。

### B. node 的选择态与交互态投影

必须从 scene / overlay / chrome 各处拼装收回 editor：

- node.selected
- node.hovered
- node.locked
- node.canResize
- node.canRotate
- node.canConnect
- node 是否显示 transform handles
- node edit 时是否隐藏 handles 但保留 toolbar / selection frame

### C. edge 的最终渲染几何

必须由 editor 直接产出：

- path
- bounds
- marker 样式与 URL
- label placement
- label angle
- label mask rect
- route handles / source handles / target handles 可见性
- label edit 时 route/source/target handles 是否隐藏

React 不应自己拿 `resolved + local label size + edit` 再拼。

### D. mindmap 的最终树渲染模型

必须由 editor 直接产出：

- tree bbox
- connectors
- rootRect
- rootLocked
- childNodeIds
- add-child button anchor
- add-child button 是否显示

React 不应自己额外读 root node、selection、edit 再判断。

### E. toolbar / chrome 可见性规则

必须由 editor 统一产出：

- selection toolbar 是否显示
- edge toolbar 是否显示
- 拖 edge label 时隐藏 toolbar
- 拖 route point 时隐藏 toolbar
- edge label 编辑时隐藏 route/source/target handles
- node edit 时保留 toolbar 但隐藏 transform handles

这类规则属于 interaction 语义，不该散在 React 组件里。

### F. edge label 尺寸与 placement

长期上应该从 React 本地 observer 收回 editor layout：

- editor 通过 layout service 测量 label
- editor 产出 label size
- editor 直接给出 label placement / mask

React 最后只负责画。

---

## 4.2 可以暂留为平台实现细节的内容

### A. DOM 文本测量 backend

这可以继续在 React：

- layout backend 用 DOM 量文本
- backend 通过 source element 读 typography

但它必须只是 `services.layout.measure(request)` 的实现细节。

### B. source element 注册

`textSources.set(sourceId, element)` 这类事情可以暂留在 React/平台层。

但要明确它只是：

- 提供 measure source

而不是：

- 触发 sync
- 触发 patch
- 触发 relayout commit

### C. pick registry / pointer bridge

这些属于 DOM 平台输入，不需要收回 editor read。

---

## 5. `autoMeasure` 这条旁路该怎么处理

结论很明确：

**直接删除。**

理由：

1. 它的语义是 DOM 变化反写 document。
2. 这与 editor layout 中轴重复。
3. 它会制造第二套 geometry 来源。
4. 当前默认节点定义已经基本不依赖它。

建议一步到位删掉：

- `NodeDefinition.autoMeasure`
- `useNodeSizeObserver`
- `registerMeasuredElement`
- `CanvasScene -> NodeItem -> CanvasNodeSceneItem` 这整条 observer 传递线

删除后，document 的 computed 写回只剩：

- editor `layout.patchNodeUpdate`
- editor `layout.syncNode`
- editor `node.text.commit`
- editor 的 interaction / command 统一入口

这才是正确模型。

---

## 6. 最简的 editor 内外分层

长期上应该把 editor 分成两层。

## 6.1 editor 内部 rich query

内部 query 给 command / interaction / projection 用，可以保持丰富：

- committed nodes / edges / mindmaps
- projection item / bounds / geometry
- selection model
- history
- viewport helpers
- layout input / preview patches

这层不需要刻意做薄。

### 内部 rich query 的职责

- 让 command 和 interaction 写代码简单
- 能访问 committed/raw/intermediate 数据
- 支持局部 projection 与 preview

## 6.2 对 React 暴露的 public read

这层必须极薄，只保留最终渲染与最终 chrome：

- scene
- node.render
- edge.render
- mindmap.render
- chrome
- panel

React 只认这层，不直接碰 rich query 的细节。

---

## 7. 最简 public `editor.read` 应该只暴露什么

这是本文最重要的部分。

建议 public `editor.read` 最终只保留下面这些。

## 7.1 scene

```ts
type EditorSceneRead = {
  background: ReadStore<Background>
  list: ReadStore<readonly SceneItemRef[]>
}
```

职责：

- 背景
- 顶层 scene 顺序

说明：

- `SceneItemRef` 只包含顶层 node / edge / top-level mindmap root container
- owned node 不进入 scene list

## 7.2 node.render

```ts
type NodeRenderModel = {
  id: NodeId
  type: NodeType
  hidden: boolean
  rect: Rect
  bounds: Rect
  rotation: number

  selected: boolean
  hovered: boolean
  locked: boolean

  canResize: boolean
  canRotate: boolean
  canConnect: boolean

  showSelectionFrame: boolean
  showTransformHandles: boolean
  showConnectHandles: boolean

  bodyStyle: CSSPropertiesLike
  transformStyle: CSSPropertiesLike

  content: NodeContentModel
}

type NodeContentModel =
  | {
      kind: 'text'
      text: string
      placeholder?: string
      editable: boolean
      caret?: EditCaret
      multiline: boolean
      sourceId: string
      textStyle: CSSPropertiesLike
    }
  | {
      kind: 'shape'
      shape: ShapeRenderModel
      label?: {
        text: string
        editable: boolean
        caret?: EditCaret
        sourceId: string
        textStyle: CSSPropertiesLike
      }
    }
  | {
      kind: 'frame'
      header?: {
        text: string
        editable: boolean
        caret?: EditCaret
        sourceId: string
        textStyle: CSSPropertiesLike
      }
    }
  | {
      kind: 'custom'
      data: unknown
    }

type EditorNodeRead = {
  render: KeyedReadStore<NodeId, NodeRenderModel | undefined>
}
```

关键点：

- 这里已经把 selected / editable / draft text / draft size 都合成完
- React 不再读 `store.edit`
- React 不再读 `store.selection`
- React 不再自己判断 handles 是否显示

## 7.3 edge.render

```ts
type EdgeRenderModel = {
  id: EdgeId
  hidden: boolean
  selected: boolean
  locked: boolean

  bounds: Rect
  path: string
  stroke: {
    color: string
    opacity: number
    width: number
    dash?: string
  }

  markerStart?: EdgeMarkerRender
  markerEnd?: EdgeMarkerRender

  labels: readonly EdgeLabelRenderModel[]

  showRouteHandles: boolean
  showEndpointHandles: boolean
  showToolbar: boolean
}

type EdgeLabelRenderModel = {
  id: string
  text: string
  editable: boolean
  caret?: EditCaret
  sourceId: string
  textStyle: CSSPropertiesLike

  rect: Rect
  anchor: Point
  angle: number
  maskRect: Rect
}

type EditorEdgeRead = {
  render: KeyedReadStore<EdgeId, EdgeRenderModel | undefined>
}
```

关键点：

- label size / placement / mask 全在 editor 里算完
- React 不再有本地 label observer store
- edge label 编辑态相关的 chrome 可见性也不再在 React 里分散判断

## 7.4 mindmap.render

```ts
type MindmapRenderModel = {
  id: NodeId
  rootId: NodeId
  bbox: Rect
  connectors: readonly MindmapConnectorRender[]
  childNodeIds: readonly NodeId[]

  addChild?: {
    visible: boolean
    x: number
    y: number
    placement: 'right'
  }
}

type EditorMindmapRead = {
  render: KeyedReadStore<NodeId, MindmapRenderModel | undefined>
}
```

关键点：

- React 不再额外读 rootRect / selectedNodeIds / edit 再拼 add button
- add button 是否显示、显示在哪，都由 editor 直接给
- root 和 child 仍然作为普通 node，通过 `node.render` 渲染

## 7.5 chrome

```ts
type EditorChromeRead = ReadStore<{
  selection: SelectionChrome | null
  snap: readonly Guide[]
  marquee: MarqueeChrome | null
  draw: DrawChrome | null
  edgeGuide: EdgeGuideChrome | null
}>
```

这里的原则：

- chrome 只放“跨 item 的 overlay / interaction chrome”
- 不再塞 node 自己的局部 editable/selected 细节

## 7.6 panel

```ts
type EditorPanelRead = ReadStore<{
  selectionToolbar: SelectionToolbarModel | null
  history: HistoryPanelModel
  draw: DrawPanelModel | null
}>
```

这里的原则：

- 所有 toolbar / panel 显隐规则由 editor 产出
- React 只负责渲染面板

---

## 8. React 最终应该怎么消费这些 read

最终 React 的消费方式应该非常简单。

## 8.1 `CanvasScene`

只做：

1. 读取 `editor.read.scene.list`
2. 根据 ref.kind 渲染 `NodeItem / EdgeItem / MindmapItem`

不再做：

- 传 `selected`
- 传 `selectedNodeIds`
- 传 `registerMeasuredElement`

## 8.2 `NodeItem`

只读：

- `editor.read.node.render.get(nodeId)`

然后直接画：

- body
- text host
- editable host

不再做：

- `useEdit()`
- `useNodeView(...) + selected`
- 自己拼 edit / selection / toolbar 相关逻辑

## 8.3 `EdgeItem`

只读：

- `editor.read.edge.render.get(edgeId)`

不再做：

- label size observer
- 本地算 label placement
- 本地算 mask rect
- 根据 edit / selection 再自己判断 handles

## 8.4 `MindmapTreeView`

只读：

- `editor.read.mindmap.render.get(treeId)`

然后：

- 画 connectors
- 遍历 `childNodeIds`，用普通 `NodeItem` 渲染 node
- 画 add-child button

不再做：

- `useEdit()`
- `selectedNodeIds.includes(...)`
- 自己推导 rootSelected / rootEditing / rootLocked

---

## 9. 什么应该留在 store，而不进 read

不是所有状态都要暴露给 React。

以下状态可以继续只存在 editor store / input runtime：

- 当前 tool
- pointer 当前世界坐标
- 原始 selection target
- 原始 edit session
- interaction session / gesture

原因：

- 它们是内部控制状态，不是最终渲染模型
- React 真正需要的，是投影后的 render / chrome / panel

也就是说：

- `store` 负责内部可变状态
- `read` 负责最终可渲染投影

这是最清晰的分工。

---

## 10. text / sticky / shape / edge label 的统一布局中轴

长期上，布局中轴只保留一条：

- `layout`

而不是：

- text 一条
- sticky 一条
- edge label 一条
- auto measure 一条

最终建议：

```ts
type LayoutKind = 'none' | 'size' | 'fit'

type LayoutRuntime = {
  patchNodeUpdate(...)
  syncNode(...)
  editNode(...)
  measureText(...)
  measureEdgeLabel(...)
}
```

这里 `measureEdgeLabel()` 不是必须立刻做，但长期上应该进同一 runtime。

这样：

- text: `kind = 'size'`
- sticky: `kind = 'fit'`
- edge label: 走 layout runtime 的 text measure 分支

React 只提供 backend，不再拥有自己的 label size store。

---

## 11. 具体要删除或收口的现有残留

下面这些是明确应该删或收口的。

## 11.1 直接删除

- `NodeDefinition.autoMeasure`
- `useNodeSizeObserver`
- `registerMeasuredElement`
- `CanvasScene -> NodeItem -> CanvasNodeSceneItem` 的测量 observer 传递

## 11.2 收回 editor

- renderer 内部 `useEdit()`
- `matchNodeEdit(...)` 在 node renderer 中的使用
- edge label 本地 `labelSizeObserver`
- mindmap chrome 额外基于 selection / edit 的本地判断

## 11.3 允许暂留，但严格降级为平台细节

- `textSources`
- DOM measure host
- `pickRegistry`
- pointer bridge

---

## 12. 最简单的落地路线

如果按“低复杂度、一步到位”来做，最合理的是下面这个顺序。

### 第一阶段

删掉历史 writeback 旁路：

- 删除 `autoMeasure`
- 删除 node ResizeObserver patch 链路

这是最该立刻做的，因为它完全不符合中轴原则。

### 第二阶段

把 node renderer 的编辑态投影收回 `editor.read.node.render`：

- text
- sticky
- shape label
- frame title

做到以后：

- React renderer 不再 `useEdit()`
- `store.edit` 不再被 renderer 直接订阅

### 第三阶段

把 mindmap add-button / root editing / selected 之类判断全部收回 `editor.read.mindmap.render`。

做到以后：

- `MindmapTreeView` 只读一个 render model

### 第四阶段

把 edge label 测量 / placement / mask 收回 `editor.read.edge.render`。

做到以后：

- `EdgeItem` 不再有本地 label size store

---

## 13. 最终的复杂度目标

最终希望达到的不是“功能都能跑”，而是下面这种结构：

### editor 内部

- rich query
- layout runtime
- interaction runtime
- render projection

### editor public read

- `scene`
- `node.render`
- `edge.render`
- `mindmap.render`
- `chrome`
- `panel`

### React

- 渲染这些 render models
- 提供 DOM measure backend
- 提供 pointer / keyboard / clipboard bridge

只有这样，系统才会稳定：

- text 不会再反复出现 display/edit 宽高分裂
- mindmap root / child 不会再需要特殊修补
- edge label 不会继续保留第二套局部测量逻辑
- toolbar / handles / selection chrome 的显隐逻辑不会散在各个组件里

---

## 14. 最终结论

一句话总结最终答案：

**能收到 editor 的，全部收回 editor；React 只保留平台渲染和平台测量，不再保有任何 document writeback 与最终几何拼装职责。**

最简 public `editor.read` 只需要：

- `scene`
- `node.render`
- `edge.render`
- `mindmap.render`
- `chrome`
- `panel`

其它 rich/raw/intermediate 数据可以继续留在 editor 内部 query，不再直接暴露给 React 组件。

这就是长期最优、命名最短、复杂度最低、最不容易再次散掉的中轴方案。

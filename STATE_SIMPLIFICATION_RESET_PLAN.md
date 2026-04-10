# Whiteboard 状态与中间层极简化重构方案

## 目标

目标不是局部优化，而是按“不做兼容、不在乎迁移成本、优先整体极简”的标准，重新设计 whiteboard 当前的状态表达和跨层结构。

核心要求：

- 减少状态副本
- 减少中间翻译层
- 减少跨模块跳转
- 减少 React 侧拼装 view
- 减少 runtime/service/bridge/lifecycle 的横向切分
- 让“一个概念只在一个地方被表达一次”

## 当前主要复杂度来源

### 1. 状态被拆成太多层

当前至少存在这些彼此交叠的状态层：

- engine document / engine read
- editor runtime.state
- editor interaction active/gesture
- editor overlay state
- editor preview runtime
- editor session runtime
- editor view runtime
- editor read derived selectors
- React hooks 中的 view 组装

这些层不是简单分工，而是存在大量“状态先写入 A，再从 A 翻译到 B，再从 B 投影到 C”的链路。

### 2. 同一个概念被多次表达

典型例子：

- selection
  - runtime.state.selection
  - read.selection.summary
  - read.selection.transformBox
  - read.selection.affordance
  - read.selection.overlay
  - read.selection.toolbar
- interaction
  - interaction.active
  - interaction.mode
  - interaction.gesture
  - overlay.selection / overlay.edge
  - editor.state.interaction
- 文本预览
  - preview runtime 写 overlay.node.text
  - node.item 再读取 overlay
  - node.view 再读取 node.item/state
  - React renderer 再把这些拼成最终展示

这类设计的问题不是“命名多”，而是状态含义被拆碎以后，维护者必须跨 4 到 6 个模块才能看懂一个功能。

### 3. 读写通道切得过细

当前 editor runtime 被拆成：

- `document`
- `session`
- `view`
- `preview`

这是典型的“抽象层级看起来整齐，但认知成本很高”的设计。

实际使用时，一个用户动作往往会跨这些通道：

- 先改 session
- 再清 preview
- 再 patch document
- 再动 view

这不是清晰，而是把一个动作切成了多个领域里的半动作。

### 4. React 侧仍然承担 view 拼装

虽然 `node.view` / `edge.view` / `mindmap.view` 已经补了一轮，但整体上 React 仍然存在大量“读多个 store，再本地拼逻辑”的模式。

当前 React 里仍能看到：

- 内容层 view hook
- selection chrome context hook
- toolbar local session state
- presence 自己做 viewport/world->screen 转换

这说明目前 runtime 仍然没有把“给 React 的展示数据”收敛成足够清晰的边界。

### 5. Whiteboard React 容器层存在额外同步协议

当前 `Whiteboard.tsx` + `DocumentSync.tsx` 的受控同步逻辑，本质上是在维护：

- 外部传入 document
- normalize 后 inputDocument
- engine 内 document
- lastOutboundDocumentRef

这是一条典型的“双向镜像协议”，复杂且脆弱。

如果不考虑兼容，这条协议应直接删除。

## 极简设计原则

### 原则 1：状态只分两类

整个系统只保留两类状态：

1. committed document state
2. editor ui state

不要再有第三类 overlay/preview/session/view 独立状态层。

### 原则 2：一个概念只保留一个可写源

例如：

- selection 只有一个可写源
- edit 只有一个可写源
- interaction draft 只有一个可写源
- text preview 只有一个可写源

其他一切都只能是纯 derived selector。

### 原则 3：React 只读 presentation，不读实现细节

React 不应该直接知道：

- overlay patch
- preview patch
- interaction gesture raw draft
- runtime state controller 内部结构

React 只读：

- scene presentation
- chrome presentation
- panel presentation

### 原则 4：actions 按用户意图分组，不按内部模块分组

不要再分：

- session.selection.replace
- document.node.update
- preview.node.text.clear
- view.pointer.set

而应该统一成：

- `editor.actions.select(...)`
- `editor.actions.startEdit(...)`
- `editor.actions.commitEdit(...)`
- `editor.actions.moveSelection(...)`
- `editor.actions.setTool(...)`
- `editor.actions.setViewport(...)`

内部怎么改状态，是 action 的实现细节，不应暴露给调用者。

## 推荐的新总体结构

## 一层内核

保留 `engine`，但只负责：

- document
- operations / commands
- geometry / layout / index
- committed read model

也就是说，engine 继续做纯文档和几何内核，不负责 UI state。

## 一层 editor store

editor 不再拆成 runtime.state / overlay / preview / session / view 多层，而是只保留一个可写的 editor store。

建议结构：

```ts
type EditorStore = {
  document: {
    revision: number
  }
  ui: {
    tool: Tool
    viewport: Viewport
    pointer: PointerSample | null
    selection: SelectionTarget
    edit: EditTarget | null
    drawPreferences: DrawPreferences
    interaction: InteractionState
  }
}
```

其中 `interaction` 是唯一的瞬时态来源。

### `interaction` 建议直接承载所有临时草稿

例如：

```ts
type InteractionState =
  | { kind: 'idle' }
  | { kind: 'press', ... }
  | { kind: 'marquee', ... }
  | { kind: 'move', selection: ..., draft: ... }
  | { kind: 'transform', selection: ..., draft: ... }
  | { kind: 'edge-connect', draft: ... }
  | { kind: 'edge-route', draft: ... }
  | { kind: 'draw', draft: ... }
  | { kind: 'mindmap-drag', draft: ... }
  | { kind: 'text-edit', nodeId: ..., field: ..., draft: ... }
```

关键点：

- 不再单独存在 overlay store
- 不再单独存在 preview runtime
- interaction draft 就是 preview
- interaction kind 就是当前 gesture / mode

## 一层 selectors

所有面向 React 的东西都通过 selector 从：

- engine committed state
- editor ui state

直接导出。

推荐只保留三类 presentation selector：

- `scenePresentation`
- `chromePresentation`
- `panelPresentation`

### `scenePresentation`

给内容层渲染使用。

它直接返回 render-ready 的有序数组：

```ts
type ScenePresentation = {
  items: readonly SceneRenderItem[]
}

type SceneRenderItem =
  | { kind: 'node', ...renderReadyNode }
  | { kind: 'edge', ...renderReadyEdge }
  | { kind: 'mindmap', ...renderReadyMindmap }
```

这样 React 内容层只订阅一个 store。

不再需要：

- `scene.list`
- `node.view`
- `edge.view`
- `mindmap.view`
- 然后在 React 再 map 一次

如果追求极简，最终应直接走 `scenePresentation.items`。

### `chromePresentation`

给 transform handles、connect handles、selection frame、drag guides、edge route handles 使用。

它应该是：

```ts
type ChromePresentation = {
  selectionBox?: ...
  nodeHandles?: ...
  edgeHandles?: ...
  guides?: ...
  edgeHint?: ...
}
```

这会替代：

- `read.selection.overlay`
- `read.overlay.feedback.snap`
- `read.overlay.feedback.edgeGuide`
- 各种额外的 selected item hook

### `panelPresentation`

给 toolbar / action menu / text style panel 使用。

这会替代：

- `read.selection.toolbar`
- `read.selection.node`
- `read.selection.box`
- 各种编辑上下文推导

## 推荐删除或合并的层

### 1. 删除 `overlay` 独立状态层

应删除：

- `whiteboard/packages/whiteboard-editor/src/runtime/overlay/*`

保留其中有价值的：

- patch/guide 的数据结构定义
- geometry 投影辅助函数

但不保留 “overlay 作为单独 store” 这一层。

原因：

- 它本质上只是 interaction/transient state 的另一种命名
- 现在是 preview、selection gesture、edge hint、mindmap drag 的混合承载层
- 增加了一整层“写 overlay -> selector -> read -> react”的跳转

### 2. 删除 `preview runtime`

应删除：

- `whiteboard/packages/whiteboard-editor/src/runtime/preview/*`

原因：

- preview 本质就是 interaction draft
- 单独建 runtime 只是把临时状态再包一层

替代：

- 所有 preview 数据直接进入 `ui.interaction`

### 3. 删除 `session runtime`

应删除：

- `whiteboard/packages/whiteboard-editor/src/runtime/session/*`

原因：

- `session` 只是 tool / selection / edit 的轻薄包装
- 清 edit、切 tool、改 selection 这些规则应该直接写进 action reducer

替代：

- `editor.actions.*`

### 4. 删除 `view runtime`

应删除：

- `whiteboard/packages/whiteboard-editor/src/runtime/view/*`

原因：

- `view.pointer.set`
- `view.space.set`
- `view.draw.patch`

这些本质都是 editor ui state mutation，不需要单独抽“view” runtime。

替代：

- `editor.actions.setPointer`
- `editor.actions.setSpace`
- `editor.actions.patchDrawPreferences`
- `editor.actions.setViewportRect`

### 5. 合并 `document runtime`

`document runtime` 目前内部又拆 node/edge/mindmap/appearance/text/shape/lock。

这里不建议完全删除，但建议强力收缩：

- 对外只暴露 `editor.actions.document.*`
- 内部不再多层包装 mutation host

也就是说：

- 可以保留少量纯函数 helpers
- 不保留 runtime facade 套 runtime facade 的结构

## 具体状态重置建议

## A. 选择态

当前：

- selection source
- summary
- transformBox
- affordance
- overlay
- toolbar

建议：

- 唯一可写源：`ui.selection`
- 其余全部作为 selector

但 selector 也不要层层 derived store 套 derived store。

建议直接做一个总 selector：

```ts
selectSelectionPresentation(state) => {
  summary,
  box,
  affordance,
  overlay,
  toolbar
}
```

也就是说：

- 不再分别暴露 `box/node/overlay/toolbar`
- selection presentation 一次性给出

## B. 编辑态

当前：

- `state.edit`
- 文本节点自己的 `draft`
- edge label 自己的 `draft`
- preview.node.text 又有一份 patch

建议：

- `edit` 进入 `ui.interaction`
- 只有一个 active edit session
- draft、caret、measurement、commit metadata 都挂在 edit session 下

这样文本编辑不再分：

- state.edit 表示“正在编辑”
- 组件本地 state 表示“编辑草稿”
- preview 表示“编辑中的尺寸/位置”

全部统一成一个 session。

## C. interaction / gesture

当前：

- interaction.active
- interaction.mode
- interaction.gesture
- overlay.selection
- overlay.edge

建议：

- `ui.interaction` 就是唯一交互状态
- 不再同时维护 `mode + gesture + overlay`

React 和 selector 直接看 `interaction.kind` 与其 draft。

## D. 文本尺寸预览

当前文本尺寸逻辑横跨：

- React 编辑组件
- preview runtime
- overlay node text
- node item projection

建议直接二选一：

1. 极简优先：
   - 文本 display 不自动测量
   - 仅在 commit 时测一次

2. 保留体验：
   - 文本 edit session 内持有测量结果
   - commit 时写回

但无论如何，不要再走：

- React -> preview -> overlay -> node read -> react

这条环。

## E. scene 渲染

当前内容层仍有：

- `scene.list`
- 各类 `*.view`
- 内容组件自己继续判断

极简版建议直接做：

```ts
editor.select.scenePresentation()
```

返回 render-ready 的有序列表。

这样可以删除：

- 各种 `useNodeView` / `useEdgeView` / `useMindmapTreeView`
- 各种按 id 再 lookup 的中间 hook

React 内容层只剩：

- `const scene = useEditorSelector(selectScenePresentation)`
- `scene.items.map(renderItem)`

## F. whiteboard 容器层

当前：

- `Whiteboard.tsx`
- `services.ts`
- `DocumentSync.tsx`
- 多个 lifecycle 组件

如果不考虑兼容，建议直接重做成单一 runtime host。

### 新 API 建议

放弃受控 `document` 镜像协议，改成：

```ts
<Whiteboard
  initialDocument={doc}
  onChange={handleChange}
  config={...}
/>
```

并提供 imperative api：

- `editor.load(document)`
- `editor.export()`

这样可以直接删除：

- `DocumentSync.tsx`
- `lastOutboundDocumentRef`
- `isMirroredDocumentFromEngine`

如果必须支持外部替换文档，也只保留一个显式命令：

- prop 变化时直接 `editor.load(nextDocument)`

不要再做双向镜像比较。

### lifecycle 合并建议

把这些散落的 lifecycle 合并成一个 host effect：

- editor lifecycle
- collab lifecycle
- presence lifecycle

即：

- 一个 `WhiteboardHost` 统一管理 side effects
- 不再拆成多个只做一件小事的 React 组件

## 推荐的新模块边界

## 保留

- `engine`
- `editor/store`
- `editor/actions`
- `editor/selectors`
- `react/host`
- `react/components`

## 删除

- `runtime/overlay`
- `runtime/preview`
- `runtime/session`
- `runtime/view`
- 大部分 `read/*View hook` 级别的中间层

## 强力收缩

- `runtime/read`
- `runtime/document`
- `runtime/interaction`

它们不再是多个横向 runtime，而是收敛成：

- `actions`
- `selectors`
- 少量内部纯函数

## 推荐的新 API 命名

当前命名有很多“抽象上正确，但认知上绕”的词：

- runtime
- session
- view
- preview
- overlay
- read bundle
- services

建议整体换成更直接的命名：

- `editor.store`
- `editor.actions`
- `editor.select`

例如：

- `editor.actions.setTool`
- `editor.actions.select`
- `editor.actions.startEdit`
- `editor.actions.commitEdit`
- `editor.actions.cancelInteraction`
- `editor.actions.patchNodes`
- `editor.actions.patchEdges`
- `editor.select.scenePresentation`
- `editor.select.chromePresentation`
- `editor.select.panelPresentation`

## 最终 API 设计

这一节给出最终建议的公开 API 形态。

目标：

- 名称短
- 命名统一
- 一眼能看懂作用域
- 按命名空间分组
- 不暴露内部实现概念

## 顶层对象

最终建议只保留四个顶层入口：

- `editor.store`
- `editor.actions`
- `editor.select`
- `editor.events`

其中：

- `store` 是底层状态容器，通常不直接给业务代码用
- `actions` 是唯一写入口
- `select` 是唯一读入口
- `events` 只保留少量外部订阅事件

## `editor.actions`

`actions` 只按用户意图和领域分组，不按 runtime 模块分组。

### `editor.actions.app`

全局应用级动作：

- `editor.actions.app.reset()`
- `editor.actions.app.load(document)`
- `editor.actions.app.export()`
- `editor.actions.app.dispose()`

说明：

- `load` 替代现在的 `document.replace`
- `export` 替代外部直接读 engine document

### `editor.actions.tool`

- `editor.actions.tool.set(tool)`
- `editor.actions.tool.select()`
- `editor.actions.tool.draw(kind)`
- `editor.actions.tool.edge(preset)`
- `editor.actions.tool.insert(preset)`
- `editor.actions.tool.hand()`

说明：

- 保留 `set` 作为通用入口
- 其余是常用快捷入口

### `editor.actions.viewport`

- `editor.actions.viewport.set(viewport)`
- `editor.actions.viewport.pan(delta)`
- `editor.actions.viewport.zoom(zoom, anchor?)`
- `editor.actions.viewport.fit(bounds, padding?)`
- `editor.actions.viewport.reset()`
- `editor.actions.viewport.rect(rect)`
- `editor.actions.viewport.limits(limits)`

说明：

- 不再用 `setRect` / `setLimits` 这种长名
- `rect` 和 `limits` 已足够清晰

### `editor.actions.selection`

- `editor.actions.selection.set(target)`
- `editor.actions.selection.add(target)`
- `editor.actions.selection.remove(target)`
- `editor.actions.selection.toggle(target)`
- `editor.actions.selection.all()`
- `editor.actions.selection.clear()`
- `editor.actions.selection.frame(bounds, options?)`
- `editor.actions.selection.order(mode)`
- `editor.actions.selection.group(options?)`
- `editor.actions.selection.ungroup(options?)`
- `editor.actions.selection.delete(options?)`
- `editor.actions.selection.duplicate(options?)`

说明：

- `set` 统一替代 `replace`
- 和数组/集合语义一致

### `editor.actions.edit`

- `editor.actions.edit.startNode(nodeId, field, options?)`
- `editor.actions.edit.startEdgeLabel(edgeId, labelId, options?)`
- `editor.actions.edit.input(value)`
- `editor.actions.edit.caret(caret)`
- `editor.actions.edit.commit()`
- `editor.actions.edit.cancel()`
- `editor.actions.edit.clear()`

说明：

- 编辑态统一进入一个 namespace
- 不再区分 session / preview / draft 的多个入口

### `editor.actions.interaction`

- `editor.actions.interaction.cancel()`
- `editor.actions.interaction.pointerDown(input)`
- `editor.actions.interaction.pointerMove(input)`
- `editor.actions.interaction.pointerUp(input)`
- `editor.actions.interaction.pointerCancel(pointerId)`
- `editor.actions.interaction.pointerLeave()`
- `editor.actions.interaction.keyDown(input)`
- `editor.actions.interaction.keyUp(input)`
- `editor.actions.interaction.blur()`
- `editor.actions.interaction.wheel(input)`

说明：

- 这是唯一接收 DOM 输入的入口
- 不再暴露 `input`、`interaction runtime`、`pointer bridge` 多层概念

### `editor.actions.node`

- `editor.actions.node.create(input)`
- `editor.actions.node.patch(ids, patch, options?)`
- `editor.actions.node.move(ids, delta)`
- `editor.actions.node.align(ids, mode)`
- `editor.actions.node.distribute(ids, mode)`
- `editor.actions.node.remove(ids)`
- `editor.actions.node.duplicate(ids)`
- `editor.actions.node.lock(ids, value)`

#### `editor.actions.node.text`

- `editor.actions.node.text.set(ids, text)`
- `editor.actions.node.text.color(ids, color)`
- `editor.actions.node.text.size(ids, value, options?)`
- `editor.actions.node.text.weight(ids, value)`
- `editor.actions.node.text.italic(ids, value)`
- `editor.actions.node.text.align(ids, value)`

#### `editor.actions.node.style`

- `editor.actions.node.style.patch(ids, patch)`
- `editor.actions.node.style.fill(ids, value)`
- `editor.actions.node.style.stroke(ids, value)`

#### `editor.actions.node.shape`

- `editor.actions.node.shape.set(ids, kind)`

说明：

- 不再用 `appearance` 这种过宽泛词
- `style` 和 `text` 的边界更直接

### `editor.actions.edge`

- `editor.actions.edge.create(input)`
- `editor.actions.edge.patch(ids, patch)`
- `editor.actions.edge.move(id, delta)`
- `editor.actions.edge.reconnect(id, end, target)`
- `editor.actions.edge.remove(ids)`

#### `editor.actions.edge.route`

- `editor.actions.edge.route.insert(id, point)`
- `editor.actions.edge.route.move(id, index, point)`
- `editor.actions.edge.route.remove(id, index)`
- `editor.actions.edge.route.clear(id)`

#### `editor.actions.edge.label`

- `editor.actions.edge.label.add(id, input?)`
- `editor.actions.edge.label.patch(id, labelId, patch)`
- `editor.actions.edge.label.remove(id, labelId)`
- `editor.actions.edge.label.setText(id, labelId, text)`
- `editor.actions.edge.label.move(id, labelId, placement)`

说明：

- 统一用 `label`，不用 `labels` / `edgeLabelActions` 混用

### `editor.actions.mindmap`

- `editor.actions.mindmap.create(input?)`
- `editor.actions.mindmap.remove(ids)`
- `editor.actions.mindmap.insert(id, input)`
- `editor.actions.mindmap.move(id, input)`
- `editor.actions.mindmap.removeNode(id, input)`
- `editor.actions.mindmap.clone(id, input)`
- `editor.actions.mindmap.patchNode(id, input)`
- `editor.actions.mindmap.insertByPlace(input)`
- `editor.actions.mindmap.moveByDrop(input)`
- `editor.actions.mindmap.moveRoot(input)`

说明：

- `delete` 统一改成 `remove`
- `updateNode` 统一改成 `patchNode`
- `insertByPlacement` 简化为 `insertByPlace`

### `editor.actions.clipboard`

- `editor.actions.clipboard.copy(target?)`
- `editor.actions.clipboard.cut(target?)`
- `editor.actions.clipboard.paste(packet, options?)`

### `editor.actions.history`

- `editor.actions.history.undo()`
- `editor.actions.history.redo()`
- `editor.actions.history.clear()`

## `editor.select`

`select` 统一返回稳定、面向消费方的数据，不暴露实现细节。

### `editor.select.scene`

内容层唯一入口：

- `editor.select.scene()`

返回：

```ts
type ScenePresentation = {
  items: readonly SceneItem[]
}
```

### `editor.select.chrome`

覆盖所有交互附属渲染：

- `editor.select.chrome()`

返回：

```ts
type ChromePresentation = {
  node?: ...
  edge?: ...
  selection?: ...
  guides?: ...
  hint?: ...
}
```

### `editor.select.panel`

所有工具栏、菜单、编辑面板的统一入口：

- `editor.select.panel()`

### `editor.select.selection`

如果仍需要细分，只保留一个命名空间：

- `editor.select.selection()`
- `editor.select.selection.box()`
- `editor.select.selection.summary()`

但理想情况仍是：

- chrome 用 `chrome()`
- panel 用 `panel()`

尽量不要再把 selection 拆成很多散 selector。

### `editor.select.doc`

只保留少量 committed 文档读取：

- `editor.select.doc()`
- `editor.select.doc.bounds()`
- `editor.select.doc.background()`

### `editor.select.tool`

- `editor.select.tool()`

### `editor.select.viewport`

- `editor.select.viewport()`

### `editor.select.edit`

- `editor.select.edit()`

### `editor.select.interaction`

- `editor.select.interaction()`

## `editor.events`

`events` 只保留给外部集成使用，不给内部 UI 当主读写手段。

建议只保留：

- `editor.events.change(listener)`
- `editor.events.history(listener)`
- `editor.events.selection(listener)`
- `editor.events.dispose(listener)`

说明：

- 不再给每个内部状态层都开放 subscribe
- React 内部原则上走 `select`

## React 侧最终 API

React 层建议只保留两个 hooks：

- `useEditor()`
- `useEditorSelect(selector)`

可选补一个：

- `useEditorActions()`

即：

```ts
const editor = useEditor()
const scene = useEditorSelect((editor) => editor.select.scene())
const actions = useEditorActions()
```

不再保留：

- `useNodeView`
- `useEdgeView`
- `useMindmapTreeView`
- `useTool`
- `useEdit`
- `useInteraction`

这些 hook 的存在，本质上是在暴露内部状态切片。

## Whiteboard 组件最终 API

最终建议组件 API 也尽量短：

```tsx
<Whiteboard
  initialDocument={doc}
  onChange={handleChange}
  config={config}
  collab={collab}
/>
```

ref API：

```ts
type WhiteboardRef = {
  editor: Editor
}
```

如果要更极简，可以直接：

```ts
type WhiteboardRef = Editor
```

## 命名约束

最终统一遵循这些规则：

- 写操作统一用动词：`set / add / remove / move / patch / clear / reset / commit / cancel`
- 领域对象统一用单数 namespace：`node / edge / mindmap / tool / edit / selection`
- 不再使用含糊抽象词：`runtime / session / preview / overlay / services`
- 不再混用同义词：
  - 统一 `set`，不再混用 `replace`
  - 统一 `remove`，不再混用 `delete`
  - 统一 `patch`，不再混用 `update`
  - 统一 `label`，不再混用 `labels` action object

## 最终命名示例

推荐保留这种风格：

- `editor.actions.node.patch(...)`
- `editor.actions.node.text.size(...)`
- `editor.actions.edge.label.patch(...)`
- `editor.actions.selection.set(...)`
- `editor.actions.viewport.zoom(...)`
- `editor.select.scene()`
- `editor.select.chrome()`
- `editor.select.panel()`

不推荐再出现这种风格：

- `editor.document.nodes.patch(...)`
- `editor.session.selection.replace(...)`
- `editor.view.preview.nodeText.clearSize(...)`
- `editor.read.selection.toolbar`
- `editor.read.overlay.feedback.edgeGuide`

## 建议删除的旧实现清单

这部分不是渐进式迁移清单，而是最终应该消失的东西。

### 运行时层

- `whiteboard/packages/whiteboard-editor/src/runtime/overlay`
- `whiteboard/packages/whiteboard-editor/src/runtime/preview`
- `whiteboard/packages/whiteboard-editor/src/runtime/session`
- `whiteboard/packages/whiteboard-editor/src/runtime/view`
- `whiteboard/packages/whiteboard-editor/src/runtime/read/selectionPresentation*`

### React 层

- `useNodeView`
- `useEdgeView`
- `useMindmapTreeView`
- 各种只负责“按 id 读 store 再拼 view”的 hook

### 容器层

- `whiteboard/packages/whiteboard-react/src/runtime/whiteboard/DocumentSync.tsx`
- 多个分散 lifecycle 组件，最终合并为单 host

## 最终推荐形态

最终我建议整个系统只保留这条主链：

```ts
engine (committed document)
  ->
editor.store (ui state + interaction state)
  ->
editor.actions / editor.select
  ->
react host
  ->
react components
```

任何额外的：

- overlay
- preview
- session
- view runtime
- services facade
- React view hook 二次拼装

只要不是绝对必要，都应该删掉。

## 实施顺序建议

### 第一阶段：状态收敛

1. 建立单一 `editor.store`
2. 把 `selection/edit/interaction/viewport/tool` 全部并入
3. 废弃 overlay / preview / session / view runtime

### 第二阶段：selector 收敛

1. 建立 `scenePresentation`
2. 建立 `chromePresentation`
3. 建立 `panelPresentation`
4. React 停止直接读实现细节 store

### 第三阶段：action 收敛

1. 建立 `editor.actions`
2. 取消 `document/session/view/preview` 通道划分
3. 所有交互统一走 action

### 第四阶段：React 容器重做

1. 改成 `initialDocument + onChange`
2. 删除 `DocumentSync`
3. 合并 lifecycle host

## 一句话结论

如果按“不做兼容、只追求最简单”的标准，这套系统应该从“多 runtime + 多 store + 多 presentation 翻译层”重置为：

- 一个 engine
- 一个 editor store
- 一组 actions
- 一组 selectors
- 一个 React host

除此之外的大部分中间层，都可以删。

# Whiteboard Editor 长期最优公开 API 草案与重构方案

## 1. 结论

基于当前 `whiteboard-editor` 的真实结构，长期最优方案不是重做一个全新的顶层 editor 模型，而是：

- 保留当前已经成立的主轴：
  - `scene`
  - `document`
  - `input`
  - `actions`
  - `write`
  - `state`
  - `viewport`
  - `runtime`
- 删除 transient state 的 `intent system`
- 删除 transient state 的 `dispatch`
- 删除 transient state 的 `compileHandlers`
- 让 `write` 固定为 document semantic write facade
- 让 `actions` 固定为顶层 policy facade
- 让 `state` 固定为 local transient state store
- 让 transient 语义入口统一收口到 `actions.session`

最终边界：

- document semantic path:
  `actions.document.* -> write.* -> engine.execute(intent)`
- transient local path:
  `actions.session.* -> state.write(writer)`
- frame-level draft path:
  `input / interaction runtime -> state.write(writer)`

## 2. 顶层公开 API 草案

### 2.1 `Editor`

```ts
export interface Editor {
  scene: EditorSceneFacade
  document: DocumentFrame
  input: EditorInputHost
  actions: EditorActions
  write: EditorWrite
  state: EditorStateStoreFacade
  viewport: EditorViewport
  runtime: EditorRuntime
  dispose(): void
}
```

### 2.2 `EditorSceneFacade`

```ts
export interface EditorSceneFacade extends EditorScene {
  ui: EditorSceneUi
  capture(): Capture
}
```

职责：

- 所有投影后的可视读
- hit/query/selection/chrome/mindmap/background 等 UI 读
- scene capture

不承担：

- document write
- transient policy
- local state mutation

### 2.3 `EditorInputHost`

```ts
export interface EditorInputHost {
  pointerMode(phase: 'move' | 'up'): PointerMode
  contextMenu(input: ContextMenuInput): ContextMenuIntent | null
  pointerDown(input: PointerDownInput): EditorPointerDispatchResult
  pointerMove(input: PointerMoveInput): boolean
  pointerUp(input: PointerUpInput): boolean
  pointerCancel(input: { pointerId: number }): boolean
  pointerLeave(): void
  wheel(input: WheelInput): boolean
  keyDown(input: KeyboardInput): boolean
  keyUp(input: KeyboardInput): boolean
  blur(): void
  cancel(): void
}
```

职责：

- 输入宿主
- 交互 runtime 入口

不承担：

- 业务语义 API
- document write facade
- transient state 公开语义 API

### 2.4 `EditorRuntime`

```ts
export interface EditorRuntime {
  config: BoardConfig
  nodeType: NodeTypeSupport
  snap: SnapRuntime
}
```

职责：

- runtime services
- editor 内部与高级调用侧需要的能力注入

## 3. Document 侧公开 API 草案

## 3.1 `EditorWrite`

`write` 是稳定、偏底层、无 UI policy 的 document semantic write facade。

```ts
export interface EditorWrite {
  document: DocumentWrite
  canvas: CanvasWrite
  node: NodeWrite
  group: GroupWrite
  edge: EdgeWrite
  mindmap: MindmapWrite
  history: HistoryWrite
}
```

要求：

- 所有 document 写入最终只通过 `engine.execute(intent)`
- 不承担 transient state policy
- 不直接暴露 mutation schema patch 细节

## 3.2 `actions.document`

`actions.document` 是面向产品/UI 的 document policy facade。

```ts
export interface EditorDocumentActions {
  node: NodeActions
  edge: EdgeActions
  mindmap: MindmapActions
  clipboard: ClipboardActions
  history: HistoryActions
}
```

职责：

- 组合 `write`、`scene`、`document`、`state`
- 承载用户语义与 UX policy
- 仍以 document 为主语义对象

例如：

```ts
editor.actions.document.node.create(...)
editor.actions.document.edge.label.add(...)
editor.actions.document.mindmap.insert(...)
editor.actions.document.clipboard.paste(packet)
editor.actions.document.history.undo()
```

## 4. Transient 侧公开 API 草案

## 4.1 `EditorStateStoreFacade`

`state` 是 transient local state 的唯一底层公开入口。

```ts
export interface EditorStateStoreFacade {
  read(): EditorStateSnapshot
  write(
    run: (ctx: {
      writer: EditorStateWriter
      snapshot: EditorStateSnapshot
    }) => void
  ): void
  subscribe(
    listener: (commit: EditorStateCommit) => void
  ): () => void
  stores: EditorStateStores
}
```

职责：

- editor-local state 的统一读写
- 对 scene/react 暴露订阅能力
- 为高频 input runtime 提供直接写入通道

替代：

- `editor.read()`
- transient `dispatch(...)`
- transient intent runtime

## 4.2 `EditorStateWriter`

`EditorStateWriter` 是 transient state 唯一真实写模型。

```ts
export interface EditorStateWriter {
  tool: {
    set(tool: Tool): void
  }
  draw: {
    set(state: DrawState): void
    patch(patch: BrushStylePatch): void
    slot(brush: DrawMode, slot: DrawSlot): void
  }
  selection: {
    set(selection: SelectionTarget): void
    clear(): void
  }
  edit: {
    set(edit: EditSession | null): void
    clear(): void
  }
  interaction: {
    set(state: EditorStableInteractionState): void
    clear(): void
  }
  hover: {
    set(state: EditorHoverState): void
    clear(): void
  }
  preview: {
    node: {
      create(input: { id: string } & NodePreview): void
      patch(id: string, writes: Readonly<Record<string, unknown>>): void
      delete(id: string): void
      replace(next: PreviewInput['node']): void
      clear(): void
    }
    edge: {
      create(input: { id: string } & EdgePreview): void
      patch(id: string, writes: Readonly<Record<string, unknown>>): void
      delete(id: string): void
      replace(next: PreviewInput['edge']): void
      clear(): void
    }
    mindmap: {
      create(input: { id: string } & MindmapPreviewEntry): void
      patch(id: string, writes: Readonly<Record<string, unknown>>): void
      delete(id: string): void
      replace(next: PreviewInput['mindmap']): void
      clear(): void
    }
    selection: {
      patch(patch: Partial<PreviewInput['selection']>): void
      set(next: PreviewInput['selection']): void
      clear(): void
    }
    draw: {
      patch(patch: { current: PreviewInput['draw'] }): void
      set(next: PreviewInput['draw']): void
      clear(): void
    }
    edgeGuide: {
      patch(patch: { current: PreviewInput['edgeGuide'] | undefined }): void
      set(value: PreviewInput['edgeGuide'] | undefined): void
      clear(): void
    }
    reset(): void
  }
}
```

要求：

- 状态变化只在 writer 中定义一次
- 不再重复存在 `intent + applyCommand + compileHandlers`
- `replace/set/clear/reset` 是推荐语义入口
- `create/patch/delete` 作为同一 writer 上的低层增量能力保留，供高频 interaction/frame path 使用
- preview 的 collection diff 仍以内聚到 writer 为原则，不再借助第二套 transient command runtime

## 4.3 `EditorStateStores`

面向 scene/react 的细粒度读订阅继续保留，但从 `state` 统一暴露。

```ts
export interface EditorStateStores {
  tool: ReadStore<Tool>
  draw: ReadStore<DrawState>
  selection: ReadStore<SelectionTarget>
  edit: ReadStore<EditSession | null>
  interaction: ReadStore<EditorInteractionStateValue>
  hover: ReadStore<EditorHoverState>
  preview: ReadStore<PreviewInput>
}
```

要求：

- 顶层 `state` 统一公开
- scene-ui 与 react 不需要自己拼 commit 订阅
- hover 从聚合 interaction 中显式拆出

## 4.4 `actions.session`

`actions.session` 是所有 transient 语义的唯一公开 facade。

```ts
export interface EditorSessionActions {
  tool: ToolSessionActions
  draw: DrawSessionActions
  selection: SelectionSessionActions
  edit: EditSessionActions
  hover: HoverSessionActions
  preview: PreviewSessionActions
}
```

目标调用形态：

```ts
editor.actions.session.tool.set({ type: 'select' })
editor.actions.session.draw.patch({ color: '#333' })
editor.actions.session.selection.clear()
editor.actions.session.edit.startNode(nodeId, 'text')
editor.actions.session.hover.clear()
editor.actions.session.preview.reset()
```

要求：

- `actions.session.*` 内部统一调用 `state.write(...)`
- 组合 UX policy 仍留在 actions 层
- 不新增与 `actions` 平级的 `editor.session.*`

## 5. 最终 `actions` 公开 API 草案

长期最优下，`actions` 应从平铺结构改成两层分域结构。

```ts
export interface EditorActions {
  app: AppActions
  viewport: ViewportActions
  session: EditorSessionActions
  document: EditorDocumentActions
}
```

说明：

- `app` 仍保留顶层，因为它是 editor 级操作
- `viewport` 仍保留顶层，因为它不是纯 document，也不是纯 transient session
- 其它语义分为 `session` 与 `document`

### 5.1 `app`

```ts
export interface AppActions {
  replace(document: Document): IntentResult
}
```

### 5.2 `viewport`

```ts
export interface ViewportActions {
  set(viewport: Viewport): void
  panBy(delta: Point): void
  panScreenBy(delta: Point): void
  zoomTo(zoom: number, anchor?: Point): void
  fit(bounds: Rect, padding?: number): void
  reset(): void
  wheel(input: WheelInput, wheelSensitivity?: number): void
}
```

### 5.3 `session`

建议拆分如下：

```ts
export interface ToolSessionActions {
  get(): Tool
  set(tool: Tool): void
  select(): void
  draw(mode: DrawMode): void
  edge(template: EdgeTemplate): void
  insert(template: InsertTemplate): void
  hand(): void
}

export interface DrawSessionActions {
  get(): DrawState
  set(state: DrawState): void
  slot(slot: DrawSlot): void
  patch(patch: BrushStylePatch): void
}

export interface SelectionSessionActions {
  get(): SelectionTarget
  replace(input: SelectionInput): void
  add(input: SelectionInput): void
  remove(input: SelectionInput): void
  toggle(input: SelectionInput): void
  selectAll(): void
  clear(): void
  duplicate(
    target: SelectionInput,
    options?: { selectInserted?: boolean }
  ): boolean
  delete(
    target: SelectionInput,
    options?: { clearSelection?: boolean }
  ): boolean
  order(
    target: SelectionInput,
    mode: 'front' | 'back' | 'forward' | 'backward'
  ): boolean
  group(
    target: SelectionInput,
    options?: { selectResult?: boolean }
  ): boolean
  ungroup(
    target: SelectionInput,
    options?: { fallbackSelection?: 'members' | 'none' }
  ): boolean
  frame(
    bounds: Rect,
    options?: { padding?: number }
  ): boolean
}

export interface EditSessionActions {
  get(): EditSession | null
  startNode(
    nodeId: NodeId,
    field: EditField,
    options?: { caret?: EditCaret }
  ): void
  startEdgeLabel(
    edgeId: EdgeId,
    labelId: string,
    options?: { caret?: EditCaret }
  ): void
  input(text: string): void
  composing(composing: boolean): void
  caret(caret: EditCaret): void
  cancel(): void
  commit(): void
  clear(): void
}

export interface HoverSessionActions {
  get(): EditorHoverState
  set(state: EditorHoverState): void
  clear(): void
  edgeGuide: {
    get(): PreviewInput['edgeGuide'] | undefined
    set(value: PreviewInput['edgeGuide'] | undefined): void
    clear(): void
  }
}

export interface PreviewSessionActions {
  get(): PreviewInput
  reset(): void
  clear(): void
}
```

### 5.4 `document`

建议保持语义与当前 `node/edge/mindmap/clipboard/history` 接近，只是挂载路径改变。

当前落地版本中，selection-target 驱动的 duplicate/delete/order/group/ungroup/frame 仍保留在 `actions.session.selection`，理由是它们强依赖当前 session selection policy；其底层 document write 仍然通过 `write` 完成。

`document` 分域如下：

```ts
export interface EditorDocumentActions {
  node: NodeActions
  edge: EdgeActions
  mindmap: MindmapActions
  clipboard: ClipboardActions
  history: HistoryActions
}
```

## 6. 顶层公开边界

必须明确以下规则。

### 6.1 允许直接公开的

- `editor.scene`
- `editor.document`
- `editor.input`
- `editor.actions`
- `editor.write`
- `editor.state`
- `editor.viewport`
- `editor.runtime`

### 6.2 不再公开的

- `editor.dispatch`
- `editor.read`
- `EditorStateIntent`
- `EditorDispatchInput`
- transient compile handler 概念

### 6.3 `write` 与 `actions` 的边界

- `write`: 无 UI policy 的 document semantic write facade
- `actions`: 有 policy 的顶层语义 facade

### 6.4 `actions.session` 与 `state` 的边界

- `actions.session`: 面向产品/UI 的 transient 语义 API
- `state`: 面向 runtime / 高级调用方的底层 local store

### 6.5 `input` 与 `actions/state` 的边界

- 有明确语义与 policy 的行为走 `actions.session`
- 高频临时草稿更新直接走 `state.write`

## 7. 内部实现边界

虽然本文关注公开 API，但长期最优方案需要明确内部实现约束。

### 7.1 `write` 不访问 transient 语义

`write.*` 只做 document semantic write，不负责：

- tool 切换副作用
- selection 清理 policy
- hover / preview reset
- edit session 变更

### 7.2 `actions.session` 不直接发 intent

`actions.session.*` 只能基于：

- `state.read()`
- `state.write()`
- `scene`
- `document`

不能再依赖 transient intent runtime。

### 7.3 `state.write` 是唯一 transient 真写路径

所有 transient 真实状态变化都应统一通过：

```ts
editor.state.write(({ writer, snapshot }) => {
  ...
})
```

### 7.4 scene 继续订阅 document + state

scene projection 更新模型可以保留，但数据源变为：

- engine commit
- state store commit

而不是 transient command engine commit。

## 8. 迁移顺序

### Phase 1: 冻结旧边界

目标：

- 停止新增 `dispatch`
- 停止新增 transient intent

### Phase 2: 建立新 `state` facade

目标：

- 让 `state.read/write/subscribe/stores` 成型

动作：

- 新建 `EditorStateStoreFacade`
- 新建 `EditorStateWriter`
- 保留现有 schema，先不拆 store

### Phase 3: 建立 `actions.session`

目标：

- 把 transient 语义从 `dispatch` 收口到 `actions.session`

动作：

- 先迁移 `tool/draw/selection/edit`
- 再补 `hover/preview`

### Phase 4: 重挂 `actions.document`

目标：

- 将当前平铺的 `node/edge/mindmap/clipboard/history` 调整到 `actions.document`

### Phase 5: 删除旧 runtime

目标：

- 删除 transient `dispatch`
- 删除 `EditorStateIntent`
- 删除 transient `compileHandlers`
- 删除 `applyCommand`

### Phase 6: 内部拆 store

目标：

- 将 unified transient state 拆成：
  - session store
  - hover store
  - preview store

要求：

- 顶层 `editor.state` facade 不变
- 顶层 `actions.session` facade 不变

## 9. 最终使用示例

### 9.1 document write

```ts
editor.actions.document.node.create({
  position,
  template
})

editor.write.node.move({
  ids,
  delta
})
```

### 9.2 transient session

```ts
editor.actions.session.tool.select()
editor.actions.session.selection.clear()
editor.actions.session.edit.startNode(nodeId, 'text')
editor.actions.session.preview.reset()
```

### 9.3 frame-level draft

```ts
editor.state.write(({ writer, snapshot }) => {
  writer.hover.clear()
  writer.preview.edge.replace(nextPreviewEdges)
  writer.preview.selection.set(nextPreviewSelection)
})
```

## 10. 最终判断

长期最优公开 API 应固定为：

- 顶层保留当前 editor 主轴
- `actions` 成为唯一顶层 policy facade
- `write` 成为唯一 document semantic write facade
- `state` 成为唯一 transient local store facade
- `actions.session` 成为唯一 transient 语义 API
- `dispatch` 与 transient intent runtime 被彻底删除

这套设计的核心优点是：

- 与当前代码结构连续
- 顶层概念数量更少
- document 与 transient 的边界直接反映在 API 上
- `actions` / `write` / `state` 三层职责清晰且长期稳定

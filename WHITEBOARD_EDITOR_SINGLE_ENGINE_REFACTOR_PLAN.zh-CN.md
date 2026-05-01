# WHITEBOARD_EDITOR 单引擎重构实施方案

## 1. 目标

这次重构的最终目标只有四条：

1. `whiteboard-editor` 内部只保留一个 mutation engine
2. `whiteboard-editor` 内部不保留任何 store
3. `history` 完全关闭，只保留 delta 能力
4. projection 是唯一 store/read 出口，React 只读 projection

这意味着最终不再保留：

- `session` 作为状态模型
- `state-engine.stores.*`
- 独立 overlay store
- `projectionSync.ts` 中间翻译层
- 第二套 preview / hover / interaction schema

---

## 2. 最终结构

### 2.1 Editor 内部

最终 `editor` 内部只保留：

- `MutationEngine<EditorDocument, EditorCommandTable, ...>`
- `dispatch(command | commands)`
- `snapshot()`
- `subscribe(listener)`
- imperative runtime

这里的 imperative runtime 只负责：

- pointer / keyboard / gesture 过程控制
- auto-pan / frame task / timeout task
- 根据输入 dispatch command

它不是状态层，不提供 store，不维护第二份 document。

### 2.2 Projection 外部

projection 是唯一 store 出口。

projection 负责：

- 订阅 document engine commit
- 维护 scene stores
- 维护 render stores
- 向 React 暴露只读 store / query API

最终数据主链应为：

```ts
engine.commit -> projection.update -> projection.stores -> react
```

而不是：

```ts
engine/state/session/overlay
  -> sync layer
    -> projection
```

---

## 3. 单一 EditorDocument

最终 editor document 只保留一份：

```ts
type EditorDocument = {
  state: EditorStableState
  overlay: EditorOverlayState
}
```

### 3.1 EditorStableState

只放稳定本地态：

```ts
type EditorStableState = {
  tool: Tool
  draw: DrawState
  selection: SelectionTarget
  edit: EditSession | null
  interaction: {
    mode: InteractionMode
    chrome: boolean
    space: boolean
  }
  viewport: Viewport
}
```

### 3.2 EditorOverlayState

只放 transient overlay：

```ts
type EditorOverlayState = {
  hover: HoverState
  preview: {
    nodes: Record<NodeId, NodePreview>
    edges: Record<EdgeId, EdgePreview>
    edgeGuide?: EdgeGuidePreview
    draw: DrawPreview | null
    selection: {
      marquee?: {
        worldRect: Rect
        match: SelectionMarqueeMatch
      }
      guides: readonly Guide[]
    }
    mindmap: MindmapPreview | null
  }
}
```

原则：

- `overlay` 也进入 mutation engine document
- 但 `overlay` 不进入 history
- `overlay` 必须是 plain object / array / record
- 禁止 `Map`
- 禁止 store 旁路写入

---

## 4. 关键约束

### 4.1 无 history

`editor` 内部不需要 history。

要求：

- mutation engine `history: false`
- 不再设计 editor 内部 undo / redo
- 只保留 commit delta / subscribe

### 4.2 所有状态变化都走 dispatch

最终只允许：

```ts
editor.dispatch(command)
editor.dispatch([command1, command2])
```

不允许：

- 直接 `store.set`
- 直接 `overlayStore.set`
- 直接 `previewStore.set`
- 任何绕过 engine 的状态写入

### 4.3 所有 record 都用 plain object

所有现在是 `Map` 的地方必须改成 `Record`：

- preview nodes
- preview edges
- 其他 editor local keyed overlay 数据

这是硬约束，不是风格选择。

原因：

- mutation diff / clone / patch 只适合 plain object tree
- `Map` 会破坏 delta 生产与 apply 行为

### 4.4 projection 是唯一 store 层

`whiteboard-editor` 内部不得再维护用于消费的 store。

store 只允许存在于：

- `whiteboard-editor-scene`
- `projection`
- React 最终读口

---

## 5. EditorCommand 设计

最终只保留一套 command：

```ts
type EditorCommand =
  | StateCommand
  | OverlayCommand
```

### 5.1 Stable state commands

```ts
'tool.set'
'draw.set'
'selection.set'
'edit.set'
'interaction.set'
'viewport.set'
```

说明：

- `interaction.set` 只负责 stable interaction
- 不再把 `hover` 混进 stable interaction

### 5.2 Overlay commands

```ts
'overlay.hover.set'
'overlay.preview.set'
'overlay.preview.nodes.patch'
'overlay.preview.edges.patch'
'overlay.preview.edgeGuide.set'
'overlay.preview.draw.set'
'overlay.preview.selection.set'
'overlay.preview.mindmap.set'
'overlay.reset'
```

原则：

- 是否保留粗粒度 `overlay.preview.set`，看实现方便
- 但最终 projection delta 必须是细粒度可消费语义
- command 可以粗，commit delta 不能粗

---

## 6. Projection 输入协议

最终 projection 不再吃中间翻译产物，直接吃 engine snapshot + delta。

目标协议：

```ts
type SceneUpdateInput = {
  document: {
    snapshot: WhiteboardDocument
    rev: Revision
    delta: MutationDelta
  }
  editor: {
    snapshot: EditorDocument
    delta: EditorSemanticDelta
  }
}
```

其中：

- `snapshot` 直接来自 editor engine
- `delta` 直接来自 editor engine commit

projection 自己把：

- `state`
- `overlay`

投影为 scene / render stores。

---

## 7. 分阶段迁移清单

## Phase 1：定义单一 EditorDocument

目标：

- 把 `state + overlay` 收进同一份 mutation document

要做的事：

- 新建 `EditorDocument`
- 新建 `EditorStableState`
- 新建 `EditorOverlayState`
- 定义所有 overlay record 结构为 `Record`
- 删除旧的 `EditorInputPreviewState` 作为最终协议角色

完成判定：

- editor engine document 类型不再分裂
- preview / hover 最终协议不再使用 `Map`

## Phase 2：重建 command table

目标：

- 所有 stable / overlay 更新都统一走 command

要做的事：

- 重写 command 类型
- 拆分 stable command 与 overlay command
- 编译器只面向 `EditorDocument`
- 删除旧的 `preview.set` 旁路语义

完成判定：

- editor 内部没有任何状态写入绕过 dispatch

## Phase 3：删除 editor 内部 store

目标：

- `whiteboard-editor` 内部不再持有消费型 store

要做的事：

- 删除 `state-engine.stores.*`
- 删除 runtime 内 preview / hover / transient store
- input runtime 改为局部变量 + dispatch
- host / features 全部改为读 `engine.snapshot()` 或 projection query

完成判定：

- editor runtime 内只剩 imperative control
- editor 内无 store 出口

## Phase 4：让 projection 直接消费 engine snapshot + delta

目标：

- 去掉中间翻译协议

要做的事：

- projection update 直接接收 `EditorDocument`
- projection runtime 自己读取 `snapshot.state`
- projection runtime 自己读取 `snapshot.overlay`
- 在 projection 内完成 scene/render store 更新

完成判定：

- `projectionSync.ts` 不再需要 build/merge/translate

## Phase 5：删除 session 模型

目标：

- 不再保留 `session` 作为 editor schema

要做的事：

- 删除 `session.preview.*` 最终职责
- 删除 `session.interaction.*` 最终职责
- 只保留必要 helper，能内联则内联
- input runtime / host 中不再出现 `session.preview`

完成判定：

- `session` 只剩过程 helper 或完全删除

## Phase 6：清理第二套实现

目标：

- 仓库中只剩最终实现

要做的事：

- 删除兼容函数
- 删除旧命名
- 删除双轨 snapshot/delta
- 删除旧 helper
- 删除不再使用的 adapter

完成判定：

- 仓库中不存在第二套 editor 状态实现

---

## 8. 文件级迁移清单

### 8.1 必改

- `whiteboard/packages/whiteboard-editor/src/state-engine/document.ts`
- `whiteboard/packages/whiteboard-editor/src/state-engine/intents.ts`
- `whiteboard/packages/whiteboard-editor/src/state-engine/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/projectionSync.ts`
- `whiteboard/packages/whiteboard-editor/src/input/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/input/host.ts`
- `whiteboard/packages/whiteboard-editor/src/input/hover/*`
- `whiteboard/packages/whiteboard-editor/src/session/preview/*`
- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/createProjectionRuntime.ts`

### 8.2 必删或强收缩

- `whiteboard/packages/whiteboard-editor/src/editor/projectionSync.ts`
- `whiteboard/packages/whiteboard-editor/src/session/interaction.ts`
- 所有只为旧 `session.preview` 服务的 helper
- 所有只为旧 `Map preview` 服务的 helper

### 8.3 必替换的数据结构

- `ReadonlyMap<NodeId, NodePreview>` -> `Record<NodeId, NodePreview>`
- `ReadonlyMap<EdgeId, EdgePreview>` -> `Record<EdgeId, EdgePreview>`
- 其他 editor local keyed overlay 结构按同样规则替换

---

## 9. 不做的事

- 不保留兼容层
- 不保留过渡 API
- 不保留双轨实现
- 不为了“先跑通”继续保留第二套状态来源

---

## 10. 完成判定

当满足以下条件，这次重构才算完成：

1. `whiteboard-editor` 内只有一个 mutation engine
2. `whiteboard-editor` 内没有任何 store
3. `history` 已完全关闭
4. 所有 editor 状态写入都只能通过 `dispatch`
5. overlay 已进入 engine document
6. 所有 editor local keyed 数据都已从 `Map` 改为 `Record`
7. projection 是唯一 store/read 出口
8. `session` 已不再作为状态模型存在
9. `projectionSync.ts` 已删除

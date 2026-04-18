# Whiteboard Write / Actions / Type Axis 最终架构方案

这份文档只回答一个问题：

在已经完成 `session / layout / query / write / actions / host` 运行时重构之后，`write`、`actions`、`types` 这条轴线上还剩下哪些多余翻译层，以及长期最优应该怎么继续收口。

结论只有一个版本，不保留候选设计，不保留兼容路径。

这份文档是 [WHITEBOARD_EDITOR_SESSION_HOST_FINAL_ARCHITECTURE.zh-CN.md](/Users/realrong/Rostack/WHITEBOARD_EDITOR_SESSION_HOST_FINAL_ARCHITECTURE.zh-CN.md) 在 `write / actions / types` 轴上的继续版，作为后续一次性收口的唯一依据。

---

## 1. 最终结论

`write` 和 `actions` 两层都要保留。

不该保留的是：

1. `commands` 作为旧概念继续以 type / helper / naming 的形式残留。
2. `types/commands.ts` 继续承担“所有层共享大类型中轴”。
3. public `EditorActions` 继续从 internal `write` 类型上 `Pick/Omit` 投影出来。
4. `MindmapCommands` 继续把 write 语义、action 语义、read 语义混在一起。
5. `SessionActions` 这类为了喂 helper 而单独制造的 adapter 接口继续存在。

长期最优的最终结构固定为四条清晰轴：

1. `write`
2. `actions`
3. `session`
4. `read`

以及三类明确的 type 文件：

1. `write/types.ts`
2. `action/types.ts`
3. `session/types.ts`

`types/commands.ts` 整体删除。

一句话概括：

**运行时已经基本收敛，但 type 中轴还没有完全收敛。下一步不是继续改目录名，而是把“混层 type hub”彻底拆掉。**

---

## 2. 当前还剩下的主要问题

### 2.1 `types/commands.ts` 仍然是混层总线

当前 [commands.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/commands.ts) 同时装了：

1. public action contracts
2. write contracts
3. session helper contracts
4. read-looking methods
5. view/runtime helper contracts

这本质上还是旧 `commands` 时代的思路：

- 不同层共用一个大文件
- 通过命名隔离来假装分层

这不是长期最优。

长期最优必须是：

- `write` 类型只描述 write
- `actions` 类型只描述 public actions
- `session` 类型只描述 session mutate/read contract
- `read` 类型留在 `query` / `types/editor.ts`

### 2.2 `MindmapCommands` 仍然混了三种语义

当前 `MindmapCommands` 同时承载：

1. persistent write
2. public action options
3. read-only navigate

典型问题：

- `create(..., { focus })` 里的 `focus` 是 action 语义，不是 write 语义。
- `insert(..., { behavior })` 里的 `behavior.enter` / `behavior.focus` 是 action 语义，不是 write 语义。
- `navigate(...)` 是 read，不是 write，也不是必须存在于 action。

这导致：

- `write.mindmap` 类型上拿到了它不该有的参数
- `actions.mindmap` 又只能继续复用一个本来就不干净的共享 contract

长期最优必须拆成：

1. `MindmapWrite`
2. `MindmapActions`
3. `query.mindmap.navigate`

### 2.3 public `EditorActions` 仍然反向依赖 internal `write`

当前 [editor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/editor.ts) 里：

```ts
type EditorNodeActions = Omit<RuntimeNodeCommands, 'update' | 'updateMany'>
type EditorEdgeActions = Pick<RuntimeEdgeCommands, ...>
```

这说明：

- public surface 不是 first-class contract
- internal write 反过来成了 public type 的上游

这是边界泄漏。

长期最优必须是：

- `EditorActions` 显式定义为 public contract
- public contract 可以在实现层转发到 `write`
- 但 type 层不能继续从 `write` 里裁切

### 2.4 `SessionActions` 是一层为了 helper 存在的 adapter

当前 selection / clipboard helper 仍然吃：

- `SessionActions`

但这些 helper 真正需要的不是一个“会话 action 组”，而是几条非常具体的 callback：

1. `replaceSelection`
2. `clearSelection`
3. `startNodeEdit`
4. `clearEdit`

也就是说：

- `SessionActions` 不是中轴
- 它只是为了对齐 helper 参数而制造出来的一层 adapter

长期最优应该直接让 helper 依赖最小明确 deps，而不是继续保留 `SessionActions`。

### 2.5 仍然有 read 被伪装成 action

当前仍有几类“不是 action 但挂在 action/type 里”的东西：

1. `history.get`
2. `app.export`
3. `mindmap.navigate`

它们的共同问题是：

- 不产生 mutation
- 不产生 session side effect
- 只是 read

长期最优应该移动为：

1. `editor.read.history`
2. `editor.read.document.get`
3. `query.mindmap.navigate`

### 2.6 naming 还保留了旧 `commands` 思维

虽然目录已经迁成 `write/` 与 `action/`，但内部仍然保留了大量旧命名：

1. `createDocumentCommands`
2. `createNodeCommands`
3. `createEdgeCommands`
4. `createHistoryCommands`
5. `SelectionCommands`
6. `ClipboardCommands`

这不只是 cosmetic 问题。

命名本身会决定后续实现如何思考边界：

- 如果继续叫 `commands`，就会自然倾向于把 write/action/read 混回去。
- 如果明确叫 `write` / `actions`，边界会更稳定。

---

## 3. 最终设计原则

长期最优的原则固定为六条。

### 3.1 `write` 只做持久写

允许：

1. `engine.execute(...)`
2. patch 计算
3. layout patch materialization
4. document mutation

禁止：

1. selection side effect
2. edit side effect
3. preview side effect
4. tool side effect
5. focus / behavior / enter animation 之类 UI 语义
6. read-only methods

### 3.2 `actions` 只做 public user semantics

`actions` 负责：

1. 组合 `write`
2. 写 `session`
3. 触发 preview
4. 暴露稳定 public API

### 3.3 `read` 不挂在 `actions`

凡是纯读都不应该继续挂在 action API 里。

这包括：

1. history state
2. document export
3. mindmap navigate

### 3.4 `session` 不通过 `SessionActions` 暴露

内部 helper 如果需要 session 能力，直接吃最小 deps：

1. `replaceSelection`
2. `clearSelection`
3. `startNodeEdit`
4. `startEdgeLabelEdit`
5. `clearEdit`
6. `setPreview`

不要再制造一个新的“命名包裹层”。

### 3.5 public contract 与 internal contract 分开定义

public type 是产品边界。

internal write type 是实现边界。

它们可以相似，但不能继续通过 `Pick/Omit` 强绑定。

### 3.6 不要把 type 拆成一堆微文件

这条轴的目标是中轴化，而不是文件爆炸。

长期最优不是把 `types/commands.ts` 拆成十几个碎文件，而是固定成三份：

1. `write/types.ts`
2. `action/types.ts`
3. `session/types.ts`

再加：

4. `types/editor.ts`

这已经足够。

---

## 4. 最终文件结构

最终建议固定为下面这组文件。

### 4.1 `src/write/*`

```txt
write/
  index.ts
  types.ts
  document.ts
  edge.ts
  history.ts
  mindmap.ts
  node/
    index.ts
    context.ts
    text.ts
```

说明：

1. `write/types.ts` 是 write 内部唯一 type 中轴。
2. `write/index.ts` 只是聚合器，不承担翻译职责。
3. `node/context.ts` 这种实现 helper 可以保留，因为它是实现内聚，不是架构翻译层。

### 4.2 `src/action/*`

```txt
action/
  index.ts
  types.ts
  selection.ts
  clipboard.ts
  edit.ts
  mindmap.ts
  tool.ts
```

说明：

1. `action/types.ts` 是 public action contract 中轴。
2. `action/index.ts` 只做装配，不继续堆全部逻辑。
3. `selection.ts` / `clipboard.ts` / `edit.ts` / `mindmap.ts` 都是 action-domain helper。

### 4.3 `src/session/*`

```txt
session/
  runtime.ts
  types.ts
  interaction.ts
  preview/
```

说明：

1. `session/types.ts` 只暴露 helper 真正需要的最小 session deps。
2. 不再有 `SessionActions` 这种看起来像 action、其实只是 adapter 的命名。

### 4.4 `src/clipboard/*`

```txt
clipboard/
  packet.ts
```

说明：

- 它是纯数据编解码模块，不属于 `write`，也不属于 `actions`。

### 4.5 `src/types/editor.ts`

这里只保留：

1. `Editor`
2. `EditorRead`
3. `EditorStore`
4. `EditorEvents`
5. `EditorInputHost`

如果 `EditorActions` 是 public API，也可以从 `action/types.ts` re-export，但不应再从 `write` 内部类型投影。

### 4.6 删除的文件

明确删除：

1. `types/commands.ts`

它不应该再存在。

---

## 5. 最终 type 设计

### 5.1 `write/types.ts`

最终固定为：

```ts
export type EditorWrite = {
  document: DocumentWrite
  node: NodeWrite
  edge: EdgeWrite
  mindmap: MindmapWrite
  history: HistoryWrite
}

export type DocumentWrite = {
  replace: (document: Document) => CommandResult
  insert: (...)
  delete: (...)
  duplicate: (...)
  order: (...)
  background: {
    set: (...)
  }
  group: {
    merge: (...)
    order: {...}
    ungroup: (...)
    ungroupMany: (...)
  }
}

export type NodeWrite = {
  create: (...)
  patch: (...)
  move: (...)
  align: (...)
  distribute: (...)
  delete: (...)
  deleteCascade: (...)
  duplicate: (...)
  update: (...)
  updateMany: (...)
  lock: {...}
  shape: {...}
  style: {...}
  text: {...}
}

export type EdgeWrite = {
  create: (...)
  patch: (...)
  move: (...)
  reconnect: (...)
  update: (...)
  updateMany: (...)
  delete: (...)
  route: {...}
  label: {...}
  style: {...}
  type: {...}
  lock: {...}
  textMode: {...}
}

export type MindmapWrite = {
  create: (payload?: MindmapCreateInput) => CommandResult<{ ... }>
  delete: (...)
  patch: (...)
  insert: (id: MindmapId, input: MindmapInsertInput) => CommandResult<{ ... }>
  moveSubtree: (...)
  removeSubtree: (...)
  cloneSubtree: (...)
  insertByPlacement: (input: {
    id: NodeId
    tree: MindmapTree
    targetNodeId: MindmapNodeId
    placement: 'left' | 'right' | 'up' | 'down'
    layout: MindmapLayoutSpec
    payload?: MindmapTopicData
  }) => CommandResult<{ nodeId: MindmapNodeId }> | undefined
  moveByDrop: (...)
  moveRoot: (...)
  style: {...}
}

export type HistoryWrite = {
  undo: () => CommandResult
  redo: () => CommandResult
  clear: () => void
}
```

关键点：

1. `MindmapWrite.create` 不再接受 `focus`
2. `MindmapWrite.insert` 不再接受 `behavior`
3. `MindmapWrite.insertByPlacement` 不再接受 `behavior`
4. `HistoryWrite` 不再有 `get`
5. `navigate` 不存在于 `write`

### 5.2 `action/types.ts`

最终固定为：

```ts
export type EditorActions = {
  app: AppActions
  tool: ToolActions
  viewport: ViewportActions
  draw: DrawActions
  selection: SelectionActions
  edit: EditActions
  node: NodeActions
  edge: EdgeActions
  mindmap: MindmapActions
  clipboard: ClipboardActions
  history: HistoryActions
}

export type AppActions = {
  replace: (document: Document) => CommandResult
  configure: (config: AppConfig) => void
}

export type ToolActions = {
  set: (tool: Tool) => void
  select: () => void
  draw: (mode: DrawMode) => void
  edge: (preset: EdgePresetKey) => void
  insert: (preset: InsertPresetKey) => void
  hand: () => void
}

export type SelectionActions = {
  replace: (input: SelectionInput) => void
  add: (input: SelectionInput) => void
  remove: (input: SelectionInput) => void
  toggle: (input: SelectionInput) => void
  selectAll: () => void
  clear: () => void
  duplicate: (...)
  delete: (...)
  order: (...)
  group: (...)
  ungroup: (...)
  frame: (...)
}

export type EditActions = {
  startNode: (...)
  startEdgeLabel: (...)
  input: (text: string) => void
  layout: (...)
  caret: (...)
  cancel: () => void
  commit: () => void
}

export type NodeActions = {
  create: (...)
  patch: (...)
  move: (...)
  align: (...)
  distribute: (...)
  delete: (...)
  duplicate: (...)
  lock: {...}
  shape: {...}
  style: {...}
  text: {...}
}

export type EdgeActions = {
  create: (...)
  patch: (...)
  move: (...)
  reconnect: (...)
  delete: (...)
  route: {...}
  label: {...}
  style: {...}
  type: {...}
  lock: {...}
  textMode: {...}
}

export type MindmapActions = {
  create: (
    payload?: MindmapCreateInput,
    options?: {
      focus?: 'edit-root' | 'select-root' | 'none'
    }
  ) => CommandResult<{ ... }>
  delete: (...)
  patch: (...)
  insert: (
    id: MindmapId,
    input: MindmapInsertInput,
    options?: {
      behavior?: MindmapInsertBehavior
    }
  ) => CommandResult<{ ... }>
  insertByPlacement: (input: {
    id: NodeId
    tree: MindmapTree
    targetNodeId: MindmapNodeId
    placement: 'left' | 'right' | 'up' | 'down'
    layout: MindmapLayoutSpec
    payload?: MindmapTopicData
    behavior?: MindmapInsertBehavior
  }) => CommandResult<{ ... }> | undefined
  moveSubtree: (...)
  removeSubtree: (...)
  cloneSubtree: (...)
  moveByDrop: (...)
  moveRoot: (...)
  style: {...}
}

export type ClipboardActions = {
  copy: (...)
  cut: (...)
  paste: (...)
}

export type HistoryActions = {
  undo: () => CommandResult
  redo: () => CommandResult
  clear: () => void
}
```

关键点：

1. public `NodeActions` / `EdgeActions` 显式声明，不再 `Pick/Omit` internal write。
2. `AppActions` 不再有 `reset`。
3. `AppActions` 不再有 `export`。
4. `HistoryActions` 不再有 `get`。
5. `MindmapActions` 才拥有 `focus` / `behavior`。

### 5.3 `session/types.ts`

最终固定为 helper 需要的最小 deps，而不是造一个假“action 包”：

```ts
export type SelectionSessionDeps = {
  replaceSelection: (input: SelectionInput) => void
  clearSelection: () => void
}

export type EditSessionDeps = {
  startNodeEdit: (nodeId: NodeId, field: EditField, options?: { caret?: EditCaret }) => void
  startEdgeLabelEdit: (edgeId: EdgeId, labelId: string, options?: { caret?: EditCaret }) => void
  clearEdit: () => void
}

export type PreviewSessionDeps = {
  setMindmapPreview: (...)
  clearMindmapPreview: () => void
}
```

关键点：

- helper 直接吃这些最小 deps
- 不再有 `SessionActions`

---

## 6. read 语义的最终归位

下面这些能力不该继续出现在 action type 里。

### 6.1 `history.get`

移动到：

```ts
editor.read.history
```

### 6.2 `app.export`

移动到：

```ts
editor.read.document.get
```

或者：

```ts
editor.read.export()
```

两者选一个。

长期最优我更倾向于：

```ts
editor.read.document.get
```

因为它更像 read，而不是额外再制造一个 façade method。

### 6.3 `mindmap.navigate`

移动到：

```ts
query.mindmap.navigate
```

或者 façade 投影为：

```ts
editor.read.mindmap.navigate
```

长期最优我更倾向于放在 query/read，而不是 actions。

---

## 7. helper 层的最终收口

### 7.1 `createSelectionCommands` -> `createSelectionActions`

它现在本质上是 action helper，不应该继续叫 `Commands`。

### 7.2 `createClipboardCommands` -> `createClipboardActions`

同理，它不是 write，不该继续叫 `Commands`。

### 7.3 `createNodeCommands` -> `createNodeWrite`

`document / node / edge / history` 这些 write 实现都应该改成 `*Write` 命名。

### 7.4 `NodeCommands` / `EdgeCommands` / `DocumentCommands` -> `NodeWrite` / `EdgeWrite` / `DocumentWrite`

这不是 cosmetic，而是防止后续继续把 action 语义塞回 write。

---

## 8. 哪些层可以保留

下面这些不是多余翻译层，可以保留。

### 8.1 `write/index.ts`

它只是聚合器，不是额外翻译层。

### 8.2 `write/node/context.ts`

它是 write 内部实现 helper，不是架构翻译层。

### 8.3 `action/selection.ts` 与 `action/clipboard.ts`

它们作为 action-domain helper 是合理的。

问题不在文件拆分，而在：

1. helper 参数还在吃 `SessionActions`
2. naming 还在叫 `Commands`

---

## 9. 最终实施顺序

为了避免再次出现“目录名已经改了，但 type 轴还没收干净”的情况，实施顺序固定如下。

### 阶段 1：删除 `types/commands.ts`

1. 新建 `write/types.ts`
2. 新建 `action/types.ts`
3. 新建 `session/types.ts`
4. 改所有引用
5. 删除 `types/commands.ts`

阶段结束标准：

- 没有任何 mixed type hub

### 阶段 2：拆 `MindmapCommands`

1. `MindmapWrite` 只保留纯 write
2. `MindmapActions` 拥有 `focus` / `behavior`
3. `navigate` 移到 `query.mindmap.navigate`

阶段结束标准：

- `write.mindmap` 不再拥有 action/read 语义

### 阶段 3：去掉 public 对 internal 的 type 投影

1. 删除 `EditorNodeActions = Omit<RuntimeNodeCommands, ...>`
2. 删除 `EditorEdgeActions = Pick<RuntimeEdgeCommands, ...>`
3. `EditorActions` 直接引用 `action/types.ts`

阶段结束标准：

- public action type 与 internal write type 解耦

### 阶段 4：去掉 `SessionActions` adapter

1. helper 改吃最小 deps
2. 删除 `SessionActions`
3. 删除 `SessionSelectionActions` / `SessionEditActions` / `SessionToolActions`

阶段结束标准：

- helper 不再依赖人为包裹层

### 阶段 5：清理 naming

1. `*Commands` -> `*Write`
2. action helper -> `*Actions`
3. internal naming 与 runtime 架构语义对齐

阶段结束标准：

- 代码中不再残留旧 `commands` 语义

### 阶段 6：收走伪 action read

1. 删除 `history.get`
2. 删除 `app.export`
3. 删除 `app.reset`
4. `mindmap.navigate` 移出 action/write

阶段结束标准：

- action 只剩 action

---

## 10. 最终抉择

如果只保留一句话，最终抉择就是：

**`write` 和 `actions` 两层要保留，但 `commands` 这个概念必须连同 type hub、adapter、public/internal 投影一起彻底消失。**

具体就是：

1. 删除 `types/commands.ts`
2. 拆 `MindmapCommands`
3. 删除 `SessionActions`
4. 删除 public 对 internal `write` 的类型投影
5. 把 read 从 action 里移出去
6. 把所有 `*Commands` 命名收口为 `*Write` 或 `*Actions`

这才是 `write / actions / types` 这条轴上的长期最优终态。

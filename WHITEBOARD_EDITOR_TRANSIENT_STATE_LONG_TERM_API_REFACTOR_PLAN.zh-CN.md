# Whiteboard Editor Transient State 长期最优 API 设计与重构方案

## 1. 范围与结论

本文讨论 `whiteboard/packages/whiteboard-editor` 的 **顶层 Editor 设计** 与 **本地 transient state API** 的长期最优方案。

这里的“长期最优”有两个前提：

- 不考虑兼容成本
- 目标不是做最小改造，而是让顶层 API、职责边界、调用路径长期自洽

结论先给出：

- 顶层 `Editor` 不应推倒重来，而应保留当前已经成立的几条主轴：
  - `scene`
  - `document`
  - `input`
  - `actions`
  - `write`
  - `viewport`
  - `runtime`
- 真正需要重做的是 `state` 这条轴，以及 `actions` 与 transient state 的关系
- document semantic write 继续保留 `write -> engine.execute(intent)` 路线
- transient state 不再保留 `intent system`
- transient state 不再保留 `dispatch`
- transient state 改为 `state.read() / state.write()` 为唯一底层通道
- transient 语义入口不单独上升为新的顶层 `session / hover / preview`，而应并入 `actions.session`，保持当前 `actions` 作为 policy facade 的地位

一句话总结：

**长期最优方案不是把 Editor 改成“document + session + hover + preview”这种全新形态，而是保留现有 `actions/write/input/scene` 的大骨架，把 transient state 从 “command engine” 改成 “local store”，再把 transient policy 收口到 `actions.session`。**

## 2. 当前顶层 Editor 的真实结构

当前顶层 `Editor` 并不是一个杂糅对象，而是已经形成了清晰但尚未彻底收束的分层。

现状可以概括为：

```ts
type Editor = {
  scene: EditorSceneFacade
  document: DocumentFrame
  input: EditorInputHost
  actions: EditorActions
  write: EditorWrite
  state: Pick<EditorStateRuntime, 'snapshot' | 'reader' | 'write' | 'commits'>
  viewport: EditorViewport
  read: () => EditorStateDocument
  runtime: EditorRuntime
  dispatch: (...)
  dispose: () => void
}
```

这个结构本身有相当多合理之处。

### 2.1 `scene`

`scene` 是投影后的可读空间与 UI query facade。

它负责：

- 几何读
- 命中测试
- selection summary
- chrome / background / mindmap UI 读
- scene capture

这条轴线是正确的，不应和 transient write 混在一起。

### 2.2 `document`

`document` 是面向编辑器层的 document read frame。

它负责：

- node / edge / slice 等 document 读
- 作为 actions / input / projection 的读依赖

这条轴线也正确，不应被 transient state facade 替代。

### 2.3 `input`

`input` 是输入宿主与交互 runtime。

它负责：

- pointer / wheel / keyboard / blur
- context menu intent
- 当前交互 session 驱动

这条轴线本质是 runtime host，不应承载 editor state API 语义。

### 2.4 `write`

`write` 是 document semantic write facade。

它负责：

- `document`
- `canvas`
- `node`
- `group`
- `edge`
- `mindmap`
- `history`

这些入口最终落到 `engine.execute(intent)`。

它的本质不是通用 mutation writer，而是 **document semantic write 层**。

### 2.5 `actions`

`actions` 是 policy facade。

这一点非常关键。

当前 `actions` 不只是 `write` 的别名，而是在做：

- tool 切换 policy
- selection policy
- edit 流程
- clipboard policy
- mindmap 交互组合
- viewport UX 封装
- draw 配置封装

也就是说，`actions` 已经天然承担了“顶层编辑器语义 API”的角色。

这是现有设计里最值得保留的一层。

### 2.6 `state`

`state` 当前暴露的是：

- `snapshot`
- `reader`
- `write`
- `commits`

它已经隐约是 local state store，但内部仍然使用：

- `EditorStateIntent`
- `dispatch`
- `applyCommand`
- `compileHandlers`

这就是当前最不自洽的点。

### 2.7 `dispatch`

`dispatch` 是当前 transient state command API。

但它与 `state.write` 并存，已经构成双轨：

- 一部分调用走 `dispatch`
- 一部分高频逻辑直接走 `state.write`

这说明 `dispatch` 已经不是必要骨架，而是在延续旧模型。

## 3. 当前系统真正成立的边界

在重写 API 设计之前，必须先承认当前系统里已经成立的边界。

### 3.1 `actions` 与 `write` 的关系

当前最有价值的结构不是 `dispatch`，而是：

- `actions` 负责 policy / orchestration
- `write` 负责 document semantic write

这两个层次不应被打散。

长期最优方案必须保留：

- `write` 是稳定的底层 document write
- `actions` 是稳定的上层用户语义 API

### 3.2 `scene` 与 `document` 是读轴，不是写轴

当前 `scene` / `document` 主要承担读职责。

长期最优方案中，不应把 transient state API 改造成和它们平级的新“读写混合大对象”。

### 3.3 `input` 是 host，不是业务 facade

输入 runtime 可以读 scene / state / actions，但不应成为 transient API 的长期宿主。

### 3.4 transient state 只应影响本地投影与交互

transient state 的影响范围应严格限定在：

- 编辑器会话状态
- 交互状态
- hover / guide
- preview draft
- scene projection / UI rendering

它不应再伪装成 document command pipeline。

## 4. 问题诊断：当前 transient state 为什么不是长期最优

### 4.1 它在模仿 engine，但没有 engine 的语义收益

document engine 之所以需要：

- intent
- compile
- writer

是因为它要处理：

- semantic write
- layout
- lock
- history
- collab
- replay

而 transient state 并不需要这些。

它当前的 intent 多数只是：

- `tool.set`
- `selection.set`
- `edit.set`
- `hover.set`
- `preview.reset`

这些本质只是 local state mutation。

### 4.2 同一状态变化被描述了三次

当前 transient state 同时由以下三层描述：

1. `EditorStateIntent`
2. `applyCommand`
3. `compileHandlers`

这是典型的过度建模。

### 4.3 代码已经说明 writer 才是实际主路径

高频逻辑，尤其是 input / transform / hover / sync，已经大量直接使用：

- `state.write(({ writer, snapshot }) => ...)`

这说明系统已经自然偏向 store writer 模型，只是 API 设计还没承认这件事。

### 4.4 顶层 API 发生了错位

现在最不合理的不是 transient state 本身，而是顶层语义入口被拆成：

- `actions.*`
- `dispatch(...)`
- `state.write(...)`

调用方需要自己判断：

- 这是一个 action 吗
- 这是一个 transient command 吗
- 还是直接写 state

长期来看，这会持续放大认知成本。

## 5. 长期最优的顶层 Editor 设计

长期最优设计应保留现有大骨架，但重新定义每条轴线的职责。

目标形态如下：

```ts
type Editor = {
  scene: EditorSceneFacade
  document: DocumentFrame
  input: EditorInputHost
  actions: EditorActions
  write: EditorWrite
  state: EditorStateStoreFacade
  viewport: EditorViewport
  runtime: EditorRuntime
  dispose: () => void
}
```

关键变化只有两点：

- 删除 `dispatch`
- 删除 `read: () => EditorStateDocument`

并把它们的职责吸收到新的 `state` 中。

### 5.1 为什么不推翻 `actions`

因为 `actions` 已经是当前系统最接近“最终用户语义 API”的层。

长期最优方案不应该削弱 `actions`，而应该强化它：

- 它继续做顶层语义 facade
- 它负责 orchestration 与 policy
- 它既能驱动 document write，也能驱动 transient state write

### 5.2 为什么不把 `session / hover / preview` 升成顶层字段

从局部看，这样似乎更直接。

但从现有架构看，这会带来新问题：

- 顶层 API 过度膨胀
- `actions` 的 policy facade 角色被削弱
- 用户很难理解什么时候调用 `actions.tool.set`，什么时候调用 `editor.session.tool.set`
- input / UI / product policy 会被分散到多个平级对象

因此长期最优做法不是新增平级顶层字段，而是：

- `actions` 继续做语义 facade
- `state` 提供统一 local store
- `actions.session` 成为 transient 语义入口

## 6. 顶层 API 的长期最优职责划分

### 6.1 `write`

`write` 的职责固定为：

- document semantic write
- 无 transient local state policy
- 尽量薄、稳定、可复用

也就是说：

- `write.node.move(...)`
- `write.group.merge(...)`
- `write.edge.route.set(...)`

这些继续存在，继续只做 document semantic write。

### 6.2 `actions`

`actions` 的职责固定为：

- 面向 UI / 产品层的语义 API
- orchestration
- UX policy
- 组合本地 state 与 document write

长期最优下，`actions` 应显式分成两类：

- document-oriented actions
- session-oriented actions

但都保持在 `actions` 名下。

### 6.3 `state`

`state` 的职责固定为：

- editor local state store
- transient state 的唯一真实底层写模型
- 供 scene / input / actions / react 订阅

### 6.4 `viewport`

`viewport` 保持独立是合理的。

它有自己的状态机、坐标换算与 value store，不必强行吞进 transient state store。

长期最优也仍然保留：

- `editor.viewport`
- `actions.viewport`

前者是低层 runtime/geometry 能力，后者是高层 UX facade。

## 7. `state` 的长期最优 API

### 7.1 目标形态

长期最优下，`state` 不再是 mutation runtime 的局部投影，而是显式的 local state store facade：

```ts
interface EditorStateStoreFacade {
  read(): EditorStateSnapshot
  write(
    run: (ctx: {
      writer: EditorStateWriter
      snapshot: EditorStateSnapshot
    }) => void
  ): void
  subscribe(listener: (commit: EditorStateCommit) => void): () => void
  stores: EditorStateStores
}
```

说明：

- `read()` 取代当前的 `editor.read()`
- `write()` 保留并成为唯一底层写入口
- `subscribe()` 取代零散的 `commits.subscribe`
- `stores` 保留面向 scene/react 的细粒度订阅值

### 7.2 为什么保留 `stores`

当前 scene-ui 已经建立了稳定的 store 读取模式。

长期最优方案不应迫使：

- scene projection
- react hooks
- ui chrome

全部退化到订阅整份 snapshot。

因此 `state` 长期最优应显式提供：

- 统一 store facade
- 细粒度 read stores

例如：

```ts
interface EditorStateStores {
  tool: ReadStore<Tool>
  draw: ReadStore<DrawState>
  selection: ReadStore<SelectionTarget>
  edit: ReadStore<EditSession | null>
  interaction: ReadStore<EditorInteractionStateValue>
  preview: ReadStore<PreviewInput>
  hover: ReadStore<EditorHoverState>
}
```

当前把 hover 混在 `interaction` 聚合里并不长期最优，应该显式拉平。

## 8. `EditorStateWriter` 的长期最优设计

### 8.1 基本原则

`EditorStateWriter` 应成为 transient state 唯一真实写模型。

原则：

- 只描述一次状态变化
- 不向业务层暴露 schema patch 细节
- 支持高频写
- 支持事务式批量写

### 8.2 目标接口

```ts
interface EditorStateWriter {
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
      replace(next: PreviewInput['node']): void
      clear(): void
    }
    edge: {
      replace(next: PreviewInput['edge']): void
      clear(): void
    }
    mindmap: {
      replace(next: PreviewInput['mindmap']): void
      clear(): void
    }
    selection: {
      set(next: PreviewInput['selection']): void
      clear(): void
    }
    draw: {
      set(next: PreviewInput['draw']): void
      clear(): void
    }
    edgeGuide: {
      set(value: PreviewInput['edgeGuide'] | undefined): void
      clear(): void
    }
    reset(): void
  }
}
```

### 8.3 为什么 writer 仍然是分域的

不建议把 writer 暴露成一组裸 `patch(...)` 原语。

原因：

- 会把 state schema 细节泄漏到输入层和 action 层
- 预览态的 diff 会散落
- reset / clear 语义会重复实现

长期最优 writer 应当是：

- 低层
- 但仍按 editor state 领域分域

## 9. `actions` 的长期最优重组

### 9.1 现有 `actions` 的价值

当前 `actions` 已经体现出一个重要事实：

- 用户不该直接思考 mutation
- 用户需要的是带 policy 的编辑器语义

例如：

- `tool.set`
- `selection.group`
- `edit.commit`
- `clipboard.paste`

这条路是对的。

### 9.2 长期最优方向

长期最优不是缩小 `actions`，而是让它更明确地区分：

- document actions
- session actions

建议目标形态：

```ts
type EditorActions = {
  app: AppActions
  viewport: ViewportActions

  session: {
    tool: ToolSessionActions
    draw: DrawSessionActions
    selection: SelectionSessionActions
    edit: EditSessionActions
    hover: HoverSessionActions
    preview: PreviewSessionActions
  }

  document: {
    node: NodeActions
    edge: EdgeActions
    mindmap: MindmapActions
    clipboard: ClipboardActions
    history: HistoryActions
  }
}
```

这比当前把 `tool/draw/selection/edit/node/edge/...` 全平铺更长期最优。

原因：

- 把 transient 与 document 语义边界直接反映到 API 上
- 保留 `actions` 作为唯一 policy facade
- 消除 `actions` 与未来潜在 `session.*` 顶层 API 的竞争

### 9.3 `actions.session`

`actions.session` 负责所有 transient 语义。

示例：

```ts
actions.session.tool.set(tool)
actions.session.selection.replace(selection)
actions.session.edit.startNode(nodeId, 'text')
actions.session.hover.clear()
actions.session.preview.reset()
```

这些方法全部以 `state.write()` 为底层。

### 9.4 `actions.document`

`actions.document` 负责所有面向持久文档的用户语义。

示例：

```ts
actions.document.node.create(...)
actions.document.edge.create(...)
actions.document.mindmap.insert(...)
actions.document.clipboard.paste(...)
actions.document.history.undo()
```

这些方法内部可以继续调用：

- `write.*`
- `state.*`
- `scene.*`
- `document.*`

但最终 boundary 清晰。

### 9.5 为什么 clipboard/history 更适合放进 document

从实现看：

- `clipboard` 的核心作用对象是 document slice
- `history` 的核心对象是 engine history

它们虽然有本地 policy，但其主语义仍是 document 侧。

## 10. `write` 的长期最优设计

`write` 的长期最优目标不是更高层，而是更纯粹。

建议长期固定为：

```ts
type EditorWrite = {
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

- 不再掺杂 transient state 语义
- 不再承担 UI policy
- 只做 document semantic write facade
- 继续作为 `actions.document.*` 的底层依赖

## 11. `input` 的长期最优依赖关系

长期最优下，`input` 不应再直接依赖 `dispatch`。

应改为依赖：

- `actions.session.*`
- `state.write(...)`

其中：

- 简单 policy 通过 `actions.session`
- 高频草稿更新直接通过 `state.write`

例如：

- pointer hover 更新 edge guide：`state.write`
- pointer down 导致 selection policy：`actions.session.selection`
- text edit start / commit：`actions.session.edit`

这样调用选择规则非常清晰：

- 有用户语义与 policy，用 `actions`
- 只是交互帧级草稿 patch，用 `state.write`

## 12. `scene` 与 `state` 的关系

长期最优下，scene projection 继续订阅：

- document commits
- state commits

但 state commit 来源不再是 intent engine，而是 local state store。

这意味着：

- scene 同步机制保留
- scene update buffer 策略保留
- editor state delta 仍可存在
- 但 delta 不再有 command compile 的历史包袱

## 13. transient state 的内部 store 划分

### 13.1 顶层 API 不拆，内部 store 可拆

长期最优下，**顶层 `editor.state` 仍保持一个统一 facade**。

但内部实现建议拆成三类 store：

1. `session store`
2. `hover store`
3. `preview store`

这样兼顾：

- 顶层 API 简洁
- 内部生命周期与性能优化独立

### 13.2 session store

包含：

- tool
- draw
- selection
- edit
- interaction

### 13.3 hover store

包含：

- hover
- edgeGuide

### 13.4 preview store

包含：

- preview.node
- preview.edge
- preview.mindmap
- preview.selection
- preview.draw

### 13.5 为什么 tool/draw 归到 session

这是因为从现有顶层语义看：

- tool / draw 更接近编辑器会话配置
- 它们和 selection / edit 一样，属于稳定 session state

而不是 preview 或 hover。

## 14. 长期最优的目录结构

建议目标目录结构如下：

```text
whiteboard/packages/whiteboard-editor/src
  ├─ api/
  │   └─ editor.ts
  ├─ actions/
  │   ├─ session/
  │   │   ├─ tool.ts
  │   │   ├─ draw.ts
  │   │   ├─ selection.ts
  │   │   ├─ edit.ts
  │   │   ├─ hover.ts
  │   │   └─ preview.ts
  │   ├─ document/
  │   │   ├─ node.ts
  │   │   ├─ edge.ts
  │   │   ├─ mindmap.ts
  │   │   ├─ clipboard.ts
  │   │   └─ history.ts
  │   ├─ viewport.ts
  │   ├─ app.ts
  │   ├─ index.ts
  │   └─ types.ts
  ├─ state/
  │   ├─ store/
  │   │   ├─ facade.ts
  │   │   ├─ writer.ts
  │   │   ├─ commit.ts
  │   │   ├─ session.ts
  │   │   ├─ hover.ts
  │   │   └─ preview.ts
  │   └─ index.ts
  ├─ write/
  │   └─ ...
  ├─ input/
  │   └─ ...
  └─ editor/
      ├─ create.ts
      └─ sync.ts
```

明确删除：

- `state/intents.ts`
- transient `dispatch`
- transient `applyCommand`
- transient `compileHandlers`

## 15. 对外 API 示例

### 15.1 顶层 Editor

```ts
interface Editor {
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

### 15.2 state API

```ts
editor.state.read()

editor.state.write(({ writer, snapshot }) => {
  writer.hover.clear()
  writer.preview.reset()
  writer.selection.clear()
})
```

### 15.3 actions.session API

```ts
editor.actions.session.tool.set({ type: 'select' })
editor.actions.session.selection.clear()
editor.actions.session.edit.startNode(nodeId, 'text')
editor.actions.session.preview.reset()
```

### 15.4 actions.document API

```ts
editor.actions.document.node.create({
  position,
  template
})

editor.actions.document.history.undo()
editor.actions.document.clipboard.paste(packet)
```

### 15.5 write API

```ts
editor.write.node.move({
  ids,
  delta
})

editor.write.group.merge({
  nodeIds,
  edgeIds
})
```

## 16. 重构顺序

### Phase 1: 固化顶层边界

目标：

- 明确 `actions` 是 policy facade
- 明确 `write` 是 document semantic write
- 明确 `state` 是 local store

动作：

- 在类型层冻结 `write` 的职责
- 停止给 transient state 新增 `dispatch` 调用点

### Phase 2: 新建 `EditorStateWriter`

目标：

- 把 transient state 的真实变更逻辑统一收口到 writer

动作：

- 增加 `tool/draw/selection/edit/interaction/hover/preview` writer 域
- 把 preview diff 内聚到 writer 内部

### Phase 3: 用 `state.read()` 替换 `editor.read()`

目标：

- 收缩 state 入口

动作：

- 移除 `editor.read`
- 统一改用 `editor.state.read()`

### Phase 4: 用 `actions.session.*` 替换 `dispatch`

目标：

- 彻底收口 transient 语义 API

动作：

- 新增 `actions.session`
- 迁移 `tool/draw/selection/edit` 等逻辑
- 输入层与 actions 层停止直接构造 transient command

### Phase 5: 删除 transient intent runtime

目标：

- 去掉重复状态描述

动作：

- 删除 `EditorStateIntent`
- 删除 `EditorDispatchInput`
- 删除 `applyCommand`
- 删除 `compileHandlers`

### Phase 6: 内部拆分 stores

目标：

- 达到生命周期级最优实现

动作：

- 将 unified local store 拆为 session / hover / preview stores
- 顶层 `state` facade 保持不变

## 17. 最终判断

基于当前 `Editor` 顶层设计，长期最优方案不是：

- 新造一组平行于 `actions` 的 `session/hover/preview` 顶层 API
- 也不是把所有 transient 更新都变成裸 `writer.patch(...)`

而是：

- 保留当前 `scene/document/input/actions/write/viewport/runtime` 顶层骨架
- 强化 `actions` 作为唯一 policy facade 的地位
- 让 `write` 只做 document semantic write
- 让 `state` 成为统一 local transient store
- 把 transient 语义 API 收口到 `actions.session`
- 把 transient 底层写入统一收口到 `state.write(writer)`
- 删除 `dispatch` 与整套 transient intent runtime

最终边界应稳定为：

- document semantic path: `actions.document.* -> write.* -> engine.execute(intent)`
- transient local path: `actions.session.* -> state.write(writer)`
- frame-level draft path: `input / runtime -> state.write(writer)`

这才是既贴合当前系统、又足够长期自洽的最优方案。

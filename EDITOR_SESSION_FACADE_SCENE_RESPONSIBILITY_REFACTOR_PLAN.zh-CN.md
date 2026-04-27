# whiteboard-editor：Authority State / Derived Model / Scene 边界重构最终方案

## 1. 结论

当前 `whiteboard-editor` 的核心问题不是功能缺失，而是 **public API 名称、对象形态、实际职责三者错位**。

现状里已经存在一套职责清晰的内部 runtime：

- `session/runtime.ts` 是真实的 authority session runtime
- `scene/source.ts` 是 scene runtime 的 source binding
- `scene/view.ts` 是 scene runtime 的 public wrapper

但最终对外暴露的 `Editor` 仍然把一个混合派生读模型对象命名成 `session`：

```ts
export type Editor = {
  document: DocumentQuery
  scene: EditorSceneSource
  session: EditorSessionSource
  write: EditorWrite
  input: EditorInputHost
  events: EditorEvents
  dispose: () => void
}
```

这里最大的问题不是“少了一个 facade 层”，而是：

- authority state 和 derived read model 被混成了一个 public 概念
- `session` 这个名字被派生读模型占用了
- `facades` 继续作为最终 public 形态，也只是把错位重新打包一次

因此长期最优方向不是：

- `session + facades`

而是：

- **内部保留真实 runtime**
- **对外暴露稳定只读 state**
- **对外暴露派生 derived model**
- **对外暴露 commands / input / events**

最终 public API 应收口为：

```ts
editor = {
  document,
  scene,
  state,
  derived,
  history,
  input,
  write,
  events,
  dispose
}
```

其中：

- `state` = authority state 的只读 public 面
- `derived` = 基于 `state + scene + defaults + nodeType + history` 的语义派生模型
- `history` = 独立语义，不属于 panel，也不属于 session
- `input` = DOM / pointer / keyboard 输入编排入口

这比 `session + facades` 更稳定，也更符合现有代码已经形成的依赖拓扑。

---

## 2. 对现状的最终判断

## 2.1 `session/runtime.ts` 是真的 session

这层职责是对的，而且应该继续保留为唯一 authority session runtime。

它当前负责：

- `state`
- `mutate`
- `viewport`
- `interaction.read/write`
- `preview.state/write`
- `resetDocument`
- `resetInteraction`
- `reset`

这说明真实 session 内核已经成立，不需要再发明一个新的 session 概念。

### 但它不应该直接成为 public `Editor.session`

长期稳定的 public API 不应直接暴露真实 `EditorSession`，原因有三点：

- 它包含 `mutate`
- 它包含 `interaction.write`
- 它包含 `preview.write`

这些都属于内部 runtime 写通道，而不是外部调用者应长期依赖的稳定读边界。

换句话说：

- `EditorSession` 应继续存在
- 但它应是 **createEditor 内部装配使用的 runtime**
- 不应再被原样挂到 `Editor` public object 上

---

## 2.2 `editor/source/session.ts` 不是 session

这个文件当前混合了：

- session state read
- selection members / summary / affordance
- node scope / edge scope
- selection toolbar policy
- selection overlay policy
- edge chrome
- mindmap chrome
- history
- viewport read 包装

它依赖：

- `graph.query`
- `graph.stores`
- `history`
- `nodeType`
- `defaults`

这已经明显超出 session 的 authority 范围。

它的本质不是 session，也不是 source，而是：

- **editor derived model composition**

因此这里的问题不只是改名为 facade，而是要承认：

- 它不是 authority state
- 它也不只是 UI facade
- 它是 interaction 和 UI 共用的语义派生读模型层

这层更适合叫：

- `derived`
- 或 `semantic read model`

不建议继续沿用 `session source`，也不建议最终 public 概念叫 `facades`。

---

## 2.3 `editor/source/selection.ts` 是策略与派生规则，不是 source

这个文件当前负责：

- selection toolbar 决策
- selection overlay 决策
- node scope / edge scope 读取
- style uniform value 归一化

它本质上是：

- selection derived policy
- selection presentation policy
- interaction / UI 共享决策规则

因此它应归到：

- `editor/derived/selection-policy.ts`

而不是 `editor/source/selection.ts`。

---

## 2.4 `scene/source.ts` 的职责基本正确，但命名不准

这层本质是：

- 从 `engine + session + preview + interaction + viewport` 组装 scene source snapshot
- 订阅 engine/session 变化
- 通知 scene runtime 更新

它不是 editor facade，而是：

- **scene binding**
- **scene source adapter**

所以长期命名应改为：

- `scene/binding.ts`

---

## 2.5 `scene/view.ts` 的职责也基本正确，但 `view` 太泛

它当前负责：

- 暴露 `runtime.query`
- 暴露 `runtime.revision`
- 暴露 `runtime.stores`
- 提供 `host.pick`
- 提供 `host.visible`

这层更像：

- scene public API
- scene runtime wrapper

因此可选命名有两个：

- `scene/api.ts`
- `scene/facade.ts`

如果目标是减少“facade”这个词的泛滥，建议最终采用：

- `scene/api.ts`

---

## 2.6 当前真正的问题不是“缺 facade”，而是 public API 边界不稳定

现在 public `Editor` 的别扭点有两个：

### 第一层错位

`session` 这个名字实际挂的是派生读模型，而不是真实 session。

### 第二层错位

`session` 这个对象内部既有 authority read，又有 interaction summary，又有 toolbar / chrome / history / mindmap chrome。

这意味着当前 public API 按“对象分组”看似整洁，按“职责边界”其实是错位的。

因此长期最优不是把它改成：

```ts
editor = {
  session,
  facades
}
```

而是直接改成：

```ts
editor = {
  state,
  derived
}
```

这样 authority 与 derived 从根上分开。

---

## 3. 最终职责边界

## 3.1 内部 `session`

内部 `session` 继续作为 runtime 存在，但不再作为 public `Editor.session` 暴露。

最终内部形态保持：

```ts
session = {
  state,
  mutate,
  interaction,
  viewport,
  preview,
  resetDocument,
  resetInteraction,
  reset
}
```

### 它负责

- authority session state
- authority state mutate
- interaction runtime
- preview runtime
- viewport runtime

### 它不负责

- selection toolbar
- selection overlay
- history read model
- edge chrome read model
- mindmap chrome read model
- panel 聚合

---

## 3.2 public `state`

对外不再暴露真实 `session`，而是暴露一个稳定只读 `state` 面。

```ts
state = {
  tool,
  draw,
  edit,
  selection,
  interaction,
  viewport
}
```

### 语义

`state` 是 public authority read surface。

它的特点是：

- 只读
- 稳定
- 不暴露内部 mutate/write 通道
- 可以被 UI、外部 runtime、服务层安全消费

### `state` 的各字段

#### `tool`

- `ToolRead`
- 保留 `get / subscribe / type / value / is`

#### `draw`

- `ReadStore<DrawState>`

#### `edit`

- `ReadStore<EditSession>`

#### `selection`

- `ReadStore<SelectionTarget>`

#### `interaction`

- `ReadStore<EditorInteractionState>`

注意这里是经过语义整理后的 interaction state，而不是内部 `interaction.read/write` 原样暴露。

#### `viewport`

- public viewport read API
- 包含 `get / subscribe / pointer / worldToScreen / worldRect / screenPoint / size`
- 同时保留常用派生 `zoom / center`

---

## 3.3 public `derived`

`derived` 是基于 authority state 和 scene query 计算出的语义派生模型。

它的输入可以来自：

- `state`
- scene query
- scene stores
- `history`
- `defaults`
- `nodeType`

它的输出既服务 UI，也服务 interaction 决策。

因此 `derived` 不应被命名为 `facades`，因为：

- 它不只是 UI facade
- 它也被 interaction binding 使用
- 它本质是语义派生层

最终结构：

```ts
derived = {
  selection,
  chrome,
  mindmap
}
```

### 为什么没有 `tool`

`tool` 本质上是 authority state 的只读包装，应归入 `state.tool`，不需要再单独做一个 `derived.tool`。

### 为什么没有 `panel`

`panel` 不是稳定领域边界，只是当前 UI 的局部聚合方式。

以下内容不应继续被绑成一个固定 `panel` 命名空间：

- `selectionToolbar`
- `history`
- `draw`

因为它们分别属于：

- `derived.selection.toolbar`
- `history`
- `state.draw`

---

## 3.4 `derived.selection`

`derived.selection` 是最核心的一层派生模型。

最终形态：

```ts
derived.selection = {
  members,
  summary,
  affordance,
  view,
  toolbar,
  node: {
    selected,
    stats,
    scope
  },
  edge: {
    chrome
  }
}
```

### 职责

- selection 成员读取
- selection 统计
- selection affordance
- selection transform / move / overlay 所需信息
- toolbar scope 与 toolbar context
- selected edge chrome

### 原则

- 它不是 authority state
- 它也不只是 presentation
- 它是 **interaction + UI 共用的 selection semantic model**

这点非常关键，因为当前 input bindings 已经直接依赖 `selection.summary` / `selection.affordance`。

---

## 3.5 `derived.chrome`

```ts
derived.chrome = {
  marquee,
  draw,
  edgeGuide,
  snap,
  selection
}
```

### 职责

- 汇总 editor 可视 chrome
- 给 overlay 层直接消费

### 原则

- `chrome` 是 derived，不是 session
- 它依赖 scene graph chrome store 和 interaction state
- 它是 UI 消费层，不是 authority state

---

## 3.6 `derived.mindmap`

```ts
derived.mindmap = {
  chrome: {
    get(mindmapId),
    subscribe(mindmapId)
  }
}
```

如果未来还出现：

- mindmap toolbar state
- mindmap insertion hints
- subtree focus derived state

都继续放在 `derived.mindmap` 下扩展，而不是重新发明新的顶层命名空间。

---

## 3.7 public `history`

`history` 应独立成为 editor 的一级 public 能力：

```ts
history: HistoryPort<IntentResult>
```

### 原因

- 它不是 panel
- 它不是 session
- 它和 `write.history` 是天然对称的一组能力

把它藏在 `panel` 里，只会让边界继续 UI 化。

---

## 3.8 public `scene`

`scene` 只负责 scene runtime 的 query 能力与 host-level 运行时能力。

```ts
scene = {
  revision,
  query,
  stores,
  host: {
    pick,
    visible
  }
}
```

### 原则

`scene` 不包含：

- toolbar
- selection overlay
- history
- draw read model
- tool read model

这些都不属于 projection runtime 本身。

---

## 3.9 public `input`

长期建议继续保留 `input` 这个名字，不改成 `interactions`。

```ts
input = {
  pointerDown,
  pointerMove,
  pointerUp,
  pointerCancel,
  pointerLeave,
  wheel,
  keyDown,
  keyUp,
  blur,
  cancel,
  contextMenu,
  pointerMode
}
```

### 原因

- 这层本质上就是外部输入入口
- 它主要被 DOM / pointer / keyboard bridge 消费
- `input` 比 `interactions` 更直接、更贴近调用语义

内部可以继续有 interaction runtime，但 public object 保持 `input` 更稳定。

---

## 4. 最终 public API

最终 `Editor` 应定义为：

```ts
export type EditorState = {
  tool: ToolRead
  draw: store.ReadStore<DrawState>
  edit: store.ReadStore<EditSession>
  selection: store.ReadStore<SelectionTarget>
  interaction: store.ReadStore<EditorInteractionState>
  viewport: SessionViewportRead & {
    value: store.ReadStore<Viewport>
    zoom: store.ReadStore<number>
    center: store.ReadStore<Point>
  }
}

export type EditorDerived = {
  selection: {
    members: store.ReadStore<SelectionMembers>
    summary: store.ReadStore<SelectionSummary>
    affordance: store.ReadStore<SelectionAffordance>
    view: store.ReadStore<EditorSelectionView>
    toolbar: store.ReadStore<SelectionToolbarContext | undefined>
    node: EditorSelectionNodeRead
    edge: {
      chrome: store.ReadStore<SelectedEdgeChrome | undefined>
    }
  }
  chrome: EditorChromeSource
  mindmap: {
    chrome: store.KeyedReadStore<MindmapId, MindmapChrome | undefined>
  }
}

export type Editor = {
  document: DocumentQuery
  scene: EditorSceneApi
  state: EditorState
  derived: EditorDerived
  history: HistoryPort<IntentResult>
  input: EditorInputHost
  write: EditorWrite
  events: EditorEvents
  dispose: () => void
}
```

---

## 5. `document` 与 `scene.query.document` 的关系

现有实现里：

- `document = scene.query.document`

这是事实，但不代表 public API 需要继续强调两套同等地位的 document 入口。

最终原则：

- `editor.document` 是 public canonical document query surface
- `scene.query.document` 是 scene runtime 内部既有结构的一部分
- 外部调用方以 `editor.document` 为准

这样可以避免“document 到底属于 scene 还是 editor”的概念重复继续扩散。

---

## 6. 目录最终形态

建议目录收口为：

```txt
src/
  editor/
    createEditor.ts
    events.ts
    state/
      index.ts
      tool.ts
      interaction.ts
      viewport.ts
    derived/
      index.ts
      selection.ts
      chrome.ts
      mindmap.ts
      selection-policy.ts
  scene/
    binding.ts
    api.ts
  session/
    runtime.ts
    selection/
    edit/
    draw/
    viewport/
    interaction/
    preview/
```

### 对应关系

当前：

- `editor/source/session.ts`
- `editor/source/selection.ts`

最终：

- `editor/derived/index.ts`
- `editor/derived/selection.ts`
- `editor/derived/chrome.ts`
- `editor/derived/mindmap.ts`
- `editor/derived/selection-policy.ts`
- `editor/state/index.ts`

当前：

- `scene/source.ts`
- `scene/view.ts`

最终：

- `scene/binding.ts`
- `scene/api.ts`

---

## 7. `createEditor` 的最终装配顺序

最终 `createEditor` 应按下面顺序装配：

## Step 1

创建内部 authority runtimes：

- `session`
- `textLayout`
- `sceneBinding`
- `sceneRuntime`
- `sceneApi`

## Step 2

创建 write 与输入运行时：

- `writeRuntime`
- `toolService`
- `boundary`
- `actions`
- `inputHost`
- `inputApi`

## Step 3

创建 public 只读面：

- `state`
- `derived`
- `history`

## Step 4

组装最终 `Editor`：

```ts
return {
  document,
  scene,
  state,
  derived,
  history,
  input,
  write,
  events,
  dispose
}
```

### 关键原则

不要再在最后一步把 `sessionSource` 挂成 `session`。

如果内部仍需要一个兼容适配层，也应只存在于迁移阶段，而不是作为长期 public 形态。

---

## 8. 实施原则

## 8.1 不再让 derived model 伪装成 session

只要一个对象依赖了：

- scene query
- scene stores
- history
- defaults
- nodeType
- chrome projection

它就不是 session。

---

## 8.2 不再让 UI 聚合命名主导 public API

`panel`、`toolbar`、`dock`、`overlay` 这些词可以存在于 UI 层，但不应该主导 editor 顶层 public 边界。

editor 的顶层边界应是：

- authority state
- derived model
- commands
- input
- events

而不是某个具体界面布局。

---

## 8.3 不直接公开内部写通道

public `Editor` 不应暴露：

- `session.mutate`
- `session.preview.write`
- `session.interaction.write`

外部写入口统一经由：

- `write`
- `input`

这样 command path 和 input path 才是稳定边界。

---

## 8.4 `derived` 不等于“只给 UI 用”

这是本轮最重要的概念修正之一。

当前 selection interaction、transform interaction 已经直接依赖派生模型中的：

- `summary`
- `affordance`
- `transformPlan`

因此这层应被定义为：

- **semantic derived model**

而不是狭义的 UI facade。

---

## 9. 推荐迁移顺序

## Phase 1：先改名，纠正目录语义

- `scene/source.ts` -> `scene/binding.ts`
- `scene/view.ts` -> `scene/api.ts`
- `editor/source/session.ts` -> `editor/derived/index.ts`
- `editor/source/selection.ts` -> `editor/derived/selection-policy.ts`

完成标准：

- 目录名与文件名不再误导职责
- 不再出现“session source 实际是 derived model”的命名债务

---

## Phase 2：拆分 `editor/source/session.ts`

按职责拆成：

- `editor/state/index.ts`
- `editor/derived/selection.ts`
- `editor/derived/chrome.ts`
- `editor/derived/mindmap.ts`

完成标准：

- 不再有一个大而杂的 `session source` 聚合文件
- authority read 与 derived read 在实现层已经分开

---

## Phase 3：引入新的 public shape，但保留兼容层

新增：

- `editor.state`
- `editor.derived`
- `editor.history`

保留兼容：

- `editor.session` 作为 deprecated adapter

adapter 只用于迁移，不再继续扩展新能力。

完成标准：

- 新代码默认只读 `state` / `derived`
- 旧代码暂时还能跑

---

## Phase 4：迁移消费方

按下面规则迁移：

- `editor.session.tool` -> `editor.state.tool`
- `editor.session.draw` -> `editor.state.draw`
- `editor.session.edit` -> `editor.state.edit`
- `editor.session.selection` -> `editor.state.selection` 或 `editor.derived.selection`
- `editor.session.interaction` -> `editor.state.interaction`
- `editor.session.viewport` -> `editor.state.viewport`
- `editor.session.chrome` -> `editor.derived.chrome`
- `editor.session.panel.selectionToolbar` -> `editor.derived.selection.toolbar`
- `editor.session.history` -> `editor.history`
- `editor.session.mindmap.chrome` -> `editor.derived.mindmap.chrome`

完成标准：

- React hooks
- input bindings
- overlay components
- toolbar components
- tests

都不再依赖 `editor.session` 这个混合概念。

---

## Phase 5：删除兼容层

删除：

- `EditorSessionSource`
- `createEditorSessionSource`
- `Editor.session` public 字段

完成标准：

- public API 中 authority state 与 derived model 完全分离
- `session` 重新回到内部 runtime 语义

---

## 10. 最终判断

这次重构的长期目标不应是：

- `session = 真实 runtime`
- `facades = 派生读模型`

因为这样虽然比现状更好，但仍然会留下两个问题：

- `session` 作为 public 字段会暴露内部写通道
- `facades` 这个词仍然过于宽泛，且掩盖 interaction 对派生模型的依赖

真正更稳的终态应是：

- `session = 内部 authority runtime`
- `state = 对外 authority read surface`
- `derived = 对外 semantic derived model`
- `history = 独立 public capability`
- `input = 外部输入入口`
- `write = 外部命令入口`
- `scene = projection runtime API`

把它压缩成一句话就是：

> editor 内部持有 session runtime，对外暴露 state、derived、history、input、write；scene 只负责 projection/query runtime，而不再承担 editor 读模型的概念。

这才是这轮重构的最终实现方案。

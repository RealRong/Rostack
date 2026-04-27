# whiteboard-editor / editor-scene 职责重构最终方案

## 1. 目标

解决当前两个根问题：

- public `Editor.session` 实际上不是 session，而是混合派生读模型
- `editor-scene` 与 `whiteboard-editor` 的 derived 边界不清晰

最终目标：

- `session` 回到内部 runtime 语义
- public API 明确分成 `state / derived / history / input / write`
- `editor-scene` 只承载 **scene-generic derived**
- `whiteboard-editor` 只承载 **editor policy derived**

---

## 2. 设计结论

## 2.1 内部与外部分离

内部继续保留真实 runtime：

- `session`
- `scene binding`
- `scene runtime`

外部不再暴露真实 `session`，而是暴露：

- `state`
- `derived`
- `history`
- `input`
- `write`

---

## 2.2 不再用 `facades` 作为最终 public 概念

`facades` 太宽，且会掩盖一件事实：

- 有些派生模型给 UI 用
- 有些派生模型给 interaction binding 用

最终统一叫 `derived`，再按归属拆成：

- `scene-derived`
- `editor-derived`

---

## 2.3 `editor-scene` 不是纯几何层，但也不是 editor UI policy 层

`editor-scene` 可以承载 derived，但只承载这类 derived：

- 只依赖 `document + session input + interaction input + view + generic node capability`
- 对不同 host / UI 都成立
- 表达的是 scene 事实、投影结果、几何关系、可交互事实

不承载这类 derived：

- 依赖 `HistoryPort`
- 依赖 `EditorDefaults`
- 依赖 `NodeTypeSupport.hasControl / supportsStyle`
- 依赖 toolbar / panel / icon / label / scope 分组策略
- 表达的是 editor 产品语义而不是 scene 事实

---

## 3. 最终边界

## 3.1 `editor-scene` 负责什么

`editor-scene` 负责：

- document / graph / spatial / render / ui projection runtime
- scene query
- scene stores
- scene-generic derived

### 应留在 `editor-scene` 的 derived

- `selection.members`
- `selection.summary`
- `selection.affordance`
- `selection.bounds`
- `selection.move`
- `edge.chrome`
- `mindmap.addChildTargets`
- `view.screenPoint / screenRect / visible / pick`
- `NodeUiView`
- `EdgeUiView`
- `ChromeView`

### 可继续下沉到 `editor-scene` 的 derived

建议新增：

- `query.chrome.marquee`
- `query.chrome.draw`
- `query.chrome.guides`
- `query.chrome.edgeGuide`

理由：

- 这些本质上是 scene preview / projection 输出
- 不依赖 editor policy
- 当前 editor 层多数只是二次包装

---

## 3.2 `whiteboard-editor` 负责什么

`whiteboard-editor` 负责：

- authority session runtime 的装配
- commands / write API
- input orchestration
- editor policy derived
- public API 组装

### 应留在 `whiteboard-editor` 的 derived

- selection toolbar context
- node toolbar scope
- edge toolbar scope
- selection overlay display policy
- history 暴露
- panel 级别聚合

### 明确不应进入 `editor-scene` 的内容

- `HistoryPort`
- `EditorDefaults`
- `NodeTypeSupport.hasControl`
- `NodeTypeSupport.supportsStyle`
- toolbar label / icon / family / scope 策略
- panel / dock / menu / overlay 的产品组织方式

---

## 3.3 边界判断规则

一个 derived 是否应下沉到 `editor-scene`，按这 4 条判断：

1. 去掉 `history / defaults / editor policy` 后，它是否仍成立
2. 换一个 host 或 UI，它是否仍有意义
3. 它表达的是 scene 事实，还是产品 UI 策略
4. 它是否会迫使 `editor-scene` 反向理解 editor 的面板/工具栏语义

满足：

- `1 = 是`
- `2 = 是`
- `3 = scene 事实`
- `4 = 否`

则应进入 `editor-scene`。

---

## 4. 最终 API

## 4.1 内部 runtime

内部保留：

```ts
type InternalEditorSession = {
  state: EditorSessionState
  mutate: EditorSessionMutate
  viewport: ViewportRuntime
  interaction: {
    read: EditorSessionInteractionRead
    write: EditorSessionInteractionWrite
  }
  preview: {
    state: ReadStore<EditorInputPreviewState>
    write: EditorInputPreviewWrite
  }
  resetDocument: () => void
  resetInteraction: () => void
  reset: () => void
}
```

说明：

- 它继续存在
- 但不再作为 public `Editor.session`

---

## 4.2 public `state`

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
```

原则：

- 只读
- authority state public surface
- 不暴露 mutate / preview.write / interaction.write

---

## 4.3 public `derived`

最终 `derived` 明确分两层：

```ts
export type EditorDerived = {
  scene: EditorSceneDerived
  editor: EditorPolicyDerived
}
```

### `scene-derived`

```ts
export type EditorSceneDerived = {
  selection: {
    members: store.ReadStore<SelectionMembers>
    summary: store.ReadStore<SelectionSummary>
    affordance: store.ReadStore<SelectionAffordance>
    view: store.ReadStore<EditorSelectionView>
    edge: {
      chrome: store.ReadStore<SelectedEdgeChrome | undefined>
    }
  }
  chrome: {
    marquee: store.ReadStore<EditorMarqueePreview | undefined>
    draw: store.ReadStore<DrawPreview | null>
    edgeGuide: store.ReadStore<EdgeGuide>
    snap: store.ReadStore<readonly Guide[]>
  }
  mindmap: {
    chrome: store.KeyedReadStore<MindmapId, MindmapChrome | undefined>
  }
}
```

说明：

- 这些值最终都应来自 `editor-scene query/stores`
- `whiteboard-editor` 只做 public 组装，不再承担核心计算

### `editor-derived`

```ts
export type EditorPolicyDerived = {
  selection: {
    toolbar: store.ReadStore<SelectionToolbarContext | undefined>
    overlay: store.ReadStore<SelectionOverlay | undefined>
    node: {
      selected: store.KeyedReadStore<NodeId, boolean>
      stats: store.ReadStore<SelectionNodeStats>
      scope: store.ReadStore<SelectionToolbarNodeScope | undefined>
    }
    edge: {
      scope: store.ReadStore<SelectionToolbarEdgeScope | undefined>
      stats: store.ReadStore<SelectionEdgeStats>
    }
  }
}
```

说明：

- 这层保留在 `whiteboard-editor`
- 它依赖 defaults / nodeType / toolbar 规则 / editor 当前工具策略

---

## 4.4 public `history`

```ts
history: HistoryPort<IntentResult>
```

原则：

- 独立一级能力
- 不属于 panel
- 不属于 scene
- 不属于 session

---

## 4.5 public `input`

保持：

```ts
input: EditorInputHost
```

不改名 `interactions`。

原因：

- 这是外部输入入口
- 调用语义直接
- 已被 DOM bridge 明确消费

---

## 4.6 public `scene`

```ts
export type EditorSceneApi = {
  revision: () => Revision
  query: Query
  stores: RuntimeStores
  host: {
    pick: ScenePickRuntime
    visible: (
      options?: Parameters<Query['spatial']['rect']>[1]
    ) => ReturnType<Query['spatial']['rect']>
  }
}
```

原则：

- `scene` 只暴露 projection runtime API
- 不暴露 toolbar / history / panel / tool policy

---

## 4.7 最终 `Editor`

```ts
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

补充约束：

- `document` 仍保留为 `scene.query.document` 的 canonical alias
- 外部统一用 `editor.document`

---

## 5. 最终目录

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
      scene.ts
      policy.ts
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

对应关系：

- `editor/source/session.ts` -> `editor/state/* + editor/derived/*`
- `editor/source/selection.ts` -> `editor/derived/selection-policy.ts`
- `scene/source.ts` -> `scene/binding.ts`
- `scene/view.ts` -> `scene/api.ts`

---

## 6. 迁移表

## 6.1 类型迁移表

| 当前 | 目标 | 去向 |
| --- | --- | --- |
| `EditorSessionSource` | 删除 | 拆到 `EditorState` + `EditorDerived` + `history` |
| `Editor.session` | 删除 | 改为 `Editor.state` + `Editor.derived` |
| `EditorChromeSource` | 保留，但归 `derived.scene.chrome` | `editor-scene` 提供核心数据 |
| `EditorPanelSource` | 删除 | 拆成 `derived.editor.selection.toolbar` + `history` + `state.draw` |
| `EditorSceneSource`（editor types 中的 public scene） | 重命名 | `EditorSceneApi` |

---

## 6.2 字段迁移表

| 当前访问路径 | 最终访问路径 | 归属 |
| --- | --- | --- |
| `editor.session.tool` | `editor.state.tool` | authority state |
| `editor.session.draw` | `editor.state.draw` | authority state |
| `editor.session.edit` | `editor.state.edit` | authority state |
| `editor.session.selection` | `editor.state.selection` | authority state |
| `editor.session.interaction` | `editor.state.interaction` | authority state |
| `editor.session.viewport` | `editor.state.viewport` | authority state |
| `editor.session.selection.members` | `editor.derived.scene.selection.members` | scene-derived |
| `editor.session.selection.summary` | `editor.derived.scene.selection.summary` | scene-derived |
| `editor.session.selection.affordance` | `editor.derived.scene.selection.affordance` | scene-derived |
| `editor.session.selection.view` | `editor.derived.scene.selection.view` | scene-derived wrapper |
| `editor.session.selection.node.selected` | `editor.derived.editor.selection.node.selected` | editor policy helper |
| `editor.session.selection.node.stats` | `editor.derived.editor.selection.node.stats` | editor policy derived |
| `editor.session.selection.node.scope` | `editor.derived.editor.selection.node.scope` | editor policy derived |
| `editor.session.selection.edge.chrome` | `editor.derived.scene.selection.edge.chrome` | scene-derived |
| `editor.session.chrome.marquee` | `editor.derived.scene.chrome.marquee` | scene-derived |
| `editor.session.chrome.draw` | `editor.derived.scene.chrome.draw` | scene-derived |
| `editor.session.chrome.edgeGuide` | `editor.derived.scene.chrome.edgeGuide` | scene-derived |
| `editor.session.chrome.snap` | `editor.derived.scene.chrome.snap` | scene-derived |
| `editor.session.chrome.selection` | `editor.derived.editor.selection.overlay` | editor policy derived |
| `editor.session.panel.selectionToolbar` | `editor.derived.editor.selection.toolbar` | editor policy derived |
| `editor.session.panel.history` | `editor.history` | independent capability |
| `editor.session.panel.draw` | `editor.state.draw` | authority state |
| `editor.session.history` | `editor.history` | independent capability |
| `editor.session.mindmap.chrome` | `editor.derived.scene.mindmap.chrome` | scene-derived |

---

## 6.3 实现归属表

| 当前实现 | 最终归属 | 说明 |
| --- | --- | --- |
| `graph.query.selection.members` | `editor-scene` | 保留 |
| `graph.query.selection.summary` | `editor-scene` | 保留 |
| `graph.query.selection.affordance` | `editor-scene` | 保留 |
| `graph.query.edge.chrome` | `editor-scene` | 保留 |
| `graph.query.mindmap.addChildTargets` | `editor-scene` | 保留 |
| `chromeMarquee/chromeDraw/chromeSnap/chromeEdgeGuide` | `editor-scene` | 下沉为 `query.chrome.*` 或 scene stores wrapper |
| `readNodeScope` | `whiteboard-editor` | 保留，依赖 defaults + supportsStyle |
| `readEdgeScope` | `whiteboard-editor` | 保留，依赖 defaults |
| `resolveSelectionOverlay` | `whiteboard-editor` | 保留，属于 editor display policy |
| `resolveSelectionToolbar` | `whiteboard-editor` | 保留，属于 toolbar policy |

---

## 6.4 兼容期映射表

兼容期允许保留：

```ts
editor.session // deprecated adapter
```

映射规则：

| 兼容层字段 | 实际读取 |
| --- | --- |
| `session.tool` | `state.tool` |
| `session.draw` | `state.draw` |
| `session.edit` | `state.edit` |
| `session.selection` | `state.selection` |
| `session.interaction` | `state.interaction` |
| `session.viewport` | `state.viewport` |
| `session.chrome` | `derived.scene.chrome` + `derived.editor.selection.overlay` 适配 |
| `session.panel.selectionToolbar` | `derived.editor.selection.toolbar` |
| `session.panel.history` | `history` |
| `session.panel.draw` | `state.draw` |
| `session.mindmap.chrome` | `derived.scene.mindmap.chrome` |

约束：

- compat adapter 不再新增任何新能力
- 新代码禁止依赖 `editor.session`

---

## 7. 迁移阶段

## Phase 1

只改名，不改行为：

- `scene/source.ts` -> `scene/binding.ts`
- `scene/view.ts` -> `scene/api.ts`
- `editor/source/session.ts` -> `editor/derived/index.ts`
- `editor/source/selection.ts` -> `editor/derived/selection-policy.ts`

---

## Phase 2

拆 `editor/source/session.ts`：

- `editor/state/index.ts`
- `editor/derived/scene.ts`
- `editor/derived/policy.ts`

---

## Phase 3

把 scene-generic derived 下沉到 `editor-scene`：

- `selection.members`
- `selection.summary`
- `selection.affordance`
- `edge.chrome`
- `mindmap.addChildTargets`
- `chrome.marquee/draw/guides/edgeGuide`

---

## Phase 4

引入新 public API：

- `editor.state`
- `editor.derived`
- `editor.history`

保留：

- `editor.session` deprecated adapter

---

## Phase 5

迁移调用方与测试：

- React hooks
- input bindings
- overlay components
- toolbar components
- tests

---

## Phase 6

删除：

- `EditorSessionSource`
- `createEditorSessionSource`
- `editor.session` public field

---

## 8. 最终一句话定义

最终形态下：

> `editor-scene` 负责 projection runtime 与 scene-generic derived；`whiteboard-editor` 负责 authority state、editor policy derived、input、write 与 public API 组装；public `Editor` 只暴露 `state / derived / history / input / write / scene / document`。

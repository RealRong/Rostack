# WHITEBOARD_EDITOR / EDITOR_SCENE 类型统一最终方案

## 1. 目标

这最后一轮只解决一件事：

- `whiteboard-editor`
- `whiteboard-editor-scene`

两边的**类型、职责、导出面、组合方式**彻底单源化，不再出现：

- 同一份 read contract 在两边各写一遍
- 同一份 runtime query 在两边各包一层
- `editor-scene` 反向深度依赖 `whiteboard-editor/src/*` 内部文件
- public facade 和 internal projection schema 混在一起

最终目标不是“能用就行”，而是：

1. 每类协议只有一个 owner
2. 每类输出只有一个 canonical shape
3. `editor.create()` 只做组装，不再发明第二套 schema
4. `editor-scene` 只定义 projection/scene contract
5. `whiteboard-editor` 只定义 editor engine / input / write / public facade

---

## 2. 现状结构

当前实际存在三层 scene/read 形状：

### 2.1 `editor-scene` 基础 scene contract

来源：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`

核心类型：

- `SceneUpdateInput`
- `RuntimeFrame`
- `EditorScene`
- `PreviewInput`
- `SceneNodes / SceneEdges / SceneViewport / SceneOverlay / ...`

这一层本来就应该是**projection 输出协议**。

### 2.2 `whiteboard-editor` 内部 projection 扩展层

来源：

- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/projection.ts`

核心类型：

- `EditorProjectionRuntimeFrame`
- `EditorProjection`
- `EditorDerived`

这一层现在做了两件事：

1. 给 `EditorScene` 加 editor-local runtime read
2. 给 `EditorScene` 加 derived stores

问题是这里又重新声明了一遍很多 runtime/query 形状。

### 2.3 `editor.create()` 最终对外 facade

来源：

- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/projection.ts`

核心类型：

- `EditorSceneApi`
- `EditorSceneEditorApi`
- `EditorSceneSelectionApi`
- `EditorSceneChromeApi`
- `EditorSceneMindmapApi`
- `Editor`

这一层把：

- `EditorScene`
- runtime editor state stores
- selection/chrome/mindmap derived stores
- capture

重新拼成了一个新的 public shape。

---

## 3. 当前重复点

## 3.1 `RuntimeFrame` 和 `EditorProjectionRuntimeFrame` 重复

`editor-scene` 已有：

- `RuntimeFrame.editor.tool()`
- `RuntimeFrame.editor.selection()`
- `RuntimeFrame.editor.hover()`
- `RuntimeFrame.editor.edit()`
- `RuntimeFrame.editor.interaction()`
- `RuntimeFrame.editor.preview()`

位置：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`

`whiteboard-editor` 又定义了：

- `EditorProjectionRuntimeFrame.editor.tool()`
- `draw()`
- `selection()`
- `hover()`
- `edit()`
- `interaction()`
- `interactionState()`
- `preview()`
- `viewport.*`

位置：

- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`

这是最明显的一类重复：**同一 runtime read contract 在两边重复声明**。

### 结论

`RuntimeFrame` 必须成为唯一 runtime read 合同。  
`EditorProjectionRuntimeFrame` 必须删除。

---

## 3.2 `EditorSceneApi` 和 `EditorScene` 大面积镜像重复

`EditorSceneApi` 里直接重复透传了 `EditorScene` 的大部分字段：

- `document`
- `stores`
- `viewport`
- `nodes`
- `edges`
- `mindmaps`
- `groups`
- `hit`
- `pick`
- `snap`
- `spatial`
- `bounds`

位置：

- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`

这意味着 public facade 不是在**扩展** `EditorScene`，而是在**重写一份几乎相同的 scene schema**。

### 结论

`EditorSceneApi` 不能再手写一份并列 schema。  
它必须变成：

```ts
type EditorSceneFacade = EditorScene & {
  ui: ...
  capture(): Capture
}
```

也就是：

- `EditorScene` 负责 scene/query/stores/runtime 基础协议
- facade 只负责加 editor-specific convenience

---

## 3.3 `EditorSceneStoresApi` 这类 alias 噪音没有必要

例如：

- `EditorSceneStoresApi = EditorScene['stores']`

这种 alias 没有引入新语义，只会让“真正 owner 在哪”更难看清。

### 结论

这类 alias 应该删除，直接引用 canonical contract。

---

## 3.4 `EditorSceneEditorApi.viewport` 和 scene viewport / runtime viewport 语义交叉

当前同时存在：

1. `EditorScene['viewport']`
2. `EditorSceneApi.editor.viewport`
3. `EditorProjectionRuntimeFrame.editor.viewport`
4. `EditorState.viewport` / `SessionViewportRead`

这些都在暴露“viewport 读能力”，但来源和职责不一样：

- scene viewport：projection 后的 scene 视角 query
- editor viewport：editor local state viewport 值
- runtime viewport：client/screen/world 换算 helper

### 结论

这里必须拆成两类，不再混写：

1. **scene query viewport**
   - 属于 `EditorScene['viewport']`
   - 负责 screen/worldRect/background/pick/visible

2. **editor state viewport**
   - 属于 facade 的 `ui.state.viewport`
   - 负责 editor local `Viewport` state store/read
   - 如需 pointer/worldToScreen/screenPoint/size，可以挂这里

不要再在 `runtime.editor.viewport` 里单独发明第三套公开协议。

---

## 3.5 `editor-scene` 正在深度依赖 `whiteboard-editor/src/*` 内部类型

当前 `editor-scene/contracts/editor.ts` 直接引用：

- `../../../whiteboard-editor/src/session/draw/state`
- `../../../whiteboard-editor/src/session/edit`
- `../../../whiteboard-editor/src/state-engine/document`
- `../../../whiteboard-editor/src/state-engine/delta`
- `../../../whiteboard-editor/src/types/tool`
- `../../../whiteboard-editor/src/input/core/types`

这是严重的所有权倒置：

- `editor-scene` 是 projection contract 层
- 不应该直接 deep import `whiteboard-editor` 的内部文件路径

### 结论

必须引入**稳定的 editor protocol 导出面**，供 `editor-scene` 依赖。

最小方案：

- `whiteboard-editor` 新增稳定协议子路径
  - 例如 `@whiteboard/editor/protocol`

由该子路径统一导出：

- `Tool`
- `DrawState`
- `EditSession`
- `EditCaret`
- `EditField`
- `EditorStateDocument`
- `EditorDelta`
- `EditorEditDelta`
- `EditorPreviewDelta`
- `EditorTouchedIds`
- `InteractionMode`

然后 `editor-scene` 只依赖这个稳定子路径，**不再引用 `src/*` 内部文件**。

---

## 3.6 `EditorState` / `EditorDerived` / `EditorSceneApi` 混合了 internal 与 public

`whiteboard-editor/src/types/editor.ts` 现在同时放了：

- public 顶层 `Editor`
- public 输入 host 类型
- internal projection runtime 扩展类型
- internal derived store 类型
- final scene facade 类型

这会让一个文件同时承担三类职责：

1. public editor api
2. internal projection assembly
3. internal derived read model

### 结论

这三类必须拆开：

- `types/editor.ts`
  - 只保留 public 顶层 editor api

- `editor/projection/types.ts`
  - internal projection assembly types

- `editor/derived/types.ts`
  - internal derived read types

如果不想新建太多文件，至少也要做到：

- `types/editor.ts` 不再定义 internal projection schema

---

## 4. 最终所有权

最终必须强制以下 owner 关系。

## 4.1 `whiteboard-editor` 拥有的协议

只拥有 **editor mutable protocol**：

- `EditorStateDocument`
- `EditorStableState`
- `EditorOverlayState`
- `EditorCommand`
- `EditorDispatchInput`
- `EditorDelta`
- `EditorTouchedIds`
- `EditorEditDelta`
- `EditorPreviewDelta`
- editor input / action / write 协议

也就是：

- editor engine 读写什么
- input dispatch 什么
- document commit 后如何生产 editor delta

这些必须由 `whiteboard-editor` 拥有。

## 4.2 `whiteboard-editor-scene` 拥有的协议

只拥有 **projection read protocol**：

- `SceneUpdateInput`
- `RuntimeFrame`
- `RuntimeStores`
- `EditorScene`
- `ProjectionScene`（internal）
- `PreviewInput`
- `NodePreview / EdgePreview / EdgeGuidePreview / MindmapPreview`
- scene query/view/render/store 合同

也就是：

- projection 吃什么输入
- projection 吐出什么 stores/query/runtime

这些必须由 `whiteboard-editor-scene` 拥有。

## 4.3 `whiteboard-editor` public facade 拥有的协议

只拥有 **顶层对外 editor api**：

- `Editor`
- `EditorInputHost`
- `EditorWrite`
- `EditorSceneFacade`

注意：

- facade 是 public 组合层
- 不是新一套 scene 底层协议

---

## 5. 最终统一后的类型结构

## 5.1 `editor-scene` canonical scene contract

`whiteboard-editor-scene/src/contracts/editor.ts` 保留为唯一 scene 合同。

建议最终结构：

```ts
export interface RuntimeFrame {
  editor: {
    tool(): Tool
    draw(): DrawState
    selection(): SelectionTarget
    hover(): HoverState
    edit(): EditSession | null
    interaction(): InteractionInput
    preview(): PreviewInput
  }
  facts: {
    touchedNodeIds(): ReadonlySet<NodeId>
    touchedEdgeIds(): ReadonlySet<EdgeId>
    touchedMindmapIds(): ReadonlySet<MindmapId>
    activeEdgeIds(): ReadonlySet<EdgeId>
    uiChanged(): boolean
    overlayChanged(): boolean
    chromeChanged(): boolean
  }
}

export interface EditorScene {
  revision(): Revision
  stores: RuntimeStores
  pick: ScenePickRuntime
  document: DocumentFrame
  runtime: RuntimeFrame
  nodes: SceneNodes
  edges: SceneEdges
  mindmaps: SceneMindmaps
  groups: SceneGroups
  selection: SceneSelection
  frame: SceneFrame
  hit: SceneHit
  viewport: SceneViewport
  overlay: SceneOverlay
  spatial: SceneSpatial
  snap: SceneSnap
  items(): State['items']
  bounds(): Rect | undefined
}
```

关键点：

- `RuntimeFrame` 吃掉现在 `EditorProjectionRuntimeFrame` 中需要保留的 runtime read
- `viewport` 不再挂到 `runtime.editor.viewport`
- scene query 一律走 `scene.viewport`

---

## 5.2 `whiteboard-editor` public scene facade

`whiteboard-editor` 对外不要再重写 `EditorScene`，只扩展。

建议最终结构：

```ts
export type EditorSceneFacade = EditorScene & {
  ui: {
    state: {
      tool: ToolRead
      draw: ReadStore<DrawState>
      selection: ReadStore<SelectionTarget>
      edit: ReadStore<EditSession | null>
      interaction: ReadStore<EditorInteractionState>
      preview: ReadStore<PreviewInput>
      viewport: EditorViewportStateRead
    }
    selection: {
      members: ReadStore<SelectionMembers>
      summary: ReadStore<SelectionSummary>
      affordance: ReadStore<SelectionAffordance>
      view: ReadStore<EditorSelectionView>
      node: EditorSelectionNodeRead
      edge: EditorSelectionEdgeRead & {
        chrome: ReadStore<SelectedEdgeChrome | undefined>
      }
    }
    chrome: {
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
    mindmap: {
      addChildTargets: KeyedReadStore<MindmapId, MindmapChrome | undefined>
    }
  }
  capture(): Capture
}
```

核心变化：

- 不再顶层平铺 `editor / selection / chrome / mindmap`
- 统一收到 `scene.ui`
- `EditorScene` 本体保持 scene contract 原样

这样：

- base scene query 在 `scene.*`
- editor-specific convenience 在 `scene.ui.*`

职责非常清楚。

---

## 5.3 `EditorProjection` 只作为 internal assembly type

`EditorProjection` 可以保留，但只能 internal 使用。

约束：

- 不从 package root 导出
- 不定义新的 canonical contract
- 只用于 `createEditor()` 内部装配

建议最终形式：

```ts
type EditorProjection = EditorScene & {
  ui: InternalEditorUiProjection
}
```

也就是说：

- 它是 `EditorScene` 的 internal 扩展
- 不是另一套并列 scene 协议

同时删除：

- `EditorProjectionRuntimeFrame`

---

## 5.4 `types/editor.ts` 最终只保留 public 顶层类型

`whiteboard-editor/src/types/editor.ts` 最终只应该保留：

- `Editor`
- `EditorInputHost`
- `EditorPointerDispatchResult`
- `ToolRead`
- `EditorInteractionState`
- `EditorViewportStateRead`
- `EditorSceneFacade`

不再放：

- `EditorProjectionRuntimeFrame`
- `EditorProjection`
- `EditorDerived`
- `EditorSceneDerived`
- 大量 internal store composition type

这些应搬到 internal 文件。

---

## 6. 最终组合方式

最终组装链应该只有这一条：

```ts
EditorStateRuntime
  + Engine document
    -> SceneUpdateInput
      -> editor-scene projection runtime
        -> EditorScene
          + editor ui derived facade
            -> EditorSceneFacade
              -> Editor
```

也就是：

1. `state-engine` 负责 editor local document/command/delta
2. `editor-scene` 负责 scene projection/store/query/runtime
3. `whiteboard-editor` 只负责把 base scene + editor ui facade 组合成最终 public scene

`createEditor()` 不再拥有“协议发明权”，只拥有“装配权”。

---

## 7. 必删清单

以下类型/层应删除或强收缩。

## 7.1 必删

- `EditorProjectionRuntimeFrame`
- `EditorSceneStoresApi`

## 7.2 改为 `EditorScene` 薄扩展

- `EditorSceneApi`

不再重写 scene 主体字段。

## 7.3 改为 internal only

- `EditorProjection`
- `EditorDerived`
- `EditorSceneDerived`
- `EditorPolicyDerived`

这些不应再停留在 public-facing `types/editor.ts`。

## 7.4 必删除的深路径依赖

`editor-scene` 里所有：

- `../../../whiteboard-editor/src/...`

都必须改成稳定协议导出路径。

---

## 8. 最终对外输出

## 8.1 `whiteboard-editor-scene` 对外输出

只输出：

- projection runtime 创建器
- scene contract
- scene store/query/render contracts

不输出 editor facade 概念。

## 8.2 `whiteboard-editor` 对外输出

只输出：

- `editor.create`
- clipboard serialize/parse
- public input/tool/node spec types
- `Editor`
- `EditorSceneFacade`

如果需要给 `editor-scene` 复用 editor-owned 协议，则额外输出：

- `@whiteboard/editor/protocol`

这个子路径只给 contract 层用，不给业务层乱用。

---

## 9. 实施顺序

## Phase A：收合同 owner

1. 在 `whiteboard-editor` 建稳定 protocol 子路径
2. `editor-scene/contracts/editor.ts` 改为只依赖稳定 protocol 子路径
3. 去掉所有 `../../../whiteboard-editor/src/*` 深路径 type import

## Phase B：收 runtime contract

1. 扩充 `editor-scene/contracts/editor.ts` 的 `RuntimeFrame.editor`
2. 删 `EditorProjectionRuntimeFrame`
3. `projection.ts` / `createEditor()` 统一改读 `EditorScene['runtime']`

## Phase C：收 public scene facade

1. 把 `EditorSceneApi` 改成 `EditorScene & { ui: ...; capture(): Capture }`
2. 不再手写镜像字段
3. 把 editor-specific stores 全收进 `scene.ui`

## Phase D：收 internal types

1. `EditorProjection` / `EditorDerived` 等移出 `types/editor.ts`
2. 只保留 public editor facade types
3. internal projection/derived 类型就近放到 `editor/projection` / `editor/derived`

---

## 10. 完成判定

满足以下条件，才算这轮类型统一完成：

1. `RuntimeFrame` 是唯一 runtime read 合同
2. `EditorProjectionRuntimeFrame` 已删除
3. `EditorScene` 是唯一 scene base contract
4. `EditorSceneFacade` 只是 `EditorScene` 的薄扩展，不再镜像重写
5. `editor-scene` 不再 deep import `whiteboard-editor/src/*`
6. `types/editor.ts` 不再混放 internal projection schema
7. `createEditor()` 只组装，不再定义第二套 scene/read 类型

---

## 11. 最终原则

一句话定死：

**`editor-scene` 定义 scene contract，`whiteboard-editor` 定义 editor engine contract，public facade 只做组合，不再重复定义协议。**


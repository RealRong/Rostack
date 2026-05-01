# WHITEBOARD_EDITOR / EDITOR_SCENE 最终统一方案

## 1. 这轮要解决什么

这最后一轮不是继续“能跑就行”的收口，而是把：

- `whiteboard-editor`
- `whiteboard-editor-scene`

之间所有**重复类型、重复协议、重复 façade、重复中转层**彻底理干净。

目标只有四条：

1. 同一类数据结构只能有一个 owner。
2. 上下游必须同构，不能同一件事声明两次。
3. `editor.create()` 只负责组装，不负责再发明一套新协议。
4. `editor-scene` / `editor` 的职责边界必须一眼看清。

这轮不要兼容层，不要过渡层，不要双轨实现。

---

## 2. 现状总览

当前实际链路大致是：

```ts
Engine document
  + EditorStateRuntime snapshot/delta
    -> editor-scene projection runtime
      -> EditorScene
        -> whiteboard-editor projection extension
          -> whiteboard-editor public scene api
            -> Editor
```

其中问题不是“层数多”，而是**同一类 contract 在不同层被重新声明**。

---

## 3. 现在各包实际在做什么

## 3.1 `whiteboard-editor-scene`

当前主要承担：

- projection runtime
- scene query contract
- render/store contract
- document + editor snapshot/delta 到 scene 的投影

关键文件：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/createProjectionRuntime.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/query/index.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/scene.ts`

它本来应该是**scene 读模型的唯一 owner**。

## 3.2 `whiteboard-editor`

当前主要承担：

- editor state engine
- editor command / delta / snapshot
- input host
- write / action
- public `Editor` façade

关键文件：

- `whiteboard/packages/whiteboard-editor/src/state-engine/*`
- `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/projection.ts`
- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`

它本来应该是**editor 可变状态协议的唯一 owner**，并在最后把 scene + editor UI 组合成 public api。

---

## 4. 当前重复和错位

## 4.1 `editor-scene` 反向 deep import `whiteboard-editor/src/*`

当前 `whiteboard-editor-scene/src/contracts/editor.ts` 直接依赖：

- `../../../whiteboard-editor/src/session/draw/state`
- `../../../whiteboard-editor/src/session/edit`
- `../../../whiteboard-editor/src/state-engine/document`
- `../../../whiteboard-editor/src/state-engine/delta`
- `../../../whiteboard-editor/src/types/tool`
- `../../../whiteboard-editor/src/input/core/types`

这说明 scene contract 层没有稳定上游协议，而是在反向吃 editor 内部实现。

这属于典型 owner 倒置：

- `editor-scene` 是 contract / projection 包
- 不应该依赖 `whiteboard-editor/src/*` 私有路径

### 结论

必须建立稳定协议出口，例如：

```ts
@whiteboard/editor/protocol
```

由 `whiteboard-editor` 显式导出它拥有的类型，`editor-scene` 只依赖这个稳定出口。

---

## 4.2 scene shape 被声明了三遍

现在至少存在三层 scene/read 形状：

### 第一层：`editor-scene` canonical scene contract

位置：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`

核心：

- `RuntimeFrame`
- `RuntimeStores`
- `EditorScene`
- `SceneNodes / SceneEdges / SceneViewport / SceneOverlay / ...`

这层本来就是应该保留的 canonical shape。

### 第二层：`whiteboard-editor` internal projection 扩展层

位置：

- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/projection.ts`

核心：

- `EditorProjectionRuntimeFrame`
- `EditorProjection`
- `EditorDerived`

这层又给 scene 包了一层 runtime / derived 结构。

### 第三层：`whiteboard-editor` public facade

位置：

- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/projection.ts`

核心：

- `EditorSceneApi`
- `EditorSceneEditorApi`
- `EditorSceneSelectionApi`
- `EditorSceneChromeApi`
- `EditorSceneMindmapApi`

这一层又把 `EditorScene` 主体字段几乎原样手写了一遍。

### 结论

scene base contract 只能保留一份：

- `EditorScene` 作为唯一 canonical scene contract

其他层只能“薄扩展”，不能重写主 schema。

---

## 4.3 runtime contract 被声明了不止一份

当前 runtime 相关至少有这些名字：

- `RuntimeFrame`
- `EditorProjectionRuntimeFrame`
- `Runtime`
- `EditorSceneRuntime`

### `RuntimeFrame`

位置：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`

这是 scene query 读取 editor runtime 信息的合同。

### `EditorProjectionRuntimeFrame`

位置：

- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`

这是 `whiteboard-editor` 侧再次拼出来的一套 runtime read schema。

### `Runtime`

位置：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`

包含：

- `stores`
- `scene`
- `revision`
- `state`
- `capture`
- `update`
- `subscribe`
- `dispose`

### `EditorSceneRuntime`

位置：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/runtime.ts`

和 `Runtime` 高度重合，但字段又不完全一致。

### 结论

runtime 需要统一成两层，而且只能两层：

1. `RuntimeFrame`
   - scene 内部 query 读取 editor runtime 的只读合同
2. `EditorSceneRuntime`
   - projection runtime 的外部运行时 api

必须删除：

- `EditorProjectionRuntimeFrame`
- `Runtime` 这个并列命名层

最终应当只有：

```ts
createProjectionRuntime(): EditorSceneRuntime
```

不要再同时维护 `Runtime` 和 `EditorSceneRuntime` 两个近义接口。

---

## 4.4 `EditorSceneApi` 几乎在镜像重写 `EditorScene`

当前 `EditorSceneApi` 直接重复透传：

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

这说明 public facade 不是在扩展 `EditorScene`，而是在重新声明一份 scene 主体结构。

### 结论

public scene api 必须改成薄扩展：

```ts
type EditorSceneFacade = EditorScene & {
  ui: ...
  capture(): Capture
}
```

也就是：

- `EditorScene` 负责 scene/query/store/runtime contract
- `EditorSceneFacade` 只负责 editor-specific convenience

---

## 4.5 viewport / ui state 暴露重复

当前 viewport 相关能力散在这些地方：

1. `EditorScene['viewport']`
2. `EditorSceneApi.editor.viewport`
3. `EditorProjectionRuntimeFrame.editor.viewport`
4. `EditorState.viewport`
5. `SessionViewportRead`

这把两种完全不同的东西混在了一起：

- scene projection viewport query
- editor local viewport state read

### 正确拆法

只能保留两类：

1. scene viewport
   - 走 `scene.viewport`
   - 负责 `worldRect / visible / background / pick / screenRect`

2. editor viewport state
   - 走 `scene.ui.state.viewport`
   - 负责 editor local viewport state、pointer/world/screen conversion

不要再在 `runtime.editor.viewport` 里造第三套 public contract。

---

## 4.6 `types/editor.ts` 把 public 和 internal 混在一起

当前 `whiteboard-editor/src/types/editor.ts` 同时承载：

- public `Editor`
- public input host 类型
- scene facade 类型
- internal projection runtime 类型
- internal derived 类型

这会让一个文件同时承担：

1. public api
2. internal assembly
3. internal read model

### 结论

必须分层：

- `types/editor.ts`
  - 只保留 public 顶层 editor api

- `editor/projection/*`
  - internal projection/facade 组合类型

- `editor/derived/*`
  - internal derived read types

---

## 4.7 `ProjectionScene` 是合理的 internal read 层，但不能再向外变成第二套协议

当前位置：

- `whiteboard/packages/whiteboard-editor-scene/src/projection/query/index.ts`

当前：

```ts
export interface ProjectionScene extends Omit<EditorScene, 'stores' | 'pick'> {
  capture: ...
  source: ...
}
```

这个层本身可以接受，因为 projection 内部确实需要：

- `capture`
- `source`
- 以及未封装成最终 `EditorScene` 前的 read 视图

问题不在于有这个 internal 结构，而在于它容易继续长成第二套对外协议。

### 结论

`ProjectionScene` 可以保留，但必须满足：

1. internal only
2. 不从包根导出
3. 只服务 projection 内部实现
4. 不再被 `whiteboard-editor` 当成另一套 public schema 去扩展

---

## 4.8 `SceneUpdateInput` / `Input` 要区分 public 与 internal

当前位置：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`

当前存在：

- `SceneUpdateInput`
- `Input`

其中：

- `SceneUpdateInput` 是 public 输入
- `Input` 是 projection 内部归一化后的输入，额外带 `delta`

这层不算坏，但必须明确 owner：

- `SceneUpdateInput` 可以 public
- `Input` 只允许 internal 使用

不要让业务层直接接触 `Input`。

---

## 5. 最终 owner 划分

## 5.1 `whiteboard-editor` 拥有的协议

只拥有 editor mutable protocol：

- `Tool`
- `DrawState`
- `EditSession`
- `EditCaret`
- `EditField`
- `EditorStateDocument`
- `EditorStableState`
- `EditorOverlayState`
- `EditorCommand`
- `EditorDispatchInput`
- `EditorDelta`
- `EditorTouchedIds`
- `EditorEditDelta`
- `EditorPreviewDelta`
- input / action / write contract

也就是：

- editor state 怎么长
- editor command 怎么 dispatch
- editor delta 怎么产出

这些必须由 `whiteboard-editor` 负责。

## 5.2 `whiteboard-editor-scene` 拥有的协议

只拥有 projection read protocol：

- `SceneUpdateInput`
- `RuntimeFrame`
- `RuntimeStores`
- `EditorScene`
- `EditorSceneRuntime`
- `PreviewInput`
- `NodePreview`
- `EdgePreview`
- `EdgeGuidePreview`
- `MindmapPreview`
- 各种 scene node/edge/mindmap/group/view/query/render/store contracts

也就是：

- projection 吃什么
- projection 吐出什么
- react/view 层怎么读 projection

这些必须由 `whiteboard-editor-scene` 负责。

## 5.3 `whiteboard-editor` public facade 拥有的协议

只拥有：

- `Editor`
- `EditorInputHost`
- `EditorWrite`
- `EditorSceneFacade`

注意：

- façade 是组合层
- 不是第二套底层 contract

---

## 6. 最终统一后的类型结构

## 6.1 `@whiteboard/editor/protocol`

新增稳定协议出口，专门给 `editor-scene` 依赖。

建议至少包含：

```ts
export type {
  Tool,
  DrawState,
  EditCaret,
  EditField,
  EditSession,
  EditorStateDocument,
  EditorStableState,
  EditorOverlayState,
  EditorDelta,
  EditorTouchedIds,
  EditorEditDelta,
  EditorPreviewDelta,
  InteractionMode
}
```

要求：

1. `editor-scene` 只依赖这里，不再 deep import `src/*`
2. 这是稳定 contract 出口，不是把整个 editor 内部随便暴露出去

## 6.2 `@whiteboard/editor-scene` canonical scene contract

`EditorScene` 保留为唯一 scene base contract。

`RuntimeFrame` 需要吸收 `EditorProjectionRuntimeFrame` 里真正必要的 editor read：

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
```

注意：

- scene query viewport 一律走 `scene.viewport`
- 不把 editor local viewport 再塞进 `runtime.editor.viewport`

## 6.3 `@whiteboard/editor-scene` runtime api

projection runtime 对外只保留一套名字：

```ts
export interface EditorSceneRuntime {
  readonly stores: RuntimeStores
  readonly scene: EditorScene
  revision(): Revision
  state(): State
  capture(): Capture
  update(input: SceneUpdateInput): Result
  subscribe(listener: (result: Result) => void): () => void
  dispose(): void
}
```

因此：

- 删除 `contracts/editor.ts` 里的 `Runtime`
- `contracts/runtime.ts` 成为唯一 runtime api
- `createProjectionRuntime()` 返回 `EditorSceneRuntime`

## 6.4 `@whiteboard/editor` public scene facade

public scene facade 不再平铺重写 scene 主体，而是薄扩展：

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

这样就很清楚：

- scene 基础 query 在 `editor.scene.*`
- editor convenience 在 `editor.scene.ui.*`

## 6.5 internal projection 结构

如果 `whiteboard-editor` 内部还需要 projection 组合类型，只能 internal：

```ts
type EditorProjection = EditorScene & {
  ui: InternalEditorUiProjection
}
```

要求：

1. 不从包根导出
2. 不在 `types/editor.ts` 里声明
3. 不再声明并列 runtime contract

---

## 7. 最终对外输出

## 7.1 `whiteboard-editor-scene` 对外输出

只输出：

- `createProjectionRuntime`
- `EditorSceneRuntime`
- `EditorScene`
- `RuntimeFrame`
- `RuntimeStores`
- `SceneUpdateInput`
- preview / render / store / scene query contracts

不输出：

- editor façade 概念
- `ProjectionScene`
- internal `Input`

## 7.2 `whiteboard-editor` 对外输出

只输出：

- `editor.create`
- clipboard serialize / parse
- `Editor`
- `EditorSceneFacade`
- `EditorInputHost`
- public input/tool/node spec types
- `@whiteboard/editor/protocol`

不输出：

- `EditorProjection`
- `EditorDerived`
- `EditorProjectionRuntimeFrame`

---

## 8. 最终组合方式

最终组合链只保留这一条：

```ts
EditorStateRuntime snapshot/delta
  + Engine document snapshot/delta
    -> SceneUpdateInput
      -> createProjectionRuntime()
        -> EditorSceneRuntime
          -> EditorScene
            + editor ui derived facade
              -> EditorSceneFacade
                -> Editor
```

`createEditor()` 的职责被压缩成三件事：

1. 维护 editor state runtime
2. 把 document + editor snapshot/delta 喂给 `editor-scene`
3. 把 `EditorScene` 和 editor UI stores 组合成 `EditorSceneFacade`

它不再拥有：

- 第二套 scene 协议设计权
- 第二套 runtime 协议设计权
- 第二套 viewport/read schema 设计权

---

## 9. 必删 / 必收缩清单

## 9.1 必删

- `EditorProjectionRuntimeFrame`
- `EditorSceneStoresApi`
- `whiteboard-editor-scene/contracts/editor.ts` 里的 `Runtime`

## 9.2 必改成薄扩展

- `EditorSceneApi`

最终改成 `EditorSceneFacade = EditorScene & { ui: ...; capture(): Capture }`

## 9.3 必限制为 internal only

- `ProjectionScene`
- `Input`
- `EditorProjection`
- `EditorDerived`
- `EditorSceneDerived`
- `EditorPolicyDerived`

## 9.4 必消灭的路径依赖

`editor-scene` 内所有：

- `../../../whiteboard-editor/src/...`

必须全部替换为稳定协议出口。

---

## 10. 实施顺序

## Phase A：先收 owner

1. 建 `@whiteboard/editor/protocol`
2. `editor-scene` 改为只依赖这个协议出口
3. 删除所有 deep import

## Phase B：收 runtime

1. `RuntimeFrame` 吃掉真正需要的 editor runtime read
2. 删 `EditorProjectionRuntimeFrame`
3. 把 `Runtime` / `EditorSceneRuntime` 收成一套
4. `createProjectionRuntime(): EditorSceneRuntime`

## Phase C：收 public facade

1. `EditorSceneApi` 改成薄扩展
2. scene 主体字段不再镜像重写
3. editor-specific read 全收到 `scene.ui`

## Phase D：收 internal types

1. `types/editor.ts` 只保留 public 类型
2. projection/derived internal 类型迁回实现附近
3. internal helper contract 不从包根暴露

---

## 11. 完成判定

满足以下条件，才算这轮真正完成：

1. `editor-scene` 不再 deep import `whiteboard-editor/src/*`
2. `RuntimeFrame` 是唯一 scene runtime read contract
3. `EditorSceneRuntime` 是唯一 projection runtime api
4. `EditorProjectionRuntimeFrame` 已删除
5. `Runtime` 并列接口已删除
6. `EditorScene` 是唯一 scene base contract
7. `EditorSceneFacade` 只是 `EditorScene` 的薄扩展
8. `types/editor.ts` 不再混放 internal projection / derived 类型
9. `ProjectionScene` / `Input` 没有泄漏为第二套 public 协议
10. `createEditor()` 只做组装，不再定义第二套 schema

---

## 12. 一句话原则

**`whiteboard-editor` 只拥有 editor mutable protocol，`whiteboard-editor-scene` 只拥有 scene projection protocol，public facade 只做组合，不再重复定义同一件事。**

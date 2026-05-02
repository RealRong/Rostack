# `whiteboard-editor` 目录收敛与类型去重研究

## 目标

你希望 `whiteboard/packages/whiteboard-editor/src` 最终只保留这些顶层目录和入口：

- `action`
- `write`
- `tasks`
- `editor`
- `state-engine`
- `types`
- `index.ts`

这意味着以下目录都应被清空并删除：

- `clipboard`
- `input`
- `preview`
- `protocol`
- `session`

这次研究的重点不是直接改代码，而是先把迁移与删除方案梳理清楚，尤其聚焦类型去重和中转层消除。

---

## 当前结构判断

当前 `src` 的职责分层并不稳定，主要问题有四类：

- 运行时逻辑目录和类型目录混用。典型例子是 `preview/types.ts`、`input/core/types.ts`、`session/edit.ts`，文件路径看起来是运行时层，实际却承载公共类型。
- 同一语义存在多套入口。典型例子是 `action/types.ts` 与 `write/types.ts` 都在定义“编辑器可写能力”，只是一个偏用户动作 API，一个偏底层 mutation API。
- 局部包装类型过多。典型例子是 `editor/projection/types.ts` 的 `EditorProjection`，本质只是 `EditorScene + ui` 的窄包装。
- 公共导出被历史目录绑死。`src/index.ts`、`src/protocol/index.ts` 直接对 `clipboard`、`session`、`input/core` 暴露类型，导致这些目录即使只剩类型也无法轻易删除。

---

## 目录级结论

### 最终保留目录

- `action`
  - 保留用户动作编排。
  - 需要清理 `action/types.ts` 中与 `write/types.ts` 的平行定义，避免两套写接口长期并存。
- `write`
  - 保留底层文档 mutation API。
  - 应成为“写能力类型”的唯一归属地。
- `tasks`
  - 保留异步任务与 mindmap 任务编排。
- `editor`
  - 保留 editor 装配、projection、UI、输入运行时与 clipboard runtime。
  - 当前 `input`、部分 `session`、部分 `clipboard` 的运行时代码最终都应并入这里。
- `state-engine`
  - 保留文档状态、delta、intent、runtime、overlay/preview 归一化逻辑。
  - 当前 `preview/state.ts`、部分 `session/draw/state.ts` 的状态归一化逻辑适合并到这里。
- `types`
  - 作为所有公共类型的唯一稳定出口。
  - 当前 `session/*`、`input/core/types.ts`、`preview/types.ts`、`protocol/index.ts` 里的公共类型都应收敛到这里。

### 最终删除目录

- `clipboard`
  - 只剩一个 `packet.ts`，不值得单独成层。
- `input`
  - 里面既有 runtime，又有 types，又有 feature binding；层次太散。
- `preview`
  - `types.ts` 是公共类型，`state.ts` 是状态拼装，`edge.ts/node.ts/selection.ts` 是辅助函数，应拆入 `types` 和 `state-engine`。
- `protocol`
  - 现在只是 re-export 层，应该转为 `types/protocol.ts` 或由 `index.ts`/package exports 直接导出。
- `session`
  - `edit.ts` 几乎纯类型，`draw/*` 是类型+默认值+归一化，`viewport.ts` 是 runtime interface，这些都不需要单独顶层目录。

---

## 逐目录迁移方案

## 1. `clipboard` -> `editor` + `types`

当前文件：

- `src/clipboard/packet.ts`

现状判断：

- 这个文件同时包含 `ClipboardPacket` 类型和 runtime 函数 `createClipboardPacket` / `serializeClipboardPacket` / `parseClipboardPacket`。
- `src/index.ts`、`src/action/clipboard.ts`、`src/action/types.ts` 都依赖它。
- 这类“单一 runtime 工具 + 公共类型”不值得独立顶层目录。

建议迁移：

- 将 `ClipboardPacket` 移到 `src/types/clipboard.ts`。
- 将 `createClipboardPacket`、`serializeClipboardPacket`、`parseClipboardPacket` 移到 `src/editor/clipboard.ts` 或 `src/editor/clipboardPacket.ts`。

建议修改引用：

- `src/index.ts`
  - runtime 从 `editor/clipboard` 导出。
  - type 从 `types/clipboard` 导出。
- `src/action/types.ts`
  - 改为依赖 `types/clipboard.ts`。
- `src/action/clipboard.ts`
  - 改为依赖 `editor/clipboard.ts` 和 `types/clipboard.ts`。

删除清单：

- 删除 `src/clipboard/packet.ts`
- 删除空目录 `src/clipboard`

---

## 2. `editor/projection/types.ts` -> `types/editor.ts`

当前文件：

- `src/editor/projection/types.ts`

定义：

- `EditorProjection = EditorScene & { ui: Omit<EditorSceneUi, 'state'> }`

现状判断：

- 这是局部装配期类型，不值得单开 `projection/types.ts`。
- 它没有独立领域语义，只是 `EditorSceneUi` 的一个“未注入 state 的阶段性形状”。

建议迁移：

- 方案 A，直接删除该类型，在 `src/editor/projection.ts` 内联表达。
- 方案 B，更稳妥：迁到 `src/types/editor.ts`，重命名为 `EditorSceneProjection`，避免与 `projection.ts` 文件名重复。

建议结论：

- 倾向方案 B。
- `EditorProjection` 这个名字太泛，应改成 `EditorSceneProjection`。

删除清单：

- 删除 `src/editor/projection/types.ts`

---

## 3. `preview` -> `types/preview.ts` + `state-engine/preview/*`

当前文件：

- `src/preview/types.ts`
- `src/preview/state.ts`
- `src/preview/edge.ts`
- `src/preview/node.ts`
- `src/preview/selection.ts`

现状判断：

- `preview/types.ts` 本质上是公共 editor domain types，不应留在 runtime 目录。
- `preview/state.ts` 负责 overlay preview 组合、比较、标准化，更像 `state-engine` 的一部分。
- `preview/edge.ts`、`node.ts`、`selection.ts` 是 preview 领域辅助函数，不是稳定公共入口。

建议迁移：

- `src/preview/types.ts` -> `src/types/preview.ts`
- `src/preview/state.ts` -> `src/state-engine/preview/state.ts`
- `src/preview/edge.ts` -> `src/state-engine/preview/edge.ts`
- `src/preview/node.ts` -> `src/state-engine/preview/node.ts`
- `src/preview/selection.ts` -> `src/state-engine/preview/selection.ts`

理由：

- `state-engine/document.ts`、`state-engine/runtime.ts` 已直接依赖 preview state/equality。
- `input/runtime.ts` 和 `tasks/mindmap.ts` 也依赖 preview 组合逻辑，但这仍然是“写 overlay 状态”的逻辑，归到 `state-engine` 更干净。

需要同步改的导出：

- `types/editor.ts` 中对 `EdgeGuide` 的依赖改到 `types/preview.ts`
- `input/core/gesture.ts` 中一批 preview draft 类型改到 `types/preview.ts`
- `state-engine/document.ts`、`state-engine/runtime.ts`、`input/runtime.ts`、`tasks/mindmap.ts` 改到 `state-engine/preview/*`

删除清单：

- 删除 `src/preview/types.ts`
- 删除 `src/preview/state.ts`
- 删除 `src/preview/edge.ts`
- 删除 `src/preview/node.ts`
- 删除 `src/preview/selection.ts`
- 删除空目录 `src/preview`

---

## 4. `session` -> `types` + `state-engine` + `editor`

当前文件：

- `src/session/draw/model.ts`
- `src/session/draw/state.ts`
- `src/session/edit.ts`
- `src/session/viewport.ts`

### 4.1 `session/edit.ts`

现状判断：

- 几乎纯类型文件。
- `EditField`、`EditCapability`、`EditCaret`、`EditSession` 都是公共稳定类型。

建议迁移：

- `src/session/edit.ts` -> `src/types/edit.ts`

删除清单：

- 删除 `src/session/edit.ts`

### 4.2 `session/draw/model.ts`

现状判断：

- 同时包含公共类型和常量。
- `DrawMode` / `DrawBrush` / `DrawSlot` 是公共类型。
- `DRAW_MODES` / `DRAW_BRUSHES` / `DRAW_SLOTS` / `DEFAULT_*` / `isDrawMode` 等，是公共枚举辅助和默认值。

建议迁移：

- `DrawMode` / `DrawBrush` / `DrawSlot` -> `src/types/draw.ts`
- 常量与判定函数
  - 如果要作为公共 editor 类型生态的一部分，可与上面一起保留在 `src/types/draw.ts`
  - 如果你希望 `types` 只放纯 type，可以拆到 `src/editor/draw.ts`

我的建议：

- 先放 `src/types/draw.ts`
- 因为这些常量本质是类型枚举配套，不是复杂 runtime

### 4.3 `session/draw/state.ts`

现状判断：

- 既有公共类型 `BrushStyle`、`DrawState`、`DrawPreview`，也有状态归一化逻辑 `normalizeDrawState`、`isDrawStateEqual`、`patchDrawStyle`。
- `state-engine/document.ts` 明确依赖其 normalize/equality。

建议迁移：

- 纯类型
  - `BrushStyle`
  - `BrushStylePatch`
  - `DrawBrushState`
  - `DrawState`
  - `DrawStyle`
  - `DrawPreview`
  -> `src/types/draw.ts`
- 状态默认值与归一化逻辑
  - `DEFAULT_DRAW_STATE`
  - `normalizeDrawState`
  - `isDrawStateEqual`
  - `readDrawSlot`
  - `readDrawBrushStyle`
  - `readDrawStyle`
  - `setDrawSlot`
  - `patchDrawStyle`
  -> `src/state-engine/draw.ts`

### 4.4 `session/viewport.ts`

现状判断：

- 这是 `ViewportRuntime` 等 runtime 接口定义，不像 session。
- 被 `state-engine/runtime.ts` 间接使用。

建议迁移：

- `ViewportPointer`、`ViewportRuntime` -> `src/types/viewport.ts`
  - 如果你想减少文件数，也可以并到 `src/types/editor.ts`

删除清单：

- 删除 `src/session/draw/model.ts`
- 删除 `src/session/draw/state.ts`
- 删除 `src/session/viewport.ts`
- 删除空目录 `src/session/draw`
- 删除空目录 `src/session`

---

## 5. `input` -> `editor/input/*` + `types/interaction.ts`

当前目录：

- `src/input/core/*`
- `src/input/features/*`
- `src/input/hover/*`
- `src/input/interaction/*`
- `src/input/session/*`
- `src/input/host.ts`
- `src/input/runtime.ts`

现状判断：

- 这是当前最重的横切目录。
- 里面混合了：
  - 公共类型
  - gesture 运行时
  - feature bindings
  - hover 状态辅助
  - 输入 host 装配
- 但从职责上看，这整套都是 editor 输入子系统，应该归 `editor`。

建议迁移原则：

- 公共类型进入 `types`
- 具体输入运行时进入 `editor`
- 只为状态归一化服务的 helper 进入 `state-engine`

### 5.1 `input/core/types.ts`

建议迁移：

- `InteractionMode`
- `PointerMode`
- `InteractionSessionTransition`
- `InteractionSession`
- `InteractionStartResult`
- `InteractionBinding`
- `InteractionRuntime`
-> `src/types/interaction.ts`

原因：

- `protocol/index.ts` 已经把 `InteractionMode` 作为公共协议类型暴露。
- `state-engine/document.ts` 也把它作为稳定状态的一部分使用。

### 5.2 `input/core/gesture.ts`

建议迁移：

- `GestureKind`
- `InteractionDraft`
- `ActiveGesture`
- `createGesture`
-> `src/editor/input/gesture.ts`

原因：

- 这是纯 editor 输入运行时，不应落在顶层 `input`。

### 5.3 `input/core/runtime.ts`

建议迁移：

- `src/input/core/runtime.ts` -> `src/editor/input/runtime-core.ts`

### 5.4 `input/features/*`

建议迁移：

- 整体移动到 `src/editor/input/features/*`

原因：

- 全部是 editor binding 与交互特性，不是独立公共层。

### 5.5 `input/session/*`

建议迁移：

- `result.ts` -> `src/editor/input/session-result.ts`
- `autoPan.ts` -> `src/editor/input/auto-pan.ts`
- `press.ts` -> `src/editor/input/press-session.ts`
- `tuning.ts` -> `src/editor/input/tuning.ts`

原因：

- 这些都是输入运行时内部实现，不需要顶层 `session`/`input` 双重层。

### 5.6 `input/hover/*`

建议迁移：

- `input/hover/edge.ts` -> `src/editor/input/hover-edge.ts`
- `input/hover/store.ts`
  - `HoverState` 是从 `@whiteboard/editor-scene` re-export，不必单独自建类型层
  - `EMPTY_HOVER_STATE` / `isHoverStateEqual` / `normalizeHoverState` / `toHoverStateFromPick`
  - 更适合放到 `src/state-engine/hover.ts`

原因：

- `state-engine/document.ts` 与 `state-engine/runtime.ts` 使用的是 hover 的 normalize/equality 语义。

### 5.7 `input/interaction/mode.ts`

建议迁移：

- 并入 `src/types/interaction.ts`，作为 `isEdgeInteractionMode`
- 或者放 `src/editor/input/interaction-mode.ts`

我的建议：

- 并入 `src/types/interaction.ts`
- 因为它只是 `InteractionMode` 的判定 helper

### 5.8 `input/host.ts` / `input/runtime.ts`

建议迁移：

- `src/input/host.ts` -> `src/editor/input-host.ts`
- `src/input/runtime.ts` -> `src/editor/input-runtime.ts`

删除清单：

- 整个 `src/input` 目录最终应删除

---

## 6. `protocol` -> `types/protocol.ts`

当前文件：

- `src/protocol/index.ts`

现状判断：

- 这是纯 re-export 层，没有自己的领域实现。
- 但包导出里有：
  - `"./protocol": "./src/protocol/index.ts"`

建议迁移：

- 新建 `src/types/protocol.ts`
- 将当前 `protocol/index.ts` 的导出全部搬过去
- `package.json` 中的 subpath export 改为：
  - `"./protocol": "./src/types/protocol.ts"`

理由：

- 这样可以保留现有外部 API，不必保留 `src/protocol` 目录。

删除清单：

- 删除 `src/protocol/index.ts`
- 删除空目录 `src/protocol`

---

## 类型去重重点清单

下面是这次最值得优先处理的类型重复或近重复问题。

## A. `NodeFieldValueKind` vs `NodeStyleFieldKind`

位置：

- `src/types/node/spec.ts`
- `src/types/node/read.ts`

现状：

- `NodeFieldValueKind = 'string' | 'number' | 'numberArray'`
- `NodeStyleFieldKind = 'string' | 'number' | 'numberArray'`

判断：

- 这是完全重复的 union。
- 语义区别只是“一个用于 schema，一个用于 style support read”。

建议：

- 保留一个统一名字，建议叫 `NodeValueKind`
- 放在 `src/types/node/spec.ts` 或新建 `src/types/node/common.ts`
- `NodeFieldSpec.kind` 与 `NodeTypeSupport.supportsStyle(..., kind)` 全部使用同一个类型

收益：

- 消灭完全重复定义
- 避免后续某一边扩展后发生漂移

---

## B. `EditorWrite` 名称冲突

位置：

- `src/action/types.ts`
- `src/write/types.ts`
- `src/types/editor.ts`

现状：

- `src/write/types.ts` 里有真正的 mutation 写接口 `EditorWrite`
- `src/types/editor.ts` 里又把 `EditorActions` 通过 `import type { EditorActions as EditorWrite }` 伪装成另一个 `EditorWrite`

判断：

- 这是当前最危险的命名遗留之一。
- 同名但语义不同：
  - 一个是“底层 write API”
  - 一个是“用户动作 actions API”

建议：

- `write/types.ts` 保留 `EditorWrite`
- `action/types.ts` 保留 `EditorActions`
- `types/editor.ts` 中不要再把 `EditorActions` 别名成 `EditorWrite`
- `Editor.actions` 字段明确使用 `EditorActions`
- `Editor.write` 字段明确使用 `EditorWrite`

这是必须处理项。

---

## C. `EditorProjection` 是阶段性包装类型，应并入 `types/editor.ts`

位置：

- `src/editor/projection/types.ts`
- `src/types/editor.ts`

现状：

- `EditorProjection` 只服务于 projection 装配过程。
- 同时 `EditorSceneFacade`、`EditorSceneUi` 已在 `types/editor.ts` 存在。

建议：

- 要么删除并内联
- 要么统一进 `types/editor.ts`，命名为 `EditorSceneProjection`

这不是“完全重复”，但确实是多余中转层。

---

## D. `preview/types.ts` 中多个名称本质是 editor domain types，不应留在 `preview`

位置：

- `src/preview/types.ts`

关键类型：

- `NodePreviewPatch`
- `NodePreviewEntry`
- `NodePresentation`
- `TextLayoutPreview`
- `TextPreviewPatch`
- `EdgeFeedbackEntry`
- `EdgeConnectFeedback`
- `EdgeGuide`
- `MarqueePreviewState`
- `MindmapPreviewState`
- `SelectionPreviewState`

判断：

- 这些不是“preview 子模块私有类型”，而是 editor overlay 的公共领域模型。
- 它们应该变成 `types/preview.ts`，再由 `state-engine` 与 `editor` 共同消费。

建议：

- 统一迁到 `src/types/preview.ts`
- 只保留纯类型
- 任何 normalize/equality/compose helper 不要放进去

---

## E. `NodePatch` 命名过泛，且与 core patch 语义高度重叠

位置：

- `src/preview/types.ts`

现状：

- `NodePatch = Pick<NodeFieldPatch, 'position' | 'size' | 'rotation'>`

问题：

- 名字太宽泛，容易被误解为通用 node patch。
- 实际只是几何 patch 的窄子集。

建议：

- 改名为 `NodeGeometryPatch`
- 放到 `src/types/preview.ts`

---

## F. `EditorInteractionState` vs `EditorStableInteractionState`

位置：

- `src/types/editor.ts`
- `src/state-engine/document.ts`

现状：

- `EditorStableInteractionState` 是持久化/稳定状态形状
- `EditorInteractionState` 是面向 UI 的派生只读视图

判断：

- 这不是重复定义，但命名很容易误导。

建议：

- `EditorStableInteractionState` 重命名为 `EditorInteractionSnapshot`
- `EditorInteractionState` 保留或改成 `EditorInteractionView`

这样能明显降低阅读成本。

---

## G. `types/node/index.ts` 是必要 barrel，但 `types/node/spec.ts` 与 `types/node/read.ts` 的边界可以继续收紧

现状：

- `spec.ts` 定义 schema/meta/behavior
- `read.ts` 定义 capability/read/support
- `support.ts` 实现 runtime support factory

建议：

- `types/node/index.ts` 保留
- `support.ts` 若想让 `types` 更纯，可以迁到 `editor/node-type-support.ts`
- 但如果当前项目接受 “types 目录允许少量轻量工厂”，也可以先不动

这里不是必须第一批处理。

---

## H. `types/tool.ts`、`types/input.ts`、`types/selectionPresentation.ts` 是合理归属，不建议拆散

结论：

- 这三类文件已经在正确目录。
- 后续应作为迁移落点，而不是继续被别的目录反向定义。

---

## 详细迁移与删除清单

下面给一份偏执行视角的清单。

## 第一批：先处理最小成本的纯类型搬迁

- `src/session/edit.ts` -> `src/types/edit.ts`
- `src/clipboard/packet.ts` 中 `ClipboardPacket` -> `src/types/clipboard.ts`
- `src/input/core/types.ts` -> `src/types/interaction.ts`
- `src/preview/types.ts` -> `src/types/preview.ts`
- `src/session/viewport.ts` -> `src/types/viewport.ts`
- `src/protocol/index.ts` -> `src/types/protocol.ts`

完成后可删除：

- `src/protocol`
- `src/clipboard`
- `src/session/edit.ts`

## 第二批：处理 draw 状态与 preview 状态

- `src/session/draw/model.ts`
  - 类型/常量 -> `src/types/draw.ts`
- `src/session/draw/state.ts`
  - 类型 -> `src/types/draw.ts`
  - state helper -> `src/state-engine/draw.ts`
- `src/preview/state.ts` -> `src/state-engine/preview/state.ts`
- `src/preview/edge.ts` -> `src/state-engine/preview/edge.ts`
- `src/preview/node.ts` -> `src/state-engine/preview/node.ts`
- `src/preview/selection.ts` -> `src/state-engine/preview/selection.ts`

完成后可删除：

- `src/preview`
- `src/session/draw`

## 第三批：处理 editor 输入子系统整并

- `src/input/runtime.ts` -> `src/editor/input-runtime.ts`
- `src/input/host.ts` -> `src/editor/input-host.ts`
- `src/input/core/runtime.ts` -> `src/editor/input/runtime-core.ts`
- `src/input/core/gesture.ts` -> `src/editor/input/gesture.ts`
- `src/input/features/*` -> `src/editor/input/features/*`
- `src/input/session/*` -> `src/editor/input/*`
- `src/input/hover/edge.ts` -> `src/editor/input/hover-edge.ts`
- `src/input/hover/store.ts` -> `src/state-engine/hover.ts`
- `src/input/interaction/mode.ts` -> `src/types/interaction.ts` 或 `src/editor/input/interaction-mode.ts`

完成后可删除：

- 整个 `src/input`

## 第四批：清掉最后的中转层和命名遗留

- `src/editor/projection/types.ts` 删除，类型并入 `src/types/editor.ts`
- `src/action/types.ts` 中所有与 `write/types.ts` 平行的结构做一次对齐
- `src/types/editor.ts` 去掉 `EditorActions as EditorWrite` 别名
- `src/index.ts` 与 package exports 改成只依赖保留目录

完成后可删除：

- `src/editor/projection/types.ts`
- 全部旧目录残留中转 import

---

## 强烈建议优先处理的 import 改造

这些 import 是删除旧目录的主要阻塞点。

- `src/index.ts`
  - 当前直接依赖 `clipboard/packet`、`session/*`
- `src/protocol/index.ts`
  - 当前直接依赖 `session/*`、`input/core/types.ts`
- `src/types/editor.ts`
  - 当前直接依赖 `preview/types`、`session/*`、`input/core/types.ts`
- `src/state-engine/document.ts`
  - 当前直接依赖 `input/core/types.ts`、`input/hover/store.ts`、`preview/state.ts`、`session/*`
- `src/input/runtime.ts`
  - 当前直接依赖 `preview/state.ts`
- `src/action/types.ts`
  - 当前直接依赖 `clipboard/packet`、`session/*`

如果这些文件不先改，旧目录删不掉。

---

## 推荐的目标目录结构

只看 `src` 的一种可落地版本：

```text
src/
  action/
  editor/
    createEditor.ts
    projection.ts
    input-runtime.ts
    input-host.ts
    clipboard.ts
    input/
      gesture.ts
      runtime-core.ts
      auto-pan.ts
      press-session.ts
      tuning.ts
      session-result.ts
      hover-edge.ts
      features/
  state-engine/
    document.ts
    delta.ts
    intents.ts
    runtime.ts
    draw.ts
    hover.ts
    preview/
      state.ts
      edge.ts
      node.ts
      selection.ts
  tasks/
  types/
    clipboard.ts
    draw.ts
    edit.ts
    editor.ts
    input.ts
    interaction.ts
    pick.ts
    preview.ts
    protocol.ts
    selectionPresentation.ts
    tool.ts
    viewport.ts
    node/
  write/
  index.ts
```

---

## 风险与注意点

- `package.json` 当前保留了 `"./protocol"` subpath export。删 `src/protocol` 前必须先改出路由。
- `types/editor.ts` 是现阶段最大的聚合点，迁移时容易形成新的“超级类型文件”。建议只把公共 editor 根类型放这里，像 `draw`、`edit`、`interaction`、`preview`、`viewport` 这些拆成独立文件。
- `types/node/support.ts` 是否留在 `types` 需要你定标准。如果你想把 `types` 变成纯 type barrel，这个文件应迁走；如果你更看重聚合性，可以暂时保留。
- `action/types.ts` 与 `write/types.ts` 的关系需要一次明确决策：
  - `action` 是用户动作 API
  - `write` 是底层 mutation API
  - 两者都可以保留，但命名不能继续混淆

---

## 最终结论

这个包确实存在比较多的“中转层 + 类型遗留层”。从当前依赖关系看，最合理的收敛方向是：

- 把所有公共类型统一沉到 `src/types`
- 把输入运行时和 clipboard runtime 统一沉到 `src/editor`
- 把 preview/hover/draw 这类状态标准化与组合逻辑统一沉到 `src/state-engine`
- 保留 `action`、`write`、`tasks` 作为行为层

最优先的去重项有三个：

- 合并 `NodeFieldValueKind` 与 `NodeStyleFieldKind`
- 取消 `EditorActions as EditorWrite` 这类误导性别名
- 将 `preview/types.ts`、`input/core/types.ts`、`session/edit.ts` 这类“公共类型藏在运行时目录”的问题一次性纠正

如果后续要真正开始落迁移，建议先从“纯类型搬迁 + public export 改造”开始，再处理输入运行时整并；否则会在 `input` 和 `state-engine` 的交叉引用里反复返工。

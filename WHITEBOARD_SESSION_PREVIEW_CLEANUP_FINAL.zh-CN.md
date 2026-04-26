# WHITEBOARD_SESSION_PREVIEW_CLEANUP_FINAL

## 最终文件布局

### 保留在 `whiteboard/packages/whiteboard-editor/src/session`

- `runtime.ts`
- `edit.ts`
- `interaction.ts`
- `selection.ts`
- `viewport.ts`
- `draw/model.ts`
- `draw/runtime.ts`
- `draw/state.ts`
- `preview/state.ts`
- `preview/types.ts`
- `preview/merge.ts`
- `preview/node.ts`
- `preview/edge.ts`
- `preview/selection.ts`

### 新增到 `whiteboard/packages/whiteboard-editor/src/editor/source`

- `session.ts`
- `selection.ts`

### 删除

- `whiteboard/packages/whiteboard-editor/src/session/source.ts`
- `whiteboard/packages/whiteboard-editor/src/session/panel.ts`
- `whiteboard/packages/whiteboard-editor/src/session/read.ts`
- `whiteboard/packages/whiteboard-editor/src/session/state.ts`
- `whiteboard/packages/whiteboard-editor/src/session/types.ts`
- `whiteboard/packages/whiteboard-editor/src/session/preview/index.ts`
- `whiteboard/packages/whiteboard-editor/src/session/preview/selectors.ts`

## 文件迁移清单

### 1. `session/source.ts` -> `editor/source/session.ts`

迁移文件：

- `whiteboard/packages/whiteboard-editor/src/session/source.ts`

目标文件：

- `whiteboard/packages/whiteboard-editor/src/editor/source/session.ts`

迁移动作：

- 文件整体移动并重命名
- `createSessionSource` 重命名为 `createEditorSessionSource`
- 删除参数 `state?: EditorSessionState`
- 删除 `createSessionState(...)` 依赖
- 删除 `createSessionRead(...)` 依赖
- `projectWorldRect(...)` 删除

代码改法：

- `selectionMembers / selectionSummary / selectionAffordance / selectionViewSummary / selectionViewAffordance / selectionView / selectionNodeSelected / selectionNodeStats / selectionEdgeStats / selectionNodeScope / selectionEdgeScope / selectionOverlay / selectionToolbar / chromeMarquee / chromeDraw / chromeSnap / selectedEdgeChrome / mindmapChrome / viewportZoom / viewportCenter / chromeView / panelView / selectionSource / toolSource` 全部保留在新文件
- `chromeMarquee` 改为：
  - 读取 `graph.stores.graph.state.chrome.preview.marquee`
  - 用 `graph.query.view.screenRect(marquee.worldRect)` 生成 `rect`
- `chromeDraw` 改为直接读取 `graph.stores.graph.state.chrome.preview.draw`
- `chromeSnap` 改为直接读取 `graph.stores.graph.state.chrome.preview.guides`
- `chrome.edgeGuide` 改为直接读取 `graph.stores.graph.state.chrome.preview.edgeGuide`
- `toolSource` 直接读取 `session.state.tool`
- `viewport` public read 直接读取 `session.viewport.read` 与 `session.viewport.input`
- `interaction` public derived state逻辑直接内联到本文件，不再通过 `session/state.ts`

### 2. `session/panel.ts` -> `editor/source/selection.ts`

迁移文件：

- `whiteboard/packages/whiteboard-editor/src/session/panel.ts`

目标文件：

- `whiteboard/packages/whiteboard-editor/src/editor/source/selection.ts`

迁移动作：

- 文件整体移动并重命名
- 保留并原样导出下面四个函数：
  - `readNodeScope`
  - `readEdgeScope`
  - `resolveSelectionOverlay`
  - `resolveSelectionToolbar`
- `editor/source/session.ts` 改为从 `@whiteboard/editor/editor/source/selection` 导入这四个函数

### 3. `session/state.ts` 删除并内联到 `editor/source/session.ts`

删除文件：

- `whiteboard/packages/whiteboard-editor/src/session/state.ts`

迁移动作：

- 把 `createSessionState(...)` 的全部实现内联到 `editor/source/session.ts`
- 不再单独保留 `EditorSessionState` runtime builder 文件

代码改法：

- 在 `editor/source/session.ts` 内部创建：
  - `interactionState = store.createDerivedStore<EditorInteractionState>(...)`
- 直接使用：
  - `session.state.tool`
  - `session.state.draw`
  - `session.state.edit`
  - `session.state.selection`
  - `session.viewport.read`

### 4. `session/read.ts` 删除并内联到 `editor/source/session.ts`

删除文件：

- `whiteboard/packages/whiteboard-editor/src/session/read.ts`

迁移动作：

- 删除 `ToolRead`
- 删除 `SessionRead`
- 删除 `createToolRead(...)`
- 删除 `createSessionRead(...)`

代码改法：

- `editor/source/session.ts` 里直接写：
  - `toolSource = { get, subscribe, type, value, is }`
  - `viewport` public read 直接从 `session.viewport.read` 和 `session.viewport.input` 取
- 不再保留 `sessionRead.chrome`

### 5. `session/types.ts` 并入 `action/types.ts`

删除文件：

- `whiteboard/packages/whiteboard-editor/src/session/types.ts`

目标文件：

- `whiteboard/packages/whiteboard-editor/src/action/types.ts`

迁移动作：

- 把下面两个类型移动到 `action/types.ts`：
  - `SelectionSessionDeps`
  - `EditSessionDeps`

调用方修改：

- `whiteboard/packages/whiteboard-editor/src/action/selection.ts`
- `whiteboard/packages/whiteboard-editor/src/action/clipboard.ts`

改法：

- 从 `@whiteboard/editor/action/types` 导入 `SelectionSessionDeps`
- 删除 `@whiteboard/editor/session/types` 导入

### 6. `session/preview/index.ts` 删除

删除文件：

- `whiteboard/packages/whiteboard-editor/src/session/preview/index.ts`

替代方案：

- `session/runtime.ts` 直接从 `@whiteboard/editor/session/preview/state` 导入 `createPreviewState`
- 类型直接从 `@whiteboard/editor/session/preview/types` 导入

### 7. `session/preview/selectors.ts` 删除

删除文件：

- `whiteboard/packages/whiteboard-editor/src/session/preview/selectors.ts`

迁移动作：

- `node` preview keyed projection 迁移到 `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`
- `edge` preview keyed projection 迁移到 `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`
- `draw / edgeGuide / snap / marquee` selector 全部删除，不再保留 session preview selector

代码改法：

- `editor/source/session.ts` 不再从 session preview 读 selector
- `draw / edgeGuide / snap / marquee` 一律直接从 `graph.stores.graph.state.chrome.preview` 读

### 8. `session/preview/types.ts` 收成 raw state type

修改文件：

- `whiteboard/packages/whiteboard-editor/src/session/preview/types.ts`

删除类型：

- `NodePreviewProjection`
- `EdgePreviewProjection`
- `MarqueePreview`
- `EditorInputPreviewSelectors`
- `EditorInputPreview`

保留类型：

- `EditorInputPreviewState`
- `EditorInputPreviewWrite`
- 所有 raw preview state entry / patch / guide / mindmap preview type

新增类型：

- 不新增

### 9. `session/preview/node.ts` 删除 projection 逻辑

修改文件：

- `whiteboard/packages/whiteboard-editor/src/session/preview/node.ts`

保留：

- `EMPTY_NODE_PATCHES`
- `EMPTY_TEXT_PREVIEW_PATCHES`
- `EMPTY_NODE_HIDDEN`
- `EMPTY_NODE_SELECTION_FEEDBACK`
- `EMPTY_NODE_FEEDBACK`
- raw patch equal / normalize / merge helper

删除：

- `EMPTY_NODE_FEEDBACK_PROJECTION`
- `EMPTY_NODE_FEEDBACK_MAP`
- `isNodeProjectionEqual`
- `toNodeFeedbackMap`

迁移目标：

- `isNodeProjectionEqual`
- `toNodeFeedbackMap`

迁移到：

- `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`

### 10. `session/preview/edge.ts` 删除 projection 逻辑

修改文件：

- `whiteboard/packages/whiteboard-editor/src/session/preview/edge.ts`

保留：

- `EMPTY_EDGE_FEEDBACK_ENTRIES`
- `EMPTY_EDGE_GUIDE`
- `EMPTY_EDGE_FEEDBACK`
- `isEdgeGuideEqual`
- `normalizeEdgeFeedbackState`

删除：

- `EMPTY_EDGE_FEEDBACK_PROJECTION`
- `EMPTY_EDGE_FEEDBACK_MAP`
- `isEdgeProjectionEqual`
- `toEdgeFeedbackMap`

迁移目标：

- `isEdgeProjectionEqual`
- `toEdgeFeedbackMap`

迁移到：

- `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`

### 11. `session/preview/selection.ts` 删除 screen 投影

修改文件：

- `whiteboard/packages/whiteboard-editor/src/session/preview/selection.ts`

保留：

- `EMPTY_GUIDES`
- `EMPTY_SELECTION_FEEDBACK`
- `isSelectionFeedbackStateEqual`
- `normalizeSelectionFeedbackState`

删除：

- `isMarqueeFeedbackEqual`
- `projectWorldRect`

新增纯函数：

目标文件：

- `whiteboard/packages/whiteboard-core/src/geometry/viewport.ts`

新增：

```ts
projectPoint(input: {
  point: Point
  zoom: number
  worldRect: Rect
}): Point

projectRect(input: {
  rect: Rect
  zoom: number
  worldRect: Rect
}): Rect
```

调用方改法：

- `editor-scene.query.view.screenPoint/screenRect` 复用这两个 pure primitive
- `editor/source/session.ts` 不再自己写 rect 投影

### 12. `session/runtime.ts` 收成纯 session runtime

修改文件：

- `whiteboard/packages/whiteboard-editor/src/session/runtime.ts`

改法：

- 删除 `createEditorInputPreview` 导入
- 改为导入 `createPreviewState`
- `preview` 改成：

```ts
preview: {
  state: {
    get,
    subscribe
  },
  write: {
    set,
    reset
  }
}
```

- 删除 `viewport` 对 preview 的注入

### 13. `editor/createEditor.ts` 更新装配

修改文件：

- `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`

改法：

- 删除 `createSessionState` 导入
- 删除 `const sessionState = createSessionState(session)`
- 从 `@whiteboard/editor/editor/source/session` 导入 `createEditorSessionSource`
- `createEditorSessionSource(...)` 调用时不再传 `state`

### 14. `editor-scene/src/runtime/read.ts` 接管 preview keyed projection

修改文件：

- `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`

新增：

- node transient preview keyed projection
- edge transient preview keyed projection

来源：

- 迁入 `session/preview/node.ts` 的 `isNodeProjectionEqual` / `toNodeFeedbackMap`
- 迁入 `session/preview/edge.ts` 的 `isEdgeProjectionEqual` / `toEdgeFeedbackMap`

要求：

- editor 不再保留一份独立 preview keyed selector
- 所有 committed + draft + preview 合并读统一由 editor-scene 提供

## 调用方修改清单

### `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`

- `createSessionSource` -> `createEditorSessionSource`
- 删除 `createSessionState(...)`

### `whiteboard/packages/whiteboard-editor/src/action/selection.ts`

- `SelectionSessionDeps` 改从 `@whiteboard/editor/action/types` 导入

### `whiteboard/packages/whiteboard-editor/src/action/clipboard.ts`

- `SelectionSessionDeps` 改从 `@whiteboard/editor/action/types` 导入

## 完成标准

- `session` 目录内不再存在 public read / presentation 组装文件
- `session/preview` 不再存在 selector
- `session/preview` 不再依赖 viewport
- `editor/source/session.ts` 成为唯一的 editor session public read 组装入口
- `editor/source/selection.ts` 成为唯一的 selection toolbar / overlay presentation 解析入口
- `action/types.ts` 成为 action 侧 session contract 的唯一位置

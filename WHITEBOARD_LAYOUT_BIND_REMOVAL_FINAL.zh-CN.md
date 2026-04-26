# WHITEBOARD_LAYOUT_BIND_REMOVAL_FINAL

## 结论

只删除 `whiteboard/packages/whiteboard-editor/src/layout/runtime.ts` 里的：

- `patchNodeCreatePayload`
- `patchMindmapTemplate`
- `patchNodeUpdate`
- `resolvePreviewPatches`

还不够，`bind` 不能直接去掉。

原因很简单：

- 这四个里，前两个本来就不依赖 `bind`
- 真正让 `bind` 还存在的，是 `layout.draft.node`
- `layout.draft.node` 现在通过 `document.node(...) + document.nodeGeometry(...) + revision` 读 committed 状态，所以才需要 `bind`

一句话总结：

`bind` 的根因不是 create/update/preview patch，而是本地 `draft.node` 派生还留在 `layout/runtime.ts`。`

如果目标是长期最优，最终不应该是“继续保留 layout runtime，只是删掉几个方法”，而应该是：

- 删除整个 `layout/runtime.ts` 里的 stateful runtime 角色
- 删除 `bind`
- 删除 `layout.draft.node`
- 删除 `session.draft.nodes`
- 删除 `NodeDraft`
- 把“编辑中的 node 文本 draft measure”下沉到 `editor-scene`
- 把 create/update/preview 的 layout patch 逻辑拆成纯函数 helper，不再绑定 committed document

## 当前职责拆解

## 1. 现在谁依赖 `bind`

当前 `layout/runtime.ts` 里：

- `patchNodeCreatePayload`
- `patchMindmapTemplate`
- `patchNodeUpdate`
- `resolvePreviewPatches`
- `draft.node`
- `measureText`

其中只有两类东西会读 `bind` 注入的 `document + revision`：

### 1.1 真正依赖 committed read 的

- `patchNodeUpdate`
- `resolvePreviewPatches`
- `draft.node`

原因：

- `patchNodeUpdate` 要先拿 committed node / rect，再 apply update，再出测量 request
- `resolvePreviewPatches` 要拿 committed node / rect，补 text reflow / sticky auto-fit preview
- `draft.node` 要拿当前 edit node 的 committed node / rect，推导编辑中的 size / fit 结果

### 1.2 完全不依赖 committed read 的

- `patchNodeCreatePayload`
- `patchMindmapTemplate`
- `measureText`

原因：

- create payload 只吃 `payload + registry + backend`
- mindmap template patch 只是递归调用 create payload patch
- `measureText` 本身只是 text measure request 到 backend 的桥

所以：

`bind` 从来不是为了 create/template patch 存在的。`

## 2. 现在真正多余的是哪条链

当前多余链条是：

- [whiteboard/packages/whiteboard-editor/src/layout/runtime.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/layout/runtime.ts)
- [whiteboard/packages/whiteboard-editor/src/projection/adapter.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/projection/adapter.ts)
- [whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts)
- [whiteboard/packages/whiteboard-editor-scene/src/model/graph/node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/model/graph/node.ts)

当前流程：

1. editor 本地 `layout.draft.node` 先算出 `DraftMeasure`
2. `projection/adapter.ts` 把它转成 `session.draft.nodes`
3. `editor-scene` 再把它当 input 读进来
4. `graph/node.ts` 再把这个 draft 应用到 node view

这条链的问题：

- draft measure 明明是 scene graph 的一部分，却先在 editor 本地算一遍
- 然后再通过 input 再塞回 scene
- `editor-scene` 明明已经拿到了 `measure` callback 和 `session.edit`
- 但 draft node measure 还是没在 scene 内部统一算

这就是 `bind` 现在还存在的真正原因。

## 长期最优最终形态

## 1. 删除 `EditorLayout` runtime 角色

最终不再保留这种对象：

```ts
type EditorLayout = {
  bind(...)
  draft: { node: ... }
  patchNodeCreatePayload(...)
  patchMindmapTemplate(...)
  patchNodeUpdate(...)
  resolvePreviewPatches(...)
  measureText(...)
}
```

最终拆成两部分：

### 1.1 `editor-scene` 持有 live draft measure

由 `editor-scene` 直接基于：

- committed document
- session.edit
- preview patch
- measure callback

计算 node draft measure。

### 1.2 editor 本地只保留纯 text layout helper

create/update/preview 如果仍需要同步 patch 行为，不再挂在 runtime 对象上，而是变成纯函数 helper。

这些 helper：

- 不持有状态
- 不读 committed document store
- 不需要 `bind`
- 只吃显式参数

## 2. `editor-scene` 最终 API

新增 public query：

文件：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`

最终 API：

```ts
query: {
  node: {
    get(id: NodeId): NodeView | undefined
    draft(id: NodeId): DraftMeasure | undefined
    idsInRect(...)
  }
}
```

约束：

- `node.draft(id)` 只返回当前 edit session 下的 text draft measure
- 只有正在编辑且可测量的 node 才返回值
- 返回值直接复用现有 `DraftMeasure`

这样：

- [whiteboard/packages/whiteboard-editor/src/action/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/action/index.ts) 提交文本时，不再读 `layout.draft.node`
- [whiteboard/packages/whiteboard-editor/src/projection/adapter.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/projection/adapter.ts) 不再需要本地 `readNodeDrafts(...)`

## 3. 删除 `session.draft.nodes`

最终删除：

- `Input.session.draft.nodes`
- `NodeDraft`
- `GraphNodeEntry['draft']`
- 所有 `delta.session.draft.nodes`

原因：

- 现在 `NodeDraft` 实际只承载本地 layout runtime 算出来的 size / fit
- `kind: 'patch'` 没有实际生产者
- patch 语义已经有 `preview.nodes` 承担
- 文本编辑 draft measure 应直接在 `editor-scene` 内部计算，不应走 input 传输

最终保留：

- `session.draft.edges`

因为 edge draft 仍然是交互状态，不是 measure 派生。

## 4. 纯 layout helper 最终 API

新增文件：

- `whiteboard/packages/whiteboard-editor/src/layout/textLayout.ts`

最终 API：

```ts
export type TextLayoutMeasure = (
  request: TextMeasureTarget
) => Size | undefined

export const patchNodeCreateByTextMeasure(input: {
  payload: NodeInput
  registry: Pick<NodeRegistry, 'get'>
  measure: TextLayoutMeasure
}): NodeInput

export const patchMindmapTemplateByTextMeasure(input: {
  template: MindmapTemplate
  position?: Point
  registry: Pick<NodeRegistry, 'get'>
  measure: TextLayoutMeasure
}): MindmapTemplate

export const patchNodeUpdateByTextMeasure(input: {
  nodeId: NodeId
  node: Node
  rect: Rect
  update: NodeUpdateInput
  registry: Pick<NodeRegistry, 'get'>
  measure: TextLayoutMeasure
  origin?: Origin
}): NodeUpdateInput

export const patchNodePreviewByTextMeasure(input: {
  patches: readonly TransformPreviewPatch[]
  readNode(nodeId: NodeId): Node | undefined
  readNodeRect(nodeId: NodeId): Rect | undefined
  registry: Pick<NodeRegistry, 'get'>
  measure: TextLayoutMeasure
}): readonly TransformPreviewPatch[]
```

要点：

- 全部是纯函数
- 不保存 document read
- 不保存 revision
- 不保存 subscription
- 不需要 `bind`

## 5. DOM measure backend 最终保留

保留：

- [whiteboard/packages/whiteboard-react/src/runtime/whiteboard/layout.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/runtime/whiteboard/layout.ts)

但命名上它不再对应 `EditorLayout runtime`，而只对应：

- `TextMeasure`
- `LayoutBackend.measure(...)`

也就是说 React 侧仍然负责平台测量，但不再喂一个 editor 本地 stateful layout runtime。

## 为什么这是长期最优

## 1. `editor-scene` 已经拿到了 measure callback

[whiteboard/packages/whiteboard-editor/src/projection/bridge.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/projection/bridge.ts:264) 已经把 `layout.measureText` 传给了 `createEditorSceneRuntime({ measure })`。

而 `editor-scene` 里：

- [model/graph/node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/model/graph/node.ts:209) 已经能基于 `working.measure` 直接测量 node
- [model/graph/edge.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/model/graph/edge.ts:320) 已经能基于 `working.measure` 直接测量 edge label

所以 node text draft measure 放在 editor 本地是重复层，不是能力缺失。

## 2. `session.draft.nodes` 是无意义中转

现在这条链：

- local layout runtime 算 draft
- adapter 转成 scene input
- scene 再读回来生成 graph node view

这是典型的“派生值离开数据源，又被送回数据源”的结构噪音。

长期看一定应该删掉。

## 3. 纯 patch helper 不应该和 live draft query 混在一个 runtime 里

现在 `layout/runtime.ts` 同时承担了两种完全不同的职责：

- live query：`draft.node`
- pure transform helper：`patchNodeCreatePayload` / `patchMindmapTemplate` / `patchNodeUpdate` / `resolvePreviewPatches`

这正是它现在别扭的根因。

长期最优一定要拆开：

- live 的留在 `editor-scene`
- pure 的留在 editor 本地 helper

## 实施清单

## 阶段 1. 删掉 editor 本地 node draft 传输链

修改文件：

- `whiteboard/packages/whiteboard-editor/src/projection/adapter.ts`
- `whiteboard/packages/whiteboard-editor/src/projection/bridge.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/state.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/graph/node.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/view/patch.ts`

具体动作：

- 删除 `projection/adapter.ts` 中：
  - `toNodeDraft(...)`
  - `readNodeDrafts(...)`
  - `EMPTY_NODE_DRAFTS`
- `createSceneInput(...)` 不再写 `session.draft.nodes`
- 删除 `delta.session.draft.nodes`
- 删除 `Input['session']['draft']['nodes']`
- 删除 `NodeDraft`
- 删除 `GraphNodeEntry['draft']`
- `buildNodeUiView(...)` 中 `patched` 不再看 draft patch

## 阶段 2. 在 `editor-scene` 内部生成 draft measure

修改文件：

- `whiteboard/packages/whiteboard-editor-scene/src/model/graph/node.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`

具体动作：

- 新增内部 helper：
  - `readNodeDraftMeasure(...)`
- 它只基于：
  - `working.measure`
  - `entry.base.node`
  - `preview.patch`
  - `session.edit`
- `buildNodeView(...)` 直接使用 scene 内部 draft measure 结果
- `query.node.draft(nodeId)` 暴露该结果

## 阶段 3. 删除 `layout/runtime.ts` 的 `bind` 和 `draft.node`

修改文件：

- `whiteboard/packages/whiteboard-editor/src/layout/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`
- `whiteboard/packages/whiteboard-editor/src/action/index.ts`

具体动作：

- 删除 `EditorLayout.bind(...)`
- 删除 `EditorLayout.draft.node`
- `createEditor.ts` 不再调用 `layout.bind(...)`
- `action/index.ts` 中 node text commit 改读 `scene.query.node.draft(nodeId)`

## 阶段 4. 把 patch 逻辑移到纯 helper

修改文件：

- 新增 `whiteboard/packages/whiteboard-editor/src/layout/textLayout.ts`
- 修改 `whiteboard/packages/whiteboard-editor/src/write/node.ts`
- 修改 `whiteboard/packages/whiteboard-editor/src/write/mindmap/index.ts`
- 修改 `whiteboard/packages/whiteboard-editor/src/write/mindmap/topic.ts`
- 修改 `whiteboard/packages/whiteboard-editor/src/input/features/transform.ts`

具体动作：

- `patchNodeCreatePayload` 迁到 `textLayout.ts` 的 `patchNodeCreateByTextMeasure(...)`
- `patchMindmapTemplate` 迁到 `textLayout.ts` 的 `patchMindmapTemplateByTextMeasure(...)`
- `patchNodeUpdate` 迁到 `textLayout.ts` 的 `patchNodeUpdateByTextMeasure(...)`
- `resolvePreviewPatches` 迁到 `textLayout.ts` 的 `patchNodePreviewByTextMeasure(...)`
- 调用方直接传显式参数，不再通过 runtime 对象取状态

## 阶段 5. 最终删除 `layout/runtime.ts`

如果阶段 3 和阶段 4 都完成：

- 删除 `whiteboard/packages/whiteboard-editor/src/layout/runtime.ts`

然后新增一个最小出口文件，例如：

- `whiteboard/packages/whiteboard-editor/src/layout/index.ts`

只导出：

- `createTextMeasureResource(...)` 或现有 `textMetrics`
- `textLayout.ts` 里的纯 helper

## 最终态判断标准

- `layout/runtime.ts` 不再持有 document read
- `bind` 不存在
- `layout.draft.node` 不存在
- `session.draft.nodes` 不存在
- `NodeDraft` 不存在
- `query.node.draft(nodeId)` 存在
- node 文本 draft measure 只在 `editor-scene` 内部计算一次
- create/update/preview 的 layout patch 逻辑只保留为纯 helper

## 最终回答

回答最初问题：

- 只删 `patchNodeCreatePayload` / `patchMindmapTemplate` / `patchNodeUpdate` / `resolvePreviewPatches`，`bind` 还不能去掉
- 因为 `bind` 的真实依赖是 `layout.draft.node`
- 但如果按长期最优方案，把 `draft.node` 和 `session.draft.nodes` 一起下沉删除，那么 `bind` 可以彻底去掉

所以真正该删的不是“四个 patch 方法”，而是：

`layout runtime 作为一个 stateful runtime 这整个概念。`

# Whiteboard Input 最终中轴设计

## 1. 最终抉择

这份文档给出 `whiteboard/packages/whiteboard-editor/src/input` 的最终设计，不保留候选方案。

最终抉择如下：

1. 保留的全局中轴只有四个：
   - `InteractionSession`
   - `InteractionDraft`
   - `InteractionContext`
   - `createPressDragSession(...)`
2. 持久写入继续直连 `ctx.command.*`，不增加任何 command 翻译层。
3. input 只看到一个最小本地写入口，不再看到完整 `ctx.local`。
4. 所有 pointer interaction 预览统一进入 `InteractionDraft`。
5. hover 不是 session，不并入 `InteractionSession`；hover 只保留一个很薄的 store。
6. feedback 只做组合，不再接受 input feature 直接散写。
7. 不引入全局 `Action / Effect / Plan / Intent / Resolution` 协议。
8. feature 内也不默认保留私有 `plan / intent` 类型；只有真正跨事件边界的数据才允许以极小闭包或极小 payload 形式存在。
9. `selection` 继续单独保留为 `SelectionModelRead`，不并入 `query.selection`。
10. 不新增 `input/actions.ts`、`input/feedback.ts` 这类翻译层文件。

---

## 2. 真实边界

基于当前代码，真正稳定且必要的边界只有这些。

### 2.1 交互生命周期边界

`input/runtime.ts` 是唯一的 session 生命周期中轴：

- 启动 binding
- 挂载 active session
- 处理 replace / finish / cancel
- 同步 auto-pan
- 同步 active gesture

这条线本身设计是对的，应当保留。

---

### 2.2 预览组合边界

`local/feedback/state.ts` 是真正的 preview 组合边界。

当前的问题不是“没有中轴”，而是中轴输入不统一：

- 一部分 preview 走 `interaction.gesture`
- 一部分 preview 走 `local.feedback.draw`
- 一部分 preview 走 `local.feedback.mindmap`
- edge hover guide 也在直接写 `local.feedback.edge`

最终应当改成：

```ts
finalFeedback = compose(
  baseFeedback,
  interactionDraft,
  hoverDraft
)
```

其中：

- `baseFeedback`：非 pointer-interaction 的本地反馈
- `interactionDraft`：active session 的预览
- `hoverDraft`：闲时 hover 预览

---

### 2.3 读边界

`query` 是只读边界，应该尽量完整保留。

原因：

- input 是“读很多、写很少”的域
- `query` 已经是稳定只读面
- 再给 input 造一层读 adapter 没有收益

最终结论：

- 保留 `ctx.query`
- 不为 input 再做一层 read façade

---

### 2.4 写边界

写边界有两类，必须分开：

1. 持久写入：`ctx.command.*`
2. 本地写入：最小 `ctx.local`

这里最关键的点不是“都收口成一种语法”，而是：

- command 本来就是持久写中轴，不应该再包一层
- local 现在暴露过多，必须收窄

---

## 3. 明确删除的概念

以下概念明确删除，不再作为长期方案的一部分：

- `InputCommitEffect`
- `InputCommitResult`
- `InputLocalAction`
- `InputActionRuntime`
- `SelectionPressPlan`
- `EdgeLabelPressPlan`
- `EdgeInteractionStart`
- `SelectionPressResolution`
- `resolveSelectionPressPlan(...)`
- `applySelectionPressPlan(...)`
- `resolveEdgePress(...)`
- `applyEdgePress(...)`
- `MoveGesture / MarqueeGesture / TransformGesture / EdgeConnectGesture / EdgeMoveGesture / EdgeLabelGesture / EdgeRouteGesture`
- `SelectionPreviewState`
- `EdgeGestureDraft`
- feature 内部只用于一处的 `Effect` enum

这些概念的问题是一样的：

- 只是把马上执行的事情重新描述一遍
- 或者把同一类 preview 分裂成多套结构
- 或者把立即分支硬拆成 resolve/apply 两段

它们不提供稳定边界，只增加层级。

---

## 4. 最终 API

## 4.1 InteractionDraft

最终只保留一套 interaction preview 语言：

```ts
export type InteractionDraft = {
  nodePatches?: readonly NodePreviewEntry[]
  edgePatches?: readonly EdgeFeedbackEntry[]
  frameHoverId?: NodeId
  marquee?: MarqueeFeedbackState
  guides?: readonly Guide[]
  edgeGuide?: EdgeGuide
  drawPreview?: DrawPreview | null
  hiddenNodeIds?: readonly NodeId[]
  mindmap?: MindmapPreviewState
}
```

字段含义固定如下：

- `nodePatches`
  用于 node 几何预览与 text transform 预览
- `edgePatches`
  用于 edge move / route / connect / label 等一切 edge patch 预览
- `frameHoverId`
  用于 selection move 时 frame hover
- `marquee`
  用于 marquee 框
- `guides`
  用于 snap guides
- `edgeGuide`
  用于 edge connect / edge hover 的导向高亮与 preview path
- `drawPreview`
  用于自由笔画预览
- `hiddenNodeIds`
  用于 eraser 等临时隐藏
- `mindmap`
  用于 mindmap root/subtree drag 预览

这里不再拆成 selection 一套、edge 一套、draw 一套、mindmap 一套。

---

## 4.2 ActiveGesture

`ActiveGesture` 最终固定为：

```ts
export type ActiveGesture = {
  kind: GestureKind
  draft: InteractionDraft
}
```

这里保留 `kind` 的唯一目的：

- debug
- 观测
- 某些 presentation 侧的轻量模式判断

`kind` 不再决定 preview 数据结构。

---

## 4.3 InteractionContext

`InteractionContext` 最终固定为：

```ts
export type InputLocal = {
  tool: {
    set: (tool: Tool) => void
  }
  selection: {
    replace: (target: SelectionTarget) => void
    clear: () => void
  }
  edit: {
    startNode: (
      nodeId: NodeId,
      field: string,
      options?: {
        caret?: EditCaretTarget
      }
    ) => void
    startEdgeLabel: (
      edgeId: EdgeId,
      labelId: string,
      options?: {
        caret?: EditCaretTarget
      }
    ) => void
  }
  viewport: {
    panScreenBy: (delta: Point) => void
  }
}

export type InteractionContext = {
  query: EditorQueryRead
  selection: SelectionModelRead
  command: EditorCommandRuntime
  local: InputLocal
  layout: LayoutRuntime
  snap: SnapRuntime
  config: Readonly<BoardConfig>
}
```

这里的最终决定有三点。

### 第一，不保留完整 `ctx.local`

`ctx.local` 现在暴露了：

- session
- edit
- viewport
- draw
- feedback

input 实际需要的只是一小部分：

- `tool.set`
- `selection.replace / clear`
- `edit.startNode / startEdgeLabel`
- `viewport.panScreenBy`

所以最终只暴露这一小部分。

### 第二，不给 command 再包一层

`ctx.command` 直接保留。

原因很简单：

- command 已经是持久写中轴
- 包一层只会复制 API
- 没有减少耦合

### 第三，`selection` 保留独立

最终不把 `SelectionModelRead` 并进 `query.selection`。

原因：

- `query.selection` 是 presentation/read model
- input 真正需要的是 `summary + affordance`
- `SelectionModelRead` 是纯模型读边界，语义更清楚

这是一个保留，而不是历史包袱。

---

## 4.4 HoverDraft

hover 最终固定为一条很薄的线：

```ts
export type HoverDraft = {
  edgeGuide?: EdgeGuide
}

export type HoverStore = {
  get: () => HoverDraft
  set: (draft: HoverDraft) => void
  clear: () => void
}
```

最终决定：

- hover 不并进 `InteractionSession`
- hover 不新建更大的 runtime 概念
- 只保留一个 store

原因：

- hover 不是 pointer-captured session
- hover 没有 replace / finish / cancel 生命周期
- store 已经足够

---

## 5. Feedback 最终组合方式

## 5.1 BaseFeedback 的职责

`baseFeedback` 只保留非 pointer-interaction 的本地反馈。

基于当前代码，最终只保留：

- node text preview

也就是当前 `local.feedback.node.text` 这条线。

最终不再允许以下东西留在 `baseFeedback`：

- draw preview
- draw hidden
- edge interaction patches
- edge guide
- mindmap drag preview

这些都属于 interaction 或 hover，而不是 base。

---

## 5.2 compose 规则

最终 compose 规则固定如下：

```ts
composed.node =
  mergeNodeFeedback(
    base.nodeText,
    draft.nodePatches,
    draft.hiddenNodeIds
  )

composed.edge =
  mergeEdgeFeedback(
    draft.edgePatches
  )

composed.draw.preview =
  draft.drawPreview ?? null

composed.marquee =
  draft.marquee

composed.mindmap.preview =
  draft.mindmap

composed.snap =
  draft.guides ?? []

composed.edgeGuide =
  draft.edgeGuide ?? hover.edgeGuide
```

注意：

- interaction draft 优先于 hover
- hover 只在 interaction 没给 `edgeGuide` 时生效

原因：

- edge connect / edge route / edge label drag 时，interaction guide 才是权威状态
- hover 只是空闲态补充

---

## 5.3 compose 所在位置

最终不新增 `input/feedback.ts`。

compose 继续放在：

- `local/feedback/state.ts`

理由：

- feedback compose 本来就是 local feedback 域的职责
- 搬到 `input/feedback.ts` 只会制造一次额外跳转
- 这不是 input feature 逻辑，而是 local presentation 逻辑

---

## 6. Feature 级最终规则

## 6.1 通用规则

每个 feature 只允许三种行为：

1. 直接返回 session
2. 直接调用 `ctx.command.*`
3. 直接调用最小 `ctx.local.*`

不允许：

- 先 resolve 一个大对象，再 apply
- 先产出 action/effect，再翻译回 command/local
- 为一个立即执行分支发明显式 `Plan` / `Intent`

---

## 6.2 press 类交互的最终规则

`createPressDragSession(...)` 是唯一保留的通用 press 中轴。

最终规则：

- 能直接用闭包表达的 delayed 行为，就直接闭包
- 不新增显式 `Plan` / `Payload` 类型
- 只有当跨事件边界必须保存原始数据且闭包表达不清晰时，才允许加一个极小私有 payload 对象

当前代码下，最终长期最优是：

- `selection/press.ts`：允许保留 `resolveSelectionPressSubject(...)`
- 但不再保留 `SelectionPressPlan`
- 直接在 `tryStartSelectionPress(...)` 内构造 `createPressDragSession(...)` 需要的闭包

`resolveSelectionPressSubject(...)` 之所以允许保留，是因为它是一个真实的纯语义归一化边界：

- 输入：`pick + modifiers + selection + affordance + group context`
- 输出：归一化后的 subject

这个边界是稳定的，不是样板层。

---

## 6.3 selection/marquee

`selection/marquee.ts` 最终不保留本地 `Effect` enum。

最终规则：

- reducer 只保留真正需要的 state
- session step 直接应用：
  - `ctx.local.selection.replace(...)`
  - `interaction.gesture = ...`

原因：

- marquee effect 只在一个 session 内消费
- 再拆一层 `Effect` 没有复用收益

---

## 6.4 selection/move

最终允许 move interaction 直接做两类 local 调用：

- drag 前临时显示 selection
- cleanup 时恢复 selection

这是允许的，因为这两次写入就是 move session 的局部 UI 生命周期，不需要额外 abstraction。

最终不为它引入：

- move action
- visibility effect
- restore plan

---

## 6.5 edge/index

`edge/index.ts` 最终就是一个直接分支的 binding 入口。

它应该直接做：

- 能 start connect 就返回 connect session
- 能 start move 就返回 move session
- 能 start route 就返回 route session
- 需要立即选中 edge 就直接 `ctx.local.selection.replace(...)`
- 需要立即删 route point 就直接 `ctx.command.edge.route.remove(...)`

最终不保留：

- `EdgeInteractionStart`
- `resolveEdgePress(...)`
- `applyEdgePress(...)`

---

## 6.6 edge/label

`edge/label.ts` 最终不保留 `EdgeLabelPressPlan`。

最终写法固定为：

- 非单选：直接 `ctx.local.selection.replace(...)`，然后 `HANDLED`
- 单选：直接返回 `createPressDragSession(...)`
- `onTap` 直接 `ctx.local.edit.startEdgeLabel(...)`
- `createDragSession` 直接创建 label drag session

这里不需要任何中间描述层。

---

## 6.7 edge/connect

`edge/connect.ts` 最终仍然直接调用：

- `ctx.command.edge.patch(...)`
- `ctx.command.edge.create(...)`

创建成功后的 follow-up：

- 直接在成功分支内：
  - `ctx.local.tool.set({ type: 'select' })`
  - `ctx.local.selection.replace({ edgeIds: [createdId] })`

最终不新增：

- commit effect
- aftermath runtime
- create-edge action

原因：

- 这里只有一个非常短的成功后效
- 抽出去不会减少复杂度
- 只会把本地逻辑从附近移走

这里真正要解决的不是“要不要抽 helper”，而是“只能通过最小 local façade 写本地态”。

---

## 6.8 draw / mindmap / hover

这三条线最终都必须收进统一预览轴：

- `draw.ts` 不再写 `ctx.local.feedback.draw.*`
- `mindmap/drag.ts` 不再写 `ctx.local.feedback.mindmap.*`
- `hover/edge.ts` 不再写 `ctx.local.feedback.edge.*`

最终去向：

- draw -> `InteractionDraft.drawPreview / hiddenNodeIds`
- mindmap drag -> `InteractionDraft.mindmap`
- edge hover -> `HoverDraft.edgeGuide`

---

## 6.9 viewport

viewport 读写最终明确分离：

- 读：`ctx.query.viewport`
- 写：`ctx.local.viewport.panScreenBy(...)`

最终不把 viewport read/write 强行并成一个对象。

原因：

- `query.viewport` 已经是稳定读边界
- input 唯一需要的 viewport 写入口只有 `panScreenBy`
- 再造一个混合 viewport façade 没有收益

---

## 7. 文件职责最终归属

## 7.1 保留

- `input/runtime.ts`
- `input/types.ts`
- `input/context.ts`
- `input/press.ts`
- `input/gesture.ts`
- `input/selection/*`
- `input/edge/*`
- `input/draw.ts`
- `input/transform.ts`
- `input/mindmap/drag.ts`
- `input/hover/edge.ts`
- `input/viewport.ts`
- `local/feedback/state.ts`

---

## 7.2 不新增

最终明确不新增：

- `input/actions.ts`
- `input/feedback.ts`
- 任何新的 action/effect translation layer

理由：

- 这些文件不会增加真正边界
- 只会复制现有 command/local API

---

## 7.3 需要重写的文件

从长期最优看，优先重写这些：

1. `input/gesture.ts`
   统一成单一 `ActiveGesture`
2. `local/feedback/types.ts`
   删除 `SelectionPreviewState` / `EdgeGestureDraft`
3. `local/feedback/state.ts`
   改成 `base + interaction + hover` compose
4. `input/context.ts`
   收窄到最终 `InputLocal`
5. `input/draw.ts`
   去掉 `local.feedback.draw.*`
6. `input/mindmap/drag.ts`
   去掉 `local.feedback.mindmap.*`
7. `input/hover/edge.ts`
   去掉 `local.feedback.edge.*`
8. `input/selection/press.ts`
   去掉 plan/apply 结构化思路，直接闭包化
9. `input/edge/index.ts`
   去掉中间 union，直接分支
10. `input/edge/label.ts`
   去掉 `EdgeLabelPressPlan`

---

## 8. 实施顺序

## 阶段 1：统一 preview 协议

完成：

- `InteractionDraft`
- `ActiveGesture`
- `gesture.ts` 简化

验收：

- input 域只剩一套 preview 类型

---

## 阶段 2：统一 feedback compose

完成：

- draw/mindmap/edge hover 全部移出 `local.feedback actions`
- `local/feedback/state.ts` 改成 `base + interaction + hover`

验收：

- `input/` 内不再出现 `ctx.local.feedback`

---

## 阶段 3：收窄 context

完成：

- `InteractionContext.local` 收窄成最终 `InputLocal`

验收：

- `input/` 内不再出现：
  - `ctx.local.session`
  - `ctx.local.edit`
  - `ctx.local.viewport.viewport`

---

## 阶段 4：删除中间描述层

完成：

- 删除 `SelectionPressPlan`
- 删除 `EdgeLabelPressPlan`
- 删除 `EdgeInteractionStart`
- 删除 feature 内一处消费的一次性 effect enum

验收：

- input feature 只剩：
  - 直接分支
  - 真实 state machine
  - `createPressDragSession(...)` 闭包

---

## 9. 最终验收标准

全部完成时，必须同时满足：

1. `input/` 内没有 `InputCommitEffect`、`InputLocalAction`、`Plan`、`Intent`、`Resolution` 这类全局协议。
2. `input/` 内没有直接写 `ctx.local.feedback.*`。
3. `InteractionContext` 不暴露完整 `EditorLocalActions`。
4. `ActiveGesture` 只有一套 `draft` 结构。
5. hover 只通过 `HoverStore` 进入 feedback compose。
6. draw / mindmap / edge hover 的 preview 都能从 `interactionDraft` 或 `hoverDraft` 直接解释。
7. command 仍然直连，没有任何新的 command 翻译层。
8. 除 `resolveSelectionPressSubject(...)` 这类真实纯边界外，不再保留额外命名层。

---

## 10. 结论

最终长期最优不是“给 input 再搭一套协议系统”，而是：

- 保留真正的生命周期边界：`InteractionSession`
- 保留真正的预览边界：`InteractionDraft`
- 保留真正的持久写边界：`ctx.command`
- 把本地写边界收窄成最小 `ctx.local`
- 把 hover 收成一个很薄的 store
- 删除所有描述再执行的翻译层

这条线复杂度最低，语义最直，也最不容易再次长出旁路。

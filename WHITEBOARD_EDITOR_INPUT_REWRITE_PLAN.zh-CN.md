# WHITEBOARD_EDITOR_INPUT_REWRITE_PLAN

## 1. 目标

这份文档只服务 input 重构，不讨论兼容，不保留过渡实现，不接受“双层 input runtime”继续存在。

最终目标：

1. `input` 不再有自己的“runtime 世界”。
2. `input` 彻底贴着 `editor` 工作，只把 `editor` 作为唯一主轴。
3. `whiteboard-editor/src/input/runtime.ts` 这一桥接层要被删除。
4. `input` 最终只保留三类东西：
   - input host
   - interaction runtime
   - interaction features
5. preview / hover / binding 组装不再形成一层独立的 input 中轴抽象。

---

## 2. 当前问题

## 2.1 `input/runtime.ts` 仍然是桥接层

当前 [whiteboard/packages/whiteboard-editor/src/input/runtime.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/runtime.ts) 实际承担了：

1. 定义 `EditorInputContext = { editor, layout }`
2. 创建 interaction runtime
3. 组装 bindings
4. 管理 preview 同步
5. 初始化 edge hover service
6. 最后再调用 `createEditorInputHost(...)`

这说明 `input` 现在仍是：

1. 先造一个 input 内部装配层
2. 再把 editor 能力接进来
3. 再生成真正的 host

这不符合“input 只是 editor 的 interaction 编排层”这个最终目标。

## 2.2 `host.ts` 仍然不是唯一装配入口

当前 [whiteboard/packages/whiteboard-editor/src/input/host.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/host.ts) 主要负责：

1. pointer/context menu/wheel/key 事件分发
2. hover state 写入
3. interaction runtime 转调用

但它没有真正负责：

1. 绑定 feature
2. 创建 interaction runtime
3. 创建 hover service
4. 组装 preview sync

这些职责仍然留在 `input/runtime.ts`。所以现在 host 只是“最终宿主出口”，不是 input 的真正中轴。

## 2.3 input feature 虽然用上了新字段，但组织方式还不够新

目前 feature 已经大量切到：

1. `ctx.editor.actions.*`
2. `ctx.editor.write.*`
3. `ctx.editor.runtime.*`
4. `ctx.editor.read()`

但组织上仍有几个问题：

1. 大量 feature 继续使用 `Pick<EditorInputContext, 'editor'>`
2. 一部分 feature 仍依赖 `ctx.editor.scene.ui.state.*` 作为主读取入口
3. input 自己没有一份清晰的“允许依赖面”规范

这意味着虽然字段名新了，但 input 还没有真正成为“贴着 editor 编排”的体系。

## 2.4 preview / hover 仍是 input 内部的中转世界

现在 preview 和 hover 的关系是：

1. `runtime.ts` 保管 gesture
2. `runtime.ts` 保管 edgeGuide
3. `runtime.ts` 调 `composeEditorPreviewState(...)`
4. `host.ts` 只在 pointerMove / cancel / blur 等事件里调 hover 清理

这套结构说明：

1. `editor` 还不是 preview/hover 的唯一组织中心
2. input 自己还保留了一个装配态的临时世界

## 2.5 `gesture` / `InteractionDraft` 当前就是公共中转协议

当前链路是明确存在的：

1. feature/session 里通过 `createGesture(...)` 产出 `ActiveGesture`
2. `ActiveGesture` 挂一个通用 `InteractionDraft`
3. `input/runtime.ts` 把 `gesture` 喂给 `composeEditorPreviewState(...)`
4. `composeEditorPreviewState(...)` 再把 draft 合成为 `overlay.preview.set`

对应代码位置：

1. [whiteboard/packages/whiteboard-editor/src/input/core/gesture.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/core/gesture.ts)
2. [whiteboard/packages/whiteboard-editor/src/preview/state.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/preview/state.ts)
3. [whiteboard/packages/whiteboard-editor/src/input/runtime.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/runtime.ts)

这说明：

1. `gesture` 不是单纯的 host 私有变量。
2. `InteractionDraft` 不是局部临时对象，而是 input 的公共草稿协议。
3. `composeEditorPreviewState(...)` 是明显的中转合成层。

这条链不符合最终目标，应该被拆掉。

---

## 3. 最终原则

## 3.1 input 不再有独立 runtime 命名

最终不应该存在：

1. `createEditorHost(...)`
2. `EditorInputRuntimeHost`
3. `input/runtime.ts`

这些命名会继续暗示：

1. input 有自己的 runtime
2. host 是 runtime 的消费者
3. editor 只是被接入 input

最终应该只剩：

1. `createEditorInput(...)`
2. 或更直接：`createEditorInputHost({ editor, layout })`

也就是 input 只是 editor 的一个能力出口，不再有“input runtime”中转概念。

## 3.2 input host 成为唯一装配入口

最终 input 组装应当集中到一个入口里完成。

建议最终形状：

```ts
createEditorInputHost({
  editor,
  layout
})
```

这个入口内部直接完成：

1. interaction runtime 创建
2. feature binding 组装
3. edge hover service 创建
4. preview sync 创建
5. host 事件出口绑定

不再允许先经过 `runtime.ts` 再进 host。

## 3.3 input 只允许依赖 editor 主轴

feature 可以依赖的能力面必须明确收敛为：

1. `editor.actions`
2. `editor.write`
3. `editor.runtime`
4. `editor.scene`
5. `editor.document`
6. `editor.read()`
7. `layout`

除此之外，不再允许 input 内部自定义第二套 read/runtime/session/projection 协议。

## 3.4 feature 不再依赖 `EditorInputContext` 名义桥

`EditorInputContext` 当前虽然很薄，但它还是一层“input 自己的上下文命名”。

长期更简单的方式是：

1. 直接传 `editor`
2. 只有需要 layout 的 feature 再显式传 `layout`

也就是：

1. 纯 editor feature：`ctx: Pick<Editor, ...>`
2. 需要 layout 的 feature：`{ editor, layout }`

如果保留 `EditorInputContext`，它也只能是：

```ts
type EditorInputDeps = {
  editor: Editor
  layout: WhiteboardLayoutService
}
```

并且只允许作为 host 内部装配临时参数，不再作为 input 主协议名称。

## 3.5 `gesture` 不再作为公共协议层存在

最终不应继续保留：

1. `ActiveGesture`
2. `InteractionDraft`
3. `createGesture(...)`
4. `composeEditorPreviewState(...)`
5. `readPersistentPreviewState(...)`

这里的判断标准不是“交互过程中不能有临时变量”，而是：

1. 可以有 session 私有局部状态。
2. 不能再有一套跨 feature、跨 host、跨 preview 的通用草稿协议。

最终应改成：

1. feature/session 内部保留自己的局部几何状态
2. preview 直接写单一 truth
3. commit 直接走 `actions / commands / write`

也就是：

1. 不要 `gesture -> draft -> preview`
2. 只保留 `session local state -> preview`

## 3.6 interaction runtime 参数直接吃 `editor`

当前 `createInteractionRuntime(...)` 还在吃 adapter：

1. `getViewport`
2. `getBindings`
3. `state.readInteraction`
4. `state.dispatch`
5. `state.setGesture`
6. `state.getSpace`

这本质上仍然是桥接参数驱动。

最终应收敛为：

```ts
createInteractionRuntime({
  editor,
  bindings
})
```

至少要做到：

1. `editor` 直接传入
2. `bindings` 直接传数组
3. interaction runtime 自己直接用 `editor.runtime.viewport.*`
4. interaction runtime 自己直接用 `editor.read()`
5. interaction runtime 自己直接用 `editor.dispatch(...)`
6. 不保留 `onPreviewChange`
7. 不保留 `setGesture`

明确要求：

1. preview 不通过 runtime callback 回传
2. preview 不通过 host 合成
3. feature / session 直接直写 `overlay.preview.set`

---

## 4. 需要重写的地方

## 4.1 删除 `input/runtime.ts`

文件：[whiteboard/packages/whiteboard-editor/src/input/runtime.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/runtime.ts)

当前问题：

1. 是明显桥接层
2. input preview / hover / interaction 都在这里拼装
3. 命名上继续制造“input runtime”概念

必须重写为：

1. 删除整个文件
2. `createEditorHost` 删除
3. `EditorInputRuntimeHost` 删除
4. `EditorInputContext` 从这里移除

替代方案：

1. 把组装逻辑并回 `input/host.ts`
2. 或把极少数纯工具型函数拆到：
   - `input/preview.ts`
   - `input/bindings.ts`
   - `input/hover.ts`

但不再保留 `runtime.ts`

## 4.2 重写 `input/host.ts`

文件：[whiteboard/packages/whiteboard-editor/src/input/host.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/host.ts)

目标：

让它从“事件宿主”升级为“input 唯一装配入口”。

需要做：

1. 直接接收 `{ editor, layout }`
2. 内部创建 interaction runtime
3. 内部创建 edge hover service
4. 内部维护 gesture / edgeGuide
5. 内部创建 preview sync
6. 内部注册各类 bindings
7. 直接返回 `EditorInputHost`

重写后不应再要求外部先提供：

1. `interaction`
2. `edgeHover`

因为这些都属于 input 自己的装配职责。

## 4.3 把 preview sync 从桥接层内联到 host

当前 preview sync 是：

1. `runtime.ts` 保存 `gesture`
2. `runtime.ts` 保存 `edgeGuide`
3. `runtime.ts` 调 `composeEditorPreviewState`
4. `interaction.setGesture` 和 `edgeHover.write` 通过闭包触发 `syncPreview`

这套机制本身没问题，但不该待在 `runtime.ts`。

最终应更进一步，不再迁入 host 继续合成，而是直接取消这层。

要求：

1. `gesture` 不迁入 host，直接删除
2. `edgeGuide` 不再单独缓存后合成
3. `syncPreview()` 删除
4. 外部看不到 preview bridge 概念
5. preview 一律直写 `overlay.preview.set`

## 4.4 把 hover service 组装迁到 host

当前 `createEdgeHoverService(...)` 在 `runtime.ts` 初始化，再注入 host。

这层是多余的。

最终应变成：

1. host 自己创建 hover service
2. host 自己决定何时 `move/clear`
3. host 自己把 hover 与 preview 联动

这样 input 才是一个整体，而不是：

1. 外面拼 hover
2. 里面消费 hover

## 4.5 把 bindings 注册迁到 host

当前 bindings 是在 `runtime.ts` 里通过 `getBindings()` 注册：

1. `createViewportBinding`
2. `createDrawBinding`
3. `createEdgeBinding`
4. `createTransformBinding`
5. `createSelectionBinding`

这些本质上属于 input host 的装配职责。

最终应改为：

1. host 内部直接构造 binding 列表
2. interaction runtime 只负责运行 binding，不负责装配 binding
3. 不再由外部桥接层提供 `getBindings`

## 4.6 `input/core/runtime.ts` 收窄为纯 interaction 引擎

文件：[whiteboard/packages/whiteboard-editor/src/input/core/runtime.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/core/runtime.ts)

这层应保留，但定位必须更清楚：

1. 它不是 editor runtime
2. 它不是 input runtime
3. 它只是 interaction session scheduler / dispatcher

它只应该关心：

1. 当前 interaction session
2. pointer / key / wheel / blur 生命周期
3. autoPan / gesture 刷新

不应该关心：

1. preview state 组合
2. hover service 生命周期
3. feature binding 来源
4. editor 能力 adapter 拼装

进一步要求：

1. `getViewport` 删除
2. `getBindings` 删除
3. `state.readInteraction` 删除
4. `state.dispatch` 删除
5. `state.getSpace` 删除
6. `state.setGesture` 删除

这些都由 `editor` 直供。

## 4.7 feature 依赖签名需要统一

当前 feature 里依然大量出现：

1. `Pick<EditorInputContext, 'editor'>`
2. `EditorInputContext['editor']['scene']`
3. `EditorInputContext['editor']['scene']['ui']['selection']['summary']['get']`

这类写法虽然类型上成立，但可读性差，而且仍然强调“input context”而不是 “editor 主轴”。

最终建议：

1. 纯 editor feature 直接写 `Pick<Editor, ...>`
2. 需要 layout 的地方单独显式传 `layout`
3. 函数签名优先表达真实依赖，而不是从 `EditorInputContext` 里层层取路径

例如：

```ts
type TransformDeps = {
  editor: Pick<Editor, 'scene' | 'document' | 'runtime' | 'write'>
  layout: WhiteboardLayoutService
}
```

或者更进一步，直接局部传：

```ts
{
  scene,
  document,
  runtime,
  write,
  layout
}
```

而不是一直挂着一个大 `ctx.editor`

## 4.8 `scene.ui.state.*` 读取要分层审查

当前很多 feature 读取：

1. `ctx.editor.scene.ui.state.tool`
2. `ctx.editor.scene.ui.state.viewport`
3. `ctx.editor.scene.ui.selection.summary`
4. `ctx.editor.scene.ui.selection.affordance`

这里要分两类看：

1. 如果这是 scene projection 的最终产品态读取，保留是合理的。
2. 如果只是为了拿 editor state 原始值，则应改用 `editor.read()` 或 `editor.runtime.*`

明确原则：

1. 原始 editor state 读：优先 `editor.read()`
2. 场景投影结果读：使用 `editor.scene.*` / `editor.scene.ui.*`

不能继续混杂。

---

## 5. 建议的最终 input 结构

最终建议目录职责如下：

### 5.1 保留

1. `input/host.ts`
2. `input/core/runtime.ts`
3. `input/core/gesture.ts`
4. `input/core/types.ts`
5. `input/core/snap.ts`
6. `input/features/**`
7. `input/session/**`
8. `input/hover/**`

### 5.2 删除

1. `input/runtime.ts`

### 5.3 可选新增

如果 host 过重，可以拆出非常薄的内部模块，但它们只能是 host 私有装配助手，不能形成第二套 runtime：

1. `input/host.preview.ts`
2. `input/host.bindings.ts`
3. `input/host.hover.ts`

注意：

这些文件只是物理拆分，不是新的架构层。

---

## 6. 最终推荐 API 走向

## 6.1 `createEditor()` 里直接创建 input

当前：

1. `createEditor()` -> `createEditorHost(...)`
2. `createEditorHost(...)` -> `createEditorInputHost(...)`

最终建议：

1. `createEditor()` -> `createEditorInputHost({ editor, layout })`

中间不再经过 `runtime.ts`

## 6.2 `createEditorInputHost(...)` 的最终输入

建议最终直接是：

```ts
createEditorInputHost({
  editor,
  layout
})
```

不再是：

```ts
createEditorInputHost({
  editor,
  interaction,
  edgeHover
})
```

因为后者说明 host 不是中轴，只是消费外部桥接产物。

## 6.3 input feature 的最终依赖面

最终希望 feature 只围绕这些能力工作：

1. `editor.actions`
2. `editor.write`
3. `editor.runtime`
4. `editor.scene`
5. `editor.document`
6. `editor.read()`
7. `layout`

这就是 input 唯一合法主轴。

---

## 7. 分阶段实施清单

### Phase 1：删除桥接层

1. 删除 `input/runtime.ts`
2. 把其内部逻辑迁入 `input/host.ts`
3. `createEditor.ts` 改为直接调用新的 `createEditorInputHost({ editor, layout })`

验收标准：

1. `input/runtime.ts` 不存在
2. `createEditorHost` 不存在
3. `EditorInputRuntimeHost` 不存在

### Phase 2：host 成为唯一装配入口

1. host 内部创建 interaction runtime
2. host 内部创建 bindings
3. host 内部创建 hover service
4. host 内部创建 preview sync

验收标准：

1. input 没有第二个装配中轴
2. host 成为唯一装配入口

### Phase 3：feature 依赖签名压平

1. 清理 `EditorInputContext` 路径式类型引用
2. 纯 editor feature 直接依赖 `Editor`
3. 需要 layout 的 feature 显式依赖 `layout`

验收标准：

1. feature 签名更直接
2. 不再层层通过 `EditorInputContext['editor']['...']` 取类型

### Phase 4：区分原始状态读取与 scene 投影读取

1. 原始 editor state 统一走 `editor.read()` / `editor.runtime.*`
2. scene 投影统一走 `editor.scene.*`

验收标准：

1. feature 不再混用原始态和投影态读取
2. 读取路径有明确分层

## 4.9 删除 `gesture` / draft / preview compose 链

必须删除：

1. [whiteboard/packages/whiteboard-editor/src/input/core/gesture.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/core/gesture.ts)
2. [whiteboard/packages/whiteboard-editor/src/preview/state.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/preview/state.ts) 里的 `composeEditorPreviewState(...)`
3. [whiteboard/packages/whiteboard-editor/src/preview/state.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/preview/state.ts) 里的 `readPersistentPreviewState(...)`

原因：

1. 它们把 input 交互过程抽象成了第二套公共协议。
2. preview 不再是单一 truth，而是“base + gesture + edgeGuide”的合成结果。
3. host/input 需要先持有 gesture，再合成 preview，链路过长。

最终应改成：

1. 不保留 host 私有 preview 合成器
2. feature/session 直接计算下一帧 preview 片段
3. 直接：

```ts
editor.dispatch({
  type: 'overlay.preview.set',
  preview: nextPreview
})
```

4. 不保留 `onPreviewChange`
5. 不保留“先通知 host，再由 host 合成 preview”这层

---

## 5. `gesture` 是否有必要

结论：

1. 作为“公共协议层”没有必要。
2. 作为“session 局部变量名”可以存在，但不值得保留独立抽象。

更具体地说：

1. `InteractionDraft` 必须删除。
2. `ActiveGesture` 必须删除。
3. `createGesture(...)` 必须删除。
4. 每个 session 自己保留局部状态是合理的。
5. 但这些局部状态不应再统一包装成一套跨 feature 的 draft 协议。
6. preview 必须就地直写，不能通过 callback 上抛。

换句话说：

1. 可以有“当前拖拽中的节点补丁数组”这个局部变量。
2. 不需要把它包装成 `gesture.draft.nodePatches` 再统一合成。

---

## 6. 直接迁移原则

为了彻底去掉 `gesture` 中转层，input 里的逻辑要分成两类迁移：

### 6.1 直接走 `actions / write / commands`

这类是 commit 行为，不需要任何 `gesture`：

1. 工具切换、选择切换、interaction mode 切换
2. viewport 平移/缩放
3. 节点/边/脑图实际写入
4. 编辑提交

落点：

1. 产品语义操作：`editor.actions.*`
2. 低层写入：`editor.write.*`
3. editor state 修改：`editor.dispatch(command)`

### 6.2 直接写单一 preview truth

这类是交互中的临时表现，不需要 `gesture` 作为公共协议：

1. draw preview
2. marquee preview
3. selection move preview
4. transform preview
5. edge connect preview
6. edge move / route / label preview
7. mindmap drag preview
8. hover edge guide preview

落点：

1. feature/session 内部直接计算下一帧 preview
2. 直接写 `overlay.preview.set`
3. 不再经过 `draft -> compose` 合成
4. 不再通过 `onPreviewChange`

---

## 7. 按 feature 的详细迁移清单

### 7.1 `input/features/viewport.ts`

当前：

1. 已直接用 `editor.actions.viewport.panScreenBy(...)`
2. 不依赖 `gesture`

结论：

1. 保持 direct action
2. 不需要任何 preview 中转

### 7.2 `input/features/draw.ts`

当前：

1. 用 `createGesture('draw', { drawPreview, hiddenNodeIds })`
2. commit 时走 `editor.actions.node.create(...)`
3. 橡皮擦提交时走 `editor.actions.node.delete(...)`

需要重写：

1. 删除 `createGesture(...)`
2. draw session 内部直接生成下一帧 `preview.draw`
3. draw session 在 `move/up/cancel/cleanup` 中直接写/清 preview
4. commit 继续保留 `editor.actions.node.create/delete`

最终迁移：

1. preview：直接写 preview truth
2. commit：保留 `actions.node.*`

### 7.3 `input/features/selection/marquee.ts`

当前：

1. 一边 `selection.set`
2. 一边 `createGesture('selection-marquee', { marquee, guides })`

需要重写：

1. marquee 框和 guides 直接写 preview truth
2. 选择结果继续直接 `dispatch({ type: 'selection.set' })`
3. `syncMarqueeInteraction(...)` 不再改 `interaction.gesture`
4. 改成直接写 `overlay.preview.set`

最终迁移：

1. preview：`overlay.preview.set.selection.marquee`
2. selection：直接 command

### 7.4 `input/features/selection/move.ts`

当前：

1. `createGesture('selection-move', { nodePatches, edgePatches, frameHoverId, guides })`
2. commit 时 `editor.write.canvas.selection.move(...)`

需要重写：

1. 把 `nodePatches / edgePatches / frameHoverId / guides` 直接写 preview truth
2. `project(...)` 不再给 `interaction.gesture` 赋值
3. 改为 `project(...)` 内直接写 `overlay.preview.set`
4. commit 继续保留 `editor.write.canvas.selection.move(...)`

最终迁移：

1. preview：直接 `overlay.preview.set`
2. commit：保留 `write.canvas.selection.move`

### 7.5 `input/features/transform.ts`

当前：

1. `createGesture('selection-transform', { nodePatches, guides })`
2. commit 时 `editor.write.node.updateMany(...)`

需要重写：

1. preview patch 直接写单一 preview truth
2. `project(...)` 不再写 `interaction.gesture`
3. 改为 transform session 内直接写 preview
4. commit 保留低层写入

最终迁移：

1. preview：直接 preview
2. commit：`write.node.updateMany`

### 7.6 `input/features/edge/connect.ts`

当前：

1. `createGesture('edge-connect', { edgePatches, edgeGuide })`
2. commit 时：
   - `editor.actions.edge.reconnectCommit(...)`
   - `editor.actions.edge.create(...)`
   - `editor.actions.tool.select()`
   - `selection.set`

需要重写：

1. edge guide 和 reconnect draft patch 直接写 preview truth
2. `project(...)` 不再 `return createGesture(...)`
3. interaction session 不再持有 `gesture`
4. 改为 `project(...)` 内直接写 preview
5. commit 保持 direct actions/commands

最终迁移：

1. preview：直接 preview truth
2. commit：保留 `actions.edge.* + actions.tool.select + selection.set`

### 7.7 `input/features/edge/move.ts`

当前：

1. `createGesture('edge-move', { edgePatches })`
2. commit 时 `editor.actions.edge.move(...)`

需要重写：

1. preview edge patch 直接写 preview truth
2. 不再构造 `gesture`
3. commit 保留 direct action

### 7.8 `input/features/edge/route.ts`

当前：

1. `createGesture('edge-route', { edgePatches })`
2. commit 时：
   - `editor.actions.edge.route.set(...)`
   - `editor.actions.edge.route.movePoint(...)`

需要重写：

1. route draft 直接写 preview truth
2. `readRouteGesture(...)` 删除
3. 改为 `readRoutePreview(...)` 或直接 `dispatch preview`
4. commit 保持 direct action

### 7.9 `input/features/edge/label.ts`

当前：

1. `createGesture('edge-label', { edgePatches })`
2. commit 时 `editor.actions.edge.label.patch(...)`

需要重写：

1. label draft patch 直接写 preview truth
2. 不再通过 `gesture`
3. commit 保留 direct action

### 7.10 `input/features/mindmap/drag.ts`

当前：

1. `createGesture('mindmap-drag', { mindmap })`
2. commit 时：
   - `editor.actions.mindmap.moveRoot(...)`
   - `editor.actions.mindmap.moveByDrop(...)`

需要重写：

1. rootMove / subtreeMove 直接写 preview truth
2. `project(...)` 不再给 `interaction.gesture` 赋值
3. 改为 `project(...)` 内直接写 preview
4. commit 保留 direct action

### 7.11 `input/hover/edge.ts`

当前：

1. edge hover service 读取 snap
2. 写 `edgeGuide`
3. 再通过 `composeEditorPreviewState(...)` 并进 preview

需要重写：

1. edge hover guide 直接更新单一 preview truth
2. `createEdgeHoverService(...)` 不再通过 `writeGuide -> syncPreview`
3. 改为 hover move/clear 时直接写 `overlay.preview.set`
4. 不再经过 host 外部的 edgeGuide + compose 合成

---

## 8. 需要直接改的文件

以下文件必须改，且改法应以“preview 直写”为准：

### 8.1 必删文件

1. [whiteboard/packages/whiteboard-editor/src/input/runtime.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/runtime.ts)
2. [whiteboard/packages/whiteboard-editor/src/input/core/gesture.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/core/gesture.ts)

### 8.2 必重写文件

1. [whiteboard/packages/whiteboard-editor/src/input/host.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/host.ts)
2. [whiteboard/packages/whiteboard-editor/src/input/core/runtime.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/core/runtime.ts)
3. [whiteboard/packages/whiteboard-editor/src/input/core/types.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/core/types.ts)
4. [whiteboard/packages/whiteboard-editor/src/input/hover/edge.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/hover/edge.ts)
5. [whiteboard/packages/whiteboard-editor/src/preview/state.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/preview/state.ts)
6. [whiteboard/packages/whiteboard-editor/src/input/features/draw.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/features/draw.ts)
7. [whiteboard/packages/whiteboard-editor/src/input/features/selection/marquee.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/features/selection/marquee.ts)
8. [whiteboard/packages/whiteboard-editor/src/input/features/selection/move.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/features/selection/move.ts)
9. [whiteboard/packages/whiteboard-editor/src/input/features/transform.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/features/transform.ts)
10. [whiteboard/packages/whiteboard-editor/src/input/features/edge/connect.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/features/edge/connect.ts)
11. [whiteboard/packages/whiteboard-editor/src/input/features/edge/move.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/features/edge/move.ts)
12. [whiteboard/packages/whiteboard-editor/src/input/features/edge/route.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/features/edge/route.ts)
13. [whiteboard/packages/whiteboard-editor/src/input/features/edge/label.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/features/edge/label.ts)
14. [whiteboard/packages/whiteboard-editor/src/input/features/mindmap/drag.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/features/mindmap/drag.ts)
15. [whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts)

### 8.3 配套类型/状态文件

以下文件需要同步收缩或删除旧字段：

1. [whiteboard/packages/whiteboard-editor/src/preview/types.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/preview/types.ts)
2. [whiteboard/packages/whiteboard-editor/src/state-engine/intents.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/state-engine/intents.ts)
3. [whiteboard/packages/whiteboard-editor/src/state-engine/delta.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/state-engine/delta.ts)

这里不是说 `overlay.preview.set` 要删除，而是：

1. preview 类型要直接服务单一 truth
2. 不再服务 gesture/draft compose 这条链

---

## 9. 最终建议的数据流

最终 input 应改成两条直接链：

### 8.1 commit 链

```ts
feature/session
  -> editor.actions / editor.write / editor.dispatch
```

### 8.2 preview 链

```ts
feature/session
  -> nextPreview
  -> editor.dispatch({ type: 'overlay.preview.set', preview: nextPreview })
```

中间不再允许出现：

```ts
feature/session
  -> nextPreview
  -> overlay.preview.set
```

---

## 10. 最终目录和职责补充

如果按上面的方案落地，input 目录最终职责应变成：

1. `host.ts`
   唯一装配入口，直接持有 preview truth。
2. `core/runtime.ts`
   只做 interaction session 调度，直接吃 `editor`。
3. `features/**`
   只负责：
   - 计算 commit
   - 计算下一帧 preview
4. `hover/**`
   如果保留，也只能是 host 私有工具，不再形成 service 中轴。

---

## 11. 明确不允许保留的东西补充

除了前文已有项，以下也不应继续保留：

1. `ActiveGesture`
2. `InteractionDraft`
3. `createGesture(...)`
4. `composeEditorPreviewState(...)`
5. `readPersistentPreviewState(...)`
6. 任何以 `gesture.draft.*` 为核心的数据流
7. `onPreviewChange`
8. `setGesture`
9. “host 先收 callback，再统一合成 preview”

---

## 12. 最终结论补充

从代码现状看，`gesture` 不是必要的最终架构层。

真正必要的是两类能力：

1. session 内部的局部几何状态
2. 单一 preview truth 的直接写入

因此最终应该：

1. 删除 `gesture` 作为公共协议层的存在。
2. 删除 `InteractionDraft`。
3. 把各 feature 的预览输出直接改写为 preview truth。
4. 把 commit 继续直接落到 `actions / commands / write`。

只有这样，input 才算真正彻底贴着 `editor` 工作，而不是继续在内部维持一套“交互草稿语言”。

---

## 8. 明确不允许保留的东西

1. `input/runtime.ts`
2. `createEditorHost(...)`
3. `EditorInputRuntimeHost`
4. 外部先组装 `interaction` 再传给 host
5. 外部先组装 `edgeHover` 再传给 host
6. `EditorInputContext` 继续作为 input 主协议名称长期存在
7. input 自己维护一层独立于 editor 的 runtime 概念

---

## 9. 最终结论

目前 input 已经不再使用旧的多层 session/read/projection runtime，但它还没有彻底贴着 `editor` 工作。问题的核心不是字段名，而是结构：

1. `input/runtime.ts` 还在做桥接。
2. `host.ts` 还不是唯一中轴。
3. feature 还没有完全按 editor 主轴重新收敛依赖。

最终正确状态应该是：

1. input 没有 runtime 桥接层。
2. host 是唯一装配入口。
3. feature 只依赖 `editor` 主轴与 `layout`。
4. preview / hover / interaction 都只是 host 内部细节。

只有做到这一步，才算“input 彻底贴着 editor 工作”。

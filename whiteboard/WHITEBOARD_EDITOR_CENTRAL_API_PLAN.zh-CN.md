# WHITEBOARD_EDITOR 中轴 API 方案

## 目标

这份方案只回答一件事：

`whiteboard-editor` 内部到底应该如何收敛“写状态”的权力边界，让 interaction/session 能明显变简单。

本版刻意**不讨论 effect / reaction / async side effect**。先把最核心的问题收住：

1. 谁能写状态
2. 写状态只能从哪里进
3. interaction/session 和这个中轴 API 的关系是什么
4. director 到底还需要保留什么

---

## 一、结论先行

问题核心不是 interaction 放在 React 还是放在 editor/kernel。

真正的问题是：**系统里存在太多合法写入口**，导致 interaction 即使搬进 React，也只是把复杂度换了位置，没有真正消失。

最优收敛方向不是继续讨论 deps 局部化，而是直接确立一个硬约束：

**读可以多源，写必须单点。**

也就是：

1. `read` 可以继续按领域拆开，保持丰富。
2. `commands`、`runtime.state.*.set`、`overlay.set`、`interaction control.update` 这几条写链不能继续并存。
3. `whiteboard-editor` 内部必须收敛到一个中轴写 API。
4. 所有 interaction / session / UI façade / public commands，最终都只能调用这一个中轴。

一句话总结：

**不是 interaction 放到 React 就会简单，而是写状态的权力必须先统一。**

---

## 二、当前结构里真正的问题

基于当前 `packages/whiteboard-editor` 代码，复杂度主要来自这几个点：

### 1. 写入口分裂

现在 interaction 可以分别通过这些路径改系统状态：

1. `ctx.commands.*`
2. `ctx.overlay.set(...)`
3. `ctx.state.xxx.set(...)`
4. `control.update(...)`
5. 某些 runtime 内部的 reset / clear / reconcile

这意味着 interaction 不只是“描述行为”，而是在直接操作多套底层容器。

结果就是每个 interaction 都要知道：

1. 哪些状态是 document
2. 哪些状态是 session runtime
3. 哪些状态是 preview overlay
4. 哪些状态是 view runtime
5. 哪些状态要在结束时清理
6. 哪些状态要在 document 写入后 reconcile

这不是 React 问题，这是底层写模型问题。

### 2. `createEditor.ts` 负担过重

当前 [`packages/whiteboard-editor/src/runtime/editor/createEditor.ts`](/Users/realrong/whiteboard/packages/whiteboard-editor/src/runtime/editor/createEditor.ts) 同时承担：

1. runtime state 组装
2. overlay 组装
3. read 组装
4. commands 组装
5. interaction runtime 组装
6. 输入分发 façade
7. pointer 写入
8. cancel / clear / reset 协调
9. interaction state 派生

这说明系统还没有真正形成“单一写中轴”，所以初始化层不得不承担过多粘合责任。

### 3. `InteractionCtx` 是大号 service locator

[`packages/whiteboard-editor/src/runtime/interaction/ctx.ts`](/Users/realrong/whiteboard/packages/whiteboard-editor/src/runtime/interaction/ctx.ts) 目前把下面这些都暴露给 interaction：

1. `read`
2. `state`
3. `config`
4. `commands`
5. `overlay`
6. `snap`

这里最大的问题不是字段多，而是 **interaction 拿到的是“容器级能力”**，不是“意图级能力”。

interaction 一旦拿到 `state` 和 `overlay`，就天然会演变成直接拼装底层状态 shape 的地方。

### 4. interaction runtime 过于框架化

[`packages/whiteboard-editor/src/runtime/interaction/runtime.ts`](/Users/realrong/whiteboard/packages/whiteboard-editor/src/runtime/interaction/runtime.ts) 里现在有：

1. owner
2. feature
3. priority
4. observe
5. control.update
6. 通用 session 壳

但真实行为其实已经天然是 session-first：

1. draw stroke / erase
2. selection press / marquee / move
3. transform
4. edge connect / reconnect
5. viewport pan
6. mindmap drag

也就是说，自然模型已经存在，但外面又包了一层偏“通用框架”的 owner/runtime 壳，把问题重新抽象复杂了。

---

## 三、架构裁决

### 裁决 1：确立单一中轴写 API

`whiteboard-editor` 内部新增唯一合法写入口：

```ts
type EditorWrite = {
  document: EditorDocumentWrite
  session: EditorSessionWrite
  view: EditorViewWrite
  preview: EditorPreviewWrite
  batch: <T>(recipe: (tx: EditorWriteTransaction) => T) => T
}
```

这里的含义不是“公开一个新的随便乱写的 API”，而是：

1. **内部唯一写入口**叫 `editor.write`
2. public `editor.commands` 只是它的语义 façade
3. interaction/session 也只能调用它
4. 其他任何直接写容器的方式都视为越权

### 裁决 2：public `commands` 保留，但降级为 façade

外部给 UI、快捷键、菜单、宿主侧暴露的仍然可以是：

```ts
editor.commands.node.deleteCascade(...)
editor.commands.selection.replace(...)
editor.commands.edge.create(...)
```

但实现上，这些 public commands 不再是另外一条写链。

它们只是：

```ts
editor.commands.xxx(...) -> route to editor.write.document/session/view/preview
```

也就是：

**对外保留语义命令，对内只保留一个真正的写内核。**

例如：

```ts
editor.commands.node.deleteCascade(ids)
-> editor.write.document.node.deleteCascade(ids)

editor.commands.selection.replace(input)
-> editor.write.session.selection.replace(input)
```

### 裁决 3：interaction 不再允许直接操作底层容器

以后 interaction/session 禁止直接碰：

1. `runtime.state.xxx.set`
2. `overlay.set`
3. engine 原始 write 容器
4. 任何底层 mutable store

interaction 只能做两件事：

1. 读 `editor.read`
2. 写 `editor.write`

### 裁决 4：director 只保留调度，不再承担业务写入

interaction director 之后只负责：

1. 选择哪个 session 启动
2. 持有当前 active session
3. 转发 pointer / key / cancel / blur
4. 维护 session 生命周期
5. 维护 active session 的 mode / chrome / pointer ownership
6. 提供 auto-pan 这种纯调度辅助

director 不再负责：

1. 业务状态写入
2. overlay 清理策略拼装
3. domain reset 逻辑
4. 各 interaction 之间的共享状态拼装

---

## 四、中轴 API 的推荐形状

这版先不纳入 effect，所以按状态域只保留四层：

1. `document`
2. `session`
3. `view`
4. `preview`

### 4.1 `document`：文档级、可持久化写入

`document` 负责真正进入 document / engine / history 的写操作。

它处理的是：

1. node/edge/mindmap/document 的结构性修改
2. insert / delete / reorder / reconnect / transform 的最终落地
3. history undo / redo
4. document 写入后的 reconcile

推荐形状：

```ts
type EditorDocumentWrite = {
  node: { ... }
  edge: { ... }
  mindmap: { ... }
  insert: { ... }
  doc: {
    load(doc: DocumentSnapshot): void
    replace(doc: DocumentSnapshot): void
  }
  history: {
    undo(): void
    redo(): void
  }
}
```

注意这里的关键不是字段长什么样，而是权责：

1. 只要真正改 document 内容或 history，都属于 `document`
2. interaction 不直接调用 engine commands，而是调用 `write.document.*`
3. public `commands.*` 也只是映射到这里

### 4.2 `session`：交互会话态写入

`session` 负责当前用户意图相关的 editor 本地会话态，不进入 document。

它处理的是：

1. tool
2. selection
3. edit
4. interaction active/meta
5. hover / focus / pointer ownership 这类如果未来保留的会话态

推荐形状：

```ts
type EditorSessionWrite = {
  interaction: {
    setActive(meta: ActiveSessionMeta | null): void
    setChrome(visible: boolean): void
    cancel(): void
  }
  tool: {
    set(tool: Tool): void
  }
  selection: {
    replace(input: SelectionInput): void
    add(input: SelectionInput): void
    remove(input: SelectionInput): void
    toggle(input: SelectionInput): void
    selectAll(): void
    clear(): void
  }
  edit: {
    start(nodeId: NodeId, field: EditField): void
    clear(): void
  }
  reset: {
    session(): void
  }
}
```

这里要特别强调：

`tool / selection / edit` 虽然今天从 `commands.*` 暴露出来，但它们的状态归属并不是 document，而是 editor session runtime。

所以中轴 API 的分层，不应该镜像今天的 command façade，而应该服从状态归属。

### 4.3 `view`：视图运行态写入

`view` 负责与画布视图、环境输入、几何视口相关的运行态，不进入 document。

它处理的是：

1. viewport
2. pointer
3. container rect / limits
4. inputPolicy
5. drawPreferences
6. space

推荐形状：

```ts
type EditorViewWrite = {
  viewport: {
    set(next: Viewport): void
    panBy(delta: Point): void
    panScreenBy(delta: Point): void
    zoomAt(input: ZoomAtInput): void
    fitTo(input: FitViewportInput): void
    setRect(rect: ContainerRect): void
    setLimits(limits: ViewportLimits): void
  }
  pointer: {
    set(sample: PointerSample | null): void
    clear(): void
  }
  space: {
    set(value: boolean): void
  }
  inputPolicy: {
    patch(patch: Partial<EditorInputPolicy>): void
  }
  drawPreferences: {
    patch(patch: BrushStylePatch): void
    setSlot(slot: DrawSlot): void
  }
}
```

`viewport` 之所以放在 `view` 而不是 `document`，是因为在当前 `whiteboard-editor` 里它属于视图运行态，而不是文档内容。

### 4.4 `preview`：临时投影、交互可视态

`preview` 负责 overlay / guide / drag projection / marquee / draw preview 这些短生命状态。

推荐形状：

```ts
type EditorPreviewWrite = {
  draw: {
    stroke(next: DrawPreview | null): void
    hideNodes(nodeIds: readonly NodeId[]): void
    clear(): void
  }
  selection: {
    marquee(next: MarqueeOverlayState | null): void
    guides(next: readonly Guide[]): void
    clear(): void
  }
  transform: {
    projection(next: TransformProjection | null): void
    guides(next: readonly Guide[]): void
    clear(): void
  }
  edge: {
    connect(next: EdgeConnectPreview | null): void
    guide(next: EdgeGuide | null): void
    clear(): void
  }
  mindmap: {
    drag(next: MindmapDragFeedback | null): void
    clear(): void
  }
  clearAll(): void
}
```

关键点不是字段名，而是这条规则：

**interaction 不再自己组装 `overlay.set((current) => ({ ...current, ... }))`。**

它只调用：

```ts
write.preview.edge.connect(next)
write.preview.selection.marquee(next)
write.preview.transform.projection(next)
```

这样 overlay state shape 会被收在中轴 API 里，interaction 就不会再知道内部结构。

### 4.5 `batch`：统一事务壳

`batch` 用于把一次用户意图里的多段写入收在一起。

例如：

1. selection press 先改 session selection，再清 preview
2. transform up 时先写 document，再清 projection
3. edge reconnect 完成后写 document，再 reset session 交互态

推荐形状：

```ts
type EditorWriteTransaction = {
  document: EditorDocumentWrite
  session: EditorSessionWrite
  view: EditorViewWrite
  preview: EditorPreviewWrite
}
```

```ts
editor.write.batch(({ document, session, preview }) => {
  document.edge.reconnect(edgeId, end, target)
  preview.edge.clear()
  session.interaction.setActive(null)
})
```

这里的价值不是追求数据库式事务，而是把“同一次用户意图”的写入收在一个入口里，减少清理逻辑散落。

---

## 五、interaction / session / director 的新边界

### 5.1 interaction 的正确职责

interaction 不应该再是“拿到一堆依赖然后自己拼状态”的地方。

interaction 的职责应该收缩为：

1. 判断是否命中某种用户意图
2. 启动对应 session
3. 在 session 内根据输入推进状态
4. 通过 `read` + `write` 完成读写

所以 interaction 的依赖应从现在的：

```ts
{
  read,
  state,
  config,
  commands,
  overlay,
  snap
}
```

收缩为：

```ts
{
  read,
  write,
  config,
  snap
}
```

这一步非常关键，因为它直接把 interaction 从“容器操作层”降回“行为层”。

### 5.2 session 应该是主组织轴

真正自然的建模单位不是 owner/feature，而是 session。

建议直接把主组织轴定义为：

1. `startDrawSession`
2. `startEraseSession`
3. `startSelectionPressSession`
4. `startSelectionMoveSession`
5. `startSelectionMarqueeSession`
6. `startTransformSession`
7. `startEdgeConnectSession`
8. `startViewportPanSession`
9. `startMindmapDragSession`

每个 session 只关心一段连续用户意图。

这比“先 feature，再 owner，再 observe，再 session”更接近白板真实行为模型。

### 5.3 director 只做 session 调度

director 推荐只保留一个很薄的结构：

```ts
type InteractionDirector = {
  handlePointerDown(input): boolean
  handlePointerMove(input): boolean
  handlePointerUp(input): boolean
  handlePointerCancel(input): boolean
  handleWheel(input): boolean
  handleKeyDown(input): boolean
  handleKeyUp(input): boolean
  handleBlur(): void
  cancel(): void
}
```

内部只维护：

1. `activeSession`
2. `activeMeta`
3. `autoPan`
4. `sessionFactories`

不再维护：

1. feature 层抽象
2. owner.observe 的通用广播系统
3. priority 竞争框架
4. 通用大 control 对象

### 5.4 用 session transition 替代 `control.update`

当前 `control.update({ mode, chrome })` 的存在，说明 session 运行中经常要改自己的外部描述。

这通常意味着：session 生命周期边界没有收干净。

更优方案是把 session 事件返回值改成显式 transition：

```ts
type SessionTransition =
  | { type: 'noop' }
  | { type: 'finish' }
  | { type: 'cancel' }
  | { type: 'replace', session: InteractionSession }
```

例如 selection press：

1. 按下后进入 `press`
2. move 超过阈值后，不是 `update mode`
3. 而是显式 `replace` 为 `move session` 或 `marquee session`

这样 mode/chrome 由 active session 自身决定，而不是靠 runtime 外部补丁去改。

这是 interaction 简化里最关键的一刀。

---

## 六、当前对象应该怎么折叠进中轴

### 6.1 `commands`

现状：

1. `commands` 既是 public API，又是 interaction 内部写入口
2. 它和 `overlay/state` 并列，导致写路径分裂

方案：

1. public `editor.commands` 继续存在
2. 但内部只做 façade
3. 真正实现按状态域下沉到 `editor.write.document/session/view`

即：

```ts
editor.commands.node.deleteCascade(ids)
```

等价于：

```ts
editor.write.document.node.deleteCascade(ids)
```

再比如：

```ts
editor.commands.selection.replace(input)
```

等价于：

```ts
editor.write.session.selection.replace(input)
```

### 6.2 `overlay`

现状：

1. interaction 直接改 `overlay.set`
2. 每个 interaction 都知道 overlay state 结构

方案：

1. overlay store 保留，selectors 保留
2. `set/reset` 不再暴露给 interaction
3. 统一折叠进 `editor.write.preview`

也就是：

1. 渲染层仍然 `editor.overlay.selectors.*` 读
2. 行为层只能 `editor.write.preview.*` 写

### 6.3 `runtime.state`

现状：

1. interaction 可以直接写 pointer / tool / selection / edit / space 等本地状态
2. 这使得 interaction 直接依赖具体 store 结构

方案：

1. store 本身保留
2. 但 `set/mutate` 不再外露给 interaction
3. 按状态归属折叠进 `editor.write.session` 或 `editor.write.view`

### 6.4 `viewport.input`

现状：

1. 一部分 viewport 行为像 view runtime
2. 一部分又像 command
3. 一部分在 input 分发层直接调用

方案：

把 viewport 明确收进 view 域：

1. `read.viewport`：只读几何、坐标换算、当前 viewport
2. `write.view.viewport`：运行时输入态和视图变更，例如 `panScreenBy / zoomAt / setRect`

调用方不再自己判断该写哪一个底层容器，而是调用中轴语义。

---

## 七、哪些抽象保留，哪些删除或降级

### 应保留

1. `read`
2. `snap runtime`
3. session-first 的领域行为实现
4. overlay selectors
5. 当前已有的语义 command 名称体系
6. auto-pan 这种纯调度辅助能力

### 应降级

1. `commands`：从“真实写入口”降级为 façade
2. `createEditor.ts`：从“大总管”降级为装配层
3. `runtime.state`：从“行为层可直接写”降级为中轴内部实现细节
4. `overlay`：从“交互层可直接拼装”降级为 preview 子系统

### 应删除或逐步消失

1. `InteractionCtx.state`
2. `InteractionCtx.overlay`
3. `InteractionCtx.commands`
4. `InteractionOwner.priority`
5. `InteractionFeature` 这层通用包装
6. `observe` 广播式框架
7. `control.update`

---

## 八、迁移后的理想调用关系

理想模型应该是：

```ts
UI / Host / Shortcut
  -> editor.commands.*
  -> editor.write.document/session/view.*

Interaction Director
  -> start session
  -> active session consumes input
  -> session calls editor.write.*

Render / Hooks
  -> editor.read.*
  -> editor.overlay.selectors.*
  -> editor.state.*
```

更直白地说：

1. 渲染层负责读
2. interaction/session 负责推进用户意图
3. `editor.write` 负责真正落状态
4. director 只负责调度

---

## 九、一个具体例子：selection press 如何收敛

当前 selection press 的复杂度，本质上不是算法问题，而是它既要决定选择逻辑，又要决定后续 move/marquee 切换，还要碰 commands/overlay/control。

收敛后应该是这样：

### `press session`

负责：

1. 记录初始按下信息
2. 判断 release 是 clear/select/edit
3. 判断 move 是否超阈值
4. 超阈值后返回 `replace(moveSession)` 或 `replace(marqueeSession)`

它不负责：

1. 直接改 overlay store
2. 直接改 runtime.state
3. 直接更新 director mode

它只会：

1. `read.selection.summary.get()`
2. `write.session.selection.replace(...)`
3. `write.session.edit.start(...)`
4. 返回 session transition

这时 selection 系列的复杂度会明显下降，因为“行为判断”和“底层落状态”终于解耦了。

---

## 十、为什么这比“interaction 放 React”更根本

interaction 放在 React 里，能得到的主要好处是：

1. 依赖注入更自然
2. hook 组合更方便
3. UI 协作更近

但它不能自动解决下面这个根问题：

**到底谁有资格改状态。**

如果这个问题不先解决，那么 interaction 即使搬到 React，也仍然会出现：

1. hook 里直接调 commands
2. hook 里直接拼 overlay
3. hook 里直接改 runtime store
4. component / hook / service 三处都有写逻辑

复杂度不会消失，只会换壳。

所以最根本的顺序应该是：

1. 先统一写边界
2. 再决定 interaction 放在哪

换句话说：

**是否用 React，只影响“怎么接入”；中轴 API 才决定“系统会不会真正变简单”。**

---

## 十一、最终建议

如果目标是把 `whiteboard-editor` 的 interaction 建模真正收敛，我建议直接采用下面这组原则作为硬约束：

1. `editor.write` 是内部唯一合法写入口。
2. `editor.commands` 只是 public façade，不再是一条独立写链。
3. interaction/session 只能依赖 `read + write + config + snap`。
4. interaction director 只做 session 调度，不做业务落状态。
5. session 是主组织轴，feature/owner 框架逐步退出。
6. 用 `SessionTransition` 替代 `control.update`。
7. preview 必须收进 `write.preview`，interaction 不再直接拼 overlay state。
8. session runtime state 必须收进 `write.session`，interaction 不再直接碰 store。
9. view runtime state 必须收进 `write.view`，interaction 不再直接碰 store。
10. document 写入必须收进 `write.document`，interaction 不再直接碰 engine commands。

如果只保留一句架构口号，那就是：

**session 负责推进用户意图，editor.write 负责唯一落状态。**

---

## 十二、推荐落地顺序

后续真正施工时，建议按这个顺序做，而不是先大规模迁目录：

1. 先引入 `editor.write`，但只做薄封装，不改行为。
2. 把 `commands / overlay / runtime.state` 的写入口逐步改为走 `write`。
3. 把 `InteractionCtx` 收缩为 `read + write + config + snap`。
4. 先迁最典型 session：`draw / transform / edge-connect / selection-press`。
5. 再把 `control.update` 改成 `SessionTransition`。
6. 最后收掉 `owner / feature / priority / observe` 这层框架壳。

这个顺序的好处是：

1. 风险最可控
2. 每一步都有清晰验收标准
3. 不会在“目录重组”上消耗太多认知成本

---

## 最后一句

这次收敛最值得先做的，不是继续拆 deps，也不是先讨论 React 归属，而是先把系统里“谁能写状态”这件事变成一个有硬边界的答案。

只要这个答案成立，interaction 才有可能真的降维。

---

## 十三、最终 API 定稿

`write(action)` 这一层不再推荐，也不应该作为 `whiteboard-editor` 的目标形态。

原因很直接：

1. `engine` 已经有一套 `commands -> operations` 的统一动作模型。
2. `editor` 层的主要职责是交互编排、会话态、视图态、preview 管理，不是再复制一套协议层。
3. 把 editor 再压成 `write(action)`，收益不够，反而容易把本来清晰的 runtime API 变成 action soup。
4. `document / session / view / preview` 这四个状态域，在 editor 层本来就是清晰且稳定的边界，没有必要继续包成字符串 `type + payload`。

所以这里明确定稿：

### 13.1 单中轴的定义

`whiteboard-editor` 的“单中轴”定义为：

**只有一个有写权限的对象：`editor.write`。**

而不是：

**只有一个 `write(action)` 函数。**

这两件事要明确区分。

下面这版就是合格的单中轴：

```ts
editor.write.document.node.deleteCascade(ids)
editor.write.session.selection.replace(input)
editor.write.view.viewport.zoomAt(input)
editor.write.preview.edge.connect(next)
```

因为真正拥有写权限的仍然只有 `editor.write` 这一个对象。

### 13.2 推荐终态

`editor` 层最终推荐 API 形态固定为：

```ts
type EditorWriteApi = {
  document: EditorDocumentWrite
  session: EditorSessionWrite
  view: EditorViewWrite
  preview: EditorPreviewWrite
  batch<T>(recipe: (tx: EditorWriteTransaction) => T): T
}

type EditorWriteTransaction = {
  document: EditorDocumentWrite
  session: EditorSessionWrite
  view: EditorViewWrite
  preview: EditorPreviewWrite
}
```

这里的关键点是：

1. 顶层只有一个写权限对象：`editor.write`
2. `document / session / view / preview` 是这个对象下面的状态域
3. `batch` 仍然保留，但 batch 里也是同一套分域 writer

### 13.3 `commands` 的定位

`commands` 继续保留，但它只是 façade，不再是独立写链。

例如：

```ts
editor.commands.node.deleteCascade(ids)
```

内部落到：

```ts
editor.write.document.node.deleteCascade(ids)
```

再比如：

```ts
editor.commands.selection.replace(input)
```

内部落到：

```ts
editor.write.session.selection.replace(input)
```

### 13.4 interaction 的依赖形态

interaction ctx 也不应该拿 `write(action)`，而应该直接拿分域 writer：

```ts
type InteractionCtx = {
  read: EditorRead
  write: EditorWriteApi
  config: BoardConfig
  snap: SnapRuntime
}
```

这样 interaction 的心智仍然很干净：

1. 读：`read`
2. 写：`write.document / write.session / write.view / write.preview`

同时不会把 editor 再做成一个“小 engine”。

### 13.5 最终结论

所以这份方案在这里正式收口：

1. 不采用 `write(action)`。
2. 不把 editor 再做成 action routing 层。
3. 保留 `editor.write.{document,session,view,preview} + batch` 作为推荐终态。

如果只保留一句最终口号，那就是：

**editor 层要的是单写权限对象，不是单 action 函数。**

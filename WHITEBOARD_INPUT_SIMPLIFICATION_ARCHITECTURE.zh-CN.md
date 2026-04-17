# Whiteboard Input 整体简化与中轴化重构方案

## 1. 目标

这份方案只解决一件事：

- 把 `whiteboard/packages/whiteboard-editor/src/input` 整体收口成一条更短、更清晰、更稳定的 input 中轴

前提约束：

- 不在乎重构成本
- 不需要兼容旧结构
- 优先减少跳转层
- 优先减少“薄包装文件”
- 优先把 editor interaction 的职责集中，而不是散在很多 `start.ts / session.ts / index.ts / shared.ts`

---

## 2. 当前现状

当前 `input/` 目录一共有 35 个文件，约 5641 行。

主要热点：

- `selection/press/resolve.ts` 361 行
- `selection/press/plan.ts` 299 行
- `selection/press/session.ts` 197 行
- `edge/connect/start.ts` 455 行
- `edge/connect/session.ts` 289 行
- `edge/route/start.ts` 337 行
- `edge/route/session.ts` 222 行
- `edge/label/session.ts` 326 行

同时又有很多很薄的跳转层：

- `input/index.ts`
- `draw/index.ts`
- `selection/index.ts`
- `mindmap/index.ts`
- `selection/shared.ts`
- `selection/edit.ts`
- `draw/stroke/session.ts` 里的 `startStrokeState`
- `selection/press/start.ts` 里的 `startSelectionPressAction`

这些文件的问题不是“代码多”，而是：

1. 真正的语义路径太长
2. editor 层和纯模型层没有稳定边界
3. 有些 `start.ts` 只是入参适配器，不是真正的状态机入口
4. 同类交互的组织方式不一致
5. 有看起来像入口但实际上未接入总链路的残留文件

最典型的例子：

- `input/mindmap/index.ts` 现在并不在总 interaction bindings 里，mindmap drag 实际是从 `selection/move/session.ts` 内部分叉进入
- `draw/stroke/session.ts` 里的 `startStrokeState` 只是 `ctx + input -> startDrawStroke(...)` 的薄包装
- `selection/press` 被拆成 `start / resolve / plan / session / edit / shared` 六段，跨文件跳转成本明显偏高

---

## 3. 当前结构的主要问题

## 3.1 “editor 入口层”太碎

很多文件只是：

- 读一下 `ctx`
- 调一下另一个函数
- 返回 `session | null`

这类文件没有稳定独立语义，只增加跳转。

应该删除的典型层：

- 纯 one-line `index.ts`
- 只做 `undefined -> null` 转换的 `startXxxState`
- 只做一次参数拼装的 `startXxxAction`

---

## 3.2 `start.ts / session.ts` 的拆分标准不统一

现在的拆分有三类混在一起：

1. 真正的纯状态机层
2. editor-specific 的 start 解析层
3. 只是薄包装的 adapter 层

问题在于这三类都叫 `start.ts`，读代码时很难一眼判断：

- 这个文件是不是纯 reducer
- 这个文件是不是 editor 层分派
- 这个文件是不是马上就会被 `createXxxSession` 吃掉

长期最优必须把规则定死：

- editor 侧不再默认拆 `start.ts + session.ts`
- 只有“纯模型”才单独拆成 `model.ts`

---

## 3.3 Press -> Drag -> Hold 的启动模式重复

当前至少有三条线在重复做“按下后先进入 press，达到阈值再切到 drag session”的事情：

- `selection/press/session.ts`
- `edge/route/session.ts`
- `edge/label/session.ts`

它们都在重复处理：

- drag threshold
- optional hold
- `replaceSession(next)`
- tap / drag 二分

这不应该分散在多个模块里各写一遍。

---

## 3.4 Interaction runtime 不在 input 中轴里

真正的 input runtime 在：

- `whiteboard/packages/whiteboard-editor/src/local/runtime.ts`

`input/` 自己只提供 bindings 和 session 类型。

这会导致 input 架构被拆成两半：

- 一半在 `input/`
- 一半在 `local/runtime.ts`

长期看这是不对的。interaction runtime 应该属于 `input` 域本身。

---

## 3.5 Gesture / Session / Mode 的语义还不够统一

当前有几套并行概念：

- `InteractionSession.mode`
- `ActiveGesture.kind`
- 各模块自己的草稿 patch 结构

它们不是错，但现在没有完全收口成一条“统一的 input 输出轴”。

表现为：

- `selection-*` 一套 helper
- `edge-*` 一套 helper
- 某些 session 直接手写 gesture 组装

长期最优应该统一成：

- session 负责交互生命周期
- gesture 负责唯一的预览输出
- command 负责唯一的 commit 输出

---

## 3.6 Ambient pointer service 和 interaction session 混在一起

`edge/hover.ts` 不是 session，也不是 binding，它是“闲时指针悬停反馈服务”。

它不应该和 `edge/connect / move / route / label` 这种主动 interaction 放在同一层级语义里。

---

## 4. 简化原则

这次重构建议只保留三种文件角色。

### 4.1 `runtime.ts`

唯一负责：

- pointer / key / blur dispatch
- active session 生命周期
- auto-pan 接线
- active gesture 同步

### 4.2 `feature.ts`

每个 interaction feature 只暴露一个入口：

```ts
tryStartXxx(ctx, input): InteractionStartResult
```

这个文件自己负责：

- start 条件判断
- 内部局部状态
- session 构建
- preview 投影
- commit

也就是说，editor 层默认按“一个 feature 一个文件”组织。

### 4.3 `*.model.ts`

只有在满足以下条件时才允许单独存在：

1. 真的是纯 reducer / pure model
2. 不是单纯的 editor adapter
3. 复杂度足够高，塞回 feature 会明显变差

否则一律并回 feature 文件。

---

## 5. 最终目标结构

建议把 `input/` 收敛成下面这套结构。

```txt
input/
  index.ts
  runtime.ts
  context.ts
  types.ts
  tuning.ts
  gesture.ts
  autoPan.ts
  snap.ts

  viewport.ts
  draw.ts
  transform.ts

  selection/
    press.ts
    move.ts
    marquee.ts

  edge/
    index.ts
    connect.ts
    move.ts
    route.ts
    label.ts

  mindmap/
    drag.ts

  hover/
    edge.ts
```

目标文件数大约 18 个左右，而不是现在的 35 个。

核心变化：

- 删除大部分一层薄包装
- 删除 editor 层的 `start.ts / session.ts` 二段式
- 只保留少量真正有价值的纯模型拆分
- 把 runtime 从 `local/runtime.ts` 抽回 `input/runtime.ts`

---

## 6. 顶层 API 设计

## 6.1 顶层 router

`input/index.ts` 最终只负责组装 handler 列表：

```ts
export const createEditorInteractions = (
  ctx: InteractionContext
): readonly InteractionBinding[] => ([
  createViewportBinding(ctx),
  createDrawBinding(ctx),
  createEdgeBinding(ctx),
  createTransformBinding(ctx),
  createSelectionBinding(ctx)
])
```

这里不再引入各域内部的额外 `index.ts` 跳转。

`draw`、`selection`、`transform`、`viewport` 都可以直接从 feature 文件导出 binding。

`edge` 保留一个 `edge/index.ts`，因为它确实是一个多分支 dispatcher。

---

## 6.2 Interaction feature 统一入口

每个 feature 的 editor API 统一成：

```ts
type InteractionStarter = (
  ctx: InteractionContext,
  input: PointerDownInput
) => InteractionStartResult
```

也就是：

- `null`: 我不处理
- `'handled'`: 我消费掉了，但没有 session
- `session`: 我接管后续事件

不要再出现：

- `startXxxState`
- `startXxxAction`
- `startXxxInteraction`
- `createXxxInteraction`

这四层同时存在的情况。

长期最优是：

- 顶层 binding
- feature starter
- session

三层封顶。

---

## 6.3 Session 结构保持，但收口职责

`InteractionSession` 现有结构总体够用，不建议大改。

但职责要收口：

- session 内部只处理交互生命周期
- preview 一律写到 `gesture`
- commit 一律走 command
- cleanup 一律只负责清掉本 session 创建的 transient 状态

不建议继续让 session 自己隐式扩展更多角色。

---

## 6.4 Press-to-Drag 中轴 helper

建议新增一个唯一的 press 启动 helper：

```ts
createPressDragSession({
  pointerId,
  chrome,
  startClient,
  holdDelay?,
  onTap?,
  onHold?,
  onDragStart
})
```

它只解决三件事：

1. drag threshold
2. optional hold timer
3. `replaceSession(next)` 切换

这个 helper 可以统一替代：

- `selection/press/session.ts` 内部的 press 壳
- `edge/route/session.ts` 里的 press 壳
- `edge/label/session.ts` 里的 press 壳

这不是“抽象工具库泛滥”，而是把一段已经重复三次的 editor interaction 壳正式中轴化。

除了这一个 helper，不建议再新增更多通用 session builder。

---

## 7. 各域最终重构建议

## 7.1 Draw

### 当前问题

- `draw/index.ts` 是薄入口
- `stroke/session.ts` 里的 `startStrokeState` 是薄包装
- `erase` 也保留了类似两段式

### 最终建议

`draw` 只保留一个 binding 文件：

```txt
input/draw.ts
```

里面直接分发：

- `tryStartDrawStroke`
- `tryStartErase`

如果要保留纯模型，最多保留：

```txt
input/drawStroke.model.ts
```

用于承载现在 `startDrawStroke / stepDrawStroke / previewDrawStroke / commitDrawStroke` 这类纯逻辑。

但 editor 侧不再保留：

- `draw/index.ts`
- `draw/stroke/session.ts` 里的 `startStrokeState`

### 规则

- 纯模型可以保留
- editor adapter 一律并回 feature

---

## 7.2 Transform

### 当前问题

- `transform/start.ts` 里同时做 start resolve 和 binding 封装
- `transform/session.ts` 再做 project/commit

这两文件都不薄，但拆分边界其实不稳定，因为 `start.ts` 不是纯模型。

### 最终建议

改成一个文件：

```txt
input/transform.ts
```

内部按 section 组织：

1. transform start resolve
2. text / single / selection spec resolve
3. session create
4. preview / commit

也就是说，transform 不再拆 editor 层 `start.ts / session.ts`。

---

## 7.3 Mindmap

### 当前问题

- `mindmap/index.ts` 是未接入总 bindings 的死入口
- 实际 mindmap drag 是从 `selection/move` 中条件跳转

### 最终建议

删掉：

- `input/mindmap/index.ts`

只保留：

```txt
input/mindmap/drag.ts
```

这个文件直接暴露：

- `tryStartMindmapDrag(...)`
- `tryStartMindmapDragForSelectionMove(...)`

并且自己内部包含 session。

不再拆 `start.ts / session.ts`。

这是很典型的“当前拆分纯属历史残留”的模块。

---

## 7.4 Edge

Edge 是唯一一个确实值得保留多文件组织的域，因为它有多个独立 interaction：

- connect
- move
- route
- label

### 最终建议

保留：

```txt
input/edge/index.ts
input/edge/connect.ts
input/edge/move.ts
input/edge/route.ts
input/edge/label.ts
```

删掉 editor 层的：

- `connect/start.ts`
- `connect/session.ts`
- `move/start.ts`
- `move/session.ts`
- `route/start.ts`
- `route/session.ts`

全部合并成对应 feature 单文件。

### 为什么 edge/index.ts 需要保留

因为 edge 确实有真实的 start 分派：

- connect
- route
- label
- body move
- handled

这不是薄包装，而是真的 dispatcher。

所以：

- `edge/index.ts` 保留
- 但其子 feature 不再拆两段式

### route / label 的特别建议

这两块目前都存在：

- press 壳
- drag session
- 内部局部 state 构造

应该统一成：

- feature 文件内部的两个局部 session
- 外部通过 `createPressDragSession` 统一承接 threshold / hold / replace

不再额外导出：

- `createEdgeRoutePointSession`
- `createEdgeLabelPressSession`

这类“局部拼装器”如果只有单个调用点，应该并回 feature 内部。

---

## 7.5 Selection

这是这次最值得重做的区域。

### 当前问题

现在 selection press 被拆成：

- `selection/press/start.ts`
- `selection/press/resolve.ts`
- `selection/press/plan.ts`
- `selection/press/session.ts`
- `selection/edit.ts`
- `selection/shared.ts`

这套结构的问题不是逻辑错误，而是 editor 侧跳转层过多。

### 最终建议

收成三文件：

```txt
input/selection/press.ts
input/selection/move.ts
input/selection/marquee.ts
```

其中：

- `press.ts` 同时包含当前的 target resolve、subject resolve、plan resolve、tap/drag/hold session
- `move.ts` 保留独立，因为它已经是相对稳定的大块
- `marquee.ts` 同时包含 reducer 和 session

删掉：

- `press/start.ts`
- `press/resolve.ts`
- `press/plan.ts`
- `edit.ts`
- `shared.ts`
- `marquee/state.ts`

### 为什么 selection 适合这样收

因为这些文件几乎都是单消费者：

- `press/start.ts` 只被 `press/session.ts` 用
- `edit.ts` 只被 `press/session.ts` 用
- `shared.ts` 只放一个 `MarqueeMatch`
- `marquee/state.ts` 只被 `marquee/session.ts` 用

这类拆法对测试可能有帮助，但对日常维护很差。

长期最优应该是：

- 把 selection press 作为一个完整 feature 来读
- 一个文件内按 section 清楚分块

### 例外

如果 `selection/press.ts` 合并后体积过大，可以允许唯一一个纯模型文件：

```txt
input/selection/press.model.ts
```

但这是上限，不允许再拆成 `start / resolve / plan / session` 四段。

---

## 7.6 Marquee

`marquee/state.ts` 现在本质是纯 reducer。

从抽象正确性上看，它可以单独存在。

但从“减少跳转层”的目标看，它只有一个调用者，长期最优更倾向于并回 `selection/marquee.ts`。

建议规则：

- 单消费者纯 reducer 默认并回 feature 文件
- 只有复用明确出现后，再拆成 `*.model.ts`

---

## 7.7 Viewport

`viewport/session.ts` 已经很接近合理形态。

它的问题不在内部，而在命名和层级：

- 它其实不是 `session.ts`
- 它就是一个完整 feature

建议直接改成：

```txt
input/viewport.ts
```

不再保留 `viewport/session.ts`。

---

## 7.8 Hover

`edge/hover.ts` 不属于主动 interaction。

建议从 interaction feature 树里挪出，单独放到：

```txt
input/hover/edge.ts
```

这样语义更清楚：

- interaction 是 pointer-down 触发的主动会话
- hover 是 pointer-move 空闲态的 ambient service

---

## 8. Runtime 中轴化

## 8.1 现在的问题

`createInteractionRuntime(...)` 在 `local/runtime.ts` 里。

这会导致：

- input 架构无法在 `input/` 内自洽
- 很多 input 类型和 runtime 使用者分离
- 想改 session 生命周期时，必须跨域跳到 local

## 8.2 最终建议

把它迁回：

```txt
input/runtime.ts
```

`local/runtime.ts` 只做依赖注入：

- 绑定 query
- 绑定 layout
- 绑定 bindings
- 暴露 interaction runtime

而不再持有 interaction runtime 实现本身。

这一步是这次重构里非常关键的一步。

---

## 9. Gesture 中轴化

当前 `gesture.ts` 已经比别处干净，但还可以更简单。

建议统一成一个入口：

```ts
createGesture(kind, draft)
```

而不是：

- `createSelectionGesture`
- `createEdgeGesture`

因为这两者本质都是：

- 创建带 kind 的 discriminated union

不值得再拆成两套 helper。

同时保留两个 read helper 即可：

- `readSelectionGesturePreview(...)`
- `readEdgeGestureFeedbackState(...)`

这一步不是最重要，但可以顺手收口。

---

## 10. 最终的文件合并/删除清单

## 10.1 直接删除

- `input/mindmap/index.ts`
- `input/selection/shared.ts`
- `input/core/index.ts`

## 10.2 合并后删除

- `input/draw/index.ts`
- `input/draw/stroke/session.ts`
- `input/draw/stroke/start.ts` 的 editor adapter 部分
- `input/draw/erase/session.ts`
- `input/draw/erase/start.ts` 的 editor adapter 部分
- `input/transform/start.ts`
- `input/transform/session.ts`
- `input/viewport/session.ts`
- `input/mindmap/drag/start.ts`
- `input/mindmap/drag/session.ts`
- `input/edge/connect/start.ts`
- `input/edge/connect/session.ts`
- `input/edge/move/start.ts`
- `input/edge/move/session.ts`
- `input/edge/route/start.ts`
- `input/edge/route/session.ts`
- `input/edge/label/session.ts`
- `input/selection/index.ts`
- `input/selection/edit.ts`
- `input/selection/marquee/state.ts`
- `input/selection/marquee/session.ts`
- `input/selection/press/start.ts`
- `input/selection/press/resolve.ts`
- `input/selection/press/plan.ts`
- `input/selection/press/session.ts`

注：

- 这里的“删除”是指内容并入新的目标文件后删除旧路径
- 并不是删掉语义功能

---

## 11. 建议保留的“纯模型”上限

为了防止重构后又重新长回去，这里明确规则：

editor input 层最多允许下面几类 `*.model.ts`：

1. `draw-stroke.model.ts`
   前提：继续保留纯 `start/step/preview/commit` 价值
2. `selection-press.model.ts`
   前提：合并后 `press.ts` 过大

除此之外，不建议再在 editor input 层继续新增 `start.ts / state.ts / plan.ts / resolve.ts`。

也就是说：

- 允许极少量纯模型文件
- 不允许再回到多段细碎拆分

---

## 12. 推荐的最终实现原则

## 12.1 一个 feature 默认一个文件

默认组织方式：

```txt
feature.ts
```

文件内分 section：

1. types
2. pure helpers
3. start resolve
4. session body
5. commit / cleanup

---

## 12.2 只有两种拆分理由是合法的

### 理由 A

纯模型，且复杂到值得单独维护。

### 理由 B

真实 dispatcher，例如 edge 域。

除此之外，拆分都应该视为不必要跳转。

---

## 12.3 统一“tryStart”命名

不再混用：

- `startXxxState`
- `startXxxAction`
- `startXxxInteraction`
- `createXxxInteraction`

建议统一：

- `createXxxBinding`
- `tryStartXxx`
- `createXxxSession` 只作为 feature 内部局部函数使用

这样看名字就知道职责：

- `binding` 是接入 runtime 的
- `tryStart` 是 pointer-down 判定入口
- `session` 是启动后的会话体

---

## 12.4 Runtime 只认 session，不认 feature 内部状态

runtime 不应该知道：

- selection press plan
- edge route state
- draw stroke state

runtime 只处理：

- start result
- current session
- transition
- gesture

其余都留在 feature 内部。

---

## 13. 一步到位的实施顺序

## 阶段 1

先把 runtime 从 `local/runtime.ts` 抽到 `input/runtime.ts`，建立 input 自己的中轴。

## 阶段 2

删除所有 one-line wrapper 和未接线入口：

- `mindmap/index.ts`
- `selection/shared.ts`
- domain `index.ts`

## 阶段 3

收 `draw / transform / viewport / mindmap`：

- 这些域最适合先做，因为分支少、收益高

## 阶段 4

收 `edge`：

- 保留 `edge/index.ts`
- 合并 `connect / move / route / label` 各自的 start/session

## 阶段 5

最后收 `selection`：

- 把 `press` 四段式压成一个 feature
- 把 `marquee reducer + session` 合并

## 阶段 6

补唯一的通用 helper：

- `createPressDragSession`

不要在这一步再额外发明别的通用 builder。

---

## 14. 最终结论

这次 input 重构的长期最优方向不是“继续补更多 helper”或者“继续细拆更多 start/session/state 文件”，而是反过来：

- 把 input 真正中轴化
- 把 editor 层 feature 收成完整的、可单文件阅读的 interaction
- 只在极少数地方保留纯模型文件
- 把 runtime 从 local 域拉回 input 域
- 把 press-to-drag 这种重复壳体正式抽成唯一公共中轴

一句话概括最终结构：

- runtime 在 `input`
- feature 默认一个文件
- dispatcher 只保留 edge
- pure model 只保留极少数必要场景
- 其余一律删除跳转层


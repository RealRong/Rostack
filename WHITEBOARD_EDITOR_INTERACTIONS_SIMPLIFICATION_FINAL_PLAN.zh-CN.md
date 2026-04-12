# Whiteboard Editor Interactions 长期最优简化方案

## 目标

这份文档专门针对 `whiteboard/packages/whiteboard-editor/src/interactions` 做一次完整扫描，目标不是继续做局部清理，而是给出一套长期最优的交互层收敛方案。

约束如下：

- 不保留兼容
- 不在乎重构成本
- 以最大程度降低复杂度为目标
- interaction 只负责 pointer / session / autopan / gesture projection
- 领域规则、提交规划、复杂 read 拼装尽量下沉到 editor 内部中轴

## 结论

当前 `interactions` 包里并不是所有“大文件”都有问题。

从长期最优视角看，问题主要分成三类：

1. interaction 自己在拼复杂领域语义
2. 多个 interaction 文件重复同一类启动/校验/提交模板
3. 原本应作为“中轴”的能力还没有建立，导致 interaction 只能直接从 `ctx.read` 取原料再拼装

本轮扫描后的优先级如下：

1. `edge/connect.ts`
2. `edge/press.ts` + `edge/move.ts` + `edge/routePoint.ts`
3. `selection/press.ts`
4. `draw/stroke.ts`
5. `mindmap.ts`

下面这些文件目前不算主要问题：

- `selection/marqueeState.ts`
- `viewport.ts`
- `edge/hover.ts`
- `draw/erase.ts`

它们可能还可以继续整理，但已经基本符合“单一职责、语义边界清楚”的要求。

## 一、扫描结论

## 1. `edge/connect.ts` 仍是 interaction 里最重的一块

### 关键文件

- [connect.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/connect.ts)

### 现状

[connect.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/connect.ts#L66) 到 [connect.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/connect.ts#L446) 当前同时承担了：

- 创建 edge 与重连 edge 的起点判定
- node handle / node body 两套起点求解
- reconnect capability 校验
- draft end 更新
- snap evaluation
- preview path 合成
- reconnect patch / create guide 组装
- commit 分发
- session 生命周期

这已经不是“interaction 调用中轴”，而是 interaction 自己在实现 edge connect 领域模型。

### 核心问题

1. [connect.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/connect.ts#L169) 的 `resolveEdgeConnectState` 把 tool 判定、pick 判定、起点判定、创建与重连分叉揉在了一起。
2. [connect.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/connect.ts#L251) 的 `resolveCreatePreviewPath` 在 interaction 层自己构造 preview edge，再走 `resolveEdgeView(...)`。
3. [connect.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/connect.ts#L306) 的 `toConnectGesture` 在 interaction 层自己决定 preview patch / connect guide / reconnect patch 的最终呈现语义。
4. [connect.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/connect.ts#L346) 的 session 本身又持有 `state + evaluation + gesture` 三套演进逻辑。

### 长期最优

必须建立 `edge connect axis`。

interaction 不应该再知道：

- 创建起点怎么解
- 重连起点怎么解
- preview path 怎么出
- guide 如何拼
- commit 如何分发到 `edge.create` / `edge.reconnect`

interaction 只应该：

- 识别 pointer 输入是否进入 edge connect
- 把 pointer / autopan 输入喂给 edge connect 中轴
- 把中轴返回的 gesture 写入 interaction session
- 在 `up` 时调用 commit

## 2. edge 相关交互存在重复的“启动模板”

### 关键文件

- [press.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/press.ts)
- [move.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/move.ts)
- [routePoint.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/routePoint.ts)
- [connect.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/connect.ts)

### 现状

这些文件在重复下面的模式：

- 读 tool
- 读 pick
- 读 edge item
- 读 edge capability
- 改 selection
- 决定进入哪种 edge session

例如：

- [press.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/press.ts#L19)
- [move.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/move.ts#L25)
- [routePoint.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/routePoint.ts#L42)
- [connect.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/connect.ts#L136)

### 长期最优

必须建立 `edge interaction axis`，把“edge session 的启动判定”收成一个中轴。

不要继续让每个 interaction 文件单独维护：

- edge 是否可 move
- edge 是否可 reconnect
- edge 是否可 editRoute
- 启动前是否需要先 select edge

这些都应该成为统一 edge 交互语义的一部分。

## 3. `selection/press.ts` 还有剩余的 interaction 层杂质

### 关键文件

- [press.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/selection/press.ts)
- [pressPolicy.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/selection/pressPolicy.ts)

### 现状

`pressPolicy.ts` 已经收成了 `target -> subject -> plan`，方向是对的。

但 [press.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/selection/press.ts#L67) 仍然自己做：

- `pick -> SelectionPressTarget`
- implicit edit field 选择

这比之前已经好很多，但仍不是长期终态。

### 长期最优

`selection/press.ts` 最终应该只做：

- 调 `selection.press.start(...)`
- 得到 plan
- 投影成 `move / marquee / tap / edit`

而不是自己继续维护 `resolveSelectionPressTarget(...)` 和 `resolveImplicitEditField(...)`。

## 4. `draw/stroke.ts` 有复杂度，但不是同等级问题

### 关键文件

- [stroke.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/draw/stroke.ts)

### 现状

[stroke.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/draw/stroke.ts#L79) 到 [stroke.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/draw/stroke.ts#L220) 同时做：

- pointer sample 降噪
- points 累积
- preview overlay
- final stroke resolve
- node.create commit

### 判断

它确实偏重，但职责仍然集中在“自由绘制 session”内部，没有像 `edge/connect.ts` 那样跨越多层领域语义。

所以它是第二梯队问题：

- 可以继续抽出 `draw.stroke axis`
- 但优先级低于 `edge connect axis`

## 5. `selection/marqueeState.ts` 目前不是问题

### 关键文件

- [marqueeState.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/selection/marqueeState.ts)

### 判断

这个文件虽然不短，但已经是一个比较完整的 reducer/state machine：

- state 清楚
- event 清楚
- effect 清楚
- `marquee.ts` 只是投影执行

这类复杂度是“必要状态机复杂度”，不是结构混乱。

长期最优不需要拆散它，最多只做命名和抽象层级微调。

## 二、最终目标结构

长期最优的 interaction 目录不应该再按“每个手势一个大文件”增长，而应该按“领域中轴 + 薄 session 投影”组织。

最终结构建议如下：

```txt
interactions/
  selection/
    press.ts
    marquee.ts
    marqueeState.ts
  edge/
    index.ts
    press.ts
    move.ts
    routePoint.ts
    hover.ts
  draw/
    index.ts
    stroke.ts
    erase.ts
  mindmap.ts
  transform.ts
  viewport.ts

runtime/
  selection/
    press.ts
    marquee.ts
  edge/
    interaction.ts
    connect.ts
    move.ts
    route.ts
  draw/
    stroke.ts
```

原则是：

- `interactions/*` 只保留 session 与 pointer 投影
- `runtime/*` 负责领域求解、状态推进、gesture 数据、commit 规划

## 三、最终中轴设计

## 1. Selection Interaction Axis

### 目标

统一：

- pick 归一化
- selection press plan
- implicit edit field
- move / marquee / tap / edit 的 session 投影

### 最终 API

```ts
editor.selection.press.target(input)
editor.selection.press.resolve(input)
editor.selection.press.matchTap(target, next)
editor.selection.edit.field(node)
```

### 说明

- `selection.press.target(...)`
  负责 `pick -> SelectionPressTarget`
- `selection.press.resolve(...)`
  负责 `target + modifiers + selectionModel -> SelectionPressPlan`
- `selection.press.matchTap(...)`
  负责 up 时的 tap 匹配
- `selection.edit.field(node)`
  负责 implicit field 选择，不再留在 `press.ts`

### 必删旧实现

- `press.ts` 里的 `resolveSelectionPressTarget(...)`
- `press.ts` 里的 `resolveImplicitEditField(...)`
- interaction 层自己拼 `group deps` 的临时对象

## 2. Edge Interaction Axis

### 目标

统一：

- edge interaction capability
- edge selection on start
- edge move / reconnect / route / create 的启动判定

### 最终 API

```ts
editor.edge.interaction.capability(edgeId)
editor.edge.interaction.select(edgeId)
editor.edge.interaction.start(input)
```

### 说明

- `capability(edgeId)` 返回 move / reconnect / route 相关能力
- `select(edgeId)` 统一 edge 交互前的 selection 行为
- `start(input)` 统一决定进入：
  - `edge.move`
  - `edge.route`
  - `edge.connect`

### 必删旧实现

- `edge/press.ts` 自己读 capability
- `edge/move.ts` 自己的 `readMovableEdge(...)`
- `edge/connect.ts` 自己的 `resolveReconnectState(...)`
- `edge/routePoint.ts` 自己的 `readCapability(...)`

## 3. Edge Connect Axis

### 目标

把 edge create / reconnect 的领域语义移出 interaction。

### 最终 API

```ts
editor.edge.connect.start(input)
editor.edge.connect.step(state, world)
editor.edge.connect.gesture(state)
editor.edge.connect.commit(state)
```

### 输入输出语义

```ts
type EdgeConnectStartInput = {
  tool: Tool
  pick: PointerDownInput['pick']
  pointerId: number
  world: Point
  editable: boolean
  ignoreInput: boolean
  ignoreSelection: boolean
}

type EdgeConnectStepResult = {
  state: EdgeConnectState
  gesture: EdgeGestureState
}
```

### 职责划分

- `start(...)`
  统一处理 create / reconnect 启动
- `step(...)`
  统一处理 snap evaluation 与 draft target 更新
- `gesture(...)`
  统一输出 preview path / reconnect patch / connect guide
- `commit(...)`
  统一输出 create 或 reconnect 提交语义

### 必删旧实现

- `resolveCreateFromNode(...)`
- `resolveReconnectState(...)`
- `resolveEdgeConnectState(...)`
- `resolveCreatePreviewPath(...)`
- `toConnectGesture(...)`
- interaction session 里同时持有 `state + evaluation + gesture` 的模式

## 4. Edge Move Axis

### 目标

把 edge body move 的“是否可移动、delta 推进、preview patch、commit”收成单一中轴。

### 最终 API

```ts
editor.edge.move.start(input)
editor.edge.move.step(state, world)
editor.edge.move.commit(state)
```

### 必删旧实现

- `edge/move.ts` 中局部 `readMovableEdge(...)`
- `edge/press.ts -> move.ts` 的松散联动

## 5. Edge Route Axis

### 目标

在已经收掉双 session 模板的基础上，再进一步把 route 的启动判定和 commit 规则下沉。

### 最终 API

```ts
editor.edge.route.pick(input)
editor.edge.route.start(input)
editor.edge.route.step(state, world)
editor.edge.route.commit(state)
```

### 必删旧实现

- `routePoint.ts` 中自己的 `resolvePickTarget(...)`
- `routePoint.ts` 中自己的 `readEditableRouteView(...)`
- route interaction 里对 `edge.type === 'elbow'` 的特殊分支拼装

## 6. Draw Stroke Axis

### 目标

让 `draw/stroke.ts` 只负责 pointer session，不再同时维护 draw style / sample policy / preview / commit 细节。

### 最终 API

```ts
editor.draw.stroke.start(input)
editor.draw.stroke.step(state, samples, options)
editor.draw.stroke.preview(state)
editor.draw.stroke.commit(state)
```

### 职责划分

- `start(...)`
  校验 tool 与起点
- `step(...)`
  采样、去重、长度累计
- `preview(...)`
  统一输出 preview points
- `commit(...)`
  统一输出最终 draw node input

### 必删旧实现

- `stroke.ts` 中 `readStyle(...)`
- `stroke.ts` 中 `resolveStrokePoints(...)`
- `stroke.ts` 中 `commitStrokeState(...)`

这些都应下沉为 `draw.stroke axis` 的内部能力。

## 7. Mindmap Drag Axis

### 目标

虽然 `mindmap.ts` 已经比之前好很多，但长期最优仍然应该把“drag state -> preview feedback -> commit”这条链完全内聚。

### 最终 API

```ts
editor.mindmap.drag.start(input)
editor.mindmap.drag.step(state, world)
editor.mindmap.drag.preview(state)
editor.mindmap.drag.commit(state)
```

### 必删旧实现

- `mindmap.ts` 里的 `toMindmapDragFeedback(...)`
- `mindmap.ts` 里的 `commitMindmapDrag(...)`

interaction 不应再自己维护 preview feedback 形态。

## 四、最终命名规范

为了压缩复杂度，命名需要尽量短，同时保持命名空间清楚。

最终建议统一如下：

```ts
editor.selection.press.target(...)
editor.selection.press.resolve(...)
editor.selection.press.matchTap(...)

editor.selection.marquee.start(...)
editor.selection.marquee.reduce(...)

editor.edge.interaction.start(...)
editor.edge.interaction.capability(...)
editor.edge.interaction.select(...)

editor.edge.connect.start(...)
editor.edge.connect.step(...)
editor.edge.connect.gesture(...)
editor.edge.connect.commit(...)

editor.edge.move.start(...)
editor.edge.move.step(...)
editor.edge.move.commit(...)

editor.edge.route.pick(...)
editor.edge.route.start(...)
editor.edge.route.step(...)
editor.edge.route.commit(...)

editor.draw.stroke.start(...)
editor.draw.stroke.step(...)
editor.draw.stroke.preview(...)
editor.draw.stroke.commit(...)

editor.mindmap.drag.start(...)
editor.mindmap.drag.step(...)
editor.mindmap.drag.preview(...)
editor.mindmap.drag.commit(...)
```

命名原则：

1. 动词统一只用 `start / step / preview / gesture / commit / resolve / pick / match`
2. 同一轴内不要混入 `create / build / apply / handle / process` 等多个风格
3. `interaction` 作为上层 namespace 只保留“跨 edge 手势统一入口”这一类能力

## 五、interaction 层最终职责

interaction 层最终只应该做下面五件事：

1. 判断当前 pointer 输入是否应由本 interaction 接管
2. 调对应中轴的 `start(...)`
3. 在 move/autopan 时调用 `step(...)`
4. 把中轴输出投影成 `gesture / preview / session transition`
5. 在 up/cancel 时调用 `commit(...)` 或 `cleanup(...)`

interaction 层不应该再做：

1. 从多个 read 结果拼复杂领域状态
2. 自己决定 create 与 reconnect 等高层业务分支
3. 自己生成 preview path / preview patch / commit payload
4. 自己维护重复 capability 判断

## 六、实施顺序

## 阶段 1

先收 `edge connect axis`。

原因：

- 复杂度最高
- 最像旧版 `selection press policy` 的问题
- 收完后能顺手带动 `edge press/move` 的统一入口

## 阶段 2

收 `edge interaction axis`。

目标：

- 合并 edge 的 capability / selection / start 模板
- 让 `press.ts` / `move.ts` / `routePoint.ts` 不再各自维护 edge 启动语义

## 阶段 3

收 `selection press projection` 残余复杂度。

目标：

- 下沉 `pick -> target`
- 下沉 `implicit edit field`
- 让 `press.ts` 变成纯 session projector

## 阶段 4

收 `draw stroke axis`。

目标：

- 把 sample policy / preview / commit 从 interaction 分离

## 阶段 5

收 `mindmap drag axis`。

目标：

- 让 preview feedback 与 commit 规划都归中轴

## 七、最终落地标准

完成后，`whiteboard-editor/src/interactions` 应满足下面标准：

1. 除 reducer/state machine 文件外，interaction 文件大多不超过 150-200 行
2. interaction 文件几乎不再直接读取多个 `ctx.read.*` 后本地拼复杂语义
3. 同一领域的启动判定、preview、commit 规则都有单一中轴
4. 不再存在一处 interaction 文件同时负责：
   - 启动判定
   - 领域求解
   - preview 合成
   - commit 分发

## 八、明确保留与明确删除

## 明确保留

- [marqueeState.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/selection/marqueeState.ts)
  作为完整 reducer/state machine 保留

## 明确删除的旧实现形态

1. interaction 文件里的“从 `ctx.read` 取原料后本地拼复杂领域 plan”
2. 每个 edge interaction 文件各自维护一套 capability / selection / start 判定
3. interaction 文件自己构造 preview edge、preview path、commit payload
4. 同一领域里 `start / step / preview / commit` 分散在多个 helper 和 session 闭包中

## 最终一句话

长期最优不是把 `interactions` 再拆成更多小函数，而是让 interaction 回到“薄投影层”，让真正的领域复杂度收进：

- `selection.press axis`
- `edge.interaction axis`
- `edge.connect axis`
- `edge.move axis`
- `edge.route axis`
- `draw.stroke axis`
- `mindmap.drag axis`

只有这样，复杂度才会真的下降，而不是从一个大文件搬到十个小 helper 里。

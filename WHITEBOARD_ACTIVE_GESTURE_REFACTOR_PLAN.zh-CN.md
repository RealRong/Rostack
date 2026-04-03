# Whiteboard Active Gesture 长期最优重构方案

## 结论

当前 whiteboard 的主要问题，不是 `interaction runtime` 本身太复杂。

真正的问题是：

- `selection` 在表达持久事实
- `interaction` 在表达临时手势
- `snap` 在表达几何修正和 guides
- `overlay` 在表达预览反馈

但这四层之间没有一个共享的“当前手势模型”。

于是同一次拖拽 / 框选 / transform，会在不同模块里被重复建模、重复推断、重复补丁式修正。

长期最优不需要再引入一整套更大的框架，也不需要把系统拆成更多术语层。  
更合适的方向是：

1. 保留当前单 active session 的 runtime。
2. 保留已经落地的 `SelectionAffordance`。
3. 新增一个统一的临时手势模型：`ActiveGesture`。
4. 把 `snap` 改成纯 solver，而不是 side-effect runtime。
5. 让 `overlay` 成为 gesture feedback 的消费层，而不是 feature-specific patch bucket。

一句话概括：

```text
selection 负责“当前稳定选中了什么”
affordance 负责“这个选区长期如何交互和呈现”
active gesture 负责“这一次手势正在发生什么”
snap 负责“给这次手势做几何修正”
overlay 负责“把这次手势的反馈画出来”
```

## 这次评估后的判断

这轮重新看完当前 `selection / interaction / snap / overlay / react selection presentation` 之后，结论是：

- 现在的 runtime 不需要推倒重来。
- 现在真正让人觉得复杂的，不是 session 切换本身。
- 真正复杂的是“同一手势的事实被分散写在多个地方”。

当前同一个 gesture 的状态，分散在这些层：

- `editor/runtime/interaction/runtime`
- `core/selection/press`
- `editor/runtime/read/selection`
- `editor/runtime/write/preview`
- `editor/runtime/interaction/snap`
- `react/features/node/selection`

这会导致几个典型问题：

- selection 决定一部分语义
- interaction session 再补一部分语义
- snap 再推断一部分几何
- overlay 再维护一部分显示态
- React 层有时还会再次推断

于是一个简单动作，例如“拖一个已选 group”，最后会变成多处同时关心：

- 当前是否算 persistent selection
- 当前蓝框应该画哪一个 box
- 当前 handles 是否显示
- snap 应该排除哪些对象
- frame hover 应该由谁写入
- pointer up 后是否保留选中

这些问题单看每一条都不大，但合起来会不断制造局部修补。

## 当前哪些部分其实已经是对的

不是所有东西都需要重做。

下面这些方向，当前判断应该保留：

### 1. 单 active session runtime

保留现在这种“同时只存在一个当前 interaction session”的运行模型。

原因很简单：

- 它已经足够直观
- 生命周期清晰
- cleanup 边界清晰
- 对 pointer interaction 很自然

这层不是主要复杂度来源。

### 2. `SelectionAffordance`

这次已经引入的 `SelectionAffordance` 是正确方向，应该保留。

因为它解决的是一个真实问题：

- `selection.target` 只表达“谁被选中”
- 但它不表达“当前选区由谁拥有交互外壳、如何展示、有什么能力”

`SelectionAffordance` 正好承担这个长期稳定解释层。

建议它继续只负责持久语义，不要开始吞临时手势状态。

### 3. 几何统一 helper

这次把 visual bounds 收敛到统一 helper 也是正确方向。

像这些规则，本来就应该是底层一致几何事实：

- 单 node 蓝框
- group 聚合 bounds
- move moving rect
- snap moving rect

它们应该来自同一组 helper，而不是各算各的。

## 真正缺失的底层模型

长期最优缺的不是更多的 `plan / intent / followup / state`。

真正缺的是一个足够小、但足够统一的模型：

- `ActiveGesture`

它只回答一个问题：

- “当前这一次正在进行的手势，暂时性的交互事实是什么？”

这和 `SelectionAffordance` 不同。

### `SelectionAffordance` 是持久解释

它表达：

- 当前选区的 owner
- displayBox / transformBox
- move / resize / rotate 能力
- content 是否允许 pass-through
- 单节点 overlay 是否接管

这些是稳定的，只要 selection 不变，它就稳定。

### `ActiveGesture` 是临时执行态

它表达：

- 这次手势是什么类型
- 起点是什么
- 当前 delta / rect / angle / scale 是什么
- snap 修正后结果是什么
- 当前反馈应该显示什么
- pointer up 后要 commit 什么
- cleanup 时要恢复什么

它只在 gesture 生命周期内存在。

也就是说，当前系统最缺的是：

```text
一个统一承接“临时几何 + 临时反馈 + commit 输入”的地方
```

## 长期最优概念收敛

长期建议只保留下面三层主概念。

### 1. `SelectionTarget`

职责：

- 持久事实
- 当前稳定选中了哪些 ids

它不回答展示和交互问题。

### 2. `SelectionAffordance`

职责：

- 持久解释
- 当前选区的交互 owner、外壳、能力、长期展示规则

它不回答“这次 gesture 正在发生什么”。

### 3. `ActiveGesture`

职责：

- 临时手势
- 当前 pointer gesture 的几何、反馈、提交意图

它不回答长期选区语义。

如果把这三层理顺，整个系统会明显变简单。

## `ActiveGesture` 最小模型

长期最优不需要把 `ActiveGesture` 设计成一个大框架。

相反，应该故意做小。

建议它至少只分三类：

- `selection-move`
- `selection-marquee`
- `selection-transform`

后续如果需要，再逐步纳入：

- `edge-bend`
- `edge-reconnect`
- `draw-stroke`
- `draw-erase`

但第一阶段没有必要全塞进去。

### 建议的数据结构

可以把它理解成：

```ts
type ActiveGesture =
  | SelectionMoveGesture
  | SelectionMarqueeGesture
  | SelectionTransformGesture
```

每一种 gesture 都尽量只保留四类字段：

- `base`
  手势起始快照，例如 start world、初始几何、参与对象

- `derived`
  当前 move/drag 后的直接几何结果，例如 delta、preview rect、preview patches

- `feedback`
  当前 UI 应该显示的反馈，例如 selection box、guides、frame hover

- `commit`
  pointer up 时需要落盘的数据

这四类字段能把很多散落逻辑自然收拢起来。

## 为什么这是当前最缺的层

因为现在很多问题的本质，都是“临时手势状态没有统一归宿”。

举几个已经遇到过的现象：

### 1. 直接 drag 但 pointer up 后不保留 selection

这个需求本身不复杂：

- drag 时要有蓝框
- up 后不要留下选中

复杂感来自：

- selection 是持久态
- 但 drag 中又需要临时 selection 外观
- cleanup 时又要恢复之前的 selection

如果有统一 `ActiveGesture`，这其实只是：

- affordance 决定这次 move 是 `temporary` 还是 `persist`
- gesture 在 feedback 中显示 selection chrome
- cleanup 时按 gesture policy 恢复或保留 selection

### 2. snap guides / snapped rect / frame hover 到处写

这些东西本质都是：

- 当前 gesture 的反馈

而不是长期 selection 状态，也不是 editor 全局事实。

如果没有 `ActiveGesture`，它们就会散落在：

- preview overlay
- snap runtime
- move effect
- component 私有判断

### 3. transform 和 selection box 语义分裂

本质上也是同一个问题：

- affordance 决定长期谁拥有 transform shell
- gesture 决定当前 transform 的临时几何和反馈

如果没有 gesture 层，这两个问题就会在多处混写。

## Snap 的长期最优

当前 `snap` 的问题，不是功能不够，而是位置不对。

它现在更像一个带副作用的 runtime：

- 接输入
- 产出 snapped rect
- 同时把 guides 写进别的状态

这会让 selection move / transform 都被迫知道很多 snap 细节。

长期最优应该改成：

- `SnapSolver`

也就是纯函数或接近纯函数的求解器。

### `SnapSolver` 只负责输入输出

输入：

- gesture kind
- moving geometry
- snap candidates
- policy

输出：

- corrected geometry
- guides
- optional active target

例如：

- `snappedRect`
- `guides`
- `containerHoverId`

selection move 不应该再关心：

- guide 写到哪里
- snapped rect 和 guides 分别怎么管理
- `allowCross` 的内部细节如何实现

它只应该做：

1. 拿当前 gesture 几何去求解
2. 收到修正结果
3. 更新 gesture 的 `derived` 和 `feedback`

### `allowCross` 应该保留，但降级成 snap policy

`allowCross` 可以保留，因为它是合理的 snap 策略能力。

但它不应该继续成为 selection move 的核心概念。

最优表达是：

- selection move 只声明“我要做 move snap”
- snap solver 根据 gesture context 和 modifiers 选择 policy
- `allowCross` 只是 solver 内部策略开关

也就是说：

```text
allowCross 属于 snap
不属于 selection move
```

## Overlay 的长期最优

当前 overlay 更像一个“各种 interaction 临时 patch 的落点”。

这会导致两个问题：

1. feature 自己往 overlay 写一部分
2. React 再根据 selection / preview / hover 二次拼装

长期最优，overlay 应该退回成一个更单纯的角色：

- gesture feedback view state

也就是：

- 它不再表达 feature 私有协议
- 它只承接当前 `ActiveGesture.feedback`

例如：

- selection box
- handles visibility
- snap guides
- frame hover
- marquee rect

这些都应该被视为：

- “当前手势的视觉反馈”

而不是：

- move 特有 patch
- transform 特有 patch
- snap runtime 附属产物

## 长期最优状态机

状态机不需要更复杂，反而应该更简单。

建议长期保持下面这条主线：

```text
pointer down
-> resolve press target
-> resolve press decision
-> create active gesture
-> step gesture
-> commit / cancel
-> cleanup
```

其中：

- `press decision` 决定会创建哪种 gesture
- `ActiveGesture` 承接临时事实
- `SelectionAffordance` 提供长期 selection 语义
- `SnapSolver` 提供几何修正
- `overlay` 只消费 gesture feedback

这比现在“selection / session / preview / snap / overlay 各自解释一点”更稳。

## 按模块重新划边界

### `selection`

长期职责：

- 管持久 selection target
- 解析 affordance
- 决定 press 后能进入哪种 gesture

不再负责：

- gesture 过程中的临时 preview patch
- snap guides 生命周期
- 复杂的临时交互恢复逻辑

### `interaction runtime`

长期职责：

- 管当前 active session / gesture 生命周期
- 接 pointer event
- 推进 `step`
- 调 `commit / cancel / cleanup`

不再负责：

- feature-specific 语义判断
- 多处缓存重复几何

### `snap`

长期职责：

- 纯求解几何修正和 guides

不再负责：

- 直接写 overlay
- 隐式维护 UI 状态

### `overlay`

长期职责：

- 承接 gesture feedback
- 只描述当前临时视觉反馈

不再负责：

- feature-specific 推断
- 补 selection 语义

### React presentation

长期职责：

- 消费 affordance 和 active gesture feedback
- 渲染

不再负责：

- 自己重建 selection ownership 规则
- 自己推断 handles / move shell / box owner

## 第一阶段最值得落地的范围

如果后续开始做实现，最值得先做的是：

1. `selection move`
2. `selection marquee`
3. `selection transform`

原因：

- 这三条链路共享 selection / gesture / snap / overlay 的主矛盾
- 它们也是当前交互复杂感最明显的地方
- 先收敛这三条，收益最大

不建议第一步就去统一所有 interaction。

像这些可以后置：

- edge interaction 全线
- draw stroke / erase
- 更泛化的 drag/drop target 协议

## 推荐迁移顺序

### Phase 1. 引入最小 `ActiveGesture`

先只覆盖：

- `selection-move`
- `selection-marquee`
- `selection-transform`

不要一开始就设计成全系统通用大协议。

### Phase 2. 把 snap 改成纯 solver

把当前 move / transform 对 snap 的依赖，收敛成：

- 输入几何
- 返回几何修正和 guides

同时把 guides 从 side effect 改成 gesture feedback。

### Phase 3. overlay 改成消费 gesture feedback

让 preview / guides / frame hover 都从 `ActiveGesture.feedback` 派生。

这一步完成后，很多 cleanup 会自然变简单。

### Phase 4. React 只消费 affordance + gesture

把 selection presentation 里的重复推断继续削掉。

最终目标是：

- affordance 决定稳定语义
- active gesture 决定当前反馈
- React 不再做第三套解释

### Phase 5. 再考虑 edge / draw 是否接入

等 selection 主链稳定后，再评估是否扩展 `ActiveGesture`。

不要一开始就追求“所有 interaction 一次性统一”。

## 这套方案相比现在到底简化了什么

不是代码文件数会立刻变少。

真正的简化是：

### 1. 持久语义和临时语义分开

现在很多复杂感，本质上是两者混在一起。

拆开后会更容易回答：

- 这是 selection 的事
- 还是当前 gesture 的事

### 2. snap 从“运行时副作用”退回“几何服务”

这样 move / transform 的职责都会清楚很多。

### 3. overlay 从“补丁池”退回“反馈视图”

这样 cleanup、恢复、临时高亮都会更统一。

### 4. React 不再重建业务规则

这会显著减少“修一处坏一处”的回归。

## 最终建议

长期最优不建议继续沿着“局部 if 修补”和“再加一点中间抽象层”往前走。

更好的方向是：

- 保留当前 runtime 主框架
- 保留 `SelectionAffordance`
- 增加一个小而统一的 `ActiveGesture`
- 把 snap 纯化
- 把 overlay 收敛成 gesture feedback

这套收敛以后，系统的核心心智模型会变成：

```text
SelectionTarget
-> SelectionAffordance
-> ActiveGesture
-> SnapSolver
-> Overlay/React Presentation
```

这里每一层只回答一个问题：

- `SelectionTarget`: 稳定选中了什么
- `SelectionAffordance`: 这个选区长期应该如何交互和呈现
- `ActiveGesture`: 当前这一次手势暂时发生了什么
- `SnapSolver`: 几何如何被修正
- `Overlay/Presentation`: 当前反馈如何显示

这就是我现在认为的长期最优。

## 详细 API 设计

这一节只回答一个目标：

- 怎么把上面的方向收敛成一套可以直接落地的 API

原则只有三个：

1. 名字短
2. 状态少
3. 数据流单向

不追求“抽象完美”，只追求读起来一眼知道每层在做什么。

## 命名原则

### 1. 稳定事实用名词

例如：

- `SelectionTarget`
- `SelectionAffordance`
- `ActiveGesture`
- `SnapResult`

### 2. 计算动作用动词

例如：

- `resolveSelectionPress`
- `createGesture`
- `stepGesture`
- `finishGesture`
- `cancelGesture`
- `solveMoveSnap`
- `solveResizeSnap`

### 3. 不再引入大而泛的名字

尽量不用这些词：

- `plan`
- `intent`
- `followup`
- `runtime state`
- `interaction model`

原因不是这些词绝对不能用，而是它们太泛，读代码时脑子里还要二次翻译。

### 4. gesture 内部字段只保留四个短名字

建议统一成：

- `kind`
- `start`
- `draft`
- `meta`

解释：

- `kind`
  这次手势是什么

- `start`
  pointer down 时不可变快照

- `draft`
  当前 pointer move 后的临时结果

- `meta`
  少量策略位和清理信息

不建议继续保留：

- `base / derived / feedback / commit`

这组名字虽然也能用，但对现在这套 whiteboard 来说还是偏重。  
更短、更直接的版本是：

- `start`
- `draft`

而：

- `view` 从 `draft` 派生
- `apply` 从 `draft` 派生

也就是说，真正存状态的只有：

- `start`
- `draft`

这样复杂度最低。

## 最小 store 设计

长期最优建议全局只显式保留这几个核心 store：

```ts
type EditorState = {
  selection: SelectionTarget
  gesture: ActiveGesture | null
}
```

然后全部用 derived read 来拿：

- `affordance = deriveSelectionAffordance(selection, scene)`
- `overlay = deriveOverlay(selection, affordance, gesture)`

关键点：

- `affordance` 不单独落成可写状态
- `overlay` 不单独作为 feature 主写状态
- `gesture` 是唯一临时交互状态

如果要更明确一点，可以理解成：

```text
持久状态只有 selection
临时状态只有 gesture
其余尽量 derive
```

这是整个简化里最重要的一条。

## 顶层 API

顶层建议只暴露下面这组 API。

```ts
type GestureRuntime = {
  get(): ActiveGesture | null
  start(input: GestureStartInput): void
  step(input: GestureStepInput): void
  end(input: GestureEndInput): void
  cancel(): void
}
```

说明：

- `start`
  pointer down 后决定进入 gesture 时调用

- `step`
  pointer move 时推进当前 gesture

- `end`
  pointer up 时根据当前 `draft` 生成 commit 并落盘

- `cancel`
  escape / pointer cancel / cleanup

这里不要再额外引入：

- `idle`
- `running`
- `committing`
- `cleanuping`

这些状态枚举。

原因是 runtime 本身已经有：

- `gesture === null`
- `gesture !== null`

这已经足够表达绝大多数逻辑。

## Press API

press 层建议收敛成一个函数：

```ts
type SelectionPressResult = {
  chrome: boolean
  tap?: SelectionTap
  drag?: GestureStartInput
  hold?: GestureStartInput
}

function resolveSelectionPress(input: ResolveSelectionPressInput): SelectionPressResult
```

这里继续保留：

- `tap`
- `drag`
- `hold`

不要再换成更多概念。

### `SelectionTap` 建议也保持很小

```ts
type SelectionTap =
  | { kind: 'clear' }
  | { kind: 'select'; target: SelectionTarget }
  | { kind: 'toggle'; id: NodeId }
```

如果未来要支持 field/focus，可以再加，不要一开始扩大。

### `GestureStartInput` 统一成最少结构

```ts
type GestureStartInput =
  | { kind: 'move'; input: MoveGestureInput }
  | { kind: 'marquee'; input: MarqueeGestureInput }
  | { kind: 'transform'; input: TransformGestureInput }
```

顶层只看：

- 这次创建哪种 gesture
- 其余具体数据下沉到各自 input

## `ActiveGesture` 主类型

建议最终收敛成：

```ts
type ActiveGesture =
  | MoveGesture
  | MarqueeGesture
  | TransformGesture
```

并且三者字段风格一致：

```ts
type MoveGesture = {
  kind: 'move'
  start: MoveStart
  draft: MoveDraft
  meta: MoveMeta
}

type MarqueeGesture = {
  kind: 'marquee'
  start: MarqueeStart
  draft: MarqueeDraft
  meta: MarqueeMeta
}

type TransformGesture = {
  kind: 'transform'
  start: TransformStart
  draft: TransformDraft
  meta: TransformMeta
}
```

这里没有：

- `status`
- `phase`
- `step`
- `followup`

原因是这些都不是真正必要状态。

## Move Gesture API

### `MoveStart`

```ts
type MoveStart = {
  point: Point
  selection: SelectionTarget
  roots: readonly NodeId[]
  bounds: Rect
  snapIds: readonly NodeId[]
}
```

解释：

- `point`
  pointer down world 点

- `selection`
  开始 move 时的稳定选区快照

- `roots`
  这次真正会移动的 root nodes

- `bounds`
  这组对象的初始 visual bounds

- `snapIds`
  snap 时需要排除的 ids

不建议在 `start` 里再塞：

- guides
- hovered
- preview patches

这些都不是 start 事实。

### `MoveDraft`

```ts
type MoveDraft = {
  delta: Vector
  bounds: Rect
  nodes: readonly NodePatch[]
  edges: readonly EdgePatch[]
  hoverId?: NodeId
  guides: readonly Guide[]
}
```

这就是 move 过程中唯一需要不断更新的临时结果。

解释：

- `delta`
  当前实际生效位移

- `bounds`
  snap 修正后的 moving rect

- `nodes`
  节点预览 patch

- `edges`
  edge 预览 patch

- `hoverId`
  当前 frame / container hover

- `guides`
  snap guides

这里建议直接把 `hoverId` 和 `guides` 放进 `draft`。

不要单独再发明：

- `MoveEffect`
- `PreviewEffect`
- `DropTargetPreview`

因为对当前阶段来说，它们都只是 move 的临时结果。

### `MoveMeta`

```ts
type MoveMeta = {
  selectionMode: 'keep' | 'restore'
}
```

只保留一个策略位就够了。

解释：

- `keep`
  pointer up 后保留当前 selection

- `restore`
  pointer up 后恢复 drag 前的 selection

这就是之前 `persist / temporary` 的最小落地版。

### Move 过程 API

```ts
function createMoveGesture(input: MoveGestureInput): MoveGesture
function stepMoveGesture(gesture: MoveGesture, input: GestureStepInput): MoveGesture
function finishMoveGesture(gesture: MoveGesture): GestureApply
```

其中：

```ts
type MoveGestureInput = {
  point: Point
  selection: SelectionTarget
  affordance: SelectionAffordance
  scene: MoveScene
  snap?: MoveSnapSolver
  selectionMode: 'keep' | 'restore'
}
```

`stepMoveGesture` 的逻辑应该非常直白：

1. 算 raw delta
2. 算 raw bounds
3. 调 `snap`
4. 生成 `draft`
5. 返回新 gesture

没有别的隐藏状态。

## Marquee Gesture API

### `MarqueeStart`

```ts
type MarqueeStart = {
  point: Point
  mode: 'intersect' | 'contain'
  initial: SelectionTarget
}
```

这里只保留三件事：

- 从哪里开始框
- 这次框选规则是什么
- 开始前的选区是什么

### `MarqueeDraft`

```ts
type MarqueeDraft = {
  rect: Rect
  target: SelectionTarget
}
```

解释：

- `rect`
  当前 marquee rect

- `target`
  当前 marquee 算出来的临时选区

不再单独保存：

- `selectedIds`
- `frameIds`
- `groupIds`

这些都应该来自场景查询，不是 gesture 自己存的事实。

### `MarqueeMeta`

```ts
type MarqueeMeta = {
  keepHandles: boolean
}
```

如果暂时根本不需要这类策略，`meta` 甚至可以为空对象。

### Marquee 过程 API

```ts
function createMarqueeGesture(input: MarqueeGestureInput): MarqueeGesture
function stepMarqueeGesture(gesture: MarqueeGesture, input: GestureStepInput): MarqueeGesture
function finishMarqueeGesture(gesture: MarqueeGesture): GestureApply
```

其中 `finish` 通常只会产出：

```ts
type GestureApply = {
  selection?: SelectionTarget
  nodes?: readonly NodePatch[]
  edges?: readonly EdgePatch[]
}
```

marquee 最常见只改：

- `selection`

## Transform Gesture API

### `TransformStart`

```ts
type TransformStart = {
  point: Point
  handle: TransformHandle
  selection: SelectionTarget
  bounds: Rect
}
```

### `TransformDraft`

```ts
type TransformDraft = {
  bounds: Rect
  nodes: readonly NodePatch[]
  guides: readonly Guide[]
}
```

如果未来恢复旋转，也建议保持同一个形状：

```ts
type TransformDraft = {
  bounds: Rect
  nodes: readonly NodePatch[]
  guides: readonly Guide[]
  angle?: number
}
```

不要额外发明一个单独 `RotateDraft`。

### `TransformMeta`

```ts
type TransformMeta = {
  mode: 'resize' | 'rotate'
}
```

如果多选长期不允许 rotate，那么：

- 单选可以 `mode = 'resize' | 'rotate'`
- 多选固定 `mode = 'resize'`

不用再让 transform runtime 到处判断。

### Transform 过程 API

```ts
function createTransformGesture(input: TransformGestureInput): TransformGesture
function stepTransformGesture(gesture: TransformGesture, input: GestureStepInput): TransformGesture
function finishTransformGesture(gesture: TransformGesture): GestureApply
```

## Snap API

snap 长期最优建议明确拆成两个 solver：

```ts
function solveMoveSnap(input: MoveSnapInput): MoveSnapResult
function solveResizeSnap(input: ResizeSnapInput): ResizeSnapResult
```

不要保留一个既做 move 又做 resize、还带副作用的大 runtime。

### `MoveSnapInput`

```ts
type MoveSnapInput = {
  rect: Rect
  excludeIds: readonly NodeId[]
  mode: 'normal' | 'cross'
}
```

### `MoveSnapResult`

```ts
type MoveSnapResult = {
  rect: Rect
  guides: readonly Guide[]
  hoverId?: NodeId
}
```

这里的命名刻意很短：

- 输入是 `rect`
- 输出还是 `rect`

不要写：

- `rawRect`
- `snappedRect`
- `resolvedRect`

如果在函数内部需要区分，再用局部变量。

对 API 使用者来说：

- 传进去一个 rect
- 拿回来一个 rect

就够了。

### `mode` 命名

`allowCross` 建议在公开 API 层改成：

```ts
mode: 'normal' | 'cross'
```

理由：

- 比 `allowCross` 更短
- 语义是策略模式，不是布尔特判
- 以后如果还有别的 snap 策略更容易扩展

如果后续仍然觉得 `'cross'` 不够直观，也可以改成：

- `'same-edge' | 'cross-edge'`

但第一版我更建议：

- `'normal' | 'cross'`

## Overlay API

overlay 不建议继续作为“交互模块随手往里写 patch 的地方”。

长期最优应该只有一个 derived API：

```ts
type OverlayState = {
  box?: Rect
  handles?: TransformHandleSet
  guides: readonly Guide[]
  hoverId?: NodeId
  marquee?: Rect
}

function deriveOverlay(input: {
  selection: SelectionTarget
  affordance: SelectionAffordance
  gesture: ActiveGesture | null
}): OverlayState
```

这一步非常关键。

也就是说，长期要尽量删除这种写法：

- `write.preview.nodes(...)`
- `write.preview.selection(...)`
- `snap.clear()`
- `overlay.feedback.snap.write(...)`

更合理的是：

- gesture 变了
- overlay 自动 derive

这样 cleanup 会自然简单很多。

## `GestureApply` 统一提交协议

建议所有 gesture 的 `finish` 都统一返回：

```ts
type GestureApply = {
  selection?: SelectionTarget
  nodes?: readonly NodePatch[]
  edges?: readonly EdgePatch[]
}
```

如果确实需要额外 cleanup 策略，可以在 runtime 层做，不要塞进 apply。

### 为什么要统一成这个形状

因为对 editor 来说，pointer up 后真正会落盘的东西无非就是：

- selection 变了
- nodes 变了
- edges 变了

不要再为不同 gesture 定义不同 commit 大协议。

## runtime 内部推荐实现

如果按最少状态实现，runtime 内部其实只需要：

```ts
let gesture: ActiveGesture | null = null
```

然后：

```ts
function start(input: GestureStartInput) {
  gesture = createGesture(input)
}

function step(input: GestureStepInput) {
  if (!gesture) return
  gesture = stepGesture(gesture, input)
}

function end(input: GestureEndInput) {
  if (!gesture) return
  gesture = stepGesture(gesture, input)
  const apply = finishGesture(gesture)
  applyGesture(apply)
  gesture = null
}

function cancel() {
  gesture = null
}
```

这套实现的关键是：

- runtime 不存第二份 preview
- runtime 不存第二份 snap guides
- runtime 不存第二份 hovered target

全部都在 `gesture.draft` 或 derived overlay 里。

## 推荐删除的状态和概念

如果按这套 API 走，长期建议逐步删除或淡化这些东西：

- feature-specific `preview write`
- `snap.clear()` 这类显式清空 API
- `MoveEffect`
- `hovered` 这种过泛命名
- 每条 interaction 自己维护一份 overlay patch
- “commit 依赖 preview store” 这种反向依赖

对应的替代方式是：

- preview 来自 `gesture.draft`
- overlay 来自 `deriveOverlay`
- cleanup 通过 `gesture = null` 自然完成

## 最终推荐的一套短命名

如果要压缩到最简短、同时还能看懂，我推荐最后统一成这组名字：

### 类型名

- `SelectionTarget`
- `SelectionAffordance`
- `ActiveGesture`
- `MoveGesture`
- `MarqueeGesture`
- `TransformGesture`
- `GestureApply`
- `OverlayState`
- `SnapResult`

### 函数名

- `resolveSelectionPress`
- `createGesture`
- `stepGesture`
- `finishGesture`
- `cancelGesture`
- `solveMoveSnap`
- `solveResizeSnap`
- `deriveOverlay`

### 字段名

- `kind`
- `start`
- `draft`
- `meta`
- `point`
- `bounds`
- `rect`
- `nodes`
- `edges`
- `guides`
- `hoverId`

这组命名的目标就是：

- 没有空话
- 没有抽象味太重的词
- 看到名字基本就知道里面装什么

## 最后结论

如果按“状态越少、复杂度越低、命名越短越清晰”的标准来做，长期最优不是继续拆更多层，而是收敛成下面这个最小闭环：

```text
selection
-> affordance
-> press
-> gesture(start/draft)
-> snap
-> overlay(derived)
-> apply
```

其中真正持久存下来的只有两件事：

- `selection`
- `gesture`

其余尽量都 derive 或在局部计算里结束。

这会是我现在认为最稳、最短、最不容易再次长歪的一版 API 设计。

## 已实施收敛

这一轮已经先做掉了两块最值得马上收紧的地方。

### 1. `snap` 已经从 side effect runtime 收成显式结果

现在 `snap` 不再直接写 guides，也不再需要 `clear()`。

已经改成：

- `node.move(input) -> { rect, guides }`
- `node.resize(input) -> { update, guides }`

这一步的价值是：

- `selection move` 自己显式接收 snap 结果
- `transform` 自己显式接收 snap 结果
- guides 的来源变得可读
- cleanup 不再依赖“顺手清一个 snap store”

也就是说，`snap` 现在更接近 solver，而不是 UI runtime。

### 2. selection preview 已经从多写口收成单一写口

原来 selection preview 是分散写的：

- 写 node patches
- 写 edge patches
- 写 frame hover
- 写 guides
- 写 marquee

现在已经收成：

- `preview.selection.replace(preview)`
- `preview.selection.clear()`

也就是说，当前 selection 交互的临时反馈，已经能以“一次完整替换”的方式写入。

这一步的价值是：

- `move` 不再到处写三四次
- `transform` 不再单独管 guides 清理
- `marquee` 也回到同一条 preview 通道
- selection preview 的 mental model 明显变简单

### 3. `move / marquee / transform` 三条线已经统一成“单次写完整反馈”

这三条线现在都已经收敛成同一个模式：

1. 算当前 gesture 结果
2. 组装完整 preview
3. 一次 `replace`
4. cleanup 时统一 `clear`

这虽然还不是完整 `ActiveGesture`，但已经把最容易分叉的那层写状态先收住了。

## 本轮继续实施

在上面那一轮基础上，这次已经把核心运行态继续往前推进了一步。

### 1. runtime 已经显式托管 `gesture`

现在 interaction runtime 不再只管 `active session`，还会显式维护：

- `gesture: ActiveGesture | null`

selection 三条主链现在都会把当前临时状态写到 `session.gesture`：

- `selection-move`
- `selection-marquee`
- `selection-transform`

runtime 在这些时机统一同步 `gesture`：

- activate
- pointer move
- pointer up
- auto pan frame
- keydown / keyup / blur
- finish / cancel / cleanup

这意味着：

- 当前 selection 手势的临时事实终于有了统一宿主
- 不再需要 interaction 自己再维护一份 overlay preview 写口

### 2. selection preview 写 API 已经整体删除

现在已经不再有这套 API：

- `preview.selection.replace`
- `preview.selection.clear`

也就是说，selection 的临时 feedback 不再是“外部主动写 overlay”。

现在的结构变成：

- interaction session 更新 `gesture`
- overlay 订阅 `gesture`
- overlay 内部把 `gesture.draft` 投影成 selection overlay state

这一步很关键，因为它意味着：

- selection preview 不再是独立状态源
- overlay 不再需要 selection feature 主动喂 patch

### 3. overlay 的 selection feedback 已经由 `gesture` 驱动

现在 overlay 内部会把：

- `gesture -> selection preview -> selection overlay`

串起来。

也就是说：

- node patches
- edge patches
- frame hover
- marquee rect
- snap guides

这些 selection 主链反馈，现在都来自当前 `gesture`。

这一步虽然还没有把 overlay 整体彻底变成纯 derive-only store，但对 selection 这条线来说，主干已经完成了。

### 4. `move / marquee / transform` 已经变成显式 gesture 写法

当前三条线现在的结构已经变成：

#### move

- core move session 仍然负责 move 纯计算
- interaction 把结果组装成 `MoveGesture.draft`
- runtime 托管当前 gesture
- overlay 从 gesture 画蓝框 / preview / guides

#### marquee

- marquee session 仍然负责 marquee rect 与 matched selection
- interaction 把结果组装成 `MarqueeGesture.draft`
- overlay 只消费 draft 里的 marquee

#### transform

- transform plan / project 仍然负责几何计算
- interaction 把结果组装成 `TransformGesture.draft`
- resize snap guides 也进入 draft

### 5. cleanup 已经进一步收敛

对 selection 主链来说，cleanup 现在已经不再负责：

- 清 selection preview patch
- 清 marquee
- 清 guides
- 清 hover

这些都跟随 `gesture = null` 一起自然消失。

目前 cleanup 只保留真正的业务动作，例如：

- temporary drag 结束后恢复旧 selection

这是这轮重构最重要的结果之一。

## 当前代码现在的状态

经过这轮之后，当前系统已经比之前更接近下面这个结构：

```text
selection
-> affordance
-> interaction session
-> snap result
-> selection preview replace
-> overlay selectors
```

相比之前，已经少了一层最糟糕的隐式耦合：

- snap 偷偷写 guides
- interaction 再写别的 preview
- cleanup 再到处 clear

现在这层已经被削掉了。

但长期看，仍然没有真正完成的部分还有两大块。

## 还没做完的根问题

### 1. 还没有统一的 `ActiveGesture`

现在虽然 runtime 已经显式托管 `gesture`，但 gesture 模型本身还只先覆盖了 selection 三条主链。

也就是说：

- edge interaction 还没接入
- draw interaction 还没接入
- runtime state 的更多派生语义还没全面切到 gesture

selection 这条线已经完成了第一阶段，但全局还没有完全统一。

另外，gesture 的内部几何事实虽然已经进入显式模型，但还没有把所有 interaction 相关局部变量都彻底搬空，例如：

- commit 前局部缓存
- 少量 session 内部辅助变量

也就是说：

- 数据流更清楚了
- 但全系统级的临时手势模型还没有完全统一

### 2. `overlay` 还是一个可写状态池

虽然 selection 主链已经改成由 `gesture` 驱动，但 overlay 整体仍然还是一个混合模型：

- selection feedback 来自 gesture
- draw / edge / text / mindmap 仍然走主动写 overlay

长期最优还是应该继续往前走到：

- gesture 持有 `draft`
- overlay 只做 `derive`

这一步还没做。

## 下一阶段实施方案

如果继续按“尽量精简、尽量重构、不在乎成本”的标准推进，我建议下面这个顺序。

## Phase 1. 引入最小 `ActiveGesture`

目标不是一口气重写所有 interaction，而是只覆盖：

- `selection move`
- `selection marquee`
- `selection transform`

### 目标结构

```ts
type ActiveGesture =
  | MoveGesture
  | MarqueeGesture
  | TransformGesture
```

并且统一成：

```ts
type Gesture = {
  kind: string
  start: ...
  draft: ...
  meta: ...
}
```

### 这一阶段要做什么

1. 把 `selection/move.ts` 的局部 `session + modifiers + restoreSelection` 收进 `MoveGesture`
2. 把 `selection/marquee.ts` 的局部 `session + emittedKey` 收进 `MarqueeGesture`
3. 把 `transform/index.ts` 的局部 `plan + latest + modifiers` 收进 `TransformGesture`
4. 增加统一分派：
   - `createGesture`
   - `stepGesture`
   - `finishGesture`

### 这一阶段不要做什么

- 不要先动 edge interaction
- 不要先动 draw
- 不要先试图做全系统通用 interaction framework

这一步只解决：

- selection 主链的临时状态终于有统一归宿

## Phase 2. 把 selection preview 从“可写 overlay”升级成“gesture draft 的投影”

这一步的核心目标是：

- `preview.selection.replace(...)` 继续存在一小段时间作为过渡
- 但内部语义开始向 `gesture.draft` 靠拢

长期最终目标是：

- move preview 来自 `MoveGesture.draft`
- marquee preview 来自 `MarqueeGesture.draft`
- transform preview 来自 `TransformGesture.draft`

然后统一：

```ts
deriveOverlay({ selection, affordance, gesture })
```

### 这一阶段要做什么

1. 增加 `deriveSelectionPreview(gesture)` 或直接并入 `deriveOverlay`
2. React 不再依赖 interaction 自己拼的多份 selection 临时状态
3. `preview.selection.replace` 逐步退成兼容层，最终删除

### 这一阶段完成后的收益

- cleanup 基本只剩 `gesture = null`
- guides / marquee / hover / node patches 不再需要分别清理

## Phase 3. interaction runtime 直接托管 `gesture`

现在 runtime 管的是“当前 session”，而不是“当前 gesture”。

长期我建议直接变成：

```ts
type InteractionRuntimeState = {
  gesture: ActiveGesture | null
}
```

session 仍然可以作为内部执行模型存在，但不再是主语义出口。

### 这一阶段要做什么

1. 在 runtime 里显式持有 `gesture`
2. `mode` 尽量从 `gesture.kind` derive
3. `transforming / selecting / drawing` 尽量从 `gesture.kind` derive

### 这一阶段完成后的收益

- 交互运行态只剩一个真正重要的东西：当前 gesture
- `interaction.state` 不再需要围着 session 补各种派生语义

## Phase 4. 继续纯化 `snap`

虽然这轮已经把 `snap` 从 side effect runtime 收成显式结果了，但还可以继续收。

下一步建议：

- 不再叫 `createSnapRuntime`
- 改成更直接的：
  - `solveMoveSnap`
  - `solveResizeSnap`
  - `solveEdgeConnect`

也就是从“对象式 runtime”继续简化到“纯函数 solver”。

### 这一阶段要做什么

1. 把 `readZoom / query / config` 通过依赖注入包成 solver context
2. interaction 只调用纯 solver
3. 删除 `snap` 这个“像状态机但又不是状态机”的中间层

### 这一阶段完成后的收益

- `snap` 从 API 语义上彻底变成计算服务
- interaction / gesture / overlay 的边界会更清楚

## Phase 5. 再决定 edge / draw 是否接入同一模型

这一阶段不应该提前。

等 selection 主链完全稳定以后，再看：

- edge connect / drag / route
- draw stroke / erase

是否值得统一成更泛化的 `ActiveGesture`。

如果接入后能减少概念，就接。  
如果接入后只是为了统一而统一，就不要做。

## 推荐的实际落地顺序

如果按工程执行来排，我建议这样推进：

1. 先完成 `MoveGesture`
2. 再完成 `MarqueeGesture`
3. 再完成 `TransformGesture`
4. 然后做 `deriveOverlay`
5. 最后决定要不要替换 runtime 的主状态出口

原因很简单：

- move 最复杂，收益最大
- marquee 最简单，适合作为第二个验证点
- transform 依赖 affordance 和 snap，放第三个最稳

## 这套实施方案的判断标准

后续每做一步，都应该拿下面三个标准来判断是不是在变好：

### 1. 当前手势的临时事实是否只存在一处

如果一个 gesture 的临时事实同时存在：

- session 局部变量
- preview store
- overlay selector
- React 私有推断

那就还没收敛好。

### 2. cleanup 是否越来越接近 `gesture = null`

如果 cleanup 还需要：

- 清 guides
- 清 marquee
- 清 hover
- 清 node preview
- 清 edge preview

那说明临时反馈还没有真正挂在 gesture 上。

### 3. React 是否只消费，不再解释

如果 React 还在做一套新的交互语义判断，那就说明底层模型还不够完整。

## 最后判断

这轮已经做掉的重构，主要是把最明显的隐式状态先清掉了：

- snap side effect
- selection preview 多写口

这两步不是终局，但非常值得做，因为它们把下一步真正的 `ActiveGesture` 重构路已经铺开了。

如果继续往长期最优推进，下一刀就应该直接落在：

- `MoveGesture`
- `MarqueeGesture`
- `TransformGesture`

而不是再去补更多局部判断。

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

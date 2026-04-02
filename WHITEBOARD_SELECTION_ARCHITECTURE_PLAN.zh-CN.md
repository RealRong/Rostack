# Whiteboard Selection 长期最优方案

## 结论

selection 这条线长期最优不需要拆成很多概念层。

更合适的目标不是：

- `intent`
- `plan`
- `interaction runtime`
- `followup`
- `state/actions`
- `read model`

这么一整套大体系。

对现在这套 whiteboard，更长期、也更可维护的方案其实更简单：

```text
press target
-> press decision
-> session handoff
```

也就是：

1. 先判断按到了什么
2. 再决定 tap / drag / hold 怎么走
3. 最后切到 move 或 marquee session

这已经足够稳定，也足够清晰。

## 这次评估覆盖范围

这份方案不是只看 [press.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/selection/press.ts)，还看了：

- [selection/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/selection/index.ts)
- [selection/press.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/selection/press.ts)
- [selection/marquee.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/selection/marquee.ts)
- [whiteboard-core/selection/press.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/selection/press.ts)
- [whiteboard-core/selection/target.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/selection/target.ts)
- [whiteboard-core/selection/summary.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/selection/summary.ts)
- [runtime/read/selection.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/selection.ts)
- [runtime/write/session.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/write/session.ts)

## 当前实现哪里不顺

当前 selection 不是功能太多，而是几个阶段的表达还不够干净。

### 1. `press.ts` 混了两类东西

[press.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/selection/press.ts) 当前同时在做：

- press target 解析
- core decision 接入
- hold timer 生命周期
- drag threshold 判定
- move / marquee session 切换

这不是错误，但会让文件读起来有点“每块都不大，整体却有点绕”。

### 2. `SelectionPressState` 这个名字不准确

它现在同时装了：

- `target`
- `decision`
- `start`
- `holdTask`

其中：

- `target / decision / start` 更像 immutable plan
- `holdTask` 才是 runtime state

所以它不是一个很纯的 `state`。

### 3. core 的 decision 协议还可以更贴近交互语义

[whiteboard-core/src/selection/press.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/selection/press.ts) 现在核心返回的是：

```ts
{
  chrome,
  release?,
  drag?,
  hold?
}
```

这里最大的问题不是结构，而是命名。

尤其是：

- `release`

这个词更像底层事件，而不是用户交互语义。

长期更好的表达应该是：

- `tap`
- `drag`
- `hold`

因为这三件事本来就是用户层面的行为阶段。

## 长期最优应该保留哪些概念

我现在更推荐 selection 只显式保留这几个概念：

- `press target`
- `press decision`
- `tap action`
- `drag session`
- `hold session`

再加上一个已经存在、也应该继续保留的：

- `SelectionSummary`

这就够了。

不需要再人为拔高成更多层。

## 最优主线

长期最优我建议把 selection 读成下面这条线：

```text
pointer down
-> resolve press target
-> resolve press decision
-> arm optional hold
-> if hold fires: start hold session
-> else if move passes threshold: start drag session
-> else if pointer up: run tap action
```

这条线足够表达产品行为，而且概念负担很低。

## 关于 hold

你前面提的方向是对的：

- hold 如果触发，就直接进入 contain marquee
- 如果 move 先超过阈值，就取消 hold，转 drag
- 如果 up 先发生，就取消 hold，执行 tap

真正需要注意的一点只是：

- hold 之前仍然要先知道按到了什么

因为你至少要先判定：

- 这次 press 是否由 selection 接管
- 当前 press target 是 background、selection-box，还是 node
- 当前场景是否允许 arm hold

所以最自然的顺序不是“先 hold 再 pick”，而是：

1. resolve press target
2. resolve press decision
3. arm hold if needed

## 推荐的最终结构

长期最优我建议最终收敛成下面四个关键函数。

## 1. `resolveSelectionPressTarget`

职责：

- 从 pointer down 输入判断这次按到了什么

输出建议：

```ts
type SelectionPressTarget =
  | { kind: 'background' }
  | { kind: 'selection-box' }
  | { kind: 'node'; nodeId: NodeId; hitNodeId: NodeId; field?: TField }
  | { kind: 'group-shell'; nodeId: NodeId }
```

这层可以继续保留在 core，也可以由 editor 先做很薄的一层规范化后再交给 core。

重点不是它在哪，而是它应该是一个明确阶段。

## 2. `resolveSelectionPressDecision`

职责：

- 基于：
  - 当前 selection summary
  - modifiers
  - press target
- 决定：
  - tap action
  - drag session 应该怎么起
  - hold session 应该怎么起

我建议长期把返回形状收敛成：

```ts
type SelectionPressDecision = {
  chrome: boolean
  tap?: SelectionTapAction
  drag?: SelectionSessionStart
  hold?: SelectionSessionStart
}
```

这里最关键的变化不是结构，而是：

- `release` 改成 `tap`

这样 editor runtime 会更容易读。

## 3. `createPressInteraction`

职责只保留这些：

- 维护 `pointer down` 基线
- 维护 `holdTask`
- 判断是否超过 drag threshold
- 负责 cancel hold
- 负责从 decision 切换到下一阶段 session
- 负责在 tap 时执行 action

不要再让它承担太多 selection 业务规则。

也就是说，[press.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/selection/press.ts) 长期最优应该是一个薄 runtime 壳，而不是 selection 规则文件。

## 4. `createSelectionSession`

这里不必叫 `followup`，也不用拔高成一个大概念。

只需要一个很直接的 session factory：

```ts
SelectionSessionStart
-> move session
-> marquee session
```

例如：

- `move` -> [move.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/selection/move.ts)
- `marquee` -> [marquee.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/selection/marquee.ts)

这比现在的：

- `createDragSession`
- `createFollowupSession`

两层嵌套更自然。

## 不需要额外引入的概念

这里明确说一下，哪些东西我现在不建议再单独拔高。

## 1. 不需要单独引入 `intent`

如果它只是：

- `pick -> subject`
- `pick -> normalized target input`

那它完全可以只是一个很薄的函数，不值得上升为 selection 的一级架构概念。

可以有这个步骤，但不需要把它变成大词。

## 2. 不需要单独引入 `state/actions`

当前 selection state 已经够简单：

- `replace`
- `add`
- `remove`
- `toggle`
- `clear`

这套写接口还不是主要痛点。

除非以后 selection 写入语义真的明显失控，否则没必要再造一个 action system。

## 3. 不需要把 `followup` 当成一级概念

本质上它现在就两类：

- `move`
- `marquee`

这只是“下一阶段 session”，不需要过度命名。

## 4. `SelectionSummary` 继续保留，但把它视为 read model

[runtime/read/selection.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/selection.ts) 现在的方向是对的。

长期建议继续保留：

- `SelectionTarget`
- `SelectionSummary`
- `SelectionTransformBox`

但要明确：

- 它们是 read model
- 不是 interaction protocol

也就是说，它们可以继续存在，但不需要加入“selection 分层概念数”的统计里。

## 命名收敛建议

如果只做长期最值得的命名优化，我建议改这些：

- `SelectionPressState` -> `SelectionPressPlan`
- `release` -> `tap`
- `createFollowupSession` -> `createSelectionSession`
- `toSelectionPressSubject` -> `resolveSelectionPressTargetInput`

其中收益最大的是：

- `release` -> `tap`

因为它直接把协议从事件词改成了交互词。

## 对 `press.ts` 的具体建议

如果以后要继续重构 [press.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/selection/press.ts)，我建议目标不是“拆很多文件”，而是把它整理成下面这个形状：

### 1. 解析阶段

- `resolveSelectionPressTarget`
- `resolveSelectionPressDecision`

### 2. runtime 阶段

- `armHold`
- `cancelHold`
- `startSelectionSession`
- `runTapAction`

### 3. press session 本体

- `move`
- `up`
- `cancel`
- `cleanup`

这样读起来会更像一个标准 interaction runtime。

## 推荐目录形态

长期不需要大改成很多层，只要把 selection 保持成这个形状就够了：

```text
whiteboard/packages/whiteboard-core/src/selection/
  target.ts
  summary.ts
  bounds.ts
  marquee.ts
  press.ts

whiteboard/packages/whiteboard-editor/src/interactions/selection/
  index.ts
  press.ts
  marquee.ts
  move.ts
```

如果以后 `press.ts` 继续变重，再局部拆目录也不迟，但不是现在必须做的事。

## 推荐实施顺序

如果以后真要按这个方向继续优化，我建议顺序如下。

## Phase 1

目标：

- 把 `SelectionPressState` 改名并收紧成更像 plan 的结构
- 把 `release` 改成 `tap`

这一步是最直接的可读性提升。

## Phase 2

目标：

- 合并 `createDragSession` / `createFollowupSession`
- 收敛成一个 `createSelectionSession`

这一步会让 `press.ts` 主流程更顺。

## Phase 3

目标：

- 把 hold / drag / tap 的 runtime 逻辑整理成对称 helper

例如：

- `armHold`
- `cancelHold`
- `startDragSession`
- `runTapAction`

这一步做完以后，`press.ts` 的读感会好很多。

## 最终建议

如果目标是“长期最优”，我现在的建议已经收敛成这几句：

1. 不要把 selection 架构搞成过多概念层。
2. 稳定住 `press target -> press decision -> session handoff` 这条主线。
3. 把 `release` 改成 `tap`，让协议更贴近交互语义。
4. 让 [press.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/selection/press.ts) 只负责 runtime，不继续承载太多 selection 规则细节。
5. 继续保留 `SelectionSummary`，但把它明确视为 read model，而不是新增架构层。

一句话总结：

**selection 长期最优不是“更多层”，而是“更少但更稳定的阶段”。**

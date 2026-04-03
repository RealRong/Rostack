# Whiteboard Core 底层模型简化方案

## 背景

这一轮对 `whiteboard-editor/src/interactions` 的持续重构之后，上层交互结构已经比之前清楚很多：

- `selection` 入口已经收敛成单入口 start
- `edge` 已经拆成
  - `route handle`
  - `connect / reconnect`
  - `body move`
- `transform` 入口也已经收成单入口

但继续往上层做“函数内联”或“入口收口”，收益已经明显下降。

当前剩余的复杂度，主要不是 editor 自己写乱了，而是 core 还存在几类底层模型边界不够完整的情况：

1. core 只提供了计算零件，没有提供完整 interaction state machine
2. core 只提供了几何 state，没有提供选择语义 state
3. core 对“可编辑 handle / target”的建模还不够稳定，导致 editor 仍需做二次翻译
4. core 里仍有一部分算法态沿用 `Session` 命名，和 editor/runtime 已经收敛出的概念边界不一致

这份文档只讨论：

- 哪些 core 模型值得优化
- 优化后如何降低 editor 上层复杂度
- 推荐的实施顺序

不包含代码实现。

---

## 当前结论

如果目标是“继续降低 whiteboard 上层交互复杂度”，最值得动的不是再去改 editor 入口，而是优先补齐 core 里的 3 类底层模型：

1. `TransformState`
2. `MarqueeSelectionState`
3. `RouteHandleTarget`

然后再做一轮统一命名：

4. core algorithm `Session -> State`

这 4 项里面，前 3 项会直接减少上层结构复杂度，第 4 项主要减少概念噪音。

---

## 统一 API 约定

如果要让 core 真正承担“降 editor 复杂度”的职责，建议后续新增的底层模型统一遵守下面这套非常短的协议。

### 1. 只暴露 4 类名字

- `Spec`
  - editor 组装后的起始输入
- `State`
  - core 内部算法态
- `Draft`
  - 每帧预览输出
- `Commit`
  - pointer up 后的最终写入结果

也就是：

```ts
startX(spec): State | null
stepX(state, input): { state: State; draft: Draft }
finishX(state): Commit | undefined
```

不要再引入：

- `plan`
- `intent`
- `runtime`
- `followup`
- `controller`

这些词在 core 里没有必要。

### 2. core 只做算法，不持有 runtime 语义

core 可以做：

- 几何推进
- selection 组合
- handle 解析
- preview / commit 生成

core 不应该做：

- pointer capture
- hold timer
- auto pan 调度
- preview store 写入
- snap side-effect 写入

这些仍然留在 editor runtime。

### 3. editor 只负责 4 件事

- 读当前输入和只读模型
- 组装 `Spec`
- 把 `Draft` 映射到 `Gesture`
- 把 `Commit` 写回 document

如果某条 interaction 还需要 editor 同时负责：

- 起始快照
- 每帧 projection
- commit 拼装

那通常就说明 core 这一层还没补完整。

### 4. 能收成 start / step / finish 的，就不要拆更多层

你前面一直强调“概念越少越好”，这点在 core 一样成立。

长期建议就是：

- 一个 `State`
- 一个 `Draft`
- 一个 `Commit`
- 三个函数：`start / step / finish`

够了。

---

## 1. TransformState

### 现状

当前 transform 的核心数学已经在 core：

- `whiteboard/packages/whiteboard-core/src/node/transform.ts`

里面已经有：

- `computeResizeRect`
- `computeNextRotation`
- `projectResizePatches`
- `buildTransformCommitUpdates`
- `resolveSelectionTransformTargets`

但 editor 仍然需要自己维护一整套 transform 交互壳：

- `whiteboard/packages/whiteboard-editor/src/interactions/transform/plan.ts`
- `whiteboard/packages/whiteboard-editor/src/interactions/transform/project.ts`
- `whiteboard/packages/whiteboard-editor/src/interactions/transform/commit.ts`

也就是说，core 现在提供的是 transform 的零件，不是 transform 的完整交互模型。

### 问题

这会导致 editor 不得不重复承接几类职责：

1. 起始 drag snapshot 组装
2. single resize / single rotate / multi scale 的 plan 联合
3. 每帧 preview patch 计算
4. commit update 生成
5. snap 相关输入组装

这条线功能上没错，但概念边界是不完整的：

- core 负责几何
- editor 负责 interaction state
- interaction state 又不是 runtime session，只是算法态

最终结果就是 transform 这条线看起来总比 move / edge 更重。

### 长期最优模型

在 core 新增完整 transform state machine：

```ts
type TransformSpec =
  | { kind: 'single-resize'; ... }
  | { kind: 'single-rotate'; ... }
  | { kind: 'multi-scale'; ... }

type TransformState =
  | { kind: 'single-resize'; ... }
  | { kind: 'single-rotate'; ... }
  | { kind: 'multi-scale'; ... }

type TransformDraft = {
  nodePatches: readonly TransformPreviewPatch[]
  guides: readonly Guide[]
}

type TransformCommit = readonly TransformCommitUpdate[]

startTransform(spec: TransformSpec): TransformState | null
stepTransform(input: {
  state: TransformState
  point: Point
  modifiers: {
    alt: boolean
    shift: boolean
  }
  snap?: {
    resize?: (rect: Rect) => {
      rect: Rect
      guides: readonly Guide[]
    }
  }
}): {
  state: TransformState
  draft: TransformDraft
}
finishTransform(state: TransformState): TransformCommit
```

这里最关键的一点不是类型名字，而是职责切分：

- hit / affordance / selection 读取继续留在 editor
- 但 drag snapshot、projection、commit 全部进入 core
- editor 不再自己维护 `plan -> project -> commit`

### 上层收益

做完之后，上层 `transform` 可以明显缩短成：

1. 解析 start spec
2. `startTransform(...)`
3. `stepTransform(...)`
4. `finishTransform(...)`
5. 把 `draft` 映射到 gesture

届时以下文件会显著变薄，甚至可合并：

- `whiteboard/packages/whiteboard-editor/src/interactions/transform/plan.ts`
- `whiteboard/packages/whiteboard-editor/src/interactions/transform/project.ts`
- `whiteboard/packages/whiteboard-editor/src/interactions/transform/commit.ts`

### 优先级

最高。

这是当前最能继续降低 editor 复杂度的一刀。

### 建议实施形状

第一步不要追求“一次把 editor 全删干净”，更稳的落地顺序是：

1. 先在 core 新增 `TransformSpec / TransformState / TransformDraft / TransformCommit`
2. 让 editor `transform/index.ts` 先改成直接消费新接口
3. editor 里的 `plan.ts / project.ts / commit.ts` 逐步只剩 spec 组装或被完全删除

这样风险最低，而且最后结构最干净。

---

## 2. MarqueeSelectionState

### 现状

当前 core 的 marquee 建模在：

- `whiteboard/packages/whiteboard-core/src/selection/marquee.ts`

它提供的是几何 state：

- `MarqueeSession`
- `startMarqueeSession`
- `stepMarqueeSession`
- `finishMarqueeSession`

但 selection 语义仍然停留在 editor：

- `whiteboard/packages/whiteboard-editor/src/interactions/selection/marquee.ts`

editor 还要自己做：

1. 根据 rect 查询 node / edge
2. 把 matched items 套用到 base selection
3. 自己维护 emitted key
4. 自己判断 selection 是否变化

### 问题

这意味着 core 只建模了“框”，没有建模“框选”。

而 marquee 在白板里真正的业务含义其实不是 worldRect 本身，而是：

- 当前 rect
- 当前匹配结果
- 当前应用后的 selection
- selection 是否变化

这些语义现在全部泄漏到了 editor。

### 长期最优模型

把 marquee 从几何态提升成 selection 态。

推荐新增：

```ts
type MarqueeSelectionState = {
  pointerId: number
  startScreen: Point
  startWorld: Point
  match: 'touch' | 'contain'
  mode: SelectionMode
  base: SelectionTarget
  active: boolean
  worldRect?: Rect
  selection: SelectionTarget
}

type MarqueeSelectionDraft = {
  active: boolean
  worldRect?: Rect
  selection?: SelectionTarget
  changed: boolean
}

startMarqueeSelection(input: {
  pointerId: number
  startScreen: Point
  startWorld: Point
  match: 'touch' | 'contain'
  mode: SelectionMode
  base: SelectionTarget
}): MarqueeSelectionState

stepMarqueeSelection(input: {
  state: MarqueeSelectionState
  currentScreen: Point
  currentWorld: Point
  minDistance: number
  matched: SelectionTarget
}): {
  state: MarqueeSelectionState
  draft: MarqueeSelectionDraft
}

finishMarqueeSelection(state: MarqueeSelectionState): MarqueeSelectionDraft
```

如果不想一步到位，也至少应先下沉这两块：

1. `applySelectionTarget(base, matched, mode)` 的统一复用
2. `isSelectionTargetEqual(prev, next)` 的统一复用

也就是说，当前 `createMarqueeItemsKey(...)` 这种“为了规避 selection compare 缺口而补出来的字符串 key”，长期可以直接消失。

### 上层收益

做完之后，editor 的 `selection/marquee.ts` 不再需要自己拼装：

- geometry state
- selection apply policy
- emitted key

可以缩成：

1. 查询 matched items
2. `stepMarqueeSelection(...)`
3. 如果 `draft.changed`，则写 session selection
4. 把 rect / guides 写到 gesture

### 额外建议

当前 core `MarqueeSession` 和 `MarqueeStepResult` 同时携带：

- `active`
- `worldRect`

这层也有重复。

如果未来重构，建议把 `step` 的返回改成更统一的 shape，例如：

```ts
type MarqueeStep = {
  state: MarqueeState
  draft: {
    active: boolean
    worldRect?: Rect
  }
}
```

### 优先级

高。

如果你想让 selection 线继续降复杂度，这是 transform 之后最值得做的一项。

### 为什么这是底层模型，而不是 editor 清理

因为当前 marquee 的“复杂”并不在 runtime 壳，而在业务语义泄漏：

- 当前 rect 是什么
- 当前 match 到了什么
- 当前应用后的 selection 是什么
- 当前 selection 有没有变化

这四件事本来就是同一个状态机，不应该一半在 core，一半在 editor。

---

## 3. RouteHandleTarget

### 现状

当前 edge route line 已经在 editor 层做过一次大幅简化，但还保留了部分底层摩擦。

相关 core 模型在：

- `whiteboard/packages/whiteboard-core/src/types/edge.ts`
- `whiteboard/packages/whiteboard-core/src/edge/view.ts`
- `whiteboard/packages/whiteboard-core/src/edge/commands.ts`

当前 core 提供：

- `EdgeHandle`
  - `end`
  - `anchor`
  - `insert`

这已经比没有 handle 模型强很多，但对 editor 来说还不够“可执行”。

editor 现在仍要做几件额外工作：

1. 从 pick 的 `index / insert` 反查 `view.handles`
2. 把 handle 转成自己内部的 target
3. 插入成功后，再次回查 anchor point 作为 drag origin

### 问题

这说明 core 当前提供的是“展示 handle 列表”，但还没有提供“稳定的 route-edit target”。

而 editor 真正需要的是：

- 我点中了哪个 route handle
- 这个 handle 的可编辑 index 是多少
- 它当前的 point 是多少
- insert 成功后，拖拽起点是多少

### 长期最优模型

在 core 增加 route handle 解析模型：

```ts
type RouteHandleTarget =
  | {
      kind: 'anchor'
      edgeId: EdgeId
      index: number
      point: Point
    }
  | {
      kind: 'insert'
      edgeId: EdgeId
      index: number
      point: Point
    }

resolveRouteHandleTarget(input): RouteHandleTarget | undefined
```

关键点是：

- editor 不再自己区分 `insertIndex` / `index`
- editor 不再自己去 `view.handles.find(...)`
- editor 不再自己维护 “pick -> handle target” 这一层翻译

更进一步，`insertRoutePoint` 可以改成返回更完整的结果：

```ts
type InsertRoutePointResult = Result<{
  index: number
  patch: EdgePatch
  point: Point
}, 'invalid'>
```

甚至直接返回：

```ts
target: RouteHandleTarget
```

这样 editor 就不必插入后再回查 origin。

再进一步，如果想把这条线做到最短，甚至可以直接补齐完整 route drag state machine：

```ts
type RouteHandleSpec = {
  pointerId: number
  target: RouteHandleTarget
  startWorld: Point
}

type RouteHandleState = {
  edgeId: EdgeId
  index: number
  pointerId: number
  startWorld: Point
  origin: Point
  point: Point
}

type RouteHandleDraft = {
  patch?: EdgePatch
  activeRouteIndex: number
}

startRouteHandle(spec: RouteHandleSpec): RouteHandleState
stepRouteHandle(input): { state: RouteHandleState; draft?: RouteHandleDraft }
finishRouteHandle(state): {
  edgeId: EdgeId
  index: number
  point?: Point
}
```

这不是第一优先级，但它和 `TransformState / MarqueeSelectionState` 的建模风格是一致的。

### 上层收益

做完之后，editor 的 route line 可以继续变薄：

- route target 解析彻底下沉
- 插入后 origin 回查消失
- `routePoint.ts` 只负责 interaction lifecycle，不再承担 handle identity translation

### 优先级

中高。

比 transform / marquee 稍低，但比继续优化 `edge/connect` 更值得。

---

## 4. Core Algorithm Session -> State

### 现状

当前 core 里仍有一些纯算法态沿用 `Session` 命名，例如：

- `whiteboard/packages/whiteboard-core/src/node/moveSession.ts`
- `whiteboard/packages/whiteboard-core/src/selection/marquee.ts`
- `MindmapDragSession` 仍在 mindmap types 里存在

而 editor/runtime 这边当前已经收敛出了比较清晰的概念边界：

- `Session` = runtime lifecycle shell
- `State` = file-local / algorithm-local mutable state
- `Gesture` = externally visible temporary interaction fact

### 问题

当 core 继续把纯算法态叫 `Session`，editor 上层就会一直存在术语打架：

- runtime session
- core session
- interaction local state

虽然这不一定增加执行逻辑复杂度，但会显著增加阅读和重构时的认知成本。

### 长期最优模型

统一命名规则：

- `MoveSession` -> `MoveState`
- `MarqueeSession` -> `MarqueeState`
- `MindmapDragSession` -> `MindmapDragState`
- 如果未来增加 transform / route drag core state machine，也统一叫 `State`

如果某个对象不是 runtime lifecycle protocol，就不再叫 `Session`。

### 上层收益

主要不是减少代码量，而是：

1. editor 和 core 在术语上完全一致
2. “什么是 runtime session，什么只是算法态”会变得非常明确
3. 后续继续下沉 state machine 时阻力更小

### 优先级

中。

建议放在 transform / marquee / route handle 稳定后做。

---

## 哪些底层模型现在不要乱动

这部分同样重要，因为不是所有“能抽”的东西都值得抽。

### 1. Move line 暂时不要再往 core 硬塞更多职责

当前 `whiteboard/packages/whiteboard-core/src/node/moveSession.ts` 已经基本处在一个还算合理的位置：

- core 负责 move set
- core 负责 edge follow / dragged edge 预览
- core 负责 commit 生成
- editor 只补：
  - snap resolver
  - frame hover
  - gesture 映射

这条线当前最值得做的是：

- `MoveSession -> MoveState`

而不是继续把：

- frame hovered
- snap store 写入
- selection 可见性策略

这些东西硬塞回 core。

否则 core 会重新沾上 runtime 语义，反而变重。

### 2. edge connect 当前不缺 state machine，缺的是起点解析收敛

当前 `edge/connect.ts` 在 core 里其实已经比较完整：

- create / reconnect
- draft end
- preview
- commit

它真正还留在 editor 的复杂度，主要是：

- create start spec 组装
- reconnect start spec 组装

这条线如果还要继续降复杂度，更合理的是以后补一个很薄的：

```ts
type EdgeConnectSpec =
  | { kind: 'create'; ... }
  | { kind: 'reconnect'; ... }
```

而不是再造一层更大的框架。

### 3. snap 不应回到 core 里做 side-effect runtime

snap 可以作为 solver 输入给 core state machine，但不应该让 core 去：

- 写 guides store
- 清空 snap 状态
- 决定 hovered overlay

长期边界更干净的做法仍然是：

- core 消费 snap resolver 的结果
- editor runtime 决定何时清空、何时显示

也就是：

- core 负责“怎么算”
- editor 负责“什么时候写 UI 状态”

---

## 我不建议优先动的底层区域

### 1. edge connect 数学层

`whiteboard/packages/whiteboard-core/src/edge/connect.ts`

目前这条线的主要复杂度已经属于业务必需复杂度：

- create / reconnect
- point end / node end
- anchor snapping
- preview / commit

在 editor 层已经把入口 ownership 收干净之后，继续改 core connect，收益主要是风格对齐，不再是明显的结构收益。

### 2. mindmap core

当前：

- `whiteboard/packages/whiteboard-core/src/mindmap/drag.ts`
- `whiteboard/packages/whiteboard-core/src/mindmap/query.ts`

这部分本身已经比较轻。

mindmap 上层目前的复杂度不是来自 core 模型缺失，而更多是业务本身。

### 3. viewport / insert

这两条 interaction 线已经接近最小实现。

继续改 core 对上层不会带来显著收益。

---

## 推荐实施顺序

### Phase 1. TransformState

目标：

- 在 core 内形成完整 transform state machine
- editor transform 只保留 start / step / finish wiring

产出：

- `startTransform`
- `stepTransform`
- `finishTransform`

### Phase 2. MarqueeSelectionState

目标：

- 把 marquee 从几何态升级成 selection 态
- 把 selection apply / changed 判断下沉

产出：

- `startMarqueeSelection`
- `stepMarqueeSelection`
- `finishMarqueeSelection`

### Phase 3. RouteHandleTarget

目标：

- 让 route handle identity 在 core 内稳定
- 消除 editor 对 `view.handles` 的二次查找和插入后回查

产出：

- `resolveRouteHandleTarget`
- 更完整的 `insertRoutePoint` result

### Phase 4. Session -> State 统一命名

目标：

- 彻底统一 core / editor / runtime 的术语边界

### Phase 5. 可选的 Edge Route State

目标：

- 如果 route line 后续还想继续缩短
- 再把 route handle drag 的 start / step / finish 一并下沉

这一步不是刚需，但和前面三项风格一致。

---

## 推荐的最终边界

如果未来这些优化全部完成，整个 whiteboard 的长期模型建议稳定成下面这套：

### runtime

- `InteractionSession`
- 只负责生命周期：
  - `move`
  - `up`
  - `cancel`
  - `cleanup`
  - `attach`
  - `autoPan`

### core

- `State`
- 只负责算法态推进：
  - `start`
  - `step`
  - `finish`

### editor

- 只负责：
  - input / pick / affordance 读取
  - start spec 组装
  - gesture draft 映射
  - document write

### outward temporary model

- `Gesture`
- 只表示对外可见的临时交互事实

---

## 一句话结论

如果要继续降低 whiteboard 上层复杂度，最值得做的底层模型不是再改 edge 或 selection 入口，而是优先在 core 补齐：

1. `TransformState`
2. `MarqueeSelectionState`
3. `RouteHandleTarget`

这三项做完，editor 上层会继续明显变薄，而且不会再靠“入口手工收口”来硬压复杂度。

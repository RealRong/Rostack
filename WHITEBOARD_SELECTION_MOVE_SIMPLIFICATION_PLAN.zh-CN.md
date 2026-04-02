# Whiteboard Selection Move 简化方案

## 结论

`selection move` 这条链路目前不是“功能太多”，而是“概念边界有点混”。

真正的核心其实很简单：

1. 根据当前 selection 计算这次拖拽真正要移动的节点集合。
2. 记录 pointer down 时的初始 world 点和初始 bounds。
3. pointer move 时计算 delta。
4. 可选地做 snap。
5. 产出 preview。
6. pointer up 时 commit。

复杂感主要来自两类东西被混进了同一个 move 模型里：

- 高级 snap 行为，例如 `allowCross`
- 纯预览语义，例如 `MoveEffect.hovered`

如果按“行业里最常见、概念最少、可读性最强”的设计来收敛，建议保留 move 的主干，优先砍掉这些旁枝。

## 目标

这次简化的目标不是重写 selection interaction，而是把它收敛成一个非常稳定的拖拽模型：

- editor 侧负责交互编排
- core 侧负责 move 的纯数据计算
- preview-only UI 语义不要污染 move commit 模型
- 高级行为不要伪装成核心概念

最终希望 `selection move` 的 mental model 变成：

```text
press -> create move session -> move/project preview -> commit -> cleanup
```

而不是：

```text
press -> intent -> target -> session -> snap mode -> hover frame -> edge follow -> edge translate -> commit
```

后者不是不能做，而是对“普通移动选区”来说概念太多。

## 当前实现的实际结构

当前 editor 入口已经不算复杂，主路径在：

- [whiteboard/packages/whiteboard-editor/src/interactions/selection/move.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/selection/move.ts)
- [whiteboard/packages/whiteboard-core/src/node/moveSession.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/moveSession.ts)
- [whiteboard/packages/whiteboard-core/src/node/move.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/move.ts)

实际流程是：

1. editor 侧在 pointer down 后创建 move session。
2. core 侧根据选中节点生成 `MoveSet`。
3. move 时用 `startWorld` 和当前指针位置计算 raw rect。
4. 如果允许 snap，就把 raw rect 交给 snap runtime 修正。
5. core 产出 preview：
   - 节点 position preview
   - 跟随移动的 edge patch
   - 已选 edge 的整体平移 patch
   - 共享 frame hover id
6. pointer up 时 commit：
   - root nodes 用 delta 提交
   - selected edges 用 route/source/target patch 提交

这个架构主干是对的，问题在于数据模型里掺了几项不够“核心”的概念。

## 最简单的目标设计

最简单的设计，确实就是你前面总结的那个模型，只是放到 selection move 这里可以再准确一点：

### editor 层

- 决定这次 press 是不是要进入 move
- 如果需要，准备 selection
- 创建 move session
- 把 pointer move 喂给 project
- 把 project 的结果写入 preview overlay
- 在 pointer up 时做 commit

### core move 层

move session 只保留这些核心字段：

- `move`
- `nodes`
- `bounds`
- `origin`
- `startWorld`
- `delta`
- `selectedEdges`
- `relatedEdges`
- `nodeSize`

也就是说，core move 只关心：

- 哪些节点真正会动
- 起点在哪里
- 当前 delta 是多少
- 哪些 edge 要跟着动
- 哪些已选 edge 要整体平移

这里的关键不是“session 里一定要是这几个裸字段”，而是：

- node move 语义要独立存在
- edge 行为也要有明确分类

后续更推荐把：

- `selectedEdges`
- `relatedEdges`

收敛成一个更明确的 `edgePlan`，而不是长期保留两个平铺字段。

### preview 层

preview 只应该表达这次 move 的直接结果：

- 节点的新位置
- edge 的预览 patch

如果还有“当前像是在 hover 某个 frame / container”这种 UI 反馈，它应该被明确视为 preview 附加语义，而不是 move 本体语义。

`guides` 更适合作为 snap runtime 的展示副产物，而不是 selection move 自己管理的主输出。

### commit 层

commit 只做两件事：

- 对 roots 提交 delta
- 对 selected edges 提交平移后的 patch

commit 不应该依赖 preview-only 状态。

## `allowCross` 是什么

`allowCross` 现在是 move snapping 里的一个高级选项，定义和消费链路在：

- [whiteboard/packages/whiteboard-editor/src/runtime/interaction/snap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/interaction/snap.ts)
- [whiteboard/packages/whiteboard-core/src/node/snap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/snap.ts)
- [whiteboard/packages/whiteboard-editor/src/interactions/selection/move.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/selection/move.ts)

它的实际含义不是“允许穿透”之类的东西，而是：

- 默认 snap 只比较同类边
  - `left -> left`
  - `right -> right`
  - `centerX -> centerX`
  - `top -> top`
  - `bottom -> bottom`
  - `centerY -> centerY`
- 开启 `allowCross` 后，还会比较跨边组合
  - `left -> right`
  - `left -> centerX`
  - `centerX -> left`
  - `top -> bottom`
  - `centerY -> top`
  - 等等

也就是“允许 cross-edge / cross-center snapping”。

当前在 selection move 里，这个开关由 `Alt` 控制。

### 判断

这不是 selection move 的核心概念，而是 snap 模块内部的一种策略。

如果要保留这层能力，建议完全下沉到 snap policy：

1. selection move 只声明“我要做一次 move snap”。
2. snap runtime 根据交互上下文和 modifiers 自己决定是否启用 cross snap。
3. `allowCross` 最多作为 snap 内部策略名存在，不应该暴露给 selection move。

如果后续仍然要在代码里保留这个命名，也更建议放在 snap 模块内部并重命名成 `allowCrossSnap`，而不是继续作为 interaction 层公开参数。

## `MoveEffect.hovered` 是什么

`MoveEffect.hovered` 定义在：

- [whiteboard/packages/whiteboard-core/src/node/move.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/move.ts)

它的实际语义不是“被拖拽节点 hover 了”，而是：

- 当一组被移动的 root nodes 在 preview 位置下
- 如果它们都落在同一个静止的 frame/container 内
- 那么把这个共同的 frame id 算出来
- 再作为 `hovered` 传给 editor overlay

它的消费链路在：

- [whiteboard/packages/whiteboard-editor/src/runtime/write/preview.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/write/preview.ts)
- [whiteboard/packages/whiteboard-editor/src/runtime/overlay/node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/overlay/node.ts)

也就是说，它现在本质上只是一个预览高亮信号。

### 关键判断

它目前不参与最终 commit。

这说明它不是 move 的核心输出，而是一个 preview-only 的 UI 衍生状态。

如果目前没有真正的“拖入 container 并改变 owner / frame 归属”的提交逻辑，那么把这个字段放在 core `MoveEffect` 里，语义上是偏重的。

更合理的处理有两种：

1. 如果这个高亮没有产品价值，直接删掉。
2. 如果这个高亮有价值，就把它从 `MoveEffect` 里拆出来，改成明确的 preview 附加字段，例如：
   - `containerHoverId`
   - `previewContainerId`

不建议继续沿用 `hovered` 这个名字，因为它太泛，不知道 hover 的到底是谁、为什么 hover、是否影响 commit。

## 哪些东西可以砍

下面按“收益高、风险低、最符合行业常见做法”的顺序来排。

### 1. 砍掉 `MoveIntent`

定义位置：

- [whiteboard/packages/whiteboard-core/src/node/moveSession.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/moveSession.ts)

目前它只有一层薄包装：

- `intent.target`

这类对象没有形成稳定语义，只是给 `startMoveSession` 多包了一层。

建议直接改成：

- `startMoveSession({ target, ... })`

这是最典型的可删历史壳层。

### 2. 砍掉 `MoveSession.target`

当前 `MoveSession` 里保留了 `target`，但 move 真正长期依赖的是：

- `move`
- `selectedEdges`
- `relatedEdges`
- `delta`

`target` 在 session 内部不是核心状态，更像启动阶段的输入残留。

建议：

- 在 `startMoveSession` 里消费完 target 后，不再保留到 session。

### 3. 重新处理 `allowCross`

这是 selection move 里最像“策略泄漏”的一项。

建议目标：

1. `allowCross` 可以保留。
2. 但它只存在于 snap runtime / snap policy 内部。
3. selection move 不再传递 `allowCross` 这类策略参数。

selection move 只需要提供：

- raw rect
- excludeIds
- interaction context

至于：

- 要不要 cross snap
- `Alt` 是否表示 cross snap
- guide 怎么画

都不应该由 selection move 关心。

### 4. 重新处理 `MoveEffect.hovered`

这个字段不是 move commit 的一部分，只是 UI 预览的一部分。

建议优先级：

1. 如果没有稳定产品价值，删除。
2. 如果要保留，就从 core move 的主 effect 模型中拆出去。

更清晰的方案是：

- `MoveEffect` 只保留位移结果
- container hover 作为 editor preview 层的附加计算结果

### 5. 评估 `selectedEdges` / `relatedEdges` 的命名

这两个字段对应的行为语义本身不应该删，但它们的表达方式还可以继续收敛。

它们的真实语义更接近：

- `selectedEdges`: 当前直接选中的 edge，需要整体跟着平移
- `relatedEdges`: 两端节点都在 move 集合里的 edge，需要做 follow patch

这说明问题不在于“有没有必要区分”，而在于“是不是必须以两个顶层数组字段来表达”。

如果后续还要继续简化，可以考虑更贴近行为的命名，例如：

- `draggedEdges`
- `followEdges`

或者更进一步，直接收敛成：

- `edgePlan.dragged`
- `edgePlan.follow`

这比两个裸字段更清楚，因为它明确表示：

- 这是一次 move 的 edge 行为计划
- 不是两个临时列表碰巧被挂在 session 上

这不是最高优先级，但有助于把 move 的读法变成“节点怎么动，edge 为什么动”。

## 哪些东西不建议砍

### 1. `MoveSet.rootIds`

这个字段是 commit 节点位移时的稳定根集合，很关键。

### 2. `MoveSet.members`

这个字段定义了 preview 真正要移动的成员集合，也很关键。

### 3. `buildMoveSet`

这里承载了：

- group 展开
- frame selection 展开
- root 过滤

这不是复杂度来源，而是 move 语义本体的一部分。

### 4. `resolveMoveEffect`

虽然名字还可以讨论，但“根据 move set 和 delta 生成 preview 结果”这层职责本身是合理的。

### 5. 已选 edge 平移和相关 edge 跟随，这两个分支都应该保留

这是领域里的真实差异，不是多余抽象：

- 已选 edge 被直接拖动，应该整体平移
- 连接在被移动节点上的 edge，需要随节点更新 route/source/target

这两种 edge 行为确实不同，不应该为了“更短”强行并掉。

这里尤其要避免一个常见误区：

- edge 的显示路径可以根据 node 几何实时解算
- 但 edge 的文档数据不应该因为订阅了 node 变化就偷偷回写

因为 edge 虽然没有独立的 `size/position`，但它依然有自己的持久化几何字段，例如：

- point end 的坐标
- manual route 的 points

这些字段如果要变化，应该在 commit 时显式生成 patch，而不是靠 edge store 的订阅副作用去隐式改文档。

所以更合理的边界是：

- read / resolved 层可以 reactive 地根据 node 几何解 path
- write / document 层仍然显式提交 edge patch

这也意味着：

- `selectedEdges` 对应的直接拖动 edge，语义上必须保留
- `relatedEdges` 对应的 follow edges，功能上也必须保留

只是它们未必必须以当前字段形态长期存在。

## 是否需要纯 move 模块

需要，而且这是 selection move 很值得做的一次结构收敛。

但这个纯模块不应该定义成一个语义很宽的黑箱，例如：

```ts
move(nodes, edges, delta)
```

这种接口看起来短，实际会把“哪些节点该动、哪些 edge 是直接拖动、哪些 edge 是跟随变化”全都藏进函数内部重新猜，反而会让边界变差。

更合理的设计是一个纯 `projectMove` 模块，它只负责几何结果投影，不负责交互编排。

### 这个纯模块应该负责什么

- 根据 move members 和 delta 计算 node 位置预览
- 根据 edge 行为计划计算 edge patch
- 输出 move preview 的纯结果

### 这个纯模块不应该负责什么

- selection 判定
- pointer 交互
- snap policy 解析
- preview overlay 写入
- document commit
- container hover 这类 UI 衍生反馈

也就是说，它应该是：

- 几何投影模块

而不是：

- 交互大黑箱

### 推荐输入形状

推荐输入不是：

- `nodes`
- `edges`
- `delta`

而是：

- `nodes`
- `move`
- `edgePlan`
- `delta`
- `nodeSize`

因为 move 纯模块真正需要的不是“所有 edge”，而是“这次 move 的明确语义计划”。

如果继续用更清楚的命名，它可以长这样：

```ts
projectMove({
  nodes,
  move,
  edgePlan: {
    dragged,
    follow
  },
  delta,
  nodeSize
})
```

这里：

- `move` 表示哪些 node members 真正会动
- `edgePlan.dragged` 表示被直接拖动的 edge
- `edgePlan.follow` 表示随 node 变化而更新的 edge

这比单纯传一整个 `edges` 列表更不容易丢语义。

### 推荐输出形状

输出确实应该是“node / edge 的变化结果”，例如：

```ts
type MoveProjection = {
  nodes: readonly MoveNodePosition[]
  edges: readonly MoveEdgeChange[]
}
```

如果后续觉得调试上还需要保留边来源，也可以变成：

```ts
type MoveProjection = {
  nodes: readonly MoveNodePosition[]
  draggedEdgePatches: readonly MoveEdgeChange[]
  followEdgePatches: readonly MoveEdgeChange[]
}
```

然后由上层决定是否合并。

### 为什么 preview 和 commit 不要并成一个函数

因为这两层虽然相关，但职责不同：

- preview 需要的是成员节点的位置结果
- commit 对 node 往往只需要 roots + delta
- commit 对 edge 需要的是显式 patch

所以更好的拆法是：

- `planMove`
- `projectMove`
- `buildMoveCommit`

三者都可以是纯模块，但职责不要混。

## snap 模块的推荐边界

如果沿着这次简化方向继续收敛，snap 的边界建议明确成两层：

### 1. snap core

纯计算：

- 输入 raw rect
- 输入 candidates / excludeIds / context
- 输出 snapped rect
- 输出 guides

### 2. snap runtime

交互服务：

- 解析 modifiers 和 interaction context
- 决定当前 snap policy
- 调用 snap core
- 自己写入和清理 guides
- 把 `snapped rect` 返回给调用方

为了让 interaction 生命周期更对称，snap runtime 最好还提供一个显式清理入口，例如：

- `snap.clear()`

或者如果后续状态会变多，也可以考虑：

- `snap.end()`

这样 selection move 的职责就会非常干净：

- 提供 raw rect
- 拿回 `snapped rect`
- 用 `snapped rect` 继续做 move project / commit
- 在 interaction 结束或取消时调用一次 snap 清理

selection move 不需要再直接关心：

- `allowCross`
- `guides`
- `Alt` 和具体 snap 策略之间的映射

这里要特别强调一个边界：

- `guides` 可以由 snap runtime 自己写入
- `snapped rect` 不能被 snap 模块藏进隐式状态，必须显式返回给 move 主流程

因为 `snapped rect` 是后续计算 delta、project preview、build commit 的主输入，不是可选 UI 副产物。

同样地：

- `snap.clear()` 只应该清 snap 自己的瞬时展示状态
- 不应该顺手清 node patches / edge patches / container hover 之类的 move preview 状态

也就是说，它的职责应该非常窄，只负责：

- guides
- 未来可能属于 snap runtime 的其他 transient presentation state

## 推荐的最终纯模块拆法

如果按概念最少、可读性最强的方向，我建议最终收敛成这三层：

### 1. `planMove`

输入：

- selection target
- nodes
- edges
- nodeSize

输出：

- `move`
- `edgePlan`

也就是把“这次移动会影响谁”在开始阶段一次性讲清楚。

### 2. `projectMove`

输入：

- `nodes`
- `move`
- `edgePlan`
- `delta`
- `nodeSize`

输出：

- `nodePatches`
- `edgePatches`

它只负责纯几何结果。

### 3. `buildMoveCommit`

输入：

- `move`
- `edgePlan`
- `delta`

输出：

- node commit payload
- edge commit payload

它只负责把 move 结果翻译成文档写入。

## 推荐的最终模型

推荐把 selection move 收敛成下面这个模型：

### 核心输入

- 当前 nodes
- 当前 edges
- selection target
- pointer down world
- node size

### 会话状态

- `move`
- `bounds`
- `origin`
- `startWorld`
- `delta`
- `edgePlan`
- `nodes`
- `nodeSize`

其中：

- `edgePlan.dragged` 对应当前直接拖动的 edge
- `edgePlan.follow` 对应当前随 node 变化的 edge

### move/project 输出

- `nodePatches`
- `edgePatches`

### snap 输出

- `snappedRect`

### snap runtime 副产物

- `guides`

### interaction end

- `snap.clear()`

### 可选 preview 附加输出

- `containerHoverId`

### commit 输出

- `delta`
- `selectedEdgePatches`

这个模型的重点是：

- core move 输出“真实位移结果”
- UI hover 输出“纯反馈信息”
- 两者不混在一个暧昧的 effect 语义里
- edge 的显示解算和 edge 的文档写入明确分层
- selection move 只消费 `snapped rect`，不直接管理 snap guides

## 推荐实施顺序

### Phase 1: 纯 contract 简化，不改行为

目标：

- 删除 `MoveIntent`
- 删除 `MoveSession.target`
- 把 `selectedEdges` / `relatedEdges` 收敛到 `edgePlan`
- 把相关命名改清楚

这一步只做 API 收敛，不动行为，是最稳的一步。

### Phase 2: 把 container hover 从 move 主 effect 里拆出去

目标：

- 明确它是 preview-only 语义
- 评估是否应该保留

如果发现现在只有高亮，没有任何真实 drop/归属提交逻辑，这一步很值得做。

### Phase 3: 收敛 snap 模型

目标：

- 把 `allowCross` 下沉到 snap policy
- 让 snap runtime 自己管理 `guides`
- 让 selection move 只消费 `snapped rect`
- 在 interaction end / cancel 时显式执行 `snap.clear()`

这一步做完，selection move 主线会明显更干净。

## 行业上更常见的拆法

如果按常见白板/设计工具的拖拽实现来讲，selection move 一般会拆成三件事：

1. move geometry
2. snap
3. drop target preview

其中：

- `move geometry` 是核心
- `snap` 是几何修正
- `drop target preview` 是单独的 hover / drop 语义

你现在这里最值得做的，不是继续加抽象，而是把这三件事重新分层。

也就是说：

- move 不要假装自己还负责 container hover 语义
- snap 不要把策略细节暴露给 selection move
- snap 的 transient 展示状态要由自己收尾
- preview 不要和 commit 混成一个 effect 心智模型

## 最终建议

如果目标是“概念最少、可读性最强”，我的建议是：

1. 保留当前 editor 交互主线，不重写。
2. 在 core move 层先删 `MoveIntent` 和 `MoveSession.target`。
3. 把 `MoveEffect.hovered` 视为可选的 preview 衍生信息，而不是 move 本体。
4. 把 `allowCross` 视为 snap policy 内部策略，而不是 selection move 概念。
5. 让 interaction 结束时显式调用 `snap.clear()`，但只清 snap 自己的状态。
6. 不动 `MoveSet`、edge follow、selected edge translate 这些真正承载业务语义的部分。

这样收敛下来，selection move 会接近一个非常标准的实现：

```text
build move set
-> compute delta
-> optional snap
-> preview node/edge patches
-> commit node delta + selected edge patches
```

这条线已经足够表达产品行为，而且概念负担明显更低。

## 后续落地建议

这份方案对应的代码改造顺序建议是：

1. 先做 `MoveIntent` / `MoveSession.target` 删除。
2. 再决定 `hovered` 是删除还是下沉到 preview 层。
3. 最后把 snap policy、guide 管理、`snap.clear()` 生命周期和 selection move 主流程拆清楚。

这样每一步都很小，回归面也可控。

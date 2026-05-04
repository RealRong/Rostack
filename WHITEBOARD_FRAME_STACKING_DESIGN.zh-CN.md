# Whiteboard Frame Pick / Marquee / Order 一致性修法

## 结论

这批问题不需要先引入 frame membership 体系，也不需要把 frame 建模成复杂的层级容器系统。

更合适的长期方案是只收敛两件事：

1. `pick` / `hover` / `pointer move` 必须具备真正的 **topmost visibility** 语义。
2. `order` 必须具备最基本的 **frame-aware 约束**，避免 frame 内 node 被排到 frame 后面。

同时：

3. `marquee` 必须复用和 `hit` 相同的 visibility 过滤，保证全局交互一致。

也就是说，长期最优修法不是补 membership，而是先把“当前视觉上最上层可交互对象”这个概念补齐，然后让 `pick`、`marquee`、`order` 围绕它收敛。

## 当前问题的更准确解释

目前看到的现象可以用两个缺口解释清楚：

### 1. Pick 没有真正的最上层语义

当前 hit/pick 更接近下面这种过程：

- 从 spatial 拿一批候选
- 分别计算 node / edge 距离
- 用距离和 `document.order` 决 winner

这个过程的问题是：

- 它没有先判断“这个点上视觉最上层对象是谁”
- 它也没有“被上层对象遮住的下层对象应退出竞争”的概念

结果就是：

- pointer 在 frame 区域内移动
- frame 本身在视觉上已经盖住下面的 edge
- 但下方 edge 仍然参与 hit 竞争
- 最后用户会选到 frame 下面的 edge

这不是 frame membership 问题，而是 hit 缺少 visibility gating。

### 2. Order 没有 frame 边界约束

当前 `bring to front` / `send to back` 直接按全局 `document.order` 理解。

结果就是：

- 选中 frame 内 node
- 执行 `bring to front`
- node 可能被移到 frame 本体之前
- 视觉上相当于被送到 frame 后面，像“消失”了一样

这个问题也不需要 membership 才能修。

只要在排序时加入一个约束：

- 当前 node 如果处在某个 frame 的内容范围内
- 那么它的可移动范围不能跨过这个 frame 本体

就足够解决问题。

### 3. Marquee 和 Pick 没有共享 visibility 语义

即使 click/pointer move 修好了，如果 marquee 还是直接按几何候选选元素，就会继续出现：

- 点不到的东西却能框到
- 被 frame 挡住的 edge 在 marquee 里仍能被选中

所以 marquee 也必须复用同一套 visibility 过滤。

## 目标

本方案只追求三件事：

1. 点到什么，就只能交互到视觉上最上层那个对象。
2. 框到什么，结果要和点击可见性一致。
3. frame 内元素重排时，不能穿到 frame 后面。

不在本阶段解决：

- 显式 frame membership
- 持久化层级树
- 复杂局部 stacking context
- edge 属于哪个 frame 的抽象语义体系

## 核心设计

## 1. 引入统一的 Visibility 判定层

长期应该补一个独立的 runtime 抽象，名字可以很简单，例如：

- `visibility`
- `topmost`
- `occlusion`

它的职责不是做完整渲染排序，而是回答两个交互问题：

1. 对于某个点，哪些候选在视觉上已经被更上层对象遮住？
2. 对于某个 marquee 区域，哪些候选虽然几何相交，但实际上不应被选中？

这个抽象应建立在现有数据之上：

- `document.order`
- scene spatial candidates
- node/edge/frame 的几何命中

关键点：

- 先按视觉顺序判断可见性
- 再决定谁有资格参与 hit 或 marquee

而不是所有候选先一起按距离竞争。

## Visibility 应该放在哪一层

结论：

- **不要放到 `spatial` 层**
- 应放在 **`projection/query` 层**

推荐位置：

- `whiteboard/packages/whiteboard-editor-scene/src/projection/query/visibility.ts`

推荐依赖：

- `state()`
- `spatial`
- `document.order`
- node / edge / frame 的几何命中能力

推荐调用关系：

- `spatial` 提供纯几何候选
- `visibility` 在候选之上做 topmost / occlusion 过滤
- `hit` / `hover` / `pointer move` 消费 `visibility`
- `marquee` 也消费 `visibility`

### 为什么不要放进 spatial

`spatial` 的职责应保持单纯：

- point / rect 候选检索
- bounds 裁剪
- 作为上层查询的加速索引

它不应该承担：

- topmost 判定
- frame 遮挡语义
- hover / click / marquee 的交互一致性语义

如果把 visibility 做进 `spatial`，会出现几个问题：

1. `spatial` 从索引层变成语义层，职责变重。
2. `spatial.point()` / `spatial.rect()` 的返回语义不再稳定，调用者不知道拿到的是几何候选还是已过滤候选。
3. 后续其他依赖 `spatial` 的功能会被迫继承交互策略，复用性变差。

因此更合理的边界是：

- `spatial` 负责“可能相关”
- `visibility` 负责“当前可交互可见”

## Visibility API 设计

这一层不需要一开始就做得很大，建议先围绕 hit 和 marquee 设计最小闭环。

### 核心类型

```ts
type VisibilityKind = 'node' | 'edge' | 'mindmap'

type VisibilityItemRef =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'mindmap'; id: string }

type VisibilityCandidate = {
  item: VisibilityItemRef
  order: number
  occluded: boolean
}

type VisibleHitCandidate = VisibilityCandidate & {
  distance?: number
}
```

这里的重点不是字段最终长什么样，而是这层要显式表达：

- 候选是谁
- 基础顺序是什么
- 是否已被上层对象遮挡

### Query API

建议 `visibility.ts` 暴露一个类似 `createVisibilityRead(...)` 的 reader，挂到 scene projection 上。

最小 API 可设计为：

```ts
interface SceneVisibility {
  point(input: {
    point: Point
    threshold?: number
    kinds?: readonly VisibilityKind[]
    exclude?: Partial<{
      node: readonly string[]
      edge: readonly string[]
      mindmap: readonly string[]
    }>
  }): {
    ordered: readonly VisibleHitCandidate[]
    topmost?: VisibleHitCandidate
  }

  rect(input: {
    rect: Rect
    kinds?: readonly VisibilityKind[]
    exclude?: Partial<{
      node: readonly string[]
      edge: readonly string[]
      mindmap: readonly string[]
    }>
  }): {
    ordered: readonly VisibilityCandidate[]
    visibleIds: {
      node: readonly string[]
      edge: readonly string[]
      mindmap: readonly string[]
    }
  }
}
```

### 这两个 API 的职责

`point(...)` 用于：

- hover
- pointer move
- click / pointer down

它应保证：

- 返回按视觉从上到下排序的候选
- `topmost` 是第一个真正可交互命中的对象
- 下层被遮挡候选不会再进入 winner 竞争

`rect(...)` 用于：

- marquee
- 以后任何矩形范围交互选择

它应保证：

- 先做几何候选收集
- 再做 visibility 过滤
- 返回“在交互上可见”的候选集合，而不是单纯几何相交集合

## Visibility 内部算法建议

### Point Visibility

`point(...)` 可以按下面的流程实现：

1. 调用 `spatial.candidates(rectFromPoint(...))` 取附近候选。
2. 按 `document.order` 的视觉前后顺序排序，顺序应与当前 hit 语义一致。
3. 对每个候选做精确命中测试：
   - node: point 是否命中 node outline
   - edge: point 到 edge path 的距离是否在 threshold 内
   - mindmap: 是否命中对应 bounds / 自身命中规则
4. 从最上层往下扫描：
   - 一旦某候选命中且构成遮挡，则下层候选标记为 `occluded`
   - 第一个有效命中的对象成为 `topmost`
5. 返回 `ordered` 和 `topmost`

这里有一个重要判断：

- `point(...)` 的主排序依据应是视觉顺序
- `distance` 只在同一层内部或必要的 tie-break 场景中使用

换句话说，不能继续让“更近的下层 edge”盖过“更上层的 frame / node”。

### Rect Visibility

`rect(...)` 的推荐流程：

1. 调用 `spatial.rect(rect)` 取得几何候选。
2. 仍按视觉顺序组织候选。
3. 对每个候选判断：
   - 它是否与 marquee rect 几何相关
   - 它是否在交互上被更上层对象整体遮住，或者至少在当前选择语义下应被过滤
4. 返回通过过滤后的 `visibleIds`

这里不要求一开始就做复杂的局部覆盖面积计算。

当前场景下，先保证下面这条就足够有价值：

- frame 覆盖区域内，下层 edge 不应该因为几何穿过 rect 就被选中

也就是说，rect visibility 不必一开始追求完美几何可见性，但必须和 point hit 的 topmost 语义保持同方向。

## 模块接入建议

### 1. `projection/query/index.ts`

这里是最合适的挂载点。

建议：

- 新建 `createVisibilityRead(...)`
- 在 `createProjectionRead(...)` 中实例化
- 通过 `scene.visibility` 暴露给下游

例如：

```ts
const visibility = createVisibilityRead({
  state: runtime.state,
  spatial
})
```

然后在返回的 scene read 中增加：

```ts
visibility
```

### 2. `projection/query/hit.ts`

当前 `hit.ts` 不应再直接从 `spatial.candidates(...)` 自己做 winner 决策。

建议改成：

- 调用 `scene.visibility.point(...)`
- 读取 `topmost`
- 再映射成现有 `SceneHitItem`

这样 `hit.ts` 的职责会收敛成：

- 命中入口
- 兼容现有调用参数
- 输出当前 API 需要的结果类型

而不是自己实现遮挡和排序语义。

### 3. `projection/query/index.ts` 中的 `nodes.idsInRect` / `edges.idsInRect`

这是 marquee 复用 visibility 的关键位置之一。

当前 `nodes.idsInRect(...)` 和 `edges.idsInRect(...)` 仍偏向几何过滤。

建议改成：

- 仍保留原有 `match: 'touch' | 'contain'`
- 但候选来源不直接是裸 `spatial.rect(...)`
- 而是先通过 `scene.visibility.rect(...)` 取到可见候选

然后再对这些可见候选做 node / edge 自身的 `touch` / `contain` 判断。

这样做的好处是：

- marquee 无需在 session 层自行理解 frame 遮挡
- `idsInRect()` 结果天然与 hit visibility 对齐

### 4. `selection/marquee.ts`

`marquee.ts` 本身应尽量保持轻量。

它最好只负责：

- 管理 pointer drag 状态
- 生成 marquee rect
- 调用 `editor.scene.nodes.idsInRect(...)`
- 调用 `editor.scene.edges.idsInRect(...)`

不应在 session 层再重复实现 visibility 规则。

也就是说：

- visibility 收敛在 scene query 层
- marquee session 只消费 scene query 结果

### 5. `orderStep.ts` / `canvas.ts`

虽然 `order` 不直接依赖 visibility，但建议沿用相同的分层思路：

- `orderStep.ts` 负责计划
- 不直接修改底层语义
- 在 planning 阶段加上 frame-aware 合法区间裁剪

这样可以和 visibility 一样，保持“中间层负责解释语义，底层仍保持简单”。

## 2. Topmost Hit 语义

### 原则

对任意 point：

- 应先按视觉前后顺序，从上往下扫描候选
- 找到第一个真正命中的对象后，下方对象不再参与交互

距离的作用应降级为：

- 只在同一层内的同类候选之间做 tie-breaker
- 或只在局部复合命中中使用

而不应该覆盖 topmost 语义。

### 行为定义

给定一个 point：

1. 从 spatial 取出附近候选。
2. 按视觉前后顺序排序候选。
3. 从最上层往下判断是否命中。
4. 命中的第一个对象成为交互结果。
5. 一旦上层对象已经命中，下层对象直接失去交互资格。

这套规则应该统一应用到：

- pointer move
- hover
- click / pointer down
- 未来如果有 drag start target，也应复用

### 对 frame 的含义

在这个模型下，frame 不需要额外 membership 语义也能工作：

- 如果 frame 在视觉上盖住下方 edge
- 那么 frame 或 frame 上方内容先被扫描到
- 下方 edge 根本不会进入最终 winner 竞争

这样就能自然解决“frame 上 pointer move 选到下面 edge”的问题。

## 3. Marquee 复用 Hit Visibility

### 原则

marquee 不能只基于几何相交。

它必须先经过和 hit 同一套 visibility 过滤，否则系统会出现交互不一致：

- 不能点到，但能框到
- hover 看不到，但 marquee 却能选中

### 建议语义

给定一个 marquee rect：

1. 先基于几何拿到 node/edge 候选。
2. 对每个候选判断其在该 rect 所覆盖区域内是否具备交互可见性。
3. 只有通过 visibility 过滤的候选才进入 `touch` / `contain` 判定。

对 frame 的直接结果：

- frame 上 marquee 不应选中被 frame 遮住的下层 edge
- frame 内可见 node 应可被 marquee 选中
- click / hover / marquee 的可交互对象集合保持一致

### 关于 frame 的 `touch` / `contain`

现有 frame 在 marquee 里有专门的 `touch -> contain` 特判，这个方向可以保留。

但长期应该把它放在统一流程里：

- 先 visibility 过滤
- 再做 frame 自身的 `touch` / `contain` 选择策略

也就是说：

- 可见性和选择策略是两层概念
- 不应把可见性逻辑继续塞进 node 特判里

## 4. Order 采用 Frame-Aware 约束

### 原则

不需要重做 `document.order` 数据模型。

但在计算 `bring to front` / `send to back` / `forward` / `backward` 的目标位置时，必须加入最基本的 frame 约束。

### 约束定义

如果某个 node 当前处于 frame 内容范围内，那么：

- 它不能被移动到该 frame 本体之前
- 它的 front/back/step 都只能在该 frame 的合法内容区间内移动

对根画布元素：

- 仍然使用全局 `document.order` 语义

### 这里不需要 membership 的原因

这里的约束只要求：

- 在排序那一刻，识别该 node 当前是否落在某个 frame 的内容区间内
- 算出一个合法 anchor 边界

这和“是否需要永久存储它属于某个 frame”是两回事。

因此本阶段完全可以：

- 继续使用当前已有的 frame 几何关系
- 只在 order planning 阶段做 legality clipping

### 行为定义

对于 `bring to front`：

- 根画布元素：移动到全局 front
- frame 内 node：移动到该 frame 内容区间的 front，而不是全局 front

对于 `send to back`：

- 根画布元素：移动到全局 back
- frame 内 node：移动到该 frame 内容区间的 back，但仍在 frame 本体之后

对于 `bring forward` / `send backward`：

- 只允许在合法区间内 step
- 不允许跨过 frame 本体边界

## 5. 统一的实现边界

这个方案虽然比 membership 版本小很多，但仍然需要明确边界，避免再次分叉。

建议边界如下：

### Visibility 层负责

- topmost 候选判定
- 上层对象对下层对象的交互遮挡
- hit 与 marquee 共享的可见性过滤

### Hit 层负责

- 基于 visibility 过滤后的候选做最终命中
- 必要时在同层候选之间做距离比较

### Marquee 层负责

- 基于 visibility 过滤后的候选做 `touch` / `contain` 规则判断

### Order 层负责

- 根据当前 frame 几何和 order 关系计算合法排序区间
- 把 front/back/step 裁剪到合法区间内

这样每层职责就比较清楚：

- 可见性归 visibility
- 命中归 hit
- 框选归 marquee
- 排序归 order

## 为什么这个方案比 membership 方案更合适

主要有四个原因。

### 1. 更贴近当前真实 bug

你现在遇到的核心问题，确实优先是：

- hit 没有 topmost
- order 没有 frame 边界

不是“缺少完整 frame 归属系统”。

### 2. 和现有架构更兼容

当前代码已经有：

- `document.order`
- spatial candidates
- frame 几何查询

在这些基础上补 visibility 和 constrained order，比引入新持久化语义要自然得多。

### 3. 收益大，改动相对可控

只要 visibility 层接好了：

- pointer move
- hover
- click
- marquee

四个入口就能一起收敛。

只要 order 约束接好了：

- bring to front
- send to back
- bring forward
- send backward

四个排序动作也能一起收敛。

### 4. 避免过早设计

如果以后真的需要：

- frame membership
- nested frame 复杂语义
- frame-local edge ownership

那可以以后再加。

但当前这批问题并不需要先做那一层。

## 推荐落地顺序

## Phase 1: 统一 Visibility

目标：

- 引入共享 visibility 过滤
- 让 pointer move / hover / click 使用 topmost hit
- 让 marquee 复用同一套 visibility 规则

完成后应达到：

- frame 上 hover 不会命中下面 edge
- frame 上 click 不会选中下面 edge
- frame 上 marquee 也不会再选中下面 edge

## Phase 2: 收紧 Order 约束

目标：

- 在 order move / order step 之前加入 frame-aware 合法区间计算

完成后应达到：

- frame 内 node `bring to front` 后不会跑到 frame 后面
- `send to back` 也不会穿出 frame
- `forward/backward` 不会跨 frame 本体边界

## Phase 3: 清理局部特判

目标：

- 在 visibility 方案稳定后，减少零散分支
- 把现有 node/frame 的局部特判收敛到统一流程

比如：

- frame 的 marquee `touch -> contain` 特判仍可保留
- 但不应继续承担 visibility 职责

## 回归测试矩阵

## Hit / Hover / Pointer Move

- pointer 位于 frame 表面时，不应命中 frame 下方 edge
- pointer 位于 frame 内可见 node 上时，应命中该 node
- pointer 位于根画布普通 edge 上时，仍可正常命中 edge
- 上层 node / 下层 edge 重叠时，应优先命中上层 node

## Marquee

- 在 frame 表面 marquee，不应选中被 frame 挡住的下层 edge
- 在 frame 内 marquee，可选中可见 node
- marquee 的结果应和 click/hover 的 visibility 保持一致
- frame 自身仍按既定 `touch` / `contain` 规则参与选择

## Order

- frame 内 node `bring to front` 后仍保持可见
- frame 内 node `send to back` 后仍位于 frame 之上
- `bring forward` 不跨越 frame 本体
- `send backward` 不跨越 frame 本体
- 多选 block move 时仍保持相对顺序

## Consistency

- click、hover、pointer move、marquee 对同一场景给出一致结果
- undo/redo 后行为一致
- document reload 后行为一致

## 非目标

本方案明确不在当前阶段处理以下内容：

- 引入显式 frame membership 字段
- 修改 `document.order` 为层级结构
- 定义复杂 edge ownership 模型
- 完整重做渲染层级系统

如果将来这些问题真的成为瓶颈，再做下一层抽象。

## 最终结论

这批问题的长期最优修法，可以收缩成一个非常明确的方向：

1. 补上 `topmost visibility`，让 hit 真正代表“视觉上最上层可交互对象”。
2. 让 marquee 复用同一套 visibility 过滤，保证全局一致。
3. 给 order 加上最基本的 frame-aware 合法区间约束，避免 frame 内 node 被排到 frame 后面。

这样修法足够小、足够准，也最符合当前代码结构和真实问题形态。

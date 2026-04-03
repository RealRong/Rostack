# Whiteboard Selection Affordance 长期最优方案

## 背景

当前 whiteboard 的 selection / transform / group 相关语义分散在多处：

- `@whiteboard/core/selection/press`
- `@whiteboard/core/selection/summary`
- `@whiteboard/editor/runtime/read/selection`
- `@whiteboard/react/features/node/selection`
- `@whiteboard/react/features/node/components/NodeOverlayLayer`

这些层分别在判断：

- 当前选区谁负责交互
- 蓝框画哪一个 box
- handles 画哪一个 box
- 哪些场景可以 move
- 哪些场景可以 resize / rotate
- `group` 内部点击是否应该穿透到子节点
- `mixed selection` 带 `edge` 时是否还能显示 handles

由于规则散落在不同层，任何一次针对 `group`、`mixed selection`、`selection box` 的局部修正，都会引入新的语义不一致。最近出现的回归已经说明：继续在现有结构上逐处补 `if group ...` 不会收敛。

本文档给出一个长期最优的统一方案。

## 问题本质

当前代码把三个不同层次的概念混在了一起：

1. 选中了什么
2. 谁拥有当前交互外壳
3. 哪个 box 用于视觉反馈，哪个 box 用于 transform

其中最关键的缺失是第 2 点。

`selection.target` 只描述“哪些 ids 被选中”，但不描述“当前交互应由谁接管”。  
于是各层被迫自行推断：

- React 层推断是否显示单节点 overlay
- press 层推断点击蓝框应该 move 还是透传
- summary 层推断 resize 能力
- transform 层推断 handles 应该基于哪个 box

这会导致同一个选区在不同模块里被解释成不同对象。

## 设计目标

长期目标只有四个：

1. 单一语义源
   所有 selection chrome / move / resize / rotate / pass-through 规则都从同一个模型派生。

2. 容器语义清晰
   `group` 和 `frame` 这类容器节点不能再被当成“普通 node”或“普通 selection box”的临时特判。

3. 几何职责清晰
   `displayBox` 和 `transformBox` 必须分开，避免 mixed selection 带 `edge` 时几何错位。

4. React 层只渲染，不重新发明规则
   React presentation 只消费统一模型，不再自己决定 `group` 是否单选、selection box 是否可拖、handles 是否显示。

## 核心方案

引入一个集中模型：

- `SelectionAffordance`

它回答一个问题：

- 当前选区的交互拥有者是谁，它的 chrome 和交互能力是什么

### 1. Owner 模型

只保留四类 owner：

- `none`
- `single-node`
- `single-container`
- `multi-selection`

解释：

- `single-node`
  单个普通 node，自身负责 body drag、resize、rotate。

- `single-container`
  单个容器节点，至少包含 `group`，建议最终也让 `frame` 对齐到同一语义。
  容器与普通 node 最大区别是：内容区不应该被整块 selection box 覆盖。

- `multi-selection`
  多个 node，或者 `node + edge` 的 mixed selection。

### 2. Affordance 输出

`SelectionAffordance` 只需要输出少量但完整的字段：

- `owner`
- `displayBox`
- `transformBox`
- `moveHit`
- `canMove`
- `canResize`
- `canRotate`
- `passThroughContent`
- `showSingleNodeOverlay`

建议语义如下：

- `displayBox`
  用于选区视觉反馈的整体框。可以包含 edge。

- `transformBox`
  用于 handles、resize、scale 的 box。必须只看可变形 node，不能混入 edge。

- `moveHit`
  当前交互应该从哪里接管 move。建议只保留：
  - `none`
  - `body`
  - `shell`

- `passThroughContent`
  内容区是否允许点击穿透到底层 node。

- `showSingleNodeOverlay`
  是否由单节点 overlay 接管蓝框与 handles。

## 统一规则

### A. `single-node`

- `displayBox = node box`
- `transformBox = node box`
- `moveHit = body`
- `canMove = true`
- `canResize = node capability.resize`
- `canRotate = node capability.rotate`
- `passThroughContent = false`
- `showSingleNodeOverlay = true`

适用对象：

- 普通内容节点
- 单选 shape / text / draw / sticky 等

### B. `single-container`

- `displayBox = container bounds`
- `transformBox = container bounds`
- `moveHit = shell`
- `canMove = true`
- `canResize = true` 或由容器 capability 决定
- `canRotate = false`，建议默认关闭
- `passThroughContent = true`
- `showSingleNodeOverlay = false`

适用对象：

- `group`
- 后续建议让 `frame` 也逐步对齐到这一类

这一类的关键语义是：

- 容器 chrome 与内容区分离
- shell 负责 move / resize
- 内容区允许点击子节点

这正好满足“先选中 group，再点击 group 内 node，可以选中内部 node”的需求。

### C. `multi-selection`

- `displayBox = full selection bounds`
- `transformBox = node-only bounds`
- `moveHit = body`
- `canMove = true`，前提是存在可移动 node
- `canResize = true`，前提是 node transform 能力允许
- `canRotate = false`
- `passThroughContent = false`
- `showSingleNodeOverlay = false`

适用对象：

- 多个 node
- `node + edge` mixed selection

这里必须明确：

- handles 基于 `transformBox`
- `displayBox` 可以包含 edge
- 但 scale / resize 只作用于 node

### D. `none`

- 全部能力关闭

## Group 的长期语义

`group` 不应再被视为“普通 node”。

最优语义是：

- 它是 `single-container`
- 有独立 shell
- shell 负责 move / resize
- 内容区允许穿透点击内部 node
- 视觉上仍然有整体框

这意味着：

- 不应该再通过“把 selection box 整块盖在 group 上面”来实现 group 交互
- 也不应该再通过“把 group 伪装成 single-node overlay”来实现 transform

group 需要明确的 container affordance，而不是兼容层。

## Mixed Selection 带 Edge 的长期语义

`node + edge` mixed selection` 的正确行为是：

- 保留 edge 被选中
- selection 的整体显示框可以包含 edge
- 只要存在可变形 node，就显示 handles
- handles 和 transform preview 必须基于 node-only `transformBox`
- edge 不参与 scale box 几何

也就是说：

- `displayBox != transformBox`

这是必须成立的长期规则。

## 规则应该收拢到哪里

最优收拢位置应该在 `@whiteboard/core/selection`，而不是 React 层。

建议新增：

- `deriveSelectionAffordance(...)`

它依赖：

- `SelectionSummary`
- selected nodes / edges
- node role / capability
- `displayBox` / `transformBox`

它输出：

- `SelectionAffordance`

然后由各层消费：

- `core/selection/press`
  用 `moveHit` / `canMove` / `passThroughContent` 决定 click / drag / tap

- `editor/runtime/read/selection`
  负责产出 `displayBox` / `transformBox`

- `react/features/node/selection`
  只做 view mapping，不再自行推断 `group` / `mixed` / `edge` 规则

- `react/features/node/components/NodeOverlayLayer`
  只根据 affordance 渲染

## 不建议的方案

### 1. 继续在 React presentation 层打补丁

问题：

- UI 层会知道过多 interaction 语义
- 规则无法复用到 press / transform
- 很容易继续出现“显示一套，交互一套”的回归

### 2. 在 `selection.summary` 里塞越来越多特判

问题：

- `summary` 应该描述 selection 的结构与基础能力
- 不应该承担完整交互 owner 语义
- 否则 summary 会膨胀成隐式状态机

### 3. 继续让 `group` 在不同场景扮演不同对象

例如：

- 有时是普通 node
- 有时是 selection box
- 有时是 descendants box

问题：

- 这就是当前不稳定的根源

## 推荐落地顺序

### 第 1 步

先引入 `SelectionAffordance`，但不大面积改 UI。

目标：

- 把 owner / canMove / canResize / canRotate / moveHit / passThroughContent 集中生成

### 第 2 步

把 `displayBox` 和 `transformBox` 正式分开，并让 React presentation 只读这两个字段。

### 第 3 步

把 `group` 迁移为 `single-container`：

- shell 负责 move / resize
- content 允许 pass-through

### 第 4 步

把 `frame` 也评估是否迁移到 `single-container`，彻底统一容器语义。

## 预期收益

完成后可以稳定获得这些行为：

- 单选普通 node：单节点 overlay 接管
- 单选 group：container shell 接管，内容区可穿透
- mixed selection 带 edge：仍有 handles，但只对 node transform
- group / frame / mixed selection 的规则不再散在多层
- 后续新增容器类型时，不需要继续复制 `if group ...`

## 结论

长期最优方案不是继续修单点 bug，而是建立统一的 `SelectionAffordance` 模型。

只有把这几个维度收口成同一个语义源，后续这些问题才会真正结束：

- group 有没有 resize
- group 能不能拖
- group 内容区是否能选中内部 node
- mixed selection 带 edge 是否显示 handles
- 蓝框和 handles 到底基于哪个 box

结论性规则：

- `group` 是 `single-container`
- `displayBox` 与 `transformBox` 必须分离
- selection 的交互 owner 必须集中建模
- React 层不再独立发明 selection 语义

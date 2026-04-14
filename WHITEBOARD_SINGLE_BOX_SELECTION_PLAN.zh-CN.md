# Whiteboard 单一 Box 统一方案

## 背景

当前 whiteboard 在 shape 节点上出现了一个明显不一致：

- `snap` 和 `multiselect` 的框会贴着 shape 的真实几何边界。
- `single select` 的框会比图形大一圈。

这个问题在 `star`、`rectangle` 等 shape 上都能观察到。

它不是简单的 CSS 偏移问题，而是当前系统内部同时存在两套“节点外框”语义，且 single-select 与 multi-select 分别走了不同链路。

## 当前现状

### 1. single-select 走的是 `rect`

当前 node view 里同时暴露：

- `rect`
- `frameRect`

但 `frameRect` 现在直接等于 `item.rect`，并没有单独的几何含义。

参考：

- `whiteboard/packages/whiteboard-editor/src/query/node/read.ts`
- `whiteboard/packages/whiteboard-react/src/features/node/hooks/useNodeView.ts`

其中关键行为是：

- `NodeView.frameRect = item.rect`
- `NodeOverlayLayer` 画单选框时直接使用 `view.transformFrameStyle`
- `NodeTransformHandles` 也直接使用这个 `transformRect`

这意味着单选框和单选 resize/rotate 的起始框，本质上都基于节点的布局矩形。

### 2. multiselect 和 snap 走的是 `bounds`

selection summary / target bounds 用的是：

- `readProjectedNodeBounds`
- `getNodeBounds`

它们最终来自 shape outline 的几何 AABB，而不是节点原始 rect。

参考：

- `whiteboard/packages/whiteboard-core/src/selection/model.ts`
- `whiteboard/packages/whiteboard-editor/src/query/target.ts`
- `whiteboard/packages/whiteboard-editor/src/query/selection/model.ts`

因此多选框和 snap 在 shape 节点上会贴近真实几何边界。

### 3. shape 本身确实没有铺满 rect

当前 descriptor 中不少 shape 视觉和 outline 都不是 `0..100` 铺满，而是内缩一圈。

例如：

- `rect` 外轮廓在 `3..97`
- `ellipse` 半径为 `47`
- `star` 最高点为 `y = 4`

参考：

- `whiteboard/packages/whiteboard-core/src/node/shape.ts`

这意味着：

- 节点的 `rect` 是布局矩形
- shape 的 `bounds` 是视觉几何边界

两者天然不相等。

## 根因

根因不是 “框样式不一致”，而是 “模型不一致”。

当前系统事实上存在两套 box：

### A. `layoutRect`

也就是节点的：

- `position`
- `size`

它是 transform commit、节点布局、节点渲染容器的基础。

### B. `visualBounds`

也就是由 outline / geometry 推导出的真实可见边界。

它是：

- snap
- multiselect
- selection display

现在 single-select 走 `layoutRect`，multi-select / snap 走 `visualBounds`，所以用户看到的行为不一致。

## 关键判断

这时有两个方向：

### 方向一：承认两模型

保留：

- `layoutRect`
- `transformBox`

其中：

- 数据模型和变换计算用 `layoutRect`
- UI 框和 handles 用 `transformBox`

### 方向二：收敛为单模型

只保留一个 canonical box：

- 对 transformable node 来说，这个 box 就是 `rect`

并要求：

- 所有 shape 的视觉边界与 `rect` 一致
- `single select` / `multiselect` / `snap` / `transform` 全部使用同一套 box

## 结论

长期最优应当选择 **方向二：单模型**。

不是因为双模型不可能成立，而是因为当前 whiteboard 并没有足够强的产品语义去支撑这份复杂度。

换句话说：

- 现在的双 box 并不是产品设计选择
- 而是实现历史和 shape 几何内缩造成的副作用

继续保留双模型，只会让后续 shape、selection、transform、snap 越来越难统一。

## 为什么单模型更优

### 1. selection、snap、transform 的心智模型完全统一

用户应该只需要理解一件事：

- 节点的框就是它能选中、能吸附、能缩放、能旋转的框

而不是：

- 单选框一套
- 多选框一套
- 吸附框一套
- transform 起始框又一套

### 2. 代码链路会明显简化

当前的问题本质上是：

- `selection display box`
- `transform box`
- `layout rect`
- `geometry bounds`

四者没有明确 owner。

单模型之后，绝大多数场景可以退化成：

- `rect` 是唯一 canonical box
- `outline` 只负责 hit test / anchor / edge connect

### 3. 新增 shape 不会继续制造新的边界差异

如果继续保留“视觉可在 rect 内任意内缩”，那么每新增一个 shape，都可能继续引入：

- 单选框不贴边
- resize handle 漂移
- snap 边界与交互框不一致

单模型会强制 shape descriptor 遵守统一规则。

### 4. 单选和多选的 transform 逻辑可以最终合流

当前 single-select transform 起点来自 node rect，多选 transform 起点来自 selection transform box。

这两条链长期最好统一到同一套 box 语义，否则交互细节永远会留裂缝。

## 为什么不推荐保留双模型

双模型理论上是成立的，但要合理，需要非常明确的产品语义。

例如只有在下面这些场景里，双模型才值得长期保留：

- 节点有明显的布局区和视觉溢出区
- 容器节点需要标题区 / 内容区 / 边界区分离
- 注释气泡尾巴、阴影、滤镜等不应影响 transform 框
- 特殊节点希望 transform 框与视觉边界刻意不同

而当前 whiteboard 的普通 shape 并不属于这些情况。

如果为了支持常规 shape 而引入双模型，会带来这些长期成本：

- query 层多一套 box 推导
- overlay 层多一套 owner 逻辑
- transform start / transform commit 之间需要 box 映射
- snap / selection / edge connect 继续存在语义分裂
- 后续 debug 成本明显上升

这不划算。

## 目标状态

最终应当满足以下一致性：

### 视觉一致性

- single-select 框贴边
- multi-select 框贴边
- snap 边与选框对齐
- resize handles 贴在同一外框上

### 模型一致性

- `rect` 是唯一 canonical transform box
- `bounds` 不再承担 selection display 的主语义
- `outline` 只服务于 geometry 语义

### 实现一致性

- single-node transform 从 canonical box 启动
- multi-selection transform 也从 canonical box 聚合结果启动
- overlay 不再依赖两个不同的 box 来源

## 设计原则

### 1. 先统一 box，再谈表现

不要先改 UI 框线样式。

因为现有问题不是 border 画粗了，而是喂给 border 的 rect 不同。

### 2. shape descriptor 必须服从 canonical rect

对所有可变形的普通 shape 节点：

- outer visual 必须贴满 rect
- outline 的 bounds 必须与 rect 对齐

也就是说，最终要满足：

`visualBounds === rect`

### 3. outline 只负责几何，不负责 selection box 决策

outline 继续有价值，但它的职责应收束为：

- 命中测试
- 连接锚点
- outline snap
- 非矩形 geometry

而不是决定交互框。

### 4. selection display 与 transform 起始框必须是同源

单选和多选都应只读同一个 canonical box 体系。

## 推荐的最终模型

### 一、保留的数据概念

#### 1. `rect`

定义：

- 节点的 canonical box
- 由 `position + size` 直接表达

职责：

- 渲染容器
- selection box
- transform box
- resize/rotate 的起点与目标
- 多选聚合框

#### 2. `outline`

定义：

- 节点真实形状轮廓

职责：

- point hit test
- edge anchor projection
- outline connect snap

#### 3. `bounds`

定义：

- 几何层导出的边界

职责：

- 仅作为 geometry / collision / coarse hit / 可见性优化使用

注意：

- 它不再是 selection display 的主来源
- 对普通 shape，理论上最终它会与 rect 重合

### 二、一步到位必须删除的中间层

这里不讨论过渡态，不讨论兼容，不讨论别名保留。

目标是直接删除这些中间层和伪概念。

#### 1. 删除 `frameRect`

原因：

- 它不是独立语义，只是 `rect` 的重复包装
- 它会误导 overlay 和 transform 继续绕一层假概念

必须删除的地方：

- `NodeView.frameRect`
- `NodeOverlayView.transformRect` 中来自 `frameRect` 的那层映射
- 所有基于 `frameRect` 的 overlay style 推导

最终替代：

- 全部直接使用 `rect`

#### 2. 删除节点选择上的 `transformBox`

原因：

- 对普通 transformable node，它不该是独立模型
- 它只是在弥补 `rect` 和 `bounds` 不一致

必须删除的地方：

- `SelectionTransformBox`
- `SelectionAffordance.transformBox`
- overlay 层对 `transformBox` 的依赖
- transform start 对 `transformBox` 的依赖

最终替代：

- 单节点：直接使用 `rect`
- 多节点：直接使用 selected node `rect` 的聚合框

#### 3. 删除“selection display box 走 bounds、transform box 走 rect”的双来源

原因：

- 这是当前不一致的根因
- 一个系统里不应该存在两套普通 node 外框来源

必须删除的地方：

- node selection display 依赖 `target.bounds` 的路径
- node multiselect display 依赖 `readProjectedNodeBounds` 的默认路径

最终替代：

- node selection display 一律从 canonical `rect` 体系导出

#### 4. 删除“shape visual 可以长期内缩于 rect”的自由度

原因：

- 这是 box 分裂的源头
- 如果保留这个自由度，selection / snap / transform 迟早再次分叉

必须删除的地方：

- 普通 shape outer visual 的统一内缩策略
- 普通 shape outline AABB 小于 rect 的定义方式

最终替代：

- 普通 shape outer visual 贴满 rect
- 普通 shape outline bounds 与 rect 对齐

#### 5. 删除 node selection 对 `bounds` 的主语义依赖

原因：

- `bounds` 是 geometry 结果，不该主导 selection box
- 把 selection 绑定到 `bounds` 会让 UI 跟几何耦合过深

必须删除的地方：

- node-only selection summary 的 `box` 来自 `readBounds`
- node-only selection affordance 的 `displayBox` 来自 `bounds`

最终替代：

- node-only selection 的 `box` 直接由 node rect 聚合得到

## 最终只保留的最小模型

一步到位的长期最优方案，最终只保留下面三类东西。

### 1. `rect`

这是唯一的 canonical box。

职责：

- 节点渲染容器
- single-select 框
- multi-select 框
- transform 起始框
- resize / rotate 的数学输入
- move / align / box snap 的外框基础

约束：

- 对普通 transformable node，看到的交互框就是它
- 对 annotation 类 shape，selection / transform / snap 仍统一使用它
- annotation 的 visual / outline 可以保留特殊轮廓，但不再反向主导交互框

### 2. `outline`

这是唯一保留的非矩形几何语义。

职责：

- point hit test
- edge anchor projection
- edge connect / outline snap

约束：

- 它不参与 selection box 决策
- 它不参与 transform box 决策
- 对 annotation 这类带尾巴或特殊外轮廓的 shape，它可以继续表达真实轮廓

### 3. `bounds`

这是 geometry 层的派生结果，不是 UI 中心模型。

职责：

- collision
- coarse hit
- 可见性 / 投影优化
- 非 node selection 的几何辅助

约束：

- 它不再是普通 node selection box 的来源
- 对普通 shape，它最终应与 `rect` 重合

## 最终不再保留的东西

下面这些概念在最终态里都不该存在。

- `frameRect`
- `SelectionTransformBox`
- `SelectionAffordance.transformBox`
- “single-select 用 rect，multi-select 用 bounds” 这种分流
- “普通 shape 视觉边界小于 rect 也没关系” 这种定义自由

## 最终只允许存在的一条主链

对于普通 transformable node，最终只允许这条主链存在：

`node.position + node.size -> rect -> render container -> selection box -> transform handles -> transform start -> transform commit`

对于几何相关能力，最终只允许这条辅链存在：

`node + rect -> outline -> hit test / edge anchor / edge connect`

对于 geometry 优化，最终只允许这条派生链存在：

`node + rect + outline -> bounds -> collision / visibility / coarse hit`

除此之外，不应再存在任何额外 box 中间层。

## mixed selection 约束

在最终态里，`node + edge` 的 mixed selection 只保留一套 display box：

- display box 使用整组 selection 的聚合结果
- mixed selection 不再保留单独的 node-only transform box
- 因此 mixed selection 不显示 resize handles

这不是功能缺失，而是删除 `transformBox` 之后的必要一致化结果：

- 既然 display box 与 transform box 必须同源
- 而 edge 当前又不参与 node scale
- 那 mixed selection 最干净的长期语义就是 “可展示、可移动，但不可 resize”

## 具体改造方案

### 第一阶段：shape 几何归一

目标：

- 让 shape visual 和 outline 对齐 rect

需要做的事：

#### A. 统一 shape visual 坐标

文件：

- `whiteboard/packages/whiteboard-core/src/node/shape.ts`

要求：

- 普通 shape 的 outer visual 改为铺满 `0..100`
- 不再使用统一的 `3..97` 内缩边界作为默认策略

例如：

- rectangle 应该铺满容器
- ellipse 应该贴满容器
- star 应该以 rect 为其真实外边界，而不是再额外内缩

#### B. 统一 outline 与 rect 的关系

文件：

- `whiteboard/packages/whiteboard-core/src/node/shape.ts`
- `whiteboard/packages/whiteboard-core/src/node/outline.ts`

要求：

- shape outline 的 AABB 应与 rect 一致
- 不再让 outline bounds 比 rect 小一圈

#### C. 保留 labelInset，但只表达文本区，不表达额外外边距

也就是说：

- labelInset 可以继续存在
- 但不能再替代 shape 的真实外边界

### 第二阶段：query 层统一 canonical box

目标：

- single-select 和 multi-select 读同一 box 语义

#### A. `NodeView` 只保留 `rect`

文件：

- `whiteboard/packages/whiteboard-editor/src/query/node/read.ts`
- `whiteboard/packages/whiteboard-react/src/features/node/hooks/useNodeView.ts`

要求：

- 删除 `frameRect`
- React overlay 和 handles 直接读取 canonical `rect`

#### B. selection summary 改为以 canonical rect 聚合

文件：

- `whiteboard/packages/whiteboard-core/src/selection/model.ts`
- `whiteboard/packages/whiteboard-editor/src/query/selection/model.ts`
- `whiteboard/packages/whiteboard-editor/src/query/target.ts`

要求：

- 单节点：display box = node rect
- 多节点：display box = selected node rect 聚合框
- 删除 node selection 默认走 geometry bounds 的路径

注意：

- edge selection 可以继续走 edge bounds
- 这里说的是 node selection

### 第三阶段：overlay 层统一

目标：

- 单选框、多选框、handles 只读 `rect`

文件：

- `whiteboard/packages/whiteboard-react/src/features/node/components/NodeOverlayLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/node/components/NodeTransformHandles.tsx`

要求：

- `NodeTransformOverlayItem` 使用 node rect
- `SelectionFrameOverlay` 使用 rect 聚合框
- `SelectionHandlesOverlay` 使用同源 rect 聚合框

最终：

- 单选和多选的框视觉语义一致
- 只剩 “单节点 handles” 与 “多节点 handles” 的差异，不再剩框来源差异

### 第四阶段：transform 链路统一

目标：

- single-select / multi-select 都从同一 box 模型开始

文件：

- `whiteboard/packages/whiteboard-editor/src/input/transform/start.ts`
- `whiteboard/packages/whiteboard-editor/src/input/transform/session.ts`
- `whiteboard/packages/whiteboard-core/src/node/transform.ts`

要求：

- single-resize 的起始 rect 用 canonical rect
- multi-scale 的 box 也用 canonical rect 聚合结果
- 删除单节点和多节点 transform 起始盒子语义差异

这样 resize / rotate 过程中：

- overlay 框
- handle 位置
- transform 数学起点

都是一致的。

### 第五阶段：snap 语义收束

目标：

- snap 也遵循同一外框认知

这里需要区分两类 snap：

#### A. box snap

如果 whiteboard 的移动 / 对齐 / selection snap 走 box 语义，那么必须直接基于 canonical rect。

#### B. outline snap / edge connect snap

如果是边连接到 shape 边缘，这仍然应该继续使用 outline。

也就是说最终应明确：

- selection / move / align / transform 的外框语义 = rect
- edge connect / anchor projection / point hit = outline

这不是双模型，而是单模型下的职责分层。

## 更简单的最终规则

可以把整个系统收束为一句规则：

### 规则 1

所有普通 transformable node 都只有一个交互框，那就是 `rect`。

### 规则 2

所有 shape descriptor 都必须保证：

- outer visual 贴满 `rect`
- outline bounds 与 `rect` 对齐

### 规则 3

outline 只负责：

- 命中
- 锚点
- 连接

不负责 selection box。

## 对现有代码的直接判断

### 当前不合理的地方

#### 1. `frameRect` 不该存在

在：

- `whiteboard/packages/whiteboard-editor/src/query/node/read.ts`

里，`frameRect` 只是 `item.rect` 的重复字段。

这会误导后续逻辑，让人以为它是单独的交互框语义，实际上不是，所以应直接删除。

#### 2. selection box 和 node overlay frame 双来源不该存在

这就是 single-select / multiselect 不一致的直接原因。

#### 3. shape descriptor 默认采用统一内缩不该存在

这对 icon 预览可能方便，但对交互框统一是不利的。

## 风险与例外

### 1. 某些特殊 shape 可能短期需要视觉微调

例如：

- `cloud`
- `callout`
- `roundrect-bubble`
- `ellipse-bubble`
- `highlight`

这些 shape 即使采用单模型，也可能需要局部微调 path，让它们既贴边又不显得拥挤。

但这仍比保留双模型更可控。

### 2. annotation / bracket / lane 类节点不应套用这套规则

如果未来引入：

- bracket
- lane
- annotation line
- line-like symbol

它们可以作为新的 node family 存在，不必强行服从普通 shape 的 canonical rect 模型。

这不影响当前对 `shape` 家族做单模型归一。

## 验证标准

改造完成后，以下行为应完全一致：

### 视觉

- single-select 框贴边
- multiselect 框贴边
- resize handles 贴边
- rotate handle 相对框位置稳定

### 交互

- single-select resize 从看到的框开始变形
- multi-select scale 从看到的框开始变形
- move / align / snap 与看到的框一致

### 几何

- edge connect 仍然吸附到真实 outline
- point hit 仍然使用真实 outline

## 实施顺序建议

### 第一步

先在 shape descriptor 层完成 visual / outline 归一，消掉 `visualBounds !== rect`。

### 第二步

删掉 `frameRect`，把 overlay 统一到 `rect`。

### 第三步

删掉节点选择上的 `transformBox`，把 selection display 全部统一到 canonical rect。

### 第四步

最后检查 snap 与 edge connect 的职责是否仍然清晰。

## 最终结论

当前问题不是“单选框画大了”，而是系统内部对“节点框”没有统一定义。

长期最优不是维持两套普通 shape 交互模型，而是：

- 让普通 shape 的视觉边界服从 `rect`
- 让 `rect` 成为 selection / transform / snap 的唯一 canonical box
- 让 `outline` 只承担几何职责

这样系统会明显更简单，也更稳定。

一句话总结：

**不是必须引入两模型，而是应该通过 shape 几何归一，把当前被动产生的两模型消掉。**

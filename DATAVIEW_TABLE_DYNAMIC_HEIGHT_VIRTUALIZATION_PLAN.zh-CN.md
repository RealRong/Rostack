# DATAVIEW Table 动态高度虚拟化方案

## 结论

如果 table 未来要稳定支持以下能力：

- 单元格内容换行
- 图片 / 富内容 cell
- footer 汇总内容换行
- group section header 高度自适应

那么当前 table 虚拟化必须从“固定高度 block 列表”升级成“估算高度 + 实测高度”的 block layout。

这件事能做，而且方向明确，但不适合继续用补丁式修法处理。

本方案前提如下：

- **不需要兼容当前固定高度设计**
- **不优先做低风险局部补丁**
- **目标是长期最优**

也就是说，这不是给某几个节点加 `height: auto` 的问题，而是要重建 table vertical virtual layout 的真实数据模型。

## 当前现状

当前 table 的纵向虚拟化本质上是“先算一份静态布局快照，再按快照做窗口裁剪”。

从实现上看：

- `row`
- `section-header`
- `column-header`
- `column-footer`

这些 block 的 `top` 和 `height` 都在构建阶段被预先算死。

当前结构的直接特征是：

- row 使用统一 `rowHeight`
- header / footer / section header 使用统一 `headerHeight`
- 后续窗口裁剪通过 block 的 `top/height` 做二分查找

这意味着现在的 virtual runtime 依赖一个前提：

- **任意 block 的高度在构建后是稳定不变的**

这个前提一旦失效，后面所有 block 的 `top` 都会连锁变化。

## 为什么不能直接改成 auto

原因不在 DOM，而在 virtual layout。

### 1. 虚拟化必须提前知道位置

table 不是把所有行都放进自然流里再滚动，而是先计算：

- 每个 block 多高
- 每个 block 从哪里开始

如果 row 高度改成 `auto`，virtual 层就不知道：

- 当前视口应该渲染哪些行
- 总高度是多少
- 每个 block 的 top 是多少

### 2. row 高度受列宽影响

动态 row height 并不只是“内容多就变高”，它还取决于：

- 当前列宽
- 当前视口下列宽是否变化
- 单元格是否换行
- 卡片 / 图片是否异步加载

所以高度缓存不能只按 `rowId` 做。

### 3. 高度变化会影响滚动稳定性

只要视口上方某个 block 的高度被重新测量：

- 后面所有 block 的 `top` 都会变化
- 当前 scrollTop 对应的内容锚点会漂移

如果不做锚点补偿，用户会看到页面“跳一下”。

## 长期最优方向

长期最优方案不是推翻现在的 block virtualization，而是把它升级成“支持 variable height block 的 layout snapshot”。

保留的东西：

- block abstraction
- layout snapshot
- binary search windowing
- overscan runtime

要升级的东西：

- block height 的来源
- top 的计算方式
- 重新测量后的布局收敛机制

一句话总结：

- **保留 block 模型**
- **放弃固定高度前提**

## 新的核心模型

建议把当前 `TableBlock` 的布局属性升级成下面这套语义。

### `TableMeasuredBlock`

每个 block 至少应包含：

- `key`
- `kind`
- `estimatedHeight`
- `measuredHeight`
- `resolvedHeight`
- `top`

其中：

- `estimatedHeight`
  - 首次布局时的预测值
- `measuredHeight`
  - 进入视口后通过 DOM 测得的真实值
- `resolvedHeight`
  - 优先使用 `measuredHeight`，否则退回 `estimatedHeight`

也就是说，布局系统必须接受这样一个现实：

- block 高度在首帧不是最终值
- block 高度会随着实际渲染逐步收敛

### block 种类保持不变

建议继续保留：

- `row`
- `section-header`
- `column-header`
- `column-footer`

不要为了动态高度引入新的复杂层级。

当前 block 模型本身没问题，问题只是现在它把高度建模得过于静态。

## 高度来源模型

### 1. row

row 的最终高度应该由“该行所有可见单元格内容的最大高度”决定。

也就是说：

- 行高不是每个 cell 各自生效
- 而是整行统一取 max

这是表格语义里最稳定、最可预期的模型。

未来如果有图片单元格，图片更高，那么这一行就整体变高。

### 2. section header

group section header 可以直接做真实 DOM 测量。

它的数量远少于 row，变化频率也低，是最容易先落地的一类动态 block。

### 3. column header

如果未来 header 允许：

- 多行标题
- 更复杂的筛选 / 排序状态
- 提示文案换行

那么 header 也应该走测量。

### 4. column footer

footer 汇总本来就是动态高度最合理的候选之一。

因为：

- block 数量少
- 变化频率低
- 内容可能很长

它非常适合作为动态高度链路的第一批落地对象。

## 高度缓存应该怎么建模

这块不能只做一个 `Map<id, height>`。

### row height 缓存键

建议至少按以下维度建缓存：

- `rowId`
- `layoutVersion`

其中 `layoutVersion` 应代表所有会影响换行高度的横向布局状态，例如：

- 列宽变化
- 列显隐变化
- 字体或字号变化

不要把 row 高度缓存只绑死在 `rowId` 上，否则一旦列宽变了，缓存就过期但系统感知不到。

### section / header / footer 缓存键

建议按：

- `block key`
- `layoutVersion`

建模即可。

### 为什么必须有 layoutVersion

因为动态高度本质上是“内容 + 可用宽度”的函数。

宽度一变，高度就可能变化。

所以高度缓存必须对横向布局变化敏感。

## 布局计算方式

### 1. 先生成逻辑 block 列表

这一步只决定：

- block 顺序
- block 归属
- block identity

不再在这里直接固化最终高度。

### 2. 为每个 block 解析 `resolvedHeight`

规则很简单：

- 有测量值，用测量值
- 没测量值，用估算值

### 3. 重新累加生成 `top`

`top` 不再是静态常量模板算出来的结果，而是每次基于最新 `resolvedHeight` 前缀和得到。

### 4. runtime 消费最新 snapshot

现有的窗口裁剪逻辑可以继续保留，只要输入的 block snapshot 是最新的。

所以这里真正该重构的是“layout snapshot producer”，不是整套 virtual runtime。

## 估算高度策略

动态高度虚拟化要稳定，estimate 非常关键。

如果 estimate 太差，就会出现：

- 首帧总高度严重失真
- 滚动条长度抖动
- 进入视口后连续跳动

建议按 block 类型分别给 estimate。

### row estimate

第一版可以分三档：

- 单行文本行高
- 多行文本估算行高
- 富内容 / 图片占位估算行高

后续再逐步进化成更智能的 heuristic，例如根据：

- 字段类型
- 文本长度
- 是否存在图片

估算。

但第一版不要过度复杂化。

### section header / column header / footer estimate

这一类 block 数量少，可以直接给一个保守的基础值：

- 单行时等于当前固定高度
- 可能换行时给稍高一点的估算值

等真正进入视口后再测量纠正。

## 测量机制

当前已经有通用的高度测量基础设施，可以继续沿用 `ResizeObserver` 这一思路。

长期最优方案里，建议测量只发生在已挂载 block 上。

也就是说：

- 未进入视口的 block 用 estimate
- 进入视口后挂载 DOM，开始 measure
- measure 结果回写 layout state
- layout 重新出新 snapshot

这是一条典型的“渐进收敛”链路。

## 最关键的工程点：Scroll Anchoring

这部分是整套方案最重要的点之一。

如果不做 scroll anchor 补偿，动态高度在大表里会明显影响体验。

### 问题本质

假设当前用户停在第 3000 行附近。

此时视口上方某几个 block 被重新测量后高度变高了，那么：

- 当前视觉上看到的行会整体向下推
- 浏览器原始 `scrollTop` 没变
- 用户会觉得内容跳了

### 正确策略

需要引入“锚点 block”概念。

建议采用：

- 取当前视口首个可见 block 作为锚点
- 记录其更新前的 `top`
- 新 snapshot 生成后，比较其更新后的 `top`
- 用差值补偿 scrollTop

也就是：

- block 在布局上往下推了多少
- scrollTop 就同步补多少

这样用户看到的首屏内容才不会抖。

### 何时需要补偿

建议只在以下场景补偿：

- 高度变化发生在锚点之前
- 或者锚点本身高度变化但顶部参考位置需要稳定

如果变化完全发生在视口下方，则不需要补偿。

## Row 动态高度的长期建模

这里是整个方案里最需要一次想清楚的部分。

### 原则 1：row 是高度真相，不是 cell

不要把虚拟化建模成“每个 cell 高度独立”。

正确做法是：

- cell 可以自适应内容
- row 容器在提交布局时取一行内最大高度

虚拟层只认 row 高度。

### 原则 2：测量要以 row 为单位收敛

虽然 cell 内部可能更复杂，但最终回写 virtual layout 的粒度仍应是 row。

不要让 virtual 层维护海量 cell 级高度状态，否则状态规模和重排成本都会失控。

### 原则 3：图片和异步内容必须允许二次测量

未来图片 cell 的典型过程会是：

- 首次渲染有占位高度
- 图片加载完成后高度变化
- row 重新测量
- layout snapshot 更新
- 必要时滚动补偿

这条链路必须是被架构正式支持的，而不是例外处理。

## Footer 动态高度的价值

从工程顺序上看，footer 非常适合先做。

原因如下：

- 数量少
- 可预测
- 风险小
- 能验证整条 measured block pipeline

如果 footer 的多行汇总能跑通，说明以下能力都已经具备：

- block 级测量
- layout snapshot 重建
- virtual window 稳定更新
- 宽度变化触发高度失效

所以 footer 很适合作为第一阶段落地对象。

## 是否需要彻底换虚拟化方案

我的判断是不需要。

原因很简单：

- 现有 table virtual 已经有明确的 block 抽象
- 已经有窗口裁剪 runtime
- 已经有足够清晰的 layout / viewport / window 分层

真正需要替换的不是“虚拟化思路”，而是“固定高度前提”。

如果现在直接换成另一套完全不同的 virtualizer：

- 迁移成本更高
- 现有 selection / marquee / fill handle 还要重新适配
- 问题本质也没有变，最终仍要解决 measured layout 和 scroll anchor

所以长期最优不是推翻，而是升级。

## 推荐实施顺序

### 阶段 1：把 vertical layout 升级成 variable-height block pipeline

目标：

- block 支持 estimate / measured / resolved height
- snapshot 支持按 resolved height 重算 top
- runtime 继续消费 snapshot
- 引入基础 scroll anchor 补偿

这一阶段先不追求 row 全动态。

### 阶段 2：先接 section header / column header / footer

目标：

- 让非 row block 支持多行和真实高度
- 验证测量回写与滚动稳定性

原因：

- block 数量少
- 更容易验证
- 更适合先把架构做稳

### 阶段 3：接 row 文本换行

目标：

- row 高度以实际内容为准
- 列宽变化时 row height cache 失效
- 大量文本换行时滚动仍稳定

### 阶段 4：接图片 / 富内容 / 异步增长

目标：

- 支持多次 remeasure
- 保持滚动锚点稳定
- 控制大表重排成本

## 性能风险

动态高度最大的问题不是“能不能算”，而是“怎么避免在大数据量里退化”。

主要风险有：

- 大量可见 row 同时触发 `ResizeObserver`
- 列宽变化导致可见区所有 row 重新测量
- 图片分批加载造成频繁 reflow
- 每次高度变化都全量重建全部 block top

## 性能上的长期最优原则

### 1. 只测可见块

不要预先测所有 row。

未进入视口的 row 使用 estimate 即可。

### 2. 虚拟层只维护 block 级状态

不要让 virtual 层持有 cell 级高度矩阵。

### 3. 高度变化要批量提交

如果一帧内有多个 block 高度变化，应合并后统一提交一次新 snapshot。

### 4. top 重算要尽量收敛

如果未来数据量非常大，可以继续演进成：

- 前缀和缓存
- 分段 offset
- chunked recompute

但第一版没必要过早复杂化。

## 与当前其他交互的关系

动态高度方案必须与现有这些能力兼容：

- row selection
- cell selection
- marquee
- fill handle
- group collapse / expand
- sort / filter / delete 后的 block 重建

这里最重要的是一个原则：

- **交互层不要自己推导几何信息**

几何信息应统一来自最新的 virtual layout snapshot。

否则只要 block 高度一变化，命中区域和视觉区域就会脱节。

## 测试建议

这套方案落地后，至少要覆盖以下验证面。

### 功能面

- 文本换行后 row 自动增高
- footer 多行汇总自动增高
- section header 多行时高度正确
- group collapse / expand 后高度正确
- 删除、过滤、排序后 snapshot 正确收缩

### 交互面

- 滚动过程中进入可见区的 row 完成 remeasure 后不明显跳动
- 选择态在动态高度下仍命中正确
- marquee 拖选区域与实际行边界一致
- fill handle 拖拽区域与行位置一致

### 性能面

- 1k / 5k / 20k 数据量下首滚不卡顿
- 列宽变化后可见区重测可控
- 图片异步加载时不会持续抖动

## 最终建议

如果只是想短期支持一点点换行效果，可以继续打补丁。

但只要产品方向已经明确会走到：

- 多行文本
- 富内容 cell
- 图片
- 多行 footer

那最优做法就是现在直接把 table virtual 升级成 measured block layout。

最应该避免的路线是：

- 继续假设 row 是固定高度
- 只给个别 cell 加 `line-clamp` 或局部展开
- 等图片和多行 footer 真要做时再被迫返工整个 vertical virtual model

所以这次的长期最优结论非常明确：

- **不换 block virtualization**
- **重建 block height model**
- **把 table vertical virtual 从 fixed-height snapshot 升级为 measured snapshot**

这才是后续所有动态内容能力的正确基础。

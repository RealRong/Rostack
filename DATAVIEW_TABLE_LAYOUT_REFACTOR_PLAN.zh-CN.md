# DATAVIEW Table 横向布局重构方案

## 结论

这次问题不应该用补丁式修法处理。

当前 table 的横向布局已经暴露出一个结构性问题：

- 列宽计算只是字符串模板
- 容器宽度和内容宽度没有统一真相
- header / row / footer 只是被动消费 template
- scroll container、canvas、grid 三层之间没有清晰 contract

如果继续靠：

- 调 `minmax(...)`
- 给某些层补 `min-width`
- 调整某几个容器的 `overflow-x-auto`

只能修表象，不能解决根因。

本方案的前提明确如下：

- **不需要兼容现有 layout 设计**
- **不优先做低风险渐进修补**
- **目标是长期最优**

也就是说，这次应当按“重新确立 table 横向布局模型”的级别来做。

## 当前问题

以现在的实现看，问题核心在于：

1. `gridTemplateColumns` 只是一个结果字符串，不是完整布局模型
2. 默认列宽混用了 `px` 和 `minmax(..., 1fr)`
3. 表格内容真实总宽度没有被明确计算和承载
4. `canvas` 没有成为“整张表内容宽度”的承载层
5. 小屏多列时，表格没有稳定进入“横向滚动优先”模式

所以才会出现这种现象：

- 列很多，理论总宽超过 viewport
- 但最终视觉上表格没有真正撑出自己的内容宽度
- 横向滚动、列宽、grid 轨道行为之间表现不稳定

## 重构目标

这次重构要达成的是一个长期稳定的横向布局模型。

目标如下：

- 表格在多列场景下有明确、稳定的横向撑开行为
- 小屏幕优先横向滚动，而不是压扁列
- 大屏幕不做 stretch，右侧留白不是问题
- header 行尾始终保留一个 `添加属性` action
- header / row / footer 共享同一套数据列宽真相
- scroll container / canvas / row 的职责清晰
- 后续可以自然支持：
  - 更聪明的默认列宽
  - sticky column
  - horizontal reveal
  - column virtualization
  - 更稳的 resize / reorder

## 核心原则

### 1. Table 必须有单一横向布局真相

不要让这些层各自“顺便”决定宽度：

- layout helper
- Surface canvas
- header row
- body row
- footer row
- virtual runtime

必须有一个 table 级别的统一布局结果，所有层都只消费它。

### 2. 多列场景优先横向滚动

这是长期最优方案里最重要的交互原则。

当列总宽超过 viewport 时，正确行为应该是：

- 保持列的可读宽度
- 建立真实内容宽度
- 让外层产生稳定横向滚动

而不是：

- 自动压缩列到不可读
- 让 `1fr` 把列轨道挤得失真

### 3. 最终渲染层应使用确定性的像素列宽

长期最优方案里，渲染层不要继续依赖：

- `minmax(160px, 1fr)`

更合理的做法是：

- 先在布局层算出每列最终像素宽
- 渲染时统一输出 `px px px ...`

也就是：

- 布局阶段可以有复杂策略
- 渲染阶段必须尽量确定、简单、可预期

### 4. 不要以“填满容器”为目标

table 的目标应该是稳定承载真实列宽，而不是视觉上把一行铺满。

更合理的是：

- 所有数据列都保持确定性的像素宽
- 如果列总宽小于 viewport，右侧允许自然留白
- header 最后始终追加一个 `添加属性` action
- 用户看到的“还有一个操作位”由 header trailing action 承担，而不是依赖 stretch

## 新的布局模型

建议建立一个新的 table 横向布局模型，统一产出以下结果。

### `TableColumnLayout`

建议具备这些字段：

- `columnWidths`
  - 每列最终像素宽
- `template`
  - 如果继续使用 grid，则给数据列使用的 `px px px ...`

这里故意不把以下内容做成正式字段：

- `dataContentWidth`
- `appendColumnWidth`
- `canvasWidth`
- `containerWidth`

原因是它们都更接近派生值或 DOM 结果，而不是必须长期持有的布局真相。

`columnStartOffsets` 也不建议在这一阶段进入正式 model。

原因是：

- 它可以从 `columnWidths` 的前缀和实时派生
- 只有在 sticky / reveal / column virtualization / drag indicator 这些高级能力里才有缓存价值

### 输入

布局计算建议基于以下输入：

- 当前列列表
- 用户显式设定的列宽
- 各列字段类型
- 每种字段类型的默认宽度规则
- 最小列宽约束

### 输出约束

这层必须保证：

- 所有最终列宽都是确定值
- 所有消费方拿到的是同一份结果
- layout model 只描述数据列，不描述 header 末尾 action
- 任意时刻都可以从 `columnWidths` 派生出数据内容宽度

## 新的分层职责

### 1. Layout 层

只负责：

- 计算每列最终宽度
- 输出 template

不负责：

- UI
- 滚动事件
- cell 渲染

### 2. Surface / Canvas 层

只负责：

- scroll container
- content canvas
- 承载整张表的内容

这里要明确：

- `container` 是 viewport
- `canvas` 是内容承载层，它不一定需要一个显式汇总宽度

也就是说：

- `container` 负责横向和纵向滚动
- `canvas` 至少保持 `min-width: 100%`
- 真正的横向撑开可以由内部 cell 的显式宽度自然形成

而不是继续只是：

- `minWidth: 100%`

### 3. Row 消费层

包括：

- header row
- body row
- footer row

它们只做一件事：

- 消费统一的数据列宽结果

但要允许：

- header 在数据列之后追加 trailing action
- body / footer 不需要知道这个 trailing action 的宽度

### 4. Virtual 层

virtual runtime 应该读同一份数据列宽快照。

后续如果要做：

- horizontal reveal
- sticky column
- column virtualization

都应该建立在这份统一的数据列宽结果上。

## 默认列宽策略

长期最优方案中，不建议所有字段默认都 `160px`。

应该按字段类型定义基础宽度。

建议第一版采用：

- `title`: `320`
- `text`: `240`
- `url`: `220`
- `email`: `220`
- `phone`: `180`
- `status`: `160`
- `select`: `160`
- `multiSelect`: `180`
- `number`: `140`
- `date`: `160`
- `boolean`: `96`
- `asset`: `200`

同时保留：

- `MIN_COLUMN_WIDTH`

但它只是兜底，不应该是主要布局策略。

## Header Trailing Action 策略

这次建议直接对齐你图里的方向，不再引入 stretch。

### 核心结论

- 数据列只负责表达数据
- header 行尾固定存在一个 `添加属性` action
- 它不属于数据列模型
- 即使整张表非常宽，这个 action 也始终出现在最后一个数据列右边

### 为什么这比 stretch 简单

因为它把两个问题彻底分开了：

- 数据列宽如何计算
- 右侧操作位如何呈现

如果继续 stretch，就会把：

- 内容宽度
- viewport 剩余空间
- 交互占位

混成同一个问题。

而加一个稳定的 header trailing action 后：

- 数据列宽就是数据列宽
- UI 末端的“继续加列”入口也有明确位置

### 对渲染层的要求

- header row 负责渲染所有数据列 header cell
- header row 在最后一个数据列之后追加一个 trailing action 容器
- body row / footer row 只渲染数据列
- trailing action 的尺寸由它自己的内容自然决定，不进入 column layout model

如果继续使用 grid：

- grid 只负责数据列轨道
- trailing action 放在 grid 外侧

如果后续改成更接近 Notion 的实现：

- header / body 都可以改成显式宽度的 flex cell 串
- 但核心原则不变，trailing action 仍然不进入数据列模型

## 容器 contract

长期最优方案里，这个 contract 应该被明确写死。

### `container`

负责：

- 可视 viewport
- 横向滚动
- 纵向滚动

### `canvas`

负责：

- 承载整张表内容
- 允许依靠内部内容自然撑开

不要求：

- 必须设置一个显式 `canvasWidth`

### `row`

负责：

- 消费数据列宽结果
- 决定自己用 grid 还是 flex 渲染

这样结构才会稳定：

- container 决定能看到多少
- canvas 负责承载内容
- row 里的 cell 宽度决定内容实际有多宽

## 对现有实现的直接判断

以下设计不建议保留：

### 1. `gridTemplate()` 直接输出 `minmax(..., 1fr)`

这个策略短期省事，长期会让：

- 小屏行为不稳定
- 真实内容总宽不明确
- 复杂场景下难以推理

### 2. `canvas` 只设置 `minWidth: 100%`

这本身不一定是错的。

如果内部 row/cell 已经能用显式宽度自然撑开内容，那么 `canvas` 完全可以继续只承担：

- `min-width: 100%`
- 内容承载

### 3. 多层各自隐式参与宽度决策

header / row / footer / surface 不应该再有自己的横向策略。

布局只应该由 table layout 模块计算一次。

## 推荐实施顺序

这次重构虽然是长期最优导向，但仍建议按顺序推进。

### 阶段 1：建立新布局真相

目标：

- 抽出独立的 `TableColumnLayout`
- 输入列、字段类型、用户宽度
- 输出：
  - `columnWidths`
  - `template`

这一阶段先不做复杂动画或高级体验。

### 阶段 2：重写 Surface / Canvas contract

目标：

- `container` 负责滚动
- `canvas` 退回为内容承载层
- row / cell 用显式宽度自然撑开横向内容

做到这一步后，小屏多列问题应该会从根上消失。

### 阶段 3：接入 smarter defaults

目标：

- 按字段类型设置默认宽度
- 让 title / text 列更合理
- 让 number / status / date 列不过宽

### 阶段 4：补齐 trailing action contract

目标：

- header 尾部始终存在 `添加属性` action
- 它不进入数据列宽模型
- 明确它与 body / footer / virtualization 的关系

### 阶段 5：再考虑高级能力

包括但不限于：

- sticky columns
- column virtualization
- reveal to column
- 更高质量的 resize 体验

## 这次重构明确不做的事

既然目标是长期最优，就应该主动砍掉一些“看起来节省时间、实际上拖累未来”的方案。

不做：

- 局部补 `min-width`
- 继续调现有 `minmax(..., 1fr)` 参数
- 在单个 row / header 上做补丁式宽度覆盖
- 靠额外嵌套滚动容器修复横向滚动
- 在 cell 层按内容反推布局
- 为兼容旧逻辑保留双轨布局模型

## 长期最优方案的最终形态

理想的最终状态应该是：

1. Table 有一个统一的 column layout runtime
2. 这个 runtime 只产出确定性的宽度结果
3. canvas 只是内容承载层，不再强依赖显式汇总宽度
4. row 只消费数据列宽结果
5. 多列场景下稳定横向滚动
6. 行尾固定存在稳定的 `添加属性` action
7. 后续高级能力可以自然叠加

## 最终建议

这次不应该被定义为“修复某个小屏列宽问题”，而应该定义为：

**重新设计 dataview table 的横向布局系统。**

一句话总结：

- 不兼容旧思路
- 不做补丁
- 不继续依赖 `minmax(..., 1fr)` 作为基础策略
- 不再把 stretch 当成目标
- 建立 table 级单一横向布局真相
- 让数据列宽、header trailing action、scroll container 三者形成稳定 contract

这才是长期最优解。

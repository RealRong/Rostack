# Dataview Layout Wrap And Card Presentation Architecture

## 背景

当前 dataview 的布局设置存在三类问题：

- `Wrap content` 只有 table 真正生效，gallery 和 kanban 没有贯通到 card 渲染层。
- kanban 的属性展示只有当前紧凑布局，没有和 gallery 对齐的纵向列式布局。
- 若干 option 的产品语义不稳定，已经出现“模型存在，但 UI 和渲染没有形成闭环”的漂移。

这不是单个 bug，更像是展示模型还没有收敛。

## 这轮设计的核心结论

长期最优方案不是做一份全局共享的 `view.options.card`，而是：

- `gallery.card` 和 `kanban.card` 各自保存自己的 card 配置
- 两者复用同一套 schema、命名和渲染抽象
- 切换 view type 时，保留各自已保存的 card 配置

也就是：

- 共享的是 schema
- 不共享的是 value

本轮的明确结论如下。

### 保留并统一

- `wrap content` 统一命名为 `wrap`
- `size` 不是 gallery 专属，而是 gallery / kanban 共用的 card 能力
- `layout` 不是 gallery / kanban 各自发明的字段，而是 gallery / kanban 共用的 card 能力

### 删除

- `showFieldLabels` 没有清晰、稳定、可验证的产品语义，应删除，不做迁移

### 迁移

- `newRecordPosition` 不应继续作为 `view.options.kanban` 中的持久化配置存在
- 它要迁移为“不同 UI 创建入口自带的插入策略”，由触发入口决定插到前面还是后面，而不是由 view layout setting 决定

## 当前实现判断

### 1. table 的 wrap 链路是完整的

table 当前已经具备完整的 wrap 生效路径：

- 设置面板暴露 table 的 wrap 开关
- active view api 提供对应 setter
- table body 订阅 `view.options.table`
- cell value 将 wrap 传给字段值渲染

因此 table 中的 `Wrap content` 是真实能力。

### 2. card 渲染底层已经支持 wrap 语义，但上层没有接通

gallery / kanban 当前都共享 card value 渲染链路：

- `CardContent`
- `CardFieldSlot`
- `CardField`
- `FieldValueContent`
- `FieldValueRenderer`

底层字段值渲染本身已经有“截断 / 换行”这种能力，但 card 相关组件没有把 `wrap` 作为 card 配置往下传，所以 gallery / kanban 现在不可能真正支持 `Wrap content`。

### 3. gallery 和 kanban 已共享 card 骨架，但没有共享 card schema

现在两者虽然都建立在共享 `CardContent` 之上，但高层表现仍然写死在各自 `Card.tsx` 中：

- gallery 的属性区是纵向堆叠
- kanban 的属性区是横向紧凑排布

这说明它们需要共享的不只是基础组件，而是更高一层的 card option schema 和 presenter 输入格式。

### 4. `showFieldLabels` 和 `newRecordPosition` 都是不稳定信号

现状里：

- `showFieldLabels` 已经有 contract 和 setter，但 React 渲染层基本没有消费
- `newRecordPosition` 不只是文案，它当前会直接影响 kanban 创建记录后的排序行为

这两个字段都说明当前 option 层把“展示配置”和“交互入口语义”混在了一起。

## 目标

整体要达到六个目标：

1. `Wrap content` 在 table、gallery、kanban 上都有清晰语义。
2. `size` 成为 gallery / kanban 的同类能力。
3. `layout` 成为 gallery / kanban 的同类能力。
4. gallery / kanban 各自记忆自己的 card 配置。
5. `LayoutPanel` 按能力分组组织，而不是继续按 view type 堆散项。
6. 明确哪些字段应保留、迁移、改名、删除，避免继续积累历史包袱。

## 命名统一

推荐统一成“视图作用域对象 + 叶子字段”的风格。

### 用户可见文案

- 一律使用 `Wrap content`
- 一律使用 `Card size`
- 一律使用 `Layout`

### 配置层命名

- `table.wrap`
- `gallery.card.wrap`
- `gallery.card.size`
- `gallery.card.layout`
- `kanban.card.wrap`
- `kanban.card.size`
- `kanban.card.layout`

### 渲染层命名

如果一个 prop 仅表达“是否允许内容换行”，也统一叫 `wrap`，不再使用 `wrapCells`、`wrapContent`、`multiline` 这种平行命名。

## 推荐的数据模型

长期最优方案是让 gallery / kanban 各自拥有一份 card 配置，但共享同一套 schema。

```ts
type CardSize = 'sm' | 'md' | 'lg'
type CardLayout = 'compact' | 'stacked'

interface CardOptions {
  wrap: boolean
  size: CardSize
  layout: CardLayout
}
```

整体 view options 推荐演进为：

```ts
interface ViewOptions {
  table: TableOptions
  gallery: {
    card: CardOptions
    // gallery-only options
  }
  kanban: {
    card: CardOptions
    cardsPerColumn: 25 | 50 | 100 | 'all'
    fillColumnColor: boolean
    // kanban-only options
  }
}
```

这套模型表达的是：

- `gallery.card.*` 和 `kanban.card.*` 语义一致
- 但它们各自独立存值
- 切换 view type 时，不互相覆盖

## 为什么不是单独共享的 `view.options.card`

原因很简单：用户对 card 配置的预期通常是“按视图类型分别记忆”，而不是“所有 card-like 视图共享一份状态”。

典型行为应该是：

1. 新建 kanban，默认 `kanban.card.size = 'md'`
2. 用户改成 `lg`
3. 切到 gallery，首次进入 gallery，读取或初始化 `gallery.card.size`
4. 用户在 gallery 改成 `sm`
5. 再切回 kanban，仍然看到 `lg`
6. 再切回 gallery，仍然看到 `sm`

这说明长期最优模型不是 shared state，而是 shared schema。

## 哪些字段该保留、迁移、删除

### 1. `wrapCells`

状态：

- 这是历史命名，不适合作为长期术语

建议：

- 迁移为 `table.wrap`

原因：

- 配置树自己已经表达了作用域，不需要在字段名里重复写 `Cells`
- 能和 `gallery.card.wrap`、`kanban.card.wrap` 形成一致命名

### 2. `wrapContent`

状态：

- 适合作为用户文案，但不适合作为长期代码字段名

建议：

- 不保留为配置字段
- 统一收敛到 `wrap`

### 3. `size`

状态：

- 当前被建模成 gallery 专属，但从产品语义上看它本质是 card 的尺寸 / 密度等级

建议：

- 从 `gallery.cardSize` 迁移到 `gallery.card.size`
- 新增 `kanban.card.size`

原因：

- 它不是 gallery 独有能力
- kanban 未来也会需要自己的 card size 记忆
- 但它也不应该提升成全局共享的 `card.size`

长期语义建议：

- `sm`：更高密度，适合 overview
- `md`：默认平衡态
- `lg`：更强调浏览和阅读

### 4. `propertyLayout`

状态：

- 这是上一轮方案里的字段名

建议：

- 改名为 `layout`
- 分别落在 `gallery.card.layout` 和 `kanban.card.layout`

原因：

- 这里讨论的就是 card 的布局模式
- 已经在 `card` 作用域下，不需要把字段写成 `propertyLayout`
- `layout` 更短，更贴近用户心智

约束：

- 该字段只描述 card 属性区布局，不描述整个 view layout
- 因为它处于 `gallery.card` / `kanban.card` 内部，歧义可控

### 5. `showFieldLabels`

状态：

- 当前语义不清晰
- 从现有实现看，它既没有形成稳定 UI，也没有明确说明“label 显示成什么样”

问题在于它至少有三层不明确：

- label 是显示在每个属性值上方，还是 inline 在左边
- compact layout 下是否仍然展示 label
- wrap、layout、size 改变后，label 的布局规则是什么

建议：

- 直接删除
- 不做迁移
- 不在 `LayoutPanel` 暴露

如果未来真的需要这个能力，建议在完整设计后以更明确的术语重新引入，而不是复活 `showFieldLabels`。

### 6. `newRecordPosition`

状态：

- 当前在 kanban options 中持久化保存
- engine 创建记录时会用它决定新记录插到 section 开头还是末尾

问题在于它描述的不是“视图布局偏好”，而是“某个创建入口的插入行为”。

建议：

- 从 `view.options.kanban` 中删除
- 迁移为 UI 入口级策略，不做持久化

## 为什么 `newRecordPosition` 不该是持久化 option

它真正回答的问题不是：

- “这个 view 长期喜欢把新记录放在前面还是后面？”

而是：

- “当用户从某个具体入口点击新建时，这个入口应该把记录插在哪里？”

长期最优设计应该是：

- 持久化 option 只保存稳定的展示偏好
- 创建入口的插入策略由入口自身定义

## 长期最优的创建策略设计

推荐把“创建记录”的插入位置理解为 action policy，而不是 view option。

例如：

- table footer 的 `New record` 按钮：插入在末尾
- gallery footer 的 `New record` 按钮：插入在末尾
- kanban column footer 的 `New record` 按钮：插入在该列末尾
- kanban column header 的 `New record` 按钮：插入在该列开头

这正好对应产品预期，而且逻辑稳定：

- footer 入口天然语义是 append
- header 顶部入口天然语义是 prepend

因此长期最优设计应是：

- 不保存 `newRecordPosition`
- 不让用户在 layout panel 中配置“新建插前还是插后”
- 由每个创建入口自己携带插入策略

可以把这层策略抽象成：

```ts
type CreatePlacement = 'start' | 'end'
```

但它属于 UI action input，不属于 `ViewOptions`。

## Gallery / Kanban / Table 的长期配置边界

### table 保留什么

- `table.wrap`
- `table.showVerticalLines`

这些都是真正稳定的 table 呈现偏好。

### gallery 保留什么

- `gallery.card.wrap`
- `gallery.card.size`
- `gallery.card.layout`

以及未来真正只属于 gallery 的能力。

### kanban 保留什么

- `kanban.card.wrap`
- `kanban.card.size`
- `kanban.card.layout`
- `kanban.cardsPerColumn`
- `kanban.fillColumnColor`

建议删除：

- `kanban.newRecordPosition`

## 推荐的 LayoutPanel 信息架构

不要继续按 `view.type === ...` 组织成三套松散菜单，而应该按能力分组。

### 1. View Type

- Table
- Kanban
- Gallery

### 2. Card

仅在 gallery / kanban 显示。

对于 gallery，绑定到：

- `gallery.card.wrap`
- `gallery.card.size`
- `gallery.card.layout`

对于 kanban，绑定到：

- `kanban.card.wrap`
- `kanban.card.size`
- `kanban.card.layout`

包含：

- `Wrap content`
- `Card size`
- `Layout`

其中：

- `Card size`：`Small` / `Medium` / `Large`
- `Layout`：`Compact` / `Stacked`

### 3. Kanban

仅在 kanban 显示。

包含：

- `Cards per column`
- `Fill column color`

不再包含：

- `New card position`

### 4. Table

仅在 table 显示。

包含：

- `Show vertical lines`
- `Wrap content`

### 5. 不应出现的设置项

以下内容不应再出现在 `LayoutPanel`：

- `Show field labels`
- `New card position`

原因：

- 前者产品语义不明确
- 后者属于创建入口行为，不属于 layout setting

## Card 布局定义

### Compact

对应当前 kanban 更接近的默认感受：

- 属性项横向流式排列
- 更小的垂直间距
- 更高密度
- 更适合窄列和快速扫读

### Stacked

对应当前 gallery 更接近的默认感受：

- 属性纵向逐行堆叠
- 每个属性更像独立信息块
- 更适合浏览和阅读

## 推荐默认值

### table

- `wrap = false`
- `showVerticalLines = true`

### gallery

- `gallery.card.wrap = false`
- `gallery.card.size = 'md'`
- `gallery.card.layout = 'stacked'`

### kanban

- `kanban.card.wrap = false`
- `kanban.card.size = 'md'`
- `kanban.card.layout = 'compact'`
- `kanban.cardsPerColumn = 25`
- `kanban.fillColumnColor = true`

关键规则是：

- 默认值只在该视图类型第一次初始化 card 配置时生效
- 一旦用户修改，就按该视图类型分别记忆
- `kanban -> gallery -> kanban` 不应重置 kanban 的 card 配置
- `gallery -> kanban -> gallery` 不应重置 gallery 的 card 配置

## 渐进迁移步骤

推荐按下面顺序推进。

### 第一阶段：收敛字段语义

- `wrapCells` 重命名 / 迁移为 `table.wrap`
- 将 `gallery.cardSize` 迁移到 `gallery.card.size`
- 为 kanban 建立 `kanban.card.*` 结构
- 将 `propertyLayout` 全部改名为 `layout`
- 明确 `showFieldLabels` 标记为删除项
- 明确 `kanban.newRecordPosition` 标记为迁移项

### 第二阶段：贯通 card 渲染能力

让 card 共享渲染链路真正消费：

- `gallery.card.wrap` / `kanban.card.wrap`
- `gallery.card.size` / `kanban.card.size`
- `gallery.card.layout` / `kanban.card.layout`

并向下传给：

- `CardContent`
- `CardFieldSlot`
- `CardField`
- `FieldValueContent`

### 第三阶段：重构 LayoutPanel

把 `LayoutPanel` 重排为：

- `View Type`
- `Card`
- `Kanban`
- `Table`

并删除：

- `showFieldLabels`
- `newRecordPosition`

### 第四阶段：把创建插入策略迁移到 UI 入口

将当前依赖 `kanban.newRecordPosition` 的创建逻辑迁移为：

- footer create -> append
- header create -> prepend

也就是：

- 由 UI 入口传递 `CreatePlacement`
- engine 的 create action 接收 placement 参数
- 不再从 `ViewOptions` 中读取

### 第五阶段：清理旧 contract 和兼容逻辑

- 删除 `showFieldLabels`
- 删除 `newRecordPosition`
- 删除对应 selector / setter / validator / normalize / clone / state helper
- 清理 perf preset 中的历史字段

## 风险与约束

### 1. gallery 的 wrap、size、layout 会影响虚拟高度

gallery 使用测量和虚拟布局，任何会改变卡片高度的设置都要确保能触发稳定重测。

这包括：

- `gallery.card.wrap`
- `gallery.card.size`
- `gallery.card.layout`

### 2. kanban 的 size 不应简单理解为“列宽直接等于三档”

更合理的关系是：

- `size` 提供密度等级和推荐宽度
- kanban 列宽运行时仍可由容器和布局参数微调

也就是说，`size` 是产品 option，`columnWidth` 更像渲染参数。

### 3. 不要把交互策略继续塞进 layout setting

`newRecordPosition` 已经证明，一旦把创建行为策略塞进布局面板，后续就会很难解释：

- 为什么 table 没有这个设置
- 为什么 gallery 没有这个设置
- 为什么同一个 kanban 里 header 和 footer 按钮应该共享一个持久化值

这些问题的根源都是模型层次放错了。

## 最终建议

推荐采用以下路线：

1. 将 `wrap`、`size`、`layout` 定义为 gallery / kanban 共用的 card schema。
2. 让 `gallery.card.*` 和 `kanban.card.*` 各自独立存值，而不是合并成一份全局共享 `card` 状态。
3. 删除 `showFieldLabels`，不做迁移。
4. 将 `newRecordPosition` 从持久化 option 中删除，迁移为 UI 创建入口自带的插入策略。
5. 让 `LayoutPanel` 只承载稳定的展示偏好，不再承载创建行为语义。

## 一句话结论

长期最优设计应该是：gallery 和 kanban 各自维护自己的 `card.wrap`、`card.size`、`card.layout`，但共享同一套 schema 和 presenter；`showFieldLabels` 直接删除；`newRecordPosition` 迁移为 footer / header 等创建入口自己的插入策略，而不是继续留在 kanban 的 view option 里。

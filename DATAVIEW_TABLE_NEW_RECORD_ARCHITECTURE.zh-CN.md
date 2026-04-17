# DATAVIEW Table New Record Architecture

## 1. 背景

dataview 已经具备 record 级创建能力，以及 active view 上下文里的通用创建协议：

```ts
interface ActiveRecordCreateInput {
  sectionKey?: SectionKey
  before?: ItemId
  set?: Partial<Record<FieldId, unknown>>
}
```

当前缺的不是 engine create 协议，而是 table 视图里“new record 入口应该放在哪里，以及前端如何承接”的专门设计。

这个问题不能和 kanban / gallery 直接等同处理。原因很简单：

- table 的 footer 语义已经存在，且用于 summary / calculation
- table 是强线性结构，新增入口位置必须稳定
- grouped table 下，每个 section 都有自己的底部与 footer
- 用户对 table 的预期更接近“在当前表尾继续加一行”，而不是“弹出一个卡片创建动作”

本文档只讨论 table 视图里的 new record 设计与实现方案，不写具体代码。

## 2. 结论

最终结论如下：

- table 的 `new record` 入口放在每个表段的最下面
- 它的位置是“最后一条 record 下方、footer 上方”
- grouped table 中，每个展开 section 各自拥有一个底部 `new record` 入口
- 空 section 里，这个入口出现在 column header 下方、footer 上方
- collapsed section 不显示底部入口；如未来需要支持向 collapsed section 直接创建，应把入口放到 section header 动作区，而不是 footer 区
- 入口常态显示一致，不做弱显
- hover 时只改变背景色或容器态，和 Notion 类似
- 它应是独立的一条创建行，不属于 footer 本身

## 3. 为什么必须放在 footer 上方

### 3.1 符合当前 table 结构

当前 table 虚拟 block 顺序已经很清晰：

- 非 grouped table：`column-header -> rows -> column-footer`
- grouped table：`section-header -> column-header -> rows -> column-footer`

因此从结构上说，新增入口最自然的插入点就是：

- `rows` 之后
- `column-footer` 之前

这样不需要扭曲 footer 的职责，也符合现有 block 顺序。

### 3.2 符合用户心智

用户在 table 里找“新增一条记录”时，最自然的预期位置就是：

- 当前表的最底部
- 当前 group 的最底部

如果把入口放到顶部，虽然也能工作，但它会和“继续往下追加一条记录”的心智冲突；如果放到每行之间，密度太高，噪音过大；如果放进 footer 里，又会把“汇总”和“创建”混成一个区域。

### 3.3 不污染 footer 语义

当前 footer 的职责是 summary / calculation，而不是行为入口。

如果把 `new record` 直接塞进 footer，会有几个长期问题：

- footer 配置变复杂时，新增入口被迫耦合进去
- footer 隐藏、懒加载、按字段渲染时，新增行为也会被一起牵连
- 视觉上会让“统计结果”和“新增动作”混成一块

因此正确做法是：

- footer 继续只负责展示汇总
- `new record` 作为 footer 上方的一条独立 block / row

## 4. 具体放置规则

### 4.1 非 grouped table

只有一个表段时：

- `column header`
- 全部 rows
- `new record row`
- `column footer`

这时 `new record row` 是整个 table 唯一的新增入口。

### 4.2 grouped table

每个展开 section 内部顺序为：

- `section header`
- `column header`
- 该 section 的 rows
- `new record row`
- `column footer`

这意味着每个可见 section 都有自己的底部新增入口，用户会自然理解为“往这个 group 里继续加一条”。

### 4.3 空 section

当某个 section 当前没有 row 时，顺序变成：

- `section header`
- `column header`
- `new record row`
- `column footer`

也就是说，空 group 不应只剩 footer；它仍然要保留一个明确、稳定、可点击的创建入口。

### 4.4 collapsed section

collapsed section 下不显示底部创建行，原因是：

- section 内容本身不可见
- 底部入口放在不可见区域没有意义

如果未来产品要求“折叠组也能直接创建”，建议把入口放在 `section header` 的 hover action 区，而不是改 footer 位置规则。

## 5. 视觉与交互设计

### 5.1 展示原则

这次结论明确修正如下：

- `new record` 不做弱显示
- 非空表、空表、group 内部，入口的默认展示强度一致
- hover 仅改变背景色、边框态或前景强调，不改变默认可见性

也就是说，它不是“只有靠近表底部时才显现”的隐藏控件，而是一条稳定存在的创建行。

### 5.2 行形态

建议它在视觉上接近一条普通 row，但仍保留“这是创建入口”的可识别性：

- 高度与普通 row 接近，避免突然塌缩成小按钮
- 第一列显示 `New record` / `新建记录`
- 整行可点击，不只是一小段文案可点击
- hover 时显示背景色，与 Notion 类似
- 不占用 footer 的视觉语义

不建议做成单独悬浮按钮，也不建议做成 footer 文案链接。

### 5.3 点击后的即时反馈

点击 `new record row` 后，用户预期不是“打开一个对话框”，而是：

1. 当前位置立刻出现一条真实新记录
2. 焦点马上进入主字段编辑
3. 用户直接输入 title

所以 UI 上应避免额外中间态。

## 6. 数据与时序设计

### 6.1 创建入口到 engine 的归一化

table UI 不需要额外发明 table 专属 API。

所有 table 创建动作最终统一调用：

```ts
engine.active.records.create(input?)
```

对 table 底部创建而言，归一化规则是：

- 非 grouped table 底部新增：`{ sectionKey: rootSectionKey }`
- grouped table 某个 section 底部新增：`{ sectionKey: targetSectionKey }`
- 若未来支持某条 row 上方插入：`{ before: targetItemId }`
- 若未来支持某条 row 下方插入：`{ sectionKey, before: nextItemId }`，若无下一条则退化为 section 底部创建

也就是说，table 本身不需要独立的 `addRow` 协议。

### 6.2 group 默认值

当当前 view 存在 group 时：

- 在某个 section 里发起创建，engine 必须自动把该 section 对应的 group value 写进新 record
- 因此新 record 创建后会先留在当前 section

例如：

- 按 `Status` group
- 在 `Todo` section 底部点击 `new record`
- 新 record 初始值自动带 `Status = Todo`

这保证用户创建动作与落点一致。

### 6.3 filter 默认值

当当前 view 存在可自动反推的 filter 时：

- 新 record 创建时也要自动带上满足当前 filter 的默认值

因此在当前 table 视图里创建出来的新记录，默认就应该留在当前结果集中，而不是创建后立刻消失。

### 6.4 title 编辑与重排

table 的正确时序应为：

1. 用户点击当前 section 底部的 `new record row`
2. React 调用 `engine.active.records.create(...)`
3. engine 创建真实 record，并根据当前 section / filter 自动补默认值
4. 视图里先在当前 section 的底部出现这条新记录
5. React 立即把焦点切到主字段 cell，进入 inline editing
6. 用户输入 title 并提交
7. 若 title 或其他字段影响 group / sort，则该 record 再按现有派生逻辑重排到正确位置

这和 Notion 的核心体验一致：

- 先在当前上下文里创建出来
- 先让用户能立即输入 title
- 最后再按真实排序与分组归位

## 7. 为什么不建议做其他位置

### 7.1 不建议默认放顶部

顶部创建虽然实现上不难，但对 table 来说不符合主流心智。

用户浏览 table 时，新增下一条最自然的动作是继续向下追加，而不是回到顶部插入。

顶部插入更适合作为未来的附加操作，不应成为默认主入口。

### 7.2 不建议每行之间都放入口

每行之间都放 `+` 入口的问题很明显：

- 噪音太高
- pointer target 过密
- 会削弱 table 的阅读性

更合适的做法是：

- 默认只保留 section 底部主入口
- 如未来确实需要上方 / 下方插入，再通过 hover row action 触发

### 7.3 不建议做到 footer 内部

原因前面已经说明，核心就是职责污染与长期扩展性差。

footer 是 footer，create row 是 create row，这两个层级不要混。

## 8. 前端实现建议

本节描述实现方向，但当前阶段不落 React 代码。

### 8.1 block 建模

table 前端后续应把 `new record row` 建模成独立 block，而不是给 `column-footer` 加特殊渲染分支。

推荐新增一类 block：

```ts
type TableBlock =
  | TableColumnHeaderBlock
  | TableCreateRecordBlock
  | TableColumnFooterBlock
  | TableSectionHeaderBlock
  | TableRowBlock
```

这样有几个好处：

- 虚拟化测量独立
- 渲染职责独立
- footer 逻辑不需要感知 create 行
- 以后 table / group / empty section 的行为更容易扩展

### 8.2 block 排序

未来 layout model 的 block 顺序应改成：

- flat：`column-header -> rows -> create-record -> column-footer`
- grouped：`section-header -> column-header -> rows -> create-record -> column-footer`

空 section 同理：

- `section-header -> column-header -> create-record -> column-footer`

### 8.3 组件职责

未来 React 层建议拆成一个明确的创建行组件，例如：

- `TableCreateRecordRow`

它只负责：

- 展示创建入口
- 响应点击
- 调用 `engine.active.records.create`
- 把焦点切到新 record 的 title cell

它不负责：

- 推导复杂默认值
- 直接操作 document create
- 自己维护一套假 record truth

这些都不应该放到组件里。

### 8.4 当前阶段边界

当前实施阶段先明确边界：

- 先不做 React 侧 table add-record 组件
- 先不做 table 里的具体新增 UI
- 先把设计与实现路径定清楚

这样后续真正进入 UI 实现时，就不需要再反复讨论入口位置与协议层级。

## 9. 最终建议

table 的 `new record` 主入口应固定在每个表段的底部，也就是：

- rows 之后
- footer 之前

并且应满足以下约束：

- 它是一条独立创建行，不是 footer 的一部分
- 它默认可见，不做弱显
- hover 只改变背景态
- grouped table 下每个展开 section 各有一个
- 空 section 也要显示
- collapsed section 不显示底部入口，未来如需支持则转到 section header action
- 点击后立即创建真实 record，并进入 title inline editing
- 真正的数据创建仍统一走 `engine.active.records.create`

这套方案最简单、最稳定，也最符合 table 的结构和用户心智。

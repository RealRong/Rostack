# Dataview Kanban 显示更多方案

## 目标

Kanban 列内卡片过多时，当前实现会直接把该列所有卡片一次性渲染出来。这个方案的目标是：

- 在不改动 projection/index 架构的前提下，减少 Kanban 首屏和大列的 React/DOM 渲染量
- 在 `kanban options` 中增加一个可持久化的“每列初始渲染上限”配置
- 在列底部提供“显示更多”交互，让用户按需展开更多卡片

这个方案明确是一个渲染层限流方案，不是数据层分页，也不是完整虚拟化。

## 明确不做的事情

本方案明确排除以下方向：

- 不做 Kanban 虚拟化
- 不做未渲染卡片仍然具备“像全部渲染一样精确”的拖拽命中
- 不做未渲染卡片仍然具备“像全部渲染一样精确”的框选命中
- 不修改现有 projection、index、query 的数据规模
- 不引入跨列或全局分页

换句话说，这次只解决“别一次把一列里所有卡片都挂到 DOM 上”，不解决“未渲染卡片如何被完整交互模拟”。

## 当前实现观察

### 1. Kanban 现在是按列全量渲染

[`dataview/src/react/views/kanban/components/ColumnBody.tsx`](/Users/realrong/Rostack/dataview/src/react/views/kanban/components/ColumnBody.tsx) 直接对 `props.section.ids` 做全量 `map` 渲染，没有分页、裁剪或虚拟窗口。

这意味着：

- 某一列有 300 张卡片时，会一次渲染 300 个 `Card`
- 每张卡片都会挂载 hover、selection、drag、editing 等逻辑
- 大列会直接放大 React commit 和 DOM 数量

### 2. Kanban 当前没有 Gallery/Table 那样的虚拟层

Gallery 已经通过 `useGalleryBlocks` 做了虚拟块渲染，相关实现位于：

- [`dataview/src/react/views/gallery/useGalleryController.ts`](/Users/realrong/Rostack/dataview/src/react/views/gallery/useGalleryController.ts)
- [`dataview/src/react/views/gallery/components/Grid.tsx`](/Users/realrong/Rostack/dataview/src/react/views/gallery/components/Grid.tsx)

Kanban 目前没有对应的 virtual runtime，也没有现成的列内虚拟布局缓存。

### 3. Kanban options 的扩展点是现成的

当前 `KanbanOptions` 只包含：

- `newRecordPosition`
- `fillColumnColor`

相关位置：

- [`dataview/src/core/contracts/kanban.ts`](/Users/realrong/Rostack/dataview/src/core/contracts/kanban.ts)
- [`dataview/src/core/view/kanban.ts`](/Users/realrong/Rostack/dataview/src/core/view/kanban.ts)
- [`dataview/src/core/view/options.ts`](/Users/realrong/Rostack/dataview/src/core/view/options.ts)
- [`dataview/src/core/view/shared.ts`](/Users/realrong/Rostack/dataview/src/core/view/shared.ts)

说明这个能力可以作为一个标准 view option 加进去，而不是只做临时 UI 状态。

### 4. 设置面板入口已经存在

[`dataview/src/react/page/features/viewSettings/panels/LayoutPanel.tsx`](/Users/realrong/Rostack/dataview/src/react/page/features/viewSettings/panels/LayoutPanel.tsx) 已经承载 Kanban layout 设置，所以“每列初始渲染上限”可以自然放到这里。

## 方案定义

### 配置语义

在 `kanban options` 中新增一个配置项，语义定义为：

- “每列初始渲染上限”

推荐候选值：

- `25`
- `50`
- `100`
- `all`

建议默认值：

- `all`

原因：

- 这是最稳妥的默认行为，不会改变现有 view 的展示结果
- 先把能力做出来，再按真实性能数据决定是否要把默认值改小

### 为什么是“每列”而不是“全局”

不建议做“整个看板同时只渲染 25/50/100 张卡片”的全局上限，原因如下：

- Kanban 的渲染、拖拽、命中、列头计数本来就是按列组织
- 用户对 Kanban 的理解天然是“某一列太长”，不是“整个 board 总共只能显示多少张”
- 每列单独控制更符合“显示更多”的交互预期
- 全局上限会引入跨列分配规则，复杂度和用户理解成本都更高

因此这里的 `25/50/100` 应该解释为：

- 每一列初始最多渲染 25/50/100 张

## 交互设计

### 1. 初始渲染

每列根据 option 计算一个初始可见数：

- `all`：渲染全部
- `25/50/100`：渲染 `min(limit, section.ids.length)`

### 2. 列底部显示更多

如果某列总数大于当前已渲染数，则在列底部显示一个展开入口。

建议文案：

- `Show 25 more`
- 或者中文环境下 `显示更多`

建议同时显示当前进度：

- `已显示 25 / 87`

### 3. 展开策略

建议使用“按页递增”而不是“一次全开”：

- 初始 limit = 25
- 第一次点击后显示 50
- 第二次点击后显示 75
- 直到全部展开

原因：

- 这样才能持续控制单次渲染增量
- 用户可以在很长的列里渐进浏览，而不是一键把性能问题重新拉满

如果后续产品更偏向简单，也可以把按钮设计成：

- `显示全部`

但从性能目标看，递增展开更合理。

## 与现有交互的关系

### 1. 列头计数保持总数

[`dataview/src/react/views/kanban/components/ColumnHeader.tsx`](/Users/realrong/Rostack/dataview/src/react/views/kanban/components/ColumnHeader.tsx) 当前显示的是 `props.section.ids.length`。

这个语义应该保持不变：

- 列头显示该列总卡片数
- 不显示“当前只渲染了多少”的替代计数

这样用户不会误以为列里真的只有 25 张。

### 2. 新建卡片行为

当前 Kanban 已经支持 `newRecordPosition` 为 `start` 或 `end`，相关逻辑在：

- [`dataview/src/engine/services/view.ts`](/Users/realrong/Rostack/dataview/src/engine/services/view.ts)

这里要明确一个产品语义：

- 如果列处于截断状态，并且新卡被插入到当前可见区之外，用户可能看不到它

建议约束如下：

- 若新卡插入位置落入当前未渲染尾部，则自动扩展该列的当前可见数，至少让新卡进入可见区

这不是“精确模拟未渲染区交互”，只是为了避免“刚创建的卡片直接消失在隐藏区”。

### 3. 拖拽行为

当前 Kanban 拖拽命中依赖已渲染 DOM 计算 layout：

- [`dataview/src/react/views/kanban/drag/layout.ts`](/Users/realrong/Rostack/dataview/src/react/views/kanban/drag/layout.ts)

因此本方案下必须明确接受以下事实：

- 未渲染卡片不参与精确插入命中
- 拖到一列底部时，命中的是“当前可见尾部”之后的位置
- 不提供“把卡插到隐藏部分第 73 张前面”这类能力

这是本方案有意识接受的边界，不应在实现阶段偷偷扩大范围。

### 4. 框选行为

当前 selection target 由已挂载卡片节点注册：

- [`dataview/src/react/views/kanban/components/Card.tsx`](/Users/realrong/Rostack/dataview/src/react/views/kanban/components/Card.tsx)
- [`dataview/src/react/views/kanban/useKanbanController.ts`](/Users/realrong/Rostack/dataview/src/react/views/kanban/useKanbanController.ts)

因此本方案下应明确接受：

- 框选只命中当前已渲染卡片
- 未渲染卡片不参与框选

这也是本方案的明确边界，不做额外模拟。

## 推荐实现方式

### 1. option 持久化

把“每列初始渲染上限”做成 view option，而不是只放在 React 本地状态。

原因：

- 它是 view layout 偏好，不是一次性临时交互
- 不同 view 可以有不同 limit
- 刷新后应保留

需要覆盖的位置包括：

- `KanbanOptions` 类型
- `normalizeKanbanOptions`
- `cloneKanbanOptions`
- `createDefaultViewOptions`
- `cloneViewOptions`
- view command 校验
- `ViewKanbanApi`
- command type 与 reducer

### 2. 当前展开状态使用本地 UI state

虽然初始 limit 应该持久化，但“某列这次已经点过几次显示更多”不建议持久化到文档。

建议做法：

- option 只保存“初始 limit”
- React 层额外维护 `expandedCountBySectionKey`
- 进入页面时每列从 option limit 起步
- 用户点“显示更多”只改本地展开状态

原因：

- 这属于会话态，不属于文档结构
- 否则会把一次性浏览行为写进数据模型

### 3. 渲染层裁剪而不是 projection 裁剪

应保留完整的：

- `currentView.appearances`
- `section.ids`

只在 `ColumnBody` 渲染时取前缀子集用于展示。

原因：

- 风险最小
- 不影响已有 projection/index 语义
- 不会波及更多 engine 层逻辑

## UI 放置建议

放在 `kanban options` 区块内，与 `fillColumnColor` 并列。

建议结构：

- `Fill column color`
- `Cards per column`

选项可做成：

- segmented control
- select
- menu row

如果沿用当前 `LayoutPanel` 的简洁风格，推荐做成一个单独的 option row，值为：

- `25`
- `50`
- `100`
- `All`

## 为什么现在不做虚拟化

当前不做 Kanban 虚拟化，原因不是“虚拟化没价值”，而是这次目标更小、更稳：

- Kanban 还没有像 Gallery/Table 那样现成的 virtual layout 体系
- 列内虚拟化会显著提高拖拽、命中、测量、占位高度、自动滚动的复杂度
- 本次用户诉求已经明确是“显示更多避免过多卡片被渲染”，这个目标不需要虚拟化也能满足

所以这次选择：

- 先做低风险的渲染上限
- 不扩大到完整虚拟列表

## 风险评估

### 收益

- 能直接降低大列首屏渲染数量
- 能显著减少超长列的 DOM 规模
- 变更主要集中在 Kanban view/UI/options，边界清晰

### 局限

- 不能减少 projection/index/query 的计算成本
- 未渲染卡片不参与精确拖拽命中
- 未渲染卡片不参与框选
- 如果列很长且用户不断点展开，最终仍然可能回到大 DOM 状态

### 可接受前提

只要产品目标是：

- “降低 Kanban 初始渲染压力”

而不是：

- “无论是否渲染都维持完整交互精度”

那么这个方案是成立的。

## 建议落地范围

第一阶段建议只做：

- `kanban options` 增加每列初始渲染上限
- `ColumnBody` 按当前可见数裁剪渲染
- 列底部 `显示更多`
- 新建卡片落到隐藏区时自动展开到可见

第一阶段明确不做：

- 虚拟化
- 合成未渲染卡片的位置缓存
- 未渲染卡片的精确拖拽/框选
- 跨会话持久化“这列已经展开到第几页”

## 最终结论

Dataview Kanban 可以加“显示更多”来避免一次渲染过多卡片，而且适合放进 `kanban options`。

推荐方案是：

- 新增“每列初始渲染上限”配置，候选值为 `25/50/100/all`
- 默认值先用 `all`
- 每列初始仅渲染前 N 张
- 列底部通过“显示更多”递增展开

这个方案明确：

- 不做虚拟化
- 不做未渲染卡片的精确拖拽/框选模拟

它解决的是“减少 Kanban 大列的初始渲染量”，而不是“把未渲染内容也伪装成完整可交互内容”。

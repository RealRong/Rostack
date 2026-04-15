# DATAVIEW Table 内容换行布局方案

## 结论

table 的“内容换行显示”不应该继续作为零散 UI 行为存在，而应该升级成正式的 table layout mode。

本方案的最终结论如下：

- 普通 row baseline 维持 `36px`
- `wrap` 做成正式的 `view.options.table` 配置
- `LayoutPanel` 和 column header menu 只作为同一状态的两个入口
- cell 的几何结构在 wrap / no-wrap 下尽量统一
- wrap 与 no-wrap 的核心差异，应该主要落在“内容排布规则”上，而不是整套 cell 结构分叉
- 文本类 cell 和 option/tag 类 cell 都使用同一套外层 cell surface，但内容层策略不同

这次不建议用补丁方式分别修：

- baseline 高度
- header menu 里的 disabled toggle
- cell 上下 padding
- 内容垂直居中
- multiSelect 换行

这些问题本质上都属于同一个模型：**table cell layout mode**。

## 当前问题

目前 table 在内容换行这件事上有几个结构性问题：

### 1. wrap 还不是正式配置

现在 wrap 在 column header menu 里只是一个 disabled 的占位项：

- [ColumnHeader.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/column/ColumnHeader.tsx)

而 view settings 里也还没有对应的 table 全局配置：

- [LayoutPanel.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/features/viewSettings/panels/LayoutPanel.tsx)

这意味着 wrap 还没有形成“配置真相”。

### 2. cell 当前依赖 flex 垂直对齐

当前 body cell 内层核心结构在：

- [Cell.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/cell/Cell.tsx)

问题在于它现在仍然依赖：

- `h-full`
- `items-center`
- 只有横向 padding

这会带来两个问题：

- 当某一行被内容撑高时，其他 cell 的内容会在整块高度里垂直居中
- 没有明确的垂直 padding，内容视觉上会贴边

### 3. 文本换行和 option 换行现在还不是同一种建模

纯文本类字段和多选标签类字段，虽然都属于“wrap”，但内容自身的排布方式并不相同。

如果把它们都简单理解为“white-space normal 就行”，后面会继续出现视觉不一致。

## Notion 参考结论

这次有四份参考 HTML：

- [notion-no-wrap-cell.html](/Users/realrong/Rostack/notion-no-wrap-cell.html)
- [notion-wrap-cell.html](/Users/realrong/Rostack/notion-wrap-cell.html)
- [notion-no-wrap-option-cell.html](/Users/realrong/Rostack/notion-no-wrap-option-cell.html)
- [notion-wrap-option-cell.html](/Users/realrong/Rostack/notion-wrap-option-cell.html)

从这四份结构里，可以得出几个非常稳定的结论。

## Notion 借鉴点

### 1. 外层 value surface 基本一致

无论是：

- 文本 no-wrap
- 文本 wrap
- option no-wrap
- option wrap

Notion 的外层 property-value 都保持了几乎同一套结构：

- `display: block`
- `width: 100%`
- `overflow: clip`
- `min-height: 36px`
- `padding-inline: 8px`
- 明确的 `padding-top / padding-bottom`

也就是说，Notion 并不是为 wrap / no-wrap 准备两套完全不同的 cell shell。

最重要的借鉴是：

- **外层 surface 统一**
- **内容排布可变**

### 2. 文本类字段：变化主要发生在文本白空格策略

文本 cell 在 wrap / no-wrap 之间的主要差异是：

- no-wrap:
  - 外层 `white-space: nowrap`
  - 文本 `white-space: nowrap`
  - `word-break: normal`
- wrap:
  - 外层 `white-space: normal`
  - 文本 `white-space: pre-wrap`
  - `word-break: break-word`

也就是说，对纯文本类字段来说，wrap 的核心就是：

- 允许文本自然换行
- 允许长词断开

### 3. option / tag 类字段：变化主要发生在 tag list 的 `flex-wrap`

多选 cell 明显和纯文本不同。

Notion 在 option cell 里：

- no-wrap:
  - tag list 是 `display: flex`
  - `flex-wrap: nowrap`
- wrap:
  - tag list 是 `display: flex`
  - `flex-wrap: wrap`

而单个 tag 本身并没有改成多行文本块，仍然是：

- 固定单行
- `white-space: nowrap`
- `overflow: hidden`
- `text-overflow: ellipsis`

这说明 Notion 的 option wrap 策略不是：

- “让每个 tag 自己换行”

而是：

- “让 tag list 换到下一行”

这个差异非常重要。

### 4. Notion 没有依赖 `items-center` 做内容垂直居中

从结构上看，Notion 的视觉稳定感主要来自：

- 统一的 `min-height`
- 明确的 vertical padding
- 内容从顶部开始排版

不是靠 `h-full + items-center` 做垂直居中。

这点和当前 table 最大的不同在于：

- 现在我们的 cell 一旦变高，内容容易被整体居中
- Notion 的内容更像是“顶部对齐，底部自然留白”

## 最优建模

### 一、wrap 必须是正式的 table view option

建议把 table option 扩展为：

- `showVerticalLines`
- `wrapCells`

也就是在当前 table options 基础上，新增一个正式布尔值。

涉及的长期落点包括：

- [viewOptions.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/contracts/viewOptions.ts)
- [view/options.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/view/options.ts)
- [view/state.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/view/state.ts)
- [active/commands/table.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/commands/table.ts)
- [public.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/public.ts)

这样 table 的 layout 配置会很清晰：

- 是否显示竖线
- 是否允许内容换行

### 二、两个 UI 入口，共用一个底层状态

建议：

- `LayoutPanel` 提供全局 wrap 开关
- `ColumnHeader` menu 保留“内容换行显示”作为快捷入口

但这两个入口都只读写同一个状态：

- `view.options.table.wrapCells`

不要做成：

- 一个是 panel 状态
- 一个是 header 局部状态
- renderer 再自己判断一次

### 三、建立统一的 cell surface

建议把 table cell 拆成两层明确职责：

#### 1. Cell root

职责：

- 承载整格高度
- 边框
- hover / selection / fill handle chrome
- 与 row 等高

#### 2. Value surface

职责：

- `min-height: 36px`
- `padding-inline: 8px`
- 明确 `padding-block`
- 内容布局模式

也就是说：

- root 负责表格语义
- surface 负责内容排版

长期最优不应该让 cell 内容直接绑在：

- `h-full items-center px-2`

这种单层结构上。

## wrap / no-wrap 的最佳差异化方式

### 1. 外层 surface 尽量一致

无论 wrap 是否开启，都建议保留：

- `min-height: 36px`
- `padding-inline: 8px`
- 明确的 block padding
- 从顶部开始的内容流

不要让 no-wrap 和 wrap 在外层几何上完全分叉。

### 2. 文本类字段的差异放在文本规则

适用字段：

- `title`
- `text`
- `url`
- `email`
- `phone`
- `number`
- `date`

建议：

- no-wrap:
  - 单行截断
  - 不换行
- wrap:
  - `white-space: pre-wrap / normal`
  - `overflow-wrap: anywhere / break-word`

本质是文本流的切换。

### 3. option 类字段的差异放在 list 容器

适用字段：

- `select`
- `status`
- `multiSelect`

建议区分：

#### `select / status`

单标签字段本质上无需复杂 wrap 模型。

更合理的是：

- no-wrap:
  - tag 单行显示
- wrap:
  - 整格仍然顶部排版
  - tag 自己仍保持单行
  - 不要求 tag 内文字多行展开

也就是说，这两类字段的 wrap 变化很有限。

#### `multiSelect`

这类字段真正需要的是 tag list 换行。

更合理的做法是：

- no-wrap:
  - list `flex-wrap: nowrap`
  - 继续保留当前单行概览策略
- wrap:
  - list `flex-wrap: wrap`
  - tag 本身仍保持单行 pill
  - 一行放不下就换到下一行

这和 Notion 的行为是一致的。

不要把 multiSelect 的 wrap 理解成：

- 每个 tag 文案变成多行段落

那样视觉会明显变差。

## 关于垂直对齐

这次最重要的结论之一是：

- table 内容不应该继续依赖 `items-center` 作为常规布局手段

尤其在动态行高已经成立的前提下，这会导致：

- 某个 cell 很高时，其他 cell 内容被一起居中

长期最优应该是：

- 内容从顶部开始排
- 空余高度自然留在下方

这比“整格高度里垂直居中”更适合表格阅读。

所以建议：

- body cell 内容默认按顶部布局
- wrap 模式下明确顶部布局
- header / footer 也保持相同方向

这样整张表在高行场景下会更稳定。

## 关于 padding

参考 Notion，当前最稳的基线是：

- baseline height: `36px`
- inline padding: `8px`
- vertical padding: 显式存在

由于当前你已经明确不改 `36px`，那么最自然的做法就是：

- 直接沿用 `36px` 作为 cell surface 的 `min-height`
- `padding-inline` 采用 `8px`
- `padding-block` 也采用接近 Notion 的紧凑区间

重点不是像素必须完全照抄，而是：

- 不要没有 vertical padding
- 不要把垂直留白寄托给 flex 居中

## 对当前实现的具体建议

### 1. 把 wrap 从 disabled menu item 升级成正式配置

现在：

- [ColumnHeader.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/column/ColumnHeader.tsx)

里的：

- `key: 'wrap'`
- `checked: false`
- `disabled: true`

不应继续停留在占位状态。

### 2. 在 LayoutPanel 里增加全局 wrap 开关

当前：

- [LayoutPanel.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/features/viewSettings/panels/LayoutPanel.tsx)

里 table 只有：

- `showVerticalLines`

建议新增：

- `wrapCells`

### 3. 把 cell content wrapper 从“居中盒子”改成“surface + content flow”

当前：

- [Cell.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/cell/Cell.tsx)

的核心结构更像是：

- 一个 `h-full items-center` 的内容盒子

建议重构成：

- root
- surface
- content flow

这样 wrap / no-wrap 的切换点会更自然。

### 4. header 也要同步吃同一个 wrap mode

如果 body 开始支持 wrap，而 header 仍然保留完全不同的垂直对齐逻辑，后续还会继续出现：

- 标题过高时对齐不稳
- resize handle 与文字块关系不自然

所以 header 的内部 trigger 结构也应该被统一到同一个 table layout mode 上。

### 5. footer 保持同样的 surface 原则

footer 已经是动态高度候选之一。

既然 footer 未来会有长汇总内容，那么它也应该遵守：

- 同样的 surface 几何规则
- 顶部起排版
- 明确 padding

## 最终推荐方案

最终建议如下：

1. 保持普通 row baseline 为 `36px`
2. 为 table 正式新增 `view.options.table.wrapCells`
3. `LayoutPanel` 和 `ColumnHeader` menu 共用这个状态
4. 把 cell 渲染重构成 `root + value surface + content flow`
5. wrap / no-wrap 共用同一套外层 surface
6. 文本类字段通过 `white-space / word-break` 切换 wrap
7. multiSelect 通过 list 容器 `flex-wrap` 切换 wrap
8. 单个 option/tag 本身继续保持单行 pill，不做 tag 内多行
9. 内容整体改为顶部起排版，不再依赖 `items-center`
10. header / body / footer 统一遵守同一套 table layout mode

## 为什么这是长期最优

因为这套方案同时解决了以下问题：

- wrap 不是正式配置
- UI 有两个入口但没有统一真相
- 文本类字段和 option 类字段行为不同
- cell 没有垂直 padding
- 高行场景下内容被垂直居中
- 动态高度已经有了，但内容布局模型还不统一

换句话说，这不是“修一个换行开关”的方案，而是：

- **建立 table cell layout mode**

一旦这层建好，后面继续演进：

- 图片 cell
- 更复杂的 footer 汇总
- 多行 header
- 更精细的 density

都会更顺。

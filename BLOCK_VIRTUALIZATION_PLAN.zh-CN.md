# dataview Block Virtualization 长期方案

## 结论

`gallery` 和 `table` 后续都不应该继续各自沿着“view 内部再补一层局部虚拟化”的方向演进。

长期最优方案应该统一成一套 page 内可复用的 `block virtualization` 架构：

1. 先把当前 view 展开成一条稳定的 `blocks` 序列
2. 每个 block 都有确定的 `top / height`
3. 只做一次 viewport 裁剪
4. 所有交互几何模型都从同一份布局缓存读取

这样可以同时解决：

- `gallery` 多 section、多 row、row 高度不固定
- `table` 多 section、大量 row
- marquee / drag / drop indicator / keyboard navigation 依赖真实 DOM 的问题

核心判断是：

- `gallery` 的正确虚拟单位不是 card，而是 row
- `gallery` 的 size 应视为 `minCardWidth preset`，实际卡宽由 layout 显式解算
- `table` 的正确虚拟单位不是 section，而是统一的 content block
- 两者上层不需要两套虚拟化内核，只需要不同的 block builder

在当前产品约束下，`gallery` 还可以进一步简化：

- `small / medium / large` 就是最小卡片宽度 preset
- 推荐直接收敛成：
  - `sm = 220`
  - `md = 260`
  - `lg = 300`
- gap 固定，例如 `16`

这意味着 `gallery` 不需要做“任意响应式网格虚拟化”，只需要做：

- `minCardWidth + resolvedCardWidth`
- 显式 row layout
- row virtualization
- 基于 layout cache 的 marquee / reorder

## 为什么不推荐“双层虚拟化”

这里说的双层虚拟化，是指：

- 外层 section 虚拟化
- section 内部再做 row 虚拟化

这套方案不是不能做，而是不适合作为长期结构。

主要问题有四个。

### 1. 外层高度依赖内层测量

只要 section 内部还有大量 row，而且 row 高度会变化，外层 section 的总高度就不是一个静态值。

这会导致：

- 外层虚拟化需要依赖内层测量结果
- 内层测量完成后又要反向推动外层重排
- 滚动过程中更容易出现跳动、回流和 viewport 抖动

### 2. 坐标系会分裂

双层虚拟化天然会出现两层坐标系统：

- section 相对 page canvas 的坐标
- row 相对 section body 的坐标

一旦 marquee、drag、drop indicator、keyboard selection 需要跨 section，代码就会开始同时处理：

- section offset
- section 内 local offset
- page 全局 offset

这会明显提高心智复杂度。

### 3. `gallery` 和 `table` 会各自长出一套相似系统

如果 `table` 做：

- `useVirtualSections`
- `useVirtualRows`

同时 `gallery` 做：

- `useVirtualSections`
- `useVirtualGalleryRows`

那么最后会出现两套复杂、相似、却又不完全相同的分层虚拟化系统。

长期维护成本会很高。

### 4. 交互层无法彻底脱离真实 DOM

如果外层和内层分别管理各自的虚拟窗口，很多逻辑会倾向继续：

- 在当前 section 内读 DOM
- 在当前 row 容器内定位
- 在局部层里做 hit test

这会让 marquee / reorder 很难收敛到纯布局缓存驱动。

## 长期最优的统一思路

推荐把整个 view 展开成一条扁平的 block 序列。

block 是一个“在滚动轴上占据一段高度的内容单元”。

它可以是：

- `section-header`
- `gallery-row`
- `gallery-empty`
- `table-row`
- `table-section-empty`
- 以后也可以是 `group-summary`、`footer`、`load-more`

统一后的结构是：

```ts
interface VirtualBlock {
  key: string
  kind: string
  top: number
  height: number
}
```

再在不同 view 上扩展各自的数据载荷：

```ts
type DataViewBlock =
  | GallerySectionHeaderBlock
  | GalleryRowBlock
  | GalleryEmptyBlock
  | TableSectionHeaderBlock
  | TableRowBlock
  | TableSectionEmptyBlock
```

这样以后虚拟化流程统一为：

1. builder 生成全量 blocks
2. virtualizer 根据 viewport 只截取可见 blocks
3. renderer 渲染可见 blocks
4. 交互层从同一份 block/layout cache 读取几何信息

## 统一抽象：Block、Layout、Virtualizer

长期建议拆成三层。

### 1. Block Builder

负责把 view model 展开成 block 列表。

输入：

- `currentView`
- 布局参数
- 测量缓存

输出：

- `blocks`
- `totalHeight`
- 面向交互层的几何缓存

### 2. Virtualizer

负责根据：

- viewport
- overscan
- `blocks`

计算当前需要渲染哪些 blocks。

这一层不关心 block 是 table row 还是 gallery row。

### 3. Block Renderer

负责把 block 渲染成真实 React 节点。

例如：

- `gallery-row` -> 一整行卡片
- `table-row` -> 一整行表格
- `section-header` -> 分组头

## 推荐的数据结构

## 1. 通用 Block

```ts
export interface BaseVirtualBlock {
  key: string
  kind: string
  top: number
  height: number
}
```

## 2. Gallery Blocks

```ts
export interface GallerySectionHeaderBlock extends BaseVirtualBlock {
  kind: 'gallery-section-header'
  sectionKey: string
}

export interface GalleryRowBlock extends BaseVirtualBlock {
  kind: 'gallery-row'
  sectionKey: string
  rowIndex: number
  ids: readonly AppearanceId[]
}

export interface GallerySectionEmptyBlock extends BaseVirtualBlock {
  kind: 'gallery-section-empty'
  sectionKey: string
}
```

## 3. Table Blocks

```ts
export interface TableSectionHeaderBlock extends BaseVirtualBlock {
  kind: 'table-section-header'
  sectionKey: string
}

export interface TableRowBlock extends BaseVirtualBlock {
  kind: 'table-row'
  sectionKey: string
  rowId: AppearanceId
  rowIndex: number
}

export interface TableSectionEmptyBlock extends BaseVirtualBlock {
  kind: 'table-section-empty'
  sectionKey: string
}
```

## 4. 面向交互层的布局缓存

### gallery

`gallery` 不能只缓存 blocks，还必须缓存 card rect。

推荐结构：

```ts
export interface GalleryCardLayout {
  id: AppearanceId
  sectionKey: string
  rowIndex: number
  columnIndex: number
  rect: Rect
}

export interface GalleryRowLayout {
  sectionKey: string
  rowIndex: number
  top: number
  height: number
  ids: readonly AppearanceId[]
}

export interface GalleryLayoutCache {
  rows: readonly GalleryRowLayout[]
  cards: readonly GalleryCardLayout[]
  totalHeight: number
}
```

### table

`table` 行高当前更稳定，但长期也建议统一缓存：

```ts
export interface TableRowLayout {
  id: AppearanceId
  sectionKey: string
  top: number
  height: number
}

export interface TableLayoutCache {
  blocks: readonly TableBlock[]
  rows: readonly TableRowLayout[]
  totalHeight: number
}
```

## Gallery 的长期最优方案

## 1. 虚拟单位是 row，不是 card

`gallery` 当前是等宽网格，不是 masonry。

它的布局规则决定了：

- 列宽固定
- card 高度不固定
- 同一行的卡共用同一个 `top`
- 下一行的 `top` 由上一行最高 card 决定

所以正确单位必须是 row。

如果按 card 做一维虚拟化，会把布局语义错误地推向 waterfall/masonry。

## 2. size 是 min width preset，layout 负责解算实际 card 宽度

`gallery` 的 size 仍然保持离散 preset，但语义应该是：

- `sm -> minCardWidth = 220`
- `md -> minCardWidth = 260`
- `lg -> minCardWidth = 300`

实际布局效果应等价于：

- `repeat(auto-fill, minmax(220px, 1fr))`
- `repeat(auto-fill, minmax(260px, 1fr))`
- `repeat(auto-fill, minmax(300px, 1fr))`

但实现上不应该把整套几何真相重新交给浏览器，而应该继续由 layout builder 显式产出：

- `columnCount`
- `resolvedCardWidth`
- row `top / height`
- card rects

原因：

1. 更接近真实产品语义  
   用户配置的是“小 / 中 / 大”三个最小宽度档位，而不是一个固定像素宽度。

2. 交互主干不被打断  
   marquee / reorder / hit test 仍然统一读取 layout cache，而不是去猜 CSS grid 的排版结果。

3. 虚拟布局仍然可数学求解  
   布局层只需要知道：
   - `containerWidth`
   - `minCardWidth`
   - `gap`
   - `ids`
   - `heightById`

推荐常量：

```ts
const GALLERY_CARD_MIN_WIDTH = {
  sm: 220,
  md: 260,
  lg: 300
} as const

const GALLERY_CARD_GAP = 16
```

布局层推荐先解算：

```ts
columnCount = Math.max(
  1,
  Math.floor((contentWidth + gap) / (minCardWidth + gap))
)

resolvedCardWidth = (
  contentWidth - gap * (columnCount - 1)
) / columnCount
```

因此 gallery 的正确实现应明确调整为：

- controller / layout 输出 `resolvedCardWidth`
- row 仍然是虚拟单位
- row 内部可以使用 `grid-template-columns: repeat(columnCount, minmax(0, 1fr))`
- 行和卡片 rect 全部由 layout builder 直接产出

## 3. 先算 columnCount，再切 rows

`gallery` 布局应该显式计算，而不是继续依赖 CSS grid 结果再从 DOM 反推。

输入：

- `containerWidth`
- `minCardWidth`
- `gap`
- `ids`
- `heightById`

计算顺序：

1. 算出 `columnCount`
2. 按顺序把 `ids` 切成 rows
3. 对每一行求 `rowHeight = max(cardHeight)`
4. 累加得到每一行的 `top`
5. 推导每张 card 的 rect

这样即使某张 card 当前没挂在 DOM 里，也依然有稳定 rect。

推荐列数计算：

```ts
columnCount = max(1, floor((contentWidth + gap) / (minCardWidth + gap)))
```

推荐实际卡宽：

```ts
resolvedCardWidth = (
  contentWidth - gap * (columnCount - 1)
) / columnCount
```

推荐卡片水平定位：

```ts
left = columnIndex * (resolvedCardWidth + gap)
```

推荐 row 高度：

```ts
rowHeight = max(heightById[id] ?? estimatedHeight)
```

推荐 row `top`：

```ts
rowTop = prefixSum(previousRowHeights + gap)
```

## 4. 高度测量策略

`gallery` 应该沿用 `kanban` 目前的思路：

- 初始使用 `estimatedHeight`
- 可见 card 通过 `ResizeObserver` 测量
- 测量结果写入 `heightById`
- 一旦高度变化，重新计算 row layout

额外规则：

- 正常 viewport resize 会改变 `resolvedCardWidth`
- 因此高度缓存不应再只是 `id -> height`
- 正确模型应升级成“按实际 card 宽度分桶”的缓存

也就是：

```ts
Map<measuredCardWidth, Map<appearanceId, height>>
```

这样即使 viewport 变化，旧宽度下的测量也不会污染新宽度的布局。

## 5. 分组场景

有 section 时，不应该做“section 内单独虚拟器 + 外层再一个虚拟器”的嵌套结构。

正确方式是：

1. 先生成 section header block
2. 再生成该 section 的 row blocks
3. 所有 blocks 按顺序拼成一条扁平序列

collapsed section 时：

- 只生成 header block
- 不生成 row blocks

空 section 时：

- 生成 header block
- 再生成一个 empty block

## 6. marquee 和 reorder

当前 `gallery` 有两个很好的基础：

- marquee 已经基于 rect 命中
- reorder 已经基于 layout hit test

所以虚拟化后不应该再依赖真实 DOM。

长期应改成：

- marquee 读取 `GalleryLayoutCache.cards`
- reorder 读取 `GalleryLayoutCache.rows + cards`

并且：

- `hitTest` 不再通过 `rect.top` 聚类猜测 row
- row 信息直接来自显式 `rows`

这意味着 `marquee` 后续可以非常自然地接到同一条线上，不需要独立再发明一套虚拟化兼容方案。

当前 [useMarqueeSelection.ts](/Users/realrong/Rostack/dataview/src/react/views/gallery/selection/useMarqueeSelection.ts) 本质上已经只依赖：

- `cardOrder`
- `layout.cards`
- `idsInRect(...)`

所以 gallery 第一阶段实现完成后，`marquee` 的接入方式应该是：

1. `getLayout()` 不再从 DOM 读取
2. 直接返回内存里的 `GalleryLayoutCache`
3. `useMarqueeSelection` 继续读取 `layout.cards`
4. `idsInRect(...)` 逻辑保持不变

也就是说：

- marquee 不需要再依赖“当前是否真的渲染了那张卡”
- 只要 layout cache 是全量的，marquee 就天然支持虚拟化

这是当前 gallery 方案里最应该保住的一条性质。

也就是未来 `GalleryDropTarget` 应该基于 row layout 直接计算，而不是再做一次“从 cards 反推 rows”。

## 7. 拖拽中的特殊策略

拖拽时必须避免源 item 因 overscan 变化而被卸载造成视觉抖动。

推荐规则：

- drag active 时提升 overscan
- 至少保证 active row 及相邻 rows 不被裁掉
- overlay 尺寸在拖拽开始时就固定，不依赖源节点持续挂载

当前 `usePointerDragSession` 已经在拖拽启动瞬间固定 `overlaySize`，这是好的基础。

## Table 的长期最优方案

## 1. table 也应该走 block 化，而不是继续 section-only virtualization

当前 table 的 [useVirtualSections.ts](/Users/realrong/Rostack/dataview/src/react/views/table/hooks/useVirtualSections.ts) 是“按 section 高度裁剪”。

这个方向在 section 不多时没问题，但如果出现：

- section 很多
- 每个 section row 也很多

那么长期仍然应该收敛到扁平 block：

- `table-section-header`
- `table-row`
- `table-section-empty`

而不是继续叠：

- `useVirtualSections`
- 每个 section 内再 `useVirtualRows`

## 2. 为什么 table 更适合 block 化

因为 table 的滚动轴本来就是天然一维的。

row 是线性的，section header 也是线性的。

只要把 header 和 row 都看成 block，整个可滚动内容就是一个标准的一维 block 列表。

## 3. table 的几何缓存

table 比 gallery 简单很多。

至少第一阶段只需要：

- row top
- row height
- section header top
- totalHeight

以后如果 table 的 row 高度也开始变成动态，就继续沿用同一套测量回填机制，不需要重做架构。

## 统一的 Virtualizer 形态

推荐做一个独立的通用 hook：

```ts
export interface VirtualBlock {
  key: string
  top: number
  height: number
}

export interface UseVirtualBlocksOptions<TBlock extends VirtualBlock> {
  blocks: readonly TBlock[]
  viewportRef: RefObject<HTMLElement | null>
  overscan?: number
}

export interface UseVirtualBlocksResult<TBlock extends VirtualBlock> {
  items: readonly TBlock[]
  totalHeight: number
}
```

它只负责：

- 监听 viewport 变化
- 根据 `top/height` 做二分裁剪
- 输出可见 blocks

它不负责：

- block 的生成
- block 内部测量
- 交互 hit test

## 推荐的目录结构

长期建议新增一层更明确的公共目录：

```txt
dataview/src/react/virtual/
  blocks.ts
  useVirtualBlocks.ts
  math.ts
  types.ts

dataview/src/react/views/gallery/virtual/
  buildBlocks.ts
  buildLayout.ts
  measure.ts
  types.ts

dataview/src/react/views/table/virtual/
  buildBlocks.ts
  buildLayout.ts
  measure.ts
  types.ts
```

说明：

- `react/virtual` 只放通用 block virtualizer
- view-specific builder 仍然留在各自 view 下
- 不建议把 gallery/table 的布局 builder 直接合并，因为它们的 block 生成规则不同

## 与现有代码的收敛关系

## 1. gallery

当前：

- [Grid.tsx](/Users/realrong/Rostack/dataview/src/react/views/gallery/components/Grid.tsx) 直接平铺所有 cards
- [layout.ts](/Users/realrong/Rostack/dataview/src/react/views/gallery/reorder/layout.ts) 从 DOM 读 rect
- [hitTest.ts](/Users/realrong/Rostack/dataview/src/react/views/gallery/reorder/hitTest.ts) 再从 rect 猜 row

长期目标：

- `Grid.tsx` 只渲染 visible blocks
- layout 不再从 DOM 读取，而是 builder 直接产出 cache
- hit test 直接使用显式 row layout

## 2. table

当前：

- `useVirtualSections` 只做 section 级裁剪
- section 内 row 仍然整段渲染

长期目标：

- builder 直接生成 `header + row + empty` blocks
- `GroupedContent` / `FlatContent` 都复用统一的 `useVirtualBlocks`

## 3. kanban

`kanban` 目前已经有一套比较成熟的单列虚拟化实现：

- [useColumnVirtual.ts](/Users/realrong/Rostack/dataview/src/react/views/kanban/virtual/useColumnVirtual.ts)

它不一定要立即并入 block virtualizer，但它提供了两个很有价值的现成模式：

- 动态高度测量缓存
- overscan boosting

gallery 可以直接复用这套经验。

## 推荐的最终目录结构

在长期最优方案下，目录建议最终收敛为：

```txt
dataview/src/react/virtual/
  useVirtualBlocks.ts
  math.ts
  types.ts

dataview/src/react/views/gallery/virtual/
  buildLayout.ts
  buildBlocks.ts
  useRowVirtual.ts
  measure.ts
  types.ts

dataview/src/react/views/gallery/reorder/
  hitTest.ts
  useCardReorder.ts

dataview/src/react/views/table/virtual/
  buildLayout.ts
  buildBlocks.ts
  useRowBlocks.ts
  measure.ts
  types.ts
```

说明：

- `react/virtual` 只放通用 block viewport 裁剪
- `gallery/virtual` 负责 gallery 专属 row layout 与 blocks 生成
- `table/virtual` 负责 table 专属 row / header block 生成
- `gallery/reorder` 和 `gallery/selection` 继续存在，但全部改为读取 `layout cache`

## 交互层的统一原则

无论是 gallery 还是 table，长期都应遵守下面两个原则。

### 1. DOM 只负责渲染，不负责成为布局真相源

也就是：

- 不再 `querySelectorAll` 读取全量 item rect 作为主要布局来源
- 真正的真相源是 builder 产出的 layout cache

DOM 只承担：

- 渲染可见 blocks
- 回填可见 item 测量值

### 2. marquee / reorder / indicator 统一读取 layout cache

未来所有全局交互都应读取：

- block layout
- row layout
- card layout
- row layout

而不是再按 view 分别去读局部 DOM。

## 分阶段落地建议

推荐分三步落地，不建议一步改完所有 view。

## 第一阶段：gallery min-width row virtualization

目标：

- 明确 `gallery` 的 size 是 `minCardWidth preset`
- `gallery` 从全量 grid 渲染切到 row block 渲染
- 建立 `GalleryLayoutCache`
- `Grid` 只渲染 visible rows
- marquee 切到 `layout.cards`
- reorder 切到 `layout.rows`

这一步能解决当前最紧迫的问题，因为 gallery 现在最缺虚拟化，而且不等高 row 是架构分水岭。

第一阶段建议直接交付下面这些数据结构：

```ts
interface GalleryRowLayout {
  sectionKey: string
  rowIndex: number
  top: number
  height: number
  ids: readonly AppearanceId[]
}

interface GalleryCardLayout {
  id: AppearanceId
  sectionKey: string
  rowIndex: number
  columnIndex: number
  rect: Rect
}

interface GalleryLayoutCache {
  rows: readonly GalleryRowLayout[]
  cards: readonly GalleryCardLayout[]
  totalHeight: number
}
```

第一阶段的 `Grid` 应转成如下渲染方式：

- 外层是一个 spacer + visible band 容器
- row 作为可见 block 顺序渲染
- row 内部使用 `grid-template-columns: repeat(columnCount, minmax(0, 1fr))`

这一步之后，gallery 的主链路就会变成：

```txt
ids + containerWidth + minCardWidth + heightByIdByWidthBucket
  -> row layout cache
  -> visible row blocks
  -> render
```

## 第二阶段：抽通用 `useVirtualBlocks`

目标：

- 把 gallery 中通用的 viewport 裁剪逻辑上提到 `react/virtual`
- 与 table 当前的 `useVirtualSections` 做抽象对齐

注意：

- 这一阶段只抽 block 裁剪逻辑
- 不抽 gallery/table 的 builder

## 第三阶段：table block 化

目标：

- table 不再只按 section 虚拟
- `GroupedContent` 和 `FlatContent` 都统一生成 block 序列
- `useVirtualSections` 退役或并入新的 block builder

## 明确不做的事

为了保证长期结构稳定，建议明确不做下面这些事。

- 不把 gallery 继续建立在 CSS grid 的真实布局结果之上
- 不继续从 DOM 读取全量 card rect 作为主要布局数据
- 不做“双层虚拟器嵌套”作为最终架构
- 不为了快速接入虚拟化而牺牲 marquee / reorder 的全量命中能力
- 不直接引入第三方通用虚拟列表库替代当前交互体系

## 最终架构图

```txt
currentView
   |
   v
view-specific layout / block builder
   |
   +--> layout cache ------------------+
   |      gallery: rows/cards          |
   |      table: blocks/rows           |
   |
   +--> block list --------------------+
                                      |
                                      v
                               useVirtualBlocks
                                      |
                                      v
                                visible blocks
                                      |
                                      v
                                React renderer

marquee / reorder / indicator / navigation
                 |
                 v
            layout cache
```

## 最终实现方案

这里给出后续真正落地时的明确做法。

## A. Gallery 最终实现

### A1. controller 层

`useGalleryController` 输出：

- `layout`
- `blocks`
- `measure`
- `containerRef`
- `currentView`
- `selection`
- `drag`
- `marquee`

不再单独输出顶层 `cardWidth` / `cardMinWidth`。

### A2. virtual/layout 层

新增 gallery layout builder，输入：

- section 列表
- `containerWidth`
- `minCardWidth`
- `gap`
- `heightByIdByWidthBucket`

输出：

- `GalleryLayoutCache`
- `gallery row blocks`

### A3. Grid 渲染层

`Grid.tsx` 改成：

- 读取 layout cache
- 读取 visible row blocks
- 用 spacer + visible band 渲染 rows
- row 内用 grid 渲染 cards

不再把所有 card 直接塞进一个浏览器控制的 `grid auto-fill` 容器里。

### A4. 测量层

每张可见 card 继续暴露 `measureRef`：

- 首次挂载测量高度
- `ResizeObserver` 监听高度变化
- 按当前 `resolvedCardWidth` 写回对应宽度桶
- 触发布局重算

### A5. marquee

`useMarqueeSelection` 直接读取 `layout.cards`。

这样 marquee 的命中范围是：

- 整个数据集的 card rect
- 而不是当前渲染的 card DOM

### A6. reorder

`hitTest` 改成：

- 直接基于 `rows`
- 在命中的 row 内根据 `x` 判断左右插入位置

取消当前“根据 `rect.top` 聚类猜行”的实现。

## B. Table 最终实现

### B1. builder 层

table 不再只输出 section height，而是直接输出 block list：

- `table-section-header`
- `table-row`
- `table-section-empty`

### B2. virtual 层

table 的 `FlatContent` 和 `GroupedContent` 都统一接 `useVirtualBlocks`。

### B3. renderer 层

渲染时只画可见 block。

`GroupedContent` 不再负责“先 section virtualization，再在内部全量画 rows”，而是直接消费 block list。

## C. 通用层

### C1. `useVirtualBlocks`

通用 virtualizer 只做：

- viewport 监听
- overscan 计算
- 二分裁剪

不介入：

- gallery row 如何生成
- table row 如何生成
- 交互几何如何定义

### C2. layout cache 是交互真相源

后续统一原则：

- DOM 只负责渲染与测量
- layout cache 才是真正的几何真相源

因此：

- marquee 读 cache
- reorder 读 cache
- indicator 读 cache
- keyboard 也尽量基于顺序和 cache 推导

## 最终判断

对于“多个 section，每个 section 里又有很多 row”的情况：

- 短期可以做 section + 内部 row 的双层虚拟化
- 但长期最优一定是统一成扁平 block virtualization

`gallery` 和 `table` 应该一起朝这个方向收敛，因为它们的问题本质上是同一个：

- 滚动轴是一维
- 可见内容是多个分组块拼接出来的
- 交互层需要全量几何真相，而不是局部 DOM 片段

因此后续推荐路线明确为：

1. 先在 `gallery` 上验证 row block virtualization
2. 抽出通用 `useVirtualBlocks`
3. 再把 `table` 从 section virtualization 收敛到 block virtualization

这就是长期最优的统一方案。

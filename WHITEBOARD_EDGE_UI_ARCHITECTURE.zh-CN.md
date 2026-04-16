# WHITEBOARD Edge UI 最终架构

## 1. 结论

Edge 的 UI 需要收敛到一个中轴模块，而不是继续分散在 toolbar item、panel、toolbox menu、inline svg switch、palette 选项和 selection query 之间。

最终方案如下：

- `edge` 的视觉语义只认一套数据模型：`type / color / opacity / width / dash / start / end / textMode / locked`
- `fillet` 是真实的 `EdgeType`，不是 menu-only preset
- marker 采用单一 `EdgeMarker` 语义，不做 `parts`，不做组合 builder
- UI 最终开放的 marker：`arrow / arrow-fill / circle / circle-fill / diamond / diamond-fill / bar / double-bar / circle-arrow / circle-bar`
- edge line color 使用独立的 `line` palette，不再复用 node border palette
- React 侧新增单一 owner 模块 `whiteboard/packages/whiteboard-react/src/features/edge/ui`
- 这个模块集中持有 edge 的 toolbar schema、menu preset、marker/text/type catalog、glyph 绑定、panel 复用
- selection toolbar 和 toolbox menu 只消费这套 catalog，不再自己定义 edge 语义
- 老的 `edge-line / edge-markers / edge-text` 粗粒度分法直接删除，不保留兼容

## 2. 现状问题

当前实现的核心问题不是功能不够，而是语义被拆碎了。

- `EdgePanels.tsx` 同时持有 line type、dash、width、color、marker、text mode 的 UI 语义
- `edgeLine.tsx`、`edgeMarkers.tsx`、`edgeText.tsx` 分别再复制一层 toolbar 语义
- `EdgeMenu.tsx` 自己再维护一套 preset 列表和 glyph switch
- marker 图标、line type 图标、text mode 图标、preset 图标没有单一绑定点
- edge line color 直接复用 `WHITEBOARD_STROKE_COLOR_OPTIONS`，语义上和 node border 混在一起
- core 里没有 `fillet`、没有 edge `opacity`、没有 edge `locked`
- selection presentation 里 edge scope 信息不够，toolbar 只能做很浅的拼装

结果就是：

- 改 toolbar 会波及 panel、menu、icon switch 多处
- 新增一个 edge type 或 marker，需要改多层重复代码
- marker 只要想支持更多样式，就会立刻遇到 enum 爆炸和图标散落问题
- palette 无法表达“线条颜色”和“节点描边颜色”是两套产品语义
- toolbox 的 edge menu 和 toolbar 的 edge type 无法保证长期一致

## 3. 最终数据语义

### 3.1 Core model

`whiteboard/packages/whiteboard-core/src/types/model.ts`

最终 edge 语义应收敛为：

```ts
export type EdgeType =
  | 'straight'
  | 'elbow'
  | 'fillet'
  | 'curve'
  | (string & {})

export type EdgeMarker =
  | 'arrow'
  | 'arrow-fill'
  | 'circle'
  | 'circle-fill'
  | 'diamond'
  | 'diamond-fill'
  | 'bar'
  | 'double-bar'
  | 'circle-arrow'
  | 'circle-bar'

export type EdgeDash =
  | 'solid'
  | 'dashed'
  | 'dotted'

export type EdgeTextMode =
  | 'horizontal'
  | 'tangent'

export type EdgeStyle = {
  color?: string
  opacity?: number
  width?: number
  dash?: EdgeDash
  start?: EdgeMarker
  end?: EdgeMarker
}

export interface Edge {
  id: EdgeId
  source: EdgeEnd
  target: EdgeEnd
  type: EdgeType
  locked?: boolean
  groupId?: GroupId
  route?: EdgeRoute
  style?: EdgeStyle
  textMode?: EdgeTextMode
  labels?: EdgeLabel[]
  data?: Record<string, unknown>
}
```

说明：

- `fillet` 必须进入 `EdgeType`
- `opacity` 必须进入 `EdgeStyle`
- `locked` 必须进入 `Edge`
- `start / end` 的空值代表 `none`
- `none` 只是一种 UI 选择，不单独进入持久化 `EdgeMarker`
- 不做 `parts` 模型，document 里只保存稳定的 `EdgeMarker` 语义
- `textMode` 保持 edge 级别，不放到 label 上
- `preset` 不是 document model 字段，preset 只属于“创建时默认 patch”

### 3.2 Marker 语义

marker 不应走这两条路：

```ts
type EdgeMarker = {
  parts: readonly string[]
}
```

也不建议让用户或业务层直接面对组合 builder。

长期最优模型是：

- core 只认识稳定的 `EdgeMarker`
- panel 只展示预定义 marker 选项
- render 统一走单一 resolver，不额外维护 `parts` 语义
- 如果未来要新增 marker，直接新增 `EdgeMarker` 成员和对应 resolver 规则

最终产品支持这些 marker：

- `none`
- `arrow`
- `arrow-fill`
- `circle`
- `circle-fill`
- `diamond`
- `diamond-fill`
- `bar`
- `double-bar`
- `circle-arrow`
- `circle-bar`

这样分层以后：

- document 持久化的是产品语义，而不是渲染细节
- toolbar 和 panel 只认一个 `EdgeMarker`
- render 只有一套实现，不会再裂成 `preset -> parts -> glyph` 多跳结构

### 3.3 Preset 语义

`whiteboard/packages/whiteboard-editor/src/types/tool.ts`

`EdgePresetKey` 最终应为：

```ts
export type EdgePresetKey =
  | 'edge.line'
  | 'edge.arrow'
  | 'edge.elbow-arrow'
  | 'edge.fillet-arrow'
  | 'edge.curve-arrow'
```

每个 preset 都是“创建模板”，而不是 `EdgeType` 的别名。

例如：

- `edge.line` -> `{ type: 'straight', style: { start: undefined, end: undefined } }`
- `edge.arrow` -> `{ type: 'straight', style: { start: undefined, end: 'arrow' } }`
- `edge.elbow-arrow` -> `{ type: 'elbow', style: { start: undefined, end: 'arrow' } }`
- `edge.fillet-arrow` -> `{ type: 'fillet', style: { start: undefined, end: 'arrow' } }`
- `edge.curve-arrow` -> `{ type: 'curve', style: { start: undefined, end: 'arrow' } }`

toolbox menu 负责挑 preset。
toolbar 负责编辑真实 edge 字段。
二者消费同一套 catalog，但语义层级不同，不能混。

这也意味着：

- `preset` 和 `type` 不是一一对应关系
- `straight` 至少应有两个模板：`edge.line` 和 `edge.arrow`
- 以后如果还要增加“虚线直线箭头”之类，新增的也是 preset，而不是 `EdgeType`

### 3.4 Selection presentation

`whiteboard/packages/whiteboard-editor/src/types/selectionPresentation.ts`

`SelectionToolbarEdgeScope` 最终至少需要这些字段：

```ts
export type SelectionToolbarEdgeScope = {
  edgeIds: readonly EdgeId[]
  edges: readonly Edge[]
  primaryEdgeId?: EdgeId
  single: boolean
  lock: 'none' | 'mixed' | 'all'
  type?: EdgeType
  color?: string
  opacity?: number
  width?: number
  dash?: EdgeDash
  start?: EdgeMarker
  end?: EdgeMarker
  textMode?: EdgeTextMode
  labelCount: number
}
```

toolbar 不应该自己猜 lock/opacity/mixed state，这些都应由 editor query 统一给出。

## 4. 中轴化设计

React 侧新增单一 owner 目录：

`whiteboard/packages/whiteboard-react/src/features/edge/ui`

该目录是 edge UI 唯一中轴，负责：

- edge toolbar item schema
- edge panel schema
- edge menu preset schema
- edge marker catalog
- edge text mode catalog
- edge type catalog
- edge glyph 绑定
- edge line palette 选项

建议目录结构：

```txt
whiteboard/packages/whiteboard-react/src/features/edge/ui/
  index.ts
  catalog.tsx
  glyphs.tsx
  panels.tsx
  toolbar.tsx
  menu.tsx
```

职责约束：

- `catalog.tsx` 是单一数据源
- `glyphs.tsx` 只放 edge 相关 glyph 组件或重导出
- `panels.tsx` 只放复用 panel
- `toolbar.tsx` 只把 catalog 映射成 toolbar item spec
- `menu.tsx` 只把 catalog 映射成 toolbox edge menu
- `selection/chrome` 与 `toolbox/menus` 不再自己维护 edge 选项数组和图标 switch

这比现在把 edge 语义散在多个 feature 目录里更稳定，也比把所有内容塞进一个超大文件更可维护。

## 5. 单一 Catalog API

长期最优方案不是继续导出一堆零碎 helper，而是提供一个单一常量对象。

建议 API：

```ts
export const EDGE_UI = {
  palette: {
    group: 'line',
    columns: 10
  },
  types: [...],
  dashes: [...],
  widths: [...],
  markers: [...],
  textModes: [...],
  presets: [...],
  toolbar: [...]
} as const
```

各字段职责：

- `palette`：line 专用 palette 元数据
- `types`：`straight / elbow / fillet / curve`
- `dashes`：`solid / dashed / dotted`
- `widths`：line width 的推荐离散值；slider 仍可自由输入
- `markers`：start/end panel 展示的唯一 marker 目录
- `textModes`：`horizontal / tangent`
- `presets`：toolbox edge menu 使用的 preset 列表
- `toolbar`：selection toolbar 最终布局

每个 option 项都直接携带：

- `value`
- `label`
- `glyph`
- 必要时的 `patch`

例如：

```ts
type EdgeTypeOption = {
  value: EdgeType
  label: string
  glyph: React.ComponentType<{ className?: string }>
}

type EdgePresetOption = {
  key: EdgePresetKey
  label: string
  glyph: React.ComponentType<{ className?: string }>
  create: {
    type: EdgeType
    style?: Partial<EdgeStyle>
    textMode?: EdgeTextMode
  }
}

type EdgeMarkerOption = {
  key: EdgeMarker | 'none'
  label: string
  value?: EdgeMarker
  glyph: React.ComponentType<{ className?: string }>
}
```

关键规则：

- 业务代码只允许消费 `EDGE_UI`
- 不再允许在 `EdgeMenu.tsx`、`EdgePanels.tsx`、toolbar item 文件里声明新的 edge option 数组
- 图标和语义的绑定只能出现一次

marker 额外规则：

- panel 只渲染 `EDGE_UI.markers`
- 选项顺序由 `EDGE_UI.markers` 决定
- `none` 作为一个普通 UI option 存在，但 document 中仍写成 `undefined`
- 后续如果要加 `double-bar` 或 `circle-arrow`，直接扩展 `EdgeMarker`，不引入第二层 marker 结构

## 6. 最终 Toolbar 结构

目标结构：

1. `edge-stroke`
2. `edge-geometry`
3. divider
4. `edge-marker-start`
5. `edge-marker-swap`
6. `edge-marker-end`
7. divider
8. `edge-add-label`
9. `edge-text-mode`
10. divider
11. `lock`
12. `more`

### 6.1 `edge-stroke`

职责：

- line color
- line opacity

panel 内容：

- line color swatch grid，使用 line palette
- opacity slider

不再混入：

- line type
- line style
- line width

### 6.2 `edge-geometry`

职责：

- line type
- line style
- line width

panel 内容：

- type segmented buttons：`straight / elbow / fillet / curve`
- dash segmented buttons：`solid / dashed / dotted`
- width slider

### 6.3 `edge-marker-start`

职责：

- 编辑 start marker

panel：

- 复用 `EdgeMarkerPanel side="start"`
- 直接展示最终 marker 集：`none / arrow / arrow-fill / circle / circle-fill / diamond / diamond-fill / bar / double-bar / circle-arrow / circle-bar`
- 不做折叠菜单，不做二级 panel

### 6.4 `edge-marker-swap`

职责：

- 交换 `start` 和 `end`

特点：

- 直接 action，无 panel
- 单选时可用
- 多选时不显示

### 6.5 `edge-marker-end`

职责：

- 编辑 end marker

panel：

- 复用 `EdgeMarkerPanel side="end"`
- 直接展示最终 marker 集：`none / arrow / arrow-fill / circle / circle-fill / diamond / diamond-fill / bar / double-bar / circle-arrow / circle-bar`
- 不做折叠菜单，不做二级 panel

### 6.6 `edge-add-label`

职责：

- 给当前 edge 新增 label

特点：

- 直接 action，无 panel
- 只对单选 edge 显示

### 6.7 `edge-text-mode`

职责：

- 切换 `horizontal / tangent`

特点：

- 用 `Horizontal` / `Tangent` 图标
- 最简单实现是单击直接 toggle
- 不需要再开一个 panel
- 单选和多选都可用，语义是对所有选中 edge 统一写入同一 mode

### 6.8 `lock`

职责：

- 锁定或解锁 edge

前提：

- core/editor 必须支持真正的 edge lock

### 6.9 `more`

职责：

- 剩余通用动作

保留内容：

- copy
- cut
- paste
- duplicate
- layer
- delete

不应再放：

- line type
- marker
- text mode
- align
- distribute

## 7. Panel 设计

最终只保留三个 edge panel：

- `EdgeStrokePanel`
- `EdgeGeometryPanel`
- `EdgeMarkerPanel`

不再保留一个大而杂的 `EdgePanels.tsx`。

建议 API：

```ts
export const EdgeStrokePanel = (props: {
  color?: string
  opacity?: number
  onColorChange: (value: string) => void
  onOpacityChange: (value: number) => void
}) => ...

export const EdgeGeometryPanel = (props: {
  type?: EdgeType
  dash?: EdgeDash
  width?: number
  onTypeChange: (value: EdgeType) => void
  onDashChange: (value: EdgeDash) => void
  onWidthChange: (value: number) => void
}) => ...

export const EdgeMarkerPanel = (props: {
  side: 'start' | 'end'
  value?: EdgeMarker
  onChange: (value: EdgeMarker | undefined) => void
}) => ...
```

这里故意不再提供 `EdgeTextPanel`。

原因很简单：

- add label 是 direct action
- text mode 是 direct toggle
- 这两件事不值得再占一个 panel

`EdgeMarkerPanel` 的额外约束：

- 只消费 `EDGE_UI.markers`
- 不做“自由组合 builder”
- 不做 `parts` 派生逻辑
- `none` 选项点击后直接写 `undefined`

## 8. Toolbox EdgeMenu 最终设计

`whiteboard/packages/whiteboard-react/src/features/toolbox/menus/EdgeMenu.tsx`

最终 `EdgeMenu` 不再自己持有 preset 列表和 `switch`。

它应该变成一个非常薄的渲染器：

```ts
EDGE_UI.presets.map((preset) => ...)
```

最终 preset：

- `edge.line`
- `edge.arrow`
- `edge.elbow-arrow`
- `edge.fillet-arrow`
- `edge.curve-arrow`

要求：

- 使用 `whiteboard/packages/whiteboard-react/src/icons/menu-line-types` 里的现成图标
- preset glyph 必须和创建模板一一对应，而不是只对应几何类型
- 菜单里同时提供“直线无箭头”和“直线箭头”
- `LinePointingArrow.tsx` 不使用

图标绑定应固定为：

- `edge.line` -> `ArrowLine.tsx`
- `edge.arrow` -> `Arrow.tsx`
- `edge.elbow-arrow` -> `ArrowPolyline.tsx`
- `edge.fillet-arrow` -> `ArrowFillet.tsx`
- `edge.curve-arrow` -> `ArrowCurve.tsx`

这意味着：

- `whiteboard/packages/whiteboard-editor/src/input/edge/connect/start.ts` 不能只做 `preset -> type` 映射，而要做 `preset -> create patch` 映射
- `whiteboard/packages/whiteboard-react/src/features/toolbox/model.ts` 的默认 preset 建议改为 `edge.arrow`
- `whiteboard/packages/whiteboard-react/src/icons/menu-line-types/LinePointingArrow.tsx` 不进入 preset catalog

## 9. Line Palette 最终设计

### 9.1 设计目标

line color 不能再复用 border palette。

原因：

- node border 是“轮廓/描边”语义
- edge line 是“连接线/关系线”语义
- 两者在产品上是不同 palette
- `colors.md` 已经明确给了独立的 `LINES`

### 9.2 Core palette

`whiteboard/packages/whiteboard-core/src/palette/schema.ts`

最终 palette group：

```ts
export type WhiteboardPaletteGroup =
  | 'bg'
  | 'sticky'
  | 'border'
  | 'text'
  | 'line'
```

同时更新：

- `PALETTE_KEY_RE`
- `WHITEBOARD_PALETTE_REGISTRY`
- `WHITEBOARD_PALETTE_KEYS`

### 9.3 React palette

`whiteboard/packages/whiteboard-react/src/features/palette/ui.ts`

新增：

```ts
export const WHITEBOARD_LINE_COLOR_OPTIONS: readonly WhiteboardColorOption[]
```

规则：

- edge stroke 只使用 `WHITEBOARD_LINE_COLOR_OPTIONS`
- node stroke 继续使用 `WHITEBOARD_STROKE_COLOR_OPTIONS`
- draw brush 暂时不跟 edge line 绑定，除非产品语义也要独立

### 9.4 CSS variables

`whiteboard/packages/whiteboard-react/src/styles/whiteboard-react.css`

新增：

- `--wb-palette-line-0` ... `--wb-palette-line-29`

取值直接来自 `colors.md` 的 `LINES`。

## 10. `fillet / opacity / lock / marker` 的实现语义

### 10.1 `fillet`

`fillet` 必须是 path/router 层的真实能力。

核心原则：

- `elbow` 生成正交骨架
- `fillet` 复用正交骨架，但在拐点处做圆角平滑
- auto route 和 manual route 都要支持
- manual route 下，对 polyline 的角点逐个应用半径裁剪

涉及文件：

- `whiteboard/packages/whiteboard-core/src/types/model.ts`
- `whiteboard/packages/whiteboard-core/src/edge/path.ts`
- 相关 edge view / route 解析文件

### 10.2 `opacity`

`opacity` 不是 React 局部态。

它是 edge style 的真实字段，应进入：

- model
- patch
- reduce
- query
- actions
- render

涉及：

- `whiteboard/packages/whiteboard-core/src/types/model.ts`
- `whiteboard/packages/whiteboard-core/src/edge/patch.ts`
- `whiteboard/packages/whiteboard-core/src/kernel/reduce.ts`
- `whiteboard/packages/whiteboard-editor/src/command/edge.ts`
- `whiteboard/packages/whiteboard-editor/src/query/selection/presentation.ts`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeItem.tsx`

### 10.3 `lock`

如果 toolbar 上要出现 lock，就必须是完整 edge lock，而不是 UI 假按钮。

必须进入：

- `Edge.locked`
- selection query 的 mixed state
- editor action
- hit testing / interaction guard
- reconnect / route point drag / label drag 的能力判断

### 10.4 `marker`

marker 的长期最优不是做 `parts` 抽象，而是统一 `EdgeMarker -> marker spec` 的 resolver。

核心原则：

- start 和 end 共用同一套 marker layout 逻辑，只是切线方向相反
- 每个 `EdgeMarker` 只有一个 spec owner
- 不同 marker 的视觉间距、缩放、命中区都由一个 resolver 统一计算
- 即使内部有少量几何复用，也不要暴露第二套 marker 数据模型

这意味着：

- render 层要有单一 `resolveEdgeMarkerLayout`
- `arrow / circle / diamond / bar` 等 glyph 都从同一 catalog 读取
- 新增一个 `EdgeMarker`，通常只改 core type、catalog 和 render resolver
- 不允许再出现 `preset -> parts -> glyph` 这种多跳映射链

## 11. 删除与收敛

以下旧结构应直接删除，不保留兼容：

- `whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/EdgePanels.tsx`
- `whiteboard/packages/whiteboard-react/src/features/selection/chrome/toolbar/items/edgeLine.tsx`
- `whiteboard/packages/whiteboard-react/src/features/selection/chrome/toolbar/items/edgeMarkers.tsx`
- `whiteboard/packages/whiteboard-react/src/features/selection/chrome/toolbar/items/edgeText.tsx`
- `whiteboard/packages/whiteboard-react/src/features/toolbox/menus/EdgeMenu.tsx` 内部的硬编码 preset 列表和 `switch`

替换规则：

- toolbar item registry 只注册新的细粒度 edge items
- 所有 edge option/glyph/preset 只从 `features/edge/ui` 导出
- 旧的 `edge-line / edge-markers / edge-text` toolbar key 全部移除

## 12. 四阶段落地顺序

### 阶段 1：数据和 palette 打底

- 增加 `Edge.locked`
- 增加 `EdgeStyle.opacity`
- 增加 `EdgeType.fillet`
- 扩展 `EdgeMarker`
- 增加 `WhiteboardPaletteGroup.line`
- 增加 `WHITEBOARD_LINE_COLOR_OPTIONS`

### 阶段 2：core/editor 真语义接通

- path/router/render 支持 `fillet`
- action/query/reduce 支持 `opacity`
- action/query/interaction 支持 `lock`
- render/hit/query 支持统一的 endpoint marker resolver
- selection edge scope 暴露 `lock / opacity`
- edge create 改成 `preset -> create patch`

### 阶段 3：React edge UI 中轴化

- 新建 `features/edge/ui`
- 建立 `EDGE_UI`
- 新建 `EdgeStrokePanel / EdgeGeometryPanel / EdgeMarkerPanel`
- 建立 `markers`
- 新建新的 edge toolbar item schema
- `EdgeMenu` 改成 catalog-driven

### 阶段 4：删除旧实现

- 删除粗粒度 edge toolbar item
- 删除旧 `EdgePanels.tsx`
- 删除 menu 内部硬编码 switch
- 删除任何继续直接引用旧 `WHITEBOARD_STROKE_COLOR_OPTIONS` 的 edge 入口

## 13. 最终判断标准

完成后应满足以下标准：

- 新增一个 edge type，只改 core type 和 `EDGE_UI`
- 新增一个 edge marker，只改 core model、render resolver 和 `EDGE_UI`
- toolbox menu 与 selection toolbar 的 edge 语义天然一致
- edge 颜色和 node border 颜色彻底分离
- 任何 edge 图标与业务语义的绑定都只能在一个地方找到
- 不再存在 `edge-line / edge-markers / edge-text` 这种按历史演化出来的粗粒度拼装结构

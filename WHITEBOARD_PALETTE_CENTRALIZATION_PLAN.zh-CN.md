# Whiteboard Palette 中轴化重构方案

## 目标

本方案不是继续补 helper，也不是在现有实现外面再套一层。

目标是把 whiteboard 当前已经接入的 palette 体系，进一步收束成一条清晰、单向、可维护的主链路，满足以下要求：

- 只有一套 whiteboard palette 实现，不保留旧白板颜色方案。
- 只持久化稳定的 palette key，不持久化 hex，不持久化 CSS 变量名。
- 亮色 / 暗色切换自动生效，节点数据无需迁移。
- fill、stroke、text、draw、edge、sticky、shape、frame、selection、toolbar、toolbox 都走同一条 palette 主链。
- core、editor、react、styles 各层职责明确，不再散落同类常量和重复 helper。
- 所有白板特有颜色决策都能从一个中轴体系顺藤摸瓜找到，不需要跨多个包猜逻辑。

## 结论

当前实现方向是对的，但中轴还不够强。

已经完成的是：

- palette key 协议已经建立。
- render 时解析 palette key 的能力已经接入。
- fill / stroke / text / sticky / draw / edge 基本已经使用 palette。

还不够好的地方是：

- 协议、默认值、UI option、toolbox preset、render resolver 分散在多个文件。
- 某些默认值仍按节点类型各自定义，不是统一从“白板标准默认色”中派生。
- React 层多个入口各自调用 `resolveWhiteboardPaletteValue`，解析入口没有真正收束。
- sticky、shape、frame、draw 各自拥有局部颜色决策，虽然已接入 palette，但仍不像同一个中心系统。

所以接下来的优化重点不是“再加功能”，而是“重建主轴”。

## 设计原则

### 1. 按角色收束，不按文件堆叠

应当集中的是“决策点”，不是把所有代码粗暴塞进一个文件。

正确拆法是四层：

- palette schema：协议层
- palette presets：产品默认层
- palette ui：界面派生层
- palette render：渲染解析层

### 2. 单向数据流

唯一正确方向应为：

`colors.md / styles.css -> CSS variables -> palette schema -> palette presets -> editor defaults -> react UI options -> render resolver -> actual DOM/SVG/canvas`

反方向不允许存在：

- React 层自己定义 palette index 规则
- Editor 层自己发明默认颜色
- Toolbox 层自己拼 palette key
- Node renderer 层自己写 fallback 颜色

### 3. whiteboard 业务知识不能泄漏到 shared/ui

`shared/ui` 只负责通用 swatch、panel、button、grid 组件。

它可以支持：

- `option.color`
- `transparent`
- `swatchShape`
- `columns`

但它不应该知道：

- `palette:bg:12`
- sticky 推荐色
- whiteboard 的 fill / stroke / text 分组

### 4. 所有默认色必须可追溯

任何默认 fill / stroke / text / draw color 都必须能追溯到一个统一的 preset 源。

不允许出现这种情况：

- sticky 默认在 `templates.ts`
- draw 默认在 `state.ts`
- frame 默认在 `templates.ts`
- shape 默认在 `shape.ts`
- sticky 推荐子集在 `presets.ts`
- UI options 又在 `options.ts`

这会导致“默认语义”分裂。

## 现状问题总表

### A. 协议层和产品层混在一起

当前 [palette.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/palette.ts) 同时承载了：

- key 协议
- 解析 helper
- section 分组
- sticky 推荐 index

其中：

- key 协议和 resolver 属于 schema 层
- section 分组属于 UI / 产品派生层
- sticky 推荐 index 属于 preset 层

这三类东西不应放在同一个文件。

### B. 默认值散在多个模块

当前默认值分散在：

- [templates.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/templates.ts)
- [shape.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/shape.ts)
- [state.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/local/draw/state.ts)
- [presets.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/presets.ts)

问题不是它们不能存在，而是“白板颜色默认”没有统一 owner。

### C. UI option 生成层不够中轴化

当前 [options.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/menus/options.ts) 已经改为 palette key，但它仍然直接依赖 core 内部的 section 常量。

更合理的关系应当是：

- core 提供 schema 和 preset
- react 的 palette ui 模块从 preset 派生 option
- selection / toolbar / edge / draw menu 只消费 ui 模块的产物

而不是面板散拿 core 常量自己拼。

### D. render resolver 入口仍然偏散

当前解析 palette key 的调用散在：

- [shared.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/registry/default/shared.tsx)
- [text.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/registry/default/text.tsx)
- [frame.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/registry/default/frame.tsx)
- [shape.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/registry/default/shape.tsx)
- [draw.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/registry/default/draw.tsx)
- [EdgeItem.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeItem.tsx)
- [EdgeOverlayLayer.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeOverlayLayer.tsx)
- [EdgeToolbar.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeToolbar.tsx)
- [DrawPreview.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/draw/DrawPreview.tsx)
- [DrawMenu.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/menus/DrawMenu.tsx)
- toolbar item 里的图标预览

这说明 palette 已经通了，但“解析入口”还没有真正形成统一中轴。

### E. sticky 相关知识分布在两处

sticky 当前知识同时存在于：

- [presets.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/presets.ts)
- [StickyMenu.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/menus/StickyMenu.tsx)

现在虽然菜单和插入已统一，但 sticky 的以下知识仍没有统一 owner：

- 推荐色集合
- 推荐顺序
- 显示 label
- 1:1 / 2:1 规格
- 默认 border 跟随逻辑

### F. CSS 变量定义与 schema 没有显式绑定

当前 palette 变量写在 [whiteboard-react.css](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/styles/whiteboard-react.css)，但没有一个更高层的“白板 palette registry”来保证：

- bg 有哪些索引
- border 有哪些索引
- text 有哪些索引
- light / dark 是否完整对应

这会让后续扩展时容易出现“CSS 有了，schema 没更新”或“schema 有了，CSS 少一项”的隐性漂移。

## 目标架构

### 一、Core 层：只保留协议和产品默认

建议新增或重组为以下模块。

#### 1. `whiteboard-core/src/palette/schema.ts`

职责：

- 定义 `WhiteboardPaletteGroup`
- 定义 `WhiteboardPaletteKey`
- 定义 `createWhiteboardPaletteKey`
- 定义 `parseWhiteboardPaletteKey`
- 定义 `isWhiteboardPaletteKey`
- 定义 `resolveWhiteboardPaletteVariable`
- 定义 `resolveWhiteboardPaletteValue`

禁止放入：

- sticky 推荐色
- UI section
- label
- swatch layout
- 节点默认色

#### 2. `whiteboard-core/src/palette/registry.ts`

职责：

- 定义 palette 的完整索引注册表
- 定义三组 palette 的有效索引范围
- 定义 light / dark 对应关系是否完整
- 定义每组 palette 的元数据

建议结构：

```ts
type WhiteboardPaletteRegistry = {
  bg: readonly number[]
  border: readonly number[]
  text: readonly number[]
}
```

它不负责 UI 排列，只负责“合法全集”。

#### 3. `whiteboard-core/src/palette/presets.ts`

职责：

- 统一声明 whiteboard 产品级默认颜色语义
- 声明标准默认 paint tokens
- 声明 sticky 推荐色子集
- 声明 shape 特殊预设色
- 声明 draw 默认槽颜色

建议内容：

- `WHITEBOARD_DEFAULT_TEXT_COLOR`
- `WHITEBOARD_DEFAULT_STROKE_COLOR`
- `WHITEBOARD_DEFAULT_SURFACE_FILL`
- `WHITEBOARD_STICKY_DEFAULTS`
- `WHITEBOARD_FRAME_DEFAULTS`
- `WHITEBOARD_SHAPE_DEFAULTS`
- `WHITEBOARD_DRAW_DEFAULT_SLOTS`
- `WHITEBOARD_STICKY_RECOMMENDED_BG_KEYS`

这样之后：

- `templates.ts` 不再发明 sticky / frame 默认色
- `shape.ts` 不再自己存蓝色 / 黄色 key
- `draw/state.ts` 不再自己存 draw 默认色

它们全部只从 `palette/presets.ts` 取值。

#### 4. `whiteboard-core/src/palette/index.ts`

职责：

- 统一导出 schema、registry、presets

然后 [node/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/index.ts) 只 re-export，不直接承载颜色逻辑。

### 二、Editor 层：只消费 preset，不再发明默认色

#### 1. `selection/presentation`

目标文件：

- [presentation.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/query/selection/presentation.ts)

应当只做：

- 读取节点已有 style
- 如果没有，则从统一 palette preset 取默认值
- 不再自己定义 `UI_TEXT_PRIMARY`
- 不再自己判断某类型应该回退到哪个字面常量

建议收束成：

- `readNodeDefaultPaint(nodeType, shapeKind?)`
- `readNodeEffectivePaint(node, registry)`

这样 selection toolbar 看到的 fill / stroke / text 都来自一个统一默认源。

#### 2. `draw/state`

目标文件：

- [state.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/local/draw/state.ts)

应当只引用：

- `WHITEBOARD_DRAW_DEFAULT_SLOTS`

不再直接写 palette key。

#### 3. insert / toolbox type

目标文件：

- [insert.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/insert.ts)

需要明确 StickyTone 的角色。

建议改成：

- `StickyTone` 只表示 UI 展示模型
- 如果 `fillKey` / `borderKey` 只是插入 preset 用，则归到 palette preset / toolbox preset，不应作为 editor 通用领域模型泄漏太深

也就是说，editor 类型层不应承担过多 React toolbox 细节。

### 三、React 层：拆成 UI 派生层和 Render 解析层

#### 1. `whiteboard-react/src/features/palette/ui.ts`

职责：

- 从 core 的 registry + presets 派生：
  - fill swatch options
  - sticky fill options
  - stroke swatch options
  - text swatch options
  - draw swatch options
- 统一提供：
  - label
  - ariaLabel
  - color
  - transparent
  - swatchShape
  - columns 推荐值

这样：

- [options.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/menus/options.ts) 可以删除
- FillPanel、BorderPanel、TextColorPanel、EdgeToolbar、DrawMenu 直接消费 palette ui 模块

#### 2. `whiteboard-react/src/features/palette/render.ts`

职责：

- 提供统一 render resolver，而不是到处直接调用 `resolveWhiteboardPaletteValue`

建议 API：

- `resolvePaletteColor(value)`
- `resolvePalettePaint({ fill, stroke, color })`
- `resolveNodeStyleColor(node, key)`
- `resolveNodePaintWithDefaults(node, defaults)`
- `resolveToolbarPreviewColor(value)`

这样以下文件不再各自直调 schema helper：

- [shared.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/registry/default/shared.tsx)
- [text.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/registry/default/text.tsx)
- [frame.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/registry/default/frame.tsx)
- [shape.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/registry/default/shape.tsx)
- [draw.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/registry/default/draw.tsx)
- [EdgeItem.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeItem.tsx)
- [EdgeOverlayLayer.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeOverlayLayer.tsx)
- [EdgeToolbar.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeToolbar.tsx)
- [DrawPreview.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/draw/DrawPreview.tsx)
- [DrawMenu.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/menus/DrawMenu.tsx)
- toolbar item 里的 fill / stroke / textColor preview

#### 3. `whiteboard-react/src/features/palette/sticky.ts`

职责：

- 定义 sticky 的推荐 tone 列表
- 定义 sticky 的展示 label
- 定义 sticky menu 的排序
- 定义 1:1 / 2:1 规格
- 定义 tone 到 preset input 的映射

这样：

- [presets.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/presets.ts) 不再保存 sticky 色板业务知识
- [StickyMenu.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/menus/StickyMenu.tsx) 只渲染，不再拥有颜色决策

#### 4. `whiteboard-react/src/features/palette/index.ts`

职责：

- 导出 `ui`
- 导出 `render`
- 导出 `sticky`

以后 whiteboard-react 侧只允许从这个 palette feature 入口消费颜色能力。

### 四、Styles 层：显式成为 palette token backend

目标文件：

- [whiteboard-react.css](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/styles/whiteboard-react.css)

应该明确其角色是：

- `schema` 的 runtime backend
- 而不是“顺手塞了一堆变量的样式文件”

建议优化方向：

- palette 变量区块单独独立命名
- 加生成注释或来源注释，说明来源于 `colors.md`
- 为 bg / border / text 分区
- 增加 completeness checklist

更长期最优是：

- 从 `colors.md` 或更结构化数据源生成 palette CSS 片段

如果暂不引入生成脚本，也应至少在文档和文件结构上让这层成为明确的 token backend。

## 需要重构的完整链路

以下所有链路都必须纳入本次中轴化范围，不允许遗漏。

### 1. Palette 协议

涉及：

- [palette.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/palette.ts)
- [index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/index.ts)

动作：

- 拆出 schema、registry、presets
- `node/index.ts` 只做导出桥接

### 2. CSS tokens

涉及：

- [whiteboard-react.css](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/styles/whiteboard-react.css)
- [colors.md](/Users/realrong/Rostack/colors.md)
- [styles.css](/Users/realrong/Rostack/styles.css)

动作：

- 把 `whiteboard-react.css` 明确为 whiteboard palette token backend
- 文档中说明 `colors.md` 是数据源，`styles.css` 只作参考，不是 runtime source

### 3. Node 默认值

涉及：

- [templates.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/templates.ts)
- [shape.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/shape.ts)

动作：

- sticky / frame / shape 默认色全部改为从统一 preset 模块读取
- shape 特殊色和 preview 色也从 preset 派生

### 4. Editor 默认推导

涉及：

- [presentation.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/query/selection/presentation.ts)
- [state.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/local/draw/state.ts)

动作：

- 不再在 editor 层声明白板颜色默认
- 全部依赖 core palette preset

### 5. Selection 面板

涉及：

- [FillPanel.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/FillPanel.tsx)
- [BorderPanel.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/BorderPanel.tsx)
- [TextColorPanel.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/TextColorPanel.tsx)

动作：

- 不直接依赖 options 常量文件
- 改为消费 react palette ui 入口

### 6. Toolbar 预览

涉及：

- [fill.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/toolbar/items/fill.tsx)
- [stroke.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/toolbar/items/stroke.tsx)
- [textColor.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/toolbar/items/textColor.tsx)

动作：

- 不直接调 schema resolver
- 改为统一走 react palette render helper

### 7. Sticky toolbox

涉及：

- [presets.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/presets.ts)
- [StickyMenu.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/menus/StickyMenu.tsx)

动作：

- sticky tone、label、format、preset 映射统一移入 sticky palette 模块
- `StickyMenu.tsx` 只负责渲染
- `presets.ts` 只负责组装 InsertPreset，不拥有颜色业务知识

### 8. Draw 相关

涉及：

- [DrawMenu.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/menus/DrawMenu.tsx)
- [DrawPreview.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/draw/DrawPreview.tsx)
- [state.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/local/draw/state.ts)

动作：

- draw 默认槽来自统一 preset
- draw swatch option 来自统一 ui
- draw preview / menu preview 来自统一 render resolver

### 9. Edge 相关

涉及：

- [EdgeToolbar.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeToolbar.tsx)
- [EdgeItem.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeItem.tsx)
- [EdgeOverlayLayer.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeOverlayLayer.tsx)

动作：

- edge color panel 与 draw / stroke panel 共用同一 palette ui 入口
- edge path / label / icon preview 共用同一 render resolver

### 10. Node 渲染

涉及：

- [shared.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/registry/default/shared.tsx)
- [text.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/registry/default/text.tsx)
- [frame.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/registry/default/frame.tsx)
- [shape.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/registry/default/shape.tsx)
- [draw.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/registry/default/draw.tsx)

动作：

- 用统一 render helper 读取颜色
- 删除各节点 renderer 自己的 palette fallback 拼装

### 11. Shared UI swatch

涉及：

- [panel.tsx](/Users/realrong/Rostack/shared/ui/src/panel.tsx)

动作：

- 保持组件通用，不引入更多 whiteboard 业务逻辑
- 当前支持能力已经足够，后续不应再往 shared/ui 注入 whiteboard palette 语义

## 推荐文件重组

### Core

建议新增：

- `whiteboard/packages/whiteboard-core/src/palette/schema.ts`
- `whiteboard/packages/whiteboard-core/src/palette/registry.ts`
- `whiteboard/packages/whiteboard-core/src/palette/presets.ts`
- `whiteboard/packages/whiteboard-core/src/palette/index.ts`

建议保留：

- [templates.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/templates.ts)
- [shape.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/shape.ts)

但它们只做节点模板与 schema 定义，不再持有 palette 决策常量。

建议删除或清空职责：

- [palette.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/palette.ts)

删除方式不是功能删除，而是迁移拆分后移除这个“混合职责文件”。

### React

建议新增：

- `whiteboard/packages/whiteboard-react/src/features/palette/ui.ts`
- `whiteboard/packages/whiteboard-react/src/features/palette/render.ts`
- `whiteboard/packages/whiteboard-react/src/features/palette/sticky.ts`
- `whiteboard/packages/whiteboard-react/src/features/palette/index.ts`

建议删除：

- [options.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/menus/options.ts)

原因：

- 它本质已经不是“menu options 文件”
- 它承载的是整个 whiteboard palette UI 派生
- 放在 `selection/chrome/menus` 下会持续误导职责边界

### Toolbox

建议保留：

- [presets.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/presets.ts)
- [StickyMenu.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/menus/StickyMenu.tsx)

但要降级其职责：

- `presets.ts` 只负责把 palette sticky preset 组装为 insert preset
- `StickyMenu.tsx` 只消费现成 view model

### Styles

建议保留：

- [whiteboard-react.css](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/styles/whiteboard-react.css)

建议把 palette 变量区块独立标注并长期固定位置。

## 统一 API 方案

为了真正中轴化，建议最终只暴露以下几类 API。

### Core 暴露

#### Schema

- `createWhiteboardPaletteKey(group, index)`
- `parseWhiteboardPaletteKey(value)`
- `isWhiteboardPaletteKey(value)`
- `resolveWhiteboardPaletteVariable(group, index)`
- `resolveWhiteboardPaletteValue(value)`

#### Registry

- `WHITEBOARD_PALETTE_REGISTRY`
- `WHITEBOARD_BG_KEYS`
- `WHITEBOARD_BORDER_KEYS`
- `WHITEBOARD_TEXT_KEYS`

#### Presets

- `WHITEBOARD_NODE_PAINT_DEFAULTS`
- `WHITEBOARD_STICKY_PRESET_DEFS`
- `WHITEBOARD_DRAW_PRESET_DEFS`
- `WHITEBOARD_SHAPE_PRESET_DEFS`

### React 暴露

#### UI

- `getFillPaletteOptions()`
- `getStickyFillPaletteOptions()`
- `getStrokePaletteOptions()`
- `getTextPaletteOptions()`
- `getDrawPaletteOptions()`

#### Render

- `resolvePaletteColor(value)`
- `resolvePalettePaint(paint)`
- `resolvePalettePreviewColor(value)`

#### Sticky

- `getStickyMenuSections()`
- `getStickyInsertOptions()`
- `getStickyPresetKey(toneKey, formatKey)`

## 清理原则

本次重构不是把旧代码留着当 fallback。

必须明确执行以下清理动作：

- 删除 whiteboard 内对 `UI_CONTENT_COLOR_FAMILIES` 的依赖。
- 删除 whiteboard 内对 `resolveOptionColorToken` 的依赖。
- 删除 whiteboard 内分散的 palette UI option 常量定义。
- 删除 whiteboard 内节点 renderer 中重复的 palette resolve 写法。
- 删除“颜色默认值定义在业务文件里”的模式。
- 删除 sticky 色板业务逻辑挂在 toolbox preset 文件里的模式。
- 删除 core 中协议、默认、UI section 混放的 palette 文件。

## 实施顺序

建议按以下顺序做，避免中途再次散掉。

### Phase 1. 收 core 中轴

- 新建 `schema.ts`
- 新建 `registry.ts`
- 新建 `presets.ts`
- 迁移 `palette.ts` 现有内容
- 更新 `node/index.ts` 出口

### Phase 2. 收默认值源头

- `templates.ts` 改为只消费 preset
- `shape.ts` 改为只消费 preset
- `draw/state.ts` 改为只消费 preset
- `selection/presentation.ts` 改为只消费 preset

### Phase 3. 收 react UI 中轴

- 建 `features/palette/ui.ts`
- 将 fill / stroke / text / draw / sticky options 全部迁入
- 删除原 `options.ts`

### Phase 4. 收 react render 中轴

- 建 `features/palette/render.ts`
- 节点 renderer、edge、draw、toolbar 全部改为统一调用
- `shared.tsx` 简化为最薄读取层

### Phase 5. 收 sticky 专项

- 建 `features/palette/sticky.ts`
- sticky tone / format / label / preset 映射迁入
- toolbox preset 与 sticky menu 只消费 view model

### Phase 6. 收 styles 与文档

- 在 `whiteboard-react.css` 中整理 palette token 区块
- 补充变量来源说明
- 保持 `colors.md` 为源头文档

## 验收标准

只有满足以下条件，这次中轴化才算完成。

### 架构验收

- whiteboard 颜色协议、默认、UI、渲染四层分离清楚。
- whiteboard-react 侧只有一个 palette feature 入口。
- core 层只有一个 palette preset 入口。
- editor 层不再发明白板默认颜色。

### 代码验收

- `whiteboard/packages` 下不再引用 `UI_CONTENT_COLOR_FAMILIES`
- `whiteboard/packages` 下不再引用 `resolveOptionColorToken`
- 不再存在旧的 `options.ts` 式白板色板汇总文件挂在 selection menu 路径里
- 节点 renderer 不再散落直接调用 schema resolver
- sticky 推荐色、label、format 不再散在 toolbox preset 与 menu 两处

### 行为验收

- fill panel、border panel、text panel 的色板全部来自统一 ui 模块
- sticky menu 预览、插入节点、工具栏 swatch、实际节点渲染完全一致
- draw menu、draw preview、实际 draw 节点一致
- edge toolbar、edge path、edge label 一致
- shape / frame / text / sticky 的默认颜色一致且可追溯
- 亮色 / 暗色切换后，已有节点自动切换，无数据迁移

## 不应做的事情

- 不要再把更多 whiteboard palette 逻辑塞进 `shared/ui`
- 不要让 `selection/chrome/menus` 继续承担全局 palette 中轴职责
- 不要让节点 renderer 自己定义 fallback palette key
- 不要把 sticky 推荐色仅仅视为 UI 数据而脱离 preset 系统
- 不要在 editor 或 react 层继续出现“临时默认色常量”

## 最终建议

如果只做“局部整理”，这条线很快还会再次散掉。

长期最优做法是：

- core 拥有 palette schema + registry + presets
- react 拥有 palette ui + render + sticky view model
- editor 只消费 preset
- toolbox / selection / render 全部依赖上述中轴
- styles 明确作为 runtime token backend

这样之后无论要做：

- 改默认 sticky 色
- 改 shape 默认边框
- 扩 palette 索引
- 替换亮暗两套 token
- 给 draw 加新颜色组
- 调整 sticky menu 展示顺序

都只需要改中轴，而不会再次把逻辑扩散回各个功能文件。

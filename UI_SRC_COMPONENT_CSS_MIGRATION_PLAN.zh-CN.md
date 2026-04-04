# UI `ui/src` 组件迁移到新 CSS 体系方案

## 目标

当前方向已经明确：

- `ui/css` 只保留主题 token 和极少量全局基础层。
- 不再保留全局组件 recipe class，例如 `.ui-control`、`.ui-input`、`.ui-switch`、`.ui-popover-panel`、`.ui-query-chip`。
- `ui/src` 组件自身负责自己的视觉实现，直接消费 `tokens.css` 和 `semantic.css` 暴露出来的变量。
- 不做历史兼容，不保留旧 class 协议。

这意味着 `ui/src` 的迁移目标不是“把旧 class 从 `primitives.css` 搬到别处”，而是“把视觉定义回收进组件本身”。

## 最终结构建议

长期最优结构建议如下：

- `ui/css/tokens.css`
  只定义 light / dark 下的 design tokens。
- `ui/css/semantic.css`
  只做语义映射，例如 surface、field、divider、focus、floating、accent。
- `ui/css/base.css`
  只保留 reset、document-level defaults、selection、字体继承。
- `ui/css/core.css`
  作为统一入口，直接 `@import` `tokens.css`、`semantic.css`、`base.css`。
- `ui/src/*`
  每个组件自己持有自己的样式表达，优先用 Tailwind class + `var(--token)`。

不再建议存在的层：

- `primitives.css`
  它本质是在暴露一套全局组件 class API，这和现在的方向冲突。
- `patterns.css`
  它承载的是模式级样式，不是 theme/token 层。
- `theme.css`
  只是中转层，没有独立价值。

## 当前 `ui/src` 的问题

`ui/src` 现在大量依赖已经删掉或准备删掉的全局 class 协议。

直接受影响的组件：

- `ui/src/button.tsx`
  依赖 `ui-button-primary`、`ui-control`、`ui-button-outline`、`ui-chip-control`、`ui-panel-control`、`ui-hover-control`、`ui-button--pressed`。
- `ui/src/input.tsx`
  依赖 `ui-text-input`。
- `ui/src/select.tsx`
  依赖 `ui-input`。
- `ui/src/switch.tsx`
  依赖 `ui-switch`、`ui-switch--checked`、`ui-switch__thumb`。
- `ui/src/popover.tsx`
  依赖 `ui-popover-panel`、`ui-surface-floating`。
- `ui/src/panel-header.tsx`
  依赖 `ui-divider-bottom`。
- `ui/src/query-chip.tsx`
  依赖 `ui-query-chip` 及其子元素 class。
- `ui/src/tone.ts`
  依赖 `ui-tag-tone--*` 和 `ui-checkbox-tone--*`。

其中最核心的问题不是“类名没了”，而是：

- 组件样式职责分散在 `ui/src` 和 `ui/css/*.css` 两侧。
- 导出的 TS API 实际上绑定了 CSS class 协议。
- `ui` 包把一些明显偏业务模式的样式也当成了底层通用能力。

## 迁移原则

- token 只表达“值”，不表达组件。
- semantic 只表达“语义层”，不表达具体组件结构。
- 组件样式尽量回收到组件文件内部，不再依赖全局 `.ui-*` 选择器。
- 只有真正跨组件共享、且稳定到可以当 public API 的东西，才保留为 TS helper，而不是 CSS class。
- 业务模式样式不要继续沉到 `ui/css`。

## 组件级迁移方案

### 1. `Button`

`Button` 是这次迁移的核心，因为现在很多 recipe class 都是围绕它建的。

建议方案：

- 保留 `button.tsx` 里的 `cva` 结构。
- 删除对 `.ui-control`、`.ui-button-primary`、`.ui-button-outline`、`.ui-chip-control`、`.ui-panel-control`、`.ui-hover-control` 的依赖。
- 把这些视觉规则直接改写成 token 驱动的 class 组合。

建议的视觉来源：

- `default`
  使用 `--ui-solid` / `--ui-solid-foreground`。
- `destructive`
  使用 `--ui-danger` / `--ui-danger-foreground`。
- `secondary`、`ghost`
  使用 `--ui-control-hover` / `--ui-control-pressed`、`--ui-text-primary`。
- `outline`
  使用 `--ui-border-default`、`--ui-border-strong`、`--ui-surface`。
- `row`
  直接在 `button.tsx` 里表达 list row 行为，不再依赖 `ui-hover-control`。
- `chip`
  如果仍保留在 `ui`，就在 `button.tsx` 内表达 chip 样式。
- `panel`
  同理，作为一种 layout 变体内联在 `button.tsx`。

结论：

- `Button` 应该成为“组件自己负责视觉”的模板。
- `Button` 内部可以继续有 variant / layout 体系。
- 但这些不应该再通过全局 CSS class 拼出来。

### 2. `Input` / `Select`

这两个最适合直接内联，因为视觉规则简单且稳定。

建议方案：

- `Input` 直接使用 `--ui-field-embedded-bg`、`--ui-divider-strong`、`--ui-text-primary`、`--ui-text-tertiary`、`--ui-focus-ring`。
- `Select` 直接使用 `--ui-field-bg`、`--ui-border-default`、`--ui-border-strong`、`--ui-text-primary`、`--ui-text-tertiary`。
- focus ring 直接统一成 `rgb(from var(--ui-focus-ring) r g b / alpha)`。

结论：

- `Input` 和 `Select` 没必要再依赖任何全局 recipe class。
- 它们的样式应该完全组件内聚。

### 3. `Switch`

`Switch` 当前完全依赖 `.ui-switch*` 这条 class 线，这条线不建议保留。

建议方案：

- 直接在 `switch.tsx` 内联 track 和 thumb 的所有视觉。
- `checked` 状态使用 accent 语义。
- `unchecked` 状态使用 neutral surface 语义。

建议用到的 token：

- track off
  `--ui-default-bg-strong` 或 `--ui-surface-subtle`
- track on
  `--ui-accent`
- thumb
  `--ui-bg-card`
- disabled
  继续走 opacity / pointer state 即可

如果后面发现 switch 的“开/关轨道”要单独调语义，再新增极少量 semantic token，例如：

- `--ui-switch-track`
- `--ui-switch-track-checked`
- `--ui-switch-thumb`

但初版不建议先加，先直接用现有语义变量。

### 4. `Popover`

`Popover` 现在依赖 `.ui-popover-panel` 和 `.ui-surface-floating`，这本质也是 recipe class。

建议方案：

- 直接在 `popover.tsx` 内联浮层 panel 的边框、背景、阴影、backdrop-filter、文字色。
- `contentClassName` 仍然保留，允许业务层继续控制尺寸和布局。

建议用到的 token：

- background
  `--ui-floating-bg`
- border
  `--ui-floating-border`
- shadow
  `--ui-popover-shadow`
- text
  `--ui-text-primary`
- dim backdrop
  使用 `--ui-overlay-bg`，不要再写死黑色透明度

结论：

- `Popover` 应该变成“功能逻辑 + 最小浮层视觉外壳”的组件。
- 外层容器行为留在组件里，业务内容布局仍由调用方传入。

### 5. `Menu`

`Menu` 本身很多视觉其实是借 `Button` 和 `Popover` 提供的。

建议方案：

- 不单独给 `Menu` 增加新的全局 CSS 层。
- 等 `Button` 和 `Popover` 完成迁移后，`Menu` 自然跟着收敛。
- `divider` 直接改成原子式边框 class，不再依赖 `ui-divider-top`。

结论：

- `Menu` 不应有独立 CSS 文件。
- `Menu` 的迁移重点是“消费新的 `Button` / `Popover`”。

### 6. `PanelHeader`

`PanelHeader` 视觉极简单，不值得保留任何全局 class。

建议方案：

- 直接把底部分隔线改成 `border-b` + `var(--ui-divider)`。
- 其余沿用布局类即可。

### 7. `QueryChip`

`QueryChip` 是一个边界组件，需要先定归属。

我建议：

- 短期内仍可保留在 `ui/src`，但把样式回收到 `query-chip.tsx`。
- 长期看，它更像 dataview 的 query/filter/sort 模式组件，不一定属于所有产品共用的基础 UI。

理由：

- 仓库里已经有 `apps/dataview/styles/query.css` 在维护同一套 `.ui-query-chip` 规则。
- 这说明它天然带有业务模式色彩，不像 `Button` / `Input` 那样通用。

建议迁移：

- 如果仍放在 `ui/src`，直接在 `query-chip.tsx` 中内联完整视觉。
- 如果未来确认只有 dataview 使用，就迁回 dataview，不再作为 `ui` 导出组件。

### 8. `tone.ts`

这是当前最不应该保留原状的模块。

原因：

- `uiTone.tag()` 返回 class 名，本质是在把全局 CSS 协议导出成 TS API。
- `uiTone.checkbox()` 同理。
- 这和“去掉全局 recipe class”完全相反。

建议方案：

- 直接废弃 `uiTone` 这套 API。
- `checkbox` 颜色应由 `Switch` 或具体 checkbox 组件自己处理，不应通过公共 tone helper 返 class。
- `tag` 颜色如果是 option 颜色体系，统一走 `ui/src/color/resolve.ts`。

如果未来仍需要一个“颜色解析 helper”，正确形态应该是：

- 返回 token 名或 style object。
- 或者返回 tone metadata。
- 不返回 class name。

结论：

- `tone.ts` 建议删除。
- 对外只保留 `color/resolve.ts` 这类 token 解析 helper。

### 9. `color/resolve.ts`

这是当前方向里最健康的一块，建议保留，并作为未来颜色接入的标准模式。

原因：

- 它没有绑定全局 CSS 选择器。
- 它直接返回 token 引用或 style object。
- 它和新 `tokens.css` 的 option color 体系是一致的。

建议：

- 继续保留 `normalizeOptionColorId`。
- 继续保留 `resolveOptionColorToken`。
- `resolveOptionBadgeStyle` / `resolveOptionColumnStyle` / `resolveOptionCardStyle` / `resolveOptionDotStyle` 可以继续作为轻量 helper 存在。
- 后续如果业务更偏向 class 驱动，可以改成返回 CSS variable map，但不要回到 class name 协议。

## 对外 API 调整建议

### 建议保留的导出

- `Button`
- `Input`
- `Select`
- `Label`
- `Popover`
- `Menu`
- `PanelHeader`
- `Switch`
- `VerticalReorderList`
- `BlockingSurface*`
- `color/*` 解析函数
- `cn`

### 建议评估后保留的导出

- `QueryChip`
  如果确认不止 dataview 使用，可以保留；否则应迁出 `ui`。

### 建议删除的导出

- `uiTone`
- `UiTagTone`

## 需要补足的 semantic token

当前 `semantic.css` 已经够用大半，但为了让组件彻底摆脱 recipe class，建议只补真正缺的语义，不要把旧 class 再翻译成 token。

优先级较高、但数量要尽量少：

- `--ui-floating-shadow`
  如果不想让 `Popover` 直接吃 `--ui-popover-shadow`，可以统一命名。
- `--ui-field-focus-ring`
  如果想把 field focus 和通用 focus 分开。
- `--ui-divider`
  已经有，够用。
- `--ui-control-hover`
  已经有，够用。
- `--ui-control-pressed`
  已经有，够用。

不建议新增的东西：

- `--ui-button-primary-bg`
- `--ui-button-ghost-bg`
- `--ui-chip-control-bg`
- `--ui-panel-control-bg`

这些都是组件 recipe，不是 theme semantic。

## 实施顺序建议

建议按依赖关系迁移，而不是按文件名顺序迁移。

第一阶段：

- `ui/css/core.css` 直接收敛为 `tokens.css + semantic.css + base.css`
- 确认不再依赖 `theme.css`
- 明确 `ui/css` 不再承载任何组件 recipe class

第二阶段：

- 迁移 `Button`
- 迁移 `Input`
- 迁移 `Select`
- 迁移 `Switch`
- 迁移 `Popover`

第三阶段：

- 迁移 `Menu`
- 迁移 `PanelHeader`
- 决定 `QueryChip` 是否留在 `ui`
- 删除 `tone.ts`

第四阶段：

- 清理 `ui/src/index.ts` 中不再合理的导出
- 全仓搜索残留 `.ui-*` 组件 class 调用点
- 让业务层直接消费组件，不再依赖全局 recipe class

## 一句话结论

这次迁移最核心的方向不是“重建一个新的 `primitives.css`”，而是：

- `ui/css` 只做 token / semantic / base。
- `ui/src` 组件直接吃 token。
- `color/resolve.ts` 这类 token helper 保留。
- `uiTone` 和所有全局 `.ui-*` 组件 recipe class 全部退出体系。

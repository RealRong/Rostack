# UI Token 命名方案

## 前提

- 当前 `ui/legacy/css/*` 是历史遗留样式，不再作为新体系命名依据。
- 历史文件包括：
  - `ui/legacy/css/base.css`
  - `ui/legacy/css/core.css`
  - `ui/legacy/css/patterns.css`
  - `ui/legacy/css/primitives.css`
  - `ui/legacy/css/theme.css`
  - `ui/legacy/css/whiteboard.css`
- 新体系以 `ui/css/tokens.css` 为 source of truth。
- 新体系目标不是保留 Notion 原变量名，而是保留它们表达的视觉语义。

## 总体分层

新体系分四层：

1. Foundation Tokens
2. Semantic Tokens
3. Component-Local Tokens
4. Legacy Compatibility

边界必须稳定：

- `Foundation` 只描述可复用的设计资产，不描述具体组件。
- `Semantic` 只描述 UI 语义，不描述某个产品历史实现。
- `Component-Local` 只在组件内部短距离使用，不提升为全局公共资产。
- `Legacy` 只用于迁移过渡，不参与新命名设计。

## 目录建议

推荐最终目录：

- `ui/css/tokens.css`
- `ui/css/semantic.css`
- `ui/css/core.css`
- `ui/css/whiteboard.css`
- `ui/legacy/css/*`

职责：

- `tokens.css`
  - 只放 foundation tokens
  - 包含 light/dark 两套值
- `semantic.css`
  - 只放 semantic token 映射
  - 不放 palette 原始值
- `core.css`
  - import `tokens.css`
  - import `semantic.css`
  - import 仍然有效的基础样式文件
- `ui/legacy/css/*`
  - 只保留历史引用和迁移对照

## 命名原则

### 1. 不保留 Notion 历史缩写

不再使用：

- `popBac`
- `shaOutLg`
- `tokInpMenIteBac`
- `bacPri`
- `bacEle`
- `borStr`
- `texTer`

原因：

- 可读性差
- 不利于项目级维护
- 强绑定 Notion 内部实现历史

### 2. 命名优先表达“语义”，不是“来源”

应优先使用：

- `bg`
- `text`
- `icon`
- `border`
- `shadow`
- `overlay`
- `ring`
- `surface`

不优先使用：

- `notion`
- `popoverMenuItemTokenInput`
- `statusOptionCardBlue`

### 3. Foundation 与 Semantic 不混用

例如：

- `--ui-blue-bg-strong` 属于 foundation
- `--ui-bg-popover` 属于 semantic

前者表示“蓝色族的一种背景级别”，后者表示“浮层背景语义”。

## Foundation Tokens

Foundation token 放在 `ui/css/tokens.css`。

### A. Neutral 基础色

建议保留并扩展：

- `--ui-text-primary`
- `--ui-text-secondary`
- `--ui-text-tertiary`
- `--ui-text-disabled`
- `--ui-icon-primary`
- `--ui-icon-secondary`
- `--ui-icon-tertiary`
- `--ui-icon-disabled`
- `--ui-border-default`
- `--ui-border-muted`
- `--ui-border-strong`
- `--ui-bg-page`
- `--ui-bg-panel`
- `--ui-bg-subtle`
- `--ui-bg-card`
- `--ui-bg-hover`
- `--ui-bg-pressed`
- `--ui-overlay-bg`

说明：

- 这些是全局中性色基础资产
- 不绑定具体组件

### B. Color Family Tokens

继续使用当前方向：

- `--ui-default-text`
- `--ui-default-text-muted`
- `--ui-default-icon`
- `--ui-default-icon-muted`
- `--ui-default-border`
- `--ui-default-border-muted`
- `--ui-default-border-strong`
- `--ui-default-bg-soft`
- `--ui-default-bg-muted`
- `--ui-default-bg-strong`
- `--ui-default-card-bg`
- `--ui-default-card-bg-hover`
- `--ui-default-card-bg-pressed`

其他颜色族同理：

- `--ui-blue-*`
- `--ui-gray-*`
- `--ui-brown-*`
- `--ui-orange-*`
- `--ui-yellow-*`
- `--ui-green-*`
- `--ui-purple-*`
- `--ui-pink-*`
- `--ui-red-*`
- `--ui-teal-*`

### C. Effect Tokens

`shadow` 应进入 foundation token。

建议统一为：

- `--ui-shadow-xs`
- `--ui-shadow-sm`
- `--ui-shadow-md`
- `--ui-shadow-lg`
- `--ui-shadow-floating`

如果不需要那么多层，最小可行集合是：

- `--ui-shadow-sm`
- `--ui-shadow-floating`

含义：

- `sm` 用于轻量卡片、嵌入内容
- `floating` 用于 popover、menu、context menu、select panel、dialog 等悬浮层

### D. Radius / Motion / Z Tokens

如果后续一起规范，建议也进入 foundation：

- `--ui-radius-sm`
- `--ui-radius-md`
- `--ui-radius-lg`
- `--ui-duration-fast`
- `--ui-duration-normal`
- `--ui-ease-standard`
- `--ui-z-popover`
- `--ui-z-dialog`

如果暂时不做，也不要塞回 semantic。

## Semantic Tokens

Semantic token 放在 `ui/css/semantic.css`。

规则：

- 允许引用 foundation token
- 不允许直接写死具体颜色值

### A. Surface 语义

建议引入：

- `--ui-bg-canvas`
- `--ui-bg-surface`
- `--ui-bg-surface-muted`
- `--ui-bg-surface-subtle`
- `--ui-bg-floating`
- `--ui-bg-popover`
- `--ui-bg-dialog`
- `--ui-bg-field`
- `--ui-bg-field-embedded`

说明：

- `floating` 是抽象概念，适合 popover/menu/context menu/select panel
- `popover` 可以作为 `floating` 的别名，或者直接只保留一套
- 我更推荐统一收敛到 `floating`

### B. Text / Border / Ring 语义

建议引入：

- `--ui-fg-primary`
- `--ui-fg-secondary`
- `--ui-fg-tertiary`
- `--ui-fg-on-accent`
- `--ui-fg-on-danger`
- `--ui-border-subtle`
- `--ui-border-default`
- `--ui-border-strong`
- `--ui-border-floating`
- `--ui-ring-focus`

### C. Interactive 语义

建议引入：

- `--ui-bg-control-hover`
- `--ui-bg-control-pressed`
- `--ui-bg-selected`
- `--ui-bg-selected-hover`
- `--ui-bg-accent-soft`
- `--ui-bg-danger-soft`

### D. Floating / Overlay 语义

建议引入：

- `--ui-shadow-popover`
- `--ui-shadow-dialog`
- `--ui-shadow-floating`
- `--ui-overlay-backdrop`

如果 `popover` 和 `dialog` 阴影一致，可以只保留：

- `--ui-shadow-floating`

## Component-Local Tokens

这层不进入 `tokens.css`。

只在组件自己的 CSS 文件或局部容器内定义。

适合的命名：

- `--ui-menu-input-bg`
- `--ui-menu-item-hover-bg`
- `--ui-panel-header-divider`
- `--ui-picker-chip-gap`

判断标准：

- 如果只有某一个组件用
- 如果语义过于窄
- 如果离开组件就无法成立

那就不要提升为全局 token。

## 对 Notion 变量的映射建议

### 1. `--c-popBac`

原语义：

- popover 的背景色

建议映射：

- 首选：`--ui-bg-floating`
- 可选：`--ui-bg-popover`

建议：

- 如果 menu / popover / select panel / context menu 要统一，使用 `--ui-bg-floating`
- 如果未来真的区分 dialog / popover / menu，再在 semantic 层细分

结论：

- 应进入新体系
- 不保留原名
- 属于 semantic token

### 2. `--c-shaOutLg`

原语义：

- 大型外阴影

建议映射：

- 首选：`--ui-shadow-floating`
- 可选：`--ui-shadow-lg`

建议：

- 如果主要给浮层用，优先叫 `floating`
- 如果明确是纯视觉层级，不区分用途，也可叫 `lg`

结论：

- 应进入新体系
- 属于 foundation effect token

### 3. `--ca-tokInpMenIteBac`

原语义：

- token input / menu item / 嵌入式输入背景
- 语义边界不稳定，名字受历史实现影响很大

建议映射：

- 如果多处复用：`--ui-bg-field-embedded`
- 如果主要用于菜单输入：`--ui-menu-input-bg`
- 如果仅限某一个组件：保留在组件局部，不进入全局 tokens

结论：

- 不建议按原名进入全局 token
- 先判断是否跨组件复用
- 若复用，则进入 semantic
- 若不复用，则停留在 component-local

## 是否应放入 `tokens.css`

### 应放入 `tokens.css`

- 原始文字色
- 原始边框色
- 原始背景色
- option color family
- shadow
- overlay/backdrop
- radius

### 不应直接放入 `tokens.css`

- 某个组件专属 input 背景
- 某个 menu 专属 hover 背景
- 某个 picker 专属 chip 样式
- 某个历史特化面板色

这类要么进入 `semantic.css`，要么停留在组件层。

## Shadow 命名建议

推荐一套最实用的 shadow token：

- `--ui-shadow-sm`
- `--ui-shadow-md`
- `--ui-shadow-floating`

如果需要更完整：

- `--ui-shadow-xs`
- `--ui-shadow-sm`
- `--ui-shadow-md`
- `--ui-shadow-lg`
- `--ui-shadow-floating`
- `--ui-shadow-dialog`

推荐优先级：

1. `--ui-shadow-sm`
2. `--ui-shadow-floating`
3. 其余按需要补充

## Popover / Floating 命名建议

优先推荐统一为 floating：

- `--ui-bg-floating`
- `--ui-border-floating`
- `--ui-shadow-floating`

理由：

- 覆盖范围更大
- 可以服务 popover、menu、select、context menu
- 避免为每个悬浮组件单独发明一套 token

如果后续 dialog 明显不同，再单独增加：

- `--ui-bg-dialog`
- `--ui-shadow-dialog`

## Embedded Input 命名建议

对于“popover/menu 内部的输入容器背景”，推荐命名顺序：

1. `--ui-bg-field-embedded`
2. `--ui-bg-input-embedded`
3. `--ui-menu-input-bg`

使用标准：

- 跨场景复用时，用 `field-embedded`
- 菜单私有时，用 `menu-input-bg`

不建议使用：

- `token-input-menu-item-bg`
- `tokInpMenIteBac`

## 迁移规则

迁移时按下面顺序执行：

1. 先补全 `tokens.css`
2. 再建立 `semantic.css`
3. 新的 `core.css` 改为 import `tokens.css + semantic.css`
4. UI 组件只消费 semantic token
5. dataview / whiteboard 不再直接依赖 legacy token
6. `ui/legacy/css/*` 只保留迁移参考

## 最终判断标准

一个变量是否应该进入 `tokens.css`，用三个问题判断：

1. 它是否跨组件复用？
2. 它是否不依赖某个具体产品实现？
3. 它是否在 light/dark 中都需要成为稳定输入？

如果三个问题大多回答“是”，就进入 foundation token。

如果它表达的是 UI 角色而不是原始颜色，就进入 semantic token。

如果它只属于某一个组件细节，就留在 component-local。

## 本方案的核心结论

- `primitives.css` 那一套是历史遗留，不再作为新命名依据。
- `shadow` 应正式进入 foundation token。
- `popover background` 应进入 semantic token。
- `popover 内 input background` 不应直接按 Notion 原名提升为全局 token。
- 新体系应以 `tokens.css + semantic.css` 为中心，而不是继续扩展旧 `theme.css`。

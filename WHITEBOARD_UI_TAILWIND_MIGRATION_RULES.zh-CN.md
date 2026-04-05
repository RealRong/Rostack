# WHITEBOARD_UI_TAILWIND_MIGRATION_RULES.zh-CN

## 目标

为 `whiteboard/packages/whiteboard-react` 后续 UI 迁移建立统一规则。

迁移方向已经明确：

- 尽量把可复用交互组件迁到 `ui/src`
- 组件内部样式优先使用 Tailwind utility
- 停止新增和扩散 whiteboard 私有 `wb-*` UI class
- 停止继续兼容 whiteboard 私有颜色体系
- 统一收敛到 `ui/tailwind/preset.cjs` 与 `ui/css/tokens.css` 所代表的 UI 设计体系

这份文档不是“可选建议”，而是后续迁移的约束基线。

---

## 总原则

### 1. 迁移目标不是“把 CSS 改写成 Tailwind”

真正目标是：

- whiteboard chrome UI 与 `ui` 设计系统合流
- whiteboard 不再维护平行的一套按钮 / 浮层 / 面板 / 分隔线视觉体系
- 后续新功能优先复用 `ui` primitive，而不是继续在 `whiteboard-react.css` 里长出新样式

因此迁移时优先级应当是：

1. 先判断是否应直接复用 `ui` 组件
2. 不能复用时，容器结构用 Tailwind utility 直接写在 TSX
3. 再不行时，才考虑补 `ui` primitive

不是先写一套新的 whiteboard 专属 Tailwind 组合。

### 2. 停止扩散 `wb-*` UI class

从 `ViewportDock` 开始，whiteboard chrome UI 迁移采用以下策略：

- 不再为新 UI 结构新增 `wb-*` class
- 能直接用 Tailwind utility 的节点，直接写 utility
- 已迁移组件的旧 `wb-*` class 与对应 CSS 应删除，不做双轨保留

例外只允许出现在：

- 业务语义明显属于 canvas 内容对象，而不是 chrome UI
- 必须依赖复杂伪元素 / 选择器 / 动态 CSS 变量，且短期无法拆平
- 与缩放比例 `--wb-zoom` 深度耦合的交互句柄层

`ViewportDock` 不属于上述例外。

### 3. 停止兼容 whiteboard 私有颜色体系

后续迁移不再以这些目标为前提：

- 兼容 `--wb-surface`
- 兼容 `--wb-text-*`
- 兼容 `--wb-button-hover`
- 兼容 `--wb-panel-shadow`
- 继续沿用 `wb` 私有 alias token

统一策略是：

- 文本、边框、背景、hover、pressed、shadow 一律优先使用 `ui` 语义 token
- 颜色来源以 `ui/css/tokens.css` 和 `ui/css/semantic.css` 为准
- Tailwind class 以 `ui/tailwind/preset.cjs` 产出的语义 utility 为准

换句话说：

- **不为了迁移成本保留 `wb` 颜色语义**
- **不为了局部兼容再包一层 `wb -> ui` 的新映射**

如果某个 whiteboard 组件在视觉上确实需要一种 UI 体系里还没有的通用语义，应优先补到 `ui`，而不是补回 `wb`。

---

## 组件分层规则

### 1. Button 一律优先使用 `@ui` 的 `Button`

只要 whiteboard 中出现的是“按钮”，无论它是：

- 图标按钮
- 文本按钮
- 工具条按钮
- 面板内轻量操作按钮
- hover / focus / disabled 明确的标准交互按钮

都应优先通过 `@ui` 导入 `Button`。

这条规则从 `ViewportDock` 开始强制执行。

具体要求：

- 不再在 whiteboard 自己维护按钮底层视觉样式
- 不再为按钮保留独立 `wb-*button*` class
- 按钮的 hover / focus-visible / disabled / pressed 行为，统一走 `@ui/Button`

如果 `Button` 当前缺一个尺寸或布局变体，优先补 `ui/Button`，而不是在 whiteboard 单独写一套按钮样式。

### 2. 普通容器 `div` 直接写 Tailwind utility

对于这类结构节点：

- layer 容器
- panel 外壳
- inline group
- divider
- 对齐 / 间距 / 定位包装层

默认策略是：

- 直接在 TSX 中写 Tailwind utility
- 不为这类纯结构节点抽 whiteboard 私有 class
- 不为了“看起来整齐”把 utility 再包成局部 CSS class

这些容器节点不值得继续留在 `whiteboard-react.css`。

### 3. 什么时候应该补 `ui` primitive

如果同一类 whiteboard chrome 结构在多个组件中重复出现，且已经不是单个页面布局问题，应考虑沉淀到 `ui`：

- 浮动工具条容器
- 统一的 toolbar separator
- 小型 panel shell
- 白板 chrome 常用 icon action cluster

判断标准不是“能不能复用”，而是：

- 是否会在多个 whiteboard chrome 组件重复
- 是否已经具备明显的 UI 设计系统语义
- 是否值得从 whiteboard 迁出，成为跨模块 primitive

在这之前，不要为了抽象而抽象；普通容器先直接写 utility 即可。

---

## Token 与颜色规则

### 1. 统一使用 UI 语义 token

白板 chrome 迁移后使用的 token 来源应当是：

- `ui/css/tokens.css`
- `ui/css/semantic.css`
- `ui/tailwind/preset.cjs`

优先使用的语义包括但不限于：

- `text-fg`
- `text-fg-muted`
- `text-fg-tertiary`
- `bg-surface`
- `bg-floating`
- `bg-hover`
- `bg-pressed`
- `border-default`
- `border-strong`
- `border-divider`
- `shadow-popover`

### 2. 禁止继续依赖 `wb-*` UI token

迁移后的 whiteboard chrome 组件，不应再依赖以下类型的 token：

- `--wb-surface*`
- `--wb-text*`
- `--wb-border*`
- `--wb-button-hover`
- `--wb-panel-shadow`
- `--wb-danger`

如果一个样式在 `ui` 体系找不到等价语义：

1. 先判断是否可以接受直接用现有 UI 近似语义
2. 不能接受时，优先补 `ui` preset 或 `ui` semantic token
3. 不回退到 `wb` 私有 token

### 3. 允许少量 arbitrary value，但不能演化成新私有体系

当 preset 暂时没有某个 utility，而需求又足够简单时，允许少量 Tailwind arbitrary value，例如：

- 半透明边框
- 单次 panel 阴影
- 局部最小宽度 / 精确 padding

但约束是：

- 仅用于过渡或局部精确控制
- 不得在 whiteboard 内部演化成另一套“隐性 design token”
- 一旦同类写法在多个组件重复，应回收进 `ui`

---

## `ViewportDock` 试点规则

`ViewportDock` 是第一批试点，要求如下：

### 1. 按钮

- 所有 `button` 节点都改为 `@ui/Button`
- undo / redo / fit / zoom in / zoom out 使用图标按钮变体
- zoom 百分比使用文本按钮变体

### 2. 容器

- layer / dock / group / divider 保留普通 `div`
- 样式全部写 Tailwind utility
- 删除对应 `wb-canvas-dock-*` class 和 CSS

### 3. 颜色体系

- 不再引用 `wb` 颜色变量
- 统一使用 `ui` 颜色语义
- 不为 `ViewportDock` 保留旧视觉兼容逻辑

### 4. 不做双轨过渡

- 不保留旧 class
- 不保留旧 CSS 作为 fallback
- 不引入“新 utility + 旧 wb class”混合形态

`ViewportDock` 的意义不是单点改造，而是为后续 `ToolPalette`、`NodeToolbar`、`ContextMenu`、其他 whiteboard chrome 建立统一迁移模板。

---

## 后续迁移判定顺序

每迁一个 whiteboard chrome 组件，按以下顺序判断：

1. 这个节点是不是按钮
2. 如果是按钮，能否直接用 `ui/Button`
3. 如果不是按钮，是不是纯结构容器
4. 如果是纯结构容器，是否可以直接写 utility
5. 如果同类结构已经重复出现，是否应该抽成 `ui` primitive
6. 是否仍然依赖 `wb` 私有颜色 token
7. 如果依赖，能否直接改成 `ui` 语义 token

只要前面能成立，就不要回到：

- 自定义 whiteboard class
- 自定义 whiteboard token
- whiteboard 自己维护 button / panel / divider 样式

---

## 明确禁止项

后续迁移中，以下做法视为不符合本规则：

- 给新迁移的 chrome 组件继续添加 `wb-*` 样式类
- 为了省事继续引用 `--wb-*` 颜色变量
- 按钮仍然保留 whiteboard 自己的视觉样式实现
- 为纯布局容器新建 CSS class，而不是直接写 utility
- 同时保留新旧两套样式，做长期双轨兼容
- 把“只是一次性样式差异”的东西抽成 whiteboard 私有 Tailwind 组合体系

---

## 长期结果

这套规则执行完成后的目标状态应当是：

- whiteboard chrome UI 尽量复用 `ui` 组件
- whiteboard 自己不再维护平行的按钮与面板视觉体系
- `whiteboard-react.css` 主要保留 canvas 内容、缩放句柄、投影层、复杂交互层样式
- 纯 chrome UI 的结构样式逐步从 `whiteboard-react.css` 退出
- whiteboard 的颜色语义完全并入 UI 语义体系

这就是后续迁移的默认方向，不再重复讨论“是否继续保留 `wb` UI 体系”。

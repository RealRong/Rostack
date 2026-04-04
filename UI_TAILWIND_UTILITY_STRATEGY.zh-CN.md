# UI Tailwind Utility 策略

## 背景

当前我们已经把方向切到了：

- `ui/css` 只保留 `tokens.css`、`semantic.css`、`base.css`、`core.css`
- 不再保留 `primitives.css`、`patterns.css`、`theme.css`
- 不再保留 `.ui-control`、`.ui-popover-panel`、`.ui-surface-floating` 这类组合 recipe class
- 组件样式优先回到组件自身

但在真实落地中，已经出现了一个新问题：

- 因为 Tailwind 侧没有足够的 token-aware utility，代码里开始大量出现 arbitrary value
- 比如：
  - `[background-color:var(--ui-control-hover)]`
  - `[border-color:var(--ui-divider)]`
  - `[background-color:var(--ui-floating-bg)]`
  - `[box-shadow:var(--ui-popover-shadow)]`
  - `[background-color:var(--ui-accent-overlay)]`

这说明我们现在缺的不是“再来一层全局 CSS class”，而是“更贴近 Tailwind 习惯的单属性 utility”。

## 核心结论

需要新增一小批 utility。

但必须满足三个约束：

- 只能是单属性 utility
- 尽量遵守 Tailwind 的表达习惯
- 不能退回到 recipe class

也就是：

- 可以有 `bg-red`
- 可以有 `border-muted`
- 可以有 `text-secondary`
- 可以有 `shadow-floating`

但不能有：

- `.surface-floating`
- `.popover-panel`
- `.control-button`
- `.chip-control`
- `.panel-control`

这些都属于“一个 class 同时改多个属性”的 recipe class，会重新把我们带回旧体系。

## 为什么不能只靠 arbitrary value

短期内 arbitrary value 很快，但长期有几个问题：

- 可读性差
- 重复太多
- 难以搜索和统一替换
- 很难一眼看出哪些是设计系统允许的语义值，哪些只是临时写法

当 `[background-color:var(--ui-control-hover)]` 在几十个地方重复时，它已经不再是“灵活”，而是在泄漏设计系统 API。

所以长期需要把高频 token 提升成 utility。

## 为什么不能只靠 `theme.extend.colors`

这是一个关键边界。

普通 Tailwind `colors` 配置只适合这种情况：

- 一个名字在不同属性下共享同一个值

例如：

- `background`
- `foreground`
- `primary`
- `destructive`
- `muted`

这些值本来就是语义色，可以合理映射到 Tailwind `colors`。

但 option color 体系不是这样。

例如 `red`：

- `bg-red` 应该对应 `--ui-red-bg-strong`
- `text-red` 应该对应 `--ui-red-text`
- `border-red` 应该对应 `--ui-red-border`

这三个值不是同一个 token。

所以 option color 这类体系，不能只靠 `theme.extend.colors.red` 解决。

否则：

- `bg-red`
- `text-red`
- `border-red`

都会落到同一个颜色值上，这和我们的 token 模型冲突。

## 推荐的两层方案

### 第一层：保留少量 `theme.extend`

适合放到 `theme.extend` 的，是那些跨属性复用也合理的值。

建议保留和扩展：

- `background`
- `foreground`
- `primary`
- `primary-foreground`
- `secondary`
- `secondary-foreground`
- `muted`
- `muted-foreground`
- `destructive`
- `destructive-foreground`
- `card`
- `card-foreground`
- `popover`
- `popover-foreground`
- `border`
- `input`
- `ring`
- `shadow-sm`
- `shadow-floating`

这一层的职责是：

- 让 Tailwind 原生 utility 可以继续工作
- 覆盖全局通用语义
- 不处理复杂的按属性分裂的 token family

### 第二层：增加一个很小的 Tailwind plugin

这层专门解决“同一语义 family 在不同 CSS 属性下值不同”的问题。

例如：

- `bg-red`
- `text-red`
- `border-red`

或者：

- `bg-surface`
- `border-divider`
- `text-secondary`

它们看起来像普通 Tailwind utility，但底层值不一定来自同一套 `colors`。

这层应该由 Tailwind plugin 生成。

plugin 的职责不是创造 recipe class，而是生成单属性 utility。

## 允许新增的 utility 类型

建议只允许以下几类。

### 1. 中性色 utility

这些是高频且稳定的。

文本：

- `text-primary`
- `text-secondary`
- `text-tertiary`
- `text-disabled`

边框：

- `border-default`
- `border-muted`
- `border-strong`
- `border-divider`
- `border-divider-strong`

背景：

- `bg-surface`
- `bg-surface-muted`
- `bg-surface-subtle`
- `bg-hover`
- `bg-pressed`
- `bg-overlay-subtle`
- `bg-overlay-strong`

### 2. 浮层 / 表单 utility

这类也很高频。

背景：

- `bg-floating`
- `bg-field`
- `bg-field-embedded`

边框：

- `border-floating`

阴影：

- `shadow-sm`
- `shadow-floating`
- `shadow-popover`

说明：

- `shadow-popover` 和 `shadow-floating` 最终是否保留两个名字，需要看是否要强制统一
- 如果 `--ui-popover-shadow` 就是浮层标准阴影，那保留一个也够

### 3. Accent utility

这类用于交互高亮。

背景：

- `bg-accent-overlay`
- `bg-accent-overlay-subtle`
- `bg-accent-tint`

边框：

- `border-accent-divider`
- `border-accent-frame`

文本：

- `text-accent`

### 4. Option color utility

这类不能靠 `theme.colors`，必须独立生成。

建议先只覆盖高频项：

- `bg-default`
- `bg-gray`
- `bg-brown`
- `bg-orange`
- `bg-yellow`
- `bg-green`
- `bg-blue`
- `bg-purple`
- `bg-pink`
- `bg-red`

- `text-default`
- `text-gray`
- `text-brown`
- `text-orange`
- `text-yellow`
- `text-green`
- `text-blue`
- `text-purple`
- `text-pink`
- `text-red`

- `border-default`
- `border-gray`
- `border-brown`
- `border-orange`
- `border-yellow`
- `border-green`
- `border-blue`
- `border-purple`
- `border-pink`
- `border-red`

如果后续需要更细粒度，再考虑：

- `bg-red-soft`
- `bg-red-muted`
- `bg-red-card`

但初期不建议全量展开，不然 utility 会爆炸。

## 不应该新增的东西

以下内容不建议新增。

### 1. 组合 recipe class

不应该出现：

- `surface-floating`
- `surface-content`
- `control`
- `button-primary`
- `button-outline`
- `chip-control`
- `panel-control`
- `query-chip`

原因：

- 一个 class 同时控制多个 CSS 属性
- 重新把组件视觉抽离出组件
- 重新回到旧 `primitives.css` 模型

### 2. 过细的 token 直出 utility

不建议一开始就把所有 token 暴露成 utility，例如：

- `bg-default-bg-strong`
- `bg-blue-card-bg-hover`
- `border-gray-border-muted`

这种命名虽然精确，但过于贴近 token 内部结构，学习成本高，且会把 CSS API 表面积迅速放大。

### 3. 与 Tailwind 默认认知强冲突的命名

这点要特别小心。

例如在很多 Tailwind 项目里：

- `text-primary` 通常被理解为品牌主色

但在我们这里，如果你定义成“主文本色”，也不是不能做，只是要保证全项目统一理解。

所以命名上有两个方案。

方案 A：沿用当前 shadcn / Tailwind 风格

- `background`
- `foreground`
- `primary`
- `secondary`
- `muted`
- `destructive`

优点：

- 和常见生态习惯一致

缺点：

- 某些语义会偏组件系统风格，不一定完全符合你当前设计语言

方案 B：更直白的中性命名

- `text-primary`
- `text-secondary`
- `border-muted`
- `bg-surface`

优点：

- 语义直接

缺点：

- 和 Tailwind 常见项目里的 `primary` 语义不完全一致

建议：

- 中性色和结构色用直白命名
- 品牌/强调色继续保留 `primary`、`destructive`

这样两边不会混。

## 最小落地集合

如果要非常克制地推进，建议只先做下面这一批。

### 第一批必须有

- `bg-surface`
- `bg-surface-muted`
- `bg-surface-subtle`
- `bg-hover`
- `bg-pressed`
- `bg-floating`
- `bg-field`
- `bg-field-embedded`

- `text-primary`
- `text-secondary`
- `text-tertiary`
- `text-disabled`
- `text-accent`

- `border-default`
- `border-muted`
- `border-strong`
- `border-divider`
- `border-divider-strong`
- `border-floating`

- `shadow-sm`
- `shadow-popover`

### 第二批再补

- `bg-accent-overlay`
- `bg-accent-overlay-subtle`
- `border-accent-divider`
- `border-accent-frame`

### 第三批按需补

- option color utility
- 只补高频的 `bg-*` / `text-*` / `border-*`

## 和当前代码状态的关系

当前仓库里已经有大量这类写法：

- `[background-color:var(--ui-control-hover)]`
- `[border-color:var(--ui-divider)]`
- `[background-color:var(--ui-floating-bg)]`
- `[box-shadow:var(--ui-popover-shadow)]`

这些恰好就是未来最适合被抽成 utility 的高频项。

也就是说，现阶段 arbitrary value 不是错，只是临时过渡。

后续真正清理时，应优先把这些重复最高的表达收敛成 utility。

## Tailwind dark mode 的补充注意事项

目前 token 体系已经显式切到：

- `.ui-light-theme`
- `.ui-dark-theme`

而 `ui/tailwind/preset.cjs` 里现在还是：

- `darkMode: ['class']`

虽然当前仓库里几乎没用 `dark:` 变体，但如果后面要继续强化 Tailwind utility，这里需要一起考虑。

建议原则：

- 尽量继续依赖 token 切主题
- 不要重新把主题判断写进组件 class
- 如果未来确实要支持 `dark:` 变体，必须确保它和 `.ui-dark-theme` 的入口语义一致

换句话说：

- 主题切换仍应由 token class 主导
- utility 只消费 token，不自己判主题

## 一句话原则

可以新增 utility，但只能新增“像 Tailwind 的单属性 utility”。

不能新增“像旧系统的 recipe class”。

最小正确方向是：

- `theme.extend` 处理共享语义
- 一个小 plugin 处理 property-aware token utility
- 只补高频 utility
- 继续禁止一个 class 改多个属性

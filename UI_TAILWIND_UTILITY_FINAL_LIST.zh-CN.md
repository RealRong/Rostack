# UI Tailwind Utility 最终命名清单

## 目标

这份文档只回答一件事：

- 最终哪些 utility 应该新增
- 哪些应该继续留在 `theme.extend`
- 哪些明确不做

约束已经固定：

- 只能新增单属性 utility
- 不新增 recipe class
- 不回到 `primitives.css`
- utility 命名尽量贴近 Tailwind

## 最终结构

最终建议只保留两层。

### 1. `theme.extend`

职责：

- 承载 Tailwind 原生就适合消费的共享语义
- 继续支持 `bg-background`、`text-foreground`、`bg-card` 这类标准模式

### 2. 小型 plugin 生成 utility

职责：

- 生成单属性 token utility
- 解决 option color 这类“同名但不同属性值不同”的问题
- 不生成组合样式

## `theme.extend` 最终保留项

这层只保留真正适合走 Tailwind 原生语义的部分。

### 颜色

- `background`
- `foreground`
- `border`
- `input`
- `ring`

- `primary`
- `primary-foreground`
- `secondary`
- `secondary-foreground`
- `muted`
- `muted-foreground`
- `accent`
- `accent-foreground`
- `destructive`
- `destructive-foreground`
- `card`
- `card-foreground`
- `popover`
- `popover-foreground`

### 半径

- `lg`
- `md`
- `sm`

### 阴影

建议补到 `theme.extend.boxShadow`：

- `sm`
- `popover`

说明：

- `shadow-sm` 对应 `--ui-shadow-sm`
- `shadow-popover` 对应 `--ui-popover-shadow`

这里不建议再保留 `shadow-floating` 作为对外名字。
因为从组件语义上看，外部更容易理解 `popover`，而不是 `floating`。

## plugin utility 最终保留项

这批才是新增重点。

### A. 文本 utility

这些只改 `color`。

- `text-primary`
- `text-secondary`
- `text-tertiary`
- `text-disabled`
- `text-accent`

对应 token：

- `text-primary` -> `--ui-text-primary`
- `text-secondary` -> `--ui-text-secondary`
- `text-tertiary` -> `--ui-text-tertiary`
- `text-disabled` -> `--ui-text-disabled`
- `text-accent` -> `--ui-accent-text`

### B. 边框颜色 utility

这些只改 `border-color`。

- `border-default`
- `border-muted`
- `border-strong`
- `border-divider`
- `border-divider-strong`
- `border-floating`
- `border-accent-divider`
- `border-accent-frame`

对应 token：

- `border-default` -> `--ui-border-default`
- `border-muted` -> `--ui-border-muted`
- `border-strong` -> `--ui-border-strong`
- `border-divider` -> `--ui-divider`
- `border-divider-strong` -> `--ui-divider-strong`
- `border-floating` -> `--ui-floating-border`
- `border-accent-divider` -> `--ui-accent-divider`
- `border-accent-frame` -> `--ui-accent-frame-border`

### C. 背景 utility

这些只改 `background-color`。

- `bg-surface`
- `bg-surface-muted`
- `bg-surface-subtle`
- `bg-hover`
- `bg-pressed`
- `bg-overlay-subtle`
- `bg-overlay-strong`
- `bg-floating`
- `bg-field`
- `bg-field-embedded`
- `bg-accent-overlay`
- `bg-accent-overlay-subtle`
- `bg-accent-tint`

对应 token：

- `bg-surface` -> `--ui-surface`
- `bg-surface-muted` -> `--ui-surface-muted`
- `bg-surface-subtle` -> `--ui-surface-subtle`
- `bg-hover` -> `--ui-control-hover`
- `bg-pressed` -> `--ui-control-pressed`
- `bg-overlay-subtle` -> `--ui-overlay-subtle`
- `bg-overlay-strong` -> `--ui-overlay-strong`
- `bg-floating` -> `--ui-floating-bg`
- `bg-field` -> `--ui-field-bg`
- `bg-field-embedded` -> `--ui-field-embedded-bg`
- `bg-accent-overlay` -> `--ui-accent-overlay`
- `bg-accent-overlay-subtle` -> `--ui-accent-overlay-subtle`
- `bg-accent-tint` -> `--ui-accent-tint-subtle`

## option color utility 最终名单

这批必须通过 plugin 生成，不能放进 `theme.colors`。

原因已经固定：

- `bg-red`
- `text-red`
- `border-red`

对应的 token 不是一个值。

## option color 第一批范围

第一批只做 badge / tag / state 类高频使用，不全量铺开。

### 背景

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

语义：

- 全部映射到 `--ui-<color>-bg-strong`

### 文本

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

语义：

- 全部映射到 `--ui-<color>-text`

### 边框

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

语义：

- option color 版本映射到 `--ui-<color>-border`

## 命名冲突处理

这里要定死一个规则。

因为以下名字会冲突：

- `border-default`

它既可能表示中性色 token：

- `--ui-border-default`

也可能表示 option color token：

- `--ui-default-border`

这两者不能共用一个 utility 名。

### 最终规则

中性色使用裸名字：

- `border-default`
- `border-muted`
- `border-strong`

option color 使用带前缀名字：

- `border-option-default`
- `border-option-gray`
- `border-option-brown`
- `border-option-orange`
- `border-option-yellow`
- `border-option-green`
- `border-option-blue`
- `border-option-purple`
- `border-option-pink`
- `border-option-red`

同理，背景和文本也统一带前缀：

- `bg-option-default`
- `bg-option-gray`
- `bg-option-brown`
- `bg-option-orange`
- `bg-option-yellow`
- `bg-option-green`
- `bg-option-blue`
- `bg-option-purple`
- `bg-option-pink`
- `bg-option-red`

- `text-option-default`
- `text-option-gray`
- `text-option-brown`
- `text-option-orange`
- `text-option-yellow`
- `text-option-green`
- `text-option-blue`
- `text-option-purple`
- `text-option-pink`
- `text-option-red`

这样有两个好处：

- 不和中性色 utility 冲突
- 一眼能看出这是 option color 体系，不是中性语义体系

## 最终建议的最小首发集合

如果要非常克制地上线，建议先只做以下名字。

### 第一组：中性结构色

- `text-primary`
- `text-secondary`
- `text-tertiary`
- `text-disabled`

- `border-default`
- `border-muted`
- `border-strong`
- `border-divider`
- `border-divider-strong`
- `border-floating`

- `bg-surface`
- `bg-surface-muted`
- `bg-surface-subtle`
- `bg-hover`
- `bg-pressed`
- `bg-floating`
- `bg-field`
- `bg-field-embedded`

- `shadow-sm`
- `shadow-popover`

### 第二组：accent 交互色

- `text-accent`
- `border-accent-divider`
- `border-accent-frame`
- `bg-accent-overlay`
- `bg-accent-overlay-subtle`
- `bg-accent-tint`

### 第三组：option color

- `bg-option-*`
- `text-option-*`
- `border-option-*`

其中 `*` 范围为：

- `default`
- `gray`
- `brown`
- `orange`
- `yellow`
- `green`
- `blue`
- `purple`
- `pink`
- `red`

## 明确不做的项

以下名字明确不做。

### recipe class

- `surface-floating`
- `surface-content`
- `surface-empty`
- `control`
- `button-primary`
- `button-outline`
- `chip-control`
- `panel-control`
- `query-chip`
- `popover-panel`

### 多属性 utility

不允许出现这种 utility：

- 一个名字同时设置 `background-color + border-color`
- 一个名字同时设置 `background-color + color`
- 一个名字同时设置 `border + box-shadow + background`

只允许：

- `bg-*`
- `text-*`
- `border-*`
- `shadow-*`

### 全量 token 直出

不做这种名字：

- `bg-default-bg-strong`
- `bg-blue-card-bg-hover`
- `border-gray-border-muted`

这些太贴近内部 token 结构，不适合成为对外 utility API。

## 对当前代码的指导意义

当前代码里反复出现的这些表达，未来都应该优先替换：

- `[background-color:var(--ui-control-hover)]` -> `bg-hover`
- `[background-color:var(--ui-control-pressed)]` -> `bg-pressed`
- `[border-color:var(--ui-divider)]` -> `border-divider`
- `[background-color:var(--ui-floating-bg)]` -> `bg-floating`
- `[border-color:var(--ui-floating-border)]` -> `border-floating`
- `[box-shadow:var(--ui-popover-shadow)]` -> `shadow-popover`
- `[background-color:var(--ui-accent-overlay)]` -> `bg-accent-overlay`

这就是后续清理 arbitrary value 的优先顺序。

## 一句话结论

最终只做两种东西：

- `theme.extend` 里的标准共享语义
- plugin 生成的单属性 utility

并且只开放三组名字：

- 中性色结构 utility
- accent utility
- option color utility

除此之外，不再新增任何 recipe class。

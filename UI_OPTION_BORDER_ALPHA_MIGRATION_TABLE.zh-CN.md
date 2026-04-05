# UI Option Border Alpha 迁移表

## 背景

当前 `ui/src/color/resolve.ts` 中，option 颜色的 `card-border` 解析是：

```ts
'card-border': 'border-muted'
```

对应当前实现：

```ts
boxShadow: `var(--ui-shadow-sm), 0 0 0 1px ${resolveOptionColorToken(color, 'card-border')}`
```

这条映射是错的。

原因：

- `card-border` 当前被解析成 `--ui-<color>-border-muted`
- 但以 `styles.css` 为基准，kanban / card 上这类 1px ring 应该使用的是带透明度的 border token
- 以红色为例，应该对齐 `--ca-redBorSecTra`
- 不是 `--c-redBorSec`

也就是说，当前错在：

- 把“透明彩色边框”错误映射成了“实色淡边框”

这个问题不只影响红色，而是影响整套 option 颜色体系。

## 结论

### 1. 需要新增一条 token 轴

当前 `ui/css/tokens.css` 里已经有：

- 实色 border
- 透明 bg

但缺少：

- 透明 border

应该新增：

- `--ui-<color>-border-alpha`
- `--ui-<color>-border-alpha-muted`
- `--ui-<color>-border-alpha-strong`

中性色同理：

- `--ui-border-alpha`
- `--ui-border-alpha-muted`
- `--ui-border-alpha-strong`

### 2. `card-border` 应改为透明 border 语义

option card 的 1px ring 应该映射到：

- `--ui-<color>-border-alpha-muted`

而不是：

- `--ui-<color>-border-muted`

也就是：

- `card-border` -> `border-alpha-muted`

### 3. 不要从实色 border 推导透明度

不能使用：

- `rgb(from var(--ui-red-border) r g b / 0.12)`
- `rgb(from var(--ui-red-border) r g b / var(--tw-border-opacity))`

原因：

- `styles.css` 里的透明 border 是一等 token
- 不是“实色 border + 任意 opacity”的运行时推导
- 现有系统里本来就有很多 token 自带 alpha，再套 opacity 会丢语义

结论是：

- 透明 border 必须直接建 token
- 不能依赖 opacity 推导

## 现状问题清单

### 当前 `resolve.ts` 中的错误或缺失

文件：

- [resolve.ts](/Users/realrong/Rostack/ui/src/color/resolve.ts)

当前映射：

- `badge-border -> border`
- `column-border -> border-muted`
- `card-border -> border-muted`

其中最明显的问题是：

- `card-border`

因为 `card-border` 实际对应的是：

- `styles.css` 的 `BorSecTra`

不是：

- `BorSec`

### 当前 `tokens.css` 中缺失的 token 类型

文件：

- [tokens.css](/Users/realrong/Rostack/ui/css/tokens.css)

当前每个颜色族大致有：

- `text`
- `text-muted`
- `icon`
- `icon-muted`
- `border`
- `border-muted`
- `border-strong`
- `bg-soft`
- `bg-muted`
- `bg-strong`
- `card-bg`
- `card-bg-hover`
- `card-bg-pressed`

缺失的是：

- `border-alpha`
- `border-alpha-muted`
- `border-alpha-strong`

## `styles.css` 命名规律

以红色为例：

### 实色边框

- `--c-redBorPri`
- `--c-redBorSec`
- `--c-redBorStr`

### 透明边框

- `--ca-redBorPriTra`
- `--ca-redBorSecTra`
- `--ca-redBorStrTra`

### 透明背景

- `--ca-redBacPriTra`
- `--ca-redBacSecTra`
- `--ca-redBacTerTra`

这三组是并列关系，不应该混用。

## 新 token 命名建议

建议在 `ui/css/tokens.css` 中统一新增：

### Neutral / default

- `--ui-border-alpha`
- `--ui-border-alpha-muted`
- `--ui-border-alpha-strong`

- `--ui-default-border-alpha`
- `--ui-default-border-alpha-muted`
- `--ui-default-border-alpha-strong`

### Color families

每个颜色族新增：

- `--ui-blue-border-alpha`
- `--ui-blue-border-alpha-muted`
- `--ui-blue-border-alpha-strong`

- `--ui-brown-border-alpha`
- `--ui-brown-border-alpha-muted`
- `--ui-brown-border-alpha-strong`

- `--ui-gray-border-alpha`
- `--ui-gray-border-alpha-muted`
- `--ui-gray-border-alpha-strong`

- `--ui-green-border-alpha`
- `--ui-green-border-alpha-muted`
- `--ui-green-border-alpha-strong`

- `--ui-orange-border-alpha`
- `--ui-orange-border-alpha-muted`
- `--ui-orange-border-alpha-strong`

- `--ui-pink-border-alpha`
- `--ui-pink-border-alpha-muted`
- `--ui-pink-border-alpha-strong`

- `--ui-purple-border-alpha`
- `--ui-purple-border-alpha-muted`
- `--ui-purple-border-alpha-strong`

- `--ui-red-border-alpha`
- `--ui-red-border-alpha-muted`
- `--ui-red-border-alpha-strong`

- `--ui-teal-border-alpha`
- `--ui-teal-border-alpha-muted`
- `--ui-teal-border-alpha-strong`

- `--ui-yellow-border-alpha`
- `--ui-yellow-border-alpha-muted`
- `--ui-yellow-border-alpha-strong`

## `styles.css` -> `tokens.css` 映射总表

下面的映射表只关注 option 颜色体系里和 border 相关的部分。

### Default / neutral

| styles.css | 目标 tokens.css |
|---|---|
| `--c-borPri` | `--ui-default-border` |
| `--c-borSec` | `--ui-default-border-muted` |
| `--c-borStr` | `--ui-default-border-strong` |
| `--ca-borPriTra` | `--ui-default-border-alpha` |
| `--ca-borSecTra` | `--ui-default-border-alpha-muted` |
| `--ca-borStrTra` | `--ui-default-border-alpha-strong` |

### Blue

| styles.css | 目标 tokens.css |
|---|---|
| `--c-bluBorPri` | `--ui-blue-border` |
| `--c-bluBorSec` | `--ui-blue-border-muted` |
| `--c-bluBorStr` | `--ui-blue-border-strong` |
| `--ca-bluBorPriTra` | `--ui-blue-border-alpha` |
| `--ca-bluBorSecTra` | `--ui-blue-border-alpha-muted` |
| `--ca-bluBorStrTra` | `--ui-blue-border-alpha-strong` |

### Brown

| styles.css | 目标 tokens.css |
|---|---|
| `--c-broBorPri` | `--ui-brown-border` |
| `--c-broBorSec` | `--ui-brown-border-muted` |
| `--c-broBorStr` | `--ui-brown-border-strong` |
| `--ca-broBorPriTra` | `--ui-brown-border-alpha` |
| `--ca-broBorSecTra` | `--ui-brown-border-alpha-muted` |
| `--ca-broBorStrTra` | `--ui-brown-border-alpha-strong` |

### Gray

| styles.css | 目标 tokens.css |
|---|---|
| `--c-graBorPri` | `--ui-gray-border` |
| `--c-graBorSec` | `--ui-gray-border-muted` |
| `--c-graBorStr` | `--ui-gray-border-strong` |
| `--ca-graBorPriTra` | `--ui-gray-border-alpha` |
| `--ca-graBorSecTra` | `--ui-gray-border-alpha-muted` |
| `--ca-graBorStrTra` | `--ui-gray-border-alpha-strong` |

### Green

| styles.css | 目标 tokens.css |
|---|---|
| `--c-greBorPri` | `--ui-green-border` |
| `--c-greBorSec` | `--ui-green-border-muted` |
| `--c-greBorStr` | `--ui-green-border-strong` |
| `--ca-greBorPriTra` | `--ui-green-border-alpha` |
| `--ca-greBorSecTra` | `--ui-green-border-alpha-muted` |
| `--ca-greBorStrTra` | `--ui-green-border-alpha-strong` |

### Orange

| styles.css | 目标 tokens.css |
|---|---|
| `--c-oraBorPri` | `--ui-orange-border` |
| `--c-oraBorSec` | `--ui-orange-border-muted` |
| `--c-oraBorStr` | `--ui-orange-border-strong` |
| `--ca-oraBorPriTra` | `--ui-orange-border-alpha` |
| `--ca-oraBorSecTra` | `--ui-orange-border-alpha-muted` |
| `--ca-oraBorStrTra` | `--ui-orange-border-alpha-strong` |

### Pink

| styles.css | 目标 tokens.css |
|---|---|
| `--c-pinBorPri` | `--ui-pink-border` |
| `--c-pinBorSec` | `--ui-pink-border-muted` |
| `--c-pinBorStr` | `--ui-pink-border-strong` |
| `--ca-pinBorPriTra` | `--ui-pink-border-alpha` |
| `--ca-pinBorSecTra` | `--ui-pink-border-alpha-muted` |
| `--ca-pinBorStrTra` | `--ui-pink-border-alpha-strong` |

### Purple

| styles.css | 目标 tokens.css |
|---|---|
| `--c-purBorPri` | `--ui-purple-border` |
| `--c-purBorSec` | `--ui-purple-border-muted` |
| `--c-purBorStr` | `--ui-purple-border-strong` |
| `--ca-purBorPriTra` | `--ui-purple-border-alpha` |
| `--ca-purBorSecTra` | `--ui-purple-border-alpha-muted` |
| `--ca-purBorStrTra` | `--ui-purple-border-alpha-strong` |

### Red

| styles.css | 目标 tokens.css |
|---|---|
| `--c-redBorPri` | `--ui-red-border` |
| `--c-redBorSec` | `--ui-red-border-muted` |
| `--c-redBorStr` | `--ui-red-border-strong` |
| `--ca-redBorPriTra` | `--ui-red-border-alpha` |
| `--ca-redBorSecTra` | `--ui-red-border-alpha-muted` |
| `--ca-redBorStrTra` | `--ui-red-border-alpha-strong` |

### Teal

| styles.css | 目标 tokens.css |
|---|---|
| `--c-teaBorPri` | `--ui-teal-border` |
| `--c-teaBorSec` | `--ui-teal-border-muted` |
| `--c-teaBorStr` | `--ui-teal-border-strong` |
| `--ca-teaBorPriTra` | `--ui-teal-border-alpha` |
| `--ca-teaBorSecTra` | `--ui-teal-border-alpha-muted` |
| `--ca-teaBorStrTra` | `--ui-teal-border-alpha-strong` |

### Yellow

| styles.css | 目标 tokens.css |
|---|---|
| `--c-yelBorPri` | `--ui-yellow-border` |
| `--c-yelBorSec` | `--ui-yellow-border-muted` |
| `--c-yelBorStr` | `--ui-yellow-border-strong` |
| `--ca-yelBorPriTra` | `--ui-yellow-border-alpha` |
| `--ca-yelBorSecTra` | `--ui-yellow-border-alpha-muted` |
| `--ca-yelBorStrTra` | `--ui-yellow-border-alpha-strong` |

## `resolveOptionColorToken` usage 迁移表

这一节给出 `UiOptionColorTokenUsage` 应该如何迁移。

当前 usage：

- `badge-border`
- `column-border`
- `card-border`

建议目标映射如下。

### 1. `badge-border`

当前：

- `badge-border -> border`

建议：

- 保持不变

理由：

- option badge 的 border 多数是实色边
- `styles.css` 里 badge/pill 本身通常不是用 option 的 `BorSecTra` 作为主边
- 这里优先保留现有映射

目标：

- `badge-border -> --ui-<color>-border`

### 2. `column-border`

当前：

- `column-border -> border-muted`

建议：

- 第一版可保持不变

理由：

- 目前 `resolveOptionColumnStyle()` 只返回 `backgroundColor`
- `column-border` 尚未成为主要问题点
- 如果后面 column 容器真正引入 1px outline，需要再明确它应该对齐 `BorSecTra` 还是 `BorSec`

当前建议：

- 暂不改 usage 语义

### 3. `card-border`

当前：

- `card-border -> border-muted`

建议：

- 改为 `border-alpha-muted`

理由：

- 对齐 `styles.css` 的 `--ca-<color>BorSecTra`
- 这是 card ring 的正确 token 语义

目标：

- `card-border -> --ui-<color>-border-alpha-muted`

## `resolveOptionCardStyle` 正确目标

当前错误实现：

```ts
boxShadow: `var(--ui-shadow-sm), 0 0 0 1px ${resolveOptionColorToken(color, 'card-border')}`
```

问题不在 `boxShadow` 结构本身，而在 `card-border` 的解析目标错了。

正确目标语义应该是：

- card 背景：`card-bg`
- card 1px ring：`border-alpha-muted`

也就是按红色举例，应当对齐：

- background -> `--ui-red-card-bg`
- ring -> `--ui-red-border-alpha-muted`

而不是：

- ring -> `--ui-red-border-muted`

## `tokens.css` 中建议新增的具体 token 值来源

下面列出 light / dark 对应来源。

### Light

直接对齐 `styles.css`：

- `--ui-red-border-alpha` -> `#ce18002a`
- `--ui-red-border-alpha-muted` -> `#df160018`
- `--ui-red-border-alpha-strong` -> `#c41b0041`

其它颜色同理，直接取：

- `BorPriTra`
- `BorSecTra`
- `BorStrTra`

### Dark

dark 也应保持同样规律，对齐 `styles.css` dark 部分的：

- `--ca-<color>BorPriTra`
- `--ca-<color>BorSecTra`
- `--ca-<color>BorStrTra`

不要从 light token 推导，也不要从实色 dark border 推导。

## 实施优先级

建议按以下顺序迁移：

1. 先在 `ui/css/tokens.css` 中补齐全部 `border-alpha` token
2. 再扩展 `UiOptionColorTokenUsage`
3. 再修正 `resolveOptionColorToken()` 中 `card-border` 的 suffix
4. 最后检查所有 `box-shadow: 0 0 0 1px ...` 的调用点

优先关注：

- `resolveOptionCardStyle`
- kanban card
- kanban overlay / stacked card
- 任何 tinted 区域里的 card ring

## 最终结论

当前问题不是 `resolveOptionCardStyle` 的 `box-shadow` 写法错了，而是：

- `card-border` 使用了错误的 token 轴

应当从：

- `border-muted`

切换为：

- `border-alpha-muted`

并且这不是 red 的特例，而是整个 option 颜色体系都应统一迁移的规则。

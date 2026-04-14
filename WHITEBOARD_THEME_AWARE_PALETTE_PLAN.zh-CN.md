# Whiteboard 主题感知调色板方案

## 目标

构建一套 whiteboard 专用调色板系统，满足以下要求：

- 以 [colors.md](./colors.md) 作为颜色来源
- 支持亮色 / 暗色主题自动切换
- 分别驱动填充色、边框色、文字色面板
- 让 sticky 的菜单预览、工具栏 swatch、实际节点渲染保持一致
- 避免在节点样式里存储 `#FFFFFF` 这种固定主题的 hex 值
- 避免让持久化数据直接依赖 CSS 变量名

## 问题

当前 whiteboard 的颜色链路主要来自 `shared/ui/css/tokens.css` 的语义色，例如：

- `var(--ui-*-surface)`
- `var(--ui-*-surface-pressed)`
- `var(--ui-*-border-strong)`
- `var(--ui-*-text-secondary)`

这套机制适合通用 UI 语义，但不适合 classic whiteboard 这种高密度调色板。

如果节点直接存储字面值，例如：

```ts
style.fill = '#FFFFFF'
```

那么这个颜色在主题切换后不会自动变化，因为持久化数据里已经是最终结果值。

## 最终方向

继续使用 `colors.md` 作为调色板数据源，但不要把原始 hex 直接写入 whiteboard 节点样式。

正确做法是：

1. 为 whiteboard 定义一层亮色 / 暗色共用名称的 palette CSS 变量。
2. 为 `bg`、`border`、`text` 定义稳定的 palette key。
3. 颜色面板选择 palette key，而不是选择字面 hex。
4. 在渲染时或样式应用前，将 palette key 解析成 CSS 变量引用。

```ts
style.fill = 'palette:bg:12'
style.stroke = 'palette:border:7'
style.color = 'palette:text:15'
```

主题切换时，只需要变更变量定义即可。已有节点数据不需要迁移，同时 CSS 变量命名本身也可以独立演进。

## 单一事实来源

使用 [colors.md](./colors.md) 中的三组数据作为三个独立调色板来源：

- `BG`：用于填充色和 sticky 背景
- `BORDER`：用于边框 / 描边
- `TEXT`：用于文字颜色

这三组颜色不需要严格 1:1 配对。

这是有意为之：

- fill panel 只需要背景色
- border panel 只需要边框色
- text panel 只需要文字色
- sticky preset 可以先只使用 `BG`，之后再按需要接入 `BORDER` 和 `TEXT`

## 调色板模型

实现层应将三组 palette 视为独立分组。

建议的数据模型概念如下：

```ts
type WhiteboardPaletteGroup = 'bg' | 'border' | 'text'

type WhiteboardPaletteTheme = 'light' | 'dark'

type WhiteboardPaletteToken = {
  id: string
  group: WhiteboardPaletteGroup
  index: number
  variable: string
  key: string
}
```

建议的逻辑 id：

- `bg.0`, `bg.1`, `bg.2`, ...
- `border.0`, `border.1`, `border.2`, ...
- `text.0`, `text.1`, `text.2`, ...

建议的持久化 key：

- `palette:bg:0`
- `palette:border:0`
- `palette:text:0`

运行时解析后的 CSS 变量引用：

- `var(--wb-palette-bg-0)`
- `var(--wb-palette-border-0)`
- `var(--wb-palette-text-0)`

## CSS 变量层

新增一层 whiteboard 专用 palette CSS 变量，并保持变量名在亮暗两套主题中一致。

推荐命名：

- `--wb-palette-bg-0`
- `--wb-palette-bg-1`
- `--wb-palette-bg-2`
- `--wb-palette-border-0`
- `--wb-palette-border-1`
- `--wb-palette-text-0`
- `--wb-palette-text-1`

同名变量在亮色和暗色主题下使用不同的值。

例如：

```css
.ui-light-theme {
  --wb-palette-bg-0: #000000;
  --wb-palette-bg-1: #323232;
  --wb-palette-border-0: #000000;
  --wb-palette-text-0: #000000;
}

.ui-dark-theme {
  --wb-palette-bg-0: #ffffff;
  --wb-palette-bg-1: #e5e5e5;
  --wb-palette-border-0: #ffffff;
  --wb-palette-text-0: #ffffff;
}
```

这就是主题自动切换成立的根本机制。

## 解析层

需要在持久化值和最终渲染样式之间增加一层很薄的 resolver。

推荐行为：

1. 识别一个样式值是否是 palette key。
2. 如果是 palette key，则转成 CSS 变量引用。
3. 如果已经是原始颜色，例如 `transparent` 或 `#ff0000`，则原样返回。

概念 API：

```ts
resolvePaletteStyleValue('palette:bg:12') === 'var(--wb-palette-bg-12)'
resolvePaletteStyleValue('palette:border:7') === 'var(--wb-palette-border-7)'
resolvePaletteStyleValue('#ffffff') === '#ffffff'
resolvePaletteStyleValue('transparent') === 'transparent'
```

这样可以同时满足：

- 持久化数据稳定
- 渲染仍然走 CSS 变量
- 主题切换自动生效

## Transparent 的处理

Transparent 不应该作为普通 palette 颜色占用编号。

推荐处理方式：

- 在 fill 相关面板中作为第一个特殊 swatch 暴露
- 持久化值直接使用 `'transparent'`
- 不为它分配 `--wb-palette-bg-*` 之类的编号变量

原因：

- transparent 是一种语义模式，不是普通色块
- 单独处理可以避免编号漂移和歧义

## 面板接入方案

### Fill Panel

目标文件：

- [whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/FillPanel.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/FillPanel.tsx)

使用：

- `transparent`
- `colors.md` 中的 `BG`

一旦新 palette 生效，whiteboard 的 fill 不应再继续依赖 `shared/ui` 的语义 family 色板。

### Border Panel

目标文件：

- [whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/BorderPanel.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/BorderPanel.tsx)

使用：

- `colors.md` 中的 `BORDER`

保留当前描边宽度、虚线样式、透明度等控制，只替换颜色来源。

### Text Color Panel

目标文件：

- [whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/TextColorPanel.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/TextColorPanel.tsx)

使用：

- `colors.md` 中的 `TEXT`

`Ink` 是否保留，取决于它是否仍然是一个有意义的独立动作；否则也可以并入 palette。

## Sticky 策略

Sticky 应被视为更大填充色板中的一个产品级子集。

### Sticky Menu

目标文件：

- [whiteboard/packages/whiteboard-react/src/features/toolbox/menus/StickyMenu.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/menus/StickyMenu.tsx)

推荐规则：

- sticky menu 只展示 `BG` 的精选子集
- fill panel 可以展示完整 `BG` palette

这样可以保持 toolbox 简洁，同时在选中节点后的 fill picker 中提供更完整的颜色范围。

### Sticky 节点样式

Sticky 背景也应该存储 palette key，例如：

```ts
style.fill = 'palette:bg:12'
```

这样可以保证以下对象都指向同一套 palette 源：

- sticky menu 预览
- toolbar swatch
- fill panel
- 实际 sticky 节点渲染

### Sticky 的 border 和 text

Sticky 不需要对每个底色做严格的文字色 / 边框色绑定。

推荐第一阶段行为：

- 背景来自 `BG`
- 文字先继续使用 `var(--ui-text-primary)`
- 边框先继续使用稳定的中性描边，后续如果需要，再接入 `BORDER` 的精选子集

这样可以先把系统跑通，同时保留后续增强空间。

## 持久化策略

### 推荐

在节点样式中持久化 palette key：

```ts
style.fill = 'palette:bg:12'
style.stroke = 'palette:border:5'
style.color = 'palette:text:9'
```

优势：

- 主题切换自动生效
- CSS 变量名可以调整，不需要重写已有节点数据
- 画布、面板、预览组件都能共享同一套来源
- 调色板语义与 CSS 实现细节解耦

### 不推荐

把 `colors.md` 中的 hex 直接持久化到节点样式：

```ts
style.fill = '#FFFFFF'
```

这样会破坏主题感知，因为存进去的已经是最终结果值。

### 也不推荐

直接把 CSS 变量引用持久化进去：

```ts
style.fill = 'var(--wb-palette-bg-12)'
```

这种方式短期能用，但会让持久化数据直接依赖 CSS 变量命名。一旦变量命名、分组或索引方式改变，历史节点数据就会被实现细节绑住，后续演进成本更高。

## 建议的落地顺序

1. 基于 `colors.md` 建立 whiteboard palette 常量。
2. 为 `bg`、`border`、`text` 增加亮暗主题下的 CSS 变量定义。
3. 增加 palette key 的解析与 resolver。
4. 将 whiteboard 现有颜色面板改为输出 palette key。
5. 将 sticky preset 改为使用 palette key 作为 fill 值。
6. 让 toolbar swatch 和菜单预览通过同一个 resolver 消费 palette。
7. 验证主题切换时，已有节点无需重写数据即可更新颜色。

## 验收标准

满足以下条件时，方案算正确落地：

- 使用新 palette 的 whiteboard 节点在主题切换时能自动更新颜色
- fill panel 的颜色来自 `colors.md` 的 `BG`
- border panel 的颜色来自 `colors.md` 的 `BORDER`
- text color panel 的颜色来自 `colors.md` 的 `TEXT`
- sticky menu 与实际 sticky 渲染颜色接近且一致
- toolbar color swatch 与当前节点样式一致
- transparent fill 作为特殊项存在，且不占用编号 palette slot
- 节点持久化数据不依赖 CSS 变量名

## 范围边界

这份方案并不打算替换全部 `shared/ui/css/tokens.css`。

`tokens.css` 仍然应当作为产品的通用语义 UI 基础。
新的 whiteboard palette 层是构建在其上的产品级绘图调色板，而不是取代它。

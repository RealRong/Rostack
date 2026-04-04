# Option 颜色体系迁移方案

## 目标

将 dataview 当前的 option 颜色体系，完整迁移到根目录的 [ui-color-tokens.css](/Users/realrong/Rostack/ui-color-tokens.css)。

本次迁移遵循以下前提：

- 只使用新的 `ui-color-tokens.css`
- 不接入、不过渡、不兼容现有 `ui/css/theme.css` 的旧 token
- 不保留旧的 Notion token 命名
- 不考虑线上兼容和用户平滑迁移
- dataview 不直接散落使用 `--ui-blue-*` 等具体变量名
- dataview 通过一层 `resolve` 能力消费 option 颜色语义

## 当前现状

### 1. 数据层颜色 id 已经足够稳定

option 颜色 id 定义在：

- [dataview/src/meta/option.ts](/Users/realrong/Rostack/dataview/src/meta/option.ts)

当前颜色集合为：

- `''`
- `gray`
- `brown`
- `orange`
- `yellow`
- `green`
- `blue`
- `purple`
- `pink`
- `red`

这套 id 可以直接作为新 token 系统的输入，不需要重新设计颜色枚举。

### 2. option badge 颜色目前走的是旧 UI tone 链

核心链路是：

- [dataview/src/react/properties/options/OptionToken.tsx](/Users/realrong/Rostack/dataview/src/react/properties/options/OptionToken.tsx)
- [dataview/src/react/properties/options/PropertyOptionTag.tsx](/Users/realrong/Rostack/dataview/src/react/properties/options/PropertyOptionTag.tsx)
- [ui/src/tone.ts](/Users/realrong/Rostack/ui/src/tone.ts)
- [ui/css/primitives.css](/Users/realrong/Rostack/ui/css/primitives.css)
- [ui/css/theme.css](/Users/realrong/Rostack/ui/css/theme.css)

它的特征是：

- dataview 传入 `blue/red/...`
- `uiTone.tag()` 返回 `ui-tag-tone--blue` 这类 class
- class 再消费 `--tag-blue-background` / `--tag-blue-foreground`

这条链本质上不是 dataview 自己管理颜色，而是旧 UI theme 在管理颜色。

### 3. 分组视图的列/卡片颜色没有接到统一语义

分组 bucket 的颜色来自 option.color：

- [dataview/src/core/property/kind/index.ts](/Users/realrong/Rostack/dataview/src/core/property/kind/index.ts)
- [dataview/src/core/property/kind/group.ts](/Users/realrong/Rostack/dataview/src/core/property/kind/group.ts)

但是消费端并没有把它当作语义 id 使用，而是直接塞进 style：

- [dataview/src/react/views/kanban/components/ColumnHeader.tsx](/Users/realrong/Rostack/dataview/src/react/views/kanban/components/ColumnHeader.tsx)
- [dataview/src/react/views/gallery/components/Grid.tsx](/Users/realrong/Rostack/dataview/src/react/views/gallery/components/Grid.tsx)

这意味着：

- `section.color === 'blue'` 时，当前渲染只是在用浏览器原生 `blue`
- 这不是设计系统里的蓝色
- 也无法表达 badge、列背景、列内 card 背景三种不同层级

## 新体系的消费原则

dataview 最终不应该关心：

- `--ui-blue-bg-strong`
- `--ui-red-card-bg`
- `--ui-yellow-border`

这类具体 token 名。

dataview 只应该知道：

- 当前 option color id 是什么
- 当前 UI 用途是什么

然后通过一层 `resolve` 能力得到对应的 token 引用。

## 目录建议

### 不建议的方案

以下目录组织不推荐采用：

- 把 `resolve` 放进 `ui/css`
- 把 `ui/css` 整体改名成 `ui/themes`
- 在 dataview 内部自行定义一套 option color resolve

原因：

- `ui/css` 当前是纯样式资源目录，不适合承载运行时代码
- `resolve` 是 TypeScript 逻辑，不是样式文件
- `theme` 这个词过大，容易混入 dark/light 切换、theme provider 等无关职责
- option 颜色语义属于 UI 设计系统能力，不应该沉到 dataview 业务层

### 推荐目录

建议保留现有分层：

- `ui/css/*` 只放 CSS token 和样式规则
- `ui/src/*` 放运行时解析能力

推荐新增目录：

- `ui/src/color/types.ts`
- `ui/src/color/resolve.ts`
- `ui/src/color/index.ts`

最终职责划分：

- `ui/css`：定义 `ui-color-tokens.css` 里的颜色 token
- `ui/src/color`：定义 option color id 到 usage token 的 resolve 逻辑
- dataview：调用 resolve，不直接操作具体 token 名

### 样式文件归位建议

当前根目录的 [ui-color-tokens.css](/Users/realrong/Rostack/ui-color-tokens.css) 适合作为命名和语义草案。

最终建议迁移到 `ui/css` 目录下，例如：

- `ui/css/colors.css`
  或
- `ui/css/tokens.css`

迁入后，由 UI 层统一导出和加载，不再由 dataview 自己持有颜色值定义。

## 建议的 resolve 设计

### 核心思想

输入：

- `colorId`
- `usage`

输出：

- 对应的 CSS variable 引用
- 或者一组已命名的 class/style token

### API 设计目标

resolve 层要满足以下约束：

- 不把具体 `--ui-blue-*` 变量名散落在 dataview 组件里
- 不再依赖旧 `uiTone.tag()` / `--tag-*`
- 让 badge、grouped column、grouped card 全部复用同一套语义输入
- 让 default、gray、blue、red 等颜色族走同样的入口

### 建议的类型

建议在 `ui/src/color/types.ts` 中定义两类输入：

- `UiOptionColorId`
- `UiOptionColorUsage`

其中：

- `UiOptionColorId`
  包括：
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

- `UiOptionColorUsage`
  包括：
  - `badge-bg`
  - `badge-text`
  - `badge-border`
  - `badge-bg-hover`
  - `badge-bg-pressed`
  - `column-bg`
  - `column-border`
  - `card-bg`
  - `card-bg-hover`
  - `card-bg-pressed`
  - `dot-bg`
  - `text`
  - `text-muted`

说明：

- dataview 当前的数据层仍然是 `'' | 'gray' | ...`
- 进入 UI resolve 前，建议先统一归一化为 `default | gray | ...`
- 不要把空字符串逻辑分散到每个调用方

### 建议的 API 形态

建议在 `ui/src/color/resolve.ts` 中提供至少一层基础 API：

- `normalizeOptionColorId(value?: string): UiOptionColorId`
- `resolveOptionColorToken(color: UiOptionColorId, usage: UiOptionColorUsage): string`

返回值建议直接返回：

- `var(--ui-blue-bg-strong)`
- `var(--ui-default-card-bg)`

这类 CSS var expression 字符串。

这样做的好处是：

- 组件可以直接用于 `style`
- 也可以继续被 className / inline style / CSS-in-JS 消费
- 不需要 dataview 自己关心 token 拼接规则

### 可选的高阶 API

如果后续 grouped view 使用很多，也可以在 `ui/src/color/resolve.ts` 里再提供高阶封装：

- `resolveOptionColorStyles(color)`

返回类似：

- `badgeBackground`
- `badgeText`
- `columnBackground`
- `cardBackground`
- `dotBackground`

但这层不是第一阶段必须项。

第一阶段只要把单个 usage resolve 稳定下来就够了。

### 建议支持的 usage

至少覆盖以下用途：

- `badge-bg`
- `badge-text`
- `badge-border`
- `badge-bg-hover`
- `badge-bg-pressed`
- `column-bg`
- `column-border`
- `card-bg`
- `card-bg-hover`
- `card-bg-pressed`
- `dot-bg`
- `text`
- `text-muted`

### 语义对应关系

基于 [ui-color-tokens.css](/Users/realrong/Rostack/ui-color-tokens.css) 当前命名，建议固定以下映射规则：

- `badge-bg` -> `--ui-<color>-bg-strong`
- `badge-text` -> `--ui-<color>-text`
- `badge-border` -> `--ui-<color>-border`
- `column-bg` -> `--ui-<color>-bg-soft`
- `column-border` -> `--ui-<color>-border-muted`
- `card-bg` -> `--ui-<color>-card-bg`
- `card-bg-hover` -> `--ui-<color>-card-bg-hover`
- `card-bg-pressed` -> `--ui-<color>-card-bg-pressed`
- `dot-bg` -> `--ui-<color>-bg-strong`
- `text` -> `--ui-<color>-text`
- `text-muted` -> `--ui-<color>-text-muted`

### default / neutral 规则

`''` 不再落到 `gray`，而是映射到独立的 `default` 颜色族。

原因：

- Notion 的 default badge 背景不是 gray badge，而是中性透明层
- light 下对应 [styles.css](/Users/realrong/Rostack/styles.css#L480) `--ca-bacTerTra: #2a1c0012`
- dark 下对应 [styles.css](/Users/realrong/Rostack/styles.css#L1092) `--ca-bacTerTra: #fffff315`
- default 的语义应是“未着色的中性 option”，不是“灰色 option”

新的 default token 应独立存在于 [ui-color-tokens.css](/Users/realrong/Rostack/ui-color-tokens.css)：

- `--ui-default-text`
- `--ui-default-border`
- `--ui-default-bg-soft`
- `--ui-default-bg-muted`
- `--ui-default-bg-strong`
- `--ui-default-card-bg`

映射规则建议为：

- `badge-bg` -> `--ui-default-bg-strong`
- `badge-text` -> `--ui-default-text`
- `badge-border` -> `--ui-default-border`
- `column-bg` -> `--ui-default-bg-soft`
- `card-bg` -> `--ui-default-card-bg`
- `card-bg-hover` -> `--ui-default-card-bg-hover`
- `card-bg-pressed` -> `--ui-default-card-bg-pressed`
- `dot-bg` -> `--ui-default-bg-strong`

灰色 option 继续走 `gray` 颜色族，不和 default 合并。

因此在 UI 层建议统一约定：

- dataview 传入 `''`
- `normalizeOptionColorId('')`
- 输出 `default`

后续所有 resolve 都只认 `default`，不再认空字符串。

## 迁移边界

### dataview 负责什么

- 保留 option color id 作为唯一颜色输入
- 在需要颜色的地方统一调用 resolve
- 不直接拼写 `--ui-blue-*`
- 不再依赖 `uiTone.tag()` 处理 option badge

### ui-color-tokens.css 负责什么

- 提供所有 light/dark 的最终颜色值
- 提供中性 token
- 提供每个 hue 的 `text/border/bg/card-bg` 体系

### 明确不做的事情

- 不做旧 token 到新 token 的兼容别名
- 不保留 `--tag-*`
- 不保留 `uiTone.tag()` 的旧职责
- 不继续扩展 `ui/css/theme.css`

## 迁移范围

### A. Option badge / option token / status option

核心文件：

- [dataview/src/react/properties/options/OptionToken.tsx](/Users/realrong/Rostack/dataview/src/react/properties/options/OptionToken.tsx)
- [dataview/src/react/properties/options/PropertyOptionTag.tsx](/Users/realrong/Rostack/dataview/src/react/properties/options/PropertyOptionTag.tsx)
- [dataview/src/react/properties/options/OptionEditorPopover.tsx](/Users/realrong/Rostack/dataview/src/react/properties/options/OptionEditorPopover.tsx)
- [dataview/src/react/properties/schema/editor/PropertyOptionsSection.tsx](/Users/realrong/Rostack/dataview/src/react/properties/schema/editor/PropertyOptionsSection.tsx)
- [dataview/src/react/properties/schema/editor/PropertyStatusOptionsSection.tsx](/Users/realrong/Rostack/dataview/src/react/properties/schema/editor/PropertyStatusOptionsSection.tsx)
- [dataview/src/react/properties/value/editor/pickers/option/OptionPickerEditor.tsx](/Users/realrong/Rostack/dataview/src/react/properties/value/editor/pickers/option/OptionPickerEditor.tsx)
- [dataview/src/react/properties/value/editor/pickers/status/StatusValueEditor.tsx](/Users/realrong/Rostack/dataview/src/react/properties/value/editor/pickers/status/StatusValueEditor.tsx)
- [dataview/src/react/page/features/filter/StatusFilterPicker.tsx](/Users/realrong/Rostack/dataview/src/react/page/features/filter/StatusFilterPicker.tsx)
- [dataview/src/react/page/features/filter/FilterRulePopover.tsx](/Users/realrong/Rostack/dataview/src/react/page/features/filter/FilterRulePopover.tsx)

迁移方式：

- 去掉 `uiTone.tag()` 作为 option 颜色的主通道
- 改为统一消费 resolve 出来的 badge 颜色语义
- 让所有 option tag、editor color preview、picker item、status token 都走同一套 badge token

### B. 分组列标题 / section dot

核心文件：

- [dataview/src/react/views/kanban/components/ColumnHeader.tsx](/Users/realrong/Rostack/dataview/src/react/views/kanban/components/ColumnHeader.tsx)
- [dataview/src/react/views/gallery/components/Grid.tsx](/Users/realrong/Rostack/dataview/src/react/views/gallery/components/Grid.tsx)

迁移方式：

- `section.color` 不再直接塞 `backgroundColor`
- 改为用 resolve 的 `dot-bg`
- 如果列标题后续需要彩色 pill，也统一走 resolve

### C. 分组列背景 / 分组卡片背景

当前 dataview 里这条线实际上还没有真正做成 option-tone 语义。

需要接入的目标区域：

- kanban 分组列容器背景
- kanban 分组列内卡片背景
- gallery 分组 section 的色彩层次

迁移方式：

- 列背景统一使用 `column-bg`
- 分组 card 背景统一使用 `card-bg`
- hover / pressed 状态直接使用 `card-bg-hover` / `card-bg-pressed`

### D. 状态类组件

状态相关颜色当前部分复用 option 体系，部分复用 checkbox tone：

- [dataview/src/react/properties/value/kinds/checkbox.tsx](/Users/realrong/Rostack/dataview/src/react/properties/value/kinds/checkbox.tsx)
- [dataview/src/react/properties/value/content.tsx](/Users/realrong/Rostack/dataview/src/react/properties/value/content.tsx)

这部分不必在第一阶段强行合并到 option 颜色迁移里，但要避免继续走旧 `--tag-*` 体系。

## 实施顺序

### 第一阶段：建立 resolve 入口

目标：

- 明确 option color id 到 usage token 的唯一映射入口
- 让 dataview 组件不再直接依赖旧 tone class

目录落点：

- `ui/src/color/types.ts`
- `ui/src/color/resolve.ts`
- `ui/src/color/index.ts`

产物：

- 一套 option color resolve 能力
- 一组使用规范

### 第二阶段：替换 option badge 链

目标：

- 所有 option tag / token / picker / editor 都不再依赖 `uiTone.tag()`
- 改为直接吃 resolve 的 badge 语义

完成标志：

- `OptionToken`
- `PropertyOptionTag`
- option/status picker
- filter/status popover
  全部改完

### 第三阶段：替换 grouped view 链

目标：

- section dot
- grouped column
- grouped card
  全部接入同一套 option color 语义

完成标志：

- 不再出现 `style.backgroundColor = section.color`
- 不再把 option color id 当原生 CSS color 使用

### 第四阶段：清理旧依赖

目标：

- dataview 不再依赖 `uiTone.tag()` 处理 option 颜色
- dataview 不再依赖 `--tag-*`
- dataview 不再依赖旧 UI theme 的 badge token

完成标志：

- `option color` 相关路径只认：
  - option color id
  - resolve usage
  - `ui-color-tokens.css`

## 统一后的心智模型

最终 dataview 内部应该只有这一套语言：

- 数据层：`blue / red / green / ...`
- 语义层：`badge-bg / column-bg / card-bg / text / border`
- 样式层：`ui-color-tokens.css`

也就是说：

- dataview 只知道“这是一种颜色 id”
- dataview 只知道“我要 badge 还是 card 还是 column”
- 样式表决定最终 light/dark 下具体长什么样

## 不推荐的做法

以下做法不应进入最终实现：

- 在组件里手写 `switch (color) { case 'blue': return 'var(--ui-blue-bg-strong)' }`
- 继续在 dataview 里使用 `ui-tag-tone--blue`
- 继续在 dataview 里依赖 `--tag-blue-background`
- 直接把 `section.color` 当 `backgroundColor`
- 在 grouped view 里继续使用浏览器原生颜色名 `blue/red/green`

## 最终验收标准

满足以下条件才算迁移完成：

- option badge 和 grouped view 使用同一套颜色语义
- dataview 内部不再使用旧 tag tone 体系处理 option 颜色
- dataview 内部不再直接拼 `--ui-blue-*` 等变量名
- 所有 option 颜色都通过 resolve usage 消费
- `ui-color-tokens.css` 成为唯一颜色值来源

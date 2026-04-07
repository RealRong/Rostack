# Dataview Status Pill 统一视觉方案

## 背景

当前 `status` 字段的视觉表达仍然过于接近普通 `select / multi-select option`：

- `display` 端主要复用普通 `FieldOptionTag`
- `editor` 端下半部分虽然已经切到统一 picker list，但中间的标签本体仍然是普通 option tag
- `editor` 顶部已选 token 使用 `OptionToken`
- `filter`、`schema editor` 等其他入口也各自复用普通 option badge

这会带来两个问题：

1. `status` 没有建立自己明确的视觉语言
2. `display`、`editor`、`filter`、`schema editor` 之间容易继续分叉

目标是让 `status` 无论在编辑器还是展示器里，都稳定呈现为同一套更圆、更像状态的胶囊型视觉。

## 目标

为 `status` 建立一套独立于普通 option badge 的视觉变体，并统一应用到：

- status value 的只读展示
- status value editor 顶部已选 token
- status value editor 下方候选列表
- status filter picker
- status schema editor 列表

最终结果应满足：

- 整体是胶囊型 pill，不是普通矩形 badge
- radius 明显大于普通 option
- 左侧有一个更深色的实心圆点
- `display` 与 `editor` 的状态本体保持一致
- 不新增多套 ad hoc JSX

## 视觉定义

## 1. 基础形态

`status` pill 应采用明显不同于普通 option 的外观：

- 形状：`rounded-full`
- 高度：
  - 推荐主尺寸使用 `h-7`
- 水平内边距：
  - 推荐 `pl-2.5 pr-3`
- 内容布局：
  - 左侧圆点
  - 中间文本
  - token 场景下右侧移除按钮
- 字号：
  - 推荐 `text-[13px]`
- 字重：
  - 推荐 `font-semibold`

目标不是“普通 option badge 加一点圆角”，而是明确看起来像状态 pill。

## 2. 左侧圆点

每个 status pill 左侧增加一个小圆点：

- 尺寸：`size-2`
- 形状：`rounded-full`
- 与文字间距：`gap-2`
- 不加边框
- 不做半透明

这个圆点是 status 视觉识别的关键，不应用 icon 或边框替代。

## 3. 胶囊颜色层次

推荐保留现有 option color 系统，但改变 `status` 的使用方式：

- 胶囊背景：继续使用 badge 背景色
- 文本颜色：继续使用 badge 文本色
- 左侧圆点：使用更深一级的同色系颜色

具体色感目标：

- 胶囊背景：柔和染色底
- 文本：同色系前景
- 圆点：更实、更深、更稳定的色块

## 颜色策略

## 推荐方案

在 `ui/color` 中为 status pill 增加专用 dot token usage：

- `status-dot`

这样颜色职责会很清楚：

- `badge-bg`：status pill 背景
- `badge-text`：status pill 文本
- `status-dot`：status pill 左侧圆点

本次实现明确规定：

- `status-dot` 映射到 `text-secondary`

优势：

- 语义清晰
- 当前即可复用现有丰富的 option 色板层级
- dot 比 `badge-bg` 更深，但不会像主文本色那样过重
- 不需要在 dataview 组件里硬编码颜色

## 不建议

不建议：

- 继续使用当前 `dot-bg`
- 使用 `badge-border`
- 使用黑色/白色硬编码
- 在组件层做透明度临时调色

## 组件策略

## 核心原则

不要为 status 再新造一套完全独立的组件树。

更好的做法是让现有 option 组件支持一个明确的 `status` 视觉变体。

## 1. `FieldOptionTag`

文件：

- `dataview/src/react/field/options/FieldOptionTag.tsx`

建议新增：

- `variant?: 'default' | 'status'`

`status` 变体负责：

- `rounded-full`
- 更大的 padding
- 更合适的字号和字重
- 渲染左侧深色圆点

这样 status 的只读展示、编辑器下半部分、filter、schema editor 都可以统一走同一个入口。

## 2. `OptionToken`

文件：

- `dataview/src/react/field/options/OptionToken.tsx`

建议同样新增：

- `variant?: 'default' | 'status'`

`status` 变体应与 `FieldOptionTag` 的 pill 语言一致：

- 同样的胶囊形态
- 同样的左侧圆点
- 同样的字体和 spacing
- 仅在右侧额外挂移除按钮

这样 status editor 顶部已选 token 与下方候选列表才能真正一致。

## 不建议的 API 方向

不要设计成一堆松散开关，例如：

- `pill`
- `showDot`
- `dotColor`
- `rounder`
- `statusLike`

推荐直接做明确语义：

- `variant: 'default' | 'status'`

因为当前需要的不是无限通用 badge，而是两种稳定视觉语义：

- 普通 option
- status

## 改动落点

## 必改

### 1. Status Display

文件：

- `dataview/src/react/field/value/kinds/status.tsx`

改动：

- status 字段只读展示改为 `FieldOptionTag variant="status"`

目标：

- 表格 / 卡片 / 普通展示态统一为 status pill

### 2. Status Value Editor

文件：

- `dataview/src/react/field/value/editor/pickers/status/StatusValueEditor.tsx`

改动：

- 下方列表里的 `FieldOptionTag` 改为 `variant="status"`
- 顶部已选 token 的 `OptionToken` 改为 `variant="status"`

目标：

- 编辑器顶部和下方候选列表完全一致

## 强烈建议同步改

### 3. Status Filter Picker

文件：

- `dataview/src/react/page/features/filter/StatusFilterPicker.tsx`

改动：

- 所有 status option 的 `FieldOptionTag` 改为 `variant="status"`

原因：

- 否则 filter 会保留第三套视觉

### 4. Status Schema Editor

文件：

- `dataview/src/react/field/schema/editor/FieldStatusOptionsSection.tsx`

改动：

- schema editor 里的 status option tag 同样切到 `variant="status"`

原因：

- 字段配置面板也属于 status 的重要编辑入口
- 保持同一视觉语言更稳定

## 可选评估

### 5. 普通 Option 维持原样

文件：

- `dataview/src/react/field/value/kinds/select.tsx`
- `dataview/src/react/field/value/kinds/multiSelect.tsx`
- `dataview/src/react/field/value/editor/pickers/option/*`

建议：

- 普通 option 仍保持当前默认 badge 语言
- 不要让普通 option 和 status pill 再混成同一视觉

这样 status 和 select 的差异才是明确可识别的。

## 实施顺序

推荐顺序：

1. 在 `ui/color` 明确 `status-dot`（或先决定复用 `badge-border`）
2. 给 `FieldOptionTag` 增加 `variant="status"`
3. 给 `OptionToken` 增加 `variant="status"`
4. 改 status display
5. 改 status value editor 顶部 token 和下方候选列表
6. 改 status filter picker
7. 改 status schema editor

## 非目标

本次不做以下事情：

- 不改变 status 的分组逻辑
- 不取消 status 列表左侧分类 icon
- 不修改普通 select / multi-select 的默认 badge 样式
- 不把 status 视觉逻辑散落进多个 editor 组件内部

## 结论

`status` 应明确成为一套独立视觉：

- 更圆的胶囊
- 更稳的状态色
- 左侧深色实心圆点

并通过组件变体统一落在：

- `FieldOptionTag variant="status"`
- `OptionToken variant="status"`

这样可以在不额外复制 JSX 的前提下，把 `display`、`editor`、`filter`、`schema editor` 全部拉回同一条视觉链路。

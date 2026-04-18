# Whiteboard Centralization Remaining Audit

这份文档只整理一件事：

**在当前已经完成一轮 `editor / product / react` 收口之后，仓库里还剩下哪些没有中轴化、仍然散落、重复造轮子、或者职责混杂的地方。**

它不讨论历史方案，也不保留兼容路径。

目标只有一个：

**把还能继续优化的点一次性列清楚，作为后续继续重构的依据。**

---

## 1. 当前已经收好的部分

这些部分已经基本达到预期，不作为下一轮重点：

1. `editor` 已经删除 `@whiteboard/editor/draw` public subpath。
2. `draw` 的 whiteboard 初始值已经不再留在 `editor`，而是由 `product` 提供、由 `react` 注入。
3. whiteboard palette theme token 已经从 `react` 样式抽到 `@whiteboard/product/theme/whiteboard.css`。
4. `product/react` 侧已经不再直接 import `editor/session/*` 这样的内部路径。
5. edge preset / insert / mindmap preset 的 token 元数据已经开始挂回 `product` catalog 本体。

这说明第一轮边界校正是成立的。

但还没有到“长期最优、完全中轴化”的终态。

---

## 2. 仍然存在的主要问题

下面按优先级从高到低列出。

### 2.1 `core` 里仍然残留 whiteboard 的 shape 产品目录

当前问题文件：

1. `whiteboard/packages/whiteboard-core/src/node/shape.ts`

这条线的问题不是一个小常量，而是整套 descriptor 仍然混层。

当前仍然留在 `core` 的 product 数据包括：

1. `label`
2. `group`
3. `defaultSize`
4. `defaultText`
5. `DEFAULT_FILL`
6. `DEFAULT_STROKE`
7. `DEFAULT_TEXT`
8. `ARROW_STICKER_PAINT`
9. `HIGHLIGHT_PAINT`

这些都不是通用 shape 几何语义，而是 whiteboard 产品默认值和目录元数据。

这意味着：

1. `core` 仍然不是纯算法层
2. `product/node/shapes` 和 `core/node/shape` 之间还存在双源
3. shape 这条线还没有像 edge / insert / mindmap 一样真正收干净

最终应该保留在 `core` 的只包括：

1. `ShapeKind`
2. outline / path / visual geometry
3. label inset、命中、归一化路径等纯算法能力

最终应该迁到 `product` 的包括：

1. label
2. group
3. default size
4. default text
5. 默认 fill / stroke / preview fill
6. shape 菜单与 catalog 元数据

### 2.2 `editor` 里仍然有 whiteboard 的 selection fallback 默认值

当前问题文件：

1. `whiteboard/packages/whiteboard-editor/src/query/selection/read.ts`
2. `whiteboard/packages/whiteboard-editor/src/action/selection.ts`

当前 `editor` 内还保留了：

1. frame 默认 fill / stroke / text color
2. sticky 默认 fill / stroke / text color
3. line 默认 color
4. text 默认 color
5. `Create frame` 动作的默认 style 与默认 title

这些值显然是 whiteboard 产品决策，而不是 editor runtime 的通用逻辑。

这意味着：

1. `editor` 的 selection presentation 仍然和 whiteboard 配色绑定
2. `editor.actions.selection.frame(...)` 仍然在直接制造 whiteboard 风格 frame
3. 这条线和 draw 一样，还没完全把产品默认值移出 editor

长期最优应该改成：

1. `editor` 只定义“缺失 style 时需要 fallback”的结构语义
2. 真正的 frame / sticky / text / line fallback 默认值由 `product` 提供
3. `selection.frame` 创建时的默认模板也应该来自 `product`，而不是 editor 内写死

### 2.3 `product` 里的文案仍然存在双源

当前问题文件：

1. `whiteboard/packages/whiteboard-product/src/edge/ui.ts`
2. `whiteboard/packages/whiteboard-product/src/insert/catalog.ts`
3. `whiteboard/packages/whiteboard-product/src/mindmap/template.ts`
4. `whiteboard/packages/whiteboard-product/src/palette/sticky.ts`
5. `whiteboard/packages/whiteboard-product/src/palette/ui.ts`

虽然 `labelToken` / `descriptionToken` 已经开始挂到 product catalog 上，但很多地方仍然同时保留：

1. `label: '...'`
2. `description: '...'`
3. `title: '...'`

这不是运行时 bug，但它意味着：

1. 文案源还不是完全单一
2. `product` 仍然在“裸字符串 + token”双持有
3. i18n 体系还没有走到最简终态

这里需要明确最终抉择：

1. 要么 catalog 主字段保留 `label/description`，token 只是派生物
2. 要么 catalog 主字段改成 `labelToken/descriptionToken`，裸字符串只保留在 i18n resources

如果按“长期最优、单一源”原则，应优先选择第二种。

### 2.4 `react` 里仍有一批产品目录数据常量

当前问题文件：

1. `whiteboard/packages/whiteboard-react/src/features/mindmap/ui/panels.tsx`
2. `whiteboard/packages/whiteboard-react/src/features/edge/ui/marker.tsx`
3. `whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/BorderPanel.tsx`
4. `whiteboard/packages/whiteboard-react/src/features/node/registry/default/text.tsx`

这几类还没有完全抽出去：

1. mindmap branch line options
2. mindmap branch stroke options
3. mindmap border kind options
4. edge marker registry 中的 label / choice 数据
5. border dash options
6. sticky `fontMode` 的 enum 文案

这些数据的共同问题是：

1. 有 value
2. 有 label/title
3. 有排序 / 展示分组
4. 常常还伴随业务语义

它们不是纯视图层数据，更适合作为 product catalog。

react 应保留的部分只有：

1. icon / glyph / render function
2. 面板组件与布局
3. 把 product catalog 渲染成按钮和菜单

### 2.5 相同语义的选项在多个文件重复定义

当前比较明显的重复有：

1. `SelectionActionMenu.tsx` 和 `EdgeContextMenu.tsx` 各自维护一份 `ORDER_ITEMS`
2. `BorderPanel.tsx`、edge UI、mindmap UI 各自维护 `solid/dashed/dotted`
3. edge marker 侧同时维护 marker registry、choice 生成、label
4. 某些 toolbar / panel 标题和 aria/title 文案在多个组件散落

这类问题不一定是包边界问题，但确实是重复造轮子、没有中轴化。

长期最优应该是：

1. order action schema 一份
2. stroke/dash option schema 一份
3. marker catalog 一份
4. 组件只消费 schema，不自己重新写目录常量

### 2.6 `product` 自身还有继续拆分的空间

虽然 `product` 现在已经承担了 whiteboard-specific 数据源，但内部还存在几条可以继续理顺的线：

1. `palette/*` 和 `draw/*` 已经分开了，这是对的
2. `mindmap/template.ts` 仍然同时承担 seed、preset、template build、preview create，多职责偏重
3. `edge/ui.ts` 现在是数据源，但还没有 token 化
4. `palette/sticky.ts` 既有产品尺寸数据，也有 label/title 文案

这说明 `product` 已经站对包边界，但内部还可以继续压缩职责：

1. catalog 数据
2. template build
3. preview helper
4. i18n token

这几类最好继续拆开。

---

## 3. 问题分类

为了便于后续实施，把所有问题分成四类。

### 3.1 边界污染

定义：

一个层里保留了本不该属于它的 whiteboard 产品数据。

当前命中：

1. `core/node/shape.ts`
2. `editor/query/selection/read.ts`
3. `editor/action/selection.ts`

### 3.2 目录双源

定义：

同一类产品语义同时在两个地方维护，或者同时以两种字段持有。

当前命中：

1. shape meta 同时在 `core` 和 `product`
2. 文案同时以裸字符串和 token 持有
3. 某些 option 同时存在于 product 和 react 本地常量

### 3.3 视图层持有产品数据

定义：

`react` 组件文件自己定义了产品 option / catalog，而不是只渲染外部目录。

当前命中：

1. mindmap panels
2. edge marker
3. border panel
4. text node schema enum options

### 3.4 重复 schema / 重复常量

定义：

不同文件对同一业务语义重复造一份 option list 或 action list。

当前命中：

1. order items
2. dash/stroke options
3. marker choices
4. 部分 toolbar/menu 文案

---

## 4. 下一轮重构的最终抉择

这里给出明确结论，不保留模棱两可方案。

### 4.1 shape 产品 meta 必须彻底离开 `core`

最终结论：

**必须继续迁。**

不能接受“shape 特殊一点继续留在 core”这种妥协。

### 4.2 selection fallback 默认值必须离开 `editor`

最终结论：

**必须继续迁。**

`editor` 不应该因为 selection chrome 读取需要而继续知道 whiteboard 默认色。

### 4.3 文案最终以 token 为主，而不是以裸字符串为主

最终结论：

**catalog 的主语义应以 token/key 为准，裸字符串只保留 fallback 或资源文件。**

否则 product i18n 仍然不是单一源。

### 4.4 react 中的 option schema 要继续外提

最终结论：

**凡是有 `value + label/title + 排序/分组` 的产品语义选项，都应优先放 product。**

react 仅保留图标和 render。

### 4.5 共享 schema 要合并，不再重复维护

最终结论：

**同一业务语义只保留一份 schema。**

比如：

1. order menu items
2. dash options
3. marker catalog

---

## 5. 实施优先级

建议分四轮做，顺序固定。

### 阶段 1：清掉 `core` 和 `editor` 的剩余产品污染

要做的事：

1. 拆 `core/node/shape.ts` 的产品 meta
2. 清掉 `editor/query/selection/read.ts` 的 whiteboard fallback
3. 清掉 `editor/action/selection.ts` 的 frame 默认模板与默认文案

完成判定：

1. `core` 不再出现 whiteboard shape 默认 label/default text/default paint
2. `editor` 不再出现 `var(--wb-palette-...)` 形式的产品默认值

### 阶段 2：把 react 里的产品 option schema 外提

要做的事：

1. 提取 mindmap border/branch option catalog
2. 提取 edge marker catalog
3. 提取 border dash option catalog
4. 提取 sticky font mode / text schema enum option

完成判定：

1. react 组件文件里不再自己维护业务 option list
2. react 只做 icon 和渲染

### 阶段 3：统一 catalog 文案模型

要做的事：

1. 把 product catalog 主字段切到 token/key
2. 裸字符串只保留资源文件或 fallback
3. 清理 product 内部 `label + labelToken` 双持有

完成判定：

1. product 文案源只有一条主线
2. catalog 不再把裸字符串当主语义

### 阶段 4：合并重复 schema

要做的事：

1. 合并 `ORDER_ITEMS`
2. 合并 dash/stroke options
3. 合并 marker choice schema
4. 收敛重复的 toolbar/menu 文案定义

完成判定：

1. 同一业务语义只有一份共享 schema
2. 不再出现多个文件平行维护同一列表

---

## 6. 每个问题的最终归属

为了避免后续又把东西放回错误层级，这里直接写死归属。

### 6.1 `core`

只允许保留：

1. 类型
2. 几何
3. 纯算法
4. 模板实例化

禁止继续保留：

1. shape label
2. default text
3. preview fill
4. whiteboard 配色默认值

### 6.2 `editor`

只允许保留：

1. runtime state
2. input / query / write / actions
3. generic fallback 结构语义

禁止继续保留：

1. frame/sticky/text/line 的 whiteboard 默认值
2. whiteboard 文案
3. whiteboard 创建模板

### 6.3 `product`

应该集中承接：

1. 所有 whiteboard-specific catalog
2. 所有默认值
3. 所有 i18n token/key
4. 所有模板默认构造
5. 所有 option schema

### 6.4 `react`

只允许保留：

1. 组件
2. icon / glyph
3. 面板布局
4. DOM 渲染

禁止继续保留：

1. 产品默认值常量
2. 业务 option list
3. 平行的产品 label/title 定义

---

## 7. 最终验收标准

这轮全部继续收完以后，应该满足下面几条：

1. `core` 中不再残留 whiteboard shape 产品 meta
2. `editor` 中不再残留 whiteboard 默认视觉值
3. `react` 中不再自己维护业务 option catalog
4. `product` catalog 以 token/key 为主，不再和裸字符串双源并行
5. 相同语义的 option/action schema 不再在多个文件重复定义

如果这 5 条里还有任意一条不满足，就说明中轴化还没做完。

# Whiteboard Shapes 引入评估方案

## 背景

当前仓库根目录下的 [shapes.html](./shapes.html) 来自外部白板产品，内部包含大量 SVG `<symbol>`。

这批资产里，只有一部分是 shape 菜单图标；另外一些只是工具图标、操作图标或特殊业务图标。它们不能被等同为“可直接接入 whiteboard 的节点 shape”。

我们自己的 whiteboard shape 不是“把一个 SVG path 挂上去”这么简单，而是一套固定的内建体系：

- core 层用 `ShapeKind` 和 `SHAPE_SPECS` 定义形状种类、默认尺寸、默认文本、默认样式和文字内边距。
- react 层用 `ShapeGlyph` 负责 SVG 渲染。
- core 几何层用 outline 负责命中测试、边锚点投影、连线吸附、旋转后的 bounds 计算。
- toolbox / shape picker 通过 `SHAPE_SPECS` 自动生成菜单项。

当前关键实现入口：

- `whiteboard/packages/whiteboard-core/src/node/shape.ts`
- `whiteboard/packages/whiteboard-core/src/node/outline.ts`
- `whiteboard/packages/whiteboard-react/src/features/node/shape.tsx`
- `whiteboard/packages/whiteboard-react/src/features/node/registry/default/shape.tsx`
- `whiteboard/packages/whiteboard-react/src/features/toolbox/menus/ShapeMenu.tsx`
- `whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/ShapePickerPanel.tsx`

## 结论

`shapes.html` 可以作为“图形参考来源”，但不适合作为“直接导入源”。

长期最优做法不是把其中的 SVG 一个个抄进当前多个 `switch`，而是：

- 先筛掉不符合现有 shape 语义的类别。
- 只引入闭合轮廓、文本区明确、拉伸后仍稳定的 shape。
- 如果决定持续扩充 shape 库，应把 shape 的 `spec / glyph / outline` 收敛为单一 descriptor 源，而不是继续散落在多个文件里维护。

## 现有 shape 架构约束

### 1. 现有 shape 默认是“可填充、可描边、可承载文本”的内容节点

当前 shape 节点统一暴露：

- fill
- stroke
- text

这意味着新接入的 shape 最好具备稳定的内部文本区。如果一个图形本质上更像括号、标注线、辅助线、泳道或容器，它就不适合直接塞进当前 `type: 'shape'` 家族。

### 2. 现有连线与命中依赖封闭 outline

当前 outline 不只是视觉轮廓，它还承担：

- `containsPointInNodeOutline`
- `projectPointToNodeOutline`
- `getNodeAnchor`
- `getNodeBounds`

因此新增 shape 时，不能只增加 SVG，还必须增加对应 outline。否则：

- 选中区域会不准
- 边连接点会飘
- 旋转后包围盒会错
- hit test 会退化

### 3. 文本区域不是自动推导，而是人工定义的 `labelInset`

每个 shape 都要定义自己的：

- 默认尺寸
- 默认文本
- 文本区 inset

对于尖角多边形、气泡、箭头、半圆等 shape，这个 inset 是否合理，直接决定可用性。

### 4. 不是所有 SVG symbol 都代表“节点 shape”

`shapes.html` 里同时混有：

- 基础图形
- flowchart 图形
- BPMN / lane 类图形
- 箭头和标注类图形
- 操作图标
- UI 辅助图标

后两类不应进入 shape 体系。

## 评估标准

判断某个外部 shape 是否适合接入当前 whiteboard，我建议用以下标准：

### A. 是否是闭合图形

优先接入闭合轮廓。

闭合图形更适合：

- 填充
- 文本布局
- hit test
- 锚点投影

### B. 是否存在清晰、稳定的文本承载区域

如果文本区依赖用户自行猜测，或图形内部被分割得很碎，那么它不适合作为通用 shape。

### C. 是否能在任意宽高比下稳定拉伸

我们当前 shape 节点支持 resize。某些图形在非等比缩放下会很快失真，这种图形接入后体验通常很差。

### D. 是否属于内容节点，而非结构节点 / 辅助节点

例如泳道、括号标注、单线条、流程控制辅助符号，更适合未来独立成别的节点家族，而不是塞进当前 `shape`。

### E. 是否具有足够高的通用价值

不是外部产品有的 shape，我们都应该收。优先级应当服从：

- 通用白板场景
- 常见流程图场景
- UI 复杂度可控
- 几何语义清晰

## `shapes.html` 结果分组

### 一、已覆盖或可由现有 shape 等价表达

这部分不建议重复接入。

- `boardmix-icon-shape-rect`
- `boardmix-icon-shape-roundrect`
- `boardmix-icon-shape-ellipse`
- `boardmix-icon-shape-triangle`
- `boardmix-icon-shape-diamond-new`
- `boardmix-icon-shape-parallelogram`
- `boardmix-icon-shape-hexagon`
- `boardmix-icon-shape-flowchartrect`
- `boardmix-icon-shape-flowchartroundrect`
- `boardmix-icon-shape-determine`
- `boardmix-icon-shape-document`
- `boardmix-icon-shape-parallelogram-flow`
- `boardmix-icon-shape-start`
- `boardmix-icon-shape-beginellipse`
- `boardmix-icon-shape-begincircle`
- `boardmix-icon-shape-subroutine`
- `boardmix-icon-shape-database`
- `boardmix-icon-shape-data`
- `boardmix-icon-shape-perpare`

说明：

- 其中不少只是命名不同，但在我们当前 shape 语义中已经有对应物。
- `start / beginellipse / begincircle` 与现有 `pill`、`ellipse` 的表达能力高度重合。
- `subroutine` 对应现有 `predefined-process`。
- `data` 对应现有 `parallelogram`。

### 二、第一批建议接入

这部分是我认为最值得纳入现有 shape 家族的一批。

#### 1. `boardmix-icon-shape-star`

价值：

- 通用白板场景很常见
- 不是专业流程图限定图形
- 视觉辨识度高

接入难度：

- 中等
- 需要补稳定的 outline 和合理文本区

建议分组：

- `basic`

#### 2. `boardmix-icon-shape-basic-pentagon`

价值：

- 与现有 `triangle / hexagon / diamond` 属于同一类扩展
- 用户预期明确

接入难度：

- 低到中等

建议分组：

- `basic`

#### 3. `boardmix-icon-shape-trapezoid`

价值：

- 通用性高
- 也是流程图里常见的基础变体

接入难度：

- 低

建议分组：

- `basic` 或 `flowchart`

建议：

- 如果产品希望“基础几何图形优先”，放 `basic`
- 如果希望按流程图语义组织，放 `flowchart`

#### 4. `boardmix-icon-shape-semicircle`

价值：

- 属于真正的基础形状补完
- 不依赖专业流程图知识

接入难度：

- 中等

风险：

- 文本区 inset 需要认真调，不然顶部弧形会压文本

建议分组：

- `basic`

说明：

- `boardmix-icon-shape-basic-semicircle` 与它语义重合，保留一个即可。

#### 5. `boardmix-icon-shape-roundrectbubble`

价值：

- 与现有 `callout` 同一类
- 但比当前 `callout` 更标准、更轻量

接入难度：

- 中等

建议分组：

- `annotation`

#### 6. `boardmix-icon-shape-ellipsebubble`

价值：

- 气泡类通用性强
- 与 `roundrectbubble` 一起能显著提升注释类表达能力

接入难度：

- 中等

建议分组：

- `annotation`

#### 7. `boardmix-icon-shape-bevelrect`

价值：

- 在 flowchart 场景里较常见
- 视觉上和普通矩形区分明显

接入难度：

- 低到中等

建议分组：

- `flowchart`

#### 8. `boardmix-icon-shape-delay`

价值：

- 标准流程图图形
- 几何简单

接入难度：

- 低到中等

建议分组：

- `flowchart`

#### 9. `boardmix-icon-shape-manual-inout`

价值：

- 标准流程图图形
- 比很多冷门符号更有真实使用概率

接入难度：

- 低

建议分组：

- `flowchart`

#### 10. `boardmix-icon-shape-manual-operation`

价值：

- 标准流程图图形
- 与矩形、平行四边形有足够差异

接入难度：

- 低

建议分组：

- `flowchart`

### 三、第二批可选接入

这部分不是不行，而是应当排在第一批之后。

- `boardmix-icon-shape-internal`
- `boardmix-icon-shape-punched-card`
- `boardmix-icon-shape-cross-page-reference`
- `boardmix-icon-shape-flow-asymmetric`
- `boardmix-icon-shape-direct-data`
- `boardmix-icon-shape-sequential-data`
- `boardmix-icon-shape-flow-dbcircle`
- `boardmix-icon-shape-show-contents`
- `boardmix-icon-shape-perforated-tape`
- `boardmix-icon-shape-cycle-limit`
- `boardmix-icon-shape-doublesidearrow`
- `boardmix-icon-shape-signal-in-arrow`
- `boardmix-icon-shape-left-signal-in-arrow`
- `boardmix-icon-shape-chevron-arrow`
- `boardmix-icon-shape-chevron-reverse-arrow`
- `boardmix-icon-shape-freeroundrect`
- `boardmix-icon-shape-arc`

原因通常是以下之一：

- 专业语义过重，普通用户很少主动使用
- 文本区不够稳定
- 几何轮廓更复杂
- 拉伸后视觉容易失衡
- 与现有 shape 能力有较大重叠

其中：

- `freeroundrect` 更像风格变体，不值得优先消耗复杂度预算
- `arc` 不适合当前封闭 shape 体系，除非把它改造成独立开口图形语义

### 四、不建议纳入现有 `shape` 家族

这部分即使外部产品作为“shape”展示，我也不建议塞进我们当前 `type: 'shape'`。

#### 1. 标注 / 括号类

- `boardmix-icon-shape-annotation`
- `boardmix-icon-shape-leftbrackets`
- `boardmix-icon-shape-rightbrackets`
- `boardmix-icon-shape-upbracket`
- `boardmix-icon-shape-downbracket`
- `boardmix-icon-shape-annotation-reverse-flow`
- `boardmix-icon-shape-annotation-flow`

不建议原因：

- 本质不是填充型内容节点
- 文本区不稳定
- 更像辅助标注构件

长期更合适的方向：

- 作为 annotation node 家族
- 或作为特殊 connector / bracket node

#### 2. 线型 / 控制型图形

- `boardmix-icon-shape-parallel`
- `boardmix-icon-shape-control-transfer`
- `boardmix-icon-shape-horizontal-line`
- `boardmix-icon-shape-vertical-line`

不建议原因：

- 它们更接近线段、符号、控制标记
- 当前 shape 默认有 fill / text / outline 命中语义，不适配

#### 3. 容器 / 泳道类

- `boardmix-icon-shape-bpmn-horizontal-lane`
- `boardmix-icon-shape-bpmn-vertical-lane`

不建议原因：

- 它们本质更像结构容器，而不是普通内容节点
- 应具备子节点承载、标题区、布局关系等更强语义

长期更合适的方向：

- 新的 `lane` / `container` 节点类型

#### 4. 纯 UI / 操作图标

- `boardmix-icon-shape-expand`
- `boardmix-icon-shape-search`
- `boardmix-icon-shape-drag`
- `boardmix-icon-shape-pin`
- `boardmix-icon-shape-select`

不建议原因：

- 这不是白板内容 shape
- 它们只是工具或交互图标

#### 5. 低优先级特异图形

- `boardmix-icon-shape-cruz`

不建议原因：

- 通用使用场景较弱
- 对当前产品价值不高

## 推荐的引入批次

### 批次 A：基础白板增强

适合先做，性价比最高。

- `star`
- `basic-pentagon`
- `trapezoid`
- `semicircle`
- `roundrectbubble`
- `ellipsebubble`

特点：

- 通用用户能理解
- 不强依赖专业流程图知识
- 能明显丰富 shape 面板

### 批次 B：流程图增强

在基础批次稳定后再做。

- `bevelrect`
- `delay`
- `manual-inout`
- `manual-operation`
- `internal`
- `cross-page-reference`

特点：

- 面向更专业的流程图用户
- 价值明确，但菜单复杂度会上升

### 批次 C：扩展流图 / 专业符号

只在确定产品要深做流程图时再做。

- `direct-data`
- `sequential-data`
- `flow-asymmetric`
- `flow-dbcircle`
- `perforated-tape`
- `cycle-limit`

特点：

- 用户面更窄
- 维护成本更高

## 按当前架构，正确的接入方式

### 1. 扩 `ShapeKind`

文件：

- `whiteboard/packages/whiteboard-core/src/node/shape.ts`

内容：

- 扩 type union
- 扩 kind set

### 2. 为每个新 shape 增加 `ShapeSpec`

文件：

- `whiteboard/packages/whiteboard-core/src/node/shape.ts`

每个 spec 至少要定义：

- `kind`
- `label`
- `group`
- `defaultSize`
- `defaultText`
- `defaults`
- `previewFill`
- `labelInset`

### 3. 在 React 层实现可拉伸 glyph

文件：

- `whiteboard/packages/whiteboard-react/src/features/node/shape.tsx`

要求：

- 尽量使用 viewBox 内的规范化坐标
- 形状应支持任意宽高 resize
- 内部装饰线与外轮廓不要漂移

### 4. 在 core 层实现 outline

文件：

- `whiteboard/packages/whiteboard-core/src/node/outline.ts`

这是必须项，不是可选项。

每个新增 shape 都要定义 outline，至少确保：

- hit test 正确
- bounds 正确
- 边锚点投影合理
- 旋转后几何行为正确

### 5. 复核文本区 inset

文件：

- `whiteboard/packages/whiteboard-core/src/node/shape.ts`
- `whiteboard/packages/whiteboard-react/src/features/node/registry/default/shape.tsx`

重点验证：

- 单行文本
- 多行文本
- 长文本换行
- 极窄 / 极宽尺寸

### 6. 菜单和 picker 自动获得新条目

当前这部分已经依赖 `SHAPE_SPECS` 自动生成。

文件：

- `whiteboard/packages/whiteboard-react/src/features/toolbox/menus/ShapeMenu.tsx`
- `whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/ShapePickerPanel.tsx`

这意味着：

- 一旦 `SHAPE_SPECS` 扩大，菜单会自动膨胀
- 所以新增 shape 数量不能无节制

## 当前架构下不建议做的事情

### 1. 不要直接把 `shapes.html` 的 path 原样塞进菜单图标

如果只做菜单图标映射，而不做真实节点几何，最终会出现：

- 菜单里有这个 shape
- 画布里却没有对应可用节点语义

这会造成体系分裂。

### 2. 不要把开口图形硬塞进当前 `shape`

例如 bracket、annotation、line 类。

它们会在以下层面持续制造特例：

- fill 语义
- text 区域
- hit test
- outline 投影
- transform 体验

### 3. 不要继续扩大多处 `switch` 的维护面

现在新增一个 shape，至少会扩到：

- `ShapeKind`
- `SHAPE_SPECS`
- `ShapeGlyph`
- `OUTLINE_BY_SHAPE_KIND`

如果未来 shape 数量继续增长，这种模式会越来越难维护。

## 长期最优方案

### 核心方向

把 shape 收敛为单一 descriptor 源。

目标不是做成“任意 SVG 导入器”，而是把我们内建 shape 的定义集中起来，减少重复维护。

建议的数据模型方向：

```ts
type ShapeDescriptor = {
  kind: string
  label: string
  group: 'basic' | 'flowchart' | 'annotation'
  defaultSize: { width: number; height: number }
  defaultText: string
  defaults: {
    fill: string
    stroke: string
    color: string
  }
  previewFill?: string
  labelInset: {
    top: number | string
    right: number | string
    bottom: number | string
    left: number | string
  }
  render: () => ReactNode
  outline: OutlineSpec
  decorations?: () => ReactNode
}
```

这样可以让：

- 菜单
- 预览
- 节点渲染
- 几何 outline

共同消费一份定义，而不是散在多处手工同步。

### 为什么这是长期最优

因为当前 shape 系统已经从“小集合”走向“中等集合”。

一旦继续新增 10 到 20 个 shape，分散式维护会带来明显问题：

- 某个 shape 改了 glyph，忘了改 outline
- 菜单有了，默认尺寸不合理
- 文本 inset 与视觉边界漂移
- 命名不一致

descriptor 化之后，这些问题会明显减少。

## 产品层建议

### 1. 先控制数量，不追求一次性补齐外部全部 shape

`shapes.html` 里的数量远超当前产品需要。

一次性全收只会带来：

- 菜单过载
- 维护成本激增
- 用户选择困难

### 2. shape 菜单最好分层，而不是继续平铺

当前只有：

- `basic`
- `flowchart`
- `annotation`

如果接下来持续扩 shape，建议最终演进为更细的呈现层分类，例如：

- Basic
- Flowchart Core
- Flowchart Extended
- Annotation

注意：

- 这不一定要求 core 立刻改 group 枚举
- 但 UI 层最终不能无限平铺

### 3. lane / bracket / line 应走新的节点家族

以下类型不要继续挤进 `shape`：

- BPMN lane
- bracket annotation
- horizontal / vertical line
- 控制转移类符号

这些东西如果产品真的要做，应该用新的 node family 承接。

## 最终建议

如果只做一轮高价值引入，我建议按下面顺序推进：

### 第一轮

- `star`
- `basic-pentagon`
- `trapezoid`
- `semicircle`
- `roundrectbubble`
- `ellipsebubble`

### 第二轮

- `bevelrect`
- `delay`
- `manual-inout`
- `manual-operation`

### 第三轮

- 视真实需求决定是否继续扩专业 flowchart 图形

同时，建议在第二轮开始前，先把 shape 定义收敛为 descriptor 模式。否则 shape 一多，维护成本会快速上升。

## 一句话判断

`shapes.html` 里“能画出来”的很多，但“适合进入我们当前 whiteboard shape 体系”的其实只是一部分。

短期应当挑高价值闭合图形接入，长期应当先重构 shape descriptor，再继续扩库。

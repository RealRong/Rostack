# Whiteboard Shape Inner Stroke 方案

## 目标

将 `shape` 节点的 `thickness` 语义改为：

- 描边只向 shape 内部增长
- shape 最外轮廓保持稳定
- selection 蓝框始终对齐 shape 的稳定外轮廓
- toolbar anchor / resize box / 对齐吸附不再被 `strokeWidth` 顶着走

本方案只针对 `shape` family。

不包含：

- `draw`
- `edge`
- 其他开放路径类节点

这些类型继续保留当前 `center stroke` 语义。

## 当前实现

### 1. Shape 渲染仍然是 center stroke

当前 shape SVG 直接把 `strokeWidth` 传给外轮廓图元：

- `whiteboard/packages/whiteboard-react/src/features/node/registry/default/shape.tsx`
- `whiteboard/packages/whiteboard-react/src/features/node/shape.tsx`

这意味着：

- SVG 描边沿 path 中线向内外各扩一半
- `strokeWidth` 变大时，可见边框会同时向内和向外增长

这不是 inner stroke。

### 2. Selection box 会随 strokeWidth 变大

当前 shape bounds 会按 `strokeWidth / 2` 继续向外扩：

- `whiteboard/packages/whiteboard-core/src/node/outline.ts`

核心逻辑是：

- 先取 shape outline 的 AABB
- 再调用 `expandOutlineBounds`
- 额外加上由 `strokeWidth` 推导的 expansion

selection 蓝框读取的正是这份 bounds：

- `whiteboard/packages/whiteboard-editor/src/runtime/read/selection.ts`
- `whiteboard/packages/whiteboard-react/src/features/node/components/NodeOverlayLayer.tsx`

所以当前真实语义是：

- shape 可见描边向内外同时变粗
- selection 蓝框也向外一起变大

也就是说，现在蓝框能包住更粗的描边，并不是因为描边是 inner stroke，而是因为 bounds 也跟着被外扩了。

## 目标语义

改造后，`shape` 应满足：

- `node.rect` 表示 shape 的稳定外边界
- `getNodeBounds(shape)` 返回的仍然是这个稳定外边界对应的 bounds
- selection 蓝框、transform handles、toolbar anchor、对齐吸附统一以这份稳定外边界为准
- `strokeWidth` 只影响 shape 内部的可见边框厚度

一句话：

`strokeWidth` 只改变视觉，不改变 `shape` 的几何外边界。

## 推荐实现

推荐使用：

- 保持外轮廓 path 不变
- 用 `clipPath` 做 inner stroke
- 同时移除 core 对 shape stroke 的 bounds 外扩

这是当前代码库里最稳、最省重写成本的方案。

## 为什么推荐 clipPath，而不是每个 shape 手工内缩几何

### clipPath 方案的优点

- 对所有 shape 通用，包括：
  - `rect`
  - `rounded-rect`
  - `ellipse`
  - `diamond`
  - `triangle`
  - `hexagon`
  - `parallelogram`
  - `document`
  - `callout`
  - `cloud`
  - `arrow-sticker`
- 不需要为每个 polygon / path 单独推导 inward offset 几何
- 外轮廓 path 可以继续复用当前定义
- 能直接保留现有 `strokeDash` / `strokeOpacity` / `strokeLinecap` / `strokeLinejoin`
- 改完后，selection / toolbar / bounds 的语义会立刻变干净

### 手工内缩几何的问题

- `rect` / `ellipse` 好做
- `diamond` / `hexagon` / `triangle` 可以做，但要按法线严格内偏移才准确
- `callout` / `cloud` / `document` / `arrow-sticker` 成本明显更高
- 会引入一套新的几何维护负担

因此不建议走“每个 shape 单独生成 inner path”的路线。

## Inner Stroke 的具体做法

### 原理

对外轮廓 path：

- 仍然使用稳定外轮廓几何
- 实际绘制时，把 SVG `strokeWidth` 设为 `visibleThickness * 2`
- 再用与该 shape 相同轮廓的 `clipPath` 把 stroke 裁进 shape 内部

这样会得到：

- path 外侧那一半 stroke 被裁掉
- 只保留向内的一半
- 最终用户看到的边框厚度就是 `visibleThickness`
- shape 最外轮廓保持不变

### 为什么 strokeWidth 要乘 2

如果直接对原 path 画 `strokeWidth = t`，再 clip 到 shape 内部，用户实际能看到的只剩一半，也就是约 `t / 2`。

因此应当：

- toolbar / model 里的 thickness 继续表示“用户看到的厚度”
- SVG 实际绘制时使用 `2 * thickness`

### SVG 结构建议

`ShapeGlyph` 不再把当前 `strokeWidth` 直接塞给所有外轮廓图元。

建议拆成三层：

1. 外轮廓 fill
2. 外轮廓 inner stroke
3. 内部装饰线

推荐结构：

```tsx
<svg viewBox="0 0 100 100" preserveAspectRatio="none">
  <defs>
    <clipPath id={clipId}>
      {renderOuterShapePath(kind)}
    </clipPath>
  </defs>

  {renderOuterShapeFill(kind)}

  <g clipPath={`url(#${clipId})`}>
    {renderOuterShapeStroke(kind, {
      strokeWidth: visibleStrokeWidth * 2
    })}
  </g>

  {renderInnerDecorations(kind)}
</svg>
```

### 哪些内容属于 outer shape

outer shape 指的是稳定外轮廓：

- `rect`
- `rounded-rect`
- `pill`
- `ellipse`
- `diamond`
- `triangle`
- `hexagon`
- `parallelogram`
- `document`
- `callout`
- `cloud`
- `arrow-sticker`
- `highlight` 的主体高亮块
- `cylinder` 的主体轮廓
- `predefined-process` 的主体矩形

### 哪些内容属于 decoration

这些不应该参与 outer bounds，也不应该驱动 selection box：

- `cylinder` 的顶端辅助椭圆
- `cylinder` 的底部内部弧线
- `predefined-process` 的两条内部竖线
- `highlight` 的底部手写曲线

这些装饰线可以继续单独绘制，不纳入 inner stroke 轮廓逻辑。

## Core 几何需要怎么改

### 1. shape bounds 不再随 strokeWidth 外扩

当前问题的根源之一是：

- `whiteboard/packages/whiteboard-core/src/node/outline.ts`

这里对 shape bounds 做了基于 `strokeWidth` 的 outward expansion。

改造后：

- `shape` 的 bounds 应该只由稳定外轮廓决定
- 不再因为 `strokeWidth` 变化而扩大

也就是说，对 shape：

- 保留 `getNodeShapeBounds` 的 outline AABB
- 去掉 `expandOutlineBounds` 对 `strokeWidth` 的额外外扩

最终语义应该是：

- `getNodeBounds(shape)` 只返回 shape 的稳定外轮廓 bounds

### 2. selection / toolbar / transform box 会自然稳定

一旦 `shape` bounds 不再被 stroke 顶大，下面这些都会自然稳定：

- selection 蓝框
- transform handles
- toolbar anchor
- toolbar 壳位置
- 对齐吸附
- 复制 / 对齐 / 排列时使用的几何边界

不需要再为这些模块单独打补丁。

## Hit Test 和 Outline 语义

### 当前状态

当前 `getNodeOutline` / `containsPointInNodeOutline` 本来就是按 shape 外轮廓判断，而不是按外扩后的 stroke 外缘判断。

这对 inner stroke 反而是合理的。

### 改造后建议

保持：

- outline 继续代表 shape 的稳定外轮廓
- pointer hit 继续以 shape 外轮廓为准

这样用户点击 shape 时，命中区域仍然是整块 shape 内部，而不是只点到可见边框才算命中。

这和大多数白板 / 流程图工具的交互是对齐的。

## 文本区域是否要跟着收缩

这不是第一优先级，但应该明确。

当前 label inset 是静态配置：

- `whiteboard/packages/whiteboard-core/src/node/shape.ts`

如果 `strokeWidth` 很大，而描边改为向内吃，文本可用区域会视觉缩小。

建议分两步：

### 第一阶段

- 先不改 label inset
- 先把 outer geometry、selection、toolbar 稳定下来

### 第二阶段

按需要增加动态文本 inset：

- `effectiveInset = baseInset + f(strokeWidth)`

最简单可以先做：

- `baseInset + strokeWidth`

或：

- `baseInset + strokeWidth * 0.75`

这个可以后调。

## 对现有代码的最小改动面

### React 渲染层

主要改：

- `whiteboard/packages/whiteboard-react/src/features/node/shape.tsx`
- `whiteboard/packages/whiteboard-react/src/features/node/registry/default/shape.tsx`

目标：

- `ShapeGlyph` 支持 outer fill / clipped inner stroke / decoration 的分层渲染
- shape node 渲染改用新语义
- toolbar icon / selection summary icon 也自动跟随新语义

### Core 几何层

主要改：

- `whiteboard/packages/whiteboard-core/src/node/outline.ts`

目标：

- 移除 shape bounds 对 strokeWidth 的 outward expansion

## 推荐落地顺序

### 第一步：先把 ShapeGlyph 改成 inner stroke 渲染

- 建立 outer contour 和 decoration 的渲染拆分
- 用 `clipPath` 渲染 inner stroke
- 保持 fill 走原路径

这一步做完后，视觉会先正确。

### 第二步：移除 shape bounds 的 stroke 外扩

- 调整 `outline.ts`
- 让 selection box / transform box / toolbar anchor 回到稳定外轮廓

这一步做完后，几何语义才真正闭合。

### 第三步：人工回归所有 shape

至少检查：

- `rect`
- `rounded-rect`
- `ellipse`
- `diamond`
- `triangle`
- `hexagon`
- `parallelogram`
- `document`
- `callout`
- `cloud`
- `arrow-sticker`
- `cylinder`
- `predefined-process`
- `highlight`

每个都检查：

- thickness 1 / 4 / 8 / 16
- selection 蓝框是否稳定
- toolbar 是否不再被 thickness 顶走
- dash 是否正常
- 旋转后 selection 是否仍对齐
- 内部装饰线是否没有被错误裁掉

## 验收标准

改完后应满足：

- 拖动 shape `thickness` 时，selection 蓝框不变
- 拖动 shape `thickness` 时，toolbar 不会因为 bounds 变化而跳位置
- 粗描边只向 shape 内部增长
- shape 的最外轮廓恒定
- 多选 shape 时，selection 包围盒不再因描边变粗而扩大
- 所有闭合 shape 的 outer geometry 保持稳定

## 最终建议

这次 inner stroke 不要做成：

- 给每个 shape 单独发明一套 inward geometry
- 继续沿用“center stroke + bounds 外扩”

推荐直接定一条长期规则：

- `shape` 的外轮廓是稳定几何
- `strokeWidth` 是视觉厚度，不改变外轮廓几何
- `shape` 统一采用 clipped inner stroke
- `draw` / `edge` 继续使用 center stroke

这条规则一旦落地，selection、toolbar、bounds、吸附、对齐、图形编辑语义都会清晰很多。

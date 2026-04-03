# Dataview Table Row Marquee 长期方案

## 结论

`table row marquee` 不应该直接套进当前 `gallery/kanban` 这条“`box -> hit ids`”的 card marquee 适配模型。

长期最优方案应该是：

1. page 层统一“拖拽选择 session 生命周期”
2. `table` 保留自己的 row-edge interval 选择模型
3. overlay 改成 row band，而不是自由矩形 box
4. overlay 继续在 table 局部坐标系内渲染，不提升到 page host

换句话说：

- `gallery/kanban` 适合 `box -> ids`
- `table row marquee` 适合 `point -> edge -> interval`

它们可以共享 page 级手势生命周期，但不应该被强行压成同一种命中算法。

## 当前实现的本质

当前 `table row marquee` 的核心不是矩形命中，而是行边界推导。

现有链路大致是：

1. pointer 在 table blank area 开始
2. 根据 point 命中最近 row edge
3. 维护 `startEdge / currentEdge`
4. 从 edge interval 推导出 row ids
5. 按 `replace / toggle / range` 写回 selection

关键文件有：

- [`useRowMarquee.ts`](/Users/realrong/Rostack/dataview/src/react/views/table/hooks/useRowMarquee.ts)
- [`model/marquee.ts`](/Users/realrong/Rostack/dataview/src/react/views/table/model/marquee.ts)

这条链本身是合理的。

## 为什么不应该退回成 box-hit 方案

如果把 table row marquee 强行改成和 `gallery/kanban` 一样的：

- `box -> hit row rects`

会有几个问题。

### 1. 选择语义会退化

table row marquee 真实选择的是一个连续 row interval，而不是“哪些 row rect 与 box 相交”。

interval 模型的好处是：

- 行区间稳定
- `shift` 范围语义自然
- 结果不依赖 row rect 命中细节

### 2. 横向拖动本来就不是选择语义的一部分

row marquee 只关心垂直范围，不关心水平方向。

如果改成 box-hit：

- pointer 的 x 变化会进入命中计算
- overlay 也会表现成一个自由矩形

这与 row selection 的产品语义不一致。

### 3. 现有模型已经更接近长期最优

table 当前用 edge interval 推导 selection，其实比 box-hit 更对。

真正需要收敛的不是它的数学模型，而是：

- 生命周期
- 与 page 全局状态的协调
- overlay 视觉表达

## 长期最优的统一边界

page 层应该统一的是“拖拽选择 session”，不是“命中算法”。

所以建议把当前 page marquee 再抽象一层，变成 page 级 `drag-select session`。

page 层统一负责：

- pointer capture
- auto-pan
- `Esc` / cancel
- 与 `inlineSession` / `valueEditor` 的互斥
- 当前只有一个活动 drag-select session
- `baseSelectedIds` 快照

view 层继续负责：

- `canStart`
- 本地几何模型
- 选择推导公式
- overlay 的局部渲染

## 建议的数据结构

建议 page/runtime 最终统一成一个更泛化的 session 状态。

```ts
export interface DragSelectSessionState {
  ownerViewId: ViewId
  kind: 'card-box' | 'table-row-band'
  mode: 'replace' | 'add' | 'toggle'
  start: Point
  current: Point
  box: Box
  baseSelectedIds: readonly AppearanceId[]
}
```

其中：

- `kind`
  说明当前 session 属于哪一类 view 选择模型

- `mode`
  说明是 replace / add / toggle

- `baseSelectedIds`
  用于拖动过程中重算 selection，以及 `Esc` 回滚

注意：

- `box` 可以继续存在，因为 page 级 auto-pan / pointer 生命周期依然有用
- 但 `table-row-band` 不一定直接把 `box` 当作最终选择语义

## Table 的 adapter 应承担什么职责

对 table 来说，adapter 不该是简单的：

- `resolveIds(box)`

而应是更接近 strategy 的结构：

```ts
export interface TableRowDragSelectAdapter {
  ownerViewId: ViewId
  containerRef: RefObject<HTMLElement | null>
  disabled?: boolean
  canStart: (event: PointerEvent) => boolean
  start: (session: DragSelectSessionState) => void
  update: (session: DragSelectSessionState) => void
  cancel: (session: DragSelectSessionState) => void
  end: (session: DragSelectSessionState) => void
}
```

其内部逻辑仍然是：

- `point -> row edge`
- `startEdge/currentEdge -> interval`
- `interval -> selection`

这样 page 层不需要理解 row edge、row height、header offset。

## Table Row Selection 的正确语义

table row marquee 长期应保持下面这套规则。

### 1. 只允许从 blank area 启动

也就是现有 `onBlankPointerDown` 语义继续保留。

不能从这些区域发起：

- cell 内容
- row handle drag
- column resize
- interactive target

### 2. 开始时立即清理 table 局部状态

开始 row marquee 时应立刻：

- 记录 `baseSelectedIds`
- 清掉 `gridSelection`
- 清掉 hover

这点和当前实现基本一致，应继续保留。

### 3. 拖动过程中直接同步更新全局 selection

与 `gallery/kanban` 一样，`selection` 应保持唯一真相源。

所以 table row marquee 也不需要额外 preview selection。

正确方式是：

- pointer move
- 根据 `startEdge/currentEdge` 推导 row ids
- 直接写回全局 `selection`

### 4. `Esc` / cancel 时回滚

取消时：

- `selection` 回滚到 `baseSelectedIds`
- 清掉 row marquee session

## 与 Grid Selection 的关系

这是 table 和其他 view 最大的不同点。

长期建议规则明确成：

### 1. 开始 row marquee 时清掉 `gridSelection`

理由：

- row selection 与 cell selection 是不同粒度
- 两者并存会让键盘、复制粘贴、hover 语义混乱

### 2. `gridSelection` 激活时，不允许 row marquee 启动

或者更准确地说：

- row marquee 一旦启动，就应强制夺取交互 ownership

### 3. row marquee 结束后不自动恢复 `gridSelection`

理由：

- 这会制造出“隐藏状态恢复”的心智负担

## Overlay 长期应该怎么做

当前 table 用的是自由矩形 box overlay：

- [`MarqueeOverlay.tsx`](/Users/realrong/Rostack/dataview/src/react/views/table/components/overlay/MarqueeOverlay.tsx)

这不是长期最优。

table row marquee 的 overlay 应改成：

- row band overlay

也就是：

- 横向直接吸附到 grid content bounds
- 纵向吸附到 `startEdge/currentEdge` 对应的 top/bottom

最终效果应是一条跨整行宽度的半透明选择带，而不是自由矩形。

### 为什么 row band 更对

因为 row marquee 的真实语义是：

- 选择一段连续行区间

而不是：

- 选择一个二维矩形区域

所以视觉反馈也应表达“行带”，而不是“框”。

## Overlay 应放在哪一层

我不建议把 table row marquee overlay 提到 page host。

长期最优仍然应放在：

- table surface / canvas 局部层

原因：

### 1. table 有自己的局部坐标系

table 当前有：

- `containerRef`
- `canvasRef`
- `paddingInline`
- 水平滚动

这些都属于 table 局部几何。

### 2. table 已有现成 content bounds 模型

例如：

- [`gridContentBounds`](/Users/realrong/Rostack/dataview/src/react/views/table/layout.ts)

这类几何天然属于 table 局部，不应上升到 page/global 坐标系。

### 3. 可与 drop indicator 共用同一坐标系

row marquee overlay 和 row reorder indicator 都是 row-level 视觉反馈。

它们继续共用 table canvas 坐标系是最自然的。

## 与 Row Reorder 的关系

长期建议保持排他：

- row marquee 活跃时，不允许 row reorder 开始
- row reorder 活跃时，不允许 row marquee 开始

视觉层级上建议：

- drop indicator 高于 marquee band

但理想上这两种交互不应同时存在。

## 与 Gallery / Kanban 的关系

三者应该统一的是：

- page 级 drag-select session 生命周期
- `selection` 唯一真相源
- `baseSelectedIds` 回滚机制
- `Esc` / cancel / auto-pan / 互斥规则

三者不应统一的是：

- 具体命中算法
- 选择几何模型
- overlay 视觉表达

所以长期结构应是：

- `gallery/kanban`: `box -> ids`
- `table row marquee`: `point -> edge -> interval`

## 分阶段落地建议

### 第一步

- 保留 table 当前 row interval 选择数学模型
- 不把它硬改成 box-hit
- 先让 page 层 session 能承载 table row marquee 生命周期

### 第二步

- 把 table row marquee 从局部 hook 接到 page 级 drag-select session
- 保持 `selection` 单一真相源
- 保持 `Esc` 回滚 `baseSelectedIds`

### 第三步

- 把 overlay 从自由 box 改成 row band
- 继续留在 table local surface 渲染

## 明确不做的事

- 不把 table row marquee 降级成 `box -> hit rows`
- 不把 table 的局部几何细节抬到 page 层
- 不让 page host 直接负责 table row band 渲染
- 不同时保留 row marquee selection 与 grid selection 两套激活状态

## 最终结论

`table row marquee` 的长期最优方案不是复用当前 card marquee adapter，而是：

- 共享 page 级拖拽选择 session 生命周期
- 保留 table 自己的 edge-based row interval 选择模型
- 把 overlay 改成 full-width row band
- overlay 继续在 table 局部坐标系中渲染

这样才能同时保住：

- row selection 的正确语义
- 与 grid selection 的清晰边界
- 和 row reorder / hover / table layout 的一致性

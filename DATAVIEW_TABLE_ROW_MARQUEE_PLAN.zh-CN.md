# Dataview Table Row Marquee 长期方案

## 结论

`table row marquee` 长期也应纳入 page 级 marquee session，但不再坚持 edge interval 作为主模型。

长期最优方案应该是：

1. page 层统一“拖拽选择 session 生命周期”
2. page host 渲染统一蓝框
3. `table` 提供 row band `bounding rect`
4. 只要 row band rect 与蓝框相交，就选中该 row
5. table 仍可保留局部 row band 强化视觉反馈

换句话说：

- `gallery/kanban` 的 target 是 card rect
- `table` 的 target 是 row band rect
- 三者统一为 `page box -> intersect visible target rects`

## 为什么要改口

之前把 table 定义成：

- `point -> row edge -> interval`

这在数学上是自洽的，但不一定最贴近实际产品语义。

如果目标是接近 Notion 这类“你视觉上看到蓝框碰到 item，就算选中”的体验，那么更直接的语义应该是：

- 页面有一块蓝框
- 每一行暴露一个当前可见的 row band rect
- 蓝框与 row band rect 相交即选中

这样更简单，也更统一。

## 为什么视觉 rect 命中更对

table 的产品语义其实不是“我要维护一套抽象 edge 区间数学”，而是：

- 我眼睛看到蓝框碰到了哪几行

如果采用 row band rect 命中：

### 1. 与用户视觉感受一致

- 蓝框碰到行就选中
- 蓝框没碰到就不选中

不需要额外解释 content-space、edge、投影几何。

### 2. 横向滚动天然成立

即使 table 因为 page 边缘 auto-pan 横向滚动，用户在屏幕上看到的蓝框宽度也不会凭空变大。

这时只需要重新读取当前可见 row band rect：

- 蓝框还是原来那块蓝框
- 哪些行当前与它相交，就选哪些行

不需要把蓝框变形成 content-space 宽框。

### 3. 与 gallery/kanban 可以共用同一套主模型

统一后：

- `gallery/kanban` 是 card rect
- `table` 是 row band rect

page 层都只需要做 `intersect(box, rect)`。

## 建议的数据结构

建议 table 也接入通用的 `SelectionTarget`。

```ts
export interface SelectionTarget {
  id: AppearanceId
  rect: Box
}
```

其中：

- `rect`
  表示某一行当前可见的 row band rect，坐标统一在 page / viewport 视觉空间

table adapter 需要提供的就是：

- `canStart`
- `getTargets`
- `order`

而不是继续让 page 层理解 row edge。

## Table Row Selection 的正确语义

长期建议规则如下。

### 1. 只允许从 blank area 启动

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

### 3. 拖动过程中直接同步更新全局 selection

与 `gallery/kanban` 一样，`selection` 应保持唯一真相源。

正确方式是：

- pointer move
- 读取当前可见 row band rect
- 直接做 `intersect(box, rect)`
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

当前推荐把 overlay 分成两层。

### 1. page 级蓝框

这是统一的 marquee box。

它负责：

- 告诉用户当前视觉框选范围
- 与其他 view 保持一致

### 2. table 局部 row band 强化反馈

table 可以额外渲染 row band overlay，用来强化“你正在选中哪些行”。

也就是：

- 横向吸附到当前 row band 的内容宽度
- 纵向跟随实际命中的行集合

它不是命中模型的前提，只是更贴近 table 的反馈。

### 为什么 row band 仍然值得保留

因为 row marquee 的真实语义是：

- 我正在选择一批行

而不是：

- 我在做自由二维区域编辑

所以：

- page 蓝框负责统一交互
- row band 负责 table 专属反馈

## Overlay 应放在哪一层

不再是“二选一”，而是分层：

- page host 负责统一蓝框
- table surface / canvas 负责可选的 row band overlay

原因：

- 蓝框是全局交互语义
- row band 是 table 局部反馈语义
- 两者职责不同，不应该互相替代

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

- view 内部 target 收集方式
- table 的 row band 强化反馈
- timeline 未来自己的局部反馈样式

所以长期结构应是：

- `gallery/kanban`: card rect targets
- `table row marquee`: row band rect targets

## 分阶段落地建议

### 第一步

- 先让 table 接入 page 级 marquee session
- 保留 blank area 启动限制
- 用当前可见 row band rect 做命中

### 第二步

- page host 渲染统一蓝框
- table 命中统一切到 `intersect(box, rowBandRect)`
- 保持 `selection` 单一真相源与 `Esc` 回滚

### 第三步

- 增加 table row band 强化反馈
- 与 row reorder indicator 协调层级
- 如有性能压力，再补 rect cache / registry

## 明确不做的事

- 不再把 table marquee 绑定到 edge interval 模型
- 不把 table 的局部布局细节抬到 page 层
- 不让 page 层理解 row edge、header offset、content-space 公式
- 不同时保留 row marquee selection 与 grid selection 两套激活状态

## 最终结论

`table row marquee` 的长期最优方案是：

- 共享 page 级拖拽选择 session 生命周期
- 共用 page 级蓝框
- table 提供 row band rect targets
- 蓝框与 row band rect 相交即选中
- table 可额外渲染局部 row band 作为强化反馈

这样才能同时保住：

- 与用户视觉感知一致的选择语义
- 与 grid selection 的清晰边界
- 和 row reorder / hover / table layout 的一致性

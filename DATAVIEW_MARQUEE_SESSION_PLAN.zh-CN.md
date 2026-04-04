# Dataview Marquee Session 长期方案

## 结论

长期最优方案不再是“每个 view 维护自己的局部 marquee 几何系统”，而是统一成：

1. `marquee` 作为 page 级全局交互模式存在
2. 页面上的蓝框就是唯一的 `marquee box`
3. 各个 view 只提供当前可选 item 的 `bounding rect`
4. `selection` 继续作为唯一选择真相源
5. `marquee session` 只额外保存起手快照与 box

也就是：

- `marquee` 的生命周期与状态协调放到 page/runtime
- `marquee box` 直接定义在 page / viewport 视觉空间
- view 侧只负责提供当前可见 item rect、顺序、启动条件
- 最终命中语义统一为“蓝框与 item rect 相交即选中”

这条语义最接近用户实际看到的效果，也最接近 Notion 一类产品的行为。

## 为什么要改口

之前的方案更偏向：

- page 级 session
- view 内部局部坐标系
- `resolveIds(box)` 这种 view-local hit test

这条线在工程上能做，但会持续遇到下面这些问题：

### 1. box 的视觉坐标系和命中坐标系容易分叉

例如 `gallery` 之前出现过 box 左偏，本质上就是：

- box 先在一个局部坐标系里生成
- 渲染层又做了一次额外偏移修正

这说明“box 在哪渲染”和“hit test 用哪个坐标系”绑得过紧。

### 2. 起手范围会被 view container 限死

如果要求：

- 事件 target 必须落在 `view.containerRef`

那么就做不到接近 Notion 的交互语义：

- header 下方空白区可以起手
- query bar 周围空白区可以起手
- view 周围的页面空白区也可以起手

### 3. overflow / auto-pan 会把局部几何模型越拖越重

尤其是横向滚动场景，如果坚持 content-space 推导，就会不断引入：

- page box 和 content box 的换算
- scroll offset 参与命中
- 各个 view 自己维护投影逻辑

但用户真正关心的不是这些内部坐标，而是：

- 蓝框现在看起来碰到了谁

## 核心模型

长期统一成下面这个模型：

- page 级 `marquee box`
- view 提供 `selection targets`
- 只要 target rect 与 box 相交，就算命中

建议统一成下面这类结构：

```ts
export interface SelectionTarget {
  id: AppearanceId
  rect: Box
}
```

其中：

- `rect`
  表示当前 item 在 page / viewport 视觉空间中的实时 `bounding rect`

最终命中公式就是：

```ts
hitIds = targets
  .filter(target => intersects(target.rect, box))
  .map(target => target.id)
```

这条语义非常直接：

- 蓝框碰到 item
- item 就选中
- 蓝框没碰到
- item 就不选中

## 长期最优的数据结构

page/runtime 仍然需要一个统一的 `MarqueeSessionState`。

```ts
export interface MarqueeSessionState {
  ownerViewId: ViewId
  mode: 'replace' | 'add' | 'toggle'
  start: Point
  current: Point
  box: Box
  baseSelectedIds: readonly AppearanceId[]
}
```

几个字段的职责必须明确：

- `ownerViewId`
  当前是哪一个 view 持有这轮 marquee

- `mode`
  本轮是 replace / add / toggle 里的哪一种

- `start` / `current`
  当前 pointer 几何信息，用于持续推导 page 级蓝框

- `box`
  页面上用户实际看到的蓝框

- `baseSelectedIds`
  marquee 开始瞬间的 selection 快照

这里最关键的是两点：

- `box` 必须是页面上用户实际看到的蓝框
- `baseSelectedIds` 必须存在

原因：

- `replace` 可以直接让 `selection = hitIds(box)`
- 但 `add` / `toggle` 不能基于已经被拖动过程改写过的当前 selection 继续算
- 必须每次都从“起手快照 + 当前命中结果”重新推导

否则结果会依赖拖动路径，而不是只依赖当前蓝框。

## 统一后的选择语义

界面层不应再长期维持一套并列的 `marqueeIds`。

长期最优应该是：

- `selection` 是唯一真相源
- marquee 过程中直接同步更新 `selection`
- session 只负责保存 `baseSelectedIds`，供每次重算与取消回滚使用

### replace 模式

- pointer down 开始 marquee
- 当前 `hitIds(box)` 直接写回 `selection`
- pointer move 时持续重算并覆盖 `selection`
- pointer up 时只结束 session，不需要额外 commit

效果：

- 旧 selection 会在视觉上立刻被新框选替代

### add / toggle 模式

- pointer down 时记录 `baseSelectedIds`
- 每次 box 变化都从 `baseSelectedIds` 重新推导新的 selection
- pointer up 时只结束 session

效果：

- 多段选择 / 反选语义稳定
- 不会因为拖动过程多次覆盖而出现路径相关结果

### cancel / Esc

- 取消 marquee 时，直接把 `selection` 回滚到 `baseSelectedIds`
- 然后清掉 session

## View Adapter 应承担的职责

每个 view 只需要向 page marquee 注册一个很薄的 adapter。

建议能力收敛到下面几项：

```ts
export interface MarqueeAdapter {
  owner: {
    viewId: ViewId
  }
  canStart: (event: PointerEvent | ReactPointerEvent) => boolean
  getTargets: () => readonly SelectionTarget[]
  order: readonly AppearanceId[]
  disabled?: boolean
}
```

其中：

- `canStart`
  决定哪些区域允许发起 marquee

- `getTargets`
  返回当前可见 item 的实时 rect

- `order`
  用于构造最终 selection 顺序

page 层不需要理解：

- gallery 的 row
- kanban 的 columns
- table 的 content-space 几何
- timeline 的时间轴换算

这些都留在 view 自己产生 target rect 的内部逻辑里。

## Gallery 与 Kanban 的 target 形态

### Gallery

`gallery` 的 target 就是 card rect。

`gallery` 的 adapter 继续读取：

- `layout.cards`
- `cardOrder`
- 现有 `canStart`

最终做的事是：

- 读取当前可见 card 的 `bounding rect`
- 作为 `SelectionTarget[]` 返回

### Kanban

`kanban` 的 target 也是 card rect。

`kanban` 的 adapter 继续读取：

- board layout 中的 card
- `cardOrder`
- 现有 `canStart`

最终做的事是：

- 读取当前可见 card 的 `bounding rect`
- 作为 `SelectionTarget[]` 返回

## Overlay 是否也应 page 级统一

结论是应该。

如果采用“视觉上蓝框碰到 item rect 就选中”的产品语义，那么 `marquee overlay` 本身就应该是 page 级蓝框。

更准确地说，应统一的是：

1. page 级 session 生命周期
2. page 级 `selection`
3. page 级互斥规则
4. page 级 `marquee box`

不应统一的是：

1. view 内部如何收集 target rect
2. view 局部的布局与虚拟化细节
3. 各 view 的禁区判断与启动条件

原因：

- 用户实际看到的是 page 上那块蓝框
- 用户判断命中的依据也是蓝框是否碰到可见 item
- box 与 item rect 放在同一视觉坐标系内，命中语义最直接
- page 级 box 也允许未来从 view 周围空白区、header 下方、query bar 周围空白区发起 marquee

所以长期最优边界应明确为：

- page 级统一 session
- page 级渲染蓝框 overlay
- view 级提供 target rect
- 只有 owner view 的 target 会参与命中

## Marquee Overlay 与 Drag Preview 不是一回事

这里要明确区分两类 overlay，避免后面继续混用术语。

### 1. Marquee Overlay

这是框选时那块半透明 box。

它的职责是：

- 反馈当前 page 级 marquee session 的视觉范围

它应作为 page 级蓝框存在。

### 2. Drag Preview Overlay

这是拖卡片时跟随指针的预览层。

它通常通过 portal 挂到 `document.body`，因为它的职责是：

- 跟随全局指针
- 跨越原始 scroll/container 边界显示拖拽预览

所以：

- `marquee overlay` 应是 page-level
- `drag preview overlay` 继续是 portal/fixed 全局预览层

这两者不要再试图统一到同一个宿主层。

## 与现有 page 全局状态的关系

`marquee` 应与这些状态一起纳入 page 级协调：

- `selection`
- `inlineSession`
- `valueEditor`

长期建议语义如下：

### 1. marquee 与 selection

- marquee 运行期间直接同步更新全局 `selection`
- `selection` 始终是唯一真相源
- cancel 时再用 `baseSelectedIds` 回滚

### 2. marquee 与 inline session

- 开始 marquee 时，如果存在 inline session，应退出 inline session
- inline session 存在时，不允许启动 marquee

理由：

- 两者都是 page 级排他交互模式

### 3. marquee 与 value editor

- value editor 打开时，不允许启动 marquee
- marquee 运行期间，也不应允许打开新的 value editor

理由：

- 避免 pointer ownership 分裂

## 为什么这比继续做 view 局部 hook 更好

如果继续沿用当前方式，只修 gallery/kanban 局部逻辑，最终仍会留下：

- 两套 marquee session 生命周期
- 两套选择推导语义
- 两套 overlay 坐标修正
- 两套与 inline session / value editor 的互斥规则

这不是局部 bug，而是职责边界没收拢。

page 级 session 的价值就在于：

- 生命周期只有一份
- 与其他 page 级交互状态更容易统一协调
- 每个 view 只保留 target 提供与禁区判断职责

## 分阶段落地建议

推荐分两步，不要一步做重型几何缓存系统。

### 第一步

- page/runtime 新增 `marquee session`
- page host 渲染统一蓝框
- `gallery` / `kanban` 接入 `SelectionTarget` adapter
- 拖动过程中直接同步更新全局 `selection`
- 删除 view 局部 `marqueeIds` 与局部 marquee box 渲染

这一步完成后：

- 新框选开始时旧 selection 会立刻被当前 box 结果覆盖
- gallery/kanban 的 marquee 语义会统一到“视觉相交即选中”
- 与 selection 的关系会稳定

### 第二步

- 把 `table` 也接入 page 级 marquee session
- target 语义改为 row band rect
- 为未来 `timeline` 预留同样的 target rect 模型
- 如有性能压力，再补 target rect cache / registry，而不是先做复杂投影模型

## 明确不做的事

- 不把 gallery/kanban 的 layout cache 合并到 page 层
- 不让 page marquee 理解 row、column、card 几何细节
- 不让 page marquee 理解 table content-space 或 timeline time-space 推导
- 不把 marquee box 与 drag preview 当作同一种 overlay
- 不继续保留 `marqueeIds` 作为长期并列状态
- 不为了 marquee 再引入一套独立于 `selection` 的 preview selection 状态

## 最终结论

长期最优方案不是“继续修两个 view 的 marquee 局部 bug”，而是：

- `marquee` 升为 page 级 session
- `selection` 保持唯一真相源
- `marquee session` 只负责 `baseSelectedIds + box + mode`
- page host 渲染唯一的蓝框
- 各个 view 退回到 adapter 职责，只负责提供可见 `SelectionTarget` 与顺序

这样才能同时解决：

- gallery box 偏移
- replace marquee 视觉语义错误
- gallery/kanban/table 后续交互规则分叉
- marquee 与 inline session / value editor 协调困难

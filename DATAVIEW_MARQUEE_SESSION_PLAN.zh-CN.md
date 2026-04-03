# Dataview Marquee Session 长期方案

## 结论

`gallery` 和 `kanban` 当前都不应该继续各自维护一套局部 `marquee` 交互链路。

长期最优方案应该是：

1. `marquee` 作为 page 级全局交互模式存在
2. 具体 view 只提供几何命中与启动条件
3. `selection` 继续作为唯一选择真相源
4. `marquee session` 只额外保存起手快照与 box

也就是：

- `marquee` 的生命周期与状态协调放到 page/runtime
- `gallery` / `kanban` 继续各自负责 `resolveIds(box)`
- 不把 DOM 几何、layout cache、hit test 强行并到 page 层

## 当前问题

当前实现已经暴露出两个结构性问题。

### 1. `gallery` 的 marquee box 会偏离指针

根因不是指针事件本身错了，而是坐标系修正重复了。

当前 `useMarquee` 返回的 `box` 已经是：

- 相对当前 marquee 容器
- 含 scroll offset

但 `gallery` 渲染层又额外做了一次 `contentInsetLeft` 扣减，导致 box 在视觉上整体向左偏移。

这说明：

- 现在 box 的视觉渲染坐标系和 hit test 坐标系没有统一收敛
- view 局部自己维护 overlay 更容易产生重复 offset 修正

### 2. 开始新一轮框选时，旧 selection 不会立刻消失

当前 `gallery` 和 `kanban` 都是：

- page 全局 `selection`
- view 局部 `marqueeIds`

开始框选时只更新 `marqueeIds`，但真正的选择状态仍然是旧的 committed selection。

于是视图渲染会同时看到：

- 旧的 committed selection
- 新 box 对应的临时命中结果

这会导致 replace marquee 的视觉语义不对。

Notion 一类产品的正确语义应该是：

- replace marquee 开始后，界面直接反映当前 box 推导出的 selection
- add / toggle marquee 开始时，以开始瞬间的 selection 作为基线
- 选择结果在拖动过程中可以直接同步写回全局 `selection`

## 为什么值得上升为 page 级全局模式

当前 dataview 的前提已经足够支持这件事：

- 同一时刻只有一个 current view 可见
- `selection` 已经是 page 级状态
- `inlineSession` / `valueEditor` 也已经是 page 级状态

在这种约束下，`marquee` 继续留在 view 内，只会带来：

- gallery/kanban 两套 session 生命周期
- 两套 selection 推导语义
- 两套 overlay 坐标修正
- 两套 auto-pan / cancel / commit 处理

这条线应该收敛。

## 但不应该全局化到什么程度

不应该把整个 marquee 逻辑做成一个“page 层理解所有 view 布局细节”的大系统。

长期最优边界是：

- page 层只拥有 session、模式、起手快照、取消/结束
- view 层继续拥有 layout cache、hit test、canStart

所以正确结构不是：

- page 级统一几何系统

而是：

- page 级 session
- view 级 adapter

## 长期最优的数据结构

建议在 page/runtime 新增 `MarqueeSessionState`。

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

其中几个字段的职责必须明确：

- `ownerViewId`
  当前是哪一个 view 持有这轮 marquee

- `mode`
  本轮是 replace / add / toggle 里的哪一种

- `start` / `current`
  当前 pointer 几何信息，用于持续推导 `box`

- `box`
  当前 marquee 的实时矩形

- `baseSelectedIds`
  marquee 开始瞬间的 selection 快照

这里最关键的是 `baseSelectedIds` 必须存在。

原因：

- `replace` 可以直接让 `selection = hitIds(box)`
- 但 `add` / `toggle` 不能基于已经被拖动过程改写过的当前 selection 继续算
- 必须每次都从“起手快照 + 当前命中结果”重新推导

否则结果会依赖拖动路径，而不是只依赖当前 box。

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
  containerRef: RefObject<HTMLElement | null>
  canStart: (event: PointerEvent | ReactPointerEvent) => boolean
  resolveIds: (box: Box) => readonly AppearanceId[]
  order: readonly AppearanceId[]
  disabled?: boolean
}
```

其中：

- `containerRef`
  定义当前 session 的局部坐标系

- `canStart`
  决定哪些区域允许发起 marquee

- `resolveIds`
  根据当前 box 做命中测试

- `order`
  用于构造最终 selection 顺序

page 层不需要理解：

- gallery 的 row
- gallery 的 card rect
- kanban 的 columns
- kanban 的 card layout

这些都留在 view 自己的 adapter 内部。

## Gallery 与 Kanban 的 adapter 形态

### Gallery

`gallery` 的 adapter 继续读取：

- `layout.cards`
- `cardOrder`
- 现有 `canStart`

`resolveIds(box)` 本质上仍然就是：

- `idsInRect(cardOrder, layout.cards, box)`

### Kanban

`kanban` 的 adapter 继续读取：

- board layout 中的 card rects
- `cardOrder`
- 现有 `canStart`

`resolveIds(box)` 本质上还是：

- `idsInRect(cardOrder, cards, box)`

## Overlay 是否也应 page 级统一

长期来看可以，但不建议第一步就做。

更稳的路线是：

1. 先把 session 提到 page 级
2. box 先仍由 owning view 渲染
3. 等坐标系完全稳定后，再考虑是否迁移到 page host

原因：

- 当前已出现重复 offset 修正问题
- 如果立刻把 box 也提到 page host，会新增一层 page/global 坐标换算
- 风险会比先收敛 session 更高

所以第一阶段建议：

- page 级统一 session
- view 级渲染 overlay
- 只有 owner view 才显示 box

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
- 每个 view 只保留几何与命中测试职责

## 分阶段落地建议

推荐分两步，不要一步把所有几何渲染都抬到 page 层。

### 第一步

- 修正 `gallery` 当前 box 左偏问题
- page/runtime 新增 `marquee session`
- `gallery` / `kanban` 接入 adapter
- 拖动过程中直接同步更新全局 `selection`
- 删除 view 局部 `marqueeIds`

这一步完成后：

- 新框选开始时旧 selection 会立刻被当前 box 结果覆盖
- gallery/kanban 的 marquee 语义会统一
- 与 selection 的关系会稳定

### 第二步

- 评估是否把 overlay 渲染统一到 page host
- 如果迁移，要求先明确 page/global 坐标系
- 只有在所有 view 的坐标基准完全统一后才做

## 明确不做的事

- 不把 gallery/kanban 的 layout cache 合并到 page 层
- 不让 page marquee 理解 row、column、card 几何细节
- 不继续保留 `marqueeIds` 作为长期并列状态
- 不为了 marquee 再引入一套独立于 `selection` 的 preview selection 状态

## 最终结论

长期最优方案不是“继续修两个 view 的 marquee 局部 bug”，而是：

- `marquee` 升为 page 级 session
- `selection` 保持唯一真相源
- `marquee session` 只负责 `baseSelectedIds + box + mode`
- `gallery` / `kanban` 退回到 adapter 职责，只负责命中测试与局部坐标系

这样才能同时解决：

- gallery box 偏移
- replace marquee 视觉语义错误
- gallery/kanban 交互规则分叉
- marquee 与 inline session / value editor 协调困难

# dataview marquee 与虚拟化长期方案

## 结论

如果 `dataview` 对 marquee 的目标语义是：

- 用户视觉上框到了什么，就选中什么
- 命中判断尽量基于真实 DOM
- marquee 不承担 table / gallery / kanban 的 layout 计算职责
- autopan 过程中仍保持上述视觉语义

那么长期最优方案不应该是把 marquee 演进成一个通用 geometry / layout hit-test 系统。

长期最优方案应该是：

- **坚持 DOM-first**
- **把 target 的生命周期从 mounted 生命周期中解耦**
- **把 marquee 命中层升级为 session-scoped 的 persistent DOM target registry**

一句话说：

- `marquee` 继续只做 `box intersects rect`
- `rect` 继续来自真实 DOM
- 但 item 因虚拟化卸载后，不应立刻失去参与 marquee 的资格
- 在 marquee session 内，它应以最近一次真实 DOM 测量结果继续存在

也就是说，长期边界不应再是：

- `marquee` 只依赖“当前 mounted DOM 列表”

而应改为：

- `marquee` 依赖“当前 session 的 visual DOM targets”

这套 visual DOM targets 由两部分组成：

- live DOM target
- frozen DOM snapshot target

其中 frozen snapshot 不是 layout 推导结果，而是：

- item 卸载前最后一次真实 DOM 视觉矩形

这条路线的核心价值是：

- 不把 marquee 变成 layout 系统
- 不把横向 autopan 复杂度引入到命中层
- 不丢失纯 DOM 视觉命中的产品语义
- 与现有 `idsInRect()` / `intersects()` 模型天然兼容

## 问题本质

当前问题不是“相交算法不对”，而是“候选 target 的生命周期过短”。

现有模型大致是：

- marquee host 每一帧读取当前 view adapter
- adapter 返回当前可收集到的 DOM target
- host 用 `idsInRect(order, targets, box)` 算出当前命中集合

这里的隐含前提是：

- 能被选中的对象，必须此刻仍然在 DOM 中

而虚拟化恰好破坏了这个前提：

- 一旦 item 滚出视口并被卸载，它就从 target 集里消失

因此在 marquee + autopan 的连续拖拽过程中：

- 上方已经框中过的 item
- 只要因虚拟化被卸载
- 后续帧就会掉出命中集合

这不是 marquee 算法的 bug，而是 target source 的生命周期与交互 session 生命周期不一致。

## 为什么不建议走 geometry / layout 方案

从架构抽象角度，geometry provider 看起来很干净。

但对于当前需求，它并不是最合适的长期终局。

### 1. 它改变了 marquee 的职责

一旦把 marquee 命中建立在 layout / virtual geometry 之上，marquee 实际上就开始依赖：

- row 的逻辑 top / bottom
- column 的逻辑 left / right
- sticky / inset / padding 修正
- 不同 view 的 block 布局语义

这会让 marquee 从：

- 视觉命中层

慢慢变成：

- 布局命中层

这和当前想要的语义是相反的。

### 2. 横向 autopan 会把复杂度放大

一旦用 layout 作为主要命中来源，横向 autopan 会立即带来这些问题：

- container scrollLeft 变化
- content bounds 变化
- sticky rail / header 影响
- grid content offset 与视觉命中的映射
- 某些视图的局部滚动容器与全局滚动容器不一致

而纯 DOM 思路里，这些复杂度大部分都天然被 DOM 吃掉了。

因为 DOM 给你的就是：

- 此刻用户屏幕上真实看到的位置

### 3. 它不符合当前产品最重要的判定标准

你现在更在意的是：

- 用户看到框压到卡片/行了没有

而不是：

- 逻辑布局上这个 row 的理论投影是否在 box 里

既然产品语义是视觉优先，长期边界就应该围绕“视觉 rect 的保留与延续”来建，而不是围绕“逻辑布局 rect 的推导”来建。

### 4. 它容易把不同视图的复杂度过早统一

table、gallery、kanban 的布局复杂度完全不同。

如果现在为了 marquee 一步到位上 geometry framework，最后大概率是：

- 抽象变大
- 真实收益先落不到用户感知上
- 维护成本先上来

这不符合当前问题的性价比。

## 长期最优边界

### 目标

把 marquee 的核心模型稳定在下面这条线上：

- session 期间维护一份“可命中的视觉 target 集”
- 命中只做 rect intersection
- target 的来源始终是 DOM
- virtualization 只影响 live DOM，不再直接决定 target 是否存在

因此长期推荐的新边界是：

```ts
dataView.marquee
dataView.visualTargetRegistry
```

语义上：

- `dataView.marquee` 负责 session、pointer、box、mode、selection merge、autopan
- `visualTargetRegistry` 负责在 session 内维护“当前 view 中仍可参与命中的视觉 rect”

registry 的目标不是表达布局真相，而是表达：

- “在这次框选交互的视觉历史里，哪些对象曾经真实出现在 DOM 上，以及它们最后一次被看到时的 rect 是什么”

## 推荐模型

### 1. live target

当 item 仍然 mounted：

- 直接从真实 DOM 读取 rect

这是首选事实来源。

### 2. frozen snapshot target

当 item 因虚拟化被卸载：

- 不立刻从 registry 中删除
- 而是降级成 frozen snapshot

这个 snapshot 保存的是：

- 最近一次真实 DOM 测量出来的 rect
- 对应的 id
- 对应的 viewId
- 生成时的 session revision / layout revision

注意：

- 它不是逻辑 layout 计算值
- 它不是 virtual block 推导值
- 它只是“最后一次真实 DOM 视觉矩形”

### 3. session-scoped lifetime

这些 frozen snapshot 不建议长期挂在 view controller 上。

更合理的生命周期是：

- 在 marquee session 启动时开始收集
- 在 session 结束或取消时清空

这是因为它们的意义是：

- 为当前连续框选动作保持视觉连续性

而不是：

- 作为长期布局缓存存在

### 4. revision-based invalidation

虽然不建议走 full geometry，但 snapshot 仍需要失效策略。

推荐至少绑定这些 revision：

- 当前 active view identity
- order revision
- grouped sections revision
- collapsed state revision
- row/card size revision
- container width revision

当这些 revision 在 session 中发生剧烈变化时：

- 要么清空 frozen targets 并重新开始收集
- 要么直接取消当前 marquee

不要试图让旧 snapshot 在结构性变化后继续硬用。

## autopan 下的长期处理

### 核心原则

autopan 不应改变命中语义。

无论用户是静止拖拽还是自动滚动拖拽，系统都应该保持：

- 只依据视觉 rect 判断是否 intersect

因此 autopan 的职责只应是：

- 让 pointer / box 持续更新
- 让 mounted DOM target 持续进入 registry
- 让已经离开 DOM 的 target 以 frozen rect 留在 registry

它不应额外触发：

- layout 推导模式切换
- 特殊的“不可见区命中算法”

### 为什么这条路对横向 autopan 更友好

横向 autopan 最麻烦的地方在于：

- box 在动
- scrollLeft 在动
- 视觉内容整体在横向偏移

如果命中基于 layout，这时必须不断重算：

- content-space 与 viewport-space 的转换
- 行/卡片在不同滚动状态下的理论位置

而如果命中基于 visual DOM snapshot，问题会简单很多：

- live item 继续重新测 DOM rect
- frozen item 保持其离开时最后一次视觉 rect

这就把复杂度压回到了“真实看见过的东西保持它的视觉痕迹”。

从产品直觉上，这也更合理：

- 用户框选时，他在意的是“刚刚框到的那一批视觉对象不要突然失效”

而不是：

- 横向滚动后系统去追踪一套新的理论布局位置

## table 的长期最优实现

`table` 是最适合先落这套方案的视图。

原因不是它 layout 更适合推导，而是：

- row 目标天然稳定
- row target registry 已经存在
- 当前问题最明显地出现在 table marquee + virtualization + autopan

### table 中应坚持的原则

#### 1. 行命中仍然是 DOM 命中

table row 是否被框中，仍然由它的真实 DOM rect 决定。

不建议把 row marquee 重写成：

- 通过 row index 推导 top/bottom
- 再做 range 命中

那会让 table 的 marquee 语义从视觉命中滑向布局命中。

#### 2. 行卸载后保留最后一次真实 rect

row unmount 时：

- 从 live row node map 中移除
- 但如果 marquee session 仍活跃，则把它的最后测量 rect 转存到 frozen row target map

之后 `getTargets()` 的语义变成：

- live rows
- 加上当前 session 内尚未失效的 frozen rows

#### 3. row 的横向边界可以适度收敛

对于 table row 来说，用户通常更在意纵向是否框到这一行。

所以如果后续发现横向 scroll 导致 frozen rect 的 `left/right` 容易失真，一个合理的收敛策略是：

- `top/bottom` 严格来自最后一次真实 DOM
- `left/right` 则在 session 内按当前 table content bounds 统一更新

这仍然属于 DOM-first，而不是 layout-first。

因为 content bounds 本身也是从当前 DOM 容器读取的，不是逻辑布局推导。

这一步可以显著降低横向 autopan 的维护成本。

#### 4. 只解决 session 连续性，不追求跨 session 永久缓存

table 不需要把 frozen rect 做成长期缓存层。

长期目标只是：

- 在一次连续 marquee 交互中，不因虚拟化卸载而丢失视觉连续性

session 结束后，这些 frozen rect 应直接释放。

## gallery 与 kanban 的长期方向

同样原则也可以推广，但不建议一开始就强求统一抽象过深。

### gallery

gallery 更接近 table 的延展版：

- card 是独立视觉对象
- virtualization 会回收 DOM

因此 gallery 也适合：

- mounted card 用 live DOM
- unmounted card 用 frozen snapshot

### kanban

kanban 需要更谨慎，因为它通常有：

- board 级横向滚动
- column 内纵向滚动或局部布局变化

但产品语义如果依旧是视觉命中，那么它仍应优先遵守：

- live DOM + frozen snapshot

而不是优先往 column geometry 推导上靠。

kanban 真正需要额外处理的，只是：

- snapshot 在 column 重排或容器 resize 时更容易失效

这属于 invalidation 策略问题，不是 geometry 架构问题。

## 推荐 runtime 演进方向

### 1. marquee host 保持 page-global

当前 page-global marquee session 是对的。

应继续由 host 统一负责：

- pointer session
- box 更新
- auto-pan
- replace / add / toggle 规则
- selection 写入

### 2. adapter 继续提供 target，但 target 来源升级

长期不一定需要把 adapter 改成 `hitTest(box)` 或 geometry provider。

对于当前需求，更自然的演进是：

- adapter 继续暴露 target 集
- 但 target 集不再等于 mounted DOM 集
- 而等于 visual target registry 的当前快照

也就是说，长期最小而正确的 contract 更像是：

```ts
interface MarqueeVisualAdapter {
  viewId: ViewId
  canStart(event: PointerEvent): boolean
  getTargets(): readonly SelectionTarget[]
  order(): readonly AppearanceId[]
  resolveAutoPanTargets?(): AutoPanTargets | null
  onStart?(session: MarqueeSessionState): void
  onEnd?(session: MarqueeSessionState): void
  onCancel?(session: MarqueeSessionState): void
  disabled?: boolean
}
```

区别不在接口长相，而在 `getTargets()` 的语义：

- 以前是 mounted DOM snapshot
- 以后是 session-scoped visual target snapshot

### 3. registry 内部要支持冻结与解冻

建议 registry 内部至少支持三类状态：

- `live`
- `frozen`
- `stale`

其中：

- `live` 表示当前仍有 DOM node
- `frozen` 表示当前无 DOM node，但本 session 仍有效
- `stale` 表示因 revision 变化不再可信，应被回收

### 4. 结构性变化时优先取消，不强做 reconcile

以下事件如果发生在 marquee session 中：

- active view 切换
- 排序变化
- 分组折叠切换
- 过滤结果突变
- 大幅 resize

长期建议优先策略是：

- 直接取消当前 marquee

原因很简单：

- 当前交互的视觉上下文已经断裂

这比试图拿旧 snapshot 继续“智能修复”更稳。

## 不建议的方向

### 1. marquee 期间关闭虚拟化

这会造成：

- 大列表性能抖动
- 大量 DOM 重新挂载
- 交互越长性能越差

这不是长期合理边界。

### 2. marquee 期间 pin 住所有命中过的 DOM 节点

这会让 selection 状态反向支配渲染层：

- 选得越多，DOM 越多
- 复杂度和性能都不可预测

### 3. 让 marquee 负责 layout / geometry 推导

这会让一个本来简单的视觉交互层承载过多布局知识。

尤其在横向 autopan 场景下，复杂度会很快失控。

### 4. 把 frozen snapshot 做成长期全局缓存

snapshot 的作用是保持一次 session 内的视觉连续性。

它不是长期布局数据库。

如果把它做成跨 session 常驻缓存，会引入：

- 更多失效逻辑
- 更多脏数据可能性
- 更弱的语义边界

## 分阶段落地建议

### 第一阶段：table 先做 session-scoped frozen row targets

目标：

- 不改 marquee host 主模型
- 不引入 layout hit-test
- 先解决 table 中最明显的问题

建议动作：

- row registry 在 unmount 前保留最后一次 DOM rect
- marquee session 存在时，把该 rect 放入 frozen target map
- `getTargets()` 返回 live rows + frozen rows
- session 结束时清空 frozen rows

### 第二阶段：把 frozen target 机制收敛为通用 visual registry

目标：

- gallery / kanban 可以复用同样模式

建议动作：

- 把 table 内部的 frozen target 机制抽成共享 runtime helper
- helper 只提供 live/frozen/stale 生命周期，不提供 layout 能力

### 第三阶段：补全 invalidation 与 autopan 测试

建议覆盖：

- 向下 autopan 时，上方已卸载 row 不丢失
- 横向 autopan 时，row visual hit 语义稳定
- add / toggle / replace 模式
- session 中排序 / filter / collapse 变化时的 cancel 行为
- gallery / kanban 的 frozen target 兼容性

## 最终建议

这件事如果按长期最优来定边界，我更建议这样定义：

- marquee 不是 geometry 系统
- marquee 不是 layout 系统
- marquee 是一个基于视觉 DOM rect 的交互系统

它现在的问题不是“不够懂 layout”，而是：

- 它错误地把 target 生命周期绑定在 mounted 生命周期上

所以长期最优解不是把它改造成 layout 引擎，而是把它改造成：

- **session-scoped visual target system**

最终原则可以浓缩成三句话：

- rect 永远尽量来自真实 DOM
- item 卸载不等于它在当前 marquee session 中失效
- autopan 只推动 box 与 target 更新，不改变视觉命中语义

一句话总结：

- **长期最优不是 geometry-first，而是 DOM-first + persistent visual targets。**

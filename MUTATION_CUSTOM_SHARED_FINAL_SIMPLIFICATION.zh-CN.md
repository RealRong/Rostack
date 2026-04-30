# Mutation / Custom / Shared 最终设计

## 目标

本文只定义长期最优终态，不讨论兼容、过渡或双轨保留。

最终目标固定为：

- `shared/mutation` 成为 mutation 语义层唯一基础设施。
- `canonical op` 不再依赖“从 document diff 反推 delta”。
- `delta` 只表达 mutation 语义事实，不承接 projection 派生几何。
- `projection` 自己根据 mutation semantic delta 推导 graph / geometry / spatial invalidation。
- `whiteboard`、`dataview` 不再各自维护一套 app-local custom result 组装系统。
- 能 canonical 的一律 canonical。
- 不能退化成 entity patch 的结构语义，上收为 canonical structural op，而不是长期留在 app-local custom reducer。

## 核心结论

## 1. “从 document diff 推导 delta” 不是正确基础模型

这条结论必须固定。

`delta` 的本质应该是：

- 本次 mutation 明确声明了什么语义变化

而不是：

- 事后拿 `before/after document` 去猜本次到底改了什么

原因很直接：

- 同一个语义变化，不一定对应稳定的 document path diff。
- 很多结构 op 的语义远强于字段改写。
- `projection derived state` 根本不应该倒灌回 document，再靠 diff 偷渡语义。

所以长期最优里：

- `delta` 是显式 semantic facts
- 不是 snapshot diff 产物

## 2. canonical op 不需要依赖 document diff

`canonical` 的成立条件不是“最终能从 diff 推导”。

`canonical` 的成立条件是：

- op 语义稳定
- apply 规则稳定
- history / collab / conflict 边界稳定
- delta / footprint 可以由 op 本身直接声明

例如：

- `node.patch` 天然知道改了哪些 field/path
- `node.create` / `node.delete` 天然知道 lifecycle 事实
- `canvas.order.move` 天然知道改了 `canvas.order`
- `mindmap.topic.move` 天然知道改了 `mindmap.structure`
- `mindmap.move` 天然知道改了 owner anchor，并触发 owner layout 语义变化
- `external.version.bump` 天然就是一个 signal

这些都不需要通过 document diff 才能成立。

## 3. derived geometry 不属于 mutation delta

这条边界必须和上一条一起固定。

`mutation delta` 表达的是 document / op 语义层事实。

`derived geometry` 属于 projection 下游派生：

- 哪些 `NodeView.geometry` 要重算
- 哪些 `EdgeView.route` 要重算
- 哪些 `MindmapView.tree.layout` 要重算
- 哪些 spatial record 要刷新

这些都不该作为 `shared/mutation` 的底层通道继续向上膨胀。

否则 shared 会被迫同时承担：

- document semantic delta
- derived geometry delta
- runtime invalidation delta

底层会变重，而且边界会越来越乱。

正确模型是：

- mutation 层只发 semantic delta
- projection 层自己把 semantic delta 展开成 geometry / graph invalidation

## 4. 不是所有 custom op 都应该降成 entity patch

这条结论继续成立。

以下这类不是“batch canonical entity patch”能正确表达的：

- `mindmap.topic.move`
- `mindmap.topic.delete`
- `canvas.order.move`
- `edge.label.move`
- `edge.route.point.move`

原因不是实现问题，而是语义问题：

- 它们依赖 apply-time 当前结构
- 它们的冲突粒度是结构粒度
- 它们经常触发 owner 结构和顺序变化

长期目标不是“全部变 patch”，而是：

- 纯字段/记录写入进入 canonical entity op
- 树 / 顺序 / 插入 / 移动 / 删除进入 canonical structural op
- 真正剩余无法共享化的少数语义，才保留 custom reducer

## 最终架构

## 1. Intent 层

`intent` 是产品 / UI 语义：

- 面向 editor 交互
- 面向业务命令
- 不要求直接可回放

例如：

- `mindmap.topic.clone`
- `canvas.selection.move`
- `view.open`

## 2. Canonical op 层

`canonical op` 是 mutation 引擎真正 apply 的稳定语义层。

最终只保留两类：

- canonical entity op
- canonical structural op

### canonical entity op

典型例子：

- `node.create`
- `node.patch`
- `node.delete`
- `record.patch`
- `field.create`
- `view.patch`

### canonical structural op

典型例子：

- `canvas.order.move`
- `mindmap.topic.insert`
- `mindmap.topic.move`
- `mindmap.topic.delete`
- `edge.label.insert`
- `edge.label.move`
- `edge.route.point.move`

这些 op 仍然是 canonical，不应被视为“非 canonical custom”。

## 3. Apply 层

每个 canonical op 在 apply 时，直接产出：

- `document`
- `delta`
- `footprint`
- `history`

这里的 `delta` 是显式语义结果，不是 diff 推导结果。

## 4. Projection 层

`projection` 只消费 mutation semantic delta 和 runtime overlay。

它的职责是把：

- mutation semantic delta
- preview patch
- draft measure
- runtime session state

展开成：

- graph patch
- geometry recompute
- spatial invalidation
- render / hit / selection 需要的最终视图

也就是说：

- `mindmap.layout` touched
  -> projection 决定整棵树哪些 node rect 变化
- `mindmap.structure` touched
  -> projection 决定哪些 node / connector / bbox 变化
- `node.geometry` touched
  -> projection 决定这个 node 和相关 edge 如何刷新

这部分不属于 `shared/mutation`。

## Shared / Mutation 的最终职责

## 1. shared/mutation 只负责 mutation 语义层

最终 `shared/mutation` 负责：

- compile intent 到 op
- apply op
- merge delta
- merge footprint
- 管理 history
- 管理 commit / publish / replay 所需的稳定 mutation 结果

它不负责：

- projection geometry 扩散
- graph invalidation fanout
- spatial 索引更新

## 2. delta 的来源应该是 op / write，而不是 document diff

shared 最终允许两种稳定来源：

### 1. canonical write-set / patch-set 直接生成 semantic delta

例如：

- `node.patch` 已知字段和 record write
- `record.patch` 已知 path write
- `document.patch` 已知字段赋值

这种场景 shared 可以从 write-set 编译 semantic delta。

注意这里是：

- 从 canonical write-set 编译

不是：

- 从完整 `before/after document` diff 反推

### 2. structural / custom op 显式返回 semantic delta

例如：

- `canvas.order.move`
- `mindmap.topic.move`
- `external.version.bump`

这些 op 直接返回它们的 semantic delta。

## 3. footprint 同样是语义层事实

`footprint` 也不应该依赖 document diff 作为唯一模型。

最终来源同样分两类：

- shared 从 canonical write-set 自动生成标准 footprint
- structural/custom op 显式补充 coarse semantic footprint

例如：

- `mindmap.structure`
- dataview 的 cross-family relation footprint
- 顺序结构冲突 key

## Custom Reducer 的最终 contract

## 1. 最终 contract 要最小化

长期最优里，custom reducer 不需要再返回一堆“帮 shared 补洞”的中间态。

最终 contract 应该固定为：

```ts
interface MutationCustomReduceResult<Doc, Op> {
  document?: Doc
  delta?: MutationDeltaInput
  footprint?: readonly MutationFootprint[]
  history?: false | MutationCustomHistoryResult<Op>
  outputs?: readonly unknown[]
  issues?: readonly MutationIssue[]
}
```

shared runtime 负责：

- normalize `document`
- 合并 `delta`
- 合并 `footprint`
- 校验 `history`

但 shared 不应该要求 reducer 额外返回：

- entity effect bag
- footprint effect bag
- extra delta channel
- extra footprint channel

这些都是错误分层留下来的补丁。

## 2. 不要再设计第二套 effect DSL

长期最优里，不建议继续扩展：

- `entityEffects`
- `footprintEffects`
- `extraDelta`
- `extraFootprint`

原因很简单：

- 这会把 shared 再次做成一个“解释很多中间语义”的平台
- app 包仍然要学习一套 mutation 结果 DSL
- 复杂度从“直接返回 semantic delta / footprint”变成“先描述 effect，再让 shared 猜怎么落”

这不是简化。

最终应该是：

- reducer / op 直接返回最终 semantic `delta`
- reducer / op 直接返回最终 semantic `footprint`

shared 只做 merge / normalize / verify。

## `createWhiteboardCustomResult` 的最终结论

## 1. 当前膨胀的根因

当前形态：

```ts
createWhiteboardCustomResult({
  before,
  document,
  history,
  effects?,
  extraDelta?,
  footprintEffects?,
  extraFootprint?
})
```

它之所以这么大，不是因为 whiteboard 业务天然复杂，而是因为：

- shared 还在要求一部分 delta / footprint 通过 effect + diff 侧向推导
- 另一部分又只能 direct 返回
- 所以 helper 被迫同时兼容两套模式

这不是最终设计。

## 2. 最终不应该保留这些参数

长期最优里，这些都不该存在：

- `before`
- `effects`
- `extraDelta`
- `footprintEffects`
- `extraFootprint`

原因：

- `before` 只有在“从 diff 推导结果”时才重要
- 其余几个只是 effect DSL 的补丁入口

如果结果是显式 semantic delta / footprint，那么 helper 根本不需要知道 `before`。

## 3. 如果临时保留 helper，最小形态应该是

如果还保留一个 app helper，它的最终最小形态只应当是：

```ts
createCustomResult({
  document,
  delta,
  footprint,
  history
})
```

也就是说：

- helper 只是薄封装
- 不再负责推导语义
- 不再解释 effect

更优终态则是 helper 直接删除，reducer 返回 shared 官方结果结构。

## Whiteboard 的最终落点

## 1. `mindmap` 的正确边界

删除 `reconcileMindmap` 之后，正确模型已经明确：

- root `position` 是 committed anchor input
- child topic committed `position` 不再是正式真值
- child 最终 rect 只存在于 projection
- `mindmap` mutation 只发 semantic delta
- projection 自己展开整棵树的 geometry 更新

因此最终不应该再让 mutation 层发“child `node.geometry` 全量 touched”这种 derived geometry delta。

最终应该发的是：

- `mindmap.structure`
- `mindmap.layout`
- 必要时 root `node.geometry`

然后 projection 负责把这些 owner 语义扩散成具体 node / edge 刷新。

## 2. `node.geometry` 的最终语义

`node.geometry` 在 mutation 层只表示：

- node committed geometry input 直接变化

例如：

- `position`
- `size`
- `rotation`

它不表示：

- owner relayout 造成的派生 rect 变化

后者属于 projection。

## 3. `canvas.order.move`

这是 canonical structural op，不该长期留在 whiteboard custom runtime。

shared 最终应提供共享顺序结构 op。

## 4. `edge.label.*` / `edge.route.point.*`

这两组最终也应该上收：

- 要么变成 shared structural op
- 要么先做数据模型正规化，再进入 entity canonical

但都不该永久停留在 app-local custom reducer。

## Dataview 的最终落点

## 1. `record.values.writeMany`

它的本质不是“需要 effect DSL”，而是：

- 它直接知道自己改了哪些 semantic paths
- 它直接知道需要哪些 relation footprint

所以正确模式就是：

- 直接返回 typed semantic delta
- 直接返回 semantic footprint

## 2. `external.version.bump`

这是最纯粹的 signal-only mutation。

它证明了：

- mutation semantic delta 不要求一定对应 document diff

这不是特殊情况，而是正确模型。

## 最终收口规则

必须同时满足以下条件：

- `delta` 是显式 semantic facts，不是 document diff 推导结果
- `footprint` 是显式语义冲突边界，不是 document diff 副产品
- canonical op 直接声明自己的 semantic delta / footprint
- shared 对 entity patch 只允许从 canonical write-set 推导，不允许把 snapshot diff 当基础模型
- projection invalidation 与 mutation delta 严格分层
- derived geometry 不进入 mutation 底层 contract
- app 包不再维护第二套 custom result 组装 DSL
- `createWhiteboardCustomResult(...)` 这类 helper 最终删除或极薄化
- 能 canonical 的一律上收为 shared canonical op
- 真正剩余的 custom reducer 数量保持最小

## 最终判断

上一版里“shared 必须同时支持 direct semantic delta / derived geometry delta / external signal delta”这个表述不对。

最终正确设计是：

- shared/mutation 只支持 mutation semantic delta
- external signal delta 属于 semantic delta 的一种
- derived geometry 不属于 mutation delta，而属于 projection invalidation

因此真正的长期最优不是把 shared 做得更像一个“万能 delta 推导平台”，而是把边界切得更干净：

- mutation 负责语义事实
- projection 负责派生几何
- canonical op 直接声明变化
- custom reducer 只返回最终 semantic result

这才是长期最优终态。

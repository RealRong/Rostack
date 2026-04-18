# DATAVIEW Marquee 重构与设计方案

## 1. 目标

本文档讨论 dataview 当前 marquee 架构是否合理，以及如果以长期最优为目标，应该如何重构。

重点问题来自这里：

- [dataview/packages/dataview-react/src/runtime/marquee/types.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/runtime/marquee/types.ts)
- [dataview/packages/dataview-react/src/page/hosts/MarqueeHost.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/hosts/MarqueeHost.tsx)

当前 `MarqueeAdapter` 定义如下：

```ts
export interface MarqueeAdapter {
  viewId: ViewId
  canStart: (event: PointerEvent) => boolean
  getTargets?: () => readonly SelectionTarget[]
  getHitIds?: (session: MarqueeSessionState) => readonly ItemId[]
  domain: () => OrderedSelectionDomain<ItemId>
  resolveAutoPanTargets?: () => AutoPanTargets | null
  previewSelection?: (selection: ItemSelectionSnapshot) => void
  clearPreviewSelection?: () => void
  onStart?: (session: MarqueeSessionState) => void
  onEnd?: (session: MarqueeSessionState, selection: ItemSelectionSnapshot) => void
  onCancel?: (session: MarqueeSessionState, selection: ItemSelectionSnapshot) => void
  disabled?: boolean
}
```

本文档的结论会非常明确：

- 当前 `MarqueeAdapter` 抽象层级是错的
- 它不是一个小 adapter，而是一个混合了命中、选择、预览、生命周期、副作用、滚动控制的 view 交互协议
- marquee 应该更接近 whiteboard 的设计：`page` 是 canvas，view 只是 node scene
- 长期最优方案不是继续修 `MarqueeAdapter`，而是把它拆成 `global marquee session + marquee scene + view presentation` 三层
- 在这三层里，selection domain 与 marquee autopan 都应收回全局 runtime，不再由各 view scene 提供

## 2. 当前问题

### 2.1 `MarqueeAdapter` 混合了太多层次

现在这个接口同时承担了：

- pointer 手势准入
- 几何命中
- selection domain 定义
- auto pan 目标解析
- preview selection 更新
- start / end / cancel 生命周期
- view 局部副作用

也就是说，它把下面几层原本应该分开的职责塞进了一个对象里：

1. marquee gesture runtime
2. selection preview / commit flow
3. view-local hit testing
4. view-local visual side effects

这会直接带来两个问题：

- host 必须理解太多 view 特性
- 各个 view 被迫实现一套“看起来像 adapter，实际上是微型控制器”的协议

### 2.2 接口本身已经暴露出模型不稳定

最典型的信号就是：

- 既有 `getTargets`，又有 `getHitIds`

这说明系统没有统一回答一个问题：

- marquee 的核心输入到底是“nodes”还是“hitTest result”

如果底层模型清晰，就不应该同时存在两套并行协议。

### 2.3 `previewSelection` 暴露的是架构缺口，不是真需求

table 当前在 [dataview/packages/dataview-react/src/views/table/components/body/Body.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/body/Body.tsx) 里这样接 marquee：

```ts
previewSelection: nextSelection => {
  table.marqueeSelection.set(nextSelection)
},
clearPreviewSelection: () => {
  table.marqueeSelection.set(null)
},
```

这并不表示“preview selection 必须由 table 自己控制”。

恰恰相反，这说明：

- 当前系统把“命中集合”和“选择结果”混成了一层 preview callback
- table 被迫把 marquee 过程态塞进局部 store
- 这说明运行时语义没有被正确表达成 `hitIds`

这属于架构缺失导致的下沉补丁。

### 2.4 `onStart / onEnd / onCancel` 里混着两类完全不同的事

以 table 为例：

- `table.nodes.startRowMarquee(...)`
- `table.nodes.endRowMarquee()`
- `table.selection.cells.clear()`
- `table.rowRail.set(null)`
- `table.hover.clear()`
- `table.focus()`

这里面至少混着两类东西：

第一类是全局交互时序：

- 开始时清空某些旧交互态
- 结束时提交选择
- 取消时回退预览

第二类是 view-local 表现副作用：

- row marquee 样式切换
- DOM 命中辅助状态
- 视图焦点恢复

这两类东西不应该都挂在 `MarqueeAdapter` lifecycle hook 上。

### 2.5 gallery / kanban 的 `visualTargets` 也被放在了错误边界

[dataview/packages/dataview-react/src/views/shared/interactionRuntime.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/interactionRuntime.ts) 里，gallery / kanban 通过：

- `createVisualTargetRegistry(...)`
- `visualTargets.getTargets(...)`
- `visualTargets.freeze(...)`
- `visualTargets.clearFrozen()`

解决虚拟化、滚动和节点卸载后的几何投影问题。

这些能力确实是需要的，但它们属于：

- 某种具体 scene 如何暴露 node geometry

而不应该升级成全局 marquee adapter 的公共协议。

更进一步看，当前 dataview 的约束其实已经说明：

- kanban 没有虚拟化
- gallery 的 card width 固定
- gallery 的 item height / row layout 已经在 virtual layout 中
- table 虽然有 `x` 轴滚动和 `y` 轴虚拟化，但 row top / bottom 也完全可以由 layout model 提供

这意味着很多命中几何本来就可以从 layout / model 直接推导。

因此 `visualTargets` 这一整套共享层：

- `createVisualTargetRegistry(...)`
- `visualTargets.getTargets(...)`
- `visualTargets.freeze(...)`
- `visualTargets.clearFrozen()`

并不是“必要但复杂”，而更接近“抽象目标选错了”。

它默认采用的是：

- 先拿 live DOM rect
- 再用 registry 管 node
- 节点卸载时 freeze 快照
- 最后投影 frozen rect

但 dataview 当前更合适的方向不是“让 DOM rect 更稳定”，而是“尽量直接使用各 view 已有的 layout / model”。

## 3. 根因判断

当前问题的根因不是实现粗糙，而是模型方向反了。

系统现在更像这样：

1. 先做一个通用 marquee host
2. 再让不同 view 提供一个很宽的 `MarqueeAdapter`
3. 再用 adapter callback 补 preview、cleanup、side effect、auto pan

长期更合理的顺序应该是：

1. 先定义 marquee 的系统级状态与时序
2. 再定义 view scene 只需回答什么问题
3. 最后让各个 view 实现自己的 hit-test 和 visual presentation

也就是说，现在的问题不是“字段太多”，而是“不同层次的字段被混在一个对象上”。

## 4. 正确的类比：page 是 canvas，view 是 node scene

长期最优的心智模型应该更接近 whiteboard：

- `page` 是一个统一 canvas
- marquee 是 canvas 上的一种通用框选手势
- table / gallery / kanban 只是不同的 node scene
- marquee 不关心 view 类型，只关心 scene 如何回答“框内有哪些 selectable items”

因此 marquee 不应该继续设计成：

- “一个 host + 一套 view adapter 协议”

而应该设计成：

- “一个全局 marquee runtime + 一个当前 active scene”

这个 active scene 只需要回答很少的问题：

- 当前矩形命中了哪些 items

selection domain、autopan 与 start policy 都不属于 scene：

- domain 本质上是“当前 active items 的有序定义域”
- autopan 本质上是“page 级框选手势驱动 page 纵向滚动”
- start policy 本质上是“page 哪些空白区域允许起手 marquee”

这两者都已经是 dataview 全局已知信息，不应该继续下放给 view。

## 5. 能力归属重划分

### 5.1 应该保留在系统底层的真实需求

这些需求是客观存在的，不能消失：

- `hitTest(rect) -> itemIds`
- selection domain
- page-level auto pan
- page-level start policy

但它们应该更小、更稳定地表达。

### 5.2 应该上提到全局的能力

以下能力不应该继续由 view adapter 承担。

#### 5.2.1 `baseSelection + hitIds + mode -> nextSelection`

这本来就是 marquee runtime 的核心职责。

这里要强调语义边界：

- `hitIds` 表示当前 rect 命中了哪些 item
- “命中即当前被框中”
- `baseSelection` 只在 `shift add / meta(ctrl) toggle` 的提交语义里使用

也就是说，marquee 运行中的核心状态不是 `previewSelection`，而是 `hitIds`。

这部分应完全保留在全局。

#### 5.2.2 selection commit / cancel 时序

commit / cancel 是全局交互流，不应该由不同 view 在 `onEnd / onCancel` 中零散表达。

#### 5.2.3 与其他交互域的互斥

例如：

- marquee 开始时退出 inline editing
- marquee 开始时清掉 cell selection
- marquee 进行时禁止某些 hover / pointer 模式

这些都属于全局交互编排，不属于 view 自己的 marquee adapter。

#### 5.2.4 selection domain

`OrderedSelectionDomain<ItemId>` 不是 scene 的几何能力，而是 selection runtime 的定义域。

在当前 dataview 里：

- marquee 只作用于当前 active view
- 当前 active view 的 item 顺序已经存在于 `dataView.read.activeItems`
- runtime 已经可以直接基于 `activeItems` 构造 `createItemListSelectionDomain(...)`

因此长期应由 marquee runtime 直接读取 active items 生成 domain，而不是让各 view scene 再暴露一个 `domain()`。

#### 5.2.5 marquee autopan

marquee 的 autopan 也应上提到全局，而且边界应继续收紧：

- marquee 只需要 `y` 轴 autopan
- table 在 marquee 时明确禁止 `x` 轴 autopan
- table / gallery / kanban 当前使用的是同一个 page 纵向滚动容器

因此 marquee runtime 应直接持有 page-level `y` scroll target。

长期不再需要：

- `getAutoPanTarget?(): HTMLElement | null`
- `resolveAutoPanTargets?: () => AutoPanTargets | null`
- `x/y` 双轴通用 autopan 协议

#### 5.2.6 marquee start policy

marquee 的起手规则也应上提到 page，而不是交给 scene。

原因：

- marquee 允许从整个 dataview page 的空白区域启动
- 不只是 view 内容区
- 包括 toolbar / query bar / page title 等区域中的空隙

因此长期不应由 view scene 提供 `canStart(event)`，而应由 page host 统一提供：

```ts
shouldStartMarquee(event: PointerEvent): boolean
```

这个规则统一判断：

- 是否主键点击
- 当前是否允许开始 marquee
- target 是否命中交互控件
- target 是否命中显式禁止 marquee 的区域

也就是说：

- interactive 元素阻止 marquee
- page 空白区域允许 marquee
- scene 外开始、scene 内命中是合法语义

### 5.3 应该保留在 view 的能力

以下能力确实是 view-local，不应上提到全局。

#### 5.3.1 hit-test 实现本身

table：

- 不是按 rect list 命中，而是按 row 命中
- 当前用 `table.nodes.hitRows(...)`

gallery / kanban：

- 更接近 node rect list
- 当前用 `visualTargets.getTargets(...)`

这部分应该留在 scene 实现里。

#### 5.3.2 节点几何来源

例如：

- live node DOM rect
- frozen rect snapshot
- 虚拟化下的 rect 投影

这些都属于 view scene 内部实现细节。

但这里要继续收紧结论：

- “节点几何来源”留在 view 内部，并不等于必须保留一个共享的 `visualTargets` 系统

在当前 dataview 里，更合理的是：

- kanban 直接使用 live DOM rect
- gallery 直接使用 virtual layout 中的 card geometry
- table 直接使用 table layout model 中的 row geometry

也就是说，长期应保留的是“view 私有 geometry 方案”，而不是“一个共享 registry + freeze 基础设施”。

#### 5.3.3 纯表现层视觉状态

例如：

- table 的 `startRowMarquee / endRowMarquee`
- card 视图的 frozen node 管理
- 某个 view 是否显示特殊的框选高亮

这些可以保留在 view 自己的 presentation 层。

但它们不应该继续通过一个宽 adapter lifecycle 进入系统。

## 6. 哪些字段是“为需求”，哪些是“架构补丁”

下面给出明确判断。

### 6.1 为真实需求存在的

- `getTargets` 或 `getHitIds` 所代表的几何命中能力
- `disabled`
- selection domain
- page-level marquee autopan
- page-level marquee start policy

这些问题本身真实存在，但表达方式仍然可以优化。

### 6.2 本质是架构补丁的

- `previewSelection`
- `clearPreviewSelection`
- 大部分 `onStart`
- 大部分 `onEnd`
- 大部分 `onCancel`
- `getTargets` 与 `getHitIds` 双轨并存

这些不是产品语义必须这样，而是当前系统没有把：

- preview state
- selection flow
- scene hit-test
- appearance side effect

分层清楚，才会被塞进 adapter。

## 7. 新的长期最优模型

长期建议直接把 marquee 拆成三层。

### 7.1 第一层：Global Marquee Session

职责：

- 维护 marquee active / inactive
- 维护 pointer start / current / rect
- 维护 `hitIds`
- 维护 `baseSelection`
- 处理 commit / cancel
- 驱动 auto pan

建议状态：

```ts
interface MarqueeSessionState {
  mode: 'replace' | 'add' | 'toggle'
  start: Point
  current: Point
  rect: Box
  hitIds: readonly ItemId[]
  baseSelection: ItemSelectionSnapshot
}
```

注意：

- 不再暴露 `viewId`
- `hitIds` 是 marquee 运行中的真实结果
- “命中即当前被框中”，view 直接读取 `hitIds`
- 当前 selection domain 由 runtime 直接从 `dataView.read.activeItems` 派生
- marquee autopan 固定由 page-level `y` scroll target 驱动
- marquee start 由 page-level `shouldStartMarquee(event)` 统一控制
- `baseSelection` 不参与 view 渲染，只在 `shift add / meta(ctrl) toggle` 的 commit 语义中使用

### 7.2 第二层：Marquee Scene

这是新的最小 scene 协议。

建议如下：

```ts
interface MarqueeScene {
  hitTest(rect: Box): readonly ItemId[]
}
```

也就是说，新 scene 只保留真正的 view-local 能力：

- rect -> itemIds 的命中计算

它不再负责：

- selection domain
- autopan target
- start policy

### 7.3 第三层：View Presentation

职责：

- 读取 `session.marquee.active`
- 读取 `session.marquee.hitIds`
- 读取 `session.marquee.rect`
- 根据这些状态决定自己的视觉表现

这层不再通过 callback 被动接收 lifecycle，而是直接读状态。

例如：

- table row rail 直接读 `hitIds`
- gallery card 直接判断某 item 是否在 `hitIds` 中
- table 自己决定何时显示 row marquee decoration

## 8. `MarqueeAdapter` 的替代方案

最终建议彻底删除 `MarqueeAdapter` 这一层公共协议。

替代为：

### 8.1 Page Start Policy

```ts
function shouldStartMarquee(event: PointerEvent): boolean
```

这属于 page host，而不是 scene。

### 8.2 Scene 注册

```ts
interface MarqueeSceneRegistry {
  register(scene: MarqueeScene): () => void
  getActive(): MarqueeScene | undefined
}
```

这里也不再需要 `viewId`。

原因：

- marquee 永远只作用于当前 active view
- active view 切换时 marquee 直接 cancel
- page host 只需要拿当前 active scene
- start 是否允许由 page host 自己决定

## 9. 各 view 如何接新模型

### 9.1 Table

当前 table 的特殊性是：

- 命中不是 item rect，而是 row hit
- 有额外的 row marquee 视觉态
- 需要清空 cell selection / hover / row rail

新模型下：

- `scene.hitTest(rect)` 内部直接调用 `table.nodes.hitRows(...)`
- table 自己读 `session.marquee.active` 决定是否启用 row marquee 外观
- `cell selection / hover / row rail` 这类互斥由全局 intent 在 marquee start 时统一清理
- selection domain 由 marquee runtime 直接从 `dataView.read.activeItems` 派生

table 不再需要：

- `previewSelection`
- `clearPreviewSelection`
- `onStart`
- `onEnd`
- `onCancel`
- `domain()`
- `getAutoPanTarget()` / `resolveAutoPanTargets()`

table 只保留自己的 scene 和自己的外观读取。

进一步说，table 也不应该继续围绕 per-row DOM rect cache 来做 marquee。

当前 [dataview/packages/dataview-react/src/views/table/dom/registry.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/dom/registry.ts) 里通过：

- `startRowMarquee(...)`
- `measureRow(...)`
- `rowRects`
- `hitRows(...)`

在 marquee 开始时缓存 row rect。

这虽然比 `visualTargets` 更收敛，但长期也仍然偏向 DOM snapshot 思路。

更合理的长期方案是：

- row 的 top / bottom 来自 table layout model
- 水平方向命中边界来自 grid content bounds
- `hitTest(rect)` 直接基于 layout model 计算，不再依赖 per-row DOM rect 缓存

原因：

- table row 本质上是规则的横向条带
- 它不是任意卡片几何
- table 已经有很强的 layout / virtual model，不需要再为 marquee 单独维护一套 row rect snapshot

因此 table 的目标不是“保留现在的 row rect cache 但删 adapter”，而是进一步走到“基于 layout model 的 row hit-test”。

### 9.2 Gallery

gallery 当前主要依赖：

- `visualTargets.getTargets(itemIds)`

新模型下：

- 不应再继续围绕 `visualTargets` 做 rect registry
- `scene.hitTest(rect)` 应直接基于 gallery virtual layout 产生命中 itemIds

原因很明确：

- card width 是固定的
- column count 和 x 位置由 layout 决定
- item height 已有 measured/layout 数据
- row / block 位置已经存在于 virtual layout

因此 gallery 并不是“需要 frozen rect 的复杂列表”，而是“已经拥有足够布局数据的虚拟网格”。

也就是说，gallery 最合理的做法不是：

- `register -> getTargets -> freeze -> clearFrozen`

而是：

- 直接信任 gallery layout
- 让 `hitTest(rect)` 纯基于 layout 计算

这样不仅更简单，而且几何来源更稳定、更可测试，也完全脱离 DOM lifecycle 抖动。

### 9.3 Kanban

kanban 与 gallery 基本一致：

- 但它其实比 gallery 更简单

原因：

- kanban 当前没有虚拟化
- card 节点都在 DOM 中

因此 kanban 长期甚至不需要任何 `visualTargets` 或 frozen rect 机制。

最直接的方案就是：

- scene 在 `hitTest(rect)` 中读取当前 mounted card 的 live DOM rect

只要不再把它包装成共享 registry，这条链本身是非常轻的。

换句话说：

- kanban 不需要 shared visual target system
- gallery 不应该需要 shared visual target system
- table 更应该直接走 layout model

这三条结论合在一起，已经足够说明 `visualTargets` 不该继续存在为 marquee 的共享基础设施

## 9.4 `visualTargets` 的最终判断

当前 dataview 的产品与实现约束下，`visualTargets` 不是“必须保留的底层能力”，而更像是一次抽象方向上的误判。

它的出发点是：

- marquee 命中建立在 DOM rect 上
- DOM 不稳定时再引入 registry / frozen rect

但当前系统实际更适合：

- 尽量不用共享 DOM rect registry
- 各个 view 直接基于自己的 layout / model / live DOM 产生 hit-test

因此长期建议是：

- 删除 `createVisualTargetRegistry(...)`
- 删除 `visualTargets.getTargets(...)`
- 删除 `visualTargets.freeze(...)`
- 删除 `visualTargets.clearFrozen()`

不是把它们“藏到 scene 内部”，而是直接放弃这套共享层。

## 9.5 替代方案总表

### Kanban

- 不做 registry
- 不做 freeze
- `hitTest(rect)` 直接扫 live card DOM rect

### Gallery

- 不做 registry
- 不做 freeze
- `hitTest(rect)` 直接基于 gallery virtual layout 计算

### Table

- 不做 registry
- 不做 row rect snapshot cache
- `hitTest(rect)` 直接基于 table layout model + horizontal bounds 计算

## 10. Preview Selection 的最终使用方式

长期不应再把 `previewSelection` 作为 marquee 的核心状态。

更准确的最终语义是：

- marquee 运行时只维护 `hitIds`
- `hitIds` 就是当前框中的 item
- view 的高亮直接读 `hitIds`
- commit 时再基于 `baseSelection + hitIds + mode` 计算最终 selection

也就是说：

- 运行态是命中集合
- 提交态才是 selection 结果

不允许 view 自己再维护平行的 `table.marqueeSelection` 之类局部 store。

## 11. 生命周期副作用如何处理

### 11.1 全局副作用

例如：

- 进入 marquee 时关闭 inline editing
- 清掉 cell selection
- 结束时基于 `baseSelection + hitIds + mode` 提交最终 selection
- 取消时回退到 base selection

这些应由全局 marquee intent/runtime 负责。

### 11.2 view-local 外观副作用

例如：

- table 的 row marquee visual mode
- visualTargets frozen rect 清理

这类不要再通过 `onStart/onEnd/onCancel` callback 注入。

推荐两种方式：

1. view 直接读 marquee state，自行决定外观
2. scene 内部自己在注册/解绑过程中维护 geometry cache

也就是说：

- 系统负责状态
- view 负责渲染

而不是系统去“通知 view 生命周期函数”。

## 12. 重构步骤

### 12.1 第一步：先引入 page-level `shouldStartMarquee`

先把 marquee 的起手判断从各个 view 的 `canStart` 中抽出来，收敛为 page host 的统一规则：

```ts
shouldStartMarquee(event: PointerEvent): boolean
```

这是整个模型的前提，因为它决定了 marquee 可以从 toolbar / query bar / title / view 外空白区域启动。

### 12.2 第二步：先引入全局 `hitIds`

先把：

- `table.marqueeSelection`
- 各 view 私有 preview callback / preview store

替换成统一的 `session.marquee.hitIds`

这是收益最大、最应该先做的一步，因为它直接把运行时语义收回到“命中集合”。

### 12.3 第三步：统一 `getTargets/getHitIds` 为 `hitTest`

table：

- `hitTest(rect) => table layout model row hit-test`

gallery / kanban：

- `hitTest(rect)` 各自基于自己的 geometry source 计算

这一步里建议顺手一起删掉 `visualTargets`，不要先保留共享 registry 再套一层 `hitTest`。

原因：

- 如果 `hitTest` 已经成为统一协议，`visualTargets` 只会变成内部历史包袱
- 保留它只会让 gallery / kanban 继续围绕 DOM snapshot 思路组织代码
- 这与当前 dataview 更适合依赖 layout/model 的方向相反

这样 host 就只需要一种命中协议。

### 12.4 第四步：删掉 adapter lifecycle

逐步删除：

- `previewSelection`
- `clearPreviewSelection`
- `onStart`
- `onEnd`
- `onCancel`

把全局时序收回 runtime，把表现逻辑收回 view。

### 12.5 第五步：收缩成 scene registry

最终 `dataView.marquee.registerAdapter(...)` 改成：

- `registerScene(...)`

## 13. 最终建议

我的判断非常明确：

- `MarqueeAdapter` 当前设计是别扭的
- 别扭的根因不是代码不整洁，而是抽象层级错了
- marquee 不应该继续围绕一个宽 adapter 协议演进
- 长期最优模型应是：

```text
global marquee session
  + marquee scene
  + view presentation
```

也就是：

- 全局负责手势、hitIds、commit、cancel、selection domain、autopan
- scene 只负责 hit-test
- view 只负责几何实现和表现层

## 14. 一句话结论

`MarqueeAdapter` 现在之所以显得复杂，不是因为 marquee 天生复杂，而是因为系统把“命中协议”“命中集合”“选择时序”“表现副作用”混成了一层。长期最优方案是把它拆开，让 marquee 回到 whiteboard 风格的 canvas 框选模型：page 是 canvas，view 是 nodes，核心只围绕 `hitTest(rect)`、`hitIds` 和统一的全局提交时序运转。

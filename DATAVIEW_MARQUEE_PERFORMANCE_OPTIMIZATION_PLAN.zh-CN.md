# DATAVIEW Marquee 性能优化设计方案

## 1. 目标

本文档讨论 dataview 当前 `kanban` / `gallery` / `table` 三套 marquee 实现的性能差异，并给出长期最优的优化方向。

本次只讨论设计，不包含代码实现。

目标很明确：

- 找出 `kanban` marquee CPU 高、rerender 高频的根因
- 判断 `gallery` 是否存在同类问题
- 解释为什么 `table` 当前明显更丝滑
- 给出长期可复用、复杂度低的优化方案

## 2. 结论摘要

结论先说：

- `kanban` 当前最差，原因是“每帧全量 DOM 几何读取”与“每张 card 都订阅 marquee preview”同时存在
- `gallery` 没有 `kanban` 那么重，但仍存在“全量 layout 扫描”与“card 级 preview 扩散”问题
- `table` 丝滑的根本原因不是实现更简单，而是它把 marquee 成本限制在了“虚拟窗口 + 内存布局查询 + 少量挂载节点”内

如果按收益排序，长期最优的优化顺序是：

1. 先把 `kanban` 的 marquee / drag 几何读取从“每帧扫 DOM”改成“稳定的布局缓存”
2. 再把 card 视图里的 marquee preview 从“每张卡直接订阅 `session.marquee.store`”改成“keyed preview membership”
3. 最后把 `gallery` 的 hit test 从“全量 `layout.cards` 扫描”收敛到“按行 / 区间命中”

## 3. 当前实现差异

### 3.1 Kanban

`kanban` 的 marquee scene 定义在：

- [runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/kanban/runtime.ts#L209)

其 `hitTest` 实现会在每次 marquee update 时调用：

- [readBoardLayout(...)](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/kanban/drag/layout.ts#L36)

而 `readBoardLayout(...)` 会做这些事情：

- `querySelectorAll('[data-kanban-column-key]')`
- 每列再找 `data-kanban-column-body`
- 每列再 `querySelectorAll([appearance-id])` 扫卡片
- 对每张卡调用 `elementRectIn(container, cardNode)`

这意味着：

- marquee 每一帧都在做全 board DOM 扫描
- marquee 每一帧都在做全卡片几何读取
- drag 也复用了同一套 `readBoardLayout(...)`，所以 drag 和 marquee 都受影响

### 3.2 Gallery

`gallery` 的 marquee scene 定义在：

- [runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/gallery/runtime.ts#L28)

它的 `hitTest` 不扫 DOM，而是直接扫描：

- [virtual.layout.cards](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/gallery/runtime.ts#L54)

`virtual.layout.cards` 来自：

- [buildGalleryLayout(...)](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/gallery/virtual/layout.ts#L71)

这里的关键点是：

- 它比 `kanban` 好，因为没有每帧 DOM 扫描
- 但它依然是在对全量 card layout 做线性扫描
- `gallery` 只是把成本从 DOM 几何读取换成了 JS 对象扫描

### 3.3 Table

`table` 的 marquee scene 定义在：

- [Body.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/body/Body.tsx#L77)

它的 `hitTest` 最终走的是：

- [table.virtual.hitRows(...)](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/virtual/runtime.ts#L743)

而 `hitRows(...)` 又是基于 `layoutModel.materializeWindow(...)` 的区间查询。

也就是说：

- 不扫 DOM
- 不扫全量 row
- 只对虚拟布局模型做区间命中

这就是 `table` 当前丝滑的最核心原因。

## 4. 当前热点来源

### 4.1 Kanban 的第一个热点：每帧 DOM 几何读取

`kanban` 当前最重的热点不是 React，而是几何获取方式本身。

每次 marquee pointer move 都会触发：

1. `hitTest(rect)`
2. `readBoardLayout(container)`
3. DOM 查询所有列
4. DOM 查询所有卡片
5. 读取所有卡片 rect
6. 再做 `intersects(...)`

这会带来三类成本：

- CPU 成本高
- 触发布局读取，容易和浏览器 layout/paint 交织
- 数据规模越大越线性恶化

这属于结构性问题，不是简单 memo 能解决的。

### 4.2 Kanban / Gallery 的第二个热点：preview selection 扩散过大

所有 card 都走：

- [RecordCard.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/RecordCard.tsx#L78)

而每张 card 都会订阅：

- [dataView.selection.store.membership](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/RecordCard.tsx#L86)
- [dataView.session.marquee.store](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/RecordCard.tsx#L90)

其中 marquee preview 的判断是：

```ts
session ? session.hitIds.includes(props.itemId) : null
```

这意味着：

- 每次 marquee session 更新，所有已挂载 card 都会重新跑 selector
- `includes(...)` 是线性查找
- 已挂载 card 越多，pointer move 的总工作量越大

这个问题在 `kanban` 更严重，因为 `kanban` 没有虚拟化。

### 4.3 Gallery 的热点比 Kanban 轻，但不是没有

`gallery` 没有 `kanban` 的 DOM 扫描问题，但仍然有：

- 对全量 `layout.cards` 的线性 hit test
- 所有已挂载 card 都订阅 marquee preview

所以 `gallery` 的负担通常会小于 `kanban`，但在大数据量下仍然会出现明显热度。

### 4.4 Table 为什么没有同样的问题

`table` 也有 row 级 preview 订阅：

- [Row.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/row/Row.tsx#L102)

但它依然更稳，原因不是这里更聪明，而是外围约束更强：

- `table` 有垂直虚拟化，实际挂载的 row 很少
- `hitTest` 只命中虚拟布局区间
- `Body` 顶层只消费 `marqueeActive` 布尔态，而不是整个 marquee session

见：

- [Body.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/body/Body.tsx#L61)

所以同样的 row/card 局部 selector，在 `table` 上成本低，在 `kanban` 上就会爆。

## 5. 根因拆解

当前问题不是单点 bug，而是两个架构选择叠加：

### 5.1 几何数据不是稳定缓存，而是 pointermove 时临时读取

这是 `kanban` 最大的问题。

理想模型应该是：

- layout/scroll/resize/measure change 时更新几何缓存
- pointermove 时只读缓存

当前 `kanban` 却是：

- pointermove 时重建几何视图

这会直接把输入频率最高的路径变成最重的路径。

### 5.2 preview selection 没有独立成 keyed membership

当前 preview selection 直接挂在 `session.marquee.store` 上，由每个 item 自己用 `hitIds.includes(...)` 判断。

这会造成：

- item 数量越多，selector 总开销越高
- preview membership 的 diff 无法集中处理
- 渲染扩散与 session 结构强耦合

长期看，这个模式不适合 card view。

## 6. 长期最优设计

## 6.1 设计原则

长期最优设计应该满足：

- pointermove 时不做全量 DOM 扫描
- pointermove 时不让所有 card 重新参与 preview 计算
- 几何数据与 preview membership 都是稳定、可增量更新的
- `kanban`、`gallery`、未来 card-like views 共用同一套 marquee 性能模型

## 6.2 方向一：把 view geometry 变成稳定缓存

### Kanban

`kanban` 应该引入稳定的 board geometry cache，而不是在 `hitTest` 时调用 `readBoardLayout(container)`。

目标模型：

- column / card 几何在 layout change 时更新
- drag 和 marquee 共用同一个 geometry snapshot
- `hitTest(rect)` 只做纯几何命中，不做 DOM 查询

理想接口大致可以理解为：

```ts
interface BoardGeometry {
  columns: readonly {
    key: SectionKey
    rect: Rect
    bodyRect: Rect
    cards: readonly {
      id: ItemId
      rect: Rect
    }[]
  }[]
}
```

```ts
interface KanbanGeometryRuntime {
  get(): BoardGeometry | null
}
```

更新触发可以来自：

- 视图数据变更
- column 显隐 / show more
- 容器 resize
- card measure change
- scroll 容器几何变化

关键点是：

- 更新可以昂贵，但频率低
- pointermove 必须便宜，而且纯读

### Gallery

`gallery` 已经有 layout cache，所以不需要再做 DOM geometry registry。

但它仍需要把 `hitTest` 从“全量卡片扫描”收敛到“行/区间查询”。

长期目标：

- 基于 row/block 索引先命中候选 rows
- 再只对候选 rows 里的 cards 做 intersects

也就是把：

- `O(all cards)`

收敛成：

- `O(candidate rows + cards in rows)`

## 6.3 方向二：把 marquee preview 变成 keyed membership

### 当前问题

现在 preview selection 由每个 item 自己从 `session.hitIds` 里推导。

这不是长期最优模型。

### 目标模型

应该单独维护一个 preview membership store，例如：

```ts
interface MarqueePreviewStore {
  membership: KeyedReadStore<ItemId, boolean | null>
}
```

其中：

- `true` 表示当前 marquee preview 命中
- `false` 表示当前 marquee preview 明确未命中
- `null` 表示当前没有 marquee preview，回退到 committed selection

更新方式不是“所有 item 自己查 `includes(...)`”，而是：

1. 运行时维护 `prevHitIds`
2. 每次 `update(hitIds)` 时与 `nextHitIds` 做 diff
3. 只给 membership 变化的 item 发 keyed 通知

这样带来的收益是：

- pointermove 时不再让所有 card 都跑 selector
- 实际 rerender 只发生在 preview membership 真正变化的 item 上
- `RecordCard` / `Row` 都可以用统一模式读取 preview membership

### 为什么这对 card view 更重要

因为 card view 的问题不是“命中结果多少”，而是“挂载 item 很多”。

只要仍然让每张卡在每次 session 更新时主动读 `hitIds.includes(...)`，成本就会随着挂载数扩散。

## 6.4 方向三：view 根组件只消费 coarse-grained 状态

`table` 当前做得对的一点是，根组件只关心：

- `marqueeActive: boolean`

而不是整个 marquee session。

`kanban` / `gallery` 的 view runtime 也应该坚持这一原则：

- view 根部只消费 coarse-grained interaction 状态
- item 层只消费 keyed membership
- 不允许把整个 `session.marquee` 沿 context 继续扩散

## 7. 推荐实施顺序

### 第一阶段：Kanban geometry cache

优先级最高。

目标：

- 消灭 `readBoardLayout(container)` 在 marquee pointermove 中的调用
- drag 与 marquee 共享 geometry cache

完成后应立即获得：

- CPU 显著下降
- 浏览器 layout 读取显著减少

### 第二阶段：通用 marquee preview membership

优先级第二。

目标：

- 给 `marquee` 增加 keyed preview membership
- `RecordCard` 不再直接订阅 `session.marquee.store`
- `Row` 未来也可复用该机制

完成后应立即获得：

- `kanban` / `gallery` 高频 rerender 显著下降
- marquee pointermove 时 React 计算量显著下降

### 第三阶段：Gallery hitTest 收敛

优先级第三。

目标：

- `gallery` 不再每次对全量 `layout.cards` 做 filter
- 改成按 block/row 索引先选候选集合

这一步的收益会小于前两步，但对大数据量 gallery 很有价值。

## 8. 不推荐的方案

### 8.1 不要继续在 `kanban` 上堆 memo

如果 `hitTest` 本身每帧都在扫 DOM，那么在 React 层加 `memo` 只能缓解 rerender，解决不了 CPU 主体成本。

### 8.2 不要继续让 card 自己从 `session.hitIds` 推 preview

这会持续保留“每个挂载 item 每帧都要参与计算”的扩散模型。

### 8.3 不要为 `kanban` 单独做临时优化、为 `gallery` 单独做另一套 preview 模型

长期最优应该是一套通用策略：

- geometry cache 由各 view 自己实现
- preview membership 由 marquee runtime 统一表达

不要把性能优化做成新的 view-specific 例外集合。

## 9. 最终建议

最终建议可以压缩成两句话：

1. `kanban` 的核心问题是 pointermove 时仍在重建几何视图，必须把 geometry 变成稳定缓存
2. `kanban` / `gallery` 的共同问题是 preview selection 仍在 item 自己从 `hitIds` 推导，必须收敛成 keyed preview membership

如果这两件事做完：

- `kanban` 的 CPU 热点会显著下降
- `gallery` 的 rerender 热点也会一起下降
- `table` 当前的低成本模型可以推广到 card view，而不是继续维持三套不同性能级别的 marquee 实现

## 10. 一句话架构结论

长期最优架构不是“继续修当前 marquee 代码”，而是：

- `view` 负责稳定 geometry
- `marquee runtime` 负责 preview membership diff
- `React item` 只消费 keyed preview state

这样 pointermove 才会变成真正的轻路径。

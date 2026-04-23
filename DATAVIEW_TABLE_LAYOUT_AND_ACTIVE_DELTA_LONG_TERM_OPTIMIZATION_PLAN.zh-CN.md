# DATAVIEW Table Layout 与 Active Delta 长期最优简化优化方案

## 前提

- 目标不是继续做零散 micro-optimization，而是把当前热点背后的底层模型顺直。
- 只接受长期最优方案，不做兼容层、不保留旧 API、不保留过渡结构。
- 优化优先级是：
  1. 先删掉重复建模和职责错位
  2. 再让热路径只做必要工作
  3. 最后才考虑局部循环级优化
- 约束是“实现越简单越好”。不引入复杂缓存图、不引入难解释的增量协议、不引入额外 runtime 层级。

## 当前画像

### 1. `applyActiveDelta`

`apply.json` 结果：

- `applyActiveDelta`: `5.5ms`
- `applyItemDelta`: `5.5ms`
- `keyTable.applyExact`: `3.2ms`
- `recordChangedKey`: `1.1ms`
- `hasListeners`: `0.9ms`
- `readItemValue`: `0.9ms`

结论：

- 这条链已经不是 patch 算法本身慢，而是底层模型还有两层不必要成本：
  - `keyTable` 仍然在逐 key 探测监听状态
  - item runtime 仍然在构造冗余 `ItemValue` 包装对象

### 2. `TableLayoutModel`

`layout.json` 结果：

- `rebuildLayoutModel`: `9.2ms`
- `TableLayoutSectionModel`: `6.3ms`
- section constructor 内 `itemIds.map(...)`: `5.2ms self`
- `TableLayoutModel`: `3.0ms`
- 顶层 `sectionIndexByRowId` 构建: `1.7ms self`
- `measurementIds`: `0.9ms`
- `FenwickTree`: `0.6ms`

结论：

- 当前 layout 的主要问题不是树结构，也不是 `tableBlockKey`。
- 真正的大头是“每次同步都全量扫 row，并且扫了不止一遍”：
  - 一遍用来构造 section 内的 `rowIndexById + resolvedRowHeights`
  - 一遍用来构造 model 顶层的 `sectionIndexByRowId`
  - 还会额外再全量展开 `measurementIds`

## 根因

### 1. layout 把三类职责绑在了一起

当前 `TableLayoutModel` 同时承担：

- 几何布局
- row/block 定位索引
- measurement key 列表生成

这会导致两个问题：

- 只要其中任一职责需要刷新，整个 model 都被迫重建更多全量结构
- `measurementIds` 这种并非 geometry 的数据也污染进 layout snapshot 和 equality

### 2. row 索引重复建模

当前同时存在：

- section 级 `rowIndexById`
- 顶层 `sectionIndexByRowId`

这本质上是在为同一件事付两次成本。

### 3. active item runtime 多包了一层

当前 item source store 保存的是：

- `ItemValue = { recordId, sectionId, placement }`

但 `recordId` 和 `sectionId` 本来就是 `placement` 的字段。

这带来两层冗余：

- `readItemValue()` 每次要新建 wrapper object
- `table.project.field(...)` 再把 wrapper 拆回 `recordId / sectionId / placement`

### 4. `applyExact` 的“精确 patch”语义还没有真正到底

当前 `applyExact` 已经比通用 `apply` 更轻，但仍然保留了两类历史包袱：

- 每个 changed key 还在查一次 `hasListeners`
- patch 仍然按“可能重复、可能脏”的宽松协议处理

这说明 store 边界还没有完全承认：

- `applyExact` 传入的 patch 就是标准化后的精确 changed set

## 长期最优目标

### 目标 1

`TableLayoutModel` 只保留 geometry 和 lookup，不再负责 measurement 计划。

### 目标 2

row location 只保留一套索引，不再在 section 和顶层重复维护。

### 目标 3

item runtime 只保存 `ItemPlacement`，不再保存 `ItemValue` wrapper。

### 目标 4

`applyExact` 成为真正的“精确 changed set commit”接口，而不是较轻版本的通用 patch。

## 最终形态

## 一. Table layout 最终形态

### 1. `TableLayoutModel` 的职责收缩

最终 `TableLayoutModel` 只负责：

- section 高度与总高度
- block top 计算
- row 定位
- window materialization

明确不再负责：

- measurement id 列表
- measurement bucket 输入准备
- 与测量系统相关的全量 key 展开

### 2. row 索引统一为一套

最终只保留一套 row location 索引：

- `rowLocationById: Map<ItemId, { sectionIndex: number; rowIndex: number }>`

对应地删除：

- section 内 `rowIndexById`
- 顶层 `sectionIndexByRowId`

原因：

- `locateRow(rowId)` 和 `topOfBlock(row)` 实际只需要一次 `rowId -> { sectionIndex, rowIndex }`
- section 内部不需要再维护一份重复 map
- 顶层也不需要只存 `sectionIndex` 这种信息不完整的索引

section model 对 row 的操作统一改成：

- 接收 `rowIndex`
- 从 `itemIds[rowIndex]` 读取 rowId
- 从 `rowHeights` 读取位置与高度

这样数据关系最直接，也最容易解释。

### 3. `measurementIds` 彻底移出 layout model

最终新增独立概念：

- `TableMeasurementPlan`

它只负责：

- 给 `useMeasuredHeights` 提供 ids
- 与当前 grouped/collapsed/itemIds 对齐

它不负责：

- row 定位
- top 计算
- height aggregation

推荐的最终接口形态：

```ts
interface TableMeasurementPlan {
  ids: readonly string[]
}
```

来源：

- 直接由 `TableLayoutState` 派生
- 或由 table virtual runtime 单独派生

无论哪种实现，原则都一样：

- measurement plan 不属于 layout model

### 4. `TableVirtualLayoutSnapshot` 不再携带 `measurementIds`

当前 layout snapshot 带着一个超大的 `measurementIds` 数组，会拖累：

- layout publish
- layout equality
- body render state equality

最终改成：

```ts
interface TableVirtualLayoutSnapshot {
  totalHeight: number
  revision: number
  rowCount: number
}
```

`measurementIds` 改由 measurement plan source 单独提供。

这样 `virtual.layout` 才是真正的 layout snapshot，而不是 layout + measurement 的混合快照。

### 5. section constructor 只做一次必要扫描

最终每个 section 构造时只允许一次 row 级遍历，用来完成：

- 建 row heights 的基础数组
- 在顶层统一 row location 索引 builder 中写入 `{ sectionIndex, rowIndex }`

不再允许：

- 先在 section 内建 `rowIndexById`
- 再在顶层重新扫一次 row 建 `sectionIndexByRowId`

如果实现上仍需要两次扫描，说明模型还没有真正顺直。

### 6. `FenwickTree` 不是当前第一优先级

`FenwickTree` 可以继续优化，但不应先于前面几条。

原因：

- 当前 profile 里它只占小头
- 前面几条属于结构性去重，收益更稳定，也更容易维护

因此最终建议是：

- 先完成职责拆分和索引去重
- 若仍有必要，再把 `FenwickTree` 构造改成线性建树

## 二. Active item delta 最终形态

### 1. item store 直接存 `ItemPlacement`

最终删除：

- `ItemValue`
- `readItemValue()`

最终 store 形态：

```ts
createKeyTableStore<ItemId, ItemPlacement>()
```

派生读取改成：

```ts
record: placement => placement?.recordId
section: placement => placement?.sectionId
placement: placement => placement
```

这样可以直接删除一层对象构造和一层字段回拆。

### 2. `applyItemDelta` 直接读取 placement

最终 `applyItemDelta` 不再构造：

- `{ recordId, sectionId, placement }`

而是直接读取：

- `snapshot.items.read.placement(itemId)`

然后提交给 `keyTable.applyExact`

这条链的语义会变得更直接：

- engine publish item placement
- runtime exact apply placement patch
- projections 自己从 placement 派生 record/section

### 3. `applyExact` 升级为严格协议

最终 `applyExact` 的语义明确为：

- patch 已标准化
- `set` 与 `remove` 都是精确 changed set
- 一个 patch 内不允许同 key 重复出现
- 调用方负责保证 patch 正确

对应结果：

- `applyExact` 内不再做去重式 defensive 处理
- 不再把它当成“更快一点的通用 patch”

推荐最终接口文档语义：

```ts
interface ExactKeyTablePatch<Key, Value> {
  set?: readonly (readonly [Key, Value])[]
  remove?: readonly Key[]
}
```

约束：

- `set` 中 key 唯一
- `remove` 中 key 唯一
- 同一个 key 不会同时出现在 `set` 和 `remove`

### 4. store 内维护统一 listener presence index

最终 `keyTable` 需要有一个明确的底层设施：

- `listenedKeySet` 或等价结构

作用：

- O(1) 判断某个 key 是否有任一 listener
- 不再每次都查 `publicListenersByKey` 和 `internalListenersByKey`

这不是额外优化技巧，而是 store 模型补齐。

因为一旦存在 `applyExact` 这种精确 changed set 提交接口，store 就应该同时提供：

- 精确 commit
- 精确 listener presence

否则边界是不完整的。

## 三. 明确不做的事

### 1. 不在 React 层追加局部 memo 拼补

不建议继续在 React 侧为 `layoutModel` 热点加零散 `useMemo` 或临时缓存。

原因：

- 热点在底层模型和 snapshot 边界
- React 层补缓存只能掩盖问题，不能消除重复建模

### 2. 不做复杂增量 layout graph

不建议把 table layout 改造成复杂 phase graph 或细粒度 patch runtime。

原因：

- 当前问题本质是模型重复，不是缺少增量框架
- 更复杂的系统只会放大调试和维护成本

### 3. 不优先做字符串/小循环级 micro optimization

例如：

- 单独优化 `tableBlockKey`
- 单独优化 `parseTableBlockKey`
- 单独优化 `FenwickTree.add`

这些都不应排在结构性去重之前。

## 四. 最终实施顺序

### 第 1 步

重写 table virtual 边界：

- `TableLayoutModel` 删除 `measurementIds`
- 新增独立 `TableMeasurementPlan`
- `TableVirtualLayoutSnapshot` 删除 `measurementIds`
- `BlockContent` 改为读取 measurement plan，而不是从 layout snapshot 读取

这是最关键的一步，因为它同时解决：

- layout 职责错位
- layout snapshot 过大
- measurement 全量 key 污染 layout equality

### 第 2 步

统一 row location 索引：

- 删除 section 级 `rowIndexById`
- 删除顶层 `sectionIndexByRowId`
- 改成单一 `rowLocationById`

这是 layout 热点里最明确的重复建模清理。

### 第 3 步

把 item runtime store 改成直接保存 `ItemPlacement`：

- 删除 `ItemValue`
- 删除 `readItemValue()`
- 调整 `table.project.field(...)`

这是 active delta 链最直接的简化。

### 第 4 步

把 `keyTable.applyExact` 升级成严格 exact commit API：

- patch 协议标准化
- 删除不必要 defensive 逻辑
- 增加统一 listener presence index

这是 active delta 链剩余热点的底层收尾。

## 五. 最终判断

如果只看“最值钱、最长期、最简单”的方向，优先级如下：

1. 先把 `measurementIds` 从 `TableLayoutModel` 和 layout snapshot 中拿出去
2. 再把 row location 索引合并成一套
3. 再把 item runtime 的 `ItemValue` 改成直接存 `ItemPlacement`
4. 最后补齐 `keyTable.applyExact` 的严格协议和 listener presence index

这四步做完后：

- layout 会从“全量重建多个重复结构”变成“只维护几何和单一索引”
- active delta 会从“精确 patch + 冗余 wrapper + 监听探测”变成“精确 patch + 直接 placement commit”
- 两条链的模型都会更短、更直，也更容易继续维护

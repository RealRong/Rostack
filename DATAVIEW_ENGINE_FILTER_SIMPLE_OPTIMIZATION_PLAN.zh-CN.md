# DATAVIEW_ENGINE_FILTER_SIMPLE_OPTIMIZATION_PLAN

## 背景

本轮分析对象是根目录 [perf.json](/Users/realrong/Rostack/perf.json) 中的 50k 数据场景：

- 操作：新增一个 `select filter`
- 条件：选中 `option1`
- 目标：只讨论“容易做、容易维护、容易验证”的优化

明确前提：

- 简单与可维护性大于极限性能
- 不做复杂技巧型优化
- 不为单个 preset 过度定制
- 不引入新的底层抽象层、缓存图、专用数据结构体系
- 优先做小改动、局部可验证、语义清晰的优化

## 当前热点结论

从 [perf.json](/Users/realrong/Rostack/perf.json) 读到的主要耗时：

- `Membership`：`10.2ms`，`28.2%`
- `Summary`：`10.2ms`，`28.1%`
- `Publish`：`9.5ms`，`26.2%`
- `Query`：`6.3ms`，`17.5%`

这说明当前主要瓶颈已经不是 query，而是：

1. 过滤后把 visible records 重新投影成 grouped sections
2. 对 touched sections 重算 summary reducer
3. 按 section 重新维护 published item / placement 状态

### 具体热点

1. `Membership`

- `buildMembershipState`
  [derive.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/membership/derive.ts#L292)
- 其中主要热点是 `buildGroupedSections`
  [derive.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/membership/derive.ts#L135)

trace 中：

- `buildMembershipState`: `8.5ms`
- `buildGroupedSections`: `6.9ms`

从代码看，真正重的是这段全量投影循环：

- 遍历 `visible.indexes`
- 读取 record
- 查 `keysByRecord`
- 向 `indexesByKey` push `rowIndex`
- 在非 full-visible 情况下，还要额外构建 `visibleKeysByRecord`

`buildSectionPartition` 本身只有 `0.3ms`，不是主要问题。

2. `Summary`

- `buildFieldReducerState`
  [reducer.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/calculation/reducer.ts#L612)

trace 中最重的子热点：

- `buildOptionCountsFromDenseEntries`: `3.7ms`
  [reducer.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/calculation/reducer.ts#L569)
- `buildNumericStateFromDenseEntries`: `1.9ms`
  [reducer.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/calculation/reducer.ts#L527)

这部分已经是 reducer 的真实扫描成本，不是边界层样板代码的问题。

3. `Publish`

- `buildPublishedState`
  [sections.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/publish/sections.ts#L132)

trace 中主要热点：

- `setItemState`: `2.2ms`
  [sections.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/publish/sections.ts#L218)
- `placement`: `2.1ms`
  [itemIdPool.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/shared/itemIdPool.ts#L35)
- `removePublishedSectionItems`: `1.8ms`
  [sections.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/publish/sections.ts#L252)

这里的主要成本已经是：

- 为 `(sectionId, recordId)` 分配或查找 `itemId`
- 维护 placement map
- 删除旧 section 中不再可见的 item

4. `Query`

- `publishQueryState`
  [state.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/query/state.ts#L36)
- `createSelectionFromIds`
  [selection.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/shared/selection.ts#L128)

当前 query 仍然有成本，但已经不是主要矛盾。剩余成本主要集中在：

- `matched / ordered / visible` 三个 selection 的 publish
- 尤其是 `visible` selection 的 indexes 重建

## 优化原则

本轮只接受以下类型的优化：

- 能用一个小函数或一个局部 fast path 解决
- 改动点局部，不重写整段 phase 流程
- 读代码的人能很快理解
- 能直接写单元测试或 regression test

本轮不接受以下类型的优化：

- bitset / bitmap / packed array 等专用结构替换现有模型
- 横跨多个 phase 的复杂缓存体系
- 为 selection / summary / publish 引入第二套表示
- 引入难以解释的 scratch runtime / generation 机制扩张
- 为单个 perf case 设计大量特判
- 大规模重写 membership / publish / summary 的底层模型

## 最终建议顺序

如果严格按“简单与可维护优先”，建议顺序不是按热点绝对值，而是按“低复杂度收益比”排序：

1. `Publish` 的小型循环优化
2. `Membership` 的投影循环简化
3. `Query` 的直接复用优化
4. `Summary` 的少量 dense fast path

原因：

- `Publish` 和 `Membership` 还有明显的循环级浪费，改法局部
- `Query` 已经不是最大头，只需要把显然可复用的路径收干净
- `Summary` 虽然很重，但大部分成本是“真实扫描工作量”，简单优化空间有限

## 第一优先级：Publish

### 1. 给 `itemIdPool` 增加 section 级分配入口

目标代码：

- [itemIdPool.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/shared/itemIdPool.ts#L18)
- [sections.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/publish/sections.ts#L351)

当前问题：

- `buildPublishedState` 在 section 内部循环里反复调用 `itemIds.allocate.placement(sectionId, recordId)`
- 每次都会走 `ensureSection(sectionId)`，重复做同一层 `Map` 查找

建议改法：

- 保留当前 `section -> record -> itemId` 模型
- 只新增一个很薄的 section-scoped API
- 让 section 内部循环先拿一次 section allocator，再在记录循环里复用

这类改动简单、语义直观、风险低。

### 2. 跳过显然无变化的 `setItemState`

目标代码：

- [sections.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/publish/sections.ts#L218)
- [sections.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/publish/sections.ts#L355)

现状判断：

- `createMapPatchBuilder().set()` 已经会消掉“与 previous 同引用”的写入
  [patch.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/shared/patch.ts#L195)
- 所以这里不是语义错误
- 但仍然会产生大量函数调用和 `Map` 访问

建议改法：

- 在 `previousPlacement` 存在且 placement 未变时，直接跳过 `setItemState`
- 保持 patch builder 语义不变，只减少明显无意义的调用

这是典型的低风险、小收益、可读性不受损的优化。

### 3. 保守优化 `removePublishedSectionItems`

目标代码：

- [sections.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/publish/sections.ts#L252)

现状判断：

- 当前已经有基于 record subsequence 的快路径
- 说明这段逻辑已经在尽量避免 `Set(nextItemIds)` 的通用删除路径

建议：

- 本轮不重写删除策略
- 只允许做非常小的局部整理，例如：
  - 明确把最常见分支提前
  - 去掉可避免的中间变量或重复长度判断

不要在这里引入更复杂的“差分删除算法”。

## 第二优先级：Membership

### 4. 简化 `buildGroupedSections` 的热循环

目标代码：

- [derive.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/membership/derive.ts#L157)

当前问题：

- 这段循环是 membership 最大热点
- 目前每次都从 `visible.indexes` 读 `rowIndex`
- 再用 `visible.rows.at(rowIndex)` 反查 `recordId`

建议改法：

- 直接使用 `visible.ids[offset]` 作为 `recordId`
- 只有 `rowIndex` 真需要写进 section indexes 时再读取
- 在 `fullVisible` 情况下直接用 `offset` 作为 `rowIndex`
- 避免 full-visible 路径继续走 `rows.at` / `visible.indexes`

这是非常典型的“把热循环里的多余间接访问去掉”，属于容易做也容易验证的优化。

### 5. 延迟创建 `visibleKeysByRecord`

目标代码：

- [derive.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/membership/derive.ts#L157)

当前问题：

- 非 full-visible 时会立刻创建 `new Map<RecordId, readonly SectionId[]>()`
- 但并不是每次都需要真的写很多内容

建议改法：

- 改成首次需要写入时再创建
- 保持最终返回值逻辑不变

这类 lazy init 属于简单、清楚、低风险。

### 6. 不在本轮做增量 section sync 重写

虽然从理论上看，最有效的优化是：

- 利用 `buildRecordChanges()` 已经算出的 `before / after`
- 在 `previous.sections` 基础上做增量更新
- 避免每次都重新跑 `buildGroupedSections`

但这已经不是“容易做的优化”了。

它会牵涉：

- `Partition` 的更新语义
- `keysByRecord`
- `indexesByKey`
- `Selection` 的 indexes 维护

这类改动容易把 membership 模型变复杂，不符合本轮原则。结论是：

- 认识到这是理论大头
- 但本轮不做

## 第三优先级：Query

### 7. 在 `publishQueryState` 里直接复用 previous selection

目标代码：

- [state.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/query/state.ts#L36)

当前问题：

- 当前已经会尽量复用 `matched / ordered / visible` 的 ids 数组
- 但后面仍统一走 `createSelectionFromIds(...)`

建议改法：

- 当 `nextMatched === previousMatchedIds` 且 `rows` 未变时，直接复用 `previous.matched`
- `ordered` 同理
- 只对真的变动的 selection 调 `createSelectionFromIds`

这不是结构优化，只是把已经存在的复用信息再向下传一层。

### 8. 不在本轮改 selection 底层表示

不做：

- `Selection` 改为 bitset
- ids/indexes 双表示改单表示
- `rows.indexOf` 外再叠一层专用缓存

原因很简单：

- query 现在已经不是最大头
- 这些改动会显著提高模型复杂度

## 第四优先级：Summary

### 9. 只做 reducer 内的 dense fast path，不改 summary 模型

目标代码：

- [reducer.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/calculation/reducer.ts#L527)
- [reducer.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/calculation/reducer.ts#L569)
- [reducer.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/calculation/reducer.ts#L612)

当前判断：

- summary 的大头已经是 reducer 的真实扫描工作
- 这里最容易做的不是“更聪明的算法”，而是“更便宜的热循环”

建议改法：

- 当 `recordIndexes` 覆盖整段 dense entries 时，直接走 full-dense 循环
- 把 `entriesByIndex`、`recordIndexes.length` 之类的局部引用提出来，减少热循环中的属性访问
- 只做这种小型、局部、无语义变化的 fast path

### 10. 不在本轮引入 summary cache

不做：

- section-level summary cache
- field-level memo table
- 基于 selection identity 的跨阶段缓存

原因：

- 这些东西很容易把 summary 的正确性和失效条件搞复杂
- 当前目标不是极限性能，而是简单可维护

## 不建议做的优化

以下方向即使可能更快，本轮也明确不做：

### A. 复杂的 membership 增量系统

- section 层按 record diff 逐步更新 indexes
- 独立维护 section -> dense bitmap
- membership / publish 合并成同一套 mutable runtime

### B. 复杂的 summary 缓存

- 按 section / field 持久缓存 reducer state
- 按 selection identity 做多层缓存
- 把 reducer 拆成更细的增量更新树

### C. 复杂的 publish placement 编码

- 把 `(sectionId, recordId)` 压成 packed key
- 改成专用整数哈希表
- 用自定义对象池替换 Map

### D. 复杂的 query selection 技巧

- bitset
- Roaring bitmap
- 稀疏/稠密双态切换
- 新增一套 selection runtime

## 推荐落地顺序

### 第一轮

- `Publish`
  - section-scoped `itemId` allocator
  - 跳过显然无变化的 `setItemState`
- `Membership`
  - `buildGroupedSections` 热循环去掉多余间接访问
  - `visibleKeysByRecord` lazy init

### 第二轮

- `Query`
  - `publishQueryState` 直接复用 previous selection
- `Summary`
  - reducer 的 full-dense fast path
  - reducer 热循环局部变量收紧

### 第三轮

- 再看 trace
- 如果 summary 仍然是绝对主热点，再决定是否接受更高复杂度的优化
- 在那之前，不提前设计复杂模型

## 最终判断

这轮 trace 下，最值得做的不是“重新发明底层模型”，而是：

- 把 `Publish` 里明显重复的 item/placement 操作收紧
- 把 `Membership` 里全量投影循环写得更便宜
- 把 `Query` 的现有复用链补完整
- 对 `Summary` 只做热循环级别的小 fast path

这样做的好处是：

- 性能还能继续下降一截
- 代码复杂度基本不升
- 以后再看下一轮 trace 时，仍然容易判断瓶颈到底在哪里


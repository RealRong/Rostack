# Dataview Engine Commit / Runtime Filter 变化优化方案

本文只讨论一件事：

在下面这条真实热点链路成立时，`dataview-engine` 的 `commit -> active snapshot -> publish -> change projection` 这一整套流程，应该优先做哪些低复杂度、底层设施导向的优化。

当前观测样本是一次 `50k` 数据量下的 `filter` 变化，热点大致为：

- `publishQueryState` 约 `6.3ms`
- `buildMembershipState` 约 `6ms`
- `buildFieldReducerState` 约 `7ms`
- `buildPublishedState` 约 `10ms`
- `projectActiveChange` 约 `10ms`

其中已经确认的局部热点包括：

- `publishQueryState` 内 `createSelectionFromIds + indexOf`
- `buildMembershipState` 内 `buildVisibleKeysByRecord`

本文目标不是做复杂算法替换，也不是引入抽象更重的增量系统，而是优先减少以下几类重复工作：

- 同一批 `50k ids` 在多层之间被反复 `sameOrder`
- 同一批 `ids` 被反复 `id -> index`
- 同一批 visible records 被反复扫描和重新分桶
- stage 已经产出的 delta，最后又被 snapshot diff 反推一遍

---

## 一、当前主链路

这次分析覆盖的主路径是：

1. `dataview/packages/dataview-engine/src/mutate/commit/runtime.ts`
2. `dataview/packages/dataview-engine/src/active/runtime.ts`
3. `dataview/packages/dataview-engine/src/active/snapshot/runtime.ts`
4. `query -> membership -> summary -> publish`
5. `dataview/packages/dataview-engine/src/core/change.ts`

可以把当前流程压缩成一句话：

> commit 先算出新的 active snapshot，然后 publish 阶段物化 records / sections / items / summaries，最后 change projection 再拿 previous / next snapshot 做一轮全量 diff。

这条链的真正问题不是某一个函数“写得不够快”，而是：

- 上游已经知道很多变化，但下游仍然要靠重新扫描大数组追回这些事实
- 引用复用依赖 `sameOrder`，而 `sameOrder` 本身又是线性成本
- `Selection` 没有稳定的 canonical `ids/indexes`，导致多层 reuse 判断吃不满

---

## 二、核心判断

这次 `50k filter` 变化不是一个应该全链大洗牌的场景。

按语义看，最主要的变化应当是：

- `visible` 变化
- `membership` 跟着 visible 变化
- 依赖 section selection 的 `summary` 跟着变化

而不是：

- `matched` 一定变化
- `ordered` 一定变化
- `items / sections / summaries` 必须重新从 full snapshot 反推 diff

换句话说：

当前开销偏大，主要不是业务计算不可避免，而是底层设施让“局部变化”被扩散成了“全链重复扫描”。

---

## 三、最值得优先做的优化

下面按收益 / 风险 / 复杂度综合排序。

## 1. 先把 `Selection` 变成稳定的底层设施

涉及文件：

- `dataview/packages/dataview-engine/src/active/shared/selection.ts`
- `dataview/packages/dataview-engine/src/active/shared/rows.ts`

### 现状问题

当前 `Selection` 有两个会持续放大成本的特征：

1. `createSelectionFromIds()` 每次都会把整批 `ids` 重新走一遍 `rows.indexOf`
2. 非 full selection 的 `read.ids()` 每次都会重新 materialize 一个新数组

这会带来三个直接问题：

- `publishQueryState` 的 `createSelectionFromIds + indexOf` 在 `50k` 下天然放大
- `publishRecords` / membership / summary 很难靠引用稳定性复用旧结果
- 很多 `===` 复用判断退化成先 `sameOrder`，再追回旧引用

### 建议改法

只在 `Selection` 这一层做设施增强，不扩散接口复杂度：

1. `Selection` 内部缓存 canonical `ids`
2. `Selection` 内部缓存 canonical `indexes`
3. `createSelectionFromIds()` 优先复用 previous 的 `ids/indexes`
4. `read.ids()` 改成稳定返回同一个引用，而不是每次新建数组
5. full selection 不再通过 `rows.ids.map((_, i) => i)` 现建完整 index 数组

### 为什么这一步优先级最高

它不是局部优化，而是整条链的复用前提。

只要 `Selection` 还不稳定，下面这些地方都会被迫反复扫描：

- query publish
- query delta
- membership visible keys
- summary touched section 判断
- publish records / sections / items
- `projectActiveChange`

### 预期收益

优先打到：

- `publishQueryState`
- `runQueryStage.canReusePublished`
- 所有基于 `selection.read.ids()` 的引用复用路径

---

## 2. `filter-only` 变化时，query 不要全量重建 `matched / ordered`

涉及文件：

- `dataview/packages/dataview-engine/src/active/snapshot/query/derive.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/query/runtime.ts`

### 现状问题

当前 query 阶段即使只是 `filter` 变化，也会重新计算：

- `matched`
- `ordered`
- `visible`

然后在 `publishQueryState()` 中再用多次 `sameOrder` 去尝试追回 previous 引用。

这条路径在语义上并不划算，因为：

- `filter` 改了，不代表 `sort/search` 也改了
- 很多场景真正变化的只是 `visible`

### 建议改法

在 query stage 明确识别 `filter-only sync`：

1. `sort`、`search` 没变时，直接复用 previous 的 `matched`
2. `view.orders` 没变时，直接复用 previous 的 `ordered`
3. 当前 commit 只计算新的 `visible`
4. delta 生成只围绕 `visible` 差异工作

### 这一步的价值

这一步不是“偷懒不算”，而是让计算和语义对齐。

在 `filter` 改动下：

- 需要重算的是 visible membership
- 不需要顺带把整个 record ordering publication 再走一遍

### 预期收益

优先打到：

- `publishQueryState`
- `createSelectionFromIds + indexOf`
- `collectVisibleDiff`
- 下游 membership / publish 的前置输入稳定性

---

## 3. `buildMembershipState` 改成单次遍历 visible records

涉及文件：

- `dataview/packages/dataview-engine/src/active/snapshot/membership/derive.ts`
- `dataview/packages/dataview-engine/src/active/shared/partition.ts`

### 现状问题

grouped membership 当前至少做了两次高度重叠的遍历：

1. `buildVisibleKeysByRecord()` 先按 visible record 过滤一遍 `keysByRecord`
2. `buildSectionSelections()` 再按同一批 visible records 扫一遍，按 key 建 section indexes

这就是为什么你看到 `buildVisibleKeysByRecord` 占比高，而且 `buildMembershipState` 总耗时已经到 `6ms`。

### 建议改法

不要先裁 map，再重新扫 selection。

改成一轮遍历 visible selection，同时产出：

1. visible `keysByRecord`
2. `indexesByKey`
3. 可直接喂给 `createPartition()` 的 `byKey`

也就是说，把：

- “从 visible record 过滤 key”
- “从 visible record 建 section selection”

这两步合成一次扫描。

### 为什么这一步复杂度低

它不要求：

- 改 membership state 对外协议
- 改 partition 协议
- 改 summary/publish 消费方

只是把 derive 内部重复扫描合并掉。

### 预期收益

优先打到：

- `buildMembershipState`
- `buildVisibleKeysByRecord`
- grouped view 的大 selection 遍历

---

## 4. `buildPublishedState` 先去掉纯浪费，再补强 reuse

涉及文件：

- `dataview/packages/dataview-engine/src/active/snapshot/membership/publish.ts`
- `dataview/packages/dataview-engine/src/active/shared/itemIdPool.ts`

### 现状问题 A：`keepItemIds` 当前没有实际收益

`buildPublishedState()` 当前会维护：

- `keepItemIds`
- `recordByItemId`
- `sectionByItemId`
- `placementByItemId`

其中 `keepItemIds` 最后会传给 `itemIds.gc.keep(...)`。

但当前 `ItemIdPool` 的唯一实现里，`gc.keep` 是空操作。

这意味着：

- 当前所有 `keepItemIds.add(...)`
- 最后的 `gc.keep(...)`

都是纯开销，没有回报。

### 现状问题 B：section/item 的复用判断过晚

当前逻辑会先把每个 section 的 record 全扫一遍，分配 `nextItemIds`，再去判断：

- section 能不能复用
- item id 数组能不能复用

这会导致即使 section 实际没变，也已经付出了大部分 per-record 成本。

### 建议改法

先做低风险清理：

1. 明确 `gc.keep` 当前无语义时，删掉 `keepItemIds` 这套维护
2. 提前判定 section 是否可复用
3. `selection/meta/collapsed` 未变时，直接复用 previous section
4. 未折叠 section 的 visible item ids 尽量直接拼接 previous `itemIds`

### 这一步的边界

这里不建议一开始引入复杂 item 增量 patch 系统。

当前最值钱的是：

- 减少无收益的 `Set/Map` 构建
- 把复用判断前移
- 让 unchanged section 尽量不再 per-record 走 allocate / placement 查询

### 预期收益

优先打到：

- `buildPublishedState`
- section / item publish 阶段的大量线性遍历

---

## 5. `summary` 先减少无效 touched section，再谈 reducer 内核

涉及文件：

- `dataview/packages/dataview-engine/src/active/snapshot/summary/runtime.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/summary/sync.ts`
- `dataview/packages/dataview-engine/src/active/shared/reduce.ts`

### 现状问题

当前 summary 侧的主要问题不是 reducer 算法本身不够快，而是：

- 是否真的 membership changed，被检查了两次
- touched section 的集合并不够早收敛
- `buildSectionSummaryFields()` 内还有重复 lookup

比较明显的重复包括：

1. `summary/runtime.ts` 先用 `sameRecordSet` 判断 membership 是否变了
2. `summary/sync.ts` 里 `collectTouchedSections()` 又会再做一轮 section 级判断

### 建议改法

优先做三件小事：

1. 去重 `membership changed` 判断，只保留一处真源
2. 让 touched section 更早收敛，减少被送进 reducer 的 section 数量
3. 在 `buildSectionSummaryFields()` 外层预取：
   - `fieldIndex`
   - `rows.column.calc(fieldId)`
   - `capabilities`

### 为什么现在不先动 reducer 内核

`reduce.summary()` 已经优先使用 dense column。

如果上游 section 进入量没有先降下来，继续抠 reducer 内核通常是次优。

### 预期收益

优先打到：

- `buildFieldReducerState`
- `deriveSummaryState`

---

## 6. `projectActiveChange` 不要再从 full snapshot 反推 active diff

涉及文件：

- `dataview/packages/dataview-engine/src/core/change.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/runtime.ts`
- `dataview/packages/dataview-engine/src/mutate/commit/runtime.ts`

### 现状问题

query / membership / summary stage 在 snapshot runtime 内已经产出了 delta。

但 commit 最后仍然会调用 `projectActiveChange()`，再次对 `previous/next snapshot` 做全量 diff：

- `buildItemChange()`
- `buildSectionChange()`
- `buildSummaryChange()`
- field keyed entity change

这就是你看到 `projectActiveChange` 仍然要 `10ms` 的根因之一。

### 建议改法

中期方向很明确：

1. stage delta 是 active change 的真源
2. `projectActiveChange()` 优先消费 stage delta
3. snapshot diff 只保留为 reset / fallback 路径

换句话说：

不要让 publish 阶段先算完变化，再在 change projection 阶段重新猜一遍变化。

### 为什么这一步放在后面

这一步收益大，但牵涉：

- `SnapshotChange`
- active change contract
- commit output 组装

它比前面几项更接近“发布协议优化”，所以建议放第二阶段。

### 预期收益

优先打到：

- `projectActiveChange`
- `buildItemChange`
- `buildSectionChange`
- `buildSummaryChange`

---

## 四、推荐实施顺序

如果只按“收益大、实现不抽象、风险可控”的顺序推进，建议这样拆：

### 第一阶段：先修基础复用能力

1. 稳定 `Selection`
2. query 的 `filter-only` 复用 `matched / ordered`

这一阶段做完后，很多后续 stage 会自然吃到更稳定的引用。

### 第二阶段：压缩 membership / publish 的线性遍历

3. membership 单次遍历 visible records
4. publish 去掉无收益 `keepItemIds`
5. publish 前移 unchanged section 的复用判断

这一阶段主要打你现在 profile 里的 `buildMembershipState` 和 `buildPublishedState`。

### 第三阶段：减少 summary 的误触发

6. 收敛 touched section 判断
7. 去重 summary runtime / sync 之间的 record-set 比较
8. hoist reducer 依赖读取

这一阶段主要打 `buildFieldReducerState`。

### 第四阶段：把 change projection 从“全量反推”改成“消费已知 delta”

9. 让 active change 直接消费 stage delta
10. 将 snapshot full diff 降级为 fallback

这一阶段主要打 `projectActiveChange`。

---

## 五、我不建议现在优先做的事

下面这些方向并不是没有价值，而是对当前问题来说性价比不高：

1. 一开始就上 bitset / bitmap 全量替换 selection 表示
2. 一开始就做复杂 section 增量 patch engine
3. 先抠 reducer 内核算法而不先减少 section 输入
4. 继续增加更多 `sameOrder` 分支来“抢救”引用复用

原因很简单：

- 你当前问题主要不是算法极限
- 而是底层数据表示不稳定，导致复用路径天然吃不满

先把基础设施做稳，后面才值得继续抠更细的算法层。

---

## 六、预期收益判断

如果按上面的顺序推进，预期上应当看到这样的变化趋势：

### 1. Query

- `publishQueryState` 明显下降
- `createSelectionFromIds + indexOf` 占比显著下降
- `publishRecords` 更容易命中 reuse

### 2. Membership

- grouped view 下 `buildVisibleKeysByRecord` 基本不再是独立热点
- `buildMembershipState` 接近一次 visible selection 扫描成本

### 3. Summary

- `buildFieldReducerState` 下降，但主要来自 touched section 缩小，而不是 reducer 重写

### 4. Publish

- `buildPublishedState` 下降
- unchanged section 的 publish 代价显著降低

### 5. Change

- `projectActiveChange` 从“全量大扫”退化成“按 delta 组装”

---

## 七、最终结论

这次热点最值得做的不是“更复杂的增量算法”，而是下面四件事：

1. 先把 `Selection` 变成稳定、可复用的底层设施
2. 让 `filter-only` 变化只推动 `visible`，不要顺带重建 `matched / ordered`
3. 让 membership / publish 不再围绕同一批 visible ids 做多次重复扫描
4. 让 `projectActiveChange` 消费 stage delta，而不是对 full snapshot 再做一轮反推 diff

一句话概括：

> 当前最该优化的不是单个热点函数，而是让同一批 `50k ids` 在整个 runtime 里只被“表示一次、投影一次、比较一次”。

只要这点做到了，`publishQueryState`、`buildMembershipState`、`buildPublishedState`、`buildFieldReducerState`、`projectActiveChange` 这几个热点会一起往下掉。

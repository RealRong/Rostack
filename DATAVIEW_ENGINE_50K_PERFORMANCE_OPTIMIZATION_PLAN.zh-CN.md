# Dataview Engine 50k 性能优化方案

## 文档定位

这份文档只回答一个问题：

在当前已经完成“单 active view、单套实现、最终 API 收口”的前提下，Dataview engine 要如何继续优化到能更稳地承载 `large = 50000 records` 的场景。

约束如下：

- 本文不改代码，只做深入分析与落地方案设计。
- 所有建议都基于当前单 active view 架构，不再为多 view runtime 做抽象预留。
- 优先做“高收益、低语义风险”的优化，而不是一上来做大重写。

---

## 基准数据

基于当前 benchmark 结果：

- `medium = 10000`
- `large = 50000`
- 配置为 `iterations=1`、`warmup=0`

相关原始结果：

- `dataview/.tmp/bench-latest.json`
- `dataview/.tmp/bench-large-50k.json`

### 50k 关键结果

| scenario | total | index | view | snapshot |
| --- | ---: | ---: | ---: | ---: |
| `record.value.points.single` | 18.503ms | 9.243ms | 8.755ms | 0.005ms |
| `record.value.status.grouped` | 27.346ms | 11.654ms | 15.622ms | 0.003ms |
| `record.value.points.grouped.summary` | 30.052ms | 16.143ms | 13.832ms | 0.001ms |
| `view.query.search.set` | 3.854ms | 0.017ms | 3.795ms | 0.001ms |
| `view.query.filter.set` | 14.645ms | 0.011ms | 14.603ms | 0.002ms |
| `view.query.sort.keepOnly` | 8.405ms | 0.010ms | 8.355ms | 0.001ms |
| `view.query.group.set` | 13.198ms | 6.383ms | 6.775ms | 0.002ms |
| `history.undo.grouped.value` | 30.802ms | 11.664ms | 19.068ms | 0.003ms |
| `history.redo.grouped.value` | 29.758ms | 10.255ms | 19.428ms | 0.001ms |

### 10k -> 50k 扩张倍率

| scenario | total 扩张 | index 扩张 | view 扩张 |
| --- | ---: | ---: | ---: |
| `record.value.points.single` | 5.54x | 5.38x | 5.50x |
| `record.value.status.grouped` | 5.06x | 3.83x | 6.67x |
| `record.value.points.grouped.summary` | 4.59x | 5.61x | 3.80x |
| `view.query.filter.set` | 4.18x | 2.14x | 4.19x |
| `view.query.sort.keepOnly` | 5.14x | 0.70x | 5.23x |
| `history.undo.grouped.value` | 5.79x | 5.47x | 6.06x |
| `history.redo.grouped.value` | 4.19x | 2.71x | 5.90x |

### 50k 最大 stage 热点

| scenario | query stage | sections stage | summary stage |
| --- | ---: | ---: | ---: |
| `record.value.points.single` | 0.042ms | 8.416ms | 0.047ms |
| `record.value.status.grouped` | 0.014ms | 15.468ms | 0.060ms |
| `record.value.points.grouped.summary` | 0.017ms | 12.348ms | 1.417ms |
| `view.query.filter.set` | 12.955ms | 1.564ms | 0.012ms |
| `view.query.sort.keepOnly` | 3.924ms | 4.335ms | 0.018ms |
| `history.undo.grouped.value` | 0.012ms | 12.906ms | 6.108ms |
| `history.redo.grouped.value` | 0.007ms | 13.189ms | 6.192ms |

最重要的结论只有一句：

当前 50k 的主要瓶颈不是 snapshot publish，而是 `sections`、`summary` 和 query 重算。

---

## 核心判断

## 1. 当前最大浪费不是“算法不够强”，而是 `reuse/sync` 路径上仍然做了太多全量发布

几个最典型的证据：

- `record.value.points.single` 在 50k 下 `sections` stage 仍然要 `8.416ms`
- 但这个场景的 plan 是 `query reuse / sections reuse / summary reuse`
- `changedStores = -`

也就是说：

- 最终对外 snapshot 根本没变
- 但 `sections` 阶段仍然付出了非常实的 CPU 成本

同类证据还有：

- `record.value.points.grouped.summary`
  - `sections plan = reuse`
  - `changedStores = summaries`
  - 但 `sections stage = 12.348ms`

这说明当前 `runSectionsStage(...)` 即使拿到了旧 state，也仍然会继续走 `publishSections(...)`，而 `publishSections(...)` 内部又会重新扫描 section/item 结构并做一轮发布层重建。

对应代码路径：

- `dataview/src/engine/derive/active/sections/index.ts`
- `dataview/src/engine/derive/active/collections.ts`

这类浪费是当前最高优先级优化项，因为：

- 不需要改 public API
- 不需要改语义
- 只要让 reuse 真正短路，就能直接拿回 8ms 到 12ms 级别的收益

---

## 2. query 阶段对 50k 仍然是典型全量扫描模型

从 benchmark 看：

- `view.query.search.set` 的主要成本几乎全在 `query stage`
- `view.query.filter.set` 在 50k 下 `query stage = 12.955ms`
- `view.query.sort.keepOnly` 在 50k 下 `query stage = 3.924ms`

对应当前实现：

- `dataview/src/engine/derive/active/query/derive.ts`

核心问题：

- `search` 仍然是扫描 `SearchIndex.all` 或 field text map
- `filter` 仍然按 `ordered` 全量遍历 record，再逐条调用 `matchFilterRule(...)`
- `sort.keepOnly` 虽然能复用 `index.sort.fields.get(fieldId)` 的 asc/desc 数组，但 query 侧仍然会继续做：
  - `sameOrder(...)`
  - `new Set(visible)`
  - `new Map(ordered -> index)`

也就是说：

- index 已经把“排序好的 ids”准备好了
- 但 query publish 仍然会再做一整轮 50k 级别的数组比较、集合构建、顺序映射构建

这块不是“bug”，但它是当前 50k query 操作的主要成本来源。

---

## 3. grouped summary 的 aggregate 结构过重，导致 index 和 view 两边都贵

最典型场景：

- `record.value.points.grouped.summary`
  - total `30.052ms`
  - index `16.143ms`
  - view `13.832ms`
- `history.undo.grouped.value`
  - summary stage `6.108ms`
- `history.redo.grouped.value`
  - summary stage `6.192ms`

对应代码路径：

- `dataview/src/engine/index/calculations.ts`
- `dataview/src/engine/index/aggregate.ts`
- `dataview/src/engine/derive/active/summary/sync.ts`
- `dataview/src/engine/derive/active/summary/state.ts`

当前问题分两层：

### 3.1 全局 calculation index 维护了过重的 per-field `entries` map

当前 `AggregateState` 持有：

- `entries`
- `distribution`
- `uniqueCounts`
- `numberCounts`
- `optionCounts`

而 `patchAggregateState(...)` 在 patch 一个 record 时，会复制多份 map。

这意味着：

- 一个 field 的全局 aggregate，不只是“统计结果”
- 它还带着一份完整 record 级 entry 映射

在 50k 下，这会带来两个问题：

- 内存重复
- patch 时的 map clone 成本很高

### 3.2 section summary 对“record 在 section 间迁移”的处理仍然偏全量

在 `syncSummaryState(...)` 里：

- 如果 touched field 不是 calc field，但 record 改变了所属 section
- 现在通常会重建整个 touched section 的 field aggregate

这对 grouped move / undo / redo 很不友好，因为：

- 真正变化的只是少量 record 的 section membership
- 但当前实现会重新扫整个 touched section 的 `recordIds`

这正是 `undo/redo grouped value` 下 summary stage 上升到 6ms 级别的原因。

---

## 4. section state 仍然重复构建了 index 已经知道的分桶信息

对应代码路径：

- `dataview/src/engine/index/group/state.ts`
- `dataview/src/engine/derive/active/sections/derive.ts`
- `dataview/src/engine/derive/active/sections/sync.ts`

当前 group index 已经维护：

- `recordBuckets`
- `bucketRecords`
- `order`

但 section derive 仍然会：

- 从 `query.visible` 再扫一遍 records
- 重新拼 `idsByKey`
- 重新拼 `byRecord`

这在 group 场景下属于明显重复劳动。

单 active view 架构下，更合理的方向是：

- section runtime 应尽量薄
- group index 负责“bucket membership 与 bucket order”
- current view section 只叠加 query 可见性和 collapse 状态

现在这块还没有做到足够薄。

---

## 5. 现有 trace 把“derive 成本”和“publish 成本”混在一个 stage 里，影响优化判断

例如：

- `sections plan = reuse`
- 但 `sections stage` 仍然很大

这并不代表 section derive 很重，真正重的是后面的 publish。

当前 trace 对外只有：

- `query`
- `sections`
- `summary`

但对于优化决策，更需要拆成：

- derive
- publish

否则很容易误判成“sections sync 算法重”，实际上是“reuse 之后还做了全量 publish”。

这不是最终用户性能问题本身，但它会明显拖慢后续优化迭代效率。

---

## 优化原则

后续优化必须遵循以下原则：

### 1. 先消灭无效工作，再做复杂算法

优先级必须是：

1. reuse 真短路
2. sync 真增量
3. 再考虑更重的数据结构升级

不要一上来上倒排索引、bitset、typed array，而放任 reuse 路径继续全量 publish。

### 2. 继续围绕单 active view 设计

不要为了未来假设把优化重新抽象成多 runtime。

应该接受：

- 只有一个 active view
- 只为它维护最优的 query/sections/summary 局部缓存

### 3. 优先优化 50k 下最贵的真实场景

最高优先级不是平均值，而是：

- single value write
- grouped value write
- grouped summary write
- filter set
- undo/redo grouped value

这些才是当前引擎真实会被用户感知到的慢点。

---

## 分阶段优化方案

## Phase 0: 先补测量，不改语义

目标：

- 在不改行为的前提下，把“derive”与“publish”分开计时

建议：

- 把 `query / sections / summary` 每个 stage 的 trace 拆成：
  - `deriveMs`
  - `publishMs`
- benchmark 输出继续保留总 `viewMs`
- 额外输出 stage 级 derive/publish 子项

收益：

- 后续每次改动能直接看到：
  - 是算法在快
  - 还是 publish 在快

这是所有后续优化的测量基础。

---

## Phase 1: 最高 ROI 的“无效工作清零”

这阶段应该优先做，且尽量在一轮内完成。

### 1.1 `sections reuse` 直接返回 previous published stores

目标：

- 如果 `sections.action === 'reuse'`
- 且 `state === previous`
- 且 `previousPublished.sections/items` 存在

那么直接返回 previous published stores，不再进入 `publishSections(...)`。

适用场景：

- `record.value.points.single`
- `record.value.points.grouped.summary`
- 任何 query/summary 变化但 section runtime 不变的场景

预期收益：

- `record.value.points.single` 可直接回收约 `8ms`
- `record.value.points.grouped.summary` 可直接回收约 `12ms`

### 1.2 `summary reuse` 同样直接返回 previous published summaries

目标：

- 如果 `summary.action === 'reuse'`
- 且 `state === previous`
- 直接返回 previous published map

虽然当前 summary reuse 成本不如 sections 大，但这是同类问题，应该一起收掉。

### 1.3 `publishSections(...)` 内部不再通过 `previous.ids.filter(parseItemId)` 反推 section item ids

当前实现的坏味道：

- 对每个 section 重扫 `previous.ids`
- 重复 `parseItemId(...)`

这会把 publish reuse/sync 的成本放大。

建议：

- 内部缓存 section -> itemIds
- 或在 internal section cache 上直接持有 published itemIds
- 总之不要再从 flat `previous.ids` 倒推 section item ids

### 1.4 `QueryState.order` 与 `visibleSet` 延迟构建

当前即使只是 query 改动，也会立即创建：

- `new Set(visible)`
- `new Map(ordered -> index)`

建议：

- 先做 lazy getter 或按需 materialize
- 只有 sections/sync 需要时再构建

这能直接降低 `sort.keepOnly` / `search.set` / `filter.set` 的 query 重算成本。

### 1.5 去掉明显高频的字符串比较/格式化热点

包括：

- `JSON.stringify(...)` 版 `sameEntry`
- 每次计算结果都新建 `Intl.NumberFormat`

这些不是主因，但属于高频热路径里的坏常数项，应顺手清掉。

---

## Phase 2: query 侧从“全量扫描”升级为“候选集驱动”

这阶段是 query 性能的核心。

### 2.1 filter 先算 candidate set，再走精确 predicate

当前：

- `filterVisibleIds(...)` 会对 `ordered` 全量遍历
- 每条 record 都跑 `matchFilterRule(...)`

建议分两层：

- 第一层：对可索引的规则，先拿 candidate set
  - `status/select/boolean` 的 `eq / neq / in`
  - number/date 的区间类规则
- 第二层：仅对 candidate set 做精确 predicate

在单 active view 模式下，这些 candidate cache 可以直接放在 current query runtime 上，不需要抽象成通用多 view cache。

预期收益：

- `view.query.filter.set` 50k 下有机会从 `14.6ms` 压到低单毫秒或中单毫秒区间

### 2.2 search 从“扫描所有 tokens”升级到“active search candidate set”

当前 search 本质上仍然是：

- 扫整个 `SearchIndex.all`
- 对每个 record 做 `text.includes(query)`

短期建议：

- 对空格分词后的 query 做 token candidate 交集
- 对剩余候选再做 substring 验证

中期建议：

- 如果产品 search 语义允许逐步从 substring 偏向 token match，可以把 search 彻底切到倒排候选集

### 2.3 sort/query publish 避免重复走全量 sameOrder 与 order map 构建

当前 `sort.keepOnly` 的 index 已经能给出 `asc/desc` ids，但 query 侧仍有明显全量发布成本。

建议：

- 当 `matched` 直接引用 index.sort 的数组时，尽量沿着引用传递
- `ordered === matched` 时不要再重复派生第二份结构
- 下游如果不依赖 `order map`，就不要建

---

## Phase 3: grouped sections 与 grouped summaries 做真正的增量化

这阶段是 50k grouped 写入能否继续降到更稳水平的关键。

### 3.1 section runtime 改成“薄包装 group index”

目标：

- 不再让 `buildSectionState(...)` 重新从 `query.visible` 构造一份完整分桶状态
- 尽量直接复用 `groupIndex.bucketRecords / recordBuckets / order`

section runtime 应只负责：

- 叠加 query 可见性
- 叠加 collapse
- 生成当前 active view 的 published sections/items

而不应该重新承担 bucket membership 构造职责。

### 3.2 section item ids 与 record ids 分离缓存

当前 item id 是字符串拼接：

- `section:${sectionKey}\u0000record:${recordId}`

这本身没错，但高频 parse/filter/重建会很贵。

建议：

- internal cache 里直接保存 section -> itemIds
- 同 section、同 record 顺序不变时直接复用

### 3.3 grouped summary 在“record 移桶”时不要重建整 section

这是第二个高 ROI 大项。

当前更合理的做法是：

- 对 source section 执行 `patchAggregateState(remove record)`
- 对 target section 执行 `patchAggregateState(add record)`

而不是：

- 只要 section membership 变了，就重扫整个 touched section

这会显著改善：

- `history.undo.grouped.value`
- `history.redo.grouped.value`
- grouped status move + summary 场景

预期收益：

- grouped undo/redo 的 summary stage 可明显下降，目标是从 `6ms+` 压到 `1ms` 级别或更低

---

## Phase 4: calculation index 结构减重

这是最值得做、但改动也最大的一步。

### 当前问题

`CalculationIndex` 现在等于：

- 全局 aggregate 统计
- 加上一整份 per-record aggregate entry map

这会导致：

- 内存重复
- patch 一个 record 也要克隆大 map

### 建议方向

把 calculation index 拆成两层：

- `GlobalAggregateState`
  - 只保留 count / sum / min / max / distribution / uniqueCounts / numberCounts / optionCounts
- `EntryReader`
  - 需要 record entry 时，从 `RecordIndex` 或 field value reader 即时读取

核心思想：

- 全局统计结构不应该再把完整 `entries` map 当作常驻主状态
- touched record 的 previous/next entry 应该从 record rows 现算，而不是靠常驻 50k map 复制

### 进一步方向

如果 grouped summary 是核心产品场景，可以直接维护：

- active group demand 下的 per-bucket aggregate cache

这会让 grouped summary 从“global -> section 再聚合”变成“bucket aggregate 直接读”。

这一步是长期最优，但不建议早于 Phase 1/2。

---

## Phase 5: 更深的数据布局优化

这部分不是现在最该先做的，但属于长期最优方向。

### 5.1 用 record ordinal 代替高频 `RecordId -> Map` 访问

当前很多热路径都在做：

- `Map<RecordId, ...>`
- `array.includes(recordId)`
- `indexOf(recordId)`

长期更优的方向是：

- active runtime 内部引入稳定 ordinal
- 顺序、可见性、membership 用 ordinal array / bitset 表示

### 5.2 可见性与 section membership 改成 bitset / dense array

这对：

- search/filter candidate 交集
- grouped membership patch
- section visible subset

都会更友好。

### 5.3 `CalculationResult.display` 改成懒计算

如果未来 summary 字段与 section 数量继续增加：

- 不应在每次 derive 都 eagerly 生成完整 display string
- 应优先保留 raw result，显示时再 format

这属于更深层的 UI/engine 边界优化。

---

## 推荐执行顺序

如果只考虑性价比，建议按下面顺序推进：

1. `reuse` 路径彻底短路 publish
2. `publishSections(...)` 去掉反推与重复 parse
3. query 的 `visibleSet/order` 延迟构建
4. grouped summary 的 section move 改为 patch，不再整 section rebuild
5. filter candidate set
6. calculation index 结构减重
7. section runtime 更薄地复用 group index

原因很简单：

- 1 到 3 可以较快拿到最直接收益
- 4 到 6 才是 50k grouped 能否继续压下去的关键结构优化
- 7 是更彻底的长期清理，但不一定要最先做

---

## 预期收益判断

这里不给“承诺值”，只给方向性判断。

### 第一阶段完成后

目标：

- `record.value.points.single` 从 `18.5ms` 下降到接近 `10ms`
- `record.value.points.grouped.summary` 从 `30.0ms` 降到接近 `18ms` 到 `20ms`

原因：

- 主要回收的是当前无效的 `sections publish`

### 第二阶段完成后

目标：

- `view.query.filter.set` 显著下降
- `view.query.sort.keepOnly` 下降到更接近纯 query publish 的理论成本

### 第三阶段完成后

目标：

- `history.undo.grouped.value`
- `history.redo.grouped.value`

从接近 `30ms` 的区间明显下降，重点回收 summary sync 的 section rebuild 成本。

---

## 明确不建议现在做的事

下面这些方向现在都不应优先：

- 为 inactive view 预热 derive cache
- 为未来多 view runtime 抽象一套通用性能层
- 上来先做 worker / 多线程
- 先做 typed array 大重写，而不处理当前 reuse/publish 浪费
- 为 benchmark 特判逻辑，牺牲正常 runtime 清晰度

这些都不符合当前产品和架构事实。

---

## 最终结论

当前 50k 性能问题可以拆成三层：

### 第一层：无效工作

- reuse/sync 路径上仍然做了大量全量 publish

这是最先该消灭的。

### 第二层：局部算法仍然是 O(n) 全量扫描

- filter
- search
- query publish

这决定了 query 类操作在 50k 下的下限。

### 第三层：grouped summary 的内部模型过重

- calculation index 太胖
- section summary 对 membership move 的处理还不够增量

这决定了 grouped write、undo、redo 在 50k 下的上限。

所以最合理的路线不是“大重写”，而是：

1. 先把无效 publish 清零
2. 再把 query 改成候选集驱动
3. 最后把 grouped summary 的内部模型减重并真正增量化

这条路线既符合单 active view 架构，也最可能在较小风险下把 50k 表现往长期最优推进。

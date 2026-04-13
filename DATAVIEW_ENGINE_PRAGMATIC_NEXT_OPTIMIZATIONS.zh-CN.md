# Dataview Engine 当前剩余性能优化建议（务实版）

## 文档定位

这份文档只回答一个问题：

在已经完成这一轮 `single active view` 性能收口之后，`dataview` 还有哪些地方值得继续优化。

约束如下：

- 本文不改代码，只做分析。
- 目标是继续拿到明显收益，但不引入过度复杂、未来难扩展的内部模型。
- 不建议为了追求极限数据结构而把 engine 再推回“大而全的通用框架”。

换句话说，这份文档只保留“务实、可维护、收益明确”的后续优化项。

---

## 当前结论

这一轮优化之后，view 侧最明显的无效工作已经基本清掉了。

当前 benchmark 结果来自：

- `dataview/.tmp/bench-large-50k.json`

`large = 50000 records` 下的最新结果：

| scenario | total | index | view |
| --- | ---: | ---: | ---: |
| `record.value.points.single` | 9.673ms | 8.847ms | 0.341ms |
| `record.value.status.grouped` | 19.015ms | 11.111ms | 7.836ms |
| `record.value.points.grouped.summary` | 12.264ms | 10.583ms | 1.611ms |
| `view.query.search.set` | 3.214ms | 0.012ms | 3.162ms |
| `view.query.filter.set` | 8.273ms | 0.006ms | 8.242ms |
| `view.query.sort.keepOnly` | 4.180ms | 0.007ms | 4.140ms |
| `view.query.group.set` | 11.537ms | 5.478ms | 6.028ms |
| `history.undo.grouped.value` | 29.454ms | 22.927ms | 6.445ms |
| `history.redo.grouped.value` | 16.473ms | 10.522ms | 5.904ms |

相对于上一轮基线：

- `record.value.points.single`: `18.503ms -> 9.673ms`
- `record.value.points.grouped.summary`: `30.052ms -> 12.264ms`
- `view.query.filter.set`: `14.645ms -> 8.273ms`
- `view.query.sort.keepOnly`: `8.405ms -> 4.180ms`
- `history.redo.grouped.value`: `29.758ms -> 16.473ms`

最重要的结构性变化是：

- `reuse` 路径已经是真正短路。
- `sections` / `summary` publish 已经不是主要浪费。
- query 侧已经不再是最粗糙的全量扫描。

所以后续优化不应该再沿着“继续削 publish”走，而应该转向：

- index 侧字段值同步
- grouped section sync
- filter exact fast path
- search index 的维护策略

---

## 现阶段剩余热点

## 1. `RecordIndex` 仍然太重

当前最稳定的热点之一，是单条 record value 更新时的 `recordsMs`。

典型结果：

- `record.value.points.single`
  - `recordsMs ~ 5.8ms`
- `record.value.status.grouped`
  - `recordsMs ~ 6.0ms`
- `record.value.points.grouped.summary`
  - `recordsMs ~ 5.3ms`
- `history.undo.grouped.value`
  - `recordsMs ~ 5.2ms`

对应实现：

- `dataview/src/engine/index/records/index.ts`

核心原因不是“算法错了”，而是当前 `RecordIndex` 的字段值模型还是偏重：

- `records.values` 维护了所有 field 的 `Map<FieldId, Map<RecordId, unknown>>`
- 单条 value 更新时，仍然会复制被 touched field 的整张 field value map
- 50k 下，这种 `new Map(previousValueMap)` 的常数成本已经很明显

这块现在已经成为很多写入场景的 index 基础税。

### 判断

这是后续最值得优化的 index 热点，而且不需要引入奇怪的数据结构。

---

## 2. `SearchIndex` 的维护成本偏高，但 query 收益已经不再成比例

典型结果：

- `record.value.points.single`
  - `searchMs ~ 2.4ms`
- `record.value.status.grouped`
  - `searchMs ~ 2.3ms`
- `record.value.points.grouped.summary`
  - `searchMs ~ 2.6ms`
- `history.undo.grouped.value`
  - `searchMs ~ 2.3ms`

对应实现：

- `dataview/src/engine/index/search/index.ts`

现状是：

- 即使当前 view 并没有 active search query
- 只要 demand 里需要 `search.all`
- index 仍然会持续维护整套 all-text search text

这在当前阶段出现了一个明显不对称：

- search query 本身已经压到 `3.2ms`
- 但很多非 search 写入仍然要付出 `2ms+` 的 search 维护成本

### 判断

Search 现在不是“查询时太慢”，而是“后台维护太积极”。

这类问题不需要上倒排系统或复杂 token runtime，也能继续优化。

---

## 3. grouped section sync 仍然在 clone 大数组

典型结果：

- `record.value.status.grouped`
  - `sections derive ~ 7.3ms`
- `history.undo.grouped.value`
  - `sections derive ~ 3.4ms`
- `history.redo.grouped.value`
  - `sections derive ~ 3.4ms`

对应实现：

- `dataview/src/engine/derive/active/sections/sync.ts`

当前 `syncSectionState(...)` 的主要问题是：

- 一旦进入 grouped sync
- 会先把 `previous.byKey` 里的所有 section `recordIds` 全量 clone 一轮

即使真正变化的只有：

- source section
- target section

这仍然会导致所有 bucket 的大数组先被复制一次。

### 判断

这是一个非常典型的“还有明显收益，但不需要重写架构”的热点。

---

## 4. grouped `GroupIndex` 的 bucket membership patch 还有大数组复制成本

典型结果：

- `record.value.status.grouped`
  - `groupMs ~ 3.9ms`
- `history.undo.grouped.value`
  - `groupMs ~ 2.7ms`

对应实现：

- `dataview/src/engine/index/group/state.ts`

当前路径中：

- `removeOrderedId(...)`
- `insertOrderedId(...)`

都会对 bucket array 做整段复制。

在 bucket 很大时，比如一个 status bucket 挂了 10000+ records：

- 单条 record 移桶
- 实际上还是会复制 source/target bucket 的整段数组

### 判断

这块值得做，但优先级略低于 section sync lazy clone，因为：

- section sync 现在比 group sync 更贵
- 两者都优化时，应先收掉 view 侧的 section clone 浪费

---

## 5. grouped summary 已经进入“可以继续降，但没必要大改”的区间

典型结果：

- `record.value.points.grouped.summary`
  - `summary derive ~ 1.5ms`
- `history.undo.grouped.value`
  - `summary derive ~ 1.9ms`
- `history.redo.grouped.value`
  - `summary derive ~ 2.0ms`

对应实现：

- `dataview/src/engine/derive/active/summary/sync.ts`
- `dataview/src/engine/index/calculations.ts`

这一轮之后，summary 已经不再是最大的热点。

它还可以继续优化，但当前问题已经从“架构错误”变成“常数项还能再降”。

### 判断

除非下一轮要专门打 grouped undo/redo，否则不建议现在再为了 summary 做大规模内部重写。

---

## 6. `view.query.filter.set` 还有进一步空间，但已经不是最粗糙的问题

当前结果：

- `view.query.filter.set`
  - `query derive ~ 6.77ms`

现状是：

- query 已经先拿候选集
- 但对候选 records 仍然会逐条再跑 `matchFilterRule(...)`

对于以下规则，这个“二次确认”其实有不少是重复劳动：

- `status/select` 的 `eq`
- `boolean` 的 `checked/unchecked`
- 一部分 number/date 的边界比较

### 判断

这块值得做“可信候选集 fast path”，但不值得上复杂 query planner。

---

## 哪些优化值得继续做

下面这几项，是我认为目前最值得继续推进的，而且都不会把架构带向过度复杂。

## A. `RecordIndex` 改成 demand-driven value columns

这是下一轮我最推荐做的优化。

### 目标

不要再让 `RecordIndex.values` 默认维护所有字段的整套 value map。

而是只维护 active runtime 真正需要的字段列，例如：

- sort fields
- group fields
- calculation fields
- active filter fast-path fields
- active search fields

### 结构方向

不是把 `RecordIndex` 做成抽象 registry，而是更简单：

- `RecordIndex.rows` 继续保留完整 row map
- `RecordIndex.values` 改为“按当前 demand 加载的字段列”
- 未加载字段需要时，直接从 row 读

### 收益

- 明显降低 `recordsMs`
- 也会连带降低 search/group/sort/calculation sync 的上游读取成本
- 非活跃字段不再交税

### 复杂度判断

中等复杂度，但方向稳定，而且符合 single active view 架构。

这是值得做的。

---

## B. `syncSectionState(...)` 改成 touched section lazy clone

### 目标

不要在 grouped sync 一开始就复制所有 section 的 `recordIds`。

改成：

- 默认复用 previous section arrays
- 只有 record 实际影响到某个 section 时，才 clone 那个 section 的 ids

### 收益

- `record.value.status.grouped`
- `history.undo.grouped.value`
- `history.redo.grouped.value`

这些场景会直接受益。

### 复杂度判断

低到中等复杂度。

这是非常典型的“收益高、风险低、不会污染架构”的优化。

这是值得做的。

---

## C. Search index 改成“按需维护”，不要默认持续维护 all-text

### 目标

让 search index 更偏“前台驱动”，而不是“后台持续全量维护”。

更务实的做法有两种：

1. 只有 search query 非空时，才维护 `search.all`
2. `search.all` 默认只覆盖常见 text-like 字段，不把 number/date 这类字段纳入默认 all-text

### 收益

这会优先降低：

- 非 search 写入时的 `searchMs`

特别是：

- `record.value.points.single`
- `record.value.status.grouped`
- `grouped summary` 相关写入

### 复杂度判断

中等复杂度，但依赖一个产品语义判断：

- 搜索是否必须默认覆盖所有字段

如果你接受“默认 all-search 不必覆盖 number/date/raw meta”，这项很值得做。

如果产品明确要求“所有字段都必须可搜索”，那就应该更保守。

---

## D. Filter exact fast path：候选集可信时不再逐条 predicate

### 目标

当 rule 已经由 index 精确表达时，直接使用 candidate set，不再做第二次 `matchFilterRule(...)`。

适用范围可以先只覆盖：

- `status/select eq`
- `boolean checked/unchecked`
- `exists_true/exists_false`

### 收益

继续下降：

- `view.query.filter.set`

而且实现范围可以很小。

### 复杂度判断

低复杂度。

值得做，但优先级低于 A / B。

---

## E. `GroupIndex` bucket patch 做 touched bucket lazy copy

### 目标

对 source/target bucket 做懒复制和原地 patch 风格更新，而不是每次都走整段数组重建。

### 收益

继续下降：

- grouped status move
- grouped undo/redo

### 复杂度判断

中等复杂度。

值得做，但建议排在 `syncSectionState` lazy clone 之后。

---

## 哪些优化现在不建议做

下面这些方向不是“做不了”，而是现在性价比不对。

## 1. 不建议现在上 ordinals / bitset / dense array

原因：

- 会明显推高内部复杂度
- 需要一口气重做大量读写路径
- 当前并不是没有别的简单优化可做

这类方案适合更远期，不适合现在。

---

## 2. 不建议现在把 query 做成通用 planner / execution engine

原因：

- 当前 query 规模和语义还不需要这套复杂度
- 真正剩余热点主要在若干明确 fast path，而不是 planner 缺失

应该优先做更小、更具体的 fast path。

---

## 3. 不建议现在把 grouped summary 再改成 bucket aggregate 总线

原因：

- 这会把 group index 和 summary runtime 绑得更深
- 当前 summary 已经不再是最大问题
- 现在去做，收益和复杂度不成比例

---

## 4. 不建议现在为了 `view.query.sort.keepOnly` 再引入复杂 root section 特判

原因：

- 非 grouped 场景下，50k root reorder 本来就有真实成本
- `4.18ms` 已经不是当前最急的问题
- 再追这块，很容易掉进“为了极限数字做局部特化”的陷阱

---

## 推荐顺序

如果继续做下一轮，我建议按这个顺序推进：

1. `RecordIndex` demand-driven value columns
2. `syncSectionState(...)` touched section lazy clone
3. Search index 改成按需维护
4. Filter exact fast path
5. `GroupIndex` touched bucket lazy copy

这个顺序的理由很直接：

- 1 是 index 基础税，很多场景都会一起受益
- 2 是 grouped view 当前最明显的 view 热点
- 3 会继续削掉很多非 search 写入的隐藏成本
- 4 是纯 query fast path，容易落地
- 5 有价值，但不要早于 2

---

## 最务实的总体判断

当前 engine 已经从“结构性浪费很大”进入到“剩下的是热点收敛”阶段。

所以接下来的策略不应该是：

- 继续大拆大建
- 继续引入更抽象的中间层
- 继续为理论最优预埋复杂 runtime

更正确的策略是：

- 只修真正还贵的几条热路径
- 尽量让优化建立在当前 single active view 架构上
- 优先减少大 map / 大 array clone
- 优先把后台持续维护改成按需维护

一句话总结：

后续还有优化空间，但已经不需要“激进重写”，而应该做一轮更克制的、以 demand 与 lazy copy 为核心的收尾优化。

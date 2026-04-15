# Dataview Active Index 性能优化总方案

## 文档目标

这份文档只回答一件事：

`dataview/packages/dataview-engine/src/active/index` 整条派生链路里，凡是还能继续优化的地方，都应该怎么收敛到长期最优。

这里的目标不是修某一个热点，也不是继续做零散 micro-optimization，而是把 active index 这条读侧热路径统一收成一套长期稳定的低分配设计。

本文覆盖：

- `runtime.ts`
- `shared.ts`
- `sync.ts`
- `records.ts`
- `search.ts`
- `sort.ts`
- `group/runtime.ts`
- `group/bucket.ts`
- `calculations.ts`
- `aggregate.ts`
- `trace.ts`
- 与其直接相关的 `snapshot/summary` 消费路径

本文的约束也先写在前面：

- `document` 继续保持不可变
- 已经发布出去的 index state 继续保持不可变
- 不允许为了省事直接 mutate `previous state`
- 允许在一次 derive 内部使用短生命周期的 transient builder
- builder 只能 mutate 自己首次 copy 出来的局部容器，不能 mutate `document`，也不能 mutate `previous`
- 能不 clone 的地方就不 clone

一句话总结：

长期最优不是“继续 clone，只是 clone 得更晚一点”，而是：

- `document` 不可变
- 已发布 state 不可变
- derive 内部只做最小必要复制
- 未变化的叶子结构完全复用
- 不再允许无条件 `new Map(previous)`、`slice()`、`Array.from()` 先做一遍再说

---

## 最终结论

### 1. 现在还有明显优化空间，而且不小

当前 `active/index` 已经有增量同步，但还不是“低分配增量同步”。

现在的主要问题不是逻辑错误，而是：

- 很多路径虽然语义上是 incremental，结构上却仍然在 eager clone
- 很多 stage 都在重复创建同一批 reader / touched set / field set
- 一些数据结构为了表达方便，额外存了两份大数组或一层会不断长大的 overlay
- 大 bulk commit 时，GC 压力和短命大对象数量明显偏高

### 2. 这条路径的长期最优应该是“共享 derive context + 惰性 builder”

最终应当把 active index 的内部结构收敛成两层：

1. 共享派生上下文
   - 一次 derive 只创建一次 `reader`
   - 一次 derive 只解析一次 `impact`
   - 一次 derive 只判断一次 field existence / touched records / touched fields
2. 各 stage 的最薄 builder
   - `RecordIndexBuilder`
   - `MapPatchBuilder`
   - `ArrayPatchBuilder`
   - `AggregateBuilder`
   - `BucketMembershipBuilder`

也就是说，长期最优不是每个 stage 各自再发明一套 helper，而是共享一套最小的 builder 中轴。

### 3. “不 clone”不等于“可变 document”

这里必须明确：

- 不应该 mutate `document`
- 不应该 mutate `previous.records`
- 不应该 mutate `previous.search`
- 不应该 mutate `previous.group`
- 不应该 mutate `previous.sort`
- 不应该 mutate `previous.calculations`

但这不代表我们必须每次都整图 clone。

正确做法是：

- 先只读 `previous`
- 真正发现某个 leaf 需要变时，再为这个 leaf 创建局部副本
- 同一个 derive 内，这个局部副本允许做 transient mutation
- `finish()` 时产出新的不可变发布对象

所以长期最优其实是：

- `immutable document`
- `persistent published state`
- `transient mutable builders`

---

## 优化原则

### 1. 不允许无条件 clone

下面这些模式都应该系统性删除：

- `const next = new Map(previous)` 然后再判断是否真的变化
- `const next = previous.slice()` 然后再判断是否真的变化
- `Array.from(map.keys())` 只是为了循环
- `Array.from(set).filter(...)` 再塞回 `new Set(...)`
- `flatMap(...)->new Map(...)`

长期规则应该是：

- 先判断
- 后 copy
- 只 copy 真变的那一层

### 2. 不允许长期增长的 overlay

overlay / patch view 只有在满足下面条件时才健康：

- patch 容量受控
- patch 会被定期 materialize / compact
- patch 不会跨很多轮 derive 持续堆积

如果一个 overlay 会随着 commit 次数增长，最后接近全量数据规模，那它不是优化，而是延迟爆炸。

### 3. 不允许同一份大数据存两份等价结构

典型例子：

- sort 同时存 `asc` 和 `desc`
- rows 既存在 `document.records.byId`，又存在 `RecordIndex.rows`

如果第二份结构只是为了读方便，而不是为了复杂度量级优化，它应该被删掉。

### 4. 共享派生上下文只建一次

一次 `deriveIndex()` 内，下面这些东西都不应该被每个 stage 各自重复建：

- `createStaticDocumentReader(document)`
- `collectTouchedRecordIds(impact)`
- `collectSchemaFieldIds(impact)`
- `collectValueFieldIds(impact)`
- field existence lookup

### 5. 全量重建路径也要避免中间数组

即使是 rebuild，也不代表可以随便分配。

全量构建路径必须尽量用 imperative loop，避免：

- `flatMap`
- `map + new Map`
- `Array.from(...).map(...)`
- 不必要的 `sort()` 前拷贝

---

## 当前热点总览

### 一、共享上下文层

#### `runtime.ts`

当前问题：

- 每个 stage 自己再去创建 reader 或 sync context 的下游依赖
- `trace` 总是完整计算

优化方向：

- 在 `deriveIndex()` 顶部创建一次 `IndexDeriveContext`
- 所有 stage 共享这一个 context
- trace 只在真的需要时构建

#### `shared.ts`

当前问题：

- `hasField(document, fieldId)` 每次都 `createStaticDocumentReader(document)`
- `allFieldIdsOf()` 为了合并字段，又临时建 reader 和 `Set`

优化方向：

- 删除这类“每次读都现建 reader”的 helper
- field existence 直接来自 derive context
- 共享 `fieldIds` 和 `fieldIdSet`

#### `sync.ts`

当前问题：

- `createFieldSyncContext()` 在 search / sort / group / calculations 各建一次
- `ensureFieldIndexes()` 一开始就 `new Map(previous)`
- `shouldDropFieldIndex()` 仍然依赖 `hasField(document, fieldId)`

优化方向：

- `FieldSyncContext` 在 `deriveIndex()` 一次性 materialize
- `ensureFieldIndexes()` 改成 lazy top-level map builder
- `hasField` 改为读 context 的 `fieldIdSet`

### 二、records stage

#### `records.ts`

当前问题：

1. `buildRows()` 全量把 `document.records.byId` 再复制成 `Map`
2. `toValueMap()` 和 `buildRows()` 都用了 `flatMap -> new Map`
3. `rows` 在首次 touched 时会 `new Map(previous.rows)`
4. 每个 touched field 在首次写时都会 `new Map(previousColumn)`
5. `values` 顶层 map 每次变化都重建
6. `RecordIndex.rows` 本质上只是给 `document.records.byId` 包了一层 `Map.get`

优化方向：

1. 删除 `RecordIndex.rows`
   - 改为直接持有 `document.records.byId`
   - 或者提供 `row(recordId)` 读取函数
2. `buildRows()` 这条线直接删除
3. `toValueMap()` 改成 imperative loop
4. 为列值引入统一的 `MapPatchBuilder`
   - 首次真正改动某个 field 时才 clone 该列
5. 顶层 `values` 也用 lazy top-level builder
6. `order` 仍保留 map，但只在 `ids` 真变化时重建

长期最优的 `RecordIndex` 更适合长这样：

```ts
interface RecordIndex {
  ids: readonly RecordId[]
  fieldIds: readonly FieldId[]
  order: ReadonlyMap<RecordId, number>
  byId: DataDoc['records']['byId']
  values: ReadonlyMap<FieldId, ValueColumn>
  rev: number
}

interface ValueColumn {
  values: ReadonlyMap<RecordId, unknown>
  presentIds?: readonly RecordId[]
}
```

这里的关键点不是接口长什么样，而是：

- 行数据不再复制
- 列数据只在该列真正变化时复制
- `presentIds` 如果需要，也只存一份，不再每次 `Array.from(keys())`

### 三、search stage

#### `search.ts`

当前问题：

1. `updateTextIndex()` 一进来就 `new Map(previous.texts)`
2. 即使 touched records 最终没有文本变化，也已经整图 clone 了
3. `rebuildFieldIds` 通过 `Array.from(...).filter(...)->new Set(...)`
4. `nextFields` 每次 sync 都先 `new Map(previous.fields)`
5. `normalizeDemand()` 每次都建新的 `Set`

优化方向：

1. `SearchTextIndex` 改为 lazy map builder
   - 先对 touched records 逐个计算 `nextText`
   - 发现第一个差异时才 clone `texts`
2. `loadedFieldIds` 不要转 `Set` 再 `Array.from`
   - 直接迭代 `previous.fields`
3. `rebuildFieldIds` 不要单独 materialize
   - 在单次循环中直接判断
4. `nextFields` 用 top-level lazy builder
5. search demand 归一化可以在 `normalizeIndexDemand()` 做完后直接复用数组，不再在 stage 内建 `Set`

长期目标：

- `search.all` 和 `search.fields[fieldId]` 都走同一套 `TextIndexBuilder`
- 任何一次 sync，如果没有文本差异，不产生新的 `Map`

### 四、sort stage

#### `sort.ts`

当前问题：

1. `SortFieldIndex` 同时存 `asc` 和 `desc`
2. build 时 `asc = slice().sort()`，再 `desc = asc.slice().reverse()`
3. incremental sync 时，最后还会再 `nextAsc.slice().reverse()`
4. 单条 record reposition 用 `findIndex` / `indexOf` 在大数组上重复扫描
5. touched record 很小时还好，但 touched 稍大就会变成多轮线性扫描

优化方向：

1. 删除 `desc`
   - sort index 只存 `asc`
   - 需要倒序读时做反向遍历视图
2. incremental sync 改成“两段式”
   - 一次性从 `previous.asc` 过滤掉 `touchedSet`
   - 对 `touchedIds` 本地排序
   - 再做一次 merge
3. 不再对每条 touched record 做 `indexOf + splice + binary insert`
4. 如果 touched 数超过阈值，直接 rebuild

长期最优的 `SortFieldIndex` 应该只有：

```ts
interface SortFieldIndex {
  asc: readonly RecordId[]
}
```

然后由调用方决定顺序视图，而不是在 index 层存两份大数组。

### 五、group stage

#### `group/runtime.ts`

当前问题：

1. `PatchedRecordBuckets` 会把 patch 长期叠加
2. 新一轮 sync 时还会把旧 patch merge 进新 patch
3. patch map 会越来越大，最终接近全量 record 数
4. `bucketRecords` 首次 touched 时会整张 top-level map 复制
5. touched bucket 再各自 clone id 数组
6. `insertBucketMember()` 使用 `includes + findIndex`
7. `nextGroups` 每次 sync 先 `new Map(previous.groups)`

这条线是当前最需要优先修的点之一，因为它有长期退化问题，而不是单次常数项问题。

优化方向：

1. 删除 `PatchedRecordBuckets`
2. `recordBuckets` 改成 plain `ReadonlyMap<RecordId, readonly BucketKey[]>`
3. sync 时使用 `MapPatchBuilder`
   - 首次发现某条 record bucket 真变化时，才 clone top-level map
   - 未变化的 `BucketKey[]` 直接复用
4. `bucketRecords` 使用两层 lazy builder
   - top-level `MapPatchBuilder<BucketKey, readonly RecordId[]>`
   - bucket 内部 `ArrayPatchBuilder<RecordId>`
5. bucket member 更新改成批量式，而不是逐条 `indexOf/splice`
6. 同步结束后直接 materialize 为 plain map，不再发布 overlay 对象

#### `group/bucket.ts`

当前问题：

1. `buildBucketState()` 每次都重建 `nextBuckets`
2. 每次都重新 `Array.from(nextBuckets.values()).sort(...)`
3. 即使 bucket domain 没变，也还是会重建 descriptors 和 order

优化方向：

1. 把“bucket membership changed”和“bucket metadata changed”分开
2. 如果：
   - field schema 没变
   - bucket domain 没变
   - bucket sort 配置没变
   那么：
   - `buckets` 直接复用 previous
   - `order` 直接复用 previous
3. 只有新增 bucket / bucket descriptor 真变化时，才重建 `buckets`
4. 只有排序条件或 bucket 集合真变化时，才重排 `order`

长期最优：

- `group/runtime.ts` 只负责 membership
- `group/bucket.ts` 只负责 metadata / order
- 两者不要每次一起全做

### 六、calculations stage

#### `calculations.ts`

当前问题：

1. `buildFieldEntries()` 用 `flatMap -> new Map`
2. sync 时每个 field 都会先 `new Map(previousField.entries)`
3. 每条 touched record 都调用一次 `patchAggregateState()`
4. `patchAggregateState()` 每次又 clone 四张统计 map
5. bulk touched 时会出现：
   - 一次 field entries 全量 clone
   - 多次 aggregate map clone

这条线是 bulk write 下很重的分配源。

优化方向：

1. `entries` 使用 lazy map builder
   - 没有 entry 差异时不 clone
2. aggregate 更新改成 field 级 builder
   - 一次 field sync 只 clone 一次统计 state
   - 多条 touched record 在同一个 mutable aggregate builder 内批量 apply
3. `patchAggregateState()` 不再作为 bulk path 的主入口
   - 它可以保留为叶子级 helper
   - 但 bulk path 应该走 `AggregateBuilder`

长期最优 API：

```ts
interface AggregateBuilder {
  apply(previous?: AggregateEntry, next?: AggregateEntry): void
  finish(previous: AggregateState): AggregateState
}
```

这样一来：

- 一个 field 一次 sync 只 clone 一次 aggregate 内部 map
- 而不是 touchedRecords 次 clone

### 七、aggregate 基础层

#### `aggregate.ts`

当前问题：

1. `patchAggregateState()` 是 record 级 patch API
2. 它每次都会 clone：
   - `distribution`
   - `uniqueCounts`
   - `numberCounts`
   - `optionCounts`
3. `readNumberRange()` 通过 `Array.from(keys()).sort()` 重建范围

优化方向：

1. 保留 `patchAggregateState()` 作为小路径叶子 helper
2. 新增 `MutableAggregateState`
   - derive 内部批量 patch 用它
3. `min/max` 维护改成 builder 内部增量维护
4. 只有真的触发 range invalidation 时，才做回扫
5. 尽量避免 `Array.from(numberCounts.keys()).sort()`

### 八、trace 路径

#### `trace.ts`

当前问题：

1. `searchEntryCountOf()` 用 `Array.from(...).reduce(...)`
2. trace 默认每次 derive 都完整计算

优化方向：

1. trace 只在：
   - debug 打开
   - profiler 打开
   - benchmark 场景
   时才构建
2. `searchEntryCountOf()` 改成直接迭代 map values
3. 如果 trace 不开，`createIndexStageTrace()` 整条线直接跳过

### 九、summary 消费路径

#### `active/snapshot/summary/sync.ts`

当前问题：

1. section summary 当前强依赖 calculation index 的 `entries`
2. section rebuild 时会再构建一层 section-scoped aggregate state

优化方向：

1. calculations 仍然保留 `entries`
   - 因为 summary 确实需要 record 级 entry
2. 但 calculations 的 entries 要求：
   - 不能 eager clone
   - 不能为没变的 record 重建 entry
3. summary 层可以继续依赖它
   - 不需要再额外发明第二套 record entry source

换句话说：

- `entries` 这层不是冗余
- 冗余的是它现在的 clone 方式

---

## 必须一起做的共享中轴

如果只改局部文件，不建共享中轴，最后一定会再次长出一堆零散 helper。

长期最优应当补三类共享中轴，而且只补这三类。

### 1. `IndexDeriveContext`

```ts
interface IndexDeriveContext {
  document: DataDoc
  reader: DocumentReader
  impact: IndexImpactView
  traceEnabled: boolean
}
```

### 2. `IndexImpactView`

```ts
interface IndexImpactView {
  touchedRecords: ReadonlySet<RecordId> | 'all'
  schemaFields: ReadonlySet<FieldId>
  valueFields: ReadonlySet<FieldId> | 'all'
  touchedFields: ReadonlySet<FieldId> | 'all'
  recordSetChanged: boolean
}
```

要求：

- 一次 derive 只 materialize 一次
- search / sort / group / calculations 全部复用

### 3. 通用惰性 builder

只允许保留下面这类非常薄的基础 builder：

```ts
interface MapPatchBuilder<K, V> {
  get(key: K): V | undefined
  has(key: K): boolean
  set(key: K, value: V): void
  delete(key: K): void
  changed(): boolean
  finish(previous: ReadonlyMap<K, V>): ReadonlyMap<K, V>
}

interface ArrayPatchBuilder<T> {
  read(): readonly T[]
  mutate(fn: (draft: T[]) => void): void
  changed(): boolean
  finish(previous: readonly T[]): readonly T[]
}
```

不要继续扩展更多 builder 类型树。

长期最优是：

- builder 足够少
- builder 足够薄
- builder 被多 stage 复用

---

## 明确要删除的旧实现

以下结构都属于应删项，不应继续保留兼容：

- `RecordIndex.rows`
- `SortFieldIndex.desc`
- `PatchedRecordBuckets`
- `createStaticDocumentReader(document)` 在 stage 内部反复创建的模式
- `hasField(document, fieldId)` 这种每次临时建 reader 的 helper
- `ensureFieldIndexes()` 一上来就 clone top-level map 的实现
- `updateTextIndex()` 一上来就 clone texts map 的实现
- `patchAggregateState()` 作为 bulk touched 主路径的使用方式
- `Array.from(...).filter(...)->new Set(...)` 这类中间集合构建模式
- `flatMap(...)->new Map(...)` 这类全量 build 模式
- 任何跨多轮 derive 持续增长的 overlay

---

## 落地顺序

### 第一阶段：共享上下文和基础 builder

先做：

- `IndexDeriveContext`
- `IndexImpactView`
- `MapPatchBuilder`
- `ArrayPatchBuilder`

这是所有后续优化的共同前提。

### 第二阶段：records + search

优先级最高，因为它们是所有下游 stage 的输入层。

要完成：

- 删除 `RecordIndex.rows`
- 记录列值改为 lazy copy-on-write
- search texts 改为 lazy copy-on-write

### 第三阶段：sort + group

要完成：

- 删除 `SortFieldIndex.desc`
- sort 改成单数组 + merge sync
- 删除 `PatchedRecordBuckets`
- group membership 改成 plain map + lazy builder

### 第四阶段：calculations + aggregate

要完成：

- `AggregateBuilder`
- field 级批量 aggregate patch
- entries lazy copy-on-write

### 第五阶段：trace 和小路径收尾

要完成：

- trace 按需启用
- 全量 build 去 `flatMap`
- 去掉剩余 `Array.from/Set/Map` 中间对象

---

## 验收标准

### 一、结构标准

必须满足：

- `document` 从头到尾不可变
- `previous state` 从头到尾不可变
- 没变化的 leaf 完全复用
- 不存在长期增长的 overlay
- 不存在双份大数组缓存

### 二、实现标准

必须满足：

- stage 内不再重复 `createStaticDocumentReader(document)`
- `FieldSyncContext` / touched sets 不再重复 materialize
- `search` / `records.values` / `calculations.entries` 只有在真变化时才 clone
- `group.recordBuckets` 发布结果是 plain map，不是 wrapper 链

### 三、性能标准

至少要用下面这些场景压测：

1. 10k / 50k records，单字段 bulk write
2. 10k / 50k records，大范围 fill
3. 开启 search.all
4. 开启多字段 sort
5. 开启 group
6. 开启 calculations + summary
7. 上述组合同时开启

重点观察：

- derive 耗时
- JS heap 峰值
- major / minor GC 次数
- 单次 commit 的短命对象数量
- 长时间使用后的性能是否退化

### 四、长期稳定性标准

必须确认：

- 第 1 次 bulk 和第 200 次 bulk 的 group 性能不会持续恶化
- 不能出现“首轮快，越用越慢”的 overlay 累积问题

---

## 最后结论

`active/index` 的长期最优，并不是继续在每个文件里抠几个 `slice()` 或 `new Map()`。

真正该做的是：

1. 把一次 derive 的共享上下文前置成一个中轴
2. 把所有 eager clone 改成 lazy copy-on-write
3. 删除会长期增长的 overlay
4. 删除重复存储的大数组和冗余行索引
5. 让 bulk path 全部走 field 级 / stage 级 builder，而不是 record 级 patch clone

在这个前提下，才能同时满足四个目标：

- `document` 继续不可变
- 已发布 state 继续不可变
- 中间 clone 显著减少
- 大数据量 bulk 场景下 GC 压力显著下降

这才是 `active/index` 整条路径的长期最优。

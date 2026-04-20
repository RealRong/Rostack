# Table Filter 50k 性能分析

目标场景：`50k` 数据量、Table 视图、在 filter 中添加 `select is option1`。本分析只看非渲染阶段，不讨论 React/render 120ms。

## 结论

当前 80ms 左右的非渲染耗时，不是单个慢函数造成的，而是 4 段串联的增量链路都在做偏重的扫描和重复归一化：

1. `deriveIndex` 阶段里，`group` 索引和 `calculation` 索引都被同步，且 `group` 对同一类 bucket 归一化逻辑做了两遍。
2. `buildFilterBucketIndex` 和 `buildSectionGroupIndex` 在实现上基本平行，都会对记录全量遍历并调用 `resolveBucketKeys(...)`。
3. `syncSectionState` 在某些增量分支里，会为了拿 `record -> sections` 关系，临时从旧 `SectionState` 反建一张全量 map。
4. `syncSummaryState` 的增量方案粒度不够细，仍然是“按 section * 按 calc field * 按 changedIds”地反复做 membership 判断和 reducer map 调整。

如果只按收益排序，优先级应该是：

1. 合并或复用 filter/section 的 bucket membership 结果。
2. 给 section/snapshot 保留稳定的 `record -> sectionKeys` 反向索引，去掉运行时临时反建。
3. 把 summary 的更新单位从“section 内对每个 changed record 做 `resolver.has` 判断”改成“先把 changed record 直接投影到 section，再批量更新 reducer”。
4. 最后再处理 reducer 内部 `Map.get/set/delete` 的常数项。

## 你这次 profile 对应到哪里

### 1. `deriveIndex` 16ms

入口在 `dataview/packages/dataview-engine/src/active/index/runtime.ts:120`。

- `deriveIndex(...)` 会串行跑 `records`、`search`、`group`、`sort`、`calculations` 五段。
- 你的 case 里重点是 `bucketMs` 和 `summariesMs`，因为 filter 变更会让 query demand 命中共享 bucket 索引，同时 summary 又依赖 calculation 索引和 section membership。

### 2. `buildFilterBucketIndex` 8ms

位置：`dataview/packages/dataview-engine/src/active/index/group/runtime.ts:72`

- 这里对 `records.ids` 全量遍历。
- 每条记录都会调用一次 `resolveBucketKeys(field, values?.get(recordId), demand)`。
- 然后写两份结构：
  - `recordBuckets: Map<RecordId, BucketKey[]>`
  - `bucketRecords: Map<BucketKey, RecordId[]>`

### 3. `buildSectionGroupIndex` 8ms

位置：`dataview/packages/dataview-engine/src/active/index/group/runtime.ts:104`

- 结构和 `buildFilterBucketIndex` 几乎完全对称。
- 同样全量遍历 `records.ids`。
- 同样每条记录调用一次 `resolveBucketKeys(...)`。
- 同样写两份结构：
  - `recordSections`
  - `sectionRecords`

### 4. `resolveBucketKeys / resolveFastBucketKeys / toScalarBucketKey`

位置：

- `dataview/packages/dataview-engine/src/active/index/group/bucket.ts:121`
- `dataview/packages/dataview-engine/src/active/index/group/bucket.ts:185`
- `dataview/packages/dataview-engine/src/active/index/group/bucket.ts:58`

对于 `select/status`，最终是：

- `resolveFastBucketKeys(...)`
- `readSingleBucketKeys(toScalarBucketKey(value))`
- `toScalarBucketKey` 里走 `trimToUndefined(value)`

这条链本身不算算法级瓶颈，但在 50k 量级下被重复跑很多次，常数项会明显堆起来。

### 5. `collectVisibleDiff` 3ms

位置：`dataview/packages/dataview-engine/src/active/snapshot/query/runtime.ts:66`

- 这里会把 `previous.visible` 放进 `Set`，再扫一遍 `next.visible`。
- 对 50k 来说这是正常的 `O(n)` 差集成本，不是当前主矛盾。

### 6. `syncSectionState` 11ms

位置：

- `dataview/packages/dataview-engine/src/active/snapshot/sections/sync.ts:188`
- `dataview/packages/dataview-engine/src/active/shared/sections.ts:62`

热点不是 `applyOrderedIdDelta` 本身，而是 membership 解析方式：

- `syncSectionState(...)` 在 `sectionChange` 缺失时，会调用 `createSectionMembershipResolverFromState(previous, { recordIds: changedRecordIds })`
- `createSectionMembershipResolverFromState(...)` 当 `changedRecordIds.size > 32` 时，直接走 `shouldBuildFullMap = true`
- 然后 `ensureByRecord()` 会遍历所有 section，再遍历每个 section 的 `recordIds`，临时重建一张 `recordId -> sectionKeys` map

也就是说，虽然这是“增量同步”，但一旦变更记录数稍大，就会退化成基于旧 section state 的准全量反向投影。

### 7. `syncSummaryState` 20ms

位置：

- `dataview/packages/dataview-engine/src/active/snapshot/summary/sync.ts:168`
- `dataview/packages/dataview-engine/src/active/shared/calculation.ts:404`

你看到的 `const current = target.get(key) ?? 0` 在表面上是单行热点，但本质问题是调用次数太多：

- `collectTouchedSections(...)` 会对每个 `calcField` 的每个 `changedId` 调一次 `resolver.keysOf(recordId)`。
- 进入每个 touched section 后，又会对每个 calc field 建 reducer。
- 然后对：
  - `removedBySection`
  - `addedBySection`
  - `fieldChange.changedIds`
  分别做循环。
- 在 `reducer.apply(...)` 内，会对 `uniqueCounts`、`numericCounts`、`optionCounts` 做多次 `Map.get/set/delete`。

所以 `current = target.get(key) ?? 0` 热，是因为它处在一个多重循环的最内层，而不是这一行自身有什么特殊问题。

## 真正的问题在哪

### 问题 1：filter bucket 和 section bucket 做了两套几乎一样的全量索引

关键代码：

- `active/demand.ts:43-54`
- `active/index/group/runtime.ts:72-149`

视图 demand 里，grouped view 会同时请求：

- 一套 `capability: 'section'`
- 若 filter 用到 `select/status/multiSelect/boolean`，再请求一套 `capability: 'filter'`

这意味着：

- 同一个 field 可能在同一轮里建两份 group index。
- 即便 field 不同，两个 capability 的实现也几乎复制了一遍。
- 对 `select is option1` 这种 case，`resolveBucketKeys -> toScalarBucketKey -> trimToUndefined` 的路径会在两套索引里重复执行。

如果当前 view.group.field 恰好就是这个 filter field，那么这 16ms 基本就是明显的重复劳动。

### 问题 2：section 层没有稳定保留反向 membership，导致 sync 时临时反建

关键代码：

- `active/shared/sections.ts:68-127`
- `active/snapshot/sections/sync.ts:253-268`

现在 `SectionState` 只稳定保留了：

- `sectionKey -> recordIds`

但增量对比需要：

- `recordId -> sectionKeys`

于是实现里只能：

- 小变更时按 section 一个个 `includes(recordId)` 扫
- 变更数超过阈值时，临时把整张反向 map 重建出来

这就是你看到 `keysOf` / `shouldBuildFullMap` 明显耗时的根因。它不是“逻辑复杂”，而是数据结构不对位。

### 问题 3：summary 增量虽然叫 sync，但仍然保留了较大的扫描面

关键代码：

- `active/snapshot/summary/sync.ts:134-153`
- `active/snapshot/summary/sync.ts:235-307`

当前 summary sync 的更新顺序是：

1. 先从 impact 和 resolver 里算 touched sections。
2. 对每个 touched section。
3. 再对每个 calc field。
4. 再对 section 的 removed/added records。
5. 再扫一次 `fieldChange.changedIds`，并对每条记录调用 `resolver.has(recordId, sectionKey)`。

问题在于：

- membership 查询发生在 section 循环内部，导致同一条 record 可能被反复问“你属于这个 section 吗？”
- reducer 使用的是泛型 `Map<K, number>` builder，最内层更新开销偏高
- 这条链对 changed records 的“先投影后更新”做得不彻底

所以 20ms 里既有 membership 读取成本，也有 reducer 更新成本，而且两者是叠加的。

### 问题 4：calculation entry 和 option lookup 还有额外常数项

关键代码：

- `active/index/calculations.ts:170-205`
- `active/shared/calculation.ts:169-193`
- `dataview/packages/dataview-core/src/field/options/index.ts:60-73`

`createCalculationEntry(...)` 在 option 类字段上会走：

- `readOptionIds(...)`
- `normalizeOptionId(...)`
- `getFieldOption(field, value)`

`getFieldOption(...)` 目前是对 `field.options.find(...)` 线性扫描。

这不是你这次 profile 的主热点，但如果 summary/calc 字段里正好也有 select/status，它会继续放大最内层常数项。

## 为什么这次 `select is option1` 会放大这些问题

这个 case 的特点是：

1. filter 命中的是最容易被“group bucket index”优化的字段类型。
2. query visible 集会明显变化，后续 section/summary 都会被连锁触发。
3. section 和 summary 都依赖 membership，而 membership 当前没有稳定的反向索引。
4. summary 又在 section 的基础上做二次增量，最内层还是 `Map` 计数器更新。

所以你看到的是一条完整的连锁路径：

- filter 改动
- group/filter bucket 索引同步
- query visible diff
- section membership sync
- summary reducer sync

每一段都不算离谱，但连起来就正好组成了你测到的 80ms。

## 解决方案

下面按优先级给方案。前两项值得先做，收益最大。

### 方案 A：统一 filter/section 的 bucket membership 索引

目标：避免同一 field 上，`filter` 和 `section` 各做一遍 `resolveBucketKeys(...) + record->keys + key->records`。

建议做法：

1. 抽一个 capability 无关的基础结构，例如 `BucketMembershipIndex`：
   - `recordKeys: Map<RecordId, BucketKey[]>`
   - `keyRecords: Map<BucketKey, RecordId[]>`
2. `FilterBucketIndex` 直接包装这个基础结构。
3. `SectionGroupIndex` 在复用该结构的基础上，额外附带：
   - `buckets`
   - `order`
4. `buildFilterBucketIndex` 和 `buildSectionGroupIndex` 改成共用同一条 membership build/sync 逻辑。

预期收益：

- 你现在测到的 `8ms + 8ms`，至少能明显压掉一半重复计算。
- 如果 filter field 和 group field 相同，收益会非常直接。

实现注意点：

- `section` 特有的 bucket metadata 排序保留在上层，不要再把 membership 和展示状态耦死在一起。
- `sameBucketSet(...)` 目前对 filter 用 `includes`，`sameBucketKeys(...)` 对 section 用按序比较，建议统一约束 `resolveBucketKeys(...)` 的输出顺序，减少双套判断。

### 方案 B：在 section state 或 section runtime 里常驻 `record -> sectionKeys`

目标：彻底去掉 `createSectionMembershipResolverFromState(...).ensureByRecord()` 这种运行时反建。

建议做法：

1. 给 `SectionState` 增加内部态，例如：
   - `recordSections?: ReadonlyMap<RecordId, readonly SectionKey[]>`
2. `buildSectionState(...)` 和 `syncSectionState(...)` 在产出 `byKey` 的同时维护这张表。
3. `createSectionMembershipResolverFromState(...)` 直接读这张表，不再：
   - 遍历所有 section 重建
   - 或按 section 做 `recordIds.includes(recordId)`

预期收益：

- `syncSectionState` 这一段的 11ms 会明显下降。
- `syncSummaryState.collectTouchedSections(...)` 也能顺便受益，因为它同样依赖 resolver。

实现注意点：

- 这张 map 可以只作为 internal state，不需要暴露到 public publish 层。
- 如果担心内存，可以只在 grouped view 启用。

### 方案 C：把 summary sync 改成“按 changed record 先投影 section，再批量更新”

目标：减少 `section * field * changedIds` 这种三层扫描。

建议做法：

1. 在进入 `syncSummaryState(...)` 前，先为所有 changed records 预计算：
   - `prevSectionKeysByRecord`
   - `nextSectionKeysByRecord`
2. 再按 `sectionKey -> fieldId -> entry delta list` 组织增量。
3. `syncSummaryState(...)` 里不再对每个 section 反复调用：
   - `resolver.keysOf(recordId)`
   - `resolver.has(recordId, sectionKey)`
4. reducer 更新时直接消费已经分桶好的 delta。

预期收益：

- `collectTouchedSections(...)` 的 membership 查询会减少。
- `fieldChange.changedIds.forEach(recordId => resolver.has(...))` 这类最差路径会被消掉。
- 20ms 的 summary sync 有望明显下降。

实现注意点：

- 最理想的输入不是 `resolver`，而是直接把 section membership delta 从 section stage 传下来。
- 如果不想改太大，至少先把 `fieldChange.changedIds` 按 section 预投影一次，而不是在 section 循环里逐条 `has(...)`。

### 方案 D：降低 reducer 最内层 Map 更新的常数项

目标：处理 `current = target.get(key) ?? 0` 这类高频计数更新。

建议做法：

1. 对 `optionCounts` 这类 key 空间较小、稳定的计数，优先改成：
   - `optionId -> slot` 的数组计数
   - 或 field 级别缓存的 ordinal map
2. 对 `uniqueCounts` 这种必须是 map 的场景，至少避免每次 `adjust()` 首次修改就 `new Map(previous)` 全量复制。
3. `createCounterMapBuilder(...)` 可以改成和 `createMapPatchBuilder(...)` 类似的 overlay/delta 结构，而不是一上来拷整张计数表。

预期收益：

- 能减少 reducer 内层热点。
- 但这项收益建立在前面 A/B/C 做完之后才最明显。

原因：

- 目前主要问题是调用次数太多，不先收窄扫描面，只优化这一行通常性价比一般。

### 方案 E：给 option 类字段加 field-local cache

目标：减少 `trimToUndefined`、`getFieldOption(...find...)` 的重复归一化和线性查找。

建议做法：

1. 对 `select/status` 字段预构建：
   - `normalized optionId -> canonical optionId`
   - 必要时 `normalized optionName -> canonical optionId`
2. `resolveBucketKeys(...)` 和 `createCalculationEntry(...)` 共用这套 field-local normalize cache。
3. 对 `readSingleBucketKeys(...)` 继续保留单元素数组缓存。

预期收益：

- 能优化常数项。
- 适合在 A 做完后继续打磨。

## 推荐落地顺序

### 第一阶段：先做高收益结构调整

1. 合并 filter/section 的 bucket membership build/sync。
2. section state 常驻 `record -> sectionKeys`。

这两项做完，通常就能把你这次看到的 16ms group + 11ms section 明显压下去，而且还会给 summary 让路。

### 第二阶段：改 summary 增量模型

1. changed record 先投影 section。
2. reducer 按 section/field 批量消费 delta。

这一步是处理 20ms summary sync 的关键。

### 第三阶段：清理常数项

1. reducer counter builder 优化。
2. option normalize / option lookup cache。
3. 视情况再看 `collectVisibleDiff` 是否要改成 ordinal bitset，但这不是当前优先级。

## 我对当前瓶颈的判断

如果只回答“问题在哪”，我的判断是：

1. 第一瓶颈是 group membership 的重复构建。
2. 第二瓶颈是 section/summary 缺少稳定反向 membership 索引，导致 sync 里不断临时投影。
3. 第三瓶颈才是 reducer 内层 `Map` 更新过多。

所以不要先从 `target.get(key) ?? 0` 这一行下手。它会热，是因为上游把太多 work 推进了它。

## 建议的验证方式

改造后建议分别打这几类 profile：

1. 只开 filter，不开 group，不开 calc。
2. 开 filter + group，不开 calc。
3. 开 filter + calc，不开 group。
4. 开 filter + group + calc。
5. 分别测试 filter field 与 group field 相同/不同。

这样能确认：

- A 方案主要吃掉的是 `bucketMs`
- B/C 方案主要吃掉的是 `sections/summaries`
- D/E 方案才是最后一层常数优化

## 一句话总结

这次 50k filter 慢的核心，不是 query diff，也不是渲染前单个热函数，而是同一份 section/filter membership 和 summary membership 被多次、跨阶段、用不合适的数据结构重复计算了。

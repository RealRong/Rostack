# DATAVIEW Search Index Long-Term Optimal Architecture

## 1. 文档目标

这份文档定义 dataview `active/index/search` 的长期最优重构方案。

目标不是局部修补，也不是兼容旧结构，而是直接把当前 search index 的错误中轴替换掉。

约束如下：

- 不考虑兼容成本
- 不保留旧实现兜底
- 优先简单、单一路径、可复用、低概念数
- 允许一次性重构 `index demand -> search index -> query consume` 整条链
- 允许删除现有 `all index`、旧 helper、旧 carrier、旧分支逻辑

本文重点解决的问题是：

- 新增空字段仍触发 search 全量重建
- `buildAllIndex -> readCombinedSearchText -> collectSearchGrams` 在大数据量下极重
- search 现在存在两条路线：`all` 与 `fields`
- schema 变化与 value 变化没有被正确区分
- query 侧对 source 的消费依赖 index 的物化形态，而不是稳定的中轴数据

## 2. 当前实现的问题

### 2.1 当前结构

当前 search index 合同是：

```ts
interface SearchIndex {
  all?: SearchTextIndex
  fields: ReadonlyMap<FieldId, SearchTextIndex>
  rev: number
}

interface SearchTextIndex {
  texts: ReadonlyMap<RecordId, string>
  bigrams: ReadonlyMap<string, readonly RecordId[]>
  trigrams: ReadonlyMap<string, readonly RecordId[]>
}
```

这里的根问题不是某个函数慢，而是结构本身有问题：

- `fields` 是按字段的索引
- `all` 是把默认搜索字段再次合并之后的第二份索引

这意味着 search 系统从设计上就有两条并行路线：

- `field route`
- `combined all route`

这两条路线会重复做：

- 读 record value
- 构造 search text
- 切 gram
- 维护 postings

### 2.2 为什么新增空字段也会卡

当前 `syncSearchIndex(...)` 的关键逻辑是：

- 只要 `previous.all` 已存在
- 且 `context.schemaFields.size > 0`
- 就直接 `buildAllIndex(context, records)`

这条逻辑的问题是：

- 它不关心新增字段是否属于默认搜索字段
- 它不关心新增字段是否对任何 record 产生非空 search text
- 它不关心已有 record 的最终 combined search text 是否完全没变

因此，哪怕新字段一行数据都没有，只要 hit 到 schema change，就会：

1. 对全部 record 重新跑 `readCombinedSearchText`
2. 对全部 combined text 重新跑 `collectSearchGrams`
3. 重建整份 `all` index

这就是“空字段导致 50k 全量 search rebuild”的根因。

### 2.3 当前设计为什么长期不可修

当前 `all` index 的存在，决定了它无法真正优雅地增量化。

因为 `all` 不是“字段索引的引用视图”，而是“重新合并后的物化副本”。

一旦 schema 变化，系统只能在两种坏选择里选一种：

1. 保守重建整份 `all`
2. 为 `all` 再做一套复杂的 field-aware 增量合并逻辑

第二种理论上可做，但长期并不优：

- 概念更多
- 维护两套 carrier
- 逻辑分裂
- 仍然保留重复数据
- 仍然会产生不必要的 GC 和字符串/数组分配

所以长期最优不是“把 `all` 的 rebuild 条件修聪明”，而是删掉 `all` 这条物化路线。

## 3. 长期最优原则

### 3.1 单一真相

search 只能有一份权威索引：

- 按字段维护
- 按 record 增量更新
- query scope 在消费阶段组合

也就是：

- `field index` 是真相
- `all/default/explicit field set` 都只是 scope

### 3.2 不再物化 combined all index

“默认搜索字段的合集”不应该落成第二份索引。

它应该是 query 时由多个 field source 组合出来的 scope，而不是一个需要单独 build/sync/rebuild 的 carrier。

### 3.3 schema change 不等于 value change

新增字段、删字段、改字段 schema，与 record 的 search text 真正变化，必须严格区分。

正确语义应该是：

- 只有某个 field 对某些 record 的 search text 变了，才更新这个 field 的 postings
- 只有 query scope 包含了这个 field，query 结果才需要失效
- 只有该字段真的为某些 record 产出非空 text，新增字段才会让 search 结果发生变化

### 3.4 default search scope 必须是“已解析的 field 列表”

`search: { all: true }` 这种 demand 在 index 层不是好中轴。

index 层不能理解“all”这种配置语义，它只应该理解：

- 当前 scope 到底包含哪些 `FieldId`

也就是说：

- view 配置可以仍然表达“默认搜索字段”
- 但进入 index/query 之前必须解析成 concrete field list

### 3.5 尽量复用已有 query 多 source 路径

当前 query derive 已经支持：

- `sources: readonly SearchTextIndex[]`

这意味着 query 层本来就具备“多 field source 合并”的消费能力。

长期最优应该利用这个能力，删除 `all`，而不是继续把 query 绑死在 `all` 的物化结果上。

## 4. 最终目标结构

## 4.1 最终 SearchDemand

最终不再保留 `all?: boolean`。

最终结构：

```ts
interface SearchDemand {
  fieldIds: readonly FieldId[]
}
```

说明：

- 这里的 `fieldIds` 必须是已经解析后的 concrete field list
- 如果 view 配置的是“默认搜索字段”，那么在 demand normalization 阶段就展开成具体字段列表
- title 也作为标准 `FieldId` 参与，继续使用 `'title'`

这会直接消除一条重要分裂：

- 旧：配置语义和执行语义混在一起
- 新：进入 index 之后只剩执行语义

## 4.2 最终 SearchIndex

最终 search index 只保留字段维度：

```ts
interface SearchIndex {
  fields: ReadonlyMap<FieldId, SearchFieldIndex>
}

interface SearchFieldIndex {
  fieldId: FieldId
  texts: ReadonlyMap<RecordId, string>
  grams2: ReadonlyMap<string, readonly RecordId[]>
  grams3: ReadonlyMap<string, readonly RecordId[]>
  rev: number
}
```

说明：

- 删除 `all?: SearchTextIndex`
- `SearchTextIndex` 可以直接重命名为 `SearchFieldIndex`
- `bigrams/trigrams` 命名也建议收敛成 `grams2/grams3`
- `SearchIndex.rev` 不是必需中轴，能删就删
- revision 应该尽量下沉到 field 级别，而不是一个全局 rev

推荐最终保留：

```ts
interface SearchIndex {
  fields: ReadonlyMap<FieldId, SearchFieldIndex>
}
```

不再维护额外全局 revision。

如果 query cache 需要 scope revision，则在 query 层基于 field revisions 临时组合，不在 index 层保存第二份 carrier。

## 4.3 最终 SearchScope

`all/default/explicit` 都统一为 query 侧 scope：

```ts
interface SearchScope {
  key: string
  fieldIds: readonly FieldId[]
  sources: readonly SearchFieldIndex[]
  revisionKey: string
}
```

说明：

- `key` 用于区分字段集合
- `revisionKey` 用于 query prefix narrowing cache
- 这是 query 运行期对象，不进入 index state
- 这是 projection，不是长期存储 carrier

## 5. 最终执行路径

## 5.1 Demand 解析阶段

当前 `normalizeIndexDemand(...)` 里 search 还是：

```ts
search: {
  all: boolean
  fields: readonly FieldId[]
}
```

长期最优改为：

```ts
search: {
  fieldIds: readonly FieldId[]
}
```

解析规则：

1. 如果 view 明确指定 `view.search.fields`
   - 直接规范化、去重、排序
2. 如果 view 未指定字段
   - 根据当前 document schema 展开默认搜索字段
   - 生成 concrete `fieldIds`

这样做之后：

- index 层不再处理 `all`
- query 层不再处理 `all`
- search scope 的字段集合永远是显式的

## 5.2 RecordIndex 阶段

`RecordIndex` 继续提供：

- `records.ids`
- `records.order`
- `records.values.get(fieldId)`

但 search 侧必须最大化利用它，而不是重新读 document。

尤其是新增字段场景：

- 如果 `RecordIndex.values.get(fieldId)` 是空列
- search 建索引时必须立刻返回空 `SearchFieldIndex`
- 不能再扫描 `records.ids` 去做 50k 次 `readFieldSearchText`

也就是说，search build 必须尊重 record index 已经给出的空列事实。

## 5.3 SearchIndex build / ensure / sync

最终 search index 的职责非常单一：

- 对 demand 里的每个 `fieldId`，维护一个 `SearchFieldIndex`

行为规则如下。

### build

首次 build：

- 只 build demand 中需要的字段
- 每个字段独立 build
- 不再存在 `buildAllIndex`

### ensure

ensure 只做两件事：

1. 缺哪个 field index，就补哪个
2. demand 不再需要的 field index，就删掉

ensure 不允许做：

- `all index` 物化
- combined text 拼接
- 默认字段合集 rebuild

### sync

sync 只允许按字段增量：

1. field 被删
   - drop 该 field index
2. field schema 改变，且该字段的 tokenizer/search projector 语义可能改变
   - rebuild 该 field index
3. 某些 record 在该字段上的值变了
   - patch 该 field index
4. record set 变了
   - 只对受影响字段 patch 或 rebuild

禁止逻辑：

- `schemaFields.size > 0 => rebuild all search`
- `touchedRecords === 'all' => rebuild combined all source`

## 5.4 Query consume 阶段

query 不再读取：

- `index.all`

而是读取：

1. 当前 search scope 的 `fieldIds`
2. 从 `index.fields` 里取出对应 source
3. 对 source 列表做 candidate merge

最终 query 路径：

```ts
resolveSearchScope(view, normalizedDemand, index)
  -> resolveSourceCandidatesPerField(...)
  -> unionFieldCandidatesInRecordOrder(...)
  -> exactFilterAcrossSources(...)
```

### field candidate 规则

对单个 field source：

1. 按 query 长度选择 `grams2` 或 `grams3`
2. 对 query grams 做交集
3. 得到该字段的候选 record ids

### scope candidate 规则

对整个 scope：

1. 对每个字段先独立求 candidate
2. 对字段 candidate 做并集
3. 再做 exact filter

这样做的语义与现在一致：

- record 只要任一字段命中就算命中

但不再需要 combined `all` source。

## 6. 为什么这是长期最优

## 6.1 彻底消除重复数据

旧结构里，默认搜索字段同时存在于：

- `fields[fieldId]`
- `all`

最终结构里：

- 每个字段只存一次
- default scope 不再落第二份物化副本

这会直接减少：

- strings
- grams arrays
- postings maps
- rebuild 时的大量临时对象
- GC 压力

## 6.2 空字段新增可以天然 no-op

在新结构里，新增一个空字段的行为应该是：

1. demand fieldIds 发生变化
2. search ensure 发现多了一个 field
3. 读取该 field 的 `RecordValueIndex`
4. 发现它是空列
5. 直接创建空 `SearchFieldIndex`
6. query scope 多了一个空 source
7. 搜索结果不变

整个过程不再需要：

- 拼 combined text
- 切 combined grams
- rebuild 旧字段 postings

这才是这个问题真正需要的语义。

## 6.3 query 失效粒度更准确

当前 query cache 受全局 `search.rev` 影响太大。

新结构里可以把失效粒度收窄为当前 scope：

- 只要 scope 内字段的 revision 没变，query narrowing cache 就能继续复用
- scope 外字段变化，不该让当前 query 失效

这会让 search 输入过程更稳定。

## 6.4 复杂度更低

看起来“多 source query”像是把复杂度搬到了 query，但从全局看反而更简单：

- 删除一整条 `all index` build/sync/rebuild 路线
- 删除 `readCombinedSearchText`
- 删除 `buildAllIndex`
- 删除 `all` 分支逻辑
- 删除 schema change 触发 all rebuild 的特殊规则

结果是：

- index 只做 field truth
- query 只做 scope projection

职责更清晰，中轴更干净。

## 7. 需要一起做的底层优化

这部分不是另起架构，而是在最终结构下应该一并完成的优化。

## 7.1 gram cache

`collectSearchGrams(text, size)` 不应该对同一段 text 一遍遍重复切。

应增加共享缓存：

```ts
interface SearchGramCache {
  grams2ByText: Map<string, readonly string[]>
  grams3ByText: Map<string, readonly string[]>
}
```

用途：

- build field index 时复用
- patch field index 时复用
- query query-text grams 也可复用单独的小缓存

这个缓存应作为 search 模块内部设施，不需要暴露给外部。

## 7.2 field search projector

每个 field 的 search text 生成规则，本质是：

- 读 value
- token 化
- 归一化
- join

这条线应收敛为单一 projector。

建议明确：

```ts
type SearchTextProjector = (
  field: Field | undefined,
  value: unknown
) => string | undefined
```

index 只调用 projector，不自己拼业务逻辑。

## 7.3 空列快速路径

如果某 field 的 `RecordValueIndex` 已知为空：

- `buildFieldIndex` 直接返回空 index
- `syncFieldIndex` 对空字段的 touchedRecords patch 应快速 no-op

这条快速路径必须是 search build/sync 的一等路径，不是额外优化分支。

## 7.4 postings patch 只处理真实变化 record

当前 patch 路径已经具备基础雏形，但长期最优要求更严格：

- 只对 text 真变化的 record 进入 gram delta
- 只对 touched gram key 更新 posting
- 不要把 `heightById` 式全量 map 替换思想带进 search

search index 只能做真正的局部 patch。

## 8. 需要删除的旧实现

以下内容应整体删除，不保留兼容。

### 8.1 删除 SearchIndex.all

删除：

- `SearchIndex.all`
- 所有读写 `all` 的逻辑
- 所有 `hasLoadedAll` 分支

### 8.2 删除 buildAllIndex

删除：

- `buildAllIndex(...)`
- `readCombinedSearchText(...)`
- 任何基于 combined search text 的 rebuild 路径

### 8.3 删除 demand 中的 all 语义

删除：

- `SearchDemand.all?: boolean`
- `NormalizedIndexDemand.search.all`
- `sameSearchDemand` 对 `all` 的比较逻辑

### 8.4 删除 query 对 index.all 的依赖

删除：

- `resolveSearchSources(...)` 中的 `all` 分支

改为：

- 基于 resolved field list 返回多个 field source

### 8.5 删除 schemaFields -> rebuild all 的规则

删除这类逻辑：

- `schemaFields.size > 0 => rebuild all`

schema 变化只应该影响：

- 该字段是否存在
- 该字段是否在当前 scope 内
- 该字段的 tokenizer/projector 语义是否变了

## 9. 最终 API 设计

## 9.1 active/index/contracts.ts

建议最终形态：

```ts
export interface SearchDemand {
  fieldIds: readonly FieldId[]
}

export interface SearchFieldIndex {
  fieldId: FieldId
  texts: ReadonlyMap<RecordId, string>
  grams2: ReadonlyMap<string, readonly RecordId[]>
  grams3: ReadonlyMap<string, readonly RecordId[]>
  rev: number
}

export interface SearchIndex {
  fields: ReadonlyMap<FieldId, SearchFieldIndex>
}
```

## 9.2 active/index/search.ts

建议最终只保留这类 API：

```ts
buildSearchIndex(context, records, demand): SearchIndex
ensureSearchIndex(previous, context, records, demand): SearchIndex
syncSearchIndex(previous, context, records, demand): SearchIndex

buildSearchFieldIndex(context, records, fieldId): SearchFieldIndex
syncSearchFieldIndex(previous, context, records, fieldId): SearchFieldIndex
```

说明：

- search 模块的核心单位必须是 field
- 顶层 API 只是字段级 API 的组织器
- 不允许再出现 combined all API

## 9.3 active/snapshot/query/derive.ts

建议新增统一 scope resolver：

```ts
resolveSearchScope(input): SearchScope
resolveSearchCandidates(input): readonly RecordId[]
```

其中：

- `resolveSearchScope` 负责把 view 配置映射到 concrete field sources
- `resolveSearchCandidates` 负责 gram candidate + exact filter

query 不直接理解 index 的物化策略，只消费 field sources。

## 10. 实施方案

## 10.1 第一步：改 demand 中轴

先改 `SearchDemand` 与 `NormalizedIndexDemand.search`：

- 删掉 `all`
- 统一成 concrete `fieldIds`

同步修改：

- `resolveViewDemand(...)`
- `normalizeIndexDemand(...)`
- `sameSearchDemand(...)`

这是最重要的一步，因为它决定后续 index/query 是否还能继续走双路线。

## 10.2 第二步：改 SearchIndex 合同

删除 `SearchIndex.all`，把 search index 中轴收敛到：

- `fields: Map<FieldId, SearchFieldIndex>`

同步删除：

- `buildAllIndex`
- `readCombinedSearchText`
- `all` 相关 trace 统计

## 10.3 第三步：改 sync 路径

把 `syncSearchIndex(...)` 改成纯字段增量：

- field add
- field drop
- field rebuild
- field patch

做到这一层后，新增空字段的 50k 全量 rebuild 就会自然消失。

## 10.4 第四步：改 query consume

把 query source 解析改成：

- 根据 concrete `fieldIds` 拉 source 列表
- 对 source 列表求并集 candidate

删掉所有 `index.all` 假设。

## 10.5 第五步：补齐低层优化

最后补：

- gram cache
- 空列快速路径
- scope revision 缩小 query invalidation

这些优化是在新中轴上自然成立的，而不是旧结构上的额外补丁。

## 11. 最终结果

完成后，search 这条线会变成：

- `RecordIndex` 提供字段值投影
- `SearchIndex` 只维护字段索引
- `Query` 基于字段 source 组合 scope

整条线只剩一条真路径：

- field index truth
- scope projection consume

不再有：

- `all index`
- combined rebuild
- schema change 全量 search rebuild
- 空字段触发全量 grams 重算

这才是 search index 的长期最优结构。

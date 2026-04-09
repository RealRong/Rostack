# Dataview Changes / Projection / Indexes 长期最优方案

## 1. 文档目的

本文讨论 Dataview 在长期最优前提下，如何从零重新设计下面三件事：

- commit `changes`
- projection runtime 如何消费 `changes`
- indexes 索引体系如何为 projection 提供长期性能基础

这里明确不考虑：

- 兼容层
- 渐进迁移成本
- 现有文件结构和现有 API 的保留价值
- “先做一版能跑，再慢慢修”的过渡策略

本文只讨论长期终态。


## 2. 当前问题

### 2.1 当前 `changes` 过粗

现在的 `CommitChangeSet` 只有：

- `changedSlices`
- `records / fields / views` 的 added / updated / removed
- `values.recordIds / values.fieldIds`

这个粒度足够告诉系统“哪些大类东西变了”，但不够回答：

- active view 这次到底改了 `search`、`filter`、`sort`、`group` 还是 `display`
- 某次 value 变化是否真的影响当前 active view 的 filter / group / calculation
- 某次 field schema 变化是否需要重建 search index、group index、calc aggregate

因此它适合做 summary，不适合做 projection runtime 的长期核心输入。


### 2.2 当前 projection runtime 还是“整体重算”

当前 `engine.project.runtime` 每次 document 改动，都会重新：

- resolve record state
- resolve search / filter / sort / group
- rebuild sections / appearances / fields / calculations

之后再靠 equality 挡掉无意义的 notify。

这个模型的优点是简单、边界清楚。

缺点也很明确：

- CPU 成本随 active pipeline 一起增长
- equality 成为“重算后的止损”，不是“重算前的调度依据”
- system 明明拿到了 `changes`，却没有把它变成 runtime 的调度输入


### 2.3 当前没有真正长期可用的 index 层

现在 raw document 已经有最基础的归一化结构：

- `byId`
- `order`

但对于 projection 热路径真正昂贵的部分，没有一个统一 index runtime：

- search 没有长期 inverted index
- group 没有长期 bucket index
- calculation 没有长期 aggregate index
- sort 也没有统一 key materialization 层

这意味着 projection runtime 只能在每次重建时临时扫描 active records。


## 3. 长期最优目标

长期最优里，Dataview 不应再把：

- `changes`
- projection
- indexes

看成三套独立系统。

长期正确结构应该是：

```txt
write operations
  -> semantic changes
  -> raw state update
  -> raw indexes update
  -> active projection scheduler
  -> active projection rebuild / reuse
  -> publish stable stores
```

也就是说：

- `changes` 不只是 commit 输出摘要
- `changes` 是 projection runtime 的正式输入协议
- indexes 不只是性能附加物
- indexes 是 projection runtime 的正式依赖层


## 4. 顶层原则

### 4.1 只有一个 active projection pipeline

长期仍然坚持：

- 全局同一时刻只有一个 active view
- 只有 active view 值得拥有完整 projection

因此：

- 不做 per-view projection cache
- 不做 keyed projection family
- 不做多 view projection invalidation


### 4.2 `changes` 要更细，但 runtime 仍然只有一个入口

长期不应该走向：

- `search.applyChange(change)`
- `filter.applyChange(change)`
- `records.applyChange(change)`
- `sections.applyChange(change)`

这里要精确区分两种东西：

- stage-local reconcile
- distributed patch network

长期不允许的是第二种。

也就是说，不允许：

- 每个 projection 独立订阅 `changes`
- 每个 projection 自己决定何时发布
- 每个 projection 自己驱动下游 projection 更新
- 整体靠 projection 之间互相传播 patch 来收敛

但长期允许第一种：

- runtime 仍然是唯一入口
- planner 仍然统一决定执行顺序
- 每个 stage 在 runtime 调用下，可以自己选择 `reuse / recompute / reconcile / rebuild`

长期正确方向是：

- `runtime.sync(document, changes, indexes)`

然后由 runtime 内部统一决定：

- 哪些 stage 要执行
- 每个 stage 用什么动作执行
- 哪些 index 需要更新


### 4.3 indexes 是 projection runtime 的下层，不是旁路优化

search / group / calculation 的 index 不应作为“额外优化插件”存在。

它们应该是 projection runtime 的正式依赖能力。

也就是说：

- projection builder 不直接全量扫 document
- projection builder 优先读 index runtime
- raw document 只作为 index build / fallback 的基础输入


### 4.4 公开 API 保持简单，内部调度允许复杂

公开层依然只保留：

- `engine.read.*`
- `engine.project.*`
- `engine.view.open(viewId)`

但内部允许新增：

- richer change model
- index runtime
- projection scheduler
- stage-level rebuild graph


## 5. 长期最优里的 `changes` 应该长什么样

## 5.1 变化协议必须从“实体级 summary”升级到“语义级 delta”

长期不建议继续把 commit 输出定义成：

- records changed
- fields changed
- views changed

这种 entity summary 只能做粗筛。

长期最优里，`changes` 应该同时包含三层信息：

1. operation-level semantic delta
2. entity-level touched ids
3. projection-level impact hints


## 5.2 推荐的 change 模型

建议把 change 拆成三个部分：

```ts
interface CommitDelta {
  summary: ChangeSummary
  entities: ChangedEntities
  semantics: SemanticDelta[]
}
```

其中：

```ts
interface ChangeSummary {
  touchesRecords: boolean
  touchesFields: boolean
  touchesViews: boolean
  touchesValues: boolean
  activeViewMayChange: boolean
  indexesMayChange: boolean
}
```

```ts
interface ChangedEntities {
  records?: {
    added?: readonly RecordId[]
    updated?: readonly RecordId[]
    removed?: readonly RecordId[]
  }
  fields?: {
    added?: readonly FieldId[]
    updated?: readonly FieldId[]
    removed?: readonly FieldId[]
  }
  views?: {
    added?: readonly ViewId[]
    updated?: readonly ViewId[]
    removed?: readonly ViewId[]
  }
  values?: {
    recordIds?: readonly RecordId[] | 'all'
    fieldIds?: readonly FieldId[] | 'all'
  }
}
```

真正关键的是 `semantics`：

```ts
type SemanticDelta =
  | { kind: 'activeView.changed'; before?: ViewId; after?: ViewId }
  | { kind: 'view.query.changed'; viewId: ViewId; aspects: readonly QueryAspect[] }
  | { kind: 'view.layout.changed'; viewId: ViewId; aspects: readonly LayoutAspect[] }
  | { kind: 'view.calc.changed'; viewId: ViewId; fieldIds?: readonly FieldId[] | 'all' }
  | { kind: 'field.schema.changed'; fieldId: FieldId; aspects: readonly FieldSchemaAspect[] }
  | { kind: 'record.added'; recordIds: readonly RecordId[] }
  | { kind: 'record.removed'; recordIds: readonly RecordId[] }
  | { kind: 'record.values.changed'; recordIds: readonly RecordId[] | 'all'; fieldIds: readonly FieldId[] | 'all' }
```

这样 runtime 才能真正知道：

- 这次是不是 active view 切换
- 改的是 active view query，还是 layout，还是 calc config
- value change 打到了哪些 field
- field schema change 是否影响 search/group/calc semantics


## 5.3 `changes` 不只在 commit 末尾生成，而应在 command / operation 解析阶段就具备语义

长期最优里，semantic delta 最好不是靠 apply 完 document 后再“猜出来”。

更合理的做法是：

- command resolver 先产出 normalized write intent
- operation builder 在生成 operation 时，同时生成 semantic delta entries
- reducer/apply 阶段只负责补足最终 changed ids

也就是说：

```txt
command
  -> normalized intent
  -> operations
  -> semantic delta draft
  -> apply
  -> finalize changed ids
  -> CommitDelta
```

这样可以避免 commit 后再从新旧 document 逆推复杂语义。


## 6. 长期最优里的 index 体系

## 6.1 顶层结构

长期最优里应该有独立的 raw index runtime：

```txt
engine/
  index/
    runtime.ts
    records.ts
    search.ts
    group.ts
    sort.ts
    calculations.ts
```

这些 index 只服务于当前 document，不带 view-specific projection state。

也就是说：

- index runtime 绑定 document
- projection runtime 绑定 active view


## 6.2 record base index

所有上层 index 都应建立在 record base index 上。

建议至少包含：

- `recordIds`
- `rowsById`
- per-field value access table
- title/value normalized access
- record revision or version stamp

作用：

- 给 search/group/sort/calc index 提供统一原始访问层
- 避免每个 index 再各自读 document 归一化结构


## 6.3 search index

长期最优里，search 应该有正式 inverted index。

建议结构：

```ts
interface SearchIndex {
  tokenToRecordIds: ReadonlyMap<string, SortedIdSet<RecordId>>
  fieldTokenToRecordIds: ReadonlyMap<FieldId, ReadonlyMap<string, SortedIdSet<RecordId>>>
  recordTokens: ReadonlyMap<RecordId, RecordTokenSnapshot>
}
```

能力：

- 支持 title 与 field value 的 token 化索引
- 支持全字段搜索
- 支持限定字段搜索
- 支持 record 增删改时局部更新 token postings

这里不要求一开始就做到全文检索级别复杂度。

长期最优里的关键是：

- inverted index 是正式结构
- record value 改动时只增量更新受影响 record 的 postings
- active view search projection 直接消费 search index，而不是重新扫描 rows


## 6.4 group index

长期最优里，group 不应每次对 visible rows 重新 materialize bucket。

建议结构：

```ts
interface GroupIndex {
  byField: ReadonlyMap<FieldId, GroupFieldIndex>
}

interface GroupFieldIndex {
  bucketByRecordId: ReadonlyMap<RecordId, BucketKey[]>
  recordIdsByBucket: ReadonlyMap<BucketKey, SortedIdSet<RecordId>>
}
```

其中：

- 单值字段，一个 record 对应一个 bucket
- 多值字段，一个 record 可对应多个 bucket
- 日期/数值字段的 interval bucket 可按 field default + active query config 进一步 materialize

长期最佳做法不是为每个 view 存 group 结果，而是：

- 为 field 建原始 bucket index
- active view group builder 再基于 query / interval / showEmpty / collapsed 生成最终 sections


## 6.5 sort key index

长期最优里，sort 也应有统一 key materialization 层。

建议结构：

```ts
interface SortIndex {
  fieldKeys: ReadonlyMap<FieldId, ReadonlyMap<RecordId, SortKey>>
}
```

这样 active view 的 record ordering 不必每次都临时读取原值再比较。

长期运行中，value change 只需要更新：

- 受影响 field 的该 record sort key

然后 projection runtime 在 active view sort rules 下重新执行排序时，直接读 precomputed keys。


## 6.6 calculation index

calculation 是最适合正式索引化的一层。

长期不应该每次都重新遍历 section rows 再调用 `computeCalculationsForFields(...)`。

建议把 calculation index 设计成可组合 aggregate：

```ts
interface CalculationIndex {
  byField: ReadonlyMap<FieldId, FieldAggregateIndex>
}

interface FieldAggregateIndex {
  global: AggregateState
  byBucket?: ReadonlyMap<BucketKey, AggregateState>
}
```

其中 `AggregateState` 不是 UI 结果，而是中间聚合状态，例如：

- count
- nonEmptyCount
- sum
- min
- max
- option distribution
- status distribution

这样 projection runtime 在计算：

- 整体表格 footer
- group section footer

时，不需要重新扫描 rows，只需要：

- 从 visible record set 映射到 aggregate selection
- 或从 group bucket aggregate 直接读取

如果 active view filter 很复杂，也可以允许：

- base aggregate index + active filter bitset 组合求值


## 6.7 index 的更新模型

长期最优里，index runtime 必须吃 `CommitDelta`，并支持局部更新。

建议规则：

- `record.added` -> 增量写入 search/group/sort/calc indexes
- `record.removed` -> 增量删除对应 record entries
- `record.values.changed` -> 只更新命中的 recordId + fieldId
- `field.schema.changed` -> 只重建该 field 对应 index，必要时连带 dependent indexes
- `view.*.changed` -> raw indexes 通常不动，交给 projection runtime 消费


## 7. projection runtime 如何吃 `changes`

## 7.1 projection runtime 允许 stage-local reconcile，但不允许分布式 patch 网络

长期明确不做的是下面这种结构：

- `records` 自己订阅 `changes`
- `sections` 自己订阅 `changes`
- `calculations` 自己订阅 `changes`
- 各 stage 自己 patch 自己，再把结果推给下游

这会把系统变成分布式 patch 网络，带来：

- 隐式依赖
- 更新顺序复杂
- 中间态一致性难保证
- 正确性与测试成本急剧上升

长期正确结构是：

- runtime 维护唯一 stage graph
- runtime 根据 `CommitDelta` 统一决定执行顺序
- runtime 统一控制 publish boundary
- 每个 stage 只负责在被 runtime 调用时决定如何执行

也就是说，stage 可以内部 reconcile，但不能成为独立 patch actor。


## 7.2 建议的 stage graph

建议把 active projection pipeline 拆成明确阶段：

```txt
activeView
queryConfig
layoutConfig
calcConfig
recordSet
sections
appearances
fields
calculations
```

更细一点可以是：

```txt
view
search
filter
sort
group
records
sections
appearances
fields
calculations
```

每个 stage 都有：

- inputs
- dependencies
- equality
- dirty rule
- action strategy


## 7.3 runtime 应维护 action planner，而不是只有脏标记

长期最优里，planner 不应只回答“脏没脏”，而应回答“这个 stage 用什么动作执行”。

建议把 stage action 明确定义成：

```ts
type StageAction =
  | 'reuse'
  | 'recompute'
  | 'reconcile'
  | 'rebuild'
```

语义如下：

- `reuse`: 直接复用旧结果引用，不执行 stage
- `recompute`: 以新输入重新计算 stage，但不做对象级 patch
- `reconcile`: stage 自己基于旧结果和新输入做局部协调，结果必须语义等价于完整重算
- `rebuild`: 该 stage 视为边界重建，通常出现在 active view 切换等硬边界

这里最关键的一条约束是：

- `reconcile` 是 stage-local strategy，不是 stage-level independent scheduling

建议 planner 长成这样：

```ts
interface ProjectionActionPlan {
  view: StageAction
  search: StageAction
  filter: StageAction
  sort: StageAction
  group: StageAction
  records: StageAction
  sections: StageAction
  appearances: StageAction
  fields: StageAction
  calculations: StageAction
}
```

planner 的输入是：

- `CommitDelta`
- current `activeViewId`
- raw index impact summary

planner 的责任不是执行 projection，而是决定：

- 哪些 stage 参与本轮计算
- 每个 stage 用 `reuse / recompute / reconcile / rebuild` 的哪一种动作
- 下游 stage 能否消费上游的旧结果，还是必须等待上游新结果


## 7.4 dirty 规则示例

## 7.4 stage action 规则示例

### 7.4.1 active view 切换

如果有：

- `activeView.changed`

则：

- 全部 stage `rebuild`

这是唯一允许的硬全量边界。


### 7.4.2 active view query 改动

如果：

- active view 的 search/filter/sort/group 配置变化

则：

- `view/search/filter/sort/group` 一般走 `recompute`
- `records/sections/appearances/calculations` 至少走 `recompute`
- `fields` 仅在 display 也变时才执行

长期不建议这里做跨 stage patch 传播。


### 7.4.3 只是 display 改动

如果：

- active view 的 `display.fields` 变化

则：

- `view` 走 `recompute`
- `fields` 走 `recompute` 或 `reconcile`
- `records/sections/appearances` 走 `reuse`
- `calculations` 是否执行，取决于 calc 是否依赖 visible fields；长期建议不依赖，因此通常 `reuse`


### 7.4.4 record value 改动

如果：

- `record.values.changed`

则先由 planner 判断命中 field 是否影响 active view：

- 命中 search fields -> `records` 至少 `recompute`
- 命中过滤字段 -> `records` 至少 `recompute`
- 命中排序字段 -> `records` 至少 `recompute`
- 命中分组字段 -> `records/sections/appearances/calculations` 至少 `recompute`
- 命中 calc 字段 -> `calculations` 至少 `recompute`

如果某些 stage 后来证明值得做局部算法，可以把 `recompute` 升级成 `reconcile`，例如：

- `records` 基于增量 index 选择性更新 visible ids
- `sections` 基于 bucket delta 协调 section membership
- `calculations` 基于 aggregate index 协调结果

但这些都属于 stage-local reconcile，不改变中央调度结构。

如果命中的 field 与 active view 完全无关，则：

- 全部 stage `reuse`


### 7.4.5 field schema 改动

如果：

- field kind / option schema / formatter 改变

则：

- search/group/sort/calc 相关 index 更新
- 命中 active view 相关字段时，相关 projection stages 至少 `recompute`


## 7.5 为什么长期不采用 distributed patch network

长期最优里，应明确拒绝 distributed patch network，原因不是“实现不了”，而是它会系统性抬高复杂度。

主要劣势如下：

- 每个 stage 都会携带一份系统依赖图知识，依赖关系从 planner 转移到各 stage 内部
- 更新顺序和 publish 时机变复杂，容易出现中间态不一致
- 正确性很难证明，因为需要证明 patch 后结果始终等价于完整重算
- 测试面会从“单轮重建正确”膨胀到“多阶段 patch 组合正确”
- 引用稳定策略会分散到每个 stage，React 行为边界更难统一
- projection 与 index 的边界容易互相污染

因此长期最优的边界应该是：

- 中央 runtime 统一调度
- stage 内部允许 reconcile
- 绝不让 stage 彼此独立传播 patch


## 7.6 runtime 输出仍然是稳定 store

即使内部用了 dirty planner 和 index runtime，对外仍然只暴露：

```ts
engine.project.view
engine.project.search
engine.project.filter
engine.project.sort
engine.project.group
engine.project.records
engine.project.sections
engine.project.appearances
engine.project.fields
engine.project.calculations
```

也就是说：

- 公开接口不出现 dirty / index / delta 概念
- 内部用复杂调度换公开面简单


## 8. 推荐的终态目录

```txt
dataview/src/
  core/
    commit/
      delta.ts
      collector.ts

  engine/
    read/
      source.ts

    index/
      runtime.ts
      records.ts
      search.ts
      group.ts
      sort.ts
      calculations.ts

    project/
      runtime.ts
      planner.ts
      view.ts
      search.ts
      filter.ts
      sort.ts
      group.ts
      records.ts
      sections.ts
      appearances.ts
      fields.ts
      calculations.ts
```

这里的职责边界是：

- `core/commit/*` 负责产出 richer delta
- `engine/index/*` 负责 raw index runtime
- `engine/project/planner.ts` 负责 delta -> dirty plan
- `engine/project/planner.ts` 负责 delta -> stage action plan
- `engine/project/runtime.ts` 负责统一调度和发布
- `engine/project/*.ts` 负责各 projection stage 的纯构建
  或在 runtime 调用下执行 stage-local reconcile


## 9. 从零重构时应该直接删掉的旧思路

下面这些模式，长期不应继续保留：

- 粗粒度 `CommitChangeSet` 作为长期终态
- projection 每次 document change 整体重算，再靠 equality 止损
- search/group/calculation 没有正式 index runtime
- projection stage 独立订阅 `changes` 并自行向下游传播 patch
- per-view projection cache
- projection family registry
- current-view adapter runtime


## 10. 最终推荐方案

如果只用一句话概括长期最优，我的建议是：

- 用 richer semantic delta 取代当前粗 changes
- 用 raw index runtime 承担 search/group/sort/calc 的长期性能基础
- 用 single active projection runtime + action planner 消费 delta
- 保留一个 active pipeline，但把“每次都全量重算”升级为“按 stage selective rebuild / reconcile”

也就是说，长期最优既不是：

- 当前这种“全部重算”

也不是：

- 每个 projection 各自订阅 change 并独立 patch

而是：

- 一个统一 runtime
- 一套正式 delta
- 一层正式 indexes
- 一张 stage action graph


## 11. 验收标准

长期重构完成后，应该满足下面这些标准。

### 11.1 `changes`

- commit 输出包含 semantic delta
- runtime 不再只看到粗粒度 entity summary
- active view 相关变更可直接被 planner 识别


### 11.2 indexes

- search 有正式 inverted index
- group 有正式 bucket index
- sort 有正式 key index
- calculation 有正式 aggregate index
- index 都支持增量更新


### 11.3 projection

- projection runtime 只维护一个 active pipeline
- runtime 根据 delta 做 stage-level `reuse / recompute / reconcile / rebuild`
- 对外 API 仍然保持扁平和简单
- React 继续只消费稳定的 `engine.project.*`


## 12. 一句话结论

Dataview 的长期最优，不是单独优化 `changes`、单独优化 projection、单独优化 indexes。

长期最优是把三者合成一套统一体系：

- `changes` 提供语义级 delta
- indexes 提供长期可维护的增量基础设施
- projection runtime 用 delta 和 indexes 调度 active pipeline 的 selective rebuild / reconcile

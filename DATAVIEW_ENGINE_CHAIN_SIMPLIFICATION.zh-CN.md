# Dataview Engine 全链路收敛方案

本文讨论的不是某一个局部热点，而是 `dataview-engine` 从一次写入到最终对外发布的整条链，最后应该怎么收敛，才能同时满足下面三个目标：

1. 复杂度继续下降。
2. 性能不能下降。
3. 不为了“看起来更简单”再引入新的抽象层或新的真源。

## 一、当前整条链到底在做什么

现在一次 active view 更新，主链大致是：

1. `commit`
2. `createActiveImpact`
3. `syncViewPlan`
4. `deriveIndex`
5. `deriveViewSnapshot`
6. `runQueryStage`
7. `runSectionsStage`
8. `runSummaryStage`
9. `publishViewBase`
10. `projectEngineOutput`
11. `source.runtime.apply`

把它按职责合并后，其实只有 4 层：

1. `plan`
   负责把 view 配置编译成查询执行计划和 index demand。
2. `index`
   负责维护 search / bucket / sort / calculation 等昂贵索引。
3. `snapshot`
   负责算出 active view 的 records / sections / items / summaries / base query projection。
4. `source`
   负责把 document 和 active snapshot 投影成外部可订阅的 store delta。

这 4 层本身是合理的，不应该为了“阶段少一点”强行合并。它们分别对应：

- 配置编译边界
- 昂贵索引复用边界
- active view 语义边界
- 外部 store 发布边界

真正复杂的不是层数，而是层与层之间存在多套重复模型。

## 二、当前复杂度主要来自哪里

### 1. 同一个事实有多套变化描述

现在链路里同时存在：

- `CommitImpact`
- `ActiveImpact`
- `QueryDelta`
- `SectionDelta`
- `SummaryDelta`
- `ViewRuntimeDelta`
- `DocumentChange`
- `ViewPublishDelta`
- `SourceDelta`

这里面并不是每一层都不可替代。

从职责上看：

- `CommitImpact` 是 document 级真变更，必须保留。
- `ActiveImpact` 是 active view 增量推导上下文，必须保留。
- `QueryDelta / SectionDelta / SummaryDelta` 是 snapshot 内部阶段结果，可以保留。
- `SourceDelta` 是最终对外发布格式，必须保留。

但中间这几层：

- `ViewRuntimeDelta`
- `DocumentChange`
- `ViewPublishDelta`

大部分是在做“把前一层再翻译成另一份差异描述”，这是最容易积累复杂度和 bug 的地方。

### 2. 同一个配置在多处重复保存

最典型的是：

- `ViewPlan.query`
- `QueryState.plan`

`QueryState.plan` 里保存的 `executionKey / watch`，本质上是上一轮 `QueryPlan` 的一部分，而根 runtime 里已经有 `currentView.plan`。

这种重复有两个问题：

1. 比较逻辑散在多个文件里。
2. 一旦一边演进，一边没跟上，就会出现“增量判定不一致”。

### 3. section membership 没有被绝对收紧为唯一真源

这也是最近几类 bug 的根源之一。

从语义上看，group/filter 之后 active view 里最重要的事实不是：

- bucket index 里记录了什么
- item projection 里映射了什么
- layout 当前渲染了什么

而是：

- 某个 section 当前到底有哪些 record

也就是：

- `SectionState.byKey.get(sectionKey)?.recordIds`
- `SectionState.keysByRecord`

如果 `items`、`count`、`summary`、layout、publish 不是都从这份 membership 往下走，就一定会在 filter/group/collapse/expand 组合场景里分叉。

### 4. `source/project` 现在做了太多“二次投影”

`source/project.ts` 现在不仅做：

- document delta
- active delta

还额外做了这些事：

- 从 `ViewState.query` 再推一遍 `filterFieldIds / sortFieldIds / sortDir`
- 从 `ViewState` 再推一遍 gallery/kanban 派生配置
- 先构造 `ViewPublishDelta`
- 再翻译成 `SourceDelta`

这不是必要的性能优化，而是发布层承担了过多“视图语义拼装”职责。

### 5. presentation state 还没有完全和 data state 断开

`collapsed` 是最典型的例子。

正确语义应该是：

- `collapsed` 只影响展示
- 不影响 section membership
- 不影响 summary 的语义值
- 不影响 item identity

如果出现“collapse 之后反而看起来正常”，这说明某一处数据层和展示层还没完全断开。

## 三、最终应该坚持的几条原则

### 1. query 只回答“哪些 record 可见、顺序是什么”

query 的唯一职责是产出：

- `matched`
- `ordered`
- `visible`

它不负责 section，也不负责 summary。

### 2. section membership 是 active view 的唯一结构真源

对于 grouped view，最终所有下游都必须只认：

- `SectionState.byKey[sectionKey].recordIds`
- `SectionState.keysByRecord`

只要有 group/filter，下面这些都必须从 section membership 派生，而不能各读各的：

- `section.items`
- `section.count`
- `summary.bySection`
- layout blocks
- publish items/sections

### 3. item projection 只负责 identity，不负责 membership

item projection 的职责应该只有一个：

- 给 `(sectionKey, recordId)` 一个稳定的 `itemId`

它不能再承担“决定 section 里有哪些 item”的语义。

membership 的真源应该永远是 `section.recordIds`。

### 4. summary 不应该拥有自己的 membership source

summary 只应该基于：

- `SectionState.recordIds`
- `CalculationIndex`

来增量更新。

不能给 calculation/summaries 再设计一套独立 source。否则会变成：

- section 一套真源
- summary 又一套真源

这样短期看像“更清晰”，长期一定更复杂，而且更容易出错。

### 5. source 只负责发布，不负责重新定义语义

source/project 的职责应该是：

- 把 document 和 active snapshot 的变化翻译成 store delta

而不是：

- 再定义一遍哪些字段算 query 元数据
- 再定义一遍哪些 section 需要发
- 再定义一遍 view-specific 语义

source 层越“聪明”，越容易和 snapshot 层分叉。

## 四、最终推荐的收敛形态

### 1. 保留 4 层，不再继续塌缩

最终仍然保留：

1. `plan`
2. `index`
3. `snapshot`
4. `source`

不建议把 `index` 吞进 snapshot，也不建议把 query/section/summary 合成一个 mega stage。

原因很简单：

- `plan` 决定 demand
- `index` 决定昂贵数据结构复用
- `snapshot` 决定 active view 语义
- `source` 决定对外发布形式

这是天然边界，不是人为分层。

### 2. 把 runtime state 收口成一套更干净的主模型

当前 runtime state：

```ts
interface ActiveRuntimeState {
  plan?: ViewPlan
  demand: NormalizedIndexDemand
  index: IndexState
  cache: ViewCache
  snapshot?: ViewState
  sourceDelta: SourceDelta
  tableLayout: TableLayoutState | null
}
```

建议最终收成：

```ts
interface ActiveRuntimeState {
  plan?: ViewPlan
  index: IndexState
  cache: ViewCache
  snapshot?: ViewState
  sourceDelta: SourceDelta
  tableLayout: TableLayoutState | null
}
```

也就是去掉独立的 `demand` 字段。

前提是：

- `ViewPlan` 直接持有已经标准化后的 index demand

这样 runtime 不再同时维护：

- `plan`
- `demand`

两份同义配置。

### 3. `ViewPlan` 最终只保留两类东西

最终 `ViewPlan` 应该只包含：

1. `query` 执行计划
2. `index` demand

以及极少量 snapshot 直接需要的元数据：

- `section`
- `calcFields`

推荐形态：

```ts
interface ViewPlan {
  query: QueryPlan
  index: NormalizedIndexDemand
  section?: SectionPlan
  calcFields: readonly FieldId[]
}
```

不再单独保留：

- `ViewPlanChange`

因为主链现在并不消费它，它只是在保留一套额外 diff 结构。

### 4. `QueryState` 不再携带 plan 副本

推荐：

```ts
interface QueryState {
  records: ViewRecords
  search?: {
    query: string
    sourceKey: string
    sourceRevisionKey: string
    matched: readonly RecordId[]
  }
  visibleSet?: ReadonlySet<RecordId>
  order?: ReadonlyMap<RecordId, number>
}
```

去掉：

```ts
plan: {
  executionKey
  watch
}
```

因为这些都应直接来自当前 `ViewPlan.query`。

这样 query stage 的 action 判定就只读：

- `previous snapshot/cache`
- `current plan`
- `active impact`

不会再有第三份配置影子。

### 5. `SectionState` 成为 active view 的唯一 membership source

最终 section 相关模型应该明确成：

```ts
interface SectionNodeState {
  key: SectionKey
  label: Token
  color?: string
  bucket?: SectionBucket
  collapsed: boolean
  recordIds: readonly RecordId[]
  visible: boolean
}

interface SectionState {
  order: readonly SectionKey[]
  byKey: ReadonlyMap<SectionKey, SectionNodeState>
  keysByRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
}
```

并明确以下约束：

1. `items` 只能从 `recordIds` 投影。
2. `summary` 只能从 `recordIds` 汇总。
3. `count` 必须等于 `recordIds.length` 或由其直接派生。
4. `collapsed` 只影响 publish/layout，不影响 `recordIds` 和 summary。

### 6. summary 只做“从 membership 派生”

最终推荐关系是：

```ts
query.records.visible
  -> SectionState
  -> ItemProjection
  -> SummaryState
```

其中：

- `SectionState` 决定 membership
- `ItemProjection` 决定 identity
- `SummaryState` 决定汇总值

不允许：

- `SummaryState` 直接回读 bucket index 当 membership
- `publish` 自己再算一份 section membership

### 7. 把中间 delta 层收成两层

最终建议保留的变化模型只有：

1. `CommitImpact / ActiveImpact`
2. `SnapshotChange / SourceDelta`

其中：

- `CommitImpact` 是 document 写入层变化
- `ActiveImpact` 是 active view 增量上下文
- `SnapshotChange` 是 query/section/summary 阶段内部变化
- `SourceDelta` 是外部 store 发布格式

建议删除：

- `DocumentChange`
- `ViewPublishDelta`

`ViewRuntimeDelta` 如果只是把 query/section/summary 三个 delta 套一层壳，可以保留但改名为 `SnapshotChange`，否则也可以直接内联。

### 8. `source/project` 最终应该直接产出 `SourceDelta`

推荐把：

- `projectDocumentChange()`
- `projectViewPublishDelta()`
- `projectEngineOutput()`

收成一个主入口：

```ts
projectSourceOutput({
  document,
  impact,
  previousView,
  nextView,
  snapshotChange,
  previousLayout
})
```

它直接返回：

```ts
{
  sourceDelta,
  tableLayout
}
```

这里的关键不是函数名，而是删除中间投影层：

- 不先造 `DocumentChange`
- 不先造 `ViewPublishDelta`
- 直接从 `impact + snapshot + stage delta` 生成 `SourceDelta`

### 9. 把 view base projection 明确成 snapshot 的一部分

现在 `publishViewBase()` 和 `buildViewProjectionMeta()` 事实上都在做 view/query/fields 的再投影。

最终建议：

- 所有 active view 需要对外发布的 base 元数据，在 snapshot 阶段一次生成
- source 层只做 delta 化，不再重新推导

也就是：

- `filterFieldIds`
- `sortFieldIds`
- `sortDir`
- `tableCalc`
- gallery/kanban 派生配置

不要在 source/project 里再算一次。

## 五、哪些东西不能为了“简单”而删除

### 1. 不能删除 index demand

这是性能边界的核心。

没有 demand，就只能：

- 全量建所有索引
- 或者运行时临时发现缺什么再补

这两种都更差。

### 2. 不能把 query / sections / summary 合成一个阶段

三者的失效条件不同：

- query 看 search/filter/sort/record touch
- sections 看 query visible/group membership/collapse
- summary 看 calc fields 和 section membership

硬合并会扩大最小失效范围。

### 3. 不能让 source 成为第二个“语义引擎”

source 必须是 publish 层，而不是重算层。

### 4. 不能给 calculations 再造一套独立 source

这会直接把 system of record 分裂成两份：

- section membership
- summary membership

这是长期最坏的方向。

## 六、为什么这样收不会掉性能

### 1. 保留了真正重要的复用边界

保留：

- `plan` 编译复用
- `index` 局部索引复用
- `snapshot` 局部 stage 复用
- `source` 局部 delta 发布

删除的是重复翻译层，不是增量边界。

### 2. 让所有下游都复用同一份 membership

当 `items`、`summary`、`layout` 都只认 `SectionState.recordIds` 时：

- 不需要多份 membership diff
- 不需要 publish 时再判断“哪些 section 真的变了”
- 更容易做引用复用

这通常不是性能下降，而是性能更稳。

### 3. 让增量判定集中，而不是分散

现在很多复杂度来自：

- 这一层判断一次 changed
- 下一层再判断一次 changed
- publish 层再判断一次 changed

收口后，变化判断更集中：

- `impact`
- `snapshotChange`
- `SourceDelta`

这会减少重复集合构造和重复 map/set 比较。

### 4. presentation state 不再污染数据层

只要 `collapsed` 不再影响 membership 和 summary，很多“展开异常、折叠正常”的问题会自然消失，也避免 layout 反过来触发数据层重建。

## 七、最终建议的实施顺序

### 第一阶段：先收真源，不动阶段边界

目标：

- `SectionState.recordIds` 成为 items/count/summary 的唯一输入
- `collapsed` 完全降级为 presentation state

这一阶段做完，group/filter/collapse 组合场景的正确性会明显提升。

### 第二阶段：删除重复状态

目标：

- `ViewPlan` 持有 normalized demand
- 删除 `currentView.demand`
- 删除 `QueryState.plan`
- 删除 `ViewPlanChange`

这一阶段做完，主链状态面会明显变小。

### 第三阶段：收中间 delta

目标：

- 删除 `DocumentChange`
- 删除 `ViewPublishDelta`
- `source/project` 直接输出 `SourceDelta`

这一阶段做完，publish 层复杂度会大幅下降。

### 第四阶段：把 base projection 收进 snapshot

目标：

- `filterFieldIds / sortFieldIds / sortDir / tableCalc`
- gallery/kanban 派生配置

都在 snapshot/base 一次生成，source 只做发布。

### 第五阶段：统一 stage 风格

目标：

- 要么 query/sections/summary 全都统一用一个 stage helper
- 要么全部写显式逻辑

不要继续保持“一部分抽象、一部分手写”。

## 八、最终判断

整条链还有明显简化空间，但正确方向不是：

- 把阶段继续砍少
- 把更多逻辑塞进 field spec
- 给 summary 单独设计一套 source
- 再抽一层更大的 runtime framework

正确方向是：

1. 保留 `plan -> index -> snapshot -> source` 这 4 个天然边界。
2. 把 section membership 收紧成唯一结构真源。
3. 删除重复 plan/state/delta 模型。
4. 让 source 只负责发布，不再重定义语义。

一句话概括：

> 未来的 engine 应该是“单一 membership 真源 + 分层增量复用 + 最少中间翻译层”，而不是“阶段更少但每层更大、更聪明、更隐式”。

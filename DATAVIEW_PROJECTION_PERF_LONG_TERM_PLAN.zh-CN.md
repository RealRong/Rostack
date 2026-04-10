# Dataview Projection 性能长期优化方案

## 1. 文档目的

本文只讨论 projection 侧的长期最优性能方案。

本文不讨论：

- 兼容旧路径
- 过渡双实现
- 短期 patch 技巧
- “先 trace 再说”的临时分析流程

本文默认前提：

- index 层已经完成 demand-driven 收敛
- boot 双重构建已经删除
- clone 已经收口到 engine 输入 / 输出边界
- 系统内部以不可变 document 快照工作


## 2. 当前结论

当前 projection 侧的主要问题，不是“没有 reconcile”，而是：

- 已经有 reconcile plan
- 但真正执行时仍然大量依赖全量 materialize

这意味着：

- planner 在语义上是增量的
- runtime 在算法上仍然偏全量

因此当前瓶颈已经从 index 转移到 projection。


## 3. 当前主要性能问题

## 3.1 sections 的耗时被低估成“只是 section 慢”

当前 `sections` stage 看起来最重，但这不是因为它只是 section 逻辑重，而是因为它隐式触发了整套 record query 重算。

当前链路本质上是：

```txt
sectionsStage
  -> sectionProjection()
    -> recordState()
      -> sort all ids
      -> apply order
      -> filter all ids
      -> materialize visible rows
    -> build sections from visible rows
```

所以：

- `sections` 的 stage trace 里混入了 record query 成本
- 当前 trace 不能精确表达 projection 内部热点


## 3.2 recordState 仍然是全量式

当前 `recordState` 会：

1. 对全量 record ids 做排序
2. 生成 ordered ids
3. 对 ordered ids 做 filter/search 判定
4. materialize 三份 `Row[]`

也就是：

- `derivedRecords`
- `orderedRecords`
- `visibleRecords`

问题不只是 O(N) / O(N log N)：

- 更糟的是它会重复 materialize 大对象引用数组
- 下游 stage 实际大多只需要 `RecordId[]`


## 3.3 sections 仍然按 visible rows 全扫重建

当前 grouped projection 的本质是：

- 扫 `visibleRecords`
- 读每条 record 的 bucket
- 收集 bucket descriptors
- 重新构建 section membership
- 为每个 section 重新生成 appearance ids

这意味着：

- 单条 record 从一个 bucket 移到另一个 bucket时
- 系统仍然通过“重扫当前所有 visible records”来推导结果

这不是长期最优。


## 3.4 appearances 仍然是全量 flatten + 全量导航索引重建

当前 `appearances` 虽然有 reconcile，但实质是：

- 重新生成 `byId`
- 重新生成 `visibleIds`
- 重新生成 `visibleIndex`
- 重新生成 `sectionById`
- 重新生成 `idsBySection`

这类 reconcile 的价值主要是对象复用，不是算法增量。


## 3.5 calculations 仍然是“先拿 section ids，再扫 entries”

当前 section calculation 已经比旧架构好很多，因为它不再依赖每个 field 的全局 bucket aggregate 常驻结构。

但从 projection 长期最优看，它仍然是：

- 根据 section membership 拿到 record ids
- 根据 record ids 从 `entriesByField` 再取 entry
- 再 build section aggregate

这说明 calculation 仍然没有真正吃到 projection membership delta。


## 3.6 planner 粒度太粗

当前 planner 只能表达：

- 哪个 stage 要 `reuse`
- 哪个 stage 要 `reconcile`
- 哪个 stage 要 `recompute`

但它不能表达：

- 哪些 record 的 visibility 变了
- 哪些 record 的 order 变了
- 哪些 record 在 section 之间迁移了
- 哪些 section 的 membership 没变
- 哪些 section 的 collapse 变化只影响 visible appearances

因此 stage 即使知道“自己要 reconcile”，也拿不到足够细粒度的增量输入。


## 4. 长期最优目标

projection 侧长期最优，不是继续堆更多 `reconcile` 分支，而是重构成：

- 一个中心化的 projection runtime state
- 一套明确的 projection delta
- 各层状态按 delta 做原子迁移

换句话说：

- 不再从当前 document/index 快照反推 projection
- 改成在已有 projection state 上做增量状态迁移


## 5. 长期架构原则

## 5.1 projection 只维护 active view

系统前提已经是：

- 同时只有一个 active view 真正驱动页面

所以 projection runtime 应该只维护 active view 的投影视图状态。

这意味着：

- 不需要为所有 view 长期持有 projection cache
- 不需要做多 view projection 共享缓存协议


## 5.2 projection 层以 `RecordId` 为主，不以 `Row` 为主

长期 projection 主路径应该尽量基于：

- `RecordId[]`
- `ReadonlySet<RecordId>`
- `Map<RecordId, ...>`

而不是：

- `Row[]`

原因：

- ids 结构更轻
- 更适合表达 order / membership / visibility
- 避免重复 materialize row 引用数组


## 5.3 query / section / appearance / calculation 必须拆层

长期 projection runtime 应该拆成四层状态：

1. query state
2. section state
3. appearance state
4. section calculation state

这四层是单向依赖：

```txt
query state
  -> section state
    -> appearance state
    -> section calculation state
```

而不是现在这样由 stage 之间通过当前快照反复重算。


## 5.4 让 delta 成为第一类输入

长期每次 projection sync 的输入应该是：

1. 当前 active view query/layout 配置
2. 当前 index/document 快照
3. projection delta

其中真正驱动增量算法的核心，是第三项。


## 6. 新的 projection state 设计

## 6.1 QueryState

```ts
interface QueryState {
  derivedIds: readonly RecordId[]
  orderedIds: readonly RecordId[]
  visibleIds: readonly RecordId[]
  visibleSet: ReadonlySet<RecordId>
  orderIndex: ReadonlyMap<RecordId, number>
}
```

职责：

- 表达 search/filter/sort/manual-order 之后的最终 record 集关系

原则：

- 不输出 `Row[]`
- 下游都基于 ids 工作


## 6.2 SectionState

```ts
interface SectionState {
  order: readonly SectionKey[]
  byKey: ReadonlyMap<SectionKey, SectionNode>
  sectionByRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
}

interface SectionNode {
  key: SectionKey
  title: string
  color?: string
  bucket?: SectionBucket
  recordIds: readonly RecordId[]
  visible: boolean
  collapsed: boolean
}
```

职责：

- 维护 section 顺序
- 维护每个 section 的 record membership
- 维护 record 到 section 的反向映射

这里的关键是：

- `recordIds` 是 section 的主 membership
- appearance 不再是 section 的源数据


## 6.3 AppearanceState

```ts
interface AppearanceState {
  byId: ReadonlyMap<AppearanceId, Appearance>
  ids: readonly AppearanceId[]
  visibleIndex: ReadonlyMap<AppearanceId, number>
  sectionById: ReadonlyMap<AppearanceId, SectionKey>
  idsBySection: ReadonlyMap<SectionKey, readonly AppearanceId[]>
}
```

职责：

- 为 UI 导航提供稳定的 appearance 结构
- 维护扁平 visible appearance 列表
- 提供 `prev/next/range/indexOf/idsIn` 能力

但长期它应是：

- 由 `SectionState` 增量派生
- 不是每次全量 rebuild


## 6.4 SectionCalculationState

```ts
interface SectionCalculationState {
  bySection: ReadonlyMap<SectionKey, SectionCalcNode>
}

interface SectionCalcNode {
  byField: ReadonlyMap<FieldId, AggregateState>
}
```

职责：

- 维护每个 section 每个 calc field 的聚合状态

关键点：

- 不再通过“section ids -> entries -> build aggregate”每次重算
- 改成 accumulator 增量维护


## 7. 新的 projection delta 设计

projection delta 不需要很复杂，但必须足够表达真正的增量意图。

建议长期 API：

```ts
interface ProjectionDelta {
  query?: {
    added?: readonly RecordId[]
    removed?: readonly RecordId[]
    visibilityChanged?: readonly RecordId[]
    orderChanged?: readonly RecordId[]
  }
  group?: {
    moved?: readonly {
      recordId: RecordId
      before?: readonly SectionKey[]
      after?: readonly SectionKey[]
    }[]
    touchedSections?: readonly SectionKey[]
  }
  layout?: {
    collapsed?: readonly SectionKey[]
    hidden?: readonly SectionKey[]
  }
  calculations?: {
    touchedFields?: readonly FieldId[]
    touchedRecords?: readonly RecordId[] | 'all'
  }
}
```

这个类型不是重点，重点是：

- projection runtime 以后必须吃“已经解释好的增量事实”
- 不能让每个 stage 自己再从 document 和 semantic delta 反推一遍


## 8. 新的执行链

长期正确执行链应该是：

```txt
document/index sync
  -> resolve active view dependencies
  -> build ProjectionDelta
  -> sync QueryState
  -> sync SectionState
  -> sync AppearanceState
  -> sync SectionCalculationState
  -> publish external stores
```

重点：

- query 改动先变成 query delta
- group/membership 改动先变成 section delta
- calculations 直接吃 section membership delta 和 field value delta


## 9. 各层长期增量算法

## 9.1 QueryState 增量算法

### 目标

- 不再整表重排整表过滤

### 长期做法

对于 touched record：

1. 重新计算它是否匹配 search/filter
2. 重新计算它的 sort key / manual order position
3. 在 `derivedIds/orderedIds/visibleIds` 中做局部删除 / 插入 / 保持

结果：

- 普通 value update 不再需要对 50k 全量 ids 做 sort/filter


## 9.2 SectionState 增量算法

### 目标

- 不再从 `visibleRecords` 全扫重建 sections

### 长期做法

对于每个 touched record：

1. 读取旧 bucket membership
2. 读取新 bucket membership
3. 如果 bucket 不变：
   - 只在 section 内根据 query order 重新定位
4. 如果 bucket 变化：
   - 从旧 section 删除
   - 插入新 section
5. 如 section 变空 / 变非空：
   - 更新 section visible state
   - 必要时更新 section order

结果：

- grouped record update 变成“局部搬运”，不是“全量重建分组”


## 9.3 AppearanceState 增量算法

### 目标

- 不再每次重建所有辅助索引

### 长期做法

当某个 section membership 变化时：

1. 只重建该 section 的 `appearanceIds`
2. 只更新受影响 section 在全局 visible appearance 列表中的切片
3. 局部修复 `visibleIndex`
4. 局部修复 `sectionById` / `idsBySection`

当 section collapsed 状态变化时：

1. 不改 `byId`
2. 只增量更新 `ids`
3. 局部更新 `visibleIndex`

结果：

- appearance 的主要成本从“全量 flatten”变成“局部 splice”


## 9.4 SectionCalculationState 增量算法

### 目标

- 不再通过 section ids 再扫 entries

### 长期做法

对每个 touched record 和每个 touched calc field：

1. 若 record 离开 section：
   - 从旧 section accumulator remove
2. 若 record 进入 section：
   - 向新 section accumulator add
3. 若 record 留在同一 section 且值变化：
   - 对该 section accumulator replace

这要求 aggregate runtime 提供三类原子操作：

- `add(entry)`
- `remove(entry)`
- `replace(before, after)`

结果：

- calculation 更新成本与 touched records / touched sections 成正比
- 不再与 section 总大小线性相关


## 10. 外部 API 长期应该保持什么

对外 `engine.project.*` API 不必大改。

长期可以继续暴露：

- `view`
- `search`
- `filter`
- `sort`
- `group`
- `records`
- `sections`
- `appearances`
- `fields`
- `calculations`

但内部存储形态应该改变：

- 对外仍然是读模型
- 对内不再把这些读模型当运行时主状态

换句话说：

- 外部读模型是 publish 产物
- 内部运行时是 projection state machine


## 11. 现有 trace 为什么不够

当前 trace 的问题不是“没有 trace”，而是 trace 切分点不对。

例如：

- `sections` stage 会隐式触发 `recordState`
- 所以 `sections.durationMs` 混入了 query 计算成本

长期 trace 应补两个层次：

1. projection runtime internal trace
   - `queryMs`
   - `sectionMs`
   - `appearanceMs`
   - `sectionCalcMs`
2. publish trace
   - 哪些 external store 真正 changed

这样才能准确判断：

- 是 query 重
- 是 membership 重
- 还是 appearance flatten 重


## 12. 分阶段实施顺序

虽然最终目标是一步到位的长期结构，但工程上仍然应有实施顺序。

这里的“阶段”是落地顺序，不代表保留兼容分支。


## Phase 1: QueryState 去 Row 化

目标：

- `recordState` 不再输出 `Row[]`
- 改为输出 `derivedIds/orderedIds/visibleIds/visibleSet/orderIndex`

直接收益：

- 去掉大量 row array materialize
- 给 section 层提供更轻的输入


## Phase 2: SectionState 变成 membership runtime

目标：

- `sections` 不再从 `visibleRecords` 全扫
- 改为维护 `recordIdsBySection` 和 `sectionByRecord`

直接收益：

- grouped record update 从全量重建变成局部迁移


## Phase 3: AppearanceState 变成 section-local splice runtime

目标：

- `AppearanceList` 不再由全量 flatten 临时组装
- 改成可增量维护的 runtime state

直接收益：

- collapse / uncollapse / section membership 变更不再重建全局导航索引


## Phase 4: SectionCalculationState 增量化

目标：

- calculations 不再通过 section ids 重扫 entries
- 改成 accumulator runtime

直接收益：

- calc update 与 touched records / touched sections 成比例


## Phase 5: Planner 改成生成 ProjectionDelta

目标：

- planner 不再只产出 `StageAction`
- 增加结构化 `ProjectionDelta`

直接收益：

- runtime 不再需要反推“这次哪里变了”


## Phase 6: Projection trace 重构

目标：

- 把 helper cache / hidden recompute 从 stage trace 中拆出来
- 单独给 query / section / appearance / calculation trace

直接收益：

- 后续优化不会被错误 trace 误导


## 13. 我认为最该先做什么

如果只选一件事先做，我建议：

- 先把 `recordState` 改成纯 ids + set/index 结构

原因：

1. 它是当前所有下游 stage 的隐式成本来源
2. 它天然放大了 section stage 的耗时
3. 它是 section / appearance / calculation 增量化的前置条件

如果不先做这件事：

- sections 仍然会被迫吃 `visibleRecords`
- appearances 仍然会被迫从全量 section output flatten
- calculations 仍然只能从 section ids 再扫 entries


## 14. 最终目标总结

projection 侧长期最优，不是：

- 继续在 stage 内做更多 equality/reuse
- 继续用 reconcile 包装全量 materialize

projection 侧长期最优是：

- 用一套 active-view-only 的 projection runtime state
- 用一套明确的 ProjectionDelta
- 让 query / section / appearance / calculation 各层各自做原子增量更新

只有这样，系统才能从：

- “有增量计划，但执行像全量”

真正变成：

- “计划是增量的，算法也是增量的”

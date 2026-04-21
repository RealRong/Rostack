# Dataview Engine 下一阶段深度收敛方案

这份文档不讨论当前还没完全修掉的某个单点 bug，而是只回答一个问题：

在已经完成一轮大重构之后，`dataview-engine` 整条链路还有没有继续深度简化的空间？

结论是：有，而且空间还不小。但下一阶段不应该再继续塌缩主阶段，而应该继续收敛“阶段之间传递的模型、类型、命名和发布方式”。

目标仍然只有三个：

1. 降低复杂度。
2. 降低出错概率。
3. 性能不能下降。

## 一、先给结论

当前主链路保留下面几层是对的：

1. `plan`
2. `index`
3. `snapshot`
4. `source`
5. `runtime model`

问题已经不再主要来自“阶段太多”，而是来自下面这些剩余复杂度：

1. 同一个 membership 事实在多处被重复描述。
2. query 配置里还保存了太多可派生字段。
3. `SourceDelta.active` 和 `source/runtime` 还过于扁平。
4. `TableLayoutState` 这类展示态还留在 engine 里。
5. stage cache / snapshot base / runtime model 的结构还不够统一。
6. field 语义判断、read/derive/resolve/get 命名和 helpers 形态还比较散。

所以，下一阶段最优方向不是“再合并阶段”，而是：

1. 把 membership transition 压成唯一真模型。
2. 把 query/source/runtime 重新收成对象化、低重复的契约。
3. 把展示态移出 engine。
4. 把 field 语义判断和 read/build/sync/project 这些底层能力统一成稳定设施。

## 二、哪些边界应该保留，不要再动

### 1. `plan` 不能吞进 `index`

`plan` 负责把 view 配置编译成：

- query 执行计划
- index demand
- section / calculation 所需元数据

这是配置编译边界，不应该和索引状态混在一起。

### 2. `index` 不能吞进 `snapshot`

`index` 的意义是复用昂贵结构，而不是表达 active view 语义。它本质上是性能边界：

- search index
- bucket index
- sort index
- calculation index

如果把它和 snapshot 混起来，最终只会让“语义推导”和“索引维护”互相污染。

### 3. `query / sections / summary` 不应该强行合成一个 mega stage

它们的失效条件不同：

- `query` 关注 search/filter/sort/record change
- `sections` 关注 group/query visible/collapse projection
- `summary` 关注 calculation field 和 section membership

把三者硬合并，只会扩大最小失效范围，既不简单，也不快。

### 4. `source` 不能变成第二个语义引擎

`source` 的职责应该是“发布”，不是“重新解释 active view 语义”。

如果 `source/project` 继续承担太多语义拼装工作，最后一定会和 `snapshot` 分叉。

## 三、当前剩余复杂度的根源

### 1. membership transition 还不是唯一真模型

现在 `ActiveImpact` 里的 membership 变化仍然同时保存了多种平行描述，例如：

- `touchedKeys`
- `addedByKey`
- `removedByKey`
- `nextKeysByItem`

这类结构的问题不是字段多，而是它们在表达同一个事实：

- 某个 record 在这次提交前属于哪些 key
- 在这次提交后属于哪些 key

一旦同一个 transition 被拆成多套平行结构，后面的 `sections`、`summary`、`publish`、`layout` 就很容易各取各的，最后出现组合场景 bug。

下一轮最应该补的底层模型就是：

- 一份 canonical membership transition
- 所有 touched / added / removed / next 都只作为 reader 派生

### 2. `ActiveViewQuery` 里仍然有重复事实

当前 query 里还保留了这类字段：

- `grouped`
- `groupFieldId`
- `filterFieldIds`
- `sortFieldIds`
- `sortDir`

这些都可以从下面几项直接派生出来：

- `search`
- `filters`
- `group`
- `sort`

把它们持久保存在 snapshot/source/runtime 里，会带来两个问题：

1. 增加状态同步点。
2. 扩大 publish 和 runtime store 的扁平度。

这类信息更适合改成稳定 reader，而不是对象字段真源。

### 3. `SourceDelta.active` 仍然太扁平

现在 active source delta 里仍然是大量散开的 scalar patch：

- `query.grouped`
- `query.groupFieldId`
- `query.filterFieldIds`
- `query.sortFieldIds`
- `query.sortDir`
- `table.wrap`
- `table.showVerticalLines`
- `gallery.wrap`
- `gallery.size`
- `kanban.wrap`
- `kanban.fillColumnColor`

这会导致两层问题：

1. `source/project` 需要手工决定每个 scalar 是否变化。
2. `source/runtime` 需要手工创建和维护大量 store。

这类对象其实都不大，更适合：

- snapshot 里复用引用
- source 按对象发布
- runtime 按对象 store 存

重型数据继续保留 keyed delta：

- records
- fields
- views
- items
- sections
- section summaries

### 4. `source/runtime` 仍然在手工铺 store

现在 `source/runtime.ts` 里为 active view 手工创建了大量 value store / keyed store，例如：

- `querySearch`
- `queryFilters`
- `querySort`
- `queryGroup`
- `queryGrouped`
- `queryGroupFieldId`
- `queryFilterFieldIds`
- `querySortFieldIds`
- `tableWrap`
- `galleryWrap`
- `kanbanWrap`

这不是“足够细粒度”，而是“契约太扁平，导致 runtime 跟着冗长”。

如果 `SourceDelta.active` 改成对象化，`source/runtime` 可以明显收缩。

### 5. `TableLayoutState` 还在 engine 里

当前 `TableLayoutState` 同时存在于：

- engine contract
- source delta
- source runtime
- runtime state
- react table virtual layer

这说明它现在既像语义态，又像展示态。

但从职责上看，它本质是 table virtual / UI projection 的展示状态：

- 受 `collapsed` 影响
- 受渲染布局策略影响
- 只服务 table 展示

它不应该继续成为 engine 主链的数据契约一部分。

长期最优的做法是：

- engine 只发布 section membership 和 section collapsed
- table layout 在 runtime/react 层从 section + items 二次构建

这样可以明显减少 engine/source 的同步点和错误面。

### 6. `ViewCache` 与 stage runtime state 还不够统一

现在 query / sections / summary 三个阶段的 runtime state 形态并不完全一致。

这会导致：

1. 读代码时不容易形成稳定心智模型。
2. 新阶段或新逻辑更容易引入额外特例。

下一轮更好的方向不是再套一层抽象，而是让三者的命名和结构更一致：

- 都是某个 stage 的 runtime
- 都明确区分“真状态”和“投影状态”
- 不再混合“上轮计划副本”和“本轮状态”

### 7. `snapshot/base.ts` 这种大文件还在承担太多职责

当前 base projection、query projection、fields projection、table/gallery/kanban projection、equality / reuse 判断仍然耦在较少数文件里。

这类代码的主要问题不是性能，而是阅读成本很高：

1. 改 query projection 时容易误伤 view mode projection。
2. 派生字段和复用判断混在一起，不容易审查“真源是什么”。

这一层应该继续按职责拆开，但不要拆成过度抽象的框架。

### 8. field 语义判断仍然有继续 spec 化的空间

engine 里凡是出现下面这类判断，都应该重新审视是否属于 field 语义，而不是 engine 本体逻辑：

- 这个 field 是否支持 bucket
- 是否支持 sort
- 是否支持某种 comparison
- 是否需要某种 index
- 是否允许 group option color
- 某种 filter 是否有效

这类判断如果散落在 engine，会形成：

- if/else 分支重复
- 同一 field 规则在多处各写一遍
- 新 field kind 接入成本高

长期最优做法是：field semantic 判断尽量回收到 `fieldSpec` 或 field module，而 engine 只消费结论。

### 9. 命名和 helpers 仍然偏散

现在仍然混用了：

- `read`
- `get`
- `resolve`
- `derive`
- `build`
- `project`
- `sync`
- `apply`

这些词本来应该有明确边界，但现在部分地方含义重叠。

再加上不少“helpers”目录承载了实际核心逻辑，就会让代码库继续膨胀出很多经验型命名，而不是稳定模型。

## 四、下一阶段的核心设计原则

### 1. 一个事实只允许一份真模型

尤其是下面几个事实：

- query 语义
- section membership
- calculation entry transition
- source publish object

如果一个事实被拆成两份以上结构，复杂度一定回流。

### 2. 重型集合保留 delta，轻型对象按对象发布

需要继续按 keyed delta 发布的：

- document records
- document fields
- document views
- active items
- active sections
- active section summary

更适合按对象整体发布的：

- active query
- active table
- active gallery
- active kanban

原因很简单：

- 前者大且 keyed
- 后者小且天然成组

### 3. 展示态不要继续留在 engine

`collapsed` 可以作为 view/section 的一部分存在，但：

- row layout
- virtual projection
- block placement

这类状态应该在 runtime/react 层完成，而不是进入 engine source 契约。

### 4. reader 应该派生，state 应该收缩

凡是能稳定从 canonical state 派生出来的内容，都优先做 reader，不优先做 state 字段。

### 5. 先补底层模型，再删重复实现

如果多个地方在做相似事，不要只删代码量，更重要的是先问：

- 这里是不是缺了一个底层模型？
- 这里是不是缺了一个 reader / sync / spec 设施？

没有底层模型，只是把几份相似代码硬合并，后面通常还会再分裂。

## 五、推荐的最终 API 方向

下面不是要求一步到位精确落成的最终代码，而是下一轮重构应该逼近的稳定形态。

### 1. Canonical membership transition

```ts
interface MembershipRecord<TKey extends string> {
  before: readonly TKey[]
  after: readonly TKey[]
}

interface MembershipTransition<TKey extends string, TItem extends string> {
  rebuild?: true
  records: ReadonlyMap<TItem, MembershipRecord<TKey>>
}
```

核心要求：

1. 不再同时保存 `touchedKeys / addedByKey / removedByKey / nextKeysByItem` 多份真值。
2. `touched/added/removed` 全部改成 reader 派生。
3. `sections`、`summary`、`publish` 只消费这一份 transition。

推荐 reader 形态：

```ts
membershipRead.records(change)
membershipRead.touchedKeys(change)
membershipRead.added(change, key)
membershipRead.removed(change, key)
membershipRead.after(change, recordId)
```

这里不要求一定导出成 TS `namespace`。更适合的方式是：

- 文件按职责拆分
- 导出对象或函数组
- 不再用泛化 `helpers`

### 2. 更瘦的 `ActiveImpact`

```ts
interface EntryTransition<TId extends string, TValue> {
  rebuild?: true
  records: ReadonlyMap<TId, {
    before: TValue | undefined
    after: TValue | undefined
  }>
}

interface ActiveImpact {
  commit: CommitImpact
  base: {
    touchedRecords: ReadonlySet<RecordId> | 'all'
    touchedFields: ReadonlySet<FieldId> | 'all'
    valueFields: ReadonlySet<FieldId> | 'all'
    schemaFields: ReadonlySet<FieldId>
    recordSetChanged: boolean
  }
  query?: {
    rebuild?: true
    visibleAdded: readonly RecordId[]
    visibleRemoved: readonly RecordId[]
    orderChanged?: true
  }
  bucket?: MembershipTransition<BucketKey, RecordId>
  section?: MembershipTransition<SectionKey, RecordId>
  calculation?: {
    fields: ReadonlyMap<FieldId, EntryTransition<RecordId, CalculationEntry>>
  }
}
```

这里的重点不是字段数量，而是结构收敛：

- `bucket` 和 `section` 用同一种 transition 模型
- `calculation` 也改成同一类 before/after transition 语义

### 3. 更小的 `ActiveViewQuery`

```ts
interface ActiveViewQuery {
  search: ViewSearchProjection
  filters: ViewFilterProjection
  group: ViewGroupProjection
  sort: ViewSortProjection
}
```

去掉这些派生字段：

- `grouped`
- `groupFieldId`
- `filterFieldIds`
- `sortFieldIds`
- `sortDir`

统一改成 reader：

```ts
queryRead.grouped(query)
queryRead.groupFieldId(query)
queryRead.filterFields(query)
queryRead.sortFields(query)
queryRead.sortDir(query, fieldId)
```

这样 query 的真语义只保留一份。

### 4. 更清晰的 stage runtime

```ts
interface QueryRuntime {
  state: QueryState
}

interface SectionsRuntime {
  state: SectionState
  projection: SectionProjectionState
}

interface SummaryRuntime {
  state: SummaryState
}

interface ViewCache {
  query: QueryRuntime
  sections: SectionsRuntime
  summary: SummaryRuntime
}
```

核心目标：

1. 命名上统一都是某个 stage 的 runtime。
2. 只有 sections 明确保留 projection，因为它确实同时有 membership 和 item projection 两层。
3. 不再把 plan 副本塞回 stage state。

### 5. 更对象化的 `SourceDelta`

```ts
interface EntityDelta<TKey, TValue> {
  ids?: readonly TKey[]
  set?: ReadonlyMap<TKey, TValue | undefined>
  remove?: readonly TKey[]
}

interface SourceDelta {
  document?: {
    records?: EntityDelta<RecordId, DataRecord>
    fields?: EntityDelta<FieldId, CustomField>
    views?: EntityDelta<ViewId, View>
  }
  active?: {
    view?: {
      ready?: boolean
      id?: ViewId
      type?: View['type']
      value?: View | undefined
    }
    query?: ActiveViewQuery
    table?: ActiveViewTable
    gallery?: ActiveViewGallery
    kanban?: ActiveViewKanban
    items?: EntityDelta<ItemId, ViewItem>
    sections?: {
      records?: EntityDelta<SectionKey, Section>
      summary?: EntityDelta<SectionKey, CalculationCollection | undefined>
    }
    fields?: {
      all?: EntityDelta<FieldId, Field>
      custom?: EntityDelta<FieldId, CustomField>
    }
  }
}
```

关键点：

1. `query/table/gallery/kanban` 不再拆成大量 scalar patch。
2. 仍然保留大集合 keyed delta。
3. `table.layout` 从 `SourceDelta` 删除。

### 6. 更瘦的 `EngineSource`

```ts
interface EntitySource<TKey, TValue> extends store.KeyedReadStore<TKey, TValue | undefined> {
  ids: store.ReadStore<readonly TKey[]>
}

interface SectionSource extends store.KeyedReadStore<SectionKey, Section | undefined> {
  keys: store.ReadStore<readonly SectionKey[]>
  summary: store.KeyedReadStore<SectionKey, CalculationCollection | undefined>
}

interface ActiveSource {
  view: {
    ready: store.ReadStore<boolean>
    id: store.ReadStore<ViewId | undefined>
    type: store.ReadStore<View['type'] | undefined>
    current: store.ReadStore<View | undefined>
  }
  query: store.ReadStore<ActiveViewQuery>
  table: store.ReadStore<ActiveViewTable>
  gallery: store.ReadStore<ActiveViewGallery>
  kanban: store.ReadStore<ActiveViewKanban>
  items: EntitySource<ItemId, ViewItem>
  sections: SectionSource
  fields: {
    all: EntitySource<FieldId, Field>
    custom: EntitySource<FieldId, CustomField>
  }
}
```

这样 `source/runtime` 不再需要继续人工维护大量 scalar store。

### 7. `TableLayoutState` 退出 engine

最终推荐形态是：

- engine 不再拥有 `TableLayoutState`
- source 不再发布 `table.layout`
- runtime/react 从 `sections + items + collapsed` 自己生成 layout state

也就是说，table layout 变成 runtime 设施，而不是 engine 契约。

### 8. field semantic 判断尽量收进 spec

如果某个判断本质上是“field kind 语义差异”，则推荐统一通过 field spec 暴露，例如：

```ts
interface FieldViewSpec {
  canBucket: (field: Field | undefined) => boolean
  canSort: (field: Field | undefined) => boolean
  canFilter: (field: Field | undefined, rule: FilterRule) => boolean
  compare: (left: unknown, right: unknown) => number
  groupUsesOptionColors: (field: Field | undefined) => boolean
  indexDemand: (input: {
    view: View
    role: 'filter' | 'group' | 'sort' | 'summary'
  }) => boolean
}
```

这里不要求名字完全照抄，但方向应该明确：

- engine 不自己分散判断 field 特性
- spec 提供语义结论
- engine 只拼装计划和执行流程

## 六、命名与模块化的收敛建议

### 1. 不再使用泛化 `helpers`

凡是核心逻辑，不建议继续放进模糊的 `helpers`。更稳定的分法是按职责命名：

- `read`
- `build`
- `sync`
- `project`
- `apply`
- `spec`

### 2. 这几个动词要固定语义

推荐统一成下面的含义：

- `read`: 从现有 state / transition 派生读取，不创建新真值
- `build`: 从输入一次性构建新结构
- `sync`: 在 previous state 基础上做增量更新
- `project`: 从内部语义投影到外部结构
- `apply`: 把 delta 写入 store

不建议继续混用：

- `get`
- `resolve`
- `derive`

除非它们在局部语义上真的不可替代。

### 3. interface 内按职责分组，而不是所有字段平铺

用户偏好的方向是对的。这里更推荐：

- 用 interface 内部按职责拆对象
- 或用同文件多个小 interface
- 不建议靠 TS `namespace` 人为制造层级

也就是说，收敛重点应该是“职责分组的对象结构”，不是语法层面的 namespace。

### 4. 能做 reader 的，不要再额外加字段

例如：

- `query.grouped`
- `query.groupFieldId`
- `query.filterFieldIds`
- `query.sortFieldIds`

这些都应该优先变成 `queryRead.*`，而不是保存在 state/source 里。

## 七、推荐实施顺序

### 第一阶段：统一 membership transition

先做这一步，因为它对降低 bug 概率帮助最大。

实施目标：

1. 把 `ActiveImpact.bucket` 和 `ActiveImpact.section` 改成同一种 canonical transition。
2. 删除平行 truth 字段。
3. 补齐 `membershipRead.*`。
4. 让 `sections`、`summary`、`publish` 都改用它。

验收标准：

1. 组合场景不再出现“section 认一套、summary 认一套”。
2. 火焰图里不新增额外 transition 转换热点。

### 第二阶段：收缩 `ActiveViewQuery`

实施目标：

1. 去掉 query 里的派生字段。
2. 补齐 `queryRead.*`。
3. source/runtime/model 全部改为依赖 reader。

验收标准：

1. query 相关对象字段显著减少。
2. publish/runtime 不再跟着保存重复 query facts。

### 第三阶段：重构 `SourceDelta.active` 和 `source/runtime`

实施目标：

1. `query/table/gallery/kanban` 改成对象发布。
2. `source/runtime` 改成对象 store。
3. 删除大量 scalar store 和手工 apply 逻辑。

验收标准：

1. `source/runtime.ts` 明显缩短。
2. active source API 更接近 view 语义对象，而不是 patch 碎片。

### 第四阶段：把 `TableLayoutState` 迁出 engine

实施目标：

1. 删除 engine contract 里的 `TableLayoutState`。
2. 删除 `SourceDelta.active.table.layout`。
3. react/runtime 从 section state 构建自己的 table layout。

验收标准：

1. engine/source/runtime state 明显收缩。
2. collapse / expand / virtual 逻辑不再污染 engine 主链。

### 第五阶段：统一 stage runtime 与 snapshot base

实施目标：

1. 统一 `ViewCache` 的命名和职责。
2. 拆分 `snapshot/base.ts`。
3. 去掉 stage 内部的多余 plan 副本和重复比较逻辑。

验收标准：

1. query / sections / summary 的 runtime 结构更一致。
2. 阅读 stage state 时更容易判断真源和投影。

### 第六阶段：收敛 runtime model 与 field spec

实施目标：

1. table/gallery/kanban 提取共享的 section/item read 设施。
2. 把分散的 field 语义判断继续 spec 化。
3. 清理命名和 helpers。

验收标准：

1. view mode 间不再重复做相同 projection。
2. 新增 field kind 或 view mode 的接入点更少。

## 八、哪些事情现在不要做

### 1. 不要再发明新的总线层

不要为了“统一所有变化”再加一层更抽象的 mega delta / mega context。现在缺的是 canonical model，不是更大的中间层。

### 2. 不要把所有东西都对象化

大集合继续 keyed delta 才是对的。对象化只适用于小而成组的配置对象。

### 3. 不要给 summary 单独设计 source

summary 的输入应该仍然来自：

- section membership
- calculation index

不要再造第二份 membership source。

### 4. 不要为了简单牺牲失效精度

任何“全部重算更简单”的方案，都需要先过性能线。下一轮收敛必须是：

- 结构更简单
- 增量边界仍然存在
- 失效范围不扩大

## 九、为什么这条路线性能不会下降

### 1. 删除的是重复翻译，不是增量边界

保留：

- `plan`
- `index`
- `query`
- `sections`
- `summary`
- `source publish`

删除的是：

- 重复 transition 描述
- 重复 query 派生字段
- 过扁平的 source patch
- 展示态跨层同步

### 2. 小对象整体发布不会比散字段更差

前提是：

1. snapshot/base 做好引用复用。
2. runtime store 支持对象级等值比较。

在这个前提下，整体发布 `query/table/gallery/kanban` 往往比人工维护十几个 scalar patch 更稳，也不一定更慢。

### 3. 统一 membership 真源会减少重复遍历

当 `sections`、`summary`、`publish` 全部只认同一份 section membership 时：

1. 不需要多套 transition 转换。
2. 不需要在后面阶段再回头猜“哪些 section 真的变了”。
3. 更容易把性能热点稳定压在 index 和 stage sync，而不是 glue code。

## 十、最终判断

如果只看下一阶段，最值得做的不是再改阶段图，而是完成下面四件事：

1. `ActiveImpact` 的 membership / entry transition 彻底 canonical 化。
2. `ActiveViewQuery`、`SourceDelta.active`、`EngineSource.active` 彻底去扁平化。
3. `TableLayoutState` 彻底退出 engine。
4. `fieldSpec + read/build/sync/project/apply` 这套底层设施彻底稳定下来。

这四件事做完之后，整条链路会出现三个明显结果：

1. 状态真源更少，组合场景 bug 明显减少。
2. 文件更短，阅读路径更稳定。
3. 性能热点会更集中到真正昂贵的 index 和 stage sync，而不是散落在 glue code 和重复模型上。

这才是当前阶段长期最优、复杂度最低、同时又不牺牲性能的收敛方向。

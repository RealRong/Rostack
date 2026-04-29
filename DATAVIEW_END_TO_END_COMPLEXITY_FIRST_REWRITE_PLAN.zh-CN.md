# Dataview 端到端如何变薄

## 目标

- 目标不是继续补局部性能点，而是把 dataview 从 `MutationDelta` 到 projection/store 的整条链压薄。
- 不保留兼容层。
- 不保留两套 runtime、delta、impact、plan。
- 不在现有厚中间层上继续叠加 helper、adapter、facts、surface DSL。

这里说的“变薄”，不是把 phase、planner、dirty propagation 全删掉，而是把它们收缩成基础编排设施，不再承担 domain 语义翻译。

## 什么叫“薄”

一条链是否薄，核心看三件事：

1. 同一份语义是否只解释一次。
2. 中间层是否只负责编排，不再发明第二套领域语言。
3. 下游是否能直接消费上游结果，而不是再套一层 patch/surface/helper 才能运行。

所以复杂度的根因，不是“有 phase graph”或者“有 planner”，而是这条链里同一件事被重复解释：

```ts
MutationDelta
  -> DataviewMutationDelta
  -> frame
  -> reasons
  -> action
  -> publish patch
  -> projection surface
  -> stores
```

真正要做的是把这条链裁成：

```ts
MutationDelta
  -> domain change/view
  -> active runtime
  -> published ViewState
  -> thin incremental store sync
```

## 最终薄链路

最终推荐保留的主链：

```ts
commit
  -> document + MutationDelta
  -> dataview change view
  -> resolve active spec
  -> run active phases
  -> produce ViewState
  -> sync stores
```

每一层只做一件事：

- `shared/mutation`：把 document 改对，并产出 canonical `MutationDelta`
- `dataview change view`：把通用 delta 投影成 dataview 可直接读取的领域变化视图
- `active runtime`：基于 document + change 计算 active view
- `publish`：直接产出最终 `ViewState`
- `shared/projection`：只负责薄编排和 store 出口

## 哪些层该保留，哪些职责必须变薄

### 1. shared/mutation 继续保留，但只保留 canonical 写入职责

`shared/mutation` 的定位应该很明确：

- apply/commit
- history
- canonical `MutationDelta`
- typed path / entity change 查询能力

它不应该继续长成 projection 语义层。

最终判断标准：

- 上游只承诺 “document 变了什么”
- 不承诺 “dataview / whiteboard 应该怎么跑”

也就是说，`shared/mutation` 不该负责 domain planner，也不该逼 domain 在下游再包很多 helper 才能使用。

### 2. Dataview 入口只保留一次 domain 解释

dataview 需要一个很薄的 domain delta 视图，但这层必须满足两个条件：

- 它只是 `MutationDelta` 的 dataview 读取视图
- 它不再派生第二套长期持久化 facts/runtime 模型

也就是说，可以有：

```ts
delta.change('view.query')
delta.select(dataviewSelectors.viewQuery('sort'))
```

但不应该继续发展成：

- `DataviewDeltaFacts`
- `DataviewMutationDelta -> frame -> reasons`
- planner/stage/index 各自再包一层 helper

入口层的目标只有一个：让 dataview runtime 直接读取变化，而不是先把变化翻译成更多中间对象。

### 3. Dataview runtime 保留 phase，但 phase 必须薄

phase 本身不是问题。

可以保留：

- `index`
- `query`
- `membership`
- `summary`
- `publish`

但 phase 只应该表达执行顺序和阶段边界，不应该再各自维护一套“半语义事实系统”。

最终 phase 设计应满足：

- phase 输入直接吃 `document + change + previous active state`
- phase 输出直接给下一个 phase
- 是否 `reuse / sync / rebuild` 只是一层薄 action
- 不再维护厚 `reasons`

也就是说，允许有 planner，但 planner 只能薄到这个级别：

```ts
plan = {
  index: 'sync',
  query: 'sync',
  membership: 'reuse',
  summary: 'reuse',
  publish: 'sync'
}
```

而不应该再有这种额外 DSL：

```ts
reasons = {
  query: { sync: true, reuse: { matched: true, ordered: false } },
  summary: { rebuild: false, sync: true, sectionChanged: false },
  index: { switched: false, bucketChanged: true }
}
```

结论：

- `planner` 可以保留
- `reasons` 应该删掉

### 4. index 可以保留，但必须降级为 active runtime 的内部设施

复杂度不在 “index 存在”，而在于 index 被抬成了一套顶层 runtime 语义。

最终应收缩为：

- index 是 active runtime 的内部阶段
- index 是否复用、同步、重建，只服务于 active 计算
- index 结果不再外泄成下游 planner 的厚语义来源

这里不再保留两种路线，直接定最终方案：

- 不保留 bank
- 不保留 `entries/currentKey/switch`
- 只保留当前 active index
- `active spec` 变了就 rebuild 当前 index

同时保留一条约束：

- index 是 active runtime 的内部执行设施
- 不是 projection 顶层公共模型

### 5. publish 保留，但必须从“结构协调层”变成“最终视图产出层”

现在 publish 太厚，是因为前面 runtime state 和后面 `ViewState` 不是一个方向。

最终 publish 应只负责：

- 从 active runtime state 直接产出 `ViewState`
- 做少量引用复用

它不应该继续负责：

- 维护另一套持久 patch state
- 生产一套 projection family patch 语言
- 为 shared/projection 的厚 surface 适配结构

判断标准很简单：

- 如果 publish 之后还要再翻译一层，说明它还不够薄

### 6. shared/projection 可以保留，但必须变成薄编排 + store adapter

这里不应该简单写成“删掉 shared/projection”。

`shared/projection` 本身可以很有价值，前提是它够薄。它适合保留这些职责：

- phase graph
- phase changed 状态
- planner 执行顺序
- dirty 传播
- store sync
- store trace

但它不该继续承担这些职责：

- 抽象 dataview/whiteboard 自己的 domain 语义
- 发明通用 `surface.changed / surface.patch` 语义让下游适配
- 逼各 domain 维护一套 family snapshot/family patch 中间层

所以最终目标不是“没有 shared/projection”，而是：

```ts
domain runtime result
  -> thin projection adapter
  -> stores
```

而不是：

```ts
domain runtime result
  -> publish patch
  -> generic surface DSL
  -> family snapshot cache
  -> stores
```

## Dataview 最终应收缩成什么

## 一份 active spec

只保留“当前 active view 需要什么”，不要混 previous、binding、helper methods：

```ts
interface DataviewActiveSpec {
  id: ViewId
  view: View
  query: QueryPlan
  section?: {
    fieldId: FieldId
    mode?: ViewGroup['mode']
    sort?: ViewGroup['bucketSort']
    interval?: ViewGroup['bucketInterval']
    showEmpty: boolean
  }
  calcFields: readonly FieldId[]
  demand: NormalizedIndexDemand
}
```

## 一份 active state

只保留当前 active runtime 真正要复用的状态：

```ts
interface DataviewRuntimeState {
  revision: number
  document: DataDoc
  active?: {
    spec: DataviewActiveSpec
    index: IndexState
    query: QueryPhaseState
    membership: MembershipPhaseState
    summary: SummaryPhaseState
    view: ViewState
  }
}
```

不再保留：

- `frame`
- `lastActive`
- 厚 `reasons`
- 独立 `patches.*` 持久状态
- dataview 自己的 family snapshot cache

index 也同步收口为单实例：

```ts
interface DataviewActiveIndex {
  demand: NormalizedIndexDemand
  state: IndexState
}
```

不会再有：

- `entries`
- `currentKey`
- `switch`
- bank 式多 view index 缓存

## 一套 update loop

最终主循环应该直接表达业务，而不是表达中间解释层：

```ts
function updateDataviewRuntime(
  previous: DataviewRuntimeState,
  document: DataDoc,
  delta: MutationDelta
): DataviewRuntimeState {
  const change = createDataviewChange(document, delta)
  const spec = resolveActiveSpec(document)

  if (!spec) {
    return {
      revision: previous.revision + 1,
      document
    }
  }

  const index = runIndexPhase(previous.active?.index, spec, change)
  const query = runQueryPhase(previous.active?.query, spec, change, index)
  const membership = runMembershipPhase(previous.active?.membership, spec, change, index, query)
  const summary = runSummaryPhase(previous.active?.summary, spec, change, index, membership)
  const view = publishView(previous.active?.view, spec, query, membership, summary)

  return {
    revision: previous.revision + 1,
    document,
    active: {
      spec,
      index,
      query,
      membership,
      summary,
      view
    }
  }
}
```

这条链的关键点：

- 只有一份变化入口：`change`
- 只有一份业务主状态：`active`
- phase 是运行步骤，不是语义解释层
- publish 之后直接得到最终 `ViewState`

## active API 也要一起变薄

当前最别扭的点之一，是写路径很多地方依赖：

```ts
engine.current().active?.view
```

长期最优不是让写路径继续依赖 projection snapshot，而是把读模型分开：

```ts
interface DataviewCurrent {
  rev: number
  doc: DataDoc
  active?: ViewState
  docActiveViewId?: ViewId
  docActiveView?: View
}
```

规则应当明确：

- `current.active`：published projection `ViewState`
- `current.docActiveViewId/current.docActiveView`：当前 document 里的 active view

这样：

- 写路径读 document active view
- 读路径读 published `ViewState`
- 两边不再通过一个半业务半展示对象耦合

## 哪些东西说明系统还不够薄

如果还出现下面这些现象，说明链路还没压薄：

- 同一类变化要先进 `delta`，再进 `facts`，再进 `frame`，再进 `reasons`
- 下游阶段需要大量专用 helper 才能知道“到底哪里变了”
- publish 之后还要再翻译成另一套 generic surface 结构
- store sync 的精确通知依赖厚 family snapshot cache，而不是直接消费 domain/runtime 已经知道的增量结果
- index 的执行细节暴露成下游 planner 的决策语义

换句话说，helper 多，不一定代表 API 一定错误；但如果 helper 的职责是“替主模型补语义”，那通常就说明底层模型还不够直。

## 最终裁剪原则

可以保留的：

- canonical `MutationDelta`
- 薄 domain delta view
- phase graph
- 薄 planner
- dirty propagation
- 单 active index
- publish 引用复用
- thin incremental store adapter

必须裁掉的：

- 并列的 facts/runtime/delta 模型
- 厚 `reasons`
- bank 式顶层 index 语义
- generic surface 领域语义层
- family snapshot/family patch 适配缓存
- 写路径对 projection snapshot 的依赖

## 实施顺序

### Phase 1. 先定义“薄”的边界

- 明确 `shared/mutation` 只输出 canonical delta
- 明确 dataview 入口只有一层 domain change view
- 明确 `shared/projection` 只保留编排和 store 出口

完成标准：

- 文档和代码边界上，不再把 `shared/projection` 当 domain 语义容器

### Phase 2. 把 dataview runtime 压成单 active 主状态

- 合并 current active 相关持久状态
- 删除 `frame / lastActive / 厚 reasons` 这类中间长期模型
- phase 直接围绕 `active` 运行

完成标准：

- runtime 主链收口到 `change -> spec -> active phases -> view`

### Phase 3. 把 planner 压成薄 action 编排

- planner 只决定 phase action
- phase 自己消费输入并产出结果
- 不再维护厚 facts/reasons 树

完成标准：

- 不再存在 “事实模型 -> reasons DSL -> action” 的三级翻译

### Phase 4. 把 publish/store sync 压薄

- publish 直接产出 `ViewState`
- store sync 继续做精确增量通知
- 这些增量由 domain/runtime 直接产出，不再先翻译成厚 `surface/patch/family snapshot` 语义
- 如复用 `shared/projection`，只复用薄 incremental adapter 能力

完成标准：

- dataview 下游不再依赖厚 `surface/patch/family snapshot` 语义

### Phase 5. 把 active API 与 projection snapshot 解耦

- `engine.current()` 同时提供 projection active 和 document active view
- 写路径切到 document active view
- 读路径继续使用 published active view

完成标准：

- active 写入不再被 projection snapshot 结构绑住

## 最终结论

这条链真正该做的，不是继续争论“要不要 phase graph / planner / dirty propagation”，而是把它们都变薄：

- `shared/mutation` 薄成 canonical 写入层
- dataview 入口薄成一次 domain change 解释
- runtime 薄成单 active state + phase 执行
- planner 薄成 action 编排
- publish 薄成最终 `ViewState` 产出
- `shared/projection` 薄成 store adapter 与执行编排

最终复杂度最低的方向，不是“没有基础设施”，而是：

**基础设施继续存在，但只做基础设施；domain 语义只在 domain 内解释一次，并直接流到最终结果。**

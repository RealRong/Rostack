# Dataview Engine 底层设施与链路收敛方案

这份文档讨论的不是下一轮局部性能优化，而是另一个方向：

如果允许浪费几毫秒，换取更简单、更稳定、更容易扩展的代码结构，`dataview-engine` 还应该怎么继续收敛？

结论先写在前面：

1. `plan / index / snapshot / source` 这四层不建议继续合并。
2. 现在最该砍的不是阶段数，而是阶段之间重复的模型、共享可变状态，以及为了增量而叠出来的中间语言。
3. 最优方向不是继续给 `summary`、`membership`、`publish` 加 fast path，而是把上层统一收口到极少数底层读模型。
4. 底层模型也不需要继续膨胀成很多一等概念，收成 `Rows / Selection / Partition / reduce` 就够了。
5. 允许在阶段边界做适度 materialize，允许 `summary` 在局部场景回退几毫秒，换明显更低的复杂度和更低的出错概率。

本文目标只有三个：

1. 降低复杂度。
2. 降低出错概率。
3. 性能可以小幅回退，但不能回到不可接受水平。

## 一、现在为什么会觉得代码“太抽象”

现在的问题不是“类型太多”，而是同一层代码同时在处理多种语义：

1. 业务语义。
   例如 query、group、section、summary、publish。
2. 存储语义。
   例如 `recordIds`、`recordIndexes`、`entries`、`entriesByIndex`、overlay map。
3. 增量语义。
   例如 rebuild、sync、patch、reuse、transition。

一旦三种语义同时出现在一个函数里，代码就会越来越难读。

最典型的症状是：

1. 上层阶段需要知道底层到底是 `Map` 还是 dense array。
2. 同一份数据同时存在 `id` 模型和 `index` 模型两套读法。
3. `query` 改写共享 impact，`membership` 再读，`summary` 再继续翻译，形成跨阶段 side effect。
4. 一个 stage 同时承担两种职责，例如 membership 既管 section 结构，又管 item identity projection。
5. 为了性能加的 fast path 直接侵入业务逻辑，最后比业务本身还重。

这类结构短期内可以把某个热点打下去，但长期一定会带来两个问题：

1. 心智模型越来越重。
2. 组合场景越来越容易出 bug。

## 二、真正应该保留的边界

主链路还是应该保留下面四层：

1. `plan`
2. `index`
3. `snapshot`
4. `source`

这四层分别对应四个合理边界：

1. 配置编译边界。
2. 昂贵索引复用边界。
3. active view 语义边界。
4. 对外发布边界。

所以问题不在“阶段太多”，而在“阶段之间没有统一的读模型”，以及“阶段之间还在反复翻译同一个事实”。

当前很多复杂度，其实都来自下面几类重复并存：

1. `recordId` 和 `recordIndex`
2. `Map` 和 dense array
3. `Selection` 语义和裸 `recordIds` 数组
4. membership 真结构和 item projection 缓存
5. snapshot 真实结果和 patch 中间语言
6. 不可变 commit 影响和可变 stage side effect impact

如果这些差异一直暴露在 `query / membership / summary / publish` 里，代码只会越来越抽象。

## 三、下一步最值得砍掉的结构

这里不讨论“理论上可以优化什么”，只讨论最值得砍、收益最大的部分。

### 1. 共享可变的 `ActiveImpact`

`CommitImpact` 这种 document 级事实需要保留。

但现在这种“先创建 `ActiveImpact`，然后 query 往里写，membership 再读，summary 再读”的模式，不是稳定的长期形态。

最终应该变成：

1. 保留不可变的 `BaseImpact`
2. 每个 stage 只返回自己的 `state + delta`
3. 下游显式消费上游 delta
4. 不再通过共享对象传播中间 side effect

也就是：

- `query` 不再写 `impact.query.visibleAdded`
- `membership` 不再依赖一个被上游改写过的对象
- `summary` 不再继续消费被多次转译后的共享包

这一步对性能通常是中性的，但对可读性和稳定性提升很大。

### 2. `membership` 中的 `projection`

`membership` 的职责应该只有一个：

把当前可见记录组织成 section。

item identity projection 是另一件事，它属于发布或 source 侧的缓存，不应该和 membership 主状态绑定在一起。

最终应该变成：

1. `membership` 只产出 section 结构
2. `publish` 或 `source` 侧根据 section 结构维护 item identity
3. `MembershipRuntimeState` 不再同时挂 `structure + projection`

这一步可以明显减少“一个状态承担两类职责”带来的分叉和 bug。

### 3. `MembershipState` 里的多套平行事实

现在 section 成员关系往往同时暴露为：

1. `recordIds`
2. `recordIndexes`
3. `keysByRecord`

这本质上是同一个事实的三种表示。

如果它们同时都是公开 contract，就一定会有地方读 A，有地方信 B，最后出现组合场景不一致。

最终应该收成：

1. section 的唯一真源是 `Selection`
2. `recordIds` 只是 `Selection` 的投影
3. `keysByRecord` 是 reader 或 cache，不是主 contract

也就是最终的 membership 应该是 `Partition<SectionKey>`，而不是“多套成员结构并存”的对象。

### 4. 逐层转译的 record-level delta 链

当前链路里容易出现这种模式：

1. query 先产出 visible added / removed
2. membership 再把它翻成 record -> section change
3. summary 再把它翻成 section 内 reducer 增量

这条链的最大问题不是性能，而是过于脆弱。

如果允许损失几毫秒，长期更优的做法是：

1. 保留 stage 级 delta
2. summary 在 touched section 级别重建
3. 不再执着于 record-level 精细 patch 贯穿到底

这会让 `summary` 更短、更稳，也更容易验证正确性。

### 5. 独立的 patch 中间语言

`snapshot` 本身已经是真结果。

如果还要再维持一套独立的 `ActivePatch` 语言，让 `publish` 先把 snapshot 翻成 patch，再让 `source` 把 patch 还原成 stores，这实际上是多了一层翻译。

最终更好的方向是：

1. `snapshot` 继续作为真源
2. 如果 `source` 需要 diff，它就在 source 侧本地做
3. patch 只作为 sink-local 优化，而不是整条 runtime 主 contract

这一步未必需要立即删除 patch，但应该明确它不是长期主模型。

## 四、核心原则

### 1. 统一上层规范读模型

`index` 之上，业务阶段应该尽量只看一种规范模型，而不是多种存储实现。

### 2. 允许阶段边界 materialize

如果某个阶段边界做一次 plain array 或 plain map 的 materialize，能让后续两三层代码都显著变简单，这通常是值得的。

### 3. 把复杂度留在底层设施，不留在业务阶段

复杂的地方应该是通用读模型和通用 reducer，而不是 `summary/sync.ts`、`membership/sync.ts`、`publish/patch.ts`。

### 4. 增量优化是底层能力，不是业务代码职责

业务阶段应该声明“我要读什么”，而不是声明“我怎么 patch 最快”。

### 5. 内部设施可以比公开 contract 更丰富

不是所有底层结构都应该进入 public state contract。

像 dense column、materialized selection、`keysByRecord` cache、projection cache 这类东西，更适合做 runtime-only 内部设施。

### 6. 不为了抽象而抽象

底层统一模型很重要，但也不能越补越多，最后又引入新的抽象负担。

长期最优的形态不是：

1. 给每种语义都单独造一个 interface
2. 给每个优化点都单独造一个策略对象

而是：

1. 只保留极少数真正稳定的核心模型
2. 其余能力尽量变成这些模型上的方法或内部实现

## 五、最终应该保留的底层模型

这里是这份文档最重要的结论。

之前如果把底层模型拆成 `Order / Column / Selection / Partition / Fold / MaterializePolicy` 六类，一开始看很整齐，但长期看还是偏重。

更合适的最终形态是收成下面四类：

1. `Rows`
2. `Selection`
3. `Partition`
4. `reduce`

其中：

1. `Order` 和 `Column` 收进 `Rows`
2. `Fold` 收进 `reduce`
3. `MaterializePolicy` 收进工厂内部，不作为公开一等模型

### 1. `Rows`

职责：

1. 表示当前活动 records 的标准顺序。
2. 提供 `id <-> index` 的统一读接口。
3. 提供与顺序对齐的列读取能力。
4. 隔离 `Map<RecordId, number>`、dense array、overlay 等底层实现。

建议 API：

```ts
export interface Rows {
  ids: readonly RecordId[]
  indexOf(id: RecordId): number | undefined
  idAt(index: number): RecordId | undefined
  column: {
    value(fieldId: FieldId): ReadColumn<unknown> | undefined
    calc(fieldId: FieldId): ReadColumn<CalculationEntry> | undefined
    search(fieldId: FieldId): ReadColumn<string> | undefined
    bucket(spec: BucketSpec): ReadColumn<readonly SectionKey[]> | undefined
  }
}

export interface ReadColumn<T> {
  at(index: number): T | undefined
  byId(id: RecordId): T | undefined
}
```

说明：

1. 高频路径优先走 `at(index)`。
2. `byId` 只是兼容和低频辅助读法。
3. 上层阶段不应该再直接操作 `entries / entriesByIndex / order map`。

### 2. `Selection`

职责：

1. 表示 `Rows` 上的一个子集。
2. 统一“全量可见”和“部分可见”的读法。
3. 隔离 `recordIds` 和 `recordIndexes` 双形态。

建议 API：

```ts
export interface Selection {
  rows: Rows
  indexes: readonly number[]
  read: {
    count(): number
    indexAt(offset: number): number | undefined
    idAt(offset: number): RecordId | undefined
    ids(): readonly RecordId[]
  }
}
```

说明：

1. `Selection` 的标准表达应该是 `indexes`。
2. `ids()` 是投影结果，不应该反过来成为下游真源。

### 3. `Partition<K>`

职责：

1. 表示按 key 分组后的多个 `Selection`。
2. 统一 section membership 的表达。
3. 把 `recordIdsBySection`、`keysByRecord`、`recordIndexesBySection` 这种平行结构收敛为一个通用模型。

建议 API：

```ts
export interface Partition<K extends string> {
  order: readonly K[]
  get(key: K): Selection | undefined
  keysOf(id: RecordId): readonly K[]
}
```

说明：

1. 对 grouped view，这就是 section membership 的规范模型。
2. 对 ungrouped view，也可以退化为只有一个 `root` key 的 `Partition`。
3. `keysOf(id)` 背后可以有 cache，但 cache 不需要成为公开主结构。

### 4. `reduce`

职责：

1. 对 `Selection + ReadColumn<T>` 做聚合。
2. 隔离 reducer 的 dense 读实现。
3. 让业务层不再关心 `entries` 还是 `entriesByIndex`。

建议 API：

```ts
export const reduce = {
  summary(input: {
    selection: Selection
    column: ReadColumn<CalculationEntry>
    capabilities: ReducerCapabilitySet
  }): FieldReducerState
}
```

说明：

1. `summary` 不应该直接理解 `recordIds`、`recordIndexes`、`entriesByIndex`。
2. 它只应该调用 `reduce.summary(...)`。

## 六、按这套模型重写后，整条链怎么变简单

### 1. `index`

职责收敛为：

1. 维护 `Rows`
2. 维护昂贵索引
3. 向上提供统一列读取能力

最终形态可以近似理解为：

```ts
export interface ActiveIndex {
  rows: Rows
}
```

`index` 不再直接向上暴露太多存储细节。

### 2. `query`

职责收敛为：

1. 基于 `Rows` 产出几个标准 `Selection`
2. 不再自己携带太多裸数组之外的辅助结构
3. 不再通过共享 impact 向下写 side effect

最终输出可以收成：

```ts
export interface QueryResult {
  matched: Selection
  ordered: Selection
  visible: Selection
}
```

这样 `query` 只回答一件事：

哪些记录现在属于 active view，以及以什么顺序参与后续阶段。

### 3. `membership`

职责收敛为：

1. 把 `query.visible` 分成 `Partition<SectionKey>`
2. 提供 section label、color、bucket metadata
3. 不再手工维护多套 section 成员结构
4. 不再负责 item identity projection

最终输出近似：

```ts
export interface MembershipResult {
  sections: Partition<SectionKey>
  meta: ReadonlyMap<SectionKey, {
    label: Token
    color?: string
    bucket?: SectionBucket
  }>
}
```

这样 `membership` 只做一件事：

把可见记录组织成 section。

### 4. `summary`

职责收敛为：

1. 对每个 section 的 `Selection` 做 `reduce.summary`
2. 不再关心 section 成员是 `recordIds` 还是 `recordIndexes`
3. 不再自己理解 dense array 和 map 的差别
4. touched section 允许直接重建，不再执着于 record-level 精细 patch

最终逻辑会接近：

```ts
for (const sectionKey of membership.sections.order) {
  const selection = membership.sections.get(sectionKey)
  if (!selection) {
    continue
  }

  const summary = reduce.summary({
    selection,
    column: index.rows.column.calc(fieldId)!,
    capabilities
  })
}
```

这会比现在更直观，也更容易验证。

### 5. `publish`

职责收敛为：

1. 把 `QueryResult`、`MembershipResult`、`SummaryResult` 投影成 `ViewState`
2. 不再重新理解 section membership
3. 不再重新解释 query 语义
4. 不再持有独立的 item projection 真源

它应该只做 projection，不做第二轮语义推导。

### 6. `source`

职责收敛为：

1. 接收 `ViewState`
2. 如果需要 diff，在 source 侧本地生成
3. 如果需要 item identity cache，也在这里维护

也就是说：

1. `snapshot` 是语义真源
2. `source` 是发布和订阅真源
3. patch 只是 source 侧的实现选择，不再是整条链共享的主语言

## 七、哪些复杂度应该被明确移出业务阶段

下面这些事情，不应该继续出现在 `query / membership / summary / publish` 的主逻辑里：

1. `recordId` 和 `recordIndex` 之间来回切换
2. `entries` 和 `entriesByIndex` 双读面切换
3. `keysByRecord` 是否已经 materialize 的判断
4. projection cache 是否应该复用
5. overlay depth / patch builder / materialize 阈值判断
6. 业务逻辑里手写很多 capability fast path
7. 共享 impact 的增量 side effect 写回

这些复杂度应该分别收回到：

1. `Rows`
2. `Selection`
3. `Partition`
4. `reduce`
5. `source` 内部 diff / projection 缓存

## 八、允许浪费几毫秒，具体应该浪费在哪里

如果允许少量性能损耗，我认为最值得“变简单”的地方有四个。

### 1. `summary` 更偏向 section 级重建

现在 summary 热点已经被压下来了。

在这种情况下，比起继续写很多细碎的 record-level reducer 增量逻辑，更好的策略是：

1. section touched 时直接重建这个 section 的 summary
2. untouched section 直接复用

这会让逻辑更稳定，代码也更短。

### 2. `membership` 总是产出完整 `Partition`

不要让 `membership` 有时产 `recordIds`，有时产 `recordIndexes`，有时只留差量。

它应该总是产：

1. section order
2. section meta
3. section partition

这样后面每一层都能统一消费。

### 3. 热读路径主动 materialize

如果一层数据后面会被多个阶段频繁读取，那就不要过度依赖 overlay。

尤其是：

1. summary 用到的 calculation column
2. membership 用到的 partition cache
3. source 用到的 item identity cache

这些结构适度 materialize 成 plain structure，通常能换来更低的全链复杂度。

### 4. 把 patch 计算留在 source 侧

如果最终一定还需要 patch，也应当是 sink-local diff。

这样浪费的只是 source 侧的一点局部计算，但换来的是：

1. snapshot contract 更干净
2. publish 更单纯
3. patch 不再反向影响上游语义结构

## 九、什么不要再做

下面这些方向我不建议继续投入：

### 1. 不要继续在每个业务阶段堆更多 fast path

这只会让代码越来越像“性能实验”，不像稳定系统。

### 2. 不要把 `query / membership / summary` 强行合成 mega stage

这会降低边界清晰度，增加耦合，不是真正的简化。

### 3. 不要让更多底层优化结构进入 public contract

像 `recordIndexes`、dense column、projection cache、materialized selection，如果只是内部性能设施，最好尽量留在 runtime-only 内部模型。

### 4. 不要让 `source` 成为第二套语义引擎

`source` 只负责发布，不应该再次定义 query、membership、summary 的语义。

### 5. 不要继续扩张底层概念数量

长期最优不是持续补新的名词，而是把现有能力压回少数几个核心模型里。

## 十、建议的迁移顺序

如果按长期最优做，而不是按单点热点做，我建议分 6 步：

### 第一步：先收紧阶段契约

先把共享可变 `ActiveImpact` 收成：

1. 不可变 `BaseImpact`
2. stage-local `delta`

这一步先不改算法，只改数据流方向。

### 第二步：把 item projection 从 membership 挪走

先让 `membership` 只负责 section 结构，把 projection 移到 `publish` 或 `source`。

这一步能最快降低混合职责。

### 第三步：补 `Rows / Selection / Partition / reduce` adapter

这一步允许先做 adapter，把现有结构包装进去。

### 第四步：让 `summary` 只消费 `Selection + ReadColumn`

这是最容易直接收敛复杂度的地方，也是最能验证这套设施是否成立的地方。

同时把 summary 的主策略改成：

1. touched section rebuild
2. untouched section reuse

### 第五步：让 `membership` 统一产出 `Partition`

把 section 相关的各种平行结构收成一个真模型。

### 第六步：把 patch 收口到 source 内部

等 `snapshot`、`publish` 跑稳以后，再逐步删除：

1. `MembershipRuntimeState.structure + projection` 双职责
2. `recordIds / recordIndexes / keysByRecord` 并列 contract
3. 依赖共享 impact side effect 的增量逻辑
4. runtime-wide 的 patch 中间语言

## 十一、最终的判断

如果目标是：

1. 代码更简单
2. 未来扩展更稳
3. 愿意接受几毫秒的损耗

那么最优路线不是继续做局部热点优化，而是：

1. 保留现有主阶段边界
2. 继续砍掉共享可变 impact、membership+projection 混合状态、多套 section 真源、独立 patch 语言
3. 把底层读模型收成 `Rows / Selection / Partition / reduce`
4. 允许在阶段边界做适度 materialize

一句话总结：

`dataview-engine` 现在最缺的不是更多优化，而是把整条链收成一套真正单一的数据流：

`BaseImpact -> Rows -> Selection -> Partition -> Summary -> Snapshot -> Source`

上层阶段应该只操作 `Rows / Selection / Partition / reduce`，而不应该继续直接操作 `recordIds / recordIndexes / entries / entriesByIndex / overlay / patch / projection cache`。

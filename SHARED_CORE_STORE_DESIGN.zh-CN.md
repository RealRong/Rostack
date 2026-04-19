# `shared/core/src/store` 设计思路

本文基于 `shared/core/src/store` 当前实现整理，目标是回答三件事：

1. 这个 store 内核的分层和设计意图是什么。
2. 当底层数据发生一次 `Splice` 时，如何高效判断哪些投影（projection / derived data）失效。
3. 当系统里有 1000 个派生指标时，如何避免每一帧全量重算。

## 一、先看它现在是什么

这套实现不是 Redux 风格的“单一状态树 + 全量 selector”，而是一个更偏“响应式内核”的设计。核心思路是：

- 原始数据层负责精确发布变更。
- 派生层在读取时动态收集依赖。
- 运行时负责把“依赖变脏”和“真正重算/通知”解耦。
- keyed 版本把“局部 key 失效”作为一等能力。
- 调度层允许把高频更新合并到 `sync`、`microtask` 或 `raf`。

换句话说，它的目标不是“任何数据都塞进一个 store”，而是把下面几件事做小、做准：

- 依赖追踪尽量自动。
- 通知尽量局部。
- 计算尽量懒。
- 高频写入尽量合并。

## 二、模块分层

### 1. 读写原语

`types.ts` 定义了几种最小接口：

- `ReadStore<T>`: `get()` + `subscribe()`
- `KeyedReadStore<K, T>`: `get(key)` + `subscribe(key, listener)`
- `ValueStore<T>`: 可写的单值 store
- `KeyedStore<K, T>`: 可写的 keyed store
- `Staged*Store`: 带延迟写入和显式 `flush()` 的 store

这里最重要的建模选择是：`KeyedReadStore` 不是“普通 store 里塞了一个 Map”，而是“按 key 订阅的读模型”。这个选择直接决定了后面可以做局部失效，而不是每次都让整张表变脏。

### 2. 运行时

`runtime.ts` 管理全局 store runtime：

- `activeFrame`: 当前派生计算栈帧
- `pendingRoots`: 待刷新的 derived root
- `pendingListeners`: 待通知的 listener
- `batchDepth` / `flushing` / `revision`

它做的事很像一个极小型 reactive scheduler：

- 计算期间把读取行为挂到当前 frame。
- 写入时不立刻递归重算整棵图，只是把 root 标记进队列。
- flush 时先刷新 root，再发 public listener，保证 listener 读到的是已经稳定的值。

### 3. 依赖收集

`read.ts` 和 `deps.ts` 是整个系统的关键。

#### `read()` 才会追踪依赖

在派生计算里不能直接 `store.get()`，只能 `read(store)`。原因很直接：

- `get()` 是普通读取。
- `read()` 会把 `(store, key)` 记到当前 computation frame。

因此依赖追踪是“按实际读取路径动态收集”的，不需要手动声明依赖。

#### 依赖是二元组：`(store, key)`

`deps.ts` 里把依赖统一表示成：

- 普通 store: `(store, NO_KEY)`
- keyed store: `(store, actualKey)`

这个设计很重要，因为它意味着“失效粒度”天然可以落到 key 级别，而不是 store 级别。

#### 依赖订阅可复用

每次 derived 重算后，不是把旧依赖全删再全订阅，而是通过 `reconcileDependencies()` 做 diff：

- 依赖序列不变，直接复用。
- 新增依赖才订阅。
- 消失依赖才退订。

这让条件分支型 derived 也能稳定运行，不会因为每次重算都全量拆装订阅而抖动。

### 4. Derived 节点

`derived.ts` 里的 `createDerivedNode()` 是单值派生的核心。

它有三个状态：

- `dirty`
- `clean`
- `computing`

语义是：

- 依赖变更时，只把自己标为 `dirty`。
- 真正有人读取，或者 runtime flush 到它时，才执行 `ensureFresh()`。
- 如果值没变，不继续传播 public 通知。

这是一种典型的“脏标记 + 懒求值”模型。

它还有两个很实用的工程特征：

- 循环依赖检测：通过 computation token 检查递归环。
- 空闲释放：没有订阅者时清理依赖，避免长期挂住下游订阅。

### 5. Keyed derived family

`family.ts` 的 `createKeyedDerivedStore()` 本质上是：

- 为每个 key 懒创建一个 `DerivedNode`
- 用缓存保存这些 node
- 在 node 空闲时异步回收

这层对性能非常关键。因为它把“大量派生指标”从“一整个投影函数”拆成了“每个 key 一个小 derived node”。

结果是：

- 没被读过/订阅过的 key，不会建 node。
- 没有订阅者的 key，会被逐步回收。
- 某个 key 失效时，只影响这个 key 对应的 node。

### 6. Projected store

`projected.ts` 提供两类能力：

- `createProjectedStore`: 从一个源 store 投影出一个单值
- `createProjectedKeyedStore`: 从一个源 store 投影出一个 keyed 结果

这里有两个模式：

#### 同步模式

`schedule: 'sync'` 时，实际上退化成 derived：

- 单值投影 -> `createDerivedStore`
- keyed 投影 -> `createKeyedDerivedStore`

优点是精确依赖追踪，缺点是投影函数自身要足够细。

#### 异步合并模式

`schedule: 'microtask' | 'raf'` 时，它会：

- 先订阅 source
- 只保留 latest source snapshot
- 把多次源变更合并成一次 `select(nextSource)`

这特别适合“源变化频繁，但 UI 或上层不需要同步逐次观察”的场景。

### 7. Batch / staged / raf

`batch.ts`、`staged.ts`、`raf.ts` 解决的是更新风暴问题。

它们背后的统一思路是：

- 内部 listener 可以同步接到脏信号，保证 derived 图尽快一致。
- public listener 延后合并，减少重复通知。
- 多次 write 可以汇总到微任务或下一帧。

这也是为什么当前实现已经具备“别在每一帧重算所有东西”的基础条件。

## 三、这一套设计解决了什么问题

我认为这套 store 的核心价值有四点。

### 1. 让依赖天然精确

依赖不是静态声明的，而是由 `read()` 真实访问路径决定的。

好处是：

- 条件依赖是正确的。
- 嵌套 derived 可以自然组合。
- keyed 依赖天然落在 `(store, key)` 级别。

### 2. 让失效和重算分离

依赖变更时先标脏，不立即做级联重算。真正重算发生在：

- 有人读取这个节点时
- runtime flush 时

这让系统有空间做批处理、去重和调度。

### 3. 让局部性成为默认

`KeyedStore`、`KeyedReadStore`、`createKeyedDerivedStore()` 这几层配合后，系统默认更偏向：

- “某几个 key 变了”

而不是：

- “整个 store 变了”

这对实体表、节点图、白板对象、列表项状态都很重要。

### 4. 让空闲节点可以消失

`DerivedNode` 和 `family` 都支持 idle cleanup，这意味着计算图不会无限增长。对编辑器或画布类系统，这个能力比“算得快”同样重要。

## 四、当前实现的边界

必须明确一点：`shared/core/src/store` 当前实现已经很适合“key 级局部失效”，但它还没有一个显式的“序列编辑 / splice delta”模型。

也就是说：

- 如果你把底层数据建模为 keyed 实体表，那么局部失效已经很好做。
- 如果你把底层数据建模为一个整数组/整张 Map，再在 `projected.ts` 里做大投影，那么高频 `splice` 仍可能退化成较粗粒度的重算。

尤其是 `createProjectedKeyedStore()` 的异步模式里，`commit(next)` 目前会用 `collectChangedKeys(previous, next)` 遍历 `previous/next` 的 key 并比较值。这个实现对一般 keyed map 已经够用，但它不是“splice-aware incremental projector”。

所以，回答下面两个问题时，要区分：

- 当前 store 已经支持什么。
- 如果要把 `splice` 做到真正高效，还应该在上层补什么结构。

## 五、问题一：底层发生一次 `Splice`，如何高效计算哪些投影失效

### 先给结论

不要把 `splice` 当成“数组整体换了一个新值”，要把它当成一条结构化 delta：

```ts
type SpliceDelta<Id> = {
  start: number
  deleteCount: number
  inserted: readonly Id[]
  removed: readonly Id[]
}
```

然后把投影的依赖关系拆成三类：

- 实体依赖：依赖哪些 `id`
- 顺序依赖：依赖哪一段 order / 哪个 index / 哪个 window
- 聚合依赖：依赖哪些区间摘要或全局摘要

最后只让和这条 delta 有交集的投影失效。

### 为什么不能只看“哪些值变了”

`splice` 和普通 `set(id, value)` 不一样。它有两种影响：

1. 实体集合变化：插入了哪些 id，删除了哪些 id。
2. 顺序语义变化：`start` 之后的索引可能整体平移。

如果投影依赖的是：

- “id=42 的实体内容”

那只要 `42` 没变，它就未必失效。

如果投影依赖的是：

- “第 20 到 40 个可见元素”
- “某节点的前驱/后继”
- “当前选区在 order 中的连续范围”

那即使实体值没变，只要 splice 影响了顺序，它就可能失效。

所以高效失效判断的前提，是把“实体变化”和“顺序变化”分开建模。

### 推荐的数据分层

对于有 `splice` 的底层集合，推荐拆成两层源：

- `entities: KeyedStore<Id, Entity>`
- `order: ReadStore<readonly Id[]>` 或更进一步的 `SequenceStore<Id>`

也就是说，不要把“有序列表”只建成一个 `ValueStore<Entity[]>`。那样所有投影最终都只能依赖整个数组，失效粒度会很粗。

### 推荐的失效索引

我会维护三个反向索引：

#### 1. `entityToProjections`

```ts
Map<Id, Set<ProjectionId>>
```

记录“哪些 projection 读过哪些 id”。

当 `splice` 插入/删除 id，或者这些 id 自身值发生变化时，直接命中这张表。

#### 2. `rangeToProjections`

用区间结构记录“哪些 projection 依赖 order 的哪一段”。

可选实现：

- 简单场景：`ProjectionId -> { start, end }`，遍历活跃 projection
- 中大型场景：interval tree / segment tree / ordered buckets

当出现 `splice(start, deleteCount, inserted)` 时，认为以下投影失效：

- 依赖区间与 `[start, start + deleteCount)` 相交的投影
- 依赖绝对索引，且其起点或终点在 `start` 之后的投影
- 依赖“前驱/后继/相邻关系”的投影，且触点落在 splice 边界附近的投影

#### 3. `summaryNodeToProjections`

如果存在聚合投影，例如：

- 总数
- 某区间统计
- 分组计数
- 最值 / 前缀和 / 可见窗口摘要

不要让 projection 直接依赖完整列表，而是依赖摘要节点。

例如用 segment tree / Fenwick tree / block summary：

- 底层 `splice` 只更新受影响的若干摘要节点
- projection 只订阅它读取过的摘要节点

这样失效范围从“所有聚合投影”降到“依赖这些摘要节点的投影”。

### 一次 `splice` 的失效流程

假设操作是：

```ts
splice(start, deleteCount, insertedIds)
```

高效流程应该是：

1. 先得到结构 delta：`start`、`deleteCount`、`removedIds`、`insertedIds`。
2. 把 `removedIds` 和 `insertedIds` 映射到 `entityToProjections`，标记一批 projection dirty。
3. 根据 `start` 和受影响长度，查询 `rangeToProjections`，标记顺序相关 projection dirty。
4. 更新区间摘要结构，只让命中的 `summaryNodeToProjections` dirty。
5. 对 dirty projection 去重，放入待刷新队列。
6. 只在读取或 flush 时真正重算这些 projection。

这样，失效判断复杂度不再是“全表扫描全部投影”，而是更接近：

- `O(changedIds + touchedRanges + touchedSummaryNodes + affectedProjections)`

### 和当前 store 怎么对接

当前 `store` 内核已经有三块很适合承接这个方案：

- `read()` 的动态依赖收集
- keyed 依赖的 `(store, key)` 粒度
- derived root 的 dirty/lazy/flush 模型

因此真正要补的，不是再造一个全新的响应式系统，而是给“有序序列”增加一个明确的结构层。

可以理解成：

- 当前内核已经解决了“如何传播失效”
- 还需要上层序列模型解决“如何把 splice 转成足够细的失效集合”

## 六、问题二：有 1000 个派生指标时，怎么避免每一帧全量重算

### 先给结论

不要把 1000 个派生指标建成一个“大投影对象”，而要把它们拆成：

- 每个指标一个 derived node，或者
- 每个 key 一个 family entry

然后依靠：

- 懒计算
- 按依赖标脏
- 只给活跃订阅者保留依赖
- `microtask` / `raf` 合并刷新

这样 1000 个指标里，真正会在某一帧重算的通常只是很小一部分。

### 当前实现已经具备的四个关键机制

#### 1. 脏标记，不立即重算

`DerivedNode` 在依赖变化后只是 `state = 'dirty'`，不会立刻把所有下游重新执行一遍。

这意味着一次底层写入不会直接引发 1000 个同步 selector 全跑。

#### 2. 只有被读取/订阅的节点才会求值

`family.ts` 的 keyed derived 是按 key 懒创建 node 的：

- 没有读取过的指标，不创建。
- 没有订阅者的指标，会回收。

所以“系统里定义了 1000 个指标”和“这一帧真的计算了 1000 个指标”是两回事。

#### 3. 依赖按 key 订阅

如果一个指标只依赖：

- 某几个实体 id
- 某几个摘要节点

那只有这些依赖变了，它才会 dirty。

这和“任何源变化都让所有指标 dirty”是本质不同的。

#### 4. flush 可合并

`batch()`、`createProjectedStore(..., schedule: 'microtask' | 'raf')`、`createRaf*Store()` 都在做同一件事：

- 多次底层写入，合并成一次可观察刷新

这对每帧多次输入、拖拽、动画、批量编辑非常重要。

### 实际上应该怎么组织这 1000 个指标

推荐拆成三层。

#### 第一层：原始事实层

- `entitiesById`
- `order`
- `selection`
- `viewport`
- `group membership`

这些是原始状态，不做重计算。

#### 第二层：可复用中间摘要层

这里放共享的中间结果，例如：

- 某个 group 的成员集合
- 某个 block 的统计摘要
- 某个区间的 prefix/suffix summary
- 可见窗口的 id 列表

这些摘要本身也用 derived/keyed derived 表达，但它们应该被多个指标共享。

如果 1000 个指标都各自去扫描一次全量数据，系统还是会慢。关键不是“有没有 derived”，而是“有没有共享中间层”。

#### 第三层：最终指标层

每个最终指标只读它真正需要的：

- 具体实体
- 某个窗口
- 某个摘要节点

这样单个指标的依赖集合就会很小。

### 一个更实用的判断标准

面对 1000 个指标，我会问三个问题：

1. 这个指标是不是活跃可见的？
2. 它依赖的是具体 key，还是整个集合？
3. 它能不能建立在共享摘要上，而不是自己扫描原始数据？

如果答案分别是：

- 只有少量活跃
- 大多依赖具体 key 或局部区间
- 能复用共享摘要

那么 1000 不是问题，因为每帧实际计算量远小于 1000。

### 一个反例

最差的组织方式是：

- 底层一个 `ValueStore<Entity[]>`
- 上层一个 `createProjectedStore`
- `select()` 里一次性算出 1000 个指标

这样的问题是：

- 任意变化都让整个对象重算
- 很难做 key 级失效
- 很难做 splice 局部更新
- 很难回收不活跃指标

这正好和当前 `store` 想避免的方向相反。

## 七、我会怎么把这套设计落成更完整的架构

如果这个系统后面真的会承载高频 `splice`、长列表、白板对象或复杂图结构，我建议架构上采用下面这套分层。

### 1. 把“实体”和“顺序”拆开

```ts
entitiesById: KeyedStore<Id, Entity>
order: SequenceStore<Id>
```

其中 `SequenceStore` 最好不要只暴露 `get(): Id[]`，而应显式暴露结构操作：

- `insert(start, ids)`
- `remove(start, count)`
- `splice(start, deleteCount, ids)`

并产出结构 delta。

### 2. 让 projection 显式区分依赖类型

一个 projection 不只是“我依赖 source”，而要能表达：

- 我依赖 id `a/b/c`
- 我依赖 order 的 `[20, 40]`
- 我依赖摘要节点 `S12/S13`

这一步可以由当前 `read()` 机制自然收集，也可以在顺序层额外提供 `readRange()`、`readNeighbor()`、`readSummaryNode()` 这样的 API，让依赖更可判定。

### 3. 给顺序层增加摘要结构

如果系统里有大量区间/统计/窗口投影，只靠 `readonly Id[]` 不够。

我会增加至少一种摘要结构：

- block decomposition
- segment tree
- Fenwick tree

选择取决于你更偏向：

- 区间求和/计数
- 最值/包围盒
- 可见窗口快速裁剪

### 4. 保持 derived node 细粒度

不要让 projection 输出一个巨大的综合对象。尽量保持：

- 一个 projection 一个 node
- 一个 key 一个 family node

这样 runtime 的 dirty queue 才有意义。

### 5. 调度层只合并可观察刷新，不吞掉结构信息

高频写入可以用 `microtask`/`raf` 合并，但不要在合并时丢掉 splice delta。

正确姿势是：

- 结构层记录多次 delta
- flush 时把 delta 合并
- 用合并后的 delta 计算失效范围
- 最后才触发 projection refresh

也就是说，合并的是“提交时机”，不是“把所有变化压平为一个全量新值”。

## 八、把答案压缩成一句工程判断

如果只用一句话概括这套 `store` 的设计哲学，那就是：

> 用动态依赖收集解决“谁依赖谁”，用 keyed 粒度解决“局部谁失效”，用 dirty + lazy + batch 解决“什么时候真的算”。

而对 `splice` 和大规模派生指标，真正的关键不是“再做一个更聪明的 selector”，而是：

- 把顺序变化显式建模成 delta
- 把 projection 依赖拆成实体、区间、摘要三类
- 让每个派生节点尽量小、尽量懒、尽量可回收

## 九、补充问题：派生指标依赖一组动态 Keys 时，如何避免重复计算整组

这个问题的本质是：

- 依赖集合不是固定 key，而是一个动态集合，例如 `selectedIds`
- 聚合结果不是“取其中一个 key 的值”，而是“把这一组成员做一次汇总”

例如“所有选中节点的边界矩形”：

```ts
GroupBounds = union(bounds(nodeId1), bounds(nodeId2), ...)
```

如果某一个选中节点移动了，最差做法是：

1. 重新读取全部 `selectedIds`
2. 再把所有选中节点的 bounds 全扫一遍
3. 重新做一次 union

这个做法的问题不是“结果不对”，而是每次局部变化都退化成 `O(group size)`。

### 先给结论

正确做法不是让 group projection 每次自己重扫全部成员，而是把它拆成三层：

1. 成员集合层：当前 group 里到底有哪些 key
2. 成员贡献层：每个 key 对聚合结果的局部贡献
3. 聚合摘要层：把所有贡献合并成最终结果

这样当某一个节点移动时，理想路径是：

- 只重算这个节点自己的贡献
- 再增量更新 group 的聚合摘要
- 不重复读取 group 里的其他节点

### 为什么单纯的动态依赖收集还不够

如果你写一个普通 derived：

```ts
const groupBounds = createDerivedStore({
  get: () => {
    const ids = read(selectedIdsStore)
    return unionAll(ids.map(id => read(nodeBoundsStore, id)))
  }
})
```

它的优点是依赖关系是正确的：

- 会依赖 `selectedIdsStore`
- 会依赖当前所有被选中的 `nodeBoundsStore[id]`

但它仍然有一个性能问题：

- 任何一个成员 `id` 变了，整个 derived 都会 dirty
- 一旦有人读取它，它还是会把整组成员重新扫描一遍

也就是说，依赖追踪只解决了“谁该失效”，没有自动解决“失效后怎么增量重算”。

### 解决方案一：成员贡献缓存

最直接的办法是给每个成员维护一个稳定的 contribution cache。

以 group bounds 为例，每个节点的 contribution 可以是：

```ts
type BoundsContribution = {
  left: number
  top: number
  right: number
  bottom: number
}
```

然后 group 级别不再直接读取节点原始数据，而是读取：

- `selectedIds`
- `contributionById[id]`

其中 `contributionById[id]` 本身可以是一个 keyed derived family：

- 每个节点一个 node
- 节点移动时，只让这个节点的 contribution dirty

这一步能避免的重复计算是：

- 不再重复计算 group 里其他节点的局部几何

但如果 group 摘要还是简单地：

- 把全部 contribution 再扫一遍取 min/max

那聚合阶段仍然是 `O(group size)`。

所以只做 contribution cache 还不够，还要继续往下拆。

### 解决方案二：可增量更新的聚合摘要

对 group bounds 这类聚合，最有效的办法不是每次都 `unionAll`，而是维护可更新的摘要索引。

#### 方案 A：四个极值索引

对 bounds：

- `minLeft`
- `minTop`
- `maxRight`
- `maxBottom`

分别维护可更新结构，例如：

- `Map<id, value>` + `MinHeap/MaxHeap`
- `Map<id, value>` + `SortedSet`
- 按 block 分桶的局部最值表

当一个节点移动时：

1. 更新该 `id` 的四个值
2. 调整这四个索引
3. O(1) 或近似 O(log n) 读出新的 group bounds

这样就不需要重新遍历 group 里的所有节点。

#### 方案 B：Block Summary / Segment Tree

如果 group 很大，且聚合种类不止 bounds，一般会更适合：

- 把成员切成 block
- 每个 block 维护一个摘要
- group 结果由 block 摘要再合并

这样单节点变动时：

- 只更新所在 block 的摘要
- 再向上更新少量聚合节点

复杂度接近：

- 单点更新 `O(log n)` 或 `O(block size)`
- 最终读取 `O(1)` 或 `O(log n)`

### 动态 key 集合怎么处理

这里有两种变化源，必须分开看。

#### 1. 成员值变化

例如某个已选中节点移动。

这种情况下：

- `selectedIds` 不变
- 只有 `contributionById[id]` 变

最优做法是只更新该成员对应的 contribution，再更新 group 摘要，不碰别的成员。

#### 2. 成员集合变化

例如选区新增/移除一个节点。

这种情况下：

- group membership 变了

需要做的是：

1. 对新增成员，把它的 contribution 加入摘要索引
2. 对移除成员，把它的 contribution 从摘要索引删除
3. 只在必要时更新最终 group 结果

这仍然不需要重新扫描整个 group。

### 对应到 store 设计，应该怎么建模

如果想让这个模式和当前 `shared/core/src/store` 一致，我会这样拆：

#### 第一层：成员集合

```ts
selectedIdsStore: ReadStore<readonly Id[]>
```

或者更进一步：

```ts
selectionStore: KeyedReadStore<GroupId, ReadonlySet<Id>>
```

关键是 membership 变化要能变成增量 delta，而不只是“给一个全新的数组”。

#### 第二层：成员贡献 family

```ts
nodeBoundsContribution = createKeyedDerivedStore({
  get: (id: Id) => read(nodeBoundsStore, id)
})
```

这里每个节点一个 contribution node。节点移动时，只让这个节点 contribution dirty。

#### 第三层：group 聚合器

group 聚合器不要写成“读到 ids 后直接全扫一遍”，而要做成一个有内部索引的对象：

- 维护当前成员集合
- 维护成员 contribution cache
- 维护聚合摘要结构

它收到事件时只做增量更新：

- `member added(id)`
- `member removed(id)`
- `member changed(id, prevContribution, nextContribution)`

最后输出：

```ts
groupBoundsStore.get(groupId)
```

### 一种很实用的工程判断

如果一个聚合函数满足下面条件：

- 可交换 / 可结合
- 单个成员的 contribution 可独立计算
- 聚合结果可从局部摘要合并出来

那它就应该拆成“贡献缓存 + 聚合摘要”，而不是写成一个大 derived 扫全组。

像下面这些都适合增量化：

- 边界矩形
- count / sum / min / max
- 可见区间摘要
- 分组统计

而像下面这些则要更谨慎：

- 依赖全局排序后相邻关系的复杂布局
- 需要全局优化/回溯的解
- 成员之间有强耦合约束的排版结果

这类结果往往没法纯粹靠“单成员 contribution”解决，通常需要更高层的摘要结构或局部重排算法。

### 用一句话回答你的例子

对于“所有选中节点的边界矩形”，不要把它实现成：

- “选区变化或任一节点移动时，重新遍历所有选中节点求 union”

而应该实现成：

- “每个节点维护自己的 bounds contribution，group 维护一个支持增删改单成员的极值摘要索引”

这样当其中一个节点移动时，你只更新这个节点的 contribution 和 group 摘要，不会重复计算 group 里的其他节点。

## 十、补充问题：节点被彻底删除时，如何干净销毁所有订阅与派生计算

这个问题的重点不是“值没了怎么办”，而是“引用这份值的计算图边和监听器怎么断干净”。

如果只是把节点从 `entitiesById` 里删掉，但下面这些东西还留着：

- 某些 derived 仍然订阅这个 `id`
- 某些 group 聚合器还保留这个成员的 contribution
- 某些 UI/controller 还挂着这个 `id` 的 direct listener
- family cache 里还保留这个 `id` 对应的 derived node

那系统虽然功能上可能“看起来没坏”，但时间一长就会变成真正的内存泄露。

### 先给结论

要想在大规模按 key 订阅系统中做到无泄漏，删除一个节点至少要经过四条清理链路：

1. 数据层删除该 key，并向该 key 的订阅者广播变更
2. 派生层在下一次重算时去掉对该 key 的依赖，并自动退订旧依赖边
3. 没有外部订阅者的 keyed family / aggregation entry 进入 idle 后被回收
4. 所有直接监听器必须绑定到 owner/scope，并在 owner 销毁时显式 unsubscribe

前 3 条当前 `shared/core/src/store` 已经有基础能力，第 4 条如果不加明确的生命周期约束，是没法“自动保证”的。

### 当前实现已经具备的清理机制

#### 1. `delete(key)` 会通知依赖这个 key 的订阅者

`createKeyedStore()` 的 `delete(key)` 最终走到 `commit(next, changedKeys)`。

对被删掉的 key，它会：

- 比较 `previousValue` 和 `emptyValue`
- 如果确实发生变化，通知该 key 的 internal/public listeners

这一步的作用不是“直接清理所有东西”，而是触发后续依赖图刷新。

#### 2. Derived 重算后会自动断开旧依赖边

如果某个 derived 原来依赖：

- `read(nodeStore, deletedId)`

删除发生后，它会被标脏。下一次 `ensureFresh()` 时：

- 重新执行 `get()`
- 收集新的依赖集合
- `reconcileDependencies()` 对比新旧依赖
- 对已经不再读取的依赖执行 `unsubscribe`

这一步非常关键。真正避免泄露的不是“delete 时全图扫描清理”，而是：

- 让受影响节点重算
- 然后由依赖 diff 自动拆掉已经无效的边

也就是说，依赖边的回收是“增量重算后的自然副作用”。

#### 3. 没有订阅者的 derived / family entry 会被回收

`createDerivedNode()` 在最后一个 listener 退订后会：

- `cleanupDependencies()`
- 清空它对下游 store 的订阅
- 触发 `onIdle`

`createKeyedDerivedStore()` 再基于 `onIdle` 做一层 family cache 清理：

- entry 标记为 idle
- 微任务里检查 `subscriberCount()`
- 确认无人订阅后 `dispose()` 并从 cache 删除

这意味着：

- 删除后的 key 只要不再被任何活跃订阅者持有，它对应的 per-key derived node 最终会消失

这对大规模节点系统非常重要，因为否则 family cache 会无限增长。

### 但为什么这还不够

因为有一种引用是 store 内核本身无法代替你管理的：

- 直接 listener 的生命周期

例如有人手写了：

```ts
const unsubscribe = nodeStore.subscribe(nodeId, listener)
```

只要这个 `unsubscribe` 没被调用，`publicListenersByKey` / `internalListenersByKey` 里的集合就会一直保留这个 listener。

哪怕节点已经删除：

- store 仍然可能保留这个 key 的 listener set
- 这个 listener 也可能继续等待“将来同 key 重新出现”

从 store 视角看，这未必是错误行为，因为“订阅一个当前不存在的 key，等待将来重新出现”本身是合法语义。

所以，如果你的语义是“节点被彻底销毁，任何针对它的监听都必须一起销毁”，这件事不能只靠 `delete(key)` 隐式完成。

### 正确的工程做法：区分“缺席”与“销毁”

这里必须区分两个语义。

#### 1. 缺席 / 可复活

例如：

- 某条记录暂时不在当前分页
- 某个节点被过滤掉
- 某个 key 之后可能重新写回

这时 `emptyValue` 语义是合理的，保留订阅也合理。

#### 2. 彻底销毁 / 不应再被引用

例如：

- 白板节点被永久删除
- 文档对象被销毁且 id 不复用
- 某个 controller / view-model 生命周期结束

这时应该有显式的 `destroy` 语义，而不是只做普通 `delete(key)`。

### 我会怎么设计“彻底删除”的清理链路

#### 第一层：数据删除

先从 `entitiesById` 里删掉 key，并广播 key 级变更。

#### 第二层：成员关系删除

把这个 key 从所有 membership / selection / group 索引里移除。

否则像 group bounds 这类聚合器虽然节点值没了，但 membership 还引用着它，聚合器就还会继续保留它的 contribution 槽位。

#### 第三层：派生图断边

受影响的 derived / aggregation node 被标脏，在重算时：

- 不再读取这个 key
- `reconcileDependencies()` 自动退订旧 key

#### 第四层：owner-scope 统一退订

所有 UI、控制器、服务层的直接订阅都不应该裸奔保存，而应该归属到一个 owner/scope：

```ts
scope.add(nodeStore.subscribe(nodeId, listener))
```

当节点或 owner 被销毁时：

```ts
scope.dispose()
```

由 scope 统一调用全部 unsubscribe。

这是最关键的一条。没有 owner-scope，就无法从架构上证明“所有直接监听器一定被清掉了”。

#### 第五层：family / cache 逐出

一旦某个 per-key derived node 不再有订阅者，它会进入 idle cleanup。

如果你对“彻底删除”的要求更强，还可以在实体层额外提供显式 eviction：

- `evictKey(id)`
- `destroyKey(id)`

用于立即清掉与该 key 绑定的 family entry、聚合缓存槽位、辅助索引。

注意这里应该是“删除与回收特定缓存”，不是“全局扫图”。

### 对大规模系统最实用的约束

我会强制团队遵守下面三条规则。

#### 1. 任何直接订阅都必须可被 owner 收口

不能允许长期存在这种代码：

```ts
nodeStore.subscribe(id, listener)
```

而不保留 unsubscribe 或不挂入 scope。

否则泄露只取决于调用者是否自觉。

#### 2. 所有按 key 的中间缓存都必须支持 idle eviction

包括：

- keyed derived family
- group aggregation entry
- contribution cache
- summary node cache

否则删除的 key 虽然退出主数据表，但中间层仍会持续引用它。

#### 3. membership 索引必须和实体删除一起更新

很多泄露不是因为主 store 没删干净，而是：

- selection
- group membership
- layout bucket
- spatial index

这些外围索引还保留着被删节点。

一旦外围索引还在，派生计算就还会继续“合法地”引用它。

### 一个更直接的判断标准

当你删除一个节点时，应该能回答清楚这四个问题：

1. 谁还持有这个 `id`？
2. 谁还订阅这个 `id`？
3. 谁还缓存这个 `id` 的 contribution / summary / family node？
4. 这些引用分别在什么生命周期里被释放？

如果其中任何一个问题回答不清楚，这个系统大概率就会在长期运行后泄露。

### 用一句话回答你的问题

在这种大规模按 key 订阅系统里，删除一个节点不能只做 `delete(key)`；你必须让它经过：

- key 级变更通知
- 派生图重算后的依赖断边
- idle cache eviction
- owner-scope 级 unsubscribe

只有这样，所有订阅它的派生计算、监听器才能被干净销毁，而不会在 family cache、membership 索引或直接 listener 集合里悄悄滞留。

## 十一、最终结论

### 关于 `shared/core/src/store` 的整体设计

它的本质是一个细粒度响应式内核，不是一个全量 selector 容器。当前实现最强的地方在于：

- 动态依赖追踪
- key 级订阅
- 懒计算
- 批处理与调度
- idle 回收

### 关于 `Splice` 失效计算

最优解不是全量比较前后数组，而是把 `splice` 表达为结构 delta，并维护：

- `entity -> projections`
- `range -> projections`
- `summary node -> projections`

然后只让命中的 projection 变脏。

### 关于 1000 个派生指标

避免每帧全量重算的关键不是“缓存一个大对象”，而是：

- 把指标拆成细粒度 derived/family node
- 只为活跃指标保留订阅
- 只在依赖命中时标脏
- 用 `batch` / `microtask` / `raf` 合并刷新
- 为多个指标共享中间摘要层

这样系统每帧做的工作量，才会接近“受影响且活跃的指标数”，而不是“全部指标数”。

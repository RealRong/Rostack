# Dataview 端到端性能优化方案

目标：针对 `50k` 数据量下的 Table 视图 filter 变更，给出一份“整体完成优化”的方案。

这份文档不再盯着单个慢函数，而是回答 4 个问题：

1. 现在整条链的主要成本是怎么串起来的。
2. 真正的优化单位应该是什么。
3. 应该按什么顺序改，才能持续降耗而不是局部搬热点。
4. 最终要把系统收敛成什么运行模型。

## 结论

当前瓶颈已经不只是 `deriveIndex` 内部某几个函数慢，而是一次 filter 变更会穿过 5 层链路，并且每层都还带着一定的“全量化倾向”：

1. `plan` 会因为 effective filter 的开关变化，改变 index demand。
2. `index.bucket` 会因为 demand 变化，从 `sync` 退化成 `build`。
3. `snapshot.sections` 和 `snapshot.summary` 虽然已经是增量模型，但仍然会在较大 visible diff 下扩大扫描面。
4. `source.runtime` 每次都会从当前 snapshot 重新生成完整 patch。
5. `dataview-react` 的 table virtual runtime 会据此重建 layout model。

所以如果继续只盯：

- `trimToUndefined`
- `resolveFastBucketKeys`
- `target.get(key) ?? 0`

最多只能拿到局部常数项收益，热点会继续往下游移动。

真正该做的是：

> 把优化目标从“单函数更快”改成“同一轮变更只做一次必要工作，并让增量一直传到底”。

一句话概括：

> 要优化的是整条 change pipeline，而不是某个局部实现细节。

## 当前成本链

以 `table + 50k + select is option1` 为例，当前主链大致是：

1. `onClick / onValueChange`
2. `dispatch / commit`
3. `deriveIndex`
4. `deriveViewRuntime`
5. `deriveViewSnapshot`
6. `runQueryStage`
7. `runSectionsStage`
8. `runSummaryStage`
9. `source.runtime.sync`
10. `table virtual runtime rebuildLayoutModel`

从系统角度看，这条链有 3 个问题：

### 1. 上游 demand 还会抖动

当前 `compileViewPlan` 只会把 effective filter 编进 demand。

这意味着：

- 空 filter value 时，某些 bucket spec 不存在。
- 一旦 filter value 变有效，bucket spec 集合变化。
- `deriveIndex` 发现 demand 不同，就只能走 `buildBucketIndex`。

所以今天最大的成本不是 `bucket` 逻辑本身慢，而是它经常被迫走错执行模式。

### 2. 中游 snapshot 虽然增量化了，但还不够“窄”

当前 `sections` 和 `summary` 已经比旧模型好很多，但还是存在两个剩余问题：

- `sections` 在 order/presentation 变化时，仍然容易退回较宽的重建分支。
- `summary` 虽然不再依赖 resolver，但 touched sections 的粒度仍偏粗，reducer 仍然会在内层高频做 `Map` 计数更新。

这说明中游的增量事实虽然有了，但“可直接消费的 delta”还不够稳定。

### 3. 下游 source/layout 仍然是全量投影

当前 engine runtime 到 source runtime 的接口，还是“给我当前整张快照，我重新组 patch”。

这意味着：

- items / sections / summaries 即便只是局部变化，也会重新生成一整组 `set` entries。
- source store 再做一轮 scoped patch。
- table layout model 再按当前 view 重新 build descriptors。

所以即使 derive 阶段再快，下游仍然可能吞掉新增收益。

## 需要切换的优化视角

不要再把优化单元放在：

- 一个 util 函数
- 一个 `Map.get`
- 一个 `forEach`

而要放在这 4 个系统级问题上：

### 1. 需求是否稳定

问题：一次交互会不会改变 stage 的 demand / plan 形状。

如果会：

- 上游就会频繁 `rebuild`
- 后面的 stage 再精细都救不回来

### 2. 真源是否唯一

问题：同一个派生事实是不是只算一次。

比如：

- `record -> bucketKeys`
- `bucketKey -> recordIds`
- `record -> sectionKeys`
- `sectionKey -> recordIds`

如果多个 stage 各算一份，整体复杂度一定会漂移。

### 3. delta 是否持续向下传

问题：上游已经知道的变更，能不能直接被下游消费。

理想状态：

- bucket 产生 membership delta
- section 直接消费 bucket delta
- summary 直接消费 section delta
- source 直接消费 section/summary publish delta
- layout 直接消费 visible item / section structure delta

只要中间任何一层断掉，下游就会重新扫全量。

### 4. 投影层是否仍在“整表重组”

问题：面向 UI 的 projection / source / layout 是否仍然按“当前全状态”重建。

这是当前剩余的关键系统问题。derive 已经被重构了一轮，但 source/layout 还是老模型。

## 整体优化目标

最终应该把运行模型收敛成下面这套形态。

### 目标 1：plan 稳定

filter value 从“无效”变“有效”时，不应该改变 bucket substrate 的存在性。

换句话说：

- substrate 是否存在，要由 view shape 决定
- 某条 filter 当前有没有值，只影响 query execution
- 不影响 index demand 结构

这样可以把最重的一段从：

- `buildBucketIndex`

压回：

- `syncBucketIndex`

### 目标 2：membership 真源固定

保留两类固定真源：

- `BucketMembership`
- `SectionState.keysByRecord`

后续所有逻辑都只能消费这两类真源，不再自行反推 membership。

### 目标 3：stage 之间只传 delta

stage 间的理想接口应该是：

- `query` 输出 visible/order delta
- `section` 输出 section membership/order delta
- `summary` 输出 summary publish delta
- `source` 输出 store patch delta

而不是每一层都拿到完整 state 再各自扫一遍。

### 目标 4：source/runtime 改成增量发布

`source.runtime.sync` 不应该再每次：

- `createDocumentPatch(state.doc)`
- `createActivePatch(state.doc, state.currentView.snapshot)`

而应该改成：

- document patch 继续基于 commit impact
- active patch 基于 `previousSnapshot -> nextSnapshot` 的增量发布结果

这样下游 store patch 才会变窄。

### 目标 5：layout model 改成结构增量

table virtual layout 不应该每次从 current view 全量 `buildDescriptors`。

理想状态：

- section order 不变时，不动 section block
- section 内部 row 局部变化时，只更新受影响 block
- 只有 grouped structure 真的变化时，才重建 layout descriptors

这会决定非渲染阶段最后一段能不能再降一个层级。

## 推荐改造顺序

顺序很重要。

如果顺序错了，就会出现：

- 上游刚优化完
- 热点立即搬到下一层
- 最终系统总耗时几乎不变

推荐按 4 个阶段推进。

## Phase 1：先稳定 plan 和 demand

### 目标

让 filter 交互不再轻易触发 bucket rebuild。

### 要做的事

1. 把 filter substrate 和 query execution 拆开。
2. bucket substrate 由 view shape 固定决定，不由 effective filter 决定。
3. `compileViewPlan` 产出的 `demand.buckets` 要尽可能稳定。
4. query plan 里保留当前 effective filter rules，但 index demand 不跟着抖动。

### 完成标志

在 `select is option1` 这种场景下：

- `trace.index.bucket.action` 应从 `rebuild/build` 下降到 `sync`
- bucket 主耗时不再是全表扫描

### 预期收益

这是当前收益最大的阶段。

因为它直接决定最重的全量扫描会不会发生。

## Phase 2：继续收窄 snapshot stage

### 目标

让 `sections` 和 `summary` 只处理真正被影响的 section / field / record。

### 要做的事

1. 把 `sections` 的 membership delta、order delta、presentation delta 明确拆开。
2. 只有 `presentation/order` 变时才重算 bucket view meta。
3. `summary` 不再先按 touched sections 全循环，而是优先按 changed records 投影到 section。
4. reducer builder 的输入从“section * field * changedIds”改成更直接的 delta batch。

### 完成标志

在 filter 改动但 section structure 基本稳定时：

- `syncSectionState` 不再反复进入宽分支
- `syncSummaryState` 的热点从 reducer map 内层显著收窄

### 预期收益

这是第二收益阶段。

因为它控制的是 bucket 之后的持续成本。

## Phase 3：重写 source patch 发布模型

### 目标

让 engine 到 source 不再做“快照投影式全量发布”。

### 要做的事

1. 给 `deriveViewRuntime` 或 `deriveViewSnapshot` 增加 publish delta 输出。
2. 区分：
   - item delta
   - section delta
   - summary delta
   - query projection delta
3. `source.runtime` 改为应用这些 delta，而不是从 snapshot 重组 patch。
4. document patch 和 active patch 的构造逻辑分离，不再共享“全量 create patch”模式。

### 完成标志

火焰图右侧：

- `publish -> batch -> flush -> notifyListeners -> sync -> apply`

这条链显著变窄。

### 预期收益

这一步不一定先体现在 derive 耗时里，但会明显压低“非渲染但属于 UI 数据通路”的后半段成本。

## Phase 4：让 layout model 增量化

### 目标

让 table virtual layout 不再每次都 `fromCurrentView -> buildDescriptors`。

### 要做的事

1. 把 layout descriptor 拆成：
   - section structure descriptor
   - row block descriptor
   - footer / create-row descriptor
2. 只有 grouped structure 变了才重建 section-level blocks。
3. 行 reorder / visible item diff 只更新 row-related descriptors。
4. measured heights 保持跨 revision 复用，不跟 descriptor rebuild 强耦合。

### 完成标志

右侧的：

- `rebuildLayoutModel`
- `fromCurrentView`
- `buildDescriptors`

只在结构级变化时出现，不再成为普通 filter 交互的稳定热点。

### 预期收益

这是把 derive 优化真正兑现给 view 层的最后一步。

## 不建议的路线

下面这些路线看起来“像优化”，但整体收益很有限。

### 1. 先大量微调 util 常数项

比如优先改：

- `trimToUndefined`
- `toScalarBucketKey`
- `Map.get(key) ?? 0`

这些不是不能改，但它们应该放在系统级收口之后。

否则就是：

- 上游还在 build 50k
- 你只是把 build 中的单步常数降了 10%

整体收益会很有限。

### 2. 再加一层更泛的 reader/context

当前问题不是“读取入口太散”，而是“派生真源和 delta 传递没彻底收口”。

如果现在再补一个更泛的 context：

- 状态边界会更模糊
- 责任更不清晰
- 但不会自动减少重复计算

### 3. 继续把更多逻辑塞进单个大 stage

如果为了减少函数层级，把 section/summary/source 发布重新揉成一坨：

- 表面调用栈可能变浅
- 但不会减少真正的扫描面
- 反而更难看清 delta 是否被重复消费

## 最终架构形态

最终建议把系统稳定成下面这条模型：

1. `plan`
   - 编译稳定 substrate demand
   - 编译当前 query execution

2. `index`
   - 维护稳定 substrate：
   - `records`
   - `search`
   - `bucket`
   - `sort`
   - `calculations`

3. `snapshot`
   - `query` 只算 visible/order delta
   - `section` 只算 section delta
   - `summary` 只算 summary delta

4. `publish`
   - 从 snapshot delta 直接生成 active patch delta

5. `source`
   - 对 store 做 scoped incremental patch

6. `layout`
   - 对 descriptor / measurement / viewport 做结构增量更新

这时每一层都满足同一个原则：

> 上游已经知道的事实和 delta，下游只消费，不重算。

## 里程碑与验收标准

建议不要只看总耗时，要同时看阶段行为是否真的切换成功。

### 里程碑 1：bucket 从 build 变 sync

验收：

- `trace.index.bucket.action === 'sync'`
- filter value 从空变有效时，不再触发 bucket 全量 build

### 里程碑 2：section/summary 扫描面继续缩小

验收：

- `sections` 只处理 touched sections
- `summary` 只处理 touched section-field pairs
- reducer 热点明显下降

### 里程碑 3：source patch 变窄

验收：

- 普通 filter 变更时，不再全量生成 item/section/summary patch
- `applyScopedKeyedPatch` 调用的 `set` 数量显著减少

### 里程碑 4：layout 结构增量化

验收：

- 普通 filter 变更时，layout model 不再全量 `buildDescriptors`
- 只有 section structure 变化时才重建整套 descriptor

## 优先级总结

如果只按收益排序：

1. 稳定 plan/demand，先消掉 bucket rebuild
2. 收窄 section/summary 的 delta 传播
3. 重写 source patch 为增量发布
4. 让 table layout model 结构增量化
5. 最后再做 reducer / bucket util 的局部常数优化

如果只按工程顺序排序：

1. `plan`
2. `index`
3. `snapshot`
4. `source`
5. `layout`

这两种排序在这里是一致的。

## 最后的判断

这次优化如果想真正把 50k filter latency 打下来，不能再把问题定义成：

- “哪个函数最慢”
- “哪一行 `Map.get` 最热”

而应该定义成：

- “为什么一次 filter 变更会让整条链重复做过多工作”
- “怎样让同一轮变更的 delta 一路传到底”

只要这个问题定义改对，后面的优化路线就会很清晰：

- 先稳定 substrate
- 再收窄 snapshot
- 再增量化 source
- 最后收 layout

这样做，热点才会真的消失，而不是在不同层之间搬家。

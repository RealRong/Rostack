# Dataview Engine 长期最优优化总方案

## 1. 文档定位

这份文档的目标不是回答某一个局部热点，而是把 Dataview 当前已经暴露出来、并且确定值得做的优化项，完整收拢成一份根目录总方案。

本文覆盖并整合以下几类问题：

- bulk write / fill / paste / 批量改值为什么会卡
- `commitMs`、`indexMs`、`viewMs` 分别在卡什么
- `active/index`、`snapshot/sections`、`snapshot/summary` 里还有哪些结构性浪费
- 哪些问题应该通过“局部 micro-optimization”处理
- 哪些问题必须通过“中轴重构”处理
- 哪些旧实现应该删掉，不能继续兼容保留

本文整合并覆盖以下既有方案文档：

- `DATAVIEW_ACTIVE_INDEX_PERFORMANCE_OPTIMIZATION_PLAN.zh-CN.md`
- `DATAVIEW_BULK_WRITE_PERFORMANCE_OPTIMIZATION_PLAN.zh-CN.md`
- `DATAVIEW_ENGINE_HELPER_AXIS_REFACTOR_PLAN.zh-CN.md`
- `DATAVIEW_TABLE_FILL_BULK_COMMIT_PLAN.zh-CN.md`

如果后续真的按“长期最优、不考虑兼容层、不在乎重构成本”的方向落地，这份文档应该作为唯一总方案使用，旧文档只保留为历史讨论记录，不再作为独立实现依据。

## 2. 范围

本文覆盖的核心路径如下：

- `dataview/packages/dataview-engine/src/api/createEngine.ts`
- `dataview/packages/dataview-engine/src/mutate/planner/*`
- `dataview/packages/dataview-engine/src/mutate/commit/*`
- `dataview/packages/dataview-core/src/operation/*`
- `dataview/packages/dataview-core/src/document/*`
- `dataview/packages/dataview-core/src/commit/*`
- `dataview/packages/dataview-engine/src/active/index/*`
- `dataview/packages/dataview-engine/src/active/snapshot/*`
- `dataview/packages/dataview-engine/src/active/runtime.ts`
- `dataview/packages/dataview-engine/src/active/demand.ts`
- `dataview/packages/dataview-engine/src/document/reader.ts`
- 与其直接相关的 active command / public API / helper 轴

本文不覆盖：

- React 渲染层视觉优化
- 选区交互语义本身
- worker 化 / 多线程化
- 远程同步协议
- 数据库持久化后端

这些方向以后可以做，但都不应该阻塞这次总方案。

## 3. 设计约束

长期最优必须同时满足下面这些约束：

- `document` 继续保持不可变
- 已发布出去的 index / snapshot / public state 继续保持不可变
- 不允许为了省常数项直接 mutate `document`
- 不允许 mutate `previous index`、`previous snapshot`
- 允许在单次 commit / derive 内部使用短生命周期的 transient builder
- builder 只能 mutate 自己首次 copy 出来的局部结构
- 能不 clone 的地方就不 clone
- 不为了保留旧抽象继续叠兼容层
- 复杂度优先级低于“中轴统一”和“少做重复工作”

一句话总结：

长期最优不是“把 clone 做得更晚一点”，而是：

- `document` 不可变
- published state 不可变
- commit / derive 内部允许 transient mutation
- 真变化只复制必要叶子
- 不再允许整条热路径到处重新发现同一批变化

## 4. 当前稳定基线

当前稳定参考基线来自：

- `/tmp/dataview-active-index-bench-section-items-v3.json`
- `/tmp/dataview-active-index-profile-section-items-v3.json`

关键场景如下：

| 场景 | 数据量 | `totalMs` | `commitMs` | `indexMs` | `viewMs` | 结论 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `record.value.points.bulk` | 50000 | 5.48 | 4.83 | 0.31 | 0.21 | 非 grouped bulk 的主瓶颈是写入线本身 |
| `record.value.status.bulk.grouped` | 50000 | 22.47 | 2.73 | 13.90 | 5.75 | grouped bulk 的主瓶颈是 `group -> sections` |
| `record.value.points.bulk.grouped.summary` | 50000 | 15.91 | 3.87 | 6.36 | 5.57 | grouped summary 的主瓶颈是 `calculations -> summary` |

对应 heap 现象也很明显：

- 非 grouped bulk transient heap 大约 `+6.6MB`
- grouped status bulk transient heap 大约 `+41.2MB`，retained 大约 `+11.2MB`
- grouped summary bulk transient heap 大约 `+26.2MB`

stage 级别的基线也要一起记住：

- `record.value.points.bulk`
  - `query = reuse`
  - `sections = reuse`
  - `summary = reuse`
- `record.value.status.bulk.grouped`
  - `query = reuse`
  - `sections = sync`
  - `summary = sync`
  - 其中最重的是 `sections`
- `record.value.points.bulk.grouped.summary`
  - `query = reuse`
  - `sections = reuse`
  - `summary = sync`
  - 其中最重的是 `summary`

这说明当前问题不是单一 CPU 热点，而是：

- 一部分路径在做重复计算
- 一部分路径在创建大量短命容器
- grouped 路径还额外持有了不必要的中间大对象

## 5. 口径澄清

### 5.1 `commitMs` 不是用户体感总耗时

现在 `dispatch` 的实际顺序是：

`planActions(...) -> write.run(...)`

trace 里的 `commitMs` 只覆盖 `applyOperations(...)` 这一段，不包含 planner。

也就是说，用户体感上的一次同步写入时间其实更接近：

`planActions(...) + applyOperations(...) + deriveIndex(...) + deriveViewRuntime(...)`

当前 trace 最大的问题不是数据不对，而是口径没有显式拆开。

### 5.2 现在至少存在三条不同性质的问题

当前不能把所有卡顿混成“bulk commit 很慢”。

至少要拆成三条：

1. 非 grouped bulk
   - 主问题是写入执行线
2. grouped bulk
   - 主问题是 group index 和 sections 同步
3. grouped summary bulk
   - 主问题是 calculations index 和 summary 状态模型

这三条不能靠同一组局部 patch 一起解决。

## 6. 总结性结论

### 6.1 当前最值得做的不是继续抠局部 helper，而是重构三条中轴

当前真正需要收敛的中轴只有三条：

1. 写入执行中轴
2. canonical impact 中轴
3. derive 共享上下文中轴

如果这三条中轴不收，后面所有局部优化都会反复回潮。

### 6.2 内部只能保留一条事实路线：`CommitImpact`

长期最优不应该同时保留：

- `CommitDelta`
- `CommitEffects`
- `CommitImpact`
- `MutableCommitImpact`
- `IndexImpactView`

正确做法是：

- commit 内部只有一个 `CommitImpact`
- commit 末尾只 `finalize` 一次
- finalize 之后的 `CommitImpact` 就是 canonical internal fact model
- index / snapshot / trace / active runtime 全部只消费它
- public API 如确实需要结果概览，最多投影一个极薄 `CommitSummary`

不能再保留两条事实路线。

### 6.3 `record.fields.writeMany` 必须重写成单次执行

现在 `record.fields.writeMany` 的核心问题不是某个比较慢，而是：

- 先构造 `entries`
- 再写 document
- 再比对 before / after
- 再补 inverse
- 再补 impact

这条路径本质上把“知道什么变了”这件事做了两到三遍。

长期最优必须改成：

- 编译 write 一次
- 遍历 target records 一次
- 在这一遍里同时完成：
  - next document 构造
  - inverse 构造
  - touched record 收集
  - touched field 收集
  - title changed 收集

### 6.4 grouped 路径必须停止“回扫整批大数组”

当前 grouped 路径的根本问题不是 group 算法不够快，而是：

- group 先根据 touched records 找到 touched buckets
- 然后为了重建 bucket records，又回扫整批 `records.ids`
- sections 再为了重建 touched sections，又回扫整批 `query.records.visible`

也就是说，一次 grouped bulk update 实际上把“大集合再扫一遍”做了两次。

长期最优必须改成：

- group sync 直接增量更新 `bucketRecords`
- sections sync 直接吃 per-record membership change
- summary sync 直接吃 per-section membership change + calculation entry change

### 6.5 summary 状态模型需要重做，不应再持有 section 级全量 entry maps

当前 summary 最重的问题不是 publish，而是 state shape 本身太重：

- `section -> field -> entries map`
- 每次 sync 都要 clone `entries`
- aggregate builder 还要 clone多份 counter map

这是 grouped summary 下 transient heap 很高的核心原因。

长期最优必须改成：

- summary state 只保存 aggregate state
- previous entry / next entry 由 previous / next calculation index + previous / next section membership 推导
- 不再由 summary 自己保存 per-section 的 record entry map

## 7. 最终目标架构

长期最优的最终链路应该是：

```text
Action
  -> Planner(validate + lower only)
  -> DocumentOperation[]
  -> executeOperation(one-pass, direct inverse + direct impact write)
  -> finalizeCommitImpact()
  -> DeriveContext(reader + demand + canonical impact)
  -> deriveIndex()
  -> deriveViewRuntime()
```

补充说明：

- planner 只负责校验和 lowering，不再 shadow apply document
- operation execution 是唯一真正“知道变了什么”的地方
- `CommitImpact` 是唯一内部提交事实模型
- derive 共享 reader / field map / active view / demand / impact，不再每个 stage 自己构
- stage 之间允许传递极薄的 transient change result，但不升级成第二套全局事实模型

## 8. 全量优化项清单

下面按路径逐块列出。

### 8.1 Trace 与度量口径

#### 当前问题

- `commitMs` 不包含 planner，但命名没有明确表达这一点
- trace 里没有稳定暴露 `planMs`
- grouped 路径虽然能看到 `indexMs`、`viewMs`，但 stage-local 的分配压力没有统一口径

#### 长期最优

- trace 明确拆成：
  - `planMs`
  - `commitMs`
  - `indexMs`
  - `viewMs`
  - `snapshotMs`
- `CommitImpact` finalize 后直接暴露 touched record / touched field count
- grouped 路径的 stage trace 必须能看出：
  - `group`
  - `sections`
  - `calculations`
  - `summary`
  各自是 rebuild 还是 sync

#### 必做项

- `createEngine` / `commit runtime` 调整 trace 口径
- bench 输出中同时保留 `elapsedMs` 与 trace 细分阶段
- profile 基线固定继续沿用当前两份 `/tmp` 参考物

#### 非结论

- 这块不是主要性能收益来源
- 但不把口径定清楚，后面任何优化都容易被误判

### 8.2 Planner 路径

#### 当前问题

当前 planner 最大的问题不是 helper 多，而是它在热路径里做了不该做的事：

- `planActions()` 对多 action batch 使用 `reduceOperations()` 预执行
- later action 的校验依赖 mutated `workingDocument`
- 这会导致 planner 对同一批变更做一轮 shadow apply
- helper 链又把控制流拆散成：
  - `sourceOf`
  - `validate*`
  - `getDocument*`
  - `planResult`

#### 长期最优

planner 只做两件事：

1. 校验
2. lowering

planner 不再负责：

- shadow apply 整个 document
- 帮 commit 预演变化结果
- 生成第二套提交事实对象

多 action batch 如确实需要“前一个 action 影响后一个 action 的校验语义”，也应该通过 planner 自己的轻量 semantic state 处理，而不是复用 document reducer 再跑一遍。

#### 必做项

- 删除 `planActions()` 中基于 `reduceOperations()` 的 shadow apply 路径
- planner 收缩为真正的 `PlannerScope`
  - 内部提供统一 reader
  - 内部提供统一 issue 入口
  - 内部提供统一 lower result 入口
- 领域状态变换 API 正式化
  - `filter.add`
  - `sort.clear`
  - `group.setMode`
  - `search.set`
- 不再允许 lowerer 自己手动拼一串 `validate + get + issue`

#### 应删实现

- planner 阶段对 document 的预执行路径
- 以 helper 链驱动流程的 lowerer 代码风格
- 任何 planner 内部的“预先构造 delta / effect / semantics draft”第二路线

### 8.3 `applyOperations()` 与 history

#### 当前问题

`applyOperations()` 不是最大的主瓶颈，但还有明显的无效工作：

- `undo.unshift(...inverse)` 会在循环里做前插
- `redo: [...operations]` 复制整个 operation 数组
- history entry 里保存的重点其实不是数组复制本身，而是 bulk inverse payload 过重

#### 长期最优

- inverse 生成顺序应该直接服务于 history，不需要循环里不断前插
- redo 可以复用批次级 operation 引用，不再机械复制
- history 继续保持“一次 bulk write = 一个 history entry”
- undo / redo 不再拆碎回小 operation

#### 必做项

- `applyOperations()` 改成 append inverse，再在末尾统一 reverse，或者让 executor 直接按 undo 需要的顺序产出
- redo 尽量复用原始 batch operation 引用
- history entry 继续原子化保存 bulk op，不做细粒度展开

#### 应删实现

- 每个 operation 都在循环里做 `undo.unshift(...)`
- 只是为了防御式不可变而复制整份 `redo`

### 8.4 `document.record.fields.writeMany` 执行线

#### 当前问题

这条线是非 grouped bulk 的主瓶颈。

当前结构大致是：

1. operation executor 构造 `entries`
2. `writeDocumentRecordFieldsMany()` 再把同一批 record 变成 `{ recordId, write }`
3. 写完 document 以后，再通过 `patchRecordFieldWrites()` 逐 record 做 before / after diff
4. 在 diff 里再生成 inverse、再打 impact

这条路径的问题是：

- 同一批 record 至少被扫两遍
- before / after record lookup 被重复做
- changed field 判断被重复做
- inverse restore payload 是 after-the-fact 拼出来的

#### 长期最优

`document.record.fields.writeMany` 必须重写成 one-pass executor。

这一遍循环里直接完成：

- 编译 write 一次
- 读取 before record
- 应用 next record
- 判断 record 是否真的变化
- 记录 inverse
- 记录 touched record
- 记录 changed field
- 记录 title changed
- 写入 record table builder

`restoreMany` 也应走同一条底层执行器，不再保留两套逻辑。

#### 最终原则

- title 不再作为“旁路 patch”
- title 作为 field write 的一种特殊 field 处理
- 但 impact 里仍保留 title changed 的显式语义集合

#### 必做项

- 重写 `executeRecordFieldWrite`
- 删除 `patchRecordFieldWrites()`
- 重写 `writeDocumentRecordFieldsMany()`
- 重写 `restoreDocumentRecordFieldsMany()`
- 引入 record table 级 transient patch builder
- write 编译只做一次

#### 应删实现

- `patchRecordFieldWrites`
- `operation.recordIds.map(recordId => ({ recordId, ... }))`
- `writeDocumentRecordFieldsMany(...map(...))`
- `restoreDocumentRecordFieldsMany(...flatMap(...))`
- 任何基于 before / after document 再反推真正 changed fields 的逻辑

### 8.5 其他 operation executor

#### 当前问题

`record.insert/remove`、`record.patch`、`field.put/remove`、`view.put/remove` 这些路径虽然不如 bulk write 热，但长期也不应该依赖 after-the-fact 清理逻辑。

#### 长期最优

每个 operation executor 都遵循同一个原则：

- execute 时直接写 impact
- execute 时直接产 inverse
- commit 末尾只 finalize，不再补 diff

#### 必做项

- 统一 `executeOperation()` 形态
- 保证每个分支都在执行当下完成 impact 写入
- 对 `record.patch`、`field.patch` 这类 patch operation，只保留一次字段级 before capture

### 8.6 `CommitImpact` 规范化

#### 当前问题

当前 `CommitImpact` 更像原始事实桶，不是 canonical impact。

后续路径里还会反复执行：

- `collectTouchedRecordIds()`
- `collectTouchedFieldIds()`
- `collectValueFieldIds()`
- `collectSchemaFieldIds()`

这会导致：

- 重复遍历
- 重复建 `Set`
- 重复合并 union
- 每个 derive stage 又长出自己的 impact view

#### 长期最优

最终的 `CommitImpact` 本身就应该是 canonical internal fact model。

它需要在 finalize 后直接具备：

- touched records
- touched fields
- schema-touched fields
- value-touched fields
- title changed
- record set changed
- active view changed

也就是说：

- 不再需要 `createIndexImpactView()`
- 不再需要在 query / sections / summary 再次 materialize touched set
- 不再需要第二套 `CommitDelta`、`CommitEffects`

#### 设计原则

- 内部只保留一个 `CommitImpact`
- “mutable commit impact”只是实现细节，不是正式概念
- public 只允许投影出 `CommitSummary`

#### 必做项

- `CommitImpact` 收敛成唯一内部事实模型
- `finalizeCommitImpact()` 负责完成最终规范化
- derive 直接读取规范化后的字段，不再 `collect*`

#### 应删实现

- `createIndexImpactView`
- runtime 热路径里所有 `collectTouchedRecordIds()` / `collectTouchedFieldIds()` 的重复使用
- 第二套 commit 事实对象

### 8.7 共享 derive context

#### 当前问题

当前 `deriveIndex()` 和 `deriveViewRuntime()` 里还有大量重复读取：

- `createStaticDocumentReader(document)` 重复构建
- `fieldIds`、`fieldIdSet` 重复构建
- `fieldsById` map 重复构建
- `resolveViewDemand(document, activeViewId)` 自己再建 reader
- query stage build 又自己再建 reader

#### 长期最优

一次 commit derive 应该只创建一次共享 context。

最薄共享 derive context 应至少包含：

- `document`
- `reader`
- `fieldIds`
- `fieldIdSet`
- `fieldsById`
- `activeViewId`
- `activeView`
- `demand`
- `impact`

index、snapshot、base publish 都直接共享这一个上下文。

#### 必做项

- `resolveViewDemand()` 改为接受 reader / active view，不再自己建 reader
- `deriveIndex()` 与 `deriveViewRuntime()` 共用 derive context
- `snapshot/base.ts`、`snapshot/runtime.ts`、`query/derive.ts` 不再自己创建 reader / fieldsById

#### 应删实现

- `resolveViewDemand(document, activeViewId)` 这种基于 document 反复建 reader 的入口
- 各 stage 内部独立的 `createStaticDocumentReader(...)`

### 8.8 `active/index/records`

#### 当前问题

`records` stage 目前已经不算主瓶颈，但仍有不少次级浪费：

- `nextFieldIds.filter(...)` 这类中间数组
- `new Set(nextFieldIds)` 只为删除旧 field
- `syncValueIndex()` 首次变动就 clone 整列 map
- 顶层 `values` map 变化时会 finish 新 map

#### 长期最优

这里不需要大改架构，但需要明确边界：

- `byId` 继续直接复用 document 的 `records.byId`
- 只同步真正 touched 的列
- 在 touched ratio 很大时，直接整列 rebuild，不强行 incremental
- 不再为小逻辑判断创建临时 `Set` / `Array`

#### 必做项

- `fieldsToSync` 改成 imperative push，不走 `filter`
- `nextFieldSet` 只在 fieldIds 真变化时才构造
- 为 value column 引入明确的 rebuild 阈值

#### 优先级

- 中
- 不是当前最值钱的第一批改动

### 8.9 `active/index/search`

#### 当前问题

search index 的主要问题不是算法错误，而是分配模型不够克制：

- `updateTextIndex()` 首次命中就 clone 全量 `Map<RecordId, string>`
- `all search` 与 field search 的 rebuild 都会重新全量拼文本
- 后续 query build 还会做更多 `Array.from / flatMap`

#### 长期最优

- search index 继续保留“按 field / all”的结构
- 但 update 路径应根据 touched ratio 决定 rebuild 还是 incremental
- query 构建阶段不再用 `flatMap + Array.from` 来做候选收集

#### 必做项

- 为 `updateTextIndex()` 增加 rebuild 阈值
- query search plan 改成 imperative candidate 收集
- 不再在 search candidates 上做多轮数组中转

### 8.10 `active/index/sort`

#### 当前问题

sort index 当前的 incremental 路径，在 touched ratio 较小时仍然要做一次：

- `previous.asc.filter(...)`
- `Array.from(touchedRecords).filter(...)`

这意味着：

- 即使 touched 很少，也会扫完整个 `asc`

#### 长期最优

sort 路径应保持简单，不要为了极致增量引入复杂结构。

最优方向是：

- 继续保留 touched ratio 阈值
- incremental 路径改成更低分配的一次循环
- 如果 touched ratio 超阈值，直接 rebuild

#### 必做项

- 去掉 `filter + Array.from` 组合
- 用单次遍历生成 `remaining` 和 `moving`
- comparator / field lookup 只构造一次

#### 优先级

- 中低
- 当前不是主要热点

### 8.11 `active/index/group`

#### 当前问题

这是当前 grouped bulk 的最大热点之一。

现在的结构是：

1. 对 touched records 重新算 before / after bucket keys
2. 找到 touched buckets
3. clone `recordBuckets`
4. 为了重建 touched buckets 的 record list，再扫一遍全量 `records.ids`
5. 再走 `buildBucketState()` 重建 buckets / order

其中最浪费的是第 4 步。

#### 长期最优

group index 必须改成真正的 per-record membership incremental。

也就是说，对每个 touched record 直接做：

- 从 before buckets 删除
- 向 after buckets 插入
- 同时更新 touched bucket 集合

整个过程不再回扫全量 `records.ids`。

#### 最终原则

- `recordBuckets` 只按 touched record 更新
- `bucketRecords` 只按 touched bucket 更新
- 记录插入位置直接依据 `records.order`
- 只有 schema / demand 变化才走 full rebuild
- bucket descriptor / bucket order 只在真正受影响时重算

#### 必做项

- `syncGroupFieldIndex()` 重写成真正增量版本
- 删除 “扫描全量 `records.ids` 重建 touched buckets” 的路径
- group sync 输出极薄 transient 变更结果，供 sections 直接消费

#### 应删实现

- `rebuiltBucketRecords` 基于全量 `records.ids` 的重建逻辑
- 任何“先找 touched buckets，再扫一遍所有 records 去重建这些 buckets”的路径

### 8.12 `active/snapshot/query`

#### 当前问题

query 不是这轮 bulk benchmark 的主热点，但长期也还有一整块 allocation 可以收：

- `buildQueryState()` 自己再建 reader
- `projectIdsToCurrentOrder()`、`intersectCandidates()`、`unionCandidates()`、`resolveSearchPlan()`、`resolveFilterPlans()` 等大量 `Set/Array.from/filter/flatMap/slice`
- 多 sorter 路径会直接 `slice().sort(...)`
- filter candidate 与 predicate rule 的规划中间对象较多

#### 长期最优

query 路径应保持规则简单：

- 共享 derive reader
- 候选集合规划尽量 imperative
- exact candidates 与 predicate fallback 明确分层
- 尽量不做多轮数组互转

#### 必做项

- `buildQueryState()` 改用共享 derive context
- 搜索词拆分、candidate union/intersection、group filter candidate 读取全部改成 imperative loop
- `Array.from(map.entries()).flatMap(...)` 改掉
- `visibleSet` 与 `order` 的复用规则继续保留

#### 次级方向

- 如果后续 query 也成为热点，可以继续考虑 query stage 输出 visibility/order delta 给 sections
- 但这属于 grouped 之外的第二阶段优化

### 8.13 `active/snapshot/sections`

#### 当前问题

这是 grouped bulk 的第二个大热点。

当前 `syncSectionState()` 的核心浪费在于：

- 先根据 touched records 算 touched section keys
- 再为了重建这些 section 的 `idsByKey`
  - 如果 `query.records.visible === index.records.ids`，还算便宜
  - 否则会扫描整批 `query.records.visible`

也就是说 grouped 场景下：

- group 扫一遍大集合
- sections 再扫一遍大集合

#### 长期最优

sections 不应该再靠“回扫当前 visible 列表”来恢复 section membership。

最优结构应该是：

- sections state 自己持有：
  - `byRecord`
  - `byKey`
  - `order`
- sync 时直接应用两类 delta：
  - query visibility/order change
  - group membership change

当 query 没变化、只有 group field 改值时：

- 只更新受影响且当前可见的 record
- 直接更新相关 section 的 `recordIds`
- 不再扫完整个 `visible`

#### 必做项

- `syncSectionState()` 改成 per-record membership apply
- sections sync 直接消费 group sync 输出的 transient membership change
- grouped 且 query reuse 时，不再扫描 `query.records.visible`

#### 应删实现

- 基于全量 `query.records.visible` 重建 touched sections 的路径
- 仅靠 `touchedRecords` 再次恢复 membership 的方案

### 8.14 `active/index/calculations` 与 `aggregate`

#### 当前问题

`calculations` 是 grouped summary 场景下的重要组成部分。

当前存在几个问题：

- 每个 calc field 单独遍历 `touchedRecords`
- `createAggregateBuilder()` 首次变动就 clone：
  - `distribution`
  - `uniqueCounts`
  - `numberCounts`
  - `optionCounts`
- range 重新计算有时还依赖 `entries`
- `createAggregateEntry()` 对某些 field kind 还在做较重的值归一化

#### 长期最优

这里的长期方向不是把 `calculations` 做得更花，而是让 aggregate state 自给自足。

最核心的目标有两个：

1. aggregate state 自己就能完成 range 重算
2. summary 不再持有自己的 `entries map`

为此需要：

- aggregate state 增强到足以只凭计数状态重算 min/max
- calculation index 继续保存 field 级 global entries
- summary 直接从 previous / next calculation index 取 previousEntry / nextEntry

#### 必做项

- 重构 `AggregateState`，让它在不依赖 section-local full entries 的前提下也能完成 range 重算
- `createAggregateEntry()` 可以考虑 field 级预编译 reader / normalizer
- 在 touched field 很大时允许 calculation index 对单 field 直接 rebuild

#### 应删实现

- aggregate state 对 section-local full entries 的隐式依赖
- 只有为了 summary 才额外存在的一整套重 entry map

### 8.15 `active/snapshot/summary`

#### 当前问题

这是 grouped summary 场景下最需要重做的数据结构。

当前 summary state 会保存：

- `section -> field -> SectionAggregateState`
- 而 `SectionAggregateState` 里又包含 `entries`

这意味着：

- build 时要为每个 section / field 复制一份 record subset map
- sync 时要 clone entries map
- aggregate builder 还会 clone counters
- summary publish 只是在薄层复用，真正重的是 state 自己

#### 长期最优

summary state 只应该保存 aggregate state，不应该再保存 section-local full entries。

sync summary 时真正需要的输入其实是：

- previous sections
- next sections
- previous calculation index
- next calculation index
- touched records
- touched fields

于是每个 changed record / section / field 都可以直接算出：

- `previousEntry`
  - 来自 `previousCalculationIndex + previousSectionMembership`
- `nextEntry`
  - 来自 `nextCalculationIndex + nextSectionMembership`

summary 不再拥有自己的大 entry map。

#### 最终原则

- summary state 只保留 aggregate state
- section membership change 作为 transient stage result 使用
- previous / next entry 只从 calculation index 与 section membership 读取
- publish 继续只做薄投影

#### 必做项

- 重做 `SummaryState` 结构
- `syncSummaryState()` 接收 previous / next calculation index
- 删除 summary 自有的 section-local entries map
- `publishSummaries()` 改成 imperative loop + 最大化 previous collection 复用

#### 应删实现

- `buildSectionFieldState`
- `EMPTY_FIELD_ENTRIES`
- `SummaryState` 内持有 record-level entries
- 所有“为了能增量同步 summary，而在 summary 自己保存 entry map”的逻辑

### 8.16 `active/snapshot/base` 与 publish 层

#### 当前问题

这块不是主热点，但有不少长期应该一起收掉的 allocation：

- `snapshot/base.ts`
  - `resolveFieldsById()` 每次新建 map
  - `createFields()` 用 `flatMap`、`map`、`filter`
- `sections/publish.ts`
  - 每次从 `previous.all` 重建 `previousByKey`
  - `publishedByKey` 有时也会再构一遍 map
- `summary/publish.ts`
  - `new Map(Array.from(...).map(...))`
  - `calcFields.flatMap(...)`
- `active/runtime.ts`
  - snapshot trace 仍有 `flatMap`

#### 长期最优

- 所有 publish/base projection 都改成共享 context + imperative loop
- 只有在 capturePerf 时才做 trace 侧额外结构构建
- 对 previous published object 的复用尽可能靠 identity，而不是每次先把辅助 map 重建一遍

#### 必做项

- `snapshot/base.ts` 使用共享 `fieldsById`
- `sections/publish.ts` 与 `summary/publish.ts` 改用 imperative loop
- trace 侧统计只在 perf enabled 时做

### 8.17 Helper / Scope / API 结构

#### 当前问题

这块更多是架构和复用问题，但不收它，性能路径最终还会被 helper 绑架：

- planner 通过一串 helper 拼控制流
- active commands 也通过 shared helper 拼流程
- `PlannerScope` 与 active context 各自又复制 reader / write 子树

#### 长期最优

共享基础中轴只保留两条：

1. 读中轴：`DocumentReader`
2. 写中轴：统一 `dispatch`

在此之上：

- planner 有最薄 `PlannerScope`
- active runtime 有最薄 derive context
- active commands 有最薄 active command context

不做一个全局 `EngineScope`。

#### 必做项

- planner 的读/校验/issue 入口收回 `PlannerScope`
- active commands 不再通过自由 helper 拼流程
- 领域状态变换 API 命名空间化

#### 说明

这块不是本轮 benchmark 的主耗时来源
- 但它直接决定后续写入线、derive 线能否真正中轴化

## 9. 最终数据模型与 API 方向

### 9.1 最终内部写入链路

长期最优不再需要额外 effect / delta 路线。

最终内部链路原则如下：

```ts
type WritePipeline =
  Action[]
  -> PlannedWriteBatch
  -> applyOperations(document, operations)
  -> CommitImpact
  -> derive
```

其中：

- planner 只 lower，不 shadow apply
- `applyOperations()` 是唯一真正执行路径
- `CommitImpact` 是唯一内部事实模型

### 9.2 最终 `CommitImpact` 原则

最终 `CommitImpact` 只保留一个概念，不再额外拆：

- `CommitImpact`
  - 内部可在 build 阶段被 mutate
  - finalize 后直接成为 canonical result

不再引入：

- `CommitDelta`
- `CommitEffects`
- `OperationEffect`
- `MutableCommitImpact` 作为正式对外概念
- `ExecuteOperationContext`

### 9.3 最终 derive context 原则

最薄共享 derive context 可以长这样：

```ts
interface DeriveContext {
  document: DataDoc
  reader: DocumentReader
  fieldIds: readonly FieldId[]
  fieldIdSet: ReadonlySet<FieldId>
  fieldsById: ReadonlyMap<FieldId, Field>
  activeViewId?: ViewId
  activeView?: View
  demand: NormalizedIndexDemand
  impact: CommitImpact
}
```

说明：

- 这是共享基础读中轴，不是全局大 scope
- index / snapshot / base projection 全部直接吃这个 context

### 9.4 grouped 路径的 transient result

为了不再回扫大数组，grouped 路径允许存在极薄的 stage-local transient result。

例如：

- group sync 输出 per-record membership change
- sections sync 输出 per-section touched membership

这些东西：

- 只在当前 derive 轮内使用
- 不升级为第二套全局事实模型
- 不进入 public contract

这类 transient result 是必要的，但不应演化成新的“中间层体系”。

## 10. 逐文件落地清单

下面按文件列出必须处理的点，避免遗漏。

### 10.1 `dataview/packages/dataview-engine/src/api/createEngine.ts`

- trace 口径补 `planMs`
- dispatch 链路明确拆出 plan / commit / derive

### 10.2 `dataview/packages/dataview-engine/src/mutate/planner/index.ts`

- 删除 `reduceOperations()` shadow apply
- 只保留 validate + lower

### 10.3 `dataview/packages/dataview-engine/src/mutate/planner/records.ts`

- bulk write lowering 继续保留统一入口
- 不再为 planner 生成第二套提交语义对象

### 10.4 `dataview/packages/dataview-core/src/operation/applyOperations.ts`

- 删除循环中的 `undo.unshift`
- redo 改为引用复用或最小复制

### 10.5 `dataview/packages/dataview-core/src/operation/executeOperation.ts`

- 删除 `patchRecordFieldWrites`
- 重写 `executeRecordFieldWrite`
- 其余 operation executor 统一为 execute-time inverse + execute-time impact

### 10.6 `dataview/packages/dataview-core/src/document/records.ts`

- 重写 `writeDocumentRecordFieldsMany`
- 重写 `restoreDocumentRecordFieldsMany`
- 引入 record table transient patch builder

### 10.7 `dataview/packages/dataview-core/src/commit/impact.ts`

- `CommitImpact` 终态规范化
- 减少 `collect*` 在热路径的存在

### 10.8 `dataview/packages/dataview-engine/src/active/demand.ts`

- 改为共享 derive reader / active view 输入
- 去掉 `Array.from(new Set(...))` 这类路径

### 10.9 `dataview/packages/dataview-engine/src/active/index/context.ts`

- 收成共享 derive context 入口
- 不再额外构造 `IndexImpactView`

### 10.10 `dataview/packages/dataview-engine/src/active/index/records.ts`

- 去掉 `filter` / `Set` 中间对象
- 为 value column 明确 rebuild 阈值

### 10.11 `dataview/packages/dataview-engine/src/active/index/search.ts`

- `updateTextIndex` rebuild 阈值
- query 侧不再反复转数组

### 10.12 `dataview/packages/dataview-engine/src/active/index/sort.ts`

- single-pass `remaining/moving`
- 保留 ratio threshold

### 10.13 `dataview/packages/dataview-engine/src/active/index/group/runtime.ts`

- 重写增量 membership apply
- 删除全量 `records.ids` 回扫

### 10.14 `dataview/packages/dataview-engine/src/active/index/group/bucket.ts`

- bucket state 只在必要时重算
- fast bucket key 路径继续保留并强化

### 10.15 `dataview/packages/dataview-engine/src/active/index/calculations.ts`

- aggregate state 自给自足
- field rebuild 阈值
- 减少 per-field touched loop 中的重复工作

### 10.16 `dataview/packages/dataview-engine/src/active/index/aggregate.ts`

- 让 aggregate state 不再依赖 summary 自己的 full entries map
- range 重算能力收进 aggregate state

### 10.17 `dataview/packages/dataview-engine/src/active/snapshot/query/runtime.ts`

- 不再自己 materialize touched set

### 10.18 `dataview/packages/dataview-engine/src/active/snapshot/query/derive.ts`

- 使用共享 reader
- imperative candidate planning
- 删 `Array.from/flatMap/filter/slice` 热路径组合

### 10.19 `dataview/packages/dataview-engine/src/active/snapshot/sections/runtime.ts`

- 不再自己重新收 touched records

### 10.20 `dataview/packages/dataview-engine/src/active/snapshot/sections/sync.ts`

- 改成 delta apply
- 删除扫描整批 `visible` 的路径

### 10.21 `dataview/packages/dataview-engine/src/active/snapshot/sections/publish.ts`

- imperative loop
- 尽量避免从 `previous.all` 反建 map

### 10.22 `dataview/packages/dataview-engine/src/active/snapshot/summary/runtime.ts`

- 不再自己重复 materialize touched sets
- 接 previous / next calculation index

### 10.23 `dataview/packages/dataview-engine/src/active/snapshot/summary/sync.ts`

- 重做 `SummaryState`
- 删除 section-local entries map

### 10.24 `dataview/packages/dataview-engine/src/active/snapshot/summary/publish.ts`

- imperative loop
- previous collection 最大化复用

### 10.25 `dataview/packages/dataview-engine/src/active/snapshot/base.ts`

- 共享 `fieldsById`
- 删除 `flatMap/map/filter` 组合

### 10.26 `dataview/packages/dataview-engine/src/active/runtime.ts`

- trace 只在 perf enabled 时构建
- snapshot changed store 统计走低分配实现

### 10.27 `dataview/packages/dataview-engine/src/document/reader.ts`

- 继续保留为唯一读中轴
- 不再让其它 scope 再复制一套 reader 子树

## 11. 必删清单

以下东西如果继续保留，后面一定会长回重复路径。

必须删除：

- planner 里的 `reduceOperations()` shadow apply 路径
- `patchRecordFieldWrites`
- `writeDocumentRecordFieldsMany(...map(...))`
- `restoreDocumentRecordFieldsMany(...flatMap(...))`
- runtime 热路径里到处 `collectTouchedRecordIds()` / `collectTouchedFieldIds()`
- `createIndexImpactView`
- summary state 内的 section-local full entries map
- grouped 路径里基于全量 `records.ids` / `query.records.visible` 的回扫式恢复
- helper 链驱动的 planner / active command 控制流

不应该新增：

- 第二套 commit 事实对象
- 第二套 impact view 对象
- 全局 `EngineScope`
- 为了 grouped path 再做一整套长期存在的 overlay 结构

## 12. 实施顺序

这里不是“理论上都能做”，而是按依赖关系排的真正落地顺序。

### Phase 0. 先把度量口径补齐

目标：

- trace 显式补 `planMs`
- 固定 benchmark/profile 基线

原因：

- 后面所有重构都需要可靠对照

### Phase 1. 重写 `record.fields.writeMany`

目标：

- one-pass executor
- 删除 after-the-fact diff
- 非 grouped bulk 先显著降下来

原因：

- 这是当前最独立、收益最直接的一步
- 也是整条写入线最核心的中轴

### Phase 2. 收敛 `CommitImpact`

目标：

- commit 只 finalize 一次
- derive 不再反复 `collect*`

原因：

- 不先统一 impact，中后段 derive 改完也容易继续重复构 touched set

### Phase 3. 建共享 derive context

目标：

- `reader / fieldIds / fieldIdSet / fieldsById / activeView / demand / impact` 一次构建，全链复用

原因：

- 这是 active/index 与 snapshot 一起降 GC 的基础

### Phase 4. 重做 `group -> sections`

目标：

- 删除 grouped 路径双重大数组回扫
- grouped status bulk 显著下降

原因：

- 这是当前 grouped bulk 的主瓶颈

### Phase 5. 重做 `calculations -> summary`

目标：

- 删除 summary state 自带的 full entries map
- grouped summary bulk 显著下降

原因：

- 这是 grouped summary 场景的主瓶颈

### Phase 6. 收 query/base/publish 的 allocation

目标：

- 降低 rebuild/sync 的次级分配
- 收尾 query/base/projection/publish 中的数组风暴

原因：

- 这块不是第一波主要收益来源
- 但完成前面重构以后，这里会成为次一级明显开销

### Phase 7. planner / helper / domain API 统一收口

目标：

- 收掉 helper 驱动流程
- 保留统一中轴

原因：

- 这是长期稳定性的收官步骤
- 也是避免旧结构回潮的必要清理

## 13. 预期收益

### 13.1 非 grouped bulk

预期主要收益来自：

- one-pass `record.fields.writeMany`
- 删除 after-the-fact diff
- 删除多轮 entries / inverse / impact 构造

长期目标：

- `commitMs` 明显下降
- transient heap 明显下降

### 13.2 grouped bulk

预期主要收益来自：

- group index 不再回扫 `records.ids`
- sections 不再回扫 `query.records.visible`

长期目标：

- `indexMs` 和 `viewMs` 同时下降
- grouped status bulk 不再出现双重大集合扫描

### 13.3 grouped summary bulk

预期主要收益来自：

- summary state 变薄
- aggregate state 自给自足
- summary 不再复制 section-local entries map

长期目标：

- `viewMs` 明显下降
- transient heap 显著下降

## 14. 风险与取舍

### 14.1 不要迷信 generic builder

长期最优不是“再做一个更大的通用 builder 框架”。

应该保留的 builder 很少：

- record table patch builder
- aggregate builder
- 必要的 map/array patch builder

一旦 builder 体系过大，复杂度会重新反噬。

### 14.2 不要为了避免 clone 引入长期 overlay

长期 overlay 会带来：

- 读取复杂度上升
- 记忆体长期膨胀
- 调试困难

所以正确方向是：

- commit / derive 内部 transient patch
- publish 前 materialize 成最终 state
- 不把 overlay 留到下一轮当正式 state

### 14.3 grouped 路径允许极薄 transient delta，但不能演化成新体系

group / sections / summary 之间为了不回扫大数组，确实需要极薄的 stage-local 变化结果。

这是合理的。

但这些结果必须满足：

- 只在当前 derive 轮存在
- 不成为正式 public contract
- 不长出第二套命名体系

## 15. 最终判断

如果只追求长期最优，Dataview 这条路径的正确方向非常明确：

- 写入线只保留一次真正执行
- commit 只保留一个 canonical `CommitImpact`
- derive 只保留一个共享 read context
- grouped 路径停止回扫大数组
- summary state 停止保存 section-local full entries map
- planner 停止 shadow apply
- helper 停止绑架流程

真正值得做的不是再加一层抽象，也不是继续抠某个 `filter`、`map`、`Set` 的局部常数项，而是把“变化事实只发现一次”这条原则贯彻到整条写入与派生路径。

一句话总结最终方案：

`一次 lower，一次 execute，一次 finalize，一次 derive；其余重复路线全部删除。`

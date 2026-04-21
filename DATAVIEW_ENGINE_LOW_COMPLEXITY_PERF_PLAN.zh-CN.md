# Dataview Engine 低复杂度性能优化方案

本文只讨论一件事：

在不引入新底层模型、不扩大阶段职责、不增加额外缓存层复杂度的前提下，下一轮应该怎么继续压 `dataview-engine` 的热点。

这里不是长期重构设计文档，也不是全链路改造方案。目标更直接：

1. 优先减少不必要的失效范围。
2. 优先缩小每次 commit 的实际工作集。
3. 只在最后才做局部循环级优化。
4. 不为了几毫秒引入新的语义层或更难维护的基础设施。

## 一、当前火焰图结论

50k 数据量下，当前主要热点大致为：

- `buildBucketFieldIndex`: 11ms
- `runQueryStage`: 4ms
  - `projectCandidatesToOrderedIds`: 1.67ms
  - `collectVisibleDiff`: 1.67ms
- `runMembershipStage`: 18ms
  - `addChangedRecordIds`: 1.6ms
  - `buildMembershipState`: 2ms
  - `syncItemProjection`: 14ms
- `runSummaryStage`: 8ms
  - `buildFieldReducerState` 内 option count 聚合最重
- `runPublishStage`: 6ms
  - `publishSections`: 1ms
  - `buildActivePatch`: 5ms
- `applyActivePatch`: 7ms

从这组数字看，当前最大的结构性热点已经不是 query，也不是 summary 本身，而是：

1. `syncItemProjection`
2. `buildBucketFieldIndex`
3. `buildActivePatch + applyActivePatch`

summary 的 reducer 循环虽然明显，但它目前还是第二梯队热点，适合做局部优化，不适合因此引入新的 summary 基础设施。

## 二、优化原则

这一轮只接受下面三类优化：

### 1. 收紧失效条件

如果某个阶段现在会因为“无关变化”而执行，就先把它的触发条件改准，而不是先优化内部循环。

### 2. 缩小工作集

如果某段逻辑必须执行，就尽量只处理真正变化的 records / sections / items，而不是每次都全量扫描。

### 3. 保持模型不变

如果现有数据模型已经足够表达语义，就不要再为了性能补新的 reader、summary source、全局 cache、双向索引层。

这轮不建议做：

- 新的 summary 专用索引层
- 新的 publish cache 模型
- 新的 store 基础设施
- 把多个阶段再合并成 mega stage
- 为了热点引入更抽象的统一框架

## 三、热点拆解

## 1. `syncItemProjection` 是当前第一优先级

相关代码：

- `dataview/packages/dataview-engine/src/active/snapshot/membership/runtime.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/membership/publish.ts`

当前调用位置里，`syncItemProjection` 只要 membership 不是 `reuse` 就会执行。

但 `projection` 的语义实际上只依赖下面三件事：

- `mode`
- `recordId`
- `sectionKey`

它并不依赖：

- section order
- visible order
- section label
- section color
- collapsed
- hidden

当前实现的问题，不是 projection 算法错误，而是 projection 的失效范围过大。

### 当前成本来源

`syncGroupedProjection` 会：

1. 全量扫描 `allRecordIds`
2. 对每个 record 读取 `sectionKeysByRecord`
3. 为每个 `(sectionKey, recordId)` 构造 projection key
4. 再做一轮 `removeDeletedProjectionEntries`

这意味着只要 membership sync 触发，projection 就会接近全量过一遍。

### 长期最优但低复杂度的方案

不要改 projection 数据结构，先只改 invalidation 规则：

- 只有 `mode` 变化时，projection 重建
- 只有 record set 变化时，projection sync
- 只有 bucket membership 真正变化时，projection sync
- 如果只是 query visible 变了、section order 变了、section node 引用变了，但 `(recordId -> sectionKeys)` 没变，则 projection 直接 reuse

### 为什么这是第一优先级

因为这里当前单点就是 14ms 左右，而且它不属于“真实语义必须重算”的成本，很多时候纯粹是失效范围过大。

这类优化通常能直接拿回最大一段时间，同时不会引入新的系统复杂度。

## 2. `buildBucketFieldIndex` 的重点不是循环，而是少触发

相关代码：

- `dataview/packages/dataview-engine/src/active/index/bucket.ts`

当前火焰图里走到的是 `buildBucketFieldIndex` 全量 build 路径，而不是仅做增量同步。

这说明这里要先回答的问题不是：

- `resolveBucketKeys` 能不能再快一点

而是：

- 为什么这次 commit 触发了全量 build？
- 这是必要 rebuild，还是 demand/spec 不稳定导致的重复 build？

### 低复杂度方案

优先检查并收紧下面几类条件：

- bucket demand 是否在语义不变时仍生成了新 spec
- spec key 是否稳定
- 某些 ineffective filter / layout change / summary change 是否误触发了 bucket index rebuild

### 这一步为什么不能直接做 micro-opt

如果根因是“本不该 rebuild 却 rebuild 了”，那就算把单次 build 从 11ms 压到 7ms，也仍然是在错误位置浪费时间。

所以这里应先做：

1. 让 bucket index 少 rebuild
2. 再考虑 `resolveBucketKeys` 的局部优化

## 3. summary reducer 适合做局部循环优化，不适合补新模型

相关代码：

- `dataview/packages/dataview-core/src/calculation/reducer.ts`

当前主要热点在 `buildFieldReducerState` 里对 `optionIds` 的聚合：

- `optionCounts.get`
- `optionCounts.set`
- `entry.optionIds.forEach`

### 当前判断

`runSummaryStage` 总耗时大约 8ms，这说明它已经不是主导级热点。

因此这里最优策略不是补新的 summary index，而是做局部、可控、低认知负担的优化。

### 可接受的优化范围

- 把 `forEach` 改成 `for` 循环
- 减少闭包和回调开销
- 减少 `Map.get + Map.set` 的重复路径
- 按 capability 做更窄的 fast path

例如：

- `count + option`
- `count only`
- `numeric only`

### 不建议做的事

- 新增 section summary cache 层
- 在 index 里预构建 per-section calculation 聚合
- 为 option summary 单独维护全局聚合结构

这些方案虽然可能继续压几毫秒，但复杂度会明显升高，而且会把 summary 语义和 membership/section 结构再次绑死，容易重新引入一致性问题。

## 4. `buildActivePatch + applyActivePatch` 的核心是 patch 太宽

相关代码：

- `dataview/packages/dataview-engine/src/active/snapshot/publish/patch.ts`
- `dataview/packages/dataview-engine/src/source/runtime.ts`

现在这两段加起来大约 12ms 左右。

这不表示 store 本身有问题，更大的可能是：

- changed sections 判得太宽
- item patch 覆盖范围太大
- 结果导致 keyed store 的 patch 逐 key 应用成本上去了

### 当前问题本质

`applyActivePatch` 本身逻辑很薄，真正成本在 `runtime.values.patch(...)`。

而 `runtime.values.patch(...)` 的成本又和 patch key 数量直接相关。

所以最优方案不是改 store，而是让 patch 变小。

### 低复杂度方案

优先顺序应该是：

1. 收紧 upstream 的 `changedSections`
2. 避免“section 引用变了，但 items 实际没变”也生成宽 patch
3. 只有在 patch 已经很小而 apply 仍然明显时，才考虑 store 级优化

### 当前不建议碰的地方

- 不建议改 `shared/core/store`
- 不建议给 source runtime 增加二级 patch helper
- 不建议引入按阶段分片的 patch executor

这些都会把基础设施复杂度拉高，而且收益未必超过 upstream 直接缩 patch。

## 5. query 阶段已经不是当前优先矛盾

相关代码：

- `dataview/packages/dataview-engine/src/active/snapshot/query/runtime.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/query/derive.ts`

当前 `runQueryStage` 总共约 4ms，其中：

- `projectCandidatesToOrderedIds`: 1.67ms
- `collectVisibleDiff`: 1.67ms

这说明 query 现在已经进入“可优化但不该优先”的范围。

### 当前建议

先不动 query 结构。

除非前面几项都收完以后，query 重新回到主热点，否则不建议为了这 1 到 2ms 改：

- visible diff 模型
- candidate projection 策略
- query state 缓存结构

## 四、推荐执行顺序

### 第一阶段：先收紧 projection 失效

目标：

- 只有 `(mode, recordId, sectionKeys)` 真变化时才触发 `syncItemProjection`

预期收益：

- 最大概率直接回收当前最大的 8 到 14ms 热点

复杂度风险：

- 低

### 第二阶段：检查 bucket index 为什么频繁 build

目标：

- 优先减少不必要的 `buildBucketFieldIndex`

预期收益：

- 避免稳态 commit 反复全量 build bucket index

复杂度风险：

- 低到中

注意：

这里先查触发条件，不要先做内部循环优化。

### 第三阶段：做 summary reducer 的局部循环优化

目标：

- 压低 option count 聚合的常数成本

预期收益：

- 2 到 4ms 级别的稳定回收更现实

复杂度风险：

- 低

### 第四阶段：继续缩 patch 体积

目标：

- 让 `buildActivePatch + applyActivePatch` 跟着上游变窄

预期收益：

- 视 changed key 数量而定

复杂度风险：

- 低到中

## 五、明确不建议的方向

这一轮不建议做下面这些事情：

### 1. 不建议补新的 summary source

summary 现在的主要问题不是缺源，而是某些情况下执行范围偏大。再补一层 source 只会增加同步复杂度。

### 2. 不建议为了 projection 热点重做 item identity 模型

当前 projection 模型本身没错，主要是触发条件太宽。

### 3. 不建议为了 patch 热点重写 store

如果 patch 本身太宽，改 store 只是把问题往下压，不是从源头解决。

### 4. 不建议把 query / membership / summary 再合并

当前热点不来自“阶段太多”，而来自某些阶段做了不必要的工作。

## 六、最终判断

如果目标是：

- 长期最优
- 错误最少
- 复杂度最低
- 性能继续提升

那么下一轮最正确的路线不是重构，而是：

1. 先把 `projection` 的失效范围收紧
2. 再把 `bucket index` 的 rebuild 条件收紧
3. 然后做 `summary reducer` 的纯循环优化
4. 最后继续缩 `patch` 的作用范围

也就是说，这轮优化的核心不是“发明新模型”，而是：

> 让每一层只在真正语义变化时执行，并且只处理真正变化的工作集。

这条路线的好处是：

- 可以继续降时间
- 不会把代码再做复杂
- 不会重新引入新的双真源和同步问题
- 与当前已经完成的 membership / summary / publish 收敛方向完全一致

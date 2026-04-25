# Dataview Engine Mutation 优化审计

## 1. 总结论

`dataview/packages/dataview-engine/src/mutation` 的体量不大，但它位于整条写入链路的核心：

```text
Intent
  -> dataview-core compile
  -> shared/mutation MutationEngine
  -> dataview-core reducer/apply
  -> dataview-engine publish
  -> active index + active projector
  -> doc/active delta + performance trace
```

当前整体方向是正确的：`mutation/spec.ts` 已经把 Dataview 接入 `@shared/mutation` 的 `MutationEngineSpec`，写入编译与应用也基本委托给 `dataview-core`。这说明 engine mutation 不是“重复造 MutationEngine”。

真正的问题是：**mutation 目录仍然承担了过多 read projection / delta projection / performance assembly 职责**。它现在既是 MutationEngine adapter，又是 publish pipeline，又是 delta projector，又是性能追踪聚合器。长期看，这会让 `mutation` 成为新的中枢目录，和我们希望的分层相冲突。

建议目标：

```text
dataview-engine/src/mutation
  只保留 MutationEngine adapter 与 dataview publish spec 入口

dataview-engine/src/publish 或 active/read-model
  承担 doc/index/active snapshot 的发布流水线

dataview-engine/src/delta 或 active/publish
  承担 document delta 与 active delta projector

shared/projector
  提供通用 entity/list/struct delta 与 snapshot publish primitives

shared/mutation
  保持 MutationEngine，不吸收 dataview read model 逻辑
```

一句话：`mutation` 应该是写入引擎适配层，而不是 read model 构建中心。

## 2. 当前目录结构

当前目录只有 6 个文件：

```text
dataview/packages/dataview-engine/src/mutation
  delta.ts
  index.ts
  publish.ts
  spec.ts
  trace.ts
  types.ts
```

其中职责大致是：

- `spec.ts`：创建 `MutationEngineSpec`，连接 clone/normalize/compile/apply/publish/history。
- `publish.ts`：MutationEngine publish spec，构建 publish state、index、active projector、delta、performance trace。
- `delta.ts`：从 document/active snapshot 计算对外 delta。
- `trace.ts`：把 dataview trace 转为 performance impact summary。
- `types.ts`：定义 `DataviewPublishState`。
- `index.ts`：聚合导出。

## 3. 已经做对的地方

### 3.1 已接入 `shared/mutation`

`dataview/packages/dataview-engine/src/mutation/spec.ts:67` 创建 `MutationEngineSpec`，不是自己实现 mutation engine。

关键能力均委托给基础设施：

- `dataview/packages/dataview-engine/src/mutation/spec.ts:89` 使用 `compileIntents` 编译 intents。
- `dataview/packages/dataview-engine/src/mutation/spec.ts:102` 使用 `applyOperations` 应用 operations。
- `dataview/packages/dataview-engine/src/mutation/spec.ts:111` 使用 `createDataviewPublishSpec` 接入 publish。
- `dataview/packages/dataview-engine/src/mutation/spec.ts:116` 使用 `shared/mutation` 的 history spec。

这符合目标分层：`MutationEngine` 管 pipeline，`dataview-core` 管领域 mutation。

### 3.2 apply 已下沉到 `dataview-core` reducer

`dataview-core` 里已经有：

- `dataview/packages/dataview-core/src/mutation/spec.ts:67` 定义 `dataviewReducerSpec`。
- `dataview/packages/dataview-core/src/mutation/spec.ts:87` 创建 `dataviewReducer = new Reducer(...)`。
- `dataview/packages/dataview-core/src/mutation/apply.ts:10` 用 reducer 执行 `applyOperations`。

因此 `dataview-engine/src/mutation/spec.ts` 没有重复实现 reducer，这是好的。

### 3.3 active projector 已进入 publish pipeline

`dataview/packages/dataview-engine/src/mutation/publish.ts:26` 引入 `createActiveProjector`，并在：

- `dataview/packages/dataview-engine/src/mutation/publish.ts:85` 初始化 active snapshot。
- `dataview/packages/dataview-engine/src/mutation/publish.ts:158` 增量更新 active projector。

这说明 read projection 已经开始统一由 projector 驱动，而不是 mutation 层手写所有 active state。

## 4. 问题一：`publish.ts` 职责过重

`dataview/packages/dataview-engine/src/mutation/publish.ts` 只有 230 行，但职责密度很高。它同时做了以下事情：

1. 创建 document read context。
2. resolve active view plan。
3. init 或 derive active index。
4. 调用 active projector。
5. 计算 document delta。
6. 拼装 active delta。
7. 构造 DataviewPublishState。
8. 构造 performance trace。
9. 写入 PerformanceRuntime。
10. 维护 activeProjector 实例生命周期。

典型证据：

- `dataview/packages/dataview-engine/src/mutation/publish.ts:74` 的 `createPublishState` 同时构建 reader、plan、index、active。
- `dataview/packages/dataview-engine/src/mutation/publish.ts:121` 在 publish spec 闭包中维护 `activeProjector`。
- `dataview/packages/dataview-engine/src/mutation/publish.ts:145` 的 `reduce` 开始后一路完成 index、active、delta、performance、state assembly。
- `dataview/packages/dataview-engine/src/mutation/publish.ts:191` 开始构造 performance trace。

这不是代码行数问题，而是 layer boundary 问题：MutationEngine 的 publish spec 入口应很薄，实际 read model pipeline 应放在更明确的 read-model/publish 模块里。

### 建议拆分

推荐结构：

```text
dataview-engine/src/mutation
  spec.ts                  // MutationEngineSpec adapter
  publishSpec.ts            // MutationPublishSpec adapter, 很薄
  historyPolicy.ts          // history track/clear/conflicts

dataview-engine/src/publish
  createPublishPipeline.ts  // doc -> plan -> index -> active -> delta
  publishState.ts           // DataviewPublishState assembly
  performance.ts            // CommitTrace assembly

dataview-engine/src/delta
  documentDelta.ts
  activeDelta.ts
```

`MutationPublishSpec.reduce` 最终应像这样：

```ts
reduce: ({ prev, doc, write }) => publishPipeline.reduce({
  previous: prev,
  doc,
  write
})
```

这样 `mutation` 目录只适配 shared/mutation，不直接知道 index/projector/performance 的所有细节。

## 5. 问题二：`delta.ts` 同时承担 document delta 与 active delta

`dataview/packages/dataview-engine/src/mutation/delta.ts` 是最大文件，432 行。它混合了两类完全不同的 delta：

### 5.1 Document delta

`projectDocumentDelta` 处理 document 层变化：

- `dataview/packages/dataview-engine/src/mutation/delta.ts:186` 定义 `projectDocumentDelta`。
- `dataview/packages/dataview-engine/src/mutation/delta.ts:201` records delta。
- `dataview/packages/dataview-engine/src/mutation/delta.ts:210` values delta。
- `dataview/packages/dataview-engine/src/mutation/delta.ts:211` fields delta。
- `dataview/packages/dataview-engine/src/mutation/delta.ts:220` schemaFields delta。
- `dataview/packages/dataview-engine/src/mutation/delta.ts:229` views delta。

这是 document read model 的 delta projector。

### 5.2 Active delta

同一文件后半段处理 active view delta：

- `dataview/packages/dataview-engine/src/mutation/delta.ts:266` 定义 `buildSummaryEntityDelta`。
- `dataview/packages/dataview-engine/src/mutation/delta.ts:298` 定义 `projectActiveDelta`。
- `dataview/packages/dataview-engine/src/mutation/delta.ts:334` records matched/ordered/visible delta。
- `dataview/packages/dataview-engine/src/mutation/delta.ts:357` fields delta。
- `dataview/packages/dataview-engine/src/mutation/delta.ts:363` summaries delta。

这是 active projector 的 publish delta。

这两类 delta 的触发来源、领域对象、复用方向都不同，不建议继续放在 `mutation/delta.ts`。

### 建议拆分

推荐拆成：

```text
dataview-engine/src/delta/document.ts
  projectDocumentDelta
  buildValueDelta
  buildDocumentEntityDelta

dataview-engine/src/active/publish/delta.ts
  projectActiveDelta
  buildSummaryEntityDelta
```

或者如果希望保持一个顶层：

```text
dataview-engine/src/projection/delta/document.ts
dataview-engine/src/projection/delta/active.ts
```

关键原则：

- document delta 跟 mutation trace 强相关，应靠近 document projection。
- active delta 跟 active snapshot/publish 强相关，应靠近 active projector/publish。
- mutation 层只组合它们，不拥有它们。

## 6. 问题三：本地 `buildEntityDelta` 与 shared/projector 能力重复

`dataview/packages/dataview-engine/src/mutation/delta.ts:28` 定义了 `buildEntityDelta`：

```text
previousIds + nextIds + touched + removed -> EntityDelta
```

但 `shared/projector` 已经有类似能力：

- `shared/projector/src/delta/entityDelta.ts:30` `normalize`
- `shared/projector/src/delta/entityDelta.ts:63` `fromChangeSet`
- `shared/projector/src/delta/entityDelta.ts:83` `fromSnapshots`

当前 `buildEntityDelta` 不是完全重复，因为它基于 `trace.touched` 而不是 snapshot value comparison。但它代表的是一个通用模式：

```text
ordered entity family + touched ids + removed ids -> EntityDelta
```

建议把这个能力补到 `shared/projector/delta`：

```ts
entityDelta.fromTouchedSet({
  previousIds,
  nextIds,
  touched,
  removed
})
```

然后 document records/fields/views/schemaFields 都不需要在 dataview engine 自己写 `buildEntityDelta`。

### 不建议下沉的部分

`buildValueDelta` 不建议直接下沉到 shared，因为它理解 Dataview 的 `ValueRef`、record values、field removal 语义。

但它可以从 `mutation/delta.ts` 移到更合适的：

```text
dataview-engine/src/delta/documentValues.ts
```

或者更进一步放到 `dataview-core`，由 core 根据 `DataviewTrace` 与 document snapshots 投射 document delta。

## 7. 问题四：document delta 可能更适合靠近 dataview-core

`projectDocumentDelta` 使用的是：

- `DataDoc`
- `documentApi.records/fields/schema/views`
- `DataviewTrace`
- `ValueRef`
- `DocumentDelta`

它没有依赖 active index、active projector、engine runtime，主要是纯 document snapshot + trace 计算。

因此它有两个可能归宿：

### 方案 A：留在 dataview-engine，但移出 mutation

适合如果 `DocumentDelta` 是 engine 对 UI 的输出协议：

```text
dataview-engine/src/delta/document.ts
```

### 方案 B：下沉到 dataview-core

适合如果 document delta 未来也会被其他 runtime 复用，例如 server sync、worker projection、headless dataview engine：

```text
dataview-core/src/projection/documentDelta.ts
```

我更推荐先采用方案 A。原因是当前 `DocumentDelta` 类型位于 `dataview-engine/contracts/delta`，属于 engine 对外 read/update 协议。等协议稳定后，再考虑把纯 core delta 作为 core projection 输出。

## 8. 问题五：performance trace 装配与 mutation publish 混在一起

`dataview/packages/dataview-engine/src/mutation/publish.ts:191` 到 `dataview/packages/dataview-engine/src/mutation/publish.ts:205` 构造 `CommitTrace`。

同时：

- `dataview/packages/dataview-engine/src/mutation/trace.ts:13` 定义 `summarizeTrace`。
- `dataview/packages/dataview-engine/src/mutation/trace.ts:55` 定义 `toPerformanceKind`。
- `dataview/packages/dataview-engine/src/mutation/publish.ts:208` 调用 `perf.recordCommit`。

这让 mutation publish 同时知道 performance runtime 的写入方式与 trace 结构。

建议拆成：

```text
dataview-engine/src/runtime/performance/commitTrace.ts
  createCommitTrace({ write, trace, indexTrace, activeTrace, timings })
  recordCommitTrace(perf, trace)
```

mutation publish 只传入必要参数，不拼装 performance object。

## 9. 问题六：`createBaseImpact(trace)` 重复构造

`dataview/packages/dataview-engine/src/mutation/publish.ts:151` 的 `deriveIndex` 创建了一次 `createBaseImpact(trace)`。

`dataview/packages/dataview-engine/src/mutation/publish.ts:158` 的 active projector update 又创建了一次 `createBaseImpact(trace)`。

这不是性能大问题，但说明 publish pipeline 没有统一的 commit context。建议在 publish reduce 开始时创建一次：

```ts
const context = createPublishContext({ doc, previous: prev, write })
```

里面包含：

```text
read
plan
trace
impact
startedAt
previousPlan
```

后续 index 与 active 都从 context 读取，避免重复构造和参数散落。

## 10. 问题七：activeProjector 生命周期藏在闭包中

`dataview/packages/dataview-engine/src/mutation/publish.ts:121` 创建 `let activeProjector = createActiveProjector()`。

`dataview/packages/dataview-engine/src/mutation/publish.ts:126` 在 init 时重置 projector。

这能工作，但生命周期隐藏在 MutationPublishSpec 的闭包中，使 publish spec 同时成为 stateful runtime。

建议显式建模为 publish pipeline 实例：

```ts
const pipeline = createDataviewPublishPipeline({ performance })

return {
  init: pipeline.init,
  reduce: pipeline.reduce
}
```

这样：

- activeProjector 是 pipeline 的内部状态，不属于 mutation spec。
- 后续如果加入多个 active views、后台 projector、worker projector，不需要改 mutation spec。
- 测试 publish pipeline 时不必构造完整 MutationEngine。

## 11. `spec.ts` 的评价与建议

`dataview/packages/dataview-engine/src/mutation/spec.ts` 是当前目录里职责最清晰的文件。

它应该继续保留在 mutation 目录，作为 Dataview 对 `shared/mutation` 的唯一 adapter。

但可以做两点轻量收敛：

### 11.1 history policy 单独命名

`dataview/packages/dataview-engine/src/mutation/spec.ts:44` 的 `DEFAULT_HISTORY_CONFIG` 与 `dataview/packages/dataview-engine/src/mutation/spec.ts:51` 的 `shouldTrackOrigin` 可以移到：

```text
dataview-engine/src/mutation/historyPolicy.ts
```

这样 `spec.ts` 更像声明式 wiring：

```ts
history: createDataviewHistorySpec(historyConfig)
```

### 11.2 apply adapter 可以更薄

`dataview/packages/dataview-engine/src/mutation/spec.ts:102` 当前将 `applyOperations` 结果转成 `mutationApply.success(result)`。

这很合理，不需要大改。但如果多个 domain-engine 都有类似 adapter，可以让 `shared/mutation` 提供：

```ts
mutationApply.fromReducerResult(result)
```

这样 domain-engine 不需要重复写 ok/error 转换。

这个建议优先级低，不应先做。

## 12. 与 active 审计的关系

这次 mutation 审计和 active 审计的结论一致：

- active 的问题是 projector 外围仍有重复装配。
- mutation 的问题是 publish pipeline 吃进了 index、active projector、delta、performance。

二者应该一起收敛到一个更清晰的 read projection pipeline：

```text
MutationEngine.reduce
  -> dataview publish pipeline
    -> document reader/context
    -> view plan
    -> active index
    -> active projector
    -> document delta
    -> active delta
    -> performance trace
```

但这个 pipeline 不应该叫 `mutation/publish.ts`，因为它不仅是 mutation，也不仅是 publish spec。它更像：

```text
dataview-engine/src/read-model/pipeline.ts
```

或：

```text
dataview-engine/src/projection/pipeline.ts
```

推荐命名为 `projection`，因为它与 `shared/projector` 的方向一致。

## 13. 推荐目标结构

建议最终结构：

```text
dataview/packages/dataview-engine/src/mutation
  index.ts
  spec.ts
  publishSpec.ts
  historyPolicy.ts

dataview/packages/dataview-engine/src/projection
  pipeline.ts
  context.ts
  state.ts
  performance.ts
  delta/
    document.ts
    active.ts
    valueRefs.ts

dataview/packages/dataview-engine/src/active
  projector/
  index/
  query/
  membership/
  summary/
  publish/
```

职责边界：

```text
mutation/spec.ts
  创建 MutationEngineSpec，只做 compile/apply/publish/history wiring

mutation/publishSpec.ts
  把 projection pipeline 包装成 MutationPublishSpec

projection/pipeline.ts
  组合 reader、plan、index、active projector、delta、performance

projection/delta/document.ts
  从 DataDoc + DataviewTrace 计算 DocumentDelta

active/publish/delta.ts 或 projection/delta/active.ts
  从 ViewState snapshot 与 summary delta 计算 ActiveDelta
```

## 14. 可下沉到 shared 的能力

### 14.1 建议进入 `shared/projector/delta`

```ts
entityDelta.fromTouchedSet({
  previousIds,
  nextIds,
  touched,
  removed
})
```

来源：`dataview/packages/dataview-engine/src/mutation/delta.ts:28`。

收益：records、fields、schemaFields、views 都可用同一个 primitive，whiteboard 的 touched node/edge/canvas delta 也可能复用。

### 14.2 建议进入 `shared/projector/publish`

```ts
publishStruct({ previous, next, keys })
projectListChange(previous, next)
```

来源：active 审计中已指出，mutation 的 `projectActiveDelta` 也有相同结构比较问题。

收益：active delta、document delta、whiteboard graph delta 都可以用统一结构表达“引用是否变化”。

### 14.3 不建议进入 `shared/mutation`

以下不应进入 `shared/mutation`：

- `projectDocumentDelta`
- `projectActiveDelta`
- `resolveViewPlan`
- `deriveIndex`
- `createActiveProjector`
- performance trace assembly

`shared/mutation` 应保持只关心写入流水线：compile/apply/history/write/publish hook。它不应该理解 read projection。

## 15. 可下沉到 dataview-core 的能力

### 15.1 可能进入 dataview-core

这些逻辑纯度较高，可评估下沉：

```text
DocumentDelta projection from DataDoc + DataviewTrace
ValueRef delta projection
```

前提是 `DocumentDelta` 或其 core 版本不依赖 engine UI 协议。

### 15.2 应继续留在 dataview-engine

这些不应进入 core：

```text
active index derive
active view projector
ViewState / ActiveDelta
performance runtime commit trace
```

它们属于 engine runtime/read model，而不是 core document model。

## 16. 分阶段迁移方案

### 阶段一：拆出 publish pipeline，不改变行为

目标：让 mutation 目录变薄。

操作：

- 新建 `projection/pipeline.ts`，迁移 `publish.ts` 中 `createPublishState` 与 `reduce` 主流程。
- 新建 `mutation/publishSpec.ts`，只把 pipeline 包成 `MutationPublishSpec`。
- `mutation/spec.ts` 继续调用 `createDataviewPublishSpec`，保持外部 API 不变。

验收标准：

- `mutation/publish.ts` 或 `publishSpec.ts` 不再直接包含 index/active/delta/performance 的完整流程。
- pipeline 可以单独测试，不依赖完整 MutationEngine。

### 阶段二：拆分 delta

目标：document delta 与 active delta 边界清晰。

操作：

- `projectDocumentDelta` 移到 `projection/delta/document.ts`。
- `projectActiveDelta` 移到 `projection/delta/active.ts` 或 `active/publish/delta.ts`。
- `buildValueDelta` 移到 `projection/delta/valueRefs.ts`。

验收标准：

- 不再存在 `mutation/delta.ts` 同时 import `DataDoc` 与 `ViewState` 的情况。
- document delta 测试与 active delta 测试可以分开。

### 阶段三：补齐 shared/projector delta primitive

目标：减少本地重复 delta helper。

操作：

- 在 `shared/projector/delta` 增加 `fromTouchedSet`。
- 替换 dataview document delta 中的 `buildEntityDelta`。
- 评估 whiteboard graph delta 是否也能使用。

验收标准：

- `dataview-engine` 不再自定义通用 entity touched delta builder。
- `shared/projector/delta` 仍保持领域无关。

### 阶段四：抽离 performance assembly

目标：performance 不污染 mutation publish 主流程。

操作：

- 新建 `projection/performance.ts` 或 `runtime/performance/commitTrace.ts`。
- 迁移 `summarizeTrace` 与 `toPerformanceKind`，或保留 dataview trace summary 但从 mutation 目录移出。
- publish pipeline 只调用 `recordProjectionPerformance(...)`。

验收标准：

- `mutation` 目录不再 import `CommitTrace`、`IndexTrace`、`PerformanceRuntime` 细节。
- 关闭 performance 时主流程没有额外结构装配。

## 17. 不建议做的事

### 17.1 不建议把 publish pipeline 塞进 `shared/mutation`

MutationEngine 的 publish hook 是扩展点，不是 read projection framework。把 index/projector/performance pipeline 放进 shared/mutation 会让 shared/mutation 变重，违背“MutationEngine 只负责写入流水线”的原则。

### 17.2 不建议把 active projector 从 publish pipeline 中移除

当前 active projector 在 mutation publish 后运行是合理的。需要改的是位置和边界，不是删除 projector。

### 17.3 不建议为了目录少继续保留 `mutation/delta.ts`

`delta.ts` 看似方便，但会让所有 UI 输出变化都挂到 mutation 下。长期会导致 mutation 目录变成“所有变更后的副作用中心”。

## 18. 最终目标

最终架构应表达为：

```text
shared/mutation
  MutationEngine：compile/apply/history/write/publish hook

shared/reducer
  Reducer：operation apply + inverse + footprint + trace extra

shared/projector
  Projector：projection phases + delta/publish primitives

dataview-core
  document model + intents + operations + reducer + trace

dataview-engine/mutation
  DataviewMutationSpec：连接 core mutation 与 shared MutationEngine

dataview-engine/projection
  Dataview read model pipeline：doc/index/active/delta/performance

dataview-engine/active
  Active view projector：query/membership/summary/publish
```

这样分层后，`mutation` 不再是复杂度中心，只是写入引擎入口；复杂度被放回各自应该在的位置：core 负责领域规则，projector 负责读模型，projection pipeline 负责组合。

## 19. 优先级排序

建议执行优先级：

1. 拆出 `projection/pipeline.ts`：收益最大，风险低，行为不变。
2. 拆分 `mutation/delta.ts`：收益大，能立即改善边界。
3. 增加 `shared/projector/delta.fromTouchedSet`：收益中高，能减少重复 helper。
4. 抽离 performance assembly：收益中，降低 publish 主流程噪音。
5. 评估 document delta 是否下沉 `dataview-core`：架构收益高，但需要先稳定 delta 协议。


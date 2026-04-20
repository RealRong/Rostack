# Dataview Next Stage Optimization Plan

## 1. 结论摘要

基于当前这份 `140ms` 的 click 火焰图，可以先下一个明确结论：

> 当前瓶颈已经从早期的 `bucket/group/query` 转移到了 `calc/summary -> patch/source -> layout` 这条后半链路。

按火焰图宽度做相对判断，当前热点顺序大致是：

1. `runSummaryStage -> syncSummaryState`
2. `ensureCalculationIndex -> buildFieldCalcIndex -> buildFieldEntries`
3. `projectEnginePatch -> createActivePatch`
4. `applyActivePatch -> applyScopedKeyedPatch -> notifyListeners`
5. `readTableLayoutState -> rebuildLayoutModel -> TableLayoutSectionModel.sync`

这说明上一阶段把 `plan` 稳定、`bucket/sort/search` 收敛后，真正暴露出来的问题是：

1. `summary` 仍然缺少真正的 section-level 增量 substrate。
2. `output/source` 仍然在做“先算完整 state，再做一次 previous/next diff”的二次投影。
3. `layout` 仍然在消费 source store 读模型，而不是消费显式 layout delta。

因此，下一阶段不应该继续盯着局部函数微调，而应该继续把“增量真源”向下传到底。

---

## 2. 当前热点判断

这里的判断来自火焰图相对宽度，不是精确 self time 统计。

### 2.1 Summary 是当前最大的纯计算热点

火焰图主栈：

```ts
commit
  -> deriveViewRuntime
  -> deriveViewSnapshot
  -> runSummaryStage
  -> syncSummaryState
```

对应代码：

- [summary/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/summary/runtime.ts)
- [summary/sync.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/summary/sync.ts)

最重的是这段：

- [summary/sync.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/summary/sync.ts#L232)

当前 `summary.sync` 的主要问题不是“全量 rebuild”，而是“sync 仍然太贵”：

1. 它先按 `touchedSections` 外层循环。
2. 再按 `calcFields` 内层循环。
3. 每个 field 内又要处理：
   - `removedBySection`
   - `addedBySection`
   - `fieldChange.changedIds`
4. 其中 `fieldChange.changedIds` 这段还会反复做：
   - `keysByRecord.get(recordId)?.includes(sectionKey)`

这意味着当前复杂度更接近：

`changedSections * calcFields * changedRecordsOfField`

而不是理想的：

`changedSectionMembership + changedCalcEntries`

### 2.2 Calc Index 仍然存在整 field 扫描建 entry 的成本

火焰图主栈：

```ts
deriveIndex
  -> ensureCalculationIndex
  -> buildFieldCalcIndex
  -> buildFieldEntries
```

对应代码：

- [calculations.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/calculations.ts#L39)
- [calculations.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/calculations.ts#L100)

当前问题：

1. 只要 `ensureCalculationIndex()` 认为某个 calc field 需要重建，就会重新扫描 `records.ids` 生成整张 `entries`。
2. `buildFieldEntries()` 是标准的“field × visible records”线性成本。
3. 这部分成本又会在后面的 `summary.sync` 里再次被消费。

也就是说，现在 `calc` 链路里仍然存在两段重型工作：

1. `record -> CalculationEntry`
2. `section -> reducer state`

但它们之间缺少一个真正的中间增量层。

### 2.3 Output/Source 还有一轮 previous/next 二次 diff

火焰图主栈：

```ts
commit
  -> projectEnginePatch
  -> createDocumentPatch
  -> createActivePatch
```

对应代码：

- [source/project.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/source/project.ts#L304)
- [source/project.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/source/project.ts#L490)
- [source/project.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/source/project.ts#L732)

当前虽然已经不是“直接整张 active patch rebuild”，但本质上仍然是：

1. 上游先算出 `nextSnapshot`
2. output 再拿 `previousSnapshot/nextSnapshot` 做一轮结构 diff

这一步仍然会重新扫描：

1. `items.ids`
2. `sections.ids`
3. `fields.ids`
4. `query filters/sort/group`
5. `table calc`

所以它只是比原来少了一层全量发布，但还不是最终形态。

### 2.4 Source Apply 的热点是 store fan-out，不是业务计算

火焰图主栈：

```ts
set
  -> publish
  -> batch
  -> flush
  -> notifyListeners
  -> refresh
  -> ensureFresh
```

对应代码：

- [source/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/source/runtime.ts#L333)
- [source/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/source/runtime.ts#L482)

说明当前后半段的成本已经部分转移到“patch apply 触发多少 store/derived store 刷新”。

也就是说，这里的重点不是继续压 `applyScopedKeyedPatch()` 的实现细节，而是：

1. patch 是否还能更窄
2. 下游是否必须通过 source store 派生出 layout state

### 2.5 Table Layout 仍然不是显式 delta 消费者

火焰图主栈：

```ts
refresh
  -> ensureFresh
  -> readTableLayoutState
  -> rebuildLayoutModel
  -> sync
  -> TableLayoutSectionModel.sync
```

对应代码：

- [layoutState.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/virtual/layoutState.ts#L52)
- [virtual/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/virtual/runtime.ts#L273)
- [virtual/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/virtual/runtime.ts#L400)
- [layoutModel.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/virtual/layoutModel.ts#L666)

当前虽然已经不是旧的 `CurrentView -> fromCurrentView()` 全量 rebuild，但仍然存在两个问题：

1. `layoutState` 还是从 source store 读出来的派生态，而不是 commit 直接产出的结构 delta。
2. `measurementIds`、`sections`、`rowCount` 仍然是在 derived store 中按当前态重构。

所以这部分已经比上一阶段好，但还没到最终形态。

---

## 3. 根因总结

综合当前热点，核心问题可以压缩成 3 句话：

### 3.1 Summary 缺一个真正的 section-level 增量 substrate

现在有：

1. `field -> calc entries`
2. `section -> recordIds`

但是没有：

3. `field change -> touched sections -> per-section reducer delta`

于是 `summary.sync` 只能在 runtime 里临时把这两类信息重新拼起来。

### 3.2 Output 层还没有完全脱离 previous/next state diff

现在的 `source.project` 本质上还是：

1. 上游输出完整 published state
2. output 再做一次 previous/next diff

这说明 output 还不是“增量传递层”，而仍然带有“二次比较层”的性质。

### 3.3 Layout 还没有拿到自己的结构真源

现在 layout 读的是：

1. source stores
2. derived `layoutState`

而不是：

1. `TableLayoutChange`
2. `LayoutSyncResult`

这会让 layout 继续承担“从业务读模型推结构”的工作。

---

## 4. 下一阶段的优化目标

下一阶段的目标不是继续微调函数，而是完成下面 3 个结构性收口：

1. `summary` 从“按 section 临时拼 delta”改成“直接消费 calc delta + section delta”
2. `output/source` 从“previous/next diff 投影”改成“直接翻译上游 delta”
3. `layout` 从“读 source 派生结构”改成“直接同步 layout change”

只有这三件事完成，当前火焰图里后半条链路才会真正塌下去。

---

## 5. Phase 1：重写 Calc/Summary 增量链

### 5.1 目标

把 `summary.sync` 的复杂度从：

`changedSections * calcFields * changedIds`

降到：

`sectionDelta + calcDeltaBySection`

### 5.2 当前问题

当前 `summary.sync` 的输入过于原始：

1. `impact.sections`
2. `impact.calculations.byField`
3. `sections.keysByRecord`
4. `index.calculations.fields`

这些原始输入在 `summary.sync` 内部才被重新组合，所以 runtime 里出现了大量：

1. `recordId -> sectionKey`
2. `field -> changedIds`
3. `section -> field reducer apply`

### 5.3 下一步设计

建议新增一层显式 summary substrate。

候选设计：

```ts
interface SummaryFieldDelta {
  fieldId: FieldId
  bySection: ReadonlyMap<SectionKey, {
    added?: readonly RecordId[]
    removed?: readonly RecordId[]
    updated?: readonly RecordId[]
  }>
}

interface SummaryDelta {
  rebuild: boolean
  sections: ReadonlySet<SectionKey>
  fields: ReadonlyMap<FieldId, SummaryFieldDelta>
}
```

关键点：

1. `fieldChange.changedIds` 只允许在一处被投影成 `bySection`。
2. `summary.sync` 不再对每个 touched section 重扫所有 changed ids。
3. `summary.sync` 只按 `SummaryDelta.bySection` 直接 apply reducer。

### 5.4 实施建议

第一步：

1. 在 `runSummaryStage()` 前新增 `buildSummaryDelta(...)`
2. 只做一件事：把 `calc field change` 投影成 `field -> section -> record ids`

第二步：

1. 把 [summary/sync.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/summary/sync.ts) 改成只消费 `SummaryDelta`
2. 删掉内部对 `fieldChange.changedIds` 的 section membership 反查

第三步：

1. 对 `added/removed/updated` 三类 record change 分开 apply
2. 避免所有变化都走统一 `previousEntry/nextEntry` 判断

### 5.5 进一步上限

如果 Phase 1 做完仍不够，再继续前推：

1. 在 calc index 层直接维护 `field -> section reducers`
2. view.summary 只负责 publish，不再维护 reducer state

这个方案更重，但会把 summary 几乎压成纯 publish。

---

## 6. Phase 2：去掉 Output 层的 previous/next 二次 diff

### 6.1 目标

让 `source.project` 不再扫描完整 `previousSnapshot/nextSnapshot`。

### 6.2 当前问题

当前 `projectEnginePatch()` 做的仍然是：

1. `doc previous/next diff`
2. `active previous/next diff`

这会让 output 层重复扫描：

1. item ids
2. section keys
3. fields
4. query projection
5. table calc

### 6.3 下一步设计

`view.sync` 完成后应直接产出 publish delta，而不是只产出 published state。

建议新增：

```ts
interface ViewPublishDelta {
  view?: {
    changed: boolean
  }
  query?: {
    changed: boolean
    filterFieldIdsChanged: boolean
    sortFieldIdsChanged: boolean
    sortDirChanged: readonly FieldId[]
  }
  items?: {
    idsChanged: boolean
    changed: readonly ItemId[]
    removed: readonly ItemId[]
    orderChanged: boolean
  }
  sections?: {
    keysChanged: boolean
    changed: readonly SectionKey[]
    removed: readonly SectionKey[]
  }
  fields?: {
    idsChanged: boolean
    changed: readonly FieldId[]
    removed: readonly FieldId[]
  }
  summaries?: {
    changed: readonly SectionKey[]
    removed: readonly SectionKey[]
  }
  table?: {
    changedCalc: readonly FieldId[]
    wrapChanged: boolean
    verticalLinesChanged: boolean
  }
}
```

然后：

1. `view.publish.sync` 负责把 stage delta 翻译成 publish delta
2. `output.source.project` 只把 publish delta 翻译成 source patch
3. `output.source.project` 禁止再读 `previousSnapshot/nextSnapshot`

### 6.4 文档 source 的特殊处理

`DocumentPatch` 也应收敛到 `DocumentChange`，不再 diff 整个 `doc`：

1. records changed/removed
2. fields changed/removed
3. views changed/removed
4. active view changed

也就是此前 checklist 里写的方向，要在代码层真正落地。

---

## 7. Phase 3：把 Source Runtime 从“store fan-out 中枢”变成“窄 apply 层”

### 7.1 目标

让 `source.apply` 的成本随真实 changed stores 线性增长，而不是随 source 拓扑复杂度增长。

### 7.2 当前问题

现在 `applyActivePatch()` 虽然已经比过去窄很多，但仍然存在两个问题：

1. patch 仍然是 state diff 投影出来的，不够窄。
2. source 的 derived consumer 仍然会因为多个 patch 点触发 refresh。

### 7.3 下一步设计

source 层下一阶段不要再承担“推导 layout input”的职责。

source 只保留给通用 UI 读模型使用的 stores：

1. doc
2. active query
3. active items
4. active sections
5. active fields
6. active summaries

但是：

1. table layout 所需结构不要再从这些 store 二次读取
2. table layout 应改为直接消费 `TableLayoutChange`

### 7.4 实施建议

1. `source.apply` 保持现在的 patch 模式，不在这一阶段重写 store 基础设施。
2. 真正要做的是把最重的 layout consumer 从 source derived chain 上摘下来。

也就是说：

> 当前 source 的主要优化点不是“继续改 patch store 实现”，而是“减少最重 consumer 对 source 的依赖”。

---

## 8. Phase 4：把 Table Layout 改成显式结构同步

### 8.1 目标

让 layout 不再从 source store 读出 `layoutState`，而是直接消费 `TableLayoutChange`。

### 8.2 当前问题

当前 layout 已经比旧版好，但还是：

1. `readTableLayoutState(source)`
2. `layoutStateStore`
3. `layoutModel.sync(state)`

这依然是“读模型 -> 结构模型”的一层转换。

### 8.3 下一步设计

建议新增：

```ts
interface TableLayoutChange {
  structure: {
    rebuild: boolean
    groupedChanged: boolean
    sectionOrderChanged: boolean
  }
  sections: ReadonlyMap<SectionKey, {
    changed: boolean
    collapsedChanged: boolean
    rowOrderChanged: boolean
    addedRows?: readonly ItemId[]
    removedRows?: readonly ItemId[]
  }>
  removedSections?: readonly SectionKey[]
}
```

然后把流程改成：

```ts
output.table.project(viewPublishDelta) -> TableLayoutChange
layout.table.sync(change) -> TableLayoutState
virtual window materialize(state, viewport)
```

### 8.4 实施建议

第一步：

1. 把 [layoutState.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/virtual/layoutState.ts) 的职责迁走
2. 改为 `table.project.ts` 直接输出 `TableLayoutChange`

第二步：

1. [layoutModel.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/virtual/layoutModel.ts) 改成按 `TableLayoutChange` patch section model
2. 禁止再从 `measurementIds` 反推结构

第三步：

1. `measurementIds` 改为 layout state 的派生结果，但只在 changed sections 上更新
2. 不再每次按全部 section/item 重新拼接一遍

### 8.5 最终状态

最终 layout 应该做到：

1. flat table row value 变化且顺序不变时，layout 完全不动
2. grouped table 中某 section 内 item 顺序不变时，不重建其他 section model
3. section collapse 切换时，只更新该 section block 链

---

## 9. 推荐实施顺序

正确顺序不是从 source 开始，而是从最上游的大头开始。

### 9.1 第一步

先做 `summary delta`。

原因：

1. 它是当前最大的纯计算热点。
2. 它会直接压掉 `runSummaryStage` 的主峰。
3. 做完后才能看清 output/source/layout 的真实占比。

### 9.2 第二步

再做 `output publish delta -> source project`。

原因：

1. 这是当前后半段最明显的重复比较成本。
2. 它和 source/layout 解耦关系最强。

### 9.3 第三步

最后做 `table layout change`。

原因：

1. layout 现在已经不是最大热点。
2. 但它是 source fan-out 里最重的 consumer。
3. 应该在 output delta 稳定后再切。

推荐顺序固定为：

```ts
1. summary delta
2. view publish delta
3. source project/apply 收窄
4. table layout change
5. trace/bench 回扫
```

---

## 10. 验收预算

这部分是建议目标，不是当前结果。

以当前 `50k table + filter value change` 为基线，下一阶段建议把非渲染链路压到：

| 阶段 | 当前判断 | 下一阶段目标 |
| --- | --- | --- |
| calc index | 仍偏重 | `<= 8ms` |
| summary sync | 当前最大热点 | `<= 12ms` |
| output/source project | 明显可见 | `<= 6ms` |
| source apply + notify | 明显可见 | `<= 8ms` |
| table layout sync | 后半段热点 | `<= 6ms` |
| 总非渲染链路 | 当前约 `140ms` 全链路中的主要部分 | `<= 50~70ms` |

注意：

1. 这里的预算是下一阶段目标，不是承诺值。
2. 真正验收必须补 `output` 维度 trace，而不是只看 `index/view/snapshot`。

---

## 11. 必须补的 Trace

如果不补 trace，下一阶段优化很容易再次“只看火焰图猜测”。

建议新增：

```ts
commit
  -> plan
  -> index
  -> view
    -> query
    -> section
    -> summary
  -> output
    -> viewPublish
    -> sourceProject
    -> sourceApply
    -> tableProject
    -> tableSync
```

至少要补 5 个时间段：

1. `summaryDeltaMs`
2. `viewPublishMs`
3. `sourceProjectMs`
4. `sourceApplyMs`
5. `tableSyncMs`

否则下一轮仍然只能看到：

1. `viewMs`
2. `snapshotMs`

而看不到真正的后半段分布。

---

## 12. 最终判断标准

下一阶段完成后，系统应该满足以下 6 条：

1. `summary.sync` 不再遍历 `changedSections * calcFields * changedIds`
2. `source.project` 不再读取 `previousSnapshot/nextSnapshot` 做二次 diff
3. `DocumentPatch` 来自 `DocumentChange`，而不是整 doc diff
4. `table layout` 不再通过 `readTableLayoutState(source)` 建结构
5. `output` 有自己的 trace，不再藏在 `snapshot/source/layout` 之外
6. `50k filter value change` 下，热点中心从 `summary + patch + layout` 明显下降

这 6 条如果缺任何一条，都说明下一阶段还没真正完成。

# Dataview Next Stage Optimization Plan

## 1. 结论摘要

基于最新这组阶段火焰图，以及当前代码实现，下一阶段的主要矛盾已经比较明确：

1. `plan` 基本稳定了，`filter value` 不再是最主要的 demand 抖动源。
2. 真正最重的热点已经收敛到 `calc index -> sections -> summary -> source apply`。
3. 当前问题不是“顶层阶段太多”，而是几个内部 stage 之间仍然在重复投影同一批变更。

所以，下一阶段不该再做一轮“大而全”的总线式重构，也不该继续盯着单个 `Map.get()`。

正确方向是：

> 让一批 record change 只在 `calc -> section -> summary -> publish -> source.apply` 这条链上被解释一次，并且每一层都直接消费上游 delta，而不是重新从完整 state 反推。

这轮的优先级也很明确：

1. 先修 `calc index` 的误重建。
2. 再收 `sections` 的双遍投影。
3. 再把 `summary` 改成直接消费 section/calc substrate。
4. 最后压 `output/source apply` 的全图扫描和 store fan-out。

---

## 2. 当前热点定位

这里的“热点”是按最新火焰图和当前代码一一对应，不再引用旧版本结论。

| 优先级 | 热点 | 代码位置 | 当前问题 |
| --- | --- | --- | --- |
| 1 | `ensureCalculationIndex -> buildFieldCalcIndex -> buildFieldEntries` | `dataview/packages/dataview-engine/src/active/index/calculations.ts` | `capabilities` 仍按引用比较，容易把本该 `reuse/sync` 的 field 误判为重建 |
| 2 | `runSectionsStage -> syncSectionState -> publishGroupedSections` | `dataview/packages/dataview-engine/src/active/snapshot/sections/{sync,publish,runtime}.ts` | section membership 已经算过一遍，grouped projection 在 publish 阶段又按 section 再投影一遍 |
| 3 | `runSummaryStage -> buildSummaryDelta` | `dataview/packages/dataview-engine/src/active/snapshot/summary/{runtime,sync}.ts` | summary 热点已经从 reducer apply 转移到 delta 组装，说明 substrate 仍不对 |
| 4 | `projectEngineOutput -> source.apply -> patch -> notifyListeners` | `dataview/packages/dataview-engine/src/source/{project,runtime}.ts` 与 `shared/core/src/store/keyed.ts` | output 仍有 previous/next 投影，apply 阶段还会按 scope 扫整图，store patch 还会整图 clone |

两个次级观察：

1. `query.collectVisibleDiff` 还在，但目前不是主矛盾，量级明显小于上面四段。
2. `table layout` 已经从 source 派生模型切到 `active.table.layout`，这一轮不是首要目标，除非压完 source fan-out 后它重新浮上来。

---

## 3. 关键判断

### 3.1 这不是顶层阶段过多的问题

当前顶层已经收敛成：

```ts
commit
  -> plan.sync
  -> index.sync
  -> view.sync
  -> output.sync
```

这四段本身没有明显问题。

真正复杂的是：

1. `index` 内部的 `calc` 还会误 rebuild。
2. `view.section` 和 `view.summary` 之间还没有共享足够直接的 membership substrate。
3. `output/source` 还没有完全变成“纯 delta 翻译层”。

所以这不是“再压平顶层协议”能解决的问题。

### 3.2 需要的是 3 个内部 contract，而不是一个更大的全局 context

用户之前提到“底层缺少一个 reader 或 context”。这个方向是对的，但不应该落成一个更大的万能 context。

真正缺的是下面 3 个具体 contract：

1. `calc field change`
   需要稳定、可复用、不会误重建的 field-level calc substrate。
2. `section membership change`
   需要一份能同时服务 `section publish` 和 `summary` 的 section delta。
3. `publish/source entity change`
   需要显式 `set/remove/ids`，不能到 apply 阶段再从 scope 反推 remove。

也就是说，问题不在“上下文不够大”，而在“跨层共享的变更语义还不够直接”。

### 3.3 下一阶段不需要先碰渲染

用户已经明确这轮先不看渲染。按当前热点看，这个判断是对的。

在 source apply 之前，业务侧已经还有明显可收的重复工作：

1. 误 rebuild
2. section 双投影
3. summary fan-out
4. source apply 全图扫描

这些不收掉，继续看 render 只会把注意力带偏。

---

## 4. 下一阶段的总目标

下一阶段结束后，系统应该满足下面 4 条硬约束。

### 4.1 calc field 不得因 capability 引用变化而误 rebuild

相同语义的 capability，不允许因为对象引用不同就重建整张 `entries`。

### 4.2 section membership 只能算一次

`record -> sectionKeys` 和 `sectionKey -> recordIds` 一旦在 section stage 里算出，后面的 publish 和 summary 只能消费，不允许再各自补一份投影。

### 4.3 summary 只消费真实变更，不再自己笛卡尔展开

summary 的复杂度要从：

`calcFields * touchedSections * changedRecords`

压回：

`changedCalcRecords + changedSectionMembership`

### 4.4 source apply 不再根据 scope 反推 remove

`apply` 必须只执行 delta，不再做：

1. `collectMissingKeys(store.all(), scopeIds)`
2. 小 patch 也 `new Map(current)`

---

## 5. 分阶段实施方案

### Phase 0：先修 calc index 的误重建

这是当前最像“明确 bug”的部分，优先级最高，而且不需要等架构改造。

#### 涉及文件

- [calculations.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/calculations.ts)
- [calculation.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/shared/calculation.ts)
- [demand.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/demand.ts)

#### 当前问题

`ensureCalculationIndex()` 里仍然有基于 capability 引用的判断：

1. `previousField.capabilities !== demand.capabilities`

而 `normalizeCalculationDemands()` / `createCalculationDemand()` 会持续产出新对象。

这会导致：

1. calc 配置语义没变
2. 但 field index 被误判为 changed
3. 进而整 field 重建 `entries`

#### 要做的事

1. 把 capability 比较切到结构比较，复用 `sameReducerCapabilities()`。
2. 如果仍然需要更强稳定性，就把 capability 做 canonicalization，例如生成稳定 key。
3. 把 calc rebuild trace 单独打出来，确保能区分：
   - 真 rebuild
   - sync
   - 误 rebuild

#### 完成标志

在 filter value 改变但 calc 配置未变时：

1. `ensureCalculationIndex()` 不再重建无关 field。
2. `buildFieldEntries()` 宽度明显下降。

---

### Phase 1：把 sections 从“双遍投影”改成“单遍 membership substrate”

当前 `sections` 的问题不是 membership 没有增量，而是它已经有了，但 publish 没直接复用。

#### 涉及文件

- [runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/sections/runtime.ts)
- [sync.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/sections/sync.ts)
- [publish.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/sections/publish.ts)

#### 当前问题

当前 grouped 路径基本是两遍：

1. `syncSectionState()` 先维护 `keysByRecord`、`addedByKey`、`removedByKey`
2. `publishGroupedSections()` 再对所有 section 跑 `syncGroupedSectionProjection()`

这意味着：

1. membership 变更已经知道了
2. 但 item projection 没有变成 section runtime 的持久状态
3. publish 阶段只好再按 section 重做一轮

#### 目标结构

section stage 需要自己持有 grouped projection substrate，而不是 publish 临时重建：

```ts
interface SectionRuntimeState {
  structure: SectionState
  grouped?: {
    bySection: ReadonlyMap<SectionKey, GroupedSectionProjection>
  }
}

interface SectionDelta {
  rebuild: boolean
  orderChanged: boolean
  removed: readonly SectionKey[]
  membership: ReadonlyMap<SectionKey, SectionMembershipChange>
  grouped?: ReadonlyMap<SectionKey, GroupedSectionProjectionChange>
}

interface SectionMembershipChange {
  add: readonly RecordId[]
  remove: readonly RecordId[]
}
```

#### 要做的事

1. 把 grouped item projection 从 `publish.ts` 挪到 section runtime cache/state。
2. `syncSectionState()` 直接产出按 section 的 membership change。
3. grouped projection 只更新 touched section，不再对所有 section 跑一遍同步。
4. `publishSections()` 退化成纯 materialize，不再承担增量推导责任。

#### 完成标志

小范围 visible change 时：

1. `publishGroupedSections()` 不再是宽热点。
2. touched section 数量与实际 membership 变化成正比。

---

### Phase 2：让 summary 直接消费 section/calc substrate

当前 `syncSummaryState()` 已经不是主热点，热点在 `buildSummaryDelta()`，这说明 reducer 应用逻辑基本没错，错的是 delta 组装方式。

#### 涉及文件

- [runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/summary/runtime.ts)
- [sync.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/snapshot/summary/sync.ts)

#### 当前问题

现在的 `buildSummaryDelta()` 仍然需要临时拼：

1. `sections.addedByKey / removedByKey`
2. `calculations.byField.changedIds`
3. `previousSections.keysByRecord`
4. `sections.keysByRecord`

然后在 runtime 里把这些信息再次交叉。

这说明 summary 还在做“解释型 delta 组装”，而不是“消费型 delta 应用”。

#### 目标结构

summary 输入应该更直接：

```ts
interface SummarySyncInput {
  section: {
    state: SectionState
    delta: SectionDelta
  }
  calc: {
    byField: ReadonlyMap<FieldId, EntryChange<RecordId, CalculationEntry>>
  }
}

interface SummaryDelta {
  rebuild: boolean
  removed: readonly SectionKey[]
  bySection: ReadonlyMap<SectionKey, ReadonlyMap<FieldId, SummaryFieldDelta>>
}
```

重点不是再建一个更大的 summary state，而是让 summary 直接拿到：

1. 哪些 section membership 变了
2. 哪些 field entry 变了
3. 这些变更该投到哪些 section

#### 要做的事

1. section stage 输出稳定的 `membership delta by section`。
2. calc stage 继续输出 `EntryChange<RecordId, CalculationEntry>`，但不再让 summary 自己回头查 membership。
3. `buildSummaryDelta()` 改成按“已知受影响 section”直接建 field delta。
4. 如果 section membership 与 calc record change 都为空，summary 直接 `reuse`。

#### 完成标志

1. `buildSummaryDelta()` 的热点宽度明显低于当前版本。
2. summary 成本与 `changed memberships + changed calc records` 线性相关。

---

### Phase 3：让 output/source 变成纯 delta 翻译与应用

这一阶段的目标不是再改业务算法，而是把前面收敛出来的 delta 直接传到底。

#### 涉及文件

- [project.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/source/project.ts)
- [runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/source/runtime.ts)
- [keyed.ts](/Users/realrong/Rostack/shared/core/src/store/keyed.ts)

#### 当前问题 A：`projectViewPublishDelta()` 仍然主要靠 previous/next diff

虽然现在已经不是旧的整张 active patch，但 `projectViewPublishDelta()` 仍然在做：

1. `collectChangedSectionKeys()`
2. `buildItemValueDelta()`
3. `buildSectionValueDelta()`
4. `buildSectionSummaryDelta()`

这意味着 output 还在重复解释 `section/summary` 的变化。

#### 当前问题 B：`source.apply` 仍然会按 scope 扫整图

`applyEntityDelta()` 里仍然存在：

1. `collectMissingKeys(store.all(), scopeIds)`

这会把窄 delta 重新放大成全图扫描。

#### 当前问题 C：`KeyedStore.patch()` 仍然整图 clone

当前 `patch()` 每次都：

1. `const next = new Map(current)`

如果 patch 高频且 key 多，这会把 apply 成本继续放大。

#### 目标结构

output/project 和 source/apply 的接口要更直接：

```ts
interface SourceEntityChange<TKey, TValue> {
  ids?: readonly TKey[]
  set?: ReadonlyMap<TKey, TValue | undefined>
  remove?: readonly TKey[]
}

interface SourceApplyInput {
  delta: SourceDelta
}
```

关键点只有两个：

1. `remove` 必须在 project 阶段明确给出。
2. apply 阶段只执行 patch，不再根据 scope 推断缺失 key。

#### 要做的事

1. 让 `projectViewPublishDelta()` 直接消费 `query/section/summary` delta，而不是继续从完整 `ViewState` 反推。
2. `SourceDelta` 内所有 keyed 实体都显式带 `remove`。
3. 删除 `collectMissingKeys()` 路径。
4. 如果 source apply 仍明显，继续下探 `createKeyedStore().patch()`，把“小 patch 也整图 clone”的实现换掉。

#### 完成标志

1. `projectEngineOutput()` 左半边的 diff 组装显著变窄。
2. `source.apply` 不再出现按 scope 扫全图的热点。
3. `notifyListeners` 的 fan-out 只和 changed keys 成正比。

---

## 6. 建议实施顺序

严格按下面顺序推进，不建议并行乱改。

1. `calc index` 误 rebuild
   这是低风险、高确定性的收益点。
2. `sections` substrate
   不先做它，summary 不可能真正收窄。
3. `summary` substrate
   不先拿到 section delta，summary 只能继续在 runtime 拼装。
4. `output/source`
   前面三段不收敛，output 做得再漂亮也只是搬热点。
5. `KeyedStore` 内核
   只有在明确 source apply 仍显著时再做，不要过早下沉到底层。

---

## 7. 不建议做的事

### 7.1 不建议先做新一轮顶层大重构

当前问题不是 `commit -> plan -> index -> view -> output` 这 4 段太多。

继续重写顶层协议，短期只会把已经收敛的边界打散。

### 7.2 不建议继续抠局部 util 常数项

例如：

1. `trimToUndefined`
2. `toScalarBucketKey`
3. `target.get(key) ?? 0`

这些当然可以优化，但已经不是当前最值得先动的层级。

### 7.3 不建议这轮优先碰 table render

现在更大的成本还在业务侧与 source apply 侧，先动 render 只会掩盖真实问题。

---

## 8. 验收方式

下一阶段完成后，至少要重新验证下面 4 件事。

1. `calc index`
   在 filter value 改变但 calc 配置不变时，不再触发无关 field rebuild。
2. `sections`
   grouped publish 不再对所有 section 重新投影。
3. `summary`
   热点从 `buildSummaryDelta()` 明显收窄，且不再随 `calcFields * touchedSections` 放大。
4. `source`
   apply 阶段不再扫描整张 keyed store，也不再因小 patch 产生明显整图 clone。

如果这 4 条都成立，下一轮热点才有资格继续往 render 或更底层 store 机制迁移。

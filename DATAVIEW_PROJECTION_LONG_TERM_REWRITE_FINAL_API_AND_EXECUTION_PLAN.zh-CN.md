# Dataview Projection 最终 API 与详细重构实施方案

## 约束

- 不保留兼容层。
- 不保留两套 runtime、delta、impact、dirty、plan。
- projection 顶层只保留 `frame` 和 `active` 两层。
- `index` 不再是 projection 顶层 phase，而是 `active` 内部 stage 0。
- `DataviewMutationDelta` 是唯一 mutation 模型，不再引入并列的 facts/helper runtime。
- stage action 只能在 planner 决定一次，executor 只产出结果，不反推 action。

## 不保留的旧模型

- `DataviewProjectionInput.runtime: {}`
- 顶层 `index / query / membership / summary / view` phases
- `DataviewDeltaFacts`
- `DataviewActiveMutationView`
- `activeKey`
- `binding: { viewId, descriptorKey }`
- publish 根据结果反推 action
- `ViewPlan` 同时表示配置描述和执行计划

## 最终结构

```ts
projection update
  -> createDataviewFrame(...)
  -> ensureDataviewIndex(...)
  -> createDataviewActivePlan(...)
  -> runDataviewActive(...)
```

projection shell 只负责两件事：

- 生成 `frame`
- 执行 `active`

`query / membership / summary / publish` 只作为 `runDataviewActive(...)` 的内部步骤存在。

## 最终 API 设计

### 1. 对外 projection API

```ts
export interface DataviewProjectionInput {
  document: DataDoc
  delta: DataviewMutationDelta
}

export interface DataviewProjectionOutput {
  activeId?: ViewId
  active?: ViewState
}
```

### 2. 核心类型

```ts
export interface DataviewActiveFrame {
  id: ViewId
  view: View
  demand: NormalizedIndexDemand
  query: {
    plan: QueryPlan
    changed(aspect?: DataviewQueryAspect): boolean
  }
  section?: {
    fieldId: FieldId
    mode?: ViewGroup['mode']
    sort?: ViewGroup['bucketSort']
    interval?: ViewGroup['bucketInterval']
    showEmpty: boolean
  }
  calc: {
    fields: readonly FieldId[]
    changed(): boolean
  }
}

export interface DataviewFrame {
  revision: Revision
  reader: DocumentReader
  delta: DataviewMutationDelta
  active?: DataviewActiveFrame
}
```

命名收口如下：

- `DataviewProjectionFrame` -> `DataviewFrame`
- `DataviewActiveFrame.viewId` -> `id`
- `DataviewActiveFrame.indexDemand` -> `demand`

### 3. index runtime

```ts
export interface DataviewIndexEntry {
  key: string
  demand: NormalizedIndexDemand
  state: IndexState
  revision: Revision
  delta?: IndexDelta
  trace?: IndexTrace
}

export interface DataviewIndexBank {
  currentKey?: string
  entries: ReadonlyMap<string, DataviewIndexEntry>
}

export interface DataviewIndexResult {
  action: 'reuse' | 'switch' | 'sync' | 'rebuild'
  entry: DataviewIndexEntry
}
```

说明：

- `active` 切换时，不是“必 rebuild index”，而是“必 ensure index”。
- `ensure` 结果允许 `reuse / switch / sync / rebuild` 四种动作。
- index 内部如需读取 `touchedRecords / schemaFields / valueFields`，只允许在 index 模块内部从 `frame.delta` 派生，不提升成新的公共模型。

### 4. active planner

```ts
export interface DataviewActivePlan {
  reset: boolean
  query: {
    action: 'reuse' | 'sync' | 'rebuild'
    reuse?: {
      matched: boolean
      ordered: boolean
    }
  }
  membership: {
    action: 'reuse' | 'sync' | 'rebuild'
  }
  summary: {
    action: 'reuse' | 'sync' | 'rebuild'
    touchedSections?: ReadonlySet<SectionId> | 'all'
  }
  publish: {
    action: 'reuse' | 'sync' | 'rebuild'
  }
}
```

planner 只负责决定动作，不执行派生。

### 5. 持久状态

```ts
export interface DataviewLastActive {
  id: ViewId
  queryKey: string
  section?: DataviewActiveFrame['section']
  calcFields: readonly FieldId[]
}

export interface DataviewActiveState {
  query: QueryPhaseState
  membership: MembershipPhaseState
  summary: SummaryPhaseState
  snapshot?: ViewState
  itemIds: ItemIdPool
  patches: {
    fields?: EntityDelta<FieldId>
    sections?: EntityDelta<SectionId>
    items?: EntityDelta<ItemId>
    summaries?: EntityDelta<SectionId>
  }
  trace: {
    query: DataviewStageTrace
    membership: DataviewStageTrace
    summary: DataviewStageTrace
    publish: DataviewStageTrace
    snapshot: SnapshotTrace
  }
}

export interface DataviewState {
  lastActive?: DataviewLastActive
  index: DataviewIndexBank
  active: DataviewActiveState
}
```

命名收口如下：

- `DataviewProjectionState` -> `DataviewState`
- `DataviewPreviousActiveFrame` -> `DataviewLastActive`
- `DataviewActiveRuntime` -> `DataviewActiveState`

`lastActive` 只保留 planner 做当前/上一轮比较所需的最小信息，不进入业务 runtime 模型。

### 6. 核心内部 API

```ts
declare function createDataviewFrame(input: {
  revision: Revision
  document: DataDoc
  delta: DataviewMutationDelta
}): DataviewFrame

declare function ensureDataviewIndex(input: {
  frame: DataviewFrame
  previous: DataviewIndexBank
}): {
  bank: DataviewIndexBank
  current?: DataviewIndexResult
}

declare function createDataviewActivePlan(input: {
  frame: DataviewFrame
  state: DataviewState
  index?: DataviewIndexResult
}): DataviewActivePlan

declare function runDataviewActive(input: {
  frame: DataviewFrame
  plan: DataviewActivePlan
  index?: DataviewIndexResult
  previous: DataviewActiveState
}): DataviewActiveState
```

### 7. active 内部步骤

`runDataviewActive(...)` 内部固定顺序如下：

1. `ensureIndex`
2. `query`
3. `membership`
4. `summary`
5. `publish`

这些步骤不再作为 projection 顶层 API 暴露。

## 详细重构实施方案

### Phase 1. 类型与命名收口

目标：先把公共边界压缩到最终名字，避免后续继续在旧名上堆逻辑。

- 新增 `DataviewFrame`、`DataviewActiveFrame`、`DataviewState`、`DataviewLastActive`。
- 删除公共边界上的 `ViewPlan`，它只能退回实现细节。
- 删除 `DataviewProjectionInput.runtime`。
- 字段统一改名：
- `viewId` -> `id`
- `indexDemand` -> `demand`
- `previousActive` 类字段统一收口到 `lastActive`

涉及文件：

- `dataview/packages/dataview-engine/src/mutation/projection/types.ts`
- `dataview/packages/dataview-engine/src/active/plan.ts`
- `dataview/packages/dataview-engine/src/active/state.ts`
- `dataview/packages/dataview-engine/src/createEngine.ts`

完成标准：

- 外部 projection 输入只剩 `document + delta`
- 新旧类型不并存
- `ViewPlan` 不再作为 projection 公共输入/输出出现

### Phase 2. 落地 `createDataviewFrame(...)`

目标：把当前 document phase 中与“本轮输入上下文”相关的逻辑全部收口到 frame compiler。

实施：

- 从 `createDataviewProjection.ts` 抽出 `createDataviewFrame(...)`。
- 在这里创建 `DocumentReader`。
- 在这里解析当前 active view，并生成 `DataviewActiveFrame`。
- 把 active-view-specific 的 delta 读取能力挂到 `frame.active.query.changed(...)` 和 `frame.active.calc.changed()`。
- `DataviewFrame` 只保留 `reader`，不再同时保留 `document`。

涉及文件：

- `dataview/packages/dataview-engine/src/projection/createDataviewProjection.ts`
- `dataview/packages/dataview-engine/src/document/reader.ts`
- `dataview/packages/dataview-engine/src/mutation/delta.ts`
- 新增 `dataview/packages/dataview-engine/src/active/frame.ts`

完成标准：

- projection shell 不再散落保存 document/read/view/previousPlan 一类临时字段
- 当前 update 的上下文都能从 `DataviewFrame` 读取

### Phase 3. index runtime 改成 bank + ensure

目标：把 index 从顶层 phase 改成 active 内部前置阶段，同时支持 demand-keyed 复用。

实施：

- `active/index/runtime.ts` 重写为 `ensureDataviewIndex(...)` 入口。
- 引入 `DataviewIndexBank` 与 `DataviewIndexEntry`。
- 当前 active 切换时，通过 `demand.key` 从 bank 选当前 entry。
- 内部实现支持 `reuse / switch / sync / rebuild`。
- 所有 index 相关 delta 读取，只能在 index 模块内从 `frame.delta` 派生。

建议文件拆分：

- `dataview/packages/dataview-engine/src/active/index/bank.ts`
- `dataview/packages/dataview-engine/src/active/index/ensure.ts`
- `dataview/packages/dataview-engine/src/active/index/derive.ts`
- `dataview/packages/dataview-engine/src/active/index/runtime.ts` 最终降为兼容过渡文件后删除

完成标准：

- 顶层 projection 不再独立调 index phase
- active view 变化时执行的是 `ensureDataviewIndex(...)`，不是硬编码 rebuild

### Phase 4. 落地 `createDataviewActivePlan(...)`

目标：让 action owner 唯一化。

实施：

- 把 query/membership/summary/publish 当前分散的 action resolve 逻辑收口到一个 planner。
- planner 输入固定为 `frame + state + index`。
- 当前/上一轮比较只使用：
- `frame.active?.id`
- `frame.active?.query.plan.executionKey`
- `frame.active?.section`
- `frame.active?.calc.fields`
- `state.lastActive`
- 删除 `activeKey`、`binding`、`previousActiveViewId`、`previousDescriptorKey` 一类额外 bookkeeping。

涉及文件：

- `dataview/packages/dataview-engine/src/active/projection/dirty.ts`
- `dataview/packages/dataview-engine/src/active/query/stage.ts`
- `dataview/packages/dataview-engine/src/active/membership/stage.ts`
- `dataview/packages/dataview-engine/src/active/summary/stage.ts`
- 新增 `dataview/packages/dataview-engine/src/active/plan.ts`

完成标准：

- 每个 stage 的 action 只在 planner 里决定一次
- executor 内不再出现 action resolve / reverse infer

### Phase 5. 落地 `runDataviewActive(...)`

目标：把现有四段 stage 收口成一个 active runtime pipeline。

实施：

- 新增 `runDataviewActive(...)`。
- 内部固定顺序执行 `query -> membership -> summary -> publish`。
- 各子步骤只接收 pipeline context，不再接收大而扁平的参数列表。
- `previous` 只作为本轮 executor 输入，不再作为持久 state 上的多组 `previous.*` 字段存在。
- `patches`、`trace`、`snapshot` 全部从 `DataviewActiveState` 产出。

涉及文件：

- `dataview/packages/dataview-engine/src/active/query/stage.ts`
- `dataview/packages/dataview-engine/src/active/membership/stage.ts`
- `dataview/packages/dataview-engine/src/active/summary/stage.ts`
- `dataview/packages/dataview-engine/src/active/publish/stage.ts`
- `dataview/packages/dataview-engine/src/active/state.ts`
- 新增 `dataview/packages/dataview-engine/src/active/runtime.ts`

完成标准：

- `runQueryStage({ plan, reader, activeViewId, view, queryPlan, index, previous })` 这类签名完全消失
- 对外稳定边界只剩 `runDataviewActive(...)`

### Phase 6. 重写 projection shell

目标：把 `createDataviewProjection.ts` 收缩成真正的 `frame -> active` shell。

实施：

- shell 更新流程改成：
1. `createDataviewFrame(...)`
2. `ensureDataviewIndex(...)`
3. `createDataviewActivePlan(...)`
4. `runDataviewActive(...)`
- 删除旧的 `ctx.dirty.index/query/membership/summary/view`。
- 删除旧的顶层 phase 传播。
- surface 输出只看 `DataviewActiveState.snapshot` 与 `patches`。

涉及文件：

- `dataview/packages/dataview-engine/src/projection/createDataviewProjection.ts`
- `dataview/packages/dataview-engine/src/projection/index.ts`

完成标准：

- projection 顶层 phase 只剩 `frame` 与 `active`
- shell 不再持有旧 dirty/action 传播逻辑

### Phase 7. 清理旧模型与测试重建

目标：清掉旧链路残留，避免新旧模型同时存活。

实施：

- 删除旧 dirty helpers、旧 stage action resolvers、旧 previous/reset 过渡字段。
- trace 与 metrics 改为消费 `DataviewActiveState`。
- 重写测试边界，只测：
- `createDataviewFrame(...)`
- `ensureDataviewIndex(...)`
- `createDataviewActivePlan(...)`
- `runDataviewActive(...)`
- `createDataviewProjection(...)`

涉及文件：

- `dataview/packages/dataview-engine/src/active/projection/trace.ts`
- `dataview/packages/dataview-engine/src/active/projection/metrics.ts`
- `dataview/packages/dataview-engine/src/active/projection/dirty.ts`
- 所有 dataview projection / active 相关测试

完成标准：

- 仓库里不再存在第二套 dataview projection runtime / delta / impact / dirty 模型
- 旧 phase API、旧 helper runtime、旧命名全部删净

## 最终落地检查清单

- 只有一套 mutation 模型：`DataviewMutationDelta`
- 只有一套 projection shell：`frame -> active`
- 只有一个 index 入口：`ensureDataviewIndex(...)`
- 只有一个 active planner：`createDataviewActivePlan(...)`
- 只有一个 active executor：`runDataviewActive(...)`
- 只有一个持久状态骨架：`DataviewState`
- 没有旧 dirty phase 传播
- 没有 publish 反推 action
- 没有 `runtime: {}`
- 没有 `DataviewDeltaFacts`
- 没有 `DataviewActiveMutationView`
- 没有 `activeKey`
- 没有并存的新旧 plan/runtime/delta 命名

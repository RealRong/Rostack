# shared/projector 底层设施与 Dataview / Whiteboard 复用方案

## 1. 核心结论

Dataview active/projector 与 Whiteboard editor-graph projector 已经在做同一类事情：

```txt
Input + Previous Snapshot + Delta/Impact
  -> Plan dirty phases
  -> Run derived phases
  -> Publish next snapshot + change
  -> Sync read stores / UI sources
```

但两边真正可复用的不是领域阶段本身，而是 projector 的底层运行模型：

- phase plan
- dirty scope
- phase graph / dependency fanout
- snapshot publish
- entity/family/list/value change patch
- result store sync
- trace/metrics

现有 `shared/projection-runtime` 已经提供了一部分完整 runtime，但它偏“运行时实现”，还缺一个更薄、更稳定的 `shared/projector` contract 层。

推荐最终形态：

```txt
shared/projector             projector contract + Projector runtime 主入口
shared/projection-runtime    internal/runtime implementation 或高级 phase runtime
shared/store                 read store / family store / value store
shared/core                  primitive
```

更像 `MutationEngine` / `Reducer` 的 API 应该是：

```ts
const projector = new Projector({
  spec: dataviewActiveProjectorSpec
})
```

或：

```ts
const projector = new Projector({
  spec: whiteboardEditorGraphProjectorSpec
})
```

领域项目只写 spec、phase handlers、publish adapter，不直接拼装一堆 dirty/publish/source helper。

---

## 2. 为什么需要 `shared/projector`

当前存在三个问题。

### 2.1 `shared/projection-runtime` 偏底层且名字偏 runtime

它已经有：

- `createRuntime`
- `RuntimeSpec`
- `RuntimePlanner`
- `PhaseSpec`
- `createPlan`
- `publishEntityFamily`
- `publishList`
- dirty fanout / set / plan

Dataview active 已经直接使用它。

但如果所有项目都直接依赖 `shared/projection-runtime`，会出现两个问题：

1. 领域项目需要理解 runtime internals：phase graph、working、publisher、scope map。
2. 纯 delta/contract/publish helper 与完整 runtime 混在一起，包边界不清。

### 2.2 Whiteboard 已有自己的 projector 形态，但没有统一 contract

Whiteboard editor-graph 已经有：

- graph / spatial / ui / items phases
- planner
- publisher
- publish delta
- projection sources
- snapshot/change/result

它和 Dataview active 非常像，但类型名、delta helper、store sync 方式都是自己的一套。

### 2.3 `shared/core` 仍在承载 projector primitives

当前 projector 相关 primitive 还散在 `shared/core`：

- `changeSet`
- `keySet`
- `entityDelta`
- `store`

例如：

- Dataview delta 使用 `EntityDelta` from `@shared/core`
- Whiteboard planner/publisher 使用 `changeSet` / `keySet` from `@shared/core`
- Whiteboard projection sources 使用 `store` from `@shared/core`

这会让 `shared/core` 持续膨胀。

---

## 3. 不应该复用的部分

## 3.1 Dataview 保留领域侧

Dataview active/projector 的这些部分不应该进入 shared：

- active view 语义
- query/filter/search/sort/group 规则
- membership derive
- summary derive
- calculation index
- field/value/view 的 impact 判断
- table/gallery/kanban/card 的具体 publish 结构
- `CommitImpact` / `BaseImpact` 的领域维度

这些属于 Dataview 读模型。

## 3.2 Whiteboard 保留领域侧

Whiteboard projector 的这些部分不应该进入 shared：

- graph node/edge view build
- spatial index 结构与命中算法
- mindmap tree projection
- node size / edge route / label mask / bounds 计算
- selection/hover/draft/preview/edit 的白板 UI 语义
- canvas items 与 owner 关系

这些属于 Whiteboard 编辑器读模型。

## 3.3 不做统一 ReadModelEngine

不要把 Dataview active 与 Whiteboard editor graph 抽成统一业务 read model。

正确抽象层是：

```txt
phase projector runtime + publish/change/store sync primitives
```

而不是：

```txt
Dataview/Whiteboard 共同 Query Engine
```

---

## 4. 建议包拆分

## 4.1 `shared/projector`

公开、稳定、面向领域项目的 projector API。

职责：

- `Projector`
- `ProjectorSpec`
- `ProjectorContext`
- `ProjectorResult`
- `ProjectorPlan`
- `ProjectorPhaseSpec`
- `ProjectorPublisher`
- delta primitives：`EntityDelta`、`IdDelta`、`Flags`、`Ids`
- publish patch helpers：value/list/family/entity
- store sync contracts，但不强绑 React

## 4.2 `shared/projection-runtime`

可以有两种演进方式：

### 方案 A：保留为 internal runtime

`shared/projector` 内部复用 `shared/projection-runtime`，领域项目只依赖 `@shared/projector`。

### 方案 B：改名/并入 `shared/projector`

长期把 `projection-runtime` 的 public API 收敛进 `shared/projector`，旧包只保留兼容 re-export。

推荐：先走方案 A，降低迁移风险。

## 4.3 `shared/store`

从 `shared/core` 拆出的 reactive store 包：

- value store
- family store
- keyed store
- derived store
- staged/projected store
- batch

Projector 的结果同步层可以依赖 `shared/store`，但 `Projector` 本身不应强制依赖 store。

---

## 5. 主 API：`new Projector({ spec })`

## 5.1 `Projector`

```ts
export class Projector<
  Input,
  Working,
  Snapshot,
  Change,
  PhaseName extends string,
  DomainCtx = ProjectorContext<Input, Working, Snapshot>,
  PhaseMetrics = unknown
> {
  constructor(input: {
    spec: ProjectorSpec<
      Input,
      Working,
      Snapshot,
      Change,
      PhaseName,
      DomainCtx,
      PhaseMetrics
    >
  })

  snapshot(): Snapshot

  update(input: Input): ProjectorResult<Snapshot, Change, PhaseName, PhaseMetrics>

  subscribe(
    listener: (result: ProjectorResult<Snapshot, Change, PhaseName, PhaseMetrics>) => void
  ): () => void
}
```

设计原则：

- `Projector` 是有状态 runtime，维护 current snapshot。
- 每次 `update(input)` 根据 previous snapshot 和 input delta 计算新 snapshot/change。
- 与 `Reducer` 不同，Projector 需要持有 snapshot，因为它是读模型 runtime。
- 不关心 write/history/collab。

## 5.2 `ProjectorSpec`

```ts
export interface ProjectorSpec<
  Input,
  Working,
  Snapshot,
  Change,
  PhaseName extends string,
  DomainCtx = ProjectorContext<Input, Working, Snapshot>,
  PhaseMetrics = unknown
> {
  createWorking(): Working
  createSnapshot(): Snapshot

  plan(input: {
    input: Input
    previous: Snapshot
  }): ProjectorPlan<PhaseName>

  createContext?(input: {
    ctx: ProjectorContext<Input, Working, Snapshot>
  }): DomainCtx

  phases: ProjectorPhaseSpec<DomainCtx, PhaseName, PhaseMetrics>[]

  publish(input: {
    revision: number
    previous: Snapshot
    working: Working
    input: Input
  }): ProjectorPublishResult<Snapshot, Change>

  resetWorking?(working: Working): void
}
```

字段含义：

- `createWorking`：创建可复用 working state。
- `createSnapshot`：创建初始 snapshot。
- `plan`：从 input + previous 推导要跑哪些 phase。
- `createContext`：把 shared ctx 包装成领域 ctx。
- `phases`：阶段声明。
- `publish`：从 working 生成 snapshot/change。
- `resetWorking`：每轮 update 前清理 working 中的 delta/temp。

## 5.3 `ProjectorContext`

```ts
export interface ProjectorContext<Input, Working, Snapshot> {
  readonly input: Input
  readonly previous: Snapshot
  readonly working: Working
  readonly revision: number
}
```

领域项目通常不直接使用基础 ctx，而是通过 `createContext` 包装。

## 5.4 `ProjectorPhaseSpec`

```ts
export interface ProjectorPhaseSpec<
  Ctx,
  PhaseName extends string,
  Metrics = unknown
> {
  name: PhaseName
  deps?: readonly PhaseName[]

  run(input: {
    ctx: Ctx
    scope?: unknown
  }): ProjectorPhaseResult<Metrics>
}
```

```ts
export interface ProjectorPhaseResult<Metrics = unknown> {
  action?: 'reuse' | 'sync' | 'rebuild'
  changed?: boolean
  metrics?: Metrics
}
```

`action` 不是强制语义，只是 trace/metrics 的通用表达。

## 5.5 `ProjectorPlan`

```ts
export interface ProjectorPlan<PhaseName extends string> {
  phases: ReadonlySet<PhaseName>
  scope?: Partial<Record<PhaseName, unknown>>
}
```

可以继续复用现有 `createPlan` 思路，但对外名称收敛到 `ProjectorPlan`。

## 5.6 `ProjectorResult`

```ts
export interface ProjectorResult<
  Snapshot,
  Change,
  PhaseName extends string = string,
  PhaseMetrics = unknown
> {
  snapshot: Snapshot
  change: Change
  trace: ProjectorTrace<PhaseName, PhaseMetrics>
}
```

```ts
export interface ProjectorTrace<PhaseName extends string, Metrics = unknown> {
  phases: readonly {
    name: PhaseName
    action: 'reuse' | 'sync' | 'rebuild'
    durationMs: number
    metrics?: Metrics
  }[]
}
```

---

## 6. Delta / Publish 底层设施

`shared/projector` 应该提供少量通用 change primitives，替代 `shared/core` 的 `changeSet/entityDelta/keySet` 角色。

## 6.1 `IdDelta`

```ts
export interface IdDelta<Id> {
  added: ReadonlySet<Id>
  updated: ReadonlySet<Id>
  removed: ReadonlySet<Id>
}
```

```ts
export const idDelta = {
  create<Id>(): MutableIdDelta<Id>,
  reset<Id>(delta: MutableIdDelta<Id>): void,
  add<Id>(delta: MutableIdDelta<Id>, id: Id): void,
  update<Id>(delta: MutableIdDelta<Id>, id: Id): void,
  remove<Id>(delta: MutableIdDelta<Id>, id: Id): void,
  touched<Id>(delta: IdDelta<Id>): ReadonlySet<Id>,
  clone<Id>(delta: IdDelta<Id>): MutableIdDelta<Id>,
  assign<Id>(target: MutableIdDelta<Id>, source: IdDelta<Id>): void,
  hasAny<Id>(delta: IdDelta<Id>): boolean
}
```

迁移来源：

- `shared/core/changeSet`

命名建议：

- `changeSet` 在 projector 语境中改名为 `idDelta`，更准确。

## 6.2 `KeySet`

```ts
export type KeySet<Key> = ReadonlySet<Key> | 'all'

export const keySet = {
  empty<Key>(): KeySet<Key>,
  all<Key>(): KeySet<Key>,
  add<Key>(set: KeySet<Key>, key: Key): KeySet<Key>,
  addMany<Key>(set: KeySet<Key>, keys: Iterable<Key>): KeySet<Key>,
  has<Key>(set: KeySet<Key>, key: Key): boolean,
  hasAny<Key>(set: KeySet<Key>): boolean,
  merge<Key>(left: KeySet<Key>, right: KeySet<Key>): KeySet<Key>
}
```

迁移来源：

- `shared/core/keySet`

用途：

- projector dirty scope
- partial rebuild scope
- touched entity scope

## 6.3 `EntityDelta`

```ts
export interface EntityDelta<Id> {
  rebuild?: true
  added?: readonly Id[]
  updated?: readonly Id[]
  removed?: readonly Id[]
}
```

或直接统一成 `IdDelta`。

建议：

- 内部 runtime 使用 `IdDelta<Id>`。
- 对外 API 如需 JSON-friendly delta，可用 `EntityDelta<Id>`。
- 提供转换：

```ts
export const entityDelta = {
  fromIdDelta<Id>(delta: IdDelta<Id>): EntityDelta<Id>,
  toIdDelta<Id>(delta: EntityDelta<Id>): MutableIdDelta<Id>
}
```

## 6.4 Publish helpers

保留现有 `shared/projection-runtime/publish/*` 的能力，但从 `shared/projector` 导出更稳定名称：

```ts
export const publish = {
  value,
  list,
  family,
  entityFamily,
  entityList
}
```

它们只做结构共享与 change 生成，不知道领域语义。

---

## 7. Store sync 底层设施

Whiteboard `projection/sources.ts` 和 Dataview runtime source 都在做同一类事情：

```txt
ProjectorResult(snapshot, change)
  -> sync value store
  -> sync family store by id delta
  -> sync list store
```

建议 `shared/projector` 提供可选 sync helper，但不要强制 Projector 依赖 store。

```ts
export interface ProjectorSourceSpec<Snapshot, Change> {
  sync(input: {
    previous: Snapshot
    next: Snapshot
    change: Change
  }): void
}

export const projectorSources = {
  createValue,
  createFamily,
  createList,
  syncFamilyByIdDelta
}
```

如果 `shared/store` 拆出，helper 可以放：

```txt
shared/projector-store
```

或者：

```txt
shared/projector/src/storeSync.ts
```

建议第一阶段先不新增额外包，等 `shared/store` 拆出后再整理。

---

## 8. Dataview active/projector 迁移方案

## 8.1 当前形态

Dataview active 已经非常接近 shared projector runtime：

- `active/runtime/runtime.ts` 使用 `createRuntime`
- phase：`query` / `membership` / `summary` / `publish`
- planner：`active/runtime/planner.ts`
- working：`active/runtime/working.ts`
- publisher：active publish runtime
- input：`ActiveRuntimeInput`
- result：`ActiveRuntimeResult`

它的问题不是没有 runtime，而是：

- 直接依赖 `@shared/projection-runtime` 的底层类型。
- active/projector 与 Dataview 领域 impact/query 仍耦合较深。
- `EntityDelta` 仍从 `@shared/core` 来。
- active runtime 是一个局部 projector，但没有统一命名成 `ProjectorSpec`。

## 8.2 目标形态

```ts
export const dataviewActiveProjector = new Projector<
  ActiveProjectorInput,
  ActiveProjectorWorking,
  ViewState | undefined,
  ActiveDelta | undefined,
  ActivePhaseName,
  DataviewActiveProjectorCtx,
  ActivePhaseMetrics
>({
  spec: dataviewActiveProjectorSpec
})
```

Phase 仍然是 Dataview 自己的：

- `query`
- `membership`
- `summary`
- `publish`

但 runtime orchestration 来自 `shared/projector`。

## 8.3 `DataviewActiveProjectorCtx`

```ts
export interface DataviewActiveProjectorCtx {
  readonly input: ActiveProjectorInput
  readonly previous: ViewState | undefined
  readonly working: ActiveProjectorWorking

  read: {
    reader: DocumentReader
    fieldsById: ReadonlyMap<FieldId, Field>
    activeView(): View | undefined
    activeViewId(): ViewId | undefined
  }

  impact: BaseImpact
  index: {
    state: IndexState
    delta?: IndexDelta
  }

  view: {
    plan?: ViewPlan
    previousPlan?: ViewPlan
  }
}
```

这样 phase handler 不直接依赖 shared runtime ctx。

## 8.4 迁移步骤

### 步骤 A：类型重命名，不改逻辑

把 active runtime 术语从 `Runtime` 改成 `Projector`：

- `ActiveRuntimeInput` -> `ActiveProjectorInput`
- `ActiveRuntimeWorking` -> `ActiveProjectorWorking`
- `ActiveRuntimeResult` -> `ActiveProjectorResult`
- `createActiveRuntimePlanner` -> `createActiveProjectorPlanner`

短期可保留 alias。

### 步骤 B：从 `createRuntime` 切到 `new Projector`

将：

```ts
createRuntime({
  createWorking,
  createSnapshot,
  planner,
  publisher,
  phases
})
```

替换为：

```ts
new Projector({
  spec: dataviewActiveProjectorSpec
})
```

内部仍可由 `Projector` 复用 `projection-runtime`。

### 步骤 C：Delta primitive 改到 `@shared/projector`

把：

```ts
import type { EntityDelta } from '@shared/core'
```

改为：

```ts
import type { EntityDelta } from '@shared/projector'
```

如果采用 `IdDelta`，则逐步把 active/doc delta 统一到：

```ts
IdDelta<RecordId>
IdDelta<FieldId>
IdDelta<ViewId>
IdDelta<ItemId>
IdDelta<SectionId>
```

### 步骤 D：active 只消费 write impact

Dataview active projector 输入应来自 `MutationEngine.writes` 之后的 doc snapshot + impact：

```txt
MutationEngine Write.extra = CommitImpact
  -> BaseImpact
  -> DataviewActiveProjector.update(input)
```

active projector 不参与 reducer apply。

### 步骤 E：publish helpers 标准化

Dataview active publish 中可复用 `shared/projector.publish.*`：

- family publish
- list publish
- value publish
- entity delta publish

保留 table/gallery/kanban 的领域结构构造。

## 8.5 Dataview 收益

- active 成为明确的 Projector，不再只是 engine runtime 的内部阶段。
- shared 层只提供 phase orchestration 和 publish primitives。
- `@shared/core` 不再承载 `EntityDelta`。
- active 与 mutation apply 的耦合进一步降低。

---

## 9. Whiteboard projector 迁移方案

## 9.1 当前形态

Whiteboard projector 主要在 `whiteboard-editor-graph`：

- `runtime/planner.ts`
- `runtime/publisher.ts`
- `runtime/publish/delta.ts`
- `runtime/projection.ts`
- `runtime/spatial/*`
- `runtime/items.ts`
- `runtime/ui.ts`
- `contracts/delta.ts`
- `contracts/editor.ts`
- `contracts/working.ts`

它已经有 phase 化结构：

- `graph`
- `spatial`
- `ui`
- `items`

planner 使用：

- document delta
- UI delta
- keySet/changeSet touched scope

publisher 产出：

- graph snapshot/change
- items snapshot/change
- ui snapshot/change

projection sources 负责把 result 同步到 store family。

## 9.2 目标形态

```ts
export const whiteboardEditorGraphProjector = new Projector<
  EditorGraphInput,
  EditorGraphWorking,
  EditorGraphSnapshot,
  EditorGraphChange,
  EditorGraphPhaseName,
  WhiteboardEditorGraphProjectorCtx,
  EditorGraphPhaseMetrics
>({
  spec: whiteboardEditorGraphProjectorSpec
})
```

Whiteboard phases 保留领域侧：

- `graph`
- `spatial`
- `ui`
- `items`

`shared/projector` 只接管 runtime orchestration。

## 9.3 `WhiteboardEditorGraphProjectorCtx`

```ts
export interface WhiteboardEditorGraphProjectorCtx {
  readonly input: EditorGraphInput
  readonly previous: EditorGraphSnapshot
  readonly working: EditorGraphWorking

  document: {
    snapshot: EngineSnapshot
    previous: EngineSnapshot | null
    delta: EngineDelta
  }

  session: SessionInput
  measure: MeasureInput
  interaction: InteractionInput
  clock: ClockInput

  graph: {
    patch(scope: GraphPatchScope): void
    readNode(id: NodeId): GraphNodeEntry | undefined
    readEdge(id: EdgeId): GraphEdgeEntry | undefined
  }

  spatial: {
    rebuild(): void
    patch(scope: SpatialPatchScope): void
  }

  ui: {
    sync(): void
  }
}
```

handler 不需要知道 shared phase runtime。

## 9.4 迁移步骤

### 步骤 A：把 `changeSet/keySet` 迁到 `@shared/projector`

当前：

```ts
import { changeSet, keySet } from '@shared/core'
```

目标：

```ts
import { idDelta, keySet } from '@shared/projector'
```

类型：

```ts
export type IdDelta<TId extends string> = ProjectorIdDelta<TId>
```

### 步骤 B：把 editor graph runtime spec 包成 `ProjectorSpec`

现有：

```ts
createRuntime({
  createWorking,
  createSnapshot,
  planner,
  publisher,
  phases
})
```

目标：

```ts
new Projector({
  spec: whiteboardEditorGraphProjectorSpec
})
```

### 步骤 C：保留领域 projector 函数

这些继续留在 Whiteboard：

- `readProjectedNodeRect`
- `buildProjectedNodeView`
- `readProjectedEdge`
- `buildNodeUiView`
- `buildEdgeUiView`
- spatial query/update
- graph patch / mindmap owner patch

不要抽到 shared。

### 步骤 D：projection sources 标准化

当前 `whiteboard-editor/src/projection/sources.ts` 自己实现了 family sync。

可以逐步改为 shared helper：

```ts
projectorSources.syncFamilyByIdDelta({
  target: nodeGraphFamily,
  previous: previous.graph.nodes,
  next: next.graph.nodes,
  delta: change.graph.nodes
})
```

但这一步依赖 `shared/store` 拆包，建议后置。

### 步骤 E：document delta 与 editor delta 分层

Whiteboard 当前 input delta 包含：

- document delta
- session/ui delta
- measure delta
- interaction delta

目标是让 `ProjectorSpec.plan` 只依赖 delta，不主动读取外部 mutable state。

即：

```txt
Engine publish delta -> document delta
Session store changes -> session delta
Measure observer -> measure delta
Interaction store -> interaction delta
```

全部作为 Projector input。

## 9.5 Whiteboard 收益

- editor graph projector 与 Dataview active projector 使用同一 runtime contract。
- `changeSet/keySet` 从 `shared/core` 移出。
- projection sources 的 family sync 可复用。
- Whiteboard projector 保留领域复杂度，但 orchestration 更薄。

---

## 10. `shared/projector` 与 `shared/projection-runtime` 的关系

推荐短期实现：

```txt
@shared/projector
  exports Projector / ProjectorSpec / delta / publish helpers
  internally imports @shared/projection-runtime

@shared/projection-runtime
  keeps current implementation
  becomes lower-level runtime package
```

长期可以：

```txt
@shared/projection-runtime -> deprecated facade
@shared/projector -> canonical package
```

原因：

- `projector` 是面向产品领域的概念。
- `projection-runtime` 是实现细节，名字更底层。
- Dataview/Whiteboard 应该依赖 canonical API，不依赖 runtime internals。

---

## 11. 与 MutationEngine / Reducer 的整体关系

最终三条主轴：

```txt
MutationEngine
  Intent -> Operation[] -> ApplyResult -> Write

Reducer
  Operation[] -> next Doc + inverse + footprint + extra

Projector
  Write/Delta/Input -> Snapshot + Change
```

Dataview：

```txt
MutationEngine.write.extra = CommitImpact
  -> document projector publishes doc delta
  -> active projector updates ViewState
  -> sources sync UI stores
```

Whiteboard：

```txt
MutationEngine.publish = EnginePublish(snapshot + delta)
  -> editor graph projector input.document.delta
  -> graph/spatial/ui/items snapshot + change
  -> sources sync UI stores
```

注意：

- Reducer 不调用 Projector。
- Projector 不调用 Reducer。
- MutationEngine 只发布 write/current。
- 外层 engine 负责把 write/current 喂给 projector。

这样耦合最低。

---

## 12. 建议文件结构

```txt
shared/projector/
  package.json
  src/
    index.ts
    Projector.ts
    contracts.ts
    delta/
      idDelta.ts
      keySet.ts
      entityDelta.ts
      flags.ts
    publish/
      value.ts
      list.ts
      family.ts
      entity.ts
    sources/
      contracts.ts
      familySync.ts
```

如果短期复用 `projection-runtime`：

```txt
shared/projector/src/Projector.ts
  -> wraps shared/projection-runtime/createRuntime
```

---

## 13. 迁移顺序

## 阶段 1：建立 `shared/projector`

- 新建 `Projector` wrapper。
- 从 `shared/projection-runtime` re-export 或包装核心类型。
- 移入/包装 `IdDelta`、`KeySet`、`EntityDelta`。
- 移入/包装 publish helpers。

## 阶段 2：迁移 delta primitives

- Dataview `contracts/delta.ts` 改用 `@shared/projector` 的 `EntityDelta` / `IdDelta`。
- Whiteboard `contracts/delta.ts` 改用 `@shared/projector` 的 `IdDelta` / `KeySet`。
- Whiteboard `runtime/publish/delta.ts` 改用 `idDelta`。

## 阶段 3：Dataview active 切到 `Projector`

- 新建 `dataviewActiveProjectorSpec`。
- 保留现有 phase 实现。
- `createRuntime` 改为 `new Projector({ spec })`。
- active runtime 命名逐步改为 active projector。

## 阶段 4：Whiteboard editor-graph 切到 `Projector`

- 新建 `whiteboardEditorGraphProjectorSpec`。
- 保留现有 graph/spatial/ui/items phase。
- `createRuntime` 改为 `new Projector({ spec })`。
- planner/publisher 接口对齐 `ProjectorSpec`。

## 阶段 5：projection sources 标准化

- 拆出 `shared/store` 后，提供 family/value/list sync helper。
- Whiteboard `projection/sources.ts` 使用 shared sync helper。
- Dataview runtime source 也逐步复用。

## 阶段 6：收紧 `shared/core`

- 删除或 deprecated `changeSet/keySet/entityDelta/store` 的 projector 语义导出。
- `shared/core` 只保留 primitive。

---

## 14. 验收标准

## API 验收

- 领域项目创建 projector 只需要 `new Projector({ spec })`。
- `@shared/projector` 是领域项目依赖的主包。
- `@shared/projection-runtime` 不再被 Dataview/Whiteboard 直接大量使用，或只作为兼容层。
- `IdDelta/KeySet/EntityDelta` 不再从 `@shared/core` 导出给领域项目使用。

## Dataview 验收

- active runtime 命名和结构收敛为 active projector。
- query/membership/summary/publish phases 保持领域侧。
- active projector 只消费 input/impact/index delta，不参与 mutation apply。
- active delta 使用 `@shared/projector` primitives。

## Whiteboard 验收

- editor graph runtime 收敛为 editor graph projector。
- graph/spatial/ui/items phases 保持领域侧。
- planner 使用 `@shared/projector` 的 `IdDelta/KeySet`。
- projection sources 可逐步复用 shared family sync。

---

## 15. 最终判断

Dataview active/projector 和 Whiteboard editor-graph projector 可以复用同一个底层设施，但复用边界必须放在 projector runtime 与 publish/change/store sync primitives，而不是领域 read model。

推荐最终形态：

```ts
new Projector({ spec })
```

并形成三层：

```txt
shared/projector
  Projector + contracts + delta + publish helpers

领域 projector spec
  Dataview active phases / Whiteboard graph phases

领域 read API / UI sources
  Dataview active API / Whiteboard projection sources
```

这样能同时满足：

- 降低 shared/core 复杂度。
- 降低 Dataview active 与 mutation apply 的耦合。
- 降低 Whiteboard editor graph runtime 对 scattered helper 的依赖。
- 保留两个项目真正不同的领域 projection 逻辑。

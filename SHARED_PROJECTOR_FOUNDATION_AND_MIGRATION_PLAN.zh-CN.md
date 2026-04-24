# Shared Projector 基础设施最终方案（不兼容版）

本文给出 `projector` 底层设施的最终方案。

前提明确：

- 不保留兼容层
- 不保留双轨
- 不做 `shared/projector` 套 `shared/projection-runtime` 的过渡结构
- 最终目标是让 `dataview` 与 `whiteboard` 都收敛到同一套 projector contract

---

## 1. 结论

这件事值得做。

但正确做法不是：

```txt
shared/projector
  -> 包一层新 API
shared/projection-runtime
  -> 继续保留为底层实现
```

而是：

```txt
shared/projector
  -> 直接成为唯一 projector 内核
shared/projection-runtime
  -> 删除
```

也就是说，这不是“新增一个更漂亮的 facade”，而是**直接把现有 `projection-runtime` 收口成最终 canonical package**。

---

## 2. 为什么值得做

当前代码已经证明 `projector` 是一类独立底层模型，不是 Dataview 或 Whiteboard 的局部技巧。

它们都在做同一件事：

```txt
input + previous snapshot
  -> plan dirty phases
  -> run phases
  -> publish snapshot + change
  -> sync read side / ui side
```

### 2.1 现有 `projection-runtime` 已经是 projector 内核

现有共享层已经有完整核心能力：

- `createRuntime`
- `RuntimeSpec`
- `RuntimeInstance`
- `plan`
- `phase deps`
- `publish`
- `trace`
- `publishEntityFamily / publishList / publishValue`
- source sync helpers

这说明问题不是“缺一个 projector 模型”，而是**名字、边界和包归属还没收口**。

### 2.2 Whiteboard 现在直接依赖 runtime internals，结构不干净

`whiteboard-editor-graph` 当前并不是只吃 public contract。

它直接拼装：

- `createPhaseGraph`
- `createRuntimeState`
- `runRuntimeUpdate`
- `publishRuntimeResult`

这说明 whiteboard 还在“手搓 runtime orchestration”，没有真正站在统一 contract 上。

### 2.3 Dataview active 已经很接近最终形态

`dataview` active 侧已经基本按 spec 化写法运行：

- 有清晰 phase：`query / membership / summary / publish`
- 有 planner
- 有 publish
- 有 `createRuntime(createActiveRuntimeSpec())`

所以 Dataview 这边的主要工作是**命名与包收口**，不是重做模型。

### 2.4 projector primitive 不该继续挂在 `shared/core`

当前这些东西本质上都是 projector 语义：

- `changeSet`
- `keySet`
- `entityDelta`

继续放在 `shared/core`，会让 `core` 变成“什么都放一点”的桶。

---

## 3. 不应该做的事

下面这些都不做。

### 3.1 不做双层包

不做：

```txt
@shared/projector
  -> facade
@shared/projection-runtime
  -> real runtime
```

原因很直接：

- 这只是过渡层
- 会制造新旧术语双轨
- 和“不兼容、直接收口”的目标冲突

### 3.2 不做兼容 re-export

不保留：

- `@shared/projection-runtime -> @shared/projector` re-export
- `RuntimeSpec = ProjectorSpec` alias
- `createRuntime = createProjector` alias

一次性迁完，直接删旧名字。

### 3.3 不做统一业务读模型

不抽象：

- Dataview active 业务语义
- Whiteboard graph/spatial/ui/items 业务语义

shared 只抽：

- phase orchestration
- dirty scope / scope merge
- publish helper
- common delta primitive
- source sync helper

### 3.4 现在不做 `shared/store` 大拆分

这一步不是当前主矛盾。

当前最值得做的是：

- projector runtime 包收口
- primitive 迁出 `shared/core`
- whiteboard 停止依赖 runtime internals

`shared/store` 如果以后要拆，单独做，不和这次混在一起。

---

## 4. 最终包边界

最终只保留一个 projector 包：

```txt
shared/projector
  src/
    contracts/
    delta/
    publish/
    source/
    projector/
    testing/
```

最终删除：

```txt
shared/projection-runtime
```

同时从 `shared/core` 迁出：

- `changeSet`
- `keySet`
- `entityDelta`

---

## 5. 最终 API 设计

目标是简单、直接、可复用。

不采用额外复杂 class 层，直接保留函数式主入口。

### 5.1 主入口

```ts
export interface Projector<
  Input,
  Working,
  Snapshot,
  Change,
  PhaseName extends string = string,
  PhaseMetrics = unknown
> {
  snapshot(): Snapshot
  working(): Working

  update(
    input: Input
  ): ProjectorResult<Snapshot, Change, PhaseName, PhaseMetrics>

  subscribe(
    listener: (
      result: ProjectorResult<Snapshot, Change, PhaseName, PhaseMetrics>
    ) => void
  ): () => void
}

export const createProjector = <
  Input,
  Working,
  Snapshot,
  Change,
  PhaseName extends string,
  ScopeMap extends ProjectorScopeMap<PhaseName> = DefaultProjectorScopeMap<PhaseName>,
  PhaseChange = unknown,
  PhaseMetrics = unknown
>(
  spec: ProjectorSpec<
    Input,
    Working,
    Snapshot,
    Change,
    PhaseName,
    ScopeMap,
    PhaseChange,
    PhaseMetrics
  >
): Projector<Input, Working, Snapshot, Change, PhaseName, PhaseMetrics>
```

选择 `createProjector(spec)` 而不是 `new Projector(...)` 的原因：

- 更接近现有 `createRuntime(spec)`，迁移最短
- 不引入额外 OO 外壳
- 更容易保持 API 简洁

### 5.2 `ProjectorSpec`

```ts
export interface ProjectorSpec<
  Input,
  Working,
  Snapshot,
  Change,
  PhaseName extends string,
  ScopeMap extends ProjectorScopeMap<PhaseName> = DefaultProjectorScopeMap<PhaseName>,
  PhaseChange = unknown,
  PhaseMetrics = unknown
> {
  createWorking(): Working
  createSnapshot(): Snapshot

  plan(input: {
    input: Input
    previous: Snapshot
  }): ProjectorPlan<PhaseName, ScopeMap>

  publish(input: {
    revision: number
    previous: Snapshot
    working: Working
  }): ProjectorPublishResult<Snapshot, Change>

  phases: readonly ProjectorPhase<
    Input,
    Working,
    Snapshot,
    PhaseName,
    ScopeMap,
    PhaseChange,
    PhaseMetrics
  >[]
}
```

这里直接把现有 `planner` / `publisher` 内联进 spec，并保留 `createWorking()` + `working()` 这一对原语。

原因：

- 最终 API 更短
- 领域项目不需要再理解“planner object / publisher object”两层概念
- whiteboard query / spatial 这类读链可以直接读取稳定 working state

### 5.3 `ProjectorPhase`

```ts
export interface ProjectorContext<
  Input,
  Working,
  Snapshot,
  Scope = undefined
> {
  input: Input
  previous: Snapshot
  working: Working
  scope: Scope
}

export interface ProjectorPhase<
  Input,
  Working,
  Snapshot,
  PhaseName extends string,
  ScopeMap extends ProjectorScopeMap<PhaseName>,
  PhaseChange = unknown,
  PhaseMetrics = unknown
> {
  name: PhaseName
  deps: readonly PhaseName[]

  mergeScope?: (
    current: ScopeMap[PhaseName] | undefined,
    next: ScopeMap[PhaseName]
  ) => ScopeMap[PhaseName]

  run(
    context: ProjectorContext<Input, Working, Snapshot, ScopeMap[PhaseName]>
  ): ProjectorPhaseResult<PhaseChange, PhaseMetrics, PhaseName, ScopeMap>
}
```

### 5.4 `ProjectorPlan`

```ts
export interface ProjectorPlan<
  PhaseName extends string,
  ScopeMap extends ProjectorScopeMap<PhaseName> = DefaultProjectorScopeMap<PhaseName>
> {
  phases: ReadonlySet<PhaseName>
  scope?: Partial<{
    [K in PhaseName]: ScopeMap[K]
  }>
}
```

### 5.5 `ProjectorPhaseResult`

```ts
export interface ProjectorPhaseResult<
  PhaseName extends string,
  ScopeMap extends ProjectorScopeMap<PhaseName>,
  PhaseChange = unknown,
  PhaseMetrics = unknown
> {
  action: 'reuse' | 'sync' | 'rebuild'
  emit?: Partial<{
    [K in PhaseName]: ScopeMap[K]
  }>
  change?: PhaseChange
  metrics?: PhaseMetrics
}
```

### 5.6 `ProjectorResult`

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
export interface ProjectorTrace<
  PhaseName extends string,
  PhaseMetrics = unknown
> {
  revision: number
  totalMs: number
  phases: readonly {
    name: PhaseName
    action: 'reuse' | 'sync' | 'rebuild'
    changed: boolean
    durationMs: number
    metrics?: PhaseMetrics
  }[]
}
```

---

## 6. 共通 primitive 最终设计

### 6.1 `IdDelta`

它就是现在 `changeSet` 的最终名字。

```ts
export interface IdDelta<Id> {
  added: Set<Id>
  updated: Set<Id>
  removed: Set<Id>
}

export const idDelta = {
  create<Id>(): IdDelta<Id>,
  reset<Id>(delta: IdDelta<Id>): void,
  add<Id>(delta: IdDelta<Id>, id: Id): void,
  update<Id>(delta: IdDelta<Id>, id: Id): void,
  remove<Id>(delta: IdDelta<Id>, id: Id): void,
  touched<Id>(delta: IdDelta<Id>): ReadonlySet<Id>,
  clone<Id>(delta: IdDelta<Id>): IdDelta<Id>,
  assign<Id>(target: IdDelta<Id>, source: IdDelta<Id>): IdDelta<Id>,
  hasAny<Id>(delta: IdDelta<Id>): boolean
}
```

改名原因：

- `changeSet` 太泛
- 在 projector 语境里，本质上就是 id 级增量

### 6.2 `KeySet`

保留现有语义，但迁到 `shared/projector`。

```ts
export type KeySet<Key> =
  | { kind: 'none' }
  | { kind: 'all' }
  | { kind: 'some'; keys: ReadonlySet<Key> }
```

```ts
export const keySet = {
  none<Key>(): KeySet<Key>,
  all<Key>(): KeySet<Key>,
  some<Key>(keys: Iterable<Key>): KeySet<Key>,
  clone<Key>(set: KeySet<Key>): KeySet<Key>,
  isEmpty<Key>(set: KeySet<Key>): boolean,
  has<Key>(set: KeySet<Key>, key: Key): boolean,
  add<Key>(set: KeySet<Key>, key: Key): KeySet<Key>,
  addMany<Key>(set: KeySet<Key>, keys: Iterable<Key>): KeySet<Key>,
  union<Key>(...sets: readonly KeySet<Key>[]): KeySet<Key>,
  subtract<Key>(set: KeySet<Key>, keys: Iterable<Key>, allKeys?: readonly Key[]): KeySet<Key>,
  intersects<Key>(left: KeySet<Key>, right: KeySet<Key>): boolean,
  materialize<Key>(set: KeySet<Key>, allKeys: readonly Key[]): readonly Key[]
}
```

### 6.3 `EntityDelta`

对外发布的 JSON-friendly 结构继续保留。

```ts
export interface EntityDelta<Id> {
  order?: true
  set?: readonly Id[]
  remove?: readonly Id[]
}
```

```ts
export const entityDelta = {
  normalize<Id>(delta: EntityDelta<Id>): EntityDelta<Id> | undefined,
  merge<Id>(...deltas: readonly (EntityDelta<Id> | undefined)[]): EntityDelta<Id> | undefined,
  fromIdDelta<Id>(input: {
    changes: IdDelta<Id>
    includeAdded?: boolean
    includeUpdated?: boolean
    includeRemoved?: boolean
    order?: boolean
  }): EntityDelta<Id> | undefined,
  fromSnapshots<Id, Value>(input: {
    previousIds: readonly Id[]
    nextIds: readonly Id[]
    previousGet: (id: Id) => Value | undefined
    nextGet: (id: Id) => Value | undefined
    equal?: (left: Value, right: Value) => boolean
  }): EntityDelta<Id> | undefined
}
```

最终关系是：

- 内部 working / phase patch 用 `IdDelta`
- 对外 publish change 用 `EntityDelta`

---

## 7. publish / source helper 最终归属

下面这些保留，而且迁到 `shared/projector`：

- `publishValue`
- `publishList`
- `publishFamily`
- `publishEntityFamily`
- `publishEntityList`

source sync helper 也归到同包：

- `composeSync`
- `createEntityDeltaSync`
- `createFamilySync`
- `createListSync`
- `createValueSync`

原因：

- 它们都直接服务 projector publish / source sync
- 没必要再拆第二个小包

---

## 8. Dataview 最终迁移方案

Dataview 这边**值得迁，但收益主要是收口命名和 shared 边界**。

### 8.1 Dataview 最终形态

Dataview active 最终固定为：

```txt
createProjector(dataviewActiveProjectorSpec)
```

phase 仍然保留：

- `query`
- `membership`
- `summary`
- `publish`

Dataview 不需要改业务模型，只改：

- import 来源
- runtime 术语
- primitive 归属

### 8.2 Dataview 需要改的地方

#### A. active runtime 术语改为 projector

例如：

- `ActiveRuntimeInput` -> `ActiveProjectorInput`
- `ActiveRuntimeWorking` -> `ActiveProjectorWorking`
- `ActiveRuntimeResult` -> `ActiveProjectorResult`
- `createActiveRuntime` -> `createActiveProjector`
- `createActiveRuntimePlanner` -> `createActiveProjectorPlan`

这一步不保留 alias。

#### B. import 全部切到 `@shared/projector`

把：

```ts
import {
  createRuntime,
  type RuntimeSpec,
  type RuntimePublisher,
  type PhaseSpec
} from '@shared/projection-runtime'
```

改成：

```ts
import {
  createProjector,
  type ProjectorSpec,
  type ProjectorPhase
} from '@shared/projector'
```

#### C. `EntityDelta` 改归属

把：

```ts
import type { EntityDelta } from '@shared/core'
```

改成：

```ts
import type { EntityDelta } from '@shared/projector'
```

#### D. active projector 不碰 mutation apply 主轴

Dataview 的 projector 输入仍然来自：

```txt
MutationEngine publish.reduce
  -> doc / plan / index / trace
  -> active projector update
```

Projector 不进入 reducer，不进入 mutation apply。

### 8.3 Dataview 迁移完成标准

- 不再 import `@shared/projection-runtime`
- 不再从 `@shared/core` import `EntityDelta`
- active runtime 术语全部变成 projector
- active 仍保留原四个 phase，不改业务逻辑

---

## 9. Whiteboard 最终迁移方案

Whiteboard 这边**更值得做**，因为它现在还有一层手工 runtime 组装和 internal import。

### 9.1 Whiteboard 最终形态

`whiteboard-editor-graph` 最终固定为：

```txt
createProjector(whiteboardEditorGraphProjectorSpec)
```

phase 保留：

- `graph`
- `spatial`
- `ui`
- `items`

### 9.2 Whiteboard 需要改的地方

#### A. 删除 runtime internals 直连

下面这种写法必须消失：

```ts
import { publishRuntimeResult } from '@shared/projection-runtime/runtime/publish'
import { createRuntimeState } from '@shared/projection-runtime/runtime/state'
import { runRuntimeUpdate } from '@shared/projection-runtime/runtime/update'
```

whiteboard 不应该再知道这些内部模块。

#### B. editor graph runtime 改成只吃 public projector contract

把现有手工编排：

- `createPhaseGraph`
- `createRuntimeState`
- `runRuntimeUpdate`
- `publishRuntimeResult`

全部删掉，直接变成：

```ts
const projector = createProjector(whiteboardEditorGraphProjectorSpec)
```

#### C. `changeSet` 全部改成 `idDelta`

把：

```ts
import { changeSet } from '@shared/core'
```

改成：

```ts
import { idDelta } from '@shared/projector'
```

#### D. `keySet` 迁到 projector

把：

```ts
import { keySet } from '@shared/core'
```

改成：

```ts
import { keySet } from '@shared/projector'
```

#### E. publish helper 仍走 shared projector

下面这些继续保留，但 import 改到 `@shared/projector`：

- `publishEntityFamily`
- `publishList`
- `publishValue`

### 9.3 Whiteboard 迁移完成标准

- 不再 import runtime internal 文件
- 不再 import `@shared/projection-runtime`
- 不再 import `changeSet` / `keySet` from `@shared/core`
- editor graph runtime 只剩 `createProjector(spec)` 一个主入口

---

## 10. 最终目录结构

### 10.1 shared

```txt
shared/projector/src/
  contracts/
    core.ts
    plan.ts
    phase.ts
    projector.ts
    source.ts
    trace.ts
  delta/
    idDelta.ts
    keySet.ts
    entityDelta.ts
  publish/
    value.ts
    list.ts
    family.ts
    entity.ts
  source/
    compose.ts
    entity.ts
    event.ts
    family.ts
    list.ts
    value.ts
  projector/
    createProjector.ts
    publish.ts
    state.ts
    update.ts
  testing/
    assert.ts
    fakeSink.ts
    harness.ts
  index.ts
```

### 10.2 删除项

必须删除：

```txt
shared/projection-runtime
```

同时从 `shared/core` 删除导出：

- `changeSet`
- `keySet`
- `entityDelta`

---

## 11. 实施顺序

### Phase 1：shared projector 收口

目标：

- 用 `shared/projector` 替换 `shared/projection-runtime`
- 把 `changeSet/keySet/entityDelta` 迁入 projector

实施项：

- 新建 `shared/projector`
- 迁移 runtime / publish / source / testing
- `changeSet -> idDelta`
- `keySet` 迁移
- `entityDelta` 迁移
- 删除 `shared/projection-runtime`
- 删除 `shared/core` 里对应导出

完成状态：

- 已完成
- `shared/projector` 已成为唯一 canonical projector package
- `shared/projection-runtime` 已删除
- `shared/core` 中的 `changeSet/keySet/entityDelta` 旧实现与导出已删除

### Phase 2：Whiteboard 切换

目标：

- whiteboard-editor-graph 只吃 projector public API

实施项：

- 删除对 runtime internals 的 import
- `createEditorGraphRuntime` 改成 `createProjector(...)`
- `changeSet/keySet` import 改到 `@shared/projector`
- publish helper import 改到 `@shared/projector`

完成状态：

- 已完成
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/createEditorGraphRuntime.ts` 已切到 `createProjector(createEditorGraphProjectorSpec())`
- editor-graph 不再依赖 projector runtime internals
- whiteboard core / engine / editor-graph 侧的 delta primitive 已统一切到 `@shared/projector`

### Phase 3：Dataview 切换

目标：

- dataview active runtime 全面改名为 projector

实施项：

- `Runtime*` 术语替换为 `Projector*`
- import 改到 `@shared/projector`
- `EntityDelta` import 改归属

完成状态：

- 已完成
- `dataview/packages/dataview-engine/src/active/projector/` 已替代旧 `active/runtime/`
- dataview active 主入口已切到 `createProjector(...)`
- dataview active 相关 delta primitive 已统一切到 `@shared/projector`

### Phase 4：最终清理

目标：

- 删除所有旧术语与旧路径

实施项：

- 删空 `projection-runtime`
- 全仓 `rg` 清理 `RuntimeSpec|createRuntime|changeSet|@shared/projection-runtime`
- 更新测试

完成状态：

- 已完成
- 旧包、旧 primitive、旧 runtime 路径均已删除
- 全仓已无 `@shared/projection-runtime` 与 projector 相关 `changeSet` 残留引用
- shared / dataview / whiteboard 的 typecheck 与 test 已通过

---

## 12. 验收标准

全部完成后，仓库必须满足：

- 不存在 `@shared/projection-runtime` import
- 不存在 projector 相关 runtime internal import
- 不存在 projector 相关 `changeSet/keySet/entityDelta` from `@shared/core`
- Dataview active 与 Whiteboard editor graph 都走同一套 `createProjector(spec)`
- `shared/projector` 成为唯一 projector canonical package

只要上面任意一项没满足，这件事就还没完成。

---

## 13. 落地确认

对照上面的验收标准，当前仓库状态如下：

- 已无 `@shared/projection-runtime` import
- 已无 projector 相关 runtime internal import
- 已无 projector 相关 `changeSet/keySet/entityDelta` from `@shared/core`
- Dataview active 与 Whiteboard editor graph 都已走 `createProjector(spec)`
- `shared/projector` 已成为唯一 projector canonical package

验证命令：

- `pnpm --filter @shared/projector run typecheck`
- `pnpm --filter @shared/projector run test`
- `pnpm -C dataview run typecheck`
- `pnpm -C dataview run test`
- `pnpm -C whiteboard run typecheck`
- `pnpm -C whiteboard run test`

上述命令当前均已通过。

---

## 14. 一句话结论

这件事值得做，而且应该做得更激进：

**不是新增 `shared/projector` 去包装 `shared/projection-runtime`，而是直接让 `shared/projector` 成为唯一 projector 内核，whiteboard 和 dataview 一次性全部切过去，旧包和旧术语直接删除。**

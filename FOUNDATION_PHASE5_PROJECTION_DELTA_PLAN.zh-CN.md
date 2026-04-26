# Phase 5：Projection / Delta 大一统设计方案

## 1. 目标

Phase 5 只做一件事：

- 把当前散落在 `shared/projector`、mutation `publish`、domain 本地 projector wrapper、domain 本地 delta assembly 里的读模型基础设施，收敛成两层正式底座：
  - `@shared/delta`
  - `@shared/projection`

约束固定如下：

- 只接受长期最优。
- 不保留兼容层。
- 不保留 `shared/projector` 作为正式名义。
- 不再允许 dataview / whiteboard 在领域包里各自长出第二套 projection 基础设施。

Phase 5 完成后，整个底层应当固定为：

```text
mutation commit
  -> projection runtime
  -> snapshot
  -> delta
  -> stores / query surface
```

---

## 2. 当前问题诊断

### 2.1 `shared/projector` 里同时存在两套东西

当前 `shared/projector` 里其实有两套不同方向的基础设施：

1. 旧的 phase/projector runtime
   - `phase/*`
   - `projector/*`
   - `contracts/projector.ts`
   - `contracts/phase.ts`

2. 新的 model/projection runtime
   - `model/index.ts`
   - `createProjectionRuntime(...)`
   - `defineProjectionModel(...)`

这两套东西同时存在，会导致几个问题：

- 名词不统一：`projector` / `projection` 混用。
- 能力边界不清楚：到底正式 runtime 是 `createProjector` 还是 `createProjectionRuntime`。
- dataview 继续建立在旧 phase/projector 上。
- whiteboard editor-scene 已经建立在新 projection runtime 上。

这意味着仓内现在不是“没有统一 runtime”，而是“已经出现新 runtime，但旧 runtime 还没退场”。

### 2.2 delta primitive 没有独立成正式底座

当前 delta 相关能力主要在：

- `shared/projector/src/delta/*`
- `shared/projector/src/change/*`
- `shared/projector/src/publish/*`
- whiteboard engine 的 `mutation/publish.ts`
- dataview active / document delta 组装

问题在于：

- `idDelta` / `entityDelta` 是通用 primitive，却还挂在 `projector` 下面。
- `change` state 本质是 delta aggregation primitive，也混在 `projector` 包里。
- domain publish 在做自己的 delta 组装语义，缺少共享 contract。
- “snapshot 输出”和“delta 输出”没有被统一看成 projection runtime 的正式产物。

### 2.3 dataview 的 projection 仍然是“局部 runtime + mutation publish 拼装”

当前 dataview 的 active view 读模型大致是：

- mutation `publish.ts` 驱动 index
- active projector 再跑 query / membership / summary 等阶段
- `publish.ts` 最后手工装 `publish.active` 和 `publish.delta`

这导致：

- projection runtime 没有成为 dataview 的正式内核，而只是 `publish` 的内部工具。
- index delta / active delta / document delta 仍由 `publish.ts` 手工拼接。
- `active/projector/*` 还是 domain 私有 projector wrapper。

### 2.4 whiteboard 的 snapshot/delta 仍停留在 mutation publish 层

当前 whiteboard engine 的 `mutation/publish.ts` 基本只是：

- 从 `write.extra.changes` 拿 `ChangeSet`
- 手工 clone 到 `EngineDelta`
- 同时构造 `EnginePublish.snapshot`

这意味着：

- whiteboard engine 的 snapshot / delta 还没有正式 projection runtime。
- whiteboard editor-scene 虽然已经是 projection runtime，但仍是 editor-scene 自己的局部 runtime，不是 engine / scene / render 的统一底座。
- whiteboard 有“engine publish runtime”和“scene runtime”两套读模型基础设施。

---

## 3. Phase 5 的最终判断

### 3.1 最终正式 runtime 只保留 `createProjectionRuntime`

Phase 5 的核心决策是：

- `createProjectionRuntime(...)` 成为唯一正式 projection runtime。
- `createProjector(...)` 以及整套旧 phase/projector 命名退场。

也就是说，长期最优不是“在 `shared/projector` 里继续维护两套 runtime”，而是：

- 保留新模型。
- 删除旧模型。
- 将新模型提升为正式包名 `@shared/projection`。

### 3.2 delta 要独立成单独包

`idDelta` / `entityDelta` / change aggregation 这类能力，本质上不是 projection 特有逻辑，而是通用 read-model delta primitive。

所以长期最优必须是：

- `@shared/delta` 负责 delta primitive
- `@shared/projection` 只负责 runtime、phase orchestration、surface stores、trace

### 3.3 mutation `publish` 以后只保留“projection adapter”角色

Phase 5 后，mutation `publish` 不应该再自己长出读模型逻辑。

它的职责应收缩为：

- 调用 projection runtime
- 取 snapshot / delta
- 写入 mutation publish contract

换句话说：

- 读模型逻辑在 projection runtime
- mutation publish 只是 commit -> projection 的桥

---

## 4. 最终包结构

Phase 5 完成后，基础设施层应固定为：

```text
shared/delta
shared/projection
```

并且：

- `shared/projector` 删除
- 仓内不再出现新的 `projector` 正式命名

### 4.1 `@shared/delta`

职责固定为：

- `idDelta`
- `entityDelta`
- `changeState`
- normalize / clone / merge / take / empty / isEmpty
- 只表达“变化”，不表达“运行时”

### 4.2 `@shared/projection`

职责固定为：

- `defineProjectionModel`
- `createProjectionRuntime`
- phase graph / fanout / plan
- trace
- surface store builder
- 只表达“如何从输入推进读模型”

---

## 5. `@shared/delta` 的最终 API

## 5.1 `idDelta`

最终保留为最小 primitive：

```ts
type IdDelta<TKey extends string> = {
  added: ReadonlySet<TKey>
  updated: ReadonlySet<TKey>
  removed: ReadonlySet<TKey>
}
```

正式 API：

```ts
idDelta.create<TKey>()
idDelta.clone(delta)
idDelta.reset(delta)
idDelta.add(delta, key)
idDelta.update(delta, key)
idDelta.remove(delta, key)
idDelta.merge(target, source)
idDelta.hasAny(delta)
idDelta.isEmpty(delta)
```

### 5.2 `entityDelta`

用来表达实体集合变化：

```ts
type EntityDelta<TKey extends string> = {
  ids: IdDelta<TKey>
  order?: true
  reset?: true
}
```

正式 API：

```ts
entityDelta.create<TKey>()
entityDelta.normalize(input)
entityDelta.clone(delta)
entityDelta.merge(target, source)
entityDelta.isEmpty(delta)
```

### 5.3 `changeState`

当前 `shared/projector/src/change/*` 的能力应整体搬入 `@shared/delta`。

它的定位不是 projector helper，而是“嵌套 delta 聚合状态机”。

正式 API：

```ts
defineChangeSpec(...)
createChangeState(spec)
cloneChangeState(spec, state)
mergeChangeState(spec, target, source)
takeChangeState(spec, state)
hasChangeState(spec, state)
```

并且命名上统一到 `delta` 语义下，不再挂在 `projector.change` 名下。

### 5.4 `publish/*` helpers 的处理

`shared/projector/src/publish/*` 里的 list/entity/struct helper，本质上是“从前后快照导出 delta”的小型算法库。

长期最优做法不是继续保留 `publish` 目录，而是拆成：

- 明确属于 delta primitive 的，下沉到 `@shared/delta`
- 明确属于 domain 结构推导的，回到 domain 自己

原则只有一条：

- 共享层只保留结构无关 primitive
- 结构相关 publish helper 不再伪装成通用基础设施

---

## 6. `@shared/projection` 的最终 API

## 6.1 核心 runtime

正式入口固定为：

```ts
const runtime = createProjectionRuntime(model)
```

runtime 统一承载：

- working state
- read facade
- surface stores
- capture
- trace
- revision

正式返回面固定为：

```ts
type ProjectionRuntime<TInput, TState, TRead, TStores, TPhaseName, TMetrics, TCapture> = {
  revision(): number
  state(): TState
  read: TRead
  stores: TStores
  capture(): TCapture
  update(input: TInput): {
    revision: number
    trace: ProjectionTrace<TPhaseName, TMetrics>
  }
  subscribe(listener): () => void
}
```

### 6.2 model contract

正式 model 固定为：

```ts
defineProjectionModel({
  createState,
  createRead,
  surface,
  plan,
  capture,
  phases
})
```

其中：

- `createState`：创建 working state
- `createRead`：创建 query/read facade
- `surface`：定义 reactive surface
- `plan`：从输入和当前状态生成 phase plan
- `capture`：导出外部 snapshot / delta / debug capture
- `phases`：定义 phase DAG

### 6.3 phase 概念保留，但旧 `createProjector` 语义删除

Phase 5 不是删除 phase，而是删除旧 runtime 包装。

也就是说：

- phase DAG / scope / fanout 继续保留
- 但它们不再以 `createProjector` 那套 API 暴露
- 它们全部成为 `createProjectionRuntime` 的内部正式模型

最终不会再有：

- `ProjectorSpec`
- `ProjectorPlanner`
- `ProjectorPublisher`
- `createProjector(...)`

而只会有：

- `ProjectionModel`
- `ProjectionRuntime`
- `ProjectionTrace`

### 6.4 reactive surface store 固定并入 projection runtime

当前 `shared/projector/src/store/*` 已经在做 projection surface store。

Phase 5 后这块正式属于 `@shared/projection`，不再独立叫 `ProjectorStore`。

长期最优语义是：

- store surface 是 projection runtime 的一部分
- 不是额外挂在 projector 上的一个辅助模块

因此命名也应统一成：

- `ProjectionStoreField`
- `ProjectionStoreRead`
- `createProjectionStore` 或直接作为 runtime 内部能力

如果没有单独工厂的必要，最优解是直接并入 runtime，不再额外暴露二次装配入口。

---

## 7. dataview 的目标改造

## 7.1 dataview 的最终结构

dataview 最终应只有一套正式 active projection runtime：

```text
commit
  -> index projection
  -> active projection
  -> publish.active snapshot
  -> publish.delta.active
```

### 7.2 需要删除的概念

Phase 5 做完后，dataview 里这些概念都应该退场：

- `active/projector/*` 作为私有 projector wrapper
- mutation `publish.ts` 自己拼大段 active delta
- `projector` 术语

### 7.3 最终实现原则

dataview 的 `mutation/publish.ts` 应变成：

1. 根据 commit trace 推导 projection input
2. 推进一个或多个 projection runtime
3. 读取 projection snapshot / delta
4. 填回 mutation publish 结构

也就是说：

- `publish.ts` 只负责 wiring
- `active/index/document` 的 delta 语义都由 projection runtime 自己产出

### 7.4 dataview 的推荐拆法

最优做法不是把 index 留在 mutation publish 旁边，而是也看成 projection runtime。

因此 dataview 最终建议拆成：

- document projection
- index projection
- active projection

并明确：

- index 是 snapshot + delta runtime
- active 也是 snapshot + delta runtime
- mutation publish 只是把这些 runtime 串起来

---

## 8. whiteboard 的目标改造

## 8.1 whiteboard engine publish 要变成最薄 projection adapter

当前 whiteboard engine 的 publish 还是：

- snapshot = `createDocumentSnapshot`
- delta = `write.extra.changes -> EngineDelta`

Phase 5 后它应收敛成：

- engine document projection runtime 负责产出 snapshot + delta
- mutation publish 只负责把结果写回 `EnginePublish`

### 8.2 whiteboard editor-scene 要提升为正式 projection runtime 家族

现在 whiteboard editor-scene 已经在用 `createProjectionRuntime`，但它还是局部 runtime。

Phase 5 后应把它明确成 whiteboard projection 体系的一部分：

- document projection
- scene projection
- spatial/index projection
- render projection

并且这些 runtime 的命名、trace、surface contract 要统一到 `@shared/projection`。

### 8.3 whiteboard 不应继续保留两套读模型底座

长期最优不接受下面这种结构继续存在：

- engine 有一套 `publish snapshot/delta`
- editor-scene 又有一套独立 scene runtime

最终应统一为：

- engine publish 是 document projection runtime 的输出
- editor-scene 是更高层 scene projection runtime
- 它们共享同一套 projection/delta 基础设施

### 8.4 whiteboard 的 delta contract

whiteboard 的 `EngineDelta` 不应继续手工 clone `ChangeSet`。

长期最优应改成：

- `EngineDelta` 建立在 `@shared/delta` primitive 之上
- `ChangeSet` 只是 reducer/mutation 侧事实
- projection runtime 决定最终对外 delta 形状

也就是说：

- mutation extra changes 不再直接等于 publish delta
- 中间必须经过 projection contract

---

## 9. 包与命名的最终收口

## 9.1 删除 `shared/projector`

Phase 5 结束后：

- `shared/projector` 整包删除
- 仓内所有 `@shared/projector/*` import 全部迁移

## 9.2 新包名固定

- `@shared/delta`
- `@shared/projection`

不要出现：

- `@shared/projector`
- `@shared/projection-model`
- `@shared/read-model`
- `@shared/publish-delta`

命名必须收口，不能再发散。

## 9.3 术语统一

从 Phase 5 开始，仓内正式术语固定为：

- `projection`
- `delta`
- `snapshot`
- `surface`
- `trace`

不再混用：

- projector
- publish helper
- active projector
- scene projector

domain 可以说：

- active projection
- scene projection
- document projection

但不能再说：

- active projector
- scene projector

---

## 10. 实施顺序

建议按下面顺序做，不能乱序。

### Step 1：先抽 `@shared/delta`

把这些东西先搬出去：

- `shared/projector/src/delta/*`
- `shared/projector/src/change/*`

先让 delta primitive 独立，再动 projection runtime。

### Step 2：把 `createProjectionRuntime` 提升为正式 runtime

把当前 `shared/projector/src/model/*` 提升为：

- `@shared/projection`

同时把 phase/fanout/scope/trace 统一并进去。

### Step 3：删除旧 `createProjector`

在 `@shared/projection` 成型后，删除：

- `phase/*`
- `projector/*`
- 旧 `contracts/projector.ts`
- 旧 `Projector*` 命名

### Step 4：先迁 dataview

优先迁 dataview，因为它现在旧 projector 痕迹最重。

目标：

- active/index/document 全部改成 projection runtime
- `mutation/publish.ts` 只做 wiring

### Step 5：再迁 whiteboard engine publish

让 whiteboard engine 的 snapshot/delta 不再手工拼 `ChangeSet`。

### Step 6：最后统一 whiteboard scene runtime 的正式边界

这一步不一定要求把全部 scene 逻辑合并进 engine，但要求：

- 同一套 `@shared/projection`
- 同一套 `@shared/delta`
- 同一套 trace / surface / capture contract

---

## 11. 完成标准

Phase 5 完成时，必须同时满足以下条件：

1. `@shared/delta` 独立存在。
2. `@shared/projection` 独立存在。
3. `@shared/projector` 删除。
4. `createProjector(...)` 删除。
5. dataview 不再维护 `active/projector/*` 这套私有 wrapper 语义。
6. whiteboard engine publish 不再直接把 `ChangeSet` 当最终 delta。
7. whiteboard editor-scene 与 engine publish 建立在同一套 projection/delta 基础设施上。
8. 仓内正式术语统一为 `projection` / `delta`，不再混用 `projector`。

---

## 12. 一句话结论

Phase 5 的本质不是“给现有 projector 改个名”，而是：

- 把 delta primitive 从 projector 里拆出来；
- 把已经出现的新 `createProjectionRuntime` 扶正成唯一正式 runtime；
- 删除旧 projector；
- 让 dataview 和 whiteboard 都不再维护自己的读模型基础设施包装。

最终长期最优形态应当是：

```text
@shared/delta
@shared/projection
```

domain 只保留自己的：

- projection model
- phase logic
- domain read facade

而不再保留自己的：

- projector framework
- delta framework
- publish assembly framework

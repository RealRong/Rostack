# Phase 5：Projection / Delta 大一统设计方案

## 1. 目标

Phase 5 只做一件事：

- 把当前散落在 `shared/projector`、mutation `publish`、domain 本地 projector wrapper、domain 本地 delta assembly 里的读模型基础设施，收敛成两层正式底座：
  - `@shared/delta`
  - `@shared/projection`

并且增加一个新的强约束：

- `@shared/projection` 必须尽量 **spec 化**
- public API 必须尽量小
- phase / scope / fanout / store / sync helper 尽量封装在内部
- domain 写的是 projection spec，而不是拼装一堆 projection builder / helper

约束固定如下：

- 只接受长期最优
- 不保留兼容层
- 不保留 `shared/projector` 作为正式名义
- 不再允许 dataview / whiteboard 在领域包里各自长出第二套 projection 基础设施

Phase 5 完成后，整个底层应当固定为：

```text
mutation commit
  -> projection runtime
  -> snapshot
  -> delta
  -> surface / query
```

---

## 2. 当前问题诊断

### 2.1 `shared/projector` 里同时存在两套 runtime 方向

当前 `shared/projector` 里实际上同时存在：

1. 旧的 phase/projector runtime
   - `phase/*`
   - `projector/*`
   - `contracts/projector.ts`
   - `contracts/phase.ts`

2. 新的 projection runtime
   - `model/index.ts`
   - `createProjectionRuntime(...)`
   - `defineProjectionModel(...)`

这会带来几个问题：

- 名词不统一：`projector` / `projection` 混用
- 边界不统一：到底正式 runtime 是 `createProjector` 还是 `createProjectionRuntime`
- dataview 继续建立在旧 projector 体系上
- whiteboard editor-scene 已经建立在新 projection runtime 上

本质上仓内现在不是“没有统一 runtime”，而是“新 runtime 已经出现，但旧 runtime 还没退场”。

### 2.2 delta primitive 之前没有独立成正式底座

当前 delta 相关能力散落在：

- `shared/projector/src/delta/*`
- `shared/projector/src/change/*`
- `shared/projector/src/publish/*`
- whiteboard engine 的 `mutation/publish.ts`
- dataview active / document delta 组装

问题在于：

- `idDelta` / `entityDelta` 是通用 primitive，却挂在 `projector` 下
- `changeState` 本质是 delta aggregation primitive，也混在 `projector` 包里
- domain publish 在做自己的 delta 组装，缺少统一 contract
- snapshot / delta 没有被统一看成 projection runtime 的正式输出

### 2.3 dataview 仍然不是 projection runtime 驱动

当前 dataview 的 active view 读模型大致是：

- mutation `publish.ts` 驱动 index
- active projector 再跑 query / membership / summary / publish
- `publish.ts` 手工装 `publish.active` 和 `publish.delta`

这意味着：

- projection runtime 还不是 dataview 的正式内核
- index delta / active delta / document delta 仍由 `publish.ts` 手工拼接
- `active/projector/*` 仍是私有 wrapper 体系

### 2.4 whiteboard 仍然有两套读模型底座

当前 whiteboard：

- engine publish 还停留在 mutation publish 层手工拼 snapshot / delta
- editor-scene 已经是 projection runtime，但仍是局部 runtime

这意味着：

- whiteboard engine publish runtime
- whiteboard scene runtime

这两套读模型底座还没有真正统一。

---

## 3. Phase 5 的最终判断

### 3.1 最终正式 runtime 只保留 `createProjectionRuntime(spec)`

Phase 5 的核心决策是：

- `createProjectionRuntime(spec)` 成为唯一正式 projection runtime
- `createProjector(...)` 以及整套旧 phase/projector 命名退场

长期最优不是继续在 `shared/projector` 里维护两套 runtime，而是：

- 删除旧 runtime
- 把新 runtime 扶正为 `@shared/projection`
- 并把它的 public API 收口成最小 spec/runtime 面

### 3.2 delta 要独立成单独包

`idDelta` / `entityDelta` / `changeState` 这类能力，本质上不是 projection 特有逻辑，而是通用 read-model delta primitive。

所以长期最优必须是：

- `@shared/delta` 负责 delta primitive
- `@shared/projection` 负责 runtime、trace、surface、capture

### 3.3 `@shared/projection` 不应成为“大而全工具箱”

长期最优不是把旧 `projector` 里的能力换个包名继续大面积导出。

真正更优雅的方向是：

- domain 只依赖 `ProjectionSpec`
- runtime 内部自己处理 phase graph / scope merge / surface store / fanout
- public API 只暴露最小必要能力

也就是说：

- 不是“更多 helper”
- 而是“更少公开面”

### 3.4 mutation `publish` 以后只保留“projection adapter”角色

Phase 5 后，mutation `publish` 不应该再自己长出读模型逻辑。

它的职责应收缩为：

- 调用 projection runtime
- 取 snapshot / delta / trace
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
- 仓内不再出现新的正式 `projector` 命名

### 4.1 `@shared/delta`

职责固定为：

- `idDelta`
- `entityDelta`
- `changeState`
- `writeEntityChange`
- 只表达“变化”，不表达“运行时”

### 4.2 `@shared/projection`

职责固定为：

- 运行 projection spec
- 调度 phase DAG
- 管理 scope / emit / fanout
- 托管 read / surface / capture / trace

但这些属于 **内部实现职责**，不意味着都要作为 public API 暴露。

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

### 5.4 publish helper 的原则

原先 `shared/projector/src/publish/*` 里的 helper，不应自动升级成新的共享大 API。

原则只有一条：

- 共享层只保留结构无关 primitive
- 结构相关 publish helper 要么回到 domain，要么内收进 `@shared/projection`

---

## 6. `@shared/projection` 的最终 API

## 6.1 最小公开面

`@shared/projection` 的 public API 应尽量缩到：

```ts
createProjectionRuntime(spec)

type ProjectionSpec
type ProjectionRuntime
type ProjectionTrace
type Revision
```

也就是说，最终不再公开：

- `defineProjectionModel(...)`
- `createPlan(...) / mergePlans(...)`
- `defineScope(...) / flag() / set() / slot()`
- `ProjectionPhase / ProjectionScopeMap / ProjectionScopeValue`
- `ProjectorStore / createProjectorStore`

domain 只写一个 plain `ProjectionSpec`，然后交给 runtime。

## 6.2 spec 的推荐形态

最终 spec 应当是一个 plain object，而不是一堆 builder 组合。

推荐形态：

```ts
const sceneProjectionSpec = {
  createState() {
    ...
  },
  createRead(runtime) {
    ...
  },
  surface: {
    ...
  },
  capture({ state, read, revision }) {
    ...
  },
  plan({ input, state, read, revision }) {
    return {
      phases: ['graph', 'spatial', 'view']
    }
  },
  phases: {
    graph: {
      after: [],
      run(ctx) {
        ...
      }
    },
    spatial: {
      after: ['graph'],
      run(ctx) {
        ...
      }
    },
    view: {
      after: ['graph', 'spatial'],
      run(ctx) {
        ...
      }
    }
  }
} satisfies ProjectionSpec<...>

const runtime = createProjectionRuntime(sceneProjectionSpec)
```

关键点是：

- spec 是唯一 domain 编写面
- phase graph 用 `phases` plain object + `after`
- plan 直接返回 plain object
- scope 直接返回 plain data
- domain 不需要显式调用 plan/scope DSL

## 6.3 scope schema 也应收进 spec

如果 runtime 需要知道 scope merge 语义，也不应该要求 domain 写：

- `defineScope`
- `flag`
- `set`
- `slot`

长期最优应收敛成 spec 内声明式字段：

```ts
phases: {
  publish: {
    after: ['summary'],
    scope: {
      reset: 'flag',
      membership: 'slot',
      summary: 'slot'
    },
    run(ctx) {
      ...
    }
  }
}
```

也就是说：

- scope merge 规则仍存在
- 但它是 spec 的内部字段
- 不再暴露为独立 DSL API

## 6.4 surface store 固定并入 runtime

surface store 是 projection runtime 的一部分，不再额外暴露：

- `ProjectorStore`
- `createProjectorStore`

如果某个 projection 需要响应式 surface，就放进 `surface` 字段，由 runtime 统一托管。

## 6.5 publish/sync helper 的长期最优边界

当前这类能力：

- list/entity/struct publish helper
- sync/patch helper

不应继续作为大面积 public API 平铺导出。

长期最优原则：

- 能内收进 runtime / adapter，就内收
- 只有跨 domain 反复证明稳定的 primitive，才考虑公开
- 即便公开，也只允许进入一个子命名空间

也就是说，最多允许：

```ts
projectionPublish.*
projectionSync.*
```

但默认更优方案仍然是 **不公开**。

---

## 7. dataview 的目标改造

## 7.1 dataview 的最终结构

dataview 最终应固定为三层 projection：

```text
commit
  -> document projection
  -> index projection
  -> active projection
  -> publish.active snapshot
  -> publish.delta
```

### 7.2 需要删除的概念

Phase 5 做完后，dataview 里这些概念都应该退场：

- `active/projector/*`
- `active/contracts/projector.ts`
- `ActiveProjector*` 命名
- mutation `publish.ts` 自己拼大段 active delta
- `projector` 术语

### 7.3 最终实现原则

dataview 的 `mutation/publish.ts` 应变成：

1. 根据 commit trace 推导 projection input
2. 推进 document / index / active runtime
3. 读取 snapshot / delta / trace capture
4. 填回 mutation publish 结构

也就是说：

- `publish.ts` 只负责 wiring
- `active/index/document` 的 delta 语义都由 projection runtime 自己产出

### 7.4 dataview 的最终 spec 形态

长期最优里 dataview 不应再保留：

- spec
- planner
- publisher

这种人为拆散层。

而应直接收敛成：

- `dataviewDocumentProjectionSpec`
- `dataviewIndexProjectionSpec`
- `dataviewActiveProjectionSpec`

也就是说，domain 写的是 plain `ProjectionSpec`。

---

## 8. whiteboard 的目标改造

## 8.1 whiteboard engine publish 要变成最薄 projection adapter

当前 whiteboard engine 的 publish 还是：

- snapshot = `createDocumentSnapshot`
- delta = `write.extra.changes -> EngineDelta`

Phase 5 后它应收敛成：

- engine document projection runtime 负责产出 snapshot + delta
- mutation publish 只负责把结果写回 `EnginePublish`

### 8.2 whiteboard editor-scene 要提升为正式 projection spec 家族

现在 whiteboard editor-scene 已经在用 projection runtime，但它还不是统一的正式 spec 体系。

Phase 5 后应把它明确成 whiteboard projection 家族的一部分：

- document projection
- scene projection
- spatial/index projection
- render/view projection

并且这些 runtime 的命名、trace、surface、capture contract 都统一到 `@shared/projection`。

### 8.3 whiteboard 不应继续保留两套读模型底座

长期最优不接受下面这种结构继续存在：

- engine 有一套手工 publish snapshot/delta
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
- `spec`

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

把当前新 projection runtime 提升为：

- `@shared/projection`

但这里不是简单平移 API，而是进一步收口为：

- `createProjectionRuntime(spec)`
- `ProjectionSpec`
- `ProjectionRuntime`
- `ProjectionTrace`
- `Revision`

同时把 phase/fanout/scope/store 等实现能力尽量内收。

### Step 3：删除旧 `createProjector`

在 `@shared/projection` 成型后，删除：

- `phase/*`
- `projector/*`
- 旧 `contracts/projector.ts`
- 旧 `Projector*` 命名

### Step 4：先迁 dataview

优先迁 dataview，因为它现在旧 projector 痕迹最重。

目标：

- active / index / document 全部改成 projection spec + runtime
- `mutation/publish.ts` 只做 wiring

### Step 5：再迁 whiteboard engine publish

让 whiteboard engine 的 snapshot/delta 不再手工拼 `ChangeSet`。

### Step 6：最后统一 whiteboard scene runtime 的正式边界

这一步不一定要求把全部 scene 逻辑合并进 engine，但要求：

- 同一套 `@shared/projection`
- 同一套 `@shared/delta`
- 同一套 trace / surface / capture / spec 语义

---

## 11. 完成标准

Phase 5 完成时，必须同时满足以下条件：

1. `@shared/delta` 独立存在
2. `@shared/projection` 独立存在
3. `@shared/projector` 删除
4. `createProjector(...)` 删除
5. dataview 不再维护 `active/projector/*` 这套私有 wrapper 语义
6. whiteboard engine publish 不再直接把 `ChangeSet` 当最终 delta
7. whiteboard editor-scene 与 engine publish 建立在同一套 projection/delta 基础设施上
8. 仓内正式术语统一为 `projection` / `delta` / `spec`
9. `@shared/projection` public API 收敛到最小 spec/runtime 面

---

## 12. 一句话结论

Phase 5 的本质不是“给现有 projector 改个名”，而是：

- 把 delta primitive 从 projector 里拆出来
- 把已经出现的新 projection runtime 扶正成唯一正式 runtime
- 删除旧 projector
- 把 `@shared/projection` 收口成最小 spec/runtime API
- 让 dataview 和 whiteboard 都不再维护自己的读模型基础设施包装

最终长期最优形态应当是：

```text
@shared/delta
@shared/projection
```

domain 只保留自己的：

- projection specs

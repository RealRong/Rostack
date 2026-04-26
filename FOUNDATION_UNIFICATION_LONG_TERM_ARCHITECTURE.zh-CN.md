# 底层设施大一统长期方案

## 1. 目标

这份文档只讨论**长期最优**，不考虑兼容层，不考虑渐进迁移成本。

目标非常明确：

1. 上层只保留领域语义。
2. `operation / reducer / mutation runtime / projection / delta / reactive store / history / collab` 尽量全部下沉成共享设施。
3. 同一类概念只保留一套正式模型，不再出现多套平行包装。
4. 命名统一，分层稳定，职责单一。

最终希望收敛成：

```text
领域层只负责：
- 操作语义
- 意图编排
- 领域索引 / 领域投影 phase
- 领域 codec / schema 断言

共享层负责：
- mutation runtime
- reducer runtime
- projection runtime
- delta primitives
- reactive store
- history
- collab
- yjs transport adapter
```

---

## 2. 当前现状判断

### 2.1 已经统一得比较好的部分

这几块已经在正确方向上：

- `shared/reducer` 已经是正式 reducer kernel。
- `shared/mutation` 已经是正式 mutation kernel。
- `shared/collab` 已经成为正式 collab runtime。
- `shared/projector` 已经承担了一部分通用 projection runtime。
- `shared/core/store` 已经是通用 reactive store。

也就是说，大方向是对的：

```text
shared/*
  负责底层 runtime
domain/*
  负责语义
```

问题不在于方向错误，问题在于**还没有收口到底**。

---

## 3. 当前仍然存在的历史遗留与重复实现

## 3.1 History 仍然分成了三层公开概念

当前实际上有三套 history 形态：

1. `HistoryController`
2. `LocalHistoryApi`
3. `LocalHistoryBinding`

其中：

- `HistoryController` 是 engine 内核态。
- `LocalHistoryApi` 是 UI / session 可消费态。
- `LocalHistoryBinding` 是可切换来源的包装态。

问题不是分层本身，而是**这些层被显式暴露得太多**，导致上层仍然在感知底层实现细节。

长期最优里：

- `HistoryController` 应该只作为 engine 内部机制存在。
- 上层正式只认一个 `HistoryPort<Result>`。
- `binding` 不应该再是单独概念，而应该是 `HistoryPort` 的内建能力。

也就是：

```ts
type HistoryPort<Result> = ReadStore<HistoryState> & {
  undo(): Result
  redo(): Result
  clear(): void
  bind?(next: HistoryPort<Result>): void
  reset?(): void
}
```

这样 UI / runtime / collab 都只认一套对外 history 形态。

---

## 3.2 `shared/collab` 里仍然重复实现了一份 local history 包装逻辑

`shared/mutation/src/localHistory.ts` 和 `shared/collab/src/session.ts` 里的 `createCollabHistory` 本质上做的是同一件事：

- 把 `HistoryController` 包成可订阅、可调用的 history API
- 负责 `undo/redo/clear`
- 负责 publish state
- 负责 apply 失败后的回滚 / 失效语义

这是一处明确的重复实现。

差异只在于：

- 单机场景 `apply` 失败后 `cancel('restore')`
- 协作场景 `apply` 失败后 `cancel('invalidate')`
- 协作场景多一个 `canRun()`

这不应该分叉成两份 runtime。

长期最优应该收敛成一套：

```ts
createHistoryPort(engine, {
  apply: {
    origin: 'history',
    canRun,
    onFailure: 'restore' | 'invalidate'
  }
})
```

也就是说：

- `createLocalMutationHistory`
- `createCollabHistory`

最终只保留一个正式入口。

---

## 3.3 collab 仍然只看得到 `apply write`，看不到 `replace commit`

这是当前一个根本性遗留。

`shared/collab` 现在依赖：

- `engine.doc()`
- `engine.replace(...)`
- `engine.apply(...)`
- `engine.writes`
- `engine.history`

但 `engine.writes` 只覆盖 `apply` 产生的 write，不覆盖 `replace/load` 这种“文档直接替换”。

这直接导致 dataview 需要在 `dataview-collab/src/session.ts` 里额外做一层：

- 监听 `current().rev`
- 比较 `lastWriteRev`
- 推断“发生了没有 write 的 replace”
- 手动重写 checkpoint

这说明底层事件模型不完整。

长期最优不能再以 `writes` 作为唯一事实流，而应该正式引入：

```ts
type CommitRecord<Doc, Op, Key, Extra> =
  | {
      kind: 'apply'
      rev: number
      origin: Origin
      doc: Doc
      forward: readonly Op[]
      inverse: readonly Op[]
      footprint: readonly Key[]
      extra: Extra
    }
  | {
      kind: 'replace'
      rev: number
      origin: Origin
      doc: Doc
    }
```

然后 engine 正式暴露：

```ts
commits: Stream<CommitRecord<...>>
```

有了它以后：

- history 不再只盯 `write`
- collab 不再猜测 `replace`
- persistence / snapshot / checkpoint 不再需要额外 hack

这是下一轮最应该做的底层收口。

---

## 3.4 Yjs 适配层在 dataview 和 whiteboard 中大面积模板化重复

当前两边都各自实现了几乎同构的内容：

- `createCollabLocalOrigin`
- `createSharedStore`
- `createYjsSyncStore`
- `createYjsSyncCodec`
- `CreateYjsSessionOptions`
- `CollabSession` 类型壳

其中重复最明显的是：

- `src/yjs/store.ts`
- `src/yjs/shared.ts`
- `src/session.ts` 中的 `createSharedStore`

这些不是领域逻辑，而是 transport 设施。

长期最优应该拆成：

```text
shared/collab      = session / replay / history / checkpoint orchestration
shared/collab-yjs  = Yjs transport adapter
```

其中 `shared/collab-yjs` 负责：

- Yjs snapshot store
- local origin
- provider bridge
- 通用 JSON / binary codec helpers

领域层只保留：

- `assertChange`
- `assertCheckpoint`
- `createChange`
- `readChange`
- `checkpoint.create/read`

也就是 Yjs 不该再是 whiteboard/dataview 各自维护一套。

---

## 3.5 `publish` 这个词目前承载了三层不同含义

当前仓内“publish”至少有三种不同语义：

1. mutation engine 的 post-commit publish
2. projector 的 publisher
3. 本地 store / runtime 的 state publish

这是命名污染。

长期最优应该统一术语：

- `reduce`：修改 canonical doc
- `commit`：形成正式提交记录
- `project`：从 canonical state 派生 snapshot/change
- `emit`：对外广播结果
- `sync`：与外部副本同步

建议彻底弱化 `publish` 这个词，避免一词多义。

更准确的结构应该是：

```text
Reducer -> Commit -> Projection -> Emit
```

而不是：

```text
Reducer -> Publish -> Projector Publish -> Store Publish
```

---

## 3.6 dataview 与 whiteboard 的 operation spec 仍然没有完全统一

dataview 现在更接近长期最优：

- 操作 meta
- footprint collect
- apply

基本都收在 `operation definition table` 里。

whiteboard 仍然分散在几处：

- `spec/operation/meta.ts`
- `reducer/history.ts`
- `reducer/handlers/*`
- `reducer/spec.ts` 里的路由分发

这会导致：

- 语义分散
- 新操作需要多处同步维护
- 无法自动生成 reducer / history / collab 规则

长期最优应该强制 whiteboard 也收敛成单表：

```ts
type OperationSpecTable<Op> = {
  [K in Op['type']]: {
    family: string
    sync?: 'live' | 'checkpoint'
    history?: boolean
    footprint?(ctx, op): void
    apply(ctx, op): void
    validateBatch?(ops): void
  }
}
```

这样：

- reducer 从表驱动
- history track/clear 从表驱动
- collab live/checkpoint 分类从表驱动
- 文档校验和工具生成也从表驱动

这才叫真正 spec 化。

---

## 3.7 `shared/projector` 现在有两套相近但不完全一致的运行时抽象

当前 `shared/projector` 至少同时承载了两类能力：

1. phase projector runtime
2. projection model runtime（surface + stores）

而 dataview active projector 还在这之上再包一层自己的 wrapper。

这说明 projector 层虽然已经共享，但 API 还没有完全收口。

长期最优应该只保留一个正式公共模型：

```ts
createProjectionRuntime(spec)
```

它统一支持：

- phase planning
- working state
- snapshot projection
- delta projection
- surface stores
- trace

也就是把当前：

- `createProjector(...)`
- `createProjectionRuntime(...)`
- 各种 package-local wrapper

都收敛成一个概念家族。

建议长期直接把包名和术语统一为 `projection`，不再继续扩散 `projector / projection / publish` 三套混用。

---

## 3.8 delta 仍然有包边界不准确的问题

`shared/projector/delta` 里的 `idDelta / entityDelta` 本质上不是 projector 专属概念，而是通用 delta primitive。

长期最优应该把 delta 提升成独立基础设施，例如：

```text
shared/delta
```

职责只保留：

- `idDelta`
- `entityDelta`
- `recordDelta`
- `normalize / merge / clone / isEmpty`

然后：

- mutation projection 用它
- projector output 用它
- engine publish 用它
- scene / view / index 输出也用它

这样 delta 才是独立基础设施，而不是挂在 projector 名下。

---

## 3.9 reactive store 的公开面过宽

`shared/core/store` 现在公开能力太多：

- value
- keyed
- table
- family
- derived
- projected
- struct
- staged
- frame

这会带来两个问题：

1. 上层容易把 store DSL 当成“随处可拼的小框架”。
2. 领域层开始依赖过多 store 方言，反而削弱底层统一性。

长期最优应该只保留极少数**正式公共原语**：

- `value`
- `derived`
- `family`
- `batch`
- `joinUnsubscribes`

其他能力要么：

- 下沉成内部实现细节
- 要么作为 `advanced/*` 子路径显式暴露

原则是：

```text
store 是底层反应式载体
不是让上层自由搭积木的小语言
```

---

## 3.10 dataview `publish` 当前混合了三种职责

`dataview-engine/src/mutation/publish.ts` 现在同时做：

1. index cache 维护
2. active view projection
3. document delta 计算

这在功能上能工作，但在架构上耦合过深。

长期最优里，这三件事应该拆成明确的 post-commit effect：

- `projection.document`
- `projection.index`
- `projection.activeView`

engine 只负责 orchestration，不负责把它们揉成一个大函数。

whiteboard publish 现在较简单，但它其实也属于同一个模式：

- reducer extra -> engine delta

所以长期最优不是让 dataview 学 whiteboard，也不是让 whiteboard 学 dataview，
而是两边都学同一套 effect host。

---

## 4. 长期最优统一模型

## 4.1 统一总分层

最终建议固定成八层：

```text
1. Intent Spec           （可选）
2. Operation Spec        （必须）
3. Reducer Runtime       （必须）
4. Mutation Runtime      （必须）
5. Projection Runtime    （可多个）
6. History Runtime       （可插拔）
7. Collab Runtime        （可插拔）
8. Reactive Surface      （投影输出）
```

其中每层职责都单一：

### 1) Intent Spec

- 把意图编译成 operation
- 纯领域逻辑

### 2) Operation Spec

- 操作元信息
- footprint
- sync/live/checkpoint 语义
- history 语义
- apply 语义

### 3) Reducer Runtime

- 执行 operation
- 产出 `doc / inverse / footprint / extra`

### 4) Mutation Runtime

- 管理 revision
- 产出 commit stream
- 挂接 history
- 挂接 projection effects

### 5) Projection Runtime

- 从 canonical doc + commit 派生 read model / snapshot / delta

### 6) History Runtime

- 基于 commit stream 记录 undo / redo / invalidated

### 7) Collab Runtime

- 基于 commit stream 做 external sync / replay / checkpoint

### 8) Reactive Surface

- 给 UI / runtime / editor 提供只读 surface

---

## 4.2 唯一正式事实流：`CommitRecord`

长期最重要的统一点，是把整个底层都建立在同一条正式事实流上：

```ts
type CommitRecord<Doc, Op, Key, Extra> =
  | {
      kind: 'apply'
      rev: number
      origin: Origin
      doc: Doc
      forward: readonly Op[]
      inverse: readonly Op[]
      footprint: readonly Key[]
      extra: Extra
    }
  | {
      kind: 'replace'
      rev: number
      origin: Origin
      doc: Doc
    }
```

然后：

- history 读 commit
- collab 读 commit
- persistence 读 commit
- projections 读 commit
- metrics 读 commit

所有“我是不是要监听 `current().rev` 再猜发生了什么”的逻辑都应该消失。

---

## 4.3 唯一正式操作描述：`OperationSpecTable`

长期最优应该规定：

```ts
type OperationSpecTable<Doc, Op, Key, Ctx> = {
  [K in Op['type']]: {
    family: string
    sync?: 'live' | 'checkpoint'
    history?: boolean
    footprint?(ctx: Ctx, op: Extract<Op, { type: K }>): void
    apply(ctx: Ctx, op: Extract<Op, { type: K }>): void
  }
}
```

这样 reducer / history / collab / tooling 都建立在同一张表上。

whiteboard 应该向 dataview 的单表思路收敛；
dataview 再把 `trace / impact / validation` 更系统地挂到这张表上。

---

## 4.4 Projection 应成为正式的二级 runtime

长期不建议再把“doc 变更后的各种派生计算”继续挂在 mutation 的 `publish` 名下。

更好的模型是：

```ts
createMutationRuntime({
  doc,
  reducer,
  projections: {
    document: createProjectionRuntime(...),
    active: createProjectionRuntime(...),
    scene: createProjectionRuntime(...),
    index: createProjectionRuntime(...)
  }
})
```

这样：

- whiteboard engine publish
- dataview active publish
- whiteboard scene runtime

都会变成同类 projection runtime，只是输入和 phase 不同。

---

## 4.5 history 和 collab 都应该是 mutation runtime 的插件

长期模型中：

- history 不是外围工具函数
- collab 不是额外 facade

它们都应该是 mutation runtime 的标准插件。

形式上可以是：

```ts
const runtime = createMutationRuntime({
  doc,
  reducer,
  history: {...},
  collab: {...},
  projections: {...}
})
```

也可以是：

```ts
const runtime = createMutationRuntime(...)
const history = attachHistory(runtime, ...)
const collab = attachCollab(runtime, ...)
```

但无论哪种形式，底层事实都应该一致：

- 都直接吃 commit stream
- 都不再吃散装 capability bag
- 都不再自己推断 replace / load

---

## 5. 建议的最终包结构

```text
shared/reducer
  - reducer runtime

shared/mutation
  - mutation runtime
  - commit stream
  - operation meta helpers
  - history runtime

shared/projection
  - projection runtime
  - projection trace
  - surface builder

shared/delta
  - id/entity/record delta primitives

shared/store
  - minimal reactive primitives

shared/collab
  - generic collab session
  - replay / cursor / checkpoint orchestration

shared/collab-yjs
  - yjs store / provider / origin / generic codec helpers
```

领域层只剩：

```text
dataview/*
  - intent compile
  - operation spec
  - document semantics
  - active/index/query projection phases

whiteboard/*
  - intent compile
  - operation spec
  - scene/index/spatial projection phases
  - interaction/session semantics
```

---

## 6. 建议直接删除或合并的东西

## 6.1 应该删除的重复包装

1. collab 内部重复 history wrapper
2. 包级 `historyBinding` 私有实现
3. 各领域重复的 `createSharedStore`
4. 各领域重复的 `createCollabLocalOrigin`
5. 各领域重复的 `createYjsSyncStore`

这些都应该只有一份共享实现。

## 6.2 应该下沉成内部实现细节的概念

1. `HistoryController`
2. store 的过多方言构造器
3. projector 内部的多层 publish/scope/update 辅助模块

这些可以保留实现，但不该继续作为大面积公共 API 暴露。

## 6.3 应该升级成正式第一等概念的东西

1. `CommitRecord`
2. `OperationSpecTable`
3. `ProjectionRuntime`
4. `CollabTransportAdapter`
5. `HistoryPort`

---

## 7. 哪些属于领域逻辑，哪些必须下沉复用

## 7.1 必须留在领域层的

### dataview

- field / record / view 语义
- active view 规划
- index demand
- query / membership / summary phase

### whiteboard

- node / edge / group / mindmap 语义
- scene graph / spatial / render model phase
- interaction -> session 编排
- session 与 canonical document 的合成规则

## 7.2 必须共享的

- reducer kernel
- mutation runtime
- commit stream
- delta primitives
- history runtime
- collab runtime
- yjs transport
- projection runtime
- reactive store primitives

判断标准很简单：

```text
只要不依赖 dataview / whiteboard 的业务语义，
就不应该留在领域包里。
```

---

## 8. 最终结论

从长期最优看，下一轮真正值得做的不是继续零碎优化，而是完成下面五个收口：

1. 用 `CommitRecord` 取代“只有 write 没有 replace event”的不完整事实流。
2. 把 history 的对外形态收敛成唯一 `HistoryPort`，删除 collab 内部重复 wrapper。
3. 把 Yjs 适配抽成 `shared/collab-yjs`，删除 dataview / whiteboard 各自维护的一套模板代码。
4. 把 whiteboard operation 语义收敛成单表 spec，和 dataview 对齐到同一个 operation spec 模型。
5. 把 `publish/projector/model/delta` 统一整理成一套 `projection runtime + delta primitives`，不再让 mutation publish、projector publish、store publish 混在一起。

如果这五件事做完，最终形态会非常干净：

```text
Intent Spec
  -> Operation Spec
  -> Reducer
  -> Mutation Runtime (Commit Stream)
  -> Projection Runtime(s)
  -> History / Collab / Store Surface
```

那时上层基本只剩领域逻辑，底层设施才能真正复用到底。

# 底层设施大一统实施计划

## 1. 目标

这份文档是 `FOUNDATION_UNIFICATION_LONG_TERM_ARCHITECTURE.zh-CN.md` 的实施版。

约束固定如下：

- 只接受长期最优。
- 不保留兼容层。
- 不做双轨 API。
- 不做过渡命名。
- 一旦进入某阶段，该阶段产出的模型就是新的正式模型。

目标是把整个底层收敛成：

```text
Operation Spec
  -> Reducer
  -> Mutation Runtime
  -> Commit Stream
  -> Projection Runtime
  -> History
  -> Collab
  -> Reactive Surface
```

---

## 2. 最终包结构

最终建议固定为：

```text
shared/reducer
shared/mutation
shared/projection
shared/delta
shared/store
shared/collab
shared/collab-yjs
```

其中：

### `shared/reducer`

- reducer kernel
- reducer context
- inverse / footprint / failure runtime

### `shared/mutation`

- mutation runtime
- commit stream
- operation meta helpers
- history runtime

### `shared/projection`

- projection runtime
- phase orchestration
- trace
- surface store builder

### `shared/delta`

- id delta
- entity delta
- normalize / merge / clone / empty helpers

### `shared/store`

- 最小 reactive primitives

### `shared/collab`

- collab session runtime
- replay / checkpoint / resync

### `shared/collab-yjs`

- yjs transport adapter
- yjs snapshot store
- local origin
- provider bridge

---

## 3. 重构顺序总览

必须按下面顺序做，不能倒序：

### Phase 1

先补齐 mutation 底层事实流：

- 引入 `CommitRecord`
- 让 `replace/load` 和 `apply` 进入同一条 commit stream

### Phase 2

统一 history：

- 收敛成唯一 `HistoryPort`
- 删除 collab 里重复的 history wrapper

### Phase 3

统一 collab：

- 让 collab 直接基于 commit stream 工作
- 删除 dataview 的 `rev / lastWriteRev` 推断逻辑

### Phase 4

统一 yjs 适配：

- 抽出 `shared/collab-yjs`
- 删除 whiteboard / dataview 各自重复实现

### Phase 5

统一 projection / delta：

- 把 `shared/projector` 重组为 `shared/projection`
- 把 delta primitives 升级为 `shared/delta`

### Phase 6

统一 operation spec：

- 让 whiteboard 收敛到和 dataview 一样的单表 spec
- 让 history / collab / reducer 全部从 operation spec 派生

### Phase 7

最后再收口 dataview / whiteboard 的 engine 外形：

- engine 只暴露正式 runtime 能力
- 上层只保留领域 API

这个顺序不能反，因为：

- 没有 `CommitRecord`，history / collab 无法真正统一。
- 没有统一 history，collab 还会继续维护重复包装。
- 没有统一 projection / delta，publish 语义就不会稳定。
- 没有统一 operation spec，whiteboard 领域逻辑就无法彻底 spec 化。

---

## 4. Phase 1：引入 `CommitRecord`

## 4.1 目标

把 mutation runtime 的事实流从“只有 apply write”升级成“所有正式提交都可观测”。

最终要得到：

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

并且 runtime 正式暴露：

```ts
commits: Stream<CommitRecord<...>>
```

## 4.2 必做改动

### `shared/mutation`

- `Write` 不再承担“唯一事实流”职责。
- `engine.ts` 为 `apply` 和 `replace` 都发出 commit。
- `load` 只是 `replace(origin: 'load')` 的语法糖，但不会绕开 commit。

### 需要收口的现有问题

- `replace` 现在不会 emit write。
- collab 只能监听 `writes`，看不到 replace。
- dataview 只能靠 `current().rev` + `lastWriteRev` 猜测 replace。

这些逻辑在 Phase 1 结束后必须全部消失。

## 4.3 Phase 1 完成标准

满足以下条件才算完成：

1. `apply` 产生 `commit(kind: 'apply')`
2. `replace` 产生 `commit(kind: 'replace')`
3. `load` 产生 `commit(kind: 'replace', origin: 'load')`
4. history / collab / projection 不再依赖“只监听 writes”

---

## 5. Phase 2：统一 history 为唯一 `HistoryPort`

## 5.1 目标

对上层只保留一套 history 形态：

```ts
type HistoryPort<Result> = ReadStore<HistoryState> & {
  undo(): Result
  redo(): Result
  clear(): void
  set(next: HistoryPort<Result>): void
  reset(): void
}
```

这里 `set/reset` 可以保留在正式接口里，直接覆盖当前 binding 需求。

## 5.2 必做改动

### `shared/mutation`

- `HistoryController` 退回内部机制，不再作为主对外 API。
- `createLocalMutationHistory`
  改名或直接收口成正式 `createHistoryPort(engine, options?)`
- `createLocalHistoryBinding` 合并进 `createHistoryPort` 的正式能力模型

### 删除的概念

- `LocalHistoryApi`
- `LocalHistoryBinding`
- collab 内部单独构造 history api 的逻辑

对外只剩：

- `HistoryState`
- `HistoryPort<Result>`
- `createHistoryPort(...)`

## 5.3 Phase 2 完成标准

1. whiteboard runtime 只依赖 `HistoryPort`
2. dataview runtime 只依赖 `HistoryPort`
3. collab session 只暴露 `HistoryPort`
4. 仓内不再存在第二套 history wrapper

---

## 6. Phase 3：让 collab 完全基于 commit stream

## 6.1 目标

collab 不再依赖：

- `writes`
- `current().rev`
- “本地 replace 没有 write”这种隐式约束

而是直接基于 commit stream：

```text
commit -> encode change/checkpoint -> append to transport
remote snapshot -> replay as replace/apply -> produce remote commit
```

## 6.2 必做改动

### `shared/collab`

- engine contract 从 `writes` 改为 `commits`
- `publishWrite(write)` 改成 `publishCommit(commit)`
- checkpoint 旋转基于 commit 而不是 write
- history confirm / invalidate 基于 commit/change id 对齐

### dataview

- 删除 `suppressLocalCheckpointRewrite`
- 删除 `lastCurrentRev / lastWriteRev`
- 删除“queueMicrotask 推断 replace”逻辑

### whiteboard

- 继续沿用 checkpoint op / live op 区分，但也改为基于 commit stream

## 6.3 Phase 3 完成标准

1. `shared/collab` 的 engine contract 不再需要 `writes`
2. dataview collab session 不再需要本地 replace 推断补丁
3. replace / load / checkpoint rewrite 全部成为正式 commit 路径

---

## 7. Phase 4：抽出 `shared/collab-yjs`

## 7.1 目标

把 Yjs 相关基础设施全部从 whiteboard/dataview 包里搬走。

## 7.2 下沉范围

以下能力必须进入 `shared/collab-yjs`：

- `createCollabLocalOrigin`
- `createYjsSyncStore`
- `createSharedStore`
- 通用 snapshot read / append / checkpoint / clearChanges
- provider sync bridge
- 通用 JSON / binary codec helper

领域层只保留：

- `assertChange`
- `assertCheckpoint`
- `encode/decode` 中的领域校验

## 7.3 最终形态

```ts
createYjsCollabTransport({
  doc,
  provider,
  codec
})
```

返回正式 transport：

```ts
{
  store,
  provider,
  awareness,
  origin
}
```

whiteboard / dataview session 只做：

- change codec
- checkpoint codec
- domain empty document

## 7.4 Phase 4 完成标准

1. dataview 和 whiteboard 不再各自维护 `yjs/store.ts`
2. dataview 和 whiteboard 不再各自维护 `yjs/shared.ts`
3. `createSharedStore` 只有一份共享实现

---

## 8. Phase 5：统一 projection / delta

## 8.1 目标

把当前混杂的：

- `shared/projector`
- mutation `publish`
- package-local projector wrapper
- package-local delta assembly

收敛成两个正式基础设施：

- `shared/projection`
- `shared/delta`

## 8.2 delta 目标

把以下能力从 `shared/projector/delta` 提升出来：

- `idDelta`
- `entityDelta`
- normalize
- clone
- merge
- empty / isEmpty

`shared/delta` 成为所有 read-model 输出的统一 delta primitive。

## 8.3 projection 目标

统一成一个正式 runtime：

```ts
createProjectionRuntime(spec)
```

这个 runtime 要同时承载：

- working state
- phase plan
- snapshot output
- delta output
- trace
- reactive surface stores

### 迁移方向

#### dataview

- `mutation/publish.ts` 中的 active/index/document delta 逻辑拆成 projection effects
- `active/projector/*` 并入正式 projection runtime 语义

#### whiteboard

- `mutation/publish.ts` 改成最薄的 projection adapter
- `editor-scene` runtime 直接建立在统一 projection runtime 之上

## 8.4 Phase 5 完成标准

1. `shared/projector` 的正式公共名义被 `shared/projection` 取代
2. `shared/delta` 独立存在
3. dataview / whiteboard 不再各自围绕 projection 做额外概念包装

---

## 9. Phase 6：统一 operation spec

## 9.1 目标

让 dataview 和 whiteboard 都基于同一套单表 operation spec。

最终模型：

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

## 9.2 whiteboard 的目标改造

whiteboard 当前分散在：

- op meta
- reducer history collect
- reducer handler routing
- reducer input validation

最终要收敛成：

- 单一 operation spec table
- 单一 reducer from spec
- 单一 history / collab rule from spec

也就是 whiteboard 不再保留“表 + handlers + history collect + routing”这种拆散结构。

## 9.3 dataview 的目标改造

dataview 已经比较接近单表，但还可以继续提升：

- trace rule 更显式挂在 operation spec 上
- validation rule 也尽量并入 op family spec
- active/document impact 标注从 op spec 派生

## 9.4 Phase 6 完成标准

1. 两个领域都存在单表 operation spec
2. reducer / history / collab live-checkpoint 分类都从这张表派生
3. 新增 operation 不再需要多处同步注册

---

## 10. Phase 7：最终收口 engine 外形

## 10.1 目标

engine 最终只暴露正式 runtime 能力，不再暴露中间态概念。

建议最终稳定外形：

```ts
type MutationRuntime = {
  doc(): Doc
  current(): Current
  commits: Stream<CommitRecord<...>>
  history: HistoryPort<Result>
  projections: {
    [name: string]: ProjectionPort<any, any>
  }
  execute(intent | intent[], options?): Result
  apply(ops, options?): Result
  replace(doc, options?): boolean
}
```

其中：

- `history` 是正式 port，不再是 controller
- `commits` 是正式事实流
- `projections.*` 是正式 read model 容器

上层 runtime 不再自己重新包装这些能力。

## 10.2 Phase 7 完成标准

1. dataview runtime 不再自己拼 history / source / publish 协调层
2. whiteboard runtime 不再自己拼 engine + scene + history 的重复编排层
3. 上层只保留领域功能 API，不保留底层设施适配代码

---

## 11. 建议的实施顺序

## Sprint A

- Phase 1
- Phase 2

原因：

- 先把 mutation / history 的底座修正

## Sprint B

- Phase 3
- Phase 4

原因：

- collab 和 yjs 需要建立在 commit stream 稳定之后

## Sprint C

- Phase 5

原因：

- projection / delta 是大规模收口，应该单独做

## Sprint D

- Phase 6

原因：

- whiteboard operation spec 收口是领域结构性重构

## Sprint E

- Phase 7

原因：

- 只有当前几层全部稳定，engine 外形才能一次性定稿

---

## 12. 哪些事情不要做

以下做法都不符合长期最优：

### 12.1 不要继续加 facade

不要再新增：

- runtime facade
- collab binding
- history adapter
- publish bridge

如果出现“再包一层就能更方便”，大概率说明底层模型还没收口。

### 12.2 不要再引入第二套术语

最终术语应固定：

- operation
- reducer
- mutation
- commit
- projection
- delta
- history
- collab
- store

不要继续混用：

- publish
- projector
- snapshot runtime
- active runtime
- scene bridge

这些词只能作为局部领域名字，不能再作为底层基础设施主术语。

### 12.3 不要让 whiteboard 和 dataview 分别维护 transport 基础设施

只要是：

- Yjs store
- local origin
- provider sync
- shared snapshot container

都必须只有一份共享实现。

---

## 13. 最终验收标准

当下面条件都成立时，说明这轮底层统一真正完成：

1. 所有正式提交都进入统一 `CommitRecord` 流。
2. history 对外只剩 `HistoryPort`。
3. collab 不再重复实现 history wrapper。
4. yjs transport 只有一份共享实现。
5. delta 只有一套共享 primitive。
6. projection 只有一套共享 runtime。
7. dataview 和 whiteboard 都使用单表 operation spec。
8. 上层不再依赖底层设施的私有细节。

最后的理想状态应该是：

```text
shared/*
  全部是底层设施

dataview/*
  只剩 dataview 语义

whiteboard/*
  只剩 whiteboard 语义
```

这才算真正完成“大一统”。

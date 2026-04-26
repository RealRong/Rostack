# Shared Mutation 与 Dataview 下一步整体优化方案

## 1. 目标

本文只讨论下一步应该做什么，不讨论兼容旧结构，也不讨论保守过渡。

目标有两个：

1. 把 `@shared/mutation` 收敛成更完整的 mutation kernel。
2. 让 `dataview-engine` 在这个 kernel 之上，把 mutation / publish / cache / performance 的边界真正收干净。

核心判断：

> 现在 `dataview-engine` 的很多复杂度，不是 Dataview 业务本身不可避免，而是 `@shared/mutation` 还没有把 publish/cache/runtime 这层抽象补完整。

所以长期最优不是继续在 Dataview 本地打补丁，而是：

```text
先补齐 shared/mutation 的 publish model
再让 dataview 回到更纯粹的 mutation consumer
```

---

## 2. Shared Mutation 的下一步优化

### 2.1 给 publish.reduce 增加完整 `prev` 上下文

这是最优先的改动。

当前 `MutationPublishSpec.reduce(...)` 只有：

```ts
reduce({
  prev,
  doc,
  write
})
```

这里的 `doc` 是 next doc，`prev` 只是 previous publish。

缺口是：

- publish reducer 如果需要 previous document，就只能把旧 doc 偷塞进 publish state
- publish reducer 如果需要 previous cache，也没有稳定入口
- 这会迫使业务把 runtime cache 和 public publish 混在一起

长期最优应该变成：

```ts
reduce({
  prev,
  doc,
  write
})
```

其中：

```ts
prev: {
  doc: Doc
  publish: Publish
  cache: Cache
}
```

这样更合理，原因很直接：

- previous snapshot 本来就是一个整体语义，不该拆成多个平级参数
- `prev.doc / prev.publish / prev.cache` 比 `prevDoc / prevPublish / prevCache` 更稳定，也更容易扩展
- 如果以后还要增加 `prev.meta`、`prev.index` 之类的内部上下文，结构上也更自然

这里的关键点不是 `prevDoc` 这个单字段，而是：

```text
publish.reduce 需要拿到完整的 previous runtime snapshot
但这些上下文仍然不应该放进 Write
```

### 2.2 不要把 `prev` 上下文放进 `Write`

`Write` 应该继续表达提交事件本身：

- `rev`
- `at`
- `origin`
- `doc`
- `forward`
- `inverse`
- `footprint`
- `extra`

不应该让 `Write` 承担 runtime snapshot 上下文，否则会带来：

- write stream 负担变重
- history/collab 同步负担变重
- publish/runtime 的上下文和 event 语义混在一起

所以规则应该是：

```text
prev.* 属于 publish.reduce context
不属于 Write
```

### 2.3 把 public publish 和 internal cache 拆成一等结构

这是 `@shared/mutation` 当前最大的结构性缺口。

现在 `MutationPublishSpec` 只有一个 `Publish` 泛型，这会逼业务把这些东西混在一起：

- public publish
- internal cache
- previous doc workaround
- performance 临时数据

长期最优应该升级成：

```ts
interface MutationPublishSpec<Doc, Op, Key, Extra, Publish, Cache = void> {
  init(doc: Doc): {
    publish: Publish
    cache: Cache
  }
  reduce(input: {
    prev: {
      doc: Doc
      publish: Publish
      cache: Cache
    }
    doc: Doc
    write: Write<Doc, Op, Key, Extra>
  }): {
    publish: Publish
    cache: Cache
  }
}
```

然后 `MutationEngine` 内部状态应该是：

```ts
type State<Doc, Publish, Cache> = {
  rev: number
  doc: Doc
  publish?: Publish
  cache?: Cache
}
```

这里的关键不是名字，而是能力：

> kernel 原生支持 public publish 和 internal cache 分离。

### 2.3.1 建议的 TypeScript 接口草案

上面的结构如果要真正落地，shared mutation 的接口建议直接收敛成下面这组形态：

```ts
export interface MutationPrevSnapshot<Doc, Publish, Cache> {
  doc: Doc
  publish: Publish
  cache: Cache
}

export interface MutationPublishInitResult<Publish, Cache> {
  publish: Publish
  cache: Cache
}

export interface MutationPublishReduceInput<
  Doc,
  Op,
  Key,
  Extra,
  Publish,
  Cache
> {
  prev: MutationPrevSnapshot<Doc, Publish, Cache>
  doc: Doc
  write: Write<Doc, Op, Key, Extra>
}

export interface MutationPublishReduceResult<Publish, Cache> {
  publish: Publish
  cache: Cache
}

export interface MutationPublishSpec<
  Doc,
  Op,
  Key,
  Extra,
  Publish,
  Cache = void
> {
  init(doc: Doc): MutationPublishInitResult<Publish, Cache>
  reduce(
    input: MutationPublishReduceInput<Doc, Op, Key, Extra, Publish, Cache>
  ): MutationPublishReduceResult<Publish, Cache>
}

export interface MutationInternalState<Doc, Publish, Cache> {
  rev: number
  doc: Doc
  publish?: Publish
  cache?: Cache
}

export interface MutationCurrent<Doc, Publish> {
  rev: number
  doc: Doc
  publish?: Publish
}
```

这里有几个明确约束：

- `MutationPrevSnapshot` 是 reducer context，不是 write payload
- `MutationInternalState` 是 engine 内部状态，不是对外订阅协议
- `MutationCurrent` 继续只暴露 public state，不暴露 `cache`
- `init/reduce` 的返回值显式化，是为了避免业务层偷偷返回额外字段

如果以后要继续收紧，还可以进一步把 `Cache = void` 分成两条明确路线：

```ts
type MutationPublishSpecWithoutCache<Doc, Op, Key, Extra, Publish> = {
  init(doc: Doc): { publish: Publish }
  reduce(input: {
    prev: {
      doc: Doc
      publish: Publish
    }
    doc: Doc
    write: Write<Doc, Op, Key, Extra>
  }): {
    publish: Publish
  }
}
```

但从长期演进看，我更倾向先统一保留 `cache` 这个槽位，而不是过早分叉成两套 spec。原因是：

- kernel 只维护一套 publish lifecycle，更容易保持稳定
- 业务即使暂时不用 cache，也可以用 `void`
- Dataview、Whiteboard 这类 runtime-heavy 系统大概率迟早都会需要 internal cache

### 2.4 `current()` 只暴露 public state

如果 `cache` 进入 kernel 内部状态，那么 `current()` 应继续只暴露：

```ts
interface MutationCurrent<Doc, Publish> {
  rev: number
  doc: Doc
  publish?: Publish
}
```

不能把 cache 暴露给外部订阅者。

原则是：

```text
current = public runtime snapshot
cache = internal derivation state
```

### 2.5 规范 result helper

目前 helper 层还不完整：

- `applyResult.success(...)`
- `applyResult.failure(...)`
- 通用 `mutationFailure(...)`

这些都应该在 shared kernel 层完整提供。

长期最优目标是：

```ts
mutationResult.success(...)
mutationResult.failure(...)

applyResult.success(...)
applyResult.failure(...)
```

如果不想拆成两组，也至少要保证：

- failure helper 是公开的
- apply result helper 是完整的
- 业务层不再手写 `{ ok: false, error }`

### 2.6 区分 command runtime 和 operation runtime

当前 `MutationEngineSpec.compile?` 是 optional。

这会导致 kernel 一直带着两种模式：

- 有 compile 的 command engine
- 无 compile 的 operation engine

长期最优应该明确分层：

```text
CommandMutationEngine
  - execute
  - apply

OperationMutationRuntime
  - apply
```

或者至少在类型层明确：

- Dataview 使用的是 command engine
- 不再让 command engine 带 `compile.missing` 这类运行时分支

### 2.7 明确 replace/load 语义

shared mutation 还缺少一等的 document replace 语义定义。

长期最优需要 kernel 明确：

- replace 是否 emit write
- replace 是否 clear history
- replace 是否触发 reset publish
- replace 的 origin 如何映射 performance/collab

这里不一定非要改现有 `load()` 名字，但语义要在 kernel 层收口，不要散在业务层各自解释。

---

## 3. Dataview 的下一步优化

Dataview 的下一步优化应建立在上面的 shared mutation 升级之上。

如果 shared mutation 不升级，Dataview 只能继续把很多内部状态塞进 publish state。

### 3.1 拆掉 `DataviewPublishState`

当前 [dataview/packages/dataview-engine/src/mutation/types.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/mutation/types.ts:20) 的 `DataviewPublishState` 混合了：

- `doc`
- `plan`
- `index`
- `active`
- `delta`
- `performanceTrace`

这是典型的“public publish + internal cache + side effect payload”混合体。

长期最优应该拆成：

```ts
interface DataviewPublish {
  active?: ViewState
  delta?: DataviewDelta
}

interface DataviewMutationCache {
  plan?: ViewPlan
  index: IndexState
}
```

其中：

- `DataviewPublish` 是 `current().publish`
- `DataviewMutationCache` 只存在于 mutation runtime 内部

### 3.2 `performanceTrace` 退出 mutation state

`performanceTrace` 不应该是 publish state 的一部分。

它的正确位置是：

```text
publish.reduce side effect
  -> perf.recordCommit(trace)
```

而不是：

```text
mutation state
  -> current
  -> publish.performanceTrace
```

长期最优下：

- `performanceTrace` 从 `DataviewPublishState` 删除
- performance runtime 自己持有 trace 数据
- mutation current 不再带 performance 影子字段

### 3.3 `publish.ts` 收敛成纯 publish reducer

当前 [publish.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/mutation/publish.ts:110) 同时做了这些事：

- bootstrap active projector
- derive index
- resolve view plan
- run active projector
- project document delta
- 组装 public delta
- 记录 performance trace

长期最优下，它应该只负责两类事情：

1. derive next publish
2. update internal cache

更合理的内部结构是：

```text
publish.ts
  - createDataviewPublishSpec
  - init cache
  - reduce cache
  - reduce public publish

performance.ts
  - 从 reduce context 记录 trace
```

如果不拆文件，也至少要拆内部函数边界，不再让一个 reducer 承担所有流程。

### 3.4 `spec.ts` 只保留 mutation kernel 语义

当前 [spec.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/mutation/spec.ts:67) 仍然认识：

- `PerformanceRuntime`
- `createDataviewPublishSpec`

这说明它不是纯 mutation spec，而是 mutation + publish assembly。

长期最优下：

- `spec.ts` 只定义 `compile / apply / history policy`
- publish 接线从 `spec.ts` 拆出去

理想形态像：

```ts
createDataviewMutationKernel(...)
createDataviewPublishReducer(...)
createDataviewMutationEngine(...)
```

### 3.5 `delta.ts` 只保留 document delta

当前 [delta.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/mutation/delta.ts:186) 里同时有：

- `projectDocumentDelta`
- `projectActiveDelta`

长期最优下，这两个不应该待在同一层。

建议：

- `mutation/documentDelta.ts`
  - 只做 document delta projection
- `active/publish/activeDelta.ts`
  - 只做 active publish delta projection

因为：

- document delta 属于 mutation layer
- active delta 属于 active publish layer

### 3.6 `trace.ts` 移出 mutation 目录

[trace.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/mutation/trace.ts:15) 现在只服务 performance trace 摘要。

它不属于 mutation kernel 本身。

长期最优下应当：

- 移到 runtime/performance 相关目录
- 或合并进 performance runtime adapter

总之不应继续占着 `mutation/trace.ts` 这个位置。

### 3.7 `mutation/index.ts` 缩小出口

当前 [mutation/index.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/mutation/index.ts:1) export 了：

- `createDataviewMutationSpec`
- `createDataviewPublishSpec`
- `projectActiveDelta`
- `projectDocumentDelta`
- `DataviewPublishState`

长期最优下，对外暴露应该更小：

- kernel creator
- 必要类型

其余都应 internal。

尤其：

- `projectActiveDelta`
- `DataviewPublishState`

都不应该是 public mutation surface。

---

## 4. 建议的最终目录形态

长期最优下，我建议 Dataview 最终把这层整理成：

```text
mutation/
  kernel.ts
  publish.ts
  documentDelta.ts
  types.ts
```

其中：

- `kernel.ts`
  - compile
  - apply
  - history policy
- `publish.ts`
  - public publish reducer
  - internal cache reducer
- `documentDelta.ts`
  - document delta projection
- `types.ts`
  - `DataviewPublish`
  - `DataviewMutationCache`

而这些文件应该依赖 shared mutation 的新能力：

```text
prev snapshot
publish/cache split
result helpers
clear replace semantics
```

---

## 5. 建议的实施顺序

下一步最合理的顺序不是先改 Dataview，而是：

1. 先升级 `@shared/mutation`
2. 再收 Dataview mutation

顺序建议：

1. 在 `@shared/mutation` 里给 `publish.reduce` 增加 `prev` snapshot
2. 在 `@shared/mutation` 里引入 `publish + cache` 双状态模型
3. 在 `@shared/mutation` 里补齐 result helper
4. 在 `dataview-engine` 里拆 `DataviewPublishState`
5. 把 `performanceTrace` 从 mutation state 移出去
6. 把 `projectActiveDelta` 从 mutation 目录移走
7. 把 `spec.ts` 收成纯 kernel
8. 缩小 `mutation/index.ts` 出口

---

## 6. 最终判断

`dataview-engine/src/mutation` 还有明显简化空间，而且这个空间主要不是文件太多，而是抽象边界还没彻底收干净。

真正的长期最优方向是：

> 先让 `@shared/mutation` 原生支持 `prev snapshot + public publish + internal cache`，再让 Dataview 的 mutation 层回到“纯 kernel + 纯 publish + 纯 document delta”的三段结构。

如果只在 Dataview 本地继续 patch，而不升级 shared mutation，最终还是会重复长出：

- `doc` 混进 publish state
- `plan/index` 混进 public current
- performance trace 混进 mutation state
- active delta 和 document delta 混在同层

所以真正下一步的起点应当是 `@shared/mutation`，不是 Dataview 本地。*** End Patch

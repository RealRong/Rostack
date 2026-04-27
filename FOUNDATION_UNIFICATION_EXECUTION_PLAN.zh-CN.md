# FOUNDATION_UNIFICATION_PHASE6_7_FINAL_API_AND_EXECUTION_PLAN

## 1. 目标

这份文档只讨论：

- **Phase 6：统一 operation spec**
- **Phase 7：最终收口 engine 外形**

约束固定如下：

- 只接受长期最优
- 不保留兼容层
- 不保留双轨 API
- 不保留过渡命名
- 不为了“方便迁移”继续保留 facade / binding / adapter

这轮的最终目标只有两个：

1. `dataview` 与 `whiteboard` 都基于**同一种 operation spec 模型**
2. `engine` 对外只暴露**正式 runtime 能力 + 领域 API**

---

## 2. 固定前提

### 2.1 Doc 模型固定

`Doc` 永远满足：

- 外部传入即可直接持有
- engine 内部不需要 defensive clone
- normalize 是固定且可内建

### 2.2 Normalize 模型固定

normalize 不是调用方策略，而是 mutation runtime 的固定组成部分。

最终固定为：

```ts
type MutationRuntimeSpec<Doc, Op, Key, Publish, Cache, Extra> = {
  normalize(doc: Doc): Doc
  apply(input: {
    doc: Doc
    ops: readonly Op[]
    origin: Origin
  }): MutationApplyResult<Doc, Op, Key, Extra>
  publish?: MutationPublishSpec<Doc, Op, Key, Extra, Publish, Cache>
}
```

### 2.3 Public Engine 固定只暴露正式能力

最终 public engine 不再暴露这些中间层：

- `writes`
- `mutation`
- `HistoryBinding`
- `load`

- shared 底层内部
- collab / infra 内部
- 测试辅助内部

---

## 3. Phase 6 最终 API 设计

## 3.1 唯一 operation spec

两个领域最终都收敛为同一种单表模型：

```ts
type OperationSpecTable<
  Doc,
  Op extends { type: string },
  Key,
  ApplyCtx,
  FootprintCtx = ApplyCtx
> = {
  [K in Op['type']]: {
    family: string
    sync?: 'live' | 'checkpoint'
    history?: boolean
    footprint?(
      ctx: FootprintCtx,
      op: Extract<Op, { type: K }>
    ): void
    apply(
      ctx: ApplyCtx,
      op: Extract<Op, { type: K }>
    ): void
  }
}
```

这张表是唯一事实源。

并且：

- meta 从它派生
- reducer routing 从它派生
- footprint collect 从它派生
- history / collab live-checkpoint 分类从它派生

新增 operation 时，只允许改这一张表。

---

## 3.2 shared 层只保留最小 primitive

长期最优不是再补一组 shared 正式 helper。真正应该统一的是：

- **operation spec 模型**
- **reducer kernel**
- **mutation meta primitive**

### shared 正式提供的只有

- `Reducer`
- `meta`
- mutation / projection / history / collab 底层 runtime

### domain 允许直接内联 spec wiring

domain 可以直接写：

```ts
const OPERATION_SPEC = { ... }

const OPERATION_META = meta.create(
  mapSpecToMeta(OPERATION_SPEC)
)

const applyOperation = (ctx, op) => {
  OPERATION_SPEC[op.type].apply(ctx, op as never)
}

const collectFootprint = (ctx, op) => {
  OPERATION_SPEC[op.type].footprint?.(ctx, op as never)
}
```

这样仍然满足单表 spec 和唯一事实源，不需要额外 shared helper API。

### 唯一禁止项

虽然允许 domain 内联 wiring，但**不允许再维护第二张平行表**：

- 不允许一份 spec、一份 meta、一份 footprint registry 分别长期独立维护
- 不允许一份 spec 后面再跟一套 prefix routing

允许的只有一张 spec table，以及若干从这张表直接读取的薄 wiring。

---

## 3.3 shared 层最小职责

### `meta`

继续作为最小 primitive，负责表达：

```ts
type OpMeta = {
  family: string
  sync?: 'live' | 'checkpoint'
  history?: boolean
}
```

领域层可以从 spec 派生它，但不再手写第二份长期并存的 `META`。

### `Reducer`

继续作为唯一 reducer kernel，但退回成 mutation engine 内部 primitive，而不是由 domain 显式组装。

长期最优不是：

```ts
const WHITEBOARD_OPERATION_SPEC = createWhiteboardOperationSpec(...)

export const whiteboardReducer = createOperationReducer({
  spec: WHITEBOARD_OPERATION_SPEC,
  createContext,
  settle,
  done,
  validate
})
```

而是：

```ts
const WHITEBOARD_OPERATIONS = createWhiteboardOperationSpec(...)

export const createWhiteboardMutationSpec = (...) => ({
  normalize,
  compile,
  operations: WHITEBOARD_OPERATIONS,
  publish
})
```

也就是 operation spec 直接进入 mutation spec，由 mutation engine 内部完成 reducer 建立。

因此：

- `createOperationReducer(...)` 不应成为 shared 正式 API
- `whiteboardReducer` / `dataviewReducer` 这种 domain reducer 装配层也不应继续存在

---

## 3.4 Whiteboard 最终形态

whiteboard 当前分散在：

- operation meta
- history collect registry
- reducer prefix routing
- reducer handlers

长期最优必须收敛成：

```text
whiteboard operation spec table
  -> meta
  -> footprint
  -> reducer
```

也就是 whiteboard 不再保留：

- `META`
- `collect.operation(...)`
- `reduceNodeOperation(...)`
- `reduceEdgeOperation(...)`
- `handleWhiteboardOperation(...)`

这些概念全部退回成 operation spec table 内部实现细节。

whiteboard reducer 不再作为 domain public 组装层存在。

whiteboard 最终应变成：

```ts
const WHITEBOARD_OPERATIONS = createWhiteboardOperationSpec(...)

export const createWhiteboardMutationSpec = (...) => ({
  normalize,
  compile,
  operations: WHITEBOARD_OPERATIONS,
  publish
})
```

其中 `operations` 不是只有一张薄表，而是一整块 operation runtime spec：

```ts
type OperationRuntimeSpec<
  Doc,
  Op extends { type: string },
  Key,
  Ctx,
  Code extends string,
  Extra
> = {
  table: OperationSpecTable<Doc, Op, Key, Ctx>
  serializeKey(key: Key): string
  createContext(base: ReducerContext<Doc, Op, Key, Code>): Ctx
  validate?(input: {
    doc: Doc
    ops: readonly Op[]
    origin: Origin
  }): ReducerError<Code> | void
  settle?(ctx: Ctx): void
  done(ctx: Ctx): Extra
  conflicts?(left: Key, right: Key): boolean
}
```

这里的关键点只有一个：

- reducer lifecycle 级规则也作为 `operations` spec 的一部分直接进入 mutation engine

### Whiteboard 允许保留的领域差异

whiteboard 可以继续保留：

- batch 级 input validation
- lock validation
- domain reduce context
- done/settle 阶段的 mindmap flush

但这些都进入 `operations` spec，不再形成独立 reducer 装配层。

---

## 3.5 Dataview 最终形态

dataview 已经接近目标，最终要做的是收正：

- `DocumentOperationDefinitionTable` 直接升级为正式 `OperationSpecTable`
- `DATAVIEW_OPERATION_META` 从 spec 自动派生
- dataview mutation kernel 直接把 `operations` spec 交给 mutation engine
- 不再保留一个单独命名的 dataview reducer 组装层

可以保留 dataview 自己的 commit impact / trace 和 compile intents；但 operation 的 `family / sync / history / footprint / apply` 只允许在一张表里声明，并通过 `operations` spec` 直接进入 mutation engine。

---

## 3.6 Phase 6 完成标准

满足以下条件才算完成：

1. `dataview` 存在唯一 operation spec table
2. `whiteboard` 存在唯一 operation spec table
3. `meta` 从 spec 派生，不再手写第二份长期并存定义
4. `footprint collect` 直接从 spec 读取，不再维护平行 registry
5. `reducer routing` 直接从 spec 读取，不再保留 type prefix 路由
6. 新增 operation 时不再需要多处同步注册

---

## 4. Phase 7 最终 API 设计

## 4.1 目标不是再加一层 facade

Phase 7 的目标只有一个：

- **删掉中间层，让 public engine 只剩正式能力**

---

## 4.2 最终 mutation runtime public 形态

底层正式 runtime 固定为：

```ts
type MutationRuntime<
  Doc,
  Current,
  Result,
  Commit
> = {
  doc(): Doc
  current(): Current
  commits: Stream<Commit>
  history: HistoryPort<Result>
  execute(input, options?): Result
  apply(ops, options?): Result
  replace(doc, options?): boolean
}
```

不再包含：

- `writes`
- `mutation`
- `load`

这里：

- `load` 退回为 `replace(doc, { origin: 'load' })` 的语义糖，不再保留正式 public 入口
- `writes` 不是正式事实流，正式事实流只有 `commits`
- `mutation` 不能继续作为 public engine 的内部泄漏口

---

## 4.3 Dataview 最终 public engine

dataview 最终 public engine 只保留：

```ts
type DataviewEngine = {
  current(): DataviewCurrent
  doc(): DataDoc
  commits: EngineCommits
  history: DataviewHistory
  execute(input, options?): ExecuteResult
  apply(ops, options?): MutationResult
  replace(doc, options?): boolean

  fields: FieldsApi
  records: RecordsApi
  views: ViewsApi
  active: ActiveViewApi
  performance?: PerformanceApi
}
```

这里有两个关键点：

### 第一，保留领域 API

不把：

- `fields`
- `records`
- `views`
- `active`

收成抽象 `write/read`。

因为对 dataview 而言，这四个就是最清晰的领域 public 面。

### 第二，不额外公开通用 `projections` 容器

虽然底层已经统一 projection runtime，但长期最优不一定是：

```ts
engine.projections.active
```

dataview 更合理的 public 语义仍然是：

- `engine.current().publish?.active`
- `engine.active.*`

也就是 projection runtime 是 shared 底层，active publish snapshot 才是 dataview public 事实。

---

## 4.4 Whiteboard 最终 public engine

whiteboard engine 最终 public 面应只保留：

```ts
type WhiteboardEngine = {
  config: BoardConfig
  current(): EnginePublish
  doc(): Document
  commits: EngineCommits
  history: HistoryPort<IntentResult>
  execute(intent, options?): ExecuteResult
  apply(ops, options?): IntentResult
  replace(doc, options?): boolean
}
```

不再公开：

- `writes`
- `mutation`

whiteboard 的 projection / scene 不属于 engine public 面；engine 只做 mutation runtime，editor / scene 做领域 read-model runtime。

---

## 4.5 HistoryBinding 必须删除

`HistoryBinding` 不符合最终模型。长期最优是 `HistoryPort` 本身就是正式 public 形态，因此上层不再二次包装 history。

---

## 4.6 Projection 不再作为 public 通用术语上浮

这轮要避免一个错误方向：

- 因为 shared/projection 已经统一，所以 public engine 也要显式暴露 `projections`

最终原则固定为：

- `shared/projection` 是底层设施术语
- `dataview` / `whiteboard` 对外只暴露领域读面

所以 dataview 对外继续是 `active`，whiteboard 对外继续是 `scene`，不再额外发明 `engine.projections.*`。

---

## 4.7 Phase 7 完成标准

满足以下条件才算完成：

1. dataview public engine 不再暴露 `writes`
2. dataview public engine 不再暴露 `mutation`
3. dataview public engine 不再暴露 `load`
4. whiteboard public engine 不再暴露 `writes`
5. whiteboard public engine 不再暴露 `mutation`
6. shared/mutation 不再保留正式 `HistoryBinding`
7. dataview / whiteboard 上层 runtime 不再二次包装 history
8. public engine 只保留正式 runtime 能力 + 领域 API

---

## 5. 实施顺序

## Step 1：先固定 `shared/mutation` 的 `operations` 入口模型

第一步是把 mutation engine 的 `operations` 入口定稿，固定为：

- `table`
- `serializeKey`
- `createContext`
- `validate`
- `settle`
- `done`
- `conflicts`

目标：

- mutation engine 能直接吃 `operations`
- reducer 创建退回 mutation engine 内部
- domain 不再显式创建 reducer

这是整个 Phase 6 的起点。

---

## Step 2：先迁 dataview 到 `operations` 直连模型

先迁 dataview，因为它离最终形态最近，风险最低：

- `DocumentOperationDefinitionTable` 升级为正式单表 spec
- `meta` 从 spec 派生
- dataview mutation kernel 直接把 `operations` 交给 mutation engine
- 不再保留 dataview reducer 装配层

这一步用来验证 `shared/mutation` 的新 `operations` 入口是否合理。

---

## Step 3：再迁 whiteboard 到 `operations` 直连模型

whiteboard 是这一轮主体，要把这些东西全部收回：

- `META`
- `collectWhiteboardHistory`
- `handleWhiteboardOperation`
- `reduceNodeOperation`
- `reduceEdgeOperation`
- `reduceGroupOperation`
- `reduceMindmapOperation`

最终统一进入一个 `operations` spec。

允许保留：

- batch validate
- lock validate
- domain context
- settle/done

但这些都作为 `operations` runtime spec 的组成部分直接进入 mutation engine，不再形成独立 reducer 装配层。

---

## Step 4：删除 `HistoryBinding` 和上层重复 history 包装

这一步属于 Phase 7 的前置清理：

- 删除 `createHistoryBinding`
- 删除 `HistoryBinding`
- dataview runtime 直接吃 `HistoryPort`
- whiteboard runtime / react 直接吃 `HistoryPort`

只要 `HistoryBinding` 还存在，public engine 外形就不可能真正收干净。

---

## Step 5：最后统一 public engine 外形

最后统一 dataview / whiteboard 的 public engine surface。

### dataview

- 删除 `writes`
- 删除 `mutation`
- 删除 `load`
- 保留 `fields / records / views / active`

### whiteboard

- 删除 `writes`
- 删除 `mutation`
- engine 只保留 mutation runtime 正式能力
- `scene / editor` 继续留在领域 runtime

这一步不是再加 facade，而是删掉所有中间态 public 面。

---

## 6. 不要做的事

### 6.1 不要把 `load` 保留成正式 public API

最终只有：

- `replace(doc, { origin: 'load' })`

没有第二条 public 路径。

### 6.2 不要把 `writes` 继续留在 public engine

正式事实流已经是：

- `commits`

`writes` 不是正式 public 面。

### 6.3 不要因为 projection 统一了，就公开 `engine.projections`

这是把 shared 术语泄漏到领域层，不是长期最优。

### 6.4 不要继续保留 HistoryBinding

这会让 Phase 7 永远收不干净。

---

## 7. 最终验收标准

当下面条件都成立时，Phase 6 / 7 才算真正完成：

1. `dataview` 有唯一 operation spec table
2. `whiteboard` 有唯一 operation spec table
3. meta / footprint / reducer routing 全部从 operation spec 派生
4. `Doc` 语义固定为：
   - 外部传入即可直接持有
   - engine 内部不 defensive clone
   - normalize 固定且内建
5. dataview public engine 不再暴露 `writes` / `mutation` / `load`
6. whiteboard public engine 不再暴露 `writes` / `mutation`
7. shared/mutation 不再保留 `HistoryBinding`
8. 上层只保留领域 API，不再保留底层设施适配层

最终理想状态应是：

```text
shared/*
  只负责底层设施

dataview/*
  只负责 dataview 领域语义

whiteboard/*
  只负责 whiteboard 领域语义
```

这才是 Phase 6 / 7 的长期最优终态。

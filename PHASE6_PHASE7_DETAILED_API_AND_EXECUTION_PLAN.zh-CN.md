# PHASE6_PHASE7_FINAL_API_AND_EXECUTION_PLAN

## 1. 最终目标

- `meta` 不再单独存在，直接并入 operation spec
- dataview / whiteboard 只保留各自领域逻辑
- reducer / history / collab 分类 / operation routing 全部统一下沉
- engine 只暴露正式 runtime 能力与领域 API

---

## 2. Phase 6 最终 API 设计

### 2.1 唯一事实源：plain-object operation spec

```ts
type OperationSpecTable<
  Op extends { type: string },
  Ctx,
  Key
> = {
  [K in Op['type']]: {
    family: string
    sync?: 'live' | 'checkpoint'
    history?: boolean
    footprint?: (ctx: Ctx, op: Extract<Op, { type: K }>) => void
    validate?: (ctx: Ctx, op: Extract<Op, { type: K }>) => void
    apply: (ctx: Ctx, op: Extract<Op, { type: K }>) => void
  }
}
```

最终不再保留独立：

- `META`
- `OPERATION_META`
- operation handler registry
- history collect registry
- collab sync 分类表

这些都直接从：

```ts
OPERATION_SPEC[op.type]
```

读取。

---

### 2.2 shared 最终只保留的能力

`shared/*` 最终只需要：

- `OperationSpecTable` 类型
- reducer kernel
- mutation runtime
- projection runtime
- delta primitives

shared 不再正式提供一组围绕 spec 的 helper/builder。

最多允许保留一个高层接线器：

```ts
createOperationMutationSpec({
  operations,
  createContext,
  serializeKey,
  conflicts,
  compile,
  normalize,
  publish,
  validateBatch?
})
```

它的职责只有一个：

- 把 plain-object `operations` 接到 shared reducer / mutation / history / collab 设施上

shared 不再正式提供：

- `createOperationSpecTable`
- `createOperationMeta`
- `createOperationHandler`
- `collectOperationFootprint`

---

### 2.3 reducer 最终执行模型

最终 reducer / history / collab 都直接读 spec：

```ts
const entry = OPERATION_SPEC[op.type]
entry.validate?.(ctx, op)
entry.footprint?.(ctx, op)
entry.apply(ctx, op)
```

因此最终不再手写：

- reducer routing switch
- prefix dispatch
- 独立 footprint dispatch
- 独立 meta 派生层

---

### 2.4 dataview 最终形态

dataview 最终只保留：

```ts
export const DATAVIEW_OPERATION_SPEC = {
  ...
} satisfies OperationSpecTable<
  DocumentOperation,
  DocumentMutationContext,
  DataviewMutationKey
>
```

然后：

- reducer/apply 直接读 `DATAVIEW_OPERATION_SPEC[op.type]`
- history track/clear 直接读 `DATAVIEW_OPERATION_SPEC[op.type]`
- collab live/checkpoint 直接读 `DATAVIEW_OPERATION_SPEC[op.type]`

dataview 还保留的领域层：

- compile
- publish / projection
- `fields / records / views / active`

---

### 2.5 whiteboard 最终形态

whiteboard 最终只保留：

```ts
export const WHITEBOARD_OPERATION_SPEC = {
  ...
} satisfies OperationSpecTable<
  Operation,
  WhiteboardReduceCtx,
  HistoryKey
>
```

然后：

- reducer/apply 直接读 `WHITEBOARD_OPERATION_SPEC[op.type]`
- history collect 直接读 `WHITEBOARD_OPERATION_SPEC[op.type]`
- collab live/checkpoint 直接读 `WHITEBOARD_OPERATION_SPEC[op.type]`

whiteboard 还保留的领域层：

- compile
- publish / projection
- scene / editor 领域逻辑
- context 与 internal primitives

whiteboard 必删：

- 手写 `META`
- history collect registry
- reducer prefix routing
- `reduceNodeOperation / reduceEdgeOperation / ...` 作为分发表

internal primitives 可以保留，但只能作为 `spec.apply(...)` 的底层实现。

---

## 3. Phase 6 实施方案

### Step 1

在 shared 固定最终 spec 类型：

- `OperationSpecTable`

并提供最多一个高层接线器：

- `createOperationMutationSpec(...)`

### Step 2

先迁 dataview：

- 把当前 operation definition 收成唯一 `DATAVIEW_OPERATION_SPEC`
- 删除围绕它的重复 meta / handler / footprint 中转

### Step 3

再迁 whiteboard：

- 把 `META + history collect + reducer routing + handlers` 收成唯一 `WHITEBOARD_OPERATION_SPEC`

### Step 4

删掉旧入口：

- whiteboard `META`
- whiteboard collect registry
- whiteboard routing handlers
- dataview definitions 命名和重复派生层

---

## 4. Phase 7 最终 API 设计

### 4.1 shared 最终 public 面

删除：

- `HistoryBinding`
- `createHistoryBinding`

保留：

- `HistoryPort`

上层直接使用 `HistoryPort`，不再包 binding。

---

### 4.2 dataview engine 最终 public API

```ts
type DataviewEngine = {
  commits: CommitStream<DataviewCommit>
  history: HistoryPort<DataviewResult>
  current(): DataviewCurrent
  subscribe(listener): () => void
  doc(): DataDoc
  execute(intent | intent[], options?): Result
  apply(ops, options?): Result
  replace(doc, options?): boolean

  fields: FieldsApi
  records: RecordsApi
  views: ViewsApi
  active: ActiveViewApi
  performance?: PerformanceApi
}
```

删除：

- `writes`
- `mutation`
- `load`

---

### 4.3 whiteboard engine 最终 public API

```ts
type WhiteboardEngine = {
  config: BoardConfig
  commits: CommitStream<EngineCommit>
  history: HistoryPort<IntentResult>
  current(): EnginePublish
  subscribe(listener): () => void
  doc(): Document
  execute(intent, options?): ExecuteResult
  apply(ops, options?): IntentResult
  replace(doc, options?): boolean
}
```

删除：

- `writes`
- `mutation`

---

### 4.4 projection 的最终 public 原则

不建议把这个做成 domain engine 顶层 public：

```ts
projections: {
  [name: string]: ProjectionPort<any, any>
}
```

最终原则是：

- `shared/projection` 统一 runtime
- domain engine 继续暴露领域读面

即：

#### dataview

- `fields / records / views / active`
- `current().publish.active`

#### whiteboard

- `scene.query`
- `scene.stores`
- `session.*`

不再额外新增通用 projection 容器 public 面。

---

## 5. Phase 7 实施方案

### Step 1

删除 shared public：

- `HistoryBinding`
- `createHistoryBinding`

### Step 2

删除 dataview / whiteboard public engine：

- `writes`
- `mutation`

### Step 3

删除 dataview public：

- `load(document)`

只保留：

- `replace(document, options?)`

### Step 4

让 dataview runtime / whiteboard runtime 直接消费正式口：

- `engine.history`
- `engine.commits`

不再构造 history binding。

---

## 6. 完成标准

### Phase 6 完成标准

1. dataview 和 whiteboard 都有唯一 plain-object operation spec
2. `family / sync / history` 都直接从 spec 读取
3. reducer / history / collab 都直接消费 spec
4. 新增 operation 不再需要多处注册

### Phase 7 完成标准

1. `HistoryBinding` 从 shared public API 消失
2. dataview / whiteboard public engine 不再暴露 `writes`
3. dataview / whiteboard public engine 不再暴露 `mutation`
4. dataview public engine 不再暴露 `load`
5. 上层 runtime 直接消费正式 runtime 能力
6. public 层最终只保留领域 API

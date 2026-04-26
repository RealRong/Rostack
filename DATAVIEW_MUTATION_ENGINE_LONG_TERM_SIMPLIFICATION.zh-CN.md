# Dataview Engine API 设计与实施方案

## 1. 目标

本文只讨论两件事：

1. `execute` 和 `executeMany` 如何收敛成一个 API。
2. `createEngine` 里的 facade 组装如何简化成 `createFieldsApi(engine)` 这种形式。

口径是不兼容、长期最优，不做过渡设计。

本文不主张删除：

- `engine.apply(operations)`
- `engine.load(document)`
- `engine.fields.*`
- `engine.records.*`
- `engine.views.*`
- `engine.active.*`

长期最优不是把 Dataview Engine 压成一个极小内核，而是让它的 public API 更整齐，组装方式更像 mutation engine。

---

## 2. 最终 API

最终 `Engine` 应该是这个形态：

```ts
interface Engine {
  readonly writes: EngineWrites
  readonly history?: DataviewHistory
  readonly performance: PerformanceApi

  readonly fields: FieldsApi
  readonly records: RecordsApi
  readonly views: ViewsApi
  readonly active: ActiveViewApi

  current(): DataviewCurrent
  subscribe(listener: (current: DataviewCurrent) => void): () => void

  doc(): DataDoc
  load(document: DataDoc): void

  execute<I extends Intent | readonly Intent[]>(
    input: I,
    options?: MutationOptions
  ): ExecuteResultOf<I>

  apply(
    operations: readonly DocumentOperation[],
    options?: MutationOptions
  ): MutationResult<void, EngineWrite, DataviewErrorCode>
}
```

关键点只有两个：

- `executeMany` 删除。
- `execute` 直接接受 `Intent | readonly Intent[]`。

也就是说：

```ts
engine.execute(intent)
engine.execute([intentA, intentB])
```

替代：

```ts
engine.execute(intent)
engine.executeMany([intentA, intentB])
```

---

## 3. 为什么 `apply` 和 `load` 保留

### 3.1 `apply(operations)`

`apply` 不是业务 facade 入口，它是 system entry。

它服务于：

- history undo / redo
- collab remote apply
- 外部 operation 导入
- tests / bench

所以长期最优不是删除 `apply`，而是明确层级：

```text
execute = intent entry
apply = operation entry
```

### 3.2 `load(document)`

`load` 是 document lifecycle entry。

它表达的是：

```text
替换整份 document
重建 publish
清理 history
通知订阅者
```

这个语义本身是清晰的，不需要强行塞进 `execute`。

长期最优要做的是明确规则，而不是删除它：

- `load` 是否发 write
- `load` 是否清 history
- `load` 是否产出 reset delta

---

## 4. 为什么 `fields / records / views / active` 保留

这四组顶级入口是合理的 domain facade：

```ts
engine.fields.create(...)
engine.records.create(...)
engine.views.open(...)
engine.active.items.move(...)
```

它们的问题不在于存在，而在于当前组装方式太散。

长期最优不需要把它们改成 `write/read`，也不需要把它们并回一个超大 API。

真正应该做的是：

- 保留这四组 facade。
- 所有 facade 都直接依赖 `engine`。
- facade 内部统一调用 `engine.execute(...)`。
- facade 不再感知 `executeMany`。

也就是说，目标是：

```ts
createFieldsApi(engine)
createRecordsApi(engine)
createViewsApi(engine)
createActiveViewApi(engine)
```

而不是：

```ts
createFieldsApi({ document, execute })
createRecordsApi({ document, execute })
createViewsApi({ document, execute })
createActiveViewApi({ document, active, execute, executeMany })
```

---

## 5. `execute` 合并方案

### 5.1 API

最终只保留一个业务写入口：

```ts
engine.execute(intentOrIntents, options?)
```

支持两种输入：

```ts
engine.execute({
  type: 'record.create',
  input: {
    values
  }
})

engine.execute([
  {
    type: 'field.create',
    input: {
      id: fieldId,
      name,
      kind
    }
  },
  {
    type: 'view.patch',
    id: viewId,
    patch
  }
])
```

### 5.2 Engine 内部语义

内部不再区分 execute / executeMany 两套逻辑，而是统一成：

```text
normalize to intents[]
compile intents
apply operations
publish current
emit write
shape result
```

也就是说，`executeMany` 删除后，批量 transaction 能力仍然保留，只是入口统一了。

### 5.3 返回类型

建议保留类型精度：

```ts
type ExecuteResultOf<I> =
  I extends readonly Intent[]
    ? MutationResult<readonly IntentData[], EngineWrite, DataviewErrorCode>
    : I extends Intent
      ? ExecuteResult<I['type']>
      : never
```

这样：

- 单 intent 仍然拿到精确 output。
- 多 intent 返回 output array。
- 不再需要单独 `BatchExecuteResult` 这个名字。

### 5.4 空数组

`engine.execute([])` 应该直接失败。

理由很简单：

- 空 transaction 没有业务意义。
- 不应该产生 write。
- 不应该进入 publish。

---

## 6. `createXXXApi(engine)` 方案

### 6.1 目标

`createEngine` 不再手工拆依赖后再逐个注入，而是直接把 engine 自身传给 facade factory：

```ts
const fields = createFieldsApi(engine)
const records = createRecordsApi(engine)
const views = createViewsApi(engine)
const active = createActiveViewApi(engine)
```

这才是更自然的 mutation-engine 组装方式。

### 6.2 facade 允许读取什么

Facade 直接吃 `engine`，只读 public surface：

```ts
engine.current()
engine.doc()
engine.execute(...)
engine.apply(...)
engine.load(...)
engine.history
```

通常实际只需要：

```ts
engine.doc()
engine.current()
engine.execute(...)
```

### 6.3 active facade 的特殊点

`active` 现在比其他 facade 多拿一个 `active` getter，本质原因是它既需要 document，也需要 active publish state。

如果直接吃 engine，这个问题自然消失：

```ts
const state = engine.current().publish?.active
const document = engine.current().doc
```

也就是说，`active` 不需要再被特殊注入：

```ts
createActiveViewApi(engine)
```

就够了。

### 6.4 facade 的职责边界

Facade 可以做上层编排，但不能下沉到 engine compiler。

例如：

```ts
engine.active.display.insertField(...)
```

内部可以这样做：

```ts
engine.execute([
  fieldCreateIntent,
  viewPatchIntent
])
```

这属于 facade orchestration，是合理的。

但不要为了替代 batch execute，再把它下沉成：

```ts
engine.execute({
  type: 'active.insertField',
  ...
})
```

因为那样会把上层 active 语义塞进底层 engine。

---

## 7. `createEngine` 的最终写法

最终 `createEngine` 应该分两步：

1. 先创建没有 facade 的 base engine。
2. 再把 facade 挂回这个 engine。

形态类似：

```ts
export const createEngine = (options: CreateEngineOptions): Engine => {
  const performance = createPerformanceRuntime(options.performance)
  const mutationEngine = new MutationEngine({
    doc: options.document,
    spec: createDataviewMutationSpec({
      history: options.history,
      performance
    })
  })

  const engine = {
    writes: mutationEngine.writes,
    history: mutationEngine.history,
    performance: performance.api,

    current: () => toCurrent(mutationEngine.current()),
    subscribe: (listener) => mutationEngine.subscribe((current) => {
      listener(toCurrent(current))
    }),
    doc: () => mutationEngine.doc(),
    load: (nextDocument: DataDoc) => {
      mutationEngine.load(document.clone(nextDocument))
    },
    execute: ((input, executeOptions) => (
      mutationEngine.execute(input, executeOptions)
    )) as Engine['execute'],
    apply: ((operations, applyOptions) => (
      mutationEngine.apply(operations, applyOptions)
    )) as Engine['apply']
  } as Omit<Engine, 'fields' | 'records' | 'views' | 'active'>

  return {
    ...engine,
    fields: createFieldsApi(engine),
    records: createRecordsApi(engine),
    views: createViewsApi(engine),
    active: createActiveViewApi(engine)
  }
}
```

这里的重点不是语法细节，而是结构：

- `createEngine` 只维护一份 engine public surface。
- 所有 facade 直接吃同一个 engine。
- 不再传散装 getter/executor。
- facade 依赖结构自动统一。

---

## 8. 配套类型调整

为了支持 `createXXXApi(engine)`，需要补一个稳定的 facade 输入类型。

建议定义：

```ts
export interface EngineFacadeHost {
  current(): DataviewCurrent
  subscribe(listener: (current: DataviewCurrent) => void): () => void
  doc(): DataDoc
  load(document: DataDoc): void
  execute<I extends Intent | readonly Intent[]>(
    input: I,
    options?: MutationOptions
  ): ExecuteResultOf<I>
  apply(
    operations: readonly DocumentOperation[],
    options?: MutationOptions
  ): MutationResult<void, EngineWrite, DataviewErrorCode>
}
```

然后：

```ts
createFieldsApi(engine: EngineFacadeHost)
createRecordsApi(engine: EngineFacadeHost)
createViewsApi(engine: EngineFacadeHost)
createActiveViewApi(engine: EngineFacadeHost)
```

这样 facade 不依赖完整 `Engine` 的递归定义，也不会引入 circular type pressure。

---

## 9. 实施方案

### 9.1 第一步：合并 execute

修改 MutationEngine：

- 删除 `executeMany` 方法。
- `execute` 改成接受 `intent | intents`。
- 内部统一归一化成 `intents[]`。
- 删除 `EXECUTE_MANY_EMPTY_CODE`。
- 删除 `MutationBatchData`、`BatchValue`、`readBatchData`。

### 9.2 第二步：修改 Engine 类型

修改 Dataview Engine contracts：

- 删除 `BatchExecuteResult` 暴露。
- `execute` 改成支持 `Intent | readonly Intent[]`。
- `apply/load/doc/current/subscribe` 保持不变。

### 9.3 第三步：改 createXXXApi 签名

把这些工厂函数改成直接吃 engine：

- `createFieldsApi(engine)`
- `createRecordsApi(engine)`
- `createViewsApi(engine)`
- `createActiveViewApi(engine)`

同时删除：

- `ActiveContextOptions`
- facade 各自散装依赖对象
- `executeMany` 相关注入

### 9.4 第四步：改 active facade 内部调用

把所有：

```ts
base.executeMany(intents)
```

改成：

```ts
engine.execute(intents)
```

把所有：

```ts
document()
active()
```

改成从：

```ts
engine.current()
engine.doc()
```

读取。

### 9.5 第五步：瘦身 createEngine

最终删掉这类 wiring：

```ts
const readDocument = ...
const readActiveState = ...
createXxxApi({ ... })
```

只保留：

```ts
const engine = ...
return {
  ...engine,
  fields: createFieldsApi(engine),
  records: createRecordsApi(engine),
  views: createViewsApi(engine),
  active: createActiveViewApi(engine)
}
```

---

## 10. 最终判断

长期最优的方向不是删掉 `apply/load/domain facade`，也不是把 active 编排塞进 engine compiler。

真正该做的是两件事：

1. `execute` 合并 `executeMany`，统一成 `execute(intent | intents)`。
2. `createEngine` 从“手工传 getter 和 executor”改成“facade 直接吃 engine”。

一句话：

> Dataview Engine 的长期最优 API，是保留 `fields / records / views / active / apply / load` 这些合理分层，同时把业务 mutation 入口统一成 `execute(intent | intents)`，并把 facade 组装收敛成 `createXXXApi(engine)`。

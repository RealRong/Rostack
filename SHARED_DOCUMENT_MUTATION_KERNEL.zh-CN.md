# Shared Document Mutation Kernel 设计

## 背景

Dataview 与 Whiteboard 的领域模型不同，但它们在 **apply operation** 这件事上的执行骨架已经非常接近：

- 输入：`document + operation[]`
- 中间：创建一次 mutation session / tx
- 逐条 dispatch operation
- 累积 inverse / impact / history / dirty / reconcile task
- 最后产出新的 `document` 与领域侧副产物

当前两边已经共用了部分底层原语：

- `shared/core/src/mutationContext.ts`
- `shared/core/src/mutationTx.ts`
- `shared/core/src/operationBuffer.ts`
- `shared/core/src/historyFootprint.ts`

但还没有把“**批量 apply operation 的流程控制骨架**”统一起来。

结果是：

- Dataview 维护自己的 `DocumentMutationContext + reduceOperations`
- Whiteboard 维护自己的 `ReducerTx + reduceOperations + reconcile + finalize`
- 两边都在做一类事情，但 orchestration 仍然分散在领域包里

这份文档的目标是定义一个长期可落地的 shared 方案：  
**不是统一领域 reducer API，而是统一 document mutation kernel。**

## 结论

可以共用同一套底层设施，但共用的边界必须非常克制：

- **应共用**
  - mutation 生命周期
  - operation apply loop
  - short-circuit / reconcile / finalize orchestration
  - inverse / history / issue / trace / task queue 等 collector primitive

- **不应共用**
  - operation union 类型
  - 领域 tx API
  - impact / invalidation / history key 规则
  - reducer handler 结构

换句话说，长期最优不是：

```ts
applyOperation(document, operation)
```

而是：

```ts
runDocumentMutation({
  document,
  operations,
  spec
})
```

其中 `spec` 由 Dataview / Whiteboard 各自提供。

## 目标

### 1. 统一 apply loop

共享以下通用流程：

1. 创建 runtime
2. 创建 tx facade
3. 逐条执行 operation
4. 支持 pre-dispatch / post-dispatch hook
5. 支持 short-circuit
6. 支持 reconcile / post-pass
7. 统一 finalize

### 2. 保留领域 facade

Dataview 继续保留：

- `DocumentMutationContext`
- `reduceOperation(context, operation)`

Whiteboard 继续保留：

- `ReducerTx`
- `dispatchOperation(tx, operation)`

shared kernel 不直接暴露 record/node/edge/view 等领域 API。

### 3. 兼容不同 document mutation 风格

shared kernel 不假设 document mutation 一定是：

- immutable current replace

也不假设一定是：

- mutable draft overlay

它只要求领域包自己管理：

- `current` 是什么
- `working` 是什么
- `finish()` 如何把 session 变成结果

### 4. 不引入兼容层包袱

这是长期最优设计，不考虑保留旧入口。

## 非目标

### 1. 不统一 operation 协议

Dataview 与 Whiteboard 的 `Operation` union 没必要对齐。

### 2. 不统一领域副产物

例如：

- Dataview `CommitImpact`
- Whiteboard `KernelReadImpact`

它们都应该继续留在领域层。

### 3. 不统一历史规则

shared 只负责：

- collector
- conflict scan skeleton

不负责：

- 什么 key 应该被收集
- 什么 key 之间算冲突

### 4. 不处理 overlay 抽象

overlay / mutable draft 只是 runtime 内部实现细节，不属于 mutation kernel 本身。

## 当前两边的真实映射

## Dataview

当前 Dataview 的结构本质上已经是：

```ts
const context = createDocumentMutationContext(document)

for (const operation of operations) {
  reduceOperation(context, operation)
}

return context.finish()
```

也就是：

- runtime = `DocumentMutationContext`
- tx facade = `DocumentMutationContext`
- dispatch = `reduceOperation(context, operation)`
- reconcile = 无
- finalize = `context.finish()`

这说明 Dataview 已经非常接近 shared kernel consumer。

## Whiteboard

当前 Whiteboard 的结构本质上是：

```ts
const tx = createReducerTx(document)

for (const operation of operations) {
  collectHistory(tx, operation)
  dispatchOperation(tx, operation)
  if (tx._runtime.shortCircuit) {
    return tx.commit.result()
  }
}

const reconciled = tx.reconcile.run()
if (!reconciled.ok) {
  return reconciled
}

return tx.commit.result()
```

也就是：

- runtime = `ReduceRuntime`
- tx facade = `ReducerTx`
- pre-dispatch = history collect
- dispatch = `dispatchOperation(tx, operation)`
- short-circuit = `tx._runtime.shortCircuit`
- reconcile = `tx.reconcile.run()`
- finalize = `tx.commit.result()`

这说明 Whiteboard 不是不同范式，只是比 Dataview 多了几个 orchestration hook。

## 设计总览

建议在 `shared/core` 新增一层：

```ts
shared/core/src/documentMutationKernel.ts
```

职责只有一个：  
**把一次 document mutation 的流程控制抽象出来。**

## 核心接口

```ts
interface DocumentMutationKernelSpec<
  TDocument,
  TOperation,
  TRuntime,
  TTx,
  TResult
> {
  createRuntime(document: TDocument): TRuntime
  createTx(runtime: TRuntime): TTx

  beforeEach?(tx: TTx, operation: TOperation): TResult | void
  dispatch(tx: TTx, operation: TOperation): TResult | void
  afterEach?(tx: TTx, operation: TOperation): TResult | void

  shortCircuit?(tx: TTx): TResult | undefined
  reconcile?(tx: TTx): TResult | void
  finalize(tx: TTx): TResult
}
```

对应 runner：

```ts
runDocumentMutation({
  document,
  operations,
  spec
}): TResult
```

## 设计原则

### 1. `dispatch` 是唯一必选领域逻辑

shared kernel 不理解任何 operation，只负责调用 `dispatch`。

### 2. hook 只负责流程，不负责语义

`beforeEach / afterEach / shortCircuit / reconcile` 都是 orchestration hook，不表达领域规则。

### 3. `finalize` 是唯一结果出口

不管 runtime 是：

- immutable current
- mutable draft
- overlay draft

都只在 `finalize` 决定如何产出结果。

### 4. kernel 不假设 batch 一定成功

`beforeEach / dispatch / afterEach / reconcile` 都可以提前返回 `TResult`，用于：

- validation failure
- lock failure
- budget exceeded
- cycle detected

## 参考实现骨架

```ts
export const runDocumentMutation = <
  TDocument,
  TOperation,
  TRuntime,
  TTx,
  TResult
>(input: {
  document: TDocument
  operations: readonly TOperation[]
  spec: DocumentMutationKernelSpec<
    TDocument,
    TOperation,
    TRuntime,
    TTx,
    TResult
  >
}): TResult => {
  const runtime = input.spec.createRuntime(input.document)
  const tx = input.spec.createTx(runtime)

  for (let index = 0; index < input.operations.length; index += 1) {
    const operation = input.operations[index]!

    const before = input.spec.beforeEach?.(tx, operation)
    if (before !== undefined) {
      return before
    }

    const dispatched = input.spec.dispatch(tx, operation)
    if (dispatched !== undefined) {
      return dispatched
    }

    const after = input.spec.afterEach?.(tx, operation)
    if (after !== undefined) {
      return after
    }

    const short = input.spec.shortCircuit?.(tx)
    if (short !== undefined) {
      return short
    }
  }

  const reconciled = input.spec.reconcile?.(tx)
  if (reconciled !== undefined) {
    return reconciled
  }

  return input.spec.finalize(tx)
}
```

这个实现故意很薄。

shared kernel 不应该变成第二个领域框架。

## Dataview 接入方式

Dataview 不需要改自己的 reducer 结构，只需要把 orchestration 提上来：

```ts
runDocumentMutation({
  document,
  operations,
  spec: {
    createRuntime: createDocumentMutationContext,
    createTx: (context) => context,
    dispatch: reduceOperation,
    finalize: (context) => context.finish()
  }
})
```

Dataview 后续仍然可以保留：

- `reduceOperation(context, operation)`
- `reduceOperations(context, operations)`

只是最终会多一个 shared runner 版本来承载 batch apply。

## Whiteboard 接入方式

Whiteboard 也不需要改 handler API，只需要把现在 `reduce/index.ts` 的流程搬进 shared spec：

```ts
runDocumentMutation({
  document,
  operations,
  spec: {
    createRuntime: createReduceRuntime,
    createTx: createReducerTxFromRuntime,
    beforeEach: collectHistoryForOperation,
    dispatch: dispatchOperation,
    shortCircuit: (tx) => tx._runtime.shortCircuit,
    reconcile: (tx) => {
      const result = tx.reconcile.run()
      return result.ok ? undefined : result
    },
    finalize: (tx) => tx.commit.result()
  }
})
```

注意：

- lock validation 仍然应该放在 kernel 外围，因为那是领域 preflight policy，不是 mutation session 生命周期的一部分。

## 为什么不直接统一成一个共享 Tx API

因为 Dataview 与 Whiteboard 的领域写入口本质不同：

- Dataview 更偏 document immutable reducer
- Whiteboard 更偏 reducer tx + draft mutation

如果强行统一成一个 shared `DocumentTx`，最终只会得到两种坏结果之一：

1. shared `DocumentTx` 过于抽象，所有领域代码都要绕一层适配
2. shared `DocumentTx` 被 whiteboard/dataview 某一边的形状污染，另一边被迫迁就

长期最优不是统一 facade，而是统一 kernel。

## 为什么这个设计比只保留 `mutationContext` 更进一步

`mutationContext` 只解决：

- current
- working
- inverse

但它不解决：

- apply loop
- pre-dispatch hook
- short-circuit
- reconcile
- finalize orchestration

这些流程控制恰好就是两边还在重复写的部分。

所以 `documentMutationKernel` 是比 `mutationContext` 高半层的 shared 原语，而不是替代它。

关系应该是：

```text
mutationContext / mutationTx
  -> 构建单次 mutation session

documentMutationKernel
  -> 驱动一次 operation batch 执行
```

## 长期落地顺序

### Phase A：只写 shared kernel

新增：

- `shared/core/src/documentMutationKernel.ts`

只提供最薄的流程控制，不动 Dataview / Whiteboard 外观。

### Phase B：接 Dataview

让 Dataview 的 batch apply 走 shared kernel，但保留：

- `DocumentMutationContext`
- `reduceOperation`

### Phase C：接 Whiteboard

让 Whiteboard 的 `reduceOperations` 改走 shared kernel，但保留：

- `ReducerTx`
- `dispatchOperation`

### Phase D：收掉重复 orchestration

当两边都接入后，可以删除各自包里重复的：

- batch loop
- short-circuit glue
- reconcile glue
- finalize glue

## 风险与边界

### 1. 不要把 validation policy 塞进 kernel

例如 Whiteboard lock validation，应保持在 runner 外围。

### 2. 不要把 impact / history / dirty 泛化进 kernel

kernel 不理解这些 collector，只负责提供时机。

### 3. 不要把 overlay / draft storage 绑进 kernel

这是 runtime 实现细节，不是 orchestration 问题。

### 4. 不要提前做 metrics collector 合流

如果未来想统计：

- operation count
- dispatch duration
- reconcile duration

也应该在 kernel 上加 hook，而不是现在就引入第二层重型抽象。

## 补充：推荐的 operation 协议收敛方向

前面的 kernel 设计**不要求** Dataview 与 Whiteboard 统一 operation union。

但如果从长期最优出发，希望两边的 mutation primitive 也逐步收敛，那么推荐的方向不是“所有 operation 全部 path 化”，而是更克制的三层模型。

### 结论

- **可以更多地采用 path-based mutation**
- **但不应该把所有 operation 都退化成通用 `path.set / path.unset`**
- 最优形态是：
  1. 结构性变更保留 typed operation
  2. 有限顶层字段保留 `field.set / field.unset`
  3. 开放 JSON 子树统一成 `record.set / record.unset(path)`

Whiteboard 现在已经部分证明了这条路是成立的：

- 结构操作仍然是 `create / delete / move / restore / order`
- 标量顶层字段走 `*.field.set / *.field.unset`
- 开放子树走 `*.record.set / *.record.unset`

Dataview 更适合向这套“双通道模型”靠拢，而不是走“一个大而泛的 path API 覆盖一切”。

### 为什么不建议全量 path 化

#### 1. 结构性操作不是字段赋值

像下面这些操作，本质上都不是普通 path mutation：

- create
- delete
- restore
- move
- order / insert / remove
- relation relink

它们对应的是：

- 集合成员变化
- 拓扑变化
- 顺序变化
- 引用关系变化

如果强行压成 `path.set`，执行层可能会更“统一”，但语义层会明显变差，inverse、history、conflict、validation 都会被迫重新猜语义。

#### 2. 闭合 schema 字段更适合 typed field op

对有限、稳定、可枚举的顶层字段，`field.set / field.unset` 明显优于 generic path：

- 类型更强
- 校验更直接
- impact 更精确
- 编译期优化更容易做

Whiteboard 的 `node.field.set`、`edge.field.set` 属于这类。

Dataview 的以下字段也更适合这一层：

- `record.title`
- `record.type`
- `activeViewId`
- 未来拆开的 view 顶层 query/layout/calc/order 字段

#### 3. 开放子树才适合 path-based record op

真正适合 path-based 的，是这类“领域承认其为开放 JSON 子树”的区域：

- Whiteboard 的 `node.data` / `node.style`
- Whiteboard 的 `edge.data` / `edge.style`
- Dataview 的 `record.meta`
- Dataview 中未来若继续开放的附加 record payload

这类区域的特点是：

- 不适合把每个 leaf 都写成一个 typed op
- 允许局部树更新
- 更适合共用一套 set/unset helper
- 更适合共用 lazy copy-on-write draft

### 推荐的长期 primitive 分层

建议统一成三层：

#### 1. lifecycle / relation / order primitive

用于结构和拓扑变更，继续使用 typed operation：

- `node.create`
- `edge.delete`
- `canvas.order.move`
- `document.view.remove`

这一层不要 path 化。

#### 2. field primitive

用于有限、稳定、可枚举的字段：

```ts
{ type: 'entity.field.set', id, field, value }
{ type: 'entity.field.unset', id, field }
```

这一层的目标是保留：

- 显式字段名
- 精确类型
- 精确 impact 分类

#### 3. record primitive

用于开放 JSON 子树：

```ts
{ type: 'entity.record.set', id, scope, path, value }
{ type: 'entity.record.unset', id, scope, path }
```

这里的：

- `scope` 用来标识是哪棵开放子树
- `path` 用来定位子树内部位置

例如：

- Whiteboard：`scope = 'data' | 'style'`
- Dataview：可演进为 `scope = 'meta' | 'values'`，或者按领域再拆得更细

### Path 表示也应统一升级

如果要长期收敛 path-based mutation，建议不要继续把 path 表示成点号字符串，而是升级成 path segments：

```ts
type MutationPath = readonly (string | number)[]
```

比起：

```ts
path: 'foo.bar.0.baz'
```

更推荐：

```ts
path: ['foo', 'bar', 0, 'baz']
```

原因很直接：

- 不需要处理转义规则
- 不会把数组索引和对象 key 混淆
- 更适合 shared helper 直接遍历
- 更适合 lazy copy-on-write 按段下沉复制
- inverse / trace / debug 输出更稳定

如果要表示整棵 scope root：

- 建议直接用空路径 `[]`
- 不建议再用 `path?: string`

这样语义更一致，分支更少。

### 对 Dataview 的直接启发

Dataview 当前 operation 仍然偏粗：

- `document.record.patch`
- `document.record.fields.writeMany`
- `document.field.patch`
- `document.view.put`

长期更干净的方向应是：

#### 1. 拆掉 `document.record.patch`

把它拆成两层：

- 闭合字段更新：`record.field.set / unset`
- 开放子树更新：`record.record.set / unset(path)`

例如：

- `title` / `type` 走 field primitive
- `meta` / `values` 走 record primitive

这样比当前把它们混在一个 `patch` 里更干净。

#### 2. 把 `writeMany / restoreMany` 退到 batch / inverse 层

`writeMany` 很适合作为：

- 批量优化入口
- inverse 压缩结果
- command 层 convenience API

但它不适合作为长期核心 mutation primitive。

核心 primitive 应该尽量小、稳定、可组合。

#### 3. 拆开 `document.view.put`

`view.put` 现在承担了过多语义：

- create / replace
- query 变化
- layout 变化
- calculation 变化
- order 变化

而 Dataview 的 impact 又恰好已经在 reducer 里区分这些维度。

这说明长期更合理的方向不是继续保留粗粒度 `put`，而是显式拆成更小的 typed family。

### 为什么这种分层比“全 generic path”更简单

表面上看，一个统一的 `path.set` 最简单。

但从长期维护看，更简单的是“**结构语义显式，开放子树统一**”：

- reducer 分支更稳定
- inverse 生成规则更稳定
- impact / invalidation 更容易精确
- compiler / planner 更容易做静态优化
- lazy copy-on-write draft 更容易做到引用稳定

所以真正的长期最优不是：

- everything is path

而是：

- structure is typed
- closed fields are typed
- open payload is path-based

## 最终建议

长期最优方案是：

1. `shared/core` 保留现有低层原语：
   - `mutationContext`
   - `mutationTx`
   - `operationBuffer`
   - `historyFootprint`
2. 再新增一层极薄的：
   - `documentMutationKernel`
3. Dataview 保留：
   - `DocumentMutationContext`
   - `reduceOperation`
4. Whiteboard 保留：
   - `ReducerTx`
   - `dispatchOperation`
5. 两边只统一 apply operation 的 orchestration skeleton，不统一领域 reducer facade
6. 如果未来进一步收敛 operation primitive：
   - 不要全量 path 化
   - 采用 `typed lifecycle + typed field + path-based record` 三层模型
   - path 统一升级为 path segments，而不是点号字符串

一句话总结：

> Dataview 和 Whiteboard 可以共用同一套“document mutation kernel”，  
> 但不应该共用同一套“document reducer API”。
>
> 如果继续收敛 operation 形状，也不应该走“everything is path”，  
> 而应该走“structure typed + field typed + record path-based”。

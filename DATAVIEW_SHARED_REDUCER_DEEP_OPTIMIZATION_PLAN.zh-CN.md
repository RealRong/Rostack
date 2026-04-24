# Dataview 基于 shared/reducer 的深度优化方案

本文讨论 `dataview/packages/dataview-core` 的 mutation / reducer 主链，下一步如何**继续降复杂度**，并且**更深地利用 `shared/reducer`**。

## 当前落地状态

以下阶段已完成并已代码落地：

- Phase 1：footprint 已移入 `ReducerSpec.beforeEach`
- Phase 2：`shared/reducer` 已支持单入口 `handle`
- Phase 3：Dataview 已收敛为单一 operation definition registry
- Phase 4：`DocumentMutationContext` 已引入并成为 operation apply 的唯一局部上下文
- Phase 5：`dataviewReducerSpec` 已提炼完成，`mutation/apply.ts` 已收敛为薄入口

旧实现已删除：

- `dataview/packages/dataview-core/src/operation/meta.ts`
- `dataview/packages/dataview-core/src/operation/mutation.ts`
- `dataview/packages/dataview-core/src/mutation/footprint.ts`

前提明确如下：

- 不做兼容层。
- 不考虑平滑迁移成本。
- 目标是长期最优、代码干净、职责收敛。
- `shared/reducer` 负责通用 mutation runtime，Dataview 只保留领域语义。

---

## 1. 核心结论

Dataview 现在已经接入了 `shared/reducer`，但还只是“用到了壳”，没有把 reducer 生命周期真正吃干净。

当前最主要的问题不是 `shared/reducer` 不够强，而是 Dataview 还保留了几层重复分派和职责混杂：

1. `mutation/apply.ts` 里同一个 handler 同时做 footprint 收集和真正 apply。
2. operation type 至少重复出现在 3 到 4 个地方：
   - reducer handlers 表
   - footprint switch
   - apply switch
   - meta 定义
3. `shared/reducer` 目前强制按 `handlers[op.type]` 分派，不适合 Dataview 这种“单入口 apply”的模型。

所以，下一步的长期最优方向不是继续在 Dataview 里堆 glue code，而是：

- 把 `shared/reducer` 进一步收敛成**唯一的 operation reduce/apply runtime**。
- 把 Dataview 的 mutation 层收敛成：
  - 一份 reducer spec
  - 一份 operation definition registry
  - 一份领域局部上下文 `DocumentMutationContext`

一句话：

> Dataview 不该自己再维护一套半独立的 apply orchestration。  
> 它应该只向 `shared/reducer` 提供 operation 语义。

---

## 2. 当前复杂度主要来自哪里

## 2.1 `mutation/apply.ts` 仍然职责混杂

当前 `dataview/packages/dataview-core/src/mutation/apply.ts` 里：

- `createContext` 负责挂 `trace`
- `applyDataviewOperation()` 先收 footprint，再执行 mutation
- `done` 再 finalize trace

这里最大的问题是：

- footprint 收集本来就是 reducer 生命周期里的 `beforeEach`
- 但现在却被塞进 handler 本体

这会导致 handler 语义不纯：

- 它不再只是“执行 operation”
- 而是“执行 operation 前的准备 + 真正 apply + 可能的 trace side effect”

这层复杂度是完全没必要的。

## 2.2 operation type 被重复维护

现在同一个 `DocumentOperation['type']` 同时散落在：

- `src/mutation/apply.ts`
- `src/mutation/footprint.ts`
- `src/operation/mutation.ts`
- `src/operation/meta.ts`

这意味着新增一个 operation 时，至少要同步修改多处。

这类复杂度不是领域复杂度，而是结构复杂度。

真正合理的状态应该是：

- operation type 只有一份 canonical registry
- `meta`、`footprint`、`apply` 都从这份 registry 派生

## 2.3 `shared/reducer` 对 Dataview 来说还少一个关键入口

目前 `shared/reducer` 更适合 Whiteboard 那种“每个 type 一个 handler”的场景。

但 Dataview 现在的实际模式是：

- 所有 operation 最终都进一个通用 apply 入口
- 真正的 type 分派发生在 Dataview 自己内部

这说明 Dataview 实际更需要的是：

- `beforeEach(ctx, op)`
- `handle(ctx, op)`
- `done(ctx)`

而不是必须手写一张所有 type 都指向同一函数的 `handlers` 表。

---

## 3. 长期最优的最终形态

Dataview 的最终 reducer 入口应该收敛成：

```ts
const dataviewReducer = new Reducer({
  spec: dataviewReducerSpec
})
```

而 `dataviewReducerSpec` 应该接近下面这个形态：

```ts
export const dataviewReducerSpec = {
  serializeKey: serializeDataviewMutationKey,
  createContext: createDataviewMutationContext,
  beforeEach: collectDataviewOperationFootprint,
  handle: applyDataviewOperation,
  done: finalizeDataviewTrace
} satisfies ReducerSpec<...>
```

这里的职责边界非常清楚：

- `shared/reducer`
  - 管 op loop
  - 管 stop / fail
  - 管 inverse buffer
  - 管 footprint collector
  - 管 issues
  - 管 draft / replace / write
- Dataview reducer spec
  - 定义 context 扩展
  - 定义 footprint 收集
  - 定义 operation apply
  - 定义 trace finalize

最终 `apply.ts` 应该退化成一个非常薄的入口文件：

```ts
export const applyOperations = (document, operations) =>
  dataviewReducer.reduce({
    doc: document,
    ops: operations
  })
```

---

## 4. `shared/reducer` 下一步该怎么收

如果目标是“尽可能减少 Dataview 复杂度”，那 `shared/reducer` 最值得补的不是更多 helper，而是**更简单的主入口**。

## 4.1 增加单入口 `handle`

建议 `ReducerSpec` 增加：

```ts
handle?(ctx: DomainCtx, op: Op): void
```

执行规则很简单：

1. 如果有 `handle`，优先走 `handle`
2. 否则走现有 `handlers[op.type]`

这样：

- Dataview 用 `handle`
- Whiteboard 继续用 `handlers`

这是最小改动，但能直接删掉 Dataview 那张重复 handler 表。

## 4.2 `handlers` 不再是 Dataview 的必选项

长期看，`ReducerSpec` 更合理的约束是：

```ts
type ReducerSpec =
  | { handle: ...; handlers?: never }
  | { handlers: ...; handle?: never }
```

也就是：

- 要么是单入口 reducer
- 要么是显式分派 reducer

不要两套同时鼓励。

## 4.3 不要给 `shared/reducer` 加复杂 middleware

不建议给 `shared/reducer` 再加：

- plugin pipeline
- reducer middleware
- effect chain
- dynamic phase registration

原因很简单：

- Dataview 现在缺的不是可扩展性
- 而是结构太散、重复太多

这时继续加框架能力，只会把简单问题复杂化。

---

## 5. Dataview 侧最应该新增的本地模型

## 5.1 引入 `DocumentMutationContext`

虽然 Dataview 应该深度利用 `shared/reducer`，但也不应该让业务 apply 逻辑直接依赖完整的 `ReducerContext`。

最合理的做法是引入 Dataview 本地窄接口：

```ts
export interface DocumentMutationContext {
  doc(): DataDoc
  replace(doc: DataDoc): void
  inverse: {
    prependMany(ops: readonly DocumentOperation[]): void
  }
  trace: DataviewTrace
}
```

然后 reducer 层只做一次适配：

```ts
const toDocumentMutationContext = (
  ctx: DataviewReduceContext
): DocumentMutationContext => ({
  doc: ctx.doc,
  replace: ctx.replace,
  inverse: {
    prependMany: ctx.inverseMany
  },
  trace: ctx.trace
})
```

这样能保证：

- `operation` 层不直接依赖 `shared/reducer`
- `shared/reducer` 仍然是唯一写入 runtime
- Dataview 的领域代码看到的仍然是本地上下文模型

## 5.2 `operation/mutation.ts` 应逐步从“大 switch”转成 registry

当前 `src/operation/mutation.ts` 里的大 `switch` 不是错误，但它和 footprint switch、meta map 一起存在时，就造成了重复结构。

长期最优不是保留多个 switch，而是收敛成一份 operation definition registry。

例如：

```ts
type DataviewOperationDefinition<T extends DocumentOperation['type']> = {
  family: 'record' | 'field' | 'view' | 'external'
  history?: boolean
  footprint?(ctx: DataviewFootprintContext, op: Extract<DocumentOperation, { type: T }>): void
  apply(ctx: DocumentMutationContext, op: Extract<DocumentOperation, { type: T }>): void
}
```

然后：

- `operation/meta.ts` 从 registry 派生
- `mutation/footprint.ts` 从 registry 派生
- `mutation/apply.ts` 的 `handle` 从 registry 派生

这会把 Dataview 的 operation 语义集中到一个地方。

---

## 6. 最推荐的最终代码组织

建议 Dataview 最终收成下面几层：

## 6.1 `src/operation/definition.ts`

唯一 canonical operation registry。

它定义每个 operation 的：

- family
- history policy
- footprint collector
- apply handler

## 6.2 `src/operation/context.ts`

定义 Dataview 本地 `DocumentMutationContext`。

只暴露 operation apply 真正需要的最小能力，不把 `ReducerContext` 直接泄漏到底层。

## 6.3 `src/mutation/spec.ts`

只做 reducer glue：

- `serializeKey`
- `createContext`
- `beforeEach`
- `handle`
- `done`

这是 Dataview 与 `shared/reducer` 的唯一正式接缝。

## 6.4 `src/mutation/apply.ts`

只保留外部入口：

- 构造 reducer
- 导出 `applyOperations`

不要在这个文件里继续堆业务逻辑。

---

## 7. 分阶段优化方案

下面是建议的实际推进顺序。

## Phase 1：把 footprint 正式移入 reducer 生命周期

目标：

- `collectOperationFootprint()` 从 handler 本体移到 `beforeEach`

结果：

- `applyDataviewOperation()` 只负责真正 apply
- reducer 生命周期职责变清楚

这是第一步，收益高、风险低，应该优先做。

## Phase 2：给 `shared/reducer` 增加 `handle`

目标：

- Dataview 不再维护整张重复的 `handlers` 表

结果：

- Dataview reducer spec 变成标准单入口形态
- `shared/reducer` 同时支持：
  - Whiteboard 的多 handler 模式
  - Dataview 的单 handler 模式

## Phase 3：把 operation 分派收敛成一份 definition registry

目标：

- 不再同时维护：
  - `operation/meta.ts`
  - `mutation/footprint.ts`
  - `operation/mutation.ts`
  - reducer handler map

结果：

- operation type 只有一份 canonical 定义
- 新增 operation 时，不再需要多点同步

## Phase 4：引入 `DocumentMutationContext`

目标：

- 不让 `operation` 层直接依赖 `ReducerContext`

结果：

- Dataview 领域逻辑保持独立
- `shared/reducer` 与领域语义的边界更稳

## Phase 5：提炼 `dataviewReducerSpec`

目标：

- reducer 入口从“临时拼装”变成正式 spec 模块

结果：

- `apply.ts` 只有薄封装
- reducer 行为变成一个可复用、可测试、可迁移的稳定对象

---

## 8. 最终期望的 Dataview reducer API

最终推荐形态如下：

```ts
export const dataviewReducer = new Reducer({
  spec: dataviewReducerSpec
})

export const applyOperations = (
  document: DataDoc,
  operations: readonly DocumentOperation[]
) => dataviewReducer.reduce({
  doc: document,
  ops: operations
})
```

而 Dataview 内部的 reducer spec 应该接近：

```ts
export const dataviewReducerSpec = {
  serializeKey: serializeDataviewMutationKey,
  createContext: createDataviewMutationContext,
  beforeEach: (ctx, op) => {
    readDefinition(op).footprint?.(ctx, op)
  },
  handle: (ctx, op) => {
    readDefinition(op).apply(toDocumentMutationContext(ctx), op)
  },
  done: (ctx) => {
    finalizeTrace(ctx.trace)
    return {
      trace: ctx.trace
    }
  }
}
```

这套结构有几个直接收益：

- reducer 主链明显更短
- operation type 只维护一份
- footprint / apply / meta 同源
- Dataview 对 `shared/reducer` 的利用更彻底
- 后续如果要统一 history / collab / projector 接缝，也更容易继续下沉

---

## 9. 明确不建议做的事

以下方向不建议做：

## 9.1 不要把 Dataview 的业务 apply 逻辑塞进 `shared/reducer`

例如：

- record / field / view 的领域写入语义
- inverse 细节
- impact 细节
- trace 细节

这些都属于 Dataview 自己。

`shared/reducer` 只应该提供稳定 runtime，不应该吞掉领域语义。

## 9.2 不要引入新的过渡 facade

不要做这种结构：

- `executeOperation.ts`
- `reduceOperation.ts`
- `applyOperation.ts`
- `runMutation.ts`

多套并存再慢慢迁移

这只会制造新的中间层。

应该直接收敛到：

- `Reducer`
- `ReducerSpec`
- `DocumentMutationContext`
- `DocumentOperationDefinition`

## 9.3 不要继续保留多份 operation 元数据

如果决定做 deep optimization，就不要接受下面这种状态继续存在：

- 一份 meta map
- 一份 footprint switch
- 一份 apply switch
- 一份 reducer handlers map

这不是“清晰分层”，这是重复维护。

---

## 10. 最终判断

Dataview 这条 reducer 主链，完全可以继续明显简化。

而且最值得做的优化，不是发明更多 Dataview 专属 abstraction，而是：

1. 让 `shared/reducer` 成为真正的唯一 op-loop runtime
2. 让 Dataview 只维护一份 operation definition
3. 让 footprint / apply / meta 都从同一个定义源头派生
4. 用本地 `DocumentMutationContext` 把领域层和 shared runtime 稳定隔开

最终结果应该是：

- `shared/reducer` 更简单、更通用
- Dataview mutation 主链更短、更直
- operation 维护点更少
- 后续统一 history / collab / projector 时阻力更小

这才是 Dataview 在 reducer 这条链上的长期最优解。

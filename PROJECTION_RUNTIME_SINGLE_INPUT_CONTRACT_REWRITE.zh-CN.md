# Projection Runtime 单输入 Contract 重构方案

本文只讨论一件事：

如何把 `@shared/projection-runtime` 从当前的双输入 contract：

- `update(input, change)`
- `planner.plan({ change, previous })`

收紧成最终的单输入 contract：

- `update(input)`
- `planner.plan({ input, previous })`

并且保证这次收紧同时适用于：

- Dataview
- `whiteboard/packages/whiteboard-editor-graph`
- 未来其他 projection-runtime 使用方

本文明确前提：

- 不在乎重构成本
- 不需要兼容旧 contract
- 不保留双轨实现
- 目标是长期最优，不是过渡形态
- 不为了单输入而丢掉现有 invalidation 能力

---

## 1. 最终结论

长期最优方案很明确：

1. `projection-runtime` 应收紧成单输入 contract
2. 但这不等于“删除 change 信息”
3. 正确做法是把 host-provided invalidation 内聚进 `input`
4. planner 以后统一只看：
   - `input`
   - `previous`
5. `TInputChange` 整体删除
6. `update(input, change)` 整体删除

一句话概括：

> 单输入的本质不是删掉 invalidation，而是把 invalidation 从第二个参数收回到 `input` 本身。

---

## 2. 为什么要改成单输入

当前 `projection-runtime` 的 contract 是：

```ts
runtime.update(input, change)
planner.plan({ change, previous })
```

这个设计的问题不在于“多一个参数”，而在于它把一份运行事实拆成了两份入口。

## 2.1 输入被拆成了两份真相

今天的 runtime 入口被人为拆成：

- `input`
- `change`

这会带来两个长期问题：

1. 入口语义被撕裂
2. host 需要长期维护两套模型

一旦两者不一致，就会形成错误源。

## 2.2 planner 被迫站在第二份模型上

当前 planner 不看 `input`，而看 `change`。

这会让 planner 和 phase 站在不同的数据层：

- phase 看 `input`
- planner 看 `change`

最后 runtime 自己也会变成：

- 一个负责“真实输入”
- 一个负责“变化摘要”

这种分裂没有长期价值。

## 2.3 对 Dataview 来说，第二份输入已经是冗余

Dataview 这边的 invalidation facts 本来就已经自然内聚在 active derive 输入里，比如：

- `impact`
- `index.delta`
- `view.plan`
- `view.previousPlan`

这种场景下，额外的 `change` 只是重复。

## 2.4 对 Whiteboard 来说，第二份输入不是冗余，而是 host impact

白板这边不一样。

`whiteboard-editor-graph` 现在的 `InputChange` 不是“为了凑 projection-runtime contract”才存在的，而是 host 预先给出的粗粒度 invalidation seed。

见：

- [editor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-graph/src/contracts/editor.ts)
- [planner.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-graph/src/runtime/planner.ts)

也就是说：

- 对 Dataview，删第二个参数是去重
- 对 Whiteboard，直接删第二个参数是在删真相

所以正确方向不是“删掉 change”，而是“把 change 的语义收回 input”。

---

## 3. 最终 contract 应该长什么样

## 3.1 runtime contract

最终应收敛成：

```ts
export interface Instance<
  TInput,
  TSnapshot,
  TChange,
  TPhaseName extends string = string,
  TPhaseMetrics = unknown
> {
  snapshot(): TSnapshot
  update(
    input: TInput
  ): Result<TSnapshot, TChange, TPhaseName, TPhaseMetrics>
  subscribe(
    listener: (result: Result<TSnapshot, TChange, TPhaseName, TPhaseMetrics>) => void
  ): () => void
}
```

也就是：

- 删除第二个参数 `change`

## 3.2 planner contract

最终应收敛成：

```ts
export interface Planner<
  TInput,
  TSnapshot,
  TPhaseName extends string,
  TDirty = never
> {
  plan(input: {
    input: TInput
    previous: TSnapshot
  }): Plan<TPhaseName, TDirty>
}
```

也就是：

- planner 不再接 `change`
- planner 直接看 `input`

## 3.3 spec contract

最终应收敛成：

```ts
export interface Spec<
  TInput,
  TWorking,
  TSnapshot,
  TChange,
  TPhaseName extends string,
  TDirty = never,
  TPhaseChange = unknown,
  TPhaseMetrics = unknown
> {
  createWorking(): TWorking
  createSnapshot(): TSnapshot
  planner: Planner<TInput, TSnapshot, TPhaseName, TDirty>
  publisher: Publisher<TWorking, TSnapshot, TChange>
  phases: readonly phase.Spec<
    TPhaseName,
    Context<TInput, TWorking, TSnapshot, TDirty>,
    TPhaseChange,
    TPhaseMetrics
  >[]
}
```

这里最重要的是：

- `TInputChange` 整体消失

---

## 4. 这次重构最关键的原则

### 4.1 单输入不等于删掉 impact

这是整件事里最重要的一条。

如果一个 domain 现在有一份单独的 invalidation summary：

- `InputChange`
- `Impact`
- `Dirty`
- `Hint`

那么改成单输入后，正确做法不是删除它，而是把它并入 `Input`。

### 4.2 planner 只依赖 input 内的稳定事实

planner 不应该去“猜变化”。

长期最优的 planner 只做两件事：

1. 读 `input`
2. 读 `previous`

然后决定：

- 哪些 phase 起跑
- 哪些 dirty token 进入首个 phase

如果 planner 想知道“这次外部有哪些输入域 changed”，那这份信息就应该在 `input` 里，而不是在第二个参数里。

### 4.3 host 自己知道的 invalidation，不要逼 runtime 重算

如果 host 天然知道：

- document 变了
- viewport 变了
- interaction 变了

那这就是 host truth。

长期最优做法是：

- host 把这份 truth 编进 `input`
- planner 直接读这份 truth

不要强迫 runtime 再从：

- `input`
- `previous snapshot`

里反推一遍。

那样只会：

- 增加复杂度
- 增加算力开销
- 增加出错概率

---

## 5. 哪些场景适合直接单输入

## 5.1 Dataview 这种“输入里已经有 invalidation facts”的场景

Dataview active derive 是这类。

它的 planning 事实已经天然在输入里：

- `impact`
- `index.delta`
- `view.plan`
- `view.previousPlan`

这种场景改成单输入是纯收益：

- 删除重复模型
- 删除双真相
- 删除额外同步成本

## 5.2 Whiteboard 这种“host 预先提供 coarse invalidation”的场景

白板 editor graph 属于这类。

它当前是：

- `Input`
- `InputChange`

其中 `InputChange` 是 host 预先提供的 invalidation summary，不是冗余。

所以它不能“直接删 change”，而必须做一步内聚：

- 把 `InputChange` 并回 `Input`

---

## 6. Whiteboard 应该怎么改

## 6.1 当前问题

当前白板 editor graph 的 planner 只看：

- `InputChange`

见：

- [planner.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-graph/src/runtime/planner.ts)

而 `Input` 本身不包含这份变化摘要。

所以如果你只把 shared contract 改成单输入，而不改白板输入模型，就会立刻出现问题：

- planner 拿不到 coarse invalidation seed
- 只能去猜变化
- 或者只能退化成更大范围的 phase 执行

## 6.2 正确改法

把原来的：

```ts
interface Input {
  document: ...
  session: ...
  measure: ...
  interaction: ...
  viewport: ...
  clock: ...
}

interface InputChange {
  document: Flags
  session: Flags
  measure: Flags
  interaction: Flags
  viewport: Flags
  clock: Flags
}
```

改成：

```ts
interface Input {
  document: ...
  session: ...
  measure: ...
  interaction: ...
  viewport: ...
  clock: ...
  impact: {
    document: Flags
    session: Flags
    measure: Flags
    interaction: Flags
    viewport: Flags
    clock: Flags
  }
}
```

也就是说：

- `InputChange` 删掉
- 原来第二个参数里的 coarse flags 合进 `input.impact`

## 6.3 planner 改法

把：

```ts
plan: ({ change, previous }) => { ... }
```

改成：

```ts
plan: ({ input, previous }) => {
  const impact = input.impact
  ...
}
```

planner 的业务逻辑几乎不需要重写，只是读取路径变了：

- `change.document.changed`
  -> `input.impact.document.changed`
- `change.session.changed`
  -> `input.impact.session.changed`

## 6.4 runtime API 改法

把：

```ts
runtime.update(input, change)
```

改成：

```ts
runtime.update(input)
```

此时 host 调用方要负责把原来外部传入的 `change` 先合进 `input`。

## 6.5 testing builder 改法

现在白板的 testing builder 也直接构造 `InputChange`，见：

- [builders.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-graph/src/testing/builders.ts)

长期最优应该改成：

- 构造 `input.impact`

而不是继续构造单独的 `InputChange`。

---

## 7. Dataview 应该怎么改

Dataview 这边比白板简单得多。

因为 Dataview 的 planning facts 本来就已经在 active runtime input 里。

所以 Dataview 不需要新增 `input.impact` 这种层。

它只需要：

1. 删除额外的 `ActiveProjectionChange`
2. 让 planner 直接看 `ActiveProjectionInput`
3. 把 `projection-runtime` contract 切到单输入

也就是说：

- Whiteboard 是“内聚 impact”
- Dataview 是“删除冗余 change”

---

## 8. shared/projection-runtime 具体要改什么

## 8.1 contracts/runtime.ts

需要改：

- `Planner<TInputChange, ...>` -> `Planner<TInput, ...>`
- `Spec<TInput, TInputChange, ...>` -> `Spec<TInput, ...>`
- `Instance<TInput, TInputChange, ...>` -> `Instance<TInput, ...>`
- `update(input, change)` -> `update(input)`

## 8.2 runtime/createRuntime.ts

需要改：

- `update: (input, change) => ...`
  -> `update: (input) => ...`

## 8.3 runtime/update.ts

需要改：

- `inputChange`
  -> 删除
- `planner.plan({ change: inputChange, previous })`
  -> `planner.plan({ input: nextInput, previous })`

## 8.4 testing/harness.ts

需要改：

- `update(input, change)`
  -> `update(input)`

## 8.5 tests

shared 自己的 runtime tests 也要同步改成单输入风格。

---

## 9. 迁移顺序

## 第一阶段：先改 shared contract

在 `@shared/projection-runtime` 内：

1. 删掉 `TInputChange`
2. 改 `Planner`
3. 改 `Spec`
4. 改 `Instance`
5. 改 runtime update 调度实现
6. 改 testing harness

这一阶段只改 shared，不改业务逻辑。

## 第二阶段：先迁 Dataview

Dataview 更简单，先迁它可以更快验证 contract 是不是顺的。

要做的事：

1. 删除 `ActiveProjectionChange`
2. planner 直接读 `ActiveProjectionInput`
3. active runtime 改成 `update(input)`

## 第三阶段：迁 Whiteboard

白板迁移时不要直接删 invalidation。

正确顺序是：

1. 先把 `InputChange` 合进 `Input.impact`
2. 再改 planner 读取路径
3. 再改 runtime API
4. 再删掉旧的 `InputChange`

## 第四阶段：清理 builder / test / wrapper

包括：

- test builder
- harness
- runtime wrapper
- package 对外 runtime interface

全部切成单输入。

---

## 10. 为什么这是长期最优

## 10.1 对 shared 更简单

shared runtime 的 contract 会明显更收敛：

- 一个输入
- 一个 planner 入口
- 一个 runtime update 入口

而不是一套“输入 + 变化摘要”双入口。

## 10.2 对 Dataview 更干净

Dataview 本来就不该维护 `ActiveProjectionChange` 这种重复模型。

单输入正好把它删掉。

## 10.3 对 Whiteboard 更稳定

白板不会丢掉 coarse invalidation truth。

只是把这份 truth 从第二个参数变成 `input` 的一部分。

这样：

- host truth 还在
- planner 仍然便宜
- shared contract 也统一了

## 10.4 对未来 domain 更一致

未来所有 runtime 都统一成一个模式：

- `input` 里同时包含：
  - domain truth
  - host impact / invalidation
- planner 只看 `input`
- phase 也只看 `input`

这是最清楚、最稳定、也最少歧义的模型。

---

## 11. 非目标

这次重构不追求下面这些事：

- 重写 dirty fanout 模型
- 引入 phase output registry
- 引入多层 publish graph
- 改 publisher contract
- 改 trace contract

重点只是：

- 把 projection-runtime 从双输入收紧到单输入

---

## 12. 最终结论

`projection-runtime` 收紧为单输入 contract 是正确方向，但它的正确含义不是：

- 删除 change

而是：

- 把原本散落在第二个参数里的 invalidation truth 收回到 `input`

所以最终长期最优方案应当固定成下面这几条：

1. shared runtime 统一改成 `update(input)`
2. planner 统一改成 `plan({ input, previous })`
3. `TInputChange` 整体删除
4. Dataview 直接删除冗余 change 模型
5. Whiteboard 先把 `InputChange` 合进 `Input.impact`
6. 任何 host 已知的 invalidation，都不应在 runtime 内重算

一句话概括：

> 单输入 contract 的正确方向不是“去掉变化信息”，而是“让变化信息成为输入本身的一部分”。 

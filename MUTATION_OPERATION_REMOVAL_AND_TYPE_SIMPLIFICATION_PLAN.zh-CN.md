# mutation operation 与类型复杂度长期最优方案

## 结论

当前系统里最该删除的，不是 typed writer / reader / delta 本身，而是围绕它们残留的第二套、第三套表达层。

长期最优形态应当收敛为：

1. `schema`
2. `Intent` union
3. `compile handlers`
4. `typed reader / writer / delta`
5. `MutationProgramStep[]`
6. `history / apply / collab`

必须删除：

1. 业务层 `Operation` / `DocumentOperation`
2. `MutationEngine` / `Commit` 上的 `Op` generic
3. public `Tag` generic
4. `IntentTable`
5. `ctx.output(...)`
6. `createCanonical*Operation(...)`
7. 各种为了兼容上述旧层而存在的 `as unknown as ...`

核心原则只有一句：

- **业务层只有 Intent**
- **内核层只有 Program**

中间不再保留第二套 operation 协议。

---

## 一、当前复杂度来自哪里

现在的复杂度不是单点问题，而是三层重复表达叠在一起：

1. 业务 `Intent`
2. 业务 `Operation`
3. 内核 `MutationProgramStep[]`

这三层都在表达“如何修改 document”，只是抽象位置不同。

结果就是：

1. compile 要从 `Intent` 编译到 writer/program
2. engine / commit 类型链还继续带着 `Operation`
3. shared mutation 内部还保留 canonical operation bridge
4. 各层为了把这些协议缝起来，出现大量 `as`

这才是复杂度的根源。

---

## 二、Operation 体系还有没有必要

## 2.1 shared mutation 内部 program 仍然有必要

`MutationProgramStep[]` 不是历史包袱，它是 mutation kernel 的真正执行 IR。

它承担的是：

1. apply
2. inverse
3. history
4. footprint
5. delta
6. structural facts
7. collab / serialization

所以这一层必须保留。

最终内部仍然保留：

- `entity.create`
- `entity.patch`
- `entity.delete`
- `ordered.insert`
- `ordered.move`
- `ordered.splice`
- `ordered.patch`
- `ordered.delete`
- `tree.insert`
- `tree.move`
- `tree.patch`
- `tree.delete`
- `tree.restore`（仅内部 inverse）

## 2.2 业务层 Operation / DocumentOperation 没有继续存在的必要

whiteboard 的 `Operation` 和 dataview 的 `DocumentOperation` 当前主要问题是：

1. 它们不是唯一业务入口，`Intent` 才是
2. 它们不是唯一执行入口，`MutationProgramStep[]` 才是
3. 它们没有提供额外 runtime 能力，只是在类型链上传播
4. 它们迫使 shared mutation 维护 bridge 和额外 generic

因此长期最优方案里：

- **whiteboard `Operation` 删除**
- **dataview `DocumentOperation` 删除**

业务调用统一变成：

- `engine.execute(intent)`
- `compile(intent) -> program`

而不是：

- `Intent`
- `Operation`
- `Program`

三套并存。

---

## 三、`Op` generic 是否还需要

不需要。

当前 `MutationCommit<Doc, Op, ...>` / `ApplyCommit<Doc, Op, ...>` 的 `Op` 不进入 commit payload，只是类型参数残留。

长期最优方案：

```ts
export interface MutationCommit<
  Doc,
  Footprint = MutationFootprint,
  Delta extends MutationDelta = MutationDelta
> {
  kind: 'apply'
  rev: number
  at: number
  origin: MutationOrigin
  document: Doc
  authored: MutationProgram
  applied: MutationProgram
  inverse: MutationProgram
  delta: Delta
  structural: readonly MutationStructuralFact[]
  footprint: readonly Footprint[]
  issues: readonly MutationIssue[]
  outputs: readonly unknown[]
}
```

也就是说：

- `MutationCommit` 删除 `Op`
- `ApplyCommit` 删除 `Op`
- `CommitRecord` 删除 `Op`
- `MutationEngineOptions` 删除 `Op`
- `MutationEngine` 删除 `Op`

这样 dataview / whiteboard engine 上一整条 commit generic 链都会明显收缩。

---

## 四、`Tag` generic 是否还需要

不需要 public `Tag` generic。

现在 `MutationProgram<Tag>` / `MutationProgramWriter<Tag>` / `MutationWriter<TSchema, Tag>` 的 `Tag` 主要只是让低层 step 可以额外挂一组字符串标签。

这不是 schema kernel 的核心能力。

长期最优做法：

1. public API 删除 `Tag` generic
2. program step metadata 如果还需要标签，直接固定为：

```ts
tags?: readonly string[]
```

或者更激进一点，直接删除 `tags`

```ts
type MutationProgramStepMetadata = {
  delta?: MutationDeltaInput
  footprint?: readonly MutationFootprint[]
}
```

优先建议：

- **先删除 public `Tag` generic**
- metadata 中若仍需标签，则固定为 `readonly string[]`

---

## 五、IntentTable 还有没有必要

没有必要。

现在存在的问题是：

1. whiteboard 有 `WhiteboardIntent` union，又有 `WhiteboardIntentTable`
2. dataview 有 core `Intent` union，engine 又补一张 `DataviewIntentTable`
3. table 只是为了表达：
   - `type -> intent`
   - `type -> output`

这导致同一份语义要维护两遍。

长期最优方案：

- **只保留 `Intent` union**
- **不再维护 `IntentTable`**

也就是从：

```ts
Intent union
IntentTable
compile handlers
```

收成：

```ts
Intent union
compile handlers
```

`output` 类型由 handler 自身推导，而不是额外维护映射表。

---

## 六、`ctx.output(...)` 还有没有必要

没有必要。

它本质上是为了适配 “一个 handler 通过 side effect 推送 output，再由 engine 聚合” 这套协议。

这会引出更多复杂度：

1. `MutationCompileHandlerInput` 需要 `output(...)`
2. `compileMutationIntents(...)` 需要维护 `pendingOutputs`
3. `MutationIntentTable` 需要声明 output
4. handler 类型只能靠外层 table 关联

长期最优方案：

- handler 直接 `return`

从：

```ts
handler(ctx) {
  ctx.writer.node.create(...)
  ctx.output({ nodeId })
}
```

变成：

```ts
handler(ctx) {
  ctx.writer.node.create(...)
  return { nodeId }
}
```

如果没有输出：

```ts
handler(ctx) {
  ctx.writer.node.patch(...)
}
```

如果需要中断：

```ts
handler(ctx) {
  return ctx.invalid('...')
}
```

最终 handler 返回类型统一为：

```ts
type CompileHandlerResult<TOutput> =
  | void
  | TOutput
  | MutationCompileControl
```

进一步如果希望更干净，可以直接让 `invalid/cancelled/fail/stop` 抛内部专用 compile signal，不再以返回值承载控制流。但第一步不必做到这里。

---

## 七、哪些 `as` 是必要的，哪些是应该删除的

## 7.1 可以接受的 `as`

以下是 JS/TS 边界的正常成本，可以接受：

1. `Object.keys(record) as Id[]`
2. `Object.entries(record) as readonly [...][]`
3. 少量 `as const`
4. 少量 runtime narrow 之后的局部 cast

这些不是架构问题。

## 7.2 必须删除的 `as`

以下属于架构问题，应该消失：

1. `as unknown as Op`
2. `compile as MutationCompileDefinition<...>`
3. `input as MutationCompileHandlerInput<...>`
4. `createMutationDelta(...) as DataviewMutationDelta`
5. 因为 `access.write(..., next: unknown)` 导致的上层业务 cast

也就是说，要优先消灭“为了把抽象缝起来而出现的 cast”，而不是追求所有局部 cast 绝对为零。

---

## 八、`access.read/write` 为什么会制造大量复杂 `as`

这是当前 shared mutation 最该改的一点。

现在 family access 的签名过于宽泛：

```ts
type FamilyAccess<Doc, Entity> = {
  read(document: Doc): unknown
  write(document: Doc, next: unknown): Doc
}
```

这直接导致业务 schema 里不断出现：

- `next as DataDoc`
- `next as Document['nodes']`
- `next as PreviewInput['node']`

这些 cast 不是业务想要的，而是 shared mutation 没把 family 的真实 shape 表达出来。

长期最优方案：

### singleton

```ts
type SingletonAccess<Doc, Entity> = {
  read(document: Doc): Entity
  write(document: Doc, next: Entity): Doc
}
```

### collection

```ts
type CollectionAccess<Doc, Id extends string, Entity> = {
  read(document: Doc): Readonly<Record<Id, Entity | undefined>>
  write(
    document: Doc,
    next: Readonly<Record<Id, Entity | undefined>>
  ): Doc
}
```

### sequence

```ts
type SingletonSequenceAccess<Doc, Item> = {
  read(document: Doc): readonly Item[]
  write(document: Doc, items: readonly Item[]): Doc
}

type CollectionSequenceAccess<Doc, Key extends string, Item> = {
  read(document: Doc, key: Key): readonly Item[]
  write(document: Doc, key: Key, items: readonly Item[]): Doc
}
```

### tree

```ts
type SingletonTreeAccess<Doc, Value> = {
  read(document: Doc): MutationTreeSnapshot<Value>
  write(document: Doc, next: MutationTreeSnapshot<Value>): Doc
}

type CollectionTreeAccess<Doc, Key extends string, Value> = {
  read(document: Doc, key: Key): MutationTreeSnapshot<Value>
  write(document: Doc, key: Key, next: MutationTreeSnapshot<Value>): Doc
}
```

这一步做完后，schema 层一大批 `as` 会自然消失。

---

## 九、复杂类型体操能不能简化

可以，但要分两类看。

## 9.1 不值得消灭的类型体操

以下类型体操虽然复杂，但它们服务的是“一处定义，处处 typed 使用”，仍然有价值：

1. `MutationWriterShape`
2. `MutationReaderShape`
3. `MutationDeltaShape`
4. 基于 `schema` 递归生成 nested API 的条件类型

这类复杂度属于“typed DSL 的必要内部成本”，不是第一优先级问题。

## 9.2 应优先消灭的类型体操

以下属于历史层叠导致的额外负担，应优先删除：

1. `Op` generic 整条链
2. `Tag` generic 整条链
3. `IntentTable` 推导链
4. `ctx.output(...)` 相关推导链
5. canonical operation 相关类型桥接
6. compile context 的大范围手工 cast

所以方向不是“把所有条件类型都手写平”，而是先砍掉造成二次推导的旧协议。

---

## 十、最终 API 设计

## 10.1 shared mutation

```ts
const schema = defineMutationSchema<Document>()({
  document: singleton<Document>()({...}),
  node: collection<NodeId, Node>()({...}),
  preview: namespace({
    node: collection<NodeId, PreviewNode>()({...})
  })
})

type Writer = MutationWriter<typeof schema>
type Reader = MutationReader<typeof schema>
type Delta = MutationDeltaOf<typeof schema>
```

```ts
type CompileContext<TIntent, TOutput> =
  BaseCompileContext<Document, TIntent, Writer, Reader> & {
    query: Query
    expect: Expect
    services: Services
  }

type CompileHandler<TIntent, TOutput> = (
  ctx: CompileContext<TIntent, TOutput>
) => void | TOutput | MutationCompileControl
```

```ts
const engine = new MutationEngine({
  schema,
  document,
  normalize,
  compile,
  history
})
```

### engine public surface

```ts
engine.execute(intent)
engine.execute([intentA, intentB])
engine.apply(program)
engine.replace(document)
```

`MutationEngine` 不再带：

- `Op`
- public `Tag`
- `IntentTable`

## 10.2 business 层

### dataview

只保留：

- `Intent` union
- `compile handlers`
- `schema`

删除：

- `DocumentOperation`
- `OperationType`
- `OperationPayload`
- `DataviewIntentTable`

### whiteboard

只保留：

- `WhiteboardIntent` union
- `compile handlers`
- `schema`

删除：

- `Operation`
- `Batch`
- 以 `Operation[]` 为中心的 validate / lock / helper 协议

其中：

- lock / validate 尽量前移到 compile
- 必须在 apply 前统一校验的能力，改为基于 `Intent` 或 `MutationProgram`

---

## 十一、对现有 whiteboard / dataview 的直接判断

## 11.1 dataview

dataview 的 `DocumentOperation` 基本已经是纯类型噪音，应该直接删除。

它当前主要残留在：

1. engine commit generic
2. projection / history 合同类型
3. tests 中的旧接口预期

这些都应该改成围绕：

- `Intent`
- `MutationProgram`
- `Commit`

而不是继续传 `DocumentOperation`。

## 11.2 whiteboard

whiteboard 的 `Operation` 仍被一些旧 helper 使用，例如：

1. node update helper
2. mindmap op helper
3. validate / lock

但这不代表它有长期存在价值，只代表有一批逻辑尚未迁走。

whiteboard 最优方向不是保留 `Operation`，而是：

1. 把 `Operation` helper 改成更直接的 intent helper 或 compile helper
2. 把 lock / validate 收进 compile 或 program-level 校验
3. 删除 `Operation[]` 作为中间协议

---

## 十二、实施方案

不保留兼容，不做双轨。

### 阶段 1：删除 `Op`

1. `MutationCommit` 删除 `Op`
2. `ApplyCommit` 删除 `Op`
3. `CommitRecord` 删除 `Op`
4. `MutationEngineOptions` 删除 `Op`
5. `MutationEngine` 删除 `Op`
6. dataview / whiteboard engine commit 类型跟进收缩

### 阶段 2：删除 public `Tag`

1. `MutationProgram<Tag>` 改成 `MutationProgram`
2. `MutationProgramWriter<Tag>` 改成 `MutationProgramWriter`
3. `MutationWriter<TSchema, Tag>` 改成 `MutationWriter<TSchema>`
4. metadata 中如需标签，固定为 `readonly string[]`

### 阶段 3：删除 `IntentTable`

1. `MutationIntentTable` 删除
2. `MutationIntentKind/Of/OutputOf` 删除
3. compile handler 改为直接围绕 `Intent` union 声明
4. dataview / whiteboard 删除各自的 `IntentTable`

### 阶段 4：删除 `ctx.output(...)`

1. handler 改成直接 `return output`
2. runtime 移除 `pendingOutputs` side channel
3. `MutationCompileHandlerInput` 删除 `output`

### 阶段 5：删除业务 Operation

1. dataview 删除 `DocumentOperation`
2. whiteboard 删除 `Operation`
3. shared mutation 删除 `createCanonical*Operation`
4. commit / history / projection / tests 改为围绕 `MutationProgram`

### 阶段 6：typed access

1. `singleton.access` 改成 typed entity
2. `collection.access` 改成 typed record map
3. `sequence/tree access` 分 singleton / collection typed 化
4. 删除 schema 层因此产生的大量 `as`

### 阶段 7：compile context 收口

1. `createContext(...)` 返回值类型由 compile 自己声明
2. 删除 compile helper 中为兼容宽泛 handler input 做的 cast
3. `query / expect / services` 成为 compile 局部能力，不再参与额外表驱动推导

---

## 十三、最终判断

现在最该做的不是继续修修补补，而是明确删掉几条根本不该再存在的类型链。

长期最优状态应该是：

1. 不再有业务 `Operation`
2. 不再有 `Op` generic
3. 不再有 public `Tag` generic
4. 不再有 `IntentTable`
5. 不再有 `ctx.output(...)`
6. schema access 全部 typed
7. compile 只处理 `Intent -> Program`
8. history / apply / collab 只处理 `Program`

这样之后，系统会真正收敛成：

- 一套 schema
- 一套 typed API
- 一套 compile
- 一套 internal program

而不是现在这种：

- 业务 intent 一套
- 业务 operation 一套
- 内核 step 一套
- 类型桥接再来一套

这才是长期最简单、最稳定、最少隐式协议的形态。

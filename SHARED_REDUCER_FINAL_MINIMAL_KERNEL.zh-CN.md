# shared/reducer 最终极简内核方案

本文定义 `shared/reducer` 的**最终极简形态**。

目标明确：

- 能删就删
- 不做兼容
- 不保留过渡 API
- 不为历史设计妥协
- `stop()` 直接删除

这不是“下一步可以考虑”的建议文档，而是**最终收口方案**。

---

## 1. 核心结论

`shared/reducer` 现在还能继续明显瘦身。

经过 Dataview 和 Whiteboard 两边实际用法对照，当前 `shared/reducer` 里真正长期稳定、且两边都需要的，只剩下面这些能力：

- operation loop
- `doc()` / `replace()` 文档推进
- inverse 收集
- footprint 收集
- `fail()` 失败中断
- `beforeEach`
- `createContext`
- `settle`
- `done`

除此之外的大量能力，要么已经被上层 compile / engine 吃掉，要么只是历史遗留泛化。

因此最终态应该是：

> `shared/reducer` 只做一次 apply run 的最小执行内核。  
> 它不再承担验证框架、issue 框架、draft 框架、分派框架。

---

## 2. 必删项

下面这些能力应该直接删除。

## 2.1 删除 `stop()`

`stop()` 必须删。

理由很简单：

- 它让 reducer 结果出现“成功但只执行了前缀 operations”的语义
- 它迫使 reducer 内部维护 `forward` 前缀状态
- 它让 reducer 变成“部分执行控制器”，而不是纯 apply 内核
- 它让 batch 语义不稳定

长期最优里，reducer 只有两种结果：

- 成功：整批 ops 全部进入 commit
- 失败：整批 ops 全部不生效

不允许“成功中途停止”。

如果某个 operation 具有独占语义，例如 Whiteboard 的 `document.replace`：

- 要么 compile 阶段保证它单独成批
- 要么上层 wrapper 在进入 reducer 前做 batch 规范化
- 要么直接视为非法 batch

**不能再由 reducer runtime 提供 `stop()` 这种成功早退机制。**

---

## 2.2 删除 issue / validate 体系

下面这些都应该删除：

- `ReducerIssueInput`
- `ReducerIssue`
- `ctx.issue()`
- `ctx.require()`
- `spec.validate()`
- `result.issues`

理由：

1. compile 层已经负责 issue / validation
2. reducer 层真正需要的只有 fail-fast runtime error
3. issue accumulation 是 planner/compiler 逻辑，不是 mutation apply 逻辑

最终 reducer 只保留：

- `ctx.fail(code, message, details?)`

也就是：

- reducer 不再“记录问题”
- reducer 只在不能继续时“直接失败”

这会把 reducer 从“诊断框架”收回“执行框架”。

---

## 2.3 删除 draft / clone / write 体系

下面这些都应该删除：

- `ReducerDraft`
- `ReducerDraftAdapter`
- `spec.draft`
- `spec.clone`
- `ctx.write()`

理由：

1. Dataview 并不需要 shared reducer 提供 draft，它只需要 `replace()`
2. Whiteboard 自己已经维护领域 draft，shared reducer 的 generic draft 没有业务价值
3. clone 是 engine 层责任，不是 reducer 层责任
4. write-once draft adapter 只是 reducer 内部历史实现细节，不应该成为长期抽象

最终 reducer 不再关心文档 mutation 风格。

文档 mutation 风格由领域自己决定：

- Dataview：immutable replace
- Whiteboard：领域 draft + 最终 materialize

`shared/reducer` 只接受：

- 当前文档读取：`doc()`
- 结果文档替换：`replace(doc)`

这就够了。

---

## 2.4 删除 shared 内建 type-dispatch

下面这些建议从 `shared/reducer` 公共模型里删掉：

- `ReducerHandler`
- `ReducerHandlerMap`
- `spec.handlers`

最终 `shared/reducer` 只保留一个统一入口：

- `spec.handle(ctx, op)`

理由：

1. reducer 的本质是 run loop，不是 op dispatch registry
2. Whiteboard 需要的按 type 分派，完全可以在领域层自己包一层
3. Dataview 已经证明 shared 层的单入口模型更干净

最终 Whiteboard 如果还想保留表驱动写法，应在自己包内写：

```ts
const handlers = {
  'node.create': reduceNodeOperation,
  'edge.create': reduceEdgeOperation
} as const

const handle = (ctx, op) => {
  const handler = handlers[op.type]
  if (!handler) {
    ctx.fail('invalid', `Unsupported operation: ${op.type}`)
  }
  handler(ctx, op as never)
}
```

这层分派属于领域，不属于 shared reducer。

---

## 2.5 删除 `emptyExtra()`

`emptyExtra()` 直接删。

它没有必要存在。

最终规则应该非常简单：

- `done` 必填

如果没有 extra，就：

```ts
done: () => undefined
```

不要在 shared reducer 再保留一个“兜底 extra 工厂”。

---

## 2.6 删除多余的 context 方法

下面这些方法和字段应该删除：

- `ctx.base`
- `ctx.inverse(op)`
- `ctx.footprintMany(keys)`
- `ctx.stop()`
- `ctx.issue()`
- `ctx.require()`

长期最小上下文只保留：

- `origin`
- `doc()`
- `replace(doc)`
- `inverseMany(ops)`
- `footprint(key)`
- `fail(code, message, details?)`

是否保留 `origin`：

- 建议保留
- 因为 Whiteboard / Dataview 某些领域扩展上下文仍可能需要读 origin

是否保留 `settle`：

- 建议保留
- 因为 Whiteboard 仍然有 flush 类后处理需求

---

## 3. 最终 API

## 3.1 最终 `ReducerContext`

最终推荐形态：

```ts
export interface ReducerContext<Doc extends object, Op, Key, Code extends string = string> {
  readonly origin: string

  doc(): Doc
  replace(doc: Doc): void

  inverseMany(ops: readonly Op[]): void
  footprint(key: Key): void

  fail(input: {
    code: Code
    message: string
    details?: unknown
  }): never
}
```

这是最终建议的最小面。

如果后续确认 `origin` 也不需要，还可以继续删。

---

## 3.2 最终 `ReducerSpec`

最终推荐形态：

```ts
export interface ReducerSpec<
  Doc extends object,
  Op,
  Key,
  Extra,
  DomainCtx = ReducerContext<Doc, Op, Key, string>,
  Code extends string = string
> {
  serializeKey(key: Key): string

  createContext?(ctx: ReducerContext<Doc, Op, Key, Code>): DomainCtx

  beforeEach?(ctx: DomainCtx, op: Op): void

  handle(ctx: DomainCtx, op: Op): void

  settle?(ctx: DomainCtx): void

  done(ctx: DomainCtx): Extra
}
```

注意这里的核心变化：

- 没有 `clone`
- 没有 `draft`
- 没有 `validate`
- 没有 `handlers`
- 没有 `emptyExtra`

这是 `shared/reducer` 应有的最终边界。

---

## 3.3 最终 `ReducerResult`

最终结果也应该继续瘦身。

推荐形态：

```ts
export type ReducerSuccess<Doc, Op, Key, Extra> = {
  ok: true
  doc: Doc
  inverse: readonly Op[]
  footprint: readonly Key[]
  extra: Extra
}

export type ReducerFailure<Code extends string = string> = {
  ok: false
  error: {
    code: Code
    message: string
    details?: unknown
  }
}

export type ReducerResult<Doc, Op, Key, Extra, Code extends string = string> =
  | ReducerSuccess<Doc, Op, Key, Extra>
  | ReducerFailure<Code>
```

这里建议进一步删除：

- `forward`
- `issues`
- 失败分支上的 `doc`
- 失败分支上的 `inverse`
- 失败分支上的 `footprint`

理由：

### `forward` 不属于 reducer 结果

如果 reducer 不再支持 `stop()`，那成功分支的 forward 永远等于输入 `ops`。

因此：

- reducer 没必要再返回 `forward`
- `MutationEngine` 自己已经知道输入 `ops`
- 需要 `write.forward` 时，engine 直接用输入即可

### 失败分支不需要泄露运行中间状态

既然 reducer 失败意味着整批不提交，那外部只需要：

- error code
- error message
- error details

其他信息都没有长期 API 价值。

---

## 4. 最终 `Reducer` 执行语义

最终 `Reducer` 的执行语义应当极其简单：

```text
create runtime
create context
for op in ops:
  beforeEach
  handle
settle
done
```

只有一种中断方式：

- `fail()`

没有：

- `stop()`
- warning issue
- validate issue
- partial success

最终语义固定为：

### 成功

- 所有 ops 都已经经过 `handle`
- `doc` 是最终文档
- `inverse` 是最终逆操作
- `footprint` 是最终冲突键集合
- `extra` 是领域 finalize 结果

### 失败

- 整批 apply 失败
- 外部只拿到 error
- draft / intermediate / partial result 不对外暴露

---

## 5. `shared/reducer/src` 文件级清理

如果按最终极简方案落地，`shared/reducer/src` 可以进一步清理成下面这样。

## 5.1 直接删除

下面这些文件应该直接删除：

- `shared/reducer/src/mutationContext.ts`
- `shared/reducer/src/mutationTx.ts`
- `shared/reducer/src/internalDraft.ts`

理由：

- `mutationContext.ts` 是旧实验性抽象，生产代码没有依赖
- `mutationTx.ts` 也是旧拼装工具，生产代码没有依赖
- `internalDraft.ts` 对应的 draft 模型已经被整体删除

---

## 5.2 可以内联后删除

下面这些文件可以直接内联进 `Reducer.ts`，然后删除：

- `shared/reducer/src/operationBuffer.ts`
- `shared/reducer/src/historyFootprint.ts`

理由：

- 它们现在只服务 reducer 自己
- 继续拆文件只是在维护内部工具，不是在提供长期结构价值
- 极简目标下，内联到 `Reducer.ts` 更直接

如果仍然想保留拆文件，也必须只作为 `internal/*`，不再作为 reducer 包结构的一部分被感知。

---

## 5.3 最终公开面

最终 `shared/reducer/src/index.ts` 推荐只保留：

```ts
export { Reducer } from './Reducer'

export type {
  ReducerContext,
  ReducerResult,
  ReducerSpec
} from './contracts'
```

下面这些类型都不该再公开：

- `ReducerDraft`
- `ReducerDraftAdapter`
- `ReducerHandler`
- `ReducerHandlerMap`
- `ReducerIssue`
- `ReducerIssueInput`

---

## 6. Dataview 迁移含义

Dataview 已经非常接近这个最终态。

它最终只需要：

- `createContext`
- `beforeEach`
- `handle`
- `done`

也就是它现在的形态已经基本对齐：

- `dataview/packages/dataview-core/src/mutation/spec.ts`

真正需要的后续清理只有两点：

1. 等 `shared/reducer` 删除 `handlers`、`draft`、`validate`、`issues` 后，同步收紧类型
2. 等 `ReducerResult` 删除 `forward` 后，Dataview 外层如果仍然想暴露 `forward`，就在自己的 `applyOperations()` 外层补：

```ts
return result.ok
  ? {
      ...result,
      forward: operations
    }
  : result
```

如果 Dataview 也不再需要 `forward`，那就连这个 wrapper 都不用补。

---

## 7. Whiteboard 迁移含义

Whiteboard 还会多做一层本地适配，但 shared reducer 仍然可以更简单。

Whiteboard 下一步应该做的是：

## 7.1 把 `handlers` 表下沉到 Whiteboard 自己

shared reducer 删掉 `handlers` 后，Whiteboard 自己保留本地 dispatch table 即可。

shared reducer 不需要知道 operation type map。

## 7.2 删除 `stop()` 依赖

当前 `document.replace` 的成功早退必须去掉。

最终方案只能是下面三种之一：

1. compile 阶段保证 `document.replace` 独占一批 ops
2. apply wrapper 进入 reducer 前做 batch 规整
3. 混合 batch 直接判错

不能再依赖 reducer runtime 的 `stop()`。

## 7.3 精简 Whiteboard 自己的 inverse 接口

Whiteboard 内部 `WhiteboardInverse` 现在定义过宽：

- `append`
- `appendMany`
- `isEmpty`
- `clear`
- `finish`

从实际生产代码看，真正有业务价值的主要是：

- `prepend`
- `prependMany`

其余都应该删掉或降到 internal-only。

---

## 8. 最终判断

如果要把 `shared/reducer` 做到长期最优，那最终方向不是“继续补更多 reducer 能力”，而是：

- 删验证
- 删 issue
- 删 draft
- 删 clone
- 删 handlers
- 删 stop
- 删 emptyExtra
- 删 forward accumulation
- 删失败分支的中间状态

把它彻底收成一个**极小的 apply 内核**。

一句话总结：

> `shared/reducer` 不该再像一个可配置框架。  
> 它应该只是一个极小、极硬、极稳定的 document mutation runner。

这才是 Dataview 和 Whiteboard 共同可长期复用的最终 shared foundation。

---

## 9. 当前落地状态

本文方案现已按最终态落地，且未保留兼容层。

### 9.1 `shared/reducer` 已完成收口

已删除：

- `stop()`
- `ctx.issue()`
- `ctx.require()`
- `ctx.write()`
- `ctx.inverse(op)`
- `ctx.footprintMany(...)`
- `spec.validate()`
- `spec.handlers`
- `spec.emptyExtra()`
- `result.forward`
- `result.issues`

已保留：

- `origin`
- `doc()`
- `replace(doc)`
- `inverseMany(ops)`
- `footprint(key)`
- `fail(error)`
- `createContext`
- `beforeEach`
- `handle`
- `settle`
- `done`

### 9.2 `shared/reducer/src` 已清理

已删除文件：

- `shared/reducer/src/mutationContext.ts`
- `shared/reducer/src/mutationTx.ts`
- `shared/reducer/src/operationBuffer.ts`
- `shared/reducer/src/historyFootprint.ts`
- `shared/reducer/src/internalDraft.ts`

`shared/reducer/src/index.ts` 现仅暴露：

- `Reducer`
- `ReducerContext`
- `ReducerResult`
- `ReducerSpec`

### 9.3 `shared/mutation` 已同步

`MutationEngine` 不再依赖 reducer 返回 `forward`。

当前规则已经改为：

- reducer 只返回 `doc / inverse / footprint / extra`
- `write.forward` 直接来自 commit 输入 `ops`

这意味着 `forward` 已明确回到 engine 层，不再是 reducer 责任。

### 9.4 Dataview 已对齐

Dataview 写入侧已经对齐到最终 reducer 形态：

- `dataview/packages/dataview-core/src/mutation/spec.ts`
- `dataview/packages/dataview-engine/src/mutation/spec.ts`

当前 Dataview reducer 只依赖：

- `createContext`
- `beforeEach`
- `handle`
- `done`

同时 `dataview/packages/dataview-core/test/operation.test.ts` 已去掉对 reducer `forward` 的依赖。

### 9.5 Whiteboard 已对齐

Whiteboard 已完成以下清理：

- lock 校验迁出 shared reducer，改为 whiteboard 本地 wrapper
- `document.replace` 独占 batch 规则迁到 whiteboard 本地 wrapper
- shared reducer `handlers` 机制删除后，whiteboard 改为本地 `handle(ctx, op)` 分派
- `document.replace` 不再依赖 `stop()`
- `WhiteboardReduceCtx` 已删除 `base / issue / stop`
- `WhiteboardInverse` 已收缩为 `prepend / prependMany`
- `createEmptyWhiteboardReduceExtra()` 已删除
- `shortCircuit` 已删除
- reducer finalize 改为统一提交 `state.draft`

当前 Whiteboard reducer 语义已经稳定为：

- 整批成功，提交整批
- 任一失败，整批失败
- 不再允许“成功但中途停止”

### 9.6 验证状态

已通过的验证包括：

- `pnpm --filter @shared/reducer run typecheck`
- `pnpm --filter @shared/reducer run test`
- `pnpm --filter @shared/mutation run typecheck`
- `pnpm --filter @shared/mutation run test`
- `pnpm -C dataview run typecheck:packages`
- `pnpm -C dataview --filter @dataview/engine run test`
- `pnpm -C whiteboard run typecheck`
- `pnpm -C whiteboard run test:core`
- `pnpm -C .. --filter @whiteboard/engine run test`（在 `whiteboard/` 目录下执行）

结论：本文定义的 `shared/reducer` 最终极简内核已经完成代码落地，并且上下游已同步到位。

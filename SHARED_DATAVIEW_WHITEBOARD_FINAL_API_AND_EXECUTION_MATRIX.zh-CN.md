# Shared / Dataview / Whiteboard 长期最优 API 与剩余实施矩阵

状态：

1. 本文档只保留长期最优的最终边界与剩余实施项。
2. 已完成并已冻结的事项不再展开阶段细节。
3. “从 `@shared/mutation` root 移走”不等于“从 shared 移走”。
4. 纯机械原语必须继续 shared；只有业务语义层才下沉到 dataview / whiteboard。

## 1. 长期最优硬规则

| 规则 | 结论 |
| --- | --- |
| R1 | shared 的目标不是“越少越好”，而是“只公开真正跨域复用的稳定原语”。 |
| R2 | 纯机械原语必须继续 shared；禁止为了减少 shared 而把同一 primitive 复制到 dataview / whiteboard。 |
| R3 | root shrink 只收 facade，不收实现所有权；错误包里的 shared primitive 必须迁到正确 shared 层，而不是业务侧本地化。 |
| R4 | 公共装配统一为 plain object spec + 字符串 key；builder / register / schema factory 不进入最终 API。 |
| R5 | 业务语义 spec 留在上层；shared 只提供承载这些 spec 的机械 runtime。 |
| R6 | 结构内部可以继续使用 `Path`；业务公共 contract 不再把 mutation 风格 `Path` 当作领域 API 暴露。 |
| R7 | 任何 shrink 必须先消灭所有真实复用点，禁止先删 shared facade、再让下游补本地 adapter。 |
| R8 | 上层只面向 engine/spec contract 编程，不面向 helper 编程；`compile` / `planningContext` 这类 helper 不进入最终 public API。 |

## 2. 已完成并冻结

下列项已经达到目标，后续不再作为收尾重点：

| Package / 能力 | 最终状态 |
| --- | --- |
| `@shared/trace` | 已独立为 shared mechanical primitive，业务 trace spec 留在 dataview / whiteboard。 |
| `@shared/delta` publish/sync glue | `publishStruct`、`publishEntityList`、`createEntityDeltaSync` 不再属于 shared root 长期能力。 |
| `@shared/projection` root | 以 authoring contract + `createProjectionRuntime` 为最终公开面。 |

## 3. 最终 shared 分层

### 3.1 保持现状并继续公开

| Package | 最终公开面 | 说明 |
| --- | --- | --- |
| `@shared/spec` | `walkSpec`、`createTableIndex`、`createOneToOneIndex`、`createOneToManyIndex`、`splitDotKey`、`joinDotKey` | 最终稳定机械层。 |
| `@shared/trace` | `trace`、`TraceSpec`、`TraceCount`、`TraceCountInput`、`TraceFact`、`TraceSnapshot` | 机械 trace 原语继续 shared。 |
| `@shared/delta` | `change`、`idDelta`、`entityDelta`、`projectListChange`、`writeEntityChange` | delta 原语继续 shared。 |
| `@shared/projection` | `createProjectionRuntime`、`ProjectionSpec`、`ProjectionPlan`、`ProjectionTrace`、`ProjectionValueField`、`ProjectionFamilyField`、`ProjectionFamilySnapshot`、`ScopeSchema`、`ScopeInputValue`、`ScopeValue`、`Revision` | projection authoring contract 继续 shared。 |
| `@shared/core` | 当前 surface 冻结 | 本轮不做 root shrink，只禁止继续扩大。 |

### 3.2 必须继续 shared，但不能再挂在错误层

| 能力 | 当前归属 | 最终归属 | 结论 |
| --- | --- | --- | --- |
| compile primitive | `@shared/mutation` | shared internal | 它是通用 compile runner，但不该作为上层 public helper 暴露。 |
| planning context | `@shared/mutation` | shared internal | 它是通用 planning / validation context，但不该作为上层 public helper 暴露。 |
| `Path` / `PathKey` / path helpers | `@shared/mutation` 与 `@shared/draft` 各有一套 | 统一到 `@shared/draft` | `Path` 是 shared structural primitive，不该作为 mutation 专属概念存在。 |
| record path patch primitive | `@shared/mutation` | 迁到 `@shared/draft` | 它基于 `draft.path`，本质是 shared structural patch primitive。 |
| history controller primitive | `@shared/mutation` | shared internal，可不再 root public | 它仍然属于 shared 能力，不应复制到业务层。 |

### 3.3 必须退出 shared root，且不再作为 shared 公共能力

| 能力 | 最终状态 | 原因 |
| --- | --- | --- |
| dataview / whiteboard trace facts 与 summary shape | 留在业务层 | 这些是业务语义，不是 shared primitive。 |
| `publishStruct` / `publishEntityList` / `createEntityDeltaSync` | 留在业务层 | 这些是 publish / sync glue。 |
| whiteboard history footprint grammar | 留在 whiteboard-core | 这是 whiteboard 领域冲突语义。 |
| dataview / whiteboard compile handlers | 留在各自 core | 这是各自 intent lowering 语义。 |

## 4. `@shared/mutation` 长期最优边界

### 4.1 最终保留为 public root 的能力

| 类别 | 符号 |
| --- | --- |
| engine | `createMutationEngine`、`CommandMutationEngine` |
| history port | `createHistoryPort`、`HistoryPort` |
| compile contract | `MutationCompileInput`、`MutationCompileResult`、`MutationCompileIssue`、`MutationCompileCtx` |
| engine contract | `MutationOperationsSpec`、`MutationPublishSpec`、`MutationResult`、`MutationFailure`、`MutationOptions`、`MutationError`、`MutationExecuteInput`、`MutationExecuteResult`、`MutationExecuteResultOfInput`、`MutationIntentKind`、`MutationIntentOf`、`MutationIntentTable`、`MutationOutputOf`、`CommandMutationSpec` |
| write / collab contract | `ApplyCommit`、`CommitRecord`、`CommitStream`、`Origin` |

### 4.2 必须退出 `@shared/mutation` root 的能力

| 能力 | 最终状态 |
| --- | --- |
| `compile` helper namespace | 删除 root public；如仍需要，保留 shared internal。 |
| `planningContext` helper namespace | 删除 root public；如仍需要，保留 shared internal。 |
| `path` / `Path` / `PathKey` | 迁到 `@shared/draft` 并统一为唯一结构路径 primitive。 |
| `record` | 迁到 `@shared/draft`，不再作为 mutation root 能力。 |
| `meta` helper namespace | 删除 root public；如果仍需要冻结/查询 helper，只保留 internal。 |
| `history` helper namespace | 删除 root public；controller 可继续 shared internal。 |

### 4.3 最终公开 API 形态

最终上层只写 engine spec，不再 import helper。

```ts
type MutationCompileIssue<Code extends string = string> = {
  code: Code
  message: string
  path?: string
  severity?: 'error' | 'warning'
  details?: unknown
}

type MutationCompileCtx<
  Doc,
  Op,
  Code extends string = string
> = {
  doc(): Doc
  emit(op: Op): void
  emitMany(...ops: readonly Op[]): void
  issue(issue: MutationCompileIssue<Code>): void
  require<T>(
    value: T | undefined,
    issue: MutationCompileIssue<Code>
  ): T | undefined
  stop(): { kind: 'stop' }
  block(issue: MutationCompileIssue<Code>): { kind: 'block' }
}

type MutationCompileInput<
  Doc,
  Intent
> = {
  doc: Doc
  intents: readonly Intent[]
}

type MutationCompileResult<
  Op,
  Output = void,
  Code extends string = string
> = {
  ops: readonly Op[]
  outputs: readonly Output[]
  issues?: readonly MutationCompileIssue<Code>[]
  canApply?: boolean
}

type CommandMutationSpec<
  Doc,
  Table,
  Op,
  Key,
  Publish,
  Cache,
  Extra,
  Code extends string = string
> = {
  normalize(doc: Doc): Doc
  compile(input: MutationCompileInput<Doc, MutationIntentOf<Table>>): MutationCompileResult<
    Op,
    MutationOutputOf<Table>,
    Code
  >
  operations: MutationOperationsSpec<Doc, Op, Key, Extra, any, Code>
  publish: MutationPublishSpec<Doc, Op, Key, Extra, Publish, Cache>
  history?: false | {
    capacity?: number
    track?(input: {
      origin: Origin
      ops: readonly Op[]
    }): boolean
    clear?(input: {
      origin: Origin
      ops: readonly Op[]
    }): boolean
  }
}
```

结论：

1. 上层 public API 只暴露 compile callback contract。
2. `compile(...)` helper 与 `planningContext(...)` helper 不再作为 public 概念存在。
3. engine 内部是否继续使用 shared compile/planning helper，属于 shared internal 实现细节。

### 4.4 不需要继续公开的 `meta`

`meta` 需要拆成两层：

| 层 | 最终状态 |
| --- | --- |
| `sync?: 'live' | 'checkpoint'`、`history?: boolean` 字段语义 | 保留在 operation spec literal table 中。 |
| `meta.create` / `meta.family` / `meta.get` / `meta.isLive` / `meta.tracksHistory` | 退出 root public；如仍需要，保留为 shared internal helper。 |

结论：

1. `OpSync` 不需要作为独立 root helper 继续暴露。
2. 如果仍需要类型名，可改成 `type MutationSync = 'live' | 'checkpoint'`，并直接挂在 `@shared/mutation` 的稳定 contract 上。
3. helper namespace 本身不再属于最终公开面。

## 5. `@shared/draft` 长期最优边界

`@shared/draft` 必须成为唯一的 shared structural patch layer。

### 5.1 最终公开面新增

| 能力 | 最终状态 |
| --- | --- |
| `Path` / `PathKey` | 由 `@shared/draft` 提供唯一导出。 |
| path helper | 在现有 `draft.path.get/set/unset` 基础上补齐 `root`、`of`、`eq`、`startsWith`、`overlaps`、`append`、`parent`、`toString`。 |
| record path patch primitive | 从 `@shared/mutation.record` 迁入 `@shared/draft`，作为结构 patch 原语公开。 |

### 5.2 最终约束

1. 仓库内不再存在第二套 shared `Path` 实现。
2. whiteboard 的 record patch、schema default、history key 冲突判断全部基于 `@shared/draft`。
3. dataview / whiteboard 不再从 `@shared/mutation` 读取结构路径与 record patch 能力。

## 6. dataview / whiteboard 的长期最优边界

### 6.1 dataview

| 类别 | 最终状态 |
| --- | --- |
| trace spec | 继续留在 `dataview-core`。 |
| compile handlers | 继续留在 `dataview-core`。 |
| compile callback contract | 继续从 `@shared/mutation` 复用。 |
| compile / planning helper 实现 | 不作为上层 public API 使用。 |
| operation sync/history 字段 | 直接写在 dataview operation definition literal table。 |

### 6.2 whiteboard

| 类别 | 最终状态 |
| --- | --- |
| trace spec | 继续留在 `whiteboard-core`。 |
| history footprint grammar | 继续留在 `whiteboard-core`。 |
| compile handlers | 继续留在 `whiteboard-core`。 |
| compile callback contract | 继续从 `@shared/mutation` 复用。 |
| compile / planning helper 实现 | 不作为上层 public API 使用。 |
| record path patch / path helpers | 改从 `@shared/draft` 读取，不再从 `@shared/mutation` 读取。 |

## 7. 剩余实施矩阵

这里只保留未完成项。

| 阶段 | 目标 | 必做项 | 完成标准 |
| --- | --- | --- | --- |
| A | 修正文档与包边界 | 把“从 mutation root 移走”改成“迁到正确 shared 层或业务层”；删除已完成阶段表述 | 文档只描述长期最优与剩余实施。 |
| B | 统一结构路径层 | 扩展 `@shared/draft.path` 成为唯一 `Path` primitive；删除 `@shared/mutation.path` root 能力 | 全仓不再从 `@shared/mutation` 读取 `path` / `Path` / `PathKey`。 |
| C | 迁移 record path patch | 把 `@shared/mutation.record` 迁到 `@shared/draft`；whiteboard 全量改读新位置 | 全仓不再从 `@shared/mutation` 读取 `record`。 |
| D | 固化 mutation final root | 保留 engine / compile callback contract / history port / engine contract；删除 root 上的 `compile` helper、`planningContext` helper、`meta` helper、`history` helper、结构路径层 | `@shared/mutation` root 只剩真正稳定共享的 mutation contract。 |
| E | 清理 operation meta helper | `sync` / `history` 字段直接落到 operation spec literal table；去掉 root public `meta` helper | 上层不再依赖 `meta.create/get/isLive/tracksHistory`。 |
| F | 最终联调 | shared、dataview、whiteboard 全量 typecheck、测试、bench、构建 | 仓库只保留本文档定义的最终边界。 |

## 8. 最终结论

长期最优不是“shared 越少越好”，而是：

1. 纯机械原语继续 shared。
2. shared primitive 必须放在正确 shared 层。
3. 业务语义 spec 留在业务层。
4. root facade 只公开真正稳定复用的 contract。

按这个标准，最终必须保留在 shared 的核心能力是：

1. spec walker / index primitive
2. trace primitive
3. delta primitive
4. projection authoring contract
5. mutation compile callback contract
6. shared internal compile / planning execution primitive
7. 唯一的 structural `Path` primitive
8. 唯一的 record path patch primitive
9. history port primitive

最终必须留在业务层的核心能力是：

1. dataview / whiteboard 的 trace spec
2. dataview / whiteboard 的 compile handlers
3. publish / sync glue
4. whiteboard history footprint grammar

这才是长期最优的 shared / local 分层。

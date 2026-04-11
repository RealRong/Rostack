# Shared 引擎基础设施下沉方案

## 目标

这份方案回答一个具体问题：

- 既然根目录已经有 `shared/` 作为统一基础设施层，那么 dataview 和 whiteboard 在以下方面，哪些值得下沉为共享基础设施，哪些不值得？

关注范围仅限：

- 命令入口的组织方式
- 事务边界命名
- perf trace 记录规范
- 调试接口
- 文档与 commit 元信息结构
- 错误返回模式

这份文档只给架构方案，不写代码。

## 先说结论

这六项里，可以下沉的东西分成三类：

1. 适合下沉为共享代码
2. 适合下沉为共享 schema / 约定 / helper
3. 不适合统一实现，只适合保留各自引擎形态

我的总判断是：

- `shared/` 适合承接“协议层基础设施”
- 不适合承接“完整引擎运行时”

更具体地说：

- 命令入口的“组织原则”可以统一，但“实际 API 形态”不该统一
- 事务边界的命名与元信息结构很适合统一
- perf trace 的公共协议和 runtime helper 很适合统一
- 调试接口非常适合统一成 shared 能力
- 文档与 commit 元信息结构适合统一 envelope，不适合统一 payload
- 错误返回模式适合统一基础协议，不适合强制统一最终结果形态

一句话总结：

- 可以统一的是“基础协议”
- 不该统一的是“引擎物理结构和对外 facade”

## 当前 shared 的现实边界

现在 `shared/core` 暴露的主要是通用基础设施：

- store
- equality
- scheduler

位置：

- [shared/core/src/index.ts](/Users/realrong/Rostack/shared/core/src/index.ts)

也就是说，当前 `shared/` 的角色是：

- 提供无领域偏见的底层能力

它还没有承接：

- engine transaction protocol
- perf trace schema
- debug snapshot API
- command/result envelope

所以如果要往 `shared/` 下沉，新增的也应该是这一层，而不是把 dataview 或 whiteboard 的 engine runtime 直接搬进去。

## 两个引擎当前在这六项上的现状

### dataview

dataview 当前已经有比较完整的统一事务形态：

- 单入口：`engine.command(command | command[])`
  - [createEngine.ts](/Users/realrong/Rostack/dataview/src/engine/api/createEngine.ts#L70)
- 单提交：`commit(plan) -> store.set(next)`
  - [commit.ts](/Users/realrong/Rostack/dataview/src/engine/write/commit.ts#L351)
- 完整 perf API：
  - [types.ts](/Users/realrong/Rostack/dataview/src/engine/types.ts#L221)
  - [runtime.ts](/Users/realrong/Rostack/dataview/src/engine/perf/runtime.ts)
- 验证 issue 模型：
  - [issues.ts](/Users/realrong/Rostack/dataview/src/engine/command/issues.ts)

dataview 其实已经长出了一套“engine protocol”。

### whiteboard

whiteboard 当前在这六项上更偏局部化：

- 命令入口是 `engine.execute(command)`，内部通过 switch 分发
  - [engine.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/instance/engine.ts)
- write 层还有一套 `write.apply({ domain, command })`
  - [write.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/types/write.ts#L17)
- commit 元信息较薄：
  - [commit.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/types/commit.ts)
- 错误模型是 `ok: false` + `error`
  - [result.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/types/result.ts)
- 目前没有完整公开 perf / debug 协议

whiteboard 的协议层还没有被系统性抽出来。

## 评估总表

### 1. 命令入口的组织方式

结论：

- 可以统一原则
- 不建议统一 runtime API 形态
- 适合下沉少量 helper/type，不适合下沉统一 builder

原因：

- dataview 的命令入口天然是“批量命令解析 + 单事务提交”
- whiteboard 的命令入口天然是“typed command -> domain write -> impact invalidate”

dataview 当前入口：

- `engine.command(command | command[])`
- facade 侧大量通过 `dispatch(command)` 转发
  - [fields.ts](/Users/realrong/Rostack/dataview/src/engine/facade/fields.ts#L25)
  - [view/index.ts](/Users/realrong/Rostack/dataview/src/engine/facade/view/index.ts#L229)

whiteboard 当前入口：

- `engine.execute(command)`
- editor runtime 上层再组织成 `document.node.move(...)` 这种细分 API
  - [runtime.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/document/runtime.ts)

这说明两者“入口分层”不一样：

- dataview 对外主入口是 command dispatcher
- whiteboard 对外主入口是 editor/document action facade

所以不应该试图统一成同一个入口函数签名。

适合共享的部分是：

- `CommandEnvelope` 的基础约定
- `CommandBatch` 的类型 helper
- `CommandMeta` 结构
- command id / correlation id / source / timestamp 这类元字段

不适合共享的部分是：

- facade runtime
- command resolver runtime
- whiteboard 的 `execute` switch
- dataview 的 `command(command[])` 语义

建议下沉结果：

- `shared/engine-protocol/command.ts`

只提供：

- 基础命令 envelope 类型
- batch 类型
- command meta 类型
- 可选的 helper：`asArray(input)`

不提供：

- 统一 dispatcher 实现

### 2. 事务边界命名

结论：

- 非常适合下沉成共享协议

这是这六项里最应该统一的一项。

当前差异：

- dataview 用 `dispatch / undo / redo / replace`
  - [types.ts](/Users/realrong/Rostack/dataview/src/engine/types.ts#L223)
- whiteboard 用 `apply / undo / redo / replace`
  - [commit.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/types/commit.ts)

这类差异本身不大，但它会污染：

- trace kind
- commit kind
- 调试日志
- 埋点统计
- 外层 tooling

我的建议是统一成共享事务词汇表：

- `commit.kind`
  - `dispatch`
  - `undo`
  - `redo`
  - `replace`
- 如 whiteboard 需要保留 `apply` 语义，可作为内部别名映射到 `dispatch`

也就是说：

- 内部实现名可以不同
- 对外 trace / debug / metadata / tooling 层统一用一套 canonical 名称

建议下沉结果：

- `shared/engine-protocol/transaction.ts`

定义：

- `TransactionKind`
- `TransactionMeta`
- `TransactionClock`
- `TransactionSource`

### 3. perf trace 记录规范

结论：

- 非常适合下沉
- 但应分成“通用 trace 核心”和“引擎自定义 payload”

dataview 现在已经有一整套 perf trace 结构：

- `CommitTrace`
- `EnginePerfApi`
- `PerfStats`
- `RunningStat`
  - [types.ts](/Users/realrong/Rostack/dataview/src/engine/types.ts#L221)
  - [runtime.ts](/Users/realrong/Rostack/dataview/src/engine/perf/runtime.ts)

whiteboard 目前没有同等级公开 perf 协议。

这里完全值得下沉，因为 perf runtime 里很多东西本来就是跨引擎通用的：

- trace buffer
- capacity 管理
- clone / snapshot 保护
- running stat 累计
- stats clear / trace clear
- `now()` helper

当前 `now()` 已经在 dataview 自己维护一份：

- [shared.ts](/Users/realrong/Rostack/dataview/src/engine/perf/shared.ts)

whiteboard 里也单独维护了一份近似逻辑：

- [write/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/write/index.ts#L28)

这已经说明 perf 基础工具可以共享。

但 trace payload 不应完全统一，因为两边阶段不同：

- dataview 有 index/project/publish
- whiteboard 更可能是 translate/reduce/normalize/read-sync/publish

所以推荐拆成两层：

1. shared trace core
- `TraceStore<T>`
- `TraceBuffer`
- `StatsAccumulator`
- `RunningStat`
- `PerfClock`

2. engine-specific trace schema
- dataview 继续定义自己的 trace payload
- whiteboard 将来定义自己的 trace payload

建议下沉结果：

- `shared/engine-perf/core.ts`
- `shared/engine-perf/types.ts`

统一：

- trace buffer runtime
- stats runtime
- now/clock helper
- base trace envelope

不统一：

- dataview / whiteboard 的阶段细节

### 4. 调试接口

结论：

- 很适合下沉成共享协议层
- 也适合做少量共享 runtime helper

当前现状：

- dataview 已经有比较强的 perf trace/debug 倾向
- whiteboard 目前几乎没有统一 debug API

这说明 shared 层可以成为“调试接口标准化”的落点。

这里推荐统一的不是某个引擎的内部 state 结构，而是调试面的接口语义。

建议统一的能力：

- `debug.snapshot()`
- `debug.trace.last()`
- `debug.trace.list()`
- `debug.inspectTransaction(id)`
- `debug.inspectStores()` 或 `debug.inspectSignals()`
- `debug.export()` 用于序列化调试信息

但 snapshot 内容必须允许引擎自定义：

- dataview snapshot 关注 `doc/index/project/history`
- whiteboard snapshot 关注 `document/read/index/projection/commit`

因此 shared 更适合提供：

- debug API 形状
- debug snapshot envelope
- debug registry / named section helper

而不是统一 snapshot payload。

建议下沉结果：

- `shared/engine-debug/types.ts`
- `shared/engine-debug/runtime.ts`

### 5. 文档与 commit 元信息结构

结论：

- 适合统一 envelope
- 不适合统一 document payload 和变更 payload

当前差异：

- dataview 的提交结果核心是 `CommitResult`
  - `issues`
  - `applied`
  - `changes?: CommitDelta`
  - [types.ts](/Users/realrong/Rostack/dataview/src/engine/types.ts#L59)
- whiteboard 的 commit 是：
  - `kind`
  - `document`
  - `changes`
  - `impact?`
  - [commit.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/types/commit.ts)

dataview 的 “变更语义” 很强：

- delta summary
- entities touched
- semantic draft

whiteboard 的 “变更语义” 更偏：

- change set
- read impact
- document snapshot

所以不应该统一成一个完全相同的 commit payload。

但元信息层非常适合统一：

- `id`
- `kind`
- `source`
- `origin`
- `timestamp`
- `durationMs`
- `correlationId`
- `applied`
- `revision`

也就是说，适合共享的是：

- `CommitMeta`
- `TransactionMeta`
- `CommitEnvelope<TPayload>`

不适合共享的是：

- `CommitDelta`
- `KernelReadImpact`
- `ChangeSet`
- `Document` 本体

建议下沉结果：

- `shared/engine-protocol/commit.ts`

### 6. 错误返回模式

结论：

- 可以统一最低层协议
- 不应该强制统一最终结果模型

这是最容易“看着像一回事，实则不是一回事”的部分。

当前差异很大：

dataview：

- 倾向于“命令可被部分验证”
- 返回 `issues[]`
- `applied: boolean`
- warning/error 可以共存
  - [issues.ts](/Users/realrong/Rostack/dataview/src/engine/command/issues.ts)
  - [public/command.ts](/Users/realrong/Rostack/dataview/src/engine/api/public/command.ts)

whiteboard：

- 倾向于“命令成功，或失败/取消”
- `ok: true | false`
- 失败时给 `error.code/message/details`
  - [types/result.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/types/result.ts)
  - [result.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/result.ts)

这背后的语义不同：

- dataview 的 issue 更像 validation/reporting channel
- whiteboard 的 error 更像 command execution outcome

所以不应该强行把两者收敛成一个完全相同的最终返回值。

但可以共享一个更低层的“诊断协议”：

- `Diagnostic`
- `DiagnosticSeverity`
- `DiagnosticCode`
- `DiagnosticPath`
- `DiagnosticOrigin`

然后：

- dataview 的 `ValidationIssue` 可以映射到 `Diagnostic`
- whiteboard 的 `ErrorInfo` 也可以映射到 `Diagnostic`

再上一层，各自保留自己的结果模型：

- dataview 保留 `issues + applied`
- whiteboard 保留 `ok + error | commit`

建议下沉结果：

- `shared/engine-protocol/diagnostic.ts`

## 推荐的 shared 下沉边界

基于上面的判断，我建议不要把这些东西直接塞进 `shared/core`，而是新增一个更明确的 shared 子域。

推荐结构：

```txt
shared/
  core/
  engine-protocol/
    src/
      command.ts
      transaction.ts
      commit.ts
      diagnostic.ts
      debug.ts
      index.ts
  engine-perf/
    src/
      clock.ts
      traceBuffer.ts
      stats.ts
      types.ts
      index.ts
```

原因：

- `shared/core` 继续保持无领域偏见
- engine 相关协议不要污染最底层核心包
- perf 可以被 engine 以外的运行时复用，但语义上仍属于运行时基础设施

## 每一项最终建议

### 适合做成共享代码

- perf clock / `now()`
- trace buffer
- stats accumulator
- running stat
- debug registry / debug snapshot helper
- command batch helper
- commit / transaction metadata builder

### 适合做成共享 schema 或 type

- command meta
- transaction kind canonical enum
- commit meta
- debug API shape
- diagnostic protocol
- trace envelope base type

### 不建议做成共享 runtime

- dataview `engine.command(...)` runtime
- whiteboard `engine.execute(...)` runtime
- dataview command resolver pipeline
- whiteboard translate / reduce / invalidate pipeline
- dataview / whiteboard 的 commit payload 本体
- dataview / whiteboard 的 facade/action 层

## 分阶段落地建议

### 第一阶段：先下沉无争议协议

先做：

- `TransactionKind`
- `TransactionMeta`
- `CommitMeta`
- `Diagnostic`
- perf `now()`
- trace buffer / stats runtime

这是争议最小、复用收益最高的一层。

### 第二阶段：让 dataview 先迁移

dataview 当前协议化程度更高，适合作为第一个接入方：

- perf runtime 改用 shared trace core
- public perf type 对齐 shared base schema
- issue type 增加到 shared diagnostic 的映射
- commit trace kind 对齐 shared transaction kind

原因：

- dataview 已经有完整 perf/trace API
- 改造路径短

### 第三阶段：whiteboard 补协议后再接入

whiteboard 目前更缺的是：

- commit meta
- perf trace protocol
- debug API

所以它不适合直接“迁移”，而适合：

1. 先补本地协议层
2. 再和 shared 协议对齐

这样不会把 whiteboard 的增量投影模型误伤。

## 不该做的事

### 1. 不要试图做统一 Engine 接口

不要做这种 shared 抽象：

- `SharedEngine`
- `SharedCommandEngine`
- `BaseEngineRuntime`

原因很简单：

- dataview 和 whiteboard 的运行时物理结构不同
- 强行抽象只会把 shared 变成最低公分母

### 2. 不要统一最终 CommandResult 形态

不要强迫：

- dataview 改成 `ok/error`
- whiteboard 改成 `issues/applied`

这不是共享，而是破坏语义。

### 3. 不要把 commit payload 硬统一

不要试图定义：

- 一个共享 `CommitPayload`

因为：

- dataview 的 delta 语义和 whiteboard 的 impact/change set 不是一类东西

可以统一 meta，不要统一 body。

## 最终结论

这六项里，最值得下沉的是：

- 事务边界命名
- perf trace 核心运行时
- 调试接口协议
- commit / transaction 元信息
- diagnostic 基础协议

相对不适合下沉统一 runtime 的是：

- 命令入口的实际 API 形态
- 最终错误返回形态
- 各自的 commit payload

所以 shared 的正确角色应该是：

- 做“引擎协议层基础设施”
- 做“trace/debug/diagnostic 基础设施”
- 不做“统一引擎运行时”

一句话收尾：

能共享的是协议、元信息和工具层。

不该共享的是 dataview 和 whiteboard 各自为了本域性能而长出来的运行时骨架。

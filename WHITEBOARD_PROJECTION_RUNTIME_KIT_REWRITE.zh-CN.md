# Whiteboard Projection Runtime Kit 重写方案

本文对应统一重构的第三步：

- 建设通用 projection runtime kit

本文不讨论兼容方案，不讨论低风险迁移，不讨论双轨保留。

本文只回答一个问题：

如果按一步到位的方式，建设一个可以同时服务 `whiteboard-editor-graph`、`dataview` 这类投影型系统的通用 runtime kit，整体设计和实施顺序应该是什么。

本文默认前提：

- 第一阶段 contract 已按 [WHITEBOARD_RUNTIME_CONTRACTS.zh-CN.md](/Users/realrong/Rostack/WHITEBOARD_RUNTIME_CONTRACTS.zh-CN.md) 冻结
- 第二阶段 `whiteboard-engine` 已按 [WHITEBOARD_ENGINE_REWRITE.zh-CN.md](/Users/realrong/Rostack/WHITEBOARD_ENGINE_REWRITE.zh-CN.md) 收敛成 committed `DocumentEngine`
- 不保留旧 `EngineRead`
- 不保留旧 editor query/layout/read 链
- 不保留“共享 store 工具箱”式的过渡方案

---

## 1. 目标

第三步的唯一目标是建设一个真正可复用的 projection runtime 基础层。

它必须满足四件事：

1. 为任意投影型系统提供显式 phase runtime
2. 为任意投影型系统提供单次 publish 的 `snapshot + change + trace`
3. 为任意投影型系统提供 apply-only 的 source sync 基元
4. 为任意投影型系统提供 deterministic harness，保证运行时容易验证、容易调试

一句话概括：

> 第三步要抽出的不是“几个通用 store helper”，而是一个真正的 projection runtime kernel。

---

## 2. 非目标

下面这些都不是通用 runtime kit 的职责：

- whiteboard 的 graph 语义
- whiteboard 的 mindmap layout 语义
- whiteboard 的 selection / chrome / scene 语义
- dataview 的 section / item / summary 语义
- engine committed facts 语义
- DOM / React / Canvas 适配
- `shared/core/store` 这种具体状态库的耦合实现
- 任何 UI hook、selector、derived store

这意味着通用 kit 负责“怎么跑 runtime”，不负责“runtime 具体算什么”。

---

## 3. 核心判断

### 3.1 当前真正值得复用的，不是 store API

whiteboard 和 dataview 的共性，不在于：

- 都用了 `store`
- 都有 keyed read
- 都有 derived read
- 都有 source/runtime 这种旧式目录

真正的共性在于：

1. 都有 committed truth 和 projection truth 的分层
2. 都需要一次输入变化只发布一次最终 snapshot
3. 都需要显式 phase 执行顺序
4. 都需要精确 change，而不是 adapter 重新猜 diff
5. 都需要 sink-local source sync
6. 都需要 deterministic test harness

因此，长期最优必须抽出的，是 `projection runtime kernel`，不是“基于现有 store 习惯再做一层共享封装”。

### 3.2 这一步必须做成共享包，而不是 whiteboard 内部工具

如果第三步仍然把通用能力留在 `whiteboard/packages/whiteboard-editor-graph` 内部：

- dataview 后续还会再抄一套
- 通用边界仍然会被 whiteboard 语义反向塑形
- “哪里是领域逻辑，哪里是 runtime 机制”会重新混掉

因此长期最优必须是：

- 把共享 runtime kit 提到 `shared/`
- whiteboard 和 dataview 都作为这个包的消费者
- 任何领域语义都留在各自 runtime 包中

### 3.3 kit 必须是 core + adapter 模型，而不是 runtime + store 混合模型

这一点和 dataview 已经明确的方向完全一致：

- core 内部维护普通运行时状态
- core 每次 update 只产出一份新的 `snapshot`
- core 每次 update 只产出一份精确的 `change`
- source / store / renderer / event 都是 adapter
- adapter 只能 apply `change`，不能再自己 diff `previousSnapshot / nextSnapshot`

这条原则如果不作为 kit 的硬约束，whiteboard 和 dataview 后面都会重新长回旧问题。

---

## 4. 最终包边界

### 4.1 最终位置

长期最优建议直接建设新的共享包：

```text
shared/projection-runtime/
```

包名建议固定为：

```text
@shared/projection-runtime
```

理由：

- 它不是 whiteboard 私有能力
- 它不是 dataview 私有能力
- 它不属于 React、DOM、Canvas
- 它是 runtime 基础设施，和 `@shared/core`、`@shared/react` 同层才合理

### 4.2 最终依赖方向

最终依赖关系应为：

```text
@whiteboard/engine
        \
         -> @whiteboard/editor-graph -> @whiteboard/editor -> @whiteboard/react
        /
@shared/projection-runtime

@dataview/engine
        \
         -> @dataview/runtime
        /
@shared/projection-runtime
```

要点非常明确：

- `@shared/projection-runtime` 不依赖 whiteboard
- `@shared/projection-runtime` 不依赖 dataview
- whiteboard / dataview 各自提供 domain-specific phase、working schema、publisher、source mapping

### 4.3 最终职责

`@shared/projection-runtime` 只负责下面这些通用机制：

- runtime 生命周期
- phase orchestrator
- dirty planner shell
- working state 生命周期
- publish pipeline
- stable reference reuse
- source sync primitives
- trace / perf 记录
- deterministic harness

---

## 5. 最终公开模型

长期最优建议把 kit 的公共语言收成 6 组：

1. `core`
2. `runtime`
3. `phase`
4. `source`
5. `trace`
6. `testing`

这里不需要引入 TypeScript `namespace`。

最终代码仍应使用 ES module 文件组织。

### 5.1 `runtime` contract

通用 kit 的最核心 contract 是 `runtime.Spec` 和 `runtime.Instance`。

建议：

```ts
export interface Spec<
  TInput,
  TInputChange,
  TWorking,
  TSnapshot,
  TChange,
  TPhaseName extends string,
  TDirty = never
> {
  createWorking(): TWorking
  createSnapshot(): TSnapshot
  planner: Planner<TInputChange, TSnapshot, TPhaseName, TDirty>
  publisher: Publisher<TWorking, TSnapshot, TChange>
  phases: readonly phase.Spec<
    TPhaseName,
    Context<TInput, TWorking, TSnapshot, TDirty>
  >[]
}

export interface Instance<
  TInput,
  TInputChange,
  TSnapshot,
  TChange
> {
  snapshot(): TSnapshot
  update(input: TInput, change: TInputChange): Result<TSnapshot, TChange>
  subscribe(listener: (result: Result<TSnapshot, TChange>) => void): () => void
}

export interface Result<TSnapshot, TChange> {
  snapshot: TSnapshot
  change: TChange
  trace: trace.Run
}
```

这几个判断很关键：

- `Instance` 不暴露内部 `WorkingState`
- `update()` 是唯一驱动入口
- 每次 `update()` 只产出一份最终 `Result`
- `subscribe()` 也只在 publish 完成后触发一次

### 5.2 `runtime.Planner`

dirty planning 是通用机制，但 dirty 的具体语义是领域定义。

建议：

```ts
export interface Planner<
  TInputChange,
  TSnapshot,
  TPhaseName extends string,
  TDirty = never
> {
  plan(input: {
    change: TInputChange
    previous: TSnapshot
  }): Plan<TPhaseName, TDirty>
}

export interface Plan<TPhaseName extends string, TDirty = never> {
  phases: ReadonlySet<TPhaseName>
  dirty?: ReadonlyMap<TPhaseName, ReadonlySet<TDirty>>
}
```

这样做的意义是：

- dirty planner 是通用壳
- dirty token 的定义权留给 whiteboard / dataview
- kit 只关心“哪些 phase 要跑，phase 拿到哪些 dirty token”

长期最优不要让通用 kit 试图定义：

- `node.changed`
- `section.changed`
- `scene.changed`

这些必须留在领域 runtime。

### 5.3 `phase` contract

phase 本身在第一阶段已经冻结，但 kit 需要一个真正能执行的通用上下文。

建议：

```ts
export interface Context<
  TInput,
  TWorking,
  TSnapshot,
  TDirty = never
> {
  input: TInput
  previous: TSnapshot
  working: TWorking
  dirty?: ReadonlySet<TDirty>
}

export interface Spec<TName extends string, TContext> {
  name: TName
  deps: readonly TName[]
  run(context: TContext): Result
}
```

其中 `phase.Result` 保持非常轻：

- `action`
- `change`
- `metrics`

phase 不直接 publish，不直接通知外部，不直接写 source。

### 5.4 `runtime.Publisher`

publisher 是 kit 里最重要、也最容易被做错的一层。

建议：

```ts
export interface Publisher<TWorking, TSnapshot, TChange> {
  publish(input: {
    revision: number
    previous: TSnapshot
    working: TWorking
  }): {
    snapshot: TSnapshot
    change: TChange
  }
}
```

publisher 负责三件事：

1. 从 working state 组装 publish-ready snapshot
2. 做 stable reference reuse
3. 生成 authoritative change

这里必须明确：

- `change` 的定义权在 publisher
- source adapter 不能再自己推导 change
- 引用复用也必须在 publisher 决定，不能交给下游 sink 猜

### 5.5 `source` contract

source 的职责是把 authoritative `snapshot + change` 同步给具体 sink。

kit 里建议只保留最小同步 contract：

```ts
export interface Input<TSnapshot, TChange, TSink> {
  previous: TSnapshot
  next: TSnapshot
  change: TChange
  sink: TSink
}

export interface Sync<TSnapshot, TChange, TSink> {
  sync(input: Input<TSnapshot, TChange, TSink>): void
}
```

在此基础上，kit 只提供几类通用 primitive：

- value sync
- family sync
- list sync
- event sync
- compose sync

但不提供：

- `shared/core/store` 的直接实现
- React hook
- DOM 事件适配

这些都应该留在 consumer adapter 层。

### 5.6 `trace` 与 `testing`

trace 和 testing 必须从第一版就是正式公共能力，而不是调试时临时拼接。

建议：

```ts
export interface Run {
  revision: number
  phases: readonly Phase[]
  totalMs: number
}

export interface Harness<
  TInput,
  TInputChange,
  TSnapshot,
  TChange
> {
  snapshot(): TSnapshot
  update(input: TInput, change: TInputChange): runtime.Result<TSnapshot, TChange>
  lastTrace(): trace.Run | undefined
}
```

这会直接决定后续 whiteboard 和 dataview 是否能做稳定回归测试。

---

## 6. kit 的内部结构

建议直接收成下面 6 个内部子域：

1. `contracts`
2. `runtime`
3. `dirty`
4. `publish`
5. `source`
6. `testing`

### 6.1 `contracts`

职责：

- 对外稳定类型
- 定义 kit 自己的通用语言

建议文件：

```text
src/contracts/
  core.ts
  runtime.ts
  phase.ts
  source.ts
  trace.ts
  testing.ts
```

### 6.2 `runtime`

职责：

- runtime state
- phase scheduling
- update loop
- publish orchestration
- listener 管理

建议文件：

```text
src/runtime/
  createRuntime.ts
  state.ts
  update.ts
  publish.ts
```

### 6.3 `dirty`

职责：

- dirty plan 标准结构
- phase dirty merge
- dep fanout
- dirty set helpers

建议文件：

```text
src/dirty/
  plan.ts
  set.ts
  fanout.ts
```

### 6.4 `publish`

职责：

- stable reference reuse helper
- family/value/list publish helper
- authoritative change compose helper

建议文件：

```text
src/publish/
  value.ts
  family.ts
  list.ts
  change.ts
```

### 6.5 `source`

职责：

- sink-local apply primitives
- sync composition
- source fixture helpers

建议文件：

```text
src/source/
  value.ts
  family.ts
  list.ts
  event.ts
  compose.ts
```

### 6.6 `testing`

职责：

- deterministic harness
- fake sink
- trace assertion helper
- publish assertion helper

建议文件：

```text
src/testing/
  harness.ts
  fakeSink.ts
  assert.ts
```

---

## 7. 核心运行时模型

### 7.1 内部状态

长期最优的 kit 内部状态不应该使用 `store` 作为内部语言。

建议：

```ts
type RuntimeState<
  TInput,
  TWorking,
  TSnapshot,
  TPhaseName extends string,
  TDirty = never
> = {
  revision: number
  input?: TInput
  working: TWorking
  snapshot: TSnapshot
  phase: {
    order: readonly TPhaseName[]
    dirty?: ReadonlyMap<TPhaseName, ReadonlySet<TDirty>>
  }
  listeners: Set<(result: runtime.Result<TSnapshot, unknown>) => void>
}
```

真正关键的是这几条：

- `working` 是内部唯一可变工作区
- `snapshot` 是对外唯一已发布真相
- `phase.dirty` 只服务当前这轮 update
- 外部读不到任何中间态

### 7.2 单轮 update 流程

kit 的主流程应该固定为：

```text
receive input
  -> planner.plan()
  -> expand phase fanout
  -> run phases in topo order
  -> publisher.publish()
  -> emit one result
  -> source sync outside runtime
```

必须明确：

- phase 中间结果只留在 `working`
- publish 前任何结果都不允许对外暴露
- `update()` 完成后只能看到 final `snapshot + change + trace`

### 7.3 publish 一次性原则

每次 `update()` 成功后：

- 只 publish 一次新的 snapshot
- 只生成一份 authoritative change
- 只触发一次 listener fanout

这条规则是整个 kit 的第一原则。

如果这个规则被破坏，whiteboard 的 layout / scene / chrome 会重新错位，dataview 的 active / source 也会重新分裂。

---

## 8. 为什么 publisher 必须内建 stable reference reuse

如果 stable reference reuse 不在 publisher，而是在 sink adapter 各自处理，会立刻出现三类问题：

1. 每个 adapter 各自定义“什么算没变”
2. 每个 adapter 各自决定“这个引用能不能复用”
3. `change` 和引用复用规则被拆成多份

这会直接回到旧系统的问题：

- source 再 diff 一次
- store 再 compare 一次
- React hook 再 memo 一次

长期最优的做法必须是：

- publisher 统一决定 snapshot 引用复用
- publisher 统一决定 authoritative change
- source 只 apply，不再猜

因此，通用 kit 里必须内建 publish helper，而不是把 publish 当成各业务 runtime 的随手实现细节。

---

## 9. 为什么 source primitive 不能绑定 `shared/core/store`

长期最优必须把 source primitive 和具体状态库解耦。

理由有三个：

### 9.1 store 不是唯一 sink

whiteboard / dataview 真正要同步的 sink 包括：

- store
- renderer
- devtools
- event bus
- benchmark sink
- testing fake sink

如果 source primitive 直接绑定 `shared/core/store`，它就不再是 runtime kit，而只是“面向某个状态库的补丁层”。

### 9.2 store 语义不该反向塑造 core

kit 应该先定义：

- authoritative snapshot
- authoritative change
- authoritative sync primitive

而不是先想：

- ValueStore 怎么 patch
- KeyedStore 怎么 notify

这条边界一旦反过来，kit 又会变成旧 store 文化的继续。

### 9.3 dataview 和 whiteboard 需要不同 adapter

whiteboard 需要：

- keyed render family
- scene list
- overlay / pick sync

dataview 需要：

- active item family
- section family
- summary family

共享的应该是 sync primitive，不是具体 adapter。

---

## 10. 对 whiteboard 和 dataview 的分工方式

### 10.1 `@shared/projection-runtime` 提供什么

共享包提供：

- runtime shell
- phase orchestrator
- dirty planning shell
- publisher shell
- source primitives
- trace / harness

### 10.2 `@whiteboard/editor-graph` 提供什么

whiteboard 自己提供：

- `editor.Input`
- `editor.InputChange`
- `editor.Snapshot`
- `editor.Change`
- whiteboard `WorkingState`
- whiteboard phases
- whiteboard publisher
- whiteboard source mapping

### 10.3 `@dataview/runtime` 提供什么

dataview 自己提供：

- active input/change
- active snapshot/change
- dataview `WorkingState`
- dataview phases
- dataview publisher
- dataview source mapping

因此，长期最优并不是让 whiteboard 和 dataview 共用一套 phase，而是：

- 共用 phase runtime
- 共用 publish discipline
- 共用 source discipline
- 共用 testing discipline

---

## 11. 最终目录结构

一步到位建议直接落成：

```text
shared/projection-runtime/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    contracts/
      core.ts
      runtime.ts
      phase.ts
      source.ts
      trace.ts
      testing.ts
    runtime/
      createRuntime.ts
      state.ts
      update.ts
      publish.ts
    dirty/
      plan.ts
      set.ts
      fanout.ts
    publish/
      value.ts
      family.ts
      list.ts
      change.ts
    source/
      value.ts
      family.ts
      list.ts
      event.ts
      compose.ts
    testing/
      harness.ts
      fakeSink.ts
      assert.ts
    index.ts
```

注意：

- 不要把 whiteboard 专有 contract 塞进这个包
- 不要把 dataview 专有 source 塞进这个包
- 不要把 `shared/core/store` 适配直接放进这个包

---

## 12. 实施顺序

这里说的是一步到位的真实施工顺序，不是“先抄一份 whiteboard 的 runtime 再慢慢整理”。

### 12.1 第一步：先冻结 kit 的公共边界

先明确写死：

- `runtime.Spec`
- `runtime.Instance`
- `runtime.Result`
- `runtime.Planner`
- `runtime.Publisher`
- `source.Sync`
- `trace.Run`
- `testing.Harness`

这一步结束时，要能明确：

- kit 本身暴露什么
- 哪些能力必须留给领域 runtime

### 12.2 第二步：实现最小 runtime shell

先实现：

- `createRuntime`
- `state`
- `update()`
- `subscribe()`

此时先不接 whiteboard 语义，也不接 dataview 语义。

目标只有一个：

- 一轮 update 只 publish 一次 result

### 12.3 第三步：实现 phase orchestrator

加入：

- topo 排序
- dep fanout
- dirty phase 执行
- phase trace 记录

这一步结束后，kit 已经能稳定驱动任意 phase pipeline。

### 12.4 第四步：实现 dirty planner 壳

加入：

- `Plan`
- dirty merge
- phase dirty 分发

这里不要把 whiteboard 的 node/edge/mindmap dirty 硬编码进 kit。

kit 只提供：

- 数据结构
- merge 规则
- phase fanout 规则

### 12.5 第五步：实现 publisher 与 stable reference helper

这一阶段是 kit 成败的关键。

必须完成：

- value publish helper
- family publish helper
- list publish helper
- change compose helper

并明确保证：

- authoritative change 由 publisher 生成
- adapter 不再自己 diff

### 12.6 第六步：实现 source sync primitives

实现：

- value sync
- family sync
- list sync
- event sync
- compose sync

注意：

- 这些 primitive 只处理 apply
- 不重新推导业务变化
- 不依赖 `shared/core/store`

### 12.7 第七步：实现 trace / perf / testing harness

实现：

- phase trace
- total time
- fake sink
- deterministic harness
- publish 断言 helper

这一阶段结束时，kit 才算真正可用。

因为没有 harness 的 runtime kit，长期一定会变脆。

### 12.8 第八步：先让 whiteboard-editor-graph 完整接入

先用 whiteboard 作为第一个真正消费者。

原因：

- whiteboard phase 最复杂
- whiteboard 对 publish 一致性最敏感
- whiteboard 能最快暴露 kit 的边界是否正确

这里不允许保留：

- whiteboard 自己偷偷复制一份 local runtime shell
- whiteboard 自己绕过 publisher 直接构造 source

### 12.9 第九步：再让 dataview runtime 接入

再用 dataview 作为第二个真正消费者。

这一步的目的不是“支持更多产品”，而是验证 kit 是否真的通用：

- 是否没有白板语义泄漏
- 是否没有 graph 假设泄漏
- 是否能支撑另一类 phase 组织方式

### 12.10 第十步：删除各系统本地重复 runtime 机制

一旦两边接入完成，必须立即删除各自包里重复的机制，包括：

- 本地 phase shell
- 本地 publish helper
- 本地 source diff helper
- 本地 trace helper
- 本地 harness

这一步不能拖。

如果拖，系统很快会再次出现“双 runtime 基础设施”。

---

## 13. 测试重建方案

### 13.1 kit 自己必须有的测试

应至少覆盖：

- topo phase 执行顺序正确
- dirty phase 不会漏 fanout
- publish 只触发一次
- unchanged family/value 能稳定复用引用
- source primitive 只 apply change，不重新推导
- trace 记录可预测

### 13.2 whiteboard 侧必须增加的测试

应增加：

- 复杂 edit / measure / tree relayout 多轮 update 的 trace 测试
- publish 前中间态不会泄漏
- scene / selection / chrome 同 revision 测试

### 13.3 dataview 侧必须增加的测试

应增加：

- active view commit publish-once 测试
- source adapter 不再 diff `previous / next` 测试
- item / section / summary family 引用复用测试

---

## 14. 完成标准

只有满足下面这些条件，第三步才算真正完成：

1. 共享包 `@shared/projection-runtime` 已存在并承担 runtime kernel 角色
2. kit 内部不依赖 `store`
3. kit 每次 `update()` 只发布一份 `snapshot + change + trace`
4. authoritative change 由 publisher 生成
5. source adapter 只 apply change，不再 diff `previous / next`
6. kit 提供 deterministic harness
7. whiteboard-editor-graph 建立在 kit 之上
8. dataview runtime 也建立在 kit 之上
9. whiteboard / dataview 本地重复 runtime 机制已删除

少一条都不算完成。

---

## 15. 一句话结论

第三步的一步到位方案，不是“给 whiteboard-editor-graph 抽几个公用 helper”，而是直接建设 `@shared/projection-runtime`：

- 它负责 phase runtime
- 它负责 publish discipline
- 它负责 source discipline
- 它负责 testing discipline

然后让 whiteboard 和 dataview 都只把领域语义放在各自 runtime 中，把通用运行时机制彻底收敛到这一层。

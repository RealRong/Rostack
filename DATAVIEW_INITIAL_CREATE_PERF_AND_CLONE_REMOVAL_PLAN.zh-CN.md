# Dataview Initial Create 性能与 Clone 收敛长期方案

## 1. 文档目的

本文讨论两个强相关问题：

- 为什么 Dataview 的 `initial create` 很重
- 在“系统内部不直接 mutate 数据”的前提下，哪些 clone 可以删除，哪些 clone 只能收口到边界

本文不讨论：

- 临时 profiling 技巧
- 兼容旧路径
- 渐进迁移成本

本文只讨论长期正确方案。


## 2. 当前结论

当前 `initial create` 过重，不是单一热点导致，而是三类问题叠加：

1. 启动路径里存在明确的重复全量构建
2. index 初建策略过度 eager
3. document / entity clone 策略没有严格收口到边界

这里面最先该动的不是 projection，而是：

- 启动路径
- index 初建
- clone 边界


## 3. 当前启动路径的问题

## 3.1 index 被构建了两遍

当前 `createProjectRuntime()` 的路径本质上是：

```txt
createEngine
  -> cloneDocument(options.document)
  -> createProjectRuntime(document)
    -> createEngineIndex(document)
      -> buildIndexState(document)
    -> runtime.syncDocument(document, resetDelta)
      -> index.sync(document, resetDelta)
      -> run project stages
```

也就是说，初次创建时：

- `createEngineIndex(document)` 已经把完整 index build 一次
- 随后 `syncDocument(resetDelta)` 又会把 index 再走一次全量 sync

这属于非常明确的重复工作。

长期必须消失。


## 3.2 初建和增量共用同一条“reset delta”路径不是问题，重复建才是问题

长期不要求分裂成两套 runtime：

- 一套专门处理 boot
- 一套专门处理 sync

长期允许仍然只有一个统一入口。

但必须满足：

- boot 不应先 build 一遍，再通过 reset 再 build 一遍

换句话说，长期正确做法是二选一：

### 方案 A

- `createEngineIndex()` 只创建空 runtime
- 第一次真实数据通过 `syncDocument(resetDelta)` 完成首建

### 方案 B

- `createEngineIndex(document)` 完成首建
- `createProjectRuntime()` 的首次 project 发布直接消费当前 index state
- 不再额外对同一份 document 再跑一次 index reset sync

长期更推荐方案 B。

原因：

- index runtime 的“首建”语义最自然
- project runtime 初建也更容易直接吃现成 index state
- 避免“用 reset 冒充 boot”导致的大量分支误判


## 4. 当前 index 初建为什么贵

## 4.1 search 是全局 eager

当前 search index 的策略是：

- 对每条 record 建 `RecordTokens`
- 同时建 `all postings`
- 同时建 `field postings`

这意味着：

- 所有字段
- 所有记录
- 所有 tokens

在启动时一次性 materialize。

如果 document 很大，这层本身就会吃大量 CPU 和内存。


## 4.2 group 是按所有字段全建

当前 group index 的策略是：

- 对每个字段都建 `GroupFieldIndex`
- 每个字段都维护：
  - `recordBuckets`
  - `bucketRecords`

但系统的长期前提其实是：

- 同时只有一个 active view
- 同时最多只真正需要少量 grouping 字段

所以“所有字段全建”是典型的全局 eager。


## 4.3 calculations 是最重的一层

当前 calculation index 的策略是：

- 每个字段都建 `FieldCalcIndex`
- 每个 field 都建：
  - `global aggregate`
  - 可能的 `bucket aggregates`
  - `entries`
  - 可能的 `recordBuckets`

这会带来几个问题：

- 启动时对所有字段全量扫 records
- 持有大量 `Map<RecordId, AggregateEntry>`
- 再额外持有 bucket 级 state

这一层在大 document 下非常容易成为初建最大头。


## 4.4 当前问题不是“incremental 做错了”，而是“boot 过度 eager”

从现有实测看，单次增量 action 还没有爆炸：

- `50k` 的普通 value update 仍可落在几十毫秒
- `50k` 的 grouped value update 也还是百毫秒级

这说明：

- 增量更新不是当前最大的灾难
- 当前最大的灾难是 boot / initial create


## 5. clone 到底能不能删

结论先说：

- 可以大幅删
- 但不能无脑全删
- 长期正确方向是“把 clone 收口到外部不可信边界”，而不是“处处 defensive clone”


## 5.1 如果系统前提成立，内部 clone 理论上可以大幅消失

如果我们明确接受这个前提：

- engine 内部不直接 mutate document
- write 永远通过 operation / reducer 产出新 document
- runtime 内部把 document 当不可变快照

那么内部很多 clone 就没有存在必要了。

因为 clone 的本质价值是防止：

- 外部持有同一引用并直接 mutate
- 内部误把共享对象当可变对象修改

如果这两件事都被架构约束掉，那么 clone 就不再是必需的。


## 5.2 当前 clone 分成三种

### 第一种：输入边界 clone

例如：

- `createEngine(options.document)` 时 clone 一次外部传入 document
- `engine.document.replace(document)` 时 clone 一次外部传入 document

这类 clone 仍然有价值。

因为外部调用方是不可信边界。


### 第二种：导出边界 clone

例如：

- `engine.document.export()`

如果要防止外部拿到内部 live object 后直接 mutate，这类 clone 也仍然有价值。


### 第三种：内部流程 clone

例如：

- `cloneDocument()` 只是为了给 runtime 自己用
- `cloneEntityTable()` / `cloneRecordTable()` 在纯内部流转里大量出现

这类 clone 长期应该尽量消失。

因为它们既昂贵，也会掩盖真正的所有权模型。


## 5.3 真正应该保留的 clone 边界

长期建议只保留两类 clone：

1. 外部输入进入 engine 时
2. engine 内部数据导出给外部时

除此之外：

- engine 内部
- commit runtime
- index runtime
- project runtime
- read runtime

都应该默认基于不可变引用工作，不再主动 clone。


## 6. 当前 clone 哪些最值得删

## 6.1 `createEngine()` 的 initial `cloneDocument` 可以重新设计，但不能直接裸删

当前：

- `createEngine(options.document)` 会先 `cloneDocument(options.document)`

如果要完全删掉这一步，前提必须非常强：

- 调用方保证不会再 mutate 传入 document

这在库 API 层通常过于乐观。

所以长期更推荐：

- 保留“边界 clone”
- 但只在 engine 创建入口做一次

也就是说：

- 初次接收外部 document 时 clone 一次可以接受
- 之后 runtime 内部不应继续围绕同一数据反复 clone


## 6.2 `engine.document.export()` 的 clone 建议保留

因为这是把内部 document 暴露给外部。

如果不 clone：

- 外部拿到 live object
- 直接 mutate
- engine 内部的“不变式”就彻底失效

所以 export 层保留 clone 是合理的。


## 6.3 document normalize / table clone 中的内部 clone 需要收缩

当前很多 helper 带着“无论什么上下文都 clone 一份”的惯性。

长期应该拆成两类 API：

### 边界 API

明确 clone：

```ts
cloneExternalDocument(document)
cloneExternalRecord(record)
```

### 内部 canonical API

默认不 clone：

```ts
installCanonicalDocument(document)
readCanonicalDocument()
```

不要继续让：

- `cloneEntityTable`
- `cloneRecordTable`
- `cloneDocument`

这种名字模糊的 helper 在内部到处流动。


## 7. 长期最优的所有权模型

长期应该把 document 所有权定义得非常明确。

## 7.1 外部 document 进入 engine 后，engine 获得所有权

也就是说：

- 外部传进来的对象，要么先 clone 一次
- 要么通过显式“transfer ownership”协议交给 engine

但不能处于模糊状态。


## 7.2 engine 内部只处理 canonical immutable snapshot

长期内部唯一正确模型：

- reducer 产出新 document
- runtime 消费 document snapshot
- 任何地方都不原地 mutate 这个 snapshot

一旦这个前提成立：

- 绝大多数内部 clone 都可以删除


## 7.3 mutation 只能发生在临时局部工作集

例如：

- `Map`
- `Set`
- 临时数组
- builder 内部中间结构

这些可以 mutate。

但 canonical document / canonical row / canonical view 不允许 mutate。


## 8. 长期实施方案

## Phase 1: 消掉启动期双构建

目标：

- 初建 index 只做一次

做法：

- 重写 `createProjectRuntime` 启动路径
- 首次 project publish 直接消费首建好的 index state
- 不再对同一份初始 document 再跑一次 reset delta index sync

这是第一优先级。


## Phase 2: 收口 clone 边界

目标：

- clone 只发生在外部输入和外部输出边界

做法：

- 明确区分 external clone API 和 internal canonical API
- runtime 内部不再调用通用 clone helper
- 审计 `cloneDocument / cloneEntityTable / cloneRecordTable` 的调用点


## Phase 3: index 初建改成 lazy / demand-driven

目标：

- 初建只构造当前真正需要的 index

做法：

- records index 仍是基础层，启动时必建
- search index 改成按需建
- group index 改成按字段懒建
- calculations index 改成按字段懒建，或至少按 active view calc fields / group fields 建


## Phase 4: index cache 生命周期收紧

目标：

- index 不再无条件持有所有 field 的全量状态

做法：

- 引入 field-scoped index materialization
- 引入 demand flags
- 对 inactive / unused field index 允许空缺或延迟建


## 9. 最终建议

如果只允许先做一件事，顺序必须是：

1. 先消掉启动期双构建
2. 再收口 clone 到边界
3. 再把 search / group / calculations 从全局 eager 改成按需初建

这里不要反过来做。

原因很简单：

- 双构建是确定性的纯浪费
- clone 收口是明确的长期边界整理
- index lazy 化虽然收益大，但改动面也更大


## 10. 最终结论

当前 `initial create` 重，不是因为某个 projection stage 太慢。

根因是：

- 启动期 index 双构建
- search / group / calculations 全局 eager
- clone 边界不够收敛

如果系统前提明确为：

- engine 内部不直接 mutate 数据

那么长期正确方向就是：

- clone 只保留在外部输入/输出边界
- 内部 canonical document 不再反复 clone
- boot 不再重复 build
- index 从“全字段全量 eager”改成“基础层必建，其余按需 materialize”

# dataview-engine 架构修改建议

本文基于 `dataview/packages/dataview-engine/src` 当前实现做针对性评估。整体判断是：大方向是对的，`mutation engine -> index -> active projection` 这条主链路清晰，而且 `active plan` 已经在承担“按需重算”的核心职责。当前主要问题不在于方向错误，而在于“公开读模型”这一层没有完全统一到 projection 机制里，导致代码优雅度、可维护性和局部重构成本偏高。

## 当前观察

- `src` 目录共 `74` 个文件，约 `14031` 行。
- 其中 `< 80` 行的小文件有 `20` 个，主要集中在 `active/projection`、`active/index`、`active/publish`、`contracts`。
- `active` 子目录内部进一步分散为 `query/membership/summary/publish/index/api/shared/projection` 等多个层次，很多文件本身合理，但聚合层不够，导致阅读需要频繁跳转。

## 结论概览

最值得优先处理的不是“再设计一套新架构”，而是把下面三个边界压实：

1. 把 `projection` 从“既运行 active，又负责组装 trace/read facade”的角色，收敛成纯 projection runtime。
2. 取消 `engine source` 作为独立机制的存在，把公开读模型统一收敛到 `createProjection` 体系内。
3. 先彻底删除 `performance/trace` 这套能力，把 runtime 恢复成不携带观测逻辑的纯计算内核，后续再重新设计 instrumentation。

这三件事做完，文件数量不一定会骤减，但阅读复杂度会明显下降，很多小文件也能自然合并，而不是为了“减少文件数”硬合。

## 问题一：`engine source` 本身就是重复的 projection 机制

### 现象

`createDataviewProjection.ts` 和 `createEngineSource.ts` 都在做“从内部状态挑选一组可公开读取的视图”：

- `projection/createDataviewProjection.ts:160` 开始定义 `createDataviewProjectionRead`，把内部状态包装成 `document/active/index/publish` 读接口。
- `source/createEngineSource.ts:66` 到 `193` 定义了一整套 `createSelectedStore` / `createSelectedKeyedStore` / `createSelectedEntitySource` / `createListedEntitySource`，再在 `197` 之后把 document active 数据重新组装成 `EngineSource`。

这两个文件都在做三件相近的事：

- 从某个 runtime 读当前值。
- 订阅 runtime 的变化。
- 将内部结构适配为面向外部的只读接口。

这意味着当前系统里实际上并存了两套 projection 思维：

- 一套是正式的 `createProjection` 机制。
- 一套是 `createEngineSource` 自己手写的 selector/source binding 机制。

我现在更倾向于把这个问题定义为：`engine source` 不是“实现有点重复”，而是机制层级就不对。它本质上也是 projection，只是没有被建模成 projection。

### 更具体的问题

#### 1. `projection.read` 暴露了过多 runtime 内部结构

`createDataviewProjectionRead` 目前暴露：

- `document.current/query`
- `active.state/snapshot`
- `index.state/trace`
- `publish.snapshotTrace/viewTrace/activeTrace`

这里的 `active.state()` 和 `index.state()` 直接把内部 phase state 暴露出去，导致上层可以依赖运行时内部形状，而不是仅依赖发布快照或受控诊断接口。这样会让后续重构 `active/state.ts` 的内部字段变得更难。

#### 2. `createEngineSource` 手工实现了一套 projection adapter

`createEngineSource.ts` 中有非常明显的模板化重复：

- document records / fields / schema fields / views 都是同一个模式。
- active view / viewId / viewType / query / table / gallery / kanban 都是同一个模式。
- active records.matched / ordered / visible 也是同一个模式。
- active items / sections / fields 先拿 projection store，再补一层 list/read adapter。

这不是“业务复杂”，而是因为 `EngineSource` 并没有复用 `createProjection` 的发布机制，而是在自己定义：

- 当前值如何读取
- 变化如何订阅
- 选择器如何比较
- 列表如何派生

这等于在 `source/createEngineSource.ts` 里又发明了一套轻量 projection runtime。

#### 3. `source` 当前暴露层耦合了两种上游，而且没有统一发布边界

`createEngineSource` 同时依赖：

- mutation document stream
- projection active store tree

这本身不是问题，问题在于它不是“组合两个 projection”，而是：

- 一边直接消费 mutation document
- 一边直接消费 projection stores
- 中间再手写一层 source 语义

结果就是 source factory 既知道 document 数据结构，也知道 projection store 结构，还知道如何把它们转换成 store API。它实际上变成了一个过胖的 anti-corruption layer，而且这层转换逻辑没有统一抽象约束。

### 建议方向

这里我建议把结论收得更狠一些：不要把 `EngineSource` 继续当成独立机制优化，而是把它降级成 projection 体系下的一种 published read model。

也就是说：

- `source` 这个对外接口名字可以保留。
- 但 `createEngineSource` 这种手写 selector/source runtime 的实现方式应该被移除。
- 公开读模型应该统一由 `createProjection` 产出，或者至少完全建立在 projection store tree 的标准发布能力之上。

#### A. `projection` 只保留 runtime 必需读口

保留类似下面的最小接口：

- `snapshot()`
- `stores`
- `inspect()`（仅在确实需要时保留最小内部检查能力）

去掉现在 `read.publish.*Trace()` 这种混合 runtime + performance 的读口，也尽量不再公开 `active.state()` 这种内部结构读取。

建议目标：

- `projection` 是计算引擎的 runtime。
- `published projection` 是对外订阅 API。
- 观测能力这一轮先移除，不在当前架构里保留半成品接口。

#### B. document 也应该进入 projection 体系

现在 document 侧的公开读模型不是 projection，而是靠：

- `readDocument()`
- `subscribeDocument()`
- 一组手写 `createSelectedStore(...)`

这会导致 document 和 active 采用两种不同的发布哲学。建议把 document 也建模成 projection，例如：

- `documentProjection.stores.meta`
- `documentProjection.stores.records`
- `documentProjection.stores.values`
- `documentProjection.stores.fields`
- `documentProjection.stores.views`

这样 document 和 active 才会共享同一套“读模型如何暴露”的语义。

#### C. `EngineSource` 只做 projection bundle，不再自己发明 source 逻辑

最终建议不是再抽一个 `source/binders.ts` 把 `createEngineSource` 保下来，而是让 `EngineSource` 退化成很薄的一层组合：

- `documentProjection`
- `activeProjection`
- 少量必要的派生 published stores，例如 `ItemList`、`SectionList`

也就是说，`EngineSource` 应该表达“哪些 projection 被公开”，而不是“如何自己重新实现一遍公开机制”。

### 推荐重构结果

推荐把当前关系：

`mutation engine -> projection -> source`

调整为：

`mutation engine -> document projection + active projection -> published projection bundle`

其中：

- `document projection` 负责 document 公开读模型。
- `active projection` 负责 active 公开读模型。
- `published projection bundle` 才是今天 `EngineSource` 应该退化成的角色。

这样系统中就只剩一套状态发布机制：`createProjection`。

如果某些消费端确实需要：

- `OrderedKeyedCollection`
- `ItemList`
- 默认值 fallback，如 `EMPTY_QUERY`

这些也应该作为 projection published stores 的一部分出现，而不是成为 `createEngineSource` 独占的一套二次投影逻辑。

## 问题二：小文件偏多，但根因不是“文件数量”，而是缺少中层聚合

### 现象

当前小文件多，确实会影响阅读连贯性，但不是每个小文件都该删。问题主要出在两类：

#### 1. 只有单一小工具职责，但缺少与所属子域的聚合文件

例如：

- `active/projection/trace.ts`
- `active/projection/metrics.ts`
- `active/index/trace.ts`
- `active/index/sync.ts`
- `active/publish/fields.ts`
- `active/publish/reuse.ts`

这些文件单独存在并非错误，但调用者需要知道它们分别在哪，说明目录缺少“面向子域”的聚合层。

#### 2. “跨层意义很小”的文件被拆成独立路径

例如：

- `runtime/clock.ts` 只有 3 行。
- `mutation/projection/types.ts` 只有 36 行，而且主要是 trace 输入输出胶水。
- `projection/index.ts` 只有 7 行。

这类文件不会单独形成认知收益，更多是制造跳转。

### 建议原则

不是一味合文件，而是按“认知单元”合并。

推荐三类处理：

#### A. 保留阶段性算法文件

以下类型值得保留为独立文件，因为它们对应明确子域步骤：

- `active/query/stage.ts`
- `active/membership/stage.ts`
- `active/summary/stage.ts`
- `active/publish/stage.ts`

这些是 active pipeline 的骨架。

#### B. 将纯胶水/纯类型/纯工具文件并入上层

建议优先考虑合并：

- `runtime/clock.ts` 并入 `runtime/performance.ts` 或统一 `runtime/time.ts`
- `mutation/projection/types.ts` 并入 `mutation/projection/trace.ts`
- `active/projection/metrics.ts` 并入 `active/projection/trace.ts`
- `active/index/trace.ts` 并入 `active/index/contracts.ts` 或 `active/index/runtime.ts`

理由很简单：这些文件没有形成独立模块边界，只是给别的文件提供很薄的一层定义。

#### C. 为高密度目录增加 barrel/aggregate 层

现在 `active/publish` 有 11 个文件，`active/index` 有 10 个文件，但缺少“子域入口”。建议增加面向阅读的聚合模块，例如：

- `active/index/index.ts`
- `active/publish/index.ts`
- `active/query/index.ts`

这里不是为了 re-export 漂亮，而是为了把“这一层提供什么能力”写清楚。聚合层本身可以承担简短注释和子模块说明，降低阅读启动成本。

### 一个更有效的目录策略

建议把目录目标从“文件尽量少”改成“每个子域只暴露 1-2 个主入口”。

例如：

- `active/index/`
  - `runtime.ts`
  - `contracts.ts`
  - `stages.ts` 或 `derive.ts`
- `active/publish/`
  - `runtime.ts` 或 `stage.ts`
  - `sections.ts`
  - `reuse.ts`

也就是说，保留算法型拆分，合并胶水型拆分。

## 问题三：`trace` 和 `performance` 不值得现在继续保留

### 现象

当前耦合已经不只是“performance 消费 trace”，而是 trace 的结构和产出时机反向影响了 projection/active state 的设计。

关键表现：

#### 1. `active state` 内建 trace

`active/state.ts:103` 起，`DataviewActiveState` 直接包含：

- `trace.query`
- `trace.membership`
- `trace.summary`
- `trace.publish`
- `trace.snapshot`

这意味着 trace 不是附属信息，而是 active state 的一部分。任何 active state 构造、清空、变更都必须考虑 trace 默认值。

#### 2. `projection` 负责把 active trace 二次拼成 performance 结构

`projection/createDataviewProjection.ts:84` 的 `buildViewTrace()` 实际上已经在做 performance 视角的格式化。

也就是说：

- active runtime 产生 stage trace
- projection 把 stage trace 组装成 `ViewTrace`
- mutation/projection/trace.ts 再把它组装成 `CommitTrace`
- runtime/performance.ts 再把 `CommitTrace` 存储与聚合

中间存在多次“trace shape translation”，但这些 translation 不是独立的，而是散落在 runtime/projection/mutation 三层。

#### 3. performance runtime 反过来定义了 mutation trace 组装输入

`mutation/projection/types.ts` 直接依赖 `PerformanceRuntime`，让“是否启用 performance”渗入 commit trace builder 输入。这说明 instrumentation 开关已经进入 domain assembly 层。

### 更根本的问题

当前设计里混在一起的是三种不同概念：

- `Stage diagnostics`：本次 query/membership/summary/publish 做了什么。
- `Commit trace`：一次 commit 的完整观察记录。
- `Performance stats`：长期累计统计。

这三者有依赖关系，但不应该共用一条对象生命周期。

### 建议方向

我更赞成这一轮不要做“解耦式修复”，而是直接清理干净。

原因很简单：

- 这套能力现在已经深度渗入 `active state`、`projection read`、`createEngine` 和 `mutation/projection`。
- 但从产品价值上看，你已经明确不想继续背这套半成品能力。
- 如果现在花精力把它“设计优雅地保留下来”，本质上是在优化一套准备废弃的系统。

所以这里的建议不是“先分三层 instrumentation”，而是：

#### A. 先删能力，不保留兼容层

直接把下面这些东西视为本轮清理对象：

- `contracts/performance.ts`
- `runtime/performance.ts`
- `mutation/projection/trace.ts`
- `mutation/projection/types.ts`
- `active/projection/trace.ts`
- `active/projection/metrics.ts`
- `active/index/trace.ts`
- `projection.read.publish.*Trace()` 相关接口

目标不是把它们搬家，而是先从主链路里拿掉。

#### B. 把 runtime state 恢复成纯业务状态

重点是把 trace 从 `DataviewActiveState` 里拿掉，让 active state 只保留业务必需内容：

- `spec`
- `index`
- `query`
- `membership`
- `summary`
- `snapshot`
- `fields/sections/items/summaries`
- `changes`

这样 `active/state.ts` 才会重新回到 domain state 的角色，而不是“业务状态 + 调试状态”的混合体。

#### C. 把 `createEngine` 恢复成纯执行链路

`createEngine.ts` 里当前有一条额外的观测分支：

- 记录 `startedAt`
- 拼装 commit trace
- 写入 performance runtime

这条链路建议整体删除，让 commit 生命周期重新收敛成：

- mutation apply
- projection update
- notify current listeners
- notify commit listeners

以后如果要重写 performance，再从外层重新插入，而不是继续沿用现在这套埋点路径。

#### D. 给未来重写只保留“插槽”，不要保留旧 schema

如果你担心以后完全没法加回来，建议保留的是很小的扩展位，而不是旧接口。例如：

- `createEngine(options)` 允许未来再接 instrumentation 选项。
- `projection` 内部允许未来在 update 过程中挂观测钩子。

但不要保留：

- `CommitTrace`
- `PerformanceApi`
- `SnapshotTrace`
- `ViewTrace`

这些旧 schema 本身已经带着当前设计假设，继续保留只会把未来重写绑死在旧模型上。

## 推荐的最小可行重构顺序

为了避免一次性重构过大，建议按下面顺序推进。

### 第一阶段：先彻底移除 `performance/trace`

目标：不动 query/membership/summary/publish 的业务算法，只把观测链路从主流程里拿掉。

- 删掉 `contracts/performance.ts` 及相关对外 API。
- 删掉 `runtime/performance.ts` 和 `createEngine.ts` 中对它的接入。
- 删掉 `mutation/projection/trace.ts`、`mutation/projection/types.ts`。
- 删掉 `active/projection/{trace,metrics}.ts`、`active/index/trace.ts`。
- 从 `DataviewActiveState` 中删除 `trace` 字段。
- 从 `createDataviewProjectionRead` 中删除 `publish.snapshotTrace()`、`viewTrace()`、`activeTrace()`。

收益：

- 风险最低。
- 能直接把最脏的耦合面从主链路剥离。
- 不需要为了即将废弃的能力再做一轮“优雅封装”。

### 第二阶段：把 document/source 统一进 projection

目标：把 `createEngineSource.ts` 从 363 行压到以装配为主的文件。

- 新增 `source/binders.ts` 或 `source/adapters.ts`
- 抽出 `createSelectedStore`、`createSelectedKeyedStore`、`createSelectedEntitySource`、`createListedEntitySource`
- 视情况把 `createOrderedKeyedListStore`、`createItemListStore` 留在 `source/collections.ts`

收益：

- 去掉机械性重复。
- 给后续调整 source 暴露形状提供稳定工具层。

### 第三阶段：收缩 projection read API

目标：把 projection 从“运行 + 公开内部状态”变回纯 runtime。

- 去掉 `read.active.state()` / `read.index.state()` 这类可被外部依赖的内部读口，改成更受控的 inspect 接口。
- 明确 `stores` 才是 projection 对 source 的发布边界。
- 让 `source` 依赖 `stores + snapshot`，而不是依赖一组随时扩张的 `read.*` 方法。

收益：

- 后续可以自由改 `DataviewActiveState` 内部结构。
- projection/source 的职责更稳定。

### 第四阶段：合并低价值小文件

等前三步完成后，再做目录清理：

- 合并 `runtime/clock.ts`
- 清理掉 trace/performance 删除后留下的空目录或过薄文件
- 视情况合并剩余纯胶水文件

这一步最后做，避免边重构边反复移动文件。

## 我认为值得保留的架构不变量

下面这些点我建议保留，不需要推倒重来：

- `mutation engine` 和 `active projection` 分离。
- `active plan` 先决定阶段动作，再执行阶段。
- `index` 作为 active 的上游缓存层存在。
- `publish` 作为 active 最后一步单独建模。
- `source` 继续作为面向外部消费的只读 store API。

也就是说，不建议改成“所有东西都回到一个大 engine runtime 文件”或者“直接把 source 等同于 projection”。那会丢掉你现在已经建立起来的阶段化结构优势。

## 最后的判断

如果只选一个最高优先级问题，我会先删 `trace/performance`。因为它现在不仅影响调试代码，还在反向塑造 `active state`、`projection read` 和 `createEngine` 的接口设计，而你又已经明确后面会重写它。

如果选一个最容易见效的问题，我会先把 document 侧也纳入 projection，并让 `EngineSource` 改成纯组合层。因为这一步能直接消除“系统里有两套 projection 机制”这个最根本的问题。

如果目标是让整体架构更优雅，我建议最终落点是：

- `projection` 负责计算
- `published projections` 负责公开
- 观测能力以后重写，并作为外插层接回

这三个层次一旦分开，当前你提到的三个问题会一起缓解，而不是分别打补丁。

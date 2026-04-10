# Dataview Engine 可读性与复杂度收口长期方案

## 1. 目的

这份文档只回答一个问题：

在当前 `dataview/src/engine` 已经完成多轮性能重构之后，下一步如何提高内部可读性、降低复杂度，并且不破坏已经得到的长期正确性能结构。

本文采用和现有 dataview 重构一致的前提：

- 不保留兼容过渡
- 不保留第二套实现
- 不为了“容易迁移”长期保留旧抽象
- 优先选择长期最简单、最稳定、最好测、最好优化的结构


## 2. 当前判断

现在更值得优先做的是内部可读性提升，而不是继续盲目追下一轮性能数字。

原因不是“性能已经不重要”，而是：

- 当前大的性能错误已经基本清掉
- 剩余热点已经收敛到少数局部区域
- 这些局部区域如果继续直接优化，代码复杂度会明显上升
- 当前很多文件已经变成“语义正确、性能不错，但内部边界还没完全收口”

从当前代码规模看，这个判断很明确：

- [index.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/index.ts) 约 `1185` 行
- [calc.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/calc.ts) 约 `545` 行
- [group.ts](/Users/realrong/Rostack/dataview/src/engine/index/group.ts) 约 `535` 行
- [index.ts](/Users/realrong/Rostack/dataview/src/engine/index/runtime.ts) 约 `360` 行
- [sections.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/sections.ts) 约 `333` 行
- [runtime.ts](/Users/realrong/Rostack/dataview/src/engine/runtime/commit/runtime.ts) 约 `307` 行
- [shared.ts](/Users/realrong/Rostack/dataview/src/core/document/shared.ts) 约 `248` 行

问题不只是“文件长”，而是这些文件里经常混着多种层级的职责：

- 契约定义
- 增量同步策略
- 引用复用策略
- 性能快路
- 发布态适配
- trace / perf 统计

这会带来两个长期问题：

1. 正确性判断变难
2. 后续继续优化时，很容易在错误层级上加逻辑


## 3. 长期目标

长期最优不是把代码拆成更多文件，而是把每一层的职责压缩到足够清晰：

1. 看文件名就知道它负责什么，不负责什么
2. 看类型就知道状态契约，而不是从实现猜
3. 看 sync 逻辑时，能区分：
   - 哪些是语义必需
   - 哪些只是复用优化
4. 看性能问题时，能快速定位到真正负责那段成本的层

换句话说，目标不是“更优雅”，而是：

- 更容易证明代码是对的
- 更容易发现哪里复杂度超标
- 更容易继续做下一轮性能优化


## 4. 复杂度来源

## 4.1 `project/runtime/index.ts` 承担了太多元职责

[index.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/index.ts) 现在同时承担：

- active view / published projection 等价判断
- index demand 推导
- projection delta 推导
- 各 stage 执行时序
- stage trace 统计
- published store 写入
- project runtime 对外 API

这导致一个问题：

同一文件里既有“系统调度逻辑”，又有“具体 projection 细节”。

长期看这不利于维护，因为：

- 修改 projection plan 时容易误碰 publish 行为
- 修改 trace 时容易误碰 stage 调度
- 修改 demand 时容易误碰 equality 逻辑

### 长期最优方向

把这个文件收缩成纯 orchestration 层。

它应该只负责：

- 读取输入
- 决定各 stage 是否运行
- 调用 stage
- 汇总 trace
- 发布结果

它不应该继续承载：

- 大量 projection 专属等价判断细节
- 零散的 demand 推导 helper
- stage metrics 具体细节拼装


## 4.2 `sections` 语义和增量策略仍然缠在一起

[sections.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/sections.ts) 现在已经比以前好很多，但仍然混着三层事情：

- section 语义
- section state 构造
- touched-record 增量维护

当前能看到的典型信号：

- `sameNode`
- `visibleOf`
- `collapsedOf`
- `resolveSectionKeys`
- `buildFromScratch`
- `syncSectionState`

这些东西放在一个文件里没有错，但长期看可读性不够好，因为它没有把下面三类问题分开：

1. section 是什么
2. section 怎么从 query/index 派生
3. section 在 sync 模式下怎么增量维护

### 长期最优方向

`sections` 层应该拆成三个概念：

- `section shape`
  只定义 section node 的最终契约
- `section derive`
  只负责从 `query + group index + view.group` 推导 section 结果
- `section sync`
  只负责选择 rebuild 还是 incremental update

最终 `syncSectionState()` 应该像一个很薄的外壳，而不是把语义和策略混在一起。


## 4.3 `calc` 同时承载了格式化、状态、增量 patch、发布适配

[calc.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/calc.ts) 现在至少有四种职责：

- aggregate state -> result 计算
- display 文本格式化
- section calc state 的 rebuild / sync
- published calculation collection 适配与引用复用

这会导致一个长期问题：

当需要调整一种 calculation 行为时，很难判断应该改哪一层。

例如：

- 结果语义不对，是 `computeCalculationFromState()` 的问题
- 空态复用不对，是 state contract 的问题
- 发布 map 抖动，是 published adapter 的问题

但这些现在都在同一文件里。

### 长期最优方向

`calc` 应拆成四块小而明确的模块：

- `calc/compute`
  聚焦 metric 计算
- `calc/state`
  聚焦 section aggregate state
- `calc/sync`
  聚焦 rebuild / incremental patch
- `calc/publish`
  聚焦 published collection 与引用复用

长期最优不是拆得很多，而是拆到“每个文件只回答一个问题”。


## 4.4 `group index` 已经正确，但结构层次还偏厚

[group.ts](/Users/realrong/Rostack/dataview/src/engine/index/group.ts) 在 phase3 之后已经更合理，但也更重了。

现在它同时包含：

- group demand key
- field/group option 规范化
- bucket key 解析快路
- bucket descriptor/domain/order 构造
- full build
- incremental sync
- 外部读取 helper

这本身没错，但问题是现在“group index 的概念层次”没有完全展开。

当前阅读成本主要来自两个地方：

1. `GroupDemand -> GroupFieldIndex` 的关系不够显式
2. bucket membership 与 bucket metadata 在实现上仍然交织

### 长期最优方向

把 `group index` 收成三个子层：

- `group/demand`
  只定义 `GroupDemand`、key、normalize
- `group/bucket`
  只定义 bucket key、bucket descriptor、bucket order
- `group/state`
  只定义 recordBuckets / bucketRecords / buckets / order 的 build 与 sync

这样之后再继续优化 `group index`，不会继续把更多逻辑堆回一个大文件里。


## 4.5 `document/shared.ts` 已经变成核心基础设施，但语义还不够显式

[shared.ts](/Users/realrong/Rostack/dataview/src/core/document/shared.ts) 现在已经不只是“shared helper”，而是 document table 的核心持久化层。

phase5 之后，这里实际上定义了很重要的底层语义：

- entity table 是 copy-on-write overlay
- 删除通过 tombstone 屏蔽父层值
- 读取通过 `order + byId` 完成

这个设计方向本身是对的，但文件名和结构没有显式表达这一点。

长期风险是：

- 后续维护者把它当普通 util 文件
- 不知道 overlay/tombstone 是契约还是临时技巧
- 新代码又回到整表 spread

### 长期最优方向

把 document table 基础设施显式命名出来。

例如：

- `core/document/table.ts`
- `core/document/tableOverlay.ts`

不再让“共享工具”这个名字掩盖真正的结构地位。


## 4.6 `commit runtime` 里 orchestration 与 trace 仍然耦合

[runtime.ts](/Users/realrong/Rostack/dataview/src/engine/runtime/commit/runtime.ts) 现在已经比以前更轻，但仍然同时做：

- dispatch / undo / redo 调度
- history stack 交互
- read/project 同步
- perf trace 记录

这里的主要复杂度不是实现多难，而是：

commit path 是全系统关键路径之一，最好让它“明显正确”。

### 长期最优方向

把它收成：

- `commit/apply`
  只负责执行一次 commit/replay
- `commit/sync`
  只负责 read/project 同步
- `commit/trace`
  只负责 trace 归纳

runtime 文件本身只保留 API 级 orchestration。


## 5. 长期最优设计原则

## 5.1 一层只做一件事

每个模块只保留一个主问题：

- demand
- state
- sync
- publish
- trace

不要继续让一个文件同时回答多个问题。


## 5.2 “契约”和“优化”必须分层

当前很多地方已经正确地用了引用复用和增量 patch，但长期最优要求更进一步：

- 类型和状态 shape 先定义语义契约
- 引用复用和增量 patch 作为第二层策略

不能反过来。

否则阅读代码时会不断混淆：

- 这是为了语义正确
- 还是为了性能复用


## 5.3 命名先表达领域，再表达技术

例如：

- `group demand`
- `section derive`
- `calc publish`
- `commit trace`

比下面这类命名更长期友好：

- `shared`
- `runtime`
- `sync helpers`
- `utils`

`utils` 和 `shared` 只会隐藏边界，不会澄清边界。


## 5.4 先减少中间状态，再减少代码行数

长期最优的“简单”不是更短，而是中间层更少。

优先级应该是：

1. 减少状态层数
2. 减少概念层数
3. 再考虑减少代码行数

如果一个实现更短，但引入了新的中间概念，那通常不是长期最优。


## 5.5 让每个 sync 模块都有统一骨架

当前 `query / sections / calc / group / sort` 各自都有自己的 sync 习惯。

长期最优应该统一骨架：

1. `action === reuse`
2. 是否必须 rebuild
3. 是否允许 incremental sync
4. build next state
5. 尝试复用 previous references

只要每个模块都遵守同样骨架，阅读成本会显著下降。


## 6. 目标目录结构

这里只写长期最优结构，不考虑兼容过渡。

```text
dataview/src/engine/project/runtime/
  index.ts
  demand.ts
  delta.ts
  trace.ts
  query/
    index.ts
    derive.ts
  sections/
    index.ts
    shape.ts
    derive.ts
    sync.ts
  calc/
    index.ts
    compute.ts
    state.ts
    sync.ts
    publish.ts
```

```text
dataview/src/engine/index/
  runtime.ts
  demand.ts
  group/
    index.ts
    demand.ts
    bucket.ts
    state.ts
  sort/
    index.ts
    state.ts
  search/
    index.ts
  records/
    index.ts
```

```text
dataview/src/core/document/
  index.ts
  table.ts
  records.ts
  fields.ts
  views.ts
  normalize.ts
```

```text
dataview/src/engine/runtime/commit/
  runtime.ts
  apply.ts
  sync.ts
  trace.ts
  history.ts
```

这里的重点不是目录本身，而是：

- orchestrator 留在 `index.ts` / `runtime.ts`
- 具体语义和策略放进明确命名的子模块


## 7. 命名规则

为了长期降低复杂度，建议统一以下命名规则。

## 7.1 类型名

优先用短且稳定的领域名：

- `QueryState`
- `SectionState`
- `CalcState`
- `GroupDemand`
- `GroupState`

避免继续出现过长、混合层级的名字。


## 7.2 函数名

函数名最好只表达一个动作：

- `buildX`
- `syncX`
- `readX`
- `publishX`
- `traceX`
- `equalX`

避免一个函数名同时表达多个意图，例如：

- `resolveAndBuild...`
- `syncOrRebuild...`

这种名字通常意味着函数职责已经太重。


## 7.3 文件名

文件名优先表达领域边界，不要表达模糊地位：

- `demand.ts`
- `state.ts`
- `derive.ts`
- `sync.ts`
- `publish.ts`
- `trace.ts`

少用：

- `shared.ts`
- `helpers.ts`
- `utils.ts`


## 8. 分阶段实施方案

## Phase 1: 收口 `project/runtime/index.ts`

目标：

- 把 orchestration、demand、delta、trace 分离

实施：

- 新增 `project/runtime/demand.ts`
- 新增 `project/runtime/delta.ts`
- 新增 `project/runtime/trace.ts`
- `project/runtime/index.ts` 只保留 project runtime orchestration

完成标准：

- `index.ts` 明显缩短
- 不再承载大量 stage 细节 helper


## Phase 2: 收口 `sections`

目标：

- 分离 section 契约、derive、sync

实施：

- `sections/shape.ts`
- `sections/derive.ts`
- `sections/sync.ts`
- `sections/index.ts` 只暴露 public entry

完成标准：

- `sameNode / visibleOf / collapsedOf / buildFromScratch / syncSectionState` 不再堆在一个文件里
- 阅读者可以独立理解 section shape、derive、sync


## Phase 3: 收口 `calc`

目标：

- 把 metric 计算、aggregate state、published collection 分离

实施：

- `calc/compute.ts`
- `calc/state.ts`
- `calc/sync.ts`
- `calc/publish.ts`

完成标准：

- 修改一个 calc 问题时，不需要在一个 500+ 行文件里反复跳转


## Phase 4: 收口 `group index`

目标：

- 把 demand、bucket、state 三层分离

实施：

- `index/group/demand.ts`
- `index/group/bucket.ts`
- `index/group/state.ts`

完成标准：

- `GroupDemand -> GroupState` 关系更显式
- bucket metadata 与 membership 逻辑不再交织在同一块实现里


## Phase 5: 收口 `document table`

目标：

- 显式表达 overlay/tombstone 语义

实施：

- 把 `core/document/shared.ts` 重命名或拆成 `table.ts`
- 把“table overlay”从普通 helper 提升为基础设施概念

完成标准：

- 后续维护者无需读实现细节，也能知道 document table 的持久化写语义


## Phase 6: 收口 `commit runtime`

目标：

- 把 commit orchestration、sync、trace 分层

实施：

- `commit/apply.ts`
- `commit/sync.ts`
- `commit/trace.ts`

完成标准：

- `runtime.ts` 成为薄壳
- commit 关键路径更容易人工审计


## 9. 不该做的事

为了防止“可读性优化”变成新的复杂度来源，下面这些事不应该做。

## 9.1 不要为了拆文件而拆文件

如果拆分之后：

- 引入更多中间类型
- 引入更多 re-export
- 阅读时来回跳转更多

那就不是优化，而是重新分散复杂度。


## 9.2 不要为“通用性”抽象出跨层 helper

例如一个 helper 同时服务：

- project runtime
- index runtime
- commit runtime

通常不是好事。

这类 helper 往往会把不同层的语义混在一起。


## 9.3 不要在收口阶段继续追微优化

这轮目标是让结构更清晰，不是继续压 bench。

如果一边收口一边加新的性能快路，最终一定会把“可读性提升”做成又一轮混合重构。


## 10. 验收标准

这轮“可读性与复杂度收口”完成后，应该满足：

1. 新人只看目录结构，就能理解 engine 的主层级
2. 每个核心模块都能回答“我负责什么，不负责什么”
3. 每个 sync 模块都采用相似骨架
4. `shared / helper / util` 这类模糊文件数量明显减少
5. 不需要牺牲现有 benchmark 成果


## 11. 最终判断

对当前 dataview engine 来说，下一步最合理的方向不是继续无差别优化，而是先做一轮结构收口。

原因不是“代码不好看”，而是：

- 当前剩余性能问题已经变得局部而精细
- 如果不先降低理解成本，下一轮优化很容易继续把复杂度堆高
- 结构收口本身会直接提高后续性能优化的成功率

因此，长期最优顺序应该是：

1. 先做内部可读性提升
2. 收紧模块边界
3. 再做下一轮只针对 `sections / group index / history replay` 的性能优化

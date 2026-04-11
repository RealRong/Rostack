# Dataview 与 Whiteboard 架构适配性结论

## 结论

从架构师角度看，Dataview 和 Whiteboard 的底层设计在本质上存在区别。

主要是：

- 它们的高性能来源不同
- 它们优化的成本模型不同
- 它们服务的交互模式不同

所以结论不是谁更先进或谁更“规范”

而是：

- 两者各自匹配自己的问题空间
- 在底层不应该为了形式统一而统一

一句话总结：

- Dataview 适合“统一状态 + 派生快照 + 一次提交”
- Whiteboard 适合“文档内核 + impact 驱动索引/投影 + 细粒度增量同步”

这两种路线不是一新一旧，也不是一个对一个错，而是面向两种不同系统形态的合理工程解。

## 第一判断：两套设计对各自都合理

### Dataview 的设计为什么合理

Dataview 的核心对象不是几何场景，而是：

- 文档
- 视图配置
- 查询/过滤/排序/分组
- 投影后的 records / sections / appearances

它更像一个“查询驱动的数据视图引擎”，而不是实时几何编辑器。

这意味着它的核心问题是：

- 一个提交之后，整个视图语义要不要重算
- 新的视图结果是什么
- 订阅者如何看到一致的下一帧状态

所以它自然适合：

- 单 `State`
- 单 `Store`
- `plan -> derive -> store.set(next)` 的提交模型

在这个模型里：

- `doc`
- `index`
- `project`
- `history`

本来就是同一个事务里的几个面向。

把它们放在一个 state 里，不是为了“抽象漂亮”，而是因为它们确实天然属于同一个快照。

### Whiteboard 的设计为什么合理

Whiteboard 的核心对象不是查询结果，而是一个持续变化的空间场景：

- node geometry
- edge routing
- snap candidates
- frame containment
- selection transform targets
- mindmap layout
- scene order

它更像一个“交互驱动的几何引擎 + 投影引擎”。

这意味着它的核心问题不是：

- 能不能一次生成完整 next state

而是：

- 哪些局部几何失效了
- 哪些索引需要重算
- 哪些订阅 key 真正受影响
- 如何避免大面积 fanout

所以它自然适合：

- 文档作为 committed source
- read 侧维护长期存活的 index / projection
- 用 `impact` 驱动局部追平
- 用 keyed / tracked store 做细粒度通知

白板类系统更依赖局部增量同步。

## 第二判断：两套设计都可以高性能，但性能来源不同

### Dataview 的高性能来源

Dataview 的高性能主要来自以下几类能力：

1. 把提交压缩成单事务
- 一次 `plan`
- 一次 derive index
- 一次 derive project
- 一次 `store.set(next)`

2. 让读层主要退化成 selector 问题
- 读 API 主要是从统一状态做选择
- 通过 equality 避免无意义通知

3. 用统一状态快照换取一致性与可维护性
- 订阅者看到的是单次提交后的完整下一态
- 不需要额外理解中间索引同步阶段

4. 把复杂度集中在 derive，而不是 publish
- commit path 清晰
- 读写边界清晰

这非常适合 dataview，因为 dataview 的主要成本不是逐像素交互，而是变更后重新计算“当前数据视图”

换句话说，dataview 的性能重点是：高效地产生一致的新视图快照

### Whiteboard 的高性能来源

Whiteboard 的高性能主要来自另一套机制：

1. 不把所有 read 结果都视为同一种状态
- geometry index 是一类东西
- snap index 是一类东西
- edge projection 是一类东西
- mindmap projection 是另一类东西

2. 用 `impact` 做精确失效传播
- 哪些 node 变了
- 哪些 edge 受 node 影响
- 哪些 list 需要更新
- 哪些 geometry 需要重算

3. 只同步真的被影响的局部对象
- changed ids
- affected edges
- changed trees

4. 用 tracked/keyed store 限制 fanout
- 只对已订阅 key 通知
- 不做“全局 state 更新后再让每个人自查”

5. 允许某些 projection 作为长期缓存对象存在
- 复用几何结果
- 复用 edge ends
- 复用 mindmap tree/layout cache

这非常适合 whiteboard，因为 whiteboard 的主要成本是：

- 高频交互下的局部几何更新
- 空间关系和路由关系的持续维护

换句话说，whiteboard 的性能重点是高效地维护一个实时可交互的空间场景

## 第三判断：两套系统在底层不该强行统一

### 不该统一的根本原因

架构是否应该统一，不看“风格能不能对齐”，而看下面三个问题：

1. 核心实体是否同构
2. 主要性能瓶颈是否同构
3. 订阅与失效模型是否同构

dataview 和 whiteboard 在这三点上都不是同构系统。

### 1. 核心实体不同

dataview 的核心实体是：

- 文档数据
- 视图配置
- 查询结果
- 投影视图

whiteboard 的核心实体是：

- 空间节点
- 连线
- 几何约束
- 路由结果
- 空间索引
- 实时交互态依赖的投影

一个更像“数据投影引擎”，一个更像“图形场景引擎”。

### 2. 主要瓶颈不同

dataview 更关心：

- 提交后的一致性快照
- query/index/project 的派生效率
- 大量只读订阅者的稳定消费

whiteboard 更关心：

- pointer move / drag / resize / route 调整中的局部更新
- geometry / snap / edge / mindmap 的局部重算成本
- 只让真正受影响的观察者刷新

### 3. 失效传播模型不同

dataview 更适合：

- 先生成完整 next state
- 再让 selector 判断自己要不要响应

whiteboard 更适合：

- 先知道谁脏了
- 再按脏区驱动索引和投影追平
- 最后向具体订阅者 fanout

这两种模型都可以高性能，但它们是两种不同的性能哲学。

## 为什么“统一底层”通常是错误目标

很多团队会天然追求：

- 一套 store 模型
- 一套 commit 模型
- 一套 read API 风格

这在组织层面看起来整齐，但如果系统形态不同，统一通常会带来三类问题。

### 1. 用错误的抽象压扁问题空间

如果强行把 whiteboard 压成 dataview 式单 state：

- 要么把大量投影缓存硬塞进一个大 state
- 要么每次 commit 重建大量 read 结果

前者只是形式统一，实质没变。

后者则很可能损失 whiteboard 最重要的局部增量能力。

### 2. 为了统一而放弃关键优化

如果强行把 dataview 改成 whiteboard 式多投影增量同步：

- commit 语义会变复杂
- snapshot 一致性会变差
- selector 模型会被不必要地分裂

结果通常是把 dataview 最清晰的地方搞复杂。

### 3. 把“可复用性”误判成“必须同构”

真正应该复用的往往不是整个底层架构，而是：

- store 基础设施
- equality 工具
- 通知机制
- perf tracing
- 调试与 profiling 规范
- 错误模型
- 命令边界设计原则

也就是说：

- 可以复用基础设施
- 不应该强求引擎形态同构

## 更准确的架构判断

如果站在系统设计层面，我会这样定性：

### dataview

dataview 是“状态快照驱动”的引擎。

它的核心价值在于：

- 提交边界清晰
- 派生链明确
- 读层统一
- 一致性强

因此单 store 是正交且自然的。

### whiteboard

whiteboard 是“增量投影驱动”的引擎。

它的核心价值在于：

- 空间场景的局部维护能力
- 失效传播精确
- 订阅 fanout 精细
- 几何与投影缓存可持续复用

因此多 projection + impact invalidate 是正交且自然的。

## 最终结论

从架构适配性看：

- dataview 的单状态快照路线是合理且高性能的
- whiteboard 的 impact 驱动增量投影路线也是合理且高性能的

从底层统一性看：

- 两者不应该为了统一而统一
- 它们本来就在解决两类不同的问题
- 强行统一底层，通常只会损失各自最重要的性能来源

正确的策略不是：

- 用一个引擎的模型改造另一个引擎

而是：

- 保持两者底层各自最优
- 在事务语言、调试能力、perf 规范和工程边界上做中层统一
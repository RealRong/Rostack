# Dataview 性能可测试性长期最优方案

## 1. 文档目的

本文只讨论一件事：

- 如何让 Dataview 当前的 `commit -> index -> project` 体系在长期内变得真正“性能好测”

这里明确不讨论：

- UI 视觉层体验优化
- 浏览器 profile 技巧
- 一次性的临时 benchmark 脚本
- 靠肉眼观察引用是否稳定来猜性能

本文关注的是长期终态：

- 系统自己暴露稳定、低成本、可自动化验证的性能观测面
- CI 和本地都能稳定回答“这次改动有没有把增量路径做坏”


## 2. 当前判断

## 2.1 正确性已经比较好测

现在的 Dataview 架构在正确性上已经具备不错的可测试性：

- `commit` 有单一入口
- `index` 有单一同步入口
- `project` 有单一 active pipeline
- planner、stage、store 发布边界都比较明确

这意味着下面这些测试都比较容易写：

- 给定 `delta`，planner 应该产生什么 plan
- 给定 document 和 delta，index 最终结果是否正确
- 给定 active view 和 delta，project 最终 projection 是否正确
- 连续 delta 与 undo / redo 的结果是否一致

这一点已经比“全量大 projection + equality 止损”的旧模型好很多。


## 2.2 性能现在还不好测

当前真正的短板不是“没有增量能力”，而是“没有系统化观测能力”。

目前仓库里缺下面这些关键设施：

- 没有 benchmark 命令
- 没有 stage 级耗时统计
- 没有 planner trace
- 没有 index 命中/重建统计
- 没有 projection reconcile 复用率统计
- 没有固定规模数据集的基准夹具

因此现在只能通过下面这些间接手段猜性能：

- 看代码路径
- 看引用是否复用
- 手动跑 demo 感受卡不卡

这些方法都不够长期。


## 2.3 当前系统最大的性能测试缺口

当前最难回答的不是“结果对不对”，而是下面这些问题：

- 这次 commit 到底命中了哪些 stages
- 某个 stage 是 `reuse`、`reconcile`、`recompute` 还是 `rebuild`
- 某次 `record.values` 变更到底让多少 section 重算了
- 某次 schema 变更到底让多少 index field 重建了
- 某次 reconcile 只是“结果没变”，还是“内部真复用了旧结构”

如果这些问题不能被自动回答，那么系统虽然可能很快，但长期并不“可验证”。


## 3. 长期目标

长期最优目标不是做一个“测速模式”，而是把性能观测做成正式运行时能力。

长期目标有四个：

### 3.1 可解释

任意一次 commit 之后，系统都能解释：

- 计划怎么做的
- 实际跑了什么
- 花了多少时间
- 复用了多少


### 3.2 可回归

任何一次重构后，都能自动验证：

- 增量路径没有退化成全量路径
- 某些局部更新仍然只影响局部
- undo / redo 不会放大重算范围


### 3.3 可基准

系统必须能在固定规模和固定操作脚本下稳定跑 benchmark，比较：

- 不同提交之间的时间
- 不同 stage 的时间占比
- 不同数据规模下的增长斜率


### 3.4 可约束

性能不是靠“经验”维护，而是靠明确预算维护。

例如：

- 某类 `record.values` 更新最多允许命中哪些 stages
- 某类 `view.layout` 更新不允许重建哪些 indexes
- 某些典型数据集下耗时不允许超过基线百分比


## 4. 顶层原则

## 4.1 性能观测必须内建在 runtime，不允许靠外部猴补

长期不接受下面这些模式：

- 业务测试里手动打 `console.time`
- 某个开发者本地写临时脚本测一次
- 出现卡顿再打开 profiler 排查

长期正确方向是：

- `commit`
- `index`
- `project`

这三层天然产出 trace 和 stats。


## 4.2 默认运行零侵入，开启观测显式可控

性能观测本身不能污染默认路径。

长期应同时满足：

- 默认不开启时额外成本极低
- 开启后能拿到完整结构化 trace

也就是说，观测必须是：

- 结构上内建
- 运行上可选


## 4.3 观测协议要比实现更稳定

内部实现可以重构，但 trace 和 stats 的协议应该尽量稳定。

因为长期真正依赖它们的是：

- 自动化测试
- benchmark 结果分析
- 回归检测
- 性能预算校验

如果每次内部重构都把观测协议推翻，性能测试体系也会失去价值。


## 4.4 不做分布式 patch trace，仍坚持单一流水线 trace

长期不应该让每个 projection、每个 index 自己往外发零散性能事件。

正确模型仍然是：

```txt
commit
  -> index sync
  -> project plan
  -> project stages
  -> publish
```

然后由统一 trace 收集器记录整条链路。

也就是说：

- 单一入口
- 单一 trace 上下文
- 单一 commit id
- 单一发布摘要


## 5. 长期终态：三层观测模型

长期最优里，Dataview 的性能观测应拆成三层：

1. commit trace
2. runtime stats
3. benchmark suite


## 5.1 Commit Trace

这是面向“单次提交”的结构化事实记录。

它回答：

- 这次写入是什么
- delta 长什么样
- indexes 怎么更新的
- planner 怎么决策的
- stages 怎么执行的
- 最终发布了哪些 store


## 5.2 Runtime Stats

这是面向“累计运行”的计数器和聚合统计。

它回答：

- 某 stage 总共跑了多少次
- `reuse / reconcile / recompute / rebuild` 各占多少
- 某 index field 重建了多少次
- 平均耗时、P95 耗时是多少


## 5.3 Benchmark Suite

这是面向“固定场景”的离线性能基准。

它回答：

- 10k / 50k / 100k records 下各类操作的时间曲线
- 某次提交是不是让某类操作退化了
- 哪个阶段是主要瓶颈


## 6. 核心 API 设计

长期 API 要尽量简单，不把运行时变成 profiler 工具包。

建议只增加下面几类 API。


## 6.1 观测开关

```ts
interface EnginePerfOptions {
  trace?: boolean
  stats?: boolean
}
```

```ts
createEngine({
  document,
  perf: {
    trace: true,
    stats: true
  }
})
```

说明：

- `trace` 用于保存最近若干次 commit 的结构化 trace
- `stats` 用于累计聚合统计
- 两者可以独立开启


## 6.2 对外只暴露一个 `engine.perf`

```ts
interface EnginePerfApi {
  trace: {
    last(): CommitTrace | undefined
    list(limit?: number): readonly CommitTrace[]
    clear(): void
  }
  stats: {
    snapshot(): PerfStats
    clear(): void
  }
}
```

对外不暴露更碎的 runtime 私有接口。


## 6.3 `CommitTrace` 协议

```ts
interface CommitTrace {
  id: number
  kind: 'dispatch' | 'undo' | 'redo' | 'replace'
  timings: {
    totalMs: number
    commitMs?: number
    indexMs?: number
    projectMs?: number
    publishMs?: number
  }
  delta: TraceDeltaSummary
  index: IndexTrace
  project: ProjectTrace
  publish: PublishTrace
}
```

这里不保存整个 document，也不保存海量明细，只保存性能判断需要的结构化摘要。


## 6.4 `TraceDeltaSummary`

```ts
interface TraceDeltaSummary {
  summary: {
    records: boolean
    fields: boolean
    views: boolean
    values: boolean
    activeView: boolean
    indexes: boolean
  }
  semantics: readonly {
    kind: string
    count?: number
  }[]
  entities: {
    touchedRecordCount?: number | 'all'
    touchedFieldCount?: number | 'all'
    touchedViewCount?: number | 'all'
  }
}
```

目标不是复刻原始 delta，而是回答“这次变化规模有多大”。


## 6.5 `IndexTrace`

```ts
interface IndexTrace {
  changed: boolean
  timings: {
    totalMs: number
    recordsMs?: number
    searchMs?: number
    groupMs?: number
    sortMs?: number
    calculationsMs?: number
  }
  records: IndexStageTrace
  search: IndexStageTrace
  group: IndexStageTrace
  sort: IndexStageTrace
  calculations: IndexStageTrace
}

interface IndexStageTrace {
  action: 'reuse' | 'sync' | 'rebuild'
  changed: boolean
  inputSize?: number
  outputSize?: number
  touchedFieldCount?: number | 'all'
  touchedRecordCount?: number | 'all'
  durationMs: number
}
```

注意：

- index 不需要套用 `reconcile / recompute / rebuild` 的词汇
- index trace 只描述 index 自己的同步动作


## 6.6 `ProjectTrace`

```ts
interface ProjectTrace {
  plan: ProjectPlanTrace
  timings: {
    totalMs: number
  }
  stages: readonly ProjectStageTrace[]
}

interface ProjectPlanTrace {
  view: StageAction
  search: StageAction
  filter: StageAction
  sort: StageAction
  group: StageAction
  records: StageAction
  sections: StageAction
  appearances: StageAction
  fields: StageAction
  calculations: StageAction
}

interface ProjectStageTrace {
  stage: ProjectStageName
  action: StageAction
  executed: boolean
  changed: boolean
  durationMs: number
  metrics?: ProjectStageMetrics
}
```


## 6.7 `ProjectStageMetrics`

不同 stage 的 metrics 可以不同，但协议形式要统一：

```ts
interface ProjectStageMetrics {
  inputCount?: number
  outputCount?: number
  reusedNodeCount?: number
  rebuiltNodeCount?: number
  changedSectionCount?: number
  changedRecordCount?: number
}
```

举例：

- `records` stage:
  - `outputCount = visibleIds.length`
  - `reusedNodeCount = 3`，表示 `derivedIds / orderedIds / visibleIds` 三个数组里有几个复用
- `sections` stage:
  - `outputCount = sections.length`
  - `reusedNodeCount = 复用的 section 数`
  - `changedSectionCount = 新旧 section 引用不一致的数量`
- `calculations` stage:
  - `outputCount = section count`
  - `reusedNodeCount = 复用的 CalculationCollection 数`
  - `changedSectionCount = 重算的 section 数`


## 6.8 `PublishTrace`

```ts
interface PublishTrace {
  storeCount: number
  changedStores: readonly string[]
}
```

它回答的是：

- planner 和 stage 跑完后，最终真正触发了哪些 store 的 publish

这个数据非常重要，因为它直接反映 React 层会看到多少更新。


## 6.9 `PerfStats` 协议

```ts
interface PerfStats {
  commits: {
    total: number
    dispatch: number
    undo: number
    redo: number
    replace: number
  }
  timings: {
    totalMs: RunningStat
    indexMs: RunningStat
    projectMs: RunningStat
  }
  indexes: Record<string, PerfCounter>
  stages: Record<ProjectStageName, StagePerfStats>
}

interface RunningStat {
  count: number
  total: number
  avg: number
  max: number
  p95?: number
}

interface PerfCounter {
  total: number
  changed: number
  rebuilt: number
}

interface StagePerfStats {
  total: number
  reuse: number
  reconcile: number
  recompute: number
  rebuild: number
  changed: number
  duration: RunningStat
}
```

这里不追求完美统计学，只追求长期稳定、足够解释问题。


## 7. Trace 应该埋在哪里

## 7.1 Commit Runtime

`commit` 层负责产生 trace 根节点。

它知道：

- 当前动作是 dispatch / undo / redo / replace
- 操作批次的开始和结束
- delta 长什么样

因此它应负责：

- 分配 trace id
- 建立 trace 上下文
- 汇总总耗时


## 7.2 Index Runtime

`index` 层负责写入 `IndexTrace`。

它知道：

- 哪几个 index 被执行
- 每个 index 用的是复用、同步还是重建
- 每个 index 处理的 touched records / fields 规模

不能让外部去猜 index 做了什么。


## 7.3 Project Runtime

`project` 层负责写入 `ProjectTrace`。

它知道：

- planner 决策
- stage 实际动作
- stage 的输入输出规模
- reconcile 复用了多少

尤其是这层，必须把“动作”和“结果”同时暴露出来。

例如：

- planner 说 `sections = reconcile`
- 实际确实执行了 `reconcile`
- 结果复用了 18 / 20 个 section

这三件事缺一不可。


## 7.4 Publish 层

最终 store 发布也必须记录。

否则你只能知道 runtime 内部做了什么，但不知道外部观察到多少变化。

长期必须能回答：

- `project.sections` 是否真的 publish 了
- `project.appearances` 是否真的 publish 了
- `project.calculations` 是否真的 publish 了


## 8. Benchmark 体系设计

benchmark 不应依赖随机数据，不应依赖手动操作，不应依赖浏览器 UI。

长期应该是纯 Node 基准。


## 8.1 基准目录

建议新增：

```txt
dataview/
  bench/
    fixtures/
    scenarios/
    runner/
```


## 8.2 固定数据集夹具

至少准备下面几档：

- `small`: 1k records
- `medium`: 10k records
- `large`: 50k records
- `xlarge`: 100k records

每档数据集都要固定：

- field 数量
- view 配置
- record 分布
- group bucket 分布
- calculation field 分布

这样不同提交之间才可比。


## 8.3 标准场景

benchmark 场景至少包含：

1. `record.values` 改单个非查询字段
2. `record.values` 改单个 group 字段
3. `record.values` 改单个 calculation 字段
4. `record.values` 批量改 100 条记录
5. `record.patch` 改 title，命中 search
6. `view.query` 改 search
7. `view.query` 改 filter
8. `view.query` 改 sort
9. `view.query` 改 group
10. `field.schema` 改 status options
11. undo / redo 回放上述典型场景


## 8.4 Benchmark 输出

每次 benchmark 应输出：

- 总耗时
- index 总耗时
- project 总耗时
- stage 明细耗时
- changed stores
- 关键 stage 的复用率

输出格式建议同时提供：

- 终端表格
- JSON 文件


## 8.5 Benchmark 成功标准

benchmark 的价值不是给出一个“绝对快”的数字，而是让趋势可比较。

长期 CI 可以先只做软约束：

- 新提交相比主分支退化超过阈值时报警

后续再逐步演进成硬约束。


## 9. 测试体系设计

性能测试不等于 benchmark。

长期应该有三类自动化测试。


## 9.1 Plan 测试

目标：

- 验证某类 delta 触发的 stage action 正确

例如：

- 单条 `record.values` 非 group 字段更新，不应把 `group` 变成 `recompute`
- `view.calculations` 更新，不应触发 `search/filter/sort/group`


## 9.2 Trace 测试

目标：

- 验证 trace 记录完整且结构正确

例如：

- 一次 `record.values` 更新后，`project.stages` 至少包含 `records/sections/appearances/calculations`
- `publish.changedStores` 只包含真正变动的 stores


## 9.3 Reuse 测试

目标：

- 验证 reconcile 不是名义上的，而是真复用

例如：

- 改一个 record 的 group 字段时，未受影响的 section 必须复用引用
- 未受影响的 CalculationCollection 必须复用引用


## 9.4 Benchmark 回归测试

目标：

- 验证典型场景时间没有离谱退化

这里不建议一开始就在默认单测里跑大 benchmark。

长期正确方式是：

- 轻量 smoke benchmark 进常规 CI
- 重 benchmark 单独跑


## 10. 当前系统最值得监控的指标

如果只允许先做最小集合，优先级如下：

### 10.1 必做

- 每次 commit 的总耗时
- `index` 总耗时
- `project` 总耗时
- planner 每个 stage 的 action
- 每个 stage 是否执行
- 每个 stage 是否 changed
- changed stores


### 10.2 第二优先级

- `sections` 复用 section 数
- `appearances` 复用 appearance 数
- `calculations` 复用 collection 数
- touched records / fields 数


### 10.3 第三优先级

- 每个 index field 的细粒度 rebuild 次数
- publish 到 React 后的渲染计数

最后这一层不是当前必须项，因为它已经跨到了 UI runtime。


## 11. 不应该做的事情

长期明确不建议下面这些做法：

### 11.1 不要把 benchmark 逻辑写进业务测试断言

业务测试应该验证：

- 计划是否正确
- trace 是否正确
- 复用是否正确

不要在单测里写脆弱的毫秒级断言。


### 11.2 不要让每个 stage 自己持久化零散日志

长期需要的是结构化 trace，不是日志洪水。


### 11.3 不要把性能测试建立在浏览器交互上

浏览器层适合最终体验验证，不适合作为核心性能基准。


### 11.4 不要把“引用稳定”当成唯一性能指标

引用稳定很重要，但它只能说明：

- publish 可能减少了

不能直接说明：

- CPU 就一定少了
- index 就一定没重跑

所以长期必须同时看：

- action
- duration
- reuse
- publish


## 12. 分阶段实施

## Phase 1: 最小可用 Trace

目标：

- 系统能记录单次 commit 的完整 trace

范围：

- `commit` 分配 trace id
- `index` 记录总耗时和每个 index action
- `project` 记录 plan 和每个 stage action / duration / changed
- `publish` 记录 changed stores
- 对外暴露 `engine.perf.trace.last()` 和 `list()`

验收：

- 能写 trace 测试
- 能解释任意一次 commit 的执行路径


## Phase 2: Stats 聚合

目标：

- 系统能给出累计运行统计

范围：

- 增加 `engine.perf.stats.snapshot()`
- 聚合 stage action 分布
- 聚合耗时均值和最大值
- 聚合 index rebuild 次数

验收：

- 能回答“最近这段运行里哪个 stage 最常重算”


## Phase 3: Reconcile 复用指标

目标：

- 系统能量化局部复用，而不是只看最终引用

范围：

- `records` 暴露数组复用数
- `sections` 暴露 section 复用数
- `appearances` 暴露 appearance 复用数
- `calculations` 暴露 collection 复用数

验收：

- 对典型 delta 能明确看到复用比例


## Phase 4: Benchmark Runner

目标：

- 建立固定夹具和固定场景基准

范围：

- 新增 `bench/fixtures`
- 新增 `bench/scenarios`
- 新增 `bench/runner`
- 新增 `pnpm --dir dataview bench`

验收：

- 本地可稳定复现 benchmark 结果
- CI 可收集 JSON 结果


## Phase 5: CI 回归门禁

目标：

- 性能从“可看”变成“可约束”

范围：

- 轻量 benchmark 进入常规 CI
- 重 benchmark 单独 job
- 与基线比较并报警

验收：

- 典型退化提交会被自动发现


## 13. 最终结论

当前 Dataview 的系统结构已经足够支撑“正确性好测”。

但“性能好测”还没有真正完成，因为系统还缺：

- trace
- stats
- benchmark
- perf budget

长期最优不是继续盲目细化算法，而是先把性能观测做成正式能力。

只有这样，后续所有关于：

- reconcile 是否值得
- index 是否退化
- projection 是否仍然局部更新
- React 引用是否真的稳定

这些问题，才能从“猜”变成“可验证”。

# Dataview Active Projector 长期最优重构审计（激进版）

## 1. 立场

本文明确采用以下前提：

- 目标是 **长期最优结构**，不是低风险迁移。
- **不考虑兼容成本、过渡成本、短期 API 稳定性**。
- 允许一次性改动 `shared/projector`、`shared/draft`、`dataview-core`、`dataview-engine` 的边界。
- **不引入兼容层、不保留双轨实现、不做临时 adapter**。
- 旧实现只要被新结构覆盖，就应直接删除。

因此，本文不是“如何渐进式改善当前 active projector”，而是回答：

> 如果只追求几年后的最优边界，Dataview Active Projector 应该被重写成什么样。

## 2. 总结论

当前 `dataview/packages/dataview-engine/src/active` 的问题，不是没有 projector，而是 **projector 只落了一半**。

现状是：

- `active/projector/spec.ts` 已经接入 `@shared/projector`。
- `query -> membership -> summary -> publish` 的阶段骨架已经存在。
- 但在 projector 外围，仍保留了一大层自制的 planning / policy / runtime / shared helper / publish glue。

这导致 active 现在像一个“projector 外壳 + 一套自定义小型框架”的混合体，而不是一个纯粹的 read projection engine。

### 最终判断

如果以长期最优为目标，应该做的不是“继续在现有结构上修补”，而是：

1. **保留 projector 主骨架。**
2. **删除 projector 外围重复抽象。**
3. **把通用基础设施直接下沉到 `shared/draft` / `shared/projector`。**
4. **把领域语义直接推回 `dataview-core`。**
5. **把 active 收缩成仅负责增量索引、阶段执行、只读投影输出。**

换句话说：

> Active 不应该继续维护自己的 policy mini-framework、patch mini-framework、publish mini-framework、create-default mini-framework。

## 3. 当前结构的核心问题

### 3.1 projector 已存在，但阶段边界没有真正成立

当前调用链典型形态是：

```text
active/projector/spec
  -> active/phases/query
    -> active/query/runtime
      -> active/projector/policy
```

这意味着：

- `spec` 知道 phases。
- `phases/*` 是一层薄适配。
- `runtime.ts` 既做 orchestration，又做 derive，又做 metrics，又去外部拿 action policy。
- `projector/policy.ts` 再集中承载 reset、plan、action 三类决策。

这不是清晰分层，而是流程被拆散后再互相回调。

### 3.2 `projector/policy.ts` 已经成为低内聚中心

当前 `dataview/packages/dataview-engine/src/active/projector/policy.ts` 同时承担：

- active projection context 读取
- reset 判断
- query/membership/summary/publish 的 plan policy
- query/membership/summary 的 action policy
- 部分跨阶段 transition 判断

这类文件天然会不断膨胀，因为任何“是否重算 / 是否复用 / 是否需要 publish”的新规则，都会被顺手塞进去。

长期来看，这个文件应该被拆掉，而不是继续扩展。

### 3.3 planner 与 stage 同时做“是否运行”判断，重复

当前 `active/projector/planner.ts` 先决定 phase 是否进入计划；
进入后，`query/runtime.ts`、`membership/runtime.ts`、`summary/runtime.ts`、`publish/runtime.ts` 又各自决定 `reuse | sync | rebuild`。

这会形成双重判定：

- planner 判一次
- stage 再判一次

这是当前结构里最典型的“为了增量而额外引入的复杂度”，而不是必要复杂度。

### 3.4 active 目录仍保存一批本该下沉的基础设施

最典型的是：

- `active/shared/patch.ts`
- `active/query/runtime.ts` 里的 list diff
- `active/publish/runtime.ts` 里的 snapshot reuse / struct diff / metrics

这些都不是 dataview active 特有逻辑，而是投影基础设施。

如果继续留在 active，后续 whiteboard 或其他 projector 需要类似能力时，只会复制第二份、第三份。

### 3.5 active API 混入了 write/domain rule

`active/api/records.ts` 当前不仅读取 active state，还直接解释：

- filter default
- group default
- create record draft
- move order intent

这说明 active 不只是 read projection engine，而已经部分变成 command builder。

这违背长期边界：

- active 负责读模型
- core 负责领域规则
- UI/engine 负责把上下文翻译成 core command 输入

## 4. 激进版最终目标

## 4.1 最终边界

最终应收敛为三层：

```text
shared/projector
  只负责 projector 基础设施

dataview-core
  只负责 dataview 领域语义与 command/domain 规则

dataview-engine/active
  只负责 active view 的增量索引、阶段执行、投影发布、读 API
```

其中：

- `shared/projector` 不理解 dataview 的 filter/group/sort/search
- `dataview-core` 不理解 active index 的内部布局
- `active` 不再维护通用 patch / list diff / struct publish / command default logic

## 4.2 最终结构

推荐的终态结构如下：

```text
dataview-engine/src/active
  projector/
    spec.ts
    createActiveProjector.ts
    createWorking.ts
    createEmptySnapshot.ts
    context.ts
    reset.ts
    impact.ts
    metrics.ts

  query/
    stage.ts
    derive.ts
    state.ts
    candidateSet.ts
    filterCandidates.ts
    searchCandidates.ts
    sortCandidates.ts

  membership/
    stage.ts
    derive.ts
    transition.ts

  summary/
    stage.ts
    derive.ts

  publish/
    stage.ts
    base.ts
    sections.ts
    summaries.ts
    itemIdPool.ts

  index/
    records.ts
    values.ts
    search.ts
    sort.ts
    bucket/
      spec.ts
      derive.ts
      sync.ts

  api/
    active.ts
    layout.ts
    fields.ts
    records.ts
```

### 关键差异

- **删除 `phases/` 目录。**
- **删除 `projector/policy.ts`。**
- **删除 `active/shared/patch.ts`。**
- **删除 `active/shared` 作为“大杂烩目录”的定位。**

如果某个工具只服务一个子域，就应放回该子域，而不是继续堆在 `shared/`。

## 5. 比当前审计更激进的核心决策

## 5.1 不再保留 per-phase planner

这是本文与“保守收敛版”最大的区别。

### 当前做法

`active/projector/planner.ts` 会分别决定：

- plan query
- plan membership
- plan summary
- plan publish

### 激进版做法

planner 只保留两种情况：

1. **reset**
2. **正常执行固定阶段链**

也就是说：

```text
reset -> publish reset
normal -> query -> membership -> summary -> publish
```

不再在 planner 层决定某个阶段是否进入计划。

### 原因

当前每个 stage 本来就会返回：

- `reuse`
- `sync`
- `rebuild`

既然 stage 已经具备“我本轮需不需要做事”的能力，就没有必要再在 planner 前面加一层 phase gating。

### 长期收益

- 删除一整层重复条件判断
- 删除 plan policy 与 action policy 的边界重叠
- 把 phase 执行语义收敛到 stage 自身
- 降低理解成本

### 代价

- 每轮 normal publish 都会进入四个 stage
- 但多数 stage 会很快返回 `reuse`

这点额外开销远小于现有胶水层带来的复杂度，长期是值得的。

## 5.2 不再保留 `phases/*` 薄绑定目录

如果不考虑过渡，`phases/*` 没有长期价值。

它们现在只是：

- 从 projector context 取输入
- 调用 runtime/stage
- 写回 working
- emit scope

这层不是领域层，也不是基础设施层，只是一个薄胶水目录。

### 激进版做法

直接让每个子域导出自己的 projector stage：

```text
query/stage.ts
membership/stage.ts
summary/stage.ts
publish/stage.ts
```

`projector/spec.ts` 直接注册这些 stage。

这样：

- 没有额外的 `phases/` 跳转
- 每个 stage 自己就是 projector phase 的唯一入口
- “阶段 orchestration + delta emit + metrics” 真正内聚

## 5.3 `action` 判断必须只存在于 stage 内

当前 query 的 `action` 解析仍在 `projector/policy.ts`，这在长期一定会继续蔓延到更多阶段规则。

最终应做到：

- `query/stage.ts` 自己判断 query action
- `membership/stage.ts` 自己判断 membership action
- `summary/stage.ts` 自己判断 summary action
- `publish/stage.ts` 自己判断 publish action

不允许再有一个中心化文件统一解释所有 stage action。

原因很简单：

- action 是阶段的内部执行策略，不是 projector 的通用规则。

projector 只应关心：

- 阶段顺序
- scope merge
- working/snapshot lifecycle

不应理解 dataview 的 query/group/calc/publish 语义。

## 6. 立即应该下沉到 shared 的能力

## 6.1 `active/shared/patch.ts` 直接迁到 `shared/draft/collections`

`active/shared/patch.ts` 本质是：

- map overlay
- map patch builder
- array patch builder
- lazy copy-on-write collection finish

这已经完全符合 `shared/draft` 的职责。

### 最终形式

建议直接新增：

```text
shared/draft/src/collections.ts
```

提供：

```ts
createMapDraft(previous)
createArrayDraft(previous)
```

以及：

- lazy copy-on-write
- stable reference for untouched branches
- overlay depth control
- 大 delta 下自动 materialize

### 明确结论

- 不要继续保留 `active/shared/patch.ts`
- 不要做 re-export 兼容
- 直接搬走后替换调用点，再删旧文件

## 6.2 list diff 直接进入 `shared/projector`

`query/runtime.ts` 里的 visible diff，本质是 projector 通用能力：

```text
previous list + next list -> added / removed / orderChanged
```

这应该直接成为 `shared/projector` primitive：

```ts
projectListChange(previous, next)
```

然后统一用于：

- active query visible delta
- publish entity list
- 未来 whiteboard list/selection projector

### 明确结论

- 删除 `query/runtime.ts` 本地 `collectVisibleDiff`
- 不再在 active 里重复维护这类 list diff helper

## 6.3 struct publish 直接进入 `shared/projector/publish`

`publish/runtime.ts` 里的：

- `SNAPSHOT_KEYS`
- `countReusedStores`
- `reuseSnapshot`

本质是 projector 的 struct publish / struct reuse / struct metrics。

建议直接抽成：

```ts
publishStruct({
  previous,
  next,
  keys
})
```

返回：

- `value`
- `reusedNodeCount`
- `rebuiltNodeCount`
- `changed`

### 明确结论

- active publish 不该再手写 snapshot key 遍历
- 这类代码一旦形成 primitive，其他 projector 都能共用

## 6.4 stage metrics 统一进入 `shared/projector`

当前 query/membership/summary/publish 都可能统计：

- `inputCount`
- `outputCount`
- `reusedNodeCount`
- `rebuiltNodeCount`
- `changedRecordCount`

这不该每个 stage 自己拼一遍。

建议直接提供：

```ts
createStageMetrics(...)
```

如果短期不愿立刻下沉，也至少应先进入：

```text
active/projector/metrics.ts
```

但长期目标仍应是 shared primitive。

## 7. 必须推回 dataview-core 的职责

## 7.1 record create default 不应继续留在 active

`active/api/records.ts` 当前同时处理：

- create placement 解析
- filter default 推导
- group default 推导
- draft 组装
- intent 构造

这应拆成两部分：

### dataview-engine/active 保留

只保留：

- 从当前 active state 解析 section
- 从 item placement 解析 beforeRecord
- 把当前 UI 位置上下文转成 core command 输入

### dataview-core 接管

新增 core command/domain builder，负责：

- `applyFilterDefaults`
- `applyGroupDefault`
- `createRecordIntent`

### 明确结论

`active/api/records.ts` 不再允许直接解释 filter/group 语义。

## 7.2 filter candidate 规则解释推回 core

`active/query/filterCandidates.ts` 里应区分两层：

### 留在 active 的部分

- 使用 active index 执行候选检索
- 使用 runtime index 做 lookup

### 推回 core 的部分

- filter rule 到 candidate lookup plan 的解释
- include/exclude 范围推导
- 边界策略与 pure rule planning

建议直接建立：

```text
dataview-core/src/query/*
```

例如：

```ts
planFilterCandidate(rule, field) -> CandidateLookupPlan
```

active 只执行 plan，不再解释规则。

## 8. 应直接删除的旧结构

以下结构在长期没有保留价值，应在重构完成后直接删除：

### 8.1 `active/projector/policy.ts`

拆散后删除。

只允许剩余：

- `reset.ts`
- `impact.ts`
- `metrics.ts`

不再保留一个总入口 policy 文件。

### 8.2 `active/phases/`

删除整个目录。

阶段入口直接放在各子域 `stage.ts`。

### 8.3 `active/shared/patch.ts`

迁走到 `shared/draft/collections.ts` 后删除。

### 8.4 `active/shared` 作为收纳目录的定位

迁移后不应再存在“遇到不知道放哪就塞进 `active/shared`”的做法。

如果目录仍保留，也只应保留极少数真正跨 active 子域、且不值得下沉 shared 的工具。

## 9. 最终不建议做的事

## 9.1 不要继续做“阶段一 / 阶段二 / 阶段三”的兼容式演进

既然目标是长期最优，就不应：

- 保留 `runtime.ts` 与 `stage.ts` 双轨
- 保留 `policy.ts` 同时服务旧入口和新入口
- 保留 `active/shared/patch.ts` 同时转发到 `shared/draft`
- 保留 core 与 engine 两边重复的 create default 逻辑

这些都会把重构拖成长期债务。

## 9.2 不要把 dataview 语义下沉到 shared

shared 只能承载 primitive：

- draft
- projector
- reducer
- mutation
- store

不能承载：

- filter/group/sort/search/bucket 语义
- dataview section/item 业务形态
- record create 业务规则

## 9.3 不要为“文件更小”机械切碎性能模块

像 `query/order.ts` 这类文件，如果本质上是 ordered id set algebra / candidate set 算法集合，就应该按对象边界聚合，而不是按函数数量切片。

可以重命名为：

- `candidateSet.ts`
- `orderedRecordSet.ts`

但不应为了“好看”拆成大量无上下文小文件。

## 10. 直接到终态的实施顺序

如果不考虑兼容，我建议直接按下面顺序做，而不是渐进迁移：

### 步骤 1：砍掉 projector 外围重复层

- 删除 `active/phases/*`
- 删除 `active/projector/policy.ts`
- 把各阶段 action/reuse/delta/metrics 内聚到 `query/stage.ts`、`membership/stage.ts`、`summary/stage.ts`、`publish/stage.ts`
- planner 改为仅处理 `reset | normal-run-all`

### 步骤 2：同步抽 shared primitive

- 把 `active/shared/patch.ts` 迁到 `shared/draft/collections.ts`
- 把 list diff、struct publish、stage metrics 抽到 `shared/projector`
- 删除 active 本地重复实现

### 步骤 3：把领域语义推回 core

- 拆 `active/api/records.ts`
- 新增 `dataview-core` 的 create command builder
- 新增 `dataview-core` 的 candidate lookup planning
- active 只保留 context resolve 与 lookup execute

### 步骤 4：清理目录与命名

- 删除 `active/shared` 垃圾桶式命名
- 拆 `index/bucket.ts` 为 `spec / derive / sync`
- 重命名 `query/order.ts` 为更能表达职责的模块名

## 11. 完成态验收标准

满足以下条件，才算真正完成：

### 11.1 结构验收

- `active/projector/policy.ts` 已删除
- `active/phases/` 已删除
- `active/shared/patch.ts` 已删除
- `active/api/records.ts` 不再解释 filter/group default

### 11.2 shared 验收

- `shared/draft` 已提供 collection draft primitive
- `shared/projector` 已提供 list diff / struct publish / stage metrics primitive
- active 不再维护这些通用基础设施的私有版本

### 11.3 core 验收

- record create default 逻辑在 `dataview-core`
- filter candidate 规则解释在 `dataview-core`
- active 只执行 index lookup 与投影发布

### 11.4 active 验收

- stage 是唯一 action 判断位置
- projector 只负责骨架装配
- active 只剩 index / stage / publish / read api

## 12. 最终结论

激进版结论可以概括成一句话：

> 不要继续把 Dataview Active Projector 当成“已有架构上逐步收敛的重构区”，而要把它直接定性为：一个建立在 `shared/projector` 与 `dataview-core` 之上的、纯粹的 active read projection engine。

因此，长期最优方案不是“继续给当前 active 补 helper”，而是：

- **删除重复层**
- **下沉基础设施**
- **回推领域规则**
- **让 active 只剩真正属于 active 的东西**

这才是值得一次性到位的最终形态。

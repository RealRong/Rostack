# Projection 下游执行层重构方案

## 目标

这份文档只讨论一个范围：

- `MutationDelta`
- domain typed delta
- `shared/projection`
- projection phase 下游的执行层

重点不是再讨论 `MutationDelta` 本身，而是回答下面几个问题：

- 现在是不是已经基本解决了 `MutationDelta -> Projection` 这一层？
- 为什么 whiteboard 里还是有很多 `read* / collect* / append* / patch*` helper？
- `whiteboard-editor-scene/src/runtime/sourceInput.ts` 算不算同类问题？
- dataview 和 whiteboard 在 projection 下游到底应该怎么收口才是最优解？
- 这些问题主要是底层设施问题，还是数据结构问题？

本文档给出的结论是：

- `MutationDelta -> typed delta -> projection consumption` 这层已经基本完成。
- 剩下的问题不是“继续给 `MutationDelta` 加 helper”。
- 剩下的问题是 projection 下游缺少正式的“执行工作模型”。
- 更准确地说，根因是数据结构和边界模型没有定义完整，导致执行层设施只能靠 helper 拼语义。
- 这不是局部补丁问题，应该按底层模型整体重构。

本文档明确不保留兼容层。

- 不保留两套 document delta 语义。
- 不保留两套 runtime delta 语义。
- 不保留两套 execution / dirty / impact 模型。
- 目标是一次切到最终形态，而不是在旧 helper 外面再包一层 helper。

---

## 一句话结论

当前真正未完成的不是 `MutationDelta`，而是这两个下游层：

1. runtime source semantic delta
2. projection downstream execution plan / change model

也就是说，文档级变更已经有 canonical delta 了，但运行时输入和 phase 下游执行还没有 canonical model。

这就是为什么：

- whiteboard `sourceInput.ts` 还在手写 runtime 语义解释
- whiteboard `graph/patch.ts` 和 `render/patch.ts` 还在手工合并 touched 集
- dataview `createDataviewProjection.ts` 还在靠 `ctx.dirty.* = true` 做 phase 传播
- dataview 各 stage 还在各自重新推导 `rebuild / sync / reuse`

---

## 结论先说清

### 1. `MutationDelta -> Projection` 这一层基本已经解决

现在这层的边界已经比较清楚：

- `shared/mutation` 负责 normalized `MutationDelta`
- domain package 负责 typed delta
- `shared/projection` 负责 phase 执行和 surface 同步

目前 dataview / whiteboard 的主要问题，已经不再是：

- 直接对 raw `delta.changes` 做 `split('.')`
- 到处手写 `startsWith(...)`
- 到处手写 `readTouched* / has* / pathsMatch`

这些 document mutation 解释债务，主体上已经收敛。

### 2. 剩下的问题是 projection 下游的“工作计划”没有正式建模

现在下游仍然有两类重复解释：

- whiteboard：把 runtime/session/preview/clock 自己再解释成一套 touched 语义
- dataview：把 typed delta 的结果自己再解释成 phase dirty / phase action / phase fanout

本质上，系统缺的是：

- 下游 canonical runtime delta
- 下游 canonical execution plan
- 下游 canonical change channels

### 3. 主因更偏“数据结构/边界模型不完整”，设施问题是后果

不是单纯因为 helper 写得丑。

如果一个消费者必须知道：

- 上游有哪些 channel
- 哪几个 channel 要 union
- 哪几个 channel 会影响当前 phase
- 哪个 phase 变了要继续推下游 phase

那就说明当前边界数据结构没有把语义直接表达出来。

所以这里的主因是：

- 数据结构定义不够到位
- 设施层只能围着这些不完整结构打补丁

正确顺序应该是：

1. 先把边界模型定准
2. 再让执行设施消费这个模型
3. 删除局部 helper

---

## 当前代码审计

## 1. `shared/projection` 目前状态是对的

`shared/projection/src/createProjection.ts` 现在做的事情是：

- 跑 phase graph
- 维护 runtime state
- 根据 surface 配置同步 store

它没有再要求一套额外的 `scope/action/emit` DSL。

phase 的语义就是：

- phase 读取 `ctx.input`
- phase 修改 `ctx.state`
- phase 标记 `ctx.phase.*.changed`

这个方向是对的。

也就是说，projection runtime 不需要再发明更抽象的 phase return 协议。

真正缺的不是 projection runtime，而是 domain 自己传给 phase 的那份“工作计划”。

### 对 `shared/projection` 的最终判断

- 保持轻量，不再把 dataview/whiteboard 的语义继续泛化进 `shared/projection`
- 不要在这里引入 `scope / action / emit` 这类通用 DSL
- 不要把 dataview 的 phase invalidation 或 whiteboard 的 render scope 抽象成 shared 级别概念
- `shared/projection` 继续只做 phase shell 和 surface sync

这层最多允许非常小的增强：

- 允许 domain 在 `ctx.dirty` 或 `ctx.state` 上挂自己的 typed plan
- 允许 surface `changed/patch` 直接消费 domain 计算好的 change model

但不应继续上推成通用规则语言。

---

## 2. dataview 的问题已经从 delta decode 转成 execution planning

`dataview/packages/dataview-engine/src/projection/createDataviewProjection.ts` 现在最大的问题不是 raw delta 读取，而是：

- `document` phase 手工写 `ctx.dirty.index/query/membership/summary/view = true`
- 每个 phase 再根据自己看到的 state 和 delta 决定 `reuse / sync / rebuild`
- query/membership/summary/view 之间的下游传播是隐式的

当前 dataview 的执行计划分散在两层：

1. projection phase 内的 dirty 布尔传播
2. 各 stage 内部的 action resolve 逻辑

这会带来几个问题：

- phase 依赖图是显式的，但 phase invalidation 规则是分散的
- 同一个更新为什么触发 query / membership / summary，要跨多个文件才能看明白
- `action` 的推导在 stage 内部，projection 本体并不知道自己本轮到底准备跑什么
- 后续如果新增一个 query aspect 或 index channel，很容易漏改 phase 传播

### dataview 当前的真实债务

不是“还需要更多 typed delta helper”，而是缺一份统一的 `DataviewProjectionPlan`。

这份 plan 应该一次性回答：

- 当前 active view / plan 是否变化
- index 本轮是 `reuse / sync / rebuild`
- query 本轮是 `reuse / sync / rebuild`
- membership 本轮是 `reuse / sync / rebuild`
- summary 本轮是 `reuse / sync / rebuild`
- publish 本轮是 `reuse / sync / rebuild`
- 每个 phase 的具体原因和可复用范围是什么

也就是说，dataview 现在的问题是：

- 语义已经 typed 了
- 但执行计划还没有 typed

---

## 3. whiteboard 的问题是 runtime delta 和 graph/render change model 还没收口

whiteboard 这边和 dataview 不同。

它的 document mutation 这层已经基本 typed 了，但还有两个额外层没有 canonical model。

### 3.1 `runtime/sourceInput.ts` 是同类问题，但不是 document mutation 同类

`whiteboard/packages/whiteboard-editor-scene/src/runtime/sourceInput.ts` 现在做的是：

- 把 source snapshot/change 翻译成 `RuntimeInputDelta`
- 手工解释 edit / preview / hover / interaction / clock
- 手工收集 preview node/edge/mindmap ids
- 手工判断哪些 runtime session channel changed

这不是 document mutation decode。

但它和之前的 helper 债务有同一种结构性问题：

- 语义没有沉到正式模型里
- 所以上层文件在反复“解释一次 runtime source”

所以它不是同一层问题，但确实是同一类边界问题。

### 3.2 `graph/patch.ts` 现在主要是执行器问题，不再是 raw delta decode 问题

`whiteboard/packages/whiteboard-editor-scene/src/model/graph/patch.ts` 里剩余 helper 可以分两类：

第一类是合理的执行器 helper：

- queue
- drain
- deferred patch
- fanout
- phase sequencing

这些本身不说明 `MutationDelta` 有问题。

第二类是边界模型不完整导致的 helper：

- graph targets 的组合
- document delta 与 runtime delta 的合流
- graph dirty channel 的人工 seed

这说明 graph phase 上游虽然已经有 typed document delta，但 graph phase 自己还在承担：

- runtime semantic merge
- dirty channel build
- downstream fanout routing

也就是说，graph patch 既像 plan compiler，又像 executor。

这才是它现在显得“helper 多”的根因。

### 3.3 render/ui 下游仍然在手工 union 多个 dirty channel

`render/patch.ts` 和 `ui/patch.ts` 现在的模式是：

- 看 `dirty.graph.*`
- 看 `delta.ui.*`
- 看 `delta.items.change`
- 看 `runtime.delta.*`
- 然后在本地 union 成当前 phase 的 touched ids / scope

这说明问题已经不在 `MutationDelta`，而在：

- `GraphDirty`
- `GraphDelta`
- `UiDelta`
- `RenderDelta`

这组结构虽然能承载变化，但不直接表达消费语义。

下游必须知道：

- 哪些 bucket 要合并
- 哪些 bucket 影响 node render
- 哪些 bucket 影响 edge statics / labels / masks / active / overlay

只要消费方还得知道这些细节，说明 change model 仍然太原始。

---

## 最终设计原则

这里给出最终原则，不留模糊空间。

### 原则 1：document mutation 和 runtime mutation 是两条 canonical 输入，不允许局部重复解释

允许存在两类 delta，但必须边界清楚：

1. `MutationDelta`
2. runtime source delta

它们分别对应不同来源：

- document source
- runtime/session source

但每一类都必须只有一套 canonical 读模型，不能出现：

- `sourceInput.ts` 一套解释
- `graph/patch.ts` 再解释一套
- `render/patch.ts` 再解释一套

### 原则 2：projection phase 不负责发明下游语义，只消费 plan

phase 本身应该只做：

- 更新 state
- 运行 domain executor
- 标记 phase changed

phase 不应该自己同时承担：

- action resolve
- dirty fanout
- stage 传播
- phase 依赖推理

这些都应该在 phase 之前收敛成一份 typed plan。

### 原则 3：如果消费者必须 union 多个 bucket，说明边界模型不够高

这条原则对 dataview 和 whiteboard 都成立。

如果代码长成这样：

- `collectNodeRenderIds(...)`
- `collectActiveEdgeIds(...)`
- `ctx.dirty.query = true; ctx.dirty.summary = true`
- `if (deltaA || deltaB || deltaC) ...`

那说明消费者还在解释上游结构。

最终形态应该是：

- 上游结构直接给出消费者需要的 channel / selection / plan
- 消费方只声明“我吃哪个语义面”

### 原则 4：优先重构模型和边界，不做局部 helper 清理

不接受这种路线：

- 在 `render/patch.ts` 上继续抽几个 `collect*` helper
- 在 `createDataviewProjection.ts` 里再包装一层 `markDirty*`
- 在 `sourceInput.ts` 外面再包一层 `readRuntimeTouched*`

这种做法只是把重复解释挪位置，不是消灭重复解释。

---

## 最终方案：shared 层该做什么，不该做什么

## 1. `shared/mutation`

维持现在的职责：

- canonical normalized mutation delta
- typed mutation delta 构建能力
- typed path codec / typed semantic selector 能力继续放在这层

但这份文档不再要求它继续承担 projection 下游执行职责。

## 2. `shared/projection`

维持现在的职责：

- phase graph
- runtime state
- surface value/family sync

最终不做下面这些事：

- 不做 dataview phase invalidation 规则引擎
- 不做 whiteboard graph/render scope 规则引擎
- 不抽象统一 `workset / impact / emit` DSL
- 不再把 domain 下游语义泛化成 shared 设施

### shared 层允许的唯一方向

只允许补 very small primitives，不允许补 domain policy。

例如：

- surface patch builder 接更稳定的 typed patch
- phase context 挂 domain plan

但不允许在 shared 层定义：

- dataview summary touched section 规则
- whiteboard render label invalidation 规则

这些都应该回到 domain。

---

## dataview 最终设计

## 1. 核心目标

dataview 应该从：

- “phase 内部手工传播 dirty”

切到：

- “先编译 projection plan，再让 phase 执行”

### 最终只保留一套 projection runtime

不保留：

- 旧 dirty 传播逻辑
- 新 plan 逻辑并存

最终只能保留 plan 驱动。

## 2. 新的核心模型：`DataviewProjectionPlan`

建议新增一个 package-local plan 模型，例如：

`dataview/packages/dataview-engine/src/projection/plan.ts`

最终 plan 应表达：

- `document.changed`
- `document.planChanged`
- `index.action`
- `query.action`
- `membership.action`
- `summary.action`
- `view.action`
- 各 phase 的 reason / reuse boundary

建议形态：

```ts
type PhaseAction = 'reuse' | 'sync' | 'rebuild'

interface DataviewProjectionPlan {
  document: {
    changed: boolean
    activeViewChanged: boolean
    planChanged: boolean
  }
  index: {
    action: PhaseAction
  }
  query: {
    action: PhaseAction
    reuse?: {
      matched: boolean
      ordered: boolean
    }
  }
  membership: {
    action: PhaseAction
  }
  summary: {
    action: PhaseAction
    touchedSections?: ReadonlySet<SectionId> | 'all'
  }
  view: {
    action: PhaseAction
  }
}
```

重点不是字段名字，而是这条原则：

- phase action 只能在一个地方决策
- 后续 stage 只能消费，不能重新发明决策

## 3. dataview phase 的最终职责

### document phase

只做：

- 建 `DocumentReadContext`
- 解析 active view / view plan
- 编译 `DataviewProjectionPlan`
- 写入 state

不再做：

- `ctx.dirty.index = true`
- `ctx.dirty.query = true`
- `ctx.dirty.membership = true`

### index/query/membership/summary/view phase

只做：

- 读取 `ctx.state.projection.plan`
- 如果 `plan.<phase>.action === 'reuse'`，直接复位本 phase delta 并返回
- 否则运行本 phase executor

也就是说，最终形态里：

- phase 是否运行，看 plan
- phase 怎么运行，看 executor
- phase 不再负责推下游 phase

## 4. dataview stage API 也要同步收口

当前 `runQueryStage / runMembershipStage / runSummaryStage / runPublishStage` 都在自己做 action resolve。

最终要改成：

- action 在 plan compiler 统一决策
- stage 直接吃 action

建议最终 API 方向：

```ts
runQueryStage({
  action: plan.query.action,
  reuse: plan.query.reuse,
  ...
})

runMembershipStage({
  action: plan.membership.action,
  ...
})

runSummaryStage({
  action: plan.summary.action,
  touchedSections: plan.summary.touchedSections,
  ...
})

runPublishStage({
  action: plan.view.action,
  ...
})
```

这样 dataview 就不会再出现：

- projection 外层一份 dirty 传播
- stage 内层再一份 action 推理

## 5. dataview 为什么不需要再造一套 shared infra

因为 dataview 的问题不是 phase shell 不够通用，而是：

- projection plan 还没有 domain 内收口

所以最终实现应该是：

- plan 是 dataview 自己的
- projection runtime 继续用 `shared/projection`
- 不要把 dataview plan 泛化成 shared 级别框架

---

## whiteboard 最终设计

## 1. 核心目标

whiteboard 应该从：

- document delta 一套
- runtime source 手工解释一套
- graph dirty 再造一套
- render/ui 再手工 union 一套

切到：

- runtime delta canonical
- graph change model canonical
- render/ui/spatial 直接消费 change model

### 最终只保留一套 scene runtime 输入模型

不保留：

- 旧 `RuntimeInputDelta` plain object 模式
- 新 typed runtime delta 模式并存

最终 runtime 输入只能保留一套 canonical model。

## 2. 新的核心模型一：`EditorSceneRuntimeDelta`

`sourceInput.ts` 的问题不是 helper 名字多，而是当前 `RuntimeInputDelta` 是一个“可写但不自解释”的 plain object。

建议最终改成有正式读 API 的 domain delta，而不是继续裸暴露嵌套布尔和 `IdDelta`。

建议方向：

```ts
interface EditorSceneRuntimeDelta {
  session: {
    changed(channel: 'tool' | 'selection' | 'hover' | 'edit' | 'interaction'): boolean
    draft: {
      edgeIds(): ReadonlySet<EdgeId>
    }
    preview: {
      nodeIds(): ReadonlySet<NodeId>
      edgeIds(): ReadonlySet<EdgeId>
      mindmapIds(): ReadonlySet<MindmapId>
      changed(channel: 'marquee' | 'guides' | 'draw' | 'edgeGuide'): boolean
    }
  }
  clock: {
    activeMindmapIds(): ReadonlySet<MindmapId>
  }
}
```

或者同等表达力的 typed facade。

关键点只有两个：

1. `sourceInput.ts` 负责构建这份 canonical runtime delta
2. 后续 graph/ui/render 不允许再从 raw snapshot 重新解释同一层语义

### 这里不建议做 shared 级 runtime delta

原因很简单：

- dataview 当前并没有同一形态的 runtime source delta 需求
- whiteboard 的 runtime source 结构强 domain-specific

所以这一层应该是 whiteboard package-local infra，不应该提前 shared 化。

## 3. 新的核心模型二：`GraphChangeSet`

现在 whiteboard 最大的问题不是 document delta 不 typed，而是：

- `GraphDirty`
- `GraphDelta`

仍然是低层 bucket 容器。

这导致 render/ui/spatial 必须知道 bucket 细节。

最终应该把 graph phase 的输出从“低级 dirty bag”提升成“可直接消费的 change set”。

建议方向不是继续扩 helper，而是让结构自己会读。

例如：

```ts
interface GraphChangeSet {
  orderChanged(): boolean

  node: {
    ids(...channels: readonly ('lifecycle' | 'geometry' | 'content' | 'owner')[]): ReadonlySet<NodeId>
    any(...channels: readonly ('lifecycle' | 'geometry' | 'content' | 'owner')[]): boolean
  }

  edge: {
    ids(...channels: readonly ('lifecycle' | 'route' | 'style' | 'labels' | 'endpoints' | 'box')[]): ReadonlySet<EdgeId>
    any(...channels: readonly ('lifecycle' | 'route' | 'style' | 'labels' | 'endpoints' | 'box')[]): boolean
  }

  mindmap: {
    ids(...channels: readonly ('lifecycle' | 'geometry' | 'connectors' | 'membership')[]): ReadonlySet<MindmapId>
    any(...channels: readonly ('lifecycle' | 'geometry' | 'connectors' | 'membership')[]): boolean
  }

  group: {
    ids(...channels: readonly ('lifecycle' | 'geometry' | 'membership')[]): ReadonlySet<GroupId>
    any(...channels: readonly ('lifecycle' | 'geometry' | 'membership')[]): boolean
  }
}
```

这就是本轮最关键的判断：

- 不是“不要 helper”
- 而是“helper 不该散落在消费者文件里”
- 读取能力应该成为 change model 自己的一部分

这样 render 不再需要：

- `collectNodeRenderIds`
- `collectStaticsEdgeIds`
- `collectLabelEdgeIds`
- `collectMaskEdgeIds`
- `collectActiveEdgeIds`

而是直接写成：

```ts
graphChanges.node.ids('lifecycle', 'geometry', 'content', 'owner')
graphChanges.edge.ids('lifecycle', 'route', 'style')
graphChanges.edge.any('route', 'endpoints', 'box')
```

这才是结构性解决，而不是 helper 搬家。

## 4. `patchGraphState` 最终只保留 executor 职责

当前 `graph/patch.ts` 同时做了三件事：

1. 编译 graph targets
2. seed dirty / fanout
3. 执行 graph patch queue

最终应该拆成：

- graph input planner
- graph executor
- graph changes builder

建议目录方向：

- `model/graph/plan.ts`
- `model/graph/execute.ts`
- `model/graph/changes.ts`

### `graph plan`

负责：

- 吃 document typed delta
- 吃 runtime typed delta
- 读必要的 session / preview / working 状态
- 生成本轮 graph patch 的 target / reset / order 信息

### `graph executor`

负责：

- patch node / mindmap / edge / group
- queue / defer / fanout

### `graph changes`

负责：

- 把 executor 的结果组织成 canonical `GraphChangeSet`
- 提供给 spatial / ui / render 消费

最终 `patchGraphState` 只应该是 orchestration 壳，不应该再亲自解释输入语义。

## 5. whiteboard 下游 phase 的最终形态

### spatial

`spatial` 应该消费 graph changes，而不是手写：

- entities added/removed
- geometry changed
- order changed

最终应改成近似：

```ts
graphChanges.node.ids('lifecycle', 'geometry')
graphChanges.edge.ids('lifecycle', 'geometry')
graphChanges.mindmap.ids('lifecycle', 'geometry')
graphChanges.orderChanged()
```

### ui

`ui` 不应该再自己拼：

- graph entities
- runtime preview
- runtime clock

最终应该消费更直接的 ui input selection，例如：

- graph changes
- runtime delta
- scene selection/hover/edit channels

如果某些 union 规则是稳定的，应进入 ui input model，而不是留在 `ui/patch.ts` 本地。

### render

`render` 目前是 helper 密度最高的下游。

它的问题不在“render 逻辑复杂”，而在它还得手工理解：

- graph dirty channel
- ui delta
- items delta
- runtime delta

最终 render 应该直接吃命名良好的 render scope / render changes。

建议不要再让 render 从 `GraphDirty` 裸 bucket 推 scope，而是让上游提供：

- `renderInputs.node`
- `renderInputs.edge.statics`
- `renderInputs.edge.active`
- `renderInputs.edge.labels`
- `renderInputs.edge.masks`
- `renderInputs.overlay`
- `renderInputs.chrome`

这些 scope 可以是 whiteboard package-local typed model，不需要 shared 化。

重点是：

- scope 的编译只能发生一次
- render phase 只消费，不再本地拼语义

---

## 这到底是设施问题，还是数据结构问题

结论明确写死：

- 根因首先是数据结构/边界模型问题
- 设施问题是第二层

更具体地说：

### `MutationDelta` 这层

之前主要是读模型问题。

### projection 下游这层

现在主要是边界对象太原始：

- dataview 没有 `DataviewProjectionPlan`
- whiteboard 没有 canonical runtime delta
- whiteboard 没有 canonical graph/render change model

因为边界对象太原始，执行设施只能长成：

- dirty flag 传播
- bucket union
- local scope builder
- local touched collector

所以正确诊断不是：

- “helper 多，所以代码风格差”

而是：

- “helper 多，说明边界对象没有直接表达消费语义”

---

## 最终 API 原则

这里把最终 API 风格定死，避免继续模糊。

### 1. 读取能力优先进入模型对象本身

优先：

- `delta.graph.targets()`
- `delta.graph.affects.edgeRouteIds()`
- `runtimeDelta.preview.nodeIds()`
- `graphChanges.edge.ids('route', 'labels')`
- `plan.summary.touchedSections`

不优先：

- `readTouchedEdges(delta)`
- `collectLabelEdgeIds(working)`
- `hasSummaryRebuild(...)`

也就是说，读取语义应当是：

- model method
- typed selector
- typed property

而不是散落式 free function。

### 2. 消费者不应知道上游 bucket 编排细节

如果 render 需要知道：

- `dirty.graph.edge.route`
- `dirty.graph.edge.box`
- `delta.ui.edge`
- `delta.items.change`

再自己拼成 active edge touched set，这就不对。

最终应该是上游直接交付：

- `renderInputs.edge.activeIds()`
- 或等价 typed scope

### 3. 一个决策只能有一个 owner

例如：

- dataview phase action 的 owner 只能是 plan compiler
- whiteboard runtime source 语义解释的 owner 只能是 runtime delta builder
- whiteboard render scope 的 owner 只能是 render input compiler

不能允许：

- projection 外层一套
- stage 内层一套
- patch 文件本地再一套

---

## 实施顺序

## Phase 1. 冻结 shared 边界

- 不再扩张 `shared/projection` 的 domain 语义
- 保持 `shared/mutation` 和 `shared/projection` 只做基础设施
- 明确下游 plan / runtime delta / change set 都是 domain-owned

## Phase 2. dataview 引入 `DataviewProjectionPlan`

- 新增 plan compiler
- `createDataviewProjection.ts` document phase 统一产出 plan
- 删除 projection 里的 dirty 布尔传播链

## Phase 3. dataview stage API 全部改为消费 plan

- `runQueryStage` 不再自己 resolve action
- `runMembershipStage` 不再自己 resolve action
- `runSummaryStage` 不再自己 resolve action
- `runPublishStage` 不再自己反推 action
- action/reuse/touchedSections 等全部来自 plan

## Phase 4. whiteboard 引入 canonical runtime delta

- 用 typed runtime delta 替换 plain `RuntimeInputDelta`
- `sourceInput.ts` 只保留 builder 职责
- graph/ui/render 不再从 source snapshot 重新解释 runtime 语义

## Phase 5. whiteboard graph phase 拆分 plan / execute / changes

- graph targets 合并进 graph plan
- dirty seed 变成 graph changes builder
- queue/fanout 留在 executor
- `patchGraphState` 只做 orchestration

## Phase 6. whiteboard 下游 phase 改为直接消费 typed changes / scope

- spatial 吃 graph changes
- ui 吃 graph changes + runtime delta
- render 吃 render inputs / render scope
- 删除本地 `collect* / append* / read*` 组合 helper

## Phase 7. 清理旧 bucket 访问方式

- 删除对 raw `RuntimeInputDelta` nested bag 的直接访问
- 删除对 `GraphDirty` 裸 bucket 的直接 union
- 删除 dataview `ctx.dirty.index/query/...` 传播语义

---

## 最终判断

最后把结论再压缩成一句话：

- `MutationDelta -> typed delta -> projection` 这一层基本已经打通。
- 还没解决的是 projection 下游“运行时语义输入”和“执行工作计划”没有 canonical model。
- dataview 的核心任务是引入 `DataviewProjectionPlan`。
- whiteboard 的核心任务是引入 canonical runtime delta、canonical graph changes、canonical render inputs。
- 真正该做的是重构边界模型，让读取能力和消费语义成为模型的一部分，而不是继续在 patch 文件里堆 helper。

这就是最终方向。

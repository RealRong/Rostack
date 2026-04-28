# Dataview / Whiteboard Projection `createProjection` 设计与迁移方案

## 目标

基于当前代码现状，把 projection 侧的最终公共入口、`MutationDelta` 接缝，以及 dataview / whiteboard 两条迁移路径定清楚。这里的重点不是再造一套新的 phase runtime，而是回答三件事：

1. `shared/projection` 的公共 API 到底应该长成什么样。
2. `MutationEngine` 已经暴露 normalized `MutationDelta` 之后，projection 应该怎么接进来。
3. dataview 和 whiteboard 分别应该按什么顺序迁移，才能避免一次性大爆炸。

## 现状结论

### 1. `shared/projection` 已经有 runtime 内核，但没有最终 public API

当前 `shared/projection/src/runtime.ts` 已经具备这些能力：

- phase DAG 执行
- scope merge
- value/family surface store 同步
- trace/capture
- family patch apply

但对上层暴露的仍然是偏底层的 `createProjectionRuntime + ProjectionSpec<...>`：

- 泛型面太大，上层必须自己包 alias。
- `surface.changed` / `surface.delta` 仍然主要依赖函数回调。
- “从 `MutationDelta` 直接得到 surface changed / family patch”的能力还没有正式下沉。
- dataview 和 whiteboard 仍然各自包一层 facade 去补 bootstrap、capture、trace、输入适配。

因此，**当前真正缺的不是 phase runtime，而是一个更高层、更稳定的 `createProjection` public contract。**

### 2. dataview 已经半接到 `MutationDelta`，但 projection 仍然停在过渡态

当前 dataview 的关键现状：

- `dataview/packages/dataview-core/src/operations/entities.ts` 已经定义了 `document / record / field / view` 的 shared entity spec。
- `dataview/packages/dataview-core/src/operations/mutation.ts` 的 custom reducer 已经直接产出 `MutationDeltaInput`。
- `dataview/packages/dataview-engine/src/active/projection/impact.ts` 已经在按 `MutationDelta` 读取 semantic key。
- 但 `dataview/packages/dataview-engine/src/mutation/projection/runtime.ts` 仍然主要通过 `commit.extra.trace` 驱动 projection。
- `dataview/packages/dataview-engine/src/mutation/projection/document.ts` 还在通过 `previous + next + trace -> projectDocumentDelta(...)` 二次推导文档 delta。
- `active/query|membership|summary/stage.ts` 仍然大量依赖 `dataviewTrace.*`。

这说明 dataview 现在处于典型的“**delta 结构已经换了，但 projection 判脏语义还没完全切过去**”的中间态。

### 3. whiteboard 的 editor-scene projection 其实已经很接近最终形态

当前 whiteboard 的关键现状：

- `whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts` 已经是完整的 shared projection runtime 使用者。
- scene runtime 已经有清晰 phase：`graph -> spatial/items/ui -> render`。
- scene runtime 已经自己在 projection 里做了 mindmap layout / connector 计算，见 `model/graph/mindmap.ts`。
- 但 handoff 入口仍然吃的是 `whiteboard-engine` 自己的 `EngineDelta`，不是 `MutationDelta`。
- `whiteboard/packages/whiteboard-engine/src/mutation/publish.ts` 仍然把 reducer 的 `ChangeSet` 映射成 `EngineDelta`。
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/sourceInput.ts` 仍然先把 `EngineDelta` 转成 scene 的 `InputDelta.document`。
- 更关键的是，`whiteboard/packages/whiteboard-core/src/reducer/internal/mindmap.ts` 还在 reducer flush 里把 mindmap 计算后的 topic position/size 写回 document。

因此 whiteboard 的问题不是 projection runtime 不够，而是：

- **mutation -> projection 的 document delta 接缝还是旧的**
- **mindmap layout 仍然没有从 mutation 彻底搬走**

## 核心判断

## `createProjection` 不应该重写 runtime，只应该封装 runtime

推荐结论：

- `createProjectionRuntime` 保留为内部执行内核。
- `createProjection` 成为 projection 的正式 public API。
- `createProjection` 的职责是把“plain object spec + `MutationDelta` changed 声明 + family patch 规则”编译成现有 runtime 所需的 `ProjectionSpec`。
- `createProjection` 本身不要直接绑定 `MutationEngine`，仍然保持“纯 projection runtime”的角色。

原因很直接：

- dataview 的更新不仅来自 mutation commit，还涉及 bootstrap、plan cache、性能采样。
- whiteboard 的更新不仅来自 mutation commit，还涉及 hover、selection、preview、clock tick、measure。
- 如果 `createProjection` 直接内置 mutation subscribe，上层所有非 commit 更新都会变得别扭。

所以最终应当分成两层：

1. `shared/projection.createProjection(...)`
   这是纯 projection runtime 构造器。
2. domain adapter
   例如 `createDataviewProjectionRuntime(...)`、`createEditorSceneProjectionSource(...)`。
   这一层负责把 commit、session、clock、measure 组织成 projection input。

这个边界和最终方案文档里“projection update 输入固定为 `document + delta + runtime`”是一致的。

## 推荐的 `createProjection` 形态

推荐 public API：

```ts
const projection = createProjection({
  createState,
  createRead,
  surface,
  plan,
  phases,
  output
})
```

其中 runtime update 输入在 mutation-backed projection 中固定为：

```ts
projection.update({
  document,
  delta,
  runtime
})
```

这里：

- `document` 是当前 committed document
- `delta` 是 engine commit 暴露的 normalized `MutationDelta`
- `runtime` 是 projection-owned 的非持久化输入
  - dataview 基本可以为空或非常薄
  - whiteboard 则包含 selection / hover / preview / viewport / measure / clock

### `createProjection` 应该补齐的能力

### 1. 声明式 `changed`

value field 至少应该支持：

```ts
background: {
  kind: 'value',
  read: (state) => state.document.background,
  changed: {
    keys: ['document.background']
  }
}
```

family field 至少应该支持：

```ts
node: {
  kind: 'family',
  read: (state) => state.graph.nodes,
  changed: {
    keys: [
      'node.create',
      'node.delete',
      'node.geometry',
      'node.content',
      'node.owner',
      'canvas.order'
    ]
  }
}
```

这里的语义应该是：

- `keys` 命中任一 semantic change key，则 field changed
- fallback 仍允许函数
- 复杂场景仍可写 `changed(context) => boolean`

这样可以把 whiteboard scene 里目前大量 `idDelta.hasAny(...)`、`state.delta.render.*` 这类 surface-level changed 函数逐步收口。

### 2. 声明式 family patch

对 family field，需要一个“常见 entity 家族”的声明式 patch 入口。推荐形态：

```ts
node: {
  kind: 'family',
  read: (state) => state.graph.nodes,
  change: {
    create: ['node.create'],
    update: ['node.geometry', 'node.content', 'node.owner'],
    remove: ['node.delete'],
    order: ['canvas.order']
  }
}
```

shared 的解释规则固定为：

- `create` 命中的 id 进入 `set`
- `update` 命中的 id 进入 `set`
- `remove` 命中的 id 进入 `remove`
- `order` 命中则刷新 `ids`
- 如果没有命中任何 key，则返回 `'skip'`

仍然保留函数 fallback：

```ts
delta: ({ state, previous, next }) => ...
```

因为 whiteboard 的 `render.edge.statics / labels / masks` 这类 family 仍然有复杂 patch 规则，不能强行 declarative 化。

### 3. plan 仍然保留函数，不做“全 declarative”

`plan(...)` 不应该被 spec 化成纯配置。

原因：

- dataview active projection 的 query / membership / summary 是否需要重跑，依赖 view plan、query watch、index delta、field aspect 等组合判断。
- whiteboard scene 的 graph / ui / render fanout 依赖 selection、hover、preview、clock、mindmap member node fanout。

因此最终 API 应该是：

- `surface.changed` / family patch 尽量 declarative
- `plan(...)` 明确保留函数
- `phases.run(...)` 明确保留函数

这才符合“通用下沉基础机制，领域算法保留函数”的原则。

### 4. `output` 代替 domain facade 的 capture 包装

当前：

- dataview 有 `createActiveProjectionRuntime()` wrapper
- whiteboard 有 `createEditorSceneProjectionRuntime()` wrapper

最终建议 `createProjection` 正式把 `output` 作为 public hook：

```ts
const projection = createProjection({
  ...,
  output: ({ state, read, revision, trace }) => ({
    snapshot: ...,
    delta: ...,
    trace: ...
  })
})
```

这样：

- `runtime.capture()` 和 `runtime.update()` 的返回结构可以统一
- dataview 不必再专门包一层 `previous publish snapshot / capture.delta`
- whiteboard 也不必专门包一层 state reader 只是为了拿 capture

但为了降低迁移风险，第一阶段可以只把 `output` 做成 `capture` 的语法糖，内部继续复用现有实现。

## 不建议的设计

## 1. 不要让 `createProjection` 直接订阅 `MutationEngine`

原因：

- dataview / whiteboard 都有大量非 mutation runtime 输入
- 测试里需要直接喂 projection input，而不是每次先造 commit stream
- bootstrap / replace / session-only update 会变复杂

projection 应当纯粹接收输入，不应绑死 engine 生命周期。

## 2. 不要让 `shared/projection` 解析 op 或 footprint

这和最终方案文档明确冲突。

projection 只能吃：

- `MutationDelta`
- `document`
- `runtime`

不能再引入：

- parse concrete op type
- parse footprint
- document diff 兜底

## 3. 不要强迫所有 family patch 都 declarative

whiteboard 的 render families 已经说明：

- `edge.statics`
- `edge.labels`
- `edge.masks`
- `items`

这些 patch 规则本来就带有强业务语义。shared 只需要把“常见 entity family patch”下沉，复杂 patch 继续允许函数。

## dataview 迁移设计

## 迁移目标

dataview 的目标不是把所有 projection 合成一个超大 runtime，而是先把接缝改对：

- `MutationDelta` 成为 projection 的唯一持久化输入
- 删除 `documentDelta.ts` 的二次文档 diff 逻辑
- active/index projection 的判脏逻辑从 `dataviewTrace.*` 切到 `MutationDelta`
- `createEngine.ts` 不再依赖 mutation `publish` hook 生成 publish

## 推荐迁移顺序

### D1. 先完成 dataview impact 层

以 `dataview/packages/dataview-engine/src/active/projection/impact.ts` 为中心，把 active projection 的所有判脏都统一到 `MutationDelta` helper。

这里当前已经有一半能力：

- `touchedRecords`
- `touchedFields`
- `schemaFields`
- `touchedViews`
- `recordSetChanged`
- `activeViewChanged`
- `queryChangedViews`
- `calculationChangedViews`

缺的是把 `query|membership|summary/stage.ts` 里还在调用的 `dataviewTrace.*` 全部替掉。

推荐新增或补齐这些 helper：

- `hasActiveViewChange(impact)`
- `hasFieldSchemaChange(impact, fieldId)`
- `hasViewQueryChange(impact, viewId, aspects?)`
- `hasViewCalculationChanges(impact, viewId)`
- `hasQueryInputChanges({ impact, plan })`
- `hasPublishSchemaChanges({ impact, plan })`

然后把以下文件里的 `dataviewTrace.*` 访问全部收掉：

- `active/query/stage.ts`
- `active/membership/stage.ts`
- `active/summary/stage.ts`

这一步做完，active projection 才算真正接上 `MutationDelta`。

### D2. 删除 document projection 的二次 delta 推导

当前 `mutation/projection/document.ts` 仍然在做：

```ts
previous + next + trace -> projectDocumentDelta(...)
```

这是 dataview projection 里最后一条明显的旧路径。

推荐改法：

- 新增 `projectDataviewDocumentDelta(delta: MutationDelta): DocumentDelta | undefined`
- 直接从 semantic key 映射成 dataview publish 用的 doc delta

映射关系可以稳定写死在 adapter 层：

- `record.create / record.patch / record.delete / record.values`
- `field.create / field.schema / field.delete`
- `view.create / view.query / view.layout / view.calc / view.delete`
- `document.activeView`
- `document.schemaVersion`

这一层仍允许使用 delta payload：

- `recordAspects`
- `fieldAspects`
- `viewQueryAspects`
- `viewLayoutAspects`
- `viewCalculationFields`

但来源必须是 `MutationDelta`，不再是 trace 或 document diff。

这一步做完后，可以删除：

- `dataview/packages/dataview-engine/src/mutation/documentDelta.ts`
- `dataview/packages/dataview-engine/src/mutation/projection/document.ts`

### D3. 保留 index / active 两个 runtime，不急着合并

dataview 当前有三层 projection：

- `indexProjection`
- `activeProjection`
- `documentProjection`

删除 `documentProjection` 之后，建议先保留前两层：

- `indexProjection` 继续负责索引增量
- `activeProjection` 继续负责 query / membership / summary / publish

原因：

- 这两层已经有稳定状态机和测试语义
- 现在最大的风险不在 runtime 拆分，而在 dirty source 的切换
- 先改接缝比先合 runtime 风险低很多

因此 dataview 的第一阶段目标不是“一个 projection runtime 管全部”，而是“所有 projection runtime 的输入都统一来自 `MutationDelta`”。

### D4. 把 dataview publish 从 mutation `publish` hook 迁出来

最终状态下，`MutationEngine` 不再接收 `publish`。

所以 dataview `createEngine.ts` 应改成：

1. 创建 `MutationEngine`
2. 创建 dataview projection adapter
3. bootstrap 时用 `{ document, delta: { reset: true }, runtime: {} }` 初始化 projection
4. commit 到来时用 `commit.document + commit.delta` 更新 projection
5. `engine.current()` 组合返回 `{ rev, doc, publish }`

也就是说，当前 `mutation/publish.ts` 这层最终会消失，或者退化成 engine 外部的 projection bridge，而不是 mutation spec 的一部分。

### D5. dataview 的 `createProjection` 落点

dataview 不需要一开始就直接依赖新的 shared `createProjection` public API 重写全部 projection。

更稳的做法是：

- 先把 dirty source 统一成 `MutationDelta`
- active/index 仍先复用现有 `createProjectionRuntime`
- 等 shared `createProjection` 成形后，再把 `activeProjectionSpec`、`indexProjectionSpec` 迁过去

这样可以把“语义迁移”和“API 迁移”拆开。

## whiteboard 迁移设计

## 迁移目标

whiteboard 的目标和 dataview 不同。

whiteboard projection 侧已经有一个很强的 runtime，因此重点不是重写 scene runtime，而是：

- 用 `MutationDelta` 替掉当前 `EngineDelta`
- 把 reducer 里的 mindmap layout flush 彻底搬出 mutation
- 让 editor-scene 完全依赖 projection-owned layout / geometry

## 推荐迁移顺序

### W1. 先把 engine publish 从 `EngineDelta` 切到 `MutationDelta`

当前 `whiteboard-engine/src/mutation/publish.ts` 仍然通过 `ChangeSet -> EngineDelta` 生成 publish。

这一层最终应该收掉，替换为：

- engine current/commit 直接暴露 `document + MutationDelta`
- projection adapter 在 scene 侧消费 `MutationDelta`

也就是说，whiteboard 不再需要这个中间类型：

```ts
type EngineDelta = {
  reset: boolean
  background: boolean
  order: boolean
  nodes: IdDelta<NodeId>
  edges: IdDelta<EdgeId>
  groups: IdDelta<GroupId>
  mindmaps: IdDelta<MindmapId>
}
```

scene 该直接消费 semantic key：

- `document.background`
- `canvas.order`
- `node.create / delete / geometry / content / owner`
- `edge.create / delete / endpoints / route / style / labels / data`
- `group.create / delete / value`
- `mindmap.create / delete / structure / layout / meta`

### W2. 在 scene adapter 层把 `MutationDelta` 转成 phase scope，而不是先转 `EngineDelta`

当前 `whiteboard-editor-scene/src/runtime/sourceInput.ts` 的 `createDocumentInputDelta(...)` 只是把 engine delta clone 一遍。

最终应改成：

- scene input 的持久化 dirty source 直接保留 `MutationDelta`
- adapter 层提供 `readGraphPlanScope(delta, runtime)` 这类 helper
- graph/ui/render phase 直接按 semantic key 决定 scope

换句话说，whiteboard 的迁移关键不是“再造一个 whiteboard 自己的 delta 类型”，而是“让 semantic key 直接进入 scene plan”。

### W3. 保留 scene 内部的 `graphChanges / renderChange` 派生缓存

这里建议不要一步到位删光。

当前 scene runtime 内部这些结构仍然有价值：

- `delta.graphChanges`
- `delta.ui`
- `delta.render`
- `delta.items`

它们不是 mutation -> projection 的中间协议，而是 **projection 内部阶段之间的局部增量缓存**。

所以 whiteboard 的正确做法是：

- 删掉 mutation side 的 `EngineDelta`
- 保留 projection 内部自己的 graph/render delta cache

这能显著降低 scene runtime 的改动面。

### W4. 把 mindmap layout flush 从 reducer 删除

这是 whiteboard 迁移里最关键的一步。

当前 `whiteboard-core/src/reducer/internal/mindmap.ts` 里：

- `enqueueMindmapLayout(...)`
- `flushMindmapLayout(...)`
- `relayoutMindmap(...)`

仍然会在 mutation reduce 期间把计算后的 topic `position/size` 回写到 document。

这和最终边界直接冲突：

- root topic `position` 是持久化输入
- 非 root topic `position` 是 projection-owned 派生结果
- topic `size` 只在文本提交、显式 resize、测量提交等输入变更时持久化
- layout rect / bbox / connectors 都应由 projection 产出，而不是 reducer 回写

好消息是 whiteboard scene 已经基本具备接这个逻辑的能力：

- `model/graph/mindmap.ts` 已经在 projection 内重新计算 mindmap layout
- render / spatial / hit-related 逻辑主要读的是 scene graph，而不是 reducer 输出的派生 patch

所以这一步不是从零开始，而是把 mutation 里的重复 layout 删除，让 projection 成为唯一 layout owner。

### W5. whiteboard graph phase 建议保留现有拓扑，不急着拆更细

当前 editor-scene phase：

- `graph`
- `spatial`
- `items`
- `ui`
- `render`

建议第一阶段保留这个拓扑，只改 graph phase 的 dirty source 和 mindmap 语义来源。

原因：

- `graph` phase 当前已经承担 document snapshot -> graph state 的主要转换
- `patchMindmap(...)` 已经把 projection-owned layout 计算集成进 graph patch
- 真正的变化来源在于 document 不再持有派生 topic position

因此第一阶段没有必要为了概念整洁强行拆出一个新的 `mindmap.reconcile` phase。

如果后续 whiteboard 需要进一步把 graph patch 与 mindmap reconcile 解耦，再考虑：

- `graphBase`
- `mindmap`
- `spatial/items/ui/render`

但这不是本轮接上 `MutationDelta` 的前置条件。

## `createProjection` 对 dataview / whiteboard 的最终落点

## dataview

推荐最终形态：

- shared/projection public API 用 `createProjection`
- dataview 内部保留两个 projection runtime
  - index
  - active
- document publish delta 直接由 `MutationDelta` adapter 生成
- engine 外层维护 current publish

也就是说，dataview 的“projection”更像一组协作 runtime，而不是一个超大单 runtime。

## whiteboard

推荐最终形态：

- editor-scene 仍是一个完整 projection runtime
- 用新的 `createProjection` 替代直接写 `createProjectionRuntime + ProjectionSpec<...>`
- mutation side 不再生成 `EngineDelta`
- scene adapter 直接消费 `MutationDelta + runtime`

也就是说，whiteboard 的“projection”更像一个强 runtime，只需要把 handoff 改成最终协议。

## 实施顺序建议

推荐按下面顺序做，风险最低：

1. `shared/projection`
   - 增加 public `createProjection`
   - 支持声明式 `changed`
   - 支持常见 family 的声明式 patch
   - 现有 `createProjectionRuntime` 暂时保留，作为内部实现或兼容层

2. dataview
   - 先完成 `active/projection/impact.ts` 与 stages 的 `MutationDelta` 化
   - 再删 `documentDelta.ts`
   - 最后把 engine publish 从 mutation hook 迁出

3. whiteboard
   - 先把 `EngineDelta` handoff 改为 `MutationDelta`
   - 再删 reducer 的 mindmap layout flush
   - 最后再考虑是否把 scene runtime 改写到新的 `createProjection` public API

这样做的原因是：

- dataview 当前最大问题是“判脏语义没切完”
- whiteboard 当前最大问题是“接缝协议和 layout ownership 没切完”
- 两边的问题不同，不应该绑成一次统一重构

## 最终结论

这轮 projection 设计最重要的结论有四条：

1. `createProjection` 应该是 `shared/projection` 的 public facade，而不是新的执行模型。
2. `createProjection` 不要直接绑定 `MutationEngine`；domain 仍然要保留自己的 input adapter。
3. dataview 应先把 `MutationDelta -> impact -> active/index/document` 这条链打通，再谈 API 收口。
4. whiteboard 应先把 `MutationDelta -> scene plan` 打通，并把 mindmap layout 完全迁到 projection，scene runtime 本身不需要推倒重来。

如果按这个顺序推进，shared/projection、dataview、whiteboard 三边都能逐步落到最终方案文档定义的边界，而且不会为了“统一 API”而在一轮里同时改坏 runtime 语义、dirty source 和 domain 算法。

# Whiteboard 最终简化模型与实施方案

## 约束

- 不保留兼容层。
- 不新增第二套 runtime / delta / facts。
- 不把问题重新推回 `shared/projection`。
- 不牺牲精准增量通知性能。
- 优化目标不是“拆更多层”，而是把 whiteboard 收敛回问题本质。

## 本质模型

whiteboard 这条链最终只应当有三件事：

1. `index build`
2. `view model build`
3. `精准 fanout`

更具体地说：

- `graph`
  - build index
  - patch graph view model
  - 产出 graph facts
- `ui`
  - 基于 graph facts + runtime facts
  - patch ui view model
  - 产出 ui facts
- `render`
  - 基于 graph/ui/items facts
  - patch render view model

“精准 fanout”只是增量执行方式，不应再膨胀成一套厚 runtime 概念体系。

## 现状问题

当前复杂度偏高，不是因为本质问题复杂，而是因为同一份语义被重复表达了几次。

重复层：

- 上游先产 `target/runtime`
- graph 再编一遍 `execution.change.graph`
- ui/render 再从这些 facts 重新拼 touched scope
- 每个 store 再各自实现一遍 reset/incremental patch 模板
- 最后再写 state / delta

所以现在的问题不是“能力不够”，而是：

- 同一语义重复解释
- 相同模板重复实现
- phase 文件同时承担太多职责

## 第一部分：最终 API 设计

## 1. 顶层结构

最终只保留三个 phase 入口：

```ts
patchGraphState(input): number
patchUiState(input): number
patchRenderState(input): number
```

它们本质上分别表示：

```ts
graph = build index + patch graph vm + build graph facts
ui = patch ui vm from graph/runtime facts + build ui facts
render = patch render vm from graph/ui/items facts
```

不引入：

- `WhiteboardPhaseUnit<T>`
- `runGraphPhase / runUiPhase / runRenderPhase`
- `xxxUnit.ts`
- `execution.change.render`

## 2. 最终目录形态

### 2.1 graph

- `model/graph/patch.ts`
- `model/graph/context.ts`
- `model/graph/queue.ts`
- `model/graph/facts.ts`
- `model/graph/nodes.ts`
- `model/graph/mindmaps.ts`
- `model/graph/edges.ts`
- `model/graph/groups.ts`

### 2.2 ui

- `model/ui/patch.ts`
- `model/ui/context.ts`
- `model/ui/facts.ts`
- `model/ui/nodes.ts`
- `model/ui/edges.ts`
- `model/ui/chrome.ts`

### 2.3 render

- `model/render/patch.ts`
- `model/render/context.ts`
- `model/render/family.ts`
- `model/render/nodes.ts`
- `model/render/statics.ts`
- `model/render/labels.ts`
- `model/render/masks.ts`
- `model/render/active.ts`
- `model/render/overlay.ts`
- `model/render/chrome.ts`

规则：

- `patch.ts`
  - 只保留 phase coordinator。
- `context.ts`
  - 只保留本 phase 预计算输入。
- `facts.ts`
  - 只保留本 phase 写给下游的 facts。
- 其它文件
  - 直接按领域对象命名。
- `render/family.ts`
  - 是唯一值得保留的公共 patch 内核。

## 3. Context

每个 phase 只保留一个 `context.ts`。

`context` 的职责很简单：

- 接收 phase 原始输入
- 一次性算好这个 phase 会重复消费的信息

### 3.1 GraphContext

```ts
interface GraphContext {
  revision: number
  current: Input
  working: WorkingState
  execution: WhiteboardExecution
  reset: boolean

  target: {
    node: ExecutionScope<NodeId>
    edge: ExecutionScope<EdgeId>
    mindmap: ExecutionScope<MindmapId>
    group: ExecutionScope<GroupId>
    order: boolean
  }

  queue: {
    node: Set<NodeId>
    edge: Set<EdgeId>
    mindmap: Set<MindmapId>
    group: Set<GroupId>
  }
}
```

### 3.2 UiContext

```ts
interface UiContext {
  current: Input
  working: WorkingState
  execution: WhiteboardExecution
  reset: boolean

  touched: {
    node: ReadonlySet<NodeId>
    edge: ReadonlySet<EdgeId>
    chrome: boolean
  }
}
```

### 3.3 RenderContext

```ts
interface RenderContext {
  current: Input
  working: WorkingState
  execution: WhiteboardExecution
  reset: boolean

  touched: {
    node: ReadonlySet<NodeId>
    edge: {
      statics: ReadonlySet<EdgeId>
      active: ReadonlySet<EdgeId>
      labels: ReadonlySet<EdgeId>
      masks: ReadonlySet<EdgeId>
    }
    overlay: boolean
    chrome: boolean
  }
}
```

原则：

- touched / target / queue 只算一次
- 各领域 patch 文件不再自己重复拼 scope

## 4. Execution / Facts 最终形态

最终不再保留 `execution.change.*` 这一层。

最终只保留：

```ts
interface WhiteboardExecution {
  reset: boolean
  order: boolean
  target: {
    node: ExecutionScope<NodeId>
    edge: ExecutionScope<EdgeId>
    mindmap: ExecutionScope<MindmapId>
    group: ExecutionScope<GroupId>
  }
  runtime: {
    node: ReadonlySet<NodeId>
    edge: ReadonlySet<EdgeId>
    mindmap: ReadonlySet<MindmapId>
    ui: boolean
  }
  graph: WhiteboardGraphFacts
  items: ExecutionScope<SceneItemKey>
  ui: WhiteboardUiFacts
}
```

说明：

- `execution.graph`
  - graph phase 写，下游 ui/render 读
- `execution.items`
  - items phase 写，下游 render 读
- `execution.ui`
  - ui phase 写，下游 render 读
- render 不再回写 `execution`

### 4.1 Graph Facts

按消费方组织，不按产出方实现方便组织：

```ts
interface WhiteboardGraphFacts {
  node: {
    entity: ExecutionScope<NodeId>
    geometry: ExecutionScope<NodeId>
    content: ExecutionScope<NodeId>
    owner: ExecutionScope<NodeId>
  }
  edge: {
    entity: ExecutionScope<EdgeId>
    geometry: ExecutionScope<EdgeId>
    content: ExecutionScope<EdgeId>
  }
  mindmap: {
    entity: ExecutionScope<MindmapId>
    geometry: ExecutionScope<MindmapId>
    owner: ExecutionScope<MindmapId>
  }
  group: {
    entity: ExecutionScope<GroupId>
    geometry: ExecutionScope<GroupId>
    owner: ExecutionScope<GroupId>
  }
}
```

### 4.2 Ui Facts

```ts
interface WhiteboardUiFacts {
  node: ExecutionScope<NodeId>
  edge: ExecutionScope<EdgeId>
  chrome: boolean
}
```

### 4.3 为什么没有 Render Facts

因为 render 当前没有下游消费方。

精准通知完全来自：

- `working.delta.render.node`
- `working.delta.render.edge.statics`
- `working.delta.render.edge.active`
- `working.delta.render.edge.labels`
- `working.delta.render.edge.masks`
- `working.delta.render.chrome.*`

所以：

- 不需要 `execution.render`
- 不需要 `execution.change.render`

## 5. Graph 最终设计

`graph/patch.ts` 最终只保留：

```ts
export const patchGraphState = (input) => {
  const ctx = createGraphContext(input)

  const count =
    patchGraphNodes(ctx)
    + patchGraphMindmaps(ctx)
    + patchGraphMindmapNodes(ctx)
    + patchGraphEdges(ctx)
    + patchGraphGroups(ctx)

  ctx.execution.graph = buildGraphFacts(ctx)
  return count
}
```

graph 的本质：

- build index
- patch graph vm
- build facts

其中：

- `context.ts`
  - target resolve
- `queue.ts`
  - queue + fanout 容器
- `facts.ts`
  - facts compile

## 6. UI 最终设计

`ui/patch.ts` 最终只保留：

```ts
export const patchUiState = (input) => {
  const ctx = createUiContext(input)

  const count =
    patchUiNodes(ctx)
    + patchUiEdges(ctx)
    + patchUiChrome(ctx)

  ctx.execution.ui = buildUiFacts(ctx)
  return count
}
```

ui 的本质：

- 从 graph facts + runtime facts
- patch ui vm
- build ui facts

关键约束：

- `graph.state.node === ui.nodes`
- `graph.state.edge === ui.edges`
- `graph.state.chrome === ui.chrome`

这不是补同步逻辑，而是 state owner 设计。

## 7. Render 最终设计

`render/patch.ts` 最终只保留：

```ts
export const patchRenderState = (input) => {
  const ctx = createRenderContext(input)

  return (
    patchRenderNodes(ctx)
    + patchRenderStatics(ctx)
    + patchRenderLabels(ctx)
    + patchRenderMasks(ctx)
    + patchRenderActive(ctx)
    + patchRenderOverlay(ctx)
    + patchRenderChrome(ctx)
  )
}
```

render 的本质：

- 从 graph/ui/items facts
- patch render vm

render 唯一公共内核：

```ts
model/render/family.ts
```

最终公共 API 只保留：

```ts
patchFamilyReset(...)
patchFamilyTouched(...)
patchValue(...)
```

这层用于统一：

- reset patch
- touched patch
- previous/next/equal/reuse 模板
- delta 写回接入点

node/statics/labels/masks/active 不再各写一套重复模板。

## 6. 可复用清单

这里按“能复用到什么层级”明确分层。

### 6.1 真正通用的底层内核

这些是数据结构 / 更新模板问题，可以复用。

- `ExecutionScope` 容器与集合操作
  - `hasAny`
  - `union`
  - `fromValues`
  - `all`
- family/value patch 模板
  - `patchFamilyReset`
  - `patchFamilyTouched`
  - `patchValue`
- previous/next/equal/reuse 模板
- family delta 写回模板接入点

这层不理解 node/edge/mindmap，只理解：

- 这是 value 还是 family
- 这是 reset 还是 touched
- 如何比较
- 如何写 delta

### 6.2 Whiteboard 内部基础模块

这些可以在 whiteboard 内复用，但不要做成跨域 DSL。

- `graph/context.ts`
- `ui/context.ts`
- `render/context.ts`
- `graph/queue.ts`
- `graph/facts.ts`
- `ui/facts.ts`
- `render/family.ts`

这层的职责是：

- 承载 whiteboard 内的通用执行样式
- 不承载 graph/ui/render 的具体业务语义

### 6.3 必须留在领域文件里的

这些不能抽成通用设施，否则会变绕。

- graph fanout 业务规则
  - node geometry 影响 edge/group
  - mindmap 影响 member nodes
- index build 语义
  - `ownerByNode`
  - `mindmapNodes`
  - `edgeNodesByEdge`
  - `groupIdsBySignature`
- entity patch 语义
  - `patchNode`
  - `patchEdge`
  - `patchMindmap`
  - `patchGroup`
- ui / render view build 语义
  - label
  - overlay
  - statics bucket
  - active edge

规则：

- 可复用的是模板和容器
- 不可复用的是领域规则

## 7. 实施方案

## Phase 1. 收口 execution 命名与死层

目标：

- 去掉多余层级
- 去掉无消费方结构

实施：

- 删除 `execution.change.render`
- 删除 `execution.change.*` 这一层
- 改成直接：
  - `execution.graph`
  - `execution.items`
  - `execution.ui`

完成标准：

- 下游不再写 `execution.change.graph...`
- render 不再回写 `execution`

## Phase 2. graph 收敛回三件事

目标：

- `graph = build index + patch graph vm + build facts`

实施：

- 提取：
  - `graph/context.ts`
  - `graph/queue.ts`
  - `graph/facts.ts`
  - `graph/nodes.ts`
  - `graph/mindmaps.ts`
  - `graph/edges.ts`
  - `graph/groups.ts`

完成标准：

- `graph/patch.ts` 只剩 coordinator
- `graph/patch.ts` 不再大段维护 target / queue / facts compile

## Phase 3. ui 收敛回两件事

目标：

- `ui = patch ui vm + build facts`

实施：

- 提取：
  - `ui/context.ts`
  - `ui/facts.ts`
  - `ui/nodes.ts`
  - `ui/edges.ts`
  - `ui/chrome.ts`

完成标准：

- `ui/patch.ts` 只剩 coordinator
- touched scope 只在 `ui/context.ts` 计算一次

## Phase 4. render 引入唯一公共内核

目标：

- `render = patch render vm`
- 统一 family patch 模板

实施：

- 提取：
  - `render/context.ts`
  - `render/family.ts`
  - `render/nodes.ts`
  - `render/statics.ts`
  - `render/labels.ts`
  - `render/masks.ts`
  - `render/active.ts`
  - `render/overlay.ts`
  - `render/chrome.ts`

完成标准：

- `render/patch.ts` 只剩 coordinator
- reset / incremental family patch 只保留一套模板

## Phase 5. sourceInput / execution 继续变薄

目标：

- 上游只负责 runtime/source facts
- phase-specific touched 只在 `context.ts`

实施：

- 收敛 `runtime/sourceInput.ts`
- 收敛 `runtime/execution.ts`
- 去掉 graph/ui/render 的派生语义泄漏

完成标准：

- `runtime/execution.ts` 只负责 execution baseline create
- graph/ui/render 的 touched 全部在各自 `context.ts`

## 最终清理标准

不再允许：

- `graph/ui/render` 的 `patch.ts` 同时包含 planner + builder + differ + publisher
- `execution.change.*`
- `execution.render`
- `xxxUnit.ts`
- 多套 reset/incremental family patch 模板
- 下游反复手工组合同一份 facts

最终要求：

- 整条链只保留：
  - `index build`
  - `view model build`
  - `精准 fanout`
- `patch.ts` 只做 coordinator
- `context.ts` 只做预计算
- `facts.ts` 只做下游事实
- `render/family.ts` 是唯一公共 patch 内核
- 其它逻辑直接按领域名组织

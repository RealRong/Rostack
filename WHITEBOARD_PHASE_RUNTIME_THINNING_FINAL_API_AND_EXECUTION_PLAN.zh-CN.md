# Whiteboard Phase Runtime 变薄最终 API 与实施方案

## 约束

- 不保留兼容层。
- 不保留旧 `patch.ts` 组织方式作为长期形态。
- 不新增第二套 runtime / delta / phase graph。
- 不把问题重新推回 `shared/projection`。
- 优化目标是把 `whiteboard-editor-scene/src/model/*/patch.ts` 从“厚 phase runtime”收敛成“薄 phase coordinator + 领域单元”。

## 现状结论

当前 `graph/ui/render` 下面的 `patch.ts` 太长，不是因为单个算法本身很长，而是因为一个文件里混了过多职责。

典型问题：

- `graph/patch.ts`
  - 同时负责 target resolve、queue/fanout、index patch、entity patch、execution change compile。
- `ui/patch.ts`
  - 同时负责 touched scope 推导、node/edge/chrome view build、state write、delta write、graph.state 镜像同步。
- `render/patch.ts`
  - 同时负责 render view build、scope collect、equality/reuse、store patch、delta write、overlay/chrome patch。

根因不是 projection，而是 phase runtime 边界太厚：

- phase file 同时承担 planner、builder、differ、publisher、orchestrator。
- reset 路径和 incremental 路径在多个 store 上重复展开。
- `execution.change.*` 在 phase 间被重复解释。
- 一个 phase 内部包含多个 store family，但没有清晰的子单元 API。

## 第一部分：最终 API 设计

## 1. 总体原则

每个 phase 只保留一个薄 coordinator：

```ts
runXxxPhase(input): number
```

coordinator 只负责：

- reset 当前 phase delta
- 创建 phase frame
- 顺序调用若干 phase unit
- 汇总 changed count
- 回写 `execution.change.xxx`

coordinator 不再负责：

- 大量 scope 拼装
- 具体 view build 细节
- family patch 细节
- equality / reuse 细节

## 2. Phase Unit

每个 phase 被拆成多个 unit。unit 直接对应一个 state store 或一类稳定职责。

统一接口：

```ts
interface WhiteboardPhaseUnit<TFrame> {
  key: string
  scope(frame: TFrame): boolean
  run(frame: TFrame): number
}
```

解释：

- `scope(frame)`
  - 只判断这个 unit 本轮是否需要运行。
- `run(frame)`
  - 只更新自己负责的 state / delta。
  - 返回 changed count。

unit 不返回新的语义模型，不再额外包装 `action/emit`。

## 3. Phase Frame

每个 phase 有自己的 frame，frame 是 phase 内唯一共享上下文。

### 3.1 graph

```ts
interface GraphPhaseFrame {
  revision: number
  current: Input
  working: WorkingState
  execution: WhiteboardSceneExecution
  reset: boolean

  targets: {
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

### 3.2 ui

```ts
interface UiPhaseFrame {
  current: Input
  working: WorkingState
  execution: WhiteboardSceneExecution
  reset: boolean

  touched: {
    node: ReadonlySet<NodeId>
    edge: ReadonlySet<EdgeId>
    chrome: boolean
  }
}
```

### 3.3 render

```ts
interface RenderPhaseFrame {
  current: Input
  working: WorkingState
  execution: WhiteboardSceneExecution
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

关键点：

- frame 里只保留 phase 原生输入。
- 不再让每个 store 自己重新从 `execution.change.*` 拼 touched scope。
- `touched` 在 phase frame 创建时统一计算一次。

## 4. Graph 最终拆分

`graph/patch.ts` 最终只保留：

```ts
export const patchGraphState = (input) => {
  const frame = createGraphPhaseFrame(input)
  return runGraphPhase(frame)
}
```

graph phase unit：

- `graph/index`
  - 更新 indexes
- `graph/node`
  - patch standalone nodes
- `graph/mindmap`
  - patch mindmaps
- `graph/mindmapMembers`
  - patch nodes owned by touched mindmaps
- `graph/edge`
  - patch edges
- `graph/group`
  - patch groups
- `graph/change`
  - 从 `working.delta.graph + current.delta + runtime session` 编译 `execution.change.graph`

其中：

- queue/fanout 逻辑下沉到 `graph/queue.ts`
- target resolve 下沉到 `graph/frame.ts`
- execution change compile 下沉到 `graph/change.ts`

最终 `graph/patch.ts` 不再包含：

- `resolveGraphTargets(...)`
- `fanoutNodeGeometry(...)`
- `compileGraphExecutionChange(...)`

这些都应该变成 phase 内部模块。

## 5. UI 最终拆分

`ui/patch.ts` 最终只保留：

```ts
export const patchUiState = (input) => {
  const frame = createUiPhaseFrame(input)
  return runUiPhase(frame)
}
```

ui phase unit：

- `ui/node`
  - patch node ui family
- `ui/edge`
  - patch edge ui family
- `ui/chrome`
  - patch chrome value
- `ui/change`
  - 发布 `execution.change.ui`

配套模块：

- `ui/frame.ts`
  - 统一收集 touched node / edge / chrome
- `ui/nodeUnit.ts`
  - `buildNodeUiView`
  - `patchNodeUiFamily`
- `ui/edgeUnit.ts`
  - `buildEdgeUiView`
  - `patchEdgeUiFamily`
- `ui/chromeUnit.ts`
  - `buildChromeView`
  - `patchChromeValue`

关键约束：

- `graph.state.node === ui.nodes`
- `graph.state.edge === ui.edges`
- `graph.state.chrome === ui.chrome`

这不是 patch 末尾的镜像同步逻辑，而是 state owner 设计：

```ts
working.graph.state.node = working.ui.nodes
working.graph.state.edge = working.ui.edges
working.graph.state.chrome = working.ui.chrome
```

长期目标是：

- `graph.state.*` 不再被当作独立写模型。
- 它只是 `ui.*` 的别名视图。

## 6. Render 最终拆分

`render/patch.ts` 最终只保留：

```ts
export const patchRenderState = (input) => {
  const frame = createRenderPhaseFrame(input)
  return runRenderPhase(frame)
}
```

render phase unit：

- `render/node`
- `render/edgeStatics`
- `render/edgeLabels`
- `render/edgeMasks`
- `render/edgeActive`
- `render/overlay`
- `render/chrome`
- `render/change`

每个 unit 只负责一个 store：

```ts
interface RenderFamilyUnit<TKey extends string, TValue> {
  read(state: WorkingState): {
    ids: readonly TKey[]
    byId: ReadonlyMap<TKey, TValue>
  }
  build(frame: RenderPhaseFrame, id: string): TValue | undefined
  equal(left: TValue, right: TValue): boolean
  writeDelta(input: {
    working: WorkingState
    previous: TValue | undefined
    next: TValue | undefined
    id: TKey
  }): void
}
```

解释：

- `build(...)`
  - 只负责生成 candidate view。
- `equal(...)`
  - 只负责复用判定。
- `writeDelta(...)`
  - 只负责把结果写入 `working.delta.render.*`。

`patchFamily` 过程应共享，不再为 node/statics/labels/masks/active 各写一套：

```ts
patchFamilyReset(...)
patchFamilyTouched(...)
patchValue(...)
```

长期目标：

- reset / touched patch 走统一 family patch kernel
- 各个 render store 只提供 build/equal/writeDelta 三个 domain hook

## 7. Execution 最终形态

当前 `execution` 同时承担：

- 上游 target
- runtime touched
- phase 间 change

长期保留这一层，但变薄：

```ts
interface WhiteboardSceneExecution {
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
  change: {
    graph: WhiteboardGraphFacts
    items: ExecutionScope<SceneItemKey>
    ui: WhiteboardUiFacts
    render: WhiteboardRenderFacts
  }
}
```

要求：

- `change.graph/ui/render` 是 phase facts，不是 phase 内临时变量容器。
- 每个 phase 只写自己的 facts。
- 下游 phase 只消费 facts，不自己重新拼语义。

因此需要引入更直接的 fact 结构：

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

而不是当前这种“按 entity/geometry/content/owner 横切，再在下游反复组合”。

最终原则：

- facts 结构按消费方组织，不按产出方实现细节组织。

## 8. Source Input 最终定位

`runtime/sourceInput.ts` 负责从 source snapshot 推导 runtime delta。

这层可以保留，但职责必须固定：

- 只产出 source/runtime facts
- 不直接承担 graph/ui/render 的派生语义

允许：

- preview touched ids
- hover/selection/edit/tool 是否变化
- active animation tick ids

不允许：

- 直接替 graph/ui/render 拼 phase-specific scope

phase-specific scope 必须在各自 `createXxxPhaseFrame(...)` 中基于 facts 统一生成。

## 第二部分：实施方案

## Phase 1. 抽出 graph/ui/render 的 phase frame

目标：

- phase 开头统一创建 frame
- touched / target / queue 不再散落在 patch 文件中间

实施：

- 新增：
  - `model/graph/frame.ts`
  - `model/ui/frame.ts`
  - `model/render/frame.ts`
- 把 scope 收集逻辑移出 `patch.ts`

完成标准：

- `patch.ts` 不再大段拼 `Set`
- `execution.change.*` 的消费先统一进入 frame

## Phase 2. graph phase 拆成 unit

目标：

- `graph/patch.ts` 只剩 orchestration

实施：

- 新增：
  - `graph/queue.ts`
  - `graph/change.ts`
  - `graph/nodeUnit.ts`
  - `graph/mindmapUnit.ts`
  - `graph/edgeUnit.ts`
  - `graph/groupUnit.ts`
- 将 queue/fanout 和 change compile 全部移出

完成标准：

- `graph/patch.ts` 只保留 frame create + unit run + result merge

## Phase 3. ui phase 拆成 unit

目标：

- `ui/patch.ts` 只剩 node/edge/chrome 三个 unit 的调度

实施：

- 新增：
  - `ui/nodeUnit.ts`
  - `ui/edgeUnit.ts`
  - `ui/chromeUnit.ts`
  - `ui/change.ts`
- `buildCurrentNodeUiView` / `buildCurrentEdgeUiView` 下沉
- `writeNodeDelta` / `writeEdgeDelta` 收口成 family patch kernel 的 hook

完成标准：

- `ui/patch.ts` 不再包含具体 build 细节
- `graph.state.*` 只作为 `ui.*` alias，不再额外 patch

## Phase 4. render 引入统一 family patch kernel

目标：

- 清掉 node/statics/labels/masks/active 的重复 reset/incremental 模板

实施：

- 新增：
  - `render/familyPatch.ts`
  - `render/nodeUnit.ts`
  - `render/staticsUnit.ts`
  - `render/labelsUnit.ts`
  - `render/masksUnit.ts`
  - `render/activeUnit.ts`
  - `render/overlayUnit.ts`
  - `render/chromeUnit.ts`
- family unit 统一接入：
  - `build`
  - `equal`
  - `writeDelta`

完成标准：

- `render/patch.ts` 不再重复出现 5 套相似 diff 模板
- `render/patch.ts` 明显降到 coordinator 规模

## Phase 5. execution facts 重排

目标：

- phase 间不再横切组合 `entity/geometry/content/owner`

实施：

- 改写 `execution.change.graph`
- 改写 `execution.change.ui`
- 改写 `execution.change.render`
- frame 直接按消费方读取 facts

完成标准：

- 下游 phase 不再出现大量
  - `executionScopeHasAny(change.graph.entity.xxx)`
  - `executionScopeHasAny(change.graph.geometry.xxx)`
  - `executionScopeHasAny(change.graph.content.xxx)`
  的手工组合

## Phase 6. sourceInput / execution 继续变薄

目标：

- 上游只产 runtime/source facts
- phase-specific touched 只在 frame 生成

实施：

- 收敛 `runtime/sourceInput.ts`
- 收敛 `runtime/execution.ts`
- 不再混入 graph/ui/render 具体派生规则

完成标准：

- `runtime/execution.ts` 只做 execution baseline create
- phase-specific 推导逻辑只在各 phase frame

## 最终清理标准

不再允许：

- `graph/ui/render` 的 `patch.ts` 同时包含 planner + builder + differ + publisher
- 一个 patch 文件里重复维护多套 touched scope 拼装
- reset / incremental 逻辑在每个 store 上手写一遍
- `graph.state.*` 作为独立 patch 模型长期存在
- 下游 phase 反复解释 `execution.change.*`

最终要求：

- `patch.ts` 变成薄 coordinator。
- `frame.ts` 统一 phase 输入与 touched scope。
- `unit.ts` 一 store 一职责。
- `familyPatch.ts` 统一 reset/incremental family patch 模板。
- `execution.change.*` 变成直接可消费 facts，不再横切重组。

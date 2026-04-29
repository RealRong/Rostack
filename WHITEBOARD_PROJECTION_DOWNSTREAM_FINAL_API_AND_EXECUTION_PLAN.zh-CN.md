# Whiteboard Projection Downstream Final API And Execution Plan

## 目标

本文档只定义 whiteboard 在 `MutationDelta -> runtime source -> projection downstream execution` 这一段的最终 API 与实施方案。

本文档明确采用以下约束：

- 不兼容旧结构
- 不保留中间层
- 不保留两套 delta / dirty / patch 体系
- 尽可能复用 `@shared/mutation`、`@shared/delta`、`@shared/projection`
- whiteboard 只保留领域语义，不重复造 shared 已有能力

---

## 最终边界

### shared 层职责

- `@shared/mutation`：提供 canonical `MutationDelta`
- `@shared/delta`：提供 `idDelta`、`change`、`entityDelta`
- `@shared/projection`：提供 phase runtime、surface sync、revision/trace

### whiteboard 层职责

- 定义 whiteboard document typed delta
- 定义 whiteboard runtime source typed delta
- 定义 whiteboard scene execution
- 定义跨 phase 传播的最小 change channel
- 把 execution change 映射到 projection surface patch

### 最终原则

- `shared` 不理解 whiteboard graph/render/ui 语义
- whiteboard 不重复实现 mutation delta / family patch / projection runtime
- phase 不再现场 union 多个 bucket 推断语义
- 所有 phase 都只消费 execution

---

## 最终公开 API

## 1. `@whiteboard/engine`

保留：

```ts
createEngine({
  document,
  layout,
  registries?,
  config?,
  onDocumentChange?
})
```

约束：

- engine 只对外暴露 document commit / history / execute / apply
- engine 输出 canonical `MutationDelta`
- engine 不暴露 projection downstream 内部模型

## 2. `@whiteboard/editor`

保留：

```ts
createEditor({
  engine,
  history,
  initialTool,
  initialViewport,
  nodes,
  services: {
    layout,
    defaults?
  }
})
```

约束：

- editor 只负责 interaction / action / write / orchestration
- editor 不暴露 graph dirty / render dirty / source patch helper
- editor 不解释 `MutationDelta`

## 3. `@whiteboard/editor-scene`

最终只保留一个 runtime 创建入口：

```ts
createEditorSceneRuntime({
  source,
  layout,
  nodeCapability
})
```

最终返回：

```ts
type EditorSceneRuntime = {
  stores: ...
  query: ...
  revision(): number
  state(): State
  capture(): Capture
  subscribe(listener): () => void
  dispose(): void
}
```

约束：

- `editor-scene` 不再公开 `GraphDirty`、`GraphDelta`、`UiDelta`、`RenderDelta`
- `editor-scene` 不再公开 runtime source decode helper
- `editor-scene` 不再公开下游 patch helper

## 4. `@whiteboard/react`

保留：

```ts
const whiteboardSpec = {
  nodes,
  layout,
  toolbar
}
```

删除：

- `spec.scene`
- runtime override 入口

React 最终只负责：

- layout backend
- host bridge
- composition root

---

## 最终内部 canonical 模型

## 1. Whiteboard document delta

whiteboard 继续基于 `@shared/mutation` 构建 package-local typed delta。

最终内部入口：

```ts
createWhiteboardMutationDelta(raw: MutationDelta): WhiteboardMutationDelta
```

最终作用：

- 把 raw mutation 解释成 whiteboard 领域 channel
- 只在一个地方完成 document 语义 decode

最终保留的语义面：

- `canvas.order`
- `node.create`
- `node.delete`
- `node.geometry`
- `node.owner`
- `node.content`
- `edge.create`
- `edge.delete`
- `edge.endpoints`
- `edge.route`
- `edge.style`
- `edge.labels`
- `edge.data`
- `mindmap.create`
- `mindmap.delete`
- `mindmap.structure`
- `mindmap.layout`
- `group.create`
- `group.delete`
- `group.value`

约束：

- 只保留 typed semantic channel
- 不允许 graph/render/ui phase 直接扫 raw `delta.changes`

## 2. Whiteboard runtime delta

whiteboard 新增唯一的 runtime canonical delta：

```ts
type WhiteboardRuntimeDelta = {
  tool: boolean
  selection: boolean
  edit: {
    nodeIds: ReadonlySet<NodeId>
    edgeIds: ReadonlySet<EdgeId>
  }
  draft: {
    edgeIds: IdDelta<EdgeId>
  }
  preview: {
    nodeIds: IdDelta<NodeId>
    edgeIds: IdDelta<EdgeId>
    mindmapIds: IdDelta<MindmapId>
    marquee: boolean
    guides: boolean
    draw: boolean
    edgeGuide: boolean
  }
  interaction: {
    hover: boolean
    drag: boolean
    chrome: boolean
    editingEdge: boolean
  }
  view: boolean
  clock: {
    mindmapIds: ReadonlySet<MindmapId>
  }
}
```

最终内部入口：

```ts
createWhiteboardRuntimeDelta({
  previous,
  next,
  change
}): WhiteboardRuntimeDelta
```

约束：

- runtime source 只允许解释一次
- `sourceInput.ts` 的职责收缩成 runtime delta compiler
- graph/render/ui phase 不再重新读取 `EditorSceneSourceChange`

## 3. Whiteboard scene input

最终 projection 输入统一为：

```ts
type WhiteboardSceneInput = {
  document: {
    rev: Revision
    doc: Document
    delta: WhiteboardMutationDelta
  }
  runtime: {
    snapshot: EditorSceneSourceSnapshot
    delta: WhiteboardRuntimeDelta
  }
}
```

约束：

- projection 只吃 typed input
- projection 内部不再同时携带 raw mutation delta 和 raw source change

## 4. Whiteboard scene execution

whiteboard 新增唯一内部执行工作模型：

```ts
type WhiteboardSceneExecution = {
  reset: boolean
  order: boolean

  target: {
    node: ReadonlySet<NodeId> | 'all'
    edge: ReadonlySet<EdgeId> | 'all'
    mindmap: ReadonlySet<MindmapId> | 'all'
    group: ReadonlySet<GroupId> | 'all'
  }

  runtime: {
    node: ReadonlySet<NodeId>
    edge: ReadonlySet<EdgeId>
    mindmap: ReadonlySet<MindmapId>
    ui: boolean
  }

  change: {
    graph: {
      entity: {
        node: ReadonlySet<NodeId> | 'all'
        edge: ReadonlySet<EdgeId> | 'all'
        mindmap: ReadonlySet<MindmapId> | 'all'
        group: ReadonlySet<GroupId> | 'all'
      }
      geometry: {
        node: ReadonlySet<NodeId> | 'all'
        edge: ReadonlySet<EdgeId> | 'all'
        mindmap: ReadonlySet<MindmapId> | 'all'
        group: ReadonlySet<GroupId> | 'all'
      }
      content: {
        node: ReadonlySet<NodeId> | 'all'
        edge: ReadonlySet<EdgeId> | 'all'
      }
      owner: {
        node: ReadonlySet<NodeId> | 'all'
        mindmap: ReadonlySet<MindmapId> | 'all'
        group: ReadonlySet<GroupId> | 'all'
      }
    }

    items: ReadonlySet<SceneItemKey> | 'all'

    ui: {
      node: ReadonlySet<NodeId> | 'all'
      edge: ReadonlySet<EdgeId> | 'all'
      chrome: boolean
    }

    render: {
      node: ReadonlySet<NodeId> | 'all'
      edge: ReadonlySet<EdgeId> | 'all'
      chrome: boolean
    }
  }
}
```

最终内部入口：

```ts
createWhiteboardSceneExecution({
  state,
  input
}): WhiteboardSceneExecution
```

约束：

- execution 只编译一次
- 只保留 target、runtime、change 三层
- 不保存 `run/action/result` 镜像字段
- 不保存 surface patch 结构
- 所有 runtime/document 合流逻辑都收敛到 execution compiler

---

## 最终 phase 执行模型

## 1. document phase

只做两件事：

- 写入最新 document snapshot
- 编译 `WhiteboardSceneExecution`

输出：

```ts
state.execution = WhiteboardSceneExecution
```

禁止：

- document phase 现场写 graph/render/ui dirty bucket

## 2. graph phase

graph phase 只消费：

- `execution.reset`
- `execution.order`
- `execution.target`

graph phase 只写：

- `execution.change.graph`

约束：

- 删除 `GraphDirty`
- 删除 graph phase 内部 queue -> dirty -> delta 双写结构
- graph phase 不生成独立 effect 类型

## 3. spatial phase

spatial phase 只消费 `execution.change.graph.geometry`。

spatial phase 不向 execution 继续写镜像结果。

spatial 的 family patch 直接在 phase 末端产出。

## 4. items phase

items phase 只消费：

- `execution.reset`
- `execution.order`
- `execution.target`
- `execution.change.graph`

items phase 只写：

- `execution.change.items`

## 5. ui phase

ui phase 只消费：

- `execution.runtime`
- `execution.change.graph`

ui phase 只写：

- `execution.change.ui`

约束：

- ui phase 不再自己 union graph dirty + runtime delta
- ui phase 不再读取 raw runtime source change

## 6. render phase

render phase 只消费：

- `execution.runtime`
- `execution.change.graph`
- `execution.change.items`
- `execution.change.ui`

render phase 只写：

- `execution.change.render`

约束：

- render phase 不再看 `dirty.graph.*`
- render phase 不再自己收集 `collectNodeRenderIds / collectActiveEdgeIds`
- render phase 直接消费 execution 中的语义 workset

---

## 最终 projection 装配

最终 `createProjection(...)` 的 whiteboard 装配保持轻量：

```ts
createProjection({
  createState,
  createRead,
  output,
  surface,
  phases: {
    document,
    graph,
    spatial,
    items,
    ui,
    render
  }
})
```

whiteboard 在 projection 上只保留三类自定义：

- `createWhiteboardSceneExecution(...)`
- phase executor
- surface patch mapper

不再保留：

- phase 内 dirty 传播 DSL
- 多处的 touched union helper
- source change 二次解释 helper

---

## 最终 surface 设计

surface 继续复用 `@shared/projection` 的 `value` / `family` field。

最终 surface 只映射 phase 末端 patch：

- `document.revision`
- `document.background`
- `graph.node`
- `graph.edge`
- `graph.mindmap`
- `graph.group`
- `graph.state.node`
- `graph.state.edge`
- `graph.state.chrome`
- `render.node`
- `render.edge.statics`
- `render.edge.active`
- `render.edge.labels`
- `render.edge.masks`
- `render.chrome.scene`
- `render.chrome.edge`
- `items`

约束：

- surface patch 不再从 state 临时推导 dirty bucket
- family `patch()` 只吃 execution change 和 phase 末端 patch
- `surface.changed` 只依赖 phase changed flag 和 execution

---

## 必须删除的旧结构

- `EditorSceneSourceChange` 在 phase 内的直接消费
- `sourceInput.ts` 中对 graph/render/ui 的语义拼装
- `GraphDirty`
- graph phase 的 queue + dirty + delta 三层并存模型
- render phase 中对 `dirty.graph.*`、`runtime.delta.*`、`items.change` 的本地 union
- ui phase 中对 graph/runtime 的本地 union
- `editor-scene` 对外暴露的 `GraphDelta`、`GraphDirty`、`UiDelta`、`RenderDelta`
- `whiteboardSpec.scene`

---

## 最终实施方案

## Phase 1. 收口 canonical 输入

必须完成：

- 把 document input 收口为 `WhiteboardMutationDelta`
- 把 runtime input 收口为 `WhiteboardRuntimeDelta`
- 新增 `WhiteboardSceneInput`
- `createEditorSceneRuntime(...)` 内只把 raw source/change 编译一次

阶段结果：

- projection 内部不再看到 raw `MutationDelta`
- projection 内部不再看到 raw `EditorSceneSourceChange`

## Phase 2. 引入 scene execution

必须完成：

- 新增 `WhiteboardSceneExecution`
- document phase 统一编译 execution
- 删除 graph/spatial/items/ui/render 各自的 touched target 推导

阶段结果：

- 所有 phase 的 scope 只有一份来源

## Phase 3. 重写 graph phase

必须完成：

- 删除 `GraphDirty`
- graph phase 改为直接写 `execution.change.graph`
- graph phase 不再维护 dirty bucket 中间态

阶段结果：

- graph phase 从“脏标记编译器”收口为“graph execution writer”

## Phase 4. 重写 spatial / items / ui / render

必须完成：

- spatial phase 只消费 `execution.change.graph.geometry`
- items phase 只消费 `execution.target + execution.order + execution.change.graph`
- ui phase 只消费 `execution.runtime + execution.change.graph`
- render phase 只消费 `execution.runtime + execution.change.graph + execution.change.items + execution.change.ui`

阶段结果：

- 下游 phase 不再读取原始 delta bucket
- 下游 phase 不再自己 union 多类 touched 集

## Phase 5. 收口 surface

必须完成：

- surface `changed` / `patch` 全部改为消费 execution
- 删除 state 上仅用于 surface 推导的中间 dirty 结构

阶段结果：

- projection surface 只同步最终 phase patch

## Phase 6. 收口 public API

必须完成：

- `editor-scene` 删除 `GraphDirty` / `GraphDelta` / `UiDelta` / `RenderDelta` 对外导出
- `whiteboardSpec` 删除 `scene`
- react 组合根不再允许替换 scene runtime

阶段结果：

- whiteboard public API 只剩 engine/editor/react 真正稳定的入口

---

## 最终验收标准

- whiteboard 只有一套 document typed delta
- whiteboard 只有一套 runtime typed delta
- whiteboard 只有一套 scene execution
- graph/spatial/items/ui/render 全部只消费 execution
- `render/patch.ts` 不再本地 union 多类 dirty bucket
- `sourceInput.ts` 不再承担 graph/render/ui 语义拼装
- `GraphDirty` 被彻底删除
- `editor-scene` 不再公开下游执行中间模型
- `shared/projection` 保持轻量，不引入 whiteboard 专属 DSL

这就是 whiteboard projection downstream execution 的长期最优最终态。

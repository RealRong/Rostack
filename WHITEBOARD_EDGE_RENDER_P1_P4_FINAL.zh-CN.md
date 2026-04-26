# Whiteboard Edge Render P1-P4 API 设计与实施方案

## 1. 范围

本文只覆盖 `WHITEBOARD_EDGE_RENDER_INFRA_FINAL.zh-CN.md` 的 P1-P4。

默认前提：

- P0 已完成：
  - `shared/projector.createProjectorStore(...)` 可用
  - `whiteboard-core.edge.render.*` / `edge.hit.distanceToPath(...)` 可用
  - `editor-scene` 已改成同步 `measure(...)` 注入
- 接下来不考虑兼容旧实现。
- 允许大范围重构。
- 目标不是继续优化 `whiteboard-editor/src/scene/edgeRender.ts`，而是把 render source、hit source、publish source 全部收回 `editor-scene`。

---

## 2. 最终架构

最终职责边界：

- `whiteboard-core`
  - 只放纯 edge render / hit primitive
- `shared/projector`
  - 只放 projector 与 projector-store bridge
- `whiteboard-editor-scene`
  - 成为唯一的 scene graph / spatial / render / hit projection runtime
- `whiteboard-editor`
  - 只负责输入聚合、bridge、editor-facing API
- `whiteboard-react`
  - 只负责 family/value -> DOM

最终 phase 顺序：

```ts
graph -> spatial -> ui -> render
```

`render` 必须在 `ui` 后面，因为：

- `statics` 主要依赖 graph
- `labels` / `masks` 依赖 graph + edit
- `active` 依赖 graph + ui
- `overlay` 依赖 graph + ui + preview

---

## 3. 最终公共 API

## 3.1 `editor-scene` Snapshot / Change

```ts
type Snapshot = {
  revision: Revision
  documentRevision: Revision
  graph: GraphSnapshot
  render: RenderSnapshot
  items: readonly SceneItem[]
  ui: UiSnapshot
}

type Change = {
  graph: GraphChange
  render: RenderChange
  items: Flags
  ui: UiChange
}
```

---

## 3.2 `editor-scene` Render Snapshot

```ts
type EdgeStaticId = string
type EdgeLabelKey = `${EdgeId}:${string}`

type EdgeStaticPath = {
  id: EdgeId
  svgPath: string
}

type EdgeStaticView = {
  id: EdgeStaticId
  styleKey: string
  style: import('@whiteboard/core/edge').EdgeStaticStyle
  paths: readonly EdgeStaticPath[]
}

type EdgeActiveView = {
  edgeId: EdgeId
  svgPath: string
  style: import('@whiteboard/core/edge').EdgeStaticStyle
  box?: {
    rect: Rect
    pad: number
  }
  state: {
    hovered: boolean
    selected: boolean
    editing: boolean
  }
}

type EdgeLabelView = {
  key: EdgeLabelKey
  edgeId: EdgeId
  labelId: string
  point: Point
  angle: number
  text: string
  displayText: string
  style: Edge['labels'][number]['style']
  editing: boolean
  selected: boolean
  caret?: EditCaret
}

type EdgeMaskView = {
  edgeId: EdgeId
  rects: readonly EdgeLabelMaskRect[]
}

type EdgeOverlayView = {
  previewPath?: {
    svgPath: string
    style: import('@whiteboard/core/edge').EdgeStaticStyle
  }
  snapPoint?: Point
  endpointHandles: readonly EdgeOverlayEndpointHandle[]
  routePoints: readonly EdgeOverlayRoutePoint[]
}

type RenderSnapshot = {
  edge: {
    statics: Family<EdgeStaticId, EdgeStaticView>
    active: Family<EdgeId, EdgeActiveView>
    labels: Family<EdgeLabelKey, EdgeLabelView>
    masks: Family<EdgeId, EdgeMaskView>
    overlay: EdgeOverlayView
  }
}
```

设计约束：

- `statics` 是最终公开名，不暴露 `bucket` / `chunk` 术语。
- `overlay` 仍然是 value，不做 family。
- `masks` 保持常驻，不做“只有 active edge 才有 mask”这种条件设计。
- `active` 与 `statics` 分离；hover / selection / editing 不允许污染 static chunk。

---

## 3.3 `editor-scene` Render Change

```ts
type RenderChange = {
  edge: {
    statics: IdDelta<EdgeStaticId>
    active: IdDelta<EdgeId>
    labels: IdDelta<EdgeLabelKey>
    masks: IdDelta<EdgeId>
    overlay: Flags
  }
}
```

---

## 3.4 `editor-scene` Query

最终 query 收口为：

```ts
interface Read {
  snapshot(): Snapshot
  spatial: SpatialRead
  snap(rect: Rect): readonly SnapCandidate[]
  frame: FrameRead
  hit: {
    edge(input: {
      point: Point
      threshold?: number
      excludeIds?: readonly EdgeId[]
    }): EdgeId | undefined
  }
}
```

约束：

- `hit.edge(...)` 是同步 query。
- frame-throttled 调度继续留在 editor/react host。
- `hit.edge(...)` 只负责“世界里哪条 edge 命中”，不负责 pointer task / hover schedule。

---

## 3.5 `whiteboard-editor` 对外 API

最终 editor-facing 只桥接 `editor-scene`：

```ts
type EditorSceneSource = {
  revision(): number
  items: ReadStore<readonly SceneItem[]>
  edge: {
    render: {
      statics: ProjectorStoreFamilyRead<EdgeStaticId, EdgeStaticView>
      active: ProjectorStoreFamilyRead<EdgeId, EdgeActiveView>
      labels: ProjectorStoreFamilyRead<EdgeLabelKey, EdgeLabelView>
      masks: ProjectorStoreFamilyRead<EdgeId, EdgeMaskView>
      overlay: ReadStore<EdgeOverlayView>
    }
  }
  query: {
    rect: SpatialRead['rect']
    visible: (options?: RectQueryOptions) => RectQueryResult
    hit: {
      edge(input: {
        point: Point
        threshold?: number
        excludeIds?: readonly EdgeId[]
      }): EdgeId | undefined
    }
  }
}
```

约束：

- `whiteboard-editor` 不再自己构造 `staticModel` / `activeModel` / `labelModel` / `overlayModel`。
- `whiteboard-editor/src/scene/edgeRender.ts` 必须删除。
- editor 层如果还需要 edge render 类型，只保留对 `editor-scene` render contract 的别名或 re-export。

---

## 3.6 `whiteboard-react` 消费面

React 最终只消费 family/value：

- `EdgeStaticLayer`
  - 消费 `editor.scene.edge.render.statics`
  - 同时消费 `editor.scene.edge.render.masks` 生成 mask DOM
- `EdgeActiveLayer`
  - 消费 `editor.scene.edge.render.active`
- `EdgeLabelLayer`
  - 消费 `editor.scene.edge.render.labels`
- `EdgeOverlayLayer`
  - 消费 `editor.scene.edge.render.overlay`
- `src/dom/host/input.ts`
  - edge body hit 直接调用 `editor.scene.query.hit.edge(...)`

约束：

- `EdgeSceneLayer` 只做 layer 组合，不再做 render data 建模。
- React 不再重做 style grouping、active 集合、overlay 数据派生。
- `EdgeOverlayLayer` 继续放在 chrome viewport 下，但 source 属于 `editor-scene.render.edge.overlay`。

---

## 4. `editor-scene` 内部实现设计

## 4.1 Render Patch Scope

```ts
type RenderPatchScope = {
  reset: boolean
  statics: ReadonlySet<EdgeId>
  labels: ReadonlySet<EdgeId>
  active: ReadonlySet<EdgeId>
  overlay: boolean
}
```

语义：

- `statics`
  - style / path / order 变化
- `labels`
  - label text / placement / mask / label edit 变化
- `active`
  - hover / selection / editing 变化
- `overlay`
  - preview connect / reconnect / selected route / endpoint handle 变化

不能退化回一个 `edges: Set<EdgeId>`，否则 render 成本模型又会混在一起。

---

## 4.2 Render Working State

```ts
type EdgeRenderState = {
  statics: {
    styleKeyByEdge: Map<EdgeId, string>
    edgeIdsByStyleKey: Map<string, readonly EdgeId[]>
    staticIdByEdge: Map<EdgeId, EdgeStaticId>
    staticIdsByStyleKey: Map<string, readonly EdgeStaticId[]>
    statics: Map<EdgeStaticId, EdgeStaticView>
  }
  labels: Map<EdgeLabelKey, EdgeLabelView>
  masks: Map<EdgeId, EdgeMaskView>
  active: Map<EdgeId, EdgeActiveView>
  overlay: EdgeOverlayView
}
```

关键设计：

- `styleKeyByEdge` / `edgeIdsByStyleKey`
  - 管 static membership
- `staticIdByEdge` / `staticIdsByStyleKey`
  - 让单 edge 更新时只重建受影响的 static 单元
- `labels` / `masks` / `active`
  - 直接就是 publish family 的真实缓存
- `overlay`
  - 直接就是 publish value 的真实缓存

---

## 4.3 Static 内部 chunking

内部必须 chunk，但 chunking 不进入公开 API。

第一版策略：

- 先按 `styleKey` 分组
- 再按稳定 order 切成固定大小 static 单元
- 默认 chunk 大小固定为 `256`
- `EdgeStaticId` 第一版直接用 `${styleKey}:${chunkIndex}`

说明：

- 第一版允许“中间插入导致后续 chunk id 连锁变化”
- 如果后面要进一步降低 churn，只改内部 chunk allocator
- 外部公开 API 保持 `statics: Family<EdgeStaticId, EdgeStaticView>` 不变

---

## 4.4 `hit.edge` 实现原则

`editor-scene.query.hit.edge(...)` 的实现固定为：

1. 用 `spatial.candidates(rect, { kinds: ['edge'] })` 拿候选
2. 对每个候选 edge 读取 graph geometry
3. 调 `whiteboard-core.edge.hit.distanceToPath(...)`
4. 取最近命中
5. 距离相同按 scene order 决定胜者

约束：

- 不在 `editor-scene` 内做 frame 节流
- 不引入第二套 edge hit index
- 直接复用现有 spatial candidates

---

## 5. 分阶段实施

## 5.1 P1: `editor-scene` 新增 render phase

目标：

- `render` 正式变成 projector phase
- render 结果进入 `Snapshot.render` / `Change.render`

修改清单：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/delta.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/working.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/render.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/phases/render.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/domain/render/edge/static.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/domain/render/edge/labels.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/domain/render/edge/active.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/domain/render/edge/overlay.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/domain/render/edge/state.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projector/spec.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projector/impact.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projector/publish.ts`

实施动作：

- 在 `contracts/render.ts` 定义全部 render public types
- 在 `contracts/editor.ts` 把 `Snapshot` / `Change` / `Read` 接上 `render`
- 在 `working.ts` 增加 `render` working state
- 在 `impact.ts` 新增 `RenderPatchScope`
- 在 `phases/render.ts` 里按 `statics / labels / active / overlay` 分开 patch
- 在 `publish.ts` 复用现有 family/value publish 模式输出 `RenderChange`

完成标准：

- `Snapshot.render` 存在
- `Change.render` 存在
- render family/value 可以单独 publish

---

## 5.2 P2: `hit.edge` 下沉到 `editor-scene`

目标：

- sync edge hit query 统一归属 `editor-scene`

修改清单：

- `whiteboard/packages/whiteboard-editor-scene/src/runtime/query.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/domain/hit/edge.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/pick.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/source.ts`

实施动作：

- 在 `domain/hit/edge.ts` 实现 `hit.edge(...)`
- `runtime/query.ts` 把它挂到 `Read.hit.edge`
- `scene/source.ts` 直接桥接 `controller.query.hit.edge`
- `editor/src/scene/pick.ts` 删除 edge precise distance 实现
- generic pick runtime 保留，但 edge body hit 不再依赖它

完成标准：

- `editor-scene Read.hit.edge(...)` 可用
- `whiteboard-editor/src/scene/pick.ts` 不再自持 edge 距离算法
- `editor.scene.query.hit.edge(...)` 对外可用

---

## 5.3 P3: 删除 editor 本地 edge render runtime

目标：

- 删除 `whiteboard-editor/src/scene/edgeRender.ts`
- editor 不再二次派生 edge render model

修改清单：

- `whiteboard/packages/whiteboard-editor/src/scene/source.ts`
- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/edge.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/pick.ts`
- 删除 `whiteboard/packages/whiteboard-editor/src/scene/edgeRender.ts`

实施动作：

- `scene/source.ts` 在现有 `createProjectorStore(...)` bridge 上新增 render fields
- `editor.scene.edge.render.*` 直接返回 `editor-scene.render.edge.*`
- 删除 `EdgeRenderRuntime`、`EdgeStaticRenderModel`、`EdgeActiveRenderModel`、`EdgeLabelRenderModel`、`EdgeOverlayRenderModel` 这套 editor 本地 runtime 类型与实现
- 只保留 editor-facing alias / re-export

完成标准：

- `editor.scene.edge.render.statics/active/labels/masks/overlay` 全部来自 `editor-scene publish`
- `whiteboard-editor/src/scene/edgeRender.ts` 已删除
- editor 层不再做任何全量 edge render 派生

---

## 5.4 P4: React 切换到 family/value 消费

目标：

- React 完全消费 projector publish 结果

修改清单：

- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeSceneLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeStaticLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeActiveLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeLabelLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeOverlayLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/dom/host/input.ts`

实施动作：

- `EdgeStaticLayer`
  - 直接读 `statics.ids / statics.byId`
  - 同时消费 `masks` family 生成 mask defs
- `EdgeActiveLayer`
  - 直接读 `active`
- `EdgeLabelLayer`
  - 直接读 `labels`
- `EdgeOverlayLayer`
  - 直接读 `overlay`
- `EdgeSceneLayer`
  - 只做 layer 组合
- `dom/host/input.ts`
  - edge body hit 改调 `editor.scene.query.hit.edge(...)`

完成标准：

- static 渲染来自 `statics`
- labels / masks / active 来自 family
- overlay 来自 value
- React 不再做 render membership/index
- edge body hit 来自 `editor.scene.query.hit.edge(...)`

---

## 6. 最终验收标准

必须同时满足：

1. `editor-scene` snapshot 内存在 `render`
2. `editor-scene` change 内存在 `render`
3. `editor-scene Read.hit.edge(...)` 可用
4. `editor.scene.query.hit.edge(...)` 直接桥接 scene query
5. edge static render 以增量 family 发布，公开名为 `statics`
6. edge labels / masks / active / overlay 全部由 `editor-scene` 投影
7. `whiteboard-editor/src/scene/edgeRender.ts` 已删除
8. `whiteboard-editor` 不再二次派生 edge render model
9. `whiteboard-react` 不再做 edge render 数据建模
10. frame-throttled pick 调度仍留在 editor/react host

---

## 7. 实施顺序

建议严格按下面顺序做：

1. P1：先把 `render` phase 和 `render snapshot/change` 建起来
2. P2：再把 `hit.edge` 下沉到 `editor-scene`
3. P3：再删 editor 本地 edge render runtime
4. P4：最后让 React 切到 family/value 消费

原因：

- P1 先建立 render source，P3 才有东西可以桥接
- P2 先建立 query source，P4 input host 才能直接切
- 如果先删 editor 本地 runtime，再补 `editor-scene.render`，中间会出现大面积空窗


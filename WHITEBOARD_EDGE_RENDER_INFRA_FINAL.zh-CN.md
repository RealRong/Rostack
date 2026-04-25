# Whiteboard Edge Render 长期最优基础设施方案

## 1. 口径

- 本文是 `WHITEBOARD_EDGEITEM_REFACTOR_FINAL.zh-CN.md` 完成后的下一阶段设计文档。
- 如与旧文档冲突，以本文为准。
- 目标不是继续在 `whiteboard-editor/src/scene/edgeRender.ts` 上做局部 patch，而是把 edge render、edge hit、render delta、projector bridge 一次性收敛到长期最优结构。
- `EdgeOverlayLayer` 继续放在 chrome viewport 下，这一点没有问题；但 **overlay 的 render source 仍应属于 scene projection，而不是 editor/react 本地二次派生**。
- 不保留双轨实现，不为了兼容保留旧抽象。

---

## 2. 结论

### 2.1 最终归属

- `whiteboard-core`：只放纯 domain / geometry / style / hit primitive。
- `shared/projector`：只放通用 projector、delta、publish、projector-store bridge primitive。
- `whiteboard-editor-scene`：成为 **唯一 scene read / spatial / render projection runtime**。
- `whiteboard-editor`：只负责把 engine/session/layout 输入组装成 `editor-scene` 的 `Input`，再把 `editor-scene` 暴露成 editor-facing API。
- `whiteboard-react`：只消费已经投影好的 render model，不再自己做全量 render 派生。

### 2.2 必须进入 `editor-scene` 的能力

- edge static render projection
- edge labels / masks render projection
- edge active render projection
- edge overlay render projection
- sync `hit.edge(point)` query
- render delta publish

### 2.3 不应进入 `editor-scene` 的能力

- DOM viewport transform
- frame-throttled pointer scheduling
- `elementFromPoint` / `elementsFromPoint`
- React ref / pick registry / editable DOM
- CSS / SVG DOM 结构细节

一句话：

- **`editor-scene` 负责“世界里该画什么、该命中什么”。**
- **`editor/react` 负责“在 DOM 里怎么画、什么时候调度读”。**

---

## 3. 当前实现的问题

当前实现已经把 `EdgeItem` 主路径删掉，方向是对的，但仍有几处结构性浪费：

### 3.1 `edgeRender.ts` 仍是 editor 本地二次全量派生

当前 [whiteboard/packages/whiteboard-editor/src/scene/edgeRender.ts](whiteboard/packages/whiteboard-editor/src/scene/edgeRender.ts)：

- `staticModel` 全量遍历所有 edge
- `activeModel` 明明只关心少量 active edge，仍全量遍历所有 edge
- `labelModel` 仍全量遍历所有 edge
- 所有 render model 都是在 `editor-scene snapshot -> editor store -> editor local derived store` 之后再算一遍

这意味着：

- projector 已经做过一次增量 graph patch
- editor 又做了一次 render 全量 scan
- React 再做一次 render consume

这不是长期最优。

### 3.2 当前 render 没有复用 `editor-scene` 现成 delta / phase / publish

`whiteboard-editor-scene` 已经具备：

- phase scope planning
- `GraphDelta`
- `SpatialDelta`
- publish delta
- `publishEntityFamily`
- spatial read / query
- graph patch queue + node -> edge fanout

但当前 edge render 基本没接这些能力。

### 3.3 `hit.edge` 已部分正确，但归属不对

现在 `scene.edge.hit.pick` 已经会走：

- spatial candidates
- precise edge distance

但实现仍在 `whiteboard-editor/src/scene/source.ts` 和 `scene/pick.ts` 外侧包装，而不是 `editor-scene` 自己的 query API。

### 3.4 measure 输入链路不完整

`whiteboard-editor-scene` 的 `graph` phase 会读：

- `measure.text.nodes`
- `measure.text.edgeLabels`

但真实集成里 [whiteboard/packages/whiteboard-editor/src/projection/input.ts](whiteboard/packages/whiteboard-editor/src/projection/input.ts) 传入的是：

- `nodes: new Map()`
- `edgeLabels: new Map()`

也没有 `measure delta`。

这说明：

- 现在 graph projector 对真实 text measure 结果并未真正接通
- 后续如果把 edge render 下沉到 `editor-scene`，这个洞必须先补

### 3.5 projector -> store bridge 仍是手写同步层

当前 [whiteboard/packages/whiteboard-editor/src/scene/source.ts](whiteboard/packages/whiteboard-editor/src/scene/source.ts) 用的是：

- `composeSync`
- `createValueSync`
- `createIdDeltaFamilySync`

这能工作，但它仍是业务层手写桥接，不是长期最优。

长期最优应该是：

- `shared/projector` 直接提供 `createProjectorStore`
- `whiteboard-editor` 不再手写一套 snapshot/change -> store family sync

---

## 4. 最终职责划分

### 4.1 `whiteboard-core`

`whiteboard-core` 只负责纯函数，不碰 projector state，不碰 store，不碰 DOM。

应放入 `whiteboard-core` 的 edge 基础能力：

- `edge.render.styleKey(style): string`
- `edge.render.staticStyle(style): EdgeStaticStyle`
- `edge.hit.distanceToPath(path, point): number`
- `edge.hit.pickNearest(...)` 如果后续有多个消费者
- 已有的 label placement / mask / path bounds 继续保留在 core

不应放入 `whiteboard-core` 的能力：

- bucket membership
- render chunking
- delta planning
- spatial state
- active edge selection / hover 派生

### 4.2 `shared/projector`

`shared/projector` 应补齐通用 primitive，不带 whiteboard 领域语义。

必须新增：

- `createProjectorStore`
- `value(...)`
- `family(...)`
- `writeEntityChange(...)`

这样 `whiteboard-editor` 不再需要长期维护自定义 `projectionSync`。

### 4.3 `whiteboard-editor-scene`

`editor-scene` 负责：

- graph projection
- index projection
- spatial projection
- ui projection
- render projection
- sync query
- publish delta

对于 edge：

- graph phase 负责把文档 + preview + edit + measure 投影成 `EdgeView`
- ui phase 负责把 selection / edit 等投影成 `EdgeUiView` 和 `ChromeView`
- render phase 负责把 `EdgeView + EdgeUiView + ChromeView` 投影成 render snapshot

### 4.4 `whiteboard-editor`

`whiteboard-editor` 只保留：

- engine/session/layout -> `editor-scene Input`
- input delta assembly
- runtime task / schedule
- editor-facing write API
- editor-facing query sugar

最终不再保留：

- `scene/edgeRender.ts`
- 本地 `staticModel/activeModel/labelModel/overlayModel`
- 本地 `scene.edge.hit.pick` 包装实现

### 4.5 `whiteboard-react`

`whiteboard-react` 只消费：

- `editor.scene.edge.render.*`
- `editor.scene.query.hit.edge(...)`

React 不再负责：

- 全量 edge style 分桶
- label mask 分组策略
- active edge 集合构造
- overlay 数据构造

---

## 5. 最终 API 设计

## 5.1 `whiteboard-editor-scene` Snapshot / Change

最终 `Snapshot` 与 `Change` 扩展为：

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

## 5.2 Render Snapshot

```ts
type EdgeStaticStyleKey = string
type EdgeStaticId = string
type EdgeLabelKey = `${EdgeId}:${string}`

type EdgeStaticPath = {
  id: EdgeId
  svgPath: string
}

type EdgeStaticStyle = {
  stroke: string
  strokeWidth: number
  strokeOpacity: number
  dash?: string
  markerStart?: string
  markerEnd?: string
}

type EdgeStaticView = {
  id: EdgeStaticId
  styleKey: EdgeStaticStyleKey
  style: EdgeStaticStyle
  paths: readonly EdgeStaticPath[]
}

type EdgeActiveView = {
  edgeId: EdgeId
  svgPath: string
  style: EdgeStaticStyle
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
    style: EdgeStaticStyle
  }
  snapPoint?: Point
  endpointHandles: readonly {
    edgeId: EdgeId
    end: 'source' | 'target'
    point: Point
  }[]
  routePoints: readonly SelectedEdgeRoutePoint[]
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

### 设计说明

- `statics` 不再是一个大 `ReadStore<EdgeStaticRenderModel>`，而是 **可增量 publish 的 family**。
- 对外直接暴露 `statics`，不再把“bucket + chunk”这些内部组织细节带进公开 API。
- `bucket` 与 `chunking` 都只是内部实现策略；对外统一叫 `static` render 单元。
- `overlay` 仍然保留为一个 value，因为数量始终很小，而且放在 chrome viewport 渲染。

---

## 5.3 Render Change

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

## 5.4 `editor-scene` Query

最终 query 补一个 sync `hit.edge`：

```ts
interface Read {
  // existing
  snapshot(): Snapshot
  spatial: SpatialRead
  snap(rect: Rect): readonly SnapCandidate[]
  frame: ...

  // new
  hit: {
    edge(input: {
      point: Point
      threshold?: number
      excludeIds?: readonly EdgeId[]
    }): EdgeId | undefined
  }
}
```

说明：

- **sync `hit.edge` 放进 `editor-scene`**
- **frame-throttled runtime schedule 继续留在 editor/react host**

---

## 5.5 `whiteboard-editor` 对外 API

`whiteboard-editor` 对外仍保持简单：

```ts
type EditorSceneSource = {
  revision(): number
  items: ReadStore<readonly SceneItem[]>
  edge: {
    render: {
      statics: FamilyRead<EdgeStaticId, EdgeStaticView>
      active: FamilyRead<EdgeId, EdgeActiveView>
      labels: FamilyRead<EdgeLabelKey, EdgeLabelView>
      masks: FamilyRead<EdgeId, EdgeMaskView>
      overlay: ReadStore<EdgeOverlayView>
    }
  }
  query: {
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

注意：

- `editor` 不再自己“重新算 render”
- `editor` 只把 `editor-scene` 的 render snapshot/change 桥接成 store read

---

## 6. `editor-scene` 内部实现

## 6.1 新 phase

最终 phase 顺序：

```ts
graph -> spatial -> ui -> render
```

职责：

- `graph`：投影 `NodeView / EdgeView / MindmapView / GroupView`
- `spatial`：投影 spatial index
- `ui`：投影 `NodeUiView / EdgeUiView / ChromeView`
- `render`：投影 `edge static/active/labels/masks/overlay`

为什么 `render` 放在 `ui` 后面：

- `statics` 主要依赖 graph
- `labels/masks` 依赖 graph 和 edge label edit state
- `active` 依赖 graph 和 ui / hover / selection
- `overlay` 依赖 graph + ui + chrome preview/edit

把 render 放在 `ui` 后面，可以直接消费 `working.graph`、`working.ui`、`working.ui.chrome`，避免 editor 再做一层派生。

---

## 6.2 Render phase scope

新增：

```ts
type RenderPatchScope = {
  reset: boolean
  statics: ReadonlySet<EdgeId>
  labels: ReadonlySet<EdgeId>
  active: ReadonlySet<EdgeId>
  overlay: boolean
}
```

说明：

- `statics`：style/path/order 变化会影响 static render
- `labels`：label text/placement/mask/edit 变化会影响 labels/masks
- `active`：hover/selection/editing 变化会影响 active
- `overlay`：preview connect / selected route / reconnect handle 变化

不要再把 render scope 简化成一个 `edges: Set<EdgeId>`；那样仍然会把不同成本模型混在一起。

---

## 6.3 Render 内部 working state

内部不对外暴露，但必须有 render membership/index：

```ts
type EdgeRenderState = {
  statics: {
    styleKeyByEdge: Map<EdgeId, EdgeStaticStyleKey>
    edgeIdsByStyleKey: Map<EdgeStaticStyleKey, readonly EdgeId[]>
    staticIdByEdge: Map<EdgeId, EdgeStaticId>
    staticIdsByStyleKey: Map<EdgeStaticStyleKey, readonly EdgeStaticId[]>
    statics: Map<EdgeStaticId, EdgeStaticView>
  }
  labels: Map<EdgeLabelKey, EdgeLabelView>
  masks: Map<EdgeId, EdgeMaskView>
  active: Map<EdgeId, EdgeActiveView>
  overlay: EdgeOverlayView
}
```

关键点：

- `styleKeyByEdge` / `edgeIdsByStyleKey` 是 static style membership index
- `staticIdByEdge` / `staticIdsByStyleKey` 让单条 edge 更新时只重建受影响 static render 单元
- `labels` / `masks` / `active` 都是直接 publish family
- `overlay` 是 value，不需要 family

---

## 6.4 Static render 为什么内部必须做 chunking

如果只暴露：

- `staticBuckets: Family<BucketId, BucketView>`

那么当：

- 全部 edge 样式都相同

就会出现：

- 一个 bucket 里挂上万条 path
- 单条 edge 更新时整个 bucket render function 仍会全量 map

这比今天的全量 `staticModel` 好，但还不够好。

所以最终 API 直接用 `statics`：

- chunk 仍按 style 分组
- 但 publish 单位是 chunk，不是整个 bucket
- chunk 大小固定，例如 `256` 或 `512`

这样单条 edge 更新时：

- 只会触发受影响 static render 单元
- 不会把一个大 style bucket 整体拖下水

---

## 6.5 Render phase 如何复用现有 delta

### 6.5.1 复用 `graph` phase 的 fanout

今天 `graphPhase` 已经做了：

- node geometry changed -> related edges 入队
- edge patch -> `GraphDelta.entities.edges`
- edge geometry changed -> `GraphDelta.geometry.edges`

这意味着 render phase **不需要自己再做 node -> edge fanout**。

render phase 只要消费：

- `GraphDelta.entities.edges`
- `GraphDelta.geometry.edges`

就能拿到正确 touched edge 集合。

### 6.5.2 复用 `ui` phase 的 touched edge 集合

`uiPhase` 已经会 patch：

- touched `EdgeUiView`

render phase 直接消费：

- `ui scope.edges`
- `working.ui.edges`
- `working.ui.chrome.hover`

即可构造 `active` 和 `overlay`。

### 6.5.3 复用 `publishEntityFamily`

render publish 不应手写：

- ids diff
- byId copy
- remove/set patch

应像 `graph/ui publish` 一样复用：

- `publishEntityFamily`
- `createFlags`

---

## 7. 哪些东西应该放到哪个包

## 7.1 进入 `whiteboard-editor-scene`

### 必须进入

- render phase
- render working state
- render publish delta
- sync `hit.edge`
- static membership/index
- labels/masks/active/overlay projection

### 适合后续一起进入

- generic scene pick resolve
- `visible` query projector 化

### 不该进入

- `usePointer` 里的 frame task
- DOM pick registry
- SVG mask DOM 结构

---

## 7.2 进入 `whiteboard-core`

### 必须新增

- `edge.render.styleKey`
- `edge.render.staticStyle`
- `edge.hit.distanceToPath`

### 可以保持现状

- `edge.label.mask`
- `edge.label.maskTransform`
- `edge.label.placement`
- `edgeApi.view.resolve`

原则：

- 只要是“同一个输入永远得到同一个输出”的纯函数，就应该尽量下沉 core。
- 只要涉及 projector state / touched set / bucket membership，就不要放 core。

---

## 7.3 进入 `shared/projector`

### 必须新增

- `createProjectorStore`
- `value(...)`
- `family(...)`
- `writeEntityChange(...)`

原因：

- render、graph、ui 都会持续需要“snapshot/change -> reactive store”桥接
- 否则 `whiteboard-editor/src/scene/source.ts` 这种手写 sync layer 会一直复制下去

### 不该进入

- edge static builder / chunking logic
- style bucket logic
- spatial query
- whiteboard-specific touched scope

---

## 7.4 留在 `whiteboard-editor`

- `projection/controller.ts`：输入聚合、flush、调度
- `projection/input.ts`：engine/session/layout -> `editor-scene Input`
- `createEditor.ts`：runtime assembly
- editor-facing write/action API
- editor-facing runtime task / schedule

但必须删掉：

- `scene/edgeRender.ts`
- editor 本地 edge render model 派生
- editor 本地 `hit.edge` 包装逻辑

---

## 7.5 留在 `whiteboard-react`

- `EdgeStaticLayer`
- `EdgeActiveLayer`
- `EdgeLabelLayer`
- `EdgeOverlayLayer`
- `EdgeSceneLayer`
- host input runtime schedule

React 只做：

- family -> DOM
- value -> DOM
- DOM ref / pick binding

React 不再做：

- render membership/index
- edge style bucket grouping
- active 集合派生
- overlay 数据派生

---

## 8. 必须补齐的基础设施改动

## 8.1 `shared/projector`

需要新增：

- `shared/projector/src/store/*` 或等价实现
- `createProjectorStore`
- `value`
- `family`
- `writeEntityChange`

这样 `whiteboard-editor` 最终可以从：

- 手写 `composeSync/createIdDeltaFamilySync/createValueSync`

切到：

- 声明式 projector store bridge

---

## 8.2 `whiteboard-core`

需要新增：

- `whiteboard-core/src/edge/render.ts`
- `whiteboard-core/src/edge/hitTest.ts` 补 `distanceToPath`
- `whiteboard-core/src/edge/index.ts` 导出新 API

这样：

- static style key
- static style presentation
- precise point-to-edge distance

都不再散落在 `editor` 或 `react`。

---

## 8.3 `whiteboard-editor-scene`

### 合同层

需要修改：

- `src/contracts/editor.ts`
- `src/contracts/delta.ts`
- `src/contracts/working.ts`

新增：

- `RenderSnapshot`
- `RenderChange`
- `RenderPatchScope`
- `render` working state
- `InputDelta.measure`

### projector 层

需要修改：

- `src/projector/spec.ts`
- `src/projector/impact.ts`
- `src/projector/publish.ts`

新增：

- render phase planning
- render publish

### phase / domain 层

需要新增：

- `src/phases/render.ts`
- `src/domain/render/edge/static.ts`
- `src/domain/render/edge/labels.ts`
- `src/domain/render/edge/active.ts`
- `src/domain/render/edge/overlay.ts`
- `src/domain/render/edge/state.ts`

### query 层

需要修改：

- `src/runtime/query.ts`

新增：

- `hit.edge(...)`

说明：

- `hit.edge` 直接复用已有 `spatial.candidates`
- precise distance 调 core `edge.hit.distanceToPath`
- schedule 层不进 `editor-scene`

---

## 8.4 `whiteboard-editor`

### projection input

需要修改：

- `src/projection/input.ts`
- `src/projection/controller.ts`
- `src/layout/runtime.ts`
- 必要时新增 `src/layout/edgeLabelMeasure.ts`

必须补齐：

- 真实 `measure.text.nodes`
- 真实 `measure.text.edgeLabels`
- `InputDelta.measure.nodes`
- `InputDelta.measure.edgeLabels`

否则：

- render 下沉到 `editor-scene` 后，label placement 仍拿不到真实测量结果

### scene source bridge

需要修改：

- `src/scene/source.ts`
- `src/types/editor.ts`
- `src/editor/createEditor.ts`

需要删除：

- `src/scene/edgeRender.ts`

最终 `source.ts` 不再自己生成 render runtime，只桥接 `editor-scene` publish snapshot/change。

---

## 8.5 `whiteboard-react`

需要修改：

- `src/features/edge/components/EdgeSceneLayer.tsx`
- `src/features/edge/components/EdgeStaticLayer.tsx`
- `src/features/edge/components/EdgeActiveLayer.tsx`
- `src/features/edge/components/EdgeLabelLayer.tsx`
- `src/features/edge/components/EdgeOverlayLayer.tsx`
- `src/dom/host/input.ts`

变化：

- 从“读一个大 render model”改成“读 family + value”
- `EdgeStaticLayer` 改成渲染 `statics`
- `EdgeLabelLayer` / `EdgeMask` 直接消费 family
- input host 改成调用 `editor.scene.query.hit.edge(...)`

---

## 9. 与现有基础设施的复用关系

## 9.1 复用 `GraphDelta`

render phase 不需要重新发明 touched edge 计算。

直接复用：

- `graph.entities.edges`
- `graph.geometry.edges`
- `graph.order`

语义：

- `entities.edges`：edge base/style/labels/route/preview/edit 变化
- `geometry.edges`：影响 spatial / hit / bounds / static path 的变化
- `order`：影响 static render 排序

---

## 9.2 复用 `uiPhase` 输出

render phase 直接读：

- `working.ui.edges`
- `working.ui.chrome`

active / overlay 不再从 editor 本地 session store 再算一遍。

---

## 9.3 复用 spatial index

不新增第二套 edge hit index。

继续复用 `editor-scene` 已有：

- sparse hash grid
- oversized record 通道
- `spatial.candidates(rect, { kinds: ['edge'] })`

只有 style bucket membership 是 render 自己的内部 index，不和 spatial 混用。

---

## 9.4 复用 `publishEntityFamily`

render families：

- `statics`
- `active`
- `labels`
- `masks`

全部按 `publishEntityFamily` publish。

不要在 editor 或 react 再维护自定义 byId/ids patch 逻辑。

---

## 9.5 复用 `idDelta`

render patch / publish 统一使用：

- `idDelta.add`
- `idDelta.update`
- `idDelta.remove`
- `idDelta.touched`

同时新增 `writeEntityChange`，避免每个 phase 都手写同样的 add/update/remove 判定。

---

## 10. 最终实施顺序

## P0. 补齐前置能力

目标：

- 让 `editor-scene` 真正拿到 measure snapshot 与 measure delta
- 让 `shared/projector` 具备 projector-store bridge primitive
- 让 `whiteboard-core` 具备纯 edge render/hit primitive

修改：

- `shared/projector`
- `whiteboard-core`
- `whiteboard-editor/src/layout/*`
- `whiteboard-editor/src/projection/*`

完成标准：

- `Input.measure` 不再是假数据
- `InputDelta.measure` 存在
- `edge.hit.distanceToPath` 可复用
- `createProjectorStore` 可用

---

## P1. 在 `editor-scene` 新增 render phase

目标：

- render 正式变成 projector phase

修改：

- `whiteboard-editor-scene/src/contracts/*`
- `whiteboard-editor-scene/src/phases/render.ts`
- `whiteboard-editor-scene/src/domain/render/*`
- `whiteboard-editor-scene/src/projector/*`

完成标准：

- `Snapshot.render` 存在
- `Change.render` 存在
- render family/value 可 publish

---

## P2. 把 `hit.edge` 正式下沉到 `editor-scene`

目标：

- sync hit query 统一归属到 scene runtime

修改：

- `whiteboard-editor-scene/src/runtime/query.ts`
- 需要的话新增 `domain/render/edge/hit.ts` 或 `domain/hit/edge.ts`

完成标准：

- `editor-scene Read.hit.edge(...)` 可用
- `whiteboard-editor/src/scene/pick.ts` 不再自持 edge point distance 实现

---

## P3. 删除 editor 本地 edge render runtime

目标：

- 删掉 `whiteboard-editor/src/scene/edgeRender.ts`

修改：

- `whiteboard-editor/src/scene/source.ts`
- `whiteboard-editor/src/types/editor.ts`
- `whiteboard-editor/src/editor/createEditor.ts`

完成标准：

- `editor.scene.edge.render.*` 全部来自 `editor-scene publish`
- editor 不再二次全量派生 render model

---

## P4. React 切换到 family/value 消费

目标：

- React 完全消费 projector publish 结果

修改：

- `whiteboard-react/src/features/edge/components/*`
- `whiteboard-react/src/dom/host/input.ts`

完成标准：

- static 渲染来自 `statics`
- labels/masks/active 来自 family
- overlay 来自 value
- body hit 来自 `editor.scene.query.hit.edge`

---

## 11. 最终验收标准

必须同时满足：

1. 不再存在 `whiteboard-editor/src/scene/edgeRender.ts`
2. `editor-scene` snapshot 内存在 `render`
3. `editor-scene` change 内存在 `render`
4. edge static render 以增量 family 发布，内部允许 chunking，而不是 editor 本地全量 `staticModel`
5. edge labels/masks/active/overlay 全部由 `editor-scene` 投影
6. sync `hit.edge` 归属 `editor-scene query`
7. frame-throttled pick 调度仍留在 editor/react host
8. `projection/input.ts` 已接入真实 node/edge label measure 数据
9. projector -> store bridge 不再由 `scene/source.ts` 手写拼装
10. React 不再做任何 edge render 数据建模，只负责渲染

---

## 12. 最终判断

从长期最优角度看：

- **render source 必须进 `editor-scene`**
- **pure render/hit primitive 必须进 `whiteboard-core`**
- **projector -> store bridge 必须进 `shared/projector`**
- **editor/react 必须退出 render 建模**

否则继续在 `whiteboard-editor/src/scene/edgeRender.ts` 上做优化，只会把局部性能问题换一种形式留住，不能真正吃到现有 `delta / projector / spatial index / publish` 基础设施的收益。

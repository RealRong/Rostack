# Whiteboard Edge Render 最终基础设施与剩余工作

## 1. 口径

- 本文取代旧版 `WHITEBOARD_EDGE_RENDER_INFRA_FINAL.zh-CN.md`。
- 旧版文档里的部分路径、phase 拆分、measure 方案已经落后于当前实现，不能继续作为实施依据。
- 本文只描述两件事：
  - 当前已经完成到什么程度
  - 剩余哪些工作还值得继续做
- 目标不变：
  - `whiteboard-core` 只放纯 edge render / hit primitive
  - `shared/projector` 只放通用 projector / delta / store bridge primitive
  - `whiteboard-editor-scene` 成为唯一 scene render / hit / spatial runtime
  - `whiteboard-editor` 与 `whiteboard-react` 退出 edge render 数据建模

---

## 2. 当前结论

当前这条线已经基本到达本文原本想要的最终方向。

已经成立的事实：

- `whiteboard-core` 已有：
  - `edge.render.styleKey`
  - `edge.render.staticStyle`
  - `edge.hit.distanceToPath`
- `shared/projector` 已有：
  - `createProjectorStore`
  - `value(...)`
  - `family(...)`
  - `writeEntityChange(...)`
- `whiteboard-editor-scene` 已经是 edge render 唯一投影源：
  - `render.edge.statics`
  - `render.edge.active`
  - `render.edge.labels`
  - `render.edge.masks`
  - `render.edge.overlay`
- `whiteboard-editor` 已删掉本地 `scene/edgeRender.ts`
- `whiteboard-react` 已直接消费 family / value，而不是本地再算 render model
- body hit 已通过 `editor.scene.query.hit.edge(...)` 走 `editor-scene`

所以，后续不应该再做这些事情：

- 不应重新引入 `whiteboard-editor/src/scene/edgeRender.ts`
- 不应在 `editor` 或 `react` 新做一套 edge render 投影
- 不应为了对齐旧文档，再拆回单独的 `render phase`
- 不应为了对齐旧文档，引入 `measure snapshot` / `measure delta` 这一整套额外状态模型

---

## 3. 旧文档哪里已经过时

### 3.1 不再存在旧目录结构

旧文档里的这些路径已经不是现状：

- `whiteboard-editor-scene/src/projector/*`
- `whiteboard-editor-scene/src/domain/render/*`
- `whiteboard-editor-scene/src/runtime/query.ts`
- `whiteboard-editor-scene/src/phases/render.ts`

当前真实落点是：

- `whiteboard-editor-scene/src/runtime/model.ts`
- `whiteboard-editor-scene/src/runtime/read.ts`
- `whiteboard-editor-scene/src/runtime/hit/edge.ts`
- `whiteboard-editor-scene/src/model/view/render.ts`
- `whiteboard-editor-scene/src/contracts/render.ts`

### 3.2 不再采用独立 `render phase`

旧文档假设最终 phase 是：

```ts
graph -> spatial -> ui -> render
```

当前真实实现已经收敛为：

```ts
graph -> spatial -> view
```

其中：

- `view` 已同时承载：
  - `ui`
  - `items`
  - edge render projection

这不是缺失，而是更收敛的最终形态。

### 3.3 不再采用 `InputDelta.measure`

旧文档把下面这些当成前置：

- `Input.measure snapshot`
- `InputDelta.measure.nodes`
- `InputDelta.measure.edgeLabels`
- measure delta lifecycle

当前真实实现不走这条路。

当前实现采用的是更简单的模型：

- editor 把同步 `measure` 函数传给 `editor-scene runtime`
- graph patch / edge patch 在需要时直接调用该函数

这意味着：

- 当前没有 `measure snapshot`
- 当前没有 `measure delta`
- 这不是未完成项，而是设计选择

除非后续证明同步 measure 成本或稳定性有问题，否则不应为了“概念完整”额外引入 measure state / delta。

---

## 4. 当前真实职责划分

### 4.1 `whiteboard-core`

只负责纯函数，不碰 projector state，不碰 store，不碰 DOM。

当前 edge 侧职责：

- style key
- static style presentation
- path bounds
- point-to-path precise distance
- label placement
- label mask
- edge path / edge view resolve

不应进入 `whiteboard-core` 的东西：

- static chunk membership
- active edge 集合
- overlay projection
- touched edge planning
- spatial index state

### 4.2 `shared/projector`

只负责通用 runtime primitive：

- change lifecycle
- delta write helper
- projection runtime
- projector store bridge

不应进入 `shared/projector` 的东西：

- edge render bucket / chunk 逻辑
- spatial query
- whiteboard scene touched scope

### 4.3 `whiteboard-editor-scene`

这是唯一 scene projection runtime。

edge 相关职责已经在这里：

- graph projection
- spatial projection
- edge render projection
- sync `hit.edge`
- render family/value publish

当前主要文件：

- [whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts:547)
- [whiteboard/packages/whiteboard-editor-scene/src/model/view/render.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/model/view/render.ts:1)
- [whiteboard/packages/whiteboard-editor-scene/src/runtime/hit/edge.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/runtime/hit/edge.ts:18)

### 4.4 `whiteboard-editor`

只负责：

- engine / session / layout -> `editor-scene Input`
- input change 聚合
- runtime assembly
- editor-facing query / read / write convenience API

它可以保留包装层，但不能重新做 render projection。

### 4.5 `whiteboard-react`

只负责：

- family -> DOM
- value -> DOM
- DOM host input / pick registry / editable DOM

它不能再负责：

- static style 分桶
- active edge 集合构造
- label / mask / overlay 数据派生

---

## 5. 当前最终 API 形态

### 5.1 `whiteboard-editor-scene` render surface

当前对外 render 形态应继续保持：

```ts
type EdgeStaticId = string
type EdgeLabelKey = `${EdgeId}:${string}`

type EdgeStaticView = {
  id: EdgeStaticId
  styleKey: string
  style: EdgeStaticStyle
  paths: readonly {
    id: EdgeId
    svgPath: string
  }[]
}

type EdgeActiveView = {
  edgeId: EdgeId
  svgPath: string
  style: EdgeStaticStyle
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
    style: EdgeStaticStyle
  }
  snapPoint?: Point
  endpointHandles: readonly {
    edgeId: EdgeId
    end: 'source' | 'target'
    point: Point
  }[]
  routePoints: readonly EdgeOverlayRoutePoint[]
}
```

对外 publish surface：

```ts
render: {
  edge: {
    statics: Family<EdgeStaticId, EdgeStaticView>
    active: Family<EdgeId, EdgeActiveView>
    labels: Family<EdgeLabelKey, EdgeLabelView>
    masks: Family<EdgeId, EdgeMaskView>
    overlay: Value<EdgeOverlayView>
  }
}
```

### 5.2 `editor-scene` query

当前 query 形态应继续保持：

```ts
read.hit.edge({
  point,
  threshold?,
  excludeIds?
}): EdgeId | undefined
```

这条 query 只负责：

- spatial candidate query
- precise edge distance compare

它不负责：

- frame-throttled pointer schedule
- DOM pick registry
- `elementsFromPoint`

### 5.3 `whiteboard-editor` 对外 surface

当前 editor-facing surface 继续维持简单包装即可：

```ts
editor.scene.edge.render.statics
editor.scene.edge.render.active
editor.scene.edge.render.labels
editor.scene.edge.render.masks
editor.scene.edge.render.overlay
editor.scene.query.hit.edge(...)
```

原则：

- 可以包一层 editor-facing 读接口
- 不可以在这层再做本地 edge render 派生

---

## 6. 仍然值得继续做的事情

当前不是“大框架未完成”，而是还有少量收尾与统一工作。

### 6.1 收口 `scene/pick.ts` 里的 edge precise hit 逻辑

现状：

- body hit 主路径已经走 `editor.scene.query.hit.edge(...)`
- 但 `whiteboard-editor/src/scene/pick.ts` 的通用 pick 解析里，仍自持一份 `edge.hit.distanceToPath(...)`

这会带来两个问题：

- edge precise hit 仍有双入口
- 后续改 edge hit 策略时，需要改两处

最终目标：

- edge precise hit 的“候选筛选 + 距离比较”能力只保留一份主实现

可选方案：

- 让 `scene/pick.ts` 直接调用 `editor-scene` 的 `read.hit.edge(...)`
- 或者把共享的 nearest-edge resolver 下沉到 `editor-scene` 内部，并让 `pick.ts` 只消费 scene runtime 产物

要求：

- 不重新引入 editor 本地 spatial / distance 投影
- 不把 DOM host 调度塞回 `editor-scene`

### 6.2 继续压缩 `scene/source.ts` 包装层

现状：

- `scene/source.ts` 已经不再做 edge render 全量派生
- 但仍承担了较多 editor-facing convenience read 组装

这里不是结构错误，但后续可以继续收口：

- 能直接透传 runtime store 的，尽量透传
- 包装层只保留 editor-facing sugar
- 避免在这层重新积累第二套 scene read model

目标不是“删到没有包装”，而是：

- 包装层不再拥有独立投影逻辑

### 6.3 继续统一 pick / visible / scope 的归属边界

现状：

- `hit.edge` 已进 `editor-scene`
- `visible`、`scope`、`scene pick runtime` 仍有 editor 包装与本地组合逻辑

这些不一定都必须立刻下沉，但要守住边界：

- 世界状态与几何真相：`editor-scene`
- host 调度、pointer frame、DOM event orchestration：`editor` / `react`

也就是说，后续如果继续下沉：

- 应下沉的是纯 query / pure resolve primitive
- 不应下沉的是浏览器事件调度逻辑

### 6.4 只在证据充分时再引入 measure state

当前同步 `measure` 回调已经能支撑：

- node text measure
- edge label measure

所以后续原则应明确：

- 默认不引入 `measure snapshot`
- 默认不引入 `measure delta`
- 只有当同步 measure 的重复调用、去重能力或一致性真的成为瓶颈时，再单独设计 measure cache / state

这件事不能再作为 edge render infra 的默认前置。

---

## 7. 不再需要做的事情

下面这些在当前架构下不应再继续：

- 新建 `whiteboard-editor-scene/src/projector/*`
- 新建 `whiteboard-editor-scene/src/domain/render/*`
- 新建独立 `render phase`
- 引入 `InputDelta.measure`
- 为了对齐旧文档，额外做 measure snapshot / delta plumbing
- 重建 editor 本地 edge render runtime

一句话：

- 旧文档里凡是“为了把 render 从 editor 挪进 scene”而设计的基础设施，凡是现在已经真实落地的，都不要再做第二遍。

---

## 8. 剩余实施顺序

### P0. 文档与口径收敛

目标：

- 以后所有实现都以当前真实架构为准

动作：

- 本文替换旧版 edge render infra 文档
- 后续相关文档引用当前真实路径和真实 phase

完成标准：

- 不再有人按 `projector/*` / `domain/render/*` / `render phase` / `InputDelta.measure` 去实施

### P1. 收掉 edge precise hit 的双实现

目标：

- `hit.edge` 的核心逻辑只保留一份

修改面：

- `whiteboard/packages/whiteboard-editor/src/scene/pick.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/hit/edge.ts`
- 必要时补一个 scene 内共享 helper

完成标准：

- editor 不再自持 edge precise distance 解析逻辑
- body hit 与 scene pick 的 edge winner 规则一致

### P2. 继续瘦身 `scene/source.ts`

目标：

- `scene/source.ts` 只做 editor-facing 包装，不再继续长出本地 projection

修改面：

- `whiteboard/packages/whiteboard-editor/src/scene/source.ts`
- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`

完成标准：

- render surface 只是转发 `editor-scene` stores
- 不再新增本地 render/query 派生

### P3. 视需要继续统一 pure query primitive

目标：

- 把仍然适合下沉的 pure query / resolve primitive 继续推进到 `editor-scene`

候选：

- generic pick resolve 的 pure 部分
- visible query 的 pure 部分
- scope 里明显只依赖 scene state 的 pure 部分

完成标准：

- scene/runtime 和 editor/host 的职责边界更清晰
- 不引入新的双轨 query 实现

---

## 9. 最终验收标准

继续以这组标准作为终态判断：

1. `whiteboard-editor` 中不再存在本地 edge render runtime。
2. `whiteboard-editor-scene` 是唯一 edge render 投影源。
3. `whiteboard-react` 只消费 family / value，不再做 edge render 数据建模。
4. `whiteboard-core` 持有纯 edge render / hit primitive。
5. `shared/projector` 持有通用 projector-store bridge primitive。
6. body hit 通过 `editor.scene.query.hit.edge(...)` 进入 `editor-scene`。
7. edge precise hit 逻辑最终只保留一份主实现。
8. 不为了“概念完整”再引入 measure snapshot / delta。

---

## 10. 一句话总结

这条线已经不是“要不要把 edge render infra 做进 `editor-scene`”，而是：

- **大方向已经做完了。**
- **后续只需要把少量残留双实现收掉，并继续守住 scene / editor / react 的职责边界。**

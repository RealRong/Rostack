# Whiteboard Edge 渲染最终 API 与实施方案

## 最终 API 设计

### 1. Editor Runtime

```ts
type WhiteboardRuntime = {
  scene: {
    edge: {
      render: EdgeRenderRuntime
      hit: EdgeHitQuery
      interaction: EdgeInteractionRead
    }
  }
}
```

---

### 2. Render Runtime

```ts
type EdgeRenderRuntime = {
  static: ReadStore<EdgeStaticRenderModel>
  active: ReadStore<EdgeActiveRenderModel>
  labels: ReadStore<EdgeLabelRenderModel>
  overlay: ReadStore<EdgeOverlayRenderModel>
}
```

约束：

- `static` 承载全量 edge 基础 path
- `active` 只承载少量 edge 的额外强调视觉
- `labels` 只承载 label DOM
- `overlay` 只承载 route / endpoint / reconnect 等强交互元素
- React 主渲染禁止再按 `edgeId -> EdgeItem` 映射整棵子树

---

### 3. Static Layer Model

```ts
type EdgeRenderBucketId = string

type EdgeStaticPath = {
  id: EdgeId
  svgPath: string
}

type EdgeStaticBucket = {
  id: EdgeRenderBucketId
  stroke: string
  strokeWidth: number
  strokeOpacity: number
  dash?: string
  markerStart?: string
  markerEnd?: string
  paths: readonly EdgeStaticPath[]
}

type EdgeStaticRenderModel = {
  buckets: readonly EdgeStaticBucket[]
}
```

约束：

- bucket 只按视觉样式分组
- `static` 层不包含 hover、focus、selected、editing 状态
- `static` 层不包含 label mask
- `static` 层不包含透明 hit path

---

### 4. Active Layer Model

```ts
type EdgeActiveRenderItem = {
  id: EdgeId
  svgPath: string
  box?: {
    x: number
    y: number
    width: number
    height: number
    pad: number
  }
  style: {
    stroke: string
    strokeWidth: number
    strokeOpacity: number
    dash?: string
    markerStart?: string
    markerEnd?: string
  }
  state: {
    hovered: boolean
    focused: boolean
    selected: boolean
    editing: boolean
  }
}

type EdgeActiveRenderModel = {
  edges: readonly EdgeActiveRenderItem[]
}
```

约束：

- `active` 层只允许渲染极少数 edge 的强调视觉
- `active` 不承载 edge base path 的存在性
- accent / outline / selected halo / editing emphasis 只允许出现在这一层

---

### 5. Label Layer Model

```ts
type EdgeLabelRenderItem = {
  edgeId: EdgeId
  labelId: string
  point: Point
  angle: number
  text: string
  displayText: string
  editing: boolean
  selected: boolean
  style: Edge['labels'][number]['style']
}

type EdgeLabelRenderModel = {
  labels: readonly EdgeLabelRenderItem[]
}
```

约束：

- label 与 path 分层
- 所有 labeled edge 都允许附加 cutout / mask 效果
- mask / cutout 必须由 scene 级 render model 统一产出
- 禁止回到 per-edge local `defs > mask` 实现

---

### 6. Overlay Layer Model

```ts
type EdgeOverlayRenderItem = {
  edgeId: EdgeId
  kind: 'end-handle' | 'anchor' | 'segment' | 'label-handle' | 'reconnect'
}

type EdgeOverlayRenderModel = {
  items: readonly EdgeOverlayRenderItem[]
}
```

约束：

- overlay 只服务当前编辑中或交互中的 edge
- 普通 edge 不允许进入 overlay

---

### 7. Interaction State

```ts
type EdgeInteractionState = {
  hovered?: EdgeId
  focused?: EdgeId
  selected: readonly EdgeId[]
  editing?: EdgeId
}

type EdgeInteractionRead = {
  get(): EdgeInteractionState
  subscribe(listener: () => void): () => void
}
```

约束：

- 不允许 edge 组件持有本地 `hovered` / `focused` state
- 所有交互态统一来源于 session / interaction / chrome

---

### 8. Hit Query

```ts
type EdgeHitQuery = {
  pick(input: {
    point: Point
    threshold?: number
    excludeIds?: readonly EdgeId[]
  }): EdgeId | undefined
}
```

命中链路固定为：

1. 用 scene spatial rect query 收窄 edge 候选
2. 对候选 edge 做几何距离判定
3. 返回最近 edge

约束：

- 禁止再用每条 edge 的透明 hit path 作为主命中方案
- React 层只消费命中结果，不参与逐条 edge DOM hit-testing

---

### 9. React 组件结构

```ts
type EdgeSceneLayer = {
  static: EdgeStaticLayer
  active: EdgeActiveLayer
  labels: EdgeLabelLayer
  overlay: EdgeOverlayLayer
}
```

最终组件：

- `EdgeSceneLayer`
- `EdgeStaticLayer`
- `EdgeActiveLayer`
- `EdgeLabelLayer`
- `EdgeOverlayLayer`

最终约束：

- `EdgeItem` 不再作为主渲染入口
- 如果保留 `EdgeItem` 文件，只能是空壳转发；最终应删除

---

### 10. DOM 结构约束

最终目标 DOM：

```tsx
<div className="wb-edge-scene">
  <svg className="wb-edge-static-layer">...</svg>
  <svg className="wb-edge-active-layer">...</svg>
  <div className="wb-edge-label-layer">...</div>
  <div className="wb-edge-overlay-layer">...</div>
</div>
```

约束：

- 不再允许“一条 edge 一个独立 svg 根节点”
- 不再允许“一条 edge 一条透明 hit path”
- 不再允许普通 edge 默认挂一套 `defs > mask`

---

## 分阶段实施方案

以下阶段完成后，文档目标即视为落地完成。

---

### P0. 建立新的 scene render runtime

目标：

- 让 React 主渲染先切到 `scene.edge.render.*`
- 停止主路径依赖 `edgeId -> EdgeItem`

修改清单：

1. 在 `whiteboard-editor` 新增 `edge render runtime`
2. 对 `editor.scene.edge.render` 暴露 `static / active / labels / overlay`
3. `CanvasScene` 改为消费 `editor.scene.edge.render`
4. 新增 `EdgeSceneLayer` 作为 edge 渲染根入口
5. 旧的 `EdgeItem` 不再被 `CanvasScene` 直接使用

修改文件：

- `whiteboard/packages/whiteboard-editor/src/scene/source.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/edgeRender.ts`
- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`
- `whiteboard/packages/whiteboard-react/src/canvas/CanvasScene.tsx`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeSceneLayer.tsx`

完成标准：

- `CanvasScene` 内不存在按 scene item 逐条渲染 `EdgeItem` 的主路径
- `editor.scene.edge.render` 已可被 React 直接消费

---

### P1. 落地静态 edge 批量渲染

目标：

- 把绝大多数 edge 移到共享静态层

修改清单：

1. 在 `whiteboard-editor` 构建 `EdgeStaticRenderModel`
2. 按视觉样式生成 `EdgeStaticBucket`
3. 每个 bucket 输出共享样式和 path 列表
4. 在 React 实现 `EdgeStaticLayer`
5. `EdgeStaticLayer` 只渲染共享 SVG，不渲染交互态

修改文件：

- `whiteboard/packages/whiteboard-editor/src/scene/edgeRender.ts`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeStaticLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/styles/whiteboard-react.css`

完成标准：

- 普通 edge 主路径全部来自 `EdgeStaticLayer`
- 普通 edge 不再拥有独立 React 子树
- 普通 edge 不再拥有独立 svg 根节点

---

### P2. 落地 active / overlay 分层

目标：

- 为少量交互 edge 建立独立强调层与 overlay 层

修改清单：

1. 在 `whiteboard-editor` 构建 `EdgeActiveRenderModel`
2. 在 `whiteboard-editor` 构建 `EdgeOverlayRenderModel`
3. `static` 继续输出全量 edge base path
4. 只把 `hovered / focused / selected / editing` edge 的强调视觉放入 `active`
5. 只把 `reconnecting / routing / endpoint handle / route handle` 放入 `overlay`
6. React 新增 `EdgeActiveLayer`
7. React 新增 `EdgeOverlayLayer`

修改文件：

- `whiteboard/packages/whiteboard-editor/src/scene/edgeRender.ts`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeActiveLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeOverlayLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/styles/whiteboard-react.css`

完成标准：

- `static` 持续渲染全量 edge base path
- accent / selected / editing 强调视觉不再由静态层承担
- endpoint / route handle / reconnect handle 不再混在普通 edge 渲染里

---

### P3. 落地 label 分层

目标：

- 把 label 从 path 渲染里彻底拆开

修改清单：

1. 在 `whiteboard-editor` 构建 `EdgeLabelRenderModel`
2. React 新增 `EdgeLabelLayer`
3. 普通 label 全部由 `EdgeLabelLayer` 渲染
4. 从旧 edge 组件里移除 label DOM
5. 编辑态 label 仍由统一 `labels` 层承载

修改文件：

- `whiteboard/packages/whiteboard-editor/src/scene/edgeRender.ts`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeLabelLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeItem.tsx`
- `whiteboard/packages/whiteboard-react/src/styles/whiteboard-react.css`

完成标准：

- path 层不再直接渲染 label DOM
- label 更新不会导致静态 path 层整体 rerender

---

### P4. 切掉 per-edge hit path

目标：

- 主命中从 DOM transparent path 切到 scene hit query

修改清单：

1. 在 `whiteboard-editor` 提供 `scene.edge.hit.pick`
2. 复用 scene spatial query 做候选收窄
3. 复用 edge geometry 做距离命中
4. 修改 pointer bridge / host input，读取统一 edge hit 结果
5. 删除普通 edge 的透明 hit path

修改文件：

- `whiteboard/packages/whiteboard-editor/src/scene/edgeHit.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/source.ts`
- `whiteboard/packages/whiteboard-react/src/runtime/bridge/pointer.ts`
- `whiteboard/packages/whiteboard-react/src/dom/host/input.ts`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeItem.tsx`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeStaticLayer.tsx`

完成标准：

- 普通 edge DOM 中不存在透明 hit path
- edge hover / pointer target 由 `scene.edge.hit.pick` 统一决定

---

### P5. 收拢 interaction state

目标：

- 去掉 edge 组件本地 hover / focus state

修改清单：

1. 在 `whiteboard-editor` 暴露 `scene.edge.interaction`
2. 统一从 session / hover / selection / edit 派生 `EdgeInteractionState`
3. React 只订阅统一 interaction read
4. 删除 edge 组件内部 `useState(hovered)` / `useState(focused)` 逻辑
5. active 层按统一 interaction state 构造渲染模型

修改文件：

- `whiteboard/packages/whiteboard-editor/src/scene/edgeRender.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/source.ts`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeActiveLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeItem.tsx`

完成标准：

- edge 组件不再维护本地 hover / focus 状态
- hover / focus 改变时，只更新 active 层

---

### P6. 降级 mask 与重特性

目标：

- mask 只和 labeled edge 数量相关，不再和全部 edge 数量相关

修改清单：

1. 从静态层删除默认 `defs > mask`
2. 把 labeled edge 的 cutout / mask 统一收敛到 scene-level render model
3. 所有 labeled edge 如需遮线，都通过统一 mask / cutout 产出
4. 清理旧样式和旧 marker / mask 绑定逻辑

修改文件：

- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeStaticLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeActiveLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeLabelLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/styles/whiteboard-react.css`

完成标准：

- 无 label edge 默认不生成 mask
- mask 数量与 labeled edge 数量同阶
- 不存在 per-edge local `defs > mask` 生成路径

---

### P7. 删除旧实现

目标：

- 完成结构切换后彻底移除旧模型

修改清单：

1. 删除 `EdgeItem` 主实现
2. 删除旧 `useEdgeView` 主渲染依赖
3. 删除旧 per-edge hit path 相关逻辑
4. 删除旧 hover / focus 本地 state
5. 删除旧 label mask 默认逻辑
6. 删除不再使用的样式与 helper

修改文件：

- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeItem.tsx`
- `whiteboard/packages/whiteboard-react/src/features/edge/hooks/useEdgeView.ts`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/*`
- `whiteboard/packages/whiteboard-react/src/styles/whiteboard-react.css`

完成标准：

- 代码库中不再存在旧 edge 主渲染路径
- 运行时主渲染只剩 `EdgeSceneLayer -> static/active/labels/overlay`

---

## 最终验收清单

全部阶段完成后，必须满足：

1. `CanvasScene` 的 edge 主渲染入口是 `EdgeSceneLayer`
2. 全量 edge 基础 path 由共享 `EdgeStaticLayer` 渲染
3. 活跃 edge 的强调视觉只在 `EdgeActiveLayer` / `EdgeOverlayLayer` 中出现
4. label 只在 `EdgeLabelLayer` 中渲染
5. 普通 edge 没有透明 hit path
6. 普通 edge 没有默认 mask
7. labeled edge 如需遮线，mask 由 scene-level render model 统一生成
8. 不存在 per-edge local `defs > mask`
9. edge 组件没有本地 hover / focus state
10. React 主渲染不再按 `edgeId -> EdgeItem` 建整棵子树
11. 旧 `EdgeItem` 主实现已删除

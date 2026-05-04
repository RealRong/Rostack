# Whiteboard Edge Render Performance Final Plan

## 目标

在几千条 edge 的白板里，拖拽 node / transform node / mindmap drag 时，projection apply 已经可以控制在低毫秒级，剩余主要开销来自 SVG/React 渲染提交。最终目标是让高频交互只更新真正变化的少量 edge，静态 edge 在 DOM 层保持稳定。

本方案不保留兼容层，不做双轨实现。旧的 “static layer 内每条 edge 一个 path，并在交互中持续更新 static chunk” 方案必须删除。

## 当前问题

### 1. `EdgeStaticLayer` 的 DOM 粒度过细

当前 `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeStaticLayer.tsx` 中：

```tsx
{item.paths.map((path) => (
  <path key={path.id} d={path.svgPath} ... />
))}
```

即使 editor-scene 已经按 style chunk 生成 `EdgeStaticView`，React 层仍然是每条 edge 一个 SVG `path`。几千条 edge 时，浏览器需要维护几千个 SVG path 节点。

projection 计算快不代表提交快。拖拽时如果若干 edge 的 `svgPath` 变化，React diff 和浏览器 SVG layout/paint 仍然会吃掉大量时间。

### 2. static chunk 更新粒度仍然偏粗

当前 `whiteboard/packages/whiteboard-editor-scene/src/model/render/statics.ts` 中：

- 按 `styleKey` 分桶。
- 每 `STATIC_CHUNK_SIZE = 256` 条 edge 生成一个 `EdgeStaticView`。
- `EdgeStaticView.paths` 中任意一条 path 变化，整个 chunk view 变化。

这会导致拖一个 node 时，所有相连 edge 所在 chunk 都触发 React render。即使每个 chunk 只有一条 edge 变化，也会让 chunk 内最多 256 条 path 参与 diff。

### 3. active/static 职责切分不正确

当前 active edge 只覆盖 selected / hovered / editing：

- `whiteboard/packages/whiteboard-editor-scene/src/projection/runtimeFacts.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/render/active.ts`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeActiveLayer.tsx`

但拖拽 node 时真正高频变化的是 connected edges。它们目前仍属于 static layer，导致 static layer 被不断打碎。

长期最优的语义应该是：

- `static edge`: 当前交互帧不会变化的 edge。
- `active edge`: 当前交互帧可能变化、需要高频重绘、需要交互高亮或编辑 chrome 的 edge。

所以 connected edges 在 node drag / node transform / mindmap drag 中必须进入 active layer，并从 static layer 排除。

## 最终设计

### 1. Render 分层

最终 edge render 分为三层：

```text
EdgeStaticLayer
  只渲染稳定 edge。
  按 style chunk 合并 path。
  大部分 edge 在这里，但交互中不更新。

EdgeActiveLayer
  渲染 selected / hovered / editing / transforming / dragging affected edges。
  每条 active edge 独立 path。
  数量应该接近当前交互影响范围，而不是全量 edge。

EdgeLabelLayer / EdgeOverlayLayer
  保持语义层职责，不承载 static path。
```

### 2. Active edge 范围

`activeEdgeIds` 应由 editor-scene runtime facts 统一产生。它必须包含：

- 当前 selection 的 edge ids。
- 当前 hover edge id。
- 当前 edge-label editing edge id。
- 当前 node drag / node transform / mindmap drag 影响到的 connected edge ids。
- 当前 edge route / edge connect 交互影响到的 edge ids。

connected edge ids 从 `WorkingState.indexes.edgeIdsByNode` 读取，不在 React 层临时计算。

### 3. Static layer 排除 active edges

`patchRenderStatics()` 构建 static bucket 时必须排除 `context.active` 中的 edge。

最终规则：

```ts
if (context.active.has(edgeId)) {
  return undefined
}
```

这条规则必须放在 editor-scene render model 层，而不是 React 层。React 不应该知道哪些 edge 是 “临时 static 排除”。

### 4. Static view 改成 merged path

删除旧的 `EdgeStaticView.paths: readonly EdgeStaticPath[]` 作为主要渲染协议。

merged path 的合并边界不是“同一批 edge”，而是“完全相同 static presentation”。presentation key 必须覆盖：

- stroke color
- stroke width
- opacity
- dash
- start marker
- end marker

只有这些渲染语义完全一致的 edge 才能进入同一个 merged SVG `path`。

最终 `EdgeStaticView` 应表达成渲染友好的 chunk：

```ts
export interface EdgeStaticView {
  id: EdgeStaticId
  styleKey: string
  style: EdgeStaticStyle
  path: string
  masked: readonly EdgeStaticMaskedPath[]
}

export interface EdgeStaticMaskedPath {
  edgeId: string
  svgPath: string
}
```

含义：

- `path`: 当前 chunk 中所有无 mask edge 的合并 path，直接渲染成一个 SVG `path`。
- `masked`: 需要 label mask 的 edge，因为每条 edge 的 mask id 不同，保留单独 path。

React 渲染形态：

```tsx
<g data-static={staticId}>
  {item.path ? <path d={item.path} ... /> : null}
  {item.masked.map((path) => (
    <path
      key={path.edgeId}
      d={path.svgPath}
      mask={`url(#${readEdgeLabelMaskId(path.edgeId)})`}
      ...
    />
  ))}
</g>
```

大多数 edge 没有 label mask，所以几千条 edge 会从几千个 SVG path 降到几十个 chunk path。

### 4.1 Marker 处理原则

SVG marker 挂在整个 `<path>` 元素上。一个 merged path 内的所有 subpath 会共享同一组 `markerStart` / `markerEnd`。

示例：

```tsx
<path
  d="M 0 0 L 100 0 M 100 20 L 200 20"
  markerEnd="url(#arrow)"
/>
```

这个写法会让每个 subpath 都使用同一个 end marker。对同 marker edge 是正确的，对不同 marker edge 是错误的。

最终规则：

- marker 相同的 edge 可以合并。
- marker 不同的 edge 必须进入不同 static bucket。
- 无 marker、只有 start marker、只有 end marker、start/end marker 类型不同，都必须分开。
- static layer 默认不使用 path / polygon 手写模拟 marker。

不采用 marker path 模拟的原因：

- SVG marker 原生按 path tangent 定向，elbow / fillet / curve 的末端方向无需额外计算。
- 手写 marker 需要维护端点 tangent、marker geometry、strokeWidth、缩放、opacity、dash、start/end 差异。
- 手写 marker 会重新引入 per-edge DOM shape，抵消 merged path 的收益。

因此 `edgeApi.render.styleKey(edge.base.edge.style)` 或后续替代的 static presentation key 必须明确包含 marker 渲染语义。如果当前 styleKey 不能保证这一点，实施 Phase 4 时必须先修正 key，再合并 path。

### 5. Mask 信息进入 static build

static build 需要知道哪些 edge 有 mask。不要在 React 里用 `maskIds` 生成 `Set` 再传给所有 `EdgeStaticItem`。

最终应在 editor-scene render model 层完成：

- `patchRenderMasks()` 生成 `render.masks.ids/byId`。
- `patchRenderStatics()` 在构建 bucket 时读取当前 `working.render.masks.byId.has(edgeId)` 或等价的 mask index。
- 有 mask 的 edge 放入 `masked`。
- 无 mask 的 edge 合并进 `path`。

React 层只消费最终 view，不再做 mask 分类。

### 6. Active layer 显示完整 edge，不依赖 static layer

active edge 被 static layer 排除后，`EdgeActiveLayer` 必须渲染完整可见 edge，而不是只渲染 accent overlay。

最终 `EdgeActiveItem` 应渲染：

- base path：真实 edge 样式。
- optional accent path：selected / hovered / editing 时的强调描边。

这样 connected edge 在拖拽过程中从 static layer 移到 active layer 时不会消失，也不会依赖 static layer 的旧 path。

### 7. DOM 更新原则

拖拽 node 时，理想更新路径：

```text
state preview node changed
  -> graph affected connected edges changed
  -> activeEdgeIds includes connected edges
  -> static layer removes those connected edges once
  -> active layer updates connected edge paths every frame
  -> unrelated static chunks remain stable
```

高频帧里不应该发生：

- static ids 全量变化。
- static chunk 大量重建。
- static SVG 子树全量 React diff。
- 每条静态 edge 一个 DOM path。

## 实施方案

### Phase 1: 重定义 active edge 语义

修改：

- `whiteboard/packages/whiteboard-editor-scene/src/projection/runtimeFacts.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/facts.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/render/context.ts`

要求：

- `activeEdgeIds` 包含 selection / hover / edit / 当前交互影响边。
- node drag / transform / mindmap drag 时，从 `edgeIdsByNode` 收集 connected edges。
- active edge 的事实只在 editor-scene 层生成，React 不做补算。

删除：

- 任何只把 selected / hover / editing 当作 active 的隐式假设。

### Phase 2: static bucket 排除 active edges

修改：

- `whiteboard/packages/whiteboard-editor-scene/src/model/render/statics.ts`

要求：

- `readRenderableEdge()` 或 `buildStaticBucket()` 接收 active set。
- active edge 不进入 `styleKeyByEdge` / `edgeIdsByStyleKey` / `staticIdByEdge` / static chunk。
- 当 edge 从 active 回到 static 时，static state 正确补回。
- 当 edge 从 static 进入 active 时，static state 正确删除。

不保留旧逻辑开关。

### Phase 3: active layer 渲染完整 edge

修改：

- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeActiveLayer.tsx`
- `whiteboard/packages/whiteboard-editor-scene/src/model/render/active.ts`

要求：

- active item 始终渲染 base path。
- selected / hovered / editing 再额外渲染 accent path。
- connected edge 因拖拽进入 active 时必须可见。
- mask 仍正确应用。

### Phase 4: static view 合并 path

修改：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/render.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/state.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/render/statics.ts`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeStaticLayer.tsx`

要求：

- 删除 `EdgeStaticPath` 作为主要协议。
- `EdgeStaticView` 改为 `{ path, masked }`。
- static bucket key 必须包含 marker start/end 渲染语义。
- 不同 marker 的 edge 不得合并到同一个 `path`。
- 无 mask edge 合并成 chunk-level `path`。
- masked edge 单独保留。
- `isStaticViewEqual()` 对 `path` 和 `masked` 做稳定比较。
- React 层不再 `item.paths.map()` 全量渲染普通 edge。

### Phase 5: 删除 React 层 mask 分类

修改：

- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeStaticLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeSceneLayer.tsx`

要求：

- `EdgeStaticLayer` 不再订阅 `render.edge.masks.ids`。
- 不再构造 `maskedEdgeIds`。
- 不再把 `maskedEdgeIds` 作为 prop 传入所有 static item。
- static item 只按 `EdgeStaticView` 渲染。

### Phase 6: 调整 tests 和性能用例

必须补充或更新测试：

- 大量 static edge 中，拖拽一个 node 时，只 connected edges 进入 active layer。
- active edge 从 static 排除后仍可见。
- 交互结束后 active edge 回到 static layer。
- label mask edge 不进入 merged `path`，仍单独带 mask 渲染。
- 无 mask edges 合并 path 后 DOM path 数显著下降。
- marker 不同的 edge 会生成不同 merged path，不发生 marker 串用。

建议增加一个轻量性能断言或结构断言：

- 1000 条无 label edge，同 style 下 `EdgeStaticLayer` 普通 path 数应接近 chunk 数，而不是 1000。
- 拖拽一个只有 3 条 connected edges 的 node，static chunk 不应每帧更新全量 path。

## 删除要求

必须删除：

- `EdgeStaticLayer` 中普通 edge 的 `item.paths.map()` 渲染方式。
- React 层 `maskedEdgeIds` 分类逻辑。
- static layer 对交互中 connected edges 的高频更新。
- “selected / hover / editing 才是 active” 的旧心智。
- 任何兼容旧 `EdgeStaticView.paths` 的适配层。
- static layer 中用 path / polygon 手写模拟 marker 的默认实现。

不能保留：

- `paths` 和 `path/masked` 双协议。
- feature flag。
- fallback render path。
- 为旧 capture/store 结构保留的转换 helper。

## 最终完成标准

完成后应满足：

- 几千条 edge 中拖拽 node 时，projection apply 和 React commit 都接近受影响 edge 数量，而不是接近全量 edge 数量。
- static SVG DOM 节点数按 chunk 数增长，不按 edge 数增长。
- active SVG DOM 节点数按当前交互影响边增长。
- static layer 在 node drag 高频帧中基本稳定。
- edge label mask 仍正确。
- selected / hovered / editing edge 的强调效果不退化。
- 无第二套实现，无兼容层，无旧协议残留。

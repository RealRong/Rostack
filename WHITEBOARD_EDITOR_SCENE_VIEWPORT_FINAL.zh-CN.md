# WHITEBOARD_EDITOR_SCENE_VIEWPORT_FINAL

## 目标

把所有“依赖 viewport、但本质上是 scene 只读派生”的能力统一下沉到 `@whiteboard/editor-scene`。

最终边界固定为：

- `editor-scene` 拥有 `view()` 只读快照输入，以及全部 viewport 派生 scene query。
- `editor` 继续拥有 viewport runtime、commands、pointer/input 变换。
- `react` 继续拥有 DOM 事件、container rect、wheel/pan policy、CSS 渲染。

这里不做兼容设计，直接定义最终形态。

## 最终结论

`createEditorSceneRuntime(...)` 的 `view` 不要再有 `get()` 壳，直接就是函数：

```ts
createEditorSceneRuntime({
  ...,
  view: () => ({
    zoom,
    center,
    worldRect
  })
})
```

`editor-scene` 一旦已经能直接读到 `view()`，后续所有 `query.view.*` 都不应该再让调用方传 `zoom`、`center`、`worldRect`。

也就是说，下面这种形态是错误方向：

```ts
query.view.pick({
  point,
  zoom
})
```

最终必须变成：

```ts
query.view.pick({
  point
})
```

## 最终 API 设计

### 1. `editor-scene` runtime input

文件：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/createEditorSceneRuntime.ts`

新增并固定：

```ts
export interface SceneViewSnapshot {
  zoom: number
  center: Point
  worldRect: Rect
}

export type SceneViewInput = () => SceneViewSnapshot
```

`createEditorSceneRuntime(...)` 最终签名：

```ts
export const createEditorSceneRuntime = (input: {
  measure?: TextMeasure
  nodeCapability?: NodeCapabilityInput
  document?: {
    nodeSize: Size
  }
  view: SceneViewInput
}): Runtime
```

说明：

- 不要 `view.get()`
- 不要 `view.subscribe()`
- 不要把 viewport runtime 整个传给 `editor-scene`
- `editor-scene` 只拿同步 pull 型快照

### 2. `Query['view']`

文件：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`

最终定义：

```ts
export type SceneBackgroundView =
  | {
      type: 'none'
    }
  | {
      type: 'dot' | 'line'
      color: string
      step: number
      offset: Point
    }

view: {
  zoom(): number
  center(): Point
  worldRect(): Rect

  screenPoint(point: Point): Point
  screenRect(rect: Rect): Rect

  visible(
    options?: Parameters<SpatialRead['rect']>[1]
  ): ReturnType<SpatialRead['rect']>

  pick(input: {
    point: Point
    radius?: number
    kinds?: readonly ('node' | 'edge' | 'mindmap' | 'group')[]
    exclude?: Partial<{
      node: readonly NodeId[]
      edge: readonly EdgeId[]
      mindmap: readonly MindmapId[]
      group: readonly GroupId[]
    }>
  }): {
    rect: Rect
    target?: {
      kind: 'node'
      id: NodeId
    } | {
      kind: 'edge'
      id: EdgeId
    } | {
      kind: 'mindmap'
      id: MindmapId
    } | {
      kind: 'group'
      id: GroupId
    }
    stats: {
      cells: number
      candidates: number
      oversized: number
      hits: number
      latency: number
    }
  }

  background(): SceneBackgroundView
}
```

约束：

- `visible()` 直接使用当前 `view().worldRect`
- `pick()` 默认半径直接使用当前 `view().zoom`
- `screenPoint()` / `screenRect()` 返回的是 root container 本地坐标，不是浏览器全局 screen 坐标
- `background()` 返回 view model，不返回 CSS 字符串

### 3. `background()` 的最终语义

`background()` 负责把文档背景和 viewport 快照组合成 scene 可消费的只读模型：

```ts
query.view.background()
```

返回：

- `type`
- `color`
- `step`
- `offset`

其中：

- `step` 是屏幕像素步长
- `offset` 是屏幕像素偏移
- React 只负责把这个结果映射到 CSS `backgroundImage/backgroundSize/backgroundPosition`

这样 `Background.tsx` 不再自己拼：

- `resolveStep(zoom)`
- `center * zoom`
- 文档 background 默认色回退

这些都统一进入 `editor-scene.query.view.background()`

## 为什么 `view()` 保留 `center`

虽然 `visible()` / `pick()` / `screenPoint()` 主要依赖 `zoom + worldRect`，但 `center` 仍然应该保留在 `SceneViewSnapshot` 里，原因只有两个：

- `background()` 直接用 `center` 推导偏移最简单
- 后续 scene 级 viewport 派生如果需要“以视口中心为语义”的读，不需要再从 `worldRect` 反推

但这是 `view()` 的内部快照字段，不是 `query.view.*` 的调用参数。

结论：

- `SceneViewSnapshot` 保留 `center`
- `query.view.*` 不再接收 `center` / `zoom` / `worldRect`

## 哪些必须下沉到 `editor-scene`

这一类的判断标准只有一个：

“如果它依赖 viewport，但结果是 scene/document/render/query 的只读派生，而不是输入控制，那么它就归 `editor-scene.view`。”

### A. scene 可见项查询

当前位置：

- `whiteboard/packages/whiteboard-editor/src/scene/source.ts`

当前问题：

- `visible(rect, options)` 还在 editor 层传外部 rect
- editor 层自己做 worldRect cache

最终方案：

- 缓存与 worldRect 读取全部下沉到 `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`
- `editor/src/scene/source.ts` 不再维护 `rect + revision + kinds` 这一套 visible cache

最终调用：

```ts
controller.query.view.visible(options)
```

### B. scene pick 查询

当前位置：

- `whiteboard/packages/whiteboard-editor/src/scene/source.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`

当前问题：

- editor 层先读 `view.get().zoom`
- editor 层计算默认半径
- editor 层再把 `zoom` 传回 `query.view.pick(...)`

最终方案：

- 默认半径逻辑全部下沉到 `editor-scene`
- `query.view.pick(...)` 自己读取 `view().zoom`
- `editor/src/scene/source.ts` 只保留 frame-throttled 调度，不再做 viewport 数学

最终调用：

```ts
controller.query.view.pick({
  point,
  radius,
  kinds,
  exclude
})
```

### C. world -> screen 投影

当前重复位置：

- `whiteboard/packages/whiteboard-editor/src/session/source.ts`
- `whiteboard/packages/whiteboard-react/src/features/collab/PresenceLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/selection/chrome/SelectionToolbar.tsx`

最终方案：

- 统一改为：

```ts
query.view.screenPoint(point)
query.view.screenRect(rect)
```

这样 editor/react 不再自己重复写：

- `topLeft = worldToScreen(...)`
- `bottomRight = worldToScreen(...)`
- `rect.fromPoints(...)`

### D. background 只读模型

当前位置：

- `whiteboard/packages/whiteboard-react/src/canvas/Background.tsx`

当前问题：

- React 自己把 document background 和 viewport 派生糊在一起
- 这本质上是 scene read，不是 UI 私有逻辑

最终方案：

- 下沉到 `query.view.background()`
- `Background.tsx` 只做 CSS 映射

## 哪些不要下沉到 `editor-scene`

这部分必须明确，不然会把 `editor-scene` 又做成一个新的 viewport runtime。

### 1. viewport state runtime

保留在：

- `whiteboard/packages/whiteboard-editor/src/session/viewport.ts`

包括：

- `set`
- `panBy`
- `zoomTo`
- `fit`
- `reset`
- `setRect`
- `setLimits`

原因：

- 这是可变 runtime 和输入控制，不是 scene query

### 2. pointer / input 坐标变换

保留在：

- `whiteboard/packages/whiteboard-editor/src/session/viewport.ts`
- `whiteboard/packages/whiteboard-editor/src/session/read.ts`

包括：

- `pointer({ clientX, clientY })`
- `screenPoint(clientX, clientY)`
- `size()`

原因：

- 这些直接服务于 DOM 输入事件
- 不是 scene 派生读

### 3. wheel / pan policy 和 DOM 绑定

保留在：

- `whiteboard/packages/whiteboard-react/src/runtime/viewport/useBindViewportInput.ts`
- `whiteboard/packages/whiteboard-react/src/canvas/Surface.tsx`
- `whiteboard/packages/whiteboard-react/src/Whiteboard.tsx`

包括：

- container rect 采集
- min/max zoom policy
- wheel sensitivity
- enableWheel
- enablePan

原因：

- 这是 host policy，不是 scene 语义

### 4. scene/chrome DOM transform 和 CSS var

保留在：

- `whiteboard/packages/whiteboard-react/src/canvas/Surface.tsx`

包括：

- scene viewport transform 字符串
- chrome viewport transform 字符串
- `--wb-zoom`

原因：

- 这是 DOM 渲染策略
- 不应该让 `editor-scene` 输出 CSS 或 transform 字符串

### 5. 仅用于交互阈值或 DOM 呈现缩放的 zoom 读取

保留在 editor/react：

- `whiteboard/packages/whiteboard-editor/src/input/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/input/core/snap.ts`
- `whiteboard/packages/whiteboard-editor/src/input/features/**`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeOverlayLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/node/components/NodeTransformHandles.tsx`
- `whiteboard/packages/whiteboard-react/src/features/viewport/ViewportDock.tsx`

原因：

- 这些不是 scene query
- 要么是交互阈值
- 要么是 UI 呈现尺寸
- 不应该为了“都从 scene 读”而强行绕一圈

## editor 里可直接替代掉的 viewport 相关能力

下面这些应该直接替换，不需要保留旧 helper。

### 1. `whiteboard/packages/whiteboard-editor/src/scene/source.ts`

删除：

- `SceneViewRead`
- `view.get()`
- `DEFAULT_PICK_RADIUS_SCREEN / zoom` 计算
- visible 的外层 rect cache

改成：

- `host.visible(options)` 直接调用 `controller.query.view.visible(options)`
- `host.pick` 的 resolve 阶段直接调用 `controller.query.view.pick(...)`

保留：

- frame-throttled pick 调度
- pick runtime 订阅/clear/dispose

### 2. `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`

当前：

```ts
view: {
  get: () => ({
    zoom: session.viewport.read.get().zoom,
    worldRect: session.viewport.read.worldRect()
  })
}
```

最终：

```ts
view: () => {
  const viewport = session.viewport.read.get()
  return {
    zoom: viewport.zoom,
    center: viewport.center,
    worldRect: session.viewport.read.worldRect()
  }
}
```

### 3. `whiteboard/packages/whiteboard-editor/src/session/source.ts`

删除本地重复 helper：

- `projectWorldRect(...)`

改成：

- `graph.query.view.screenRect(marquee.worldRect)`

这会直接替代 `chromeMarquee` 那里的 world-to-screen 派生。

### 4. `whiteboard/packages/whiteboard-react/src/canvas/Background.tsx`

删除本地派生：

- `resolveStep(zoom)`
- `offsetX = center.x * zoom`
- `offsetY = center.y * zoom`
- 文档背景默认色回退逻辑

改成：

- 渲染阶段读取 `editor.scene.query.view.background()`
- 只把结果映射成 CSS 样式

### 5. `whiteboard/packages/whiteboard-react/src/features/collab/PresenceLayer.tsx`

删除本地 helper：

- `toScreenRect(...)`
- 直接 `editor.session.viewport.worldToScreen(...)`

改成：

- `editor.scene.query.view.screenRect(item.bounds)`
- `editor.scene.query.view.screenRect(edge.box.rect)`
- `editor.scene.query.view.screenPoint(peer.pointer.world)`

### 6. `whiteboard/packages/whiteboard-react/src/features/selection/chrome/SelectionToolbar.tsx`

当前：

- 通过 `editor.session.viewport.worldToScreen` 构造回调

最终：

- 改成 `editor.scene.query.view.screenPoint`

这样 toolbar 只消费 scene view projection，不再直接依赖 viewport runtime。

## editor 内仍然需要保留但必须去重的点

这些不是都能直接下沉到 `editor-scene`，但旧 helper 仍然应该清掉重复实现。

### 1. `whiteboard/packages/whiteboard-editor/src/session/preview/selection.ts`

当前有一份：

- `projectWorldRect(viewport, worldRect)`

这个文件属于 input preview 侧，不一定总是拿得到 `graph.query`，所以它不强制迁到 `editor-scene.query.view`。

但它必须改成复用同一个底层 primitive，目标代码放在：

- `whiteboard/packages/whiteboard-core/src/geometry/viewport.ts`

新增纯函数：

```ts
viewport.projectPoint(point, view)
viewport.projectRect(rect, view)
```

其中 `view` 只需要：

```ts
{
  zoom: number
  worldRect: Rect
}
```

然后：

- `editor-scene.query.view.screenPoint/screenRect` 复用这个 primitive
- `session/preview/selection.ts` 也复用这个 primitive

这样保留正确边界，同时删掉重复数学实现。

## 最终迁移清单

### 阶段 1. `editor-scene` 拿到 `view()`

修改：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/createEditorSceneRuntime.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`

动作：

- 新增 `SceneViewSnapshot`
- 新增 `SceneViewInput`
- `createEditorSceneRuntime(...)` 必填 `view`
- `createEditor(...)` 直接传 `view: () => ({ zoom, center, worldRect })`

### 阶段 2. 重写 `query.view`

修改：

- `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`

动作：

- `visible(rect, options)` 改成 `visible(options)`
- `pick({ point, zoom, ... })` 改成 `pick({ point, radius?, kinds?, exclude? })`
- 新增 `zoom()`
- 新增 `center()`
- 新增 `worldRect()`
- 新增 `screenPoint()`
- 新增 `screenRect()`
- 新增 `background()`

### 阶段 3. 删除 editor 层 viewport 派生包装

修改：

- `whiteboard/packages/whiteboard-editor/src/scene/source.ts`

动作：

- 删除 `SceneViewRead`
- 删除 `view.get()` 用法
- 删除外层 visible cache
- 删除外层默认 pick radius 计算
- 只保留 frame-throttled pick orchestration

### 阶段 4. 替换 editor/react 调用方

修改：

- `whiteboard/packages/whiteboard-editor/src/session/source.ts`
- `whiteboard/packages/whiteboard-react/src/canvas/Background.tsx`
- `whiteboard/packages/whiteboard-react/src/features/collab/PresenceLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/selection/chrome/SelectionToolbar.tsx`

动作：

- `projectWorldRect` -> `query.view.screenRect`
- `worldToScreen` -> `query.view.screenPoint`
- Background 派生 -> `query.view.background()`

### 阶段 5. 删掉剩余重复数学 helper

修改：

- `whiteboard/packages/whiteboard-core/src/geometry/viewport.ts`
- `whiteboard/packages/whiteboard-editor/src/session/preview/selection.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/read.ts`

动作：

- 新增 `viewport.projectPoint(...)`
- 新增 `viewport.projectRect(...)`
- `session/preview/selection.ts` 改为复用 core primitive
- `editor-scene.query.view.screenPoint/screenRect` 改为复用 core primitive

## 最终态判断标准

做到下面这些，才算这条线真正收干净：

- `editor-scene` 创建时接收 `view()`，不是 `view.get()`
- `query.view.pick(...)` 不再接收 `zoom`
- `query.view.visible(...)` 不再接收 `rect`
- `Background.tsx` 不再自己派生 viewport 背景参数
- `scene/source.ts` 不再做 viewport 数学
- editor/react 不再自己重复写 world-to-screen rect 投影
- input preview 中剩余的 viewport 投影数学全部复用 `whiteboard-core` primitive

## 一句话结论

长期最优不是“所有 viewport 能力都塞进 `editor-scene`”，而是：

- 把 viewport 的可变 runtime 留在 `editor`
- 把 viewport 的 scene 只读派生统一收进 `editor-scene.query.view`
- 把剩余纯数学投影统一收进 `whiteboard-core/geometry.viewport`

这样边界最清楚，调用方最少，后续继续做 scene query、pick、background、overlay 性能优化时也不会再到处重复读 viewport。

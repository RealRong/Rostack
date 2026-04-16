# WHITEBOARD Edge Handle Visibility 最终架构

## 1. 结论

Edge label 进入编辑态时，应该隐藏当前选中 edge 的：

- route handles
- source handle
- target handle

这件事不应放到 React 侧临时判断，也不应塞进通用的 `interaction.chrome`。

最终方案如下：

- `canEditRoute / canReconnectSource / canReconnectTarget` 继续只表示能力，不掺杂临时显示语义
- editor 侧新增单一 selected-edge chrome query
- 这个 query 统一产出当前单选 edge 的 overlay/presentation 数据
- 在该 query 内部新增一个最小布尔值：`showEditHandles`
- `showEditHandles` 同时控制 route handles 和 source/target handles
- React 只消费 query 结果，不再自己组合 `selection / edit / interaction / capability`

一句话总结：

- capability 解决“能不能做”
- chrome presentation 解决“现在要不要显示”

## 2. 当前问题

当前实现里，edge handles 的显示语义被拆散在两层：

- editor 的交互聚合态 `interaction.editingEdge`
- React 的 `useSelectedEdgeView`

现状问题：

- [state.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/editor/state.ts) 里的 `editingEdge` 是从 `interaction.mode` 推出来的粗粒度状态，包含：
  - `edge-drag`
  - `edge-label`
  - `edge-connect`
  - `edge-route`
- [EdgeOverlayLayer.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeOverlayLayer.tsx) 直接用 `!interaction.editingEdge` 决定是否显示 edge controls
- [presentation.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/query/selection/presentation.ts) 隐藏 selection toolbar 时，又单独看 `edit?.kind === 'edge-label'`
- [useEdgeView.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/hooks/useEdgeView.ts) 还在 React 侧拼装 selected edge 的 route points 和 capability

结果就是：

- toolbar 和 edge handles 不一定使用同一套语义来源
- “正在编辑 label” 是 edit session 语义，但当前 route handles 却吃 interaction 语义
- React 必须自己猜“什么情况下应该隐藏 handles”
- 未来继续加 edge chrome 时，会继续分散

## 3. 为什么不能放到 `interaction.chrome`

`interaction.chrome` 是更高层的全局开关，不适合承载“当前选中 edge 的 edit handles 是否显示”。

原因：

- 它影响范围太大
- 它服务的是整体交互 chrome，而不是某个 edge 的局部 overlay
- 一旦挂进去，会连 selection toolbar、别的 overlay、别的交互辅助也一起受影响

这里的目标不是“全局隐藏 chrome”，而是：

- 仅在 `edge-label` edit session 命中当前 selected edge 时
- 关闭该 edge 的 edit handles

这是局部 presentation 规则，不是全局 interaction 规则。

## 4. 为什么不能复用 capability

这些字段：

- `canEditRoute`
- `canReconnectSource`
- `canReconnectTarget`

本质上都是 capability。

它们回答的是：

- 这个 edge 当前是否允许编辑路由
- 是否允许重连 source/target

但 label 编辑态下隐藏 handles，并不意味着 capability 消失。

例如：

- edge 没锁
- source/target 也没锁
- route 理论上可编辑

这时进入 label 编辑态，只是为了减少视觉冲突和误操作，暂时不显示 handles。退出编辑态以后，这些能力仍然存在。

所以不能把“临时隐藏”写成：

- `canEditRoute = false`
- `canReconnectSource = false`
- `canReconnectTarget = false`

否则就会污染 capability 语义。

## 5. 为什么不能依赖“`edit.edgeId` 必定等于 selected edge”

当前交互路径里，这个假设通常成立。

例如 [session.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/edge/label/session.ts) 在开始 label 编辑时，会先：

```ts
ctx.local.session.selection.replace({
  edgeIds: [input.edgeId]
})
ctx.local.edit.startEdgeLabel(input.edgeId, input.labelId, ...)
```

所以在当前 UX 下：

- 开始编辑 label 时通常会变成单选该 edge

但是这不应该被当作底层不变量。

原因：

- `selection` 和 `edit` 是两套独立状态
- 现在只是某条交互路径里人为保持同步
- 以后只要 selection 变化入口增多，这个假设就可能不再稳定

所以最稳妥的做法不是把这个假设泄漏给 React，而是让 editor query 内部自己比较：

```ts
edit.kind === 'edge-label'
&& edit.edgeId === selectedEdgeId
```

这个比较应该保留，但只保留在 editor 内部。

## 6. 最终模型

### 6.1 单一语义

最简单的长期模型不是：

- `showRouteHandles`
- `showSourceHandle`
- `showTargetHandle`

三套布尔值先都拆开。

因为当前需求里，这三者在 label 编辑态下的开关语义完全一致：

- 要么都显示
- 要么都隐藏

所以最小模型只需要一个字段：

```ts
showEditHandles: boolean
```

它的含义是：

- 当前 selected edge 的编辑型 handles 是否显示

这里的“编辑型 handles”统一指：

- route handles
- source handle
- target handle

### 6.2 语义分层

最终 selected edge chrome 应拆为两层：

```ts
type SelectedEdgeChrome = {
  edgeId: EdgeId
  ends: EdgeView['ends']
  routePoints: readonly SelectedEdgeRoutePointView[]
  canEditRoute: boolean
  canReconnectSource: boolean
  canReconnectTarget: boolean
  showEditHandles: boolean
}
```

语义说明：

- `can*` 字段：能力
- `showEditHandles`：当前 display/presentation

React 侧的渲染规则保持非常简单：

```ts
showSourceHandle = showEditHandles && canReconnectSource
showTargetHandle = showEditHandles && canReconnectTarget
showRouteHandles = showEditHandles && canEditRoute
```

## 7. 最终 Query 位置

不建议继续把 selected edge view 拼装留在 React hook 里。

当前 [useEdgeView.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/hooks/useEdgeView.ts) 其实已经承担了半个 presentation query 的职责：

- 读取 selection
- 判断是不是单选 edge
- 读取 edge capability
- 构建 routePoints

这部分长期应该回收到 editor query 层。

建议新增 editor query：

```ts
EditorQueryRead['edge']['selectedChrome']
```

或同等语义的命名，只要满足：

- owner 在 editor
- React 只读结果
- 不再在 React hook 里拼 selected edge overlay

推荐 API：

```ts
export type SelectedEdgeChrome = {
  edgeId: EdgeId
  ends: EdgeView['ends']
  routePoints: readonly SelectedEdgeRoutePointView[]
  canEditRoute: boolean
  canReconnectSource: boolean
  canReconnectTarget: boolean
  showEditHandles: boolean
}

export type EdgePresentationRead = {
  ...
  selectedChrome: ReadStore<SelectedEdgeChrome | undefined>
}
```

说明：

- 只在“当前是单选 edge”时返回值
- 否则返回 `undefined`
- 这样 React overlay 层不需要自己再判断 selection 结构

## 8. `showEditHandles` 的计算规则

最终规则应集中在 editor query 内部：

```ts
const selectedEdgeId =
  selection.nodeIds.length === 0 && selection.edgeIds.length === 1
    ? selection.edgeIds[0]
    : undefined

const editingThisSelectedEdge =
  edit?.kind === 'edge-label'
  && edit.edgeId === selectedEdgeId

const showEditHandles =
  Boolean(selectedEdgeId)
  && interactionChrome
  && tool.type === 'select'
  && !editingThisSelectedEdge
```

如果后面仍然要保留对 `edge-route / edge-connect / edge-drag` 的隐藏逻辑，也应继续在这个 query 内部统一合并，而不是回到 React 上做散装判断。

例如：

```ts
const blockedByInteraction =
  interactionMode === 'edge-route'
  || interactionMode === 'edge-connect'
  || interactionMode === 'edge-drag'

const showEditHandles =
  Boolean(selectedEdgeId)
  && interactionChrome
  && tool.type === 'select'
  && !blockedByInteraction
  && !editingThisSelectedEdge
```

关键点是：

- 所有“是否显示 edge edit handles”的规则都必须聚合到同一个 query 里

## 9. React 侧最终职责

[EdgeOverlayLayer.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeOverlayLayer.tsx) 最终应该退化成纯渲染器。

它不应该再自己判断：

- `interaction.editingEdge`
- `selection.edgeIds.length === 1`
- `edit.kind === 'edge-label'`

最终职责只剩下：

- 读 `editor.read.edge.selectedChrome`
- 读 `editor.read.chrome.edgeGuide`
- 渲染 selected edge handles
- 渲染 edge preview/hint

也就是说：

- React 负责画
- editor 负责决定“该不该画”

## 10. 删除与收敛

完成后，应收敛这些旧职责：

- [useEdgeView.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/hooks/useEdgeView.ts) 不再负责拼 selected edge chrome 语义
- [EdgeOverlayLayer.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeOverlayLayer.tsx) 不再直接依赖 `interaction.editingEdge`
- [state.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/editor/state.ts) 中的 `editingEdge` 可以继续给别的 UI 使用，但不再作为 edge handles 显示语义的 owner

## 11. 为什么这是“最简单的最终方案”

这个方案简单，原因在于它只新增了一层最小语义，而没有继续发散：

- 不新增全局 chrome 开关
- 不污染 capability
- 不让 React 继续猜状态
- 不先拆三套 `showRouteHandles / showSourceHandle / showTargetHandle`
- 不依赖“当前实现里碰巧成立”的 selection/edit 同步假设

新增的真正核心只有一个：

```ts
showEditHandles: boolean
```

但它被放在正确的位置：

- editor 的 selected-edge chrome query

这就是长期最优的最小模型。

## 12. 最终判断标准

完成后应满足以下标准：

- 进入 edge label 编辑态时，当前 selected edge 的 route/source/target handles 一起消失
- 退出 edge label 编辑态后，handles 自动恢复
- capability 查询不受影响，`canEditRoute / canReconnect*` 不因为 label 编辑而变成 `false`
- React overlay 不再直接拼装 label 编辑态和 edge handle 显示语义
- 所有 edge handle visibility 规则都能在 editor query 的一个位置找到

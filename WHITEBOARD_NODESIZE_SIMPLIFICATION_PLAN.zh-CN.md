# WHITEBOARD_NODESIZE_SIMPLIFICATION_PLAN

## 结论

这件事有必要做，而且现在应该做。

原因不是某个局部性能热点必须依赖它，而是 `nodeSize` 还在同时承担两种不同职责：

1. committed node geometry 的兜底尺寸
2. edge connect 的交互 query heuristic

这两种职责混在一起，导致 `nodeSize` 从 `whiteboard-core` 一路泄漏到 `intent / document / editor-scene / editor input`，让整条 read / geometry / interaction 链都不干净。

最终目标不是“继续换个地方传 `nodeSize`”，而是：

1. committed `Node` 必须始终具备稳定 `size`
2. committed geometry / document read 不再依赖 `nodeSize` fallback
3. edge connect 单独使用 `connectQueryRadius`

## 当前问题

### 1. committed geometry 还依赖 `nodeSize`

当前至少这些链路仍然把 `nodeSize` 当成 committed geometry fallback：

1. `whiteboard/packages/whiteboard-core/src/node/document.ts`
2. `whiteboard/packages/whiteboard-core/src/document/slice.ts`
3. `whiteboard/packages/whiteboard-core/src/node/move.ts`
4. `whiteboard/packages/whiteboard-core/src/node/moveState.ts`
5. `whiteboard/packages/whiteboard-core/src/node/ops.ts`
6. `whiteboard/packages/whiteboard-editor-scene/src/model/document/resolver.ts`
7. `whiteboard/packages/whiteboard-editor-scene/src/runtime/createEditorSceneRuntime.ts`

这意味着：

1. committed node 本身不是完整几何实体
2. document/query/scene 拿到的几何并不一定来自真实节点数据
3. 下游无法区分“真实 size”与“fallback size”

### 2. edge connect 的 heuristic 还复用 `nodeSize`

当前 edge connect broad-phase query 仍然通过 `nodeSize` 做搜索尺度估计，主要链路：

1. `whiteboard/packages/whiteboard-core/src/edge/connect.ts`
2. `whiteboard/packages/whiteboard-editor/src/input/core/snap.ts`

这个依赖是真实存在的，但它不属于 committed geometry。

它应该被单独命名为：

1. `connectQueryRadius`

而不是继续伪装成“节点默认尺寸”。

### 3. 上下游职责被污染

因为 `nodeSize` 同时承担 committed geometry fallback 和 interaction heuristic：

1. `intent` handler 继续透传 `nodeSize`
2. `editor-scene` runtime 继续要求 `document.nodeSize`
3. `document resolver` 继续需要外部尺寸上下文
4. input snap runtime 继续把 interaction heuristic 绑定到 node geometry config

这会持续阻碍后续的：

1. document read 收敛
2. scene query 收敛
3. core geometry primitive 收敛

## 最终 API 设计

### 1. committed `Node` 语义

最终语义：

1. `NodeInput` 可以缺 `size`
2. `NodeTemplate` 可以缺 `size`
3. committed `Node` 必须有 `size`

也就是说：

1. 补尺寸只允许发生在 write / import / migration 入口
2. 一旦进入 committed document，`node.size` 就是稳定字段

### 2. committed geometry API

最终 committed geometry 不再接收 `nodeSize` fallback 参数。

收敛目标：

```ts
resolveDocumentNodeGeometry(input: {
  node: Node
}): ResolvedDocumentNodeGeometry
```

```ts
document.nodeGeometry(nodeId: NodeId): DocumentNodeGeometry | undefined
```

```ts
node.geometry.rect(node: Node): Rect
node.geometry.bounds(node: Node): Rect | undefined
```

约束：

1. 这些 API 只接受完整 committed node
2. 如果调用方处理的是未规范化输入，必须在进入 geometry 之前先 bootstrap / normalize

### 3. interaction heuristic API

edge connect 从 `nodeSize` 脱钩，最终单独使用：

```ts
type EdgeConnectConfig = {
  ...
  connectQueryRadius: number
}
```

或等价地放在单独 interaction config 中，但最终对外语义必须是：

1. `connectQueryRadius`

它只表达：

1. pointer 附近做 edge connect candidate broad-phase query 的搜索半径

它不再表达：

1. 节点默认尺寸
2. document geometry fallback

## 实施方案

### 阶段 1. 收紧 committed `Node`

必须修改的地方：

1. 收紧 `whiteboard/packages/whiteboard-core/src/types` 中 `Node` 的定义，让 committed `Node.size` 变成必填
2. 保持 `NodeInput` / `NodeTemplate` / template seed 输入层的 `size` 可选
3. 在所有 node create / duplicate / import / slice insert / collab restore 入口补齐 `size`
4. 对历史文档进入 runtime 时做一次 normalize，确保 snapshot 中不再出现缺失 `size` 的 committed node

完成标志：

1. committed document snapshot 中不允许存在 `size === undefined` 的 node

### 阶段 2. 删除 committed geometry fallback

必须修改的地方：

1. 修改 `whiteboard/packages/whiteboard-core/src/node/document.ts`，删除 `nodeSize` 参数
2. 修改 `whiteboard/packages/whiteboard-editor-scene/src/model/document/resolver.ts`，删除 `nodeSize` 依赖
3. 修改 `whiteboard/packages/whiteboard-editor-scene/src/runtime/createEditorSceneRuntime.ts`，删除 `document.nodeSize`
4. 修改 `whiteboard/packages/whiteboard-core/src/document/slice.ts`，所有 geometry 读取改为直接基于 committed `Node`
5. 修改 `whiteboard/packages/whiteboard-core/src/node/move.ts`
6. 修改 `whiteboard/packages/whiteboard-core/src/node/moveState.ts`
7. 修改 `whiteboard/packages/whiteboard-core/src/node/ops.ts`
8. 修改 `whiteboard/packages/whiteboard-core/src/intent/handlers/document.ts`
9. 修改 `whiteboard/packages/whiteboard-core/src/intent/handlers/node.ts`
10. 修改 `whiteboard/packages/whiteboard-core/src/intent/handlers/canvas.ts`
11. 修改所有仍然要求 `nodeSize` 才能读取 committed geometry 的 helper

完成标志：

1. committed geometry / document read / scene resolver 全部不再接收 `nodeSize`

### 阶段 3. 把 edge connect 改成 `connectQueryRadius`

必须修改的地方：

1. 修改 `whiteboard/packages/whiteboard-core/src/edge/connect.ts`
2. 修改 `whiteboard/packages/whiteboard-editor/src/input/core/snap.ts`
3. 修改 `whiteboard/packages/whiteboard-core/src/config/index.ts`
4. 修改 `whiteboard/packages/whiteboard-editor/src/input/runtime.ts`
5. 删除 edge connect 对 `nodeSize` 的依赖
6. broad-phase candidate rect 统一改为基于 `connectQueryRadius + zoom`

最终形态示意：

```ts
edge.connect.queryRect(
  pointWorld,
  zoom,
  {
    ...config,
    connectQueryRadius
  }
)
```

完成标志：

1. input snap runtime 不再传入 `edge.nodeSize`
2. edge connect broad-phase 只依赖 `connectQueryRadius`

### 阶段 4. 清理剩余噪音

必须修改的地方：

1. 删除所有只为 committed geometry fallback 存在的 `nodeSize` 参数
2. 删除 `editor-scene` 中无意义的 `document.nodeSize` runtime 配置
3. 删除 `intent context` 中只为 committed geometry fallback 透传的 `nodeSize`
4. 保留真正需要的 bootstrap config，但命名明确为 bootstrap 语义

完成标志：

1. `nodeSize` 不再作为全局上下文参数在 `core -> intent -> scene -> input` 透传

## 不做的事情

这份方案不处理下面这些问题：

1. node draft measure
2. viewport query / scene query 收敛
3. spatial index 重构
4. edge render / edge hit 基础设施

这些与本方案有关联，但不是同一个任务。

## 验收标准

完成后必须同时满足：

1. committed `Node.size` 为必填
2. `editor-scene` runtime 不再接收 `document.nodeSize`
3. `resolveDocumentNodeGeometry(...)` 不再接收 `nodeSize`
4. `document/slice/move/ops/intent` 不再为 committed geometry 透传 `nodeSize`
5. edge connect 不再复用 `nodeSize`
6. edge connect 改为 `connectQueryRadius`
7. grep 不再出现“为了 committed geometry fallback 透传 `nodeSize`”这类旧实现

## 结论

这份方案仍然值得做，但应该按最终态直接做，不要做局部 patch。

真正要解决的是这三个点：

1. committed `Node` 必须完整
2. committed geometry 必须纯
3. edge connect heuristic 必须独立成 `connectQueryRadius`

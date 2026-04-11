# WHITEBOARD_EDITOR_READ_BOUNDARY_CONSOLIDATION_PLAN

## 背景

当前 `whiteboard-editor` 存在一类重复出现的边界问题:

- editor 一部分逻辑通过 `read.node.*` / `read.edge.*` 读取派生状态
- 另一部分逻辑又直接消费 `engine.read.index.*`
- 还有一些地方会绕过现有 read API，基于 `item` 本地重建 geometry / bounds / snapshot

这会导致同一份语义在多个位置各自拼装，形成三类后果:

- 同一概念出现两套来源，后续容易漂移
- editor 的命名空间边界被打穿，交互层和 query 层知道太多底层实现
- 一旦 geometry / bounds 的计算规则发生变化，需要到多个位置同步修改

长期最优不是继续补零散 helper，而是把 editor 的读模型收成唯一入口，让 editor 侧不再直接消费 `read.index`，也不再本地重建别的命名空间已经拥有的派生数据。

## 当前确认的问题点

### 1. `runtime/read/edge.ts`

文件:

- [edge.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/edge.ts#L63)

问题:

- `toNodeCanvasSnapshot(item)` 基于 `NodeItem` 本地计算 `geometry`
- `createEdgeResolvedStore` 内部依赖这个本地拼装结果喂给 `resolveEdgeView`
- `connectCandidates` 又直接读 `read.index.node`

这说明 `edge` 命名空间内部对 “node canvas snapshot” 没有唯一来源。

当前表现:

- edge 正式渲染走一套 node snapshot 构造路径
- edge connect preview 又走另一套路径
- connect candidates 直接绕过 `node` 命名空间去读 index

结论:

- 这是明确的边界泄漏
- 应由 `node` 命名空间提供 edge 可消费的 canvas snapshot

### 2. `runtime/query/targetBounds.ts`

文件:

- [targetBounds.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/query/targetBounds.ts#L19)

问题:

- node bounds 通过 `getNodeItemBounds(item)` 本地推导
- edge bounds 通过 `getEdgePathBounds(resolved.path)` 本地推导

`targetBounds` 本来应该只是聚合器，但现在知道:

- node bounds 从什么结构推导
- edge bounds 从什么结构推导

结论:

- 这是 query 层越界掌握派生规则
- 应改成只消费 `read.node.bounds` 和 `read.edge.bounds`

### 3. `interactions/edge/connect.ts`

文件:

- [connect.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/connect.ts#L246)

问题:

- `readNodeSnapshot` 直接从 `ctx.read.index.node.get(nodeId)` 读取 `{ node, geometry }`
- 这与 `runtime/read/edge.ts` 里的 `toNodeCanvasSnapshot` 是同一概念的另一套实现

结论:

- edge preview path 不应自己决定 node snapshot 的来源
- 应直接复用 `ctx.read.node.canvas`

### 4. `interactions/transform.ts`

文件:

- [transform.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/transform.ts#L94)

问题:

- `readTransformTarget` 直接读取 `ctx.read.index.node.get`
- `readNodeTransformSpec` 也直接依赖 `index.node`

这比 `edge.ts` 轻一点，因为 transform 本来就在交互层，但它依然在绕过 `node` 命名空间直接消费 engine 内部 projection/index。

结论:

- transform 应消费 `read.node.canvas` 或 `read.node.transformTarget`
- 不应自己依赖 `read.index.node`

### 5. `interactions/selection/move.ts`

文件:

- [move.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/selection/move.ts#L76)

问题:

- `startMoveState` 的 node 输入来自 `ctx.read.index.node.all().map((entry) => entry.node)`

这不如 geometry 重建那么严重，但它依然暴露了 editor 对 `index` 的直接依赖。

结论:

- 应逐步替换成 `read.node.ordered()` 或等价的 editor 读口

### 6. `runtime/document/mindmap.ts`

文件:

- [mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/document/mindmap.ts#L59)

问题:

- `readNodePosition` 通过 `editor.read.index.node.get(nodeId)?.node` 获取 node

这是轻度问题，因为这里只是在读 node.position，不涉及 geometry 算法重复实现。

结论:

- 应切回 `editor.read.node.item.get(nodeId)?.node`
- editor 层不需要为这类读取暴露 `index`

## 根因

editor read 当前是这样构造的:

- [runtime/read/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/index.ts#L34)
- [runtime/read/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/index.ts#L147)

其中 `RuntimeRead = Omit<EngineRead, 'node' | 'edge'> & { ... }`，因此 `index` 被一起继承到 editor public read 面；随后 `createRead()` 又直接把 `engineRead.index` 暴露出去。

与此同时，engine 内部其实已经有统一的 node geometry 读模型:

- [engine read store index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/read/store/index.ts#L120)
- [engine instance.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/types/instance.ts#L64)

也就是说，问题不是底层没有规范化 geometry，而是 editor 层没有把自己的命名空间 read 收成唯一消费面。

## 最终原则

### 原则 1

editor 层不再公开 `read.index`

`index` 是 engine 内部 projection / spatial index 细节。editor 可以在自身构建 read 时依赖 engine 提供的公开读能力，但不应该把 engine 的内部索引再次公开给上层交互、query、document runtime。

### 原则 2

每个命名空间只暴露自己的派生结果，不暴露让别人自己拼派生结果所需的底层碎片。

例子:

- `node` 负责提供 canvas snapshot / bounds
- `edge` 负责提供 resolved view / bounds
- `targetBounds` 只做聚合，不再知道 node/edge 的推导规则

### 原则 3

交互层只消费 editor read，不直接消费 engine 内部 projection/index。

## 最终 API 设计

目标:

- 命名短
- 语义稳定
- 不暴露 engine 内部实现细节

### `read.node`

保留:

- `item(): KeyedReadStore<NodeId, NodeItem | undefined>`
- `view(): KeyedReadStore<NodeId, NodeView | undefined>`
- `capability(): (node) => NodeCapability`
- `idsInRect(rect, options)`
- `transformTargets(nodeIds)`

新增:

- `canvas(): KeyedReadStore<NodeId, NodeCanvasSnapshot | undefined>`
- `bounds(): KeyedReadStore<NodeId, Rect | undefined>`
- `rect(): KeyedReadStore<NodeId, Rect | undefined>`

说明:

- `NodeCanvasSnapshot` 语义就是 edge/transform/connect 需要消费的 `{ node, geometry }`
- `rect` 和 `bounds` 进入 keyed reactive store 以后，query / selection / toolbar 可以统一追踪

推荐类型:

```ts
type NodeCanvasSnapshot = {
  node: Node
  geometry: NodeGeometry
}
```

### `read.edge`

保留:

- `item(): KeyedReadStore<EdgeId, EdgeItem | undefined>`
- `resolved(): KeyedReadStore<EdgeId, EdgeResolved | undefined>`
- `view(): KeyedReadStore<EdgeId, EdgeView | undefined>`
- `related(nodeIds)`
- `capability(edge)`

新增:

- `bounds(): KeyedReadStore<EdgeId, Rect | undefined>`

简化:

- `box(edgeId)` 可以继续存在，如果它是纯 UI hit box 语义
- 但 selection/query/group 这类几何聚合都应改用 `edge.bounds`

### `read.mindmap`

保留:

- `item()`
- `view()`

不新增 geometry 类兼容接口，除非未来 mindmap 的 bounds 也需要被多处聚合使用；到那时再补 `mindmap.bounds()`，不要提前暴露。

### `read.selection`

不新增跨命名空间派生逻辑，继续只消费其他 read。

### 删除的旧入口

必须删除:

- `editor.read.index`

可以同步收掉的旧函数 / 用法:

- `runtime/read/edge.ts` 里的 `toNodeCanvasSnapshot`
- `runtime/query/targetBounds.ts` 里本地 `readNodeBounds` / `readResolvedEdgeBounds`
- 所有 `ctx.read.index.node.get(...)`
- 所有 `ctx.read.index.node.all(...)`

## 替换策略

### 第一阶段: 收口公共读面

目标:

- 先把 editor 的唯一读入口搭出来

动作:

- 在 `runtime/read/node.ts` 中新增 `canvas` keyed store
- 将 `rect` / `bounds` 从函数改为 keyed store
- 在 `runtime/read/edge.ts` 中新增 `bounds` keyed store
- 从 `RuntimeRead` 中删除 `index`

结果:

- editor 具备足够完整的公开读面
- 上层不再有理由继续读 `index`

### 第二阶段: 替换高优先级消费点

目标:

- 消除 geometry/bounds 的重复构造

动作:

- `runtime/read/edge.ts`
  - `edge.resolved` 改为消费 `node.canvas`
  - `connectCandidates` 改为消费 `node.idsInRect + node.canvas`
- `runtime/query/targetBounds.ts`
  - 改为消费 `node.bounds` / `edge.bounds`
- `interactions/edge/connect.ts`
  - preview path 改为消费 `ctx.read.node.canvas`

结果:

- edge 系路径统一
- targetBounds 不再越界掌握派生规则

### 第三阶段: 替换交互层剩余 index 依赖

动作:

- `interactions/transform.ts`
  - 改为消费 `ctx.read.node.canvas`
  - 如有必要新增 `ctx.read.node.transformTarget(nodeId)`
- `interactions/selection/move.ts`
  - 改为消费 `ctx.read.node` 下的有序 node 列表接口
- `runtime/document/mindmap.ts`
  - 改为消费 `editor.read.node.item`

结果:

- editor 上层不再直接依赖 engine index

## 哪些实现要删

以下实现属于重复构造或错误暴露，长期最优应直接删掉，不保留兼容:

1. `RuntimeRead.index`

原因:

- 这是 engine 内部 projection/index 细节泄漏到 editor public API

2. `runtime/read/edge.ts` 内部本地 `toNodeCanvasSnapshot`

原因:

- node canvas snapshot 应由 `node` 提供，不应由 `edge` 再算一遍

3. `runtime/query/targetBounds.ts` 内部 node/edge bounds 局部推导 helper

原因:

- 聚合层不应知道 bounds 推导细节

4. editor 代码里所有 `read.index.node.*` 的直接调用

原因:

- 这是边界收口的核心目标

## 不建议做的方案

### 只增加 `node.geometry(nodeId)`

不够好。

原因:

- `edge` 仍然要自己拼 `{ node, geometry }`
- 相同拼装逻辑仍可能在多个地方出现

### 保留 `read.index` 但约定“尽量别用”

不够好。

原因:

- 只要入口还在，后续就会继续长出新的直接依赖
- 长期最优是物理删除，而不是靠约定

### 只修 `runtime/read/edge.ts`

不够好。

原因:

- `targetBounds`、`connect.ts`、`transform.ts` 这些仍会继续复制同类模式

## 实施顺序

推荐顺序:

1. `runtime/read/node.ts`
   - 新增 `canvas`
   - `rect` / `bounds` 改为 keyed store
2. `runtime/read/edge.ts`
   - `resolved` 改用 `node.canvas`
   - 新增 `bounds`
3. `runtime/query/targetBounds.ts`
   - 改用 `node.bounds` / `edge.bounds`
4. `runtime/read/index.ts`
   - 从 `RuntimeRead` 中删除 `index`
5. `interactions/edge/connect.ts`
   - 改用 `node.canvas`
6. `interactions/transform.ts`
   - 改用 `node.canvas`
7. `interactions/selection/move.ts`
   - 改用新的 node ordered read
8. `runtime/document/mindmap.ts`
   - 改用 `node.item`

## 预期收益

- node geometry / canvas snapshot 只有一个来源
- edge routing、edge preview、connect candidates 使用同一套 node 快照
- selection / toolbar / group bounds 使用同一套 bounds 读口
- editor 命名空间边界清晰
- 后续 geometry 规则演进时修改点显著减少

## 最终判断

这不是单文件问题，而是 editor read 边界未收口导致的一组重复模式。

长期最优方案很明确:

- editor 不再公开 `read.index`
- `node` 提供 `canvas`
- `node` / `edge` 分别提供各自的 `bounds`
- query / interaction 只消费命名空间 read，不再本地重建派生状态

这套收口做完以后，类似问题基本会自然消失，因为新的重复实现将失去入口。

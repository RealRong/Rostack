# WHITEBOARD_DRAG_START_HOTPATH_OPTIMIZATION

## 范围

本文只讨论拖拽启动热路径上的结构性优化，目标是解释 `drag.json` 中这条链为什么慢，以及长期最优应该怎么收敛：

1. `isCanvasItemRefEqual` 为什么会变成明显热点。
2. 哪条上游调用链把这个比较函数放大成了高成本。
3. 最终应该如何重构 `document/query`、`document/read` 和 drag 启动输入，直接消掉这类成本。

本文不讨论：

- `elementsFromPoint` / DOM picking 的优化。
- 拖拽过程中的 React rerender 问题。
- projection/store 的通用重构，这部分已经由 [WHITEBOARD_PROJECTION_STORE_REFACTOR.zh-CN.md](/Users/realrong/Rostack/WHITEBOARD_PROJECTION_STORE_REFACTOR.zh-CN.md) 单独处理。

## 结论

结论固定为：

- `isCanvasItemRefEqual` 不是根因，它只是当前最底层、被调用次数最高的叶子函数。
- 真正的问题是 `whiteboard-core/src/document/query.ts` 在读路径里做了“scene order 修复 + 线性去重”。
- 当前 drag 启动时会重复走两遍这条读路径：
  - 一遍为 `nodes`
  - 一遍为 `edges`
- 这条路径本质是 `O(totalRefs * visitedRefs)`，所以即使比较函数只有两个字段，也会被放大成明显耗时。
- 长期最优不是把 `Array.some(...)` 换成 `Set` 就结束。
- 长期最优是：
  - 不再在 read/query 层修复 `canvas.order`
  - 不再从 `scene order` 推导 `node list / edge list`
  - drag 启动不再依赖 `documentApi.list.nodes()` / `documentApi.list.edges()`
  - frame query 也不再在 drag 启动时临时全量重建

换句话说：

- 要消掉的不是某个 `equal`。
- 要消掉的是“读路径里的全量重建和读时修复”。

## 问题定位

`drag.json` 当前已经足够说明问题。

关键热点包括：

- `isCanvasItemRefEqual` `query.ts:101:30`
  - `11.5 ms`
  - `13.2 ms`
- `buildDirectFrameMembership` 内层循环 `frame.ts:61:17`
  - `11.0 ms`

调用链是：

1. `createMoveInteraction(...)`
2. `ctx.projection.node.ordered()`
3. `document.node.list.get()`
4. `documentApi.list.nodes(...)`
5. `listCanvasItemRefs(...)`
6. `appendMissingSceneRefs(...)`
7. `appendMissingCanvasRefs(...)`
8. `visited.some(entry => isCanvasItemRefEqual(entry, ref))`

同时还有另一条：

1. `createMoveInteraction(...)`
2. `ctx.document.edge.list.get()`
3. `documentApi.list.edges(...)`
4. `listCanvasItemRefs(...)`
5. 同样进入 `appendMissingSceneRefs(...)`
6. 同样进入 `visited.some(...)`

相关代码见：

- [whiteboard-core/src/document/query.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/document/query.ts)
- [whiteboard-editor/src/document/read.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/document/read.ts)
- [whiteboard-editor/src/input/features/selection/move.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/features/selection/move.ts)

## 问题本质

### 1. `document/query.ts` 在读路径里做了不该做的事

当前 `listCanvasItemRefs()` 不是一个“读取 canonical scene order”的函数，而是一个“读取 + 修复 + 补全”的函数。

它的问题有两层：

#### 第一层：读时修复

`appendMissingSceneRefs()` 会扫描：

- `document.nodes`
- `document.mindmaps`
- `document.edges`

然后把“缺失于 `canvas.order` 的项”补回去。

这意味着：

- `canvas.order` 不是被视为 canonical state
- query 每次读取时都在做隐式 normalization

这本身就是错误的职责分层。

#### 第二层：线性去重

补全过程使用的是：

```ts
visited.some((entry) => isCanvasItemRefEqual(entry, ref))
```

这意味着：

- 每个候选 ref 都在线性扫描 `visited`
- `visited` 越大，比较次数越多
- `nodes / mindmaps / edges` 三批都会这样扫

这会把本来非常便宜的 `kind + id` 比较放大成明显成本。

### 2. `node list / edge list` 被错误地依赖在 scene query 上

当前：

- `document.node.list`
  通过 `documentApi.list.nodes(...)`
- `document.edge.list`
  通过 `documentApi.list.edges(...)`

见：

- [document/read.ts:497-517](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/document/read.ts:497)

但这两个概念本来就不该依赖 scene order：

- `all node ids`
- `all edge ids`

它们应当直接来自 document/entity canonical source，而不是先走一遍 scene refs，再从中展开。

这导致 drag 启动为了拿“所有节点 / 所有边”，不得不重复做 scene query。

### 3. frame query 也在 drag 启动时临时全量重建

`frame.ts` 当前在：

- `resolveNodeFrame`
- `collectFrameMembers`

内部都会重新执行 `buildDirectFrameMembership(...)`。

而这个过程本质上是：

- 对每个 node
- 扫所有 frame candidate
- 做包含判断

这是另一条典型的 `O(nodes * frames)` 路径。

所以 `drag.json` 里出现：

- `isCanvasItemRefEqual`
- `buildDirectFrameMembership`

不是两个独立问题，而是 drag 启动时两条全量读路径同时暴露出来了。

## 最终目标

最终目标固定为：

### 1. `canvas.order` 成为唯一 canonical top-level scene order

`canvas.order` 必须被提升为：

- 完整
- 有效
- 不需要读时修复

这意味着：

- 文档导入 / 替换 / mutation / engine 写入阶段负责维护它
- query/read 阶段只读取，不修复

最终 `listCanvasItemRefs()` 应该退化为：

- 读取 `document.canvas.order`
- 最多做非常轻量的断言或开发期校验
- 不再扫描 `nodes / mindmaps / edges` 做补全

删除：

- `appendMissingSceneRefs`
- `appendMissingCanvasRefs`
- `isCanvasItemRefEqual` 在这条读路径中的存在价值

### 2. `node list / edge list` 与 `scene list` 彻底分离

以下概念必须拆开：

- top-level canvas refs
- all node ids
- all edge ids
- all mindmap ids

最终不允许再有这种关系：

- `node list` 先经过 `scene refs`
- `edge list` 先经过 `scene refs`

最终应改为：

- `scene.list`
  直接读取 `canvas.order`
- `node.list`
  直接读取 document/facts 中的 node entity ids
- `edge.list`
  直接读取 document/facts 中的 edge entity ids
- `mindmap.list`
  直接读取 document/facts 中的 mindmap entity ids

也就是说：

- scene order 是 scene 语义
- entity list 是 entity 语义
- 两者不能继续混用

### 3. drag 启动直接消费 projection/document canonical families

`createMoveInteraction()` 的目标不是“重新查 scene”，而是“拿到当前所有参与 move 计算的节点和边”。

最终它不应再依赖：

- `ctx.projection.node.ordered()`
- `ctx.document.edge.list.get()`

这种读法背后仍然会把它拖回 committed document query。

最终应改成直接消费已经存在的 canonical source：

- projection graph node family
- projection graph edge family

推荐收敛为：

```ts
interface GraphNodeRead {
  ids(): readonly NodeId[]
  all(): readonly RuntimeNodeView[]
}

interface GraphEdgeRead {
  ids(): readonly EdgeId[]
  all(): readonly RuntimeEdgeView[]
}
```

然后 drag 启动直接从这些 source 构造 move state。

这样可以保证：

- 不再重复跑 committed document query
- 不再重复做 scene expansion
- 不再为启动 move 去构造额外中间列表

### 4. 新增 `FrameQuery`，直接建立在 spatial 上

`frame` 的语义在这里应当被固定为：

- 不是结构 parent
- 没有持久化 children
- 不是第二份 document fact
- 完全由空间包含关系决定

因此长期最优不应再引入一份 canonical `FrameIndex`。

正确收敛应该是：

- 新增一个 `FrameQuery`
- 它是 query adapter，不是持久化 index
- 它直接建立在 spatial + node geometry 上

API 固定为：

```ts
interface FrameQuery {
  at(point: Point): NodeId | undefined
  parent(nodeId: NodeId): NodeId | undefined
  children(frameId: NodeId): readonly NodeId[]
  descendants(frameId: NodeId): readonly NodeId[]
}
```

语义固定为：

- `at`
  返回包含该点的最合适 frame
- `parent`
  返回包裹该 node 的最近 frame
- `children`
  返回直接子节点
- `descendants`
  返回深层后代

这里“最合适 / 最近”的判定仍然来自空间关系：

- 先通过 spatial 缩小候选 frame 范围
- 再在候选中选最小包裹者

如果现有 spatial 能力不足，应该补的是：

- frame kind filter
- rect/point containment helper
- smallest-containing-frame helper

而不是新增一份持久化 frame membership index。

### 5. `FrameQuery` 的命名必须收敛

`frame` 相关命名必须短、稳定、语义直接，不再保留当前这种容易歧义的名字。

对外 API 命名固定为：

- `at`
- `parent`
- `children`
- `descendants`

明确淘汰：

- `of`
- `atPoint`
- `collectMembers`
- `resolveNodeFrame`
- `buildDirectFrameMembership`

内部 helper 命名也固定走同一套短词，不再使用长句式“resolve/build/collect”命名。

内部 helper 推荐词表固定为：

- `nodeRect`
- `frameRect`
- `pick`
- `contains`
- `scanFrames`
- `scanChildren`

原则是：

- 外部接口只暴露最终语义词
- 内部 helper 只暴露最小动作词
- 不再出现一个函数名里同时混入“数据来源 + 算法步骤 + 语义目标”

## 实施方案

### 阶段一：清理 `document/query.ts` 的错误职责

修改文件：

- `whiteboard/packages/whiteboard-core/src/document/query.ts`

动作：

1. 删除读时补全逻辑：
   - `appendMissingSceneRefs`
   - `appendMissingCanvasRefs`
2. 删除 `isCanvasItemRefEqual` 在该文件中的用途。
3. 让 `listCanvasItemRefs()` 直接返回 canonical `document.canvas.order`。
4. 如果需要修正脏数据，只允许放在：
   - document normalize
   - engine replace/import
   - mutation command

原则：

- 不在 query 层偷偷修数据。
- 数据不合法就修 source，不修 read。

### 阶段二：拆分 `scene.list / node.list / edge.list`

修改文件：

- `whiteboard/packages/whiteboard-editor/src/document/read.ts`

动作：

1. `sceneList`
   改成直接读取 `document.canvas.order`
2. `nodeList`
   改成直接读取 node entity ids
3. `edgeList`
   改成直接读取 edge entity ids
4. `edgeRelations`
   不再先 `documentApi.list.edges(...)`
   直接基于 edge entity family 构造

最终不再允许：

- `nodeList <- listNodes <- listCanvasItemRefs`
- `edgeList <- listEdges <- listCanvasItemRefs`

### 阶段三：给 projection family 暴露热路径枚举 API

修改文件：

- `whiteboard/packages/whiteboard-editor/src/read/node.ts`
- `whiteboard/packages/whiteboard-editor/src/read/edge.ts`
- 必要时修改 projection source/read 内部接口

动作：

1. 增加直接读取 graph family ids / all entries 的 API。
2. `ordered()` 不再依赖 committed document `node.list`。
3. `edges(...)` 之外新增 `all()`，避免调用方先读一份 committed edge list 再映射。

最终 drag 启动读取：

- projection node family
- projection edge family

而不是：

- document query rebuild 出来的 list

### 阶段四：新增 `FrameQuery`（基于 spatial，不新增持久化 index）

修改文件：

- `whiteboard/packages/whiteboard-core/src/node/frame.ts`
- `whiteboard/packages/whiteboard-editor/src/document/read.ts`
- `whiteboard/packages/whiteboard-core/src/node/index.ts`
- `whiteboard/packages/whiteboard-core/src/document/slice.ts`
- `whiteboard/packages/whiteboard-editor/src/input/features/selection/move.ts`

动作：

1. 新增正式的 `FrameQuery`，并把当前零散的 `frame` 查询入口统一收进去。
2. `document.frame.of` 改名为 `document.frame.parent`。
3. `document.frame.at` 保留。
4. 直接成员与深层成员拆成：
   - `children`
   - `descendants`
5. 实现改为直接基于 spatial 和当前 node geometry 做候选收缩与最近 frame 选择。
6. `slice / selection / move` 等调用方统一改用新命名。
7. 不再保留“先 build 全量 membership，再做查询”的实现思路。

最终：

- frame 查询是 `FrameQuery` 读取
- `FrameQuery` 的 source of truth 是 spatial + geometry
- 不是 drag 启动时的临时全量推导
- 也不是另一份持久化 frame index

## 不采用的方案

### 1. 只把 `visited.some(...)` 换成 `Set`

这只能把一部分成本从 `O(N^2)` 降下来，但仍然保留了错误结构：

- 读时修复 `canvas.order`
- `node/edge list` 仍然依赖 `scene`
- drag 启动仍然重复全量 scene rebuild

所以这不是长期最优，只能算临时止血。

### 2. 继续保留 `listNodes / listEdges` 的 scene expansion 语义，再在调用方小心规避

这会导致：

- API 语义继续混乱
- 新调用方继续踩回热路径
- drag 之外的别的功能以后还会再次撞到同类问题

长期最优必须直接拆语义，不保留模糊接口。

### 3. 在 drag 启动时做一次 memo/cache

如果底层 query 语义继续错误，那么 cache 只是掩盖问题：

- invalidation 复杂
- 容易和 source authority 冲突
- 结构仍然不干净

长期最优应先修 source 和 API，不先堆 cache。

### 4. 新增一份 `FrameIndex`

这不是长期最优，因为 frame 在这里不是结构事实，而是空间语义：

- 没有持久化 children
- 没有独立 parent 事实
- 真实 source of truth 是 geometry + spatial

如果再引入一份 `FrameIndex`，结果会变成：

- spatial 是一份事实源
- frame index 是第二份派生事实源

这只会增加同步和失配风险。

长期最优应当是：

- 暴露 `FrameQuery`
- 让 `FrameQuery` 直接建立在 spatial 上
- 不再持久化 frame membership

## 最终判断

关于这次 `drag.json` 的结论，最终固定为：

- `isCanvasItemRefEqual` 之所以耗时高，不是因为比较函数慢。
- 是因为 `document/query.ts` 用它承载了读时补全的线性去重。
- 这条问题路径又被 drag 启动重复触发两遍，所以 leaf hotspot 被放大得很明显。
- 真正的长期最优不是微调 comparator，而是：
  - 让 `canvas.order` 成为真正 canonical 的 scene source
  - 让 entity list 不再依赖 scene query
  - 让 drag 启动直接消费 projection/document canonical families
  - 新增基于 spatial 的 `FrameQuery`，替代临时全量 frame 推导

这套收敛做完之后：

- `isCanvasItemRefEqual` 这类热点会自然消失
- drag 启动的全量扫描也会一起收缩
- API 语义会比现在更清晰，而不是更绕

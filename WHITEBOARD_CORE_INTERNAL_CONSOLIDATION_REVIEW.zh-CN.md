# Whiteboard Core 内部进一步收敛审查

更新时间：2026-04-10

## 已落地状态

本轮收敛已经按“不留兼容、不保留过渡层”的原则直接落地，当前状态如下：

- `whiteboard-core` 已移除 editor-only 模块：
  - `src/edge/routeHandle.ts`
  - `src/selection/marquee.ts`
  - `src/selection/press.ts`
  - `src/node/projection.ts`
  - `src/node/capability.ts`
- `whiteboard-core` 已移除 engine-only 模块：
  - `src/node/readModel.ts`
  - `src/node/duplicate.ts`
  - `src/group/index.ts`
  - `src/group/commands.ts`
- `whiteboard-core` 已移除 react-only 模块：
  - `src/node/updateHelpers.ts`
- `whiteboard-core` 已移除 clipboard transport：
  - `src/document/clipboard.ts`
- `whiteboard-core` 已进一步完成内部合并：
  - `selection` 纯模型已合并为 `src/selection/model.ts`
  - node 几何已合并为 `src/node/geometry.ts`
  - `src/geometry/node.ts`
  - `src/node/bounds.ts`
    已删除

对应的新归属：

- editor 本地承接：
  - `src/interactions/edge/routeHandle.ts`
  - `src/interactions/selection/marqueeState.ts`
  - `src/interactions/selection/pressPolicy.ts`
  - `src/runtime/read/nodeProjection.ts`
  - `src/runtime/read/nodeCapability.ts`
  - `src/clipboard/packet.ts`
- engine 本地承接：
  - `src/read/store/nodeReadModel.ts`
  - `src/write/translate/nodeSelection.ts`
  - `src/write/translate/groupCommands.ts`
- react 本地承接：
  - `src/features/node/update.ts`

验证结果：

- `pnpm --dir whiteboard typecheck:core`
- `pnpm --dir whiteboard typecheck:engine`
- `pnpm --dir whiteboard typecheck:editor`
- `pnpm --dir whiteboard typecheck:react`
- `pnpm --dir whiteboard typecheck:collab`
- `pnpm --dir whiteboard verify`

以上均已通过。

## 结论

`whiteboard-core` 上一轮已经把最明显的对外 surface 混杂问题清掉了，但内部还有一轮非常值得做的收敛，重点不是继续拆更多文件，而是把 `core` 里实际上属于 `engine`、`editor`、`react` 的单消费者能力移走，并把仍然留在 core 的几个重叠子域继续合并。

如果只追求降低复杂度与职责分离，不考虑兼容和迁移成本，最优方向是：

1. 让 `whiteboard-core` 只保留“文档模型 + 几何原语 + 纯领域算法 + schema + kernel”。
2. 把明显的 UI / projection / interaction / write orchestration 辅助从 core 移到真正消费它们的包。
3. 把 core 内部还在分裂的几个子域继续收成更少的概念中心。

## 当前复杂度热点

按文件行数看，当前复杂度主要集中在这些文件：

- `whiteboard/packages/whiteboard-core/src/edge/path.ts`: 1020
- `whiteboard/packages/whiteboard-core/src/node/outline.ts`: 973
- `whiteboard/packages/whiteboard-core/src/node/transform.ts`: 941
- `whiteboard/packages/whiteboard-core/src/document/slice.ts`: 876
- `whiteboard/packages/whiteboard-core/src/kernel/reduce.ts`: 675
- `whiteboard/packages/whiteboard-core/src/edge/connect.ts`: 647
- `whiteboard/packages/whiteboard-core/src/selection/press.ts`: 537
- `whiteboard/packages/whiteboard-core/src/node/draw.ts`: 479
- `whiteboard/packages/whiteboard-core/src/mindmap/layout.ts`: 469

这里面有两类问题：

- 真正复杂但仍然属于 core 的纯领域算法。
- 放在 core 里，但实际上只被单个上层包使用的代码。

后者是最应该优先清掉的，因为删掉它们，核心复杂度会立刻下降，而且职责会更清楚。

## P0：先把“单消费者能力”移出 core

### 1. Editor-only 能力移出 core

这些模块目前放在 core，但实际只被 editor 使用，属于交互层或 overlay/projection 层，不属于 core：

- `whiteboard/packages/whiteboard-core/src/edge/routeHandle.ts`
- `whiteboard/packages/whiteboard-core/src/selection/marquee.ts`
- `whiteboard/packages/whiteboard-core/src/selection/press.ts`
- `whiteboard/packages/whiteboard-core/src/node/projection.ts`
- `whiteboard/packages/whiteboard-core/src/node/capability.ts`

证据：

- `routeHandle` 只被 `whiteboard-editor/src/interactions/edge/routePoint.ts` 使用。
- `selection/marquee.ts` 只被 `whiteboard-editor/src/interactions/selection/marquee.ts` 使用。
- `selection/press.ts` 只被 `whiteboard-editor/src/interactions/selection/press.ts` 使用。
- `node/projection.ts` 只被 `whiteboard-editor/src/runtime/read/node.ts` 和 overlay 类型使用。
- `node/capability.ts` 的实际消费也只在 editor 的 node read/runtime。

最简方案：

- 直接把这些文件迁到 `whiteboard-editor`。
- `@whiteboard/core/selection` 只保留 selection 数据模型与纯推导。
- `@whiteboard/core/node` 只保留真正节点领域逻辑，不再承载 editor overlay patch / capability 解释器。

迁移后可删除的 core 概念：

- “selection interaction policy in core”
- “edge route handle interaction state in core”
- “node overlay projection patch in core”
- “node capability interpretation in core”

### 2. Engine-only 能力移出 core

这些模块是 engine 投影或 write orchestration 的辅助，不是 core 的基础领域能力：

- `whiteboard/packages/whiteboard-core/src/node/readModel.ts`
- `whiteboard/packages/whiteboard-core/src/node/duplicate.ts`
- `whiteboard/packages/whiteboard-core/src/group/commands.ts`

证据：

- `deriveNodeReadSlices` / `deriveVisibleEdges` / `deriveMindmapRoots` / `orderByIds` 只被 `whiteboard-engine/src/read/store/model.ts` 使用。
- `buildNodeDuplicateOperations` / `expandNodeSelection` 只被 `whiteboard-engine/src/write/translate/node.ts` 和 `whiteboard-engine/src/write/translate/index.ts` 使用。
- `group/commands.ts` 对外只有 `whiteboard-engine/src/write/translate/group.ts` 在用。

最简方案：

- 把 `node/readModel.ts` 直接移到 `whiteboard-engine/src/read/store/`。
- 把 `node/duplicate.ts` 直接移到 `whiteboard-engine/src/write/translate/` 或 `whiteboard-engine/src/write/helpers/`。
- 取消 `@whiteboard/core/group` 整个 entry，把 group merge/ungroup 逻辑迁到 engine 写入翻译层。

这里最重要的判断是：

- “duplicate selection expansion”
- “visible/canvas read model derivation”
- “group merge/ungroup write assembly”

这些都已经不是 core 基础模型能力，而是 engine 的文档读写策略。

### 3. React-only 能力移出 core

这些 helpers 本质是 UI patch 组装器，不是底层 domain primitive：

- `whiteboard/packages/whiteboard-core/src/node/updateHelpers.ts`

证据：

- `toNodeDataPatch`
- `toNodeFieldUpdate`
- `toNodeStylePatch`
- `toNodeStyleRemovalPatch`
- `toNodeStyleUpdates`

实际只被 `whiteboard-react` 的 toolbar / registry 代码使用。

最简方案：

- 把这些 helpers 移到 `whiteboard-react`。
- core 只保留 canonical update primitives：`createNodeUpdateOperation`、`compileNodeFieldUpdate`、`applyNodeUpdate`。

### 4. Clipboard packet 退出 core

`whiteboard/packages/whiteboard-core/src/document/clipboard.ts` 现在横跨 editor 和 react，但它本质是 UI clipboard transport，不是 document core model。

证据：

- `createClipboardPacket` 只在 editor document clipboard runtime 里用。
- `parseClipboardPacket` / `serializeClipboardPacket` 只在 react DOM clipboard host 里用。

最简方案：

- 把 clipboard packet 格式迁到 editor/react 共享层，或者 editor 包下的 transport 模块。
- core 只保留 `slice` 的 export / import / translate 逻辑。

## P1：把 core 内部仍然分裂的子域继续合并

### 1. Node geometry 需要收成一个中心

现在和 node 几何相关的逻辑分布在：

- `whiteboard/packages/whiteboard-core/src/geometry/node.ts`
- `whiteboard/packages/whiteboard-core/src/node/bounds.ts`
- `whiteboard/packages/whiteboard-core/src/node/outline.ts`

问题不是代码量，而是概念边界不稳：

- `geometry/node.ts` 里已经有 node-specific 语义。
- `node/bounds.ts` 只是薄包装。
- `node/outline.ts` 同时承担 outline 生成、anchor 计算、bounds 派生、geometry 组装。

最简方案：

- 让 `geometry/` 只保留纯通用原语：`point`、`rect`、`rotation`、`segment`、`viewport`、`collision`。
- 新建一个真正的 `node/geometry.ts`，把以下内容收进去：
  - `getNodeRect`
  - `getNodeAABB`
  - `getNodeBoundsByNode`
  - `getNodesBounds`
  - `getNodeGeometry`
  - `getNodeBounds`
- `node/outline.ts` 只保留“轮廓/anchor/投影”。
- 删除 `geometry/node.ts` 和 `node/bounds.ts`。

这样 node 几何就只需要记一个入口，不再在 `geometry` 和 `node` 两层之间来回跳。

### 2. Edge polyline 语义需要收成一个中心

当前 edge polyline 相关逻辑分散在：

- `whiteboard/packages/whiteboard-core/src/edge/path.ts`
- `whiteboard/packages/whiteboard-core/src/edge/label.ts`
- `whiteboard/packages/whiteboard-core/src/edge/segment.ts`
- `whiteboard/packages/whiteboard-core/src/edge/routeHandle.ts`

已经存在明确重复：

- `normalizePolylinePoints` 在 `edge/path.ts` 和 `edge/routeHandle.ts` 各有一份。
- label sampling、segment hit、route-handle edit 都在围绕同一组 polyline 语义工作，但没有统一中层抽象。

最简方案：

- 引入单一内部模块 `edge/polyline.ts`。
- 统一承载：
  - polyline normalize
  - polyline segments
  - nearest insert index
  - label sampling
  - route-handle path mutation helpers
- `path.ts` 只保留 path build/router。
- `label.ts`、`segment.ts`、`routeHandle.ts` 改成消费 `polyline.ts`。

如果进一步激进一些：

- 在 route-handle 迁出 core 之后，`segment.ts` 和 `label.ts` 都可以明显变薄。

### 3. Selection derived model 可以继续合并

当前 selection 有两种东西混在一个 entry 里：

- 纯 selection 数据模型：
  - `target.ts`
  - `summary.ts`
  - `affordance.ts`
  - `bounds.ts`
- editor interaction policy：
  - `marquee.ts`
  - `press.ts`

这两个层次本来就不该在同一层。

最简方案：

- 先把 `marquee.ts` 和 `press.ts` 移到 editor。
- 然后把 `target.ts`、`summary.ts`、`affordance.ts`、`bounds.ts` 合并为一个 `selection/model.ts`。

原因：

- 它们都在描述“当前 selection 的派生状态”。
- 现在拆成四个文件并没有形成稳定可复用层，只是增加跳转成本。

## P2：继续收缩 barrel 和 entry 的认知负担

### 1. `node/index.ts` 仍然过宽

`whiteboard/packages/whiteboard-core/src/node/index.ts` 现在 268 行，实际上打包了这些不同层次：

- update / command
- geometry / outline
- draw / shape / text templates
- transform / snap / move
- selection helper
- projection helper
- capability helper
- duplicate / read model

这里的问题不是“行数大”，而是一个 `@whiteboard/core/node` 入口同时承载了太多不同心智模型。

如果前面的 P0 已经执行，`node/index.ts` 会自然瘦很多，因为这些模块会移走：

- `duplicate.ts`
- `readModel.ts`
- `projection.ts`
- `capability.ts`
- `updateHelpers.ts`

执行后 `node` entry 会更接近真正的 node domain。

### 2. `edge/index.ts` 还能继续变薄

在 route-handle 迁出之后，`edge/index.ts` 可进一步只保留：

- path / view / endpoints / connect / commands / patch / relations / label

更激进的版本是只公开高层函数，把内部 `segment` 也收回。

## P3：可以考虑但不必立刻做的更大重构

### 1. `kernel` 是否继续留在 core

现在 `kernel` 很多能力其实主要服务 engine：

- `reduceOperations`
- `createHistory`
- `createRegistries`

不过它也定义了一部分外部要感知的历史/impact 类型，所以这一层要不要搬，需要看你对 `whiteboard-core` 的定义：

- 如果 core 定义为“所有 document-level 纯算法中心”，那 kernel 可以留。
- 如果 core 定义为“文档模型与纯领域函数”，那 kernel 更适合挪到 engine。

我的判断：

- 这不是当前最优先的动作。
- 先清掉上面的 editor-only / engine-only / react-only 模块，收益更大，风险更低。

### 2. `document/slice.ts` 是否拆分

`document/slice.ts` 很大，但它其实仍然比较像一个完整领域：

- slice translate
- export from nodes / edge / selection
- insert operations

它的主要问题是大，不是边界错。

所以这里不建议优先“继续拆更多文件”。

更优判断是：

- 先把 clipboard packet 移走。
- 保留 `slice.ts` 作为 slice domain 单中心。
- 后续如果真要继续降复杂度，再在 `slice.ts` 内部引入更清晰的局部 helper，而不是先拆文件。

## 推荐的最终形态

### core 应该保留

- `types`
- `geometry` 纯原语
- `document` 模型 / query / assert / slice
- `node` 真正节点领域能力
- `edge` 真正边领域能力
- `mindmap` 树与布局
- `schema`
- `kernel`
- `result` / `id` / `value` / `equality`

### core 应该移出

移到 engine：

- `node/readModel.ts`
- `node/duplicate.ts`
- `group/commands.ts`

移到 editor：

- `edge/routeHandle.ts`
- `selection/marquee.ts`
- `selection/press.ts`
- `node/projection.ts`
- `node/capability.ts`

移到 react：

- `node/updateHelpers.ts`

移到 editor/react shared transport：

- `document/clipboard.ts`

### core 内继续合并

- `geometry/node.ts` + `node/bounds.ts` + `node/outline.ts` 的几何部分
- selection 派生模型四件套
- edge polyline 语义中心

## 优先级建议

### 第一阶段

- 移出 editor-only / engine-only / react-only 模块
- 删除 `group` entry
- 删除 `document/clipboard.ts`

这是收益最大的一轮，因为能直接降低 core 的职责密度。

### 第二阶段

- 收拢 node geometry
- 收拢 edge polyline
- 合并 selection 派生模型

这是结构优化的一轮，主要解决 core 内部心智跳转过多的问题。

### 第三阶段

- 再评估 kernel 是否保留在 core

这一步不要先做，否则会把重构范围放太大。

## 最终判断

如果目标是“尽量减少复杂度”，而不是“继续做文件级整洁”，那么下一轮最值得做的不是再动 `types`，而是：

1. 把单消费者模块赶出 core。
2. 让 core 只保留跨包真正共享的纯领域能力。
3. 在 core 内部把 node geometry、edge polyline、selection model 继续收成更少的概念中心。

这是我认为当前 `whiteboard-core` 最优的一轮继续收敛方向。

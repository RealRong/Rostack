# Whiteboard Editor Query 性能审计与长期优化方案

## 1. 目标与范围

本文只审计 `whiteboard/packages/whiteboard-editor/src/query` 这一层，以及少量直接放大其开销的外围代码，目标不是做兼容式修补，而是明确：

- 当前 `query` 层哪些地方已经是明显热路径。
- 哪些计算必须缓存，缓存的 owner 应该是谁。
- 哪些重计算应该彻底避免，而不是继续在 `query` 里做局部 patch。
- 最终长期最优的 `query` 形态应该如何收敛。

本次审计覆盖：

- `query/index.ts`
- `query/node/*`
- `query/edge/*`
- `query/mindmap/read.ts`
- `query/selection/*`
- `query/target.ts`
- `query/utils.ts`

同时补看了几个会直接影响 `query` 性能结论的外围点：

- `shared/core/src/store/family.ts`
- `shared/core/src/store/derived.ts`
- `whiteboard/packages/whiteboard-react/src/runtime/whiteboard/layout.ts`
- `whiteboard/packages/whiteboard-react/src/features/node/dom/textMeasure.ts`
- `whiteboard/packages/whiteboard-react/src/features/node/dom/textTypography.ts`
- `whiteboard/packages/whiteboard-react/src/canvas/CanvasScene.tsx`
- `whiteboard/packages/whiteboard-editor/src/input/features/selection/marquee.ts`

## 2. 总体诊断

当前 `query` 层的主要问题不是“没有 derived store”，而是“derived 的依赖粒度不对，且有几条读路径夹带了不该存在的昂贵计算”。

核心结论只有四条：

1. `keyed derived` 只解决了“按 key 缓存”，没有解决“依赖按 key 失效”。
   现在很多 `nodeId -> item/render`、`edgeId -> item/render` 的 getter 仍直接读取全局 `edit`、全局 `selection`。因此任意一次编辑态或选择态变化，都会让所有已订阅 key 一起变脏。

2. `query` 里混入了同步 DOM 测量。
   `edge label render` 在 `query/edge/read.ts` 内直接走 `layout.measureText()`，最终进入真实 DOM 的 `getBoundingClientRect()`。这条路径本身就不该存在于热读模型里。

3. 高交互频率路径里仍有全量扫描。
   `edge.idsInRect()` 逐条 edge 扫描并做 path/rect 匹配，而它会在 marquee 拖拽期间高频触发。

4. 聚合读没有分层，导致 selection 和 mindmap 的大量逻辑每次都从头重算。
   `selection/read.ts` 把 node stats、edge stats、toolbar scope、mindmap scope、uniform value 读取全部塞在一个大 getter 里；`mindmap/read.ts` 则在 query 内直接做整树 relayout 和 enter 动画插值。

如果继续沿当前结构修小问题，只会不断叠加“局部缓存”、“额外 selector”、“临时旁路”。长期最优解必须是把 `query` 重新收敛为纯读模型：只组合已经 materialize 好的结构化数据，不在这里做 DOM 测量、整树布局、全量扫描。

## 3. 底层失效语义：为什么现在会扇出

`shared/core/src/store/family.ts` 里的 `createKeyedDerivedStore()` 只是给每个 key 建一个 `DerivedNode` 缓存。真正的依赖追踪仍由 `shared/core/src/store/derived.ts` 的 `collectDependencies()` 完成。

这意味着：

- `keyed store` 会缓存 `nodeId=123` 这一项。
- 但如果它的 getter 里读了全局 `edit`，那么这个 key 的依赖就是“整个 edit store”。
- `edit` 一旦变化，所有读过 `edit` 的 key 都会一起失效。

所以当前问题不是 “没有 keyed store”，而是 “keyed getter 里读了太多全局态”。

这也是后面所有优化的主线：

- 不要让 `node.render(nodeId)` 直接读整个 selection/edit。
- 不要让 `edge.render(edgeId)` 直接读整个 selection/edit。
- 不要让 `mindmap.item(treeId)` 直接读整个 preview/edit。
- 把全局态拆成按实体可投影、可 keyed 的细粒度 read。

## 4. 逐文件风险审计

### 4.1 `query/index.ts`

现状：

- 负责把 `engineRead`、`session.state`、`session.preview`、`layout` 组装成 `EditorQuery`。
- 这里本身不是算力热点，但它暴露了当前架构上的两个问题：
  - `query` 依赖 `layout`，意味着 query 可以直接做 DOM 测量。
  - `query` 直接吃 `session.preview.selectors.*`，说明很多“本该先 materialize 的 transient 结果”还停留在 query 内部组合。

风险判断：

- 中风险，主要是职责边界问题，不是单点算力热点。

长期结论：

- `query` 应该只依赖“可读服务”和“已物化的 transient 投影”。
- `layout` 不应该作为一个通用自由能力下放给 query 任意调用，尤其不能在 render getter 里同步测量 DOM。

### 4.2 `query/node/projection.ts`

现状：

- `projectNodeItem()` 依次叠加：
  - geometry patch
  - mindmap projected layout
  - text preview
  - edit draft

主要问题：

- geometry、text preview、edit draft、mindmap owned layout 现在被揉成一个“统一投影”。
- 这会导致很多原本彼此无关的变化共用同一个失效面。
- 例如：
  - 文字 draft 更新，不应该重新跑 mindmap layout patch。
  - mindmap rect 变化，不应该让普通 text draft 合成逻辑也参与。

风险判断：

- 中高风险，不一定单次极重，但它扩大了 `node.item` 的失效范围。

长期结论：

- `node` 读模型应拆成至少三层：
  - `node.base(nodeId)`：engine committed item
  - `node.geometry(nodeId)`：几何与尺寸投影
  - `node.content(nodeId)`：文字与编辑态投影
- `node.render(nodeId)` 只组合轻量结果，不再让一个总投影承担所有 transient 语义。

### 4.3 `query/node/read.ts`

现状：

- `item(nodeId)` 读取：
  - `read.node.item`
  - `feedback(nodeId)`
  - 全局 `edit`
  - `mindmap(treeId)`
- `render(nodeId)` 读取：
  - `view(nodeId)`
  - 全局 `selection`
  - 全局 `edit`

主要问题：

1. `item(nodeId)` 直接读全局 `edit`。
   任意 node 进入编辑态、退出编辑态、caret 变化，都可能让所有已订阅 node item 一起变脏。

2. `render(nodeId)` 直接读全局 `selection` 和全局 `edit`。
   任意选择变化，所有已挂载 node render 都会重算。

3. `item(nodeId)` 还通过 `node.mindmapId` 反查整棵 mindmap item。
   这让 mindmap 树内任意布局变化都容易把该树上所有 node 的 item/render 一并带起来。

风险判断：

- 高风险。
- 当场景里 node 多、且 React scene 全量挂载时，这条链会被明显放大。

长期结论：

- 必须引入 keyed runtime selector：
  - `selection.nodeSelected(nodeId)`
  - `edit.node(nodeId)`
  - `edit.nodeField(nodeId, field)`
- `node.render(nodeId)` 只能读取本 node 对应的 runtime key，不应再读全局 selection/edit。

### 4.4 `query/edge/projection.ts`

现状：

- `projectEdgeItem()` 合成 edge patch 与 edge-label draft。
- `readProjectedEdgeView()` 每次通过 source/target node snapshot 调 `resolveEdgeView()`。

主要问题：

1. edge-label draft 被直接写入整条 edge item 投影。
   这会让 label 文本变化与 path/view 解析混在一起。

2. `resolveEdgeView()` 属于结构几何解析，但它当前缺少更细粒度的缓存边界。

风险判断：

- 中高风险。
- 真正的大热点在 `edge/read.ts`，但这里的分层不清会放大后续 render 代价。

长期结论：

- edge 读模型至少要拆成：
  - `edge.base(edgeId)`
  - `edge.path(edgeId)` 或 `edge.geometry(edgeId)`
  - `edge.labelContent(edgeId, labelId)`
  - `edge.runtime(edgeId)`
- label draft 不应通过“整条 edge item 重投影”传播。

### 4.5 `query/edge/read.ts`

这是当前 `query` 目录里最明确的热点文件。

#### 风险点 A：`readEdgeLabelRender()` 在 query 内同步测量文字

现状：

- `readEdgeLabelRender()` 内部直接调用 `layout.measureText()`
- `layout.measureText()` 最终进入：
  - `whiteboard-react/src/runtime/whiteboard/layout.ts`
  - `whiteboard-react/src/features/node/dom/textTypography.ts`
  - `whiteboard-react/src/features/node/dom/textMeasure.ts`
- `textMeasure.ts` 里会执行真实 DOM 的 `getBoundingClientRect()`

问题本质：

- label 文本度量是“内容指标”，path 摆放是“几何摆放”。
- 现在两者被绑在 `edge.render(edgeId)` 里一起做。
- 于是只要 edge path、selection、edit、tool 或任何上游依赖变化，就可能重新触发同步 DOM 测量。

风险判断：

- 最高风险，P0。

长期结论：

- 必须把 `label metrics` 与 `label placement` 拆开。
- `query` 里不允许出现同步 DOM 文字测量。

正确 owner：

- 文字度量应归 `layout` 或独立的 `text metrics cache` 服务。
- `query.edge.render` 只读缓存好的 label metrics。

#### 风险点 B：`render(edgeId)` 直接读全局 selection/edit

现状：

- `edge.render(edgeId)` 内直接读取：
  - `readValue(edit)`
  - `readValue(selection)`

问题：

- 任意 edge 被选中、取消选中，所有已订阅 edge render 都会一起变脏。
- 任意 edge label 进入编辑态，所有 edge render 都可能一起重算。

风险判断：

- 高风险，P1。

长期结论：

- 必须提供 keyed read：
  - `selection.edgeSelected(edgeId)`
  - `edit.edgeLabel(edgeId)`

#### 风险点 C：`idsInRect()` 全量扫描所有 edge

现状：

- `idsInRect(rect)` 直接遍历 `read.edge.list`
- 对每条 edge 执行 `matchEdgeRect()`
- marquee 拖拽期间高频调用这条路径

问题：

- 这是典型的交互热路径全量扫描。
- edge 数量上来后，拖拽框选会立刻退化。

风险判断：

- 高风险，P1。

长期结论：

- `edge.idsInRect()` 不应该存在于 query 的“遍历实现”里。
- 应该由 engine 或专门的 spatial index 服务提供基于 bounds/path 的命中候选。

#### 风险点 D：`selectedChrome` 仍读取多个全局态

现状：

- `selectedChrome` 读取 selection、tool、interaction、edit。

判断：

- 这条链因为只服务“当前 selected edge”，风险比 `render(edgeId)` 小很多。
- 但它仍应建立在“已选 edge id”这一更窄的 keyed/primary 读之上，而不是到处临时拼。

风险判断：

- 中风险。

### 4.6 `query/mindmap/read.ts`

现状：

- `readProjectedMindmapItem()` 在 query 内部处理：
  - live text edit 时的整树 relayout
  - rootMove 平移
  - enter 动画插值
- `createMindmapRead()` 内部自己起 clock，preview 有 enter 动画时用 RAF 刷新

主要问题：

1. live edit 时整树 relayout 发生在 query 里。
   这意味着只要 root 或 child 文本尺寸变化，query getter 就直接跑 `computeMindmapLayout()`。

2. 每次 `item(treeId)` 都要：
   - 过滤 `preview.enter`
   - 判断 edit 是否命中本树
   - 必要时整树 layout
   - 再生成 connectors

3. clock 与动画插值也在 query 内完成。
   这会让 query 兼任“时间驱动 transient 计算器”。

风险判断：

- 高风险，P1/P2 之间。
- mindmap 树稍大、编辑稍频繁时，这条链会非常敏感。

长期结论：

- mindmap transient layout 必须从 query 中拿出去。
- query 只应该读取：
  - committed tree
  - transient materialized layout
  - transient animation state
- “live edit 下整树如何 relayout” 应由 editor session/layout service 统一产出结果，而不是 query 临时算。

### 4.7 `query/selection/model.ts`

现状：

- `summary` 里：
  - 读 selection target
  - 拉 node/edge 实体
  - 读 node.rect / edge.bounds
  - 每个 node 多次读取 `node.capability(entry)`
- `affordance` 再基于 summary 做一次派生

主要问题：

1. `node.capability(entry)` 重复调用。
   这是 registry/schema/meta 层的重复解析。

2. selection summary 与 affordance 的计算粒度仍偏大。
   选择目标变化时，整个 summary/affordance 都从头重算。

风险判断：

- 中高风险。

长期结论：

- `node.meta(type)`、`node.capability(type)` 应有按 type 的稳定缓存。
- `selection` 应拆成：
  - `selection.members`
  - `selection.geometry`
  - `selection.summary`
  - `selection.affordance`
  而不是在一个 getter 里大量回查 node/edge 能力。

### 4.8 `query/selection/read.ts`

这是当前第二个明显“单 getter 过重”的文件。

现状：

- `toolbar` getter 内部会做：
  - node stats
  - edge stats
  - type grouping
  - lock state
  - uniform value 计算
  - schema/style support 判断
  - mindmap branch/border 读取
  - scope 组装

主要问题：

1. 单一 getter 体量过大。
   `resolveSelectionToolbar()` 基本承担了 selection 面板所有派生职责。

2. 大量 O(n) 扫描被重复叠加：
  - `every`
  - `some`
  - `reduce`
  - `filter`
  - `readUniformValue`
  - `readNodeMeta`
  - `supportsStyleField`

3. 同一批数据被多次重读。
   例如 node types、lock、groupId、style support、uniform value，本质上都在扫描同一批 selection node。

4. mixed selection 下会生成多层 scope，并为每个 scope 再次过滤 node/edge 子集。

风险判断：

- 高风险，P1。

长期结论：

- selection toolbar 必须分层：
  - `selection.members`
  - `selection.nodeStats`
  - `selection.edgeStats`
  - `selection.nodeScope`
  - `selection.edgeScope`
  - `selection.toolbar`
- 每一层都用稳定 key 做 memo，而不是每次 toolbar 读取时再把上面所有工作重做一遍。

### 4.9 `query/target.ts`

现状：

- 只是对 `node.nodes`、`edge.edges`、`bounds(target)` 的轻量包装。

风险判断：

- 低风险。
- 性能上不是热点。

长期结论：

- 可以保留，也可以后续折叠到 `selection/target` 语义里。
- 但它不是当前优化重点。

### 4.10 `query/utils.ts`

现状：

- 只有 `readUniformValue()`，本身是 O(n)。

风险判断：

- 低风险，函数本身没问题。
- 真正问题是它被 selection toolbar 高频、重复、叠加地调用。

长期结论：

- 不需要单独为 `readUniformValue()` 做缓存。
- 应该减少它被调用的次数和调用场景。

## 5. 外围放大器

这些不在 `query` 目录内，但会直接放大 query 的问题。

### 5.1 `CanvasScene.tsx` 全量挂载 scene item

现状：

- scene 中的 edge/node 都直接挂到 React 树里。
- 这意味着对应的 `query.node.render(nodeId)`、`query.edge.render(edgeId)` 会长期有订阅者。

影响：

- 只要 render getter 依赖粒度过粗，全量挂载就会把扇出成本全部放大出来。

结论：

- 即便未来不做 viewport virtualization，也必须先把 render getter 的依赖粒度收窄。

### 5.2 `layout.measureText()` 走真实 DOM 同步测量

现状：

- 最终使用 `getBoundingClientRect()` 读取宽高。

影响：

- 只要这条能力从 query 的热路径被调用，就天然存在 layout / style / sync measure 风险。

结论：

- 这不是“测量函数慢一点”的问题，而是“调用位置错了”。

## 6. 必须缓存的东西

下表给出必须引入缓存或索引的项，以及建议的 owner。

| 项目 | 当前问题 | 建议缓存 Key | 建议 Owner | 说明 |
| --- | --- | --- | --- | --- |
| Edge label 文字度量 | 现在在 `edge.render` 里同步测 DOM | `typography + text + placeholder + widthMode + wrapWidth + fontSize + fontWeight + fontStyle + frame` | `layout` / `text metrics service` | 这是最必须缓存的一项，且 query 不应直接触发测量 |
| Node type meta / capability | selection/model 与 selection/read 多次重复查 registry/schema | `node.type` | `query.node.meta(type)` 或 registry 自身 | 这是稳定纯函数缓存，非常值 |
| Edge path / bounds | label 改动、selection 改动不应重新解析 path | `edge geometry revision + endpoint geometry revision` | engine 或 `query.edge.geometry` | 几何与 label 内容必须分层 |
| Selection node stats | 当前 toolbar 每次从头算 | `selection key + selected node revisions summary` | `query.selection.stats` | 包括 type grouping、lock、hasGroup |
| Selection edge stats | 当前 toolbar 每次从头算 | `selection key + selected edge revisions summary` | `query.selection.stats` | 包括 type grouping |
| Mindmap transient layout | 当前 live edit 在 query 内整树 relayout | `treeId + tree revision + transient size overrides` | editor session/layout runtime | query 只读 materialized layout |
| Edge spatial hit candidates | 当前 marquee 全量扫描 edges | `viewport-independent spatial index revision` | engine index / hit service | 这不是普通 memo，而是索引 |

## 7. 明确不该继续重算的东西

下面这些重算应视为架构错误，而不是“可以再加一点 memo”。

1. 不要在 `edge.render(edgeId)` 内测量 label 文字。
2. 不要在 `node.render(nodeId)`、`edge.render(edgeId)` 内读取全局 selection。
3. 不要在 `node.item(nodeId)`、`edge.item(edgeId)` 内读取整个 edit session。
4. 不要在 marquee pointer move 期间全量扫描所有 edge。
5. 不要在 `selection.toolbar` 内重复扫描同一批 nodes/edges 多轮。
6. 不要在 `mindmap.item(treeId)` getter 内做 live edit 整树 relayout。
7. 不要在 query getter 内自行驱动时间时钟并插值动画。

## 8. 哪些地方不值得专门缓存

避免过度设计，同样重要。

下面这些点不值得单独再造一层缓存：

1. `query/target.ts`
   它只是轻量聚合，不是热点。

2. `selection.box`
   这是对 `model.summary.box` 的直接映射，保持现状即可。

3. `readUniformValue()` 函数本身
   不需要给这个 helper 做缓存，应该减少上层对它的重复调用。

4. `toolRead`
   这是轻量封装，不是性能问题来源。

## 9. 长期最优的 Query 目标形态

长期最优的目标不是“继续给现有 getter 叠缓存”，而是把 query 明确收敛成四类读：

1. 实体基础读
2. 实体 transient 投影读
3. 聚合摘要读
4. 命中与空间读

### 9.1 Node

建议最终收敛为：

```ts
node.base(nodeId): NodeItem | undefined
node.geometry(nodeId): NodeGeometryView | undefined
node.content(nodeId): NodeContentView | undefined
node.runtime(nodeId): NodeRuntimeView
node.render(nodeId): NodeRenderView | undefined
node.meta(type): NodeMeta
node.capability(type): NodeCapability
```

约束：

- `geometry` 只管位置、尺寸、旋转、mindmap owned rect。
- `content` 只管文本内容、文本编辑 draft、文本 preview。
- `runtime` 只管 hovered、selected、editing 这种按 id 可定位的运行时态。
- `render` 只是轻组合，不应再读取全局 selection/edit。

### 9.2 Edge

建议最终收敛为：

```ts
edge.base(edgeId): EdgeItem | undefined
edge.geometry(edgeId): EdgeGeometryView | undefined
edge.runtime(edgeId): EdgeRuntimeView
edge.labelContent(edgeId, labelId): EdgeLabelContentView | undefined
edge.labelMetrics(edgeId, labelId): Size | undefined
edge.labelPlacement(edgeId, labelId): EdgeLabelPlacement | undefined
edge.render(edgeId): EdgeRenderView | undefined
edge.idsInRect(rect, options): EdgeId[]
```

约束：

- `geometry` 只负责 path、bounds、ends、route points。
- `labelContent` 只处理 draft text。
- `labelMetrics` 只返回缓存好的内容尺寸，不能同步测 DOM。
- `labelPlacement` 只用 path + metrics 算摆放。
- `render` 只组合 geometry、runtime、placement。
- `idsInRect` 必须走索引，不得再用 list filter。

### 9.3 Selection

建议最终收敛为：

```ts
selection.members(): SelectionMembers
selection.summary(): SelectionSummary
selection.affordance(): SelectionAffordance
selection.nodeStats(): SelectionNodeStats
selection.edgeStats(): SelectionEdgeStats
selection.nodeScope(): SelectionToolbarNodeScope | undefined
selection.edgeScope(): SelectionToolbarEdgeScope | undefined
selection.overlay(): SelectionOverlay | undefined
selection.toolbar(): SelectionToolbarContext | undefined
selection.nodeSelected(nodeId): boolean
selection.edgeSelected(edgeId): boolean
```

约束：

- `toolbar()` 不能再是唯一的“大总装 getter”。
- `nodeSelected(nodeId)`、`edgeSelected(edgeId)` 是必须补出的 keyed runtime 读。

### 9.4 Mindmap

建议最终收敛为：

```ts
mindmap.base(treeId): MindmapItem | undefined
mindmap.layout(treeId): MindmapLayoutView | undefined
mindmap.animation(treeId): MindmapAnimationView | undefined
mindmap.render(treeId): MindmapRenderView | undefined
mindmap.tree(nodeId): MindmapTreeView | undefined
```

约束：

- `layout` 是 editor session/layout runtime 预先 materialize 的结果。
- `render` 只组合 connectors 与 node rect。
- query 不再负责 live relayout、RAF clock、enter 插值。

### 9.5 Hit / Spatial

建议补出独立命中能力：

```ts
hit.nodesInRect(rect, options): NodeId[]
hit.edgesInRect(rect, options): EdgeId[]
hit.edgeCandidates(rect): EdgeId[]
```

约束：

- 命中是空间索引问题，不应该挂在 query edge 里用 list filter 实现。

## 10. 最终缓存与失效策略

### 10.1 选择态与编辑态必须改成 keyed runtime read

应该新增的不是更多“读取 helper”，而是明确的中轴 runtime read：

```ts
edit.node(nodeId): NodeEditSession | undefined
edit.edgeLabel(edgeId): EdgeLabelEditSession | undefined
selection.nodeSelected(nodeId): boolean
selection.edgeSelected(edgeId): boolean
```

这样：

- node render 只失效当前 node。
- edge render 只失效当前 edge。
- 不再因为全局 selection/edit 变化扇出全场景重算。

### 10.2 文字度量必须变成缓存服务，而不是 query 临时调用

建议形态：

```ts
layout.readTextMetrics(key: TextMetricsKey): Size | undefined
layout.ensureTextMetrics(key: TextMetricsKey): void
```

其中：

- `readTextMetrics` 是纯读，不触发同步 DOM。
- `ensureTextMetrics` 可由编辑态、挂载态、异步刷新或批处理机制触发。

如果短期仍保留同步测量能力，也必须封在 layout service 内部缓存，query 只能读缓存结果，不能自己决定测不测。

### 10.3 Selection 聚合必须按层缓存

建议至少分三层：

```ts
selection.members()
selection.stats()
selection.scopes()
selection.toolbar()
```

这样可以避免：

- overlay 读取时被迫重算 toolbar 逻辑
- toolbar 读取时重复重算 stats
- mixed selection 每次都反复 filter 子集

### 10.4 Mindmap 布局必须提前 materialize

正确方向：

- 文本尺寸变化时，editor session/layout runtime 更新对应 tree 的 transient layout。
- query 只读取 `mindmap.layout(treeId)`。
- enter 动画也应写成 transient animation state，由时间驱动层更新，而不是 query getter 自带 clock。

## 11. 优先级排序

### P0

1. 把 `edge label metrics` 从 `query.edge.render` 中拆出去。
2. 禁止 query 热路径同步 DOM 文字测量。

### P1

1. 为 node/edge render 引入 keyed selection/edit runtime read。
2. 把 `edge.idsInRect()` 从全量扫描改为空间索引。
3. 把 `selection.toolbar` 拆成分层聚合缓存。

### P2

1. 把 `mindmap` live relayout 从 query 移到 session/layout runtime。
2. 拆开 `node`、`edge` 的 geometry/content/runtime 投影。
3. 给 `node.meta(type)`、`node.capability(type)` 做稳定缓存。

### P3

1. 收敛 `target.ts` 这类薄包装层。
2. 根据场景规模决定是否补 viewport virtualization，但这一步应放在前面几个问题之后。

## 12. 最终结论

当前 `query` 的真正性能风险，不在于“derived store 不够多”，而在于三件事：

1. keyed getter 读了全局态，导致失效面过大。
2. 热读路径夹带了同步 DOM 测量。
3. 聚合与空间查询仍有大量整批重算和全量扫描。

所以长期最优方向非常明确：

- `query` 只做纯读组合，不做 DOM 测量、不做整树布局、不做时间驱动。
- 所有高频 runtime 状态都改成 keyed read，而不是全局态下沉到每个实体 getter。
- 所有重聚合逻辑都按层缓存，避免一个 getter 承担整个 toolbar/selection 系统。
- 所有空间命中都交给索引，而不是 query 临时遍历。

如果按这个方向收敛，`query` 最终会变成一个清晰的、可维护的读模型层，而不是目前这种“读模型 + 临时计算器 + DOM 测量入口 + 聚合总装器”的混合体。

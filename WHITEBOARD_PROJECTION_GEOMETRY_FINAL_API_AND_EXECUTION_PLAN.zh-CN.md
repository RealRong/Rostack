# Whiteboard Projection Geometry 最终 API 与实施方案

## 目标

本文档只定义 `whiteboard` 几何系统的最终态，不讨论兼容、过渡、双轨保留。

最终目标固定为：

- 所有最终几何读取一律走 projection。
- committed document 只承担持久化语义与几何输入职责。
- render / hit-test / edge anchor / spatial / selection / viewport / snap / UI chrome 不再直接读取 raw document geometry。
- `mindmap` 只是 projection 中的一种 owner / layout 规则，不再拥有额外一套“文档几何真值”。

## 最终架构结论

## 1. committed geometry 不是最终几何，只是 projection 输入

最终必须明确区分两类数据：

- document input：`position / size / rotation / structure / owner / layout spec`
- projected geometry：`rect / bounds / outline / route / bbox / connectors`

规则固定为：

- committed document 可以保存几何字段。
- 这些字段只表示“下一轮 projection 计算的输入”。
- 所有外部最终消费都不直接读取 committed geometry。
- 最终几何只从 projection graph 读取。

这条规则适用于所有 node，不只是 mindmap topic。

## 2. projection 是唯一正式几何真值层

最终 whiteboard 的几何真值层只有一处：

- `graph.nodes.get(id)?.geometry`
- `graph.edges.get(id)?.route`
- `graph.owners.mindmaps.get(id)?.tree.layout`
- `graph.owners.groups.get(id)?.frame`

这意味着：

- node rect / bounds / outline / rotation 真值来自 `NodeView.geometry`
- edge route / ends / bounds / label rect 真值来自 `EdgeView.route`
- mindmap topic layout 真值来自 `MindmapView.tree.layout`
- group frame 真值来自 `GroupView.frame`

任何最终交互、渲染、选择、命中、空间索引，都不得绕过这层回退到 committed document。

## 3. document 层不再公开“正式几何读口”

`document.query` 只保留语义与持久化读取：

- `get()`
- `background()`
- `node(id)`
- `edge(id)`
- `nodeIds()`
- `edgeIds()`
- `slice(...)`

最终必须删除：

- `document.nodeGeometry(id)`
- `document.bounds()`
- 任何基于 raw document 重新解析 node rect / edge bounds 的公共 API

raw document geometry resolver 不是最终态基础设施，只能作为迁移过程中的内部临时实现，最终必须删除。

## 字段语义最终定义

## 1. 普通 node

普通 node 的 committed 字段语义：

- `position`：持久化输入
- `size`：持久化输入
- `rotation`：持久化输入

普通 node 的最终读取语义：

- 位置、尺寸、包围盒、outline、连接点一律读 projection geometry

原因：

- preview patch 可能覆盖 `position / size / rotation`
- live text measure 可能临时覆盖 `size`
- frame / group / owner / runtime preview 也可能影响最终读取结果

因此即使普通 node 也不允许外部把 committed `position / size` 当成最终几何真值。

## 2. `mindmap` root

`mindmap root` 的 committed 字段语义：

- `position`：持久化输入，表示整棵 mindmap 的 anchor
- `size`：持久化输入
- `rotation`：持久化输入

`mindmap root` 的最终读取语义：

- root 当前显示 rect 仍然从 projection 读取
- committed `position` 只是 projection layout 的 anchor input，不是外界最终读取面

## 3. `mindmap` 非 root topic

最终定义固定为：

- `size`：持久化输入
- `rotation`：持久化输入
- `position`：不再作为 document 真值

非 root topic 的位置必须由 projection 根据以下输入派生：

- root anchor
- tree structure
- layout spec
- committed topic size
- runtime draft measure
- runtime preview

结论：

- 非 root topic 的最终位置只能读 projection
- mutation/core 不再把 child topic 的 layout position 写回 document 作为正式真值

## 4. edge

edge 的 committed 字段语义：

- source / target / route / labels / style / textMode 等是持久化输入

edge 的最终读取语义：

- path
- segments
- handles
- resolved ends
- route bounds
- label rect / mask rect

全部从 projection edge view 读取。

原因：

- node geometry 本身已经是 projection 输出
- edge route 解析必须建立在 projection node geometry 之上
- label measure / edit draft 也会改变最终展示 geometry

## 5. group / frame / owner

group、frame、owner 类几何全部视为 projection derived state：

- group frame bounds
- frame descendants containment
- owner bbox
- scene item bounds

都不得再由 raw document geometry 单独推导一套公共查询结果。

## 最终 API 设计

## 1. `Query.document`

最终只保留语义读取：

```ts
interface DocumentQuery {
  get(): WhiteboardDocument
  background(): WhiteboardDocument['background'] | undefined
  node(id: NodeId): Node | undefined
  edge(id: EdgeId): Edge | undefined
  nodeIds(): readonly NodeId[]
  edgeIds(): readonly EdgeId[]
  slice(input: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }): SliceExportResult | undefined
}
```

禁止出现：

```ts
document.nodeGeometry(id)
document.bounds()
```

## 2. `Query.node`

`query.node.get(id)` 返回的 `NodeView` 是 node 最终几何的正式读口。

最终规则：

- 任何需要 node rect / bounds / outline / rotation 的调用方，只能读 `NodeView.geometry`
- 不再提供第二套 document geometry helper

## 3. `Query.edge`

`query.edge.get(id)` 返回的 `EdgeView` 是 edge 最终几何的正式读口。

最终规则：

- 任何需要 edge path / handles / labels / bounds / endpoints 的调用方，只能读 `EdgeView`

## 4. `Query.mindmap`

`query.mindmap.get(id)` 返回的 `MindmapView` 是 mindmap owner 级 layout 的正式读口。

最终规则：

- topic tree layout
- tree bbox
- render connectors

只能从这里读取。

## 5. `Query.group`

`query.group.get(id)` 返回的 `GroupView` 是 group frame / structure 的正式读口。

## 6. 新增 `Query.scene.bounds()`

必须新增 scene 级 bounds 查询，用于 viewport fit、缩放到内容等需求。

最终 API：

```ts
interface Query {
  scene: {
    bounds(): Rect | undefined
  }
}
```

规则固定为：

- `scene.bounds()` 基于 projection graph / spatial 当前状态计算
- 不允许再从 raw document 重新解析全量 bounds

`ViewportDock`、viewport fit、导出预览等场景统一使用这一读口。

## 7. selection / hit / snap / spatial 的 geometry 读口统一

以下模块都必须只消费 projection：

- `selection.summary / affordance / bounds / move`
- `hit.node / hit.edge / hit.item`
- `snap`
- `spatial`
- `frame`

不允许这些模块内部直接调 raw document geometry resolver。

## projection 内部最终职责

## 1. graph phase

`graph` phase 负责把 committed document 与 runtime overlays 合成为最终几何视图：

- node committed input
- node preview patch
- node draft measure
- owner derived rect
- edge draft / preview
- edge label measure
- mindmap structure/layout
- group structure

graph phase 输出：

- `NodeView`
- `EdgeView`
- `MindmapView`
- `GroupView`

这是唯一几何真值层。

## 2. spatial phase

`spatial` 只索引 graph 输出：

- node bounds 读 `graph.nodes[*].geometry.bounds`
- edge bounds 读 `graph.edges[*].route.bounds`
- mindmap bounds 读 `graph.owners.mindmaps[*].tree.bbox`
- group bounds 读 `graph.owners.groups[*].frame.bounds`

不得自行根据 document 再算一套 bounds。

## 3. render phase

`render` 只消费 graph / spatial / ui state：

- node render 读 projection node geometry
- edge render 读 projection edge view
- overlay / chrome 读 projection query

render 绝不接触 committed geometry。

## 4. write / interaction phase

write 与交互要区分输入层和读取层：

- intent / mutation 仍然写 committed input
- transform / text measure / connect preview / viewport fit 读取时必须走 projection

也就是说：

- “写什么”是 document 语义问题
- “现在看到什么”是 projection 几何问题

两者不能混用。

## mindmap 的最终承接方式

## 1. root anchor 持久化

`mindmap root.position` 保持持久化，用作 owner anchor 输入。

## 2. child topic position 投影化

非 root topic 的最终位置只在 projection 中存在。

mutation / core 不再把 child topic layout position 写回 document 作为正式语义。

## 3. topic size 持久化

所有 topic 的 `size` 继续持久化。

原因固定为：

- 它是 layout input
- 它被 text commit / sanitize / history / document schema 直接依赖
- 当前系统没有 document 级稳定测量服务可以替代 committed size

## 4. topic 的最终 rect 仍然只从 projection 读取

即使 `size` 是 committed input，最终读取也不允许直接读 committed `size`。

最终读取统一为：

- `NodeView.geometry.rect.width`
- `NodeView.geometry.rect.height`

因为当前最终 size 可能来自：

- committed `node.size`
- preview patch `patch.size`
- live text measure `draftMeasure.size`
- owner layout tree rect

## 明确删除的设计

以下设计不是最终态，必须删除：

- raw document geometry resolver 作为 public query 能力
- document bounds 作为 viewport fit 的正式来源
- mindmap child topic position 的 committed 真值语义
- render / hit / selection / spatial 中任何 document geometry fallback
- 因为 query 不统一而长期并存的 `document geometry` 与 `graph geometry` 双轨读取

## 实施方案

## Phase 1. 收口 public query API

必须完成：

- 从 `DocumentQuery` 中删除 `nodeGeometry()` 与 `bounds()`
- 新增 `query.scene.bounds()`
- 删除 `editor-scene` 对外 re-export 的 `DocumentNodeGeometry`
- 明确 `query.node.get / edge.get / mindmap.get / group.get` 是唯一最终几何入口

阶段完成标准：

- 外部再也拿不到 public raw document geometry API

## Phase 2. 替换 editor / react 调用点

必须完成：

- `whiteboard-editor/src/write/node.ts` 文本测量基线改读 projection node rect
- `whiteboard-editor/src/input/features/transform.ts` 变换预览文本测量基线改读 projection node rect
- `whiteboard-react/src/features/viewport/ViewportDock.tsx` 改读 `query.scene.bounds()`
- 其余所有 `document.nodeGeometry / document.bounds` 调用全部删除

阶段完成标准：

- editor / react 没有任何 raw document geometry 消费点

## Phase 3. 删除 scene 内部 raw geometry resolver

必须完成：

- 删除 `whiteboard-editor-scene/src/model/document/resolver.ts` 中的 geometry/bounds/path 解析职责
- `DocumentQuery` 只保留 document 语义读能力
- scene bounds 改为基于 graph / spatial 汇总

阶段完成标准：

- `editor-scene` 不再维护第二套 document geometry cache

## Phase 4. mindmap position 语义收口

必须完成：

- 保留 root `position` 的 committed input 语义
- 删除 child topic committed `position` 的正式真值语义
- projection graph 成为 topic rect 的唯一来源
- `whiteboard-core` 停止把 child topic layout position 写回 document 作为正式长期状态

阶段完成标准：

- child topic 最终位置只存在于 projection

## Phase 5. 统一 geometry 读取规则到所有子系统

必须完成：

- render 全量只读 projection
- hit-test 全量只读 projection
- edge anchor / reconnect / preview 全量只读 projection
- spatial 全量只索引 projection bounds
- selection / frame / group / snap 全量只读 projection

阶段完成标准：

- whiteboard 所有最终几何消费模块只剩一套几何来源

## Phase 6. 最终收尾

必须完成：

- 删除与 raw document geometry 相关的多余类型、helper、re-export
- 删除为了双轨并存而存在的 fallback 逻辑
- 清理命名，确保 API 层不再出现让调用方误判语义的 geometry helper

阶段完成标准：

- 从 API、类型、调用点三个层面彻底消灭“document geometry 与 projection geometry 双轨”

## 最终验收标准

以下条件必须同时成立：

- 所有最终几何读取都经过 projection
- document 只保留语义与输入，不再是最终几何公共读面
- `mindmap root.position` 持久化，child topic position 投影化
- 所有 node/topic size 持久化，但最终读取仍然通过 projection rect
- render / hit / edge / spatial / selection / viewport / snap 全部不再读取 raw document geometry
- scene 内部不存在第二套公开的 document geometry resolver

这就是 whiteboard geometry 系统的长期最优终态。

# Whiteboard Editor Scene 清理最终方案

## 1. 目标

- 本文只讨论：
  `whiteboard/packages/whiteboard-editor/src/scene`
- 目标不是“继续局部优化”，而是把这层彻底整理干净，收敛到长期最优。
- 不考虑兼容旧结构，不保留多余 facade，不为了少改调用方而继续堆中间层。

一句话：

- `whiteboard-editor/src/scene` 不应再承担第二套 scene model。
- 它最终只应该承担：
  - 把 `editor-scene` 暴露给 editor
  - 提供少量 host-only runtime/helper

---

## 2. 最终结论

### 2.1 这一层最终只该剩下什么

`whiteboard-editor/src/scene` 最终应只剩两类东西：

1. `source`
   负责组装最终 `editor.scene` public shape：
   - `query`
   - `stores`
   - `host`

2. `host`
   只放 editor host 本地 helper：
   - `pick`
   - `visible`
   - `scope`
   - 如仍有必要的 revision memo geometry

除此之外，不应再保留：

- `node` 二次 view projection
- `edge` 二次 view projection
- `selection` 二次 projection
- `mindmap` chrome / navigate helper 混合层
- 根级别重复 facade

### 2.1.1 硬性原则：query 和 view 一律下沉到 `editor-scene`

这次清理有一条硬性原则，必须写死：

- **凡是 query 相关能力，一律属于 `editor-scene`。**
- **凡是 view/read model 相关能力，一律属于 `editor-scene`。**

`whiteboard-editor/src/scene` 不允许再做下面这些事：

- 定义新的 query helper 并挂到 editor scene runtime
- 定义新的 node/edge/mindmap/group view model
- 把 `editor-scene` 里已有的 query/view 再包装一层中转接口
- 以“方便调用方”为理由继续保留 `nodes.read` / `edges.read` / `mindmap.view` 这一类 facade

最终规则只有两条：

1. 如果能力属于 query 或 view model：
   必须进入 `editor-scene`。
2. 如果 `editor-scene` 已经有了：
   **直接改调用方使用，不允许在 `whiteboard-editor/src/scene` 再中转。**

### 2.2 这一层最终不该再做什么

`whiteboard-editor/src/scene` 不应再：

- 把 `graph + graph.state + render` 再拼成一份 `nodes.read` / `edges.read`
- 把 `query` 再包装成另一套 `node/edge/group/mindmap/frame/snap`
- 自己维护第二份 pick precise resolve 主逻辑
- 自己定义 node/edge “编辑器视图模型”作为长期 canonical 读模型

这些都属于重复投影。

### 2.3 对 `whiteboard-editor/src/scene` 的最终定位

最终定位必须非常严格：

- `editor-scene`
  负责：
  - query
  - graph/state/render stores
  - canonical view/read model
  - hit / spatial / frame / snap

- `whiteboard-editor/src/scene`
  只负责：
  - 暴露 `query / stores / host`
  - 放极少数 host-only runtime/helper

也就是说：

- `scene/` 不是 query 层
- `scene/` 不是 view model 层
- `scene/` 不是 projection 层
- `scene/` 不是 adapter 层

它只是 editor 把 `editor-scene` 接出来，并补 host 能力的薄层

---

## 3. 先决原则：已有能力直接用，不再中转

在实施之前，先把口径写清楚：

- 如果 `editor-scene.query` 已经有这个能力：
  调用方直接改用 `editor.scene.query.*`
- 如果 `editor-scene.stores` 已经有这个能力：
  调用方直接改用 `editor.scene.stores.*`
- 如果某个旧 helper 的唯一作用只是“换个名字转发”：
  直接删除，不保留过渡层

典型必须删除的中转形式：

- `scene.nodes.read -> stores.render.node.byId`
- `scene.edges.read -> stores.graph.edge.byId` 或 `stores.render.edge.*`
- `scene.mindmap.view -> stores.graph.mindmap.byId`
- `scene.group.exact -> query.group.exact`
- `scene.edge.render.* -> stores.render.edge.*`
- `scene.frame -> query.frame`
- `scene.snap.rect -> query.snap`

最终要求：

- `whiteboard-editor/src/scene` 不允许存在“只是把 `editor-scene` 再包一层”的接口。

---

## 4. 最终目录形态

最终目录应收敛为：

```txt
whiteboard/packages/whiteboard-editor/src/scene/
  source.ts
  host/
    geometry.ts
    pick.ts
    scope.ts
    visible.ts
```

说明：

- `source.ts`
  只做最终 `EditorSceneSource` 装配。
- `host/geometry.ts`
  只做 host-level revision memo。
- `host/pick.ts`
  只做 frame-throttled pick runtime。
- `host/scope.ts`
  只做 move/bounds 这类 host helper。
- `host/visible.ts`
  只做 visible rect query memo。

最终不应再保留：

```txt
scene/node.ts
scene/edge.ts
scene/selection.ts
scene/mindmap.ts
scene/cache/*
```

其中：

- `cache` 目录这个名字也不应保留。
- 这些文件里的剩余纯逻辑，要么下沉到 `editor-scene`，要么下沉到 `whiteboard-core`，要么迁去 `session`。

---

## 5. 现有文件逐个处理

## 5.1 `scene/source.ts`

当前问题：

- 同时暴露最终 public shape 和大量旧 facade。
- 同时装配：
  - `query / stores / host`
  - `items / pick / snap / geometry / scope / frame`
  - `node / edge / nodes / edges / selection / mindmap / group / chrome`
- 还维护了一层 `SceneProjectionStores` 别名映射。

最终要求：

- `source.ts` 只返回：

```ts
type EditorSceneSource = {
  revision(): number
  query: SceneQuery
  stores: RuntimeStores
  host: {
    pick: ScenePickRuntime
    visible(...): ...
    geometry: {
      node(nodeId): NodeRenderView | undefined
      edge(edgeId): EdgeGeometryView | undefined
      order(item): number
    }
    scope: {
      move(target): {
        nodes: readonly Node[]
        edges: readonly Edge[]
      }
      bounds(target): Rect | undefined
    }
  }
}
```

必须删除：

- `items`
- `pick`
- `snap`
- `geometry`
- `scope`
- `frame`
- `node`
- `edge`
- `nodes`
- `edges`
- `selection`
- `mindmap`
- `group`
- `chrome`

这些如果还有内部调用需求，应改为直接读：

- `scene.query.*`
- `scene.stores.*`
- `scene.host.*`

并且这里要进一步收紧：

- `source.ts` 不允许再把 `query` 里的字段拆散到根级别。
- `source.ts` 不允许再把 `stores` 里的字段拆散到根级别。
- `source.ts` 不允许为 query/view 能力新增任何同义转发。

### 对 `SceneProjectionStores` 的结论

这层长期也不应该保留。

原因：

- 它只是把 `stores.graph.node` 改名成 `nodeGraph`、把 `stores.graph.state.node` 改名成 `nodeUi`。
- 这种 rename facade 会继续制造“到底哪层才是真数据源”的歧义。

最终应直接用：

- `controller.stores.graph.*`
- `controller.stores.render.*`

而不是再做一层本地 alias object。

---

## 5.2 `scene/node.ts`

当前问题：

- 定义了 `EditorNodeView`，把：
  - `RuntimeNodeView`
  - `NodeUiView`
  再投影成一份 editor 本地视图。
- 定义了 `GraphNodeRead`，提供：
  - `get`
  - `view`
  - `all`
  - `nodes`
  - `capability`
  - `idsInRect`
- `resolveNodeCapability` 还在这里对 owner 做二次修正。

最终结论：

- 这整个文件不该继续存在于 `editor/src/scene`。

拆分方式：

1. `toSpatialNode`
   下沉到 `whiteboard-core/node` 或 `editor-scene` 对应 primitive。

2. `resolveNodeCapability`
   下沉到 `editor-scene` 或 node type infra。
   它本质是 view/read model 语义的一部分，不应留在 editor scene facade。

3. `idsInRect`
   如果仍需要，进入 `editor-scene.query.hit/query.node/query.spatial` 体系。
   不应继续挂在 editor 本地 `nodes.read` 上。

4. `EditorNodeView`
   直接删除。
   React 与 editor 其他调用方直接读 `stores.render.node.byId`。

一句话：

- `node.ts` 是“旧架构里 editor 自己再投一份 node view”的残留，长期必须删掉。

---

## 5.3 `scene/edge.ts`

当前问题：

- 和 `node.ts` 一样，继续维护：
  - `EditorEdgeView`
  - `EditorEdgeDetail`
  - `GraphEdgeRead`
- 还承担 `resolveGraphEdgeGeometry`。

最终结论：

- 这个文件也不该继续存在于 `editor/src/scene`。

拆分方式：

1. `resolveGraphEdgeGeometry`
   下沉到 `whiteboard-core` 或 `editor-scene`。
   这是 query/view primitive，不该放在 editor facade 层。

2. `EditorEdgeView`
   删除。
   调用方直接读：
   - `stores.graph.edge.byId`
   - `stores.graph.state.edge.byId`
   - `stores.render.edge.*`

3. `EditorEdgeDetail`
   如果还有必要，放到 `editor-scene` 的 `query.edge` 或 `stores.render.edge` 体系。
   不该在 editor 再建一份本地 read layer。

4. `connectCandidates`
   若长期保留，应进入：
   - `editor-scene.query.edge.connectCandidates`
   或更通用的 connect query primitive。

一句话：

- `edge.ts` 当前还承担了“edge render/hit/geometry 的第二投影层”，长期必须下沉或删除。

---

## 5.4 `scene/selection.ts`

当前问题：

- 这里做的是 selection summary / affordance / selected stores。
- 它依赖 scene 数据，但它本质上是 session/presentation 派生，不是 scene canonical runtime。

最终结论：

- 这个文件不应继续放在 `scene/` 命名空间下。

最终归属：

- 如果它仍然是 selection view/read model：
  下沉到 `editor-scene`。
- 如果它本质是 session/panel/chrome presentation：
  迁移到 `session/` 侧。

推荐位置：

```txt
whiteboard/packages/whiteboard-editor-scene/src/...   // selection query/view truth
whiteboard/packages/whiteboard-editor/src/session/... // selection presentation
```

原因：

- selection 相关能力必须先拆成两种：
  - query/view truth
  - session presentation
- 前者留在 `editor-scene`
- 后者留在 `session`
- 两者都不该继续留在 `editor/src/scene`

---

## 5.5 `scene/mindmap.ts`

当前问题：

- 混了两种完全不同的能力：
  - `readMindmapNavigateTarget`
  - `readAddChildTargets`
- 前者是纯结构导航。
- 后者是 UI chrome affordance。

最终结论：

- 这个文件必须拆开，不应继续整体留在 `scene/`。

拆分方式：

1. `readMindmapNavigateTarget`
   如果只是纯 structure primitive，下沉到 `whiteboard-core/mindmap`。
   如果最终调用面属于 scene query，则由 `editor-scene.query.mindmap.*` 直接暴露。

2. `readAddChildTargets`
   迁移到 session/chrome presentation。
   推荐位置：

```txt
whiteboard/packages/whiteboard-editor/src/session/presentation/mindmapChrome.ts
```

3. `MindmapChrome`
   作为 session/chrome 输出类型，也不应再挂在 `scene`。

补充约束：

- `mindmap` 的 query/view 如果已经在 `editor-scene` 存在，调用方直接使用。
- `editor/src/scene` 不允许再保留 `mindmap.view`、`mindmap.navigate` 这一类中转接口。

---

## 5.6 `scene/pick.ts`

当前状态已经明显变好：

- 不再维护第二套 node/edge precise resolve 主逻辑。
- 已改为直接依赖 `query.hit.item + spatial.candidates`。

最终结论：

- 逻辑可以保留。
- 位置要改。

最终位置：

```txt
scene/host/pick.ts
```

最终接口：

- 只暴露 frame-throttled runtime。
- `resolve/candidates/rect` 这类同步 helper 不属于长期必须面。

也就是说，长期最优版本可以进一步收成：

```ts
type ScenePickRuntime = {
  schedule(request): void
  get(): ScenePickRuntimeResult | undefined
  subscribe(listener): Unsubscribe
  clear(): void
  dispose(): void
}
```

---

## 5.7 `scene/cache/geometry.ts`

当前问题：

- 依赖 `scene/edge.ts` 的 `resolveGraphEdgeGeometry`。
- 说明 host geometry memo 还建立在 editor 本地 edge primitive 之上。

最终结论：

- 逻辑可以保留，位置和依赖要清理。

最终位置：

```txt
scene/host/geometry.ts
```

最终要求：

- 只做 revision-based memo。
- 不再依赖 `scene/edge.ts`。
- 底层 edge geometry primitive 必须直接来自：
  - `editor-scene`
  - 或 `whiteboard-core`

补充约束：

- 如果 `editor-scene` 已经提供可直接消费的 edge geometry / node render view：
  `host.geometry` 只做 memo，不再重算、不再转义、不再二次包装。

---

## 5.8 `scene/cache/scope.ts`

当前问题：

- 语义上是 host helper，不是 cache infra。
- `relatedEdges` 已经来自 `query.edge.related`，没有必要继续包一层“scene cache”语义。

最终结论：

- 逻辑可以保留。
- 应迁到：

```txt
scene/host/scope.ts
```

最终接口只保留：

- `move`
- `bounds`

不再单独暴露：

- `relatedEdges`

因为这个能力已经属于 `query.edge.related`。

---

## 5.9 `scene/cache/visible.ts`

当前问题：

- 本质是 host-level memo helper，不是 scene canonical cache。

最终结论：

- 保留逻辑。
- 重命名并迁移到：

```txt
scene/host/visible.ts
```

---

## 5.10 `scene/cache/order.ts`

当前问题：

- 只是 `items -> order index` 的本地 memo。
- 职责很小，但不应放在 `cache` 目录里。

最终结论：

- 若 `host.geometry.order` 还需要，就并入 `host/geometry.ts`。
- 不需要单独文件。

---

## 6. 最终数据源原则

`whiteboard-editor/src/scene` 清理时必须遵守这条原则：

- **editor 内部不得再制造第二套 scene truth。**

最终只能有这三层：

1. `scene.query`
   同步查询语义真相。

2. `scene.stores`
   reactive scene/read model。

3. `scene.host`
   editor host-only helper/runtime。

凡是一个能力能直接从 `query` 或 `stores` 读到，就不允许再在 `scene/` 下包装成：

- `nodes.read`
- `edges.read`
- `mindmap.view`
- `group.exact`
- `chrome`
- `selection`

这类旧 facade。

补充成硬性要求：

- 能放进 `editor-scene.query` 的，一律放进去。
- 能放进 `editor-scene.stores` 的，一律放进去。
- `whiteboard-editor/src/scene` 只允许“直接暴露”和“host-only helper”两类代码。
- 不允许存在第三类“editor 本地 query/view adapter”。

---

## 7. 最终实施方案

## P0. 收口 public shape

修改：

- `scene/source.ts`

要求：

- `EditorSceneRuntime` 只保留：
  - `revision`
  - `query`
  - `stores`
  - `host`

删除根级字段：

- `items`
- `pick`
- `snap`
- `geometry`
- `scope`
- `frame`
- `node`
- `edge`
- `nodes`
- `edges`
- `selection`
- `mindmap`
- `group`
- `chrome`

完成标志：

- `editor.scene` public type 与文档完全一致。

## P1. 迁移内部调用

把 editor / react / test 里的调用改成：

- `scene.query.*`
- `scene.stores.*`
- `scene.host.*`

并且明确：

- 如果某能力已在 `editor-scene` 存在：
  直接改调用方。
- 不允许为了少改调用方，在 `editor/src/scene` 新增转发。

禁止继续引入：

- `scene.nodes.*`
- `scene.edges.*`
- `scene.edge.render.*`
- `scene.mindmap.*`
- `scene.group.*`

完成标志：

- `src/` 代码里不再出现上述旧接口引用。
- `whiteboard-editor/src/scene` 不再新增任何 query/view 同义 facade。

## P2. 删除 node/edge 二次 projection

删除：

- `scene/node.ts`
- `scene/edge.ts`

前置迁移：

- `toSpatialNode`
- `resolveNodeCapability`
- `resolveGraphEdgeGeometry`
- `connectCandidates`

分别下沉到：

- `whiteboard-core`
- `editor-scene`
- node type/session infra

完成标志：

- editor 不再定义 `EditorNodeView` / `EditorEdgeView`。
- node/edge 相关 query/view 调用全部直接使用 `editor-scene`。

## P3. 清理 selection/mindmap 非 scene 职责

迁移：

- `scene/selection.ts` -> `session/projection/selection.ts`
- `scene/mindmap.ts`
  - navigation primitive -> `whiteboard-core/mindmap`
  - chrome affordance -> `session/presentation/mindmapChrome.ts`

补充：

- 如果 selection/mindmap 某部分本质上仍然是 query/view truth：
  先迁入 `editor-scene`
  再修改调用方直接使用
  不允许留在 `editor/src/scene`

完成标志：

- `scene/` 目录内不再承载 session/chrome 逻辑。
- `scene/` 目录内不再承载 selection/mindmap query/view truth。

## P4. 重组 host helper

重组：

- `scene/pick.ts` -> `scene/host/pick.ts`
- `scene/cache/geometry.ts` -> `scene/host/geometry.ts`
- `scene/cache/scope.ts` -> `scene/host/scope.ts`
- `scene/cache/visible.ts` -> `scene/host/visible.ts`
- `scene/cache/order.ts` -> 合并进 `host/geometry.ts`

完成标志：

- `cache` 目录被删除。

## P5. 最终删除重复 facade

删除：

- `SceneProjectionStores`
- 任何 `nodeGraph/nodeUi/edgeGraph/edgeUi` 这类本地 rename facade

要求：

- `source.ts` 内部直接使用 `controller.stores.*`

完成标志：

- `source.ts` 只剩 public shape 装配。

---

## 8. 最终完成态

完成后，`whiteboard-editor/src/scene` 应满足：

1. 不再拥有第二套 scene read model。
2. 不再拥有第二套 node/edge view model。
3. 不再拥有第二套 selection/mindmap presentation model。
4. 不再把 `editor-scene` 再包装成旧接口 facade。
5. 只保留 `query / stores / host`。
6. host helper 文件名与职责一致，不再用 `cache` 这种模糊命名。
7. query 相关能力全部在 `editor-scene`。
8. view 相关能力全部在 `editor-scene`。
9. 如果 `editor-scene` 已有能力，调用方直接用，不再经过 `editor/src/scene` 中转。

最终判断标准只有一个：

- 新同学看到 `scene/` 目录时，能立刻分清：
  - 哪些是 scene truth
  - 哪些是 host helper
  - 哪些根本不该在这里

如果还需要解释“这个字段只是历史兼容保留”，说明这次清理还没完成。

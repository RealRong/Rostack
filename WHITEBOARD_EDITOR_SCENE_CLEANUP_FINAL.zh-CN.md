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

### 2.2 这一层最终不该再做什么

`whiteboard-editor/src/scene` 不应再：

- 把 `graph + graph.state + render` 再拼成一份 `nodes.read` / `edges.read`
- 把 `query` 再包装成另一套 `node/edge/group/mindmap/frame/snap`
- 自己维护第二份 pick precise resolve 主逻辑
- 自己定义 node/edge “编辑器视图模型”作为长期 canonical 读模型

这些都属于重复投影。

---

## 3. 最终目录形态

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

## 4. 现有文件逐个处理

## 4.1 `scene/source.ts`

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

## 4.2 `scene/node.ts`

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
   下沉到 node type infra。
   它本质是 node capability 语义的一部分，不是 scene facade 逻辑。

3. `idsInRect`
   如果仍需要，进入 `editor-scene.query.hit/query.node/query.spatial` 体系。
   不应继续挂在 editor 本地 `nodes.read` 上。

4. `EditorNodeView`
   直接删除。
   React 直接读 `stores.render.node.byId`。

一句话：

- `node.ts` 是“旧架构里 editor 自己再投一份 node view”的残留，长期必须删掉。

---

## 4.3 `scene/edge.ts`

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
   这是 edge geometry primitive，不该放在 editor facade 层。

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

## 4.4 `scene/selection.ts`

当前问题：

- 这里做的是 selection summary / affordance / selected stores。
- 它依赖 scene 数据，但它本质上是 session/presentation 派生，不是 scene canonical runtime。

最终结论：

- 这个文件不应继续放在 `scene/` 命名空间下。

最终归属：

- 迁移到 `session/` 侧。

推荐位置：

```txt
whiteboard/packages/whiteboard-editor/src/session/projection/selection.ts
```

原因：

- selection 是 session truth 的一部分。
- 它读 scene，但不属于 scene 自身。
- 把它放在 `scene` 会让 “scene truth” 和 “selection presentation” 混在一起。

---

## 4.5 `scene/mindmap.ts`

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
   下沉到 `whiteboard-core/mindmap`。
   这是纯 structure primitive。

2. `readAddChildTargets`
   迁移到 session/chrome presentation。
   推荐位置：

```txt
whiteboard/packages/whiteboard-editor/src/session/presentation/mindmapChrome.ts
```

3. `MindmapChrome`
   作为 session/chrome 输出类型，也不应再挂在 `scene`。

---

## 4.6 `scene/pick.ts`

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

## 4.7 `scene/cache/geometry.ts`

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

---

## 4.8 `scene/cache/scope.ts`

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

## 4.9 `scene/cache/visible.ts`

当前问题：

- 本质是 host-level memo helper，不是 scene canonical cache。

最终结论：

- 保留逻辑。
- 重命名并迁移到：

```txt
scene/host/visible.ts
```

---

## 4.10 `scene/cache/order.ts`

当前问题：

- 只是 `items -> order index` 的本地 memo。
- 职责很小，但不应放在 `cache` 目录里。

最终结论：

- 若 `host.geometry.order` 还需要，就并入 `host/geometry.ts`。
- 不需要单独文件。

---

## 5. 最终数据源原则

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

---

## 6. 最终实施方案

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

禁止继续引入：

- `scene.nodes.*`
- `scene.edges.*`
- `scene.edge.render.*`
- `scene.mindmap.*`
- `scene.group.*`

完成标志：

- `src/` 代码里不再出现上述旧接口引用。

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

## P3. 清理 selection/mindmap 非 scene 职责

迁移：

- `scene/selection.ts` -> `session/projection/selection.ts`
- `scene/mindmap.ts`
  - navigation primitive -> `whiteboard-core/mindmap`
  - chrome affordance -> `session/presentation/mindmapChrome.ts`

完成标志：

- `scene/` 目录内不再承载 session/chrome 逻辑。

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

## 7. 最终完成态

完成后，`whiteboard-editor/src/scene` 应满足：

1. 不再拥有第二套 scene read model。
2. 不再拥有第二套 node/edge view model。
3. 不再拥有第二套 selection/mindmap presentation model。
4. 不再把 `editor-scene` 再包装成旧接口 facade。
5. 只保留 `query / stores / host`。
6. host helper 文件名与职责一致，不再用 `cache` 这种模糊命名。

最终判断标准只有一个：

- 新同学看到 `scene/` 目录时，能立刻分清：
  - 哪些是 scene truth
  - 哪些是 host helper
  - 哪些根本不该在这里

如果还需要解释“这个字段只是历史兼容保留”，说明这次清理还没完成。

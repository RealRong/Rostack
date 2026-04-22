# Whiteboard Editor 最终整体重构方案

本文回答一个问题：

`whiteboard/packages/whiteboard-editor` 在 `whiteboard-editor-graph` 已经收敛为三阶段 projection runtime 之后，下一阶段长期最优的最终形态应该是什么，哪些东西必须移到 `whiteboard-editor-graph`，哪些东西必须直接删除，哪些边界必须在 `whiteboard-editor` 内收紧。

本文明确前提：

- 不在乎重构成本
- 不需要兼容旧 API
- 不保留双轨实现
- 不保留“过渡层先留着以后再删”
- 目标是长期最优，不是迁移容易

---

## 1. 最终结论

长期最优方案很明确：

1. `whiteboard-editor` 必须从“图上派生 + UI 宿主 + 输入动作 + 测量桥接”四类职责混杂的包，收敛成一个纯宿主壳
2. 所有“把 document/session/measure 投影成图上状态”的逻辑，都必须进入 `whiteboard-editor-graph`
3. `whiteboard-editor` 内部的 `query/`、`presentation/` 这两套中间层不应继续存在
4. `EditorQuery` 这种巨大的厨房水槽依赖对象必须直接删除
5. `editor/read.ts` 不应继续重新构造一套 node/edge/selection render model，而应退化成 published snapshot 的公共 API 适配层
6. `layout/` 不应再承担 live graph projection；它只能保留“测量资源 + edit commit 相关布局请求”
7. store 体系只能留在 `whiteboard-editor` 的宿主层，用来承载：
   - session state
   - projection published sources
   - public read facade
   不能继续在 `query/`、`presentation/`、`layout/` 中散落业务派生

一句话概括：

> `whiteboard-editor` 的最终形态不是再补更多 read model，而是删掉内部派生链，让它只负责 session、input、actions、writes、measurement bridge 和 public facade。

---

## 2. 当前 editor 的根问题

当前 editor 的问题不是“文件多”，而是“同一份语义被 editor 内重复建模了 3 到 4 次”。

### 2.1 `EditorQuery` 是一个假的领域边界

当前 `EditorQuery` 把下面这些完全不同层级的东西塞在了一起：

- `CommittedRead`
- session edit / selection / tool read
- live projected node / edge read
- viewport read
- chrome preview read
- history

见：

- `whiteboard/packages/whiteboard-editor/src/query/index.ts`

这导致：

- `action`
- `write`
- `input`
- `editor/read`

全部依赖一个巨大对象，而不是依赖自己真正需要的最小事实。

结果就是：

- 依赖链看不清
- 很难判断某个字段到底来自 document、session 还是 live projection
- 任意一处结构调整都会大面积连锁

### 2.2 `query/` 本质上仍是一套 editor 内部 graph projection

`query/node.ts`、`query/edge.ts`、`query/selection.ts` 今天做的核心事情不是“读”，而是：

- 合成 node projected geometry
- 合成 edge route / labels / render
- 合成 selection summary / affordance
- 把 layout draft / owner geometry / preview / edit 再拼成 live view

这本质上就是 projection runtime 该做的事，而不是 editor host 该做的事。

也就是说：

> `query/` 不是 query，它是留在 editor 里的旧 graph runtime。

### 2.3 `presentation/` 在重复加工已经存在的 graph/ui 语义

`presentation/selection.ts`、`presentation/mindmap.ts`、`presentation/edge.ts` 当前混合了三种东西：

- 真正的 graph/ui 语义
- toolbar / panel convenience 语义
- 少量 app host 特有默认值和展示规则

其中第一类应该进 `editor-graph`，第三类应该留在 editor，第二类应该在 public read facade 中小范围适配。

现在把三类混在一起，导致：

- graph/ui 语义无法稳定下沉
- panel/read 依赖链很长
- 任何 mindmap / selection 问题都要跨 `query + presentation + editor/read` 三层排查

### 2.4 `editor/read.ts` 在重新造一套公开 render model

今天 `editor/read.ts` 并没有只做 facade，而是在重新构造：

- `EditorNodeRender`
- `EditorEdgeRender`
- `EditorChromePresentation`
- `EditorPanelPresentation`
- `EditorMindmapRead`

见：

- `whiteboard/packages/whiteboard-editor/src/editor/read.ts`
- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`

问题在于：

- `node.render` / `edge.render` 本质上是在重复 `editor-graph` 的 `NodeView` / `EdgeView`
- equality 又写了一遍
- selection / edge / mindmap 的 UI 语义又派生了一遍

长期最优里，`editor/read.ts` 只能做：

- published snapshot -> public API 的薄适配
- session state -> public API 的薄适配
- toolbar / panel 的宿主便利投影

不能继续承担二次 projection。

### 2.5 `layout/` 把“测量桥接”和“live graph projection”搅在了一起

`layout/runtime.ts` 现在同时做：

- 文本测量 backend 请求
- draft measure store
- sticky/fontMode commit 归一化
- live mindmap layout 接线
- owner geometry 反投影

见：

- `whiteboard/packages/whiteboard-editor/src/layout/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/layout/mindmap.ts`

这会导致：

- `layout` 被 `query` 读
- `graph input` 被 `layout` 读
- `actions` 又被 `layout` 读

最后形成一个典型的“任何改动都会打到 layout”的脆弱结构。

### 2.6 `committed/read.ts` 混入了不该属于 committed 的投影

`committed/read.ts` 里现在除了 document truth，还有：

- node rect / bounds
- mindmap structure
- mindmap layout
- group / frame / snap

其中：

- 持久态稳定 document read 应该保留
- 纯 committed geometry 可以保留
- live owner layout 不该继续保留 committed 版本作为 editor 主渲染依赖

最终 editor 应同时拥有两类事实，但不能混成一层：

1. `document read`
2. `projection read`

今天的问题就在于，这两层在 `EditorQuery` 中被揉成了一层。

---

## 3. 最终边界

## 3.1 `whiteboard-engine` 的职责

`whiteboard-engine` 只负责：

- document 持久态
- command compile / reduce / write
- snapshot 产出
- document facts / relations

它不负责：

- session preview
- live edit geometry
- selection affordance
- scene visible / pick
- toolbar / panel context

## 3.2 `whiteboard-editor-graph` 的职责

`whiteboard-editor-graph` 负责把 editor source input 投影成最终一致发布的：

- `graph snapshot`
- `ui snapshot`
- `scene snapshot`

它必须吸收所有真正属于 projection 的逻辑：

- node projected geometry
- edge projected route / labels / render flags
- live mindmap layout / connectors / group bounds
- selection kind / summary / affordance
- chrome overlays / hover / edit session exposure
- scene order / visible / spatial / pick

它不负责：

- pointer / keyboard host
- measurement backend 调用
- history / clipboard
- toolbar defaults
- public editor API facade

## 3.3 `whiteboard-editor` 的职责

最终 `whiteboard-editor` 只负责五类宿主责任：

1. session state
2. input interaction runtime
3. action / write orchestration
4. measurement bridge
5. public editor facade

它不再负责自己的 graph projection。

## 3.4 索引归属规则

索引不是一个可以独立漂浮的中间层。

长期最优原则只有一条：

> 谁拥有那份真相的发布权，索引就放谁那里。

### 放在 `whiteboard-engine` 的索引

凡是只由持久态 document 决定、与 `session / draft / measure / viewport` 无关的索引，都属于 engine snapshot。

典型包括：

- `node -> owner`
- `owner -> nodeIds`
- `parent -> children`
- `edge -> source / target`
- `group -> items`

这些本质上不是 editor query helper，而是 document facts / relations，应成为 engine published snapshot 的一部分。

### 放在 `whiteboard-editor-graph` 的索引

凡是依赖 `document + session + measure + interaction + viewport` 合成后才成立的索引，都属于 projection snapshot。

典型包括：

- projected `node / edge / owner` by id
- live owner layout 结果
- visible node / edge / owner ids
- spatial / pick 命中索引
- selection summary / affordance grouping
- scene order / render item refs

这些不应在 `whiteboard-editor` 中二次拼装，而应直接作为 `editor-graph` 发布结果的一部分。

### `whiteboard-editor` 不再拥有业务索引

`whiteboard-editor` 最多只保留宿主 session 自己的状态索引，例如：

- current selection set
- current edit session
- pointer capture / drag session

它不再维护：

- `query node / edge index`
- `presentation selection index`
- `layout helper index`
- 任何独立的 graph read model index

### 不设独立的共享 `indexes` 包

`@shared/projection-runtime` 只提供 runtime / planner / publish 模式，不拥有 whiteboard 领域索引。

因此最终形态中不应出现：

- repo 级共享 `indexes` 包
- `whiteboard-editor/src/indexes`
- editor 内部“再包一层索引聚合”的中间目录

---

## 4. 哪些必须移到 `whiteboard-editor-graph`

判断标准很简单：

> 只要某段逻辑是在把 `document + session + measure + interaction + viewport` 合成图上最终状态，它就属于 `whiteboard-editor-graph`。

## 4.1 必须整体下沉的模块

### `src/query/node.ts`

必须下沉的内容：

- projected rect / bounds / rotation
- edit draft 应用
- owner geometry 应用
- render flags
- capability 所需的 graph-side事实

最终结果：

- editor 不再有 `projectNode`
- editor 不再有 `buildNodeRender`
- editor 不再有 `ProjectedNode`

这些都应直接成为 `editor-graph` 的 `NodeView` 或其构造逻辑。

### `src/query/edge.ts`

必须下沉的内容：

- route resolve
- label placement
- edge render flags
- edge box / bounds
- live patch / activeRouteIndex 合成

最终结果：

- editor 不再维护第二套 edge live view
- input / read / action 一律消费 published `EdgeView`

### `src/query/selection.ts`

必须下沉的内容：

- selection selected flags
- selection kind
- selection summary
- selection affordance

最终结果：

- `editor-graph.ui.selection` 成为唯一 selection runtime truth
- editor 不再维护一套 selection runtime read

### `src/layout/mindmap.ts`

必须下沉的内容：

- live mindmap layout
- live owner geometry
- subtree drag enter / move 预览对 layout 的影响

最终结果：

- editor 内不再有 `mindmap.nodeGeometry`
- `query/node` 不再从 layout 取 owner geometry
- input / read / action 一律从 published mindmap / node view 读 live layout 结果

### `src/presentation/mindmap.ts` 中属于 graph/ui 的部分

必须下沉的内容：

- mindmap live scene / chrome 所依赖的图上几何语义
- 与当前 session preview 强绑定的 overlay truth

保留在 editor 的只应该是：

- panel convenience
- 纯命令辅助

### `src/presentation/edge.ts` 中属于 graph/ui 的部分

必须下沉的内容：

- selected edge 几何语义
- edge live render 几何事实

不应继续留在 editor 里再从 `query.edge` 重组一次。

---

## 5. 哪些必须直接删除

## 5.1 整个 `src/query/`

最终应直接删除整个 `query/` 目录，不保留兼容壳。

原因很明确：

- `query/` 今天的核心职责是 live projection
- live projection 现在已经有 `editor-graph`
- 再保留 `query/` 只会形成第二套真相

最终 editor 不需要 `EditorQuery`，只需要：

- `document read`
- `projection sources`
- `session stores`

## 5.2 整个 `src/presentation/`

最终应删除 `presentation/` 作为独立目录。

原因：

- graph/ui truth 应进入 `editor-graph`
- toolbar / panel convenience 应进入 `read/panel/*`
- 局部 UI helper 若仍需要，应靠近 public read facade，而不是悬空成一层“presentation”

## 5.3 当前 `editor/read.ts` 里的二次 render model

必须删除：

- `EditorNodeRender`
- `EditorEdgeRender`
- 以这些类型为中心的二次 equality
- 重新从 published snapshot 构造 node/edge render 的 keyed store

最终 public read 应直接暴露：

- `NodeView`
- `EdgeView`
- `SelectionView`
- `ChromeView`
- `SceneSnapshot`

或者极薄别名，不再复制字段。

## 5.4 `EditorQuery` 类型及所有依赖它的内部注入方式

必须删除：

- `EditorQuery`
- `Pick<EditorQuery, ...>` 这种依赖传播方式

原因：

- 它让 action / write / input / read 都绑到一个大对象
- 这会把 editor 内的所有边界彻底抹平

最终每个子系统只能依赖自己真正需要的最小 contract。

## 5.5 `layout` 中所有 live owner projection 输出

必须删除：

- `layout.mindmap.nodeGeometry`
- `layout.mindmap.layout`
- 任何给 `query/` 提供 live graph geometry 的 store

保留的 layout 只能是 measurement bridge，不再是 graph read sidecar。

---

## 6. 哪些必须保留在 `whiteboard-editor`

## 6.1 `session/`

必须保留。

原因：

- edit / selection / tool / draw / viewport / preview 都是宿主临时态
- 这些不是 projection output，而是 projection input

但要收紧：

- 不允许在 session 层塞 graph 派生
- 不允许 session preview 反向依赖 query/presentation

## 6.2 `input/`

必须保留。

原因：

- pointer / keyboard / focus / wheel / DOM host 都属于 editor shell

但要改成依赖最小 contract，而不是依赖 `EditorQuery`。

最终 input 只应依赖：

- `document read`
- `projection read`
- `session commands`
- `write`
- `actions`

## 6.3 `action/`

必须保留。

原因：

- action 是 editor API 的一部分
- 它负责 orchestration，而不是纯 graph projection

但必须重写边界：

- 不能继续依赖 `EditorQuery`
- 不能继续调用 presentation/query helper
- 只能依赖最小 `document/projection/session/write` contract

## 6.4 `write/`

必须保留。

原因：

- write 是 engine command 的宿主包装

但必须降级成纯 write adapter：

- 不继续依赖整个 `EditorQuery`
- 只读必要的 `document` 或 `projection` 事实
- 与 `layout` 的耦合只保留 edit commit / insert payload patch

## 6.5 `layout/`

必须保留，但只保留 measurement bridge。

最终它只负责：

- text metrics resource
- layout backend request / result
- edit session draft measure
- commit 时的 layout-related patch 归一化

不再负责：

- live mindmap layout
- live owner geometry
- graph read sidecar store

## 6.6 `committed/read.ts`

应保留，但要重切成真正的 `document read`。

最终它只负责：

- document snapshot adapter
- committed node / edge / group / frame / slice / snap
- committed mindmap structure

它不再承担 editor 主渲染真相。

---

## 7. 最终 editor 内部结构

推荐最终结构：

```text
whiteboard/packages/whiteboard-editor/src/
  action/
    clipboard.ts
    edit.ts
    node.ts
    edge.ts
    mindmap.ts
    selection.ts
    tool.ts
    index.ts
  document/
    read.ts
    frame.ts
    group.ts
    slice.ts
    snap.ts
    mindmap.ts
  input/
    core/
    bindings/
      viewport.ts
      draw.ts
      edge.ts
      selection.ts
      transform.ts
      mindmap.ts
    host.ts
    runtime.ts
  projection/
    driver.ts
    input.ts
    sources.ts
  read/
    public.ts
    graph.ts
    scene.ts
    panel.ts
    chrome.ts
    mindmap.ts
  session/
    runtime.ts
    edit.ts
    selection.ts
    interaction.ts
    viewport.ts
    preview/
    draw/
  layout/
    runtime.ts
    request.ts
    draft.ts
    textMetrics.ts
  write/
    document.ts
    canvas.ts
    node.ts
    edge.ts
    group.ts
    mindmap.ts
    history.ts
    index.ts
  editor/
    createEditor.ts
    events.ts
    store.ts
  types/
    editor.ts
    input.ts
    tool.ts
    layout.ts
    node/
```

这里故意没有：

- `query/`
- `presentation/`
- `publish/`

原因是这三层本质上都属于中间过渡层。

---

## 8. 新的内部 contract

## 8.1 不再存在 `EditorQuery`

最终改成四类最小依赖：

### `documentRead`

只描述持久态事实：

- document
- committed node / edge / group / frame / slice
- committed mindmap structure
- snap index：
  `nodeOwner`、`ownerNodes`、`parentNode`、`childNodes`、`edgeNodes`、`groupItems`

### `projectionRead`

只描述 `editor-graph` 发布结果：

- snapshot
- graph families
- graph-side live index：
  projected `nodes / edges / owners`、selection/ui summary、scene `visible / spatial / pick`
- ui snapshot
- scene snapshot

### `sessionRead` / `sessionWrite`

只描述宿主临时态与其命令。

### `editorWrite`

只描述对 engine/history 的写入适配。

任何模块都不允许跨过这四类 contract 重新造一个巨型 aggregate。

## 8.2 `EditorRead` 退化成 public facade

最终 `EditorRead` 只做三件事：

1. 暴露 `documentRead`
2. 暴露 `projectionRead` 的公共读法
3. 暴露 panel / toolbar / chrome 的宿主便利读法

它不再承担 graph projection。

## 8.3 `EditorStore` 只保留宿主 store

最终 store 只允许出现在三种地方：

1. session state
2. projection published sources
3. public facade derived stores

任何业务 truth 都不能靠“在 editor 里再套一层 derived store”来表达。

---

## 9. 具体迁移归属

## 9.1 移到 `editor-graph`

- `query/node.ts` 的 projected geometry / render
- `query/edge.ts` 的 route / labels / render
- `query/selection.ts` 的 summary / affordance / selected
- `layout/mindmap.ts` 的 live layout / node geometry
- `presentation/mindmap.ts` 中属于 live graph/ui truth 的部分
- `presentation/edge.ts` 中属于 live graph/ui truth 的部分

## 9.2 留在 `editor`

- `session/*`
- `input/*`
- `action/*`
- `write/*`
- `layout/textMetrics.ts`
- `layout/request.ts`
- `layout/draft.ts`
- `document/read.ts`
- `editor/createEditor.ts`
- `editor/store.ts`

## 9.3 直接删除

- `query/*`
- `presentation/*`
- `publish/sources.ts`
  改为 `projection/sources.ts`
- `graph/read.ts`
  合并进 `projection/driver.ts` 或 `read/graph.ts`
- `EditorQuery`
- editor 内重复的 node/edge render 类型

---

## 10. `input` / `action` / `write` 应如何重写

## 10.1 `input`

当前问题：

- input features 依赖 `EditorQuery`
- 这让 interaction runtime 被动耦合 query/presentation

最终做法：

- 每个 binding 只拿自己真正需要的 contract
- binding 不再知道 `EditorQuery`

例如：

- selection binding 只读 `projection.scene`、`projection.graph.nodes`、`session.selection`
- edge binding 只读 `projection.graph.edges`、`projection.graph.nodes`、`documentRead`
- transform binding 只读 `projection.ui.selection`、`projection.graph.nodes`

## 10.2 `action`

当前问题：

- `action/index.ts` 过大
- 大量 helper 其实是在弥补 `EditorQuery` 过宽

最终做法：

- 按 domain 拆成独立模块
- 依赖最小 contract
- 不再从 query/presentation 兜一圈

最终 `createEditorActions` 只负责装配，不再承载 1000+ 行领域实现。

## 10.3 `write`

当前问题：

- write 被迫依赖 query 来取 live data

最终做法：

- 需要 committed truth 的地方读 `documentRead`
- 需要 live projection 的地方读 `projectionRead`
- 不需要的地方不读

这会让 write 从“读模型消费者”变成真正的 command adapter。

---

## 11. `layout` 的最终形态

最终 `layout/` 只保留下面四部分：

### `textMetrics.ts`

文本测量资源与 backend 桥接。

### `draft.ts`

edit session 的 draft measure store。

### `request.ts`

纯函数：

- `readLayoutKind`
- `buildLayoutRequest`
- `isLayoutAffectingUpdate`
- `normalizeStickyFontModeUpdate`
- `toLayoutResultUpdate`

### `runtime.ts`

只做装配，不再输出 live owner geometry。

如果 `layout/` 里还继续向外发布：

- `mindmap.nodeGeometry`
- `mindmap.layout`

说明这次重构没有完成。

---

## 12. `document read` 的最终形态

最终 `committed/read.ts` 不应继续维持一个“大而全单文件”。

推荐拆成：

```text
src/document/
  read.ts
  node.ts
  edge.ts
  group.ts
  frame.ts
  mindmap.ts
  slice.ts
  snap.ts
```

原则：

- committed document truth 保留
- committed-only 几何可保留
- live projection 不再保留

特别是：

- committed mindmap structure 可以保留
- committed mindmap live layout 不应继续成为 editor 主依赖

---

## 13. `editor/read.ts` 最终应长什么样

最终 `editor/read.ts` 应拆成：

```text
src/read/
  public.ts
  graph.ts
  scene.ts
  panel.ts
  chrome.ts
  mindmap.ts
```

职责建议：

- `graph.ts`: published graph snapshot 的公共读法
- `scene.ts`: published scene 的公共读法
- `chrome.ts`: 宿主 chrome/pointer/UI convenience
- `panel.ts`: selection toolbar / history / draw panel
- `mindmap.ts`: editor 私有的 mindmap panel convenience
- `public.ts`: 聚合

关键点：

- 不再重复 node/edge render shape
- 不再重复 selection summary
- 不再重复 edge label placement
- 只做 facade，不做 projection

---

## 14. 实施顺序

为了避免再次长出兼容层，顺序应该固定。

### 第一步：先删除 `EditorQuery`

1. 引入 `documentRead`
2. 引入 `projectionRead`
3. 把 input / action / write 的依赖改成最小 contract
4. 删除 `EditorQuery` 和 `query/`

### 第二步：回收 `presentation/`

1. 把 graph/ui truth 下沉到 `editor-graph`
2. 把 panel convenience 上提到 `read/panel/*`
3. 删除 `presentation/`

### 第三步：重写 `layout`

1. 删除 live mindmap layout 输出
2. 拆 `request.ts`
3. 拆 `draft.ts`
4. `runtime.ts` 只做装配

### 第四步：重写 `editor/read`

1. public facade 直接消费 published sources
2. 删除 editor 内重复 render type
3. 把 panel/chrome/mindmap convenience 拆成小模块

### 第五步：重写 `action` / `write`

1. domain 拆文件
2. 删除对 query/presentation 的依赖
3. 只保留 document/projection/session/write 边界

### 第六步：清目录与命名

1. `graph/` 改名为 `projection/`
2. `publish/` 删除并并入 `projection/`
3. `committed/` 改名为 `document/`
4. 清掉旧类型与 equality

---

## 15. 完成标准

当下面这些条件同时成立时，才算 editor 重构完成：

1. `whiteboard-editor/src/query` 不存在
2. `whiteboard-editor/src/presentation` 不存在
3. `EditorQuery` 不存在
4. `layout` 不再输出 live owner geometry / live mindmap layout
5. `editor/read` 不再构造第二套 node/edge render model
6. input / action / write 不再依赖统一巨型 query object
7. 所有图上 live truth 都只来自 `editor-graph` published snapshot
8. store 只留在 session / projection sources / public facade

如果以下现象还存在，说明没有收敛完成：

- 某个输入 binding 还在读 `query.node.projected`
- 某个 action 还在调 `presentation/*`
- `editor/read.ts` 还在手工拼 node/edge render
- `layout` 还在给 query 提供 node owner geometry
- `committed/read` 还在承担 live graph 语义

---

## 16. 一句话总结

下一阶段 `whiteboard-editor` 的长期最优方向不是继续整理 `query/presentation`，而是：

> 直接删除 editor 内部 graph 派生链，把所有 live graph/ui/scene 语义统一收回 `whiteboard-editor-graph`，让 `whiteboard-editor` 只剩下宿主职责。

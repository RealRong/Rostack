# WHITEBOARD_EDITOR_FILE_LAYOUT_OPTIMIZATION_FINAL.zh-CN.md

## 目标

研究 `whiteboard/packages/whiteboard-editor` 在 **不讨论 `input/` 目录** 的前提下，当前文件排布是否还能继续优化，并明确：

- 哪些目录职责过大、边界不清
- 哪些能力还应该继续下沉到 `editor-scene` / `whiteboard-core` / shared
- 哪些地方仍然存在重复层、转发层、局部 helper 膨胀
- 最终应如何重排目录，才能把 editor 保持为真正的 orchestration layer

本文只给最终方案与实施清单，不考虑兼容层。

---

## 当前结构结论

排除 `input/` 后，`whiteboard-editor/src` 当前主要分布：

- `session`: 24 个文件
- `write`: 14 个文件
- `types`: 11 个文件
- `action`: 4 个文件
- `scene`: 3 个文件
- `projection`: 2 个文件
- 其余目录都很薄

核心问题不是“文件太多”本身，而是：

- `session/` 同时承担 runtime state、derived state、presentation、projection、public source，层次过深
- `projection/` 只有两个文件，但两者承载了 editor -> editor-scene 的整条输入桥接与 delta 构造，复杂度过高
- `write/` 已经是按 domain 分包，但 editor 侧仍然夹杂一部分 model/capability 读取
- `scene/` 现在非常薄，只剩 source / pick / visible，说明它已经不再是一个值得单独保留的中间层
- `types/` 里既有对外 public contract，也有 editor 内部局部模型，边界不干净
- 少量 helper 已经下沉，但仍有一些本应属于 core / editor-scene / shared 的能力留在 editor 本地

---

## 当前最需要优化的目录

### 1. `session/` 过大，而且内部层次重复

当前 `session/` 同时包含：

- runtime state:
  - `runtime.ts`
  - `selection.ts`
  - `edit.ts`
  - `interaction.ts`
  - `viewport.ts`
  - `draw/*`
- derived read:
  - `read.ts`
  - `state.ts`
- public source:
  - `source.ts`
- derived projection:
  - `projection/selection.ts`
- presentation:
  - `panel.ts`
  - `presentation/mindmapChrome.ts`
- preview state system:
  - `preview/*`
- edge selection chrome:
  - `edge.ts`

这说明 `session/` 事实上混了 4 层：

- mutable session state
- derived read model
- UI presentation model
- editor public source facade

这不是一个“session”目录应承载的单一职责。

### 2. `projection/` 实际上是 editor-scene bridge，但命名与范围都太窄

当前只有：

- `projection/adapter.ts`
- `projection/bridge.ts`

但这两者做的是：

- engine publish -> scene input adapter
- session/layout/preview -> scene input adapter
- delta synthesis
- editor-scene runtime flush / subscribe bridge

它们不只是“projection”，而是 editor 与 editor-scene 之间的完整 scene bridge。

如果未来还要继续把更多 query/view/render 下沉到 `editor-scene`，这里还会继续增长。继续叫 `projection` 会越来越误导。

### 3. `scene/` 已经不再值得保留完整层级

当前只剩：

- `scene/source.ts`
- `scene/host/pick.ts`
- `scene/host/visible.ts`

此前 `geometry.ts` / `scope.ts` 已删除，说明：

- `scene/` 已不再承载 graph facade
- 它只是在给 `Editor.scene` 组装 host runtime

这类薄层继续保留 `scene/host/*` 目录收益很低，命名上也继续暗示“这里还有完整 scene local infra”，但实际已经没有。

### 4. `types/` 混入了内部模型

当前 `types/` 里包含：

- public editor contract:
  - `editor.ts`
  - `input.ts`
  - `tool.ts`
  - `selectionPresentation.ts`
  - `defaults.ts`
- node support system:
  - `node/*`
- layout internals:
  - `layout.ts`
- scene pick local type:
  - `pick.ts`

问题：

- `types/` 一部分是 public API
- 一部分是 editor 内部 domain support
- 一部分是 runtime local model

这会让“types”目录变成收纳箱，而不是清晰的 contract surface。

### 5. `write/` 基本合理，但仍残留 editor 侧读逻辑

当前 `write/` 排布已经比别的目录更接近最终态：

- `write/node.ts`
- `write/edge/*`
- `write/mindmap/*`
- `write/document.ts`
- `write/canvas.ts`
- `write/group.ts`
- `write/history.ts`

问题不在文件排布，而在：

- write 层偶尔仍要带少量 read dependency
- 一些 read helper 过去散落在 feature / session / action，最近虽然已经收进 `edge/read.ts`，但 node / mindmap 仍不完全对称

---

## 仍可继续下沉的能力

## A. 继续下沉到 `editor-scene`

### A1. `scene/source.ts` 里的 host visible / pick 可直接并入 `Editor.scene`

当前：

- `scene/source.ts`
- `scene/host/pick.ts`
- `scene/host/visible.ts`

判断：

- `visible` 本质是 viewport rect + `query.spatial.rect` 的组合
- `pick` 本质是 frame-throttled host runtime，但仍然完全围绕 `Editor.scene`

这层不需要继续单独挂在 `scene/host/*`。

这里还存在一个很明确的接口问题：

- `createEditor.ts` 现在把 `visibleRect` 和 `readZoom` 拆成两个独立函数传入
- `scene/source.ts` 再把这两个函数继续转发给 `visible` 与 `pick`
- 后续如果再出现 `readCenter`、`readScreenRect`、`readTransform`，这层会继续碎裂成更多局部 helper

这说明 `Editor.scene` host 侧缺少一个统一的 viewport 只读面。

建议：

- 删除 `scene/host/` 目录
- 把 `pick.ts`、`visible.ts` 移到 `scene/`
- 引入统一 `scene/view.ts`
- 或更激进地：
  - `pick.ts` 下沉到 `editor-scene` 提供 `query.pick` runtime primitive
  - editor 侧只保留 throttle/schedule 壳

最终推荐：

- `visible` 不下沉到 `editor-scene`
  - 因为它依赖 viewport，是 editor local concern
- `pick` 的命中逻辑继续在 `editor-scene.query.hit.*`
  - editor 侧只保留 frame-throttled scheduler
- `viewport view` 不进入 `editor-scene` runtime input
  - 因为它不是 scene graph 的内在输入，而是 `Editor.scene` host query 的外部上下文
  - `editor-scene` 应继续保持对宿主 viewport 的非耦合

也就是说：

- `scene/host/pick.ts` 保留逻辑，但应移出 `host/`
- `scene/host/visible.ts` 保留逻辑，但应移出 `host/`
- `scene/source.ts` 不再接收 `visibleRect/readZoom`
  - 改为接收统一 `view`

最终接口：

```ts
export interface SceneViewSnapshot {
  zoom: number
  worldRect: Rect
}

export interface SceneViewRead {
  get(): SceneViewSnapshot
}
```

使用约束：

- `SceneViewRead` 只属于 `whiteboard-editor/src/scene/*`
- `SceneViewRead` 不进入 `whiteboard-editor-scene`
- 初始字段只允许：
  - `zoom`
  - `worldRect`
- 不允许一开始直接塞入：
  - `pointer`
  - `worldToScreen`
  - `screenToWorld`
  - `center`
  - `screenRect`

原因：

- 这层的目标是消灭散乱 helper，而不是把 `session.viewport.read` 换个名字整体透传
- `visible` 只需要 `worldRect`
- `pick` 只需要 `zoom`
- 最简只读面足够解决当前重复问题，同时避免 host API 继续膨胀

替换方式：

- `createEditor.ts`
  - `view: { get: () => ({ zoom, worldRect }) }`
- `scene/source.ts`
  - `createSceneSource({ controller, view })`
- `scene/visible.ts`
  - 通过 `view.get().worldRect` 读取可见区
- `scene/pick.ts`
  - 通过 `view.get().zoom` 读取当前缩放

### A2. `session/projection/selection.ts` 的一部分仍可继续下沉

当前文件：

- `session/projection/selection.ts`

这里面混了两类东西：

- editor local selection presentation assembly
- 实际基于 scene query/stores 做 selection members / summary 读取

如果后续要进一步压缩 `session/`，推荐把以下职责下沉到 `editor-scene`：

- selection members 读取 primitive
- selection target -> primary node/edge resolve
- selection target -> node/edge/mindmap membership view

不建议下沉的部分：

- toolbar/panel 语义
- editor defaults 结合
- node type support 结合

最终应让 `editor-scene` 提供：

```ts
query.selection.members(target)
query.selection.primary(target)
query.selection.bounds(target)
query.selection.move(target)
```

其中：

- `bounds`
- `move`

已经在这轮和上一轮基本进入这个方向。

### A3. `session/source.ts` 内的部分 derived read 仍可被 `editor-scene stores/query` 吞掉

当前：

- `session/source.ts`

现在它既装配 `EditorSessionSource`，又现场读取不少 scene 数据。

仍可继续下沉的部分：

- selected edge chrome 里的 edge ends / route point 基础读取
- mindmap chrome 的 target candidates 基础读取

不需要继续留在 editor 的部分应变成：

- `editor-scene stores.render.*`
- `editor-scene query.*`

editor 只保留“UI 是否显示”的组合逻辑。

---

## B. 继续下沉到 `whiteboard-core`

### B1. node edit capability 应正式进入 node support primitive，而不是 registry raw access

目前已经做了一步：

- `NodeTypeSupport.edit(type, field)`

但这个能力还在 editor 本地 `types/node/support.ts`。

如果未来 `dataview` / 其他 editor-like runtime 也会用同一套 node definition / capability 判定，则还可以继续往下收：

- `whiteboard-core/node` 提供更纯的 node definition capability resolve primitive

当前阶段不必立即移动，但这是明确的下一步。

### B2. `session/presentation/mindmapChrome.ts` 的 add-child target 计算可部分模块化

当前：

- `readAddChildTargets(...)`

它依赖：

- selection target
- node rect
- node locked
- mindmap structure

其中真正“算法化”的部分是：

- root topic 左右按钮位置
- child topic 按 side 推导按钮位置

这部分可以下沉成纯 primitive，例如：

```ts
mindmap.chrome.addChildTargets(input: {
  structure: MindmapStructure
  selectedNodeId: NodeId
  rect: Rect
}): readonly AddChildTarget[]
```

editor 本地只保留：

- 是否单选
- 是否 locked
- 是否 edit 中

### B3. `write/mindmap/topic.ts` 与 `action/index.ts` 的 topic style 组合逻辑可进一步模块化

当前 `action/index.ts` 还会现场把：

- `frameKind`
- `stroke`
- `strokeWidth`
- `fill`

拼成 node style patch。

这类 “mindmap topic patch -> node style patch” 转换应最终进入：

- `whiteboard-core/mindmap`

否则以后 mindmap 视觉模型变化时，editor action 仍会继续知道 topic style 细节。

---

## C. 继续下沉到 shared

### C1. `boundary/` 可以更明确地变成 shared primitive consumer

当前：

- `boundary/procedure.ts`
- `boundary/runtime.ts`
- `boundary/task.ts`

这套已经接近 shared-style infra 了，但仍在 editor 内。

如果其他 package 也会使用：

- publish / task / generator procedure runtime

则它值得抽成 shared primitive。

如果 whiteboard 仍是唯一消费者，则可以保留。

结论：

- 当前不强制下沉
- 但命名上应明确它是 infra，不是 editor domain

---

## 仍然职责不对的文件

## 1. `action/index.ts`

当前问题：

- 过大
- 既做 action API 装配
- 又内嵌 mindmap / edit / selection 局部 helper
- 仍夹带少量 domain transformation

最终应拆成：

- `action/createEditorActions.ts`
- `action/edit.ts`
- `action/mindmap.ts`
- `action/common.ts`

不建议继续把所有行为塞回单个 `index.ts`。

## 2. `session/source.ts`

当前问题：

- 同时做 source assembly 与大量 derived view 拼装

最终应拆成：

- `session/createSessionSource.ts`
- `session/chrome.ts`
- `session/panelSource.ts`
- `session/edgeChrome.ts`
- `session/mindmapChrome.ts`

也可以更激进：

- 把 `source.ts` 改名为 `createSessionSource.ts`
- 把大块 derived sections 各自挪出

## 3. `projection/adapter.ts`

当前问题：

- 文件名过轻
- 实际负责 scene input adapter 全部拼装

最终应改名为：

- `scene-bridge/input.ts`

或者：

- `projection/createSceneInput.ts`

但如果继续保留 `projection/bridge.ts`，推荐直接把整个目录改名为：

- `scene-bridge/`

## 4. `projection/bridge.ts`

当前问题：

- 不只是 bridge
- 还负责 delta synthesis、flush policy、session listener glue

最终应改名为：

- `scene-bridge/runtime.ts`

## 5. `scene/source.ts`

当前问题：

- 现在只是 `Editor.scene` facade 组装器

最终应改名为：

- `scene/createEditorSceneSource.ts`

或直接并入：

- `editor/createEditor.ts`

如果只剩很薄的一层，后者更合理。

---

## 重复点与可继续优化点

## 1. `session/runtime.ts` / `session/state.ts` / `session/read.ts` 仍然三层并存

当前：

- `runtime.ts`: mutable stores
- `state.ts`: derived `EditorInteractionState`
- `read.ts`: read facade

这里并不是完全错误，但层级略多。

建议：

- `read.ts` 保留
- `state.ts` 保留
- 但把 `runtime.ts` 改名为 `createEditorSessionRuntime.ts`

原因：

- 现在 `runtime.ts` 这个名字太泛
- 在 `session/` 下又和 `source.ts` / `state.ts` / `read.ts` 并列，阅读成本高

## 2. `types/node/*` 与 `session/edit.ts` / `layout/runtime.ts` 之间仍然有 capability 语义分散

当前：

- edit capability 在 `session/edit.ts` 定义类型
- node type support 在 `types/node/*`
- layout kind 又在 `layout/runtime.ts` 直接读 registry

建议最终统一成：

- `types/node/*` 负责 node definition / support
- `layout/` 不再直接 raw read registry
- `session/edit.ts` 只保留 edit session state type

也就是：

- 与 node definition 有关的 capability，一律进 `types/node`
- `session/*` 不再定义 capability meaning

## 3. `write/edge/*` 和 `edge/read.ts` 已经形成雏形，但 node / mindmap 还不对称

现在 edge 已有：

- `edge/read.ts`
- `write/edge/*`

但 node / mindmap 还没有对称的 reader package。

建议最终补齐：

- `node/read.ts`
- `mindmap/read.ts`

不是为了制造新层，而是为了把 editor 内仍然零散存在的：

- node editability / owner / rect / committed/working dual-read
- mindmap id / structure / topic style / branch patch helper

统一成对称 domain package。

## 4. `types/editor.ts` 仍然偏大

当前：

- input host
- session source
- scene source
- pick runtime
- editor root contract

都堆在一个文件。

建议拆为：

- `types/editor/root.ts`
- `types/editor/scene.ts`
- `types/editor/session.ts`
- `types/editor/inputHost.ts`

然后 `types/editor.ts` 只做 re-export。

---

## 最终推荐目录排布

在不动 `input/` 的前提下，推荐最终变成：

```text
whiteboard/packages/whiteboard-editor/src
  action/
    createEditorActions.ts
    clipboard.ts
    selection.ts
    edit.ts
    mindmap.ts
    types.ts

  boundary/
    procedure.ts
    runtime.ts
    task.ts

  clipboard/
    packet.ts

  edge/
    read.ts

  editor/
    createEditor.ts
    events.ts

  layout/
    runtime.ts
    textMetrics.ts

  scene-bridge/
    input.ts
    runtime.ts

  scene/
    pick.ts
    visible.ts

  session/
    createSessionRuntime.ts
    createSessionSource.ts
    read.ts
    state.ts
    selection.ts
    edit.ts
    interaction.ts
    viewport.ts
    edgeChrome.ts
    panel.ts
    projection/
      selection.ts
    presentation/
      mindmapChrome.ts
    preview/
      ...
    draw/
      ...

  services/
    tool.ts

  types/
    editor/
      root.ts
      scene.ts
      session.ts
      inputHost.ts
    node/
      index.ts
      read.ts
      registry.ts
      support.ts
    defaults.ts
    input.ts
    layout.ts
    pick.ts
    selectionPresentation.ts
    tool.ts

  write/
    canvas.ts
    document.ts
    group.ts
    history.ts
    node.ts
    edge/
      index.ts
      label.ts
      route.ts
    mindmap/
      index.ts
      branch.ts
      root.ts
      topic.ts
    index.ts
    types.ts
```

---

## 明确的迁移建议

## P0. 只做排布收敛，不改语义

- `projection/adapter.ts` -> `scene-bridge/input.ts`
- `projection/bridge.ts` -> `scene-bridge/runtime.ts`
- `session/runtime.ts` -> `session/createSessionRuntime.ts`
- `session/source.ts` -> `session/createSessionSource.ts`
- `scene/host/pick.ts` -> `scene/pick.ts`
- `scene/host/visible.ts` -> `scene/visible.ts`
- `action/index.ts` -> `action/createEditorActions.ts`

目的：

- 先让文件名反映真实职责
- 不再让“projection / source / runtime / index”这些过泛命名继续增加理解成本

## P1. 拆薄大文件

- 拆 `action/index.ts`
- 拆 `session/source.ts`
- 拆 `types/editor.ts`

判断标准：

- 单文件不再同时承担“装配 + domain helper + public contract”

## P2. 继续下沉到 `editor-scene`

- selection members / primary resolve 继续向 `query.selection.*` 收
- selected edge chrome 所需的基础 edge read 尽量直接复用 `query.edge` / `stores.render.edge`
- mindmap chrome 的可复用空间读逐步进入 `editor-scene`

## P3. 补齐 editor 本地 domain read 对称性

- 新增 `node/read.ts`
- 新增 `mindmap/read.ts`

只承载 editor 本地仍然需要、但又不值得直接塞进 action/session/write 的 domain read 组合。

## P4. 再看是否继续下沉到 core/shared

- mindmap add-child target 纯算法
- topic style patch 编译
- boundary generator infra

这一步不应先做，必须等 editor 内部排布先干净。

---

## 明确不建议做的事

## 1. 不要继续扩 `scene/host/*`

现在它已经不是“host infra 聚合层”了，继续往这里塞东西只会重新制造重复 facade。

## 2. 不要把 `session/` 再继续加更多子目录名词

当前 `session/presentation`、`session/projection`、`session/preview` 已经很多层。

后续优化方向应该是：

- 把职责拆清
- 把不属于 session 的东西移出去

而不是继续增设：

- `session/view`
- `session/runtime/source`
- `session/derived`

之类的新层。

## 3. 不要把所有 helper 都下沉

本文明确排除了 `input/`，原因就是局部手势逻辑本来就允许保留 helper。

同理，`session/panel.ts` 中大量 toolbar value helper 也不必机械下沉。

判断标准始终是：

- 是否重复承载 query / primitive 职责
- 是否让 editor 知道了过多底层模型细节

而不是名字里是否有 `read*` / `resolve*`

---

## 最终判断

`whiteboard-editor` 现在最大的问题不是“目录太多”，而是：

- `session` 太胖
- `projection` 命名与职责不匹配
- `scene` 已薄但还保留了过时层级
- `types` 混了 public contract 与内部 support

如果只从“删文件数”入手，收益有限。真正有价值的优化顺序是：

1. 先把文件名与目录名改成真实职责
2. 再拆 `session/source.ts`、`action/index.ts`、`types/editor.ts`
3. 再继续把 selection / edge / mindmap 基础读线往 `editor-scene` 和 core 收

最终理想形态：

- `editor` 只负责 orchestration
- `editor-scene` 提供 query / stores / render / selection 读面
- `whiteboard-core` 提供纯 domain primitive
- editor 本地只保留少量：
  - session mutable state
  - UI presentation assembly
  - write command composition
  - boundary / runtime orchestration

这才是长期最优的排布方向。

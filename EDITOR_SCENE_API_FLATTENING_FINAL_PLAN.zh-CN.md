# Editor Scene API 扁平化最终方案

## 1. 目标

- 删除 `EditorSceneApi -> read -> scene` 这条多余嵌套链。
- public 只保留一套 scene 读 API，不再同时维护
  - `SceneRead`
  - `EditorSceneRead`
  - `EditorSceneProjectionRead`
- 不保留兼容层，不做过渡别名，直接切到长期最优结构。

---

## 2. 当前到底嵌套了几层

### 2.1 public 类型层

当前 public 读面是三层壳：

1. `Editor.scene: EditorSceneApi`
2. `EditorSceneApi.read: EditorSceneRead`
3. `EditorSceneRead.scene: SceneRead`

也就是：

- `EditorSceneApi`
  - `read`
    - `scene`
      - `nodes / edges / mindmaps / ...`

这还没算具体 domain root 和最终方法。

### 2.2 实际调用层

最常见调用现在是：

```ts
editor.scene.read.scene.nodes.get(nodeId)
editor.scene.read.scene.viewport.screenPoint(point)
editor.scene.read.scene.groups.exact(target)
```

如果按对象层级数：

1. `editor`
2. `scene`
3. `read`
4. `scene`
5. `nodes`
6. `get`

其中真正多余的是中间这两层：

- `read`
- 第二个 `scene`

也就是说，在真正到达业务域 `nodes / edges / viewport / ...` 之前，scene 子系统内部先套了两层无语义包装。

### 2.3 runtime 构造层

运行时也有两层薄包装：

1. `createProjectionRead()` 生成 `EditorSceneProjectionRead`
2. `createProjectionRuntime()` 基本原样转发 `runtime.read`
3. `createEditorSceneApi()` 再把 `runtime.read` 包成 `EditorSceneApi`

也就是 public scene 读面并不是一次生成，而是读对象做完以后又被包了两次。

### 2.4 现在实际上有几套“scene read surface”

当前至少有三套名字不同但高度重叠的 surface：

1. `SceneRead`
2. `EditorSceneRead`
3. `EditorSceneProjectionRead`

其中：

- `SceneRead` 是纯 scene 域读能力。
- `EditorSceneRead` = `revision + document + runtime + scene`
- `EditorSceneProjectionRead` = `EditorSceneRead + capture + source`

这说明 public / internal / debug 没有分层清楚，而是靠继承继续叠壳。

---

## 3. 当前结构为什么难看

### 3.1 `read` 不是一个真正的领域对象

`read` 只是在表达“这是读接口”，不是领域语义。

public API 不应该长成：

```ts
scene.read.scene.nodes.get(...)
```

而应该直接长成：

```ts
scene.nodes.get(...)
```

### 3.2 第二个 `scene` 是重复命名

`editor.scene` 已经说明这是 scene 子系统。

再来一层 `.read.scene`，本质上是在同一个概念里重复写第二次 scene，没有增加信息量。

### 3.3 `host` 也在继续包一层

当前 `EditorSceneApi` 里还有：

```ts
host: {
  pick
  visible
}
```

这里有两个问题：

- `host.visible` 只是 `viewport.visible` 的重复出口。
- `host.pick` 是一个独立 runtime 能力，不应该因为历史结构再挂一个 `host` 壳。

### 3.4 projection internal surface 混进了 read surface

`EditorSceneProjectionRead` 在 public read 的基础上再加：

- `capture`
- `source`

这两个都不是 public scene query 主轴，却继续沿着 `Read` 继承扩展，导致“query / debug / source”被揉在一条类型链上。

---

## 4. 长期最优的 public API

## 4.1 只保留一个 public scene 对象

最终 public 应该只有一个对象：

```ts
export interface EditorScene {
  revision(): Revision

  stores: RuntimeStores
  pick: ScenePickRuntime

  document: DocumentFrame
  runtime: RuntimeFrame

  nodes: SceneNodes
  edges: SceneEdges
  mindmaps: SceneMindmaps
  groups: SceneGroups
  selection: SceneSelection
  frame: SceneFrame
  hit: SceneHit
  viewport: SceneViewport
  overlay: SceneOverlay
  spatial: SceneSpatial
  snap: SceneSnap

  items(): State['items']
  bounds(): Rect | undefined
}
```

注意点：

- 删除 `read`
- 删除第二个 `scene`
- 删除 `host`
- `items.all()` 扁平为 `items()`
- `bounds()` 继续保留顶层函数，不再额外挂在 `scene`

## 4.2 最终调用形式

所有调用统一变成：

```ts
editor.scene.nodes.get(nodeId)
editor.scene.edges.get(edgeId)
editor.scene.mindmaps.structure(mindmapId)
editor.scene.viewport.screenPoint(point)
editor.scene.groups.exact(target)
editor.scene.bounds()
editor.scene.pick.schedule(request)
editor.scene.document.snapshot()
editor.scene.runtime.session.selection()
```

这才是稳定、直接、可预期的 public shape。

### 4.3 public 层不要再有 `SceneRead`

`SceneRead` 这个名字可以保留在 internal，如果确实还想表达“纯 scene query 片段”。

但 public 不应该再出现：

- `EditorSceneRead`
- `SceneRead as public root`

public 只保留 `EditorScene`。

---

## 5. internal 结构的长期最优

### 5.1 public / internal / debug 必须拆开

最终应拆成三类对象：

1. public scene object
2. internal projection runtime
3. debug / capture surface

不要再用一个 `...Read extends ...Read` 链条把它们揉在一起。

建议：

```ts
export interface EditorScene { ... }           // public
export interface EditorSceneRuntime { ... }    // internal runtime
export interface EditorSceneDebug { ... }      // testing/debug only
```

其中：

- `EditorSceneRuntime` 负责 `update/subscribe/dispose/state`
- `EditorScene` 只负责 public read + stores + pick
- `EditorSceneDebug` 放 `capture/source`

### 5.2 `createEditorSceneApi` 应删除

当前 [scene/api.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/scene/api.ts) 主要是在做二次包装：

- 转发 `revision`
- 转发 `read`
- 转发 `stores`
- 再挂一个 `host.pick`

这不是一个独立领域层，而是历史兼容壳。

长期最优是：

- 删除 `createEditorSceneApi`
- scene public object 直接在 `editor-scene` runtime 创建完成
- editor 直接拿最终 `scene` 对象

### 5.3 `pick` 不应该挂在 `host`

`pick` 是一个独立能力。

最终只保留：

```ts
scene.pick.schedule(...)
scene.pick.get()
scene.pick.clear()
```

不要再是：

```ts
scene.host.pick.schedule(...)
```

### 5.4 `visible` 不应该重复导出

现在：

- `scene.read.scene.viewport.visible(...)`
- `scene.host.visible(...)`

这是重复出口。

最终只保留：

```ts
scene.viewport.visible(...)
```

---

## 6. 最终命名

## 6.1 public

- `EditorSceneApi` -> 删除
- `EditorSceneRead` -> 删除
- `SceneRead` -> 退出 public
- `EditorScene` -> 唯一 public scene 对象

## 6.2 internal

- `createProjectionRead` -> `createScene`
  或 `createSceneQuery`
- `EditorSceneProjectionRead` -> 删除
- `capture/source` 改为独立 debug surface，不再挂在 read 上

我更倾向于：

```ts
createScene(...)
createSceneRuntime(...)
createSceneDebug(...)
```

原因：

- `ProjectionRead` 这个名字同时暴露了实现手段和方向性，不是 public 领域命名。
- `Scene` / `SceneRuntime` / `SceneDebug` 更清晰。

---

## 7. 一步到位迁移方案

## Phase 1：定义新 public 结构

- 在 `whiteboard-editor` / `whiteboard-editor-scene` 的 contracts/types 中引入唯一 public 类型：
  - `EditorScene`
- 把以下字段直接拉平到 `EditorScene`：
  - `document`
  - `runtime`
  - `nodes`
  - `edges`
  - `mindmaps`
  - `groups`
  - `selection`
  - `frame`
  - `hit`
  - `viewport`
  - `overlay`
  - `spatial`
  - `snap`
  - `bounds`
  - `items`
  - `stores`
  - `pick`
  - `revision`

## Phase 2：删除 `read.scene` 包装

- `createProjectionRead()` 不再返回：

```ts
{
  revision,
  document,
  runtime,
  scene: { ... }
}
```

- 直接返回：

```ts
{
  revision,
  document,
  runtime,
  nodes,
  edges,
  ...
}
```

- `items` 改为 `items(): State['items']`

## Phase 3：删除 `EditorSceneApi`

- 删除 [scene/api.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/scene/api.ts)
- editor 不再通过 `createEditorSceneApi()` 二次包一层
- `createEditor()` 里直接拿最终 `scene`

## Phase 4：移动 `pick`

- 当前 `createScenePick()` 从 `scene/api.ts` 移到 scene public object 构造阶段
- 对外直接变成：
  - `scene.pick.schedule`
  - `scene.pick.get`
  - `scene.pick.clear`
  - `scene.pick.dispose`

## Phase 5：删除重复出口

- 删除 `host.visible`
- 所有调用切到 `scene.viewport.visible`
- 删除 `read.revision()` 这种中间层访问方式，只保留 `scene.revision()`

## Phase 6：调用点全量迁移

所有以下调用统一替换：

- `editor.scene.read.scene.nodes.get` -> `editor.scene.nodes.get`
- `editor.scene.read.scene.edges.get` -> `editor.scene.edges.get`
- `editor.scene.read.scene.viewport.*` -> `editor.scene.viewport.*`
- `editor.scene.read.scene.groups.*` -> `editor.scene.groups.*`
- `editor.scene.read.document.*` -> `editor.scene.document.*`
- `editor.scene.read.runtime.*` -> `editor.scene.runtime.*`
- `editor.scene.host.pick.*` -> `editor.scene.pick.*`
- `editor.scene.host.visible` -> `editor.scene.viewport.visible`

## Phase 7：删除旧类型

彻底删除：

- `EditorSceneApi`
- `EditorSceneRead`
- `EditorSceneProjectionRead`

`SceneRead` 若仍保留，只允许 internal 使用，且不能再作为 public root 暴露。

---

## 8. 受影响范围

从当前调用扫描看，影响主要在四处：

1. `whiteboard/packages/whiteboard-editor`
2. `whiteboard/packages/whiteboard-react`
3. `whiteboard/packages/whiteboard-editor-scene`
4. 测试代码

最常见替换是：

- `editor.scene.read.scene.*`
- `runtime.read.scene.*`
- `editor.scene.read.document.*`
- `editor.scene.host.pick.*`

这类替换是机械性的，改动面不小，但复杂度低。

---

## 9. 最终判断

这块的问题不是只“多了一层 `SceneRead`”。

真正的问题是：

- public 读面同时存在三层类型壳
- runtime 生成后又被 editor 二次包装
- `host` 和 `read.scene` 都是在重复包裹
- debug/source surface 混在 read 继承链里

长期最优不是继续微调 `SceneRead`，而是直接把 public shape 收敛成：

- 一个 `EditorScene`
- 一套直接的 domain root
- 一套独立 runtime
- 一套独立 debug surface

最终目标就是让所有上层代码都写成：

```ts
editor.scene.nodes.get(id)
editor.scene.viewport.screenPoint(point)
editor.scene.mindmaps.structure(id)
editor.scene.document.snapshot()
editor.scene.runtime.session.selection()
editor.scene.pick.schedule(request)
```

而不是继续维持：

```ts
editor.scene.read.scene.nodes.get(id)
```

这一步做完以后，scene public API 会明显变薄，调用路径、类型层级、概念数量都会同时下降。

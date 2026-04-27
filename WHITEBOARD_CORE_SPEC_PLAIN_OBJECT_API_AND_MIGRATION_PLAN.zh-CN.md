# whiteboard-core：`spec + plain object` 最终 API 设计与迁移方案

## 1. 目标形态

本次目标不是继续给 `whiteboard-core` 叠一层 facade，而是直接把它收敛成：

- 一份 **plain object document model**
- 一份 **plain object operation spec**
- 一组 **纯算法模块**
- 一套 **极薄的 compile/apply/history/lock/registry** 接口

最终 public surface 只保留：

```ts
import {
  document,
  operations,
  registry,
  geometry,
  node,
  edge,
  mindmap,
  selection
} from '@whiteboard/core'
```

`@whiteboard/core/types` 继续保留。

---

## 2. 最终 public API

## 2.1 `document`

```ts
export const document = {
  create,
  assert,
  normalize,
  slice: {
    bounds,
    translate,
    export: {
      nodes,
      edge,
      selection
    },
    insert: {
      ops
    }
  }
}
```

约束：

- 删除 `document.read.*`
- 删除 `document.has.*`
- 删除大部分 `document.list.*`
- 原始读取直接走 plain object
  - `doc.nodes[id]`
  - `doc.edges[id]`
  - `Object.values(doc.nodes)`
  - `doc.canvas.order`

只保留**真正有领域含义**的 document 级能力：

- `create`
- `assert`
- `normalize`
- `slice.*`

`listGroupCanvasItemRefs` / `listGroupNodeIds` / `listGroupEdgeIds` 这种如果仍有复用价值，迁到 `document.members.*`；如果只是薄包装，直接删掉并让调用方就地组合。

---

## 2.2 `operations`

```ts
export const operations = {
  definitions,
  spec,
  apply,
  compile,
  history: {
    assertFootprint,
    createCollector,
    conflicts,
    serializeKey,
    isKey
  },
  lock: {
    decide,
    validate
  },
  plan: {
    canvasOrderMove,
    groupOrderMove
  }
}
```

说明：

- `definitions`：operation definition table，给 collab / codec / tooling 用
- `spec`：shared mutation runtime 直接消费的正式 spec
- `apply`：唯一白板 operation reduce/apply 入口
- `compile`：唯一意图编译入口
- `history.*`：history footprint 与 key 规则
- `lock.*`：锁决策与锁校验
- `plan.*`：仍然值得保留的多 op 规划函数

### 替换关系

- `@whiteboard/core/spec/operation` → `operations`
- `@whiteboard/core/spec/history` → `operations.history`
- `@whiteboard/core/intent` → `operations.compile`
- `@whiteboard/core/lock` → `operations.lock`
- `@whiteboard/core/canvas` / `@whiteboard/core/group` → `operations.plan`

### 命名收口

- `reduceWhiteboardOperations` → `operations.apply`
- `compileWhiteboardIntents` → `operations.compile`
- `WHITEBOARD_OPERATION_DEFINITIONS` → `operations.definitions`
- `whiteboardMutationOperations` → `operations.spec`
- `resolveLockDecision` → `operations.lock.decide`
- `validateLockOperations` → `operations.lock.validate`

---

## 2.3 `registry`

```ts
export const registry = {
  create,
  schema: {
    node,
    edge,
    applyNodeDefaults,
    applyEdgeDefaults,
    missingNodeFields,
    missingEdgeFields
  }
}
```

说明：

- `kernel` 这个名字删除
- `createRegistries` 改收口到 `registry.create`
- `schema` 不再单独作为顶级 public 面存在，而是作为 `registry.schema`

### 替换关系

- `@whiteboard/core/kernel` → `registry`
- `@whiteboard/core/schema` → `registry.schema`

---

## 2.4 `node`

`node` 保留，但只保留**稳定领域面**，并让 `index.ts` 退化成薄导出。

最终结构：

```ts
export const node = {
  bootstrap,
  geometry,
  outline,
  frame,
  shape,
  text,
  layout,
  move,
  transform,
  snap,
  update,
  materialize
}
```

要求：

- `node/index.ts` 不再做大规模二次命名和二次分组
- 底层函数直接使用最终命名
- 删除 `document`, `group`, `projection`, `selection` 这类弱边界子面，按语义并回稳定模块

### 具体调整

#### 删除 / 合并子面

- `node/document.ts` 并回 `document` 或 `node.geometry`
- `node/group.ts` 并回 `node.layout` 或 `document`
- `node/projection.ts` 改名为 `node.patch.ts` 或并回 `node.update`
- `node/selection.ts` 并回 `selection`
- `node/moveState.ts` 并回 `node.move.ts`
- `node/materialize.ts` 改名为 `node.materialize.ts` 保留，但只做 node model 归一化，不承载额外 glue

#### 命名收口

- `getNodeAABB` → `aabb`
- `getNodeRect` → `rect`
- `getNodesBounds` → `bounds`
- `getNodeBoundsByNode` → `boundsByNode`
- `readNodeRotation` → `rotation`
- `resolveMoveEffect` → `effect`
- `resolveNodeTransformBehavior` → `behavior`
- `resolveSelectionTransformFamily` → `family`
- `resolveResizeRectFromSize` → `resizeRectFromSize`
- `resolveTextBox` → `box`
- `resolveTextContentBox` → `contentBox`
- `resolveTextFrameMetrics` → `frameMetrics`
- `resolveTextHandle` → `handle`
- `resolveTextAutoFont` → `autoFont`

原则：

- 原始取值不用 `get` / `read`
- 纯派生用名词或明确动词
- 规则决策用 `plan` / `behavior` / `family` / `effect`

---

## 2.5 `edge`

`edge` 保留，但同样要把 `index.ts` 变成薄入口。

最终结构：

```ts
export const edge = {
  guard,
  route,
  path,
  anchor,
  end,
  view,
  hit,
  render,
  relation,
  capability,
  edit,
  connect,
  patch,
  equal,
  label
}
```

### 具体调整

- `edge/query.ts` 删除，内容按语义回归：
  - `readEdgeBox` → `edge.box`
  - `readEdgeRoutePoints` → `edge.route.points`
  - `resolveEdgeCapability` → `edge.capability`
- `edge/resolvedPath.ts` 并回 `edge/path.ts`
- `edge/view.ts` 保留
- `edge/ops.ts` 不再单独作为 public 关注点，只有仍具备明确规划意义的 builder 才挂到 `edge` 下

### 命名收口

- `getEdgePath` → `edge.path.get` 或直接 `edge.path`
- `resolveEdgeEnds` → `edge.end.resolve`
- `resolveEdgeView` → `edge.view.resolve`
- `resolveEdgeViewFromNodeGeometry` → `edge.view.fromNodeGeometry`
- `resolveEdgePathFromRects` → `edge.path.fromRects`
- `resolveAnchorFromPoint` → `edge.anchor.fromPoint`
- `resolveEdgeConnectTarget` → `edge.connect.target`
- `resolveEdgeConnectEvaluation` → `edge.connect.evaluate`
- `resolveEdgeConnectPreview` → `edge.connect.preview`
- `resolveReconnectDraftEnd` → `edge.connect.reconnectDraftEnd`

---

## 2.6 `mindmap`

`mindmap` 本身已经接近稳定，但仍有 `query` / `application` / `treeMutate` 这类中间命名。

最终结构：

```ts
export const mindmap = {
  tree,
  layout,
  plan,
  template,
  render,
  drop,
  topicStyle
}
```

### 具体调整

- `mindmap/application.ts` → `mindmap/plan.ts`
- `mindmap/query.ts` 拆并到：
  - `mindmap.plan`
  - `mindmap.topicStyle`
  - `mindmap.tree`
- `mindmap/treeMutate.ts` 并回 `mindmap/tree.ts`
- `mindmap/types.ts` 保留

### 命名收口

- `readMindmapAddChildTargets` → `mindmap.plan.addChildTargets`
- `resolveMindmapInsertSide` → `mindmap.plan.insertSide`
- `buildMindmapRelativeInsertInput` → `mindmap.plan.relativeInsertInput`
- `resolveInsertPlan` → `mindmap.plan.insertTarget`
- `readMindmapNavigateTarget` → `mindmap.tree.navigate`

---

## 2.7 `selection`

`selection` 保留，但去掉 `model/query/resolve` 的混杂感。

最终结构：

```ts
export const selection = {
  target: {
    empty,
    apply,
    normalize,
    equal
  },
  derive: {
    affordance,
    summary,
    nodeStats,
    edgeStats,
    affordanceEqual,
    summaryEqual
  },
  members: {
    singleNode,
    singleEdge
  },
  bounds,
  boxTarget
}
```

### 具体调整

- `selection/query.ts` 并回 `selection/index.ts` 或 `selection/derive.ts`
- `resolve.boxTarget` 改成顶层 `selection.boxTarget`
- `bounds.get` 改成 `selection.bounds`
- `isSelectionAffordanceEqual` → `selection.derive.affordanceEqual`
- `isSelectionSummaryEqual` → `selection.derive.summaryEqual`

---

## 2.8 `geometry`

`geometry` 保持纯算法模块，不挂任何 runtime 语义。

只做两件事：

- 保持基础几何函数稳定
- 吸收当前顶层 `snap.ts` 里真正通用的屏幕/世界单位转换

### 具体调整

- 删除顶层 `src/snap.ts`
- `resolveInteractionZoom` / `resolveScreenDistanceWorld` / `resolveWorldThreshold` 迁入 `geometry.viewport`
- `rectFromPoint` 迁入 `geometry.rect`
- `pickNearest` 迁入 `geometry.scalar` 或新建 `geometry.pick`
- `expandRectByThreshold` 直接内联到 `node.snap` / `edge.connect`，不要为一层 `geometry.rect.expand` 再包一层 helper

---

## 3. 要删除的顶级 public 面

以下顶级 public 面全部删除：

- `@whiteboard/core/canvas`
- `@whiteboard/core/group`
- `@whiteboard/core/kernel`
- `@whiteboard/core/config`
- `@whiteboard/core/lock`
- `@whiteboard/core/intent`
- `@whiteboard/core/spec/operation`
- `@whiteboard/core/spec/history`
- `@whiteboard/core/schema`
- `@whiteboard/core/result`

替换为：

- `@whiteboard/core` 根导出
- `@whiteboard/core/types`

如果需要保留少量子路径，只保留：

- `@whiteboard/core/document`
- `@whiteboard/core/operations`
- `@whiteboard/core/registry`
- `@whiteboard/core/geometry`
- `@whiteboard/core/node`
- `@whiteboard/core/edge`
- `@whiteboard/core/mindmap`
- `@whiteboard/core/selection`
- `@whiteboard/core/types`

---

## 4. 要删除的目录与文件

## 4.1 直接删除目录

- `src/canvas/`
- `src/group/`
- `src/kernel/`
- `src/intent/`
- `src/spec/`
- `src/result/`
- `src/mutation/`

## 4.2 直接删除文件

- `src/config/index.ts`
- `src/document/read.ts`
- `src/snap.ts`

## 4.3 合并后删除文件

- `src/node/document.ts`
- `src/node/group.ts`
- `src/node/projection.ts`
- `src/node/selection.ts`
- `src/node/moveState.ts`
- `src/edge/query.ts`
- `src/edge/resolvedPath.ts`
- `src/mindmap/application.ts`
- `src/mindmap/query.ts`
- `src/mindmap/treeMutate.ts`
- `src/selection/query.ts`

---

## 5. 要新增的目录与文件

## 5.1 新增根入口

- `src/index.ts`

只导出最终 public surface：

- `document`
- `operations`
- `registry`
- `geometry`
- `node`
- `edge`
- `mindmap`
- `selection`

## 5.2 新增 `operations/`

新增：

- `src/operations/index.ts`
- `src/operations/definitions.ts`
- `src/operations/spec.ts`
- `src/operations/apply.ts`
- `src/operations/compile.ts`
- `src/operations/history.ts`
- `src/operations/lock.ts`
- `src/operations/plan.ts`

说明：

- `definitions.ts`：迁出原 `WHITEBOARD_OPERATION_DEFINITIONS`
- `spec.ts`：迁出原 `whiteboardMutationOperations`
- `apply.ts`：迁出原 `reduceWhiteboardOperations`
- `compile.ts`：合并原 `intent/compile.ts` + `intent/context.ts` + `intent/handlers.ts`
- `history.ts`：合并原 `spec/history/*`
- `lock.ts`：迁出原 `lock/index.ts`
- `plan.ts`：收口 canvas/group 多 op 规划

## 5.3 新增 `registry/`

新增：

- `src/registry/index.ts`
- `src/registry/create.ts`
- `src/registry/schema.ts`

说明：

- `create.ts`：迁出原 `kernel/registries.ts`
- `schema.ts`：迁出原 `schema/index.ts`

---

## 6. shared 侧配套迁移

这些不是 whiteboard 领域逻辑，不应该继续留在 `whiteboard-core`：

- `mutation/recordPath.ts`
- `result/index.ts`

### 6.1 `mutation/recordPath.ts`

迁到 `@shared/mutation`，成为正式 helper：

```ts
mutation.record.read(...)
mutation.record.has(...)
mutation.record.apply(...)
```

然后删除本地 `src/mutation/recordPath.ts`。

### 6.2 `result/index.ts`

不再保留白板自定义 `ok/err`。

统一改为 shared 侧正式结果类型与构造器：

- 如果 shared 已有正式 `MutationResult`
- whiteboard-core 全量切换

否则在 shared 先补正式结果 helper，再删除 `src/result/`。

---

## 7. `config` 的最终处理

`BoardConfig` 不再属于 `whiteboard-core`。

原因：

- 它不是 document model
- 它不是 operation spec
- 它不是纯领域算法
- 它是 editor/runtime 的调参聚合对象

最终处理：

- 删除 `@whiteboard/core/config`
- 各算法函数直接接收自己所需的最小参数
- engine/editor/react 自己定义它们的 runtime config

例如：

- `node.snap.*` 直接收 `thresholdScreen/maxWorld/gridCellSize`
- `edge.connect.*` 直接收 `queryRadius/activationPadding/handleSnapScreen`

不再通过一个 `BoardConfig` 大对象从 core 贯穿。

---

## 8. `document.normalize` 的最终处理

`document.normalize` 保留，但语义固定：

```ts
document.normalize(doc): Document
```

约束：

- 只做固定规范化
- 不再接收 `configOverrides`
- 不再和 runtime config 有任何关系

最终内部职责只包括：

- 去除遗留字段
- materialize 节点固定字段
- 规范化 `canvas.order`
- 保证 document 满足核心不变量

---

## 9. `compile` 的最终处理

`compile` 保留，但不再作为独立顶级模块。

最终：

```ts
operations.compile({
  doc,
  intents,
  registry,
  ids
})
```

### 重构要求

- `intent/context.ts` 删除
- `intent/handlers.ts` 删除
- `intent/index.ts` 删除
- `intent/handlers/*` 迁到 `operations/compile.ts` 内部分区，或按 domain 分成：
  - `operations/compile.node.ts`
  - `operations/compile.edge.ts`
  - `operations/compile.mindmap.ts`

但不要重新长出一个新的重型中间层。

最终 compile 只保留：

- plain object input
- 纯编译逻辑
- 直接调用 `operations.apply` 做中途验证

---

## 10. `spec` 的最终处理

`spec` 不再单独作为一个顶级概念暴露目录。

最终只有：

- `operations.definitions`
- `operations.spec`

约束：

- `definitions` 是领域定义表
- `spec` 是 shared mutation 直接可消费的正式 spec
- `spec` 不再夹杂额外 context builder、history read wrapper、局部 read helper

### `spec/operation/index.ts` 的拆分要求

当前文件太厚，拆成：

- `operations/definitions.ts`
- `operations/spec.ts`
- `operations/apply.ts`
- `operations/history.ts`
- `operations/lock.ts`

拆分原则：

- operation 定义留在 `definitions.ts`
- runtime 接线留在 `spec.ts`
- apply 入口留在 `apply.ts`
- history footprint 规则留在 `history.ts`
- lock 规则留在 `lock.ts`

不要再保留一个 1000+ 行的总装文件。

---

## 11. 目录最终形态

最终推荐目录：

```txt
src/
  index.ts
  types/
  document/
    index.ts
    model.ts
    normalize.ts
    sanitize.ts
    slice.ts
  operations/
    index.ts
    definitions.ts
    spec.ts
    apply.ts
    compile.ts
    history.ts
    lock.ts
    plan.ts
  registry/
    index.ts
    create.ts
    schema.ts
  geometry/
    index.ts
    anchor.ts
    collision.ts
    equality.ts
    point.ts
    polyline.ts
    rect.ts
    rotation.ts
    scalar.ts
    viewport.ts
  node/
    index.ts
    bootstrap.ts
    draw.ts
    frame.ts
    geometry.ts
    hitTest.ts
    layout.ts
    materialize.ts
    move.ts
    ops.ts
    outline.ts
    resize.ts
    shape.ts
    snap.ts
    text.ts
    transform.ts
    update.ts
  edge/
    index.ts
    anchor.ts
    connect.ts
    duplicate.ts
    edit.ts
    endpoints.ts
    equality.ts
    guards.ts
    hitTest.ts
    label.ts
    labelMask.ts
    ops.ts
    patch.ts
    path.ts
    relations.ts
    render.ts
    route.ts
    segment.ts
    view.ts
  mindmap/
    index.ts
    drop.ts
    layout.ts
    ops.ts
    plan.ts
    render.ts
    template.ts
    tree.ts
    types.ts
  selection/
    index.ts
    model.ts
```

说明：

- 不是追求“文件越少越好”
- 而是删除**中间命名层**、**薄包装层**、**重复 glue 层**
- 保留稳定算法分块

---

## 12. 迁移顺序

## Phase 1：先定 public surface

- 新增 `src/index.ts`
- 新增 `src/operations/`
- 新增 `src/registry/`
- 修改 `package.json` exports
- 先把最终 public API 名字定住

完成标准：

- 外部只需要从 `@whiteboard/core` 或 `@whiteboard/core/types` 取能力
- 不再依赖 `kernel` / `intent` / `spec/*` / `config` / `result`

## Phase 2：迁 `operations`

- `spec/operation/index.ts` 拆到 `operations/*`
- `spec/history/*` 并到 `operations/history.ts`
- `lock/index.ts` 并到 `operations/lock.ts`
- `canvas/*` / `group/*` 并到 `operations/plan.ts`
- `intent/*` 并到 `operations/compile.ts`

完成标准：

- `operations.apply` / `operations.compile` / `operations.history` / `operations.lock` 全部就位
- 删除 `src/spec/`
- 删除 `src/intent/`
- 删除 `src/canvas/`
- 删除 `src/group/`
- 删除 `src/lock/`

## Phase 3：迁 `registry`

- `kernel/registries.ts` → `registry/create.ts`
- `schema/index.ts` → `registry/schema.ts`
- `mutation/recordPath.ts` 上提到 shared

完成标准：

- 删除 `src/kernel/`
- 删除顶级 `schema` public export

## Phase 4：清理 `document`

- 删除 `document/read.ts`
- `document/index.ts` 只保留 `create/assert/normalize/slice`
- 所有原始读取改直读 plain object

完成标准：

- core 内不再出现大面积 `documentApi.read.* / has.* / list.*`

## Phase 5：瘦身 `node/edge/mindmap/selection`

- 改底层函数为最终命名
- 把 `index.ts` 降为薄入口
- 合并中间命名文件

完成标准：

- `node/index.ts` / `edge/index.ts` / `mindmap/index.ts` 不再承担二次语义装配
- `read/get/resolve` 明显下降，只保留少量语义稳定用法

## Phase 6：删除非核心设施

- 删除 `config/index.ts`
- 删除 `result/`
- 删除 `snap.ts`

完成标准：

- core 只剩 document / operations / registry / pure algorithms

---

## 13. 代码级重构清单

## 13.1 exports

- [ ] 新增 `@whiteboard/core` 根导出
- [ ] 根导出只暴露 `document/operations/registry/geometry/node/edge/mindmap/selection`
- [ ] 删除 `./kernel`
- [ ] 删除 `./intent`
- [ ] 删除 `./spec/operation`
- [ ] 删除 `./spec/history`
- [ ] 删除 `./canvas`
- [ ] 删除 `./group`
- [ ] 删除 `./config`
- [ ] 删除 `./schema`
- [ ] 删除 `./result`

## 13.2 operations

- [ ] 拆 `src/spec/operation/index.ts`
- [ ] 建 `operations.definitions`
- [ ] 建 `operations.spec`
- [ ] 建 `operations.apply`
- [ ] 建 `operations.compile`
- [ ] 建 `operations.history`
- [ ] 建 `operations.lock`
- [ ] 建 `operations.plan`
- [ ] 删除 `src/spec/`
- [ ] 删除 `src/intent/`
- [ ] 删除 `src/lock/`
- [ ] 删除 `src/canvas/`
- [ ] 删除 `src/group/`

## 13.3 registry

- [ ] `createRegistries` 改为 `registry.create`
- [ ] `schema` 挂到 `registry.schema`
- [ ] 删除 `src/kernel/`
- [ ] `recordPath` 迁 shared

## 13.4 document

- [ ] 删除 `document.read`
- [ ] 删除 `document.has`
- [ ] 删除大部分 `document.list`
- [ ] `normalize` 去掉 config 参数
- [ ] 保留 `slice.*`

## 13.5 node

- [ ] 删除 `node/document.ts`
- [ ] 删除 `node/group.ts`
- [ ] 删除 `node/projection.ts`
- [ ] 删除 `node/selection.ts`
- [ ] 删除 `node/moveState.ts`
- [ ] 把 `index.ts` 变薄
- [ ] 统一命名到最终语义

## 13.6 edge

- [ ] 删除 `edge/query.ts`
- [ ] 删除 `edge/resolvedPath.ts`
- [ ] `path/fromRects` 并回 `edge.path`
- [ ] `capability/box/routePoints` 挂回稳定语义位

## 13.7 mindmap

- [ ] 删除 `mindmap/application.ts`
- [ ] 删除 `mindmap/query.ts`
- [ ] 删除 `mindmap/treeMutate.ts`
- [ ] `application` → `plan`
- [ ] `treeMutate` → `tree`

## 13.8 selection

- [ ] 删除 `selection/query.ts`
- [ ] `boxTarget` 提为稳定入口
- [ ] `bounds.get` 改成 `bounds`

## 13.9 shared 配套

- [ ] `recordPath` 升级为 `@shared/mutation` 正式 helper
- [ ] `Result/ok/err` 迁 shared 或切 shared 正式结果类型

---

## 14. 完成标准

全部完成后，`whiteboard-core` 应满足：

- document 是 plain object，可直接持有
- normalize 是固定能力，不吃 runtime config
- operations 是唯一 spec/apply/compile/history/lock 入口
- registry 是唯一 registry/schema 入口
- 不再有 `kernel` / `intent` / `spec/*` / `config` / `result`
- 不再有大面积 `document.read.* / has.* / list.*`
- `node` / `edge` / `mindmap` / `selection` 只保留稳定算法面
- 顶层只剩一个清晰核心，而不是多套平行入口


# Whiteboard Helper 复用与读写中轴最终方案

## 1. 最终结论

- 需要保留读写中轴，但只能保留薄中轴，不能再叠第二层 helper 中轴。
- 全链最终只保留 4 个稳定边界：
  - `DocumentReader`：文档真值读。
  - `WhiteboardMutationDelta`：增量事实读。
  - `SceneRead`：projection 产出的派生场景读。
  - `EditorWrite` / `engine.execute(...)`：语义写入口。
- `shared/projection` 继续只做 phase 调度、state/store 同步、delta apply，不承接 whiteboard 领域 helper。
- 纯函数下沉规则固定如下：
  - 跨领域通用：下沉到 `shared/*` 或 `@whiteboard/core/geometry`。
  - whiteboard 领域纯算法：下沉到 `@whiteboard/core/*` 现有模块。
  - projection / editor / react 只保留编排、适配、UI equality、DOM adapter。
- 不再继续扩散碎片化 mini port，例如：
  - `{ get, editable }`
  - `{ id, structure, layout }`
  - `{ readNode, readRect }`
  - `Pick<...>` 裁一小块再传
- 跨包算法要么吃纯数据，要么直接吃完整 `SceneRead` 或完整 domain slice，例如 `scene.edges`、`scene.mindmaps`，不要再造局部 helper context。

## 2. 已有可复用基础设施

这些能力已经存在，应优先复用，不应再在 scene / editor / react 层重复实现。

### 2.1 shared

- `shared/projection/src/apply.ts`
  - `applyValue`
  - `applyFamilyReset`
  - `applyFamilyTouched`
  - `applyEntity`
- `shared/mutation/src/engine/entity.ts`
  - path / entity / changed-path 解释能力已经是 shared kernel。
- `shared/mutation/src/engine/structural.ts`
  - tree / ordered structure 读写 kernel 已存在。

结论：

- `shared/projection` 不缺“下游 helper 容器”，它缺的是下游不要再把纯算法留在 projection 文件里。
- `shared/mutation` 已经是正确的底层位置，不应再在 whiteboard/editor-scene 里重复解释 path / changed scope。

### 2.1.1 `shared/projection/apply*` 的最终定位

当前 `shared/projection/src/apply.ts` 暴露：

- `applyValue`
- `applyFamilyReset`
- `applyFamilyTouched`
- `applyEntity`

它们作为 projection runtime 的内部执行原语是合理的，但**不是长期最优的 shared 对外 API**。

原因：

- `applyValue` 还比较中性，本质是 value reconcile。
- `applyFamilyReset` / `applyFamilyTouched` 已经暴露了当前 projection runtime 的 family 执行模型。
- `applyEntity` 更进一步把 `entityDelta`、`geometryDelta` 这种 whiteboard 下游语义也带进了 shared helper，抽象层次已经过低。

最终结论：

- `apply*` 可以保留，但只能是 `shared/projection` 内部 kernel，不应继续作为外部建模 API。
- whiteboard / dataview / 其他 projection 不应再以“调用 `applyEntity` 之类 helper”为主来组织模型代码。
- `shared/projection` 对外应该只暴露：
  - `createProjection(...)`
  - store spec
  - phase graph / phase scheduling
  - 必要的 trace / metrics / revision 能力

不应该对外暴露：

- 当前 family / entity / geometry delta 的执行细节 helper
- 当前 store 同步策略的细节 helper
- 带明显领域副作用语义的 reconcile helper

下一轮收口方向：

- 把 `applyValue` / `applyFamilyReset` / `applyFamilyTouched` / `applyEntity` 视为 internal。
- 上层如果确实还需要共享 reconcile 原语，也只能收敛成更中性的 internal kernel，例如：
  - `reconcileValue`
  - `reconcileMap`
  - `diffById`
- domain patch 层不要再直接依赖 `applyEntity` 风格 API。
- 长期目标是“按 spec 直接映射 + phase 编排”，而不是“domain patch 文件围绕 shared helper 形状反向建模”。

### 2.2 whiteboard-core

- `whiteboard-core/src/geometry/rect.ts`
  - `rectFromPoint`
  - `rectFromPoints`
  - `containsPoint`
  - `contains`
  - `expandRect`
  - `getRectCenter`
- `whiteboard-core/src/geometry/scalar.ts`
  - `pickNearest`
- `whiteboard-core/src/node/outline.ts`
  - `containsPointInNodeOutline`
  - `distanceToNodeOutline`
- `whiteboard-core/src/edge/hitTest.ts`
  - `distanceToPath`
  - `matchEdgeRect`
- `whiteboard-core/src/node/frame.ts`
  - `pickFrame`
  - `pickFrameParent`
  - `createFrameQuery`
- `whiteboard-core/src/edge/connect.ts`
  - 已经有 edge connect / reconnect / snap 纯算法。
- `whiteboard-core/src/node/transform.ts`
  - 已经有 transform step / commit 纯算法。

结论：

- `whiteboard-core` 已经是 whiteboard 纯算法主仓，但还没覆盖完整。
- 应继续往这里补足缺失的通用命中、距离、reconnect、transform spec builder，而不是把这些 helper 留在 editor-scene / editor。

### 2.3 engine

- `whiteboard-engine/src/runtime/engine.ts`
  - 已经稳定暴露 `DocumentReader`。
- `whiteboard-engine/src/mutation/delta.ts`
  - 已经稳定暴露 `WhiteboardMutationDelta` typed view。

结论：

- engine 层已经有文档读和 delta 读两个正确中轴。
- 不应再在 scene / editor 层为 document / delta 额外包装第二套解释 helper。

## 3. 按函数名分类的最终归类

## 3.1 直接删除重复实现，改用现成组件

这些函数是纯重复，不需要新设计，直接统一到现有底层能力。

| 现有函数 | 位置 | 问题 | 直接改为 |
| --- | --- | --- | --- |
| `toRect` | `whiteboard-editor-scene/src/projection/query/hit.ts` | 重复实现 point + radius -> rect | `geometry.rect.fromPoint` |
| `toPickRect` | `whiteboard-editor/src/scene/api.ts` | 同上 | `geometry.rect.fromPoint` |
| `createMarqueeRect` | `whiteboard-editor/src/input/features/selection/marquee.ts` | 重复实现两点包围盒 | `geometry.rect.fromPoints` |
| `toRectCenter` | `whiteboard-editor/src/tasks/mindmap.ts` | 重复实现 rect center | `geometry.rect.center` |

结论：

- 这类 helper 不应保留在业务文件。
- 一旦底层已有同义 API，局部 helper 一律删除。

## 3.2 缺底层通用纯函数，应下沉到 core/shared

这些函数是纯函数，而且已经出现重复或同类重复，问题不在“局部 helper 太多”，而在底层 API 缺位。

| 现有函数 | 位置 | 现状 | 最终位置 |
| --- | --- | --- | --- |
| `readRectDistance` | `projection/query/hit.ts` | point-to-rect distance | `@whiteboard/core/geometry.rect.distanceToPoint` |
| `distanceToRect` | `core/edge/connect.ts` | 和上面同类重复 | 合并到 `geometry.rect.distanceToPoint` |
| `pickBetter` | `projection/query/hit.ts` | 最近目标 + order tie-break | `@whiteboard/core/geometry.scalar` 扩展统一 winner picker |
| `pick` | `core/node/frame.ts` | 同类 winner arbitration | 复用统一 winner picker |
| `node/snap.ts` 里的若干 `bestX/bestY` 选择逻辑 | `core/node/snap.ts` | 同类最近候选挑选逻辑 | 复用统一 winner picker |

最终要求：

- `geometry.rect` 必须提供完整的点/矩形距离与基础投影能力。
- `geometry.scalar` 必须提供统一 winner 选择能力，至少覆盖：
  - 最近距离
  - tie-break order
  - 忽略 `undefined`

## 3.3 whiteboard 领域纯算法，应下沉到 `whiteboard-core`

这些函数虽然现在长得像 `readXXX`，但本质不是“读状态”，而是“对现成领域数据做纯推导”。它们不该留在 projection / editor。

| 现有函数 | 位置 | 本质 | 最终位置 |
| --- | --- | --- | --- |
| `readNodeDistance` | `projection/query/hit.ts` | node hit scorer | `@whiteboard/core/node.hit` |
| `readEdgeDistance` | `projection/query/hit.ts` | edge hit scorer | `@whiteboard/core/edge.hit` |
| `readMindmapDistance` | `projection/query/hit.ts` | mindmap hit scorer | `@whiteboard/core/mindmap` 或新增 `core/hit` 子模块 |
| `readGroupDistance` | `projection/query/hit.ts` | group hit scorer | `@whiteboard/core/group` 或新增 `core/hit` 子模块 |
| `resolveCreatePreviewPath` | `editor/input/features/edge/connect.ts` | edge preview path 纯推导 | `@whiteboard/core/edge.view` / `edge.connect` |
| `readReconnectPatch` | `editor/input/features/edge/connect.ts` | reconnect patch 合成 | `@whiteboard/core/edge.connect` |
| `readReconnectDraftPatch` | `editor/input/features/edge/connect.ts` | reconnect draft 规则 | `@whiteboard/core/edge.connect` |
| `readReconnectWorld` | `editor/input/features/edge/connect.ts` | reconnect 输入投影规则 | `@whiteboard/core/edge.connect` |
| `readNodeTransformSpec` | `editor/input/features/transform.ts` | transform 规格构造 | `@whiteboard/core/node.transform` |
| `toSpatialSelectionPlan` | `editor/input/features/transform.ts` | selection transform 输入适配 | `@whiteboard/core/node.transform` 接受更标准输入后删除局部 helper |

最终要求：

- `hit.ts` 这类文件不能再混合：
  - 几何纯函数
  - 领域命中算法
  - runtime adapter
- `editor/input/features/*` 不能再承载 edge connect / transform 的领域 kernel，只负责会话编排。

## 3.4 不是纯函数下沉问题，而是 `SceneRead` API 太碎

这批 `readXXX` 出现的根因不是“缺少 helper 文件”，而是 `SceneRead` 没有直接表达业务需要，导致 editor 层不停手工拼装。

| 现有函数 | 位置 | 暴露的问题 | 最终方案 |
| --- | --- | --- | --- |
| `readEditableEdgeView` | `editor/input/features/edge/route.ts` | `edges.get` + `edges.editable` 分裂 | `scene.edges.edit(id)` 或 `scene.edges.getEditable(id)` |
| `readMindmapTreeView` | `editor/input/features/mindmap/drag.ts` | 需要 `id + structure + layout` 三次查询再拼 | `scene.mindmaps.tree(idOrNodeId)` |
| `readReconnectFixedPoint` | `editor/input/features/edge/connect.ts` | editor 手工拆 `route.ends` | `scene.edges.reconnect(id, end)` 或 core connect API 吃 `EdgeView` |
| `readRoutePointIdAtIndex` | `editor/input/features/edge/route.ts` | editor 手工理解 manual route 数据结构 | `scene.edges.routePoint(id, index)` 或 core route API |
| `readSelectionMembersKey` | `projection/query/selection.ts` | selection 成员 cache key 手工拼接 | 下沉到 `selectionApi.target.key(...)` |
| `readSelectionHandles` | `editor/derived/scene.ts` | selection affordance 的字段提取 | 如果只是 presentation 投影则保留局部；若多处复用则下沉到 `selectionApi.derive` |
| `readEdgeLabelMetrics` | `editor/input/features/edge/label.ts` | label view 取数不直接 | `scene.edges.label(id, labelId)` 或直接用 `EdgeView.route.labels` 标准访问 |

最终要求：

- `SceneRead` 只增加“跨多处调用且天然属于场景读边界”的高阶读能力。
- 不为每个标量字段再加 helper。
- 判定标准固定：
  - 只是取 `view.geometry.rect` 这种字段访问：直接 `.get(id)` 后内联读取。
  - 需要跨多张表、多个索引、多个 view 合并：升格为 `SceneRead` 高阶方法。

## 3.5 可以保留局部，不需要下沉

这些 helper 虽然也叫 `read*` / `resolve*` / `is*`，但它们不是共享基础设施问题，而是单一功能或 UI 层逻辑。

| 现有函数 | 位置 | 结论 |
| --- | --- | --- |
| `isChromeMarqueeEqual` / `isSelectionSummaryViewEqual` / `isSelectedEdgeChromeEqual` | `editor/derived/scene.ts` | UI derived equality，保留局部 |
| `previewMindmapDrag` | `editor/input/features/mindmap/drag.ts` | 单一手势 preview 映射，保留局部 |
| `resolveElementAtPoint` / `resolveSelectionBoxUnderlyingPick` / `readPointerSnapshot` | `whiteboard-react/src/dom/host/input.ts` | DOM host adapter，保留在 react/shared-dom 边界 |
| `createNodeUpdateWrite` / `createNodeContext` | `editor/write/node.ts` | 写边界编排，保留为 boundary composer |

结论：

- 不是所有 helper 都要下沉。
- 只有“重复纯算法”或“中轴缺位导致的拼装 helper”才处理。

## 4. 各包最终职责

### 4.1 `shared/*`

- 只保留基础设施：
  - mutation kernel
  - projection kernel
  - store kernel
  - 通用 collection / geometry / dom / scheduler
- 不承接 whiteboard 场景级 helper。
- `shared/projection` 对外 API 只保留 projection 壳层，不把 `apply*` 这类内部 reconcile helper 当作 public surface。

### 4.2 `whiteboard-core`

- whiteboard 领域纯算法唯一归宿：
  - node
  - edge
  - mindmap
  - selection
  - geometry
  - frame / hit / transform / connect / render
- 凡是“不依赖运行时状态容器，只依赖 plain data”的 whiteboard 算法，一律进 core。

### 4.3 `whiteboard-engine`

- 提供 canonical document read 和 mutation delta read。
- 不承接 scene projection helper。

### 4.4 `whiteboard-editor-scene`

- 只做 3 件事：
  - 把 document + runtime input 编译成 `WorkingState`
  - 用 core 纯算法生成 scene view
  - 用 `shared/projection` 同步 stores 与增量通知
- 不应保留白板领域纯 math / hit / route / transform kernel。

### 4.5 `whiteboard-editor`

- 只做输入会话、流程编排、preview 组织、语义写调用。
- 不再手工拼：
  - edge editable view
  - mindmap tree view
  - reconnect fixed point
  - transform spec

### 4.6 `whiteboard-react`

- 基本已经较薄，主要是：
  - DOM host adapter
  - store -> React 订阅
  - 渲染组件
- 只需要删除重复的几何 helper 和不必要的 read 包装，不需要再造一套 scene/runtime。

## 5. 最终读写中轴设计

## 5.1 读中轴需要保留

需要，但只能保留两层读边界。

### 第一层：`DocumentReader`

用途：

- 读 document 真值。
- 读结构、关系、canvas 顺序。
- 给 engine、write、部分 compile / validate 逻辑使用。

要求：

- 不依赖 projection。
- 不做 runtime/session/preview 解释。

### 第二层：`SceneRead`

用途：

- 读 projection 后的派生 scene。
- 读 `WorkingState`、空间索引、运行时 preview 合成结果。
- 给 editor / react 作为唯一场景查询入口。

要求：

- editor/react 跨模块算法直接吃完整 `SceneRead` 或完整 domain slice。
- 不再传递局部临时结构体，比如：
  - `MindmapQuery`
  - `EdgeConnectPreviewGeometryRead`
  - `{ get, editable }`

### 第三类读：`WhiteboardMutationDelta`

用途：

- 读 commit 的增量事实。
- 给 projection plan / patch 决定 touched scope。

要求：

- 不再在下游定义第二套 touched helper 语义。
- typed delta 是 engine 输出事实，不是 editor-scene 重新解释的二次模型。

## 5.2 写中轴需要保留，但只能一层

- engine 是最终 mutation 执行边界。
- editor.write 是语义写 facade。
- preview / session write 属于本地临时状态，不算共享写中轴。

最终要求：

- feature 不再自己拼 record path patch。
- 像 `createStyleRecordUpdate`、`createDataRecordUpdate` 这种字符串路径拼装，应尽量下沉到 core update builder 或 spec 生成层。
- 写 API 只接收领域语义输入，不接收散落的 path string。

## 5.3 `SceneRead` 的最终风格

`SceneRead` 要表达业务动作，不表达底层表拼装。

推荐方向：

```ts
scene.nodes.get(id)
scene.edges.get(id)
scene.edges.edit(id)
scene.mindmaps.tree(idOrNodeId)
scene.selection.summary(target)
scene.hit.pick({ point, radius, kinds, exclude })
```

不推荐继续扩散：

```ts
readEditableEdgeView({ get, editable }, id)
readMindmapTreeView({ id, structure, layout }, treeId)
readReconnectFixedPoint(ctx, state)
```

原则：

- 需要跨多个索引 / 多个 view / 多份 runtime state 才能回答的问题：挂到 `SceneRead`。
- 简单字段访问：直接 `get(id)` 后内联。
- 纯算法：进 `whiteboard-core`，不要挂到 `SceneRead`。

## 6. 对 `hit.ts` 的直接结论

`whiteboard/packages/whiteboard-editor-scene/src/projection/query/hit.ts` 目前同时混了三层：

1. 通用几何 helper
   - `toRect`
   - `readRectDistance`
   - `pickBetter`
2. whiteboard 领域 hit scorer
   - `readNodeDistance`
   - `readEdgeDistance`
   - `readMindmapDistance`
   - `readGroupDistance`
3. runtime adapter
   - `createHitRead`

最终拆分：

- 第 1 层下沉到 `@whiteboard/core/geometry`。
- 第 2 层下沉到 `@whiteboard/core/node|edge|mindmap|group` 的 hit 模块。
- 第 3 层保留在 editor-scene，只负责：
  - 从 `WorkingState` 取 view
  - 调 core scorer
  - 通过 spatial query 编排结果

## 7. 对 patch/helper 厚度的直接结论

`editor-scene/src/model/*/patch.ts` 长，不是因为必须长，而是因为很多文件同时承担了：

- source 读取
- 纯推导
- equality 判断
- delta 写入
- store 同步

最终要求：

- `patch*` 文件只保留：
  - touched scope 遍历
  - state 写入
  - delta 写入
- 纯推导和纯 equal 判断要抽走：
  - 几何 / 命中 / route / transform / render style bucket 之类进 core
  - 通用 apply / entity diff 继续走 `shared/projection`

典型例子：

- `model/graph/node.ts`
  - `readProjectedNodeRect`、`readProjectedNodeSize`、`readProjectedNodeRotation` 这类属于 node 投影纯推导，适合逐步沉到 core node projection helper。
- `model/render/statics.ts`
  - `readEdgeStaticStyleKey`、`buildStaticBucket`、`buildStaticState` 属于 edge render bucket 纯推导，适合沉到 core edge render。
- `model/render/overlay.ts`
  - `readSelectedEdgeRoutePoints`、`resolveRenderEdgeCapability` 属于 overlay 领域计算，不应和 `applyValue` 写入搅在一个文件里。

## 8. 实施方案

### Phase 1：统一已有底层复用

- 删除并替换所有重复基础几何 helper：
  - `toRect`
  - `toPickRect`
  - `createMarqueeRect`
  - `toRectCenter`
- 在 `geometry.rect` 补 `distanceToPoint`。
- 在 `geometry.scalar` 补统一 winner picker，覆盖 distance + order tie-break。

### Phase 1.5：收紧 `shared/projection` public surface

- 停止把 `applyValue`
  `applyFamilyReset`
  `applyFamilyTouched`
  `applyEntity`
  当作 shared 外部 helper 继续扩散。
- 将其标记为 internal runtime kernel。
- 梳理 whiteboard / dataview 是否还有直接依赖这些 helper 的建模代码。
- 下一轮收口时，把 projection 外部 API 明确限制为：
  - `createProjection`
  - store spec
  - plan / phase
  - trace / metrics

### Phase 2：把命中/连接/变换纯算法收回 core

- 把 `hit.ts` 的 scorer 拆到 core。
- 把 edge connect / reconnect 的纯推导 helper 收回 `core/edge`.
- 把 transform spec 构造收回 `core/node.transform`.

### Phase 3：瘦身 `SceneRead`

- 增加真正缺位的高阶读能力：
  - `scene.edges.edit(id)`
  - `scene.mindmaps.tree(idOrNodeId)`
  - 必要时 `scene.edges.routePoint(...)`
- 删除 editor 里的局部拼装 helper：
  - `readEditableEdgeView`
  - `readMindmapTreeView`
  - `readReconnectFixedPoint`

### Phase 4：瘦身 patch 文件

- `editor-scene/src/model/*` 中把纯计算挪到 core。
- patch 文件只保留 touched iteration + state write + delta write。

### Phase 5：瘦身 write 层

- 把 path string patch builder 从 editor/write 下沉到 core update builder 或 spec。
- feature / command 只传语义输入。

### Phase 6：全链审计

- editor：不再传 mini port。
- react：删除重复几何 helper，只保留 DOM adapter。
- shared：确认没有被 whiteboard helper 反向侵蚀。

## 9. 最终判断

- 现在的问题不主要是 `shared/projection` 不够强。
- 真正的问题是：
  - 底层通用纯函数有缺口。
  - `whiteboard-core` 还没吃下所有领域纯算法。
  - `SceneRead` 还没把真正需要的高阶读能力表达完整。
  - editor/editor-scene 因此被迫写出大量 `readXXX/resolveXXX` 拼装 helper。

长期最优目标：

- `shared` 只做 shared kernel。
- `core` 吃满纯算法。
- `engine` 暴露 document + delta。
- `scene` 只做 projection 编排。
- `editor` 只做交互编排。
- `react` 只做 DOM/渲染。

做到这一点后，helper 不会完全消失，但只会剩下两类：

- UI/DOM 局部 helper
- 单一 feature 的状态机辅助函数

而不会再剩下大量“因为中轴不直观，所以到处手工 read/patch/resolve”的 helper。

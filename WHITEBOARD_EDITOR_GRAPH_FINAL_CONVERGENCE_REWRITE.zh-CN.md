# Whiteboard Editor Graph 最终收敛重构方案

本文只回答一个问题：

`whiteboard/packages/whiteboard-editor-graph` 长期最优的最终形态应该是什么，哪些中间层应该直接删除，哪些底层模型必须补齐，包边界应如何重切。

本文明确前提：

- 不在乎重构成本
- 不需要兼容旧 API
- 不保留双轨实现
- 不以“渐进迁移容易”作为设计目标
- 目标是长期最优、依赖清晰、bug 少、可维护

---

## 1. 最终结论

长期最优方案很明确：

1. `whiteboard-editor-graph` 应收敛成一个纯 projection 内核包
2. 它只负责把 editor source input 投影成：
   - `graph snapshot`
   - `ui snapshot`
   - `scene snapshot`
3. 它不应该再长期保留：
   - `input working`
   - `measure working`
   - `structure working`
   - `tree working`
   - `element working`
   - `scene working`
   这类层层转存的中间状态
4. 它不应该继续保留“定义得很细但并未真正落地”的 `Token` / `dirty` 体系
5. `read facade`、`publish spec` 这类宿主适配器不应属于核心 projection 包
6. 测试 helper 不应进入根导出

一句话概括：

> `whiteboard-editor-graph` 应从“多层 working + 半成品 invalidation + 宿主包装混杂”的包，收敛成“单一 source change、单层 graph working、直接发布 snapshot”的 projection 内核。

---

## 2. 当前结构的根问题

当前问题不是“算法太多”，而是“同一份语义被重复建模了多次”。

### 2.1 一套未落地的 `Token` / `dirty` 体系在制造复杂度

`contracts/impact.ts` 里定义了非常大的 `Token` union：

- `document`
- `session`
- `measure`
- `interaction`
- `viewport`
- `clock`
- `graph`
- `structure`
- `tree`
- `element`
- `ui`
- `scene`

见：

- `whiteboard/packages/whiteboard-editor-graph/src/contracts/impact.ts`

但 planner 实际只产出 source-domain token：

- `document`
- `session`
- `measure`
- `interaction`
- `viewport`
- `clock`

见：

- `whiteboard/packages/whiteboard-editor-graph/src/runtime/planner.ts`

并且 planner 最终只把 dirty 挂给 `input` phase：

```ts
return createPlan({
  dirty: new Map([
    ['input', new Set(tokens)]
  ])
})
```

这意味着：

- `graph/structure/tree/element/ui/scene` 级 token 只是类型噪音
- `graph.dirty` / `measure.dirty` 只是看起来像增量，实际上没有形成真正的增量链

这是第一类必须直接删除的复杂度。

### 2.2 `input` phase 和 `measure` phase 基本只是复制

`input` phase 只是把 `context.input` 再复制到 `working.input`。

见：

- `whiteboard/packages/whiteboard-editor-graph/src/phases/input.ts`

`measure` phase 只是把 `input.measure.text` 再复制到 `working.measure`。

见：

- `whiteboard/packages/whiteboard-editor-graph/src/phases/measure.ts`

这两层没有形成独立语义边界，只是在放大 working state 体积和依赖链长度。

### 2.3 同一份 owner/layout 语义被拆成了 4 层

当前 mindmap/group 相关语义大致被拆成：

1. `graph owner entry`
2. `structure state`
3. `tree state`
4. `published owner view`

对应代码：

- `whiteboard/packages/whiteboard-editor-graph/src/contracts/working.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/phases/graph.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/phases/structure.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/phases/tree.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/views.ts`

这会导致：

- owner 真相被切碎
- graph phase 只知道一部分 owner 信息
- publisher 还要再做一次 owner view 拼装

长期最优里，owner 相关投影必须在 graph 层一次性完成，不应再拆成结构层、树层、发布层三次拼装。

### 2.4 `scene` 被建模了两次

现在的链路是：

1. `scene phase` 先写 `SceneWorkingState`
2. publisher 再把 `SceneWorkingState` 转成 `SceneSnapshot`

见：

- `whiteboard/packages/whiteboard-editor-graph/src/phases/scene.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/scene.ts`

其中：

- `spatial` 基本就是 `visible` 的再投影
- `pick` 也是 `visible.items` 的再投影

这类结构不值得再保留一个单独的 working 层。

### 2.5 `runtime/helpers.ts` 是无价值的 barrel

`runtime/helpers.ts` 只是：

- `geometry`
- `projection`
- `ui`
- `views`
- `scene`
- `equality`

的统一 re-export。

见：

- `whiteboard/packages/whiteboard-editor-graph/src/runtime/helpers.ts`

它不会减少认知复杂度，反而掩盖真实依赖边界，让 phase 无法显式表达自己到底依赖哪一组能力。

### 2.6 宿主适配器混进了核心包

当前包根导出里包含：

- `createEditorGraphRuntime`
- `createEditorGraphPublishSpec`
- `createEditorGraphRead`
- `createEditorGraphImpact`
- `createEditorGraphTextMeasureEntry`
- `createEditorGraphHarness`

见：

- `whiteboard/packages/whiteboard-editor-graph/src/index.ts`

这里至少有三类东西不应该长期混在一起：

1. 核心 runtime
2. 宿主适配器
3. testing helper

其中：

- `createRead` 本质上只是宿主读 facade
- `createPublishSpec` 本质上只是 selector 集合
- `createEditorGraphHarness` / `createEditorGraphImpact` / `createEditorGraphTextMeasureEntry` 本质上是测试工具

长期最优里，这些边界必须分开。

### 2.7 `ImpactInput` 的正式辅助构造位置是错的

`ImpactInput` 是核心 contract。

但核心包里并没有正式的宿主辅助构造 API，反而测试 builder 里有：

- `createEditorGraphImpact`

见：

- `whiteboard/packages/whiteboard-editor-graph/src/testing/builders.ts`

而宿主侧 `whiteboard-editor` 又手写了一份：

- `whiteboard/packages/whiteboard-editor/src/graph/input.ts`

这说明：

- 底层变化模型是重要 contract
- 但它的 host-facing helper 没有被放在核心位置

这种设计会不断诱发重复实现。

### 2.8 revision 语义存在重复

当前 snapshot 同时有：

- `snapshot.revision`
- `base.documentRevision`
- `base.inputRevision`

见：

- `whiteboard/packages/whiteboard-editor-graph/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/publisher.ts`

其中 `inputRevision` 只是 input phase 自增后的镜像值，仓内没有看到明确的业务侧必要性。

长期最优里，应删除没有稳定业务语义的 revision 镜像字段。

---

## 3. 直接可以砍掉的层

以下内容建议直接删除，不保留兼容。

### 3.1 删除 `Token`

删除：

- `whiteboard/packages/whiteboard-editor-graph/src/contracts/impact.ts`

改为更小的 source change contract。

原因：

- 现在的 `Token` 体系没有形成真实的 phase-level incremental
- 只会制造一种“看起来支持精细 fanout”的错觉

### 3.2 删除 `input` phase

删除：

- `whiteboard/packages/whiteboard-editor-graph/src/phases/input.ts`

原因：

- 它没有独立投影价值
- 只是复制 source input 到 working

### 3.3 删除 `measure` phase

删除：

- `whiteboard/packages/whiteboard-editor-graph/src/phases/measure.ts`

原因：

- measure 是 source input 的一部分
- 不需要再单独转存一次

### 3.4 删除 `GraphWorkingState.dirty`

删除：

- `whiteboard/packages/whiteboard-editor-graph/src/contracts/working.ts` 中的 `graph.dirty`

### 3.5 删除 `MeasureWorkingState.dirty`

删除：

- `whiteboard/packages/whiteboard-editor-graph/src/contracts/working.ts` 中的 `measure.dirty`

### 3.6 删除 `InputWorkingState.impact`

删除：

- `whiteboard/packages/whiteboard-editor-graph/src/contracts/working.ts` 中的 `working.input.impact`

原因：

- 这些字段都没有形成真正的稳定增量协议

### 3.7 删除 `SceneWorkingState`

删除：

- `whiteboard/packages/whiteboard-editor-graph/src/contracts/working.ts` 中的 `SceneWorkingState`
- `whiteboard/packages/whiteboard-editor-graph/src/phases/scene.ts` 对 `working.scene` 的写入形态
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/scene.ts` 中 working/snapshot 双层 scene 模型

保留最终 `SceneSnapshot` 即可。

### 3.8 删除 `runtime/helpers.ts`

删除：

- `whiteboard/packages/whiteboard-editor-graph/src/runtime/helpers.ts`

改为 direct import。

### 3.9 删除 `createRead`

删除：

- `whiteboard/packages/whiteboard-editor-graph/src/read/createRead.ts`

原因：

- 它只是宿主 facade
- 不属于 projection runtime 核心

### 3.10 删除 `createPublishSpec`

删除：

- `whiteboard/packages/whiteboard-editor-graph/src/publish/createPublishSpec.ts`

原因：

- 它只是 selector 集合
- 不属于 projection 内核

### 3.11 根导出移除 testing

根导出删除：

- `createEditorGraphImpact`
- `createEditorGraphTextMeasureEntry`
- `createEditorGraphHarness`

testing helper 只保留 `/testing/*` 子路径导出。

---

## 4. 需要补齐的底层模型

当前问题不是“模型太少”，而是“缺少真正稳定的底层模型”。

## 4.1 `SourceChange`

最终应引入统一的 source-side change model，替代：

- `ImpactInput`
- `Token`
- 宿主的 `reason[] -> flags`
- 测试 builder 里的 impact helper

推荐最终语义只保留 6 类 source change：

- `document`
- `session`
- `measure`
- `interaction`
- `viewport`
- `clock`

注意：

- 不要再把 `graph/tree/ui/scene` 级 token 放进 source change
- 那些是内部投影结果，不是 host source

一句话：

> 输入变化只能描述 source，不能描述 projection 内部阶段。

## 4.2 `GraphState`

长期最重要的新底层模型是 `GraphState`。

它应成为唯一的内部核心 working state，直接承载 publish-ready graph 结果：

- `nodes: Map<NodeId, NodeView>`
- `edges: Map<EdgeId, EdgeView>`
- `mindmaps: Map<MindmapId, MindmapView>`
- `groups: Map<GroupId, GroupView>`

这意味着：

- 当前 `graph`
- 当前 `structure`
- 当前 `tree`
- 当前 `element`

四层最终都要被收敛进一个 graph 投影结果。

## 4.3 `PlacedNode` / `PlacedEdge` / `PlacedMindmap`

如果不希望内部直接把 `NodeView/EdgeView/MindmapView` 当 working state，那么就必须单独引入一个更底层、更稳定的“已放置对象”模型。

推荐语义：

- `PlacedNode`
  - 最终 node 内容
  - 最终 rect / bounds / rotation
  - owner
  - render flags
- `PlacedEdge`
  - 最终 edge 内容
  - 最终 route / bounds / labels
  - render flags
- `PlacedMindmap`
  - 最终 tree layout
  - connectors
  - structure node ids

关键点：

- edge route 不应从 `NodeView` 反向回推输入
- group bounds 不应再从更高层 view 反向读取

必须有一层真正稳定的底层几何/布局对象，让后续投影直接消费。

## 4.4 `UiSnapshot`

UI 不需要 working/view 双层模型。

最终只保留：

- `selection`
- `chrome`

并在 `ui` phase 内一次性直接生成最终 `UiSnapshot`。

## 4.5 `SceneSnapshot`

Scene 也不需要 working/snapshot 双层。

最终 `scene` phase 直接产出：

- `items`
- `visible`
- `spatial`
- `pick`

其中：

- `pick`
- `spatial`

只是最终 scene 的组成字段，不必再先落地为 working state。

## 4.6 `RevisionState`

最终保留：

- `snapshot.revision`
- `documentRevision`（若宿主需要）

删除：

- `inputRevision`

---

## 5. 最终 phase 结构

当前 9 个 phase：

1. `input`
2. `graph`
3. `measure`
4. `structure`
5. `tree`
6. `element`
7. `selection`
8. `chrome`
9. `scene`

长期最优建议收敛为 3 个 phase。

## 5.1 `graph`

输入：

- `document`
- `session`
- `measure`
- `interaction`
- `clock`

职责：

- 合成 node draft / preview / edit
- 合成 edge draft / preview / edit
- 计算 node geometry
- 计算 edge geometry
- 计算 mindmap layout / connectors
- 计算 group bounds
- 直接形成 publish-ready `GraphState`

也就是说，当前：

- `graph`
- `structure`
- `tree`
- `element`

四个 phase 全部并入一个最终 `graph` phase。

## 5.2 `ui`

输入：

- `graph`
- `session`
- `interaction`

职责：

- selection summary
- selection affordance
- chrome overlays
- marquee / guides / draw / edit / mindmap preview

当前：

- `selection`
- `chrome`

合并为一个 `ui` phase。

## 5.3 `scene`

输入：

- `graph`
- `viewport`

职责：

- order
- visible items
- spatial
- pick

直接输出最终 `SceneSnapshot`。

---

## 6. 最终 working state

最终 `WorkingState` 应收紧成：

```ts
interface WorkingState {
  revision: {
    document: Revision
  }
  graph: GraphState
  ui: UiSnapshot
  scene: SceneSnapshot
}
```

如果确实要保留 source input 的只读引用，也应是极小的一份：

```ts
interface WorkingState {
  source: {
    document: DocumentSnapshot
    change: SourceChange
  }
  graph: GraphState
  ui: UiSnapshot
  scene: SceneSnapshot
}
```

不要再保留：

- `working.input`
- `working.measure`
- `working.structure`
- `working.tree`
- `working.element`
- `working.scene`

这种多层中间态。

---

## 7. 包边界最终形态

## 7.1 根导出只保留核心

根导出只保留：

- `createEditorGraphRuntime`
- 核心 contract type
- 正式的 input/source change helper（如果保留）

## 7.2 宿主适配器下沉

以下内容移回 `whiteboard-editor`：

- `createRead`
- `createPublishSpec`

因为它们本质上是：

- runtime host adapter
- editor-side convenience layer

不是 projection 内核。

## 7.3 testing 只保留测试子路径

保留：

- `@whiteboard/editor-graph/testing/*`

但不再从包根导出 testing helper。

## 7.4 contract 文件按职责拆分

当前 `contracts/editor.ts` 过大。

长期最优应拆成：

- `contracts/input.ts`
- `contracts/view.ts`
- `contracts/change.ts`
- `contracts/runtime.ts`

不需要 TS namespace。

只要按职责拆文件即可。

---

## 8. 发布层最终形态

当前 publisher 还在做一件不该由 publisher 做的事：

- 再次拼装 owner view
- 再次拼装 scene snapshot

见：

- `whiteboard/packages/whiteboard-editor-graph/src/runtime/publisher.ts`

长期最优里，publisher 应只负责：

1. 读取已经完成的最终状态
2. 做 family/value diff
3. 产出 `snapshot + change`

不应该再负责：

- `buildMindmapView`
- `buildGroupView`
- `buildSceneSnapshot`

这些二次投影逻辑。

一句话：

> publisher 只能 diff，不能继续算。

---

## 9. 对 `whiteboard-editor` 的影响

按最终形态重构后，`whiteboard-editor` 将承担更清晰的宿主责任：

- source input 构造
- source change 构造
- runtime driver
- published source/store adapter
- editor read facade

而 `whiteboard-editor-graph` 只负责：

- 从 source input 算出 graph/ui/scene

这会显著减少现在这种情况：

- 核心包里混着宿主包装
- 宿主包又反过来自己补 helper

---

## 10. 明确的删除清单

本次最终重构完成后，应删除以下内容：

- `contracts/impact.ts`
- `phases/input.ts`
- `phases/measure.ts`
- `phases/structure.ts`
- `phases/tree.ts`
- `phases/element.ts`
- `phases/selection.ts`
- `phases/chrome.ts`

以上 phase 应被最终 3 phase 结构替代，而不是保留旧文件名。

还应删除：

- `runtime/helpers.ts`
- `read/createRead.ts`
- `publish/createPublishSpec.ts`

并在 `index.ts` 中删除 testing 根导出。

同时删除 working model 中的：

- `InputWorkingState`
- `MeasureWorkingState`
- `StructureWorkingState`
- `TreeWorkingState`
- `ElementWorkingState`
- `SceneWorkingState`
- `graph.dirty`
- `measure.dirty`
- `working.input.impact`

---

## 11. 实施顺序

为了避免在半路再次长出兼容层，建议顺序固定如下。

### 第一步：先清公共边界

1. 从根导出移除 testing
2. 删除 `createRead`
3. 删除 `createPublishSpec`
4. 拆分 `contracts/editor.ts`

### 第二步：删除假增量体系

1. 删除 `Token`
2. 删除 `working.input.impact`
3. 删除 `graph.dirty`
4. 删除 `measure.dirty`
5. 引入单一 `SourceChange`

### 第三步：重构 working model

1. 删除 `input` phase
2. 删除 `measure` phase
3. 合并 `graph + structure + tree + element -> graph`
4. 合并 `selection + chrome -> ui`
5. 删除 `SceneWorkingState`
6. `scene` 直接产出最终 snapshot

### 第四步：收 publisher

1. publisher 不再 build owner view
2. publisher 不再 build scene snapshot
3. publisher 只 diff `graph/ui/scene`

### 第五步：回收 editor 宿主适配器

1. 宿主侧实现 read facade
2. 宿主侧实现 publish source adapter
3. 宿主侧实现 source change helper

---

## 12. 最终判断标准

完成后，`whiteboard-editor-graph` 应满足以下标准：

1. phase 数量不超过 3 个
2. 没有 `Token` / fake dirty 模型
3. publisher 不再做二次投影
4. 根导出不包含 testing
5. 没有 `helpers.ts` 这类总兜底 barrel
6. 宿主适配器全部回到 `whiteboard-editor`
7. graph/ui/scene 成为唯一最终发布面

如果还有以下现象，说明没有收敛完成：

- projection 内核里还保留 `read facade`
- projection 内核里还保留 `publish spec`
- `working` 里还有 `structure/tree/element`
- `planner` 里还有并未真正消费的细粒度 token
- publisher 还在“顺手帮忙算一点东西”

---

## 13. 一句话总结

`whiteboard-editor-graph` 的长期最优方向不是继续补更多 helper，而是：

> 删除半成品增量体系，删除层层转存的 working state，建立单一 source change 和单层 graph working，让 projection 内核只做一件事：把 source input 直接投影成 graph/ui/scene。

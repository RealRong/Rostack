# Dataview 与 Whiteboard 架构对比与思考

## 1. 背景与结论

本文从架构师视角，对比 `dataview` 与 `whiteboard` 两个子项目的结构、核心复杂度、抽象边界，以及它们与 `shared/projector` 这类基础设施之间的关系。

核心结论：

- `dataview` 更像一个 **projection engine**：把文档、视图配置、索引和变更影响，稳定地派生成 active view。
- `whiteboard` 更像一个 **interactive scene runtime**：把 document、session、interaction、index、spatial、view、render surface 统一收敛为可读、可订阅、可渲染的 scene。
- 两者都使用“投影”思想，但复杂度来源不同：
  - `dataview` 的复杂度主要来自数据处理链路与增量复用。
  - `whiteboard` 的复杂度主要来自运行时状态边界、实时交互和渲染一致性。
- 因此，`InputChangeSpec + ProjectionModel` 这类上层 projection runtime 形态，更适合 `whiteboard-editor-scene` 这一层；`dataview active` 暂时继续使用底层 phase projector 是合理的。

一句话概括：

> `dataview` 是复杂的纯数据投影引擎；`whiteboard` 是复杂的交互式 scene runtime。

---

## 2. Dataview 架构

### 2.1 包结构

`dataview` 当前主要由以下包组成：

- `@dataview/core`：核心领域类型、视图配置、筛选、排序、分组、计算等基础规则。
- `@dataview/engine`：文档 mutation、active view projection、index、snapshot/delta publish。
- `@dataview/runtime`：运行时 source/patch/sync 一类集成能力。
- `@dataview/react`：React UI 层。
- `@dataview/table`：表格视图相关能力。
- `@dataview/meta`：元信息包。

其中架构核心在 `dataview/packages/dataview-engine/src`：

- `document`：文档读取上下文。
- `mutation`：mutation publish 流程。
- `active`：active view 的增量投影引擎。
- `runtime`：engine runtime state。
- `contracts`：对外 view state、delta、performance 等契约。

### 2.2 Active View 投影链路

`dataview active` 的主要链路可以理解为：

```text
DataDoc + ViewConfig + DataviewTrace
  -> DocumentReader
  -> ViewPlan
  -> IndexState / IndexDelta
  -> ActiveProjector
  -> ViewState + ActiveDelta
```

在 `active` 内部，phase 切分比较明确：

```text
query
  -> membership
  -> summary
  -> publish
```

各阶段职责大致是：

- `query`：根据 search/filter/sort/order 产出 matched/ordered/visible 记录集合。
- `membership`：根据 grouping/section 规则，把记录归入 section。
- `summary`：根据 section 和 calculation demand 派生汇总结果。
- `publish`：把 phase working state 发布成稳定的 `ViewState`，并计算 `ActiveDelta`。

这条链路的特点是：

- 输入主要是 document/view/index/impact，不直接暴露 UI interaction 细节。
- 输出是 active view 的 published model。
- phase 间依赖是业务数据流，不是 UI runtime 状态机。
- snapshot/delta publish 是合理的 public output，而不是额外的运行时真相。

### 2.3 Dataview 的复杂度来源

`dataview` 的复杂度主要集中在数据处理和增量复用：

- 如何从 mutation trace 识别对当前 view 的影响。
- 如何基于 view plan 只构建必要索引。
- 如何复用 search/filter/sort/group/summary 的中间结果。
- 如何稳定地产出 `ViewState`，并最小化 `ActiveDelta`。
- 如何在数据量变大时仍保持查询、排序、分组和汇总可接受。

这是一种 **pipeline complexity**。它复杂，但复杂度方向相对单一：从 source data 派生 view data。

### 2.4 Dataview 与 Projector 的关系

`dataview active` 适合继续使用底层 `shared/projector`：

- 它需要 phase plan、phase fanout、phase metrics。
- 它不急需内建 React store bridge。
- 它的 read API 可以基于 published `ViewState` 和 `DocumentReader` 构建。
- 它没有明显的 document/session/interaction 多源 canonical state 问题。

因此，`dataview active` 现在没有必要强行迁移成 `InputChangeSpec + ProjectionModel`。未来如果要演进，也更适合先做一层 adapter，而不是重写现有 active projector。

---

## 3. Whiteboard 架构

### 3.1 包结构

`whiteboard` 当前主要由以下包组成：

- `@whiteboard/core`：白板核心类型、算法和基础数据结构。
- `@whiteboard/engine`：更底层的白板运行/计算能力。
- `@whiteboard/editor`：editor 层，负责 session、input、action、write、procedure、scene 集成。
- `@whiteboard/editor-scene`：scene 层，负责 graph/index/spatial/hit/projector/runtime。
- `@whiteboard/react`：React UI 与渲染组合层。
- `@whiteboard/history`：历史记录能力。
- `@whiteboard/collab`：协作能力。
- `@whiteboard/product`：产品级集成。

其中当前讨论的关键边界主要在：

- `whiteboard/packages/whiteboard-editor/src`
- `whiteboard/packages/whiteboard-editor-scene/src`

`whiteboard-editor` 目录中能看到：

- `input`：输入处理、hover、session、feature interaction。
- `session`：draw、preview 等会话态。
- `write`：对 document 的写入。
- `read`：editor 侧读取能力。
- `projection`：editor 到 scene 的桥接。
- `scene`：editor 对 scene 的集成。

`whiteboard-editor-scene` 目录中能看到：

- `domain/index`：scene index。
- `domain/spatial`：空间索引与空间读。
- `domain/hit`：命中测试。
- `phases`：scene projection phases。
- `projector`：当前 projector 组织层。
- `runtime`：scene runtime。
- `contracts`：scene 契约。

### 3.2 Whiteboard 的核心链路

`whiteboard` 不能简单理解成：

```text
Document -> View
```

它更接近：

```text
Document + Session + Interaction Result
  -> Scene Canonical State
  -> Graph Index
  -> Spatial Index
  -> View Assembly
  -> Read / Query
  -> Stores
  -> Render Surfaces
```

这里有几个关键点：

- `document` 是持久化事实。
- `session` 是 editor 持有并修改的会话事实，例如 tool、selection、hover、editing、draft、preview。
- `interaction` 是 input 编排后的过程性行为，例如 drag、resize、connect、marquee、draw、snap。
- `scene` 需要把这些源事实统一归一为 canonical state。
- render/read/hit-test/snap/store 都应该从同一份 canonical state 派生，而不是各自维护一份真相。

### 3.3 为什么 Whiteboard 天生更需要 Scene

如果没有明确的 scene 层，复杂度会散落到多个地方：

- `editor` 被迫理解 graph/index/spatial/render 的内部细节。
- `editor-scene` 被迫接收带内部 phase 语义的 dirty input。
- React store、render snapshot、read API、hit-test 可能各自持有不同来源的数据。
- document change 和 session change 会重复规划。
- interaction 热路径可能绕过统一 read/query，形成 split-brain。

因此，`scene` 不是一个可有可无的投影中间层，而是 whiteboard 的运行时收口点。

合理分工应该是：

```text
whiteboard-editor
  - 持有并修改 session
  - 编排 input / command / interaction
  - 执行 document write
  - 产出 source-oriented change

whiteboard-editor-scene
  - 持有 canonical scene state
  - 维护 graph/index/spatial/view
  - 提供 read/query/hit/snap
  - 提供 stores/render surface
  - 根据 document + session change 更新 scene
```

### 3.4 Whiteboard 的复杂度来源

`whiteboard` 的复杂度不是单纯数据量问题，而是 runtime boundary complexity：

- 多源输入：document、session、interaction、clock、preview。
- 多种状态生命周期：持久 document、临时 session、交互中 draft、渲染 view。
- 多种读路径：editor command、interaction hot path、render、hit-test、snap、debug capture。
- 多种输出 surface：node、edge、overlay、chrome、items、edge render labels/masks/statics/active 等。
- 强一致性要求：selection、hover、drag preview、snap、spatial query 和 render 必须读到同一个 scene world。
- 性能要求：pointer move、hit-test、snap 等热路径不能依赖高频 React rerender。

这是一种 **runtime complexity**。它要求架构上有一个明确的 canonical scene runtime。

---

## 4. 两者的本质区别

### 4.1 源输入不同

`dataview` 的核心输入是：

```text
Document + ViewConfig + Index + MutationImpact
```

`whiteboard` 的核心输入是：

```text
Document + Session + Interaction + Spatial Context
```

`dataview` 的 session 概念弱得多，大部分 view 状态已经落在 document/view config 里。`whiteboard` 则必须保留大量不应写入 document、但会影响 scene 的会话态和交互态。

### 4.2 输出模型不同

`dataview` 的主要输出是：

```text
ViewState + ActiveDelta
```

这是一个 published view model，适合给 UI/API 消费。

`whiteboard` 的输出不只是 snapshot，它还需要：

```text
canonical state + read API + query + stores + render surfaces + optional capture
```

也就是说，`whiteboard` 输出的是一个长期运行的 scene world，而不是单次 publish 结果。

### 4.3 读模型不同

`dataview` 可以基于 `ViewState` 与 `DocumentReader` 建 read API：

```text
read cell / record / field / section / placement
```

`whiteboard` 的 read/query 更像 runtime 能力：

```text
node / edge / owner / relatedEdges / spatial / hit / snap / frame / render items
```

这些读能力必须站在 canonical scene state 上，否则很容易出现：

- render 用 snapshot；
- hit-test 用 spatial index；
- interaction 用 working graph；
- store 用另一份 published data。

这就是 split-brain 的来源。

### 4.4 Snapshot 的意义不同

在 `dataview` 中，snapshot 是 active view 的 public model。它本身就是最终产物。

在 `whiteboard` 中，如果 snapshot 变成热路径上的第二份 world，就会带来重复状态：

```text
working scene state
published render snapshot
React store state
```

因此 whiteboard 更应该把 canonical state 放在 runtime 内部，把 store/capture/render surface 视为 canonical state 的投影，而不是另一份真相。

### 4.5 Phase 的意义不同

`dataview` 的 phase 是稳定业务数据流：

```text
query -> membership -> summary -> publish
```

这几个 phase 名称本身就是业务计算阶段。

`whiteboard` 的 phase 更容易变成内部实现细节：

```text
graph -> index -> spatial -> view -> render
```

这些阶段应该由 scene runtime 自己规划，不应该泄漏给 editor 侧输入。editor 侧输入应该描述 source change，例如：

```text
document.nodes changed
session.selection changed
session.preview.edges changed
session.tool changed
```

而不是：

```text
graph.nodes.preview changed
ui.overlay changed
render.items changed
```

---

## 5. 对 shared/projector 的定位

`shared/projector` 不应该被理解成“所有项目最终只能剩下一个 ProjectionModel 抽象”。更合理的定位是分层：

```text
shared/projector
  - generic phase runtime
  - dirty plan / fanout
  - scope primitive
  - publish helper
  - store primitive
  - change primitive

上层业务 runtime
  - dataview active projector
  - whiteboard scene runtime
```

也就是说：

- 底层保留 generic phase projector 是合理的。
- 上层是否需要 `ProjectionModel`，取决于它是不是一个带 canonical state/read/store 的长期 runtime。
- `whiteboard-editor-scene` 需要这种收口。
- `dataview active` 目前不迫切需要。

---

## 6. 关于 InputChangeSpec 与 ProjectionModel

### 6.1 InputChangeSpec

`InputChangeSpec` 的价值在于统一 source-oriented change lifecycle：

- 定义 change tree 的 shape。
- 提供 create/merge/take/has。
- 避免 editor 和 scene 各维护一份 delta lifecycle。
- 避免外部输入直接使用内部 phase dirty 语言。

对 `whiteboard` 来说，它适合描述：

```text
document.reset
document.nodes
document.edges
session.tool
session.selection
session.hover
session.edit
session.preview.nodes
session.preview.edges
session.draft
```

对 `dataview` 来说，短期未必需要。因为 dataview 已经有 mutation trace、impact、index delta 和 view plan。除非未来这些输入开始重复表达 dirty 语义，否则没有必要为了统一形态而引入。

### 6.2 ProjectionModel

`ProjectionModel` 的价值在于把这些能力收在一个 runtime 定义里：

- create canonical state。
- create read/query。
- define surface/store。
- plan phases。
- run phases。
- optional capture/debug。

这非常适合 `whiteboard-editor-scene`，因为 scene 要承担长期运行时职责。

但对 `dataview active` 来说，当前 `ProjectorSpec` 已经足够表达它的 phase pipeline。如果要引入 `ProjectionModel`，更适合作为可选 adapter，而不是当前的根本重构方向。

---

## 7. 命名建议：Whiteboard 是否还应该叫 Projector

建议分层命名：

```text
shared/projector
  createProjector
  ProjectorSpec
  ProjectorPhase

whiteboard-editor-scene
  sceneInputChangeSpec
  sceneProjectionModel
  createSceneRuntime
  SceneRuntime
```

原因是：

- `projector` 更像纯 input -> output 的派生器。
- `whiteboard-editor-scene` 实际上是 runtime：它持有 canonical state、index、spatial、read、stores、render surfaces。
- 如果上层继续主叫 projector，容易把设计带回多个 spec、多份 snapshot、多条 store bridge 的旧结构。
- `SceneRuntime` 能更准确表达：这是 scene 的唯一运行时真相。

因此建议：

> 底层 infra 可以继续叫 projector；whiteboard 上层主概念应叫 SceneRuntime，ProjectionModel 作为创建 SceneRuntime 的定义对象。

---

## 8. 架构复杂度判断

如果只比较架构复杂度，我会判断：

> `whiteboard` 高于 `dataview`。

但这个判断需要拆开看：

| 维度 | Dataview | Whiteboard |
| --- | --- | --- |
| 数据处理复杂度 | 高 | 中到高 |
| 增量复用复杂度 | 高 | 高 |
| 状态边界复杂度 | 中 | 很高 |
| 实时交互复杂度 | 低到中 | 很高 |
| 渲染 surface 复杂度 | 中 | 很高 |
| read/query 一致性要求 | 中 | 很高 |
| 架构抽象压力 | 中 | 很高 |

`dataview` 的难点是把大量数据规则高效、稳定地派生成 view。

`whiteboard` 的难点是让 document、session、interaction、spatial、view、render 在同一个 runtime world 里保持一致。

---

## 9. 演进建议

### 9.1 Dataview

建议保持现状为主：

- 保留 `activeProjectorSpec` 和底层 `createProjector`。
- 继续优化 `query/membership/summary/publish` 的增量复用。
- 不急于引入 `InputChangeSpec + ProjectionModel`。
- 如果将来要统一 runtime surface，可以先做 adapter，而不是替换 active pipeline。
- 注意不要让 `BaseImpact`、`DataviewTrace`、`IndexDelta`、`ViewPlan` 之间出现重复 dirty 语义。

### 9.2 Whiteboard

建议明确向 `SceneRuntime` 收口：

- editor 只输出 source-oriented changes，不输出内部 phase dirty 语言。
- scene 持有唯一 canonical state。
- read/query/store/render surface 都从 canonical state 派生。
- `InputChangeSpec` 统一 document/session change lifecycle。
- `ProjectionModel` 定义 scene runtime 的 state/read/surface/plan/phases/capture。
- 底层仍可使用 `shared/projector` 的 generic phase runtime，但不要把底层 projector 概念暴露成 whiteboard 的主架构语言。

最终目标是：

```text
whiteboard-editor
  -> source changes
  -> SceneRuntime.update(...)
  -> SceneRuntime.state/read/stores/capture
```

而不是：

```text
editor dirty plan
  -> scene dirty plan
  -> working state
  -> published snapshot
  -> store bridge
  -> render/read 再各自补状态
```

---

## 10. 最终判断

`dataview` 和 `whiteboard` 都在做 projection，但它们不是同一种系统：

- `dataview` 的 projection 是数据视图计算。
- `whiteboard` 的 projection 是交互式场景归一化。

所以两者不应该被强行拉到同一个上层抽象里。真正应该统一的是底层 primitive，而不是业务 runtime 形态。

更合理的长期结构是：

```text
shared/projector
  提供底层 phase/change/store/publish primitive

@dataview/engine active
  使用底层 projector 构建 view materializer

@whiteboard/editor-scene
  使用底层 projector/change/store primitive 构建 SceneRuntime
```

这能同时保留：

- dataview 的纯数据投影效率；
- whiteboard 的 scene runtime 一致性；
- shared infra 的复用价值；
- 上层业务架构的领域表达力。

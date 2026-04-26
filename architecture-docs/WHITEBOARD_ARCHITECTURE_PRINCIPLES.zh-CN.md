# 白板系统架构原则：从双源状态到 Scene Runtime

## 1. 核心结论

一个复杂白板系统不应该被设计成“一个大 Store 加一组 React 组件”，也不应该被理解成“把 document 投影成 view”的普通数据管线。

更合理的架构是：

```text
Document
Session
Interaction Orchestration
SceneRuntime
Canonical Scene State
Index / Spatial
Read / Query
Stores / Render Surface
```

这套分层的核心判断是：

> 白板不是静态文档编辑器，而是一个由持久数据、会话状态、实时交互、空间索引和渲染订阅共同组成的交互式场景系统。

因此，白板系统必须同时解决三类问题：

- **事实问题**：哪些状态是权威事实，哪些只是派生结果。
- **交互问题**：用户输入如何被编排成稳定的业务状态变化。
- **场景问题**：如何把多源事实统一成一个可读、可查、可渲染的 scene world。

---

## 2. 为什么白板不能只有 Document

对白板来说，`Document` 是最重要的持久事实，但它不是系统的全部事实。

`Document` 适合保存：

- 节点。
- 边。
- 分组。
- 画布对象。
- 文档结构。
- 可持久化样式。
- 可协作同步的数据。
- 可进入 undo/redo 的业务变化。

但有大量状态不应该进入 `Document`：

- 当前工具。
- 当前选择。
- hover 目标。
- 正在编辑的对象。
- 拖拽中的预览位置。
- 框选中的临时矩形。
- 连接线创建中的临时端点。
- resize 中的临时尺寸。
- snap guide。
- 本地用户的临时交互状态。

如果把这些状态都塞进 `Document`，会产生几个问题：

- 持久数据和临时状态混在一起。
- undo/redo 语义变得混乱。
- 协作同步会把本地临时状态错误广播给其他用户。
- document mutation 频率被 pointer move 这类高频事件放大。
- 渲染和交互不得不区分哪些 document 字段是真的业务数据，哪些只是临时 UI 状态。

因此，白板必须承认：

> Document 是持久权威状态，但不是唯一权威状态。

---

## 3. 为什么需要 Session

`Session` 是白板系统里的第二份源权威状态。

它不是缓存，也不是 derived view，而是当前用户会话中的事实。

`Session` 适合保存：

- 当前工具模式。
- 选择状态。
- hover 状态。
- 编辑状态。
- 本地 preview。
- draft 对象。
- 当前 interaction 的稳定阶段结果。
- 本地 viewport 或局部 display preference。
- 本地用户 presence 的一部分。

`Session` 的存在，是为了把“不该持久化，但确实影响当前 scene”的状态从 `Document` 中分离出来。

例如：

```text
一个节点的真实位置属于 Document。
拖拽过程中鼠标移动产生的预览位置属于 Session。
松手确认后，最终位置再写回 Document。
```

又例如：

```text
一条边的真实 source/target 属于 Document。
正在连接过程中跟随鼠标的临时边属于 Session。
连接完成后，真实边再写回 Document。
```

这能带来几个好处：

- document 保持干净。
- undo/redo 只处理真正的业务变更。
- collaboration 可以区分共享事实和本地事实。
- 高频交互不直接污染持久模型。
- scene 可以同时看到 document 与 session，从而渲染真实对象和临时对象。

因此，白板的基础模型应该是：

```text
Document State + Session State
```

而不是单一 document state。

---

## 4. 为什么需要 Interaction Orchestration

原始输入事件不是业务行为。

浏览器或宿主环境给系统的是：

- pointerdown。
- pointermove。
- pointerup。
- wheel。
- keydown。
- keyup。
- composition。
- drag enter/leave/drop。

但白板真正关心的是：

- select。
- hover。
- drag node。
- resize node。
- create edge。
- reconnect edge。
- draw shape。
- pan canvas。
- zoom canvas。
- marquee select。
- edit text。
- snap to guide。

这中间需要一层 `Interaction Orchestration`。

它负责把低层输入事件解释成领域行为，并决定这些行为最终修改什么：

```text
User Input
  -> Interaction Orchestration
  -> Session Mutation
  -> Document Mutation
```

这层的职责包括：

- 判断当前工具模式。
- 判断 pointer 命中的目标。
- 判断是否进入 drag/resize/connect/edit。
- 处理 modifier keys。
- 处理 pointer capture。
- 处理交互开始、移动、提交、取消。
- 在交互过程中写 session preview。
- 在交互完成时提交 document mutation。
- 在交互取消时清理 session。

为什么这层不能放到 render component 里？

因为 render component 的职责是显示，不应该承载复杂行为状态机。否则系统会快速退化成：

- 每个组件都有自己的 pointer handler。
- 每个组件都自己读写一部分状态。
- selection、hover、drag、snap 分散在多个 UI 层。
- 同一个交互逻辑无法被命令、快捷键、插件、自动化复用。

为什么这层也不应该放到 SceneRuntime 里？

因为 SceneRuntime 应该负责归一化 scene 和提供读能力，而不是理解用户意图。否则 SceneRuntime 会变成“万能业务层”，最终吞掉 editor、command、tool、input 的职责。

因此，Interaction Orchestration 的边界应该是：

> 它理解用户输入和业务意图，但它不拥有最终 scene world。

---

## 5. 为什么需要 SceneRuntime

当系统拥有 `Document` 和 `Session` 两份源状态后，就需要一层把它们统一起来。

这层就是 `SceneRuntime`。

它的职责不是简单输出一个 view snapshot，而是维护一个长期存在的 scene world：

```text
Document + Session
  -> SceneRuntime
  -> Canonical Scene State
```

`SceneRuntime` 需要回答的问题包括：

- 当前 scene 中有哪些节点。
- 当前 scene 中有哪些边。
- 哪些对象来自 document。
- 哪些对象来自 session preview。
- 当前对象的最终可见状态是什么。
- 当前对象的交互状态是什么。
- 当前对象之间有什么关系。
- 当前 spatial 结构是什么。
- 当前 render surface 应该看到什么。
- 当前 hit-test 应该命中什么。
- 当前 snap 应该参考什么。

如果没有 SceneRuntime，系统会出现多处重复合成：

```text
render 层合成一次 document + session
hit-test 层合成一次 document + session
snap 层合成一次 document + session
selection 层合成一次 document + session
command 层合成一次 document + session
```

这会导致几类严重问题：

- 不同模块看到的 world 不一致。
- 性能优化难以集中。
- 索引难以共享。
- 临时对象与真实对象的规则分散。
- bug 难以定位，因为没有单一 scene 真相。

因此，SceneRuntime 的本质是：

> 把多源事实归一成唯一的运行时场景事实。

---

## 6. Canonical Scene State 的意义

`Canonical Scene State` 是 SceneRuntime 内部的唯一运行时真相。

它不是 `Document` 的替代品，也不是 `Session` 的替代品，而是它们在当前会话、当前交互、当前视图条件下的归一化结果。

它通常包含：

- scene graph。
- 节点 view model。
- 边 view model。
- owner/group/mindmap 等关系。
- selection/hover/editing 对 scene 的影响。
- preview/draft 对 scene 的影响。
- spatial state。
- view assembly state。
- overlay/chrome/items 等渲染相关状态。

为什么要叫 canonical？

因为系统里所有下游读都应该来自这里：

```text
Canonical Scene State
  -> Index / Spatial
  -> Read / Query
  -> Stores
  -> Render Surface
```

而不是：

```text
render 读一份
hit-test 读一份
snap 读一份
command 读一份
store 再维护一份
```

Canonical Scene State 的设计目标是：

- 保证一致性。
- 支撑高频读取。
- 降低重复派生。
- 让索引有明确来源。
- 让 store 只是订阅 surface，而不是第二份状态。
- 让 debug/capture 可以从一个地方获取完整 scene。

需要注意的是，Canonical Scene State 不意味着所有东西都必须存在一个巨大对象里。它可以分区、分 namespace、分 family，但必须满足一个原则：

> 逻辑上只有一份 scene world。

---

## 7. 为什么 Index / Spatial 必须内聚

白板系统离不开索引。

常见索引包括：

- node by id。
- edge by id。
- edges by node。
- parent/children。
- owner by object。
- group membership。
- z-order。
- bounds by object。
- spatial tree。
- snap candidates。
- hit-test acceleration。
- visible range。

这些索引用来支撑：

- hit-test。
- snap。
- selection。
- related edges。
- viewport culling。
- edge routing。
- group operation。
- layout。
- command validation。
- render ordering。

索引的复杂点在于：它既不能被当成外部事实源，也不能被随意散落在各模块。

如果索引散在各处，会出现：

- render 有自己的 spatial cache。
- hit-test 有自己的 object map。
- edge 有自己的 node relation map。
- selection 有自己的 target set。
- command 又重新扫描 document。

这样一来，任何 document/session 变化都要通知多个 cache，最终导致一致性问题。

正确做法是：

```text
Canonical Scene State
  -> Index / Spatial
```

索引应该是 SceneRuntime 的内部派生结构，并与 canonical state 同步更新。

它的地位是：

- 不是 source of truth。
- 不是临时 UI cache。
- 是 canonical scene world 的结构化读模型。

这能保证：

- hit-test 和 render 看到同一个对象集合。
- snap 和 drag preview 使用同一个 spatial world。
- edge relation 和 selection overlay 不会读到不同版本。
- command read 可以复用已有索引，而不是重复扫描。

---

## 8. 为什么需要 Read / Query 层

白板中很多模块需要读 scene：

- interaction。
- command。
- render。
- hit-test。
- snap。
- layout。
- plugin。
- debug。
- testing。

如果所有模块都直接读 canonical state 的内部结构，会带来两个问题：

- 内部结构被外部耦合，后续无法调整。
- 各模块会自己拼装查询逻辑，重复且不一致。

因此，需要明确的 `Read / Query` 层。

它应该提供语义化读取能力，例如：

```text
read.node(id)
read.edge(id)
read.relatedEdges(nodeIds)
read.owner(target)
read.children(nodeId)
read.bounds(target)
read.hit(point)
read.snap(rect)
read.visible(viewport)
read.renderItems()
```

这层的价值是：

- 把 canonical state 的内部结构隐藏起来。
- 把常用查询集中优化。
- 保证不同消费者使用同一套语义。
- 让 interaction hot path 可以快速读取。
- 让测试可以直接验证 scene 行为。
- 让插件或外部 API 不依赖内部 state shape。

Read / Query 不是第二份状态。它应该只是 canonical state 和 index/spatial 上的一层稳定 API。

---

## 9. 为什么 Stores / Render Surface 不能成为真相

React、Canvas、SVG、DOM 或其他 UI 框架通常需要订阅式状态。

因此白板系统需要 `Stores / Render Surface`。

它们的职责是：

- 给 UI 层提供可订阅数据。
- 提供按 family/value 拆分的 render surface。
- 降低无关 rerender。
- 稳定对象引用。
- 把 scene state 映射成 UI 友好的结构。

但它们不能成为 source of truth。

错误做法是：

```text
Document + Session
  -> Scene Snapshot
  -> React Store
  -> Render
  -> Interaction 再读 React Store
```

这样会让 React Store 变成事实源，导致：

- interaction hot path 依赖 UI subscription。
- store 和 scene canonical state 可能不一致。
- render 优化策略影响业务读语义。
- 非 React 宿主难以复用核心能力。
- debug/capture 不知道该读 scene 还是 store。

正确做法是：

```text
Canonical Scene State
  -> Stores / Render Surface
  -> UI Render
```

也就是说：

> Store 是 scene 的订阅 surface，不是 scene 的真相。

这样可以让 UI 层专注于渲染，同时让 interaction、command、hit-test、snap 等热路径继续直接读取 SceneRuntime 的 read/query 能力。

---

## 10. 分层职责总结

### 10.1 Document

职责：

- 保存持久业务数据。
- 支撑协作同步。
- 支撑 undo/redo。
- 表达可序列化文档结构。

不负责：

- 本地 hover。
- 拖拽 preview。
- 临时 snap guide。
- pointer interaction 过程状态。

### 10.2 Session

职责：

- 保存当前用户会话事实。
- 表达不应持久化但影响 scene 的状态。
- 承接 interaction 过程中的 preview/draft/editing。

不负责：

- 持久业务事实。
- scene 索引。
- render store。

### 10.3 Interaction Orchestration

职责：

- 把原始输入解释成领域交互。
- 编排交互生命周期。
- 决定修改 session 还是 document。
- 处理提交、取消、回滚。

不负责：

- 持有 scene world。
- 维护索引。
- 管理 render subscription。

### 10.4 SceneRuntime

职责：

- 读取 document 和 session。
- 维护 canonical scene state。
- 维护 index/spatial。
- 提供 read/query。
- 提供 stores/render surface。
- 支撑 capture/debug/testing。

不负责：

- 解释原始用户输入。
- 决定业务命令意图。
- 直接承担 UI 组件组合。

### 10.5 Canonical Scene State

职责：

- 表示当前唯一 scene world。
- 统一真实对象与 session preview。
- 为索引、query、render 提供基础。

不负责：

- 替代 document。
- 替代 session。
- 作为外部可随意修改的数据结构。

### 10.6 Index / Spatial

职责：

- 提供结构化、高性能查询。
- 支撑 hit-test、snap、relation、visible range 等能力。
- 与 canonical scene state 同步更新。

不负责：

- 成为业务事实源。
- 分散到 render/interaction 各自维护。

### 10.7 Read / Query

职责：

- 提供稳定语义读取 API。
- 隐藏内部 state/index 结构。
- 为 command、interaction、render、plugin、testing 提供统一读路径。

不负责：

- 持有第二份状态。
- 写 document/session。

### 10.8 Stores / Render Surface

职责：

- 把 scene 映射成 UI 可订阅数据。
- 降低 rerender。
- 稳定渲染输入。

不负责：

- 成为 source of truth。
- 承担 interaction hot path 读模型。
- 保存业务事实。

---

## 11. 典型数据流

### 11.1 拖拽节点

```text
pointerdown
  -> Interaction Orchestration 判断命中节点
  -> Session 进入 dragging 状态
  -> SceneRuntime 合成 preview node position
  -> Canonical Scene State 更新
  -> Spatial/Index 更新
  -> Render Surface 更新

pointermove
  -> Interaction Orchestration 计算移动量
  -> Session 更新 preview
  -> SceneRuntime 更新 scene
  -> Read/Query 可读到新 preview
  -> Render Surface 更新

pointerup
  -> Interaction Orchestration 提交最终位置
  -> Document Mutation
  -> Session 清理 dragging preview
  -> SceneRuntime 合成最终 scene
```

这个过程中：

- 高频移动不直接污染 document。
- render 和 hit-test 都读同一份 scene。
- 松手后 document 才记录最终事实。

### 11.2 创建连接线

```text
pointerdown on port
  -> Session 创建 edge draft
  -> SceneRuntime 显示临时 edge

pointermove
  -> Session 更新 draft target
  -> SceneRuntime 计算 edge preview、snap、hit target

pointerup on valid target
  -> Document 创建真实 edge
  -> Session 清理 draft
  -> SceneRuntime 显示真实 edge
```

这个过程中：

- draft edge 属于 session。
- committed edge 属于 document。
- scene 同时知道真实 edge 和临时 edge 的渲染规则。

### 11.3 框选

```text
pointerdown on canvas
  -> Session 创建 marquee draft

pointermove
  -> Session 更新 marquee rect
  -> SceneRuntime 基于 spatial index 查询候选对象
  -> Selection preview 更新
  -> Render Surface 显示 marquee 和候选状态

pointerup
  -> Session 提交 selection
  -> 清理 marquee draft
  -> SceneRuntime 输出最终 selection scene
```

这个过程中：

- spatial index 是必要能力。
- selection preview 不应该直接写 document。
- render 只订阅 scene surface。

---

## 12. 常见反模式

### 12.1 单 Store 架构

```text
AppStore
  - document
  - selection
  - hover
  - drag state
  - render cache
  - spatial cache
  - component flags
```

问题：

- source state 和 derived state 混合。
- 高频交互导致全局状态膨胀。
- undo/redo、collab、render 优化互相干扰。
- 难以判断哪个字段是权威事实。

### 12.2 组件直接编排复杂交互

```text
NodeComponent.onPointerMove
  -> update selection
  -> update drag preview
  -> update edge cache
  -> update render state
```

问题：

- 行为逻辑被 UI 结构绑定。
- 命令、快捷键、插件难以复用。
- 多组件交互容易冲突。
- 测试困难。

### 12.3 索引散落

```text
render cache has bounds
hit-test cache has bounds
snap cache has candidates
edge cache has relations
```

问题：

- 多份缓存一致性难维护。
- 每次状态变化都要多处 invalidation。
- bug 经常表现为“渲染看到 A，命中看到 B”。

### 12.4 Store 成为第二份 scene

```text
SceneRuntime -> Snapshot -> UI Store
Interaction reads UI Store
```

问题：

- UI 优化策略污染业务读模型。
- 非 UI runtime 难以复用。
- scene 和 store 可能出现版本差。
- hot path 依赖订阅系统。

---

## 13. 设计原则

### 13.1 Source state 要少，但要承认双源

白板至少有两类源状态：

```text
Document: 持久事实
Session: 会话事实
```

不要强行把 session 塞进 document，也不要把 document 临时复制进 session。

### 13.2 Interaction 负责意图，不负责 scene 真相

Interaction Orchestration 应该回答：

```text
用户现在想做什么？
这个行为应该修改 session 还是 document？
什么时候提交？什么时候取消？
```

它不应该维护自己的 scene world。

### 13.3 SceneRuntime 负责归一化

SceneRuntime 应该回答：

```text
基于当前 document 和 session，当前 scene 到底是什么？
```

它应该是 read/query/render 的共同基础。

### 13.4 Index 是 runtime 内部能力

索引应该服务于 scene read/query，不应该散在 UI 或 interaction 中。

### 13.5 Store 是 render surface，不是事实源

UI store 的目标是高效订阅和渲染，而不是表达业务真相。

### 13.6 Query 必须站在 canonical state 上

所有 hit-test、snap、related edge、visible range 等查询，都应该基于同一个 canonical scene world。

### 13.7 Commit 与 Preview 要分开

交互过程中的 preview 属于 session。确认后的结果才进入 document。

这能保持 undo/redo、collab、autosave 和 render 的语义清晰。

---

## 14. 最终架构心智模型

可以把白板系统理解成三层：

```text
Source Layer
  Document
  Session

Behavior Layer
  Interaction Orchestration
  Commands
  Tools

Scene Layer
  SceneRuntime
  Canonical Scene State
  Index / Spatial
  Read / Query
  Stores / Render Surface
```

三层之间的关系是：

```text
Source Layer 提供事实
Behavior Layer 修改事实
Scene Layer 归一事实并提供读取/渲染
```

这套架构的目标不是追求抽象漂亮，而是解决白板产品迟早会遇到的真实问题：

- document 和 session 混乱。
- preview 和 commit 混乱。
- render 和 hit-test 不一致。
- spatial/snap/index 散落。
- interaction 逻辑绑死在 UI 组件。
- store 变成第二份 scene。
- 协作、历史、插件、测试难以扩展。

如果用一句话总结：

> 白板系统需要以 Document 和 Session 作为双源权威状态，以 Interaction Orchestration 编排用户行为，以 SceneRuntime 归一为唯一 Canonical Scene State，再由 Index/Spatial、Read/Query、Stores/Render Surface 支撑高性能交互与渲染。

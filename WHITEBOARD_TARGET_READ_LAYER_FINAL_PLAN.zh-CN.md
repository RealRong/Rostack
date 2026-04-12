# Whiteboard Target Read 分层与 API 收敛最终方案

## 背景

当前 `whiteboard-editor` 里已经出现了一批围绕 `SelectionTarget` / `{ nodeIds, edgeIds }` 的重复读取逻辑，典型包括：

- `readGroupSelection`
- `readTargetNodes`
- `readTargetEdges`
- `readTargetBounds`

这些能力现在散落在：

- `runtime/read/utils.ts`
- `runtime/read/selection.ts`
- `runtime/read/edgeToolbar.ts`
- `runtime/editor/input.ts`
- `interactions/selection/press.ts`

问题不在于 helper 数量本身，而在于语义归属不清：

- 有些是 committed document 事实，却挂在 editor runtime util
- 有些是 live projection 读取，却和 committed 读取混在一起
- 上层模块需要手动拼 `node.bounds + edge.bounds + getTargetBounds`
- group/target 的语义没有成为正式 read API，只能到处临时翻译

长期看，这会持续制造：

- 重复 glue code
- 错误的职责边界
- engine/editor 两层读模型混淆
- selection / toolbar / interaction 的实现变得越来越碎

这个方案的目标是把 target 相关读取正式收敛成 read API，而不是继续在 `runtime/read/utils.ts` 堆 helper。

## 核心判断

### 哪些应该进 engine.read

满足以下条件的能力，应该归 `engine.read`：

- 只依赖 committed document
- 不依赖 editor overlay
- 不依赖 edit session
- 不依赖 tool / interaction / UI 状态
- 语义上是文档结构事实，而不是 editor 展示结果

### 哪些应该进 editor.read

满足以下条件的能力，应该归 `editor.read`：

- 依赖 live projection
- 依赖 overlay patch
- 依赖 edit session draft
- 结果是 editor 当前可见态，而不是 committed document 事实

### 哪些应该留在 core

满足以下条件的能力，应该归 `core`：

- 纯函数
- 不依赖 store
- 不依赖 runtime 结构
- 只是算法，不是 read API

例如 `getTargetBounds(...)` 这种就应该继续留在 `core`。

## 最终分层结论

### `readGroupSelection`

这个能力应该下沉到 `engine.read.group`。

原因：

- 它本质上是在读一个 group 的成员集合
- 完全不依赖 editor live state
- 返回的就是 committed group membership

不应该继续以局部 util 形式存在于 editor。

### `readTargetNodes` / `readTargetEdges`

这两个不应该继续是 editor 内部 helper，而应该收敛成正式的 target 读取能力。

但它们要分 committed/live 两层：

- `engine.read.target.nodes/edges`
- `editor.read.target.nodes/edges`

### `readTargetBounds`

这个能力不能只挪到 engine，因为它天然有 committed/live 两种语义。

长期最优是：

- `core` 继续保留 `getTargetBounds`
- `engine.read.target.bounds` 提供 committed bounds
- `editor.read.target.bounds` 提供 live bounds

也就是说，要把“target”做成正式 read 轴，而不是把某个 helper 单独挪位置。

### `readUniformValue`

这个不需要下沉为 engine/editor read。

原因：

- 没有 whiteboard 领域语义
- 本质上只是泛型归约工具
- 不值得扩张正式 API 面

它可以继续留在 editor 层局部工具里，或者后续如果出现更多复用，再收成更通用的 shared util。

## 最终 API 设计

目标是让上层逻辑不再手动组合 `node.*` / `edge.*`，而是直接围绕 `target` 读取。

### Engine Read

```ts
engine.read.group.target(groupId)

engine.read.target.nodes(target)
engine.read.target.edges(target)
engine.read.target.bounds(target)
```

其中：

- `group.target(groupId)` 返回 committed target
- `target.nodes(target)` 返回 committed node list
- `target.edges(target)` 返回 committed edge list
- `target.bounds(target)` 返回 committed bounds

### Editor Read

```ts
editor.read.group.target(groupId)

editor.read.target.nodes(target)
editor.read.target.edges(target)
editor.read.target.bounds(target)
```

这里的语义与 engine 同名，但结果基于 editor live read：

- node 走 `editor.read.node.item`
- edge 走 `editor.read.edge.item`
- bounds 走 `editor.read.node.bounds` / `editor.read.edge.bounds`

换句话说：

- `engine.read.target.*` 是 committed projection
- `editor.read.target.*` 是 live projection

命名保持一致，是为了让“target 是一等语义”这个模型稳定下来。

## 设计细节

### 1. `group.target(groupId)` 而不是 `group.selection(groupId)`

建议命名为 `target`，不要叫 `selection`。

原因：

- group 成员集合本身不是 selection 状态
- selection 是 editor runtime 概念
- target 更中性，也能同时被 commands / interactions / read 层复用

最终建议：

```ts
engine.read.group.target(groupId)
editor.read.group.target(groupId)
```

### 2. `target.bounds(target)` 应该只返回 bounds

不要把 `nodes/edges/bounds` 混成一个 mega object。

不建议做成：

```ts
target.resolve(target) => { nodes, edges, bounds }
```

原因：

- 容易导致多读
- 上层很多地方只需要其中一项
- store 粒度更难控制
- 相等性判断更粗

所以最终 API 应保持细粒度：

```ts
target.nodes(target)
target.edges(target)
target.bounds(target)
```

### 3. `target.bounds` 的算法仍然留在 core

不要把 bounds 计算逻辑复制进 engine/editor。

应继续复用：

```ts
getTargetBounds(...)
```

engine/editor 负责做的只是：

- 提供 node bound reader
- 提供 edge bound reader
- 把 target 语义挂进各自的 read API

### 4. editor 层不应再保留 target helper

一旦正式引入：

- `editor.read.group.target`
- `editor.read.target.nodes`
- `editor.read.target.edges`
- `editor.read.target.bounds`

那么 `runtime/read/utils.ts` 中的 target/group helper 就应删除，不保留双套实现。

## 需要删除的旧实现

以下能力在新方案落地后必须删除：

- `runtime/read/utils.ts` 的 `readGroupSelection`
- `runtime/read/utils.ts` 的 `readTargetNodes`
- `runtime/read/utils.ts` 的 `readTargetEdges`
- `runtime/read/utils.ts` 的 `readTargetBounds`

如果 `readUniformValue` 仍然只被 selection/toolbar 局部使用，可以保留；其余有明确语义归属的 helper 都不应继续存在。

同时以下调用点需要改为正式 read API：

- `runtime/read/selection.ts`
- `runtime/read/edgeToolbar.ts`
- `runtime/editor/input.ts`
- `interactions/selection/press.ts`

## 推荐落地方案

### 阶段 1：在 engine.read 建立 committed target 轴

新增：

- `engine.read.group.target(groupId)`
- `engine.read.target.nodes(target)`
- `engine.read.target.edges(target)`
- `engine.read.target.bounds(target)`

要求：

- 全部直接基于 engine committed read
- 不感知 editor overlay/edit session

### 阶段 2：在 editor.read 建立 live target 轴

新增：

- `editor.read.group.target(groupId)`
- `editor.read.target.nodes(target)`
- `editor.read.target.edges(target)`
- `editor.read.target.bounds(target)`

要求：

- node/edge 结果基于 editor runtime live item
- bounds 基于 editor live bounds

### 阶段 3：替换调用点

把以下模块统一改成 target read API：

- `runtime/read/selection.ts`
- `runtime/read/edgeToolbar.ts`
- `runtime/editor/input.ts`
- `interactions/selection/press.ts`

改造后的目标是：

- 不再自己 map/filter nodeIds/edgeIds
- 不再自己拼 target bounds
- 不再自己手写 group -> target 翻译

### 阶段 4：删除旧 helper

删除：

- `readGroupSelection`
- `readTargetNodes`
- `readTargetEdges`
- `readTargetBounds`

必要时把 `runtime/read/utils.ts` 缩到只剩真正通用、无领域归属的工具。

## 为什么这是长期最优

### 1. target 成为正式语义轴

现在很多代码已经隐式围绕 `{ nodeIds, edgeIds }` 工作，但这个概念还没有被正式 API 化。

一旦 target 成为 read 一等公民：

- selection
- toolbar
- context menu
- interaction
- commands

都可以围绕同一套语义组织。

### 2. committed/live 语义被明确分层

这次最关键的不是少几个 helper，而是避免 committed/live 继续混淆。

以后看到：

- `engine.read.target.*` 就知道是 committed
- `editor.read.target.*` 就知道是 live

这比现在“helper 在 editor 里，但有些读的是 committed，有些读的是 live”的状态清楚得多。

### 3. 上层模块不再写重复胶水

现在 `selection.ts`、`edgeToolbar.ts`、`input.ts`、`press.ts` 都在做一些相似的：

- group -> target
- target -> nodes/edges
- target -> bounds

这些胶水应该消失，改成消费 read API。

### 4. 后续扩展点更自然

一旦有了 target 读轴，后面继续加也会很自然，例如：

- `target.nodeCount(target)`
- `target.edgeCount(target)`
- `target.isEmpty(target)`
- `target.primaryNode(target)`

这些都比在各模块继续堆 helper 更稳。

## 不建议的做法

### 不建议只把 `readGroupSelection` 挪位置

只把单个 helper 挪到 engine/editor，没有形成 `target` 轴，收益会很有限，而且 API 仍然零碎。

### 不建议做一个大而全的 `target.resolve(target)`

这种接口表面上省事，实际上会：

- 强迫读取多余数据
- 提高耦合
- 增加 store invalidation 范围

细粒度 API 更适合现在这套 runtime。

### 不建议继续让 `runtime/read/utils.ts` 承担语义层职责

`utils.ts` 最多只该放泛型、无领域归属的小工具。

凡是已经有明确 whiteboard 语义归属的能力，都应该收回到正式 read API。

## 最终结论

应该把当前这批 helper 正式升级为 `target read` 体系。

最终方向是：

- `engine.read.group.target`
- `engine.read.target.nodes`
- `engine.read.target.edges`
- `engine.read.target.bounds`
- `editor.read.group.target`
- `editor.read.target.nodes`
- `editor.read.target.edges`
- `editor.read.target.bounds`

并删除 editor 内部现有的 target/group helper 实现，不保留兼容层。

这是比继续局部清理 helper 更长期、也更稳定的收敛方向。
